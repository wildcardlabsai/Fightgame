/* eslint-disable @typescript-eslint/no-explicit-any */
import { clamp, fighterRating, hiddenBase, PERSONALITY_LINES } from './fighters'
import { keyedNormal } from './rng'
import { createStartingScout } from './scouting'
import { GAME_STATE_VERSION, type AiStrategy, type GameState } from './types'
import { initKnowledge } from './worldgen'

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
  if (s.version < 2) migrateV1toV2(s as never)
  return s as GameState
}

const V1_STRATEGY: Record<string, AiStrategy> = {
  'Apex Fight Group': 'money', 'Redline Promotions': 'traditional', 'Golden State Prizefights': 'prospectFactory',
  'Steel City Boxing': 'regional', 'Lone Star Fight Night': 'regional', 'Northern Lights Boxing': 'prospectFactory',
}

/** v1 (Phase 1) → v2 (Phase 2): hidden traits, history, rich contracts, AI profiles, player knowledge. */
function migrateV1toV2(s: any): void {
  const lines = Object.values(PERSONALITY_LINES)
  for (const f of Object.values<any>(s.fighters)) {
    f.personalityNote = PERSONALITY_LINES[f.personality as keyof typeof PERSONALITY_LINES] ?? ''
    for (const line of lines) if (typeof f.bio === 'string' && f.bio.endsWith(' ' + line)) f.bio = f.bio.slice(0, -(line.length + 1))
    const rating = fighterRating(f)
    f.discipline = clamp(Math.round(hiddenBase(f.personality, 'discipline', rating) + keyedNormal(s.seed, 'mig-d', f.id) * 8), 5, 98)
    f.composure = clamp(Math.round(hiddenBase(f.personality, 'composure', rating) + keyedNormal(s.seed, 'mig-c', f.id) * 8), 5, 98)
    f.injuryRisk = clamp(Math.round(40 + keyedNormal(s.seed, 'mig-i', f.id) * 12), 3, 95)
    f.availableSince = f.contractId ? null : s.today
    f.promoRelations = {}
    f.history = []
  }
  for (const c of Object.values<any>(s.contracts)) {
    c.basePurse = c.minPurse ?? 0
    delete c.minPurse
    c.winBonus = Math.round((c.basePurse * 0.1) / 100) * 100
    c.titleBonus = 0
    c.ppvShare = 0
    c.signingBonus = 0
    c.minFightsPerYear = 2
    c.releaseFee = null
    c.titlePromise = false
    c.status = 'active'
    c.notices = { approaching: !!c.warned12, window: !!c.warned12, expiring: !!c.warned4 }
    c.aiReviewed = false
    delete c.warned12
    delete c.warned4
    const f = s.fighters[c.fighterId]
    if (f) f.history.push({ day: c.startDay, kind: 'signed', promotionId: c.promotionId })
  }
  for (const p of Object.values<any>(s.promotions)) {
    p.ai = p.isPlayer ? null : { strategy: V1_STRATEGY[p.name] ?? 'traditional', urgency: 0, cooldownUntil: s.today }
  }
  s.contractHistory = []
  s.negotiations = {}
  s.obligations = []
  s.knowledge = {}
  s.scoutOps = []
  s.shortlist = []
  s.ledgerArchive = 0
  s.scouts = []
  const home = s.promotions[s.playerPromotionId].homeCountry
  s.scouts.push(createStartingScout(s, home))
  initKnowledge(s)
  s.version = 2
}
