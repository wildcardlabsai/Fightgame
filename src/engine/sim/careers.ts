/**
 * CAREER TRACKER for the Phase 4.6 audit: follows individual fighters through a world and records yearly snapshots,
 * peaks, activity, contracts and promotions so career arcs can be inspected (no impossible, inactive or infinite careers).
 */
import { fighterAge } from '../fighters'
import { valueOf } from '../market'
import { advanceOneWeek } from '../tick'
import type { Difficulty, GameState } from '../types'
import { createNewGame } from '../worldgen'
import { newLog, playWeek, STRATEGIES } from './strategies'

export interface Snap { y: number; age: number; w: number; l: number; pop: number; rep: number; value: number; purse: number | null; promo: string | null; status: string; fights12: number }
export interface Career {
  id: string; seed: string; startAge: number; startPop: number; startRep: number; potential: number; originallyInWorld: boolean
  snaps: Snap[]; fights: number; wins: number; losses: number; peakRep: number; peakPop: number; peakValue: number; peakAge: number
  retiredAge: number | null; contracts: number; promos: string[]; maxFightsIn12: number; titleRun: boolean
}

export function runCareers(opts: { seed: string; years: number; strategy?: string | null; difficulty?: Difficulty }): { careers: Career[]; today: number; worldFights: number } {
  let s: GameState = createNewGame({ seed: opts.seed, promotionName: 'Audit Promotions', promoterName: 'T', homeCountry: 'ENG', difficulty: opts.difficulty ?? 'standard', logo: { monogram: 'A', color: '#fff', emblem: 'bolt' } })
  const strat = opts.strategy ? STRATEGIES[opts.strategy] : null
  const log = newLog()
  const cs = new Map<string, Career>()
  const initial = new Set(Object.keys(s.fighters))
  const fightDays = new Map<string, number[]>()
  const seenFight = new Set<string>()
  let worldFights = 0
  const track = (f: GameState['fighters'][string]) => {
    if (cs.has(f.id)) return
    cs.set(f.id, { id: f.id, seed: opts.seed, startAge: fighterAge(f, s.today), startPop: f.popularity, startRep: f.reputation, potential: f.potential, originallyInWorld: initial.has(f.id), snaps: [], fights: 0, wins: 0, losses: 0, peakRep: f.reputation, peakPop: f.popularity, peakValue: 0, peakAge: 0, retiredAge: null, contracts: 0, promos: [], maxFightsIn12: 0, titleRun: false })
  }
  for (const f of Object.values(s.fighters)) track(f)
  for (let w = 1; w <= 52 * opts.years; w++) {
    if (strat) s = playWeek(s, strat, log)
    s = advanceOneWeek(s)
    for (const f of Object.values(s.fights)) {
      if (f.status === 'postFight' && f.result && !seenFight.has(f.id)) {
        seenFight.add(f.id); worldFights++
        for (const id of [f.sideA.fighterId, f.sideB.fighterId]) { const a = fightDays.get(id) ?? []; a.push(s.today); fightDays.set(id, a) }
      }
    }
    for (const f of Object.values(s.fighters)) {
      track(f)
      const c = cs.get(f.id)!
      const age = fighterAge(f, s.today)
      const v = valueOf(s, f)
      if (f.reputation > c.peakRep) c.peakRep = f.reputation
      if (f.popularity > c.peakPop) c.peakPop = f.popularity
      if (v > c.peakValue) { c.peakValue = v; c.peakAge = age }
      if (f.status === 'retired' && c.retiredAge === null) c.retiredAge = age
      if (w % 52 === 0 && f.status !== 'retired' || (w % 52 === 0 && f.status === 'retired' && c.snaps.length && c.snaps[c.snaps.length - 1].status !== 'retired')) {
        const ct = f.contractId ? s.contracts[f.contractId] : null
        const days = fightDays.get(f.id) ?? []
        c.snaps.push({ y: w / 52, age, w: f.record.wins, l: f.record.losses, pop: f.popularity, rep: f.reputation, value: v, purse: ct ? ct.basePurse : null, promo: ct ? s.promotions[ct.promotionId]?.name ?? null : null, status: f.status, fights12: days.filter((d) => s.today - d <= 365).length })
      }
    }
  }
  const out: Career[] = []
  for (const c of cs.values()) {
    const f = s.fighters[c.id]
    if (!f) continue // pruned retired
    c.wins = f.record.wins; c.losses = f.record.losses; c.fights = f.record.wins + f.record.losses + f.record.draws
    c.contracts = f.history.filter((h) => h.kind === 'signed' || h.kind === 'renewed').length
    c.promos = [...new Set(f.history.filter((h) => h.promotionId).map((h) => s.promotions[h.promotionId!]?.name ?? '?'))]
    const days = fightDays.get(c.id) ?? []
    for (const d of days) c.maxFightsIn12 = Math.max(c.maxFightsIn12, days.filter((x) => x >= d && x - d < 365).length)
    out.push(c)
  }
  return { careers: out, today: s.today, worldFights }
}
