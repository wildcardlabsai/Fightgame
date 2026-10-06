/**
 * AI PROMOTION FINANCE & LIFE CYCLE (Phase 4.5).
 * Rivals pay the same kinds of bills the player does (retainers, overhead) and earn only from their shows.
 * Their financial state is derived from their own books:
 *     growing → healthy/established → struggling → critical → insolvent  (→ recovery, or collapse)
 * and it changes what they do: fewer, smaller shows with less marketing, no signings, fighters released.
 * An owner rescue exists but is rare, costs reputation and talent, and eventually stops coming.
 */
import { BALANCE as B } from '../balance'
import { fighterName } from '../fighters'
import { postNews } from '../messages'
import { archiveContract, becomeFreeAgent } from '../roster'
import type { Contract, GameState, Promotion, PromoFinState } from '../types'

const X = B.events.ai
export const STATE_ORDER: PromoFinState[] = ['growing', 'healthy', 'established', 'struggling', 'critical', 'insolvent']

export function weeklyFixed(state: GameState, p: Promotion): number {
  let retainers = 0
  for (const c of Object.values(state.contracts)) if (c.promotionId === p.id) retainers += c.weeklyRetainer
  return retainers + X.overheadPerWeek[p.tier]
}

export function behaviour(p: Promotion) {
  return X.behaviour[p.ai?.fin.state ?? 'healthy']
}

function classify(p: Promotion, fixed: number): PromoFinState {
  const fin = p.ai!.fin
  if (fin.collapsing) return 'insolvent'
  const runwayWeeks = fixed > 0 ? p.cash / fixed : 999
  if (p.cash < -8 * fixed) return 'insolvent'
  const q = fin.quarters
  // A young promotion has no track record yet (shows settle weeks after the bills start): judge it on cash alone.
  if (q.length < 3 || p.stats.events < 3) return runwayWeeks < 10 ? 'critical' : 'established'
  const n4 = q.slice(-4).reduce((a, b) => a + b, 0) * (4 / Math.min(4, q.length))
  const r = n4 / Math.max(1, fixed * 52)
  // How long can it keep losing at this rate? Cash-rich promotions can absorb a bad spell; thin ones cannot.
  const yearsLeft = n4 < 0 ? p.cash / -n4 : 99
  if (runwayWeeks < 10 || (n4 < 0 && yearsLeft < 0.5)) return 'critical'
  if (n4 < 0 && yearsLeft < 2.5) return 'struggling'
  if (r > 0.6) return 'growing'
  if (r > 0.2) return 'established'
  return 'healthy'
}

/** Weekly: pay the bills, take distributions, classify, react. */
export function aiFinances(state: GameState): void {
  const week = Math.floor(state.today / 7)
  for (const p of Object.values(state.promotions)) {
    if (p.isPlayer || !p.accounting || !p.ai) continue
    const fin = p.ai.fin
    const fixed = weeklyFixed(state, p)
    const retainers = fixed - X.overheadPerWeek[p.tier]
    const over = fin.collapsing ? 0 : X.overheadPerWeek[p.tier]
    p.cash -= retainers + over
    p.accounting.costs += retainers
    p.accounting.overhead += over

    if (week % 13 === 0) {
      const net = p.accounting.revenue - p.accounting.costs - p.accounting.overhead
      fin.quarters.push(Math.round(net - fin.snap)); fin.snap = net
      if (fin.quarters.length > 8) fin.quarters.shift()
      const ceiling = X.distributionCeiling[p.tier]
      if (p.cash > ceiling) {
        const take = Math.round((p.cash - ceiling) * 0.5)
        p.cash -= take; p.accounting.distributions += take
      }
    }
    const next = classify(p, fixed)
    if (next !== fin.state) {
      const worse = STATE_ORDER.indexOf(next) > STATE_ORDER.indexOf(fin.state)
      fin.state = next; fin.since = state.today
      if (worse && (next === 'critical' || next === 'insolvent')) postNews(state, { headline: next === 'insolvent' ? `${p.name} in financial crisis` : `${p.name} reported to be in trouble`, category: 'event', importance: next === 'insolvent' ? 45 : 30 })
    }
    if (STATE_ORDER.indexOf(fin.state) >= STATE_ORDER.indexOf('struggling')) fin.distressWeeks++
    else fin.distressWeeks = Math.max(0, fin.distressWeeks - 2)
    react(state, p, fixed)
  }
}

function releaseExpensive(state: GameState, p: Promotion, n: number): void {
  const roster = Object.values(state.contracts).filter((c) => c.promotionId === p.id && !state.fighters[c.fighterId].activeFightId)
    .sort((a, b) => b.basePurse + b.weeklyRetainer * 8 - (a.basePurse + a.weeklyRetainer * 8))
  for (const c of roster.slice(0, n) as Contract[]) {
    const f = state.fighters[c.fighterId]
    archiveContract(state, c, 'released')
    becomeFreeAgent(state, f, 'released', p.id)
    if (f.reputation >= 45) postNews(state, { headline: `${p.name} cut costs, release ${fighterName(f)}`, category: 'release', fighterId: f.id })
  }
}

function react(state: GameState, p: Promotion, fixed: number): void {
  const fin = p.ai!.fin
  const week = Math.floor(state.today / 7)
  const b = behaviour(p)
  if (fin.state === 'struggling' && week % 8 === 0) releaseExpensive(state, p, b.release)
  if (fin.state === 'critical') {
    if (week % 4 === 0) releaseExpensive(state, p, b.release)
    p.reputation = Math.max(1, p.reputation - 0.12)
  }
  if (fin.state === 'insolvent') {
    fin.bailoutDays = fin.bailoutDays.filter((d) => state.today - d < 5 * 365)
    if (!fin.collapsing && p.cash < -8 * fixed) {
      if (fin.bailoutDays.length < X.rescue.maxPer5Years) {
        // Rescue: the owner puts money in, but sells talent and the brand takes a hit.
        const amount = Math.round(Math.max(-p.cash, 0) + X.bailoutAmount[p.tier] * 0.5)
        p.cash += amount; p.accounting!.bailouts += amount
        fin.bailoutDays.push(state.today)
        p.reputation = Math.max(1, p.reputation - X.rescue.repHit)
        const rosterN = Object.values(state.contracts).filter((c) => c.promotionId === p.id).length
        releaseExpensive(state, p, Math.ceil(rosterN * X.rescue.shedShare))
        fin.state = 'critical'; fin.since = state.today; fin.quarters = []; fin.snap = p.accounting!.revenue - p.accounting!.costs - p.accounting!.overhead
        postNews(state, { headline: `${p.name} rescued by owners, cuts roster`, category: 'event', importance: 40 })
      } else {
        fin.collapsing = true
        postNews(state, { headline: `${p.name} collapse: owners refuse further support`, category: 'event', importance: 55 })
      }
    }
    if (fin.collapsing) {
      // Runs down: talent and fans drift away, no new shows are planned (see events/ai.ts).
      if (week % 8 === 0) releaseExpensive(state, p, Math.max(1, Math.ceil(Object.values(state.contracts).filter((c) => c.promotionId === p.id).length * X.rescue.collapseReleaseShare)))
      p.reputation = Math.max(0, p.reputation - 0.25)
      p.fanbase = Math.max(100, Math.round(p.fanbase * 0.997))
    }
  }
}
