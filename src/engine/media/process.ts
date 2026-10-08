/**
 * THE MEDIA PIPELINE.
 *   Engine truth → world event → coverage → narratives → popularity / rankings → commercial consequences.
 * `processMedia` is idempotent for results (a fight or show is ingested once) and does its weekly work at most once per game
 * week, so it can safely run both at the end of a tick and straight after the player runs a fight night.
 * It uses keyed randomness only and its own id counter, so it can never move the game's RNG or ids.
 */
import { yearOf } from '../calendar'
import { fighterName } from '../fighters'
import { rankLabel, reasonText } from './reasons'
import { mediaMessage } from './inbox'
import { rosterOf } from './requests'
import { rankingIdentity } from '../../data/mediaIdentity'
import { weightClassLabel } from '../../data/weightClasses'
import type { BoxingEvent, Fight, Fighter, GameState, Id, WeightClassId } from '../types'
import { levelOf } from '../business/titleDefs'
import { addCareer, seedCareers } from './career'
import { narrativesFromFight, narrativesFromRetirement, narrativesFromTitle, weeklyNarratives } from './narratives'
import { addInterest, decayProfiles, profileOf } from './popularity'
import { RANK_ORG_BY_ID } from './orgs'
import { rankIn, reseatLists, updateRankings, type RankMove } from './rankings'
import { freshMedia, LIMITS } from './state'
import { coverEvent, pruneStories } from './stories'
import { activateTitles, flagTitleFights, installChampions, maintainTitles, settleTitleFight, titleName, type TitleEvent } from './titles'
import type { MediaState } from './types'
import { koCompilations, applyViral, unwindViral, videosFromFight } from './videos'
import { announcedFight, cancelledEvent, eventFromFight, eventsFromShow, primaryRank, type WorldEvent } from './worldEvents'
import { clampTo, fname, pushCapped, totalFightsOf, weekIndex } from './util'
import { bodyIdentity } from '../../data/mediaIdentity'
import { formatDay } from '../calendar'
import { runExtensions } from './extensions'
import { flushRecords, getReigns } from './records'

/** Build the media world for a game that has none: rankings, inaugural champions, profiles, opening career lines. */
export function initMediaWorld(state: GameState): MediaState {
  const media = freshMedia(state)
  state.media = media
  updateRankings(state, media, true)
  installChampions(state, media)
  updateRankings(state, media, true)
  for (const f of Object.values(state.fighters)) {
    if (f.status !== 'active') continue
    if (f.popularity >= 40 || f.reputation >= 45) profileOf(media, f)
  }
  seedCareers(state, media)
  media.week = weekIndex(state)
  return media
}

export const ensureMedia = (state: GameState): MediaState => state.media ?? initMediaWorld(state)

const seen = (media: MediaState, key: string) => media.seenFights.includes(key) || media.seenEvents.includes(key)
const mark = (media: MediaState, key: string, list: 'f' | 'e' = 'f') => {
  const arr = list === 'f' ? media.seenFights : media.seenEvents
  arr.push(key)
  const cap = list === 'f' ? LIMITS.seenFights : LIMITS.seenEvents
  if (arr.length > cap) arr.splice(0, arr.length - cap)
}

// -------------------------------------------------------------------------------- results

interface Ingested { events: WorldEvent[] }

function effectsOfCoverage(state: GameState, media: MediaState, ev: WorldEvent, outlets: number): void {
  const week = weekIndex(state)
  const fighters = ev.fighters.map((id) => state.fighters[id]).filter((f): f is Fighter => !!f)
  fighters.forEach((f, i) => {
    const winner = i === 0 && !ev.facts.draw && ev.fightId !== undefined
    const share = winner ? 1 : 0.65
    const pts = ev.sig * 0.38 * (0.35 + 0.65 * Math.min(1, outlets / 3)) * share
    addInterest(media, f, pts, week)
    const m = profileOf(media, f)
    m.stories += outlets
    m.fanbase = Math.round(m.fanbase * (1 + (winner ? 1 : 0.3) * ev.sig / 5000))
    m.followers = Math.round(m.followers * (1 + (winner ? 1 : 0.4) * ev.sig / 3000))
    if (media.effects && outlets > 0 && ev.sig >= 45) f.popularity = Math.min(100, f.popularity + Math.min(1.5, (outlets * ev.sig) / 450) * (winner ? 1 : 0.35))
  })
}

