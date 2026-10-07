/**
 * MEDIA VIEWS — the only gateway from the media world to the UI. Everything here is public: stories (rebuilt from recorded facts),
 * rankings, titles, careers, public popularity numbers, the player's own requests and offers. No hidden attribute, potential,
 * private contract or AI plan can pass through this file.
 */
import { bodyIdentity, broadcasterIdentity, mediaIdentity, rankingIdentity } from '../../data/mediaIdentity'
import { weightClassLabel, WEIGHT_CLASSES } from '../../data/weightClasses'
import { formatDay, yearOf } from '../calendar'
import { eventInterest } from '../events/demand'
import { fighterName } from '../fighters'
import type { Fighter, GameState, Id, WeightClassId } from '../types'
import { AWARD_LABEL } from './awards'
import { BROADCAST_BEHAVIOURS, MEDIA_BEHAVIOURS, MEDIA_ORDER, PRIMARY_RANKING, RANKING_ORGS, RANK_ORG_BY_ID, SANCTIONING, relationOf, relationState } from './orgs'
import { PERSONA_LABEL, personaOf } from './persona'
import { commercialValue, mediaOf, sportingCredibility, trendingOf } from './popularity'
import { decodeWhy, rankIn } from './rankings'
import { reasonText } from './reasons'
import { getAwards, getCareer, getHistory, getList, getReigns } from './records'
import { REQUEST_LABEL, approachInfo, rosterOf } from './requests'
import { expandStory } from './stories'
import { titleName, titlesHeldBy } from './titles'
import { narrativeLabel } from './narratives'
import { promoMediaOf } from './promos'
import type { MediaStory, NarrativeType, PressApproach, RelationState, StoryKind, StoryPriority, TitleRec } from './types'
import { pairKey } from './util'
import { territoryLabel } from './broadcast'

export interface OrgBadge { id: string; name: string; shortName: string; tagline: string; colour: string; accent: string; logoAsset: string | null; type: string; handle: string }
export interface StoryView {
  id: string; kind: StoryKind; priority: StoryPriority; importance: number; org: OrgBadge; headline: string; sub: string; body: string
  people: { id: Id; name: string }[]; fightId?: Id; eventId?: Id; weeksAgo: number; day: number; breaking: boolean; sentiment: number; reach: number; read: boolean
}

const badge = (id: string): OrgBadge => { const i = mediaIdentity(id); return { id, name: i.name, shortName: i.shortName, tagline: i.tagline, colour: i.colour, accent: i.accent, logoAsset: i.logoAsset, type: MEDIA_BEHAVIOURS[id]?.type ?? 'NEWS_SITE', handle: i.handle } }
const weekNow = (state: GameState) => Math.floor((state.today - state.startDay) / 7)
const nameOf = (state: GameState, id: Id): string => fighterName(state.fighters[id] ?? { firstName: 'Unknown', lastName: 'fighter' })

function storyView(state: GameState, s: MediaStory): StoryView {
  return {
    id: s.id, kind: s.kind, priority: s.priority, importance: s.importance, org: badge(s.organisationId), headline: s.headline, sub: s.subheadline, body: s.body,
    people: s.relatedFighterIds.map((id) => ({ id, name: nameOf(state, id) })), fightId: s.relatedFightId, eventId: s.relatedEventId, weeksAgo: Math.max(0, weekNow(state) - s.worldWeek), day: s.day,
    breaking: s.isBreaking, sentiment: s.sentiment, reach: s.reach, read: s.isRead,
  }
}

/** Live stories, newest and most important first, with their text rebuilt from the recorded facts. */
export function storiesList(state: GameState, opts: { fighterId?: Id; eventId?: Id; fightId?: Id; kinds?: StoryKind[]; limit?: number } = {}): StoryView[] {
  const media = state.media
  if (!media) return []
  const out: StoryView[] = []
  for (const s of media.stories) {
    if (opts.fighterId && !s.ps.split(',').includes(opts.fighterId)) continue
    if (opts.eventId && s.ev !== opts.eventId) continue
    if (opts.fightId && s.ft !== opts.fightId) continue
    if (opts.kinds && !opts.kinds.includes(s.k)) continue
    const full = expandStory(media, s)
    if (full) out.push(storyView(state, full))
    if (opts.limit && out.length >= opts.limit * 3) break
  }
  out.sort((a, b) => a.weeksAgo - b.weeksAgo || b.importance - a.importance)
  return out.slice(0, opts.limit ?? 60)
}

// ------------------------------------------------------------------- videos

