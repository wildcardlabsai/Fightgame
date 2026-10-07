/**
 * WORLD EVENTS AND MEDIA SIGNIFICANCE.
 * The media world never invents what happened. It reads the engine (processed fights, settled events, signings, retirements,
 * rankings, titles) and turns each into a structured WorldEvent whose `facts` are the only thing story text may use.
 * Significance is a deterministic, explainable 0–100 score; the same facts always give the same number.
 */
import { weightClassLabel } from '../../data/weightClasses'
import { fighterName } from '../fighters'
import { dayToDate } from '../calendar'
import { rivalryHeat } from '../events/demand'
import { cardFights } from '../events/demand'
import type { BoxingEvent, Day, Fight, Fighter, GameState, Id } from '../types'
import { mediaOf } from './popularity'
import { PRIMARY_RANKING } from './orgs'
import { rankIn } from './rankings'
import type { Facts, MediaState, StoryKind } from './types'
import type { TitleEvent } from './titles'
import { titleName } from './titles'
import { clampTo, pairKey, totalFightsOf, weekIndex } from './util'
import { bodyIdentity } from '../../data/mediaIdentity'

export interface WorldEvent {
  kind: StoryKind
  day: Day
  /** Principal fighters first (e.g. winner, loser). */
  fighters: Id[]
  names: string[]
  promotions: Id[]
  fightId?: Id
  eventId?: Id
  venueId?: Id
  facts: Facts
  sig: number
  parts: Record<string, number>
  /** Short tags the copy and the video system can react to. */
  tags: string[]
}

export const METHOD_WORDS: Record<string, string> = {
  UD: 'unanimous decision', MD: 'majority decision', SD: 'split decision', DRAW: 'draw', MDRAW: 'majority draw', SDRAW: 'split draw',
  KO: 'knockout', TKO: 'technical knockout', RTD: 'corner retirement', INJ: 'injury stoppage',
}
export const STOPPAGES = ['KO', 'TKO', 'RTD', 'INJ']

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)

export function primaryRank(media: MediaState, f: Fighter): number | null {
  const r = rankIn(media, PRIMARY_RANKING, f.weightClass, f.id)
  return r !== null && r >= 1 ? r : null
}

function venueScale(state: GameState, ev: BoxingEvent | undefined): number {
  const v = ev ? state.venues[ev.venueId] : undefined
  return v ? Math.max(0, Math.min(12, 4 * Math.log10(Math.max(300, v.capacity) / 300))) : 0
}

/** Billing and platform: how many people could see this fight. */
function exposureBonus(state: GameState, fight: Fight): number {
  const ev = fight.eventId ? state.events[fight.eventId] : undefined
  if (!ev) return 0
  const idx = ev.card.indexOf(fight.id), n = ev.card.length
  const slot = idx === n - 1 ? 6 : idx === n - 2 && n >= 3 ? 3 : 0
  const plat = { none: 0, localTv: 1, nationalTv: 3, streaming: 2, ppv: 5 }[ev.broadcast.kind] ?? 0
  return slot + plat + venueScale(state, ev)
}

