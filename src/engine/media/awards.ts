/**
 * ANNUAL AWARDS. A running log of the calendar year (points for results, the best fight, knockout, upset and show) is kept as the
 * year goes by; at year end the winners are read straight from it. Nothing is awarded for something that did not happen, and every
 * award keeps the figures behind it.
 */
import { mediaIdentity } from '../../data/mediaIdentity'
import { fighterAge, fighterName } from '../fighters'
import { yearOf } from '../calendar'
import type { BoxingEvent, Fight, GameState, Id } from '../types'
import { addCareer } from './career'
import { mediaMessage } from './inbox'
import { pushAwards } from './records'
import { coverEvent } from './stories'
import { freshYearLog } from './state'
import type { AwardCategory, AwardRec, MediaState } from './types'
import type { WorldEvent } from './worldEvents'
import { STOPPAGES } from './worldEvents'
import { rosterOf } from './requests'
import { clampTo } from './util'

export const AWARD_LABEL: Record<AwardCategory, string> = {
  FIGHTER_OF_THE_YEAR: 'Fighter of the Year', FIGHT_OF_THE_YEAR: 'Fight of the Year', KO_OF_THE_YEAR: 'Knockout of the Year', PROSPECT_OF_THE_YEAR: 'Prospect of the Year',
  UPSET_OF_THE_YEAR: 'Upset of the Year', COMEBACK_OF_THE_YEAR: 'Comeback of the Year', EVENT_OF_THE_YEAR: 'Event of the Year', PROMOTER_OF_THE_YEAR: 'Promoter of the Year',
}
const GIVEN_BY: Record<AwardCategory, string> = {
  FIGHTER_OF_THE_YEAR: 'ringside', FIGHT_OF_THE_YEAR: 'ringside', KO_OF_THE_YEAR: 'fightwiretv', PROSPECT_OF_THE_YEAR: 'insideropes',
  UPSET_OF_THE_YEAR: 'fightroom', COMEBACK_OF_THE_YEAR: 'insideropes', EVENT_OF_THE_YEAR: 'boxingdaily', PROMOTER_OF_THE_YEAR: 'ringside',
}
export const AWARD_CATEGORIES = Object.keys(AWARD_LABEL) as AwardCategory[]

function yearOfLog(state: GameState, media: MediaState): void {
  if (media.yearLog.year !== yearOf(state.today) && Object.keys(media.yearLog.fighters).length === 0) media.yearLog = freshYearLog(yearOf(state.today))
}

/** Add one processed fight to the running year. */
export function logFight(state: GameState, media: MediaState, ev: WorldEvent, fight: Fight): void {
  yearOfLog(state, media)
  const log = media.yearLog
  const r = fight.result
  if (!r) return
  const A = state.fighters[fight.sideA.fighterId], B = state.fighters[fight.sideB.fighterId]
  if (!A || !B) return
  const decided = r.winner !== null
  const W = decided ? (r.winner === 0 ? A : B) : null
  const L = decided ? (r.winner === 0 ? B : A) : null
  const titled = !!fight.title
  if (W && L) {
    const stop = STOPPAGES.includes(r.method)
    const pts = 2 + ev.sig / 12 + r.upset * 6 + (titled ? 4 : 0) + (stop ? 1 : 0)
    const cur = (log.fighters[W.id] ??= { pts: 0, wins: 0, ranked: 0, n: fighterName(W) })
    cur.pts += pts; cur.wins++
    if (W.record.losses <= 1 && fighterAge(W, state.today) <= 24) {
      const p = (log.prospects[W.id] ??= { n: fighterName(W), pts: 0 })
      p.pts += 2 + (stop ? 1 : 0) + ev.sig / 20
    }
    if (stop) {
      const score = ev.sig + (r.round <= 2 ? 10 : 0) + (r.method === 'KO' ? 5 : 0)
      if (!log.bestKo || score > log.bestKo.score) log.bestKo = { id: fight.id, score, label: `${fighterName(W)} stopped ${fighterName(L)} in round ${r.round}`, f: W.id, n: fighterName(W) }
    }
    if (r.upset > 0.6) {
      const score = r.upset * 100 + ev.sig * 0.3
      if (!log.bestUpset || score > log.bestUpset.score) log.bestUpset = { id: fight.id, score, label: `${fighterName(W)} beat ${fighterName(L)} by ${ev.facts.m}`, f: W.id, n: fighterName(W) }
    }
  }
  const close = ['SD', 'MD', 'SDRAW', 'MDRAW', 'DRAW'].includes(r.method) ? 8 : 0
  const score = ev.sig + 6 * (r.kd[0] + r.kd[1]) + close + (!STOPPAGES.includes(r.method) && fight.scheduledRounds >= 10 ? 4 : 0)
  if (!log.bestFight || score > log.bestFight.score) log.bestFight = { id: fight.id, score, label: `${fighterName(A)} v ${fighterName(B)}`, ps: [A.id, B.id] }
}

