/**
 * INCOMING FIGHT OFFERS. Rival promoters approach the player about bouts between their fighters and the player's. A proposal is only
 * made when it could really be staged: both fighters free, matched in weight, no title obligation in the way, nothing recently turned
 * down, the rival able to pay for its side. It never replaces the existing machinery - accepting turns it into an ordinary fight, through
 * the same creation, agreement and scheduling code as a bout the player went looking for:
 *
 *   host 'you'   the rival offers its fighter for a bout on YOUR show; the player pays that fighter's purse and schedules the date
 *   host 'them'  the rival offers a slot on ITS next show; the rival pays the player's promotion a fee, the promotion pays the fighter their
 *                contract purse, and the rival's event carries the fight (date and venue come from that event)
 *
 * The player can accept, reject, or counter. A counter is answered by the rival a week later, from its own finances, style, the
 * relationship and how far the counter is from what it wanted - the player does not win a negotiation by meeting the first ask, and
 * does not lose one by asking for more than is sensible, only by asking for more than the rival will pay. Offers expire, and are
 * withdrawn by the rival when something real changes (a fighter injured or booked, the show cancelled or full).
 */
import { weightClassLabel } from '../../data/weightClasses'
import { fighterName, totalFights } from '../fighters'
import { regionOf } from '../../data/nations'
import { keyedFloat, keyedRng } from '../rng'
import { appraise, baseMoney, valueOf } from '../market'
import { postMessage } from '../messages'
import { agreeFight } from '../fightNegotiation'
import { cancelFight, createFight, fightAvailability, lockKey, validateMatch } from '../fights'
import { transition } from '../fight/lifecycle'
import { stakesBetween } from '../business/stakes'
import { titleObligation } from '../business/titleEco'
import { championCampResponse } from '../business/titleCamp'
import { rivalryStrength } from '../media/narratives'
import { rankIn } from '../media/rankings'
import { attachFight, eventAcceptsFight } from '../events/events'
import { isEventOpen } from '../events/lifecycle'
import { stageRivalShow } from '../events/ai'
import { settleRounds } from '../business/fightRounds'
import { requiredRounds } from '../business/rounds'
import { bookable, weeksSince } from '../systems/aiFights'
import { behaviour } from '../systems/aiFinance'
import { weekIndex } from '../media/util'
import type { Fight, Fighter, GameState, Id } from '../types'
import { isTrading } from '../world/lifecycle'
import { applyOverride, opponentFit } from './goals'
import { relation, shiftRelation, tilt } from './relations'
import { nextOfficeId, noteDecision, officeOf, pairKey } from './state'
import { strategyOf } from './strategy'
import { OFFICE_LIMITS, type FightProposal, type OfferReason, type OfferTerms } from './types'

export const OFFER_REASON_LABEL: Record<OfferReason, string> = {
  development: 'A development bout', competitive: 'A competitive matchup', commercial: 'A commercially attractive fight', eliminator: 'A title eliminator', title: 'A title opportunity',
  rematch: 'A rematch', opportunity: 'An opportunity after a big win', replacement: 'A replacement opponent', rivalry: 'A rivalry fight', regional: 'A regional matchup',
}

const WEEK = 7
export const isLive = (o: FightProposal): boolean => o.status === 'open' || o.status === 'countered'
const round100 = (n: number) => Math.round(n / 100) * 100

// ------------------------------------------------------------------------------------------------ Generation

const rating = (state: GameState, promoId: Id, f: Fighter): number => appraise(state, state.promotions[promoId], f).rating

/** Fighters of a rival promotion that could take a fight now (public: they are on its roster and its shows). */
function rivalFree(state: GameState, promoId: Id, day: number): Fighter[] {
  const out: Fighter[] = []
  for (const c of Object.values(state.contracts)) {
    if (c.promotionId !== promoId || c.status !== 'active') continue
    const f = state.fighters[c.fighterId]
    if (f && bookable(state, f, day) && weeksSince(state, f) >= 8 && !titleObligation(state, f.id)) out.push(f)
  }
  return out.sort((a, b) => weeksSince(state, b) - weeksSince(state, a) || (a.id < b.id ? -1 : 1))
}

function myFree(state: GameState, day: number): Fighter[] {
  const out: Fighter[] = []
  for (const c of Object.values(state.contracts)) {
    if (c.promotionId !== state.playerPromotionId || c.status !== 'active') continue
    const f = state.fighters[c.fighterId]
    if (f && bookable(state, f, day) && weeksSince(state, f) >= 8 && !titleObligation(state, f.id)) out.push(f)
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1))
}