export interface VideoView { id: string; org: OrgBadge; type: string; title: string; views: number; likes: number; engagement: number; viralScore: number; weeksAgo: number; names: string[]; fightId?: Id }
const VIDEO_LABEL: Record<string, string> = { FIGHT_HIGHLIGHTS: 'HIGHLIGHTS', POST_FIGHT_INTERVIEW: 'POST-FIGHT', FIGHTER_INTERVIEW: 'INTERVIEW', PRESS_CONFERENCE: 'PRESS CONFERENCE', WEIGH_IN: 'WEIGH-IN', ANALYSIS: 'ANALYSIS', KO_COMPILATION: 'KO REEL', DOCUMENTARY: 'DOCUMENTARY', RIVALRY_FEATURE: 'RIVALRY', PROSPECT_FEATURE: 'PROSPECT' }
export function videosList(state: GameState, opts: { fighterId?: Id; limit?: number } = {}): VideoView[] {
  const media = state.media
  if (!media) return []
  const out = media.videos.filter((v) => !opts.fighterId || v.fighterIds.includes(opts.fighterId)).map((v) => ({
    id: v.id, org: badge(v.organisationId), type: VIDEO_LABEL[v.type] ?? v.type, title: v.title, views: v.views, likes: v.likes, engagement: v.engagement, viralScore: v.viralScore,
    weeksAgo: Math.max(0, weekNow(state) - v.publishedWeek), names: v.fighterIds.map((id) => nameOf(state, id)), fightId: v.fightId,
  }))
  return out.sort((a, b) => a.weeksAgo - b.weeksAgo || b.views - a.views).slice(0, opts.limit ?? 12)
}

// --------------------------------------------------------------- narratives

export interface NarrativeView { id: string; type: NarrativeType; label: string; names: string[]; fighterIds: Id[]; strength: number; trend: 'RISING' | 'STEADY' | 'FADING'; media: number; fans: number; weeks: number; line: string; fightId?: Id }
const NARRATIVE_LINE: Record<NarrativeType, (n: string[], f: Record<string, unknown>) => string> = {
  RIVALRY: (n, f) => `${n[0]} and ${n[1]} — ${f.fights ?? 1} fight${Number(f.fights ?? 1) === 1 ? '' : 's'} on the record and the public wants more`,
  RISING_STAR: (n) => `${n[0]} is climbing the ratings`, FALLING_STAR: (n) => `${n[0]} is losing ground`, COMEBACK: (n, f) => `${n[0]} is back on the rise ${f.how ?? ''}`.trim(),
  UNBEATEN_RUN: (n, f) => `${n[0]} is unbeaten at ${f.wins ?? '?'}-0`, CHAMPIONSHIP_HUNT: (n, f) => `${n[0]} is the leading ${f.div ?? ''} contender`.replace('  ', ' '),
  MANDATORY_CHALLENGE: (n, f) => `${f.body ?? 'The body'} want ${n[0]} to face ${n[1]}`, AVOIDANCE: (n) => `${n[0]} has yet to agree terms with ${n[1]}`,
  CALL_OUT: (n) => `${n[0]} has called out ${n[1]}`, CONTROVERSY: (n) => `The result of ${n[0]} v ${n[1]} is still being argued`, PROSPECT_HYPE: (n) => `${n[0]} is the prospect everyone is talking about`,
  TITLE_REIGN: (n, f) => `${n[0]} is champion${f.defences ? `, ${f.defences} defence${Number(f.defences) === 1 ? '' : 's'} so far` : ''}`, LEGACY: (n) => `${n[0]}'s career in review`, RETIREMENT: (n) => `${n[0]} retires`,
  UPSET_STORY: (n, f) => `${n[0]}'s ${f.over ? `win over ${f.over}` : 'upset'} is the talk of the sport`, KO_ARTIST: (n, f) => `${n[0]} has stopped ${f.kos ?? 'many'} opponents`, DIVISION_DOMINANCE: (n, f) => `${n[0]} rules the division with ${f.defences ?? '?'} defences`,
}
export function narrativesList(state: GameState, opts: { fighterId?: Id; limit?: number; type?: NarrativeType } = {}): NarrativeView[] {
  const media = state.media
  if (!media) return []
  const week = weekNow(state)
  return media.narratives.filter((n) => n.status === 'active' && (!opts.fighterId || n.participants.includes(opts.fighterId)) && (!opts.type || n.type === opts.type))
    .sort((a, b) => b.strength - a.strength || (a.id < b.id ? -1 : 1)).slice(0, opts.limit ?? 12)
    .map((n) => ({
      id: n.id, type: n.type, label: narrativeLabel(n.type), names: n.names, fighterIds: n.participants, strength: Math.round(n.strength), trend: n.momentum > 1.5 ? 'RISING' : n.momentum < -1.5 || n.strength < 20 ? 'FADING' : 'STEADY',
      media: Math.round(n.mediaAttention), fans: Math.round(n.fanInterest), weeks: Math.max(0, week - n.startWeek), line: NARRATIVE_LINE[n.type](n.names, n.facts), fightId: n.relatedEvents[0],
    }))
}

