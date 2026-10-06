import { dayToDate } from '../calendar'
import { generateFighter, fighterAge, fighterName, fighterRating, clamp } from '../fighters'
import type { IdSource } from '../ids'
import { postMessage, postNews } from '../messages'
import type { Rng } from '../rng'
import { signContract } from '../worldgen'
import type { Fighter, GameState, PromotionTier } from '../types'

/** Weekly chance a fighter calls it a day. Rises steeply after 33. */
export function retirementChance(f: Fighter, age: number): number {
  if (age < 33) return 0
  const rating = fighterRating(f)
  const base = Math.pow(age - 32, 1.6) * 0.0012
  const fading = rating < 48 ? 0.003 : 0
  return Math.min(0.2, base + fading) + (age >= 41 ? 0.05 : 0)
}

export function processRetirements(state: GameState, rng: Rng): void {
  for (const f of Object.values(state.fighters)) {
    if (f.status !== 'active') continue
    const age = fighterAge(f, state.today)
    if (!rng.chance(retirementChance(f, age))) continue
    const contract = f.contractId ? state.contracts[f.contractId] : null
    const mine = contract?.promotionId === state.playerPromotionId
    f.status = 'retired'
    f.retiredDay = state.today
    if (contract) delete state.contracts[contract.id]
    f.contractId = null
    if (mine) {
      postMessage(state, {
        from: 'Gym', category: 'fighter', priority: 'important',
        subject: `${fighterName(f)} retires`,
        body: `After ${f.record.wins + f.record.losses + f.record.draws} professional fights (${f.record.wins}-${f.record.losses}-${f.record.draws}), ${f.firstName} ${f.lastName} has decided to hang up the gloves at ${age}.`,
        link: { kind: 'fighter', id: f.id },
      })
    }
    if (f.reputation >= 45 || mine) {
      postNews(state, { headline: `${fighterName(f)} (${f.record.wins}-${f.record.losses}-${f.record.draws}) announces retirement`, category: 'retirement', fighterId: f.id })
    }
  }
}

/** New amateur graduates turn professional, keeping the talent pool alive. */
export function talentIntake(state: GameState, rng: Rng, ids: IdSource): void {
  if (!rng.chance(0.2)) return
  const n = rng.int(1, 3)
  for (let i = 0; i < n; i++) {
    const quality = rng.clampedNormal(0.3, 0.17, 0.05, 0.97)
    const f = generateFighter(rng, ids, { quality, today: state.today, ageMin: 18, ageMax: 21 })
    f.record = { wins: 0, losses: 0, draws: 0, koWins: 0, koLosses: 0 }
    f.lastFightDay = null
    f.popularity = clamp(f.popularity - 10, 1, 100)
    state.fighters[f.id] = f
    if (f.potential >= 82) {
      postNews(state, { headline: `Amateur star ${fighterName(f)} (${f.hometown}) is turning professional`, category: 'prospect', fighterId: f.id })
    }
  }
}

const TIER_TARGET: Record<PromotionTier, number> = { Startup: 35, Regional: 44, National: 54, Major: 64, Global: 72 }
const TIER_ROSTER: Record<PromotionTier, number> = { Startup: 8, Regional: 18, National: 24, Major: 28, Global: 30 }

/** Lightweight AI: rivals re-sign or release expiring fighters and fill gaps from the free-agent pool. */
export function aiRosterManagement(state: GameState, rng: Rng, ids: IdSource): void {
  const free = Object.values(state.fighters).filter((f) => f.status === 'active' && f.contractId === null)
  const taken = new Set<string>()

  for (const promo of Object.values(state.promotions)) {
    if (promo.isPlayer) continue
    const roster = Object.values(state.contracts).filter((c) => c.promotionId === promo.id)
    const target = TIER_TARGET[promo.tier]
    const wanted = TIER_ROSTER[promo.tier]
    if (roster.length >= wanted || !rng.chance(0.6)) continue

    // Look at a random sample of the market and take the best fit.
    const sample = rng.shuffle(free.filter((f) => !taken.has(f.id))).slice(0, 14)
    let best: Fighter | null = null
    let bestScore = -Infinity
    for (const f of sample) {
      const age = fighterAge(f, state.today)
      if (age > 34) continue
      const rating = fighterRating(f)
      if (rating < target - 14) continue
      const score = rating + f.potential * 0.4 + f.popularity * 0.2 - Math.abs(rating - target) * 0.5 - Math.max(0, age - 30) * 2
      if (score > bestScore) { best = f; bestScore = score }
    }
    if (!best) continue
    taken.add(best.id)
    const c = signContract(rng, ids, best, promo.id, state.today, Math.min(0.9, fighterRating(best) / 110))
    c.startDay = state.today
    c.endDay = state.today + rng.int(1, 3) * 365
    state.contracts[c.id] = c
    best.contractId = c.id
    if (fighterRating(best) >= 62 || best.potential >= 82) {
      postNews(state, { headline: `${promo.name} sign ${fighterName(best)} (${best.record.wins}-${best.record.losses}-${best.record.draws})`, category: 'signing', fighterId: best.id })
    }
  }
}

/** Approximate year-end marker so the world can run yearly events later (Phase 6+). */
export function isNewYearWeek(state: GameState): boolean {
  const d = dayToDate(state.today)
  return d.getUTCMonth() === 0 && d.getUTCDate() <= 7
}
