/**
 * POST-FIGHT DECISIONS. A few results genuinely open a decision for the promoter; most do not, and the engine handles the routine
 * ones itself. Three kinds, each created from an authoritative result and only when its conditions hold:
 *   breakout  a young fighter beat a clearly stronger opponent: fast-track the career, or keep building steadily
 *   setback   a heavy favourite lost, a fighter was stopped, or a third defeat in a row: rebuild (protected, easier fights) or carry on
 *   rematch   a draw or split/majority decision: pursue the rematch (opens the normal fight negotiation) or let it go
 * Choices act through existing systems (development plan, career objective, fight negotiation, fighter morale and relationship) and the
 * choice is recorded in the fighter's decisions. A review lapses after six weeks without penalty. Nothing here grants eligibility.
 */
import { fighterName } from '../fighters'
import { careerStage, streakBefore } from '../fight/context'
import { approachOpponent } from '../fightNegotiation'
import { setPlan } from '../business/plans'
import { postMessage } from '../messages'
import type { Fighter, GameState, Id } from '../types'
import { setGoal } from './goals'
import { nextOfficeId, noteDecision, officeOf, once } from './state'
import { OFFICE_LIMITS, type CareerReview, type ReviewKind } from './types'

const WEEK = 7
export const REVIEW_WEEKS = 6

export const REVIEW_CHOICES: Record<ReviewKind, { key: string; label: string; detail: string }[]> = {
  breakout: [
    { key: 'step', label: 'Fast-track him', detail: 'An accelerated plan: faster growth, harder fights and a higher injury risk. The camp is delighted.' },
    { key: 'build', label: 'Keep building', detail: 'A protected plan: steadier fights while the win sinks in. Slower, safer.' },
  ],
  setback: [
    { key: 'rebuild', label: 'Rebuild him', detail: 'Set the Rebuilding objective: a protected plan and winnable fights until the confidence is back.' },
    { key: 'carry', label: 'Back him to bounce back', detail: 'Change nothing. If he is already shaken, the camp does not like it.' },
  ],
  rematch: [
    { key: 'pursue', label: 'Go for the rematch', detail: 'Opens the normal fight negotiation with the same opponent. Nothing is agreed yet.' },
    { key: 'pass', label: 'Let it go', detail: 'Move on. The result stands.' },
  ],
}

export const reviewsOf = (state: GameState): CareerReview[] => Object.values(state.office?.reviews ?? {})
export const openReviews = (state: GameState): CareerReview[] => reviewsOf(state).filter((r) => r.status === 'open').sort((a, b) => a.createdDay - b.createdDay || (a.id < b.id ? -1 : 1))

const mineSide = (state: GameState, fightId: Id): (0 | 1)[] => {
  const f = state.fights[fightId]
  if (!f) return []
  return ([0, 1] as const).filter((i) => (i === 0 ? f.sideA : f.sideB).promotionId === state.playerPromotionId)
}

/** Called once a result of the player's is processed. Creates at most one review per fighter, and only when its conditions truly hold. */
export function processReviewsFor(state: GameState, fightId: Id): void {
  const fight = state.fights[fightId]
  const r = fight?.result
  if (!fight || !r || !once(state, `rev:${fightId}`)) return
  const o = officeOf(state)
  o.reviews ??= {}
  for (const i of mineSide(state, fightId)) {
    const f = state.fighters[(i === 0 ? fight.sideA : fight.sideB).fighterId]
    const opp = state.fighters[(i === 0 ? fight.sideB : fight.sideA).fighterId]
    const c = f?.contractId ? state.contracts[f.contractId] : null
    if (!f || !opp || !c || c.promotionId !== state.playerPromotionId || f.status !== 'active') continue
    if (openReviews(state).length >= OFFICE_LIMITS.reviewsLive || openReviews(state).some((x) => x.fighterId === f.id)) continue
    const pWin = i === 0 ? r.pExpA : 1 - r.pExpA
    const won = r.winner === i, lost = r.winner === 1 - i
    const total = f.record.wins + f.record.losses + f.record.draws
    let kind: ReviewKind | null = null
    const close = r.winner === null || ['SD', 'MD'].includes(r.method)
    if (won && pWin < 0.4 && total >= 3 && careerStage(f, state.today) !== 'veteran') kind = 'breakout'
    else if (lost && total >= 4 && (pWin >= 0.65 || r.method === 'KO' || r.method === 'TKO' || streakBefore(state, f, fightId).n >= 2 && streakBefore(state, f, fightId).kind === 'loss')) kind = 'setback'
    else if (close && opp.status === 'active' && opp.contractId) kind = 'rematch'
    if (!kind) continue
    const id = nextOfficeId(state, 'rv')
    o.reviews[id] = { id, kind, fighterId: f.id, oppId: opp.id, fightId, createdDay: state.today, expiresDay: state.today + REVIEW_WEEKS * WEEK, status: 'open' }
    postMessage(state, {
      from: 'Matchmaking', category: 'fighter', priority: 'normal', key: `review-${id}`, cooldownWeeks: 4,
      subject: `A decision for ${fighterName(f)}`, body: reviewText(state, o.reviews[id]), link: { kind: 'screen', screen: 'office' },
    })
  }
  trimReviews(state)
}