export interface RivalryView { a: Id; b: Id; aName: string; bName: string; strength: number; label: string }
export function rivalriesList(state: GameState, opts: { fighterId?: Id; limit?: number } = {}): RivalryView[] {
  const media = state.media
  if (!media) return []
  return Object.entries(media.rivalry).filter(([k, v]) => v >= 20 && (!opts.fighterId || k.split('|').includes(opts.fighterId)))
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, opts.limit ?? 8)
    .map(([k, v]) => { const [a, b] = k.split('|'); return { a, b, aName: nameOf(state, a), bName: nameOf(state, b), strength: Math.round(v), label: v >= 70 ? 'BITTER' : v >= 45 ? 'HEATED' : 'BUILDING' } })
}

// --------------------------------------------------------------- trending

export interface TrendingView { id: Id; name: string; division: string; interest: number; trend: string; popularity: number; rank: string | null; mine: boolean }
export function trendingList(state: GameState, limit = 8): TrendingView[] {
  const media = state.media
  if (!media) return []
  const mine = new Set(rosterOf(state).map((f) => f.id))
  const week = weekNow(state)
  return Object.entries(media.fighters).map(([id, m]) => ({ id, m, f: state.fighters[id] })).filter((x) => x.f && x.f.status === 'active')
    .sort((a, b) => b.m.interest + b.m.trend * 2 - (a.m.interest + a.m.trend * 2) || (a.id < b.id ? -1 : 1)).slice(0, limit)
    .map(({ id, m, f }) => { const r = rankIn(media, PRIMARY_RANKING, f.weightClass, id); return { id, name: fighterName(f), division: weightClassLabel(f.weightClass), interest: Math.round(m.interest), trend: trendingOf(m, week), popularity: Math.round(f.popularity), rank: r !== null && r >= 1 ? `#${r}` : null, mine: mine.has(id) } })
}

// ------------------------------------------------------------------ rankings

export interface RankRowView { rank: number; label: string; id: Id; name: string; record: string; nation: string; movement: string; movementTone: 'up' | 'down' | 'same' | 'new'; why: string; champion: boolean; mine: boolean }
export interface RankingView { orgId: string; name: string; shortName: string; colour: string; kind: string; authority: number; sanctions: boolean; division: WeightClassId; divisionLabel: string; updated: number; method: string[]; rows: RankRowView[] }
const METHOD_NOTE = (o: (typeof RANKING_ORGS)[number]): string[] => {
  const m = o.methodology
  const notes: string[] = []
  if (m.opposition >= 1.5) notes.push('Weighs quality of opposition heavily')
  else if (m.opposition >= 1) notes.push('Rewards wins over strong opponents')
  if (m.activity >= 1) notes.push('Penalises inactivity')
  if (m.streak >= 0.7) notes.push('Rewards winning streaks')
  if (m.titles >= 0.8) notes.push('Respects champions')
  if (m.popularity >= 0.5) notes.push('Counts public popularity')
  notes.push(`Updated every ${o.updateEveryWeeks} weeks`)
  return notes
}

export function rankingView(state: GameState, orgId: string, wc: WeightClassId): RankingView | null {
  const media = state.media
  const org = RANK_ORG_BY_ID[orgId]
  if (!media || !org) return null
  const list = getList(media, orgId, wc)
  const id = rankingIdentity(orgId)
  const mine = new Set(rosterOf(state).map((f) => f.id))
  const rows: RankRowView[] = (list?.e ?? []).map((e) => {
    const f = state.fighters[e.f]
    const moved = e.p === null ? 'NEW' : e.p === e.r ? '–' : e.p > e.r ? `▲${e.p - e.r}` : `▼${e.r - e.p}`
    return {
      rank: e.r, label: e.r === 0 ? 'C' : String(e.r), id: e.f, name: f ? fighterName(f) : 'Unknown', record: f ? `${f.record.wins}-${f.record.losses}-${f.record.draws}` : '',
      nation: f?.nationality ?? '', movement: moved, movementTone: e.p === null ? 'new' : e.p === e.r ? 'same' : e.p > e.r ? 'up' : 'down',
      why: reasonText(decodeWhy(e.why), e.p, e.r, (x) => (state.fighters[x] ? fighterName(state.fighters[x]) : undefined)), champion: e.r === 0, mine: mine.has(e.f),
    }
  })
  return { orgId, name: id.name, shortName: id.shortName, colour: id.colour, kind: org.kind, authority: org.authority, sanctions: org.sanctions, division: wc, divisionLabel: weightClassLabel(wc), updated: list?.u ?? 0, method: METHOD_NOTE(org), rows }
}

