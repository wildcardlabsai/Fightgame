import { create } from 'zustand'
import * as commands from '../engine/commands'
import { browserStorage, deserialiseGame, serialiseGame } from '../engine/save'
import { openBestBackend, SaveVault, type SlotMeta } from '../engine/persistence'
import { advanceWeeks } from '../engine/tick'
import type { GameState, Id, NegotiationKind, Offer, ScoutDepth, TrainingFocus } from '../engine/types'
import type { SearchSpec } from '../engine/scouting'
import type { FightOffer, FightPrep } from '../engine/types'
import { createNewGame, type NewGameOptions } from '../engine/worldgen'
import { emitGameEvent } from './gameEvents'

export type ScreenId =
  | 'dashboard' | 'fighters' | 'fighter' | 'calendar' | 'inbox' | 'finances' | 'promotions'
  | 'venues' | 'settings' | 'scouting' | 'contracts' | 'negotiation' | 'matchmaking' | 'fights' | 'fight' | 'deal' | 'events' | 'event' | 'sponsors' | 'assets'

export interface Route {
  screen: ScreenId
  param?: string
}

const SCREENS: ScreenId[] = ['dashboard', 'fighters', 'fighter', 'calendar', 'inbox', 'finances', 'promotions', 'venues', 'settings', 'scouting', 'contracts', 'negotiation', 'matchmaking', 'fights', 'fight', 'deal', 'events', 'event', 'sponsors', ...(import.meta.env.DEV ? (['assets'] as ScreenId[]) : [])]

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
  saves: SlotMeta[]
  /** Where saves live: indexeddb | localstorage | memory (unknown until the vault has opened). */
  storageKind: string
  notices: Notice[]
  /** Briefly true after advancing time (drives the UI transition). */
  simulating: boolean

  navigate: (screen: ScreenId, param?: string) => void
  syncRouteFromHash: () => void
  refreshSaves: () => Promise<void>
  startNewGame: (o: NewGameOptions) => void
  loadSaved: (id: string) => Promise<boolean>
  saveNow: (opts?: { slotName?: string }) => Promise<void>
  removeSave: (id: string) => Promise<void>
  quitToMenu: () => Promise<void>
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
  openLink: (link: { kind: 'fighter'; id: string } | { kind: 'screen'; screen: string } | { kind: 'fight'; id: string } | { kind: 'event'; id: string }) => void
  // ---- Phase 4.6c: promotion tier and standing sponsors ----
  ackTier: () => void
  sponsorAccept: (offerId: Id, years: 1 | 2 | 3) => boolean
  sponsorNegotiate: (offerId: Id) => void
  sponsorDecline: (offerId: Id) => void
  // ---- Phase 4: events ----
  createEvent: (spec: { name: string; day: number; venueId: Id }) => string | null
  /** Run a named event command against the current game; toasts the engine's error or a short success note. */
  eventDo: <K extends EventCmd>(name: K, ...args: Rest<Parameters<(typeof EVENT_COMMANDS)[K]>>) => boolean
  runNextEventFight: (eventId: Id) => Id | null
  /** Event whose night is running (drives the reveal screen). */
  nightFight: string | null
  // ---- Phase 3: fights ----
  /** Fight whose result was just produced (drives the fight-night reveal). */
  justRan: string | null
  approachOpponent: (myId: Id, oppId: Id) => string | null
  offerFight: (fightId: Id, offer: FightOffer) => 'accept' | 'counter' | 'reject' | 'error'
  withdrawFight: (fightId: Id) => void
  scheduleFight: (fightId: Id, day: number) => boolean
  setPrep: (fightId: Id, side: 0 | 1, patch: Partial<Pick<FightPrep, 'intensity' | 'plan'>>) => void
  runFightNight: (fightId: Id) => boolean
  ackFight: () => void
  readMessage: (id: Id, read?: boolean) => void
  readAll: () => void
  removeMessage: (id: Id) => void
  setAutosave: (v: boolean) => void
  exportGame: () => string | null
  importGame: (json: string) => boolean
  /** `sound: false` when the caller emits a more specific game event for the same moment. */
  notify: (text: string, tone?: Notice['tone'], sound?: boolean) => void
  dismissNotice: (id: number) => void
}

let noticeSeq = 0

