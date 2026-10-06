/**
 * PROMOTION TIER PROGRESSION (Phase 4.6c). Pure functions over GameState; `processTier` runs once a week from the tick.
 *
 * Advancing needs several measurable things at once — reputation, fanbase, completed events, lifetime revenue, the biggest
 * crowd you have drawn, established fighters on the roster, financial health (and sometimes cash). It never depends on cash alone.
 * A promotion must qualify for four consecutive weeks to move up, and only falls after a full year below its retention floor,
 * so one bad show can neither promote nor demote.
 */
import { postMessage } from './messages'
import { financialHealth, player, playerRoster } from './selectors'
import { nextTierId, prevTierId, TIER_DEFS, TIER_SEQUENCE, type FinanceGate, type TierRequirements } from './tiers'
import type { GameState, PromotionTier } from './types'

export const QUALIFY_WEEKS = 4
export const DEMOTE_WEEKS = 52
/** Retention floor: you keep your tier while you stay above these shares of its entry requirements. */
export const RETAIN = { reputation: 0.7, fanbase: 0.5 }

export interface TierProgress {
  qualifiedWeeks: number
  belowWeeks: number
  history: { day: number; from: PromotionTier; to: PromotionTier }[]
  /** Set when the tier changes; the UI shows it once, then clears it with `ackTierNotice`. */
  notice: { day: number; from: PromotionTier; to: PromotionTier } | null
}

export const freshTierProgress = (): TierProgress => ({ qualifiedWeeks: 0, belowWeeks: 0, history: [], notice: null })

export interface RequirementRow { key: string; label: string; have: number; need: number; met: boolean; money?: boolean }
export interface TierStatus {
  current: PromotionTier
  next: PromotionTier | null
  rows: RequirementRow[]
  met: boolean
  /** 0–100 progress towards the next tier (average of every requirement). */
  pct: number
  qualifiedWeeks: number
  weeksNeeded: number
}

const financeOk = (state: GameState, gate: FinanceGate): boolean => {
  if (gate === 'any') return true
  const h = financialHealth(state).state
  return gate === 'healthy' ? h === 'healthy' : h === 'healthy' || h === 'concern'
}

export function requirementRows(state: GameState, req: TierRequirements): RequirementRow[] {
  const p = player(state)
  const rows: RequirementRow[] = []
  const add = (key: string, label: string, have: number, need: number, money = false) => { if (need > 0) rows.push({ key, label, have, need, met: have >= need, money }) }
  add('reputation', 'Promotion reputation', Math.round(p.reputation), req.reputation)
  add('fanbase', 'Fanbase', Math.round(p.fanbase), req.fanbase)
  add('events', 'Events promoted', p.stats.events, req.events)
  add('revenue', 'Lifetime event revenue', Math.round(p.stats.revenue ?? 0), req.revenue, true)
  add('attendance', 'Biggest crowd drawn', p.stats.bestAttendance, req.bestAttendance)
  if (req.established.count > 0) add('established', `Fighters rated ${req.established.minReputation}+`, playerRoster(state).filter((f) => f.reputation >= req.established.minReputation).length, req.established.count)
  add('cash', 'Cash in the bank', Math.round(p.cash), req.cash, true)
  if (req.finance !== 'any') rows.push({ key: 'finance', label: req.finance === 'healthy' ? 'Financially healthy' : 'Not in financial trouble', have: financeOk(state, req.finance) ? 1 : 0, need: 1, met: financeOk(state, req.finance) })
  return rows
}

export function tierStatus(state: GameState): TierStatus {
  const cur = player(state).tier
  const next = nextTierId(cur)
  const req = next ? TIER_DEFS[next].requires : null
  const rows = req ? requirementRows(state, req) : []
  const met = !!req && rows.every((r) => r.met)
  const pct = rows.length ? Math.round((100 * rows.reduce((n, r) => n + Math.min(1, r.have / r.need), 0)) / rows.length) : 100
  return { current: cur, next, rows, met, pct, qualifiedWeeks: state.promotionProgress?.qualifiedWeeks ?? 0, weeksNeeded: QUALIFY_WEEKS }
}

/** Does the promotion still clear the floor for the tier it is in? (First tier has no floor.) */
export function retains(state: GameState): boolean {
  const p = player(state)
  const req = TIER_DEFS[p.tier].requires
  if (!req) return true
  return p.reputation >= req.reputation * RETAIN.reputation && p.fanbase >= req.fanbase * RETAIN.fanbase
}

function change(state: GameState, to: PromotionTier): void {
  const p = player(state)
  const from = p.tier
  p.tier = to
  const prog = (state.promotionProgress ??= freshTierProgress())
  prog.history.push({ day: state.today, from, to })
  prog.notice = { day: state.today, from, to }
  prog.qualifiedWeeks = 0
  prog.belowWeeks = 0
  const up = TIER_DEFS[to].rank > TIER_DEFS[from].rank
  postMessage(state, {
    from: 'Board', category: 'system', priority: 'important',
    subject: up ? `Promotion tier increased: ${TIER_DEFS[to].label}` : `Promotion tier reduced: ${TIER_DEFS[to].label}`,
    body: up ? `${p.name} is now a ${TIER_DEFS[to].label} promotion. ${TIER_DEFS[to].unlocks.join('. ')}.` : `After a year below the standard of a ${TIER_DEFS[from].label} promotion, ${p.name} has slipped to ${TIER_DEFS[to].label}. Venues and sponsors above this level are closed to you until you rebuild.`,
    link: { kind: 'screen', screen: 'dashboard' },
  })
}

/** Weekly check. Cheap: a handful of comparisons. */
export function processTier(state: GameState): void {
  const prog = (state.promotionProgress ??= freshTierProgress())
  const st = tierStatus(state)
  if (st.next && st.met) { prog.qualifiedWeeks++; if (prog.qualifiedWeeks >= QUALIFY_WEEKS) change(state, st.next) } else prog.qualifiedWeeks = 0
  if (player(state).tier === st.current) {
    if (!retains(state)) { prog.belowWeeks++; if (prog.belowWeeks >= DEMOTE_WEEKS) { const prev = prevTierId(st.current); if (prev) change(state, prev) } } else prog.belowWeeks = 0
  }
}

/** The highest tier a promotion qualifies for right now, climbing one step at a time (used to place migrated saves). */
export function highestQualifyingTier(state: GameState): PromotionTier {
  const clone = structuredClone(state)
  for (let i = 0; i < TIER_SEQUENCE.length; i++) {
    const st = tierStatus(clone)
    if (!st.next || !st.met) break
    player(clone).tier = st.next
  }
  return player(clone).tier
}

export function ackTierNotice(state: GameState): GameState {
  if (!state.promotionProgress?.notice) return state
  const next = structuredClone(state)
  next.promotionProgress!.notice = null
  return next
}
