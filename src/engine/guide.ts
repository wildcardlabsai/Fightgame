/**
 * THE GUIDED FIRST CAREER (Phase 7).
 *
 * A short sequence of milestones that walks a new promoter through the real loop: read the desk, find fighters, agree a fight, book a venue,
 * build the card, put it on sale, run the night, read the result, pick the next objective.
 *
 * Rules the module keeps:
 *  - Completion is DERIVED from authoritative game state (a signed contract, an agreed fight, an event that really has a result). Opening a
 *    screen never completes anything. Three milestones are plain acknowledgements ("I have read this") because nothing in the world can prove it.
 *  - Progress lives in the save (`state.guide`), so it follows the career, not the browser. Completed milestones are remembered (sticky), so
 *    cancelling a show later never un-completes the lesson, and a finished or dismissed guide never comes back by itself.
 *  - It only ever *explains and points*. It grants nothing and changes no simulation input, so it cannot make the opening easier.
 *  - Existing careers are migrated with the guide switched off; it is only on for a brand-new career or when the player asks for it.
 *  - Texts use public information only (no hidden ratings, no confidential facts).
 */
import type { Day, GameState, Id } from './types'
import { objectiveStatuses, scenarioById } from './scenarios'
import { tierLabel } from './tiers'

export interface GuideState {
  v: 1
  /** Showing now. */
  active: boolean
  /** The player closed it (as opposed to never having had it). */
  dismissed: boolean
  /** The day the guide began: fighters already on the roster then do not count as "signed". */
  since: Day
  rosterAtStart: Id[]
  /** Milestone → the day it was completed (sticky). */
  done: Record<string, Day>
  skipped: string[]
  finished?: Day
}

export type GuideStepId = 'position' | 'scout' | 'sign' | 'matchup' | 'venue' | 'card' | 'sale' | 'show' | 'review' | 'next'
export const GUIDE_ORDER: GuideStepId[] = ['position', 'scout', 'sign', 'matchup', 'venue', 'card', 'sale', 'show', 'review', 'next']
/** Not needed for a first show: the starting roster is enough, so these are offered, never required. */
const OPTIONAL: GuideStepId[] = ['scout', 'sign']
/** Completed by the player saying so, because the game cannot observe it. */
const ACK: GuideStepId[] = ['position', 'review', 'next']

export interface GuideStepView {
  id: GuideStepId
  title: string
  /** What it is and why it matters. */
  why: string
  /** What to do, in plain words. */
  how: string
  done: boolean
  skipped: boolean
  optional: boolean
  ack: boolean
  current: boolean
  /** Where the action is, and which control to highlight there (matches `data-guide` in the UI). */
  go: { screen: string; param?: string; label: string; target: string }
  /** Why the action cannot be taken right now, when that is the case. */
  blocker?: string
  /** Facts from the real game state worth showing on the card (e.g. the result of the first show). */
  facts?: string[]
}

export interface GuideView {
  steps: GuideStepView[]
  current: GuideStepView | null
  /** Required milestones done or skipped, of required milestones in all. */
  progress: { done: number; total: number }
  allDone: boolean
  nextObjective: { label: string; progressText: string } | null
}

export const newGuide = (state: GameState, rosterAtStart?: Id[]): GuideState => ({
  v: 1, active: true, dismissed: false, since: state.today, done: {}, skipped: [],
  rosterAtStart: rosterAtStart ?? rosterIds(state),
})

/** What an existing career or a classic start gets: present, but off. */
export const offGuide = (state: { today?: Day }): GuideState => ({ v: 1, active: false, dismissed: false, since: state.today ?? 0, rosterAtStart: [], done: {}, skipped: [] })

const rosterIds = (state: GameState): Id[] => Object.values(state.contracts).filter((c) => c.promotionId === state.playerPromotionId && c.status === 'active').map((c) => c.fighterId)
const mineEvents = (state: GameState) => Object.values(state.events).filter((e) => e.promotionId === state.playerPromotionId && e.status !== 'cancelled').sort((a, b) => a.day - b.day)

