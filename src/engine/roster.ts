/**
 * Roster operations shared by the player's commands and the AI: building contracts, archiving them,
 * and moving fighters between "contracted" and "free agent".
 */
import { playerRosterCap } from './tiers'
import { BALANCE as B } from './balance'
import { weeksBetween } from './calendar'
import { FEATURES } from './config'
import { fighterName } from './fighters'
import { stateIds } from './ids'
import { post } from './ledger'
import { discover } from './knowledge'
import { postMessage, postNews } from './messages'
import { valueOf } from './market'
import { cancelFight } from './fights'
import { player } from './selectors'
import type { Contract, ContractStatus, Fighter, GameState, Id, Offer } from './types'

const MAX_CONTRACT_HISTORY = 160
const MAX_FIGHTER_HISTORY = 40

export function pushHistory(f: Fighter, entry: Fighter['history'][number]): void {
  f.history.push(entry)
  if (f.history.length > MAX_FIGHTER_HISTORY) f.history.shift()
}

export function buildContract(state: GameState, f: Fighter, promotionId: Id, o: Offer): Contract {
  return {
    id: stateIds(state).next('c'), fighterId: f.id, promotionId,
    startDay: state.today, endDay: state.today + o.years * 365,
    weeklyRetainer: o.weeklyRetainer, basePurse: o.basePurse, winBonus: o.winBonus, titleBonus: o.titleBonus,
    ppvShare: o.ppvShare, signingBonus: o.signingBonus,
    fightsTotal: o.fights, fightsRemaining: o.fights, minFightsPerYear: o.minFightsPerYear,
    releaseFee: null, titlePromise: o.titlePromise, status: 'active',
    notices: { approaching: false, window: false, expiring: false }, aiReviewed: false,
  }
}

/** Move a contract out of the live table into history. Does NOT touch the fighter. */
export function archiveContract(state: GameState, c: Contract, status: ContractStatus): void {
  c.status = status
  delete state.contracts[c.id]
  state.contractHistory.unshift(c)
  if (state.contractHistory.length > MAX_CONTRACT_HISTORY) state.contractHistory.length = MAX_CONTRACT_HISTORY
}

export function activeContractCount(state: GameState, promotionId: Id): number {
  let n = 0
  for (const c of Object.values(state.contracts)) if (c.promotionId === promotionId) n++
  return n
}

export function rosterFull(state: GameState, promotionId: Id): boolean {
  const promo = state.promotions[promotionId]
  return activeContractCount(state, promotionId) >= (promo.isPlayer ? playerRosterCap(promo.tier) : B.market.rosterCap[promo.tier])
}

/** Mark a fighter as newly available and tell the player if it's someone they'd care about. */
export function becomeFreeAgent(state: GameState, f: Fighter, kind: 'released' | 'expired', fromPromotionId: Id | null): void {
  f.contractId = null
  f.availableSince = state.today
  pushHistory(f, { day: state.today, kind, promotionId: fromPromotionId })
  const mv = valueOf(state, f)
  const notable = f.reputation >= 50 || mv >= 50
  if (notable && f.status === 'active') {
    const wasKnown = !!state.knowledge[f.id]
    discover(state, f.id, 'tip')
    postMessage(state, {
      from: 'Scouting', category: 'world', priority: 'important', key: `hp-${f.id}`, cooldownWeeks: 26,
      subject: `High-profile free agent: ${fighterName(f)}`,
      body: `${fighterName(f)} (${f.record.wins}-${f.record.losses}-${f.record.draws}) is on the market${fromPromotionId ? ` after leaving ${state.promotions[fromPromotionId]?.name}` : ''}. Expect competition — this fighter will not stay available long.${wasKnown ? '' : ' They have been added to your scouting list.'}`,
      link: { kind: 'fighter', id: f.id },
    })
  }
}

/** Player-side signing of a free agent (or renewal). Assumes the offer has already been accepted. */
export function completeSigning(state: GameState, f: Fighter, o: Offer, kind: 'signing' | 'renewal'): Contract {
  const p = player(state)
  if (kind === 'renewal' && f.contractId) {
    const old = state.contracts[f.contractId]
    if (old) archiveContract(state, old, 'renewed')
  }
  const c = buildContract(state, f, p.id, o)
  state.contracts[c.id] = c
  f.contractId = c.id
  f.availableSince = null
  f.promoRelations[p.id] = Math.min(100, (f.promoRelations[p.id] ?? 0) + (kind === 'renewal' ? 8 : 10))
  f.morale = Math.min(100, f.morale + 8)
  pushHistory(f, { day: state.today, kind: kind === 'renewal' ? 'renewed' : 'signed', promotionId: p.id })
  if (o.signingBonus > 0) post(state, 'signingBonus', -o.signingBonus, `${kind === 'renewal' ? 'Renewal' : 'Signing'} bonus — ${fighterName(f)}`)
  if (o.titlePromise) {
    state.obligations.push({
      id: stateIds(state).next('o'), fighterId: f.id, promotionId: p.id, kind: 'titleShot',
      createdDay: state.today, dueDay: c.endDay, status: 'open',
    })
  }
  const entry = state.knowledge[f.id] ?? discover(state, f.id, 'public')!
  entry.insight = Math.min(100, entry.insight + 25) // you learn a lot about someone at the negotiating table
  delete state.negotiations[f.id]
  return c
}