function careerFromFight(state: GameState, media: MediaState, ev: WorldEvent, fight: Fight, titleEvs: TitleEvent[]): void {
  const r = fight.result!
  const A = state.fighters[fight.sideA.fighterId], B = state.fighters[fight.sideB.fighterId]
  if (!A || !B) return
  const day = fight.day
  const decided = r.winner !== null
  if (!decided) {
    // A drawn title fight is still a defence for the champion.
    for (const te of titleEvs) if (te.kind === 'TITLE_DEFENCE' && te.f) addCareer(media, te.f, { d: day, k: 'TITLE_DEFENCE', a: titleName(te.body, fight.weightClass), n: te.defences })
    return
  }
  const W = r.winner === 0 ? A : B, L = r.winner === 0 ? B : A
  if (ev.tags.includes('upset')) addCareer(media, W.id, { d: day, k: 'UPSET', a: fighterName(L), n: Number(ev.facts.lrank ?? 0) || undefined })
  if (ev.tags.includes('unbeaten-fell')) addCareer(media, L.id, { d: day, k: 'FIRST_LOSS', a: fighterName(W) })
  if (W.record.losses === 0 && W.record.draws === 0 && totalFightsOf(W) >= 10 && totalFightsOf(W) % 5 === 0) addCareer(media, W.id, { d: day, k: 'UNBEATEN', n: W.record.wins })
  for (const te of titleEvs) {
    const t = titleName(te.body, fight.weightClass)
    if (te.kind === 'TITLE_CHANGE' || te.kind === 'TITLE_FILLED') {
      addCareer(media, W.id, { d: day, k: 'TITLE_WON', a: t })
      if (te.kind === 'TITLE_CHANGE') addCareer(media, L.id, { d: day, k: 'TITLE_LOST', a: t })
    } else if (te.kind === 'TITLE_DEFENCE') addCareer(media, W.id, { d: day, k: 'TITLE_DEFENCE', a: t, n: te.defences })
  }
  const ev2 = fight.eventId ? state.events[fight.eventId] : undefined
  if (ev2 && ev2.card[ev2.card.length - 1] === fight.id) for (const x of [A, B]) addCareer(media, x.id, { d: day, k: 'MAIN_EVENT', a: ev2.name })
}

function ingestFights(state: GameState, media: MediaState): Ingested {
  const events: WorldEvent[] = []
  const fights = Object.values(state.fights)
    .filter((f) => f.result && f.processedDay !== undefined && state.today - f.processedDay <= 28 && !seen(media, f.id))
    .sort((a, b) => (a.processedDay! - b.processedDay!) || (a.id < b.id ? -1 : 1))
  for (const fight of fights) {
    mark(media, fight.id)
    const titleEvs = settleTitleFight(state, media, fight)
    if (titleEvs.length) reseatLists(state, media, [fight.weightClass])
    const ev = eventFromFight(state, media, fight, titleEvs)
    if (!ev) continue
    events.push(ev)
    const { outlets, stories } = coverEvent(state, media, ev, fight.id)
    effectsOfCoverage(state, media, ev, outlets)
    careerFromFight(state, media, ev, fight, titleEvs)
    const vids = videosFromFight(state, media, ev)
    applyViral(state, media, ev, vids)
    // Narratives and the features they produce.
    const features = narrativesFromFight(state, media, ev, fight)
    for (const te of titleEvs) features.push(...narrativesFromTitle(state, media, te.kind, te.f, te.o, te.defences, fight.id))
    for (const ft of features) { const c = coverEvent(state, media, ft, `${fight.id}:${ft.facts.h}`); effectsOfCoverage(state, media, { ...ft, sig: ft.sig * 0.4 }, c.outlets > 0 ? 1 : 0) }
    // A weigh-in incident is public the moment it happens.
    for (const [side, f] of [[fight.sideA, state.fighters[fight.sideA.fighterId]], [fight.sideB, state.fighters[fight.sideB.fighterId]]] as const) {
      if (side.prep.weightIssue && f) {
        const wi: WorldEvent = { kind: 'WEIGH_IN', day: fight.day, fighters: [f.id], names: [fighterName(f)], promotions: [], fightId: fight.id, eventId: fight.eventId, facts: { n: fighterName(f), div: weightClassLabel(fight.weightClass), ev: fight.eventId ? state.events[fight.eventId]?.name ?? 'the fight' : 'the fight' }, sig: Math.round(clampTo(10 + ev.sig * 0.45)), parts: { fight: ev.sig * 0.45 }, tags: ['weighin'] }
        const wc = coverEvent(state, media, wi, `${fight.id}:wi:${f.id}`)
        effectsOfCoverage(state, media, { ...wi, sig: wi.sig * 0.5 }, wc.outlets)
      }
    }
    runExtensions.afterFight(state, media, ev, fight, stories)
    // Title consequences that need their own story (new vacancy etc.) are handled with the weekly title events.
  }
  return { events }
}

