/**
 * AI MATCHMAKING. Rival promotions put their fighters in the ring, so the world moves without the player.
 * Each promotion picks the fighter who most needs a fight, then an opponent that suits its strategy:
 *   prospectFactory — soft-ish tests to build records, and refuses to let its prospects be fed to better fighters
 *   traditional     — competitive, evenly matched fights
 *   money           — popular names
 *   regional        — opponents from its own region
 * Opponents come from its own roster, other rivals, or the free-agent pool (journeymen paid per fight).
 */
import { regionOf } from '../../data/nations'
import { BALANCE as B } from '../balance'
import { fighterAge, publicFacts } from '../fighters'
import { weightCompatible } from '../fight/profile'
import { transition } from '../fight/lifecycle'
import { chooseVenue, createFight, fightAvailability, lockKey, restUntil } from '../fights'
import { appraise, baseMoney, valueOf } from '../market'
import { titleBonus, titlePartners } from '../media/titles'
import type { Rng } from '../rng'
import type { Contract, Fighter, GameState, Id, Promotion } from '../types'

const SAT = 5
export const weeksSince = (state: GameState, f: Fighter) => (f.lastFightDay === null ? 40 : Math.floor((state.today - f.lastFightDay) / 7))

export function bookable(state: GameState, f: Fighter, day: number): boolean {
  return f.status === 'active' && !f.activeFightId && fightAvailability(state, f, day).ok
}

export function aiMatchmaking(state: GameState, rng: Rng): void {
  const playerRoster = new Set(Object.values(state.contracts).filter((c) => c.promotionId === state.playerPromotionId).map((c) => c.fighterId))
  const promos = rng.shuffle(Object.values(state.promotions).filter((p) => !p.isPlayer && p.ai))
  const activeByPromo: Record<Id, number> = {}
  for (const f of Object.values(state.fights)) if (f.kind === 'ai' && ['scheduled', 'training', 'agreed'].includes(f.status)) activeByPromo[f.organiserId] = (activeByPromo[f.organiserId] ?? 0) + 1

  for (const promo of promos) {
   const roster = Object.values(state.contracts).filter((c) => c.promotionId === promo.id)
   // Bigger promotions run more shows: several booking attempts a week, scaled by roster size.
   const attempts = Math.ceil(roster.length / B.fights.ai.rosterPerAttempt)
   for (let attempt = 0; attempt < attempts; attempt++) {
    if (!rng.chance(B.fights.ai.perPromoPerWeek)) continue
    const contracts = roster
    if ((activeByPromo[promo.id] ?? 0) >= Math.max(2, Math.ceil(contracts.length * B.fights.ai.maxOpenShare))) continue
    const day = state.today + SAT + 7 * rng.int(B.fights.ai.minWeeksNotice, B.fights.ai.maxWeeksNotice)

    // Who most needs a fight?
    const needy = contracts
      .map((c) => ({ c, f: state.fighters[c.fighterId] }))
      .filter((x) => x.f && bookable(state, x.f, day))
      .sort((a, b) => weeksSince(state, b.f) - weeksSince(state, a.f))
      .slice(0, 4)
    if (needy.length === 0) continue
    const { c, f: x } = needy[Math.min(needy.length - 1, rng.int(0, 1))]
    if (weeksSince(state, x) < B.fights.restWeeks + 2) continue

    const opp = pickOpponent(state, promo, x, day, playerRoster, rng)
    if (!opp) continue
    // Cost
    const ct = opp.contractId ? state.contracts[opp.contractId] : null
    const fa = baseMoney(valueOf(state, opp)).purse * B.fights.ai.journeymanPurseFactor
    const purseB = ct ? ct.basePurse : Math.round(fa / 100) * 100
    const winB = ct ? ct.winBonus : Math.round((purseB * 0.1) / 100) * 100
    if (promo.cash < (c.basePurse + purseB + c.winBonus + winB) * 1.2) continue

    const fight = createFight(state, x.id, opp.id, promo.id, 'ai', { purseB, winBonusB: winB })
    transition(fight, 'agreed')
    fight.day = day
    chooseVenue(state, fight)
    transition(fight, 'scheduled')
    opp.activeFightId = fight.id
    // Tactical lean: styles pick a sensible plan.
    for (const [side, f] of [[fight.sideA, x], [fight.sideB, opp]] as const) {
      side.prep.plan = ['Pressure Fighter', 'Swarmer', 'Power Puncher'].includes(f.style) ? 'aggressive' : ['Defensive Specialist', 'Counter Puncher'].includes(f.style) ? 'cautious' : 'balanced'
    }
    activeByPromo[promo.id] = (activeByPromo[promo.id] ?? 0) + 1
   }
  }
}

