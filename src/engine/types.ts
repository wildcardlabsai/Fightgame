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
  | 'Pressure Fighter' | 'Boxer' | 'Counter Puncher' | 'Swarmer'
  | 'Power Puncher' | 'Technical Boxer' | 'Defensive Specialist' | 'Balanced'

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
  /** PUBLIC backstory (origin, career, style). Never contains personality. */
  bio: string
  /** PRIVATE one-line personality note; only surfaced once the player has insight. */
  personalityNote: string

  attributes: FighterAttributes
  /** Ceiling the fighter can realistically reach (1–100). ENGINE TRUTH — never shown directly. */
  potential: number
  /** Further ENGINE TRUTH traits (1–100) the player can only estimate through scouting. */
  discipline: number
  composure: number
  /** Higher = more injury prone. Used from Phase 7. */
  injuryRisk: number

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
  /** Day the fighter last entered the free-agent market (null while contracted). */
  availableSince: Day | null
  /** How each promotion's relationship with this fighter stands (−100…100). */
  promoRelations: Record<Id, number>
  // ---- Phase 3: fighting life ----
  injury: Injury | null
  /** Medical suspension (e.g. after a knockout) — cannot fight before this day. */
  suspendedUntil: Day | null
  /** Career momentum (−100…100): recent results, decays over time. */
  momentum: number
  /** Most recent fight ids (newest last, capped). Full detail lives in `GameState.fights`. */
  recentFights: Id[]
  roundsFought: number
  /** Fight currently being negotiated/scheduled/prepared, if any. */
  activeFightId: Id | null
  /** Career timeline: signings, releases, expiries (newest last, capped). */
  history: HistoryEntry[]
}

export type InjurySeverity = 'minor' | 'moderate' | 'serious'

export interface Injury {
  kind: string
  severity: InjurySeverity
  startDay: Day
  returnDay: Day
}

export interface HistoryEntry {
  day: Day
  kind: 'turnedPro' | 'signed' | 'renewed' | 'released' | 'expired' | 'retired'
  promotionId: Id | null
  note?: string
}

// --------------------------------------------------------------- Contracts

export type ContractStatus = 'active' | 'expired' | 'released' | 'renewed' | 'retired'

export interface Contract {
  id: Id
  fighterId: Id
  promotionId: Id
  startDay: Day
  endDay: Day
  /** Paid weekly regardless of activity. */
  weeklyRetainer: number
  /** Guaranteed purse per bout (paid from Phase 3). */
  basePurse: number
  winBonus: number
  titleBonus: number
  /** Fraction (0–0.2) of PPV revenue attributable to the fighter (used from Phase 5). */
  ppvShare: number
  /** One-off payment made at signing (already paid; kept for the record). */
  signingBonus: number
  fightsTotal: number
  fightsRemaining: number
  /** Promotion owes at least this many bouts a year (enforced from Phase 3). */
  minFightsPerYear: number
  /** Fixed fee to terminate early; null = standard formula (see balance.ts). */
  releaseFee: number | null
  /** A title opportunity was promised; tracked as an Obligation. */
  titlePromise: boolean
  status: ContractStatus
  /** Renewal-stage notifications already sent to the player. */
  notices: { approaching: boolean; window: boolean; expiring: boolean }
  /** AI bookkeeping: the owning rival has already decided whether to renew. */
  aiReviewed: boolean
}

/** Terms put on the table during a negotiation. */
export interface Offer {
  years: number
  fights: number
  minFightsPerYear: number
  signingBonus: number
  weeklyRetainer: number
  basePurse: number
  winBonus: number
  titleBonus: number
  ppvShare: number
  titlePromise: boolean
}

export type NegotiationKind = 'signing' | 'renewal'
export type Verdict = 'accept' | 'counter' | 'reject'
export type Mood = 'eager' | 'warm' | 'lukewarm' | 'cold'

export interface NegotiationRound {
  day: Day
  offer: Offer
  verdict: Verdict | 'walkedAway'
  counter: Offer | null
  /** Plain-language reasons from the fighter's camp. */
  reasons: string[]
  mood: Mood
}

export interface Negotiation {
  id: Id
  fighterId: Id
  promotionId: Id
  kind: NegotiationKind
  openedDay: Day
  patience: number
  status: 'open' | 'broken'
  /** After talks collapse the fighter will not talk again until this day. */
  lockedUntil: Day | null
  rounds: NegotiationRound[]
  lastCounter: Offer | null
}

export interface Obligation {
  id: Id
  fighterId: Id
  promotionId: Id
  kind: 'titleShot'
  createdDay: Day
  dueDay: Day
  status: 'open' | 'fulfilled' | 'broken'
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
  /** Behaviour profile for AI-controlled promotions (null for the player). */
  ai: AiProfile | null
  stats: PromotionStats
  /** Only for AI promotions: cash reconciliation. */
  accounting: AiAccounting | null
}

