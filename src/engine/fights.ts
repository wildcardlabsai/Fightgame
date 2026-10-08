/**
 * FIGHTS: creation, availability, scheduling, camp, fight night and post-fight processing.
 * The Fight entity is the system of record; fighters only hold `activeFightId` and a short `recentFights` list.
 */
import { planFightFactors } from './business/plans'
import { VENUE_SEEDS } from '../data/venues'
import { regionOf } from '../data/nations'
import { weightClassLabel } from '../data/weightClasses'
import { BALANCE as B } from './balance'
import { FEATURES } from './config'
import { weeksBetween } from './calendar'
import { clamp, fighterAge, fighterName, totalFights, type PublicFacts, publicFacts, visibility } from './fighters'
import { buildSimFighter, roundsFor, sizeEdge, weightCompatible, type SimFighter } from './fight/profile'
import { rollCampInjury, rollFightInjury } from './fight/injuries'
import { STATUS_LABEL, isOpen, transition } from './fight/lifecycle'
import { METHOD_LABEL, isStoppage, resultHeadline, resultSummary } from './fight/narrative'
import { simulateFight } from './fight/sim'
import { stateIds } from './ids'
import { observeFightPerformance } from './knowledge'
import { post } from './ledger'
import { spend } from './eventFinance'
import { postMessage, postNews } from './messages'
import { keyedRng, type Rng } from './rng'
import type {
  Contract, Day, Fight, FightMethod, FightPrep, FightSide, FightTerms, Fighter, GameState, Id, Offer,
} from './types'

const SAT = 5 // fights happen on Saturdays; the weekly clock ticks on Mondays

// -------------------------------------------------------------- Public standing

/** Public standing score used for "expected" outcomes and division standing. Public information only. */
export function publicStanding(p: PublicFacts, momentum = 0): number {
  const fights = p.record.wins + p.record.losses + p.record.draws
  const winPct = fights ? p.record.wins / fights : 0.5
  return 0.5 * p.reputation + 0.25 * p.popularity + 20 * (winPct - 0.5) * Math.min(1, fights / 10) + 0.05 * momentum
}

export function publicExpectation(state: GameState, a: Fighter, b: Fighter): number {
  const sA = publicStanding(publicFacts(a, state.today), a.momentum)
  const sB = publicStanding(publicFacts(b, state.today), b.momentum)
  return 1 / (1 + Math.exp(-(sA - sB) / 12))
}

// ------------------------------------------------------------------ Availability

export interface Availability {
  ok: boolean
  reason: string | null
  /** Earliest day this fighter could realistically fight. */
  earliestDay: Day
}

export function restUntil(f: Fighter): Day {
  const base = f.lastFightDay === null ? 0 : f.lastFightDay + B.fights.restWeeks * 7
  return Math.max(base, f.suspendedUntil ?? 0)
}

/** Can this fighter take a fight? Pass `forDay` to test a specific date. */
export function fightAvailability(state: GameState, f: Fighter, forDay?: Day, ignoreFightId?: Id): Availability {
  let earliest = Math.max(state.today + B.fights.minNoticeWeeks * 7 + 2, restUntil(f))
  if (f.injury) earliest = Math.max(earliest, f.injury.returnDay + 14)
  if (f.status === 'retired') return { ok: false, reason: 'Retired', earliestDay: earliest }
  if (f.activeFightId && f.activeFightId !== ignoreFightId) return { ok: false, reason: 'Already booked for a fight', earliestDay: earliest }
  if (f.injury && (forDay === undefined || forDay < f.injury.returnDay + 14)) {
    return { ok: false, reason: `Injured (${f.injury.kind}) — back in ${Math.max(1, weeksBetween(state.today, f.injury.returnDay))} weeks`, earliestDay: earliest }
  }
  if (f.suspendedUntil !== null && (forDay === undefined || forDay < f.suspendedUntil)) {
    return { ok: false, reason: `Medically suspended for ${Math.max(1, weeksBetween(state.today, f.suspendedUntil))} more weeks`, earliestDay: earliest }
  }
  if (f.lastFightDay !== null && forDay !== undefined && forDay < restUntil(f)) {
    return { ok: false, reason: 'Needs more rest after the last fight', earliestDay: earliest }
  }
  const c = f.contractId ? state.contracts[f.contractId] : null
  if (c && forDay !== undefined && c.endDay <= forDay) return { ok: false, reason: 'Contract ends before that date', earliestDay: earliest }
  if (c && c.endDay <= earliest) return { ok: false, reason: 'Contract expires too soon to book a fight', earliestDay: earliest }
  return { ok: true, reason: null, earliestDay: earliest }
}