/** Significance of a fight, before or after it is fought (`result` adds the outcome components). */
export function fightSignificance(state: GameState, media: MediaState, fight: Fight, titled: boolean): { sig: number; parts: Record<string, number> } {
  const a = state.fighters[fight.sideA.fighterId], b = state.fighters[fight.sideB.fighterId]
  const p: Record<string, number> = {}
  if (!a || !b) return { sig: 0, parts: p }
  const hiPop = Math.max(a.popularity, b.popularity), loPop = Math.min(a.popularity, b.popularity)
  p.fame = 0.3 * hiPop + 0.2 * Math.max(a.reputation, b.reputation) + 0.05 * loPop
  const ra = primaryRank(media, a), rb = primaryRank(media, b)
  const best = Math.min(ra ?? 99, rb ?? 99)
  p.ranks = best <= 1 ? 14 : best <= 3 ? 11 : best <= 5 ? 8 : best <= 10 ? 5 : 0
  if (ra !== null && rb !== null) p.ranks += 4
  p.title = titled ? 38 : 0
  p.stage = exposureBonus(state, fight)
  p.rivalry = Math.min(9, 3 * rivalryHeat(state, a, b)) + Math.min(10, (media.rivalry[pairKey(a.id, b.id)] ?? 0) * 0.1)
  const attention = Math.max(mediaOf(media, a).interest, mediaOf(media, b).interest)
  p.attention = 0.08 * attention
  const unbeaten = (x: Fighter) => x.record.losses === 0 && totalFightsOf(x) >= 10
  p.unbeaten = unbeaten(a) && unbeaten(b) ? 8 : unbeaten(a) || unbeaten(b) ? 3 : 0
  const r = fight.result
  if (r) {
    const decided = r.winner !== null
    p.upset = decided ? 38 * r.upset : 0
    p.stoppage = STOPPAGES.includes(r.method) ? (r.method === 'KO' ? 8 : 6) + (r.round <= 2 ? 4 : 0) : 0
    p.knockdowns = Math.min(9, 3 * (r.kd[0] + r.kd[1]))
    p.closeness = ['SD', 'MD', 'DRAW', 'SDRAW', 'MDRAW'].includes(r.method) ? 4 : 0
    const loser = decided ? (r.winner === 0 ? fight.sideB : fight.sideA) : null
    const loserBefore = loser ? state.fighters[loser.fighterId] : null
    if (loserBefore && loserBefore.record.losses === 1 && loserBefore.record.draws === 0 && loserBefore.record.wins >= 8) p.unbeatenFell = 12
  }
  // Soft saturation: a stack of big factors approaches 100 without ever pinning to it.
  return { sig: Math.round(100 * (1 - Math.exp(-sum(p) / 170))), parts: p }
}

const recText = (f: Fighter) => `${f.record.wins}-${f.record.losses}-${f.record.draws}`

function winStreakOf(state: GameState, f: Fighter): number {
  let n = 0
  for (let i = f.recentFights.length - 1; i >= 0; i--) {
    const ft = state.fights[f.recentFights[i]]
    if (!ft?.result) continue
    const isA = ft.sideA.fighterId === f.id
    const w = ft.result.winner
    if (w !== null && (w === 0) === isA) n++
    else break
  }
  return n
}

/** Pre-fight context captured at the moment of the result (rankings are not yet updated). */
function cardsText(fight: Fight): string {
  return (fight.result?.cards ?? []).map((c) => `${c[0]}-${c[1]}`).join(', ')
}

