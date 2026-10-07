/**
 * MEDIA WORLD — data model.
 *
 * Everything the living media world remembers is plain JSON under `GameState.media`. It is a CONSEQUENCE layer: the engine
 * (fights, events, contracts, ledger) stays the source of truth; the media world reads what happened, interprets it, and
 * feeds a small, bounded set of public-facing values (popularity, demand buzz, broadcast offers) back into the game.
 *
 * Identity (names, colours, logos), behaviour (editorial style, reach, thresholds) and dynamic state (audience, credibility,
 * relationships) are deliberately separate so licensed organisations can replace the fictional ones without touching the engine.
 */
import type { BroadcastKind, Day, Id, WeightClassId } from '../types'

// ------------------------------------------------------------ Organisations

export const MEDIA_TYPES = ['MAGAZINE', 'NEWS_SITE', 'YOUTUBE', 'PODCAST', 'JOURNALIST', 'INFLUENCER', 'BROADCASTER', 'RANKING_ORGANISATION'] as const
export type MediaType = (typeof MEDIA_TYPES)[number]

export const EDITORIAL_STYLES = ['SERIOUS', 'BREAKING', 'ANALYTICAL', 'CONTROVERSIAL', 'POSITIVE', 'NEGATIVE', 'HYPE', 'TRADITIONAL', 'FAN_DRIVEN', 'INVESTIGATIVE'] as const
export type EditorialStyle = (typeof EDITORIAL_STYLES)[number]

/** MEDIA_IDENTITY: how an organisation looks and is called. Swappable (see docs/MEDIA_WORLD.md → Licensed Media Integration). */
export interface MediaIdentity {
  id: string
  name: string
  shortName: string
  tagline: string
  /** Brand colours (hex). */
  colour: string
  accent: string
  /** MEDIA_ASSET: key into the asset registry for a logo, or null to use the generated monogram fallback. */
  logoAsset: string | null
  handle: string
}

/** MEDIA_BEHAVIOUR: how an organisation acts. Never mentions a brand name. */
export interface MediaBehaviour {
  id: string
  type: MediaType
  region: string
  /** 0–100 */
  influence: number
  credibility: number
  videoReach: number
  /** How much its rankings move opinion (0 = does not publish rankings). */
  rankingAuthority: number
  controversyBias: number
  editorialStyle: EditorialStyle
  /** Regions it covers best ('Global' = everywhere). */
  regionalReach: string[]
  audience: number
  audienceGrowth: number
  /** Minimum significance (0–100) before it bothers to cover something. */
  threshold: number
  /** Weeks between an event and its coverage (0 = same week). */
  lag: number
  /** Most stories it can publish in a week. */
  weeklyCap: number
  /** How keen it is to ask for interviews / access (0–100). */
  appetite: number
  /** Story kinds it favours (×) or ignores (<1). */
  focus: Partial<Record<StoryKind, number>>
  /** Video formats it produces. */
  videos: VideoType[]
}

/** Dynamic per-save state of an organisation. */
export interface MediaOrgState {
  id: string
  audience: number
  influence: number
  credibility: number
  growth: number
  active: boolean
}

/** The merged view the engine and UI work with. */
export interface MediaOrganisation extends MediaIdentity, Omit<MediaBehaviour, 'audience' | 'audienceGrowth'> {
  audienceSize: number
  audienceGrowth: number
  active: boolean
}

export type RelationState = 'HOSTILE' | 'COLD' | 'NEUTRAL' | 'POSITIVE' | 'STRONG' | 'EXCLUSIVE'

// ------------------------------------------------------------------ Stories