export const lockKey = (a: Id, b: Id) => (a < b ? `${a}|${b}` : `${b}|${a}`)

export interface MatchCheck { ok: boolean; reason: string | null; catchweight: boolean }

/** Is this a legal, bookable match? (Hard rules only — the player decides whether it is *wise*.) */
export function validateMatch(state: GameState, aId: Id, bId: Id, ignoreFightId?: Id): MatchCheck {
  const a = state.fighters[aId], b = state.fighters[bId]
  if (!a || !b) return { ok: false, reason: 'Unknown fighter', catchweight: false }
  if (aId === bId) return { ok: false, reason: 'A fighter cannot fight themselves', catchweight: false }
  const w = weightCompatible(a.weightClass, b.weightClass)
  if (w === 'no') return { ok: false, reason: 'Too far apart in weight', catchweight: false }
  const locked = state.fightLocks[lockKey(aId, bId)]
  if (locked !== undefined && locked > state.today) return { ok: false, reason: `Talks collapsed — they will not talk for ${weeksBetween(state.today, locked)} weeks`, catchweight: false }
  for (const f of [a, b]) {
    const av = fightAvailability(state, f, undefined, ignoreFightId)
    if (!av.ok) return { ok: false, reason: `${fighterName(f)}: ${av.reason}`, catchweight: false }
  }
  return { ok: true, reason: null, catchweight: w === 'catchweight' }
}

// ------------------------------------------------------------------ Creation

export function defaultPrep(): FightPrep {
  return { intensity: 'normal', plan: 'balanced', campWeeks: 0, weightIssue: false, nagging: false }
}

function snapshotSide(f: Fighter, promotionId: Id | null): FightSide {
  return {
    fighterId: f.id, promotionId, prep: defaultPrep(),
    preRecord: `${f.record.wins}-${f.record.losses}-${f.record.draws}`, preRep: Math.round(f.reputation), prePop: Math.round(f.popularity),
  }
}

function promoOf(state: GameState, f: Fighter): Id | null {
  return f.contractId ? state.contracts[f.contractId]?.promotionId ?? null : null
}

/** Terms for the home fighter come from their own contract (minimum purse and win bonus). */
function ownTerms(state: GameState, f: Fighter): { purse: number; winBonus: number } {
  const c = f.contractId ? state.contracts[f.contractId] : null
  return { purse: c?.basePurse ?? 0, winBonus: c?.winBonus ?? 0 }
}

export function createFight(state: GameState, aId: Id, bId: Id, organiserId: Id, kind: 'player' | 'ai', offer?: Partial<FightTerms>): Fight {
  const a = state.fighters[aId], b = state.fighters[bId]
  const ta = ownTerms(state, a)
  const rounds = roundsFor(a.reputation, b.reputation, totalFights(a), totalFights(b))
  const fight: Fight = {
    id: stateIds(state).next('ft'), day: 0, status: 'negotiating', kind, organiserId,
    sideA: snapshotSide(a, promoOf(state, a)), sideB: snapshotSide(b, promoOf(state, b)),
    weightClass: sizeEdge(a.weightClass, b.weightClass) >= 0 ? a.weightClass : b.weightClass,
    scheduledRounds: rounds,
    terms: { purseA: ta.purse, winBonusA: ta.winBonus, purseB: 0, winBonusB: 0, rematch: false, venuePref: 'neutral', fights: 1, ...offer },
    venueId: null, city: '', country: '', createdDay: state.today, paid: false,
  }
  state.fights[fight.id] = fight
  a.activeFightId = fight.id
  return fight
}

// ------------------------------------------------------------------ Venue

const COUNTRY_FOR_NATION: Record<string, string> = { ENG: 'ENG', SCO: 'ENG', WAL: 'WAL', IRL: 'ENG', USA: 'USA', MEX: 'USA', PUR: 'USA', CUB: 'USA', DOM: 'USA' }

function venueCountryFor(nat: string): string {
  return COUNTRY_FOR_NATION[nat] ?? (regionOf(nat) === 'AMERICAS' ? 'USA' : 'ENG')
}

