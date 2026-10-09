/**
 * MEDIA REQUESTS AND PRESS CONFERENCES.
 * Outlets ask for the player's fighters (interviews, podcasts, camp features, promo videos, post-fight words). Each answer has
 * deterministic consequences: attention, the relationship with that outlet, a video if the outlet makes one, and — for fighters
 * with the temperament — the chance of a flare-up. Press conferences give the player a structured choice of approach before a
 * show; the effect on hype and rivalry is the same every time for the same situation.
 */
import { weightClassLabel } from '../../data/weightClasses'
import { mediaIdentity } from '../../data/mediaIdentity'
import { fighterName } from '../fighters'
import { keyedFloat, keyedRng } from '../rng'
import type { Fighter, GameState, Id } from '../types'
import { coverEvent } from './stories'
import { bumpRivalry, ensureRivalryNarrative } from './narratives'
import { MEDIA_BEHAVIOURS, MEDIA_ORDER, relationOf, shiftRelation } from './orgs'
import { ATTENTION, FLASH, approachFit, personaOf } from './persona'
import { addInterest, mediaOf, profileOf } from './popularity'
import { LIMITS } from './state'
import { pressCost, pressPolitics, pressWorthy } from '../office/press'
import { spend } from '../eventFinance'
import { rivalryStrength } from './narratives'
import type { MediaRequest, MediaState, PressApproach, PressConference, RequestKind, VideoType } from './types'
import { mediaMessage } from './inbox'
import { publishVideo } from './videos'
import type { WorldEvent } from './worldEvents'
import { clampTo, nextId, weekIndex } from './util'

export const REQUEST_LABEL: Record<RequestKind, string> = {
  INTERVIEW: 'an interview', POST_FIGHT_INTERVIEW: 'a post-fight interview', WEIGH_IN_INTERVIEW: 'a weigh-in interview', PODCAST: 'a podcast appearance',
  DOCUMENTARY: 'documentary access', TRAINING_CAMP: 'a training-camp feature', PROMO_VIDEO: 'a promotional video',
}
const VIDEO_FOR: Record<RequestKind, VideoType> = {
  INTERVIEW: 'FIGHTER_INTERVIEW', POST_FIGHT_INTERVIEW: 'POST_FIGHT_INTERVIEW', WEIGH_IN_INTERVIEW: 'WEIGH_IN', PODCAST: 'ANALYSIS', DOCUMENTARY: 'DOCUMENTARY', TRAINING_CAMP: 'DOCUMENTARY', PROMO_VIDEO: 'FIGHTER_INTERVIEW',
}

export const rosterOf = (state: GameState): Fighter[] =>
  Object.values(state.contracts).filter((c) => c.promotionId === state.playerPromotionId && c.status === 'active').map((c) => state.fighters[c.fighterId]).filter((f): f is Fighter => !!f && f.status === 'active')

const openRequests = (media: MediaState) => media.requests.filter((r) => r.status === 'open')

function create(state: GameState, media: MediaState, orgId: string, kind: RequestKind, f: Fighter, week: number, ttl: number, eventId?: Id): MediaRequest {
  const r: MediaRequest = { id: nextId(media, 'rq'), organisationId: orgId, kind, fighterId: f.id, fighterName: fighterName(f), eventId, createdWeek: week, expiresWeek: week + ttl, status: 'open' }
  media.requests.unshift(r)
  const id = mediaIdentity(orgId)
  mediaMessage(state, media, {
    from: id.shortName, category: 'world', priority: 'normal', key: `req-${r.id}`,
    subject: `MEDIA REQUEST: ${id.name} would like ${fighterName(f)}`,
    body: `${id.name} has asked for ${REQUEST_LABEL[kind]} with ${fighterName(f)}. You can accept, decline, or offer another fighter from your roster. The request lapses in ${ttl} week${ttl === 1 ? '' : 's'}.`,
    link: { kind: 'screen', screen: 'media' },
  })
  while (media.requests.length > LIMITS.requests) { const i = media.requests.map((x, j) => ({ x, j })).reverse().find((e) => e.x.status !== 'open')?.j; media.requests.splice(i ?? media.requests.length - 1, 1) }
  return r
}