export type StoryKind =
  | 'FIGHT_RESULT' | 'UPSET' | 'KNOCKOUT' | 'WAR' | 'TITLE_CHANGE' | 'TITLE_DEFENCE' | 'TITLE_FIGHT_SET' | 'CONTROVERSIAL_DECISION'
  | 'UNBEATEN_FELL' | 'PROSPECT_BREAKOUT' | 'COMEBACK' | 'RETIREMENT' | 'SIGNING' | 'RELEASE' | 'RANKING_CHANGE' | 'MANDATORY'
  | 'SELL_OUT' | 'RECORD_CROWD' | 'PPV_SUCCESS' | 'PPV_FAILURE' | 'BROADCAST_DEAL' | 'WEIGH_IN' | 'CALL_OUT' | 'RIVALRY'
  | 'FIGHT_ANNOUNCED' | 'PRESS_CONFERENCE' | 'VIRAL' | 'AWARD' | 'EVENT_CANCELLED' | 'FEATURE' | 'STRIPPED' | 'TITLE_VACANT'

export type StoryPriority = 'BREAKING' | 'MAJOR' | 'FEATURE' | 'NEWS' | 'RUMOUR'

export type FactValue = string | number | boolean | null
export type Facts = Record<string, FactValue>

export interface MediaStory {
  id: string
  /** World week (weeks since the game began). */
  worldWeek: number
  day: Day
  kind: StoryKind
  priority: StoryPriority
  importance: number
  organisationId: string
  headline: string
  subheadline: string
  body: string
  relatedFighterIds: Id[]
  relatedPromotionIds: Id[]
  relatedEventId?: Id
  relatedFightId?: Id
  relatedVenueId?: Id
  /** The structured facts the text was written from. Nothing in headline/body is absent from here or from game state. */
  facts: Facts
  expiresAt: number
  /** −1 (negative) … +1 (positive) for the fighters involved. */
  sentiment: number
  reach: number
  isBreaking: boolean
  isRead: boolean
}

/** What is saved. Text is rebuilt from `facts` (shared per event, in `MediaState.fx`) so a story costs ~200 bytes, not ~1 KB. */
export interface StoredStory {
  id: string
  w: number
  d: Day
  k: StoryKind
  p: StoryPriority
  i: number
  o: string
  /** Fighter ids and promotion ids, comma-joined (fewer objects to clone). */
  ps: string
  pr: string
  ev?: Id
  ft?: Id
  ve?: Id
  /** Key into `MediaState.fx`. */
  fx: string
  /** Template variant and tone used. */
  v: number
  t: 'neutral' | 'loud' | 'edgy' | 'warm'
  /** Sentences of body this outlet runs. */
  n: number
  x: number
  s: number
  r: number
  b: 0 | 1
  rd: 0 | 1
}

/** A permanent, compact record of something historic (kept after the story itself expires). */
export interface HistoryRec { w: number; day: Day; k: StoryKind; imp: number; h: string; ps: Id[]; fn?: string[] }

// --------------------------------------------------------------- Narratives

export const NARRATIVE_TYPES = [
  'RIVALRY', 'RISING_STAR', 'FALLING_STAR', 'COMEBACK', 'UNBEATEN_RUN', 'CHAMPIONSHIP_HUNT', 'MANDATORY_CHALLENGE', 'AVOIDANCE', 'CALL_OUT',
  'CONTROVERSY', 'PROSPECT_HYPE', 'TITLE_REIGN', 'LEGACY', 'RETIREMENT', 'UPSET_STORY', 'KO_ARTIST', 'DIVISION_DOMINANCE',
] as const
export type NarrativeType = (typeof NARRATIVE_TYPES)[number]

export interface Narrative {
  id: string
  type: NarrativeType
  status: 'active' | 'resolved' | 'expired'
  /** Fighters at the heart of it. */
  participants: Id[]
  /** Names at creation (fighters can be pruned later). */
  names: string[]
  strength: number
  startWeek: number
  lastUpdatedWeek: number
  /** −10…+10: growing or fading. */
  momentum: number
  mediaAttention: number
  fanInterest: number
  relatedEvents: Id[]
  relatedStories: string[]
  /** It expires after this many quiet weeks. */
  expiryRules: { quietWeeks: number; maxWeeks: number }
  division?: WeightClassId
  facts: Facts
  /** Outcome text keyed to facts, set when resolved. */
  outcome?: string
  endWeek?: number
}

