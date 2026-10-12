/** Small, safe browser-storage wrapper for per-device UI conveniences (column choices, saved table views). Never holds career state. Every call is guarded. */
const store = (): Storage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null } }
export function loadJson<T>(key: string, fallback: T): T {
  try { const raw = store()?.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback } catch { return fallback }
}
export function saveJson(key: string, value: unknown): void { try { store()?.setItem(key, JSON.stringify(value)) } catch { /* private mode or full: the convenience is simply not remembered */ } }
