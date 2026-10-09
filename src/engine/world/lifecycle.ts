/**
 * PROMOTION LIFE CYCLE. Promotions fail (see systems/aiFinance.ts: owners rescue a struggling promotion a limited number of times,
 * then stop) and the sport replaces them slowly, so a long career never ends in a world with no competition.
 *
 *   - A failed promotion (collapsing, with no fighters left) stays in the state with all its history; it is simply no longer a
 *     competitor. Nothing is deleted.
 *   - Once a quarter, if fewer than six rivals are still trading, or the market holds a large pool of credible unsigned fighters that
 *     nobody is hiring while fewer than eight are trading, a new Startup promotion may be founded. Its capital is a fixed, modest
 *     investment that opens its books (startCash), exactly like the launch promotions' opening cash; it receives nothing further.
 *   - At most one founding per half year, whatever the market looks like.
 */
import { ENTRANTS } from '../../data/entrants'
import { aiTraits, emptyStats, freshFinance } from '../worldgen'
import { fighterRating } from '../fighters'
import type { IdSource } from '../ids'
import { postNews } from '../messages'
import { monogramFor } from '../promotions'
import { keyedFloat } from '../rng'
import type { GameState, Promotion } from '../types'

export const LIFECYCLE = { minTrading: 6, maxTrading: 8, capital: 650_000, credibleFreeAgents: 24, cooldownWeeks: 26 }

/** A rival that still competes: not collapsing, and either holding fighters or too young to have signed any. */
export function isTrading(p: Promotion): boolean {
  if (p.isPlayer || !p.ai || p.ai.fin.collapsing) return false
  return true
}

export function tradingRivals(state: GameState): Promotion[] {
  return Object.values(state.promotions).filter(isTrading)
}

/** Failed and finished: collapsing with no one on its books (derived; never stored). */
export function isDefunct(state: GameState, p: Promotion): boolean {
  if (p.isPlayer || !p.ai?.fin.collapsing) return false
  for (const c of Object.values(state.contracts)) if (c.promotionId === p.id) return false
  return true
}

export function processLifecycle(state: GameState, ids: IdSource): void {
  const week = Math.floor((state.today - state.startDay) / 7)
  if (week % 13 !== 6) return
  const trading = tradingRivals(state)
  const founded = Object.values(state.promotions).filter((p) => !p.isPlayer && p.ai && state.today - p.foundedDay < LIFECYCLE.cooldownWeeks * 7 && p.foundedDay > state.startDay)
  if (founded.length > 0) return
  const credible = Object.values(state.fighters).filter((f) => f.status === 'active' && f.contractId === null && fighterRating(f) >= 50).length
  const shortOfRivals = trading.length < LIFECYCLE.minTrading
  const idleTalent = trading.length < LIFECYCLE.maxTrading && credible >= LIFECYCLE.credibleFreeAgents
  if (!shortOfRivals && !idleTalent) return
  if (keyedFloat(state.seed, 'found', Math.floor(state.today / 91)) > (shortOfRivals ? 0.7 : 0.35)) return
  const used = new Set(Object.values(state.promotions).map((p) => p.name))
  const seed = ENTRANTS.find((e) => !used.has(e.name))
  if (!seed) return
  const id = ids.next('p')
  const traits = aiTraits(state.seed, seed.name, 'Startup', seed.strategy, state.settings.difficulty)
  state.promotions[id] = {
    id, name: seed.name, promoterName: seed.promoter, isPlayer: false, homeCountry: seed.country, tier: 'Startup',
    logo: { monogram: monogramFor(seed.name), color: seed.color, emblem: seed.emblem },
    cash: LIFECYCLE.capital, reputation: 10, fanbase: 3_000, regionalPopularity: 8, globalPopularity: 0, foundedDay: state.today,
    ai: { strategy: seed.strategy, urgency: 2, cooldownUntil: state.today, ...traits, fin: freshFinance(state.today) },
    stats: emptyStats(state.today), accounting: { startCash: LIFECYCLE.capital, revenue: 0, costs: 0, overhead: 0, bailouts: 0, distributions: 0 },
  }
  postNews(state, { headline: `New promotion ${seed.name} launches, backed by ${seed.promoter}`, category: 'business', importance: 35 })
}