function ingestEvents(state: GameState, media: MediaState): void {
  const shows = Object.values(state.events).filter((e) => (e.result && e.settled && state.today - e.result.settledDay <= 28) || (e.status === 'cancelled' && e.cancelReason !== undefined && state.today - e.createdDay <= 400))
  for (const ev of shows.sort((a, b) => (a.day - b.day) || (a.id < b.id ? -1 : 1))) {
    const key = ev.status === 'cancelled' ? `c:${ev.id}` : `e:${ev.id}`
    if (seen(media, key)) continue
    mark(media, key, 'e')
    if (ev.status === 'cancelled') {
      const w = cancelledEvent(state, ev)
      if (w) coverEvent(state, media, w, key)
      continue
    }
    const list = eventsFromShow(state, media, ev)
    for (const w of list) { const c = coverEvent(state, media, w, `${key}:${w.kind}`); promoCoverage(state, media, ev, c.outlets) }
    runExtensions.afterShow(state, media, ev)
  }
}

function promoCoverage(_state: GameState, media: MediaState, ev: BoxingEvent, outlets: number): void {
  const m = (media.promotions[ev.promotionId] ??= { sporting: 50, media: 50, fan: 50, commercial: 50, tags: [], mentions: 0 })
  m.mentions += outlets
}

// ---------------------------------------------------------------------------------- weekly

