/**
 * PACKED RECORDS. The game state is deep-cloned every week, and the clone cost is per object. Bulk records that are written
 * rarely and read in whole (ranking lists, career lines, history, reigns, awards, finished storylines) are kept as JSON strings
 * and decoded on demand through a small cache, so the media world adds a handful of strings to the clone, not thousands of objects.
 * `unpack` results are SHARED and must be treated as read-only; use `edit` to change one.
 */
const cache = new Map<string, unknown>()

export function unpack<T>(s: string | undefined, empty: T): T {
  if (!s) return empty
  let v = cache.get(s)
  if (v === undefined) {
    v = JSON.parse(s)
    if (cache.size > 500) cache.clear()
    cache.set(s, v)
  }
  return v as T
}

/** Change a packed value: decode a private copy, let `fn` mutate it, return the new string. */
export function edit<T>(s: string | undefined, empty: T, fn: (v: T) => void): string {
  const copy: T = s ? JSON.parse(s) : empty
  fn(copy)
  return pack(copy)
}

export function pack<T>(v: T): string {
  const s = JSON.stringify(v)
  if (cache.size > 500) cache.clear()
  cache.set(s, v)
  return s
}
