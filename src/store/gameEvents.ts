/**
 * Tiny typed event bus for "meaningful things that happened" (a contract was signed, a show finished, a warning appeared).
 * The store and a few components emit; the audio bindings listen. Nothing here touches game state, and emitting is
 * a no-op when nobody listens — so game logic never depends on audio.
 */
export type GameEvent =
  | { type: 'notice'; tone: 'good' | 'bad' | 'neutral' }
  | { type: 'save' }
  | { type: 'contract.accepted' }
  | { type: 'contract.rejected' }
  | { type: 'fight.scheduled' }
  | { type: 'event.intro'; eventId: string }
  | { type: 'event.started'; eventId: string }
  | { type: 'event.mainEvent'; eventId: string }
  | { type: 'event.completed'; eventId: string }
  /** `presented`: the live fight screen will play the fight's cues in step with what is shown, so this event adds none. */
  | { type: 'fight.result'; fightId: string; method: string; knockdowns: number; presented?: boolean }
  | { type: 'fight.round'; fightId: string; round: number }
  | { type: 'fight.knockdown'; fightId: string; round: number }
  | { type: 'fight.finish'; fightId: string; ko: boolean }
  | { type: 'modal.open' }
  | { type: 'modal.close' }
  | { type: 'advice'; id: string; level: 'info' | 'tip' | 'caution' | 'highRisk' | 'critical' }

type Listener = (e: GameEvent) => void
const listeners = new Set<Listener>()

export function emitGameEvent(e: GameEvent): void {
  for (const l of listeners) { try { l(e) } catch { /* a listener must never break the game */ } }
}
export function onGameEvent(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