/** A resolved storyline, kept for the record. */
export interface DoneNarrative { id: string; type: NarrativeType; participants: Id[]; names: string[]; startWeek: number; endWeek: number; outcome: string; status: 'resolved' | 'expired' }

// ------------------------------------------------------------ Public profile

export interface FighterMedia {
  /** Media interest 0–100: how much the press cares right now (decays fast). */
  interest: number
  /** Fanbase (people), grows with success, shrinks slowly. */
  fanbase: number
  /** Social followers (aggregate across platforms). */
  followers: number
  engagement: number
  /** Week of the last coverage. */
  lastCovered: number
  /** Change in interest over the last week (trend). */
  trend: number
  /** Live viral spike: points currently added to public popularity, and the week they are gone. */
  viral?: { pts: number; from: number; until: number }
  stories: number
}

export interface PromotionMedia {
  sporting: number
  media: number
  fan: number
  commercial: number
  /** Public reputation tags, each backed by counted behaviour. */
  tags: string[]
  mentions: number
}

// -------------------------------------------------------------- Rankings

export type RankingKind = 'OFFICIAL_BODY' | 'MEDIA' | 'INDEPENDENT'

export interface RankingMethod {
  /** Weights (relative). */
  opposition: number
  recent: number
  activity: number
  streak: number
  titles: number
  popularity: number
  losses: number
  /** Weeks of inactivity before the activity penalty bites. */
  idleWeeks: number
}

export interface RankingOrg {
  id: string
  /** Links to the identity pack (name, colours) and, for media rankings, to the publishing outlet. */
  mediaOrgId: string | null
  kind: RankingKind
  authority: number
  methodology: RankingMethod
  updateEveryWeeks: number
  /** Week offset inside the cycle so the lists do not all update together. */
  offset: number
  rankingCount: number
  active: boolean
  /** True for bodies that sanction championships. */
  sanctions: boolean
  /** Rank limit for a title challenge (champion defends against a contender at or above this). */
  challengerLimit: number
}

export type RankReasonKind = 'beat' | 'lost' | 'drew' | 'inactive' | 'new' | 'rose' | 'fell' | 'title' | 'stripped' | 'vacated' | 'same'
export interface RankReason { k: RankReasonKind; /** opponent id */ o?: Id; /** opponent's previous rank in this list */ or?: number }
/** `why` is stored as a compact string: `kind` or `kind:opponentId:opponentRank` (see rankings.ts encode/decode). */
export interface RankEntry { f: Id; r: number; p: number | null; why: string }
export interface RankList { u: Day; e: RankEntry[] }

export interface TitleRec {
  /** Champion (null = vacant). */
  c: Id | null
  cn?: string
  since: Day
  defences: number
  lastFight: Day
  /** Mandatory challenge ordered by the body. */
  mand?: { challenger: Id; cn: string; ordered: Day; due: Day }
  vacantSince?: Day
}

export interface Reign { b: string; wc: WeightClassId; f: Id; fn: string; from: Day; to: Day | null; defences: number; how: string }

// -------------------------------------------------------------------- Video

export type VideoType =
  | 'FIGHT_HIGHLIGHTS' | 'POST_FIGHT_INTERVIEW' | 'FIGHTER_INTERVIEW' | 'PRESS_CONFERENCE' | 'WEIGH_IN' | 'ANALYSIS'
  | 'KO_COMPILATION' | 'DOCUMENTARY' | 'RIVALRY_FEATURE' | 'PROSPECT_FEATURE'

export interface MediaVideo {
  id: string
  organisationId: string
  type: VideoType
  title: string
  publishedWeek: number
  fighterIds: Id[]
  fightId?: Id
  eventId?: Id
  views: number
  likes: number
  engagement: number
  reach: number
  viralScore: number
}