/** A processed fight → the single most specific story-worthy world event, plus the facts every story about it can use. */
export function eventFromFight(state: GameState, media: MediaState, fight: Fight, titleEvs: TitleEvent[]): WorldEvent | null {
  const r = fight.result
  if (!r) return null
  const A = state.fighters[fight.sideA.fighterId], B = state.fighters[fight.sideB.fighterId]
  if (!A || !B) return null
  const decided = r.winner !== null
  // A drawn title fight is told from the champion's side (he kept the belt); otherwise side A leads.
  const drawChamp = !decided && titleEvs[0]?.kind === 'TITLE_DEFENCE' && titleEvs[0].f === B.id
  const W = decided ? (r.winner === 0 ? A : B) : drawChamp ? B : A
  const L = decided ? (r.winner === 0 ? B : A) : drawChamp ? A : B
  const titled = titleEvs.length > 0
  const { sig, parts } = fightSignificance(state, media, fight, titled)
  const ev = fight.eventId ? state.events[fight.eventId] : undefined
  const venue = ev ? state.venues[ev.venueId] : fight.venueId ? state.venues[fight.venueId] : undefined
  const stop = STOPPAGES.includes(r.method)
  const wRound = r.round
  const facts: Facts = {
    w: fighterName(W), l: fighterName(L), wl: W.lastName, ll: L.lastName, wid: W.id, lid: L.id,
    m: METHOD_WORDS[r.method] ?? r.method, mc: r.method, rd: wRound, sr: fight.scheduledRounds, kd: r.kd[0] + r.kd[1],
    up: Math.round(r.upset * 100) / 100, city: fight.city, venue: venue?.name ?? null, wrec: recText(W), lrec: recText(L),
    wrank: primaryRank(media, W), lrank: primaryRank(media, L), div: weightClassLabel(fight.weightClass), draw: !decided,
    sc: cardsText(fight), streak: winStreakOf(state, W),
  }
  if (stop) facts.tm = `${Math.floor(r.second / 60)}:${String(r.second % 60).padStart(2, '0')}`
  if (ev?.result) facts.att = ev.result.attendance
  const loserWasUnbeaten = decided && L.record.losses === 1 && L.record.draws === 0 && L.record.wins >= 8
  const tags: string[] = []
  if (stop) tags.push('stoppage')
  if (r.kd[0] + r.kd[1] >= 3) tags.push('war')
  if (r.upset > 0.62 && decided) tags.push('upset')
  if (loserWasUnbeaten) { tags.push('unbeaten-fell'); facts.lwins = L.record.wins }
  if (W.record.losses === 0 && W.record.draws === 0 && totalFightsOf(W) >= 10 && decided) tags.push('unbeaten-win')

  let kind: StoryKind = 'FIGHT_RESULT'
  const te = titleEvs[0]
  if (te && (te.kind === 'TITLE_CHANGE' || te.kind === 'TITLE_FILLED')) {
    kind = 'TITLE_CHANGE'; facts.title = titleName(te.body, fight.weightClass); facts.body = bodyIdentity(te.body).shortName; facts.old = te.o && te.kind === 'TITLE_CHANGE' ? fighterName(state.fighters[te.o] ?? L) : null; facts.vacant = te.kind === 'TITLE_FILLED'
  } else if (te && te.kind === 'TITLE_DEFENCE') {
    kind = 'TITLE_DEFENCE'; facts.title = titleName(te.body, fight.weightClass); facts.body = bodyIdentity(te.body).shortName; facts.def = te.defences ?? 1
  } else if (tags.includes('upset')) kind = 'UPSET'
  else if (loserWasUnbeaten) kind = 'UNBEATEN_FELL'
  else if (['KO', 'TKO'].includes(r.method) && (sig >= 20 || r.round <= 3)) kind = 'KNOCKOUT'
  else if (tags.includes('war')) kind = 'WAR'
  else if (['SD', 'MD', 'SDRAW', 'MDRAW', 'DRAW'].includes(r.method) && sig >= 28) kind = 'CONTROVERSIAL_DECISION'
  else if (decided && W.record.wins >= 4 && totalFightsOf(W) <= 12 && W.record.losses <= 1 && winStreakOf(state, W) >= 4 && (primaryRank(media, W) !== null || W.popularity >= 35) && r.upset > 0.25) kind = 'PROSPECT_BREAKOUT'

  const tagsOut = tags
  return {
    kind, day: fight.day, fighters: [W.id, L.id], names: [fighterName(W), fighterName(L)], promotions: [fight.sideA.promotionId, fight.sideB.promotionId].filter((x): x is Id => !!x),
    fightId: fight.id, eventId: fight.eventId, venueId: venue?.id, facts, sig, parts, tags: tagsOut,
  }
}

/** Sig for event-level happenings (sell-outs, record crowds, PPV outcomes, cancellations). */
export function eventsFromShow(state: GameState, _media: MediaState, ev: BoxingEvent): WorldEvent[] {
  const r = ev.result
  const v = state.venues[ev.venueId]
  const promo = state.promotions[ev.promotionId]
  const out: WorldEvent[] = []
  if (!r || !v || !promo) return out
  const fights = cardFights(state, ev)
  const main = fights[fights.length - 1]
  const mainNames = main ? [fighterName(state.fighters[main.sideA.fighterId]), fighterName(state.fighters[main.sideB.fighterId])] : []
  const base = (kind: StoryKind, sig: number, parts: Record<string, number>, facts: Facts, tags: string[]): WorldEvent => ({
    kind, day: ev.day, fighters: main ? [main.sideA.fighterId, main.sideB.fighterId] : [], names: mainNames, promotions: [ev.promotionId], eventId: ev.id, venueId: v.id,
    facts: { ev: ev.name, promo: promo.name, venue: v.name, city: v.city, cap: v.capacity, att: r.attendance, ...facts }, sig: Math.round(clampTo(sig, 0, 100)), parts, tags,
  })
  const scale = Math.max(0, Math.min(16, 5 * Math.log10(Math.max(300, v.capacity) / 300)))
  const promoFame = promo.reputation * 0.25
  const fill = r.attendance / v.capacity
  if (r.attendance >= v.capacity && v.capacity >= 1000) out.push(base('SELL_OUT', 12 + scale * 2.2 + promoFame + r.importance * 0.25, { scale, promoFame }, { fill: 100 }, ['sellout']))
  if (r.notable.some((n) => n.startsWith('Record crowd'))) out.push(base('RECORD_CROWD', 18 + scale * 2.2 + promoFame + r.importance * 0.25, { scale, promoFame }, { fill: Math.round(fill * 100) }, ['record']))
  if (ev.broadcast.kind === 'ppv') {
    const buys = r.ppvBuys
    if (buys >= 15000) out.push(base('PPV_SUCCESS', 20 + Math.min(40, buys / 2500) + promoFame, { buys: buys / 2500, promoFame }, { buys, price: ev.broadcast.ppvPrice }, ['ppv']))
    else if (buys < 2000) out.push(base('PPV_FAILURE', 14 + Math.min(18, 2000 / Math.max(100, buys)) + promoFame, { promoFame }, { buys, price: ev.broadcast.ppvPrice }, ['ppv']))
  }
  return out
}