export const rankingOrgs = (): { id: string; name: string; shortName: string; kind: string; authority: number; sanctions: boolean; colour: string }[] =>
  RANKING_ORGS.map((o) => { const i = rankingIdentity(o.id); return { id: o.id, name: i.name, shortName: i.shortName, kind: o.kind, authority: o.authority, sanctions: o.sanctions, colour: i.colour } })
export const divisionsList = () => WEIGHT_CLASSES.map((w) => ({ id: w.id, label: w.name }))

export interface RankLine { orgId: string; shortName: string; rank: number | null; label: string; movement: string; why: string }
/** Where a fighter stands on every list (champion = C). */
export function fighterRankings(state: GameState, f: Fighter): RankLine[] {
  const media = state.media
  if (!media) return []
  const out: RankLine[] = []
  for (const org of RANKING_ORGS) {
    const list = getList(media, org.id, f.weightClass)
    const e = list?.e.find((x) => x.f === f.id)
    if (!e) { out.push({ orgId: org.id, shortName: rankingIdentity(org.id).shortName, rank: null, label: 'UNRANKED', movement: '', why: '' }); continue }
    out.push({ orgId: org.id, shortName: rankingIdentity(org.id).shortName, rank: e.r, label: e.r === 0 ? 'CHAMPION' : `#${e.r}`, movement: e.p === null ? 'NEW' : e.p === e.r ? '' : e.p > e.r ? `▲${e.p - e.r}` : `▼${e.r - e.p}`, why: reasonText(decodeWhy(e.why), e.p, e.r, (x) => (state.fighters[x] ? fighterName(state.fighters[x]) : undefined)) })
  }
  return out
}

/** The headline media rank for lists and tables: "#4", "C" for a champion of any body, or null. */
export function headlineRank(state: GameState, f: Fighter): { text: string; title: string; rank: number | null } {
  const media = state.media
  if (!media) return { text: '', title: '', rank: null }
  const held = titlesHeldBy(media, f.id)
  if (held.length) return { text: 'C', title: `Champion: ${held.map((h) => titleName(h.body, h.wc)).join(', ')}`, rank: 0 }
  const r = rankIn(media, PRIMARY_RANKING, f.weightClass, f.id)
  if (r !== null && r >= 1) return { text: `#${r}`, title: `${rankingIdentity(PRIMARY_RANKING).name}: ${r} in the ${weightClassLabel(f.weightClass)} division`, rank: r }
  return { text: '', title: '', rank: null }
}

// -------------------------------------------------------------------- titles

export interface ChampionView { body: string; bodyName: string; shortName: string; colour: string; division: WeightClassId; divisionLabel: string; champion: { id: Id; name: string; record: string; mine: boolean } | null; since: number | null; defences: number; mandatory: { challenger: string; challengerId: Id; due: number } | null; vacantSince: number | null }
export function titlesOverview(state: GameState): ChampionView[] {
  const media = state.media
  if (!media) return []
  const mine = new Set(rosterOf(state).map((f) => f.id))
  const out: ChampionView[] = []
  for (const org of SANCTIONING) {
    const id = bodyIdentity(org.id)
    for (const w of WEIGHT_CLASSES) {
      const rec: TitleRec | undefined = media.titles[`${org.id}|${w.id}`]
      if (!rec) continue
      const f = rec.c ? state.fighters[rec.c] : undefined
      out.push({ body: org.id, bodyName: id.name, shortName: id.shortName, colour: id.colour, division: w.id, divisionLabel: w.name, champion: rec.c ? { id: rec.c, name: f ? fighterName(f) : rec.cn ?? 'Unknown', record: f ? `${f.record.wins}-${f.record.losses}-${f.record.draws}` : '', mine: mine.has(rec.c) } : null, since: rec.c ? rec.since : null, defences: rec.defences, mandatory: rec.mand ? { challenger: rec.mand.cn, challengerId: rec.mand.challenger, due: rec.mand.due } : null, vacantSince: rec.c ? null : rec.vacantSince ?? null })
    }
  }
  return out
}
export const reignsList = (state: GameState, fighterId?: Id) => (state.media ? getReigns(state.media).filter((r) => !fighterId || r.f === fighterId).map((r) => ({ ...r, title: titleName(r.b, r.wc), bodyName: bodyIdentity(r.b).shortName })) : [])

// ------------------------------------------------------------- career + awards

