/** MEDIA_BEHAVIOUR: how each organisation acts. Keyed by id, never by brand. Identity lives in data/mediaIdentity.ts. */
import { mediaIdentity } from '../../data/mediaIdentity'
import { TITLE_DEFS } from '../business/titleDefs'
import type { BroadcastBehaviour, MediaBehaviour, MediaOrganisation, MediaState, RankingOrg, RelationState } from './types'

const B = (b: MediaBehaviour): MediaBehaviour => b

export const MEDIA_BEHAVIOURS: Record<string, MediaBehaviour> = {
  ringside: B({
    id: 'ringside', type: 'MAGAZINE', region: 'Global', influence: 90, credibility: 94, videoReach: 12, rankingAuthority: 92, controversyBias: 10,
    editorialStyle: 'SERIOUS', regionalReach: ['Global'], audience: 1_400_000, audienceGrowth: 0.0004, threshold: 42, lag: 1, weeklyCap: 4, appetite: 35,
    focus: { TITLE_CHANGE: 1.7, TITLE_DEFENCE: 1.4, TITLE_FIGHT_SET: 1.4, RANKING_CHANGE: 1.8, STRIPPED: 1.6, MANDATORY: 1.5, AWARD: 2, UPSET: 1.2, RETIREMENT: 1.4, SIGNING: 0.5, WEIGH_IN: 0.3, CALL_OUT: 0.4, VIRAL: 0.3, PPV_FAILURE: 0.8 },
    videos: [],
  }),
  fightwire: B({
    id: 'fightwire', type: 'NEWS_SITE', region: 'Global', influence: 72, credibility: 70, videoReach: 30, rankingAuthority: 0, controversyBias: 35,
    editorialStyle: 'BREAKING', regionalReach: ['Global'], audience: 3_200_000, audienceGrowth: 0.0012, threshold: 24, lag: 0, weeklyCap: 6, appetite: 55,
    focus: { UPSET: 1.4, KNOCKOUT: 1.3, SIGNING: 1.5, RELEASE: 1.3, TITLE_CHANGE: 1.3, FIGHT_ANNOUNCED: 1.3, CALL_OUT: 1.2, EVENT_CANCELLED: 1.4, BROADCAST_DEAL: 1.2 },
    videos: [],
  }),
  fightwiretv: B({
    id: 'fightwiretv', type: 'YOUTUBE', region: 'Global', influence: 66, credibility: 56, videoReach: 96, rankingAuthority: 0, controversyBias: 50,
    editorialStyle: 'HYPE', regionalReach: ['Global'], audience: 2_600_000, audienceGrowth: 0.0025, threshold: 22, lag: 0, weeklyCap: 5, appetite: 80,
    focus: { KNOCKOUT: 1.7, WAR: 1.6, UPSET: 1.4, VIRAL: 1.8, CALL_OUT: 1.4, WEIGH_IN: 1.5, PRESS_CONFERENCE: 1.5, RIVALRY: 1.4, TITLE_CHANGE: 1.2, FIGHT_RESULT: 0.9, RANKING_CHANGE: 0.4 },
    videos: ['FIGHT_HIGHLIGHTS', 'KO_COMPILATION', 'WEIGH_IN', 'PRESS_CONFERENCE', 'POST_FIGHT_INTERVIEW', 'RIVALRY_FEATURE'],
  }),
  fightroom: B({
    id: 'fightroom', type: 'YOUTUBE', region: 'Global', influence: 58, credibility: 46, videoReach: 78, rankingAuthority: 0, controversyBias: 88,
    editorialStyle: 'CONTROVERSIAL', regionalReach: ['Global'], audience: 1_900_000, audienceGrowth: 0.002, threshold: 28, lag: 0, weeklyCap: 4, appetite: 60,
    focus: { CONTROVERSIAL_DECISION: 2, UPSET: 1.5, CALL_OUT: 1.8, RIVALRY: 1.5, MANDATORY: 1.3, STRIPPED: 1.5, PPV_FAILURE: 1.6, EVENT_CANCELLED: 1.4, UNBEATEN_FELL: 1.4, SIGNING: 0.4 },
    videos: ['ANALYSIS', 'RIVALRY_FEATURE', 'FIGHT_HIGHLIGHTS'],
  }),
  insideropes: B({
    id: 'insideropes', type: 'JOURNALIST', region: 'Global', influence: 52, credibility: 82, videoReach: 40, rankingAuthority: 0, controversyBias: 18,
    editorialStyle: 'POSITIVE', regionalReach: ['Global'], audience: 700_000, audienceGrowth: 0.0008, threshold: 32, lag: 1, weeklyCap: 3, appetite: 92,
    focus: { PROSPECT_BREAKOUT: 1.8, COMEBACK: 1.7, RETIREMENT: 1.5, FEATURE: 2, SIGNING: 1.2, AWARD: 1.4, KNOCKOUT: 0.8, CALL_OUT: 0.5, WEIGH_IN: 0.5 },
    videos: ['FIGHTER_INTERVIEW', 'DOCUMENTARY', 'PROSPECT_FEATURE', 'POST_FIGHT_INTERVIEW'],
  }),
  boxingdaily: B({
    id: 'boxingdaily', type: 'NEWS_SITE', region: 'Global', influence: 60, credibility: 66, videoReach: 18, rankingAuthority: 0, controversyBias: 25,
    editorialStyle: 'TRADITIONAL', regionalReach: ['Global'], audience: 4_500_000, audienceGrowth: 0.0005, threshold: 20, lag: 0, weeklyCap: 7, appetite: 40,
    focus: { FIGHT_RESULT: 1.3, SELL_OUT: 1.3, RECORD_CROWD: 1.3, PPV_SUCCESS: 1.2, SIGNING: 1.0, RELEASE: 1.0, FIGHT_ANNOUNCED: 1.2, RETIREMENT: 1.1 },
    videos: [],
  }),
  boxingpodcast: B({
    id: 'boxingpodcast', type: 'PODCAST', region: 'Global', influence: 44, credibility: 72, videoReach: 35, rankingAuthority: 0, controversyBias: 40,
    editorialStyle: 'ANALYTICAL', regionalReach: ['Global'], audience: 520_000, audienceGrowth: 0.0015, threshold: 36, lag: 1, weeklyCap: 2, appetite: 70,
    focus: { RANKING_CHANGE: 1.3, TITLE_CHANGE: 1.2, FEATURE: 1.4, RIVALRY: 1.3, CONTROVERSIAL_DECISION: 1.3, UNBEATEN_FELL: 1.2, WEIGH_IN: 0.3 },
    videos: ['ANALYSIS'],
  }),
  worlddesk: B({
    id: 'worlddesk', type: 'NEWS_SITE', region: 'International', influence: 48, credibility: 74, videoReach: 14, rankingAuthority: 0, controversyBias: 15,
    editorialStyle: 'SERIOUS', regionalReach: ['WORLD', 'AMERICAS'], audience: 1_100_000, audienceGrowth: 0.0014, threshold: 26, lag: 0, weeklyCap: 4, appetite: 45,
    focus: { UPSET: 1.2, TITLE_CHANGE: 1.2, SELL_OUT: 1.2, BROADCAST_DEAL: 1.3, EVENT_CANCELLED: 1.3, SIGNING: 1.1 },
    videos: [],
  }),
  clipcorner: B({
    id: 'clipcorner', type: 'INFLUENCER', region: 'Global', influence: 40, credibility: 38, videoReach: 90, rankingAuthority: 0, controversyBias: 62,
    editorialStyle: 'FAN_DRIVEN', regionalReach: ['Global'], audience: 2_100_000, audienceGrowth: 0.0035, threshold: 30, lag: 0, weeklyCap: 3, appetite: 50,
    focus: { KNOCKOUT: 2, WAR: 1.8, VIRAL: 2, UPSET: 1.3, CALL_OUT: 1.3, WEIGH_IN: 1.4, FIGHT_RESULT: 0.4, RANKING_CHANGE: 0.2, SIGNING: 0.3 },
    videos: ['KO_COMPILATION', 'FIGHT_HIGHLIGHTS'],
  }),
  boxingindex: B({
    id: 'boxingindex', type: 'RANKING_ORGANISATION', region: 'Global', influence: 62, credibility: 80, videoReach: 10, rankingAuthority: 70, controversyBias: 12,
    editorialStyle: 'ANALYTICAL', regionalReach: ['Global'], audience: 640_000, audienceGrowth: 0.001, threshold: 38, lag: 1, weeklyCap: 2, appetite: 20,
    focus: { RANKING_CHANGE: 2, TITLE_CHANGE: 1.1, UNBEATEN_FELL: 1.2, UPSET: 1.2, FIGHT_RESULT: 0.5, SIGNING: 0.2, WEIGH_IN: 0.1, CALL_OUT: 0.2 },
    videos: [],
  }),
}

