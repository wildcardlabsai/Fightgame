import { submitOffer, walkAway as walkAwayState, type NegotiationOutcome } from './negotiation'
import { releaseFromPlayer } from './roster'
import { approachOpponent, submitFightOffer, withdrawFight } from './fightNegotiation'
import { fightInvolvesPlayer, resolveFight } from './fights'
import * as ev from './events/events'
import { processMedia } from './media/process'
import { orderReport, orderSearch, toggleShortlist as toggleShortlistState, type SearchSpec } from './scouting'
import { financialHealth, playerRoster } from './selectors'
import { openContractTalk, talkMove, type ContractMove, type TalkOutcome } from './business/contractTalks'
import { fightMove, openFightTalk, type FightMove, type FightTalkOutcome } from './business/fightTalks'
import { setPlan } from './business/plans'
import { applyDivisionMove, campAgrees } from './business/divisions'
import type { DevPlan } from './business/types'
import type { GameState, Id, NegotiationKind, Offer, ScoutDepth } from './types'

export interface CommandResult {
  ok: boolean
  error?: string
  state: GameState
}

/**
 * Player actions. Each command validates against game rules and returns a new
 * state (or the same state if the action is not allowed). UI never edits state directly.
 */

export function markMessageRead(state: GameState, messageId: Id, read = true): GameState {
  const msg = state.inbox.find((m) => m.id === messageId)
  if (!msg || msg.read === read) return state
  const next = structuredClone(state)
  next.inbox.find((m) => m.id === messageId)!.read = read
  return next
}

export function markAllRead(state: GameState): GameState {
  if (state.inbox.every((m) => m.read)) return state
  const next = structuredClone(state)
  for (const m of next.inbox) m.read = true
  return next
}

export function deleteMessage(state: GameState, messageId: Id): GameState {
  const next = structuredClone(state)
  next.inbox = next.inbox.filter((m) => m.id !== messageId)
  return next
}

export function setAutosave(state: GameState, autosave: boolean): GameState {
  const next = structuredClone(state)
  next.settings.autosave = autosave
  return next
}

// ---------------------------------------------------------------- Phase 2

export function commissionReport(state: GameState, fighterId: Id, depth: ScoutDepth, scoutId: Id): CommandResult {
  if (financialHealth(state).state === 'insolvent') return { ok: false, error: 'You are insolvent: new spending is blocked.', state }
  return orderReport(state, fighterId, depth, scoutId)
}

export function commissionSearch(state: GameState, spec: SearchSpec, scoutId: Id): CommandResult {
  if (financialHealth(state).state === 'insolvent') return { ok: false, error: 'You are insolvent: new spending is blocked.', state }
  return orderSearch(state, spec, scoutId)
}

export function toggleShortlist(state: GameState, fighterId: Id): GameState {
  return toggleShortlistState(state, fighterId)
}

export function makeOffer(state: GameState, fighterId: Id, offer: Offer, kind: NegotiationKind): NegotiationOutcome {
  return submitOffer(state, fighterId, offer, kind)
}

export function endNegotiation(state: GameState, fighterId: Id): GameState {
  return walkAwayState(state, fighterId)
}

export function releaseFighter(state: GameState, fighterId: Id): CommandResult {
  const next = structuredClone(state)
  const r = releaseFromPlayer(next, fighterId)
  return r.ok ? { ok: true, state: next } : { ok: false, error: r.error, state }
}

// ---------------------------------------------------------------- Phase 3

export const approach = approachOpponent
export { requestTitleFight } from './business/titlePath'
export const offerFight = submitFightOffer
export const withdraw = withdrawFight
export const schedule = ev.scheduleFightQuick