export function chooseVenue(state: GameState, fight: Fight): void {
  const a = state.fighters[fight.sideA.fighterId], b = state.fighters[fight.sideB.fighterId]
  const org = state.promotions[fight.organiserId]
  const pref = fight.terms.venuePref
  const country = pref === 'A' ? venueCountryFor(a.nationality) : pref === 'B' ? venueCountryFor(b.nationality) : venueCountryFor(org?.homeCountry ?? a.nationality)
  const rep = Math.max(a.reputation, b.reputation)
  const want = rep < 20 ? 1 : rep < 35 ? 2 : rep < 50 ? 3 : rep < 70 ? 4 : 5
  const venues = Object.values(state.venues).filter((v) => !v.legacy)
  const inCountry = venues.filter((v) => v.country === country)
  const pool = inCountry.length ? inCountry : venues
  pool.sort((x, y) => Math.abs(x.prestige - want) - Math.abs(y.prestige - want) || x.capacity - y.capacity)
  const v = pool[0] ?? VENUE_SEEDS[0]
  fight.venueId = 'id' in v ? (v as { id: string }).id : null
  fight.city = v.city
  fight.country = v.country
}

function homeSide(state: GameState, fight: Fight): 0 | 1 | null {
  const a = state.fighters[fight.sideA.fighterId], b = state.fighters[fight.sideB.fighterId]
  const ha = a.nationality === fight.country
  const hb = b.nationality === fight.country
  return ha && !hb ? 0 : hb && !ha ? 1 : null
}

// ----------------------------------------------------------------- Scheduling

export interface DateOption { day: Day; weeksAway: number }

/** Saturdays on which both fighters could fight. */
export function scheduleOptions(state: GameState, fightId: Id): DateOption[] {
  const fight = state.fights[fightId]
  if (!fight) return []
  const a = state.fighters[fight.sideA.fighterId], b = state.fighters[fight.sideB.fighterId]
  const out: DateOption[] = []
  for (let w = B.fights.minNoticeWeeks; w <= B.fights.maxAheadWeeks; w++) {
    const day = state.today + w * 7 + SAT
    if (fightAvailability(state, a, day, fightId).ok && fightAvailability(state, b, day, fightId).ok) out.push({ day, weeksAway: w })
  }
  return out
}

export interface OpResult { ok: boolean; error?: string; state: GameState }

export function scheduleFight(input: GameState, fightId: Id, day: Day): OpResult {
  const f0 = input.fights[fightId]
  if (!f0 || f0.status !== 'agreed') return { ok: false, error: 'This fight is not ready to be scheduled.', state: input }
  if (!scheduleOptions(input, fightId).some((o) => o.day === day)) return { ok: false, error: 'That date does not work for both fighters.', state: input }
  const state = structuredClone(input)
  const fight = state.fights[fightId]
  fight.day = day
  chooseVenue(state, fight)
  transition(fight, 'scheduled')
  for (const side of [fight.sideA, fight.sideB]) { state.fighters[side.fighterId].activeFightId = fight.id }
  const nA = fighterName(state.fighters[fight.sideA.fighterId]), nB = fighterName(state.fighters[fight.sideB.fighterId])
  postMessage(state, {
    from: 'Matchmaking', category: 'fighter', priority: 'normal', subject: `Fight scheduled: ${nA} vs ${nB}`,
    body: `${nA} vs ${nB} is set for ${weightClassLabel(fight.weightClass)} over ${fight.scheduledRounds} rounds in ${fight.city}. Camp opens ${B.fights.campWeeks} weeks out.`,
    link: { kind: 'fight', id: fight.id },
  })
  return { ok: true, state }
}

export function setPrep(input: GameState, fightId: Id, side: 0 | 1, patch: Partial<Pick<FightPrep, 'intensity' | 'plan'>>): OpResult {
  const fight = input.fights[fightId]
  if (!fight || !['scheduled', 'training'].includes(fight.status)) return { ok: false, error: 'Preparation can only be changed before fight night.', state: input }
  const promoId = (side === 0 ? fight.sideA : fight.sideB).promotionId
  if (promoId !== input.playerPromotionId) return { ok: false, error: 'You can only prepare your own fighters.', state: input }
  const state = structuredClone(input)
  Object.assign((side === 0 ? state.fights[fightId].sideA : state.fights[fightId].sideB).prep, patch)
  return { ok: true, state }
}

// -------------------------------------------------------------- Cancellation

export function clearBookings(state: GameState, fight: Fight): void {
  for (const side of [fight.sideA, fight.sideB]) {
    const f = state.fighters[side.fighterId]
    if (f && f.activeFightId === fight.id) f.activeFightId = null
  }
}

