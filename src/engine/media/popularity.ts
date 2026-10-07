/**
 * PUBLIC STANDING OF A FIGHTER. Five separate things, deliberately not collapsed into one rating:
 *   public popularity     — Fighter.popularity (engine, drives demand)
 *   media interest        — how much the press cares right now (fast to rise, fast to fade)
 *   fanbase               — people who follow them (slow to build, slow to lose)
 *   commercial value      — what the name is worth to sponsors and broadcasters
 *   sporting credibility  — what the results say (reputation, quality of wins, titles)
 * Only popularity (and, through it, demand) feeds back into the economy, and only by small, bounded amounts.
 */
import { clamp, publicFacts } from '../fighters'
import { publicStanding } from '../fights'
import type { Fighter, GameState, Id } from '../types'
import type { FighterMedia, MediaState } from './types'
import { titlesHeldBy } from './titles'
import { clampTo, weekIndex } from './util'

/** Media interest when nobody has covered the fighter yet: it follows public popularity and reputation. */
export function baselineInterest(f: Pick<Fighter, 'popularity' | 'reputation'>): number {
  return clampTo(f.popularity * 0.5 + f.reputation * 0.15, 0, 100)
}

export function fanbaseBaseline(f: Pick<Fighter, 'popularity'>): number {
  return Math.round(Math.pow(Math.max(0, f.popularity) / 100, 2.2) * 600_000)
}

export function mediaOf(media: MediaState, f: Fighter): FighterMedia {
  return media.fighters[f.id] ?? { interest: baselineInterest(f), fanbase: fanbaseBaseline(f), followers: Math.round(fanbaseBaseline(f) * 0.7), engagement: clampTo(20 + f.popularity * 0.4, 0, 100), lastCovered: -999, trend: 0, stories: 0 }
}

/** Create (or return) the stored profile so it can be changed. */
export function profileOf(media: MediaState, f: Fighter): FighterMedia {
  const cur = media.fighters[f.id]
  if (cur) return cur
  const fresh = mediaOf(media, f)
  media.fighters[f.id] = fresh
  return fresh
}

/** What the name is worth commercially (0–100): popularity and reach, lifted by titles and current interest. */
export function commercialValue(_state: GameState, media: MediaState, f: Fighter): number {
  const m = mediaOf(media, f)
  const champ = titlesHeldBy(media, f.id).length > 0 ? 8 : 0
  const reach = Math.min(20, Math.log10(Math.max(10, m.followers)) * 3.2)
  return clampTo(f.popularity * 0.5 + m.interest * 0.15 + reach + champ, 0, 100)
}

/** What the results say, independent of fame (0–100). */
export function sportingCredibility(state: GameState, media: MediaState, f: Fighter): number {
  const standing = publicStanding(publicFacts(f, state.today), f.momentum)
  const champ = titlesHeldBy(media, f.id).length > 0 ? 12 : 0
  return clampTo(f.reputation * 0.75 + standing * 0.25 + champ, 0, 100)
}

export type Trending = 'RISING' | 'STEADY' | 'COOLING' | 'HOT'
export function trendingOf(m: FighterMedia, now: number): Trending {
  if (m.viral && m.viral.until > now) return 'HOT'
  return m.trend >= 3 ? 'RISING' : m.trend <= -3 ? 'COOLING' : 'STEADY'
}

/** Add attention: interest rises by `pts`, scaled so the already-famous gain less. */
export function addInterest(media: MediaState, f: Fighter, pts: number, week: number): void {
  const m = profileOf(media, f)
  const gain = pts > 0 ? pts * (1 - m.interest / 130) : pts
  const before = m.interest
  m.interest = clampTo(m.interest + gain, 0, 100)
  m.trend = m.trend * 0.5 + (m.interest - before)
  if (pts > 0) m.lastCovered = week
}

/** Weekly: interest fades fast, trends fade, followers drift with popularity, viral spikes unwind linearly. Returns popularity deltas to apply. */
export function decayProfiles(state: GameState, media: MediaState, steps = 1): void {
  const rate = (k: number) => 1 - Math.pow(1 - k, steps)
  const week = weekIndex(state)
  const champs = new Set<Id>()
  for (const t of Object.values(media.titles)) if (t.c) champs.add(t.c)
  for (const [id, m] of Object.entries(media.fighters)) {
    const f = state.fighters[id]
    if (!f || f.status === 'retired') { if (!f || (f.retiredDay !== null && state.today - f.retiredDay > 365)) delete media.fighters[id]; continue }
    const base = baselineInterest(f)
    const idle = week - m.lastCovered
    // Interest falls back to baseline (half-life ≈ 8 weeks); champions and recently active fighters keep more of it.
    const champ = champs.has(id)
    const k = champ ? 0.05 : 0.085
    m.interest = clampTo(m.interest + (base - m.interest) * rate(k) - (idle > 26 ? 0.15 * steps : 0), 0, 100)
    m.trend *= Math.pow(0.6, steps)
    const target = fanbaseBaseline(f)
    m.fanbase = Math.max(0, Math.round(m.fanbase + (target - m.fanbase) * rate(0.01)))
    m.followers = Math.max(0, Math.round(m.followers + (m.fanbase * 0.7 - m.followers) * rate(0.03)))
    m.engagement = clampTo(m.engagement + (20 + f.popularity * 0.4 + m.interest * 0.2 - m.engagement) * rate(0.05), 0, 100)
    // A profile that has drifted back to the default is dropped (it is rebuilt from public numbers when needed).
    if (!m.viral && idle > 30 && Math.abs(m.interest - base) < 2.5) delete media.fighters[id]
  }
}

/** The pull a fighter's current attention adds to a fight's appeal: centred on zero so the average show is unchanged. */
export function buzzOf(state: GameState, id: Id): number {
  const media = state.media
  if (!media?.effects) return 0
  const f = state.fighters[id]
  if (!f) return 0
  const m = media.fighters[id]
  if (!m) return 0
  return clamp(((m.interest - baselineInterest(f)) / 50) * 4, -3, 5)
}

export function clampPop(v: number, floor: number): number { return clamp(v, floor, 100) }