/** Weekly: expire stale requests and let outlets ask for the player's most talked-about fighters. */
export function weeklyRequests(state: GameState, media: MediaState, week: number, steps = 1): void {
  for (const r of media.requests) if (r.status === 'open' && week > r.expiresWeek) { r.status = 'expired'; r.result = 'The request lapsed without an answer.'; shiftRelation(media, r.organisationId, state.playerPromotionId, -1) }
  if (openRequests(media).length >= 4) return
  const roster = rosterOf(state).map((f) => ({ f, m: mediaOf(media, f) })).filter((x) => x.m.interest >= 18 || x.f.popularity >= 20).sort((a, b) => b.m.interest - a.m.interest).slice(0, 6)
  let made = 0
  const rng = keyedRng(state.seed, 'req', week)
  for (const { f, m } of roster) {
    for (const orgId of MEDIA_ORDER) {
      if (made >= 1) return
      const b = MEDIA_BEHAVIOURS[orgId]
      if (b.appetite < 30 || media.orgs[orgId]?.active === false) continue
      if (media.requests.some((r) => r.organisationId === orgId && r.fighterId === f.id && week - r.createdWeek < 10)) continue
      const rel = relationOf(media, orgId, state.playerPromotionId) + relationOf(media, orgId, f.id)
      const p = (b.appetite / 100) * (0.012 + 0.075 * Math.pow(m.interest / 100, 1.5)) * (1 + rel / 200) * steps
      if (rng.next() >= p) continue
      const inCamp = f.activeFightId && state.fights[f.activeFightId] && (state.fights[f.activeFightId].day - state.today) / 7 <= 6
      const kind: RequestKind = b.type === 'PODCAST' ? 'PODCAST' : b.type === 'INFLUENCER' ? 'PROMO_VIDEO' : inCamp && b.videos.includes('DOCUMENTARY') ? 'TRAINING_CAMP' : b.videos.includes('DOCUMENTARY') && m.interest >= 45 && !inCamp ? 'DOCUMENTARY' : 'INTERVIEW'
      create(state, media, orgId, kind, f, week, 3)
      made++
      break
    }
  }
}

/** A player's fighter wins something worth a few words: the outlet with the biggest audience asks for a post-fight interview. */
export function postFightRequest(state: GameState, media: MediaState, ev: WorldEvent): void {
  if (!ev.fightId || ev.sig < 30 || ev.facts.draw) return
  const winner = state.fighters[ev.fighters[0]]
  if (!winner || !rosterOf(state).some((f) => f.id === winner.id)) return
  const week = weekIndex(state)
  const orgs = MEDIA_ORDER.filter((id) => MEDIA_BEHAVIOURS[id].videos.includes('POST_FIGHT_INTERVIEW') && media.orgs[id]?.active !== false)
    .sort((a, b) => (media.orgs[b]?.audience ?? 0) - (media.orgs[a]?.audience ?? 0))
  const org = orgs.find((id) => !media.requests.some((r) => r.organisationId === id && r.fighterId === winner.id && r.status === 'open'))
  if (org) create(state, media, org, 'POST_FIGHT_INTERVIEW', winner, week, 2)
}

export interface RequestOutcome { ok: boolean; message: string }

