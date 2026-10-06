/**
 * ASYNC PERSISTENCE. Saves live in IndexedDB (versioned schema, gzip-compressed JSON, separate metadata so the
 * save list is cheap to read). If IndexedDB is unavailable the vault falls back to localStorage, then memory.
 * Legacy localStorage saves from earlier builds are migrated on first start. The sync `SaveStorage` API in save.ts
 * stays for tests and tooling.
 */
import { deserialiseGame, listSaves as listLegacy, loadGame as loadLegacy, serialiseGame, type SaveMeta, type SaveStorage } from './save'
import type { GameState } from './types'

export interface SlotMeta extends SaveMeta {
  slot: 'manual' | 'auto'
  bytes: number
  compressed: boolean
  /** Game id this slot belongs to (a slot can be loaded and continued independently). */
  gameId: string
}

export interface VaultBackend {
  readonly kind: 'indexeddb' | 'localstorage' | 'memory'
  list(): Promise<SlotMeta[]>
  put(meta: SlotMeta, payload: Uint8Array | string): Promise<void>
  get(id: string): Promise<{ meta: SlotMeta; payload: Uint8Array | string } | null>
  remove(id: string): Promise<void>
}

// ---------------------------------------------------------------- compression

const hasStreams = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined' && typeof Response !== 'undefined'

export async function gzip(text: string): Promise<Uint8Array | null> {
  if (!hasStreams()) return null
  try {
    const cs = new CompressionStream('gzip')
    const w = cs.writable.getWriter()
    void w.write(new TextEncoder().encode(text)); void w.close()
    return new Uint8Array(await new Response(cs.readable).arrayBuffer())
  } catch { return null }
}

export async function gunzip(data: Uint8Array): Promise<string> {
  const ds = new DecompressionStream('gzip')
  const w = ds.writable.getWriter()
  void w.write(data as unknown as BufferSource); void w.close()
  return new TextDecoder().decode(await new Response(ds.readable).arrayBuffer())
}

const isGzip = (p: Uint8Array | string): p is Uint8Array => typeof p !== 'string' && p.length > 2 && p[0] === 0x1f && p[1] === 0x8b

// ------------------------------------------------------------------- backends

export function memoryBackend(): VaultBackend {
  const metas = new Map<string, SlotMeta>(), data = new Map<string, Uint8Array | string>()
  return {
    kind: 'memory',
    async list() { return [...metas.values()] },
    async put(m, p) { metas.set(m.id, m); data.set(m.id, p) },
    async get(id) { const m = metas.get(id), p = data.get(id); return m && p !== undefined ? { meta: m, payload: p } : null },
    async remove(id) { metas.delete(id); data.delete(id) },
  }
}

const LS_META = 'fightempire:vault:meta'
const lsKey = (id: string) => `fightempire:vault:${id}`

export function localStorageBackend(ls: Storage): VaultBackend {
  const readMetas = (): SlotMeta[] => { try { return JSON.parse(ls.getItem(LS_META) ?? '[]') } catch { return [] } }
  return {
    kind: 'localstorage',
    async list() { return readMetas() },
    async put(m, p) {
      if (typeof p !== 'string') throw new Error('localStorage backend stores text only')
      ls.setItem(lsKey(m.id), p)
      ls.setItem(LS_META, JSON.stringify([m, ...readMetas().filter((x) => x.id !== m.id)]))
    },
    async get(id) { const m = readMetas().find((x) => x.id === id), p = ls.getItem(lsKey(id)); return m && p !== null ? { meta: m, payload: p } : null },
    async remove(id) { ls.removeItem(lsKey(id)); ls.setItem(LS_META, JSON.stringify(readMetas().filter((x) => x.id !== id))) },
  }
}

/** Bump DB_VERSION and add a case to `upgrade` when the object-store layout changes. */
export const DB_NAME = 'fightempire'
export const DB_VERSION = 1

function upgrade(db: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1) {
    db.createObjectStore('meta', { keyPath: 'id' })
    db.createObjectStore('data')
  }
}

const req = <T,>(r: IDBRequest<T>): Promise<T> => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
const done = (tx: IDBTransaction): Promise<void> => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error ?? new Error('transaction aborted')) })