export function cancelFight(state: GameState, fight: Fight, reason: string, lockWeeks = 0): void {
  if (!isOpen(fight)) return
  transition(fight, 'cancelled')
  fight.cancelReason = reason
  fight.negotiation = undefined
  clearBookings(state, fight)
  if (lockWeeks > 0) state.fightLocks[lockKey(fight.sideA.fighterId, fight.sideB.fighterId)] = state.today + lockWeeks * 7
  const involvesPlayer = fightInvolvesPlayer(state, fight)
  if (involvesPlayer) {
    const nA = fighterName(state.fighters[fight.sideA.fighterId]), nB = fighterName(state.fighters[fight.sideB.fighterId])
    postMessage(state, {
      from: 'Matchmaking', category: 'fighter', priority: 'important', subject: `Fight off: ${nA} vs ${nB}`,
      body: `The fight has been cancelled: ${reason}.`, link: { kind: 'fight', id: fight.id },
    })
  }
  // A two-fight deal collapses with its first fight.
  for (const other of Object.values(state.fights)) if (other.seriesOf === fight.id && isOpen(other)) cancelFight(state, other, 'the first fight of the deal was cancelled')
}

export function fightInvolvesPlayer(state: GameState, fight: Fight): boolean {
  return fight.organiserId === state.playerPromotionId || fight.sideA.promotionId === state.playerPromotionId || fight.sideB.promotionId === state.playerPromotionId
}

// --------------------------------------------------------------- Weekly tick

/** Advance open fights: camp, camp injuries, cancellations, fight night. AI fights resolve immediately. */
export function processFights(state: GameState, rng: Rng): void {
  for (const fight of Object.values(state.fights)) {
    if (!isOpen(fight) || fight.status === 'negotiating' || fight.status === 'agreed') {
      if (fight.status === 'negotiating' || fight.status === 'agreed') staleCheck(state, fight)
      continue
    }
    const a = state.fighters[fight.sideA.fighterId], b = state.fighters[fight.sideB.fighterId]
    // Hard stops: retirement, release, expired contract, serious new injury.
    const bad = [a, b].find((f) => f.status === 'retired')
    if (bad) { cancelFight(state, fight, `${fighterName(bad)} has retired`); continue }
    for (const [side, f] of [[fight.sideA, a], [fight.sideB, b]] as [FightSide, Fighter][]) {
      const nowPromo = promoOf(state, f)
      if (side.promotionId !== null && nowPromo !== side.promotionId) side.promotionId = nowPromo
    }
    if (fight.status === 'scheduled' && fight.day - state.today <= B.fights.campWeeks * 7) transition(fight, 'training')
    if (fight.status === 'training' && fight.day - state.today >= 7) {
      for (const [side, f] of [[fight.sideA, a], [fight.sideB, b]] as [FightSide, Fighter][]) {
        side.prep.campWeeks++
        if (!f.injury) {
          const inj = rollCampInjury(state, f, side.prep.intensity, rng)
          if (inj) {
            f.injury = inj
            f.fitness = Math.max(35, f.fitness - 5)
            if (inj.returnDay + 7 > fight.day) { cancelFight(state, fight, `${fighterName(f)} was injured in camp (${inj.kind})`); break }
            side.prep.nagging = true
          }
        }
      }
      if ((fight.status as string) === 'cancelled') continue
    }
    if (fight.status === 'training' && fight.day - state.today < 7) {
      // Fight week. Weight is settled on the scales.
      for (const [side, f] of [[fight.sideA, a], [fight.sideB, b]] as [FightSide, Fighter][]) {
        const risk = 0.02 + 0.1 * (1 - f.discipline / 100) + (fighterAge(f, state.today) > 33 ? 0.03 : 0) + (side.prep.intensity === 'light' ? 0.015 : 0)
        side.prep.weightIssue = keyedRng(state.seed, 'weight', fight.id, side.fighterId).next() < risk
        side.prep.campWeeks = Math.max(side.prep.campWeeks, B.fights.campWeeks)
      }
      transition(fight, 'fightNight')
      if (fight.eventId) { /* the event runs the night */ }
      else if (!fightInvolvesPlayer(state, fight)) resolveFight(state, fight)
      else {
        postMessage(state, {
          from: 'Matchmaking', category: 'fighter', priority: 'urgent', key: `night-${fight.id}`, cooldownWeeks: 20,
          subject: `Fight night: ${fighterName(a)} vs ${fighterName(b)}`,
          body: `It is fight week. Head to the venue and ring the bell.`, link: { kind: 'fight', id: fight.id },
        })
      }
    }
  }
}

