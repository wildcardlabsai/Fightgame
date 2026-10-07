/**
 * VIDEO AND VIRAL MOMENTS. Outlets with a video side publish clips of real events. Views follow audience, significance and a
 * viral potential read from what happened (KO, upset, war, title). A viral moment gives a measurable, temporary spike that
 * unwinds — it never becomes permanent popularity.
 */
import { keyedRng } from '../rng'
import type { Fighter, GameState, Id } from '../types'
import { MEDIA_BEHAVIOURS, MEDIA_ORDER, orgOf } from './orgs'
import { addInterest, profileOf } from './popularity'
import { LIMITS } from './state'
import type { MediaState, MediaVideo, VideoType, ViralMoment } from './types'
import type { WorldEvent } from './worldEvents'
import { clampTo, nextId, pushCapped, weekIndex } from './util'

/** 0–1 chance the clip travels, read from the facts of the event. */
export function viralPotential(ev: WorldEvent): number {
  let v = 0.08
  if (ev.tags.includes('stoppage')) v += 0.22
  if (Number(ev.facts.mc === 'KO')) v += 0.1
  if (ev.facts.mc === 'KO' && Number(ev.facts.rd) <= 2) v += 0.18
  if (ev.tags.includes('upset')) v += 0.25 * (0.5 + Number(ev.facts.up ?? 0))
  if (ev.tags.includes('war')) v += 0.2
  if (ev.kind === 'TITLE_CHANGE') v += 0.12
  if (ev.tags.includes('unbeaten-fell')) v += 0.08
  if (ev.kind === 'CONTROVERSIAL_DECISION') v += 0.1
  if (ev.kind === 'WEIGH_IN' || ev.kind === 'CALL_OUT') v += 0.1
  return Math.min(1, v + ev.sig / 400)
}

function titleFor(type: VideoType, ev: WorldEvent): string {
  const [a, b] = ev.names
  switch (type) {
    case 'FIGHT_HIGHLIGHTS': return `${a ?? 'Fight'} v ${b ?? ''}: full highlights`.trim()
    case 'POST_FIGHT_INTERVIEW': return `${a ?? 'Winner'} speaks after the fight`
    case 'KO_COMPILATION': return 'The best knockouts of the month'
    case 'ANALYSIS': return `${a ?? ''} v ${b ?? ''}: breaking it down`.trim()
    case 'WEIGH_IN': return `${a ?? 'Fighter'} at the weigh-in`
    case 'PRESS_CONFERENCE': return `${a ?? ''} and ${b ?? ''} face off`.trim()
    case 'RIVALRY_FEATURE': return `${a ?? ''} v ${b ?? ''}: the story so far`.trim()
    case 'PROSPECT_FEATURE': return `${a ?? 'Prospect'}: the next name`
    case 'DOCUMENTARY': return `${a ?? 'Fighter'}: inside the camp`
    case 'FIGHTER_INTERVIEW': return `${a ?? 'Fighter'} sits down`
  }
}

/** Publish one video; returns it (or null when the outlet makes no such format). */
export function publishVideo(state: GameState, media: MediaState, orgId: string, type: VideoType, ev: WorldEvent, boost = 0): MediaVideo | null {
  const b = MEDIA_BEHAVIOURS[orgId]
  if (!b || !b.videos.includes(type)) return null
  const org = orgOf(media, orgId)
  const week = weekIndex(state)
  const rng = keyedRng(state.seed, 'video', orgId, type, ev.fightId ?? ev.eventId ?? ev.day, ev.fighters.join(','))
  const pot = viralPotential(ev)
  const base = org.audienceSize * (0.004 + 0.045 * Math.pow(ev.sig / 100, 1.5)) * (0.4 + 0.6 * b.videoReach / 100)
  const views = Math.round(base * (1 + 4 * pot * pot) * Math.exp(rng.normal(0, 0.35)) * (1 + boost))
  const viral = Math.round(clampTo(100 * (pot * 0.75 + Math.max(0, rng.normal(0.05, 0.1))) + (views > org.audienceSize * 0.2 ? 8 : 0)))
  const v: MediaVideo = {
    id: nextId(media, 'vd'), organisationId: orgId, type, title: titleFor(type, ev), publishedWeek: week, fighterIds: ev.fighters.slice(0, 2), fightId: ev.fightId, eventId: ev.eventId,
    views, likes: Math.round(views * (0.03 + 0.03 * pot)), engagement: Math.round(clampTo(18 + 55 * pot + (rng.next() - 0.5) * 12)), reach: Math.round(views * 1.6), viralScore: viral,
  }
  pushCapped(media.videos, v, LIMITS.videos)
  return v
}

