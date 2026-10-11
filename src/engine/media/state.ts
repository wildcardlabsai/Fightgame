/** Creation, migration and bounds of the media block. */
import { BROADCAST_BEHAVIOURS, BROADCAST_ORDER, MEDIA_BEHAVIOURS, MEDIA_ORDER, RANKING_ORGS } from './orgs'
import type { GameState } from '../types'
import type { MediaState, YearLog } from './types'
import { yearOf } from '../calendar'

export const MEDIA_FORMAT = 1

/**
 * `seenFights` is the media pass's memory of what it has already read: fight ids AND the award marks (`a:`) share it, and a fight stays eligible for 28 days after it
 * is settled, so the memory has to outlast that window at any realistic bout rate. At 90 it held only ~25 fights (the award marks took the rest) and a fight
 * settled exactly 28 days earlier could be read a second time (Phase 6.5: more bouts made it visible).
 */
export const LIMITS = {
  stories: 80, history: 120, narratives: 90, narrativesDone: 70, videos: 60, viral: 24, requests: 30, pressers: 12, offers: 24, awards: 160,
  reigns: 1200, career: 22, seenFights: 240, seenEvents: 30, fighters: 400, rel: 160,
} as const

export function freshYearLog(year: number): YearLog {
  return { year, fighters: {}, bestFight: null, bestKo: null, bestUpset: null, bestEvent: null, comebacks: {}, prospects: {}, promos: {} }
}

export function freshMedia(state: Pick<GameState, 'today'>): MediaState {
  return {
    v: MEDIA_FORMAT, week: -1, n: 0, effects: true, seenFights: [], seenEvents: [],
    orgs: Object.fromEntries(MEDIA_ORDER.map((id) => { const b = MEDIA_BEHAVIOURS[id]; return [id, { id, audience: b.audience, influence: b.influence, credibility: b.credibility, growth: b.audienceGrowth, active: true }] })),
    bcOrgs: Object.fromEntries(BROADCAST_ORDER.map((id) => { const b = BROADCAST_BEHAVIOURS[id]; return [id, { id, audience: b.audience, budget: b.budget, boxingInterest: b.boxingInterest, active: true }] })),
    rankOrgs: Object.fromEntries(RANKING_ORGS.map((r) => [r.id, { active: r.active }])),
    stories: [], fx: {}, history: '[]', narratives: [], narrativesDone: '[]', fighters: {}, promotions: {}, rel: {}, rankings: {}, titles: {}, titleFights: {}, reigns: '[]',
    videos: [], viral: [], requests: [], pressers: [], offers: [], deals: {}, eventHype: {}, rivalry: {}, awards: '[]', yearLog: freshYearLog(yearOf(state.today)), career: {}, lastCovered: {},
  }
}
