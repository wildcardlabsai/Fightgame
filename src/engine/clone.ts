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