const CAREER_TEXT = (k: string, a: string | undefined, n: number | undefined): string => {
  switch (k) {
    case 'START': return `On the books at the start: ${a}`
    case 'SIGNED': return `Signed with ${a}`
    case 'RELEASED': return `Left ${a}`
    case 'RANKED': return `Entered the ${a} ratings at #${n}`
    case 'TOP5': return `Reached the ${a} top five (#${n})`
    case 'NO1': return `Became the ${a} number one contender`
    case 'UPSET': return `Upset ${a}`
    case 'KO_STREAK': return `${n} knockouts in a row`
    case 'TITLE_WON': return `Won the ${a}`
    case 'TITLE_DEFENCE': return `Defended the ${a}${n ? ` (defence ${n})` : ''}`
    case 'TITLE_LOST': return `Lost the ${a}`
    case 'FIRST_LOSS': return `First professional defeat, to ${a}`
    case 'UNBEATEN': return `Unbeaten after ${n} wins`
    case 'COMEBACK': return `Staged a comeback`
    case 'RETIRED': return `Retired with a record of ${a}`
    case 'AWARD': return `${a}`
    case 'MAIN_EVENT': return `Headlined ${a}`
    case 'VIRAL': return `A clip of ${a} went viral`
    case 'RIVALRY': return `Rivalry with ${a}`
    default: return `${k}`
  }
}
export interface CareerLineView { day: number; year: number; text: string; kind: string }
export function careerStory(state: GameState, id: Id): CareerLineView[] {
  const media = state.media
  if (!media) return []
  return getCareer(media, id).map((e) => ({ day: e.d, year: yearOf(e.d), text: CAREER_TEXT(e.k, e.a, e.n), kind: e.k }))
}

export interface AwardView { year: number; category: string; label: string; org: OrgBadge; fighterId?: Id; fightId?: Id; eventId?: Id; promotionId?: Id; who: string }
export function awardsList(state: GameState, opts: { fighterId?: Id; promotionId?: Id; limit?: number } = {}): AwardView[] {
  const media = state.media
  if (!media) return []
  return getAwards(media).filter((a) => (!opts.fighterId || a.fighterId === opts.fighterId || a.facts.a === opts.fighterId || a.facts.b === opts.fighterId) && (!opts.promotionId || a.promotionId === opts.promotionId)).slice(0, opts.limit ?? 40)
    .map((a) => ({ year: a.year, category: AWARD_LABEL[a.category], label: a.label, org: badge(a.organisationId), fighterId: a.fighterId, fightId: a.fightId, eventId: a.eventId, promotionId: a.promotionId, who: a.fighterName ?? a.label }))
}

// ---------------------------------------------------------- fighter media profile

export interface FighterMediaView {
  popularity: number; interest: number; fanbase: number; followers: number; engagement: number; commercial: number; credibility: number; trending: string
  persona: string | null
  platforms: { name: string; followers: number }[]
  rankings: RankLine[]
  titles: { name: string; since: number; defences: number }[]
  stories: StoryView[]; videos: VideoView[]; narratives: NarrativeView[]; rivalries: RivalryView[]; career: CareerLineView[]; awards: AwardView[]
  relations: { org: OrgBadge; value: number; state: RelationState }[]
}
const PLATFORMS = ['Short video', 'Social', 'Photo', 'Video', 'Microblog', 'Community'] as const

/** `revealPersona` must come from the existing FighterView (`personality.trait !== null`): the press persona is hidden until then. */
export function fighterMediaView(state: GameState, id: Id, revealPersona: boolean): FighterMediaView | null {
  const media = state.media
  const f = state.fighters[id]
  if (!media || !f) return null
  const m = mediaOf(media, f)
  const held = titlesHeldBy(media, id)
  // The follower split across platforms is a stable function of the fighter's id, not a separate simulation.
  const weights = PLATFORMS.map((_, i) => 1 + ((id.charCodeAt(id.length - 1) * (i + 3)) % 7))
  const total = weights.reduce((a, b) => a + b, 0)
  const mine = rosterOf(state).some((x) => x.id === id)
  return {
    popularity: Math.round(f.popularity), interest: Math.round(m.interest), fanbase: m.fanbase, followers: m.followers, engagement: Math.round(m.engagement), commercial: Math.round(commercialValue(state, media, f)), credibility: Math.round(sportingCredibility(state, media, f)),
    trending: trendingOf(m, weekNow(state)), persona: revealPersona ? PERSONA_LABEL[personaOf(f.personality)] : null,
    platforms: PLATFORMS.map((name, i) => ({ name, followers: Math.round((m.followers * weights[i]) / total) })).sort((a, b) => b.followers - a.followers),
    rankings: fighterRankings(state, f), titles: held.map((h) => ({ name: titleName(h.body, h.wc), since: h.rec.since, defences: h.rec.defences })),
    stories: storiesList(state, { fighterId: id, limit: 6 }), videos: videosList(state, { fighterId: id, limit: 3 }), narratives: narrativesList(state, { fighterId: id, limit: 4 }), rivalries: rivalriesList(state, { fighterId: id, limit: 3 }),
    career: careerStory(state, id), awards: awardsList(state, { fighterId: id }),
    relations: mine ? MEDIA_ORDER.filter((o) => MEDIA_BEHAVIOURS[o].appetite >= 40).map((o) => { const v = relationOf(media, o, id) + relationOf(media, o, state.playerPromotionId); return { org: badge(o), value: Math.round(v), state: relationState(v) } }).filter((r) => r.value !== 0) : [],
  }
}