/** Negotiations/agreed fights that go nowhere are dropped; fighters that become unavailable end them. */
function staleCheck(state: GameState, fight: Fight): void {
  const a = state.fighters[fight.sideA.fighterId], b = state.fighters[fight.sideB.fighterId]
  const stale = state.today - fight.createdDay > (fight.status === 'negotiating' ? 56 : fight.seriesOf ? 420 : 120)
  if (!a || !b || a.status === 'retired' || b.status === 'retired') cancelFight(state, fight, 'a fighter has retired')
  else if (fight.status === 'agreed' && fight.day === 0 && stale && fight.kind === 'player') cancelFight(state, fight, 'the date was never set')
  else if (fight.status === 'negotiating' && stale) cancelFight(state, fight, 'talks went quiet')
  else if (b.activeFightId && b.activeFightId !== fight.id && fight.status === 'negotiating') cancelFight(state, fight, `${fighterName(b)} agreed to another fight`)
}

// ----------------------------------------------------------------- Fight night

export interface Profiles { a: SimFighter; b: SimFighter }

export function profilesFor(state: GameState, fight: Fight): Profiles {
  const a = state.fighters[fight.sideA.fighterId], b = state.fighters[fight.sideB.fighterId]
  const hs = homeSide(state, fight)
  const d = sizeEdge(a.weightClass, b.weightClass)
  return {
    a: buildSimFighter(state, a, fight.sideA, { home: hs === 0, sizeSteps: d }),
    b: buildSimFighter(state, b, fight.sideB, { home: hs === 1, sizeSteps: -d }),
  }
}

/** Run the fight and process everything that follows, exactly once. */
export function resolveFight(state: GameState, fight: Fight): void {
  if (fight.status !== 'fightNight') throw new Error(`Cannot resolve fight in status ${fight.status}`)
  const rng = keyedRng(state.seed, 'fight', fight.id)
  const { a, b } = profilesFor(state, fight)
  const keep = fightInvolvesPlayer(state, fight) || B.fights.keepRoundsForAi
  const out = simulateFight(a, b, fight.scheduledRounds, rng, { homeSide: homeSide(state, fight), keepRounds: keep })
  const A = state.fighters[fight.sideA.fighterId], Bf = state.fighters[fight.sideB.fighterId]
  const pExpA = publicExpectation(state, A, Bf)
  fight.result = {
    winner: out.winner, method: out.method, round: out.round, second: out.second, cards: out.cards, kd: out.kd, tot: out.tot,
    deductions: out.deductions, rounds: keep ? out.rounds : undefined, pExpA,
    dRep: [0, 0], dPop: [0, 0], perf: out.perf, injuries: [null, null], importance: 0, upset: 0,
  }
  transition(fight, 'completed')
  processResult(state, fight, out.endDamage, out.kdRounds.length, rng)
  transition(fight, 'processed')
  postFight(state, fight)
  transition(fight, 'postFight')
}

const KO_METHODS: FightMethod[] = ['KO', 'TKO', 'RTD', 'INJ']