export const MEDIA_ORDER = Object.keys(MEDIA_BEHAVIOURS)

export const BROADCAST_BEHAVIOURS: Record<string, BroadcastBehaviour> = {
  meridian: { id: 'meridian', kind: 'TV', audience: 9_000_000, regionalReach: ['UKI', 'AMERICAS'], boxingInterest: 62, prestige: 82, budget: 1.0, exclusiveRights: true, ppvCapable: false, carries: ['nationalTv', 'localTv'] },
  worldfight: { id: 'worldfight', kind: 'STREAMING', audience: 6_500_000, regionalReach: ['Global'], boxingInterest: 80, prestige: 66, budget: 0.9, exclusiveRights: true, ppvCapable: false, carries: ['streaming'] },
  ringpass: { id: 'ringpass', kind: 'PPV', audience: 3_000_000, regionalReach: ['Global'], boxingInterest: 95, prestige: 70, budget: 1.1, exclusiveRights: false, ppvCapable: true, carries: ['ppv'] },
  unionsports: { id: 'unionsports', kind: 'CABLE', audience: 3_800_000, regionalReach: ['UKI'], boxingInterest: 55, prestige: 58, budget: 0.65, exclusiveRights: false, ppvCapable: false, carries: ['localTv', 'nationalTv'] },
  globeintl: { id: 'globeintl', kind: 'INTERNATIONAL', audience: 12_000_000, regionalReach: ['WORLD'], boxingInterest: 58, prestige: 74, budget: 0.8, exclusiveRights: false, ppvCapable: false, carries: ['streaming', 'nationalTv'] },
}
export const BROADCAST_ORDER = Object.keys(BROADCAST_BEHAVIOURS)