/** A rival show that could take another fight in the next few months: venue room, date far enough away, rival active. */
function openSlot(state: GameState, promoId: Id, x: Fighter, y: Fighter): { ev: string } | null {
  for (const ev of Object.values(state.events).sort((a, b) => a.day - b.day)) {
    if (ev.promotionId !== promoId || !isEventOpen(ev) || ev.day < state.today + 5 * WEEK || ev.day > state.today + 15 * WEEK) continue
    const v = state.venues[ev.venueId]
    const onCard = ev.card.map((id) => state.fights[id]).filter((f): f is Fight => !!f && f.status !== 'cancelled')
    if (!v || onCard.length >= v.maxFights - 1) continue
    if (onCard.some((f) => [f.sideA.fighterId, f.sideB.fighterId].some((id) => id === x.id || id === y.id))) continue
    if (!fightAvailability(state, x, ev.day).ok || !fightAvailability(state, y, ev.day).ok) continue
    if (['onSale', 'promoting', 'cardBuilding', 'venueBooked'].includes(ev.status)) return { ev: ev.id }
  }
  return null
}

interface Candidate { x: Fighter; y: Fighter; reason: OfferReason; score: number }

function reasonFor(state: GameState, promoId: Id, x: Fighter, y: Fighter): { reason: OfferReason; score: number } | null {
  const promo = state.promotions[promoId]
  const rx = rating(state, promoId, x), ry = rating(state, promoId, y)
  const diff = ry - rx
  const focus = strategyOf(state).focus
  const st = state.media?.effects ? stakesBetween(state, x.id, y.id, x.weightClass) : { kind: 'standard' as const }
  const heat = state.media ? rivalryStrength(state.media, x.id, y.id) : 0
  const met = x.recentFights.some((id) => { const f = state.fights[id]; return f?.result && (f.sideA.fighterId === y.id || f.sideB.fighterId === y.id) })
  if (st.kind === 'title' || st.kind === 'unification') {
    // A voluntary title fight: only where the champion's camp would take it (the same rule as any title request).
    const champ = st.bodies.length ? state.media!.titles[`${st.bodies[0]}|${x.weightClass}`]?.c : null
    if (champ && champ === x.id && Math.abs(diff) <= 14) return { reason: 'title', score: 70 + (focus === 'contender' ? 12 : 0) }
    if (champ && champ === y.id && championCampResponse(state, y.id, x.id, x.weightClass, st.bodies).accept && Math.abs(diff) <= 16) return { reason: 'title', score: 66 + (focus === 'contender' ? 12 : 0) }
    return null
  }
  if (st.kind === 'eliminator') return null // an ordered eliminator is staged by the bodies' rules, not by an invitation
  // Phase 5.4D: a fighter riding a big win draws attention; rivals who want a name to beat (or to build on) write about them.
  if (y.momentum >= 50 && weeksSince(state, y) <= 14 && diff <= 10 && diff >= -14) return { reason: 'opportunity', score: 50 + Math.min(10, (y.momentum - 50) / 3) - Math.abs(diff) * 0.5 }
  if (met && heat >= 18) return { reason: 'rematch', score: 60 + heat * 0.4 + (focus === 'regional' ? 6 : 0) }
  if (heat >= 30) return { reason: 'rivalry', score: 55 + heat * 0.4 + (focus === 'headline' ? 10 : 0) }
  const young = x.record.wins + x.record.losses + x.record.draws <= 12
  if ((young || promo.ai?.strategy === 'prospectFactory') && diff <= 4 && diff >= -16) return { reason: 'development', score: 42 + (focus === 'prospects' ? 14 : 0) - Math.abs(diff + 4) + (y.momentum <= -25 ? 8 : 0) }
  const rankedX = !!state.media && ['atlas', 'pioneer', 'crown', 'apex'].some((b) => rankIn(state.media!, b, x.weightClass, x.id) !== null)
  const rankedY = !!state.media && ['atlas', 'pioneer', 'crown', 'apex'].some((b) => rankIn(state.media!, b, y.weightClass, y.id) !== null)
  if (rankedX && rankedY && Math.abs(diff) <= 9) return { reason: 'competitive', score: 52 - Math.abs(diff) + (focus === 'contender' ? 12 : 0) }
  if (x.popularity + y.popularity >= 70 && Math.abs(diff) <= 12) return { reason: 'commercial', score: 48 + (focus === 'headline' ? 12 : 0) }
  if (regionOf(x.nationality) === regionOf(y.nationality) && Math.abs(diff) <= 9 && totalFights(x) >= 6) return { reason: 'regional', score: 36 + (focus === 'regional' ? 12 : 0) - Math.abs(diff) }
  if (Math.abs(diff) <= 8) return { reason: 'competitive', score: 34 - Math.abs(diff) + (focus === 'contender' ? 8 : 0) }
  return null
}

