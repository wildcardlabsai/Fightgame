/**
 * CHALLENGER ASSESSMENT. Is this fighter a credible challenger for this body's belt? Being rated is not enough, and neither is a good
 * record on its own. After the experience floor, the case is weighed from PUBLIC facts only: the record, who they have fought (the
 * opponents' standing at the time), results in the last bouts, wins over credible opponents, where they stand on this body's list and
 * which way they are moving, how recently they fought and their stage of career. The weights and bars are data (`CONTENDER_CONFIG`).
 *
 * The numeric score stays inside the engine: views get a tier and, when the fighter is not yet a contender, one concrete next step.
 * A fighter the board has ordered (mandatory, or an eliminator winner) is handled by the callers: this module never overrides an order.
 */
import { weeksBetween } from '../calendar'
import { fighterAge } from '../fighters'
import { getList } from '../media/records'
import type { MediaState } from '../media/types'
import type { Fighter, GameState, Id } from '../types'
import { CONTENDER_CONFIG, CONTENDER_WEIGHTS, TITLE_DEFS, TITLE_DEF_BY_ID, experienceGap } from './titleDefs'

export type Tier = 'notEligible' | 'building' | 'contender'
export interface Assessment {
  tier: Tier
  /** Internal only (champion's decision, tests). Never put it in a view. */
  score: number
  /** One concrete next step in plain words, or null for a contender. */
  step: string | null
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
const cache = new WeakMap<MediaState, { day: number; m: Map<string, Assessment> }>()

interface Bout { win: boolean | null; oppRep: number }
/** The last eight resolved bouts, seen from the fighter: the result and the opponent's reputation WHEN THEY MET (public). */
function bouts(state: GameState, f: Fighter, n = 8): Bout[] {
  const out: Bout[] = []
  for (let i = f.recentFights.length - 1; i >= 0 && out.length < n; i--) {
    const ft = state.fights[f.recentFights[i]]
    if (!ft?.result) continue
    const isA = ft.sideA.fighterId === f.id
    const w = ft.result.winner
    out.push({ win: w === null ? null : (w === 0) === isA, oppRep: isA ? ft.sideB.preRep : ft.sideA.preRep })
  }
  return out
}

export function assessChallenger(state: GameState, body: string, id: Id): Assessment {
  const media = state.media
  const f = state.fighters[id]
  const d = TITLE_DEF_BY_ID[body]
  if (!media || !f || !d) return { tier: 'notEligible', score: 0, step: 'Not available.' }
  let c = cache.get(media)
  if (!c || c.day !== state.today) { c = { day: state.today, m: new Map() }; cache.set(media, c) }
  const key = `${body}|${id}`
  const hit = c.m.get(key)
  if (hit) return hit
  const out = compute(state, media, f, body)
  c.m.set(key, out)
  return out
}

function compute(state: GameState, media: MediaState, f: Fighter, body: string): Assessment {
  const d = TITLE_DEF_BY_ID[body]
  const cfg = CONFIG(d.level)
  const gap = experienceGap(d.level, f.record)
  if (gap) return { tier: 'notEligible', score: 0, step: gap }

  const n = f.record.wins + f.record.losses + f.record.draws
  const list = bouts(state, f)
  // experience: 40 at the floor, 100 at twice the floor
  const experience = clamp(40 + (60 * (n - cfg.floor.fights)) / Math.max(1, cfg.floor.fights), 40, 100)
  // record: win share shrunk toward 50% for small samples
  const record = clamp(100 * Math.pow((f.record.wins + 2) / (n + 4), 1.6), 0, 100)
  // opposition: who they have been in with; wins over better names count most, losses to good opposition are forgiven
  let opposition = 40
  if (list.length) {
    let s = 0, w = 0
    for (const b of list) { const k = b.win === true ? 1.2 : b.win === null ? 0.8 : 0.55; s += b.oppRep * k; w += k }
    opposition = clamp(50 + (s / w - cfg.credibleRep) * 2.4, 0, 100)
  }
  const credible = list.filter((b) => b.win === true && b.oppRep >= cfg.credibleRep).length
  const credibleWins = clamp(45 * credible, 0, 100)
  // form: the last five results
  const last5 = list.slice(0, 5)
  const form = clamp(50 + 14 * (last5.filter((b) => b.win === true).length - last5.filter((b) => b.win === false).length), 0, 100)
  // ranking and movement: a contender's standing is a matter of the LEVEL (a fighter rated #2 by one world body and #9 by another is a world
  // contender), so the best placing among this level's lists counts, with that list's movement.
  let entry: { r: number; p: number | null } | undefined
  for (const o of TITLE_DEFS) {
    if (o.level !== d.level) continue
    const e = getList(media, o.id, f.weightClass)?.e.find((x) => x.f === f.id)
    if (e && e.r >= 1 && (!entry || e.r < entry.r)) entry = e
  }
  const r = entry ? entry.r : null
  let ranking = r === null ? 20 : r <= d.challengerLimit ? 100 - ((r - 1) / d.challengerLimit) * 35 : Math.max(10, 40 - (r - d.challengerLimit) * 5)
  if (entry && entry.p !== null && entry.p >= 1) ranking = clamp(ranking + clamp((entry.p - entry.r) * 3, -12, 12), 0, 100)
  // activity: fought in the last 30 weeks is fine; a long layoff costs
  const idle = f.lastFightDay === null ? 80 : weeksBetween(f.lastFightDay, state.today)
  const activity = idle <= 30 ? 100 : idle >= 80 ? 10 : 100 - ((idle - 30) / 50) * 90
  // stage of career
  const age = fighterAge(f, state.today)
  const stage = age <= 30 ? 100 : age <= 35 ? 85 : age <= 38 ? 60 : 35

  const parts = { experience, record, opposition, credibleWins, form, ranking, activity, stage }
  const W = CONTENDER_WEIGHTS
  const score = (Object.keys(parts) as (keyof typeof parts)[]).reduce((t, k) => t + W[k] * parts[k], 0)
  const share = f.record.wins / Math.max(1, n)
  if (share < cfg.minShare) return { tier: 'building', score, step: 'Needs a better record' }
  if (score >= cfg.bar && credible >= cfg.credibleWins) return { tier: 'contender', score, step: null }

  // The next credible step is the part of the case that is holding the fighter back most.
  const lacking: [number, string][] = [
    [W.opposition * (100 - opposition), 'Needs stronger opposition'],
    [W.credibleWins * (100 - credibleWins) + (credible < cfg.credibleWins ? 25 : 0), 'Needs a win over a credible contender'],
    [W.form * (100 - form), 'Needs a stronger recent run'],
    [W.ranking * (100 - ranking), 'Needs to climb the rankings'],
    [W.activity * (100 - activity), 'Needs to fight more often'],
    [W.experience * (100 - experience), 'Needs more professional experience'],
    [W.record * (100 - record), 'Needs a better record'],
    [W.stage * (100 - stage), 'Time is against them at this level'],
  ]
  lacking.sort((a, b) => b[0] - a[0])
  return { tier: 'building', score, step: lacking[0][1] }
}

const CONFIG = (level: keyof typeof CONTENDER_CONFIG) => CONTENDER_CONFIG[level]
