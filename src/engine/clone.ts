/**
 * Deep copy for game state. GameState is plain JSON by contract (objects, arrays, strings, numbers, booleans, null — no Dates, Maps,
 * classes or functions), so a hand-written recursive copy is exact and about three times faster than `structuredClone`, which
 * matters because the weekly tick copies the whole world once.
 */
export function cloneState<T>(v: T): T {
  return copy(v) as T
}

function copy(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v
  if (Array.isArray(v)) {
    const n = new Array(v.length)
    for (let i = 0; i < v.length; i++) n[i] = copy(v[i])
    return n
  }
  const o: Record<string, unknown> = {}
  for (const k in v as Record<string, unknown>) o[k] = copy((v as Record<string, unknown>)[k])
  return o
}

/**
 * THE WEEKLY COPY (Phase 9). The tick copies the world so the previous state is never mutated, and a deep copy costs time and garbage in proportion to
 * the whole career — which is why a career's weekly cost climbed for its first years. Most of that history is finished: a fight that was settled and
 * processed months ago, a show that has been archived, never changes again except by being deleted (a pruned history simply leaves the map).
 * Those records are SHARED between the old and the new state instead of copied. Everything that can still change is copied exactly as before, so the
 * resulting game is identical (see scripts/audit/phase9-golden.ts and the tests).
 *
 * Rule for code that edits history: never edit a settled fight or archived event in place — replace it (`state.fights[id] = { ...fight, … }`). A test
 * freezes every shared record and replays years of play to prove nothing does.
 */
export const HISTORY_GRACE_DAYS = 120

interface Settled { status?: string; processedDay?: number; result?: { settledDay?: number } }

export function isSettledFight(f: Settled, today: number): boolean {
  return (f.status === 'postFight' || f.status === 'processed') && typeof f.processedDay === 'number' && today - f.processedDay > HISTORY_GRACE_DAYS
}
export function isArchivedEvent(e: Settled, today: number): boolean {
  return e.status === 'archived' && typeof e.result?.settledDay === 'number' && today - e.result.settledDay > HISTORY_GRACE_DAYS
}

function deepFreeze(v: unknown): void {
  if (v === null || typeof v !== 'object' || Object.isFrozen(v)) return
  Object.freeze(v)
  for (const k in v as Record<string, unknown>) deepFreeze((v as Record<string, unknown>)[k])
}

function copySharing(map: Record<string, unknown>, shared: (v: any) => boolean, freeze: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const id in map) {
    const v = map[id]
    if (v && typeof v === 'object' && shared(v)) { if (freeze) deepFreeze(v); out[id] = v } else out[id] = copy(v)
  }
  return out
}

/** Copy for one weekly tick: like `cloneState`, but settled fights and archived events are shared rather than copied. */
export function cloneForTick<T extends { today: number; fights: unknown; events: unknown }>(state: T): T {
  const flags = globalThis as { __PROMOTER_FREEZE_SHARED__?: boolean; __PROMOTER_NO_SHARE__?: boolean }
  if (flags.__PROMOTER_NO_SHARE__) return cloneState(state) // test switch: the reference full copy
  const freeze = !!flags.__PROMOTER_FREEZE_SHARED__
  const today = state.today
  const src = state as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k in src) {
    if (k === 'fights') out[k] = copySharing(src[k] as Record<string, unknown>, (f) => isSettledFight(f, today), freeze)
    else if (k === 'events') out[k] = copySharing(src[k] as Record<string, unknown>, (e) => isArchivedEvent(e, today), freeze)
    else out[k] = copy(src[k])
  }
  return out as T
}