function proposalMessage(state: GameState, o: FightProposal): string {
  const x = state.fighters[o.theirs], y = state.fighters[o.mine]
  const promo = state.promotions[o.promoId]
  const rec = (f: Fighter) => `${f.record.wins}-${f.record.losses}-${f.record.draws}`
  const nx = fighterName(x), ny = fighterName(y)
  switch (o.reason) {
    case 'development': return `${promo.name} want a step-up test for ${nx} (${rec(x)}) and see ${ny} (${rec(y)}) as the right opponent.`
    case 'competitive': return `${promo.name} think ${nx} (${rec(x)}) and ${ny} (${rec(y)}) are well matched, and that the fight would mean something in the division.`
    case 'commercial': return `${promo.name} believe ${nx} against ${ny} would sell: two names the public already know.`
    case 'opportunity': return `${promo.name} have noticed ${ny}'s recent win (${rec(y)}) and want ${nx} (${rec(x)}) to take on a fighter in form.`
    case 'rematch': return `${promo.name} want the rematch: ${nx} and ${ny} fought before and the public never got a conclusion.`
    case 'rivalry': return `${promo.name} want to feed the rivalry between ${nx} and ${ny}.`
    case 'title': return `${promo.name} are offering a championship fight between ${nx} and ${ny}.`
    case 'replacement': return `${promo.name} need an opponent for ${nx} at short notice and have thought of ${ny}.`
    default: return `${promo.name} would like ${nx} to face ${ny}, a regional matchup that makes sense for both.`
  }
}

/** Public line for the offer's "what is at stake" field. */
export function stakesLabel(o: FightProposal): string { return o.stakes === 'title' ? 'Championship fight' : o.stakes === 'eliminator' ? 'Title eliminator' : 'Standard bout' }

const MAX_NEW_PER_WEEK = 1

/** Diagnostics for the audit (not part of game state): why proposals did or did not happen. */
export const offerDiag: Record<string, number> = {}
const dg = (k: string) => { offerDiag[k] = (offerDiag[k] ?? 0) + 1 }

/** Weekly: at most one rival makes one new proposal, and only when one could really be staged. Deterministic and keyed (the engine's RNG is untouched). */
export function generateOffers(state: GameState): void {
  const o = officeOf(state)
  const live = Object.values(o.offers).filter(isLive)
  if (live.length >= OFFICE_LIMITS.openOffers) return
  if (state.promotions[state.playerPromotionId].cash < 0) return
  const wk = weekIndex(state)
  const day = state.today + 6 * WEEK
  const rivals = Object.values(state.promotions).filter((p) => !p.isPlayer && p.ai && isTrading(state, p)).sort((a, b) => (a.id < b.id ? -1 : 1))
  let made = 0
  let mine: Fighter[] | null = null
  // A fighter of yours in form (a recent big win) makes the phone ring a little more often. Not a guarantee: the roll below is still a roll.
  const inForm = Object.values(state.contracts).some((c) => c.promotionId === state.playerPromotionId && c.status === 'active' && (state.fighters[c.fighterId]?.momentum ?? 0) >= 55)
  for (const promo of rivals) {
    if (made >= MAX_NEW_PER_WEEK) break
    const ai = promo.ai!
    const b = behaviour(promo)
    dg('rivalWeeks')
    if (!b.signing && ai.fin.state !== 'healthy' && ai.fin.state !== 'established' && ai.fin.state !== 'growing') continue // a promotion in trouble is not proposing fights
    const rel = relation(state, 'promoter', promo.id)
    // How often this rival writes: more for bigger, active, friendlier promotions; less for hostile ones; none while its roster is thin.
    const p = 0.15 * (promo.tier === 'Global' || promo.tier === 'Major' ? 1.3 : promo.tier === 'National' ? 1.1 : 0.9) * tilt(rel, 0.5) * (rel <= -45 ? 0.3 : 1) * (inForm ? 1.2 : 1)
    if (keyedFloat(state.seed, 'offer', promo.id, wk) >= p) continue
    dg('rolled')
    mine ??= myFree(state, day)
    if (!mine.length) { dg('noMyFighters'); break }
    const theirs = rivalFree(state, promo.id, day).slice(0, 4)
    if (!theirs.length) { dg('noTheirFighters'); continue }
    const cands: Candidate[] = []
    for (const x of theirs) for (const y of mine) {
      const key = pairKey(x.id, y.id)
      if (o.recent[key] !== undefined && state.today - o.recent[key] < 26 * WEEK) continue
      if (live.some((q) => q.mine === y.id && q.promoId === promo.id) || Object.values(o.offers).some((q) => isLive(q) && q.theirs === x.id)) continue
      if (validateMatch(state, x.id, y.id).ok === false) continue
      const meetings = y.recentFights.filter((id) => x.recentFights.includes(id)).length
      if (meetings >= 3) continue
      const r = reasonFor(state, promo.id, x, y)
      if (r) cands.push({ x, y, ...r })
    }
    if (!cands.length) { dg('noCandidates'); continue }
    cands.sort((a, c) => c.score - a.score || (a.x.id + a.y.id < c.x.id + c.y.id ? -1 : 1))
    const pick = cands[Math.min(cands.length - 1, Math.floor(keyedFloat(state.seed, 'offerpick', promo.id, wk) * Math.min(3, cands.length)))]
    const made1 = buildProposal(state, promo.id, pick)
    if (made1) { made++; mine = null; dg('made') } else dg('unaffordable')
  }
}

