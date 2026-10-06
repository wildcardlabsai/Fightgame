/**
 * WORLD RUNNER for the balance audit: plays a world forward (optionally with a scripted player) and records
 * what happened — events, fights, careers, rival health, forecast quality, save size, speed.
 */
import { gzipSync } from 'node:zlib'
import { fighterAge } from '../fighters'
import { demandFor } from '../events/demand'
import { deserialiseGame } from '../save'
import { financialHealth, player } from '../selectors'
import { advanceOneWeek } from '../tick'
import type { Difficulty, GameState, VenueTier } from '../types'
import { createNewGame } from '../worldgen'
import { newLog, playWeek, STRATEGIES, type StrategyLog } from './strategies'

export interface YearRow {
  year: number; cash: number; roster: number; reputation: number; fans: number; shows: number; revenue: number; profit: number; attendance: number
  health: string; insolventWeeks: number; ms: number
  /** World */
  fightsYear: number; retiredYear: number; newProsYear: number; avgAge: number; popOver50: number; active: number
  aiCash: Record<string, number>; aiState: Record<string, string>
}

export interface DemandRow { kind: 'player' | 'ai'; tier: VenueTier; cap: number; pub: number; act: number; price: number; pub0: number }
export interface EventRow { kind: 'player' | 'ai'; promo: string; tier: VenueTier; day: number; att: number; cap: number; fill: number; profit: number; revenue: number; costs: number; tickets: number; sponsor: number; broadcast: number; ppv: number; ppvKind: boolean; bcast: string; purses: number; fights: number; fa?: [number, number]; quality: number; gaPrice: number; repDelta: number; evRating: number; atmosphere: number }

export interface RunResult {
  seed: string; strategy: string; years: number; difficulty: string
  rows: YearRow[]
  events: EventRow[]
  demand: DemandRow[]
  playerShows: StrategyLog['shows']
  totals: { fights: number; events: number; retired: number; newPros: number; fightersEver: number }
  ai: { name: string; competence: string; strategy: string; tier: string; cash: number; rep: number; state: string; events: number; profit: number; bailouts: number; distributions: number; collapsing: boolean; roster: number }[]
  sizes: Record<number, { json: number; gz: number; loadMs: number; parts: Record<string, number> }>
  msPerWeek: number
  totalMs: number
  /** Same-fighter repetition: the most-frequent pairing and the most fights by one fighter in any 12 months. */
  maxPairRepeats: number
  pairs: { total: number; ge3: number; ge5: number }
  log: { planned: number; noCard: number; noVenue: number; signed: number }
}

const parts = (s: GameState): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(s)) out[k] = JSON.stringify(v)?.length ?? 0
  return out
}

