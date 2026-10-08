/**
 * COVERAGE. Which outlets cover a world event, at what prominence, with what tone — and what is kept.
 * Significance decides how many outlets cover it; each outlet's threshold, focus, region, weekly cap and relationship with the
 * people involved decide which. What is stored is small (ids, numbers and a shared fact record); headline, sub-headline and
 * body are rebuilt from the facts whenever a story is shown, so the text can never drift from the record.
 */
import { regionOf } from '../../data/nations'
import { keyedRng } from '../rng'
import type { GameState, Id } from '../types'
import { MEDIA_BEHAVIOURS, MEDIA_ORDER, relationOf } from './orgs'
import { compose, toneOf } from './copy'
import { LIMITS } from './state'
import type { HistoryRec, MediaState, MediaStory, StoredStory, StoryKind, StoryPriority } from './types'
import type { WorldEvent } from './worldEvents'
import { clampTo, nextId, weekIndex } from './util'
import { pushHistory } from './records'

/** Kinds that are written into the permanent history when important enough. */
const HISTORIC: StoryKind[] = ['TITLE_CHANGE', 'TITLE_DEFENCE', 'UPSET', 'KNOCKOUT', 'WAR', 'UNBEATEN_FELL', 'RETIREMENT', 'STRIPPED', 'TITLE_VACANT', 'RECORD_CROWD', 'SELL_OUT', 'PPV_SUCCESS', 'AWARD', 'VIRAL', 'RANKING_CHANGE', 'PROSPECT_BREAKOUT']
const MAX_BREAKING_PER_WEEK = 2
/** How many body sentences each editorial style runs. */
const DEPTH: Record<string, number> = { BREAKING: 2, HYPE: 2, FAN_DRIVEN: 2, SERIOUS: 4, TRADITIONAL: 3, ANALYTICAL: 5, POSITIVE: 3, CONTROVERSIAL: 3, INVESTIGATIVE: 5, NEGATIVE: 3 }

function regionFactor(regions: string[], reach: string[]): number {
  if (reach.includes('Global')) return 1
  if (regions.length === 0) return 0.85
  return regions.some((r) => reach.includes(r)) ? 1.15 : 0.7
}

function involvedRelation(state: GameState, media: MediaState, orgId: string, ev: WorldEvent): number {
  const p = state.playerPromotionId
  return ev.promotions.includes(p) ? relationOf(media, orgId, p) : 0
}

interface WeekCounts { week: number; len: number; perOrg: Map<string, number>; breaking: number; breakingBy: Set<string> }
const counts = new WeakMap<MediaState, WeekCounts>()
/** Stories already published this week, per outlet (kept incrementally so each event does not rescan the list). */
function weekCounts(media: MediaState, week: number): WeekCounts {
  let c = counts.get(media)
  if (!c || c.week !== week) {
    c = { week, len: 0, perOrg: new Map(), breaking: 0, breakingBy: new Set() }
    for (const s of media.stories) if (s.w === week) { c.perOrg.set(s.o, (c.perOrg.get(s.o) ?? 0) + 1); if (s.b === 1) { c.breaking++; c.breakingBy.add(s.o) } }
    counts.set(media, c)
  }
  return c
}

export interface CoverResult { stories: StoredStory[]; outlets: number }