const W = (o: Partial<RankingOrg['methodology']>): RankingOrg['methodology'] => ({ opposition: 1, recent: 1, activity: 0.5, streak: 0.3, titles: 0.5, popularity: 0, losses: 1, idleWeeks: 40, ...o })

/** Methodology (how each body weighs results) — distinct per body so the lists disagree like real lists do. Game abstractions. */
const METHOD: Record<string, Partial<RankingOrg['methodology']>> = {
  atlas: { opposition: 0.9, recent: 1.1, activity: 0.9, streak: 0.4, titles: 0.8, losses: 1.0, idleWeeks: 36 },
  pioneer: { opposition: 0.7, recent: 0.9, activity: 1.2, streak: 0.8, titles: 0.7, popularity: 0.3, losses: 0.8, idleWeeks: 30 },
  crown: { opposition: 1.1, recent: 0.8, activity: 0.5, streak: 0.5, titles: 1.0, popularity: 0.2, losses: 1.1, idleWeeks: 48 },
  apex: { opposition: 1.0, recent: 1.0, activity: 0.7, streak: 0.5, titles: 0.9, popularity: 0.3, losses: 1.0, idleWeeks: 44 },
  european: { opposition: 1.0, recent: 1.0, activity: 0.9, streak: 0.5, titles: 0.8, popularity: 0.2, losses: 1.0, idleWeeks: 40 },
  british: { opposition: 0.8, recent: 1.1, activity: 1.1, streak: 0.6, titles: 0.8, popularity: 0.3, losses: 0.9, idleWeeks: 36 },
  commonwealth: { opposition: 0.9, recent: 1.0, activity: 1.0, streak: 0.5, titles: 0.7, popularity: 0.2, losses: 1.0, idleWeeks: 40 },
}
const AREA_METHOD: Partial<RankingOrg['methodology']> = { opposition: 0.6, recent: 1.1, activity: 1.3, streak: 0.8, titles: 0.6, popularity: 0.4, losses: 0.8, idleWeeks: 30 }
const AUTHORITY: Record<string, number> = { atlas: 78, pioneer: 70, crown: 66, apex: 64, european: 58, british: 52, commonwealth: 48 }
/** Update cadence: (every N weeks, offset). Spread so the lists do not all recompute in the same week. */
const CADENCE: Record<string, [number, number]> = {
  atlas: [4, 0], pioneer: [8, 4], crown: [8, 6], apex: [8, 2], european: [8, 1], british: [8, 3], commonwealth: [8, 5],
  area_wal: [12, 1], area_eng: [12, 3], area_nor: [12, 5], area_cen: [12, 7], area_mid: [12, 9], area_sou: [12, 11],
}