/** Milestones the world itself can confirm, read from authoritative state. */
function derived(state: GameState, g: GuideState): Partial<Record<GuideStepId, boolean>> {
  const me = state.playerPromotionId
  const events = mineEvents(state)
  const fights = Object.values(state.fights).filter((f) => f.sideA.promotionId === me || f.sideB.promotionId === me || f.organiserId === me)
  const scouted = state.scoutOps.length > 0 || Object.values(state.knowledge).some((k) => k.reports.length > 0 && !k.reports.every((r) => r.scoutName === 'Head Coach'))
  const roster = rosterIds(state)
  const signed = roster.some((id) => !g.rosterAtStart.includes(id))
  const booked = fights.some((f) => ['agreed', 'scheduled', 'training', 'fightNight', 'completed', 'processed', 'postFight'].includes(f.status))
  const cardReady = events.some((e) => !['planning', 'venueBooked', 'cardBuilding'].includes(e.status) || (e.card.length >= (state.venues[e.venueId]?.minFights ?? 99) && e.status !== 'planning'))
  return {
    scout: scouted,
    sign: signed,
    matchup: booked,
    venue: events.length > 0,
    card: cardReady,
    sale: events.some((e) => e.onSaleDay !== null || !!e.result),
    show: events.some((e) => !!e.result),
  }
}

/** Record newly completed milestones (sticky). Returns the same object when nothing changed, so it is cheap to call after every command. */
export function syncGuide(state: GameState): GameState {
  const g = state.guide
  if (!g || !g.active) return state
  const d = derived(state, g)
  const fresh = (Object.keys(d) as GuideStepId[]).filter((k) => d[k] && g.done[k] === undefined)
  if (fresh.length === 0) return state
  const done = { ...g.done }
  for (const k of fresh) done[k] = state.today
  return { ...state, guide: { ...g, done } }
}

const isPassed = (g: GuideState, id: GuideStepId) => g.done[id] !== undefined || g.skipped.includes(id)