function buildProposal(state: GameState, promoId: Id, c: Candidate): FightProposal | null {
  const o = officeOf(state)
  const promo = state.promotions[promoId]
  const wk = weekIndex(state)
  const { x, y } = c
  const wc = (x.weightClass === y.weightClass ? x.weightClass : y.weightClass) // the bigger man's class governs a catchweight (as in fight creation)
  const st = state.media?.effects ? stakesBetween(state, x.id, y.id, wc) : { kind: 'standard' as const, level: null, bodies: [] as string[] }
  const rounds = (() => { const need = requiredRounds({ kind: st.kind === 'unification' ? 'unification' : st.kind, level: st.level ?? null } as never); return need ?? (totalFights(x) + totalFights(y) < 16 ? 6 : 8) })()
  const markup = 1 + 0.12 * keyedFloat(state.seed, 'offermark', promoId, wk)
  // Since Phase 6.3 every new proposal is a place on the RIVAL's own show: the rival is the organiser, and the player never has to find a date or a card.
  // If it has no open show with room, it puts one together now (the weekly planner, with the same finance and roster limits) - or makes no offer.
  const ct = y.contractId ? state.contracts[y.contractId] : null
  const fee = round100(Math.max(baseMoney(valueOf(state, y)).purse * 0.95 * (2 - markup), (ct?.basePurse ?? 0) * 1.15))
  const xc = x.contractId ? state.contracts[x.contractId] : null
  if (promo.cash < (fee + (xc?.basePurse ?? 0)) * 3) return null // the rival must afford its side
  let slot = openSlot(state, promoId, x, y)
  if (!slot) {
    const show = stageRivalShow(state, promo, keyedRng(state.seed, 'offershow', promoId, wk), new Set([x.id]))
    if (show) { dg('showStaged'); slot = openSlot(state, promoId, x, y) }
  }
  if (!slot) { dg('noShow'); return null }
  const host: 'you' | 'them' = 'them'
  const ev = state.events[slot.ev]
  const day: number | null = ev.day
  const terms: OfferTerms = { purse: fee, winBonus: round100(fee * 0.1), rematch: false }
  const id = nextOfficeId(state, 'of')
  const p: FightProposal = {
    id, promoId, mine: y.id, theirs: x.id, reason: host === 'them' && c.reason === 'development' && keyedFloat(state.seed, 'offerrep', id) < 0.3 ? 'replacement' : c.reason, host, eventId: slot?.ev ?? null, day, rounds,
    stakes: st.kind === 'title' || st.kind === 'unification' ? 'title' : st.kind === 'eliminator' ? 'eliminator' : 'standard',
    terms, status: 'open', createdDay: state.today, expiresDay: state.today + (host === 'them' ? Math.min(3 * WEEK, Math.max(WEEK, (day! - state.today) - 5 * WEEK)) : 4 * WEEK), fightId: null, history: [], message: '',
  }
  p.message = proposalMessage(state, p)
  p.history.push({ day: state.today, by: 'rival', terms: { ...terms }, note: 'Opening proposal' })
  o.offers[id] = p
  o.recent[pairKey(x.id, y.id)] = state.today
  trimOffers(state)
  trimRecent(state)
  postMessage(state, {
    from: promo.name, category: 'fighter', priority: 'important', key: `offer-${id}`, cooldownWeeks: 8,
    subject: `Fight offer: ${fighterName(y)} v ${fighterName(x)}`,
    body: `${p.message} ${host === 'them' ? `They are offering a place on ${state.events[p.eventId!].name}, ${state.events[p.eventId!].city}.` : 'They want you to host it.'} The offer stands for ${Math.round((p.expiresDay - state.today) / WEEK)} week${Math.round((p.expiresDay - state.today) / WEEK) === 1 ? '' : 's'}.`,
    link: { kind: 'screen', screen: 'fights/offers' },
  })
  return p
}