/** Ring the bell on one of your fights. The result is deterministic for this fight and this game state. */
export function runFightNight(state: GameState, fightId: Id): CommandResult {
  const f = state.fights[fightId]
  if (!f || f.status !== 'fightNight') return { ok: false, error: 'This fight is not ready for fight night.', state }
  if (!fightInvolvesPlayer(state, f)) return { ok: false, error: 'That is not your fight.', state }
  if (f.eventId) {
    // A fight on a card is run by its show: everything up to and including this fight, in card order.
    const next = structuredClone(state)
    const e = next.events[f.eventId]
    if (!e || !['fightWeek', 'live'].includes(e.status)) return { ok: false, error: 'The show has not reached fight night yet.', state }
    let guard = 0
    while (next.fights[fightId].status === 'fightNight' && guard++ < 20) { if (!ev.runNextFightInternal(next, e)) break }
    processMedia(next)
    return { ok: true, state: next }
  }
  const next = structuredClone(state)
  resolveFight(next, next.fights[fightId])
  processMedia(next)
  return { ok: true, state: next }
}

// ---------------------------------------------------------------- Phase 4: events

export const createEvent: typeof ev.createEvent = (state, spec) => {
  if (financialHealth(state).state === 'insolvent') return { ok: false, error: 'You are insolvent: you cannot book a venue until cash recovers.', state }
  return ev.createEvent(state, spec)
}
export const addFightToEvent = ev.addFight
export const removeFightFromEvent = ev.removeFight
export const moveFightOnCard = ev.moveFight
export const setCardSlot = ev.setSlot
export const setEventPrices = ev.setPrices
export const setEventMarketing = ev.setMarketing
export const setEventBroadcast = ev.setBroadcast
export const refreshEventSponsors = ev.refreshSponsors
export const chooseSponsor = ev.acceptSponsor
export { acceptSponsorOffer, declineSponsorOffer, negotiateSponsorOffer } from './sponsors'
export { ackTierNotice } from './tierProgress'
export const putEventOnSale = ev.putOnSale
/** Results are reported straight away: the media world reads each fight and show the moment it is on the books. */
const withMedia = <R extends { ok: boolean; state: GameState }>(r: R): R => { if (r.ok && r.state.media) processMedia(r.state); return r }
export const runNextEventFight: typeof ev.runNextFight = (state, id) => withMedia(ev.runNextFight(state, id))
export const quickSimEvent: typeof ev.quickSimRemaining = (state, id) => withMedia(ev.quickSimRemaining(state, id))
export const cancelEvent = ev.cancelEventCommand
export function runEventToEnd(state: GameState, eventId: Id): ev.EvResult {
  const e = state.events[eventId]
  if (!e || !['fightWeek', 'live'].includes(e.status)) return { ok: false, error: 'This event is not ready to run.', state }
  const next = structuredClone(state)
  ev.runWholeEvent(next, next.events[eventId])
  processMedia(next)
  return { ok: true, state: next, eventId }
}

// ---------------------------------------------------------------- Phase 5.4: conversations and plans

export const startContractTalk = (state: GameState, fighterId: Id, kind: NegotiationKind): TalkOutcome => openContractTalk(state, fighterId, kind)
export const contractMove = (state: GameState, talkId: string, move: ContractMove): TalkOutcome => talkMove(state, talkId, move)
export const startFightTalk = (state: GameState, fightId: Id): FightTalkOutcome => openFightTalk(state, fightId)
export const fightTalkMove = (state: GameState, talkId: string, move: FightMove): FightTalkOutcome => fightMove(state, talkId, move)

/** Set a rostered fighter’s development plan outside a negotiation. */
export function choosePlan(state: GameState, fighterId: Id, plan: DevPlan): CommandResult {
  if (!playerRoster(state).some((f) => f.id === fighterId)) return { ok: false, error: 'That fighter is not on your roster.', state }
  const next = structuredClone(state)
  setPlan(next, fighterId, plan)
  return { ok: true, state: next }
}

/** Move a rostered fighter to the next division up or down (the camp must agree; belts at the old weight are relinquished). */
export function changeDivision(state: GameState, fighterId: Id, to: import('./types').WeightClassId): CommandResult {
  const f = state.fighters[fighterId]
  if (!f || !playerRoster(state).some((x) => x.id === fighterId)) return { ok: false, error: 'That fighter is not on your roster.', state }
  const refuse = campAgrees(state, f)
  if (refuse) return { ok: false, error: refuse, state }
  const next = structuredClone(state)
  const err = applyDivisionMove(next, fighterId, to)
  if (err) return { ok: false, error: err, state }
  if (next.media) processMedia(next)
  return { ok: true, state: next }
}
