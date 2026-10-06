import { playerRoster } from './selectors'
import type { GameState, Id, TrainingFocus } from './types'

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