// -------------------------------------------------- requests, press, broadcast

export interface RequestView { id: string; org: OrgBadge; kind: string; label: string; fighterId: Id; fighterName: string; weeksLeft: number; status: string; result?: string; relation: RelationState; alternatives: { id: Id; name: string; interest: number }[] }
export function requestsList(state: GameState): RequestView[] {
  const media = state.media
  if (!media) return []
  const week = weekNow(state)
  const roster = rosterOf(state)
  return media.requests.slice(0, 20).map((r) => ({
    id: r.id, org: badge(r.organisationId), kind: r.kind, label: REQUEST_LABEL[r.kind], fighterId: r.fighterId, fighterName: r.fighterName, weeksLeft: Math.max(0, r.expiresWeek - week), status: r.status, result: r.result,
    relation: relationState(relationOf(media, r.organisationId, state.playerPromotionId)),
    alternatives: roster.filter((f) => f.id !== r.fighterId).map((f) => ({ id: f.id, name: fighterName(f), interest: Math.round(mediaOf(media, f).interest) })).sort((a, b) => b.interest - a.interest).slice(0, 6),
  }))
}

export interface PressView { id: string; eventId: Id; eventName: string; names: [string, string]; weeksLeft: number; status: string; approach?: string; result?: string; options: { key: PressApproach; label: string; hint: string }[] }
const PRESS_HINT: Record<PressApproach, string> = { RESPECTFUL: 'Warm the press without lighting a fire', CONFIDENT: 'Back yourself and build the show', AGGRESSIVE: 'Raise the temperature: big hype, real risk', CONTROVERSIAL: 'Maximum noise: hype and rivalry, with a real chance it boils over', DIPLOMATIC: 'Calm everyone down and keep the media on side' }
export function pressList(state: GameState): PressView[] {
  const media = state.media
  if (!media) return []
  const week = weekNow(state)
  return media.pressers.map((p) => ({
    id: p.id, eventId: p.eventId, eventName: state.events[p.eventId]?.name ?? 'The show', names: p.names, weeksLeft: Math.max(0, p.expiresWeek - week), status: p.status, approach: p.approach, result: p.result?.text,
    options: (Object.keys(PRESS_HINT) as PressApproach[]).map((k) => ({ key: k, label: k.charAt(0) + k.slice(1).toLowerCase(), hint: `${PRESS_HINT[k]} (hype ${approachInfo(k).hype >= 0 ? '+' : ''}${approachInfo(k).hype}, rivalry ${approachInfo(k).rivalry >= 0 ? '+' : ''}${approachInfo(k).rivalry})` })),
  }))
}

export interface OfferView { id: string; org: { id: string; name: string; shortName: string; colour: string; tagline: string; logoAsset: string | null }; eventId: Id; eventName: string; rights: string; kind: string; guaranteed: number; share: number; shareLabel: string; minAudience: number; audienceUnit: string; productionReq: number; exclusive: boolean; territory: string; weeksLeft: number; status: string; mainEvent: string; interest: number; venueOk: boolean; audience: number }
export function offersList(state: GameState, eventId?: Id): OfferView[] {
  const media = state.media
  if (!media) return []
  const week = weekNow(state)
  return media.offers.filter((o) => !eventId || o.eventId === eventId).map((o) => {
    const id = broadcasterIdentity(o.organisationId)
    const ev = state.events[o.eventId]
    const venue = ev ? state.venues[ev.venueId] : undefined
    const shareLabel = o.kind === 'ppv' ? `${Math.round(o.share * 100)}% of each buy` : o.share > 0 ? `£${o.share.toFixed(2)} a viewer above the minimum` : 'No audience bonus'
    return { id: o.id, org: { id: id.id, name: id.name, shortName: id.shortName, colour: id.colour, tagline: id.tagline, logoAsset: id.logoAsset }, eventId: o.eventId, eventName: ev?.name ?? 'The show', rights: o.rights.replace('_', ' '), kind: o.kind, guaranteed: o.guaranteed, share: o.share, shareLabel, minAudience: o.minAudience, audienceUnit: o.kind === 'ppv' ? 'buys' : 'viewers', productionReq: o.productionReq, exclusive: o.exclusive, territory: o.territory, weeksLeft: Math.max(0, o.expiresWeek - week), status: o.status, mainEvent: o.basis.mainEvent, interest: o.basis.interest, venueOk: !!venue && venue.production >= o.productionReq, audience: BROADCAST_BEHAVIOURS[o.organisationId]?.audience ?? 0 }
  }).sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || b.guaranteed - a.guaranteed)
}
export function dealView(state: GameState, eventId: Id): { org: string; shortName: string; guaranteed: number; kind: string; territory: string; minAudience: number } | null {
  const d = state.media?.deals[eventId]
  if (!d) return null
  const id = broadcasterIdentity(d.organisationId)
  return { org: id.name, shortName: id.shortName, guaranteed: d.guaranteed, kind: d.kind, territory: d.territory, minAudience: d.minAudience }
}
export const broadcasterTerritory = territoryLabel