export function pickOpponent(state: GameState, promo: Promotion, x: Fighter, day: number, playerRoster: Set<Id>, rng: Rng): Fighter | null {
  const strat = promo.ai!.strategy
  const aX = appraise(state, promo, x).rating
  const recent = new Set<Id>()
  for (const fid of x.recentFights.slice(-6)) {
    const ft = state.fights[fid]
    if (ft) recent.add(ft.sideA.fighterId === x.id ? ft.sideB.fighterId : ft.sideA.fighterId)
  }
  const pool = Object.values(state.fighters).filter((o) =>
    o.id !== x.id && o.status === 'active' && !playerRoster.has(o.id) && weightCompatible(x.weightClass, o.weightClass) !== 'no' && bookable(state, o, day) &&
    !(state.fightLocks[lockKey(x.id, o.id)] > state.today))
  if (pool.length === 0) return null
  const sample = rng.shuffle(pool).slice(0, 60)
  // A body's champion, mandatory challenger or the top two for a vacant belt are always worth a look (no extra randomness used).
  for (const id of titlePartners(state, x.id, x.weightClass)) { const o = state.fighters[id]; if (o && pool.includes(o) && !sample.includes(o)) sample.push(o) }
  let best: { o: Fighter; score: number } | null = null
  for (const o of sample) {
    const aO = appraise(state, promo, o).rating
    const diff = aO - aX
    const age = fighterAge(x, state.today)
    const target = strat === 'prospectFactory' ? (age <= 25 ? -10 : -2) : strat === 'traditional' ? 0 : strat === 'money' ? 1 : -3
    let score = -Math.abs(diff - target)
    if (weightCompatible(x.weightClass, o.weightClass) === 'catchweight') score -= 6
    if (strat === 'money') score += o.popularity * 0.12
    score += titleBonus(state, x.id, o.id, x.weightClass)
    if (strat === 'regional' && regionOf(o.nationality) === regionOf(promo.homeCountry)) score += 6
    if (recent.has(o.id)) score -= 14
    // The public tires of the same two fighters: every prior meeting in recent memory costs, and three is a trilogy — enough.
    const meetings = o.recentFights.filter((id) => x.recentFights.includes(id)).length
    if (meetings >= 3) continue
    score -= 12 * meetings
    if (o.contractId === null) score -= 1 // journeymen are a fallback, not a first choice…
    else if (state.contracts[o.contractId].promotionId === promo.id) score += 2
    if (o.contractId === null && rng.chance(B.fights.ai.freeAgentChance)) score += 4 // …but a good source of opposition for prospects
    // The opponent's promotion must agree; prospect factories refuse to feed a prospect to a better fighter.
    const oc = o.contractId ? state.contracts[o.contractId] : null
    const op = oc && oc.promotionId !== promo.id ? state.promotions[oc.promotionId] : null
    if (op) {
      const oAge = fighterAge(o, state.today)
      const aXfromO = appraise(state, op, x).rating
      const aOfromO = appraise(state, op, o).rating
      if (op.ai?.strategy === 'prospectFactory' && oAge <= 24 && aXfromO > aOfromO + 8) continue
      if (rng.chance(0.15)) continue // plain scheduling friction
    }
    if (!best || score > best.score) best = { o, score }
  }
  return best && best.score > -18 ? best.o : null
}

export { publicFacts, restUntil }
export type { Contract }