/** Tell the audio layer how a fight ended (method and knockdowns only — no hidden information). */
function announceFight(g: GameState, fightId: string): void {
  const res = g.fights[fightId]?.result
  if (res) emitGameEvent({ type: 'fight.result', fightId, method: res.method, knockdowns: res.kd[0] + res.kd[1], presented: true })
}
function announceFinish(before: GameState, after: GameState, eventId: string): void {
  const done = (s: GameState) => ['completed', 'settled', 'archived'].includes(s.events[eventId]?.status ?? '')
  if (!done(before) && done(after)) emitGameEvent({ type: 'event.completed', eventId })
}

const EVENT_COMMANDS = {
  addFight: commands.addFightToEvent, removeFight: commands.removeFightFromEvent, moveFight: commands.moveFightOnCard, setSlot: commands.setCardSlot,
  setPrices: commands.setEventPrices, setMarketing: commands.setEventMarketing, setBroadcast: commands.setEventBroadcast,
  refreshSponsors: commands.refreshEventSponsors, chooseSponsor: commands.chooseSponsor, putOnSale: commands.putEventOnSale,
  quickSim: commands.quickSimEvent, runToEnd: commands.runEventToEnd, cancel: commands.cancelEvent,
} as const
export type EventCmd = keyof typeof EVENT_COMMANDS
type Rest<T extends unknown[]> = T extends [unknown, ...infer R] ? R : never
const EVENT_OK: Partial<Record<EventCmd, string>> = { addFight: 'Added to the card.', putOnSale: 'Tickets are on sale!', cancel: 'Show cancelled.' }

/** The save vault opens asynchronously (IndexedDB); everything waits on this promise. */
let vaultPromise: Promise<SaveVault> | null = null
function vault(): Promise<SaveVault> {
  vaultPromise ??= openBestBackend().then(async (b) => {
    const v = new SaveVault(b)
    try { await v.migrateLegacy(browserStorage()) } catch { /* old saves stay where they are */ }
    return v
  })
  return vaultPromise
}

function currentHashRoute(): Route {
  return typeof window === 'undefined' ? { screen: 'dashboard' } : parseHash(window.location.hash)
}