export interface ViralMoment {
  id: string
  kind: string
  headline: string
  week: number
  until: number
  fighterIds: Id[]
  fightId?: Id
  strength: number
}

// ------------------------------------------------------- Requests / pressers

export type RequestKind = 'INTERVIEW' | 'POST_FIGHT_INTERVIEW' | 'WEIGH_IN_INTERVIEW' | 'PODCAST' | 'DOCUMENTARY' | 'TRAINING_CAMP' | 'PROMO_VIDEO'
export type RequestStatus = 'open' | 'accepted' | 'declined' | 'redirected' | 'expired'

export interface MediaRequest {
  id: string
  organisationId: string
  kind: RequestKind
  fighterId: Id
  fighterName: string
  eventId?: Id
  createdWeek: number
  expiresWeek: number
  status: RequestStatus
  altFighterId?: Id
  /** What happened when it was answered (plain text built from the effects). */
  result?: string
}

export type PressApproach = 'RESPECTFUL' | 'CONFIDENT' | 'AGGRESSIVE' | 'CONTROVERSIAL' | 'DIPLOMATIC'

export interface PressConference {
  id: string
  eventId: Id
  fightId: Id
  /** Fighter on the player's side first (if any). */
  fighterIds: [Id, Id]
  names: [string, string]
  createdWeek: number
  expiresWeek: number
  status: 'open' | 'done' | 'expired'
  approach?: PressApproach
  result?: { hype: number; rivalry: number; interest: number; relationship: number; controversy: boolean; text: string }
}

// ------------------------------------------------------------- Broadcast

export type BroadcasterKind = 'STREAMING' | 'TV' | 'PPV' | 'CABLE' | 'INTERNATIONAL'
export type RightsKind = 'EVENT' | 'EXCLUSIVE' | 'REGIONAL' | 'INTERNATIONAL' | 'PPV_DISTRIBUTION' | 'STREAMING'

export interface BroadcastBehaviour {
  id: string
  kind: BroadcasterKind
  audience: number
  regionalReach: string[]
  boxingInterest: number
  prestige: number
  budget: number
  exclusiveRights: boolean
  ppvCapable: boolean
  /** Event kinds it can put the show on. */
  carries: BroadcastKind[]
}
export interface BroadcastOrgState { id: string; audience: number; budget: number; boxingInterest: number; active: boolean; /** No offers until this week (after a deal is released). */ cool?: number }

export interface BroadcastOffer {
  id: string
  organisationId: string
  eventId: Id
  rights: RightsKind
  /** The existing broadcast option the event will use if accepted. */
  kind: BroadcastKind
  guaranteed: number
  /** £ per viewer above the minimum audience (TV/streaming), or the promoter's PPV share (0–1) for PPV distribution. */
  share: number
  minAudience: number
  /** Venue production level the broadcaster requires (1–5). */
  productionReq: number
  exclusive: boolean
  territory: string
  createdWeek: number
  expiresWeek: number
  status: 'open' | 'accepted' | 'declined' | 'expired' | 'void'
  /** The figures it was priced from (public). */
  basis: { interest: number; mainEvent: string; relationship: number }
}

export interface BroadcastDeal {
  organisationId: string
  offerId: string
  rights: RightsKind
  kind: BroadcastKind
  guaranteed: number
  share: number
  minAudience: number
  exclusive: boolean
  territory: string
  acceptedWeek: number
}

// ---------------------------------------------------------------- Awards / career

export type AwardCategory =
  | 'FIGHTER_OF_THE_YEAR' | 'FIGHT_OF_THE_YEAR' | 'KO_OF_THE_YEAR' | 'PROSPECT_OF_THE_YEAR' | 'UPSET_OF_THE_YEAR'
  | 'COMEBACK_OF_THE_YEAR' | 'EVENT_OF_THE_YEAR' | 'PROMOTER_OF_THE_YEAR'