/** Videos for a fight: every outlet with the right format and enough interest publishes its own. */
export function videosFromFight(state: GameState, media: MediaState, ev: WorldEvent): MediaVideo[] {
  const out: MediaVideo[] = []
  for (const id of MEDIA_ORDER) {
    const b = MEDIA_BEHAVIOURS[id]
    if (b.videos.length === 0 || ev.sig < b.threshold * 0.9) continue
    const jobs: VideoType[] = ['FIGHT_HIGHLIGHTS']
    if (ev.sig >= 35 && !ev.facts.draw) jobs.push('POST_FIGHT_INTERVIEW')
    if (ev.kind === 'CONTROVERSIAL_DECISION' || ev.kind === 'UPSET' || ev.kind === 'TITLE_CHANGE') jobs.push('ANALYSIS')
    for (const j of jobs) { const v = publishVideo(state, media, id, j, ev); if (v) out.push(v) }
  }
  return out
}

/** The strongest clip of an event may go viral: record it and apply the temporary spike. */
export function applyViral(state: GameState, media: MediaState, ev: WorldEvent, vids: MediaVideo[]): ViralMoment | null {
  const best = vids.slice().sort((a, b) => b.viralScore - a.viralScore)[0]
  if (!best || best.viralScore < 72) return null
  const week = weekIndex(state)
  const star = state.fighters[ev.fighters[0]]
  const moment: ViralMoment = {
    id: nextId(media, 'vr'), kind: ev.kind, headline: best.title, week, until: week + 6, fighterIds: ev.fighters.slice(0, 2), fightId: ev.fightId, strength: best.viralScore,
  }
  pushCapped(media.viral, moment, LIMITS.viral)
  if (star) {
    const pts = Math.round((1 + best.viralScore / 40) * 10) / 10
    const prof = profileOf(media, star)
    addInterest(media, star, 10 + best.viralScore / 6, week)
    prof.followers = Math.round(prof.followers + best.views * 0.02)
    prof.fanbase = Math.round(prof.fanbase + best.views * 0.006)
    if (media.effects && !(prof.viral && prof.viral.until > week)) {
      prof.viral = { pts, from: week, until: week + 6 }
      star.popularity = Math.min(100, star.popularity + pts)
    }
  }
  return moment
}

/** Weekly: viral spikes unwind linearly back out of popularity. */
export function unwindViral(state: GameState, media: MediaState, steps = 1): void {
  const week = weekIndex(state)
  for (const [id, m] of Object.entries(media.fighters)) {
    const v = m.viral
    if (!v) continue
    const f: Fighter | undefined = state.fighters[id]
    const span = Math.max(1, v.until - v.from)
    if (f && media.effects) f.popularity = Math.max(1, Math.round(f.reputation * 0.4), f.popularity - (v.pts / span) * steps)
    if (week >= v.until) delete m.viral
  }
  media.viral = media.viral.filter((x) => x.until + 20 > week)
}

/** A knockout reel when the last month has produced at least three real knockouts that were written up. */
export function koCompilations(state: GameState, media: MediaState): MediaVideo[] {
  const week = weekIndex(state)
  const kos = new Map<Id, (typeof media.stories)[number]>()
  for (const st of media.stories) if (st.k === 'KNOCKOUT' && st.w >= week - 4 && st.ft && !kos.has(st.ft)) kos.set(st.ft, st)
  if (kos.size < 3) return []
  const out: MediaVideo[] = []
  const list = [...kos.values()]
  const ev: WorldEvent = {
    kind: 'KNOCKOUT', day: state.today, fighters: list.flatMap((s) => s.ps.slice(0, 1)).slice(0, 2), names: [], promotions: [], facts: { mc: 'KO', rd: 1 },
    sig: Math.max(...list.map((s) => s.i)), parts: {}, tags: ['stoppage'], fightId: list[0].ft,
  }
  for (const id of MEDIA_ORDER) {
    if (!MEDIA_BEHAVIOURS[id].videos.includes('KO_COMPILATION')) continue
    if (media.videos.some((v) => v.organisationId === id && v.type === 'KO_COMPILATION' && v.publishedWeek >= week - 4)) continue
    const v = publishVideo(state, media, id, 'KO_COMPILATION', ev)
    if (v) { v.title = `Best knockouts of the month: ${list.length} stoppages`; out.push(v) }
  }
  return out
}
