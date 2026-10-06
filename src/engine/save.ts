import { GAME_STATE_VERSION, type GameState } from './types'

/**
 * Persistence layer. The engine only depends on the `SaveStorage` interface so
 * the browser can use localStorage today and a server/IndexedDB tomorrow.
 */
export interface SaveMeta {
  id: string
  name: string
  promotionName: string
  today: number
  savedAt: number
  version: number
}

export interface SaveStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const INDEX_KEY = 'fightempire:saves'
const slotKey = (id: string) => `fightempire:save:${id}`

export function memoryStorage(): SaveStorage {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  }
}

export function browserStorage(): SaveStorage {
  try {
    const s = window.localStorage
    s.setItem('fightempire:probe', '1')
    s.removeItem('fightempire:probe')
    return s
  } catch {
    return memoryStorage()
  }
}

export function listSaves(storage: SaveStorage): SaveMeta[] {
  try {
    const raw = storage.getItem(INDEX_KEY)
    const list = raw ? (JSON.parse(raw) as SaveMeta[]) : []
    return list.sort((a, b) => b.savedAt - a.savedAt)
  } catch {
    return []
  }
}

function writeIndex(storage: SaveStorage, list: SaveMeta[]): void {
  storage.setItem(INDEX_KEY, JSON.stringify(list))
}

export function saveGame(storage: SaveStorage, state: GameState, name?: string): SaveMeta {
  const list = listSaves(storage)
  const existing = list.find((m) => m.id === state.saveId)
  const p = state.promotions[state.playerPromotionId]
  const meta: SaveMeta = {
    id: state.saveId,
    name: name ?? existing?.name ?? p.name,
    promotionName: p.name,
    today: state.today,
    savedAt: Date.now(),
    version: state.version,
  }
  storage.setItem(slotKey(state.saveId), JSON.stringify(state))
  writeIndex(storage, [meta, ...list.filter((m) => m.id !== meta.id)])
  return meta
}

export function loadGame(storage: SaveStorage, id: string): GameState | null {
  const raw = storage.getItem(slotKey(id))
  if (!raw) return null
  return deserialiseGame(raw)
}

export function deleteSave(storage: SaveStorage, id: string): void {
  storage.removeItem(slotKey(id))
  writeIndex(storage, listSaves(storage).filter((m) => m.id !== id))
}

export function serialiseGame(state: GameState): string {
  return JSON.stringify(state)
}

export function deserialiseGame(raw: string): GameState | null {
  try {
    return migrate(JSON.parse(raw))
  } catch {
    return null
  }
}

/** Upgrade older saves to the current shape. Add a step here whenever GAME_STATE_VERSION is bumped. */
export function migrate(data: unknown): GameState | null {
  if (!data || typeof data !== 'object') return null
  const s = data as Partial<GameState> & { version?: number }
  if (typeof s.version !== 'number' || !s.promotions || !s.fighters) return null
  if (s.version > GAME_STATE_VERSION) return null // saved by a newer build
  // v1 is current; future migrations: if (s.version < 2) { ...; s.version = 2 }
  return s as GameState
}