function trimRecent(state: GameState): void {
  const o = officeOf(state)
  const keys = Object.keys(o.recent)
  if (keys.length <= OFFICE_LIMITS.recent) return
  keys.sort((a, b) => o.recent[a] - o.recent[b])
  for (const k of keys.slice(0, keys.length - OFFICE_LIMITS.recent)) delete o.recent[k]
}

/** Closed offers are kept for the history, bounded; live ones and agreed ones with a fight in progress are never dropped. */
function trimOffers(state: GameState): void {
  const o = officeOf(state)
  const all = Object.values(o.offers)
  if (all.length <= OFFICE_LIMITS.offers) return
  const closed = all.filter((x) => !isLive(x) && !(x.status === 'agreed' && x.fightId && state.fights[x.fightId] && !state.fights[x.fightId].result && state.fights[x.fightId].status !== 'cancelled')).sort((a, b) => (a.closedDay ?? a.createdDay) - (b.closedDay ?? b.createdDay))
  for (const x of closed) { if (Object.keys(o.offers).length <= OFFICE_LIMITS.offers) break; delete o.offers[x.id] }
}

// ------------------------------------------------------------------------------------------------ Validity

/** Is the proposal still something that could be staged? Returns why not, in words. */
export function offerProblem(state: GameState, o: FightProposal): string | null {
  const x = state.fighters[o.theirs], y = state.fighters[o.mine]
  const promo = state.promotions[o.promoId]
  if (!x || !y || !promo?.ai) return 'the fight is off'
  if (x.status !== 'active' || y.status !== 'active') return 'a fighter has retired'
  const mineNow = y.contractId && state.contracts[y.contractId]?.promotionId === state.playerPromotionId
  if (!mineNow) return `${fighterName(y)} is no longer on your roster`
  const theirsNow = x.contractId && state.contracts[x.contractId]?.promotionId === o.promoId
  if (!theirsNow) return `${fighterName(x)} is no longer with ${promo.name}`
  if (x.activeFightId || y.activeFightId) return `${x.activeFightId ? fighterName(x) : fighterName(y)} has been booked for another fight`
  if (x.injury || y.injury) return `${x.injury ? fighterName(x) : fighterName(y)} is injured`
  const check = validateMatch(state, x.id, y.id)
  if (!check.ok) return check.reason ?? 'the match cannot be made'
  if (titleObligation(state, x.id) || titleObligation(state, y.id)) return 'a title obligation now comes first'
  if (o.host === 'them') {
    const ev = o.eventId ? state.events[o.eventId] : null
    if (!ev || !isEventOpen(ev) || ev.promotionId !== o.promoId) return 'their show has been called off'
    if (ev.day < state.today + 3 * WEEK) return 'their show is too close'
    const v = state.venues[ev.venueId]
    if (ev.card.map((id) => state.fights[id]).filter((f): f is Fight => !!f && f.status !== 'cancelled').length >= v.maxFights) return 'the card is full'
    if (!fightAvailability(state, x, ev.day).ok || !fightAvailability(state, y, ev.day).ok) return 'a fighter cannot make their date'
  } else if (state.promotions[state.playerPromotionId].cash < o.terms.purse) return 'you could not pay for it right now'
  return null
}

// ------------------------------------------------------------------------------------------------ Player actions

export interface OfferResult { ok: boolean; error?: string; fightId?: Id; needsOverride?: boolean }
export type OfferOutcome = OfferResult & { state: GameState }

/** Run a mutating action on a copy; the caller keeps the original unless the action succeeded. */
function run(input: GameState, fn: (s: GameState) => OfferResult, keepOnFail = false): OfferOutcome {
  const state = structuredClone(input)
  const r = fn(state)
  return { ...r, state: r.ok || keepOnFail ? state : input }
}

const live1 = (state: GameState, id: Id): FightProposal | null => { const o = state.office?.offers[id]; return o && o.status === 'open' ? o : null }

