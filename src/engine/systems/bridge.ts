/**
 * BRIDGE FINANCING - the one recovery route for a promotion that has run out of road.
 *
 * The audit (scripts/audit/phase56-economy.ts) found that once the account is overdrawn nothing the player can do earns money: a venue cannot be
 * hired and a signing bonus cannot be paid without cash, so a promotion that dips below zero stays there for the rest of the save. Insolvency is a
 * real consequence and stays one, but it must not be a dead end. The backers will bridge a promotion that is overdrawn (or that has no fighters, no
 * show on the books and almost no money), once, on hard terms:
 *   - the loan covers the overdraft plus a working float: twelve weeks of the promotion's real running costs (a show takes about that long from booking
 *     to the gate), never less than a startup's minimum nor more than a cap, both scaled to the tier;
 *   - it costs 25% in interest and is collected in equal weekly instalments over 156 weeks (three years), through the ledger like any other cost;
 *   - the promotion's reputation takes a small hit; only one loan at a time, and none again for two years after taking one;
 *   - they will not cover a hole deeper than a startup could plausibly trade out of (the closure consequence is kept).
 * It is not income: it is excluded from profit figures, and reckless spending afterwards still ends in the same place.
 */
import { weeksBetween } from '../calendar'
import { post } from '../ledger'
import { postMessage } from '../messages'
import { TIER_DEFS } from '../tiers'
import { eventCommitments, player, playerRoster, weeklyBurn } from '../selectors'
import type { Day, GameState } from '../types'

export const BRIDGE = { float: 60_000, floatMax: 200_000, floatWeeks: 12, maxHole: 250_000, interest: 0.25, weeks: 156, cooldownWeeks: 104, reputationCost: 3 } as const

export interface BridgeLoan { principal: number; owed: number; weekly: number; takenDay: Day; paidThrough: Day; weeksLeft: number }
export interface BridgeState { loan: BridgeLoan | null; lastTaken: Day | null; taken: number }

const scale = (state: GameState): number => TIER_DEFS[player(state).tier].overheadMult
const round5k = (n: number) => Math.ceil(n / 5_000) * 5_000
const hasOpenShow = (state: GameState): boolean =>
  Object.values(state.events).some((e) => e.promotionId === state.playerPromotionId && !['settled', 'archived', 'cancelled'].includes(e.status))

/** A working float that carries the promotion through one show cycle at its actual burn. */
export const floatFor = (state: GameState): number => Math.round(Math.min(BRIDGE.floatMax * scale(state), Math.max(BRIDGE.float * scale(state), BRIDGE.floatWeeks * weeklyBurn(state).total)))

export interface BridgeOffer { principal: number; hole: number; float: number; interest: number; owed: number; weekly: number; weeks: number; why: string }

/** Why the promotion qualifies (null when it does not), in words the player can check against their own accounts. */
export function distress(state: GameState): string | null {
  const cash = player(state).cash
  if (cash < 0) return `The account is overdrawn by £${Math.round(-cash).toLocaleString('en-GB')}, and an overdrawn promotion cannot hire a venue or pay a signing bonus.`
  const burn = weeklyBurn(state).total
  if (playerRoster(state).length < 2 && !hasOpenShow(state) && cash < burn * 12) return 'There are no fighters under contract, no show on the books and less than twelve weeks of running costs in the bank.'
  return null
}

/** The bridge on offer today, or null. Deterministic: the same books always get the same terms. */
export function bridgeOffer(state: GameState): BridgeOffer | null {
  const b = state.bridge
  if (b?.loan) return null
  if (b?.lastTaken !== null && b?.lastTaken !== undefined && weeksBetween(b.lastTaken, state.today) < BRIDGE.cooldownWeeks) return null
  const why = distress(state)
  if (!why) return null
  const k = scale(state)
  const hole = Math.max(0, -player(state).cash)
  if (hole > BRIDGE.maxHole * k) return null // too deep to trade out of: the consequence stands
  const float = floatFor(state)
  const principal = round5k(hole + float)
  const owed = Math.round(principal * (1 + BRIDGE.interest))
  return { principal, hole, float, interest: owed - principal, owed, weekly: Math.round(owed / BRIDGE.weeks), weeks: BRIDGE.weeks, why }
}