function titleEventToWorld(state: GameState, te: TitleEvent): WorldEvent | null {
  const f = te.f ? state.fighters[te.f] : undefined
  const o = te.o ? state.fighters[te.o] : undefined
  const body = bodyIdentity(te.body)
  const div = weightClassLabel(te.wc)
  const title = titleName(te.body, te.wc)
  const lvl = levelOf(te.body)
  const lvlSig = lvl === 'world' ? 14 : lvl === 'european' ? 9 : lvl === 'domestic' ? 6 : 2
  const feature = (h: string, sub: string, text: string, sig: number, fighters: Id[], tags: string[]): WorldEvent => ({
    kind: 'FEATURE', day: state.today, fighters, names: fighters.map((id) => fighterName(state.fighters[id])), promotions: [], facts: { h, s: sub, body: text },
    sig: Math.round(clampTo(sig)), parts: { title: lvlSig }, tags,
  })
  if (te.kind === 'MANDATORY' && f && te.o) {
    const ch = state.fighters[te.o]
    return { kind: 'MANDATORY', day: state.today, fighters: [f.id, te.o], names: [fighterName(f), fighterName(ch)], promotions: [], facts: { body: body.shortName, c: fighterName(f), ch: fighterName(ch), div, due: formatDay(state.today + 26 * 7, false), title }, sig: Math.round(clampTo(26 + lvlSig + f.popularity * 0.3 + f.reputation * 0.2)), parts: { champion: f.popularity * 0.3 }, tags: ['mandatory'] }
  }
  if ((te.kind === 'STRIPPED' || te.kind === 'TITLE_VACANT') && te.f) {
    const n = f ? fighterName(f) : 'The champion'
    return { kind: te.kind === 'STRIPPED' ? 'STRIPPED' : 'TITLE_VACANT', day: state.today, fighters: [te.f], names: [n], promotions: [], facts: { n, title, body: body.shortName, div, how: te.how ?? '' }, sig: Math.round(clampTo(30 + lvlSig + (f?.popularity ?? 20) * 0.3 + (f?.reputation ?? 20) * 0.2)), parts: { vacancy: 30 }, tags: ['vacancy'] }
  }
  if (te.kind === 'ELIM_ORDERED' && f && o) return feature(`${body.shortName} order ${div} eliminator: ${fighterName(f)} v ${fighterName(o)}`, 'The winner becomes the mandatory challenger', `${body.name} have ordered an eliminator between ${fighterName(f)} and ${fighterName(o)}, two of the leading ${div} contenders. The winner will be named mandatory challenger for the ${title}.`, 24 + lvlSig + (f.popularity + o.popularity) * 0.15, [f.id, o.id], ['eliminator'])
  if (te.kind === 'ELIM_RESULT' && f && o) return feature(`${fighterName(f)} wins the ${body.shortName} ${div} eliminator`, `Now mandatory challenger for the ${title}`, `${fighterName(f)} beat ${fighterName(o)} in the ${body.name} ${div} eliminator and has been named mandatory challenger for the ${title}.`, 28 + lvlSig + f.popularity * 0.2, [f.id, o.id], ['eliminator'])
  if (te.kind === 'MANDATORY_EXTENDED' && f && o) return feature(`${body.shortName} extend the deadline for ${fighterName(f)} v ${fighterName(o)}`, te.how ?? 'Deadline extended', `${body.name} have given the ${div} champion and challenger eight more weeks to make the mandatory defence: ${te.how ?? 'a valid delay'}.`, 18 + lvlSig, [f.id, o.id], ['mandatory'])
  if (te.kind === 'TITLE_OPEN' && lvl !== 'area') return feature(`The ${title} is vacant and open to contenders`, `${div} · ${body.shortName}`, `The ${title} has no champion. The leading ${body.name} ${div} contenders are expected to meet for it.`, 14 + lvlSig, [], ['vacancy'])
  if ((te.kind === 'UNIFIED' || te.kind === 'UNDISPUTED') && f) return feature(te.kind === 'UNDISPUTED' ? `${fighterName(f)} is the undisputed ${div} champion` : `${fighterName(f)} unifies the ${div} titles`, te.kind === 'UNDISPUTED' ? 'Every world title in the division' : 'More than one world belt', `${fighterName(f)} now holds ${te.kind === 'UNDISPUTED' ? 'every world title in the division' : 'more than one world title'} at ${div}.`, 52 + f.popularity * 0.3, [f.id], ['unification'])
  return null
}

function moveToWorld(state: GameState, _media: MediaState, mv: RankMove): WorldEvent | null {
  const f = state.fighters[mv.f]
  if (!f || mv.to === null) return null
  const org = RANK_ORG_BY_ID[mv.orgId]
  const fromText = mv.from === null ? 'unranked' : mv.from === 0 ? 'champion' : `#${mv.from}`
  const toText = mv.to === 0 ? 'champion' : `#${mv.to}`
  const sig = 14 + (mv.to <= 1 ? 22 : mv.to <= 3 ? 14 : mv.to <= 5 ? 8 : 2) + f.popularity * 0.15 + org.authority * 0.2 + (f.contractId && state.contracts[f.contractId]?.promotionId === state.playerPromotionId ? 8 : 0)
  return {
    kind: 'RANKING_CHANGE', day: state.today, fighters: [f.id], names: [fighterName(f)], promotions: [], facts: { n: fighterName(f), div: weightClassLabel(f.weightClass), list: rankingIdentity(mv.orgId).shortName, from: mv.from, to: mv.to, fromText, toText, why: reasonText(mv.why, mv.from, mv.to, (id) => (state.fighters[id] ? fighterName(state.fighters[id]) : undefined)) },
    sig: Math.round(clampTo(sig)), parts: { authority: org.authority * 0.2 }, tags: ['ranking'],
  }
}

