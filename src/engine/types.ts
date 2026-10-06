/**
 * Fight Empire — core data model.
 *
 * Everything the game needs to remember lives in `GameState`. It is plain,
 * JSON-serialisable data (no classes, no functions, no Dates) so that saving,
 * loading, AI simulation and testing never depend on UI or framework state.
 */

export type Id = string
/** Absolute day number (days since 1970-01-01). The game clock advances in 7-day steps. */
export type Day = number

// ---------------------------------------------------------------- Divisions

export type WeightClassId =
  | 'minimumweight' | 'lightFlyweight' | 'flyweight' | 'superFlyweight'
  | 'bantamweight' | 'superBantamweight' | 'featherweight' | 'superFeatherweight'
  | 'lightweight' | 'superLightweight' | 'welterweight' | 'superWelterweight'
  | 'middleweight' | 'superMiddleweight' | 'lightHeavyweight' | 'cruiserweight'
  | 'heavyweight'

export interface WeightClassDef {
  id: WeightClassId
  name: string
  /** Upper limit in lb (heavyweight is uncapped). */
  limitLb: number
  /** Typical height (cm) and spread, used for fighter generation. */
  heightMean: number
  heightSd: number
  /** Relative share of the talent pool in this division. */
  weight: number
}

// ---------------------------------------------------------------- Fighters

export type Stance = 'Orthodox' | 'Southpaw' | 'Switch'

export type FightingStyle =
  | 'Boxer' | 'Out-Boxer' | 'Slugger' | 'Swarmer' | 'Counter-Puncher' | 'Boxer-Puncher'

export type Personality =
  | 'Professional' | 'Ambitious' | 'Loyal' | 'Volatile' | 'Greedy'
  | 'Showman' | 'Quiet' | 'Arrogant' | 'Humble' | 'Fragile'

export type CareerStage =
  | 'Prospect' | 'Rising' | 'Contender' | 'Prime' | 'Veteran' | 'Declining' | 'Journeyman' | 'Retired'

export type TrainingFocus =
  | 'balanced' | 'power' | 'speed' | 'defence' | 'stamina' | 'technique' | 'recovery'

export type FighterStatus = 'active' | 'retired'

/** The ten core in-ring attributes, each on a 1–100 scale. */
export interface FighterAttributes {
  aggression: number
  power: number
  speed: number
  defence: number
  stamina: number
  chin: number
  ringIQ: number
  heart: number
  adaptability: number
  marketability: number
}
export type AttributeKey = keyof FighterAttributes

export interface FighterRecord {
  wins: number
  losses: number
  draws: number
  koWins: number
  koLosses: number
}

export interface Fighter {
  id: Id
  firstName: string
  lastName: string
  nickname: string | null
  nationality: string // key into data/nations
  hometown: string
  birthDay: Day
  weightClass: WeightClassId
  heightCm: number
  reachCm: number
  stance: Stance
  style: FightingStyle
  personality: Personality
  /** One-paragraph generated backstory. */
  bio: string

  attributes: FighterAttributes
  /** Ceiling the fighter can realistically reach (1–100). Hidden from the player until scouted. */
  potential: number

  // Condition (0–100)
  fitness: number
  conditioning: number
  confidence: number
  morale: number
  // Public standing (0–100)
  popularity: number
  reputation: number

  record: FighterRecord
  status: FighterStatus
  trainingFocus: TrainingFocus
  lastFightDay: Day | null
  contractId: Id | null
  retiredDay: Day | null
}

// --------------------------------------------------------------- Contracts

export interface Contract {
  id: Id
  fighterId: Id
  promotionId: Id
  startDay: Day
  endDay: Day
  /** Weekly retainer paid by the promotion regardless of activity. */
  weeklyRetainer: number
  /** Guaranteed minimum purse per bout. */
  minPurse: number
  fightsTotal: number
  fightsRemaining: number
  /** Expiry warnings already sent to the player (so each fires once). */
  warned12: boolean
  warned4: boolean
}

// -------------------------------------------------------------- Promotions

export type PromotionTier = 'Startup' | 'Regional' | 'National' | 'Major' | 'Global'

export interface PromotionLogo {
  monogram: string
  /** Hex colour. */
  color: string
  emblem: 'crown' | 'bolt' | 'glove' | 'star' | 'shield'
}

export interface Promotion {
  id: Id
  name: string
  promoterName: string
  isPlayer: boolean
  homeCountry: string
  tier: PromotionTier
  logo: PromotionLogo
  cash: number
  /** 0–100 */
  reputation: number
  /** Fan counts (people who follow the promotion). */
  fanbase: number
  /** 0–100 popularity in home region / worldwide. */
  regionalPopularity: number
  globalPopularity: number
  foundedDay: Day
}

// ------------------------------------------------------------------ Venues

export interface Venue {
  id: Id
  name: string
  city: string
  country: string
  capacity: number
  /** Cost to hire for one night. */
  hireCost: number
  /** 1 (club) – 5 (arena/stadium). */
  prestige: number
}

// ----------------------------------------------------------------- Finance

export type TransactionCategory =
  | 'startingFunds' | 'office' | 'staff' | 'gym' | 'insurance' | 'retainers'
  | 'purses' | 'tickets' | 'sponsorship' | 'ppv' | 'venue' | 'other'

export interface Transaction {
  id: Id
  day: Day
  category: TransactionCategory
  amount: number // positive = income, negative = expense
  description: string
}

export interface FinanceSnapshot {
  day: Day
  cash: number
  income: number
  expenses: number
}

// ------------------------------------------------------- Messages and news

export type MessagePriority = 'urgent' | 'important' | 'normal'
export type MessageCategory = 'system' | 'contract' | 'fighter' | 'finance' | 'world'

export interface InboxMessage {
  id: Id
  day: Day
  from: string
  subject: string
  body: string
  category: MessageCategory
  priority: MessagePriority
  read: boolean
  /** De-duplication key: the same key is not posted twice within its cooldown. */
  key?: string
  /** Optional deep link the UI can offer (e.g. open a fighter profile). */
  link?: { kind: 'fighter'; id: Id } | { kind: 'screen'; screen: string }
}

export interface NewsItem {
  id: Id
  day: Day
  headline: string
  category: 'prospect' | 'retirement' | 'signing' | 'result' | 'business' | 'world'
  fighterId?: Id
}

// ------------------------------------------------------------- Game state

export type Difficulty = 'forgiving' | 'standard' | 'brutal'

export interface GameSettings {
  difficulty: Difficulty
  autosave: boolean
}

export interface GameState {
  /** Bumped whenever the shape of GameState changes; used by save migrations. */
  version: number
  saveId: Id
  createdAt: number // real-world ms timestamp
  seed: string

  /** Serialised RNG position — keeps a loaded game on the same random sequence. */
  rngState: number
  /** Monotonic counter for deterministic id generation. */
  idCounter: number

  startDay: Day
  today: Day
  playerPromotionId: Id

  promotions: Record<Id, Promotion>
  fighters: Record<Id, Fighter>
  contracts: Record<Id, Contract>
  venues: Record<Id, Venue>

  ledger: Transaction[]
  financeHistory: FinanceSnapshot[]
  inbox: InboxMessage[]
  news: NewsItem[]

  settings: GameSettings
}

export const GAME_STATE_VERSION = 1