/** Why there is no offer, for the Finances screen (so a refusal is never silent). */
export function bridgeUnavailable(state: GameState): string | null {
  const b = state.bridge
  if (b?.loan) return `A bridge loan is already running: £${b.loan.owed.toLocaleString('en-GB')} still to repay.`
  const d = distress(state)
  if (b?.lastTaken !== null && b?.lastTaken !== undefined && weeksBetween(b.lastTaken, state.today) < BRIDGE.cooldownWeeks) return `The backers will not lend again until ${BRIDGE.cooldownWeeks - weeksBetween(b.lastTaken, state.today)} more weeks have passed.`
  if (d && -player(state).cash > BRIDGE.maxHole * scale(state)) return `The overdraft (£${Math.round(-player(state).cash).toLocaleString('en-GB')}) is deeper than the backers will cover: nobody believes a promotion this far under can trade out of it.`
  return null
}

export function takeBridge(state: GameState): { ok: boolean; error?: string } {
  const offer = bridgeOffer(state)
  if (!offer) return { ok: false, error: bridgeUnavailable(state) ?? 'The backers see no reason to lend: the promotion is not in distress.' }
  post(state, 'loan', offer.principal, 'Bridge loan from the backers')
  const p = player(state)
  p.reputation = Math.max(1, p.reputation - BRIDGE.reputationCost)
  const b = (state.bridge ??= { loan: null, lastTaken: null, taken: 0 })
  b.loan = { principal: offer.principal, owed: offer.owed, weekly: offer.weekly, takenDay: state.today, paidThrough: state.today, weeksLeft: offer.weeks }
  b.lastTaken = state.today
  b.taken++
  postMessage(state, {
    from: 'Accounts', category: 'finance', priority: 'important', key: `bridge-${state.today}`,
    subject: 'The backers have bridged the promotion',
    body: `£${offer.principal.toLocaleString('en-GB')} has been paid in (your overdraft of £${Math.round(offer.hole).toLocaleString('en-GB')} plus a working float). You owe £${offer.owed.toLocaleString('en-GB')}, taken as £${offer.weekly.toLocaleString('en-GB')} a week for ${offer.weeks} weeks. Sign fighters and stage shows that pay: reckless spending now ends the same way, and they will not lend again for two years.`,
    link: { kind: 'screen', screen: 'finances' },
  })
  return { ok: true }
}

/** Weekly instalment (called from the weekly finance pass, once per tick). */
export function processBridge(state: GameState): void {
  const loan = state.bridge?.loan
  if (!loan || state.today <= loan.paidThrough) return
  const pay = Math.min(loan.weekly, loan.owed)
  post(state, 'loanRepayment', -pay, 'Bridge loan repayment')
  loan.owed -= pay; loan.weeksLeft--; loan.paidThrough = state.today
  if (loan.owed <= 0 || loan.weeksLeft <= 0) {
    state.bridge!.loan = null
    postMessage(state, { from: 'Accounts', category: 'finance', priority: 'normal', key: `bridge-repaid-${state.today}`, subject: 'The bridge loan is repaid', body: 'The backers have been paid in full. The promotion stands on its own again.', link: { kind: 'screen', screen: 'finances' } })
  }
}

export interface BridgeView { loan: { owed: number; weekly: number; weeksLeft: number; principal: number } | null; offer: BridgeOffer | null; unavailable: string | null; danger: string | null }
export function bridgeView(state: GameState): BridgeView {
  const l = state.bridge?.loan
  return { loan: l ? { owed: l.owed, weekly: l.weekly, weeksLeft: l.weeksLeft, principal: l.principal } : null, offer: bridgeOffer(state), unavailable: bridgeUnavailable(state), danger: distress(state) }
}
void eventCommitments

/** The weekly instalment currently being collected (0 when there is no loan). */
export const loanWeekly = (state: GameState): number => (state.bridge?.loan ? Math.min(state.bridge.loan.weekly, state.bridge.loan.owed) : 0)