function processResult(state: GameState, fight: Fight, endDamage: [number, number], _kdRoundCount: number, rng: Rng): void {
  const r = fight.result!
  const sides = [fight.sideA, fight.sideB]
  const fs = [state.fighters[fight.sideA.fighterId], state.fighters[fight.sideB.fighterId]]
  const stoppage = KO_METHODS.includes(r.method)
  const roundsFought = r.round
  fight.processedDay = state.today

  const pExp = [r.pExpA, 1 - r.pExpA]
  const w = r.winner
  r.upset = w === null ? 0 : 1 - pExp[w]
  const excitement = clamp(0.25 * (r.kd[0] + r.kd[1]) + (stoppage ? 0.25 : 0) + (Math.abs(r.pExpA - 0.5) < 0.2 ? 0.15 : 0) + 0.2 * Math.min(1, (r.tot[1] + r.tot[5]) / (fight.scheduledRounds * 28)), 0, 1)

  for (let i = 0; i < 2; i++) {
    const f = fs[i]
    const won = w === i, lost = w === 1 - i
    const pWin = pExp[i]
    // Record
    if (won) { f.record.wins++; if (stoppage) f.record.koWins++ }
    else if (lost) { f.record.losses++; if (stoppage) f.record.koLosses++ }
    else f.record.draws++
    f.lastFightDay = fight.day
    f.roundsFought += roundsFought
    f.recentFights.push(fight.id)
    if (f.recentFights.length > B.fights.recentListSize) f.recentFights.shift()
    f.activeFightId = null
    // Reputation & popularity: a big upset moves the needle far more than an expected win.
    let dRep = 0, dPop = 0
    if (won) {
      dRep = (0.9 + 5.2 * (1 - pWin)) * (1 - f.reputation / 140) + (stoppage ? 0.6 : 0)
      dPop = (0.8 + 3.5 * (1 - pWin) + (r.method === 'KO' ? 2 : stoppage ? 1.2 : 0) + excitement * 1.5) * (1 - f.popularity / 150)
    } else if (lost) {
      dRep = -(0.5 + 5.0 * pWin) * (0.55 + f.reputation / 150)
      dPop = -(0.4 + 1.8 * pWin) + excitement * 1.0
    } else {
      dRep = (0.5 - pWin) * 1.4
      dPop = excitement * 0.8 - 0.2
    }
    dRep *= B.fights.reputationK
    if (dPop > 0) dPop *= B.fights.popularityGainK
    dPop *= exposureFor(state, fight, dPop)
    const pk = planFightFactors(state, f.id)
    if (dPop > 0) dPop *= pk.fame
    r.dRep[i] = Math.round(dRep * 10) / 10
    r.dPop[i] = Math.round(dPop * 10) / 10
    f.reputation = clamp(f.reputation + dRep, 1, 100)
    f.popularity = clamp(f.popularity + dPop, 1, 100)
    // Morale, confidence, career momentum
    const ko = lost && (r.method === 'KO' || r.method === 'TKO')
    f.morale = clamp(f.morale + (won ? 6 + 5 * r.upset : lost ? -(7 + 6 * pWin + (ko ? 6 : 0)) * pk.lossMorale : 0), 1, 100)
    f.confidence = clamp(f.confidence + (won ? 5 + 8 * r.upset + 6 * (r.perf[i] - 0.5) : lost ? -(6 + 8 * pWin + (ko ? 8 : 0)) : 0), 1, 100)
    f.momentum = clamp(0.65 * f.momentum + (won ? 30 + 25 * r.upset : lost ? -(25 + 25 * pWin) : 0), -100, 100)
    f.fitness = clamp(f.fitness - 5 - 6 * Math.min(1, endDamage[i]), 20, 100)
    // Rest and medical suspension
    if (stoppage && lost) f.suspendedUntil = fight.day + (B.fights.suspension[r.method] ?? 4) * 7
    else if (endDamage[i] > 0.7) f.suspendedUntil = fight.day + 21
    // Development from experience; ring wear after hard losses
    applyFightDevelopment(state, f, fs[1 - i], won, lost, ko, endDamage[i], r.kd[1 - i] > 0)
    // Injuries
    const forced = r.method === 'INJ' && w === 1 - i
    const inj = rollFightInjury(state, f, endDamage[i], r.kd[1 - i], forced, rng)
    if (inj) { f.injury = { ...inj, startDay: fight.day, returnDay: fight.day + (inj.returnDay - inj.startDay) }; r.injuries[i] = f.injury }
    // Contract bookkeeping
    const c = f.contractId ? state.contracts[f.contractId] : null
    if (c && c.fightsRemaining > 0) c.fightsRemaining--
    void sides
  }
  r.importance = newsImportance(fight, fs)
  const r2 = (x: number) => Math.round(x * 100) / 100
  r.pExpA = Math.round(r.pExpA * 1000) / 1000
  r.upset = r2(r.upset)
  r.perf = [r2(r.perf[0]), r2(r.perf[1])]
  payPurses(state, fight, fs)
}

/** Billing and broadcast decide how many people see a fight: headliners on big platforms gain (and lose) more. */
function exposureFor(state: GameState, fight: Fight, dPop: number): number {
  const ev = fight.eventId ? state.events[fight.eventId] : null
  if (!ev) return 1
  const X = B.events
  const idx = ev.card.indexOf(fight.id), n = ev.card.length
  const slot = idx === n - 1 ? X.slotExposure.main : idx === n - 2 && n >= 3 ? X.slotExposure.coMain : idx === 0 && n >= 4 ? X.slotExposure.opener : X.slotExposure.mid
  const m = slot * X.broadcastExposure[ev.broadcast.kind]
  return dPop >= 0 ? m : 1 + (m - 1) * 0.4
}

