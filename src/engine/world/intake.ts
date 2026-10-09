/**
 * THE PROSPECT PIPELINE. New professionals arrive in proportion to what the sport is short of, not at a flat rate:
 *   - each division has a target head-count (its share of the sport's weight-class mix), and the weekly intake follows the total shortfall;
 *   - the division of each newcomer is drawn from the shortfalls, so a thinning weight class refills and a crowded one does not;
 *   - most are amateur graduates (18-21, no professional bouts); some are late arrivals (22-24) or established overseas professionals
 *     (23-27) whose records come from the ordinary fighter generator, so they arrive with a believable number of bouts;
 *   - a fraction of newcomers come from the home countries of the promotions, so every promotion has some local talent to find.
 * Intake is bounded per year. Nobody is deleted to control the population: retirement does that, as it always has. Potential is the
 * generator's hidden value and reaches the player only through scouting, exactly as before.
 */
import { WEIGHT_CLASSES } from '../../data/weightClasses'
import { clamp, generateFighter, fighterName } from '../fighters'
import type { IdSource } from '../ids'
import { postNews } from '../messages'
import { pushHistory } from '../roster'
import type { Rng } from '../rng'
import type { Fighter, GameState, WeightClassId } from '../types'
import { worldOf } from './pursuit'

export const PIPELINE = {
  /** Active professionals (signed or not) the sport settles around. The generated world starts a little above it. */
  activeTarget: 300,
  /** Weekly expected newcomers when nothing is short, and per unit of total shortfall. */
  weeklyFloor: 0.12,
  weeklyPerShortfall: 0.09,
  weeklyCap: 1.8,
  yearlyCap: 44,
  lateArrival: 0.14,
  overseas: 0.08,
  /** Share of newcomers drawn from the promotions' home countries. */
  local: 0.35,
  /** Share of newcomers drawn from the gifted tail. */
  gifted: 0.22,
}

const SUM_W = WEIGHT_CLASSES.reduce((a, w) => a + w.weight, 0)

/** Head-count each weight class settles around. */
export const divisionTarget = (id: WeightClassId): number => Math.round((PIPELINE.activeTarget * (WEIGHT_CLASSES.find((w) => w.id === id)?.weight ?? 1)) / SUM_W)

/** Active professionals by division (one pass). */
export function divisionCounts(state: GameState): Record<string, number> {
  const c: Record<string, number> = {}
  for (const f of Object.values(state.fighters)) if (f.status === 'active') c[f.weightClass] = (c[f.weightClass] ?? 0) + 1
  return c
}

/** Where the sport is short: target minus active, per division (negative = crowded). */
export function shortfalls(state: GameState): Record<string, number> {
  const counts = divisionCounts(state)
  const out: Record<string, number> = {}
  for (const w of WEIGHT_CLASSES) out[w.id] = divisionTarget(w.id) - (counts[w.id] ?? 0)
  return out
}

export function talentIntake(state: GameState, rng: Rng, ids: IdSource): void {
  const w = worldOf(state)
  if (state.today - w.intake.windowStart >= 364) w.intake = { windowStart: state.today, admitted: 0 }
  const short = shortfalls(state)
  const total = Object.values(short).reduce((a, v) => a + Math.max(0, v), 0)
  const lambda = Math.min(PIPELINE.weeklyCap, PIPELINE.weeklyFloor + PIPELINE.weeklyPerShortfall * total)
  let n = Math.floor(lambda) + (rng.chance(lambda - Math.floor(lambda)) ? 1 : 0)
  n = Math.min(n, PIPELINE.yearlyCap - w.intake.admitted)
  if (n <= 0) return
  const promoHomes = Object.values(state.promotions).map((p) => p.homeCountry)
  for (let i = 0; i < n; i++) {
    // Division: weighted by shortfall (a floor keeps every class reachable, a crowded one barely).
    const wc = rng.weighted(WEIGHT_CLASSES, (d) => Math.max(0.05, short[d.id] + 1.5)).id
    short[wc] -= 1
    const roll = rng.next()
    const origin = roll < PIPELINE.overseas ? 'overseas' : roll < PIPELINE.overseas + PIPELINE.lateArrival ? 'late' : 'amateur'
    // A small tail of genuinely gifted newcomers keeps the top of the sport supplied over long careers (the rest are ordinary club prospects).
    const base = rng.chance(PIPELINE.gifted) ? rng.clampedNormal(0.62, 0.13, 0.35, 0.97) : rng.clampedNormal(0.3, 0.16, 0.05, 0.9)
    const f = generateFighter(rng, ids, {
      quality: origin === 'overseas' ? clamp(base + 0.06, 0.05, 0.97) : base,
      today: state.today, weightClass: wc,
      ageMin: origin === 'amateur' ? 18 : origin === 'late' ? 22 : 23, ageMax: origin === 'amateur' ? 21 : origin === 'late' ? 24 : 27,
      ...(rng.chance(PIPELINE.local) ? { nationality: rng.pick(promoHomes) } : {}),
    })
    if (origin === 'amateur') {
      f.record = { wins: 0, losses: 0, draws: 0, koWins: 0, koLosses: 0 }
      f.lastFightDay = null
      f.popularity = clamp(f.popularity - 10, 1, 100)
    }
    f.availableSince = state.today
    pushHistory(f, { day: state.today, kind: 'turnedPro', promotionId: null })
    state.fighters[f.id] = f
    w.intake.admitted++
    announce(state, f, origin)
  }
}

function announce(state: GameState, f: Fighter, origin: 'amateur' | 'late' | 'overseas'): void {
  if (f.potential >= 82 && origin === 'amateur') postNews(state, { headline: `Amateur star ${fighterName(f)} (${f.hometown}) is turning professional`, category: 'prospect', fighterId: f.id })
}
