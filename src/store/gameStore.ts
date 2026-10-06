import { create } from 'zustand'
import * as commands from '../engine/commands'
import {
  browserStorage, deleteSave as deleteSaveSlot, deserialiseGame, listSaves, loadGame, saveGame,
  serialiseGame, type SaveMeta,
} from '../engine/save'
import { advanceWeeks } from '../engine/tick'
import type { GameState, Id, NegotiationKind, Offer, ScoutDepth, TrainingFocus } from '../engine/types'
import type { SearchSpec } from '../engine/scouting'
import { createNewGame, type NewGameOptions } from '../engine/worldgen'

export type ScreenId =
  | 'dashboard' | 'fighters' | 'fighter' | 'calendar' | 'inbox' | 'finances' | 'promotions'
  | 'venues' | 'settings' | 'scouting' | 'contracts' | 'negotiation'

export interface Route {
  screen: ScreenId
  param?: string
}

const SCREENS: ScreenId[] = ['dashboard', 'fighters', 'fighter', 'calendar', 'inbox', 'finances', 'promotions', 'venues', 'settings', 'scouting', 'contracts', 'negotiation']

export function parseHash(hash: string): Route {
  const [, screen, param, extra] = hash.replace(/^#/, '').split('/')
  return SCREENS.includes(screen as ScreenId) ? { screen: screen as ScreenId, param: extra ? `${param}/${extra}` : param } : { screen: 'dashboard' }
}

export function routeToHash(r: Route): string {
  return `#/${r.screen}${r.param ? `/${r.param}` : ''}`
}

export interface Notice {
  id: number
  text: string
  tone: 'good' | 'bad' | 'neutral'
}

interface GameStore {
  game: GameState | null
  route: Route
  saves: SaveMeta[]
  notices: Notice[]
  /** Briefly true after advancing time (drives the UI transition). */
  simulating: boolean

  navigate: (screen: ScreenId, param?: string) => void
  syncRouteFromHash: () => void
  refreshSaves: () => void
  startNewGame: (o: NewGameOptions) => void
  loadSaved: (id: string) => boolean
  saveNow: () => void
  removeSave: (id: string) => void
  quitToMenu: () => void
  advance: (weeks: number) => void
  setTraining: (fighterId: Id, focus: TrainingFocus) => void
  orderReport: (fighterId: Id, depth: ScoutDepth, scoutId: Id) => boolean
  orderSearch: (spec: SearchSpec, scoutId: Id) => boolean
  toggleShortlist: (fighterId: Id) => void
  /** Returns the verdict so the UI can react (e.g. navigate after a signing). */
  makeOffer: (fighterId: Id, offer: Offer, kind: NegotiationKind) => 'accept' | 'counter' | 'reject' | 'error'
  walkAway: (fighterId: Id) => void
  release: (fighterId: Id) => boolean
  /** Opens a link produced by the engine (fighter profile or screen). */
  openLink: (link: { kind: 'fighter'; id: string } | { kind: 'screen'; screen: string }) => void
  readMessage: (id: Id, read?: boolean) => void
  readAll: () => void
  removeMessage: (id: Id) => void
  setAutosave: (v: boolean) => void
  exportGame: () => string | null
  importGame: (json: string) => boolean
  notify: (text: string, tone?: Notice['tone']) => void
  dismissNotice: (id: number) => void
}

const storage = browserStorage()
let noticeSeq = 0

function currentHashRoute(): Route {
  return typeof window === 'undefined' ? { screen: 'dashboard' } : parseHash(window.location.hash)
}

export const useGame = create<GameStore>((set, get) => {
  const update = (fn: (g: GameState) => GameState) => {
    const g = get().game
    if (!g) return
    const next = fn(g)
    if (next !== g) set({ game: next })
  }

  return {
    game: null,
    route: currentHashRoute(),
    saves: listSaves(storage),
    notices: [],
    simulating: false,

    navigate: (screen, param) => {
      const route = { screen, param }
      if (typeof window !== 'undefined') window.location.hash = routeToHash(route)
      set({ route })
    },
    syncRouteFromHash: () => set({ route: currentHashRoute() }),
    refreshSaves: () => set({ saves: listSaves(storage) }),

    startNewGame: (o) => {
      const game = createNewGame(o)
      saveGame(storage, game)
      set({ game, saves: listSaves(storage), route: { screen: 'dashboard' } })
      if (typeof window !== 'undefined') window.location.hash = '#/dashboard'
    },

    loadSaved: (id) => {
      const game = loadGame(storage, id)
      if (!game) {
        get().notify('That save could not be loaded — it may be corrupt or from a newer version.', 'bad')
        return false
      }
      set({ game, route: { screen: 'dashboard' } })
      if (typeof window !== 'undefined') window.location.hash = '#/dashboard'
      return true
    },

    saveNow: () => {
      const g = get().game
      if (!g) return
      try {
        saveGame(storage, g)
        set({ saves: listSaves(storage) })
        get().notify('Game saved.', 'good')
      } catch {
        get().notify('Save failed — browser storage may be full. Try exporting the save file.', 'bad')
      }
    },

    removeSave: (id) => {
      deleteSaveSlot(storage, id)
      set({ saves: listSaves(storage) })
    },

    quitToMenu: () => {
      const g = get().game
      if (g) {
        try { saveGame(storage, g) } catch { /* surfaced via manual save */ }
      }
      set({ game: null, saves: listSaves(storage) })
    },

    advance: (weeks) => {
      const g = get().game
      if (!g) return
      const before = g.inbox.length
      const result = advanceWeeks(g, weeks)
      set({ game: result.state, simulating: true })
      setTimeout(() => set({ simulating: false }), 450)
      if (result.state.settings.autosave) {
        try { saveGame(storage, result.state); set({ saves: listSaves(storage) }) } catch { /* ignore */ }
      }
      const newMail = result.state.inbox.length - before
      if (result.interrupted) {
        get().notify(`Stopped after ${result.weeksAdvanced} week${result.weeksAdvanced === 1 ? '' : 's'} — something urgent needs you.`, 'bad')
      } else if (newMail > 0) {
        get().notify(`${newMail} new message${newMail === 1 ? '' : 's'}.`, 'neutral')
      }
    },

    setTraining: (fighterId, focus) => update((g) => commands.setTrainingFocus(g, fighterId, focus)),

    orderReport: (fighterId, depth, scoutId) => {
      const g = get().game
      if (!g) return false
      const r = commands.commissionReport(g, fighterId, depth, scoutId)
      if (!r.ok) { get().notify(r.error ?? 'Could not order that report.', 'bad'); return false }
      set({ game: r.state })
      get().notify('Scout dispatched. The report will land in your inbox.', 'good')
      return true
    },
    orderSearch: (spec, scoutId) => {
      const g = get().game
      if (!g) return false
      const r = commands.commissionSearch(g, spec, scoutId)
      if (!r.ok) { get().notify(r.error ?? 'Could not start that search.', 'bad'); return false }
      set({ game: r.state })
      get().notify('Talent search under way.', 'good')
      return true
    },
    toggleShortlist: (fighterId) => update((g) => commands.toggleShortlist(g, fighterId)),
    makeOffer: (fighterId, offer, kind) => {
      const g = get().game
      if (!g) return 'error'
      const out = commands.makeOffer(g, fighterId, offer, kind)
      if (!out.ok) { get().notify(out.error ?? 'Offer failed.', 'bad'); return 'error' }
      set({ game: out.state })
      const v = out.round!.verdict
      if (v === 'accept') get().notify(kind === 'renewal' ? 'Contract renewed.' : 'Signed! They have joined your roster.', 'good')
      else if (v === 'counter') get().notify('They have countered.', 'neutral')
      else get().notify('Offer rejected.', 'bad')
      return v === 'walkedAway' ? 'error' : v
    },
    walkAway: (fighterId) => update((g) => commands.endNegotiation(g, fighterId)),
    release: (fighterId) => {
      const g = get().game
      if (!g) return false
      const r = commands.releaseFighter(g, fighterId)
      if (!r.ok) { get().notify(r.error ?? 'Could not release.', 'bad'); return false }
      set({ game: r.state })
      get().notify('Fighter released.', 'neutral')
      return true
    },
    openLink: (link) => {
      if (link.kind === 'fighter') return get().navigate('fighter', link.id)
      const [screen, ...rest] = link.screen.split('/')
      get().navigate(screen as ScreenId, rest.length ? rest.join('/') : undefined)
    },
    readMessage: (id, read = true) => update((g) => commands.markMessageRead(g, id, read)),
    readAll: () => update((g) => commands.markAllRead(g)),
    removeMessage: (id) => update((g) => commands.deleteMessage(g, id)),
    setAutosave: (v) => update((g) => commands.setAutosave(g, v)),

    exportGame: () => {
      const g = get().game
      return g ? serialiseGame(g) : null
    },

    importGame: (json) => {
      const game = deserialiseGame(json)
      if (!game) {
        get().notify('That file is not a valid Fight Empire save.', 'bad')
        return false
      }
      try { saveGame(storage, game) } catch { /* still playable in memory */ }
      set({ game, saves: listSaves(storage), route: { screen: 'dashboard' } })
      get().notify('Save imported.', 'good')
      return true
    },

    notify: (text, tone = 'neutral') => {
      const id = ++noticeSeq
      set((s) => ({ notices: [...s.notices.filter((n) => n.text !== text).slice(-2), { id, text, tone }] }))
      setTimeout(() => get().dismissNotice(id), 4500)
    },
    dismissNotice: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
  }
})