function applyFightDevelopment(state: GameState, f: Fighter, opp: Fighter, won: boolean, lost: boolean, ko: boolean, endDamage: number, hadKd: boolean): void {
  const age = fighterAge(f, state.today)
  const room = Math.max(0, f.potential - (f.attributes.ringIQ + f.attributes.defence + f.attributes.power + f.attributes.speed) / 4)
  const quality = clamp(opp.reputation / 100, 0.1, 1)
  const ageMult = age <= 24 ? 1 : age <= 28 ? 0.6 : age <= 31 ? 0.3 : 0.08
  const learn = (0.25 + 0.55 * quality) * ageMult * (room > 2 ? 1 : 0.3) * (won ? 1 : lost ? 1.15 : 1)
  for (const k of ['ringIQ', 'adaptability', 'defence', 'heart'] as const) f.attributes[k] = Math.min(Math.max(f.attributes[k], f.potential + 4), f.attributes[k] + learn * (k === 'heart' ? 0.5 : 1))
  // Ring wear: brutal losses leave a mark on veterans — small, and never from ordinary exchanges.
  if (age >= 27 && (ko || endDamage > 0.85 || hadKd)) {
    const wear = (ko ? 0.9 : 0) + (endDamage > 0.85 ? 0.5 : 0) + (hadKd ? 0.25 : 0)
    f.attributes.chin = Math.max(1, f.attributes.chin - wear * (0.5 + (age - 26) * 0.04))
  }
}

function newsImportance(fight: Fight, fs: Fighter[]): number {
  const r = fight.result!
  const stand = Math.max(fs[0].reputation, fs[1].reputation)
  const pop = Math.max(fs[0].popularity, fs[1].popularity)
  const loser = r.winner === null ? null : fs[1 - r.winner]
  const unbeatenFell = loser && loser.record.losses === 1 && loser.record.wins >= 5 && loser.record.draws === 0 && loser.record.losses === 1
  return Math.round(clamp(8 + 0.4 * stand + 0.25 * pop + 50 * r.upset + (unbeatenFell ? 15 : 0) + (r.method === 'KO' ? 8 : 0) + 4 * (r.kd[0] + r.kd[1]), 0, 100))
}

function payPurses(state: GameState, fight: Fight, fs: Fighter[]): void {
  if (fight.paid) return
  fight.paid = true // set first: the single guard against double payment
  const r = fight.result!
  const t = fight.terms
  const lines: [string, number][] = [
    [`Purse — ${fighterName(fs[0])}`, t.purseA], [`Purse — ${fighterName(fs[1])}`, t.purseB],
  ]
  if (r.winner === 0 && t.winBonusA) lines.push([`Win bonus — ${fighterName(fs[0])}`, t.winBonusA])
  if (r.winner === 1 && t.winBonusB) lines.push([`Win bonus — ${fighterName(fs[1])}`, t.winBonusB])
  const total = lines.reduce((n, l) => n + l[1], 0)
  const ev = fight.eventId ? state.events[fight.eventId] : null
  if (ev) {
    lines.forEach(([d, amt], i) => { if (amt > 0) spend(state, ev, i < 2 ? 'purses' : 'bonuses', amt, d) })
    return
  }
  if (fight.organiserId === state.playerPromotionId) {
    for (const [d, amt] of lines) if (amt > 0) post(state, 'purses', -amt, d)
  } else {
    const org = state.promotions[fight.organiserId]
    if (org) { org.cash -= total; if (org.accounting) org.accounting.costs += total }
  }
}

function postFight(state: GameState, fight: Fight): void {
  const r = fight.result!
  const fs = [state.fighters[fight.sideA.fighterId], state.fighters[fight.sideB.fighterId]]
  const names = fs.map((f) => fighterName(f))
  const headline = resultHeadline(fight, names[0], names[1])
  const mine = fightInvolvesPlayer(state, fight)

  // Knowledge: the player learns by watching.
  const rounds = r.round
  for (let i = 0; i < 2; i++) {
    const f = fs[i]
    const own = promoOf(state, f) === state.playerPromotionId
    const tracked = !!state.knowledge[f.id] && (state.knowledge[f.id].reports.length > 0 || state.shortlist.includes(f.id) || !!state.negotiations[f.id])
    if (mine) observeFightPerformance(state, f, rounds, own ? 1 : 0.9, fight.id)
    else if (tracked) observeFightPerformance(state, f, rounds, 0.45, fight.id)
  }

  // News
  const imp = r.importance
  const upsetWord = r.upset > 0.62 && r.winner !== null
  if (imp >= 40 || mine) {
    const w = r.winner === null ? null : fs[r.winner]
    const l = r.winner === null ? null : fs[1 - r.winner]
    let text = headline
    if (upsetWord) text = `UPSET IN ${fight.city.toUpperCase()}: ${headline}`
    else if (l && l.record.losses === 1 && l.record.wins >= 8 && l.record.draws === 0) text = `Unbeaten ${fighterName(l)} suffers first defeat — ${headline.toLowerCase()}`
    else if (w && w.record.wins >= 5 && r.method === 'KO' && r.importance > 55) text = `${headline} — a huge knockout`
    postNews(state, { headline: text, category: 'result', fighterId: w?.id ?? fs[0].id, fightId: fight.id, importance: imp })
  }
  if (mine) {
    postMessage(state, {
      from: 'Matchmaking', category: 'fighter', priority: r.winner === null ? 'normal' : 'important',
      subject: `Result: ${headline}`, body: `${resultSummary(fight, names[0], names[1])} ${r.injuries.some(Boolean) ? 'There were injuries — check the report.' : ''}`.trim(),
      link: { kind: 'fight', id: fight.id },
    })
  }
  void METHOD_LABEL; void isStoppage; void FEATURES; void visibility
}