function applyInterview(state: GameState, media: MediaState, r: MediaRequest, f: Fighter, scale: number): string {
  const org = MEDIA_BEHAVIOURS[r.organisationId]
  const week = weekIndex(state)
  const persona = personaOf(f.personality)
  const gain = (6 + org.influence * 0.08 + (r.kind === 'DOCUMENTARY' || r.kind === 'TRAINING_CAMP' ? 6 : 0)) * ATTENTION[persona] * scale
  addInterest(media, f, gain, week)
  const prof = profileOf(media, f)
  prof.followers = Math.round(prof.followers + (media.orgs[r.organisationId]?.audience ?? org.audience) * 0.003 * (org.videoReach / 100) * scale)
  if (media.effects) f.popularity = Math.min(100, f.popularity + 0.5 * ATTENTION[persona] * scale * (org.influence / 80))
  shiftRelation(media, r.organisationId, state.playerPromotionId, (3 + org.appetite / 25) * scale)
  shiftRelation(media, r.organisationId, f.id, 4 * scale)
  const ev: WorldEvent = { kind: 'FEATURE', day: state.today, fighters: [f.id], names: [fighterName(f)], promotions: [state.playerPromotionId], facts: {}, sig: Math.round(clampTo(18 + mediaOf(media, f).interest * 0.3)), parts: {}, tags: [] }
  const v = publishVideo(state, media, r.organisationId, VIDEO_FOR[r.kind], ev, 0.1)
  let text = `${fighterName(f)} earned a lift in attention (+${Math.round(gain)} media interest)`
  if (v) text += `; the video drew ${v.views.toLocaleString('en-GB')} views`
  // A flare-up: deterministic for this request and fighter.
  const flash = FLASH[persona] + org.controversyBias / 1500
  if (keyedFloat(state.seed, 'flare', r.id) < flash) {
    addInterest(media, f, 7, week)
    shiftRelation(media, r.organisationId, f.id, -3)
    const h = `${fighterName(f)} gets people talking after appearing on ${mediaIdentity(r.organisationId).name}`
    const fev: WorldEvent = { kind: 'FEATURE', day: state.today, fighters: [f.id], names: [fighterName(f)], promotions: [state.playerPromotionId], facts: { h, s: `${mediaIdentity(r.organisationId).name} · ${REQUEST_LABEL[r.kind]}`, body: `${fighterName(f)} appeared with ${mediaIdentity(r.organisationId).name}; the clip drew a strong reaction online.` }, sig: Math.round(clampTo(30 + mediaOf(media, f).interest * 0.25)), parts: {}, tags: ['flare'] }
    coverEvent(state, media, fev, `flare:${r.id}`)
    text += '. It also stirred a little controversy'
  }
  return text + '.'
}

export function respondRequest(state: GameState, media: MediaState, id: string, answer: 'accept' | 'decline' | 'redirect', altFighterId?: Id): RequestOutcome {
  const r = media.requests.find((x) => x.id === id)
  if (!r || r.status !== 'open') return { ok: false, message: 'That request is no longer open.' }
  const f = state.fighters[r.fighterId]
  if (!f) { r.status = 'expired'; return { ok: false, message: 'That fighter is no longer on your books.' } }
  const orgName = mediaIdentity(r.organisationId).name
  if (answer === 'accept') {
    r.status = 'accepted'
    r.result = applyInterview(state, media, r, f, 1)
    return { ok: true, message: r.result }
  }
  if (answer === 'decline') {
    r.status = 'declined'
    const cost = MEDIA_BEHAVIOURS[r.organisationId].appetite >= 70 ? 5 : 3
    shiftRelation(media, r.organisationId, state.playerPromotionId, -cost)
    r.result = `You turned ${orgName} down. The relationship cooled (−${cost}).`
    return { ok: true, message: r.result }
  }
  const alt = altFighterId ? state.fighters[altFighterId] : undefined
  if (!alt || alt.id === f.id || !rosterOf(state).some((x) => x.id === alt.id)) return { ok: false, message: 'Choose another fighter from your roster.' }
  const diff = mediaOf(media, alt).interest - mediaOf(media, f).interest
  const p = clampTo(0.35 + diff / 100 + (relationOf(media, r.organisationId, state.playerPromotionId) / 200), 0.1, 0.9, )
  const ok = keyedFloat(state.seed, 'redirect', r.id, alt.id) < p
  if (ok) {
    r.status = 'redirected'; r.altFighterId = alt.id
    shiftRelation(media, r.organisationId, state.playerPromotionId, -1)
    r.result = `${orgName} agreed to ${fighterName(alt)} instead. ${applyInterview(state, media, { ...r, fighterId: alt.id }, alt, 0.8)}`
    return { ok: true, message: r.result }
  }
  r.status = 'declined'
  shiftRelation(media, r.organisationId, state.playerPromotionId, -3)
  r.result = `${orgName} passed on ${fighterName(alt)} and the request lapsed (−3 with them).`
  return { ok: true, message: r.result }
}

// ----------------------------------------------------------------- Press conferences