export function logComeback(state: GameState, media: MediaState, id: Id, sig: number): void {
  yearOfLog(state, media)
  const f = state.fighters[id]
  if (!f) return
  const c = (media.yearLog.comebacks[id] ??= { n: fighterName(f), pts: 0 })
  c.pts += sig
}

export function logShow(state: GameState, media: MediaState, ev: BoxingEvent): void {
  yearOfLog(state, media)
  const r = ev.result
  if (!r) return
  const log = media.yearLog
  const score = r.importance + r.reputation * 0.5 + (r.attendance / Math.max(1, state.venues[ev.venueId].capacity)) * 10
  if (!log.bestEvent || score > log.bestEvent.score) log.bestEvent = { id: ev.id, score, label: ev.name, pr: ev.promotionId }
  log.promos[ev.promotionId] = (log.promos[ev.promotionId] ?? 0) + r.reputation / 10 + (r.profit > 0 ? 2 : -1)
}

const best = <T,>(rec: Record<Id, T>, key: (t: T) => number): [Id, T] | null => {
  let top: [Id, T] | null = null
  for (const [id, v] of Object.entries(rec)) if (!top || key(v) > key(top[1]) || (key(v) === key(top[1]) && id < top[0])) top = [id, v]
  return top
}

/** Winners for a completed year. Each carries the figures that decided it. */
export function decideAwards(state: GameState, media: MediaState): AwardRec[] {
  const log = media.yearLog
  const out: AwardRec[] = []
  const add = (a: Omit<AwardRec, 'year' | 'organisationId'>) => out.push({ ...a, year: log.year, organisationId: GIVEN_BY[a.category] })
  const fo = best(log.fighters, (x) => x.pts)
  if (fo && fo[1].wins >= 2) add({ category: 'FIGHTER_OF_THE_YEAR', fighterId: fo[0], fighterName: fo[1].n, label: fo[1].n, facts: { wins: fo[1].wins, points: Math.round(fo[1].pts) } })
  if (log.bestFight && log.bestFight.score >= 40) add({ category: 'FIGHT_OF_THE_YEAR', fightId: log.bestFight.id, label: log.bestFight.label, fighterId: log.bestFight.ps[0], facts: { score: Math.round(log.bestFight.score) } })
  if (log.bestKo && log.bestKo.score >= 30) add({ category: 'KO_OF_THE_YEAR', fightId: log.bestKo.id, fighterId: log.bestKo.f, fighterName: log.bestKo.n, label: log.bestKo.label, facts: { score: Math.round(log.bestKo.score) } })
  const pr = best(log.prospects, (x) => x.pts)
  if (pr && pr[1].pts >= 8) add({ category: 'PROSPECT_OF_THE_YEAR', fighterId: pr[0], fighterName: pr[1].n, label: pr[1].n, facts: { points: Math.round(pr[1].pts) } })
  if (log.bestUpset) add({ category: 'UPSET_OF_THE_YEAR', fightId: log.bestUpset.id, fighterId: log.bestUpset.f, fighterName: log.bestUpset.n, label: log.bestUpset.label, facts: { score: Math.round(log.bestUpset.score) } })
  const cb = best(log.comebacks, (x) => x.pts)
  if (cb) add({ category: 'COMEBACK_OF_THE_YEAR', fighterId: cb[0], fighterName: cb[1].n, label: cb[1].n, facts: { points: Math.round(cb[1].pts) } })
  if (log.bestEvent) add({ category: 'EVENT_OF_THE_YEAR', eventId: log.bestEvent.id, promotionId: log.bestEvent.pr, label: log.bestEvent.label, facts: { score: Math.round(log.bestEvent.score) } })
  const pm = Object.entries(log.promos).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]
  if (pm && pm[1] > 0 && state.promotions[pm[0]]) add({ category: 'PROMOTER_OF_THE_YEAR', promotionId: pm[0], label: state.promotions[pm[0]].name, facts: { points: Math.round(pm[1]) } })
  return out
}

