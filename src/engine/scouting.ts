import { BALANCE as B } from './balance'
import { nation, NATIONS } from '../data/nations'
import { weightClassLabel } from '../data/weightClasses'
import { fighterName, publicFacts, visibility } from './fighters'
import { stateIds } from './ids'
import { canAfford, post } from './ledger'
import {
  applyReport, discover, isDiscovered, labelFor, scoutAccuracy, trueValue, beliefOf, observationSd,
} from './knowledge'
import { postMessage } from './messages'
import { keyedNormal, type Rng } from './rng'
import { player } from './selectors'
import type { Fighter, GameState, Id, Scout, ScoutAssignment, ScoutDepth, WeightClassId } from './types'

export const DEPTH_LABEL: Record<ScoutDepth, string> = { basic: 'Basic report', standard: 'Standard report', deep: 'Deep dive' }
export const DEPTH_BLURB: Record<ScoutDepth, string> = {
  basic: 'Physical tools only. Quick and cheap, but rough — and potential stays murky.',
  standard: 'Adds technical ability and heart. A solid working picture.',
  deep: 'Full assessment including discipline, composure and personality. The best look at potential money can buy.',
}

export function createStartingScout(state: GameState, regionNation: string): Scout {
  const s = B.scouting.startingScout
  return {
    id: stateIds(state).next('s'), name: 'Dennis Hargreaves', quality: s.quality, experience: s.experience,
    regionKnowledge: [regionNation], divisions: [], weeklyWage: s.weeklyWage, reputation: 20, reportsDone: 0,
  }
}

export function scoutWages(state: GameState): number {
  return state.scouts.reduce((s, x) => s + x.weeklyWage, 0)
}

export function activeOps(state: GameState, scoutId?: Id): ScoutAssignment[] {
  return state.scoutOps.filter((o) => o.status === 'active' && (!scoutId || o.scoutId === scoutId))
}

export function reportCost(f: Fighter, depth: ScoutDepth, scout: Scout, today: number): number {
  const sc = B.scouting
  const vis = visibility(publicFacts(f, today))
  const level = sc.levelPriceMin + (vis / 100) * (sc.levelPriceMax - sc.levelPriceMin)
  const rate = sc.scoutRatePriceMin + (scout.quality / 100) * (sc.scoutRatePriceMax - sc.scoutRatePriceMin)
  return Math.round((sc.reportBase[depth] * level * rate) / 10) * 10
}

/** Typical measurement quality of a depth for this fighter/scout, as a ±points hint for the UI. */
export function expectedAccuracy(f: Fighter, depth: ScoutDepth, scout: Scout, today: number): number {
  return Math.round(observationSd(depth, 'power', scout, publicFacts(f, today)) * B.scouting.rangeZ * 10) / 10
}

interface Result { ok: boolean; error?: string; state: GameState }
const bad = (state: GameState, error: string): Result => ({ ok: false, error, state })

export function orderReport(input: GameState, fighterId: Id, depth: ScoutDepth, scoutId: Id): Result {
  const f = input.fighters[fighterId]
  const scout = input.scouts.find((s) => s.id === scoutId)
  if (!f) return bad(input, 'Unknown fighter.')
  if (!scout) return bad(input, 'Unknown scout.')
  if (f.status === 'retired') return bad(input, 'That fighter has retired.')
  if (activeOps(input, scoutId).length >= B.scouting.maxActivePerScout) return bad(input, `${scout.name} is already at full capacity.`)
  if (input.scoutOps.some((o) => o.status === 'active' && o.kind === 'report' && o.fighterId === fighterId)) return bad(input, 'A report on this fighter is already under way.')
  const cost = reportCost(f, depth, scout, input.today)
  if (!canAfford(input, cost)) return bad(input, `A ${DEPTH_LABEL[depth].toLowerCase()} costs £${cost.toLocaleString('en-GB')} — you can't afford it.`)

  const state = structuredClone(input)
  if (!isDiscovered(state, fighterId)) discover(state, fighterId, 'public')
  post(state, 'scouting', -cost, `${DEPTH_LABEL[depth]} — ${fighterName(f)}`)
  state.scoutOps.unshift({
    id: stateIds(state).next('op'), scoutId, kind: 'report', fighterId, depth,
    startDay: state.today, completeDay: state.today + B.scouting.reportWeeks[depth] * 7, cost, status: 'active',
  })
  trimOps(state)
  return { ok: true, state }
}

export interface SearchSpec { nation: string | null; weightClass: WeightClassId | null; level: 'regional' | 'wide' }

export function searchCost(level: SearchSpec['level']): number {
  return B.scouting.search[level].cost
}

export function orderSearch(input: GameState, spec: SearchSpec, scoutId: Id): Result {
  const scout = input.scouts.find((s) => s.id === scoutId)
  if (!scout) return bad(input, 'Unknown scout.')
  if (activeOps(input, scoutId).length >= B.scouting.maxActivePerScout) return bad(input, `${scout.name} is already at full capacity.`)
  const cfg = B.scouting.search[spec.level]
  if (!canAfford(input, cfg.cost)) return bad(input, `A talent search costs £${cfg.cost.toLocaleString('en-GB')} — you can't afford it.`)
  const state = structuredClone(input)
  const where = [spec.nation ? nation(spec.nation).name : 'anywhere', spec.weightClass ? weightClassLabel(spec.weightClass) : 'all divisions'].join(' · ')
  post(state, 'scouting', -cfg.cost, `Talent search (${spec.level}) — ${where}`)
  state.scoutOps.unshift({
    id: stateIds(state).next('op'), scoutId, kind: 'search', search: spec,
    startDay: state.today, completeDay: state.today + cfg.weeks * 7, cost: cfg.cost, status: 'active',
  })
  trimOps(state)
  return { ok: true, state }
}