export function reviewText(state: GameState, rv: CareerReview): string {
  const f = state.fighters[rv.fighterId], opp = state.fighters[rv.oppId]
  if (!f || !opp) return ''
  const n = fighterName(f), on = fighterName(opp)
  switch (rv.kind) {
    case 'breakout': return `${n} beat ${on}, who was the favourite. The win has people talking. Do you push on, or keep building steadily?`
    case 'setback': return `${n} lost to ${on} and the camp is worried about where this leaves him. Rebuild, or back him to bounce back?`
    default: return `${n} and ${on} could not be separated. There is public appetite for a rematch. Pursue it?`
  }
}

function trimReviews(state: GameState): void {
  const o = officeOf(state)
  const closed = Object.values(o.reviews ?? {}).filter((x) => x.status !== 'open').sort((a, b) => (a.closedDay ?? 0) - (b.closedDay ?? 0))
  for (const x of closed) { if (closed.length - 0 <= OFFICE_LIMITS.reviewsKept) break; delete o.reviews![x.id]; closed.splice(closed.indexOf(x), 1) }
}

/** Is this review still a real decision? (Fighters move on; a rematch needs two free, willing, valid fighters.) */
export function reviewStillValid(state: GameState, rv: CareerReview): string | null {
  const f = state.fighters[rv.fighterId]
  const c = f?.contractId ? state.contracts[f.contractId] : null
  if (!f || f.status !== 'active' || !c || c.promotionId !== state.playerPromotionId) return 'He is no longer on your roster.'
  if (rv.kind === 'rematch') {
    const opp = state.fighters[rv.oppId]
    if (!opp || opp.status !== 'active' || !opp.contractId) return 'The opponent is no longer available.'
  }
  return null
}

/** Weekly (cheap): lapse reviews that have run out or stopped being real. */
export function processReviews(state: GameState): void {
  const o = state.office
  if (!o?.reviews) return
  for (const rv of Object.values(o.reviews)) {
    if (rv.status !== 'open') continue
    const gone = reviewStillValid(state, rv)
    if (state.today >= rv.expiresDay || gone) {
      rv.status = 'lapsed'; rv.closedDay = state.today
      // Say so in the fighter's record of decisions: a decision that quietly disappears reads as a bug. (Nothing to record if he has left.)
      const opp = state.fighters[rv.oppId]
      if (gone !== 'He is no longer on your roster.' && opp) noteDecision(state, rv.fighterId, `No decision was made about ${rv.kind === 'rematch' ? 'a rematch with' : rv.kind === 'breakout' ? 'the next step after beating' : 'the next step after losing to'} ${fighterName(opp)}: it lapsed`)
    }
  }
}

/** Answer a review. Pure `(state) => state` is done by the command wrapper; this mutates the clone it is given. */
export function resolveReview(state: GameState, id: Id, choice: string): { ok: boolean; error?: string; fightId?: Id } {
  let rv = state.office?.reviews?.[id]
  if (!rv || rv.status !== 'open') return { ok: false, error: 'That decision has already been made or has passed.' }
  const why = reviewStillValid(state, rv)
  if (why) return { ok: false, error: why }
  const opts = REVIEW_CHOICES[rv.kind]
  if (!opts.some((x) => x.key === choice)) return { ok: false, error: 'Choose one of the options.' }
  const f: Fighter = state.fighters[rv.fighterId]
  const opp = state.fighters[rv.oppId]
  const me = state.playerPromotionId
  const rel = (d: number) => { f.promoRelations[me] = Math.max(-100, Math.min(100, (f.promoRelations[me] ?? 0) + d)) }
  let fightId: Id | undefined
  if (rv.kind === 'breakout') {
    if (choice === 'step') { setPlan(state, f.id, 'accelerated'); f.morale = Math.min(100, f.morale + 3); rel(1.5); noteDecision(state, f.id, `Fast-tracked after beating ${fighterName(opp)}`) }
    else { setPlan(state, f.id, 'protected'); f.morale = Math.min(100, f.morale + 1); noteDecision(state, f.id, `Kept building after beating ${fighterName(opp)}`) }
  } else if (rv.kind === 'setback') {
    if (choice === 'rebuild') { const r = setGoal(state, f.id, 'rebuild'); if (!r.ok) return r; f.morale = Math.min(100, f.morale + 3); rel(1.5); noteDecision(state, f.id, `Chose to rebuild after losing to ${fighterName(opp)}`) }
    else { if (f.momentum <= -35) { rel(-2); f.morale = Math.max(1, f.morale - 1) } noteDecision(state, f.id, `Backed to bounce back after losing to ${fighterName(opp)}`) }
  } else if (choice === 'pursue') {
    const r = approachOpponent(state, f.id, opp.id)
    if (!r.ok) return { ok: false, error: r.needsOverride ? 'The camp objects to this fight under the current plan: use Matchmaking to override it, or choose another path.' : r.error }
    Object.assign(state, r.state)
    fightId = r.fightId
    rv = state.office!.reviews![id]
    noteDecision(state, f.id, `Opened talks for a rematch with ${fighterName(opp)}`)
  } else noteDecision(state, f.id, `Let the rematch with ${fighterName(opp)} go`)
  rv.status = 'resolved'; rv.choice = choice; rv.closedDay = state.today
  return { ok: true, fightId }
}
