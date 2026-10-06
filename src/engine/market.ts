/**
 * THE FIGHTER MARKET
 * Market value is built from PUBLIC standing (reputation, popularity, record) plus industry "buzz"
 * for young prospects. Asking terms add the fighter's personality and relationship with the
 * promotion — which is exactly what the player has to discover through negotiation.
 */
import { BALANCE as B } from './balance'
import { ageOn, weeksBetween } from './calendar'
import { clamp, fighterAge, publicFacts, visibility, type PublicFacts } from './fighters'
import { keyedFloat, keyedNormal } from './rng'
import { player } from './selectors'
import type { Fighter, GameState, Offer, Promotion } from './types'

const round = (n: number, step: number) => Math.round(n / step) * step

// ---------------------------------------------------------------- Value

/** Industry buzz: how hyped a young fighter is. Loosely tracks true potential, plus noise. */
export function buzz(state: GameState, f: Fighter): number {
  return clamp(30 + (f.potential - 55) * 0.5 + keyedNormal(state.seed, 'buzz', f.id) * 8, 0, 100)
}

export function marketValue(p: PublicFacts, buzzValue: number): number {
  const fights = p.record.wins + p.record.losses + p.record.draws
  const winsTerm = Math.min(100, p.record.wins * 3.5)
  const hype = p.age <= 25 && fights < 15 ? buzzValue : p.reputation
  let mv = 0.42 * p.reputation + 0.3 * p.popularity + 0.1 * winsTerm + 0.18 * hype
  mv *= ageValueMult(p.age)
  return clamp(mv, 3, 99)
}

/** Value of a fighter on the open market (0–100). */
export function valueOf(state: GameState, f: Fighter): number {
  const p = publicFacts(f, state.today)
  return marketValue(p, p.age <= 25 ? buzz(state, f) : p.reputation)
}

export function ageValueMult(age: number): number {
  let m = 1
  for (const d of B.market.ageDiscount) if (age >= d.age) m = d.mult
  return m
}

interface BaseMoney { retainer: number; purse: number }

export function baseMoney(mv: number): BaseMoney {
  const m = B.market
  const x = mv / 100
  return {
    retainer: round(m.retainer.min + Math.pow(x, m.retainer.exp) * m.retainer.span, 10),
    purse: round(m.purse.min + Math.pow(x, m.purse.exp) * m.purse.span, 100),
  }
}

// ------------------------------------------------------------ Asking terms

export function preferredYears(f: Fighter, age: number): number {
  if (f.personality === 'Fragile' || f.personality === 'Loyal') return age >= 33 ? 2 : 3
  if (age <= 23) return 3
  if (age >= 33) return 1
  return 2
}

export function preferredFightsPerYear(f: Fighter): number {
  if (f.personality === 'Ambitious' || f.personality === 'Showman' || f.personality === 'Arrogant') return 3
  return 2
}

/** Offer value in £-equivalents, used on both sides of a negotiation. */
export function offerValue(o: Offer, popularity: number): number {
  const ppv = o.ppvShare * o.fights * 300_000 * Math.pow(popularity / 100, 2)
  return o.signingBonus + o.weeklyRetainer * 52 * o.years + o.basePurse * o.fights + o.winBonus * o.fights * 0.55 + o.titleBonus * o.fights * 0.1 + ppv
}

export function normaliseOffer(o: Offer): Offer {
  const years = Math.round(clamp(o.years, 1, B.negotiation.maxYears, ))
  const minFpy = Math.round(clamp(o.minFightsPerYear, 1, 5))
  const fights = Math.round(clamp(Math.max(o.fights, minFpy * years), 1, B.negotiation.maxFights))
  return {
    ...o, years, fights, minFightsPerYear: Math.min(minFpy, Math.max(1, Math.floor(fights / years))),
    signingBonus: Math.max(0, round(o.signingBonus, 100)), weeklyRetainer: Math.max(0, round(o.weeklyRetainer, 10)),
    basePurse: Math.max(0, round(o.basePurse, 100)), winBonus: Math.max(0, round(o.winBonus, 100)),
    titleBonus: Math.max(0, round(o.titleBonus, 100)), ppvShare: clamp(Math.round(o.ppvShare * 200) / 200, 0, 0.2, ),
  }
}

/**
 * The fighter camp's true asking terms for a promotion. Personality, prestige gap and relationship
 * shape it. NOT shown to the player directly — they find it by negotiating.
 */