// --------------------------------------------------------------- media org board

export interface OrgView extends OrgBadge { audience: number; credibility: number; influence: number; style: string; videoReach: number; relation: number; relationState: RelationState; publishesRankings: boolean }
export function orgsList(state: GameState): OrgView[] {
  const media = state.media
  if (!media) return []
  return MEDIA_ORDER.map((id) => {
    const s = media.orgs[id], b = MEDIA_BEHAVIOURS[id]
    const rel = relationOf(media, id, state.playerPromotionId)
    return { ...badge(id), audience: s?.audience ?? b.audience, credibility: Math.round(s?.credibility ?? b.credibility), influence: Math.round(s?.influence ?? b.influence), style: b.editorialStyle, videoReach: b.videoReach, relation: Math.round(rel), relationState: relationState(rel), publishesRankings: b.rankingAuthority > 0 }
  })
}

// ------------------------------------------------------------ event + fight media

export interface EventMediaView {
  interest: number; hype: number; broadcastInterest: number; offers: number; deal: ReturnType<typeof dealView>; topStory: StoryView | null; topFight: string | null; expectedAudience: number | null
  reaction: null | { headlines: StoryView[]; viewers: number; ppvBuys: number; viral: string[]; rankingChanges: string[]; fanReaction: 'POSITIVE' | 'MIXED' | 'NEGATIVE' | 'QUIET' }
}
export function eventMediaView(state: GameState, eventId: Id): EventMediaView | null {
  const media = state.media
  const ev = state.events[eventId]
  if (!media || !ev) return null
  const interest = Math.round(eventInterest(state, ev))
  const fights = ev.card.map((id) => state.fights[id]).filter(Boolean)
  const main = fights[fights.length - 1]
  const stories = storiesList(state, { eventId, limit: 6 })
  const fightStories = fights.flatMap((f) => storiesList(state, { fightId: f.id, limit: 3 }))
  const all = [...stories, ...fightStories].sort((a, b) => b.importance - a.importance)
  const offers = media.offers.filter((o) => o.eventId === eventId && o.status === 'open').length
  let reaction: EventMediaView['reaction'] = null
  if (ev.result) {
    const ids = new Set(fights.flatMap((f) => [f.sideA.fighterId, f.sideB.fighterId]))
    const rank = media.stories.filter((s) => s.k === 'RANKING_CHANGE' && s.ps.split(',').some((x) => ids.has(x)) && s.d >= ev.day).map((s) => expandStory(media, s)?.headline ?? '').filter(Boolean)
    const sent = all.length ? all.reduce((n, s) => n + s.sentiment, 0) / all.length : 0
    reaction = {
      headlines: all.slice(0, 5), viewers: ev.result.viewers, ppvBuys: ev.result.ppvBuys, viral: media.viral.filter((v) => v.fightId && fights.some((f) => f.id === v.fightId)).map((v) => v.headline),
      rankingChanges: [...new Set(rank)].slice(0, 4), fanReaction: all.length === 0 ? 'QUIET' : sent > 0.12 ? 'POSITIVE' : sent < -0.12 ? 'NEGATIVE' : 'MIXED',
    }
  }
  return {
    interest, hype: Math.round(media.eventHype[eventId] ?? 0), broadcastInterest: Math.min(100, Math.round(interest * 0.8 + offers * 8)), offers, deal: dealView(state, eventId), topStory: all[0] ?? null,
    topFight: main ? `${nameOf(state, main.sideA.fighterId)} v ${nameOf(state, main.sideB.fighterId)}` : null, expectedAudience: ev.expectedAttendance || null, reaction,
  }
}