function weekly(state: GameState, media: MediaState, week: number, ingested: Ingested): void {
  /** Whole weeks since the last full pass (the tick runs the media pipeline every second week). */
  const steps = Math.max(1, week - Math.max(media.week, week - 8))
  const lastDay = state.startDay + Math.max(media.week, -1) * 7
  const out: WorldEvent[] = []

  // Rankings and titles
  const moves = updateRankings(state, media)
  const titleEvs = [...activateTitles(state, media), ...maintainTitles(state, media), ...flagTitleFights(state, media)]
  // A belt vacated, or a fighter retired, since the lists were last published: keep every list truthful.
  const touched = new Set<WeightClassId>(titleEvs.filter((t) => t.kind === 'TITLE_VACANT' || t.kind === 'STRIPPED').map((t) => t.wc))
  for (const f of Object.values(state.fighters)) if (f.status === 'retired' && f.retiredDay !== null && f.retiredDay > lastDay) touched.add(f.weightClass)
  if (touched.size) reseatLists(state, media, touched)
  const mine = new Set(rosterOf(state).map((f) => f.id))
  const bestPerFighter = new Map<Id, RankMove>()
  for (const mv of moves) {
    if (mv.to === null || !(mv.from === null || mv.to < mv.from)) continue
    const cur = bestPerFighter.get(mv.f)
    if (!cur || RANK_ORG_BY_ID[mv.orgId].authority > RANK_ORG_BY_ID[cur.orgId].authority) bestPerFighter.set(mv.f, mv)
  }
  for (const mv of bestPerFighter.values()) {
    if (mv.orgId !== 'ringside' && mv.orgId !== 'atlas' && mv.orgId !== 'index') continue
    const w = moveToWorld(state, media, mv)
    if (w && (mv.to! <= 3 || w.sig >= 40)) out.push(w)
    const f = state.fighters[mv.f]
    if (f && mv.orgId === 'ringside' && mv.to !== null && mv.to <= 10 && mine.has(f.id)) {
      mediaMessage(state, media, { from: rankingIdentity('ringside').shortName, category: 'world', priority: 'normal', key: `rk-${f.id}-${mv.to}`, subject: `RANKING UPDATE: ${fighterName(f)} is now ${rankLabel(mv.to)} at ${weightClassLabel(f.weightClass)}`, body: `${rankingIdentity('ringside').name} now list ${fighterName(f)} at ${rankLabel(mv.to)} in the ${weightClassLabel(f.weightClass)} division${mv.from === null ? ', up from unranked' : `, up from ${rankLabel(mv.from)}`}. ${reasonText(mv.why, mv.from, mv.to, (id) => (state.fighters[id] ? fighterName(state.fighters[id]) : undefined))}.`, link: { kind: 'fighter', id: f.id } })
    }
    if (f) {
      if (mv.orgId === 'ringside' && mv.to !== null && mv.to <= 10 && (mv.from === null || mv.from > 10)) addCareer(media, f.id, { d: state.today, k: 'RANKED', a: rankingIdentity('ringside').shortName, n: mv.to })
      if (mv.orgId === 'ringside' && mv.to !== null && mv.to <= 5 && (mv.from === null || mv.from > 5)) addCareer(media, f.id, { d: state.today, k: 'TOP5', a: rankingIdentity('ringside').shortName, n: mv.to })
      if (mv.orgId === 'ringside' && mv.to === 1) addCareer(media, f.id, { d: state.today, k: 'NO1', a: rankingIdentity('ringside').shortName, n: 1 })
    }
  }
  for (const te of titleEvs) {
    if (te.kind === 'TITLE_FIGHT_SET' && te.fightId) {
      runExtensions.onTitleEvent(state, media, te)
      const fight = state.fights[te.fightId]
      const w = fight ? announcedFight(state, media, fight, media.titleFights[fight.id] ?? []) : null
      if (w && fight && !seen(media, `a:${fight.id}`)) { mark(media, `a:${fight.id}`); out.push(w) }
    } else if (te.kind === 'MANDATORY_WARNING' || te.kind === 'MANDATORY') {
      runExtensions.onTitleEvent(state, media, te)
      const w = te.kind === 'MANDATORY' ? titleEventToWorld(state, te) : null
      if (w) out.push(w)
    } else {
      runExtensions.onTitleEvent(state, media, te)
      const w = titleEventToWorld(state, te)
      if (w) out.push(w)
    }
  }

  // Fights announced this week (scheduled, not yet seen)
  for (const fight of Object.values(state.fights)) {
    if (fight.result || !['scheduled', 'training', 'fightNight'].includes(fight.status) || seen(media, `a:${fight.id}`)) continue
    if ((fight.day - state.today) / 7 > 14) continue
    mark(media, `a:${fight.id}`)
    const w = announcedFight(state, media, fight, media.titleFights[fight.id] ?? [])
    const mine = [fight.sideA.promotionId, fight.sideB.promotionId].includes(state.playerPromotionId)
    if (w && w.sig >= (mine ? 26 : 38)) out.push(w)
  }

  // Signings, releases and retirements from the engine's own records.
  for (const f of Object.values(state.fighters)) {
    const last = f.history[f.history.length - 1]
    if (last && last.day > lastDay && last.day <= state.today && (last.kind === 'signed' || last.kind === 'released')) {
      const promo = last.promotionId ? state.promotions[last.promotionId] : undefined
      const mine = last.promotionId === state.playerPromotionId
      const sig = 8 + f.popularity * 0.32 + f.reputation * 0.25 + (mine ? 6 : 0)
      if (sig >= 22 && promo) {
        out.push({ kind: last.kind === 'signed' ? 'SIGNING' : 'RELEASE', day: last.day, fighters: [f.id], names: [fighterName(f)], promotions: [promo.id], facts: { n: fighterName(f), promo: promo.name, rec: `${f.record.wins}-${f.record.losses}-${f.record.draws}`, div: weightClassLabel(f.weightClass) }, sig: Math.round(clampTo(sig)), parts: { fame: sig }, tags: [] })
        if (last.kind === 'signed') addCareer(media, f.id, { d: last.day, k: 'SIGNED', a: promo.name })
        else addCareer(media, f.id, { d: last.day, k: 'RELEASED', a: promo.name })
      }
    }
    if (f.status === 'retired' && f.retiredDay !== null && f.retiredDay > lastDay && f.retiredDay <= state.today) {
      const sig = 6 + f.reputation * 0.5 + f.popularity * 0.2 + (titlesIn(media, f.id) ? 18 : 0)
      const peak = titlesIn(media, f.id) ? `Held ${titlesIn(media, f.id)} title${titlesIn(media, f.id) === 1 ? '' : 's'} in his career` : ''
      if (sig >= 24) out.push({ kind: 'RETIREMENT', day: f.retiredDay, fighters: [f.id], names: [fighterName(f)], promotions: [], facts: { n: fighterName(f), rec: `${f.record.wins}-${f.record.losses}-${f.record.draws}`, peak }, sig: Math.round(clampTo(sig)), parts: { career: sig }, tags: [] })
      addCareer(media, f.id, { d: f.retiredDay, k: 'RETIRED', a: `${f.record.wins}-${f.record.losses}-${f.record.draws}` })
      narrativesFromRetirement(state, media, f)
    }
  }

  // Narrative sweep (call-outs, championship hunts, fading) may add stories of its own.
  out.push(...weeklyNarratives(state, media, ingested.events, steps))

  // Publish this week's non-fight stories.
  out.forEach((w, i) => {
    const c = coverEvent(state, media, w, `${w.kind}:${week}:${i}:${w.fighters.join(',')}`)
    effectsOfCoverage(state, media, { ...w, sig: w.sig * 0.7 }, c.outlets)
  })

  // Maintenance
  unwindViral(state, media, steps)
  decayProfiles(state, media, steps)
  koCompilations(state, media)
  runExtensions.weekly(state, media, week, steps)
  pruneStories(media, week)
  if (yearOf(state.today) !== media.yearLog.year) runExtensions.yearEnd(state, media)
  void fname; void pushCapped; void rankIn; void primaryRank
}

const titlesIn = (media: MediaState, id: Id): number => getReigns(media).filter((r) => r.f === id).length + Object.values(media.titles).filter((t) => t.c === id).length

/** The full media pass (rankings, storylines, requests, offers…) runs every second game week; results are still read as soon as they are on the books. */
export const PASS_EVERY = 2

export function processMedia(state: GameState): void {
  const media = ensureMedia(state)
  const week = weekIndex(state)
  const ingested = ingestFights(state, media)
  ingestEvents(state, media)
  if (week > media.week && week % PASS_EVERY === 0) { weekly(state, media, week, ingested); media.week = week }
  flushRecords(media)
}