function close(state: GameState, o: FightProposal, status: 'rejected' | 'expired' | 'withdrawn', why: string): void {
  o.status = status; o.closed = why; o.closedDay = state.today
}

/** Turn an agreed proposal into a real fight through the ordinary pipeline. */
function createAgreedFight(state: GameState, o: FightProposal, override: boolean): OfferResult {
  const x = state.fighters[o.theirs], y = state.fighters[o.mine]
  if (o.host === 'you') {
    // The rival opened this: its camp's consent is the proposal itself, so no second approach is made. The fight is created and agreed
    // through the same two calls every bout the player books goes through.
    const fight = createFight(state, y.id, x.id, state.playerPromotionId, 'player')
    agreeFight(state, fight, { purseB: o.terms.purse, winBonusB: o.terms.winBonus, rematch: o.terms.rematch, venuePref: 'neutral', fights: 1 })
    if (override) applyOverride(state, y, x, o.id)
    return { ok: true, fightId: fight.id }
  }
  const ev = state.events[o.eventId!]
  const fight = createFight(state, x.id, y.id, o.promoId, 'ai', { purseB: o.terms.purse, winBonusB: o.terms.winBonus, rematch: o.terms.rematch })
  transition(fight, 'agreed')
  y.activeFightId = fight.id
  const why = eventAcceptsFight(state, ev, fight)
  if (why) { cancelFight(state, fight, why); x.activeFightId = null; y.activeFightId = null; return { ok: false, error: why } }
  attachFight(state, ev, fight)
  if (override) applyOverride(state, y, x, o.id)
  return { ok: true, fightId: fight.id }
}

const acceptM = (state: GameState, id: Id, override: boolean): OfferResult => {
  const o = live1(state, id)
  if (!o) return { ok: false, error: 'That offer is no longer open.' }
  if (state.today > o.expiresDay) { close(state, o, 'expired', 'The offer ran out before you answered.'); return { ok: false, error: 'That offer has expired.' } }
  const why = offerProblem(state, o)
  if (why) { close(state, o, 'withdrawn', `Withdrawn: ${why}.`); return { ok: false, error: `The offer is off: ${why}.` } }
  const x = state.fighters[o.theirs], y = state.fighters[o.mine]
  const fit = opponentFit(state, y, x)
  if (fit.objection && !override) return { ok: false, needsOverride: true, error: fit.note ?? 'The camp objects.' }
  const res = createAgreedFight(state, o, fit.objection && override)
  if (!res.ok) { return res }
  o.status = 'agreed'; o.fightId = res.fightId!; o.closedDay = state.today
  shiftRelation(state, 'promoter', o.promoId, 0.8, `You agreed ${fighterName(y)} v ${fighterName(x)}`, `offer:acc:${o.id}`)
  noteDecision(state, y.id, `Accepted ${state.promotions[o.promoId].name}'s offer to fight ${fighterName(x)}`)
  postMessage(state, { from: 'Matchmaking', category: 'fighter', priority: 'important', subject: `Fight agreed with ${state.promotions[o.promoId].name}`, body: `${fighterName(y)} v ${fighterName(x)} is on${o.host === 'them' ? `, on ${state.events[o.eventId!].name}` : '; choose a date and a show for it'}.`, link: { kind: 'fight', id: res.fightId! } })
  return res
}

const rejectM = (state: GameState, id: Id): OfferResult => {
  const o = live1(state, id)
  if (!o) return { ok: false, error: 'That offer is no longer open.' }
  close(state, o, 'rejected', 'You turned it down.')
  shiftRelation(state, 'promoter', o.promoId, -0.3, `You turned down their proposal for ${fighterName(state.fighters[o.mine])}`, `offer:rej:${o.id}`)
  return { ok: true }
}

/** Counter with different money (or ask for the rematch clause). The rival answers a week later. */
const counterM = (state: GameState, id: Id, terms: OfferTerms): OfferResult => {
  const o = live1(state, id)
  if (!o) return { ok: false, error: 'That offer is no longer open.' }
  if (o.history.filter((h) => h.by === 'you').length >= 2) return { ok: false, error: 'You have countered twice already: accept, or let it go.' }
  if (terms.purse <= 0) return { ok: false, error: 'Put a figure on it.' }
  if (o.host === 'you' && state.promotions[state.playerPromotionId].cash < terms.purse) return { ok: false, error: 'You could not pay that purse.' }
  o.terms = { purse: round100(terms.purse), winBonus: round100(terms.winBonus), rematch: !!terms.rematch }
  o.status = 'countered'
  o.history.push({ day: state.today, by: 'you', terms: { ...o.terms }, note: 'Your counter' })
  o.expiresDay = Math.max(o.expiresDay, state.today + 3 * WEEK)
  return { ok: true }
}