export interface AwardRec {
  year: number
  category: AwardCategory
  fighterId?: Id
  fighterName?: string
  fightId?: Id
  eventId?: Id
  promotionId?: Id
  label: string
  /** Real figures behind the choice. */
  facts: Facts
  organisationId: string
}

export interface YearLog {
  year: number
  fighters: Record<Id, { pts: number; wins: number; ranked: number; n: string }>
  bestFight: { id: Id; score: number; label: string; ps: [Id, Id] } | null
  bestKo: { id: Id; score: number; label: string; f: Id; n: string } | null
  bestUpset: { id: Id; score: number; label: string; f: Id; n: string } | null
  bestEvent: { id: Id; score: number; label: string; pr: Id } | null
  comebacks: Record<Id, { n: string; pts: number }>
  prospects: Record<Id, { n: string; pts: number }>
  promos: Record<Id, number>
  /** Nominations already announced this year. */
  nominated?: boolean
}

export type CareerCode =
  | 'START' | 'SIGNED' | 'RANKED' | 'TOP5' | 'NO1' | 'UPSET' | 'KO_STREAK' | 'TITLE_WON' | 'TITLE_DEFENCE' | 'TITLE_LOST'
  | 'FIRST_LOSS' | 'UNBEATEN' | 'COMEBACK' | 'RETIRED' | 'AWARD' | 'RIVALRY' | 'VIRAL' | 'MAIN_EVENT' | 'RELEASED'
export interface CareerEntry { d: Day; k: CareerCode; /** text fragment (opponent / title / award name) */ a?: string; /** number (rank, streak, defences) */ n?: number }

// -------------------------------------------------------------------- State

export interface MediaState {
  /** Save format of this block. */
  v: number
  /** Last processed world week. */
  week: number
  /** Id counter for media entities (kept separate from the game's so media can never shift engine ids). */
  n: number
  /** When false, media only observes (no coupling back into popularity, demand or AI booking). */
  effects: boolean
  /** Fight / event ids already turned into world events (bounded). */
  seenFights: Id[]
  seenEvents: Id[]
  orgs: Record<string, MediaOrgState>
  bcOrgs: Record<string, BroadcastOrgState>
  rankOrgs: Record<string, { active: boolean }>
  stories: StoredStory[]
  /** Structured facts per covered event (shared by every outlet's story about it). */
  fx: Record<string, Facts>
  /** Packed JSON (see packed.ts): HistoryRec[] newest first. */
  history: string
  narratives: Narrative[]
  /** Packed JSON: DoneNarrative[] newest first. */
  narrativesDone: string
  fighters: Record<Id, FighterMedia>
  promotions: Record<Id, PromotionMedia>
  /** Non-zero relationships: `${orgId}|${subjectId}` → −100…100 (subject = promotion or fighter id). */
  rel: Record<string, number>
  /** Packed JSON RankList per ranking organisation and division. */
  rankings: Record<string, Partial<Record<WeightClassId, string>>>
  titles: Record<string, TitleRec>
  titleFights: Record<Id, string[]>
  /** Packed JSON: Reign[] newest first. */
  reigns: string
  videos: MediaVideo[]
  viral: ViralMoment[]
  requests: MediaRequest[]
  pressers: PressConference[]
  offers: BroadcastOffer[]
  deals: Record<Id, BroadcastDeal>
  /** Media hype added to an event by press conferences (0–12). */
  eventHype: Record<Id, number>
  /** Pairs of fighters with a media rivalry: `${a}|${b}` (sorted) → strength 0–100. */
  rivalry: Record<string, number>
  /** Packed JSON: AwardRec[] newest first. */
  awards: string
  yearLog: YearLog
  /** Packed JSON CareerEntry[] per fighter. */
  career: Record<Id, string>
  /** Per-fighter record snapshots used for streaks (compact). */
  lastCovered: Record<string, number>
}
