import { create } from 'zustand'
import * as commands from '../engine/commands'
import {
  browserStorage, deleteSave as deleteSaveSlot, deserialiseGame, listSaves, loadGame, saveGame,
  serialiseGame, type SaveMeta,
} from '../engine/save'
import { advanceWeeks } from '../engine/tick'
import type { GameState, Id, TrainingFocus } from '../engine/types'
import { createNewGame, type NewGameOptions } from '../engine/worldgen'

export type ScreenId =
  | 'dashboard' | 'fighters' | 'fighter' | 'calendar' | 'inbox' | 'finances' | 'promotions'
  | 'venues' | 'settings'

export interface Route {
  screen: ScreenId
  param?: string
}

const SCREENS: ScreenId[] = ['dashboard', 'fighters', 'fighter', 'calendar', 'inbox', 'finances', 'promotions', 'venues', 'settings']

export function parseHash(hash: string): Route {
  const [, screen, param] = hash.replace(/^#/, '').split('/')
  return SCREENS.includes(screen as ScreenId) ? { screen: screen as ScreenId, param } : { screen: 'dashboard' }
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