/** The player drops a counter that is still waiting for an answer. */
const withdrawM = (state: GameState, id: Id): OfferResult => {
  const o = state.office?.offers[id]
  if (!o || o.status !== 'countered') return { ok: false, error: 'There is nothing to withdraw.' }
  close(state, o, 'withdrawn', 'You withdrew your counter.')
  return { ok: true }
}

/** Pull out of an agreed fight that has not been fought. A rival hears about it. */
const pullM = (state: GameState, id: Id): OfferResult => {
  const o = state.office?.offers[id]
  if (!o || o.status !== 'agreed' || !o.fightId) return { ok: false, error: 'There is no agreed fight to pull out of.' }
  const f = state.fights[o.fightId]
  if (!f || ['completed', 'postFight', 'cancelled'].includes(f.status) || f.result) return { ok: false, error: 'That fight can no longer be called off.' }
  cancelFight(state, f, 'you pulled out')
  state.fighters[o.mine].activeFightId = null
  state.fighters[o.theirs].activeFightId = null
  shiftRelation(state, 'promoter', o.promoId, -3, `You pulled out of the agreed fight with ${fighterName(state.fighters[o.theirs])}`, `offer:pull:${o.id}`)
  state.promotions[state.playerPromotionId].reputation = Math.max(0, state.promotions[state.playerPromotionId].reputation - 0.4)
  return { ok: true }
}

export const acceptOffer = (input: GameState, id: Id, override = false): OfferOutcome => run(input, (s) => acceptM(s, id, override), true)
export const rejectOffer = (input: GameState, id: Id): OfferOutcome => run(input, (s) => rejectM(s, id))
export const counterOffer = (input: GameState, id: Id, terms: OfferTerms): OfferOutcome => run(input, (s) => counterM(s, id, terms))
export const withdrawCounter = (input: GameState, id: Id): OfferOutcome => run(input, (s) => withdrawM(s, id))
export const pullOutOfOffer = (input: GameState, id: Id): OfferOutcome => run(input, (s) => pullM(s, id))

// ------------------------------------------------------------------------------------------------ Rival decisions

/** What the rival would settle for, as a share of its own opening terms. Built from its finances, style, relationship and the reason for the fight. */
function flexOf(state: GameState, o: FightProposal): number {
  const promo = state.promotions[o.promoId]
  const rel = relation(state, 'promoter', o.promoId)
  let flex = 0.09 // room it will give by default
  flex += (Math.max(-60, Math.min(60, rel)) / 60) * 0.05
  const fin = promo.ai!.fin.state
  flex += fin === 'struggling' || fin === 'critical' ? (o.host === 'you' ? 0.04 : -0.06) : 0
  if (promo.ai!.strategy === 'money') flex -= 0.03
  if (promo.ai!.strategy === 'prospectFactory' && o.reason === 'development') flex -= 0.02
  if (o.reason === 'rematch' || o.reason === 'rivalry') flex += 0.02 // they want this one
  flex += (keyedFloat(state.seed, 'flex', o.id) - 0.5) * 0.05
  return Math.max(0.02, flex)
}