export function idbBackend(factory: IDBFactory = indexedDB, name = DB_NAME): Promise<VaultBackend> {
  return new Promise((resolve, reject) => {
    const open = factory.open(name, DB_VERSION)
    open.onupgradeneeded = (e) => upgrade(open.result, e.oldVersion)
    open.onerror = () => reject(open.error)
    open.onblocked = () => reject(new Error('IndexedDB blocked'))
    open.onsuccess = () => {
      const db = open.result
      resolve({
        kind: 'indexeddb',
        async list() { return (await req(db.transaction('meta').objectStore('meta').getAll())) as SlotMeta[] },
        async put(m, p) {
          const tx = db.transaction(['meta', 'data'], 'readwrite')
          tx.objectStore('data').put(p, m.id)
          tx.objectStore('meta').put(m)
          await done(tx)
        },
        async get(id) {
          const tx = db.transaction(['meta', 'data'])
          const [m, p] = await Promise.all([req(tx.objectStore('meta').get(id)), req(tx.objectStore('data').get(id))])
          return m && p !== undefined ? { meta: m as SlotMeta, payload: p as Uint8Array | string } : null
        },
        async remove(id) {
          const tx = db.transaction(['meta', 'data'], 'readwrite')
          tx.objectStore('meta').delete(id); tx.objectStore('data').delete(id)
          await done(tx)
        },
      })
    }
  })
}

export async function openBestBackend(): Promise<VaultBackend> {
  try {
    if (typeof indexedDB !== 'undefined') return await idbBackend()
  } catch { /* fall through */ }
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('fightempire:probe', '1'); window.localStorage.removeItem('fightempire:probe')
      return localStorageBackend(window.localStorage)
    }
  } catch { /* fall through */ }
  return memoryBackend()
}

// ---------------------------------------------------------------------- vault

export interface SaveOptions { slotId?: string; name?: string; auto?: boolean }

export class SaveVault {
  constructor(readonly backend: VaultBackend) {}

  async list(): Promise<SlotMeta[]> {
    try { return (await this.backend.list()).sort((a, b) => b.savedAt - a.savedAt) } catch { return [] }
  }

  async save(state: GameState, opts: SaveOptions = {}): Promise<SlotMeta> {
    const p = state.promotions[state.playerPromotionId]
    const id = opts.slotId ?? (opts.auto ? `${state.saveId}~auto` : state.saveId)
    const existing = (await this.list()).find((m) => m.id === id)
    const json = serialiseGame(state)
    // IndexedDB keeps bytes; the text-only fallbacks keep readable JSON.
    const packed = this.backend.kind === 'indexeddb' ? await gzip(json) : null
    const payload: Uint8Array | string = packed ?? json
    const meta: SlotMeta = {
      id, gameId: state.saveId, name: opts.name ?? existing?.name ?? (opts.auto ? `${p.name} (autosave)` : p.name), promotionName: p.name, today: state.today,
      savedAt: Date.now(), version: state.version, slot: opts.auto ? 'auto' : 'manual', bytes: typeof payload === 'string' ? payload.length : payload.length, compressed: !!packed,
    }
    await this.backend.put(meta, payload)
    return meta
  }

  async load(id: string): Promise<GameState | null> {
    try {
      const rec = await this.backend.get(id)
      if (!rec) return null
      const text = isGzip(rec.payload) ? await gunzip(rec.payload) : typeof rec.payload === 'string' ? rec.payload : new TextDecoder().decode(rec.payload)
      return deserialiseGame(text)
    } catch { return null }
  }

  async remove(id: string): Promise<void> { await this.backend.remove(id) }

  /** One-time move of saves written by earlier builds (localStorage) into the vault. Returns how many were moved. */
  async migrateLegacy(legacy: SaveStorage): Promise<number> {
    if (this.backend.kind === 'localstorage') return 0
    let moved = 0
    for (const m of listLegacy(legacy)) {
      if ((await this.list()).some((x) => x.id === m.id)) continue
      const g = loadLegacy(legacy, m.id)
      if (!g) continue
      const meta = await this.save(g, { name: m.name })
      if (meta) { moved++; try { legacy.removeItem(`fightempire:save:${m.id}`) } catch { /* ignore */ } }
    }
    if (moved) {
      try { legacy.setItem('fightempire:saves', JSON.stringify(listLegacy(legacy).filter((m) => legacy.getItem(`fightempire:save:${m.id}`) !== null))) } catch { /* ignore */ }
    }
    return moved
  }
}