function trimOps(state: GameState): void {
  const done = state.scoutOps.filter((o) => o.status === 'done')
  if (done.length > 30) {
    const drop = new Set(done.slice(30).map((o) => o.id))
    state.scoutOps = state.scoutOps.filter((o) => !drop.has(o.id))
  }
}

export function toggleShortlist(state: GameState, id: Id): GameState {
  if (!state.fighters[id]) return state
  const next = structuredClone(state)
  next.shortlist = next.shortlist.includes(id) ? next.shortlist.filter((x) => x !== id) : [...next.shortlist, id]
  return next
}

// ----------------------------------------------------------------- Tick

/** Complete finished assignments: update knowledge, post messages. */
export function processScouting(state: GameState, rng: Rng): void {
  for (const op of state.scoutOps) {
    if (op.status !== 'active' || op.completeDay > state.today) continue
    const scout = state.scouts.find((s) => s.id === op.scoutId)
    op.status = 'done'
    if (!scout) continue
    scout.reportsDone += 1
    scout.experience = Math.min(100, scout.experience + 1.2)
    scout.reputation = Math.min(100, scout.reputation + 0.5)

    if (op.kind === 'report') {
      const f = state.fighters[op.fighterId!]
      if (!f) continue
      applyReport(state, f, op.depth!, scout)
      op.summary = summarise(state, f)
      postMessage(state, {
        from: scout.name, category: 'fighter', priority: 'normal',
        subject: `Scout report ready: ${fighterName(f)}`,
        body: `${scout.name} has finished the ${DEPTH_LABEL[op.depth!].toLowerCase()} on ${fighterName(f)}. ${op.summary}`,
        link: { kind: 'fighter', id: f.id },
      })
    } else {
      completeSearch(state, op, scout, rng)
    }
  }
}

/** One-line headline built purely from the player's beliefs. */
export function summarise(state: GameState, f: Fighter): string {
  const traits = ['power', 'speed', 'stamina', 'chin', 'defence', 'ringIQ'] as const
  const names: Record<string, string> = { power: 'power', speed: 'speed', stamina: 'stamina', chin: 'chin', defence: 'defence', ringIQ: 'ring IQ' }
  const rated = traits.map((t) => ({ t, m: beliefOf(state, f, t).mean })).sort((a, b) => b.m - a.m)
  const best = rated[0]
  const worst = rated[rated.length - 1]
  return `Best read: ${names[best.t]} looks ${labelFor(best.m).toLowerCase()}. Concern: ${names[worst.t]} looks ${labelFor(worst.m).toLowerCase()}.`
}

function completeSearch(state: GameState, op: ScoutAssignment, scout: Scout, rng: Rng): void {
  const spec = op.search!
  const cfg = B.scouting.search[spec.level]
  const pool = Object.values(state.fighters).filter((f) =>
    f.status === 'active' && !isDiscovered(state, f.id) &&
    (!spec.nation || f.nationality === spec.nation) && (!spec.weightClass || f.weightClass === spec.weightClass))
  if (pool.length === 0) {
    op.summary = 'Nothing new turned up — the trail has gone cold in that area.'
    postMessage(state, { from: scout.name, category: 'world', priority: 'normal', subject: 'Talent search: no new names', body: op.summary, link: { kind: 'screen', screen: 'scouting' } })
    return
  }
  // A good scout's instincts are better: rank by a noisy read of potential.
  const acc = scoutAccuracy(scout)
  const ranked = pool
    .map((f) => ({ f, score: trueValue(f, 'potential') + keyedNormal(state.seed, 'search', op.id, f.id) * (22 / acc) + rng.float(0, 6) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.found)
  for (const r of ranked) discover(state, r.f.id, 'search')
  op.summary = `Found ${ranked.length}: ${ranked.map((r) => fighterName(r.f)).join(', ')}.`
  postMessage(state, {
    from: scout.name, category: 'fighter', priority: 'normal',
    subject: `Talent search complete — ${ranked.length} new fighters`,
    body: `${scout.name} came back from the trip with ${ranked.length} names for you: ${ranked.map((r) => `${fighterName(r.f)} (${r.f.hometown})`).join('; ')}. They are now on your scouting list.`,
    link: { kind: 'screen', screen: 'scouting' },
  })
}

/** Occasionally a notable undiscovered fighter comes to the player's attention for free. */
export function passiveDiscovery(state: GameState, rng: Rng): void {
  if (!rng.chance(B.scouting.passiveDiscoveryChance)) return
  const p = player(state)
  const candidates = Object.values(state.fighters).filter((f) => {
    if (f.status !== 'active' || isDiscovered(state, f.id)) return false
    const vis = visibility(publicFacts(f, state.today))
    return vis >= 15 && (f.nationality === p.homeCountry || vis >= 24)
  })
  if (candidates.length === 0) return
  const f = rng.pick(candidates)
  discover(state, f.id, 'tip')
  postMessage(state, {
    from: 'Scouting', category: 'world', priority: 'normal',
    subject: `Word on the circuit: ${fighterName(f)}`,
    body: `People in the gyms are talking about ${fighterName(f)} (${f.hometown}, ${f.record.wins}-${f.record.losses}-${f.record.draws}). You may want to take a look.`,
    link: { kind: 'fighter', id: f.id },
  })
}

export const NATION_OPTIONS = NATIONS.map((n) => ({ key: n.key, name: n.name }))