export function guideView(state: GameState): GuideView | null {
  const g = state.guide
  if (!g || !g.active) return null
  const d = derived(state, g)
  const fit = Object.values(state.fighters).filter((f) => rosterIds(state).includes(f.id) && f.status === 'active' && !f.injury && !f.activeFightId)
  const cash = state.promotions[state.playerPromotionId].cash
  const events = mineEvents(state)
  const open = events.find((e) => !e.result && e.status !== 'archived') ?? null
  const showEvent = events.find((e) => !!e.result) ?? null
  const sc = scenarioById(state.scenario?.id)
  const obj = objectiveStatuses(state).find((o) => !o.done) ?? null
  const nextTier = (() => { try { return tierLabel(state.promotions[state.playerPromotionId].tier) } catch { return '' } })()
  const doneNow = (id: GuideStepId) => g.done[id] !== undefined || d[id] === true
  const evId = open?.id
  const fightWeek = !!open && ['fightWeek', 'live'].includes(open.status)

  const def: Record<GuideStepId, Omit<GuideStepView, 'done' | 'skipped' | 'current' | 'optional' | 'ack'>> = {
    position: {
      id: 'position', title: 'Read your position',
      why: 'Cash pays the weekly bills (retainers, gym, staff) whether or not you promote. Runway is how many weeks you can survive with no income. Shows are where income comes from.',
      how: 'Look at Cash, Roster and Runway on the desk. Anything urgent is listed under “What next?”. Everything else can wait.',
      go: { screen: 'dashboard', label: 'Open the desk', target: 'desk-strip' },
      facts: [`Cash £${Math.round(cash).toLocaleString('en-GB')}`, `${rosterIds(state).length} fighter${rosterIds(state).length === 1 ? '' : 's'} on your roster`],
    },
    scout: {
      id: 'scout', title: 'Scout a fighter (optional)',
      why: 'Public records show wins and losses, not how good someone really is. A scouting report narrows the guess at their quality; more depth narrows it further, at a cost.',
      how: 'Open Scouting, pick a fighter and commission a report. You can book a first show without it.',
      go: { screen: 'scouting', label: 'Open scouting', target: 'scout-commission' },
    },
    sign: {
      id: 'sign', title: 'Sign a fighter (optional)',
      why: 'A contract is a promise: a weekly retainer, a purse per bout, and a minimum number of fights a year you must provide. Signing someone you cannot keep busy costs money for nothing.',
      how: 'Find a free agent in Roster, open their profile and start a negotiation. Your starting fighters are enough for a first show.',
      go: { screen: 'fighters', param: 'free', label: 'Browse free agents', target: 'free-agents' },
    },
    matchup: {
      id: 'matchup', title: 'Agree a credible fight',
      why: 'A good fight is two fighters of similar quality, both fit and free on the date. A mismatch is a bad night for the crowd and a risk to your fighter. Records and scouting ranges help you judge it.',
      how: 'Open Matchmaking, choose one of your fighters, pick an opponent whose range and record look like a fair test, and agree terms. Opponents’ purses are paid by you.',
      go: { screen: 'matchmaking', label: 'Make a fight', target: 'make-fight' },
      blocker: fit.length === 0 ? 'None of your fighters is fit and free right now. Advance a week, or sign a free agent.' : undefined,
    },
    venue: {
      id: 'venue', title: 'Book a venue',
      why: 'The hire fee is paid up front, so it is your first real risk. A small hall you can fill beats a big one you cannot. Each venue has a capacity and a card size it expects.',
      how: 'On Events choose “Plan a show”, pick a venue that suits a small promotion, then a Saturday at least six weeks out.',
      go: { screen: 'events', label: 'Plan a show', target: 'plan-show' },
      blocker: cash <= 0 ? 'Your bank is overdrawn, so a venue cannot be booked. Check Finances.' : undefined,
    },
    card: {
      id: 'card', title: 'Build the card',
      why: 'A show needs at least the number of fights the venue expects. Purses are costs you will pay whether tickets sell or not; the headline fight drives demand.',
      how: 'On the event page choose “Add a fight” and add the fights you have agreed. Put the best fight last: it is the main event.',
      go: evId ? { screen: 'event', param: evId, label: 'Open the show', target: 'add-fight' } : { screen: 'events', label: 'Plan a show first', target: 'plan-show' },
      blocker: !open ? 'You need a booked show first.' : !booked(state) ? 'You have no agreed fight to add yet: agree one in Matchmaking.' : undefined,
    },
    sale: {
      id: 'sale', title: 'Check the forecast, then sell tickets',
      why: 'The forecast gives a range for attendance and profit, not a promise. Revenue is tickets plus any sponsor or broadcast money; costs are the venue, purses, production and marketing. A wide range means real risk.',
      how: 'Read the Forecast and the money panel, set prices and marketing if you wish, then choose “Put on sale”. Advice cards flag anything dangerous.',
      go: evId ? { screen: 'event', param: evId, label: 'Open the show', target: 'put-on-sale' } : { screen: 'events', label: 'Open Events', target: 'plan-show' },
      blocker: !open ? 'You need a booked show with a full card first.' : undefined,
    },
    show: {
      id: 'show', title: 'Run the show',
      why: 'Tickets sell week by week; on fight week the show is yours to run. The fights are simulated from the fighters and the plans, and the result and money are settled afterwards.',
      how: fightWeek ? 'It is fight week. Open the show and ring the bell; use Next fight to move through the card.' : 'Advance weeks (the desk’s Advance button). Check sales as they build; when fight week arrives, run the card.',
      go: evId ? { screen: 'event', param: evId, label: fightWeek ? 'Go to the show' : 'Open the show', target: fightWeek ? 'ring-bell' : 'advance' } : { screen: 'events', label: 'Open Events', target: 'plan-show' },
      blocker: !open ? 'You need a show on sale first.' : undefined,
    },
    review: {
      id: 'review', title: 'Read the result',
      why: 'The accounts show what the night really earned against what it cost. Wins and losses change a fighter’s standing, popularity and next options, and a good night builds your promotion’s reputation.',
      how: 'Open the finished show and read the final accounts, the fight results and the notes. Then confirm below.',
      go: showEvent ? { screen: 'event', param: showEvent.id, label: 'Open the result', target: 'event-complete' } : { screen: 'events', label: 'Open Events', target: 'plan-show' },
      facts: showEvent?.result ? [
        `Attendance ${showEvent.result.attendance.toLocaleString('en-GB')}`,
        `Revenue £${Math.round(showEvent.result.revenue).toLocaleString('en-GB')} against costs £${Math.round(showEvent.result.costs).toLocaleString('en-GB')}`,
        `${showEvent.result.profit >= 0 ? 'Profit' : 'Loss'} £${Math.abs(Math.round(showEvent.result.profit)).toLocaleString('en-GB')}`,
      ] : undefined,
    },
    next: {
      id: 'next', title: 'Choose your next objective',
      why: 'One show is a start. Promotions grow by running profitable shows, building fighters people want to see, and climbing the tiers. Rankings and titles open later.',
      how: obj ? `Your career goal is “${obj.label}” (${obj.progressText}). Keep an eye on “What next?” on the desk, and plan another show before cash runs short.` : `You are a ${nextTier} promotion. Plan another show before cash runs short and watch “What next?” on the desk.`,
      go: { screen: 'dashboard', label: 'Back to the desk', target: 'desk-strip' },
      facts: sc ? [`Career: ${sc.name}`] : undefined,
    },
  }

  const steps: GuideStepView[] = GUIDE_ORDER.map((id) => ({
    ...def[id], done: doneNow(id), skipped: g.skipped.includes(id) && !doneNow(id),
    optional: OPTIONAL.includes(id), ack: ACK.includes(id), current: false,
  }))
  // The spine is every required step; the current one is the first not yet done or skipped.
  const cur = steps.find((s) => !s.optional && !s.done && !s.skipped) ?? null
  if (cur) cur.current = true
  const required = steps.filter((s) => !s.optional)
  return {
    steps, current: cur,
    progress: { done: required.filter((s) => s.done || s.skipped).length, total: required.length },
    allDone: !cur,
    nextObjective: obj ? { label: obj.label, progressText: obj.progressText } : null,
  }
}