export type AiStrategy = 'traditional' | 'prospectFactory' | 'money' | 'regional'

export type AiCompetence = 'poor' | 'average' | 'strong' | 'elite'
export type PromoFinState = 'healthy' | 'growing' | 'established' | 'struggling' | 'critical' | 'insolvent'

/** A rival's financial life cycle (Phase 4.5). Derived weekly from its own books; drives its decisions. */
export interface PromoFinance {
  state: PromoFinState
  since: Day
  /** Profit of the last few shows (most recent last). */
  recent: number[]
  /** Days of owner bail-outs still counted against it. */
  bailoutDays: Day[]
  /** Past recovery: owners have given up — it shrinks until fighters and fans drift away. */
  collapsing: boolean
  /** Weeks spent in a distressed state (struggling or worse). */
  distressWeeks: number
  /** Cumulative accounting net (revenue − costs − overhead) at the last quarter boundary, and the last few quarterly nets. */
  snap: number
  quarters: number[]
}

export interface AiProfile {
  strategy: AiStrategy
  /** Rises after losing fighters; makes the promotion act sooner. */
  urgency: number
  cooldownUntil: Day
  /** How good this promoter is at reading the market and controlling costs. Never perfect. */
  competence: AiCompetence
  /** 0 (cautious) – 1 (reckless): how much forecast downside it will accept. */
  risk: number
  fin: PromoFinance
}

// ------------------------------------------------------------------ Venues

export type VenueTier = 'local' | 'regional' | 'national' | 'arena' | 'stadium'

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
  tier: VenueTier
  /** 1–5: what the building can do for lighting, cameras and staging. */
  production: number
  /** City pull (0.5–1.6): how big the local market is. */
  market: number
  /** Smallest / largest card the venue will host. */
  minFights: number
  maxFights: number
}

// ------------------------------------------------------------------- Events

export type EventStatus =
  | 'planning' | 'venueBooked' | 'cardBuilding' | 'onSale' | 'promoting' | 'fightWeek'
  | 'live' | 'completed' | 'settled' | 'archived' | 'cancelled'

export type MarketingLevel = 'none' | 'low' | 'standard' | 'heavy' | 'major'
export type PromoStrategy = 'local' | 'standard' | 'aggressive' | 'superstar'
export type BroadcastKind = 'none' | 'localTv' | 'nationalTv' | 'streaming' | 'ppv'

export interface TicketPrices { ga: number; premium: number; vip: number }

export interface SponsorOffer {
  id: Id
  brand: string
  /** Paid at settlement (halved if the main-event requirement is breached). */
  fixedFee: number
  attendanceBonus: { threshold: number; amount: number } | null
  /** Bonus if the event's reputation score reaches the threshold. */
  qualityBonus: { threshold: number; amount: number } | null
  /** Main-event headliner popularity the sponsor expects. */
  minMainPopularity: number
}

export interface EventFinance {
  revenue: { tickets: number; sponsorship: number; broadcast: number; ppv: number }
  costs: { venue: number; marketing: number; production: number; purses: number; bonuses: number; officials: number; security: number; broadcast: number }
}

export interface EventSales {
  /** Tickets sold: [general admission, premium, VIP]. */
  sold: [number, number, number]
  weeksOnSale: number
  /** Awareness built by marketing (0–100). */
  awareness: number
  /** Sales trend: >1 accelerating, <1 slowing. */
  momentum: number
  /** Cumulative tickets sold at each weekly tick (dropped when archived). */
  history: number[]
}

export interface EventResult {
  attendance: number
  ppvBuys: number
  viewers: number
  revenue: number
  costs: number
  profit: number
  atmosphere: number
  /** Event reputation score 0–100. */
  reputation: number
  promoRepDelta: number
  fanDelta: number
  cardQuality: number
  importance: number
  notable: string[]
  /** Popularity movement for the most affected fighters. */
  risers: { fighterId: Id; delta: number }[]
  settledDay: Day
}

export interface BoxingEvent {
  id: Id
  promotionId: Id
  kind: 'player' | 'ai'
  name: string
  day: Day
  venueId: Id
  city: string
  country: string
  status: EventStatus
  /** Fight ids in running order: opener first, MAIN EVENT last, co-main second last. */
  card: Id[]
  prices: TicketPrices
  marketing: { level: MarketingLevel; strategy: PromoStrategy; budget: number; spent: number }
  broadcast: { kind: BroadcastKind; ppvPrice: number }
  sponsor: { offers: SponsorOffer[]; accepted: SponsorOffer | null }
  sales: EventSales
  finance: EventFinance
  result?: EventResult
  /** Settlement has happened (guard against paying twice). */
  settled: boolean
  createdDay: Day
  onSaleDay: Day | null
  cancelReason?: string
  /** Index of the next card fight to run on the night. */
  nextFight: number
  /** Pre-event reported attendance forecast midpoint (for the "beat expectations" story). */
  expectedAttendance: number
  /** Public forecast made when the show went on sale — kept so forecast quality can be audited. */
  forecast?: { att: [number, number]; profit: [number, number] }
  /** The player has manually ordered the card (new fights then go to the opener slot). */
  manualOrder?: boolean
}

