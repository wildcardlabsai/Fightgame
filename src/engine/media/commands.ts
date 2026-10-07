/** Player decisions in the media world. Each returns a new state (never mutating the one passed in) and a plain-language result. */
import type { GameState, Id } from '../types'
import { acceptOffer, declineOffer, releaseDeal } from './broadcast'
import { ensureMedia } from './process'
import { holdPress, respondRequest } from './requests'
import type { PressApproach } from './types'

export interface MediaCommandResult { ok: boolean; message: string; state: GameState }

function run(state: GameState, fn: (s: GameState) => { ok: boolean; message: string }): MediaCommandResult {
  const next = structuredClone(state)
  ensureMedia(next)
  const r = fn(next)
  return r.ok ? { ok: true, message: r.message, state: next } : { ok: false, message: r.message, state }
}

export const respondToMediaRequest = (state: GameState, id: string, answer: 'accept' | 'decline' | 'redirect', alt?: Id): MediaCommandResult =>
  run(state, (s) => respondRequest(s, s.media!, id, answer, alt))
export const holdPressConference = (state: GameState, id: string, approach: PressApproach): MediaCommandResult => run(state, (s) => holdPress(s, s.media!, id, approach))
export const acceptBroadcastOffer = (state: GameState, offerId: string): MediaCommandResult => run(state, (s) => acceptOffer(s, s.media!, offerId))
export const declineBroadcastOffer = (state: GameState, offerId: string): MediaCommandResult => run(state, (s) => declineOffer(s.media!, offerId))
export const releaseBroadcastDeal = (state: GameState, eventId: Id): MediaCommandResult => run(state, (s) => releaseDeal(s, s.media!, eventId))

/** Mark a story as read (it only changes the reader's own bookkeeping). */
export function markStoryRead(state: GameState, id: string): GameState {
  const s = state.media?.stories.find((x) => x.id === id)
  if (!s || s.rd === 1) return state
  const next = structuredClone(state)
  const t = next.media!.stories.find((x) => x.id === id)
  if (t) t.rd = 1
  return next
}