/** The sanctioning bodies come from the title definitions (data); one media ratings list and one independent index sit beside them. */
const SANCTIONING_ORGS: RankingOrg[] = TITLE_DEFS.map((d) => ({
  id: d.id, mediaOrgId: null, kind: 'OFFICIAL_BODY' as const, authority: AUTHORITY[d.id] ?? 40, methodology: W(METHOD[d.id] ?? AREA_METHOD),
  updateEveryWeeks: (CADENCE[d.id] ?? [12, 0])[0], offset: (CADENCE[d.id] ?? [12, 0])[1], rankingCount: d.rankingCount, active: true, sanctions: true, challengerLimit: d.challengerLimit,
  level: d.level, minPool: d.minPool, minFights: d.minFights,
}))

export const RANKING_ORGS: RankingOrg[] = [
  ...SANCTIONING_ORGS,
  { id: 'ringside', mediaOrgId: 'ringside', kind: 'MEDIA', authority: 92, methodology: W({ opposition: 1.8, recent: 1.0, activity: 0.35, streak: 0.2, titles: 0.6, popularity: 0, losses: 0.9, idleWeeks: 52 }), updateEveryWeeks: 4, offset: 2, rankingCount: 10, active: true, sanctions: false, challengerLimit: 0 },
  { id: 'index', mediaOrgId: 'boxingindex', kind: 'INDEPENDENT', authority: 55, methodology: W({ opposition: 1.2, recent: 1.4, activity: 0.7, streak: 0.6, titles: 0.2, popularity: 0.6, losses: 1.0, idleWeeks: 40 }), updateEveryWeeks: 12, offset: 8, rankingCount: 10, active: true, sanctions: false, challengerLimit: 0 },
]
export const RANK_ORG_BY_ID: Record<string, RankingOrg> = Object.fromEntries(RANKING_ORGS.map((r) => [r.id, r]))
export const SANCTIONING = RANKING_ORGS.filter((r) => r.sanctions)
/** The ranking list the game treats as the headline media ranking (shown in fighter lists and profiles). */
export const PRIMARY_RANKING = 'ringside'

// ------------------------------------------------------------------ helpers

export function orgOf(media: MediaState, id: string): MediaOrganisation {
  const b = MEDIA_BEHAVIOURS[id]
  const s = media.orgs[id]
  const { audience, audienceGrowth, ...rest } = b
  return { ...mediaIdentity(id), ...rest, audienceSize: s?.audience ?? audience, audienceGrowth: s?.growth ?? audienceGrowth, influence: s?.influence ?? b.influence, credibility: s?.credibility ?? b.credibility, active: s?.active ?? true }
}

export function relationState(v: number): RelationState {
  return v <= -60 ? 'HOSTILE' : v <= -20 ? 'COLD' : v < 20 ? 'NEUTRAL' : v < 50 ? 'POSITIVE' : v < 80 ? 'STRONG' : 'EXCLUSIVE'
}

export function relKey(orgId: string, subjectId: string): string { return `${orgId}|${subjectId}` }
export function relationOf(media: MediaState, orgId: string, subjectId: string): number { return media.rel[relKey(orgId, subjectId)] ?? 0 }
export function shiftRelation(media: MediaState, orgId: string, subjectId: string, delta: number): number {
  const k = relKey(orgId, subjectId)
  const v = Math.max(-100, Math.min(100, Math.round(((media.rel[k] ?? 0) + delta) * 10) / 10))
  if (Math.abs(v) < 0.5) delete media.rel[k]
  else media.rel[k] = v
  return v
}