/** Year end: decide, record, announce, then start a fresh log. */
export function yearEndAwards(state: GameState, media: MediaState): void {
  const awards = decideAwards(state, media)
  if (awards.length) pushAwards(media, awards)
  const mine = new Set(rosterOf(state).map((f) => f.id))
  for (const a of awards) {
    const org = mediaIdentity(a.organisationId)
    const who = a.fighterName ?? a.label
    const why = a.category === 'FIGHTER_OF_THE_YEAR' ? `${a.facts.wins} wins and the year's biggest results` : a.category === 'EVENT_OF_THE_YEAR' ? `the best show of the year` : a.category === 'PROMOTER_OF_THE_YEAR' ? `the year's strongest run of shows` : a.label
    const w: WorldEvent = {
      kind: 'AWARD', day: state.today, fighters: a.fighterId ? [a.fighterId] : [], names: a.fighterName ? [a.fighterName] : [], promotions: a.promotionId ? [a.promotionId] : [], fightId: a.fightId, eventId: a.eventId,
      facts: { cat: AWARD_LABEL[a.category], year: a.year, who, why: `${org.name} named ${who} for ${AWARD_LABEL[a.category]} ${a.year}: ${why}` }, sig: Math.round(clampTo(48 + (a.fighterId ? (state.fighters[a.fighterId]?.popularity ?? 20) * 0.2 : 8))), parts: {}, tags: ['award'],
    }
    coverEvent(state, media, w, `award:${a.year}:${a.category}`)
    if (a.fighterId) addCareer(media, a.fighterId, { d: state.today, k: 'AWARD', a: `${AWARD_LABEL[a.category]} ${a.year}` })
    const playerWon = (a.fighterId && mine.has(a.fighterId)) || a.promotionId === state.playerPromotionId
    if (playerWon) mediaMessage(state, media, { from: org.shortName, category: 'world', priority: 'important', key: `award-${a.year}-${a.category}`, subject: `AWARD: ${who} — ${AWARD_LABEL[a.category]} ${a.year}`, body: `${org.name} has named ${who} ${AWARD_LABEL[a.category]} for ${a.year}.`, link: a.fighterId ? { kind: 'fighter', id: a.fighterId } : { kind: 'screen', screen: 'media' } })
  }
  media.yearLog = freshYearLog(yearOf(state.today))
}

/** December: tell the player which of their people are among the leading candidates. */
export function awardNominations(state: GameState, media: MediaState): void {
  const log = media.yearLog
  if (log.nominated || yearOf(state.today) !== log.year) return
  log.nominated = true
  const mine = new Set(rosterOf(state).map((f) => f.id))
  const top = (rec: Record<Id, { pts: number }>) => Object.entries(rec).sort((a, b) => b[1].pts - a[1].pts).slice(0, 3).map(([id]) => id)
  const hits: string[] = []
  for (const id of top(log.fighters)) if (mine.has(id)) hits.push(`${fighterName(state.fighters[id])} (Fighter of the Year)`)
  for (const id of top(log.prospects)) if (mine.has(id)) hits.push(`${fighterName(state.fighters[id])} (Prospect of the Year)`)
  const promo = Object.entries(log.promos).sort((a, b) => b[1] - a[1])[0]
  if (promo && promo[0] === state.playerPromotionId) hits.push('your promotion (Promoter of the Year)')
  if (hits.length) mediaMessage(state, media, { from: mediaIdentity('ringside').shortName, category: 'world', priority: 'normal', key: `nom-${log.year}`, subject: `AWARD NOMINATION: ${hits[0]}`, body: `Among the leading candidates in this year's awards: ${hits.join(', ')}. Winners are announced at the turn of the year.`, link: { kind: 'screen', screen: 'media' } })
}