const APPROACH: Record<PressApproach, { hype: number; rivalry: number; interest: number; rel: number; contro: number; tone: string }> = {
  RESPECTFUL: { hype: 1.5, rivalry: 0, interest: 3, rel: 3, contro: 0.02, tone: 'a respectful exchange' },
  CONFIDENT: { hype: 3, rivalry: 4, interest: 6, rel: 1, contro: 0.08, tone: 'a confident showing' },
  AGGRESSIVE: { hype: 5, rivalry: 10, interest: 9, rel: -1, contro: 0.25, tone: 'a heated face-off' },
  CONTROVERSIAL: { hype: 7, rivalry: 16, interest: 13, rel: -5, contro: 0.55, tone: 'a deliberately provocative performance' },
  DIPLOMATIC: { hype: 1, rivalry: -3, interest: 2, rel: 5, contro: 0, tone: 'a calm, diplomatic session' },
}
export const PRESS_APPROACHES = Object.keys(APPROACH) as PressApproach[]
export const approachInfo = (a: PressApproach) => APPROACH[a]

/** Weekly: shows the player is promoting get a press conference to attend. */
export function weeklyPressers(state: GameState, media: MediaState, week: number): void {
  for (const p of media.pressers) if (p.status === 'open' && week > p.expiresWeek) p.status = 'expired'
  for (const ev of Object.values(state.events)) {
    if (ev.promotionId !== state.playerPromotionId || !['onSale', 'promoting'].includes(ev.status) || media.pressers.some((p) => p.eventId === ev.id)) continue
    const weeks = Math.floor((ev.day - state.today) / 7)
    if (weeks < 1 || weeks > 5) continue
    const main = state.fights[ev.card[ev.card.length - 1]]
    if (!main || main.status === 'cancelled') continue
    // Not every show earns a press conference: only fights with something to sell, and not back to back.
    const why = pressWorthy(state, ev, main)
    if (!why) continue
    if (media.pressers.some((p) => week - p.createdWeek < 6) || media.pressers.some((p) => p.status === 'open')) continue
    const roster = new Set(rosterOf(state).map((f) => f.id))
    const ids: [Id, Id] = roster.has(main.sideB.fighterId) && !roster.has(main.sideA.fighterId) ? [main.sideB.fighterId, main.sideA.fighterId] : [main.sideA.fighterId, main.sideB.fighterId]
    const names: [string, string] = [fighterName(state.fighters[ids[0]]), fighterName(state.fighters[ids[1]])]
    const v = state.venues[ev.venueId]
    const pc: PressConference = { id: nextId(media, 'pc'), eventId: ev.id, fightId: main.id, fighterIds: ids, names, createdWeek: week, expiresWeek: Math.max(week + 1, week + weeks - 1), status: 'open', why, cost: pressCost(v?.capacity ?? 1000) }
    media.pressers.unshift(pc)
    if (media.pressers.length > LIMITS.pressers) media.pressers.length = LIMITS.pressers
    mediaMessage(state, media, {
      from: 'Press office', category: 'world', priority: 'normal', key: `presser-${pc.id}`,
      subject: `PRESS CONFERENCE: ${names[0]} v ${names[1]}`,
      body: `The press are gathering for ${ev.name} (${why.toLowerCase()}). It costs about £${(pc.cost ?? 0).toLocaleString('en-GB')} to stage. How you handle the conference — respectful, confident, aggressive, provocative or diplomatic — sets the tone for the build-up. Choose before the fight week.`,
      link: { kind: 'screen', screen: 'media' },
    })
  }
}

