/**
 * NEGOTIATING STAGE. Where a fighter stands in the sport, from PUBLIC facts only (record, age, belts, ranking, fame). It changes how
 * their camp negotiates: a prospect's camp protects, a contender's wants a route to a title, a champion's wants stakes and money, a star's
 * wants the stage, a journeyman's wants work and cash now, a veteran's wants security and a legacy.
 */
import { fighterAge, totalFights } from '../fighters'
import { titlesHeldBy } from '../media/titles'
import { primaryRank } from '../media/worldEvents'
import type { Fighter, GameState } from '../types'
import type { Priority } from './manager'

export type NegStage = 'prospect' | 'journeyman' | 'contender' | 'champion' | 'star' | 'veteran'

export const STAGE_LABEL: Record<NegStage, string> = { prospect: 'Prospect', journeyman: 'Journeyman', contender: 'Contender', champion: 'Champion', star: 'Established star', veteran: 'Veteran' }

export function negStage(state: GameState, f: Fighter): NegStage {
  const age = fighterAge(f, state.today)
  const fights = totalFights(f)
  const media = state.media
  if (media && titlesHeldBy(media, f.id).length > 0) return 'champion'
  if (f.reputation >= 72 || f.popularity >= 75) return 'star'
  const rank = media ? primaryRank(media, f) : null
  if ((rank !== null && rank <= 10) || (fights >= 10 && f.reputation >= 50)) return 'contender'
  if (age >= 34) return 'veteran'
  if (fights <= 10 && age <= 25) return 'prospect'
  if (fights >= 15 && f.reputation < 40) return 'journeyman'
  return age >= 30 ? 'veteran' : 'contender'
}

/** How a stage bends a camp's priorities, patience, readiness to walk and appetite for long deals (multipliers / offsets). */
export const STAGE_BEND: Record<NegStage, { weights: Partial<Record<Priority, number>>; patience: number; walk: number; years: number; money: number }> = {
  prospect: { weights: { development: 1.4, security: 1.2, career: 1.2, money: 0.8 }, patience: 1.2, walk: -0.1, years: 1, money: 0.92 },
  journeyman: { weights: { money: 1.2, activity: 1.35, title: 0.4, career: 0.7 }, patience: 0.8, walk: 0.0, years: -1, money: 1.0 },
  contender: { weights: { title: 1.5, career: 1.2, activity: 1.1 }, patience: 1.0, walk: 0.05, years: 0, money: 1.0 },
  champion: { weights: { money: 1.3, title: 1.2, exposure: 1.25, loyalty: 0.8 }, patience: 0.9, walk: 0.15, years: -1, money: 1.08 },
  star: { weights: { exposure: 1.5, money: 1.3, loyalty: 0.8, development: 0.5 }, patience: 0.85, walk: 0.2, years: -1, money: 1.12 },
  veteran: { weights: { money: 1.4, security: 1.2, career: 0.8, development: 0.4 }, patience: 0.9, walk: 0.05, years: -1, money: 1.0 },
}