/**
 * RETENTION POLICY. A fighter's profile shows their last dozen bouts, but only fighters the player has any relationship with
 * (roster, shortlist, scouted, in talks, or faced by the player) ever get opened in detail. Everyone else keeps their last few
 * bouts; their record, rating and public standing live on the fighter itself. This keeps the fight table bounded without
 * touching anything the player can see.
 */
function trimUntrackedHistory(state: GameState): void {
  const keep = B.fights.untrackedRecent
  for (const f of Object.values(state.fighters)) {
    // Retired and nobody's concern: their record stays on the fighter; the bout-by-bout detail fades (3 bouts after a year, none after three).
    if (f.status === 'retired' && f.retiredDay !== null && f.recentFights.length > 0) {
      const years = (state.today - f.retiredDay) / 365
      const keepRetired = years >= B.fights.retiredFadeYears[1] ? 0 : years >= B.fights.retiredFadeYears[0] ? 3 : keep
      const trackedR = state.shortlist.includes(f.id) || !!state.negotiations[f.id] || (state.knowledge[f.id]?.reports.length ?? 0) > 0 || f.recentFights.some((id) => state.fights[id] && fightInvolvesPlayer(state, state.fights[id]))
      if (!trackedR && f.recentFights.length > keepRetired) f.recentFights = keepRetired ? f.recentFights.slice(-keepRetired) : []
      continue
    }
    if (f.recentFights.length <= keep) continue
    const own = f.contractId !== null && state.contracts[f.contractId]?.promotionId === state.playerPromotionId
    const tracked = own || state.shortlist.includes(f.id) || !!state.negotiations[f.id] || (state.knowledge[f.id]?.reports.length ?? 0) > 0
    if (tracked || f.recentFights.some((id) => state.fights[id] && fightInvolvesPlayer(state, state.fights[id]))) continue
    f.recentFights = f.recentFights.slice(-keep)
  }
}

export function pruneFights(state: GameState): void {
  trimUntrackedHistory(state)
  const cutoff = state.today - B.fights.pruneYears * 365
  const recent = new Set<Id>()
  for (const f of Object.values(state.fighters)) for (const id of f.recentFights) recent.add(id)
  for (const [id, fight] of Object.entries(state.fights)) {
    if (fight.status === 'cancelled' && state.today - fight.createdDay > 120) delete state.fights[id]
    else if (!isOpen(fight) && fight.day > 0 && fight.day < cutoff && !recent.has(id) && !fightInvolvesPlayer(state, fight)) delete state.fights[id]
    else if (fight.day > 0 && fight.day < state.today - 365 && !fightInvolvesPlayer(state, fight) && fight.result?.rounds) fight.result.rounds = undefined
  }
}

/** Long-retired fighters nobody refers to any more are dropped so the world stays lean after decades. */
export function pruneRetired(state: GameState): void {
  const cutoff = state.today - B.fights.retiredPruneYears * 365
  const referenced = new Set<Id>(state.shortlist)
  for (const ft of Object.values(state.fights)) { referenced.add(ft.sideA.fighterId); referenced.add(ft.sideB.fighterId) }
  for (const n of state.news.slice(0, 40)) if (n.fighterId) referenced.add(n.fighterId)
  for (const [id, f] of Object.entries(state.fighters)) {
    if (f.status !== 'retired' || f.retiredDay === null || f.retiredDay > cutoff || referenced.has(id)) continue
    if (state.knowledge[id]?.reports.length) continue
    delete state.fighters[id]
    delete state.knowledge[id]
    delete state.negotiations[id]
  }
}

export function statusLabel(f: Fight): string { return STATUS_LABEL[f.status] }
export type { Contract, Offer }