export const useGame = create<GameStore>((set, get) => {
  const persist = async (g: GameState, opts: { slotId?: string; name?: string; auto?: boolean } = {}) => {
    const v = await vault()
    await v.save(g, opts)
    set({ saves: await v.list(), storageKind: v.backend.kind })
  }
  const update = (fn: (g: GameState) => GameState) => {
    const g = get().game
    if (!g) return
    const next = fn(g)
    if (next !== g) set({ game: next })
  }

  return {
    game: null,
    route: currentHashRoute(),
    saves: [],
    storageKind: 'opening…',
    notices: [],
    simulating: false,
    justRan: null,
    nightFight: null,

    navigate: (screen, param) => {
      const route = { screen, param }
      if (typeof window !== 'undefined') window.location.hash = routeToHash(route)
      set({ route })
    },
    syncRouteFromHash: () => set({ route: currentHashRoute() }),
    refreshSaves: async () => {
      const v = await vault()
      set({ saves: await v.list(), storageKind: v.backend.kind })
    },

    startNewGame: (o) => {
      const game = createNewGame(o)
      void persist(game)
      set({ game, route: { screen: 'dashboard' } })
      if (typeof window !== 'undefined') window.location.hash = '#/dashboard'
    },

    loadSaved: async (id) => {
      const game = await (await vault()).load(id)
      if (!game) {
        get().notify('That save could not be loaded — it may be corrupt or from a newer version.', 'bad')
        return false
      }
      set({ game, route: { screen: 'dashboard' } })
      if (typeof window !== 'undefined') window.location.hash = '#/dashboard'
      return true
    },

    saveNow: async (opts) => {
      const g = get().game
      if (!g) return
      try {
        await persist(g, opts?.slotName ? { slotId: `${g.saveId}~${Date.now().toString(36)}`, name: opts.slotName } : {})
        get().notify('Game saved.', 'good', false)
        emitGameEvent({ type: 'save' })
      } catch {
        get().notify('Save failed — browser storage may be full. Try exporting the save file.', 'bad')
      }
    },

    removeSave: async (id) => {
      await (await vault()).remove(id)
      await get().refreshSaves()
    },

    quitToMenu: async () => {
      const g = get().game
      if (g) {
        try { await persist(g) } catch { /* surfaced via manual save */ }
      }
      set({ game: null })
    },

    advance: (weeks) => {
      const g = get().game
      if (!g) return
      const pending = Object.values(g.fights).find((f) => f.status === 'fightNight' && (f.organiserId === g.playerPromotionId || f.sideA.promotionId === g.playerPromotionId || f.sideB.promotionId === g.playerPromotionId))
      if (pending) {
        get().notify('Fight night is here — run the show before moving on.', 'bad')
        if (pending.eventId) get().navigate('event', pending.eventId); else get().navigate('fight', pending.id)
        return
      }
      const before = g.inbox.length
      const result = advanceWeeks(g, weeks)
      set({ game: result.state, simulating: true })
      setTimeout(() => set({ simulating: false }), 450)
      if (result.state.settings.autosave) void persist(result.state, { auto: true }).catch(() => get().notify('Autosave failed — export your save to be safe.', 'bad'))
      const newMail = result.state.inbox.length - before
      const night = Object.values(result.state.fights).find((f) => f.status === 'fightNight' && (f.organiserId === g.playerPromotionId || f.sideA.promotionId === g.playerPromotionId || f.sideB.promotionId === g.playerPromotionId))
      if (night) {
        get().notify('It is fight week!', 'good', !night.eventId)
        if (night.eventId) { emitGameEvent({ type: 'event.intro', eventId: night.eventId }); get().navigate('event', night.eventId) } else get().navigate('fight', night.id)
      } else if (result.interrupted) {
        get().notify(`Stopped after ${result.weeksAdvanced} week${result.weeksAdvanced === 1 ? '' : 's'} — something urgent needs you.`, 'bad')
      } else if (newMail > 0) {
        get().notify(`${newMail} new message${newMail === 1 ? '' : 's'}.`, 'neutral')
      }
    },

    ackTier: () => update((g) => commands.ackTierNotice(g)),
    sponsorAccept: (offerId, years) => {
      const g = get().game
      if (!g) return false
      const r = commands.acceptSponsorOffer(g, offerId, years)
      if (!r.ok) { get().notify(r.error ?? 'Could not sign that sponsor.', 'bad'); return false }
      set({ game: r.state })
      get().notify('Sponsor signed. The partnership starts today.', 'good', false)
      emitGameEvent({ type: 'contract.accepted' })
      return true
    },
    sponsorNegotiate: (offerId) => {
      const g = get().game
      if (!g) return
      const r = commands.negotiateSponsorOffer(g, offerId)
      if (!r.ok) { get().notify(r.error ?? 'Could not negotiate.', 'bad'); return }
      set({ game: r.state })
      const m = r.state.inbox[0]
      if (m) get().notify(m.subject, 'neutral')
    },
    sponsorDecline: (offerId) => update((g) => { const r = commands.declineSponsorOffer(g, offerId); return r.ok ? r.state : g }),
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
      if (v === 'accept') { get().notify(kind === 'renewal' ? 'Contract renewed.' : 'Signed! They have joined your roster.', 'good', false); emitGameEvent({ type: 'contract.accepted' }) }
      else if (v === 'counter') get().notify('They have countered.', 'neutral')
      else { get().notify('Offer rejected.', 'bad', false); emitGameEvent({ type: 'contract.rejected' }) }
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
    approachOpponent: (myId, oppId) => {
      const g = get().game
      if (!g) return null
      const r = commands.approach(g, myId, oppId)
      if (!r.ok) { get().notify(r.error ?? 'They will not take that call.', 'bad'); return null }
      set({ game: r.state })
      return r.fightId ?? null
    },
    offerFight: (fightId, offer) => {
      const g = get().game
      if (!g) return 'error'
      const r = commands.offerFight(g, fightId, offer)
      if (!r.ok) { get().notify(r.error ?? 'Offer failed.', 'bad'); return 'error' }
      set({ game: r.state })
      const v = r.verdict ?? 'reject'
      get().notify(v === 'accept' ? 'Fight agreed! Now set a date.' : v === 'counter' ? 'They have countered.' : r.state.fights[fightId]?.status === 'cancelled' ? 'Talks collapsed.' : 'Offer rejected.', v === 'accept' ? 'good' : v === 'counter' ? 'neutral' : 'bad')
      return v
    },
    withdrawFight: (fightId) => {
      const g = get().game
      if (!g) return
      const r = commands.withdraw(g, fightId)
      if (!r.ok) { get().notify(r.error ?? 'Could not withdraw.', 'bad'); return }
      set({ game: r.state })
    },
    scheduleFight: (fightId, day) => {
      const g = get().game
      if (!g) return false
      const r = commands.schedule(g, fightId, day)
      if (!r.ok) { get().notify(r.error ?? 'Could not schedule.', 'bad'); return false }
      set({ game: r.state })
      get().notify('Fight scheduled. Camp opens four weeks out.', 'good', false)
      emitGameEvent({ type: 'fight.scheduled' })
      return true
    },
    setPrep: (fightId, side, patch) => {
      const g = get().game
      if (!g) return
      const r = commands.prepare(g, fightId, side, patch)
      if (!r.ok) { get().notify(r.error ?? 'Could not change preparation.', 'bad'); return }
      set({ game: r.state })
    },
    ackFight: () => set({ justRan: null }),
    runFightNight: (fightId) => {
      const g = get().game
      if (!g) return false
      const r = commands.runFightNight(g, fightId)
      if (!r.ok) { get().notify(r.error ?? 'Could not start the fight.', 'bad'); return false }
      set({ game: r.state, justRan: fightId })
      announceFight(r.state, fightId)
      if (r.state.settings.autosave) void persist(r.state, { auto: true }).catch(() => undefined)
      return true
    },
    createEvent: (spec) => {
      const g = get().game
      if (!g) return null
      const r = commands.createEvent(g, spec)
      if (!r.ok) { get().notify(r.error ?? 'Could not create the event.', 'bad'); return null }
      set({ game: r.state })
      get().notify('Venue booked. Now build the card.', 'good')
      return r.eventId ?? null
    },
    eventDo: (name, ...args) => {
      const g = get().game
      if (!g) return false
      const fn = EVENT_COMMANDS[name] as unknown as (g: GameState, ...a: unknown[]) => { ok: boolean; error?: string; state: GameState }
      const r = fn(g, ...args)
      if (!r.ok) { get().notify(r.error ?? 'That did not work.', 'bad'); return false }
      set({ game: r.state })
      if (name === 'quickSim' || name === 'runToEnd') announceFinish(g, r.state, args[0] as string)
      if (EVENT_OK[name]) get().notify(EVENT_OK[name]!, 'good')
      return true
    },
    runNextEventFight: (eventId) => {
      const g = get().game
      if (!g) return null
      const r = commands.runNextEventFight(g, eventId)
      if (!r.ok) { get().notify(r.error ?? 'Could not run the next fight.', 'bad'); return null }
      set({ game: r.state, nightFight: r.fightId ?? null, justRan: r.fightId ?? null })
      const before = g.events[eventId], after = r.state.events[eventId]
      if (before?.status === 'fightWeek') emitGameEvent({ type: 'event.started', eventId })
      if (after && r.fightId && after.card[after.card.length - 1] === r.fightId && after.card.length > 1) emitGameEvent({ type: 'event.mainEvent', eventId })
      if (r.fightId) announceFight(r.state, r.fightId)
      announceFinish(g, r.state, eventId)
      if (r.state.settings.autosave) void persist(r.state, { auto: true }).catch(() => undefined)
      return r.fightId ?? null
    },
    openLink: (link) => {
      if (link.kind === 'event') return get().navigate('event', link.id)
      if (link.kind === 'fighter') return get().navigate('fighter', link.id)
      if (link.kind === 'fight') return get().navigate('fight', link.id)
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
      void persist(game).catch(() => undefined)
      set({ game, route: { screen: 'dashboard' } })
      get().notify('Save imported.', 'good')
      return true
    },

    notify: (text, tone = 'neutral', sound = true) => {
      if (sound) emitGameEvent({ type: 'notice', tone })
      const id = ++noticeSeq
      set((s) => ({ notices: [...s.notices.filter((n) => n.text !== text).slice(-2), { id, text, tone }] }))
      setTimeout(() => get().dismissNotice(id), 4500)
    },
    dismissNotice: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
  }
})