/** The rival's reply to the player's counter: accept, counter-propose, or walk. */
function replyToCounter(state: GameState, o: FightProposal): void {
  const open = o.history[0].terms
  const ask = o.terms
  const flex = flexOf(state, o)
  // host 'you': the rival wants MORE purse than it opened with; the player is asking for less. host 'them': the rival pays; the player asks for more.
  const ratio = o.host === 'you' ? ask.purse / open.purse : open.purse / ask.purse
  const promo = state.promotions[o.promoId]
  const y = state.fighters[o.mine], x = state.fighters[o.theirs]
  const name = promo.name
  if (ratio >= 1 - flex) {
    const res = resolveAccepted(state, o)
    if (res) return
    return
  }
  if (ratio < 0.7 || keyedFloat(state.seed, 'walk', o.id, o.history.length) < Math.max(0, (0.85 - ratio) * 0.8)) {
    close(state, o, 'rejected', `${name} would not go that far.`)
    shiftRelation(state, 'promoter', o.promoId, -0.4, `Your counter on ${fighterName(y)} v ${fighterName(x)} was too far from what they could do`, `offer:far:${o.id}`)
    postMessage(state, { from: name, category: 'fighter', priority: 'normal', key: `offerrej-${o.id}`, cooldownWeeks: 8, subject: `${name} turn down your counter`, body: `${name} will not do ${fighterName(y)} v ${fighterName(x)} on those terms and have withdrawn the offer.`, link: { kind: 'screen', screen: 'fights/offers' } })
    return
  }
  // Meet part-way: a new proposal for the player to take or leave (once).
  const mid = o.host === 'you' ? open.purse - (open.purse - ask.purse) * 0.4 : open.purse + (ask.purse - open.purse) * 0.4
  o.terms = { purse: round100(mid), winBonus: round100(mid * 0.1), rematch: ask.rematch && o.reason === 'rematch' }
  o.status = 'open'
  o.history.push({ day: state.today, by: 'rival', terms: { ...o.terms }, note: 'They meet you part of the way' })
  o.expiresDay = state.today + 3 * WEEK
  postMessage(state, { from: name, category: 'fighter', priority: 'important', key: `offercnt-${o.id}-${o.history.length}`, cooldownWeeks: 2, subject: `${name} come back on ${fighterName(y)} v ${fighterName(x)}`, body: `${name} will meet you part of the way: ${o.host === 'you' ? 'a purse of' : 'a fee of'} £${o.terms.purse.toLocaleString('en-GB')}. It is their final position.`, link: { kind: 'screen', screen: 'fights/offers' } })
}

function resolveAccepted(state: GameState, o: FightProposal): boolean {
  const why = offerProblem(state, o)
  const y = state.fighters[o.mine], x = state.fighters[o.theirs]
  const name = state.promotions[o.promoId].name
  if (why) { close(state, o, 'withdrawn', `Withdrawn: ${why}.`); return false }
  const fit = opponentFit(state, y, x)
  if (fit.objection) { close(state, o, 'withdrawn', 'Your camp would not take the fight, so it lapsed.'); return false }
  const res = createAgreedFight(state, o, false)
  if (!res.ok) { close(state, o, 'withdrawn', `Withdrawn: ${res.error}`); return false }
  o.status = 'agreed'; o.fightId = res.fightId!; o.closedDay = state.today
  o.history.push({ day: state.today, by: 'rival', terms: { ...o.terms }, note: 'They accepted your counter' })
  shiftRelation(state, 'promoter', o.promoId, 0.8, `They agreed ${fighterName(y)} v ${fighterName(x)} on your terms`, `offer:acc:${o.id}`)
  noteDecision(state, y.id, `Negotiated a fight with ${name} against ${fighterName(x)}`)
  postMessage(state, { from: name, category: 'fighter', priority: 'important', subject: `${name} accept your counter`, body: `${fighterName(y)} v ${fighterName(x)} is agreed${o.host === 'them' ? ` for ${state.events[o.eventId!].name}` : '; choose a date and a show for it'}.`, link: { kind: 'fight', id: res.fightId! } })
  return true
}

/** Weekly housekeeping: expiry, withdrawals when something real changed, the rival's replies to counters. */
export function processOffers(state: GameState): void {
  const o = state.office
  if (!o) return
  for (const p of Object.values(o.offers)) {
    if (p.status === 'agreed') {
      // Settled agreements: the fight finished, or fell through, and the relationship follows.
      const f = p.fightId ? state.fights[p.fightId] : null
      if (f?.status === 'cancelled' && !p.closedDay) p.closedDay = state.today
      continue
    }
    if (!isLive(p)) continue
    const why = offerProblem(state, p)
    if (why) {
      close(state, p, 'withdrawn', `Withdrawn: ${why}.`)
      postMessage(state, { from: state.promotions[p.promoId].name, category: 'fighter', priority: 'normal', key: `offerwd-${p.id}`, cooldownWeeks: 8, subject: 'An offer has been withdrawn', body: `${state.promotions[p.promoId].name}'s offer for ${fighterName(state.fighters[p.mine])} is off: ${why}.`, link: { kind: 'screen', screen: 'fights/offers' } })
      continue
    }
    if (p.status === 'countered') {
      const last = p.history[p.history.length - 1]
      if (state.today - last.day >= WEEK) replyToCounter(state, p)
      continue
    }
    if (state.today > p.expiresDay) {
      close(state, p, 'expired', 'It ran out before you answered.')
      shiftRelation(state, 'promoter', p.promoId, -0.6, `Their proposal for ${fighterName(state.fighters[p.mine])} went unanswered`, `offer:exp:${p.id}`)
    }
  }
}

void weightClassLabel; void lockKey; void settleRounds; void transition