export interface PromotionStats {
  events: number
  attendance: number
  bestAttendance: number
  profit: number
  lastEventDay: Day
  /** Reported-for-public gross gate of the best show. */
  bestGate: number
  /** Momentum: smoothed recent event rating (0–100). Reputation follows it, so one show cannot swing it wildly. */
  form: number
}

/** AI books: lets us prove rival cash reconciles. */
export interface AiAccounting {
  startCash: number
  revenue: number
  costs: number
  overhead: number
  bailouts: number
  /** Owner distributions of surplus cash. */
  distributions: number
}

export type FinancialHealth = 'healthy' | 'concern' | 'critical' | 'insolvent'

// ----------------------------------------------------------------- Finance

export type TransactionCategory =
  | 'startingFunds' | 'office' | 'staff' | 'gym' | 'insurance' | 'retainers'
  | 'purses' | 'tickets' | 'sponsorship' | 'ppv' | 'venue' | 'marketing' | 'production' | 'broadcast' | 'officials' | 'security' | 'scouting' | 'signingBonus' | 'releaseFees' | 'other'

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
  link?: { kind: 'fighter'; id: Id } | { kind: 'screen'; screen: string } | { kind: 'fight'; id: Id } | { kind: 'event'; id: Id }
}

export interface NewsItem {
  id: Id
  day: Day
  headline: string
  category: 'prospect' | 'retirement' | 'signing' | 'release' | 'market' | 'result' | 'business' | 'world' | 'event'
  fighterId?: Id
  fightId?: Id
  eventId?: Id
  /** 0–100 newsworthiness. */
  importance?: number
}

// ------------------------------------------------------ Player knowledge

/** Traits the player can scout. All except `marketability` are hidden engine truth. */
export type TraitKey = AttributeKey | 'discipline' | 'composure' | 'potential'

/** A belief about a hidden value: best guess and its uncertainty (standard deviation). */
export interface Estimate {
  mean: number
  sd: number
}

export type ScoutDepth = 'basic' | 'standard' | 'deep'

export interface ReportLogEntry {
  day: Day
  depth: ScoutDepth
  scoutName: string
}

/** Everything the PLAYER has learned about one fighter. Existence of an entry = fighter is discovered. */
export interface FighterKnowledge {
  fighterId: Id
  discoveredDay: Day
  source: 'public' | 'search' | 'roster' | 'tip'
  /** Posterior beliefs per scouted trait. Traits not present fall back to a public-information prior. */
  est: Partial<Record<TraitKey, Estimate>>
  /** 0–100: how well the player understands the fighter's personality. */
  insight: number
  reports: ReportLogEntry[]
  /** Number of weeks / fights of observation folded into the estimates. */
  observations: number
}

export interface Scout {
  id: Id
  name: string
  /** 1–100 raw ability. */
  quality: number
  /** 0–100; grows with every completed report. */
  experience: number
  /** Nations this scout knows well. */
  regionKnowledge: string[]
  /** Divisions this scout specialises in (empty = generalist). */
  divisions: WeightClassId[]
  weeklyWage: number
  reputation: number
  reportsDone: number
}

export interface ScoutAssignment {
  id: Id
  scoutId: Id
  kind: 'report' | 'search'
  fighterId?: Id
  depth?: ScoutDepth
  search?: { nation: string | null; weightClass: WeightClassId | null; level: 'regional' | 'wide' }
  startDay: Day
  completeDay: Day
  cost: number
  status: 'active' | 'done'
  summary?: string
}

// ------------------------------------------------------------------ Fights

export type FightStatus =
  | 'negotiating' | 'agreed' | 'scheduled' | 'training' | 'fightNight'
  | 'completed' | 'processed' | 'postFight' | 'cancelled'

/** KO = knockout (count out), TKO = referee stoppage, RTD = corner retirement, INJ = injury stoppage. */
export type FightMethod = 'UD' | 'MD' | 'SD' | 'DRAW' | 'MDRAW' | 'SDRAW' | 'KO' | 'TKO' | 'RTD' | 'INJ'

export type CampIntensity = 'light' | 'normal' | 'intense'
export type FightPlan = 'balanced' | 'aggressive' | 'cautious'