export function runWorld(opts: { seed: string; years: number; strategy: string | null; difficulty?: Difficulty; sizeAt?: number[] }): RunResult {
  const difficulty = opts.difficulty ?? 'standard'
  let s = createNewGame({ seed: opts.seed, promotionName: 'Audit Promotions', promoterName: 'T', homeCountry: 'ENG', difficulty, logo: { monogram: 'A', color: '#fff', emblem: 'bolt' } })
  const strat = opts.strategy ? STRATEGIES[opts.strategy] : null
  const log = newLog()
  const rows: YearRow[] = []
  const events: EventRow[] = []
  const demand: DemandRow[] = []
  const seenWeek = new Set<string>()
  const pub0 = new Map<string, number>()
  const seenEv = new Set<string>(), seenFight = new Set<string>(), seenFighter = new Set<string>(Object.keys(s.fighters)), retired = new Set<string>()
  const pairs = new Map<string, number>()
  let fights = 0, newPros = 0, insolventWeeks = 0, engineMs = 0
  const yearAcc = { fights: 0, retired: 0, newPros: 0, ms: 0 }
  const sizes: RunResult['sizes'] = {}
  const sizeAt = opts.sizeAt ?? [5, 10, 20]
  let lastShows = 0, lastRev = 0, lastProfit = 0, lastAtt = 0

  for (let w = 1; w <= 52 * opts.years; w++) {
    if (strat) s = playWeek(s, strat, log)
    const t0 = performance.now()
    s = advanceOneWeek(s)
    const dt = performance.now() - t0
    engineMs += dt; yearAcc.ms += dt
    if (financialHealth(s).state === 'insolvent') insolventWeeks++

    for (const f of Object.values(s.fights)) {
      if (f.status === 'postFight' && f.result && !seenFight.has(f.id)) {
        seenFight.add(f.id); fights++; yearAcc.fights++
        const k = [f.sideA.fighterId, f.sideB.fighterId].sort().join('|')
        pairs.set(k, (pairs.get(k) ?? 0) + 1)
      }
    }
    for (const f of Object.values(s.fighters)) {
      if (!seenFighter.has(f.id)) { seenFighter.add(f.id); newPros++; yearAcc.newPros++ }
      if (f.status === 'retired' && !retired.has(f.id)) { retired.add(f.id); yearAcc.retired++ }
    }
    for (const e of Object.values(s.events)) {
      if (e.status === 'onSale' && !pub0.has(e.id)) { const d0 = demandFor(s, e, 'public', e.prices, e.marketing.budget); pub0.set(e.id, d0.ga + d0.premium + d0.vip) }
      if ((e.status === 'onSale' || e.status === 'promoting' || e.status === 'fightWeek') && e.day - s.today <= 14 && !seenWeek.has(e.id)) {
        seenWeek.add(e.id)
        const dp = demandFor(s, e, 'public', e.prices, e.marketing.budget), da = demandFor(s, e, 'actual', e.prices, e.marketing.budget)
        demand.push({ kind: e.kind, tier: s.venues[e.venueId].tier, cap: s.venues[e.venueId].capacity, pub: dp.ga + dp.premium + dp.vip, act: da.ga + da.premium + da.vip, price: e.prices.ga, pub0: pub0.get(e.id) ?? 0 })
      }
      if (!e.result || seenEv.has(e.id)) continue
      seenEv.add(e.id)
      const v = s.venues[e.venueId]
      const fs = e.card.map((id) => s.fights[id]).filter(Boolean)
      events.push({
        kind: e.kind, promo: s.promotions[e.promotionId].name, tier: v.tier, day: e.day, att: e.result.attendance, cap: v.capacity, fill: e.result.attendance / v.capacity, profit: e.result.profit,
        revenue: e.result.revenue, costs: e.result.costs, tickets: e.finance.revenue.tickets, sponsor: e.finance.revenue.sponsorship, broadcast: e.finance.revenue.broadcast, ppv: e.finance.revenue.ppv,
        ppvKind: e.broadcast.kind === 'ppv', bcast: e.broadcast.kind, purses: e.finance.costs.purses + e.finance.costs.bonuses, fights: fs.length || e.card.length, fa: e.forecast?.att, quality: e.result.cardQuality, gaPrice: e.prices.ga, repDelta: e.result.promoRepDelta, evRating: e.result.reputation, atmosphere: e.result.atmosphere,
      })
    }

    if (w % 52 === 0) {
      const y = w / 52
      const p = player(s)
      const mine = events.filter((e) => e.kind === 'player')
      const active = Object.values(s.fighters).filter((f) => f.status === 'active')
      const rev = mine.reduce((n, e) => n + e.revenue, 0), prof = mine.reduce((n, e) => n + e.profit, 0), att = mine.reduce((n, e) => n + e.att, 0)
      const ai = Object.values(s.promotions).filter((x) => !x.isPlayer)
      rows.push({
        year: y, cash: p.cash, roster: Object.values(s.contracts).filter((c) => c.promotionId === p.id).length, reputation: p.reputation, fans: p.fanbase, shows: mine.length - lastShows,
        revenue: rev - lastRev, profit: prof - lastProfit, attendance: att - lastAtt, health: financialHealth(s).state, insolventWeeks, ms: yearAcc.ms / 52,
        fightsYear: yearAcc.fights, retiredYear: yearAcc.retired, newProsYear: yearAcc.newPros, avgAge: active.reduce((n, f) => n + fighterAge(f, s.today), 0) / Math.max(1, active.length),
        popOver50: active.filter((f) => f.popularity > 50).length / Math.max(1, active.length), active: active.length,
        aiCash: Object.fromEntries(ai.map((x) => [x.name, x.cash])), aiState: Object.fromEntries(ai.map((x) => [x.name, x.ai?.fin?.state ?? '?'])),
      })
      lastShows = mine.length; lastRev = rev; lastProfit = prof; lastAtt = att
      yearAcc.fights = 0; yearAcc.retired = 0; yearAcc.newPros = 0; yearAcc.ms = 0
      if (sizeAt.includes(y)) {
        const json = JSON.stringify(s)
        const gz = gzipSync(json).length
        const t1 = performance.now()
        deserialiseGame(json)
        sizes[y] = { json: json.length, gz, loadMs: performance.now() - t1, parts: parts(s) }
      }
    }
  }
  const ai = Object.values(s.promotions).filter((x) => !x.isPlayer).map((x) => ({
    name: x.name, competence: x.ai?.competence ?? '?', strategy: x.ai?.strategy ?? '?', tier: x.tier, cash: x.cash, rep: x.reputation, state: x.ai?.fin?.state ?? '?',
    events: events.filter((e) => e.promo === x.name).length, profit: events.filter((e) => e.promo === x.name).reduce((n, e) => n + e.profit, 0), bailouts: x.accounting?.bailouts ?? 0,
    distributions: x.accounting?.distributions ?? 0, collapsing: !!x.ai?.fin?.collapsing, roster: Object.values(s.contracts).filter((c) => c.promotionId === x.id).length,
  }))
  return {
    seed: opts.seed, strategy: opts.strategy ?? 'passive', years: opts.years, difficulty, rows, events, demand, playerShows: log.shows,
    totals: { fights, events: events.length, retired: retired.size, newPros, fightersEver: seenFighter.size }, ai, sizes, msPerWeek: engineMs / (52 * opts.years), totalMs: engineMs,
    maxPairRepeats: Math.max(0, ...pairs.values()),
    pairs: { total: pairs.size, ge3: [...pairs.values()].filter((v) => v >= 3).length, ge5: [...pairs.values()].filter((v) => v >= 5).length },
    log: { planned: log.planned, noCard: log.noCard, noVenue: log.noVenue, signed: log.signed },
  }
}