export function askTerms(state: GameState, f: Fighter, promo: Promotion, kind: 'signing' | 'renewal'): Offer {
  const age = fighterAge(f, state.today)
  const mv = valueOf(state, f)
  const base = baseMoney(mv)
  let mult = B.negotiation.askMult[f.personality] ?? 1

  const gap = f.reputation - promo.reputation
  if (gap > 10) mult *= 1 + (gap - 10) * B.negotiation.prestigePremiumPerPoint
  else if (gap < -10) mult *= 1 - Math.min(0.1, (-gap - 10) * B.negotiation.prestigeDiscountPerPoint)

  const rel = f.promoRelations[promo.id] ?? 0
  mult *= 1 - clamp(rel, -100, 100) * 0.001
  if (kind === 'renewal' && f.personality === 'Loyal') mult *= 0.96
  if (f.personality === 'Volatile') mult *= 1 + keyedNormal(state.seed, 'mood', f.id, Math.floor(state.today / 28)) * 0.05
  mult *= 1 + keyedNormal(state.seed, 'agent', f.id) * 0.04 // every agent is a bit different

  const years = preferredYears(f, age)
  const fpy = preferredFightsPerYear(f)
  const purse = round(base.purse * mult, 100)
  return normaliseOffer({
    years, fights: years * fpy, minFightsPerYear: fpy,
    weeklyRetainer: round(base.retainer * mult, 10),
    basePurse: purse,
    signingBonus: round(purse * B.market.signingBonusOfPurse, 100),
    winBonus: round(purse * B.market.winBonusOfPurse, 100),
    titleBonus: f.reputation >= 45 ? round(purse * 0.15, 100) : 0,
    ppvShare: f.popularity >= 55 ? clamp((f.popularity - 50) / 500, 0, 0.1) : 0,
    titlePromise: false,
  })
}

/** Public "what do fighters like this usually want" band — personality-free. */
export interface AskBand { retainerLo: number; retainerHi: number; purseLo: number; purseHi: number; signingLo: number; signingHi: number }

export function publicAskBand(state: GameState, f: Fighter): AskBand {
  const base = baseMoney(valueOf(state, f))
  const lo = B.market.askBandLow
  const hi = B.market.askBandHigh
  return {
    retainerLo: round(base.retainer * lo, 10), retainerHi: round(base.retainer * hi, 10),
    purseLo: round(base.purse * lo, 100), purseHi: round(base.purse * hi, 100),
    signingLo: round(base.purse * lo * B.market.signingBonusOfPurse, 100), signingHi: round(base.purse * hi * B.market.signingBonusOfPurse, 100),
  }
}

// ------------------------------------------------------------ Availability

export interface Availability {
  signable: boolean
  reason?: string
}

export function availabilityFor(state: GameState, f: Fighter): Availability {
  if (f.status === 'retired') return { signable: false, reason: 'Retired' }
  if (f.contractId) {
    const c = state.contracts[f.contractId]
    if (c?.promotionId === state.playerPromotionId) return { signable: false, reason: 'Already on your roster' }
    return { signable: false, reason: 'Under contract elsewhere' }
  }
  const neg = state.negotiations[f.id]
  if (neg?.status === 'broken' && neg.lockedUntil !== null && neg.lockedUntil > state.today) {
    return { signable: false, reason: `Talks collapsed — will not negotiate for ${Math.max(1, weeksBetween(state.today, neg.lockedUntil))} weeks` }
  }
  const p = player(state)
  const roster = Object.values(state.contracts).filter((c) => c.promotionId === p.id).length
  if (roster >= B.market.rosterCap[p.tier]) return { signable: false, reason: `Roster full (${roster}/${B.market.rosterCap[p.tier]})` }
  if ((f.promoRelations[p.id] ?? 0) <= -60) return { signable: false, reason: 'Refuses to deal with you after the way they left' }
  return { signable: true }
}

export function marketTags(state: GameState, f: Fighter): string[] {
  const tags: string[] = []
  if (f.status === 'retired') return ['Retired']
  const fights = f.record.wins + f.record.losses + f.record.draws
  const last = f.history[f.history.length - 1]
  const recent = (d: number) => weeksBetween(d, state.today) <= B.market.recentWeeks
  if (!f.contractId) {
    if (fights === 0) tags.push('Newly turned pro')
    if (last?.kind === 'released' && recent(last.day)) tags.push('Recently released')
    if (last?.kind === 'expired' && recent(last.day)) tags.push('Contract expired')
    if (f.lastFightDay !== null && weeksBetween(f.lastFightDay, state.today) > 52 && fights > 0) tags.push('Returning from inactivity')
    if (tags.length === 0) tags.push('Looking for a promotion')
    if (valueOf(state, f) >= 60) tags.push('In demand')
  }
  return tags
}

/** Days since a birthday etc. helper kept here to avoid cyclic imports in views. */
export function ageOnDay(f: Fighter, day: number): number {
  return ageOn(f.birthDay, day)
}

export function visibilityOf(f: Fighter, today: number): number {
  return visibility(publicFacts(f, today))
}

// ------------------------------------------------------------ AI appraisal

/** What a rival promotion *thinks* of a fighter: truth plus noise that shrinks with promotion tier. */
export function appraise(state: GameState, promo: Promotion, f: Fighter): { rating: number; potential: number } {
  const sd = B.ai.appraisalSd[promo.tier]
  const quarter = Math.floor(state.today / 91)
  const rating = rawRating(f)
  return {
    rating: rating + keyedNormal(state.seed, 'ai-r', promo.id, f.id, quarter) * sd,
    potential: f.potential + keyedNormal(state.seed, 'ai-p', promo.id, f.id, quarter) * sd * 1.6,
  }
}

function rawRating(f: Fighter): number {
  const a = f.attributes
  return a.power * 0.15 + a.speed * 0.12 + a.defence * 0.14 + a.stamina * 0.11 + a.chin * 0.13 + a.ringIQ * 0.13 + a.heart * 0.09 + a.aggression * 0.05 + a.adaptability * 0.08
}

export function aiLuck(state: GameState, promoId: string, fighterId: string): number {
  return keyedFloat(state.seed, 'ai-luck', promoId, fighterId, state.today)
}
