import { dayToDate } from '../calendar'
import { generateFighter, fighterAge, fighterName, fighterRating, clamp } from '../fighters'
import type { IdSource } from '../ids'
import { postMessage, postNews } from '../messages'
import type { Rng } from '../rng'
import type { Fighter, GameState } from '../types'
import { archiveContract, pushHistory } from '../roster'
import { titlesHeldBy } from '../media/titles'

/** Weekly chance a fighter calls it a day. Rises steeply after 33. */
export function retirementChance(f: Fighter, age: number): number {
  if (age < 33) return 0
  const rating = fighterRating(f)
  const base = Math.pow(age - 32, 1.6) * 0.0012
  const fading = rating < 48 ? 0.003 : 0
  return Math.min(0.2, base + fading) + (age >= 41 ? 0.05 : 0)
}

/** Holds a belt won in the last eight weeks, or has just won a title fight the media world has not yet settled. */
function recentlyCrowned(state: GameState, f: Fighter): boolean {
  const media = state.media!
  if (titlesHeldBy(media, f.id).some((t) => state.today - t.rec.since < 8 * 7)) return true
  const last = state.fights[f.recentFights[f.recentFights.length - 1]]
  if (!last?.result || !media.titleFights[last.id]) return false
  const w = last.result.winner
  return w !== null && (w === 0 ? last.sideA.fighterId : last.sideB.fighterId) === f.id
}

export function processRetirements(state: GameState, rng: Rng): void {
  for (const f of Object.values(state.fighters)) {
    if (f.status !== 'active') continue
    const age = fighterAge(f, state.today)
    if (!rng.chance(retirementChance(f, age))) continue
    // A fighter who has just won a belt takes a first defence before calling it a day (the draw above is spent either way).
    if (state.media?.effects && recentlyCrowned(state, f)) continue
    retire(state, f)
  }
  // (washouts of long-idle nobodies were tried and removed: they shrank the rated pool faster than they trimmed the bloat)
}

function retire(state: GameState, f: Fighter): void {
  const contract = f.contractId ? state.contracts[f.contractId] : null
  const mine = contract?.promotionId === state.playerPromotionId
  f.status = 'retired'
  f.retiredDay = state.today
  if (contract) archiveContract(state, contract, 'retired')
  f.contractId = null
  f.availableSince = null
  pushHistory(f, { day: state.today, kind: 'retired', promotionId: contract?.promotionId ?? null })
  if (contract && !mine) { const pr = state.promotions[contract.promotionId]; if (pr.ai) pr.ai.urgency = Math.min(3, pr.ai.urgency + 1) }
  if (mine) {
    postMessage(state, {
      from: 'Gym', category: 'fighter', priority: 'important',
      subject: `${fighterName(f)} retires`,
      body: `After ${f.record.wins + f.record.losses + f.record.draws} professional fights (${f.record.wins}-${f.record.losses}-${f.record.draws}), ${f.firstName} ${f.lastName} has decided to hang up the gloves.`,
      link: { kind: 'fighter', id: f.id },
    })
  }
  if (f.reputation >= 45 || mine) {
    postNews(state, { headline: `${fighterName(f)} (${f.record.wins}-${f.record.losses}-${f.record.draws}) announces retirement`, category: 'retirement', fighterId: f.id })
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
    f.availableSince = state.today
    pushHistory(f, { day: state.today, kind: 'turnedPro', promotionId: null })
    state.fighters[f.id] = f
    if (f.potential >= 82) {
      postNews(state, { headline: `Amateur star ${fighterName(f)} (${f.hometown}) is turning professional`, category: 'prospect', fighterId: f.id })
    }
  }
}

/** Approximate year-end marker so the world can run yearly events later (Phase 6+). */
export function isNewYearWeek(state: GameState): boolean {
  const d = dayToDate(state.today)
  return d.getUTCMonth() === 0 && d.getUTCDate() <= 7
}
