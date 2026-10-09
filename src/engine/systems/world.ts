import { dayToDate } from '../calendar'
import { fighterAge, fighterName, fighterRating } from '../fighters'
import { postMessage, postNews } from '../messages'
import type { Rng } from '../rng'
import type { Fighter, GameState } from '../types'
import { archiveContract, pushHistory } from '../roster'
import { titlesHeldBy } from '../media/titles'
import { streakBefore } from '../fight/context'

/** Weekly chance a fighter calls it a day. Rises steeply after 33. */
export function retirementChance(f: Fighter, age: number): number {
  if (age < 33) return 0
  const rating = fighterRating(f)
  const base = Math.pow(age - 32, 1.6) * 0.0012
  const fading = rating < 48 ? 0.003 : 0
  return Math.min(0.2, base + fading) + (age >= 41 ? 0.05 : 0)
}

/**
 * Phase 5.4D: a career can also end because it has stopped working, not only because of age. A fighter of 30 or more with a long
 * record and a modest rating who has lost four or more in a row, or who has been without a contract and out of the ring for two years,
 * has a small weekly chance of calling it a day. Anyone rated 55+ or holding a belt is untouched, so the rated pool does not shrink.
 */
export function wornDownChance(state: GameState, f: Fighter, age: number): number {
  if (age < 30 || f.record.wins + f.record.losses + f.record.draws < 8 || fighterRating(f) >= 55) return 0
  let p = 0
  const st = streakBefore(state, f, '')
  if (st.kind === 'loss' && st.n >= 4) p += 0.004 * Math.min(3, st.n - 3)
  if (!f.contractId && f.lastFightDay !== null && (state.today - f.lastFightDay) / 7 > 104) p += 0.006
  return p
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
    if (!rng.chance(Math.min(0.25, retirementChance(f, age) + wornDownChance(state, f, age)))) continue
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

/** Approximate year-end marker so the world can run yearly events later (Phase 6+). */
export function isNewYearWeek(state: GameState): boolean {
  const d = dayToDate(state.today)
  return d.getUTCMonth() === 0 && d.getUTCDate() <= 7
}
