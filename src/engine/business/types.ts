/**
 * THE FIGHT BUSINESS — state that exists only because of Phase 5.4. Everything is plain JSON, bounded, and migrates from nothing:
 * a save without `business` simply starts with an empty record. Hidden quantities (manager traits, ambitions, reservation values)
 * are NEVER stored here: they are pure functions of the seed, the fighter and public career facts (see manager.ts), so they cannot
 * leak through a save file view and cannot drift.
 */
import type { Day, Id, Offer, FightOffer, WeightClassId } from '../types'
import type { TitleLevel } from './titleDefs'

/** What the player has promised a fighter's camp. Tracked, checked every week, honoured or broken for real. */
export type PathwayKind =
  | 'areaShot'        // a shot at an area title
  | 'domesticShot'    // a British / Commonwealth title shot
  | 'europeanRoute'   // a route to the European title
  | 'worldIfRanked'   // a world-title opportunity if the fighter is ranked inside a limit
  | 'eliminator'      // a title eliminator
  | 'headline'        // a guaranteed co-main / main-event slot
  | 'activity'        // a guaranteed number of fights in a window

export interface PathwayOffer { kind: PathwayKind; weeks: number; maxRank?: number }

export interface Commitment {
  id: string
  fighterId: Id
  kind: PathwayKind
  /** For title pathways: the body the promise refers to (area/domestic/european/world are all bodies). */
  body: string | null
  level: TitleLevel | null
  wc: WeightClassId
  madeDay: Day
  dueDay: Day
  /** For `worldIfRanked`-style promises: it only binds while the fighter is ranked this high. */
  maxRank: number | null
  /** For `activity`: how many bouts. */
  count: number
  done: number
  status: 'open' | 'fulfilled' | 'broken' | 'void'
  note: string
}

export type DevPlan = 'protected' | 'normal' | 'accelerated'

export type TalkKind = 'contract' | 'fight'
export type TalkStatus = 'open' | 'agreed' | 'broken' | 'withdrawn'
export type Speaker = 'mgr' | 'you' | 'sys'

export interface TalkLine {
  who: Speaker
  text: string
  turn: number
  day: Day
  /** What the line was: a question, an offer, a counter, a decision. Lets the UI style it without parsing text. */
  tag: 'ask' | 'answer' | 'offer' | 'counter' | 'accept' | 'reject' | 'hold' | 'walk' | 'note'
}

/** A request the other camp has made and not yet seen met. */
export interface Demand { kind: 'money' | 'title' | 'activity' | 'exposure' | 'role' | 'time' | 'venue' | 'status'; text: string }

export interface FightExtras {
  /** Opponent status: a plain bout, a title eliminator, or a title fight — only offered when the engine says it is genuine. */
  status: 'standard' | 'eliminator' | 'title'
  rounds: number
  /** Offered a TV / streaming slot. Only ever true when the event really has one. */
  exposure: boolean
}

export interface Talk {
  id: string
  kind: TalkKind
  fighterId: Id
  /** Fight talks: the Fight being negotiated. */
  fightId: Id | null
  contractKind: 'signing' | 'renewal'
  openedDay: Day
  turn: number
  status: TalkStatus
  mood: 'eager' | 'warm' | 'lukewarm' | 'cold'
  /** Hidden to the UI as a number: the view shows only a three-step tension reading. */
  patience: number
  p0: number
  /** Money components the camp has already conceded (a later counter is never worse for the player than the last). */
  asked: string[]
  offer: Offer | null
  counter: Offer | null
  fightOffer: FightOffer | null
  fightCounter: FightOffer | null
  extras: FightExtras | null
  demands: Demand[]
  /** Facts the camp has told the player (priority tags etc.). Drives expected-terms confidence. */
  told: string[]
  log: TalkLine[]
  closedDay: Day | null
}

export interface NegRecord {
  talks: number
  agreed: number
  lowballs: number
  walkouts: number
  lastDay: Day
  /** Promises kept / broken with this camp (their memory of you). */
  kept?: number
  broken?: number
}

export interface TitleHistory { won: number; defences: number; best: TitleLevel | null; unifiedDay: Day | null; undisputedDay: Day | null }

export interface BusinessState {
  v: number
  /** Own id counter: this layer never touches the engine's id counter or RNG. */
  n: number
  talks: Record<string, Talk>
  commitments: Commitment[]
  plans: Record<Id, DevPlan>
  learned: Record<Id, string[]>
  neg: Record<Id, NegRecord>
  /** Agreements the player has reached (rough experience: improves expected-terms confidence). */
  exp: number
  titleHist: Record<Id, TitleHistory>
  /** Day each fighter last changed division (one move a year). */
  moved?: Record<Id, Day>
}

export const BUSINESS_LIMITS = { talks: 16, commitments: 60, log: 26, learnedPerFighter: 8 }

export function emptyBusiness(): BusinessState {
  return { v: 1, n: 0, talks: {}, commitments: [], plans: {}, learned: {}, neg: {}, exp: 0, titleHist: {} }
}
