import { submitOffer, walkAway as walkAwayState, type NegotiationOutcome } from './negotiation'
import { releaseFromPlayer } from './roster'
import { approachOpponent, submitFightOffer, withdrawFight } from './fightNegotiation'
import { fightInvolvesPlayer, resolveFight, setPrep } from './fights'
import * as ev from './events/events'
import { orderReport, orderSearch, toggleShortlist as toggleShortlistState, type SearchSpec } from './scouting'
import { financialHealth, playerRoster } from './selectors'
import type { GameState, Id, NegotiationKind, Offer, ScoutDepth, TrainingFocus } from './types'

export interface CommandResult {
  ok: boolean
  error?: string
  state: GameState
}

/**
 * Player actions. Each command validates against game rules and returns a new
 * state (or the same state if the action is not allowed). UI never edits state directly.
 */

export function setTrainingFocus(state: GameState, fighterId: Id, focus: TrainingFocus): GameState {
  if (!playerRoster(state).some((f) => f.id === fighterId)) return state
  if (state.fighters[fighterId].trainingFocus === focus) return state
  const next = structuredClone(state)
  next.fighters[fighterId].trainingFocus = focus
  return next
}

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
export const offerFight = submitFightOffer
export const withdraw = withdrawFight
export const schedule = ev.scheduleFightQuick
export const prepare = setPrep

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
    return { ok: true, state: next }
  }
  const next = structuredClone(state)
  resolveFight(next, next.fights[fightId])
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
export const putEventOnSale = ev.putOnSale
export const runNextEventFight = ev.runNextFight
export const quickSimEvent = ev.quickSimRemaining
export const cancelEvent = ev.cancelEventCommand
export function runEventToEnd(state: GameState, eventId: Id): ev.EvResult {
  const e = state.events[eventId]
  if (!e || !['fightWeek', 'live'].includes(e.status)) return { ok: false, error: 'This event is not ready to run.', state }
  const next = structuredClone(state)
  ev.runWholeEvent(next, next.events[eventId])
  return { ok: true, state: next, eventId }
}