/** Decide coverage for one world event and publish the stories. `key` must be unique per event. */
export function coverEvent(state: GameState, media: MediaState, ev: WorldEvent, key: string): CoverResult {
  const week = weekIndex(state)
  const wc = weekCounts(media, week)
  const perOrg = wc.perOrg
  let breaking = wc.breaking
  const regions = ev.fighters.map((id) => state.fighters[id]).filter(Boolean).map((f) => regionOf(f.nationality))

  const rng = keyedRng(state.seed, 'cover', key)
  const cands = MEDIA_ORDER.map((id) => {
    const b = MEDIA_BEHAVIOURS[id]
    const st = media.orgs[id]
    const jitter = 0.94 + 0.12 * rng.next()
    const variant = rng.int(0, 3)
    if (st && !st.active) return null
    const org = { audienceSize: st?.audience ?? b.audience, influence: st?.influence ?? b.influence }
    const rel = involvedRelation(state, media, id, ev)
    const focus = b.focus[ev.kind] ?? 1
    const score = ev.sig * focus * regionFactor(regions, b.regionalReach) * (1 + rel / 250) * jitter * (0.9 + org.influence / 500)
    return { id, b, org, rel, score, variant }
  }).filter((x): x is NonNullable<typeof x> => !!x && x.score >= x.b.threshold && (perOrg.get(x.id) ?? 0) < x.b.weeklyCap)
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))

  // A list movement is one fact: the sport does not need three outlets repeating it (a title-race move earns two).
  const maxOutlets = Math.max(1, Math.min(ev.kind === 'RANKING_CHANGE' ? (ev.sig >= 55 ? 2 : 1) : 6, Math.ceil(ev.sig / 22)))
  const chosen = cands.slice(0, maxOutlets)
  const out: StoredStory[] = []
  chosen.forEach((c, idx) => {
    const tone = toneOf(c.b.editorialStyle, c.rel)
    const loud = c.b.lag === 0 && (c.b.editorialStyle === 'BREAKING' || c.b.type === 'NEWS_SITE')
    const isBreaking = ev.sig >= 75 && loud && breaking < MAX_BREAKING_PER_WEEK && !wc.breakingBy.has(c.id) && idx === 0
    if (isBreaking) { breaking++; wc.breaking++; wc.breakingBy.add(c.id) }
    perOrg.set(c.id, (perOrg.get(c.id) ?? 0) + 1)
    const priority: StoryPriority = isBreaking ? 'BREAKING' : ev.sig >= 60 && c.b.lag === 0 ? 'MAJOR' : c.b.lag >= 1 || ev.kind === 'FEATURE' ? 'FEATURE' : ev.sig >= 45 ? 'MAJOR' : 'NEWS'
    const importance = Math.round(clampTo(ev.sig * (0.86 + c.org.influence / 400), 0, 100))
    const sentiment = Math.max(-1, Math.min(1, (tone === 'warm' ? 0.5 : tone === 'edgy' ? -0.4 : 0) + c.rel / 250 + (ev.tags.includes('upset') ? 0.1 : 0)))
    out.push({
      id: nextId(media, 'st'), w: week, d: state.today, k: ev.kind, p: priority, i: importance, o: c.id,
      ps: ev.fighters.slice(0, 3).join(','), pr: ev.promotions.slice(0, 2).join(','), ev: ev.eventId, ft: ev.fightId, ve: ev.venueId, fx: key, v: c.variant, t: tone,
      n: DEPTH[c.b.editorialStyle] ?? 3, x: week + (isBreaking ? 10 : importance >= 70 ? 52 : importance >= 50 ? 26 : 12), s: Math.round(sentiment * 100) / 100,
      r: Math.round(c.org.audienceSize * (0.15 + 0.85 * ev.sig / 100) * c.org.influence / 100 * 0.25), b: isBreaking ? 1 : 0, rd: 0,
    })
  })
  if (out.length) {
    media.fx[key] = ev.facts
    for (const s of out) media.stories.unshift(s)
  }
  // The permanent record keeps one compact line per important event, however many outlets covered it.
  if (out.length && HISTORIC.includes(ev.kind) && ev.sig >= 55) {
    const lead = out.slice().sort((a, b) => b.i - a.i)[0]
    const h: HistoryRec = { w: week, day: state.today, k: ev.kind, imp: lead.i, h: expandStory(media, lead)?.headline ?? '', ps: ev.fighters.slice(0, 2), fn: ev.names.slice(0, 2) }
    pushHistory(media, h)
  }
  return { stories: out, outlets: out.length }
}

/** Full text of a stored story, rebuilt from its facts. */
export function expandStory(media: MediaState, s: StoredStory): MediaStory | null {
  const facts = media.fx[s.fx]
  if (!facts) return null
  const text = compose(s.k, facts, s.t, s.v, s.n)
  return {
    id: s.id, worldWeek: s.w, day: s.d, kind: s.k, priority: s.p, importance: s.i, organisationId: s.o, headline: text.headline, subheadline: text.sub, body: text.body,
    relatedFighterIds: s.ps ? s.ps.split(',') : [], relatedPromotionIds: s.pr ? s.pr.split(',') : [], relatedEventId: s.ev, relatedFightId: s.ft, relatedVenueId: s.ve, facts, expiresAt: s.x, sentiment: s.s, reach: s.r,
    isBreaking: s.b === 1, isRead: s.rd === 1,
  }
}

/** Expire minor stories, bound the live list (important ones are kept longest) and drop facts nothing refers to. */
export function pruneStories(media: MediaState, week: number): void {
  media.stories = media.stories.filter((s) => s.x > week)
  if (media.stories.length > LIMITS.stories) {
    // Importance decides what is kept, but the last few weeks' stories always survive so a fighter's latest coverage never vanishes at once.
    // Stories about a real, finished fight are the backbone of the newsroom: they outlast comparable admin items (vacancies, orders, rating moves).
    const keep = (x: StoredStory) => (week - x.w <= 3 ? 100 : x.i + (x.ft ? 6 : 0))
    media.stories.sort((a, b) => keep(b) - keep(a) || b.w - a.w)
    media.stories.length = LIMITS.stories
    media.stories.sort((a, b) => b.w - a.w || b.i - a.i)
  }
  const used = new Set(media.stories.map((s) => s.fx))
  for (const k of Object.keys(media.fx)) if (!used.has(k)) delete media.fx[k]
}

export const storiesAbout = (media: MediaState, fighterId: Id): StoredStory[] => media.stories.filter((s) => s.ps.split(',').includes(fighterId))