export function releaseCost(state: GameState, c: Contract): number {
  if (c.releaseFee !== null) return c.releaseFee
  void state
  const remainingWeeks = Math.max(0, weeksBetween(state.today, c.endDay))
  return Math.round(
    c.fightsRemaining * c.basePurse * B.release.purseFraction + Math.min(remainingWeeks, B.release.retainerWeeks) * c.weeklyRetainer,
  )
}

export interface ReleaseResult { ok: boolean; error?: string; fee?: number }

/** The player releases one of their fighters. Costs money, reputation and goodwill. */
export function releaseFromPlayer(state: GameState, fighterId: Id): ReleaseResult {
  const f = state.fighters[fighterId]
  const c = f?.contractId ? state.contracts[f.contractId] : null
  const p = player(state)
  if (!f || !c || c.promotionId !== p.id) return { ok: false, error: 'That fighter is not on your roster.' }
  const fee = releaseCost(state, c)
  const booked = f.activeFightId ? state.fights[f.activeFightId] : null
  if (booked) cancelFight(state, booked, `${fighterName(f)} was released`)
  post(state, 'releaseFees', -fee, `Release fee — ${fighterName(f)}`)
  archiveContract(state, c, 'released')
  f.promoRelations[p.id] = (f.promoRelations[p.id] ?? 0) + B.release.relationHit
  const popular = f.popularity >= B.release.popularThreshold
  p.reputation = Math.max(0, p.reputation - (popular ? B.release.repPenaltyPopular : B.release.repPenalty))
  for (const o of state.obligations) if (o.fighterId === f.id && o.status === 'open') o.status = 'broken'
  becomeFreeAgent(state, f, 'released', p.id)
  // Rest of the roster notices how you treat people.
  for (const other of Object.values(state.contracts)) {
    if (other.promotionId !== p.id) continue
    const o = state.fighters[other.fighterId]
    const sensitive = o.personality === 'Loyal' || o.personality === 'Fragile'
    o.morale = Math.max(1, o.morale - (sensitive ? B.release.rosterMoraleHitSensitive : B.release.rosterMoraleHit))
  }
  postNews(state, { headline: `${p.name} release ${fighterName(f)} (${f.record.wins}-${f.record.losses}-${f.record.draws})`, category: 'release', fighterId: f.id })
  postMessage(state, {
    from: 'Legal', category: 'contract', priority: 'normal',
    subject: `${fighterName(f)} released`,
    body: `${fighterName(f)} has left ${p.name}. Release fee paid: £${fee.toLocaleString('en-GB')}. Word travels in boxing — expect some fallout${popular ? ' given their profile' : ''}.`,
    link: { kind: 'fighter', id: f.id },
  })
  return { ok: true, fee }
}

/**
 * Title-shot promises written into a contract (the simple “title opportunity” clause). Settled from the fights themselves: kept when the
 * fighter has really fought for a title since the deal was struck; broken at the end of the contract otherwise (morale and trust fall).
 */
export function processObligations(state: GameState): void {
  if (!FEATURES.titlesImplemented) return
  for (const o of state.obligations) {
    if (o.status !== 'open') continue
    const f = state.fighters[o.fighterId]
    if (!f) { o.status = 'broken'; continue }
    const fought = f.recentFights.some((id) => { const ft = state.fights[id]; return !!ft?.result && ft.day >= o.createdDay && !!ft.title && (ft.title.kind === 'title' || ft.title.kind === 'unification') })
    if (fought) {
      o.status = 'fulfilled'
      f.morale = Math.min(100, f.morale + 6)
      f.promoRelations[o.promotionId] = (f.promoRelations[o.promotionId] ?? 0) + 10
    } else if (o.dueDay <= state.today) {
      o.status = 'broken'
      f.morale = Math.max(1, f.morale - 15)
      f.promoRelations[o.promotionId] = (f.promoRelations[o.promotionId] ?? 0) - 25
    }
  }
}