export interface FightPrep {
  intensity: CampIntensity
  plan: FightPlan
  /** Weeks of camp completed so far. */
  campWeeks: number
  /** Missed/struggled with weight (resolved at fight week). */
  weightIssue: boolean
  /** Minor camp injury carried into the fight. */
  nagging: boolean
}

export interface FightSide {
  fighterId: Id
  /** Promotion the fighter is contracted to (null for a free agent on a one-fight deal). */
  promotionId: Id | null
  prep: FightPrep
  /** Public snapshot at the time of the fight. */
  preRecord: string
  preRep: number
  prePop: number
}

/** Terms agreed with the opponent's camp (side B). Side A's purse comes from their own contract. */
export interface FightOffer {
  purseB: number
  winBonusB: number
  rematch: boolean
  venuePref: 'A' | 'B' | 'neutral'
  fights: 1 | 2
}

export interface FightTerms extends FightOffer {
  purseA: number
  winBonusA: number
}

export interface FightNegotiationRound {
  day: Day
  offer: FightOffer
  verdict: Verdict
  counter: FightOffer | null
  reasons: string[]
  mood: Mood
}

export interface FightNegotiation {
  patience: number
  rounds: FightNegotiationRound[]
  lastCounter: FightOffer | null
  status: 'open' | 'broken'
}

/**
 * Compact round record (only kept for fights the player is involved in).
 * t = [thrownA, landedA, powerThrownA, powerLandedA, thrownB, landedB, powerThrownB, powerLandedB]
 * k = [knockdowns scored by A, knockdowns scored by B]
 * s = judge scores [a1,b1,a2,b2,a3,b3]
 * b = [side who controlled (0=A,1=B,2=even), beat code]
 */
export interface RoundRec {
  t: number[]
  k: [number, number]
  s: number[]
  b: [number, number]
  /** Punishment taken by [A, B] this round, 0–9 (shown as a qualitative label only). */
  p: [number, number]
}

export interface FightResult {
  /** 0 = side A won, 1 = side B won, null = draw. */
  winner: 0 | 1 | null
  method: FightMethod
  round: number
  second: number
  /** Judges' totals [A, B] including deductions (decisions only; empty for stoppages). */
  cards: [number, number][]
  /** Knockdowns scored BY A and BY B. */
  kd: [number, number]
  /** Totals: [thrownA, landedA, powerThrownA, powerLandedA, thrownB, landedB, powerThrownB, powerLandedB]. */
  tot: number[]
  deductions: [number, number]
  rounds?: RoundRec[]
  /** Public, consequence-level pre-fight expectation for side A winning (from public standing). */
  pExpA: number
  dRep: [number, number]
  dPop: [number, number]
  /** Performance 0–1 for [A, B] (output-based). */
  perf: [number, number]
  injuries: [Injury | null, Injury | null]
  /** 0–100: how surprising and big the result was. */
  importance: number
  upset: number
}

export interface Fight {
  id: Id
  day: Day
  status: FightStatus
  kind: 'player' | 'ai'
  organiserId: Id
  sideA: FightSide
  sideB: FightSide
  weightClass: WeightClassId
  scheduledRounds: number
  terms: FightTerms
  venueId: Id | null
  city: string
  country: string
  createdDay: Day
  negotiation?: FightNegotiation
  result?: FightResult
  /** Purses/bonuses have been posted (guards against double payment). */
  paid: boolean
  processedDay?: Day
  cancelReason?: string
  /** Second fight of a two-fight deal. */
  seriesOf?: Id
  rematchOf?: Id
  /** The event card this fight is on. */
  eventId?: Id
  /** Event the player was building when approaching the opponent (auto-attached once agreed). */
  intendedEventId?: Id
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

  /** Archived (completed/terminated) contracts, newest first, capped. */
  contractHistory: Contract[]
  negotiations: Record<Id, Negotiation>
  obligations: Obligation[]

  // Player knowledge & scouting (what the PLAYER knows — distinct from engine truth in `fighters`)
  /** Every fight, historical and current (compact; AI fights drop round detail). */
  fights: Record<Id, Fight>
  /** Pair lock after collapsed talks: key `${idA}|${idB}` (sorted) → day until which they will not talk. */
  fightLocks: Record<string, Day>
  events: Record<Id, BoxingEvent>
  knowledge: Record<Id, FighterKnowledge>
  scouts: Scout[]
  scoutOps: ScoutAssignment[]
  shortlist: Id[]

  ledger: Transaction[]
  /** Sum of ledger entries that have aged out of `ledger`, so cash always reconciles. */
  ledgerArchive: number
  financeHistory: FinanceSnapshot[]
  inbox: InboxMessage[]
  news: NewsItem[]

  settings: GameSettings
}

export const GAME_STATE_VERSION = 5
