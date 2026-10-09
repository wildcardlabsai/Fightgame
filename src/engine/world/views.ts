/**
 * Public view models for the living world. Everything here is something the player could see from outside: shows held and announced,
 * fighters signed and let go, belts held, and which dates a rival show cuts across. Rival finances, appraisals and plans never appear.
 */
import { eventInterest } from '../events/demand'
import { fighterName } from '../fighters'
import { titlesHeldBy } from '../media/titles'
import { tierLabel } from '../tiers'
import type { Day, GameState, Id } from '../types'
import { isDefunct } from './lifecycle'
import { pursuitOf, weeksToDecision } from './pursuit'

const WEEKS_BACK = 26
export type RivalStatus = 'Expanding' | 'Active' | 'Cutting back' | 'Quiet' | 'Folding' | 'Folded' | 'New'

export interface RivalStanding {
  id: Id
  name: string
  tier: string
  status: RivalStatus
  /** One short, factual reason for the status. */
  why: string
  roster: number
  signed: number
  departed: number
  /** Shows held in the last six months. */
  shows: number
  next: { id: Id; day: Day; name: string; city: string } | null
  belts: number
  home: string
}

const live = (s: string) => s !== 'cancelled' && s !== 'planning'

/** Public movements of fighters in and out of one promotion over the last `weeks` weeks (from the fighters' own career histories). */
export function moveCounts(state: GameState, promoId: Id, weeks = WEEKS_BACK): { signed: number; departed: number } {
  const from = state.today - weeks * 7
  let signed = 0, departed = 0
  for (const f of Object.values(state.fighters)) {
    for (let i = f.history.length - 1; i >= 0; i--) {
      const h = f.history[i]
      if (h.day < from) break
      if (h.promotionId !== promoId) continue
      if (h.kind === 'signed') signed++
      else if (h.kind === 'released' || h.kind === 'expired') departed++
    }
  }
  return { signed, departed }
}

export function rivalStandings(state: GameState): RivalStanding[] {
  const rosterBy: Record<Id, Id[]> = {}
  for (const c of Object.values(state.contracts)) (rosterBy[c.promotionId] ??= []).push(c.fighterId)
  const eventsBy: Record<Id, { held: number; next: RivalStanding['next'] }> = {}
  for (const e of Object.values(state.events)) {
    if (!live(e.status)) continue
    const r = (eventsBy[e.promotionId] ??= { held: 0, next: null })
    if (e.day <= state.today && e.day > state.today - WEEKS_BACK * 7) r.held++
    if (e.day > state.today && (!r.next || e.day < r.next.day)) r.next = { id: e.id, day: e.day, name: e.name, city: e.city }
  }
  const media = state.media
  const out: RivalStanding[] = []
  for (const p of Object.values(state.promotions)) {
    if (p.isPlayer) continue
    const roster = rosterBy[p.id] ?? []
    const { signed, departed } = moveCounts(state, p.id)
    const ev = eventsBy[p.id] ?? { held: 0, next: null }
    const age = (state.today - p.foundedDay) / 7
    let status: RivalStatus = 'Active', why = `${ev.held} show${ev.held === 1 ? '' : 's'} in six months`
    if (isDefunct(state, p)) { status = 'Folded'; why = 'No fighters, no shows; the money has gone' }
    else if (p.ai?.fin.collapsing) { status = 'Folding'; why = 'Backers have withdrawn; the roster is being run down' }
    else if (age < 52 && p.foundedDay > state.startDay) { status = 'New'; why = 'Launched within the last year' }
    else if (departed - signed >= 3) { status = 'Cutting back'; why = `${departed} fighters left, ${signed} signed` }
    else if (ev.held === 0 && !ev.next) { status = 'Quiet'; why = 'No shows held or announced' }
    else if (signed - departed >= 3) { status = 'Expanding'; why = `${signed} fighters signed, ${departed} left` }
    const belts = media?.effects ? roster.reduce((n, id) => n + titlesHeldBy(media, id).length, 0) : 0
    out.push({ id: p.id, name: p.name, tier: tierLabel(p.tier), status, why, roster: roster.length, signed, departed, shows: ev.held, next: ev.next, belts, home: p.homeCountry })
  }
  return out
}

export interface RivalMoveView { day: Day; kind: 'signed' | 'released' | 'expired'; fighterId: Id; text: string }

/** The most recent public signings and departures for one promotion. */
export function recentMoves(state: GameState, promoId: Id, limit = 8): RivalMoveView[] {
  const out: RivalMoveView[] = []
  for (const f of Object.values(state.fighters)) {
    for (let i = f.history.length - 1; i >= 0 && i >= f.history.length - 6; i--) {
      const h = f.history[i]
      if (h.promotionId !== promoId || (h.kind !== 'signed' && h.kind !== 'released' && h.kind !== 'expired')) continue
      const rec = `${f.record.wins}-${f.record.losses}-${f.record.draws}`
      out.push({ day: h.day, kind: h.kind, fighterId: f.id, text: `${h.kind === 'signed' ? 'Signed' : h.kind === 'released' ? 'Released' : 'Contract ended:'} ${fighterName(f)} (${rec})` })
    }
  }
  return out.sort((a, b) => b.day - a.day || (a.fighterId < b.fighterId ? -1 : 1)).slice(0, limit)
}

export interface Clash { promotion: string; name: string; city: string; day: Day; major: boolean }

/** Rival shows that would cut across a show of yours on `day` in `country` (same country, within two days: the audience the demand model splits). */
export function clashesOn(state: GameState, day: Day, country: string, exceptEvent?: Id): Clash[] {
  const out: Clash[] = []
  for (const e of Object.values(state.events)) {
    if (e.id === exceptEvent || !live(e.status) || e.status === 'archived' || e.country !== country) continue
    if (Math.abs(e.day - day) > 2 || e.promotionId === state.playerPromotionId) continue
    out.push({ promotion: state.promotions[e.promotionId]?.name ?? 'A rival', name: e.name, city: e.city, day: e.day, major: e.card.length ? eventInterest(state, e) >= 45 : false })
  }
  return out
}

export interface RivalOffer { promotion: string; weeks: number }

/** An offer on the table for a fighter the player is aware of: who made it and roughly when the answer comes. Null when none or unknown to the player. */
export function rivalOfferFor(state: GameState, fighterId: Id): RivalOffer | null {
  if (!state.knowledge[fighterId]) return null
  const p = pursuitOf(state, fighterId)
  if (!p) return null
  return { promotion: state.promotions[p.promoId]?.name ?? 'A rival', weeks: weeksToDecision(state, p) }
}