export function holdPress(state: GameState, media: MediaState, id: string, approach: PressApproach): RequestOutcome {
  const pc = media.pressers.find((x) => x.id === id)
  if (!pc || pc.status !== 'open') return { ok: false, message: 'That press conference has already happened or lapsed.' }
  const ev = state.events[pc.eventId]
  const a = state.fighters[pc.fighterIds[0]], b = state.fighters[pc.fighterIds[1]]
  if (!ev || !a || !b) { pc.status = 'expired'; return { ok: false, message: 'The show is no longer on.' } }
  const base = APPROACH[approach]
  const pa = personaOf(a.personality), pb = personaOf(b.personality)
  const cost = pc.cost ?? pressCost(state.venues[ev.venueId]?.capacity ?? 1000)
  if (state.promotions[state.playerPromotionId].cash < cost) return { ok: false, message: `You cannot afford the £${cost.toLocaleString('en-GB')} it costs to stage the conference.` }
  spend(state, ev, 'marketing', cost, `Press conference — ${ev.name}`)
  const heatBefore = rivalryStrength(media, a.id, b.id)
  const fit = approachFit(approach, pa)
  const oppHeat = ['TRASH_TALKER', 'CONTROVERSIAL', 'EMOTIONAL'].includes(pb) ? 1.3 : 1
  // A feud sold with no history behind it can read as manufactured: the press smell it and the hype is blunted.
  const manufactured = base.rivalry >= 10 && heatBefore < 10 && !['TRASH_TALKER', 'CONTROVERSIAL', 'EMOTIONAL'].includes(pa) && !['TRASH_TALKER', 'CONTROVERSIAL', 'EMOTIONAL'].includes(pb)
  const backlash = manufactured && keyedFloat(state.seed, 'pressback', pc.id) < 0.4
  const hype = Math.round(base.hype * fit * (backlash ? 0.4 : 1) * 10) / 10
  const rivalry = Math.round(base.rivalry * fit * (base.rivalry > 0 ? oppHeat : 1))
  const interest = Math.round(base.interest * fit * ATTENTION[pa])
  const controversy = keyedFloat(state.seed, 'press', pc.id) < base.contro * fit + FLASH[pa] + FLASH[pb] * 0.5 * (base.contro > 0.1 ? 1 : 0)
  const week = weekIndex(state)
  media.eventHype[ev.id] = Math.min(12, (media.eventHype[ev.id] ?? 0) + hype + (controversy ? 2 : 0))
  if (rivalry !== 0) bumpRivalry(media, a.id, b.id, rivalry)
  addInterest(media, a, interest + (controversy ? 5 : 0), week)
  addInterest(media, b, interest * 0.8 + (controversy ? 3 : 0), week)
  const relDelta = base.rel * (controversy ? 1.4 : 1)
  for (const orgId of MEDIA_ORDER) if (MEDIA_BEHAVIOURS[orgId].appetite >= 50) shiftRelation(media, orgId, state.playerPromotionId, relDelta * (MEDIA_BEHAVIOURS[orgId].controversyBias > 60 && relDelta < 0 ? -0.5 : 1))
  const text = `${pc.names[0]} and ${pc.names[1]} faced the press in ${base.tone}. Show hype +${hype}${controversy ? ' (+2 from the flare-up)' : ''}, ${rivalry >= 0 ? 'rivalry' : 'rivalry'} ${rivalry >= 0 ? '+' : ''}${rivalry}, media interest +${interest}.`
  pc.status = 'done'; pc.approach = approach
  if (backlash) { state.promotions[state.playerPromotionId].reputation = Math.max(0, state.promotions[state.playerPromotionId].reputation - 0.3) }
  pressPolitics(state, pc, approach, a.id, b.id, rivalry, heatBefore)
  pc.result = { hype, rivalry, interest, relationship: Math.round(relDelta * 10) / 10, controversy, text: backlash ? `${text} The feud rang hollow: the press saw through it and the promotion's name took a small knock.` : text, backlash }
  const pev: WorldEvent = { kind: 'PRESS_CONFERENCE', day: state.today, fighters: [a.id, b.id], names: pc.names, promotions: [state.playerPromotionId], eventId: ev.id, fightId: pc.fightId, facts: { a: pc.names[0], b: pc.names[1], ev: ev.name, what: `${pc.names[0]} and ${pc.names[1]} met the press ahead of ${ev.name} in ${base.tone}${controversy ? ', and the exchange boiled over' : ''}`, div: weightClassLabel(a.weightClass) }, sig: Math.round(clampTo(18 + (media.eventHype[ev.id] ?? 0) * 2 + interest)), parts: {}, tags: controversy ? ['flare'] : [] }
  coverEvent(state, media, pev, `press:${pc.id}`)
  for (const orgId of MEDIA_ORDER) publishVideo(state, media, orgId, 'PRESS_CONFERENCE', pev)
  ensureRivalryNarrative(state, media, a.id, b.id)
  return { ok: true, message: text }
}