export function cancelledEvent(state: GameState, ev: BoxingEvent): WorldEvent | null {
  const v = state.venues[ev.venueId], promo = state.promotions[ev.promotionId]
  if (!v || !promo) return null
  const fights = ev.card.map((id) => state.fights[id]).filter((f): f is Fight => !!f)
  const main = fights[fights.length - 1]
  return {
    kind: 'EVENT_CANCELLED', day: state.today, fighters: main ? [main.sideA.fighterId, main.sideB.fighterId] : [], names: main ? [fighterName(state.fighters[main.sideA.fighterId]), fighterName(state.fighters[main.sideB.fighterId])] : [],
    promotions: [ev.promotionId], eventId: ev.id, venueId: v.id, facts: { ev: ev.name, promo: promo.name, venue: v.name, city: v.city, why: ev.cancelReason ?? null, cap: v.capacity },
    sig: Math.round(clampTo(10 + 5 * Math.log10(Math.max(300, v.capacity) / 300) * 2 + promo.reputation * 0.25, 0, 100)), parts: { stage: 1 }, tags: ['cancel'],
  }
}

/** Upcoming fights worth an announcement story. */
export function announcedFight(state: GameState, media: MediaState, fight: Fight, titleBodies: string[]): WorldEvent | null {
  const A = state.fighters[fight.sideA.fighterId], B = state.fighters[fight.sideB.fighterId]
  if (!A || !B) return null
  const { sig, parts } = fightSignificance(state, media, fight, titleBodies.length > 0)
  const ev = fight.eventId ? state.events[fight.eventId] : undefined
  const d = dayToDate(fight.day)
  const facts: Facts = {
    a: fighterName(A), b: fighterName(B), al: A.lastName, bl: B.lastName, arec: recText(A), brec: recText(B), arank: primaryRank(media, A), brank: primaryRank(media, B),
    div: weightClassLabel(fight.weightClass), city: fight.city || null, date: `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`,
    rounds: fight.scheduledRounds, ev: ev?.name ?? null, rematch: !!fight.rematchOf,
  }
  if (titleBodies.length) { facts.title = fight.title?.name ?? titleName(titleBodies[0], fight.weightClass) }
  const rival = (media.rivalry[pairKey(A.id, B.id)] ?? 0)
  const tags: string[] = []
  if (rival >= 25 || rivalryHeat(state, A, B) >= 1) { tags.push('rivalry'); facts.heat = rivalryHeat(state, A, B) }
  return { kind: titleBodies.length ? 'TITLE_FIGHT_SET' : tags.includes('rivalry') ? 'RIVALRY' : 'FIGHT_ANNOUNCED', day: state.today, fighters: [A.id, B.id], names: [fighterName(A), fighterName(B)], promotions: [fight.sideA.promotionId, fight.sideB.promotionId].filter((x): x is Id => !!x), fightId: fight.id, eventId: fight.eventId, facts, sig, parts, tags }
}

export const weekOf = (state: GameState) => weekIndex(state)