export interface FightMediaView { title: string | null; ranks: { name: string; lines: RankLine[] }[]; rivalry: RivalryView | null; narratives: NarrativeView[]; stories: StoryView[] }
export function fightMediaView(state: GameState, fightId: Id): FightMediaView | null {
  const media = state.media
  const fight = state.fights[fightId]
  if (!media || !fight) return null
  const a = state.fighters[fight.sideA.fighterId], b = state.fighters[fight.sideB.fighterId]
  if (!a || !b) return null
  const k = pairKey(a.id, b.id)
  const rv = media.rivalry[k]
  return {
    title: fight.title?.name ?? null,
    ranks: [a, b].map((f) => ({ name: fighterName(f), lines: fighterRankings(state, f).filter((l) => l.rank !== null) })),
    rivalry: rv && rv >= 15 ? { a: a.id, b: b.id, aName: fighterName(a), bName: fighterName(b), strength: Math.round(rv), label: rv >= 70 ? 'BITTER' : rv >= 45 ? 'HEATED' : 'BUILDING' } : null,
    narratives: narrativesList(state, { fighterId: a.id, limit: 3 }).filter((n) => n.fighterIds.includes(b.id) || n.fighterIds.length === 1).slice(0, 3),
    stories: storiesList(state, { fightId, limit: 5 }),
  }
}

export interface PromotionMediaView { sporting: number; media: number; fan: number; commercial: number; tags: string[]; awards: AwardView[] }
export function promotionMediaView(state: GameState, id: Id): PromotionMediaView | null {
  if (!state.media) return null
  const m = promoMediaOf(state.media, id)
  return { sporting: m.sporting, media: m.media, fan: m.fan, commercial: m.commercial, tags: m.tags, awards: awardsList(state, { promotionId: id }) }
}

// --------------------------------------------------------------- the newsroom

export interface MediaHome {
  lead: StoryView | null; breaking: StoryView[]; latest: StoryView[]; videos: VideoView[]; trending: TrendingView[]; narratives: NarrativeView[]; rivalries: RivalryView[]
  awards: AwardView[]; interviews: StoryView[]; requests: RequestView[]; pressers: PressView[]; offers: OfferView[]; orgs: OrgView[]; reigns: ReturnType<typeof reignsList>; history: { week: number; headline: string; kind: string }[]
  rankings: { orgId: string; shortName: string; division: string; leader: string | null }[]
  openRequests: number
}
export function mediaHome(state: GameState): MediaHome {
  const media = state.media
  const all = storiesList(state, { limit: 40 })
  const breaking = all.filter((s) => s.breaking).slice(0, 3)
  const lead = breaking[0] ?? all.slice().sort((a, b) => a.weeksAgo - b.weeksAgo || b.importance - a.importance)[0] ?? null
  const rest = all.filter((s) => s.id !== lead?.id)
  const reqs = requestsList(state)
  const week = media ? Math.floor((state.today - state.startDay) / 7) : 0
  return {
    lead, breaking: breaking.filter((s) => s.id !== lead?.id), latest: rest.slice(0, 14), videos: videosList(state, { limit: 8 }), trending: trendingList(state, 8), narratives: narrativesList(state, { limit: 8 }), rivalries: rivalriesList(state, { limit: 6 }),
    awards: awardsList(state, { limit: 16 }), interviews: all.filter((s) => ['FEATURE', 'CALL_OUT', 'PRESS_CONFERENCE'].includes(s.kind)).slice(0, 6), requests: reqs, pressers: pressList(state), offers: offersList(state).filter((o) => o.status === 'open'),
    orgs: orgsList(state), reigns: reignsList(state).slice(0, 12), history: media ? getHistory(media).slice(0, 12).map((h) => ({ week: h.w, headline: h.h, kind: h.k })) : [],
    rankings: media ? ['ringside', 'atlas', 'pioneer', 'crown', 'index'].map((o) => ({ orgId: o, shortName: rankingIdentity(o).shortName, division: 'Heavyweight', leader: (() => { const l = getList(media, o, 'heavyweight'); const e = l?.e[0]; return e ? nameOf(state, e.f) : null })() })) : [],
    openRequests: reqs.filter((r) => r.status === 'open').length + pressList(state).filter((p) => p.status === 'open').length + offersList(state).filter((o) => o.status === 'open').length + (week ? 0 : 0),
  }
}

/** Dashboard teaser: the lead headline and anything waiting for an answer. */
export function mediaTeaser(state: GameState): { headline: StoryView | null; waiting: number } {
  const h = mediaHome(state)
  return { headline: h.lead, waiting: h.openRequests }
}
export { formatDay }

/** The division the player's best-known fighter fights in (a sensible default for ranking screens). */
export function defaultDivision(state: GameState): WeightClassId {
  const best = rosterOf(state).slice().sort((a, b) => b.reputation - a.reputation)[0]
  return best?.weightClass ?? 'welterweight'
}