function booked(state: GameState): boolean {
  const me = state.playerPromotionId
  return Object.values(state.fights).some((f) => (f.sideA.promotionId === me || f.sideB.promotionId === me || f.organiserId === me) && ['agreed', 'scheduled', 'training', 'fightNight'].includes(f.status) && !f.eventId)
}

/* ------------------------------------------------------------------------------------------------ commands (pure: state in, state out) */

const touch = (state: GameState, patch: Partial<GuideState>): GameState => (state.guide ? { ...state, guide: { ...state.guide, ...patch } } : state)

/** The player confirms an acknowledgement milestone. Only the acknowledgement steps can be confirmed this way, and only in order. */
export function ackGuideStep(state: GameState, id: GuideStepId): GameState {
  const g = state.guide
  if (!g || !g.active || !ACK.includes(id) || g.done[id] !== undefined) return state
  const v = guideView(state)
  if (!v || v.current?.id !== id) return state // no confirming ahead of the work
  const done = { ...g.done, [id]: state.today }
  return touch(state, id === 'next' ? { done, active: false, finished: state.today } : { done })
}

/** Skip the current required milestone. Optional ones are simply left alone. */
export function skipGuideStep(state: GameState, id: GuideStepId): GameState {
  const g = state.guide
  if (!g || !g.active || OPTIONAL.includes(id) || isPassed(g, id)) return state
  const v = guideView(state)
  if (!v || v.current?.id !== id) return state
  if (id === 'next') return touch(state, { skipped: [...g.skipped, id], active: false, finished: state.today })
  return touch(state, { skipped: [...g.skipped, id] })
}

/** Hide the guide. It does not come back unless the player asks (Settings, or the desk's “Show the guide”). */
export function dismissGuide(state: GameState): GameState {
  const g = state.guide
  if (!g) return { ...state, guide: { ...offGuide(state), dismissed: true } }
  return touch(state, { active: false, dismissed: true })
}

/** An explicit request for the tutorial, on any career. Never touches the career itself; progress that already happened shows as done. */
export function startGuide(state: GameState): GameState {
  return syncGuide({ ...state, guide: newGuide(state, state.guide?.rosterAtStart?.length ? state.guide.rosterAtStart : rosterIds(state)) })
}
