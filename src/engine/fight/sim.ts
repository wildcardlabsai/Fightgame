/**
 * ROUND-BY-ROUND FIGHT SIMULATION
 * -------------------------------
 * Pure function of (two SimFighters, round count, an RNG). Each round has three one-minute segments.
 * Punch counts are sampled in bulk (never per-punch objects). Fight-state — damage, energy, momentum,
 * confidence, hurt, fouls — evolves round to round and drives knockdowns, stoppages and scoring.
 * Permanent attributes are inputs only; nothing here edits a fighter.
 */
import { BALANCE as B } from '../balance'
import type { Rng } from '../rng'
import type { FightMethod, RoundRec } from '../types'
import type { SimFighter } from './profile'
import { STYLES } from './styles'

const S = B.sim
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

export interface SimOutcome {
  winner: 0 | 1 | null
  method: FightMethod
  round: number
  second: number
  cards: [number, number][]
  kd: [number, number]
  tot: number[]
  deductions: [number, number]
  rounds: RoundRec[]
  /** Damage ratio (damage / capacity) at the end for [A, B] — drives injuries. */
  endDamage: [number, number]
  /** 0–1 output-based performance for [A, B]. */
  perf: [number, number]
  /** Round (0-based) where a fighter was knocked down at least once, for narrative. */
  kdRounds: number[]
}

interface FS {
  dmg: number; energy: number; conf: number; hurt: number; adapt: number
  kdSuffered: number; warnings: number; deduct: number
  t: number; l: number; pt: number; pl: number
}

function binom(rng: Rng, n: number, p: number): number {
  let k = 0
  for (let i = 0; i < n; i++) if (rng.next() < p) k++
  return k
}

/** Beat codes used for the compact round story (narrative.ts turns them into prose). */
export const BEAT = { EVEN: 0, DISTANCE: 1, BUSY: 2, COUNTERS: 3, HURT: 4, KNOCKDOWN: 5, DOMINATED: 6, SURVIVED: 7, FADING: 8, COMEBACK: 9 } as const

function capacity(f: SimFighter, st: FS): number {
  return (S.chinBase + S.chinScale * f.chin * (0.85 + 0.15 * f.hrt)) * (1 - 0.2 * (1 - st.energy))
}

export function simulateFight(a: SimFighter, b: SimFighter, rounds: number, rng: Rng, opts: { homeSide?: 0 | 1 | null; keepRounds?: boolean } = {}): SimOutcome {
  const fighters = [a, b]
  const st: FS[] = fighters.map((f) => ({ dmg: 0, energy: f.energy0, conf: f.conf0, hurt: 0, adapt: 0, kdSuffered: 0, warnings: 0, deduct: 0, t: 0, l: 0, pt: 0, pl: 0 }))
  const sty = fighters.map((f) => STYLES[f.style])
  // "Night form": everyone has good and bad nights — a per-fight random performance swing.
  const form = [rng.normal(0, S.nightFormSd), rng.normal(0, S.nightFormSd)]
  const judgeBias = [0, 1, 2].map(() => rng.normal(0, S.judgeVolumeBias))
  const judgeTotals: [number, number][] = [[0, 0], [0, 0], [0, 0]]
  const recs: RoundRec[] = []
  const kd: [number, number] = [0, 0] // knockdowns scored BY A, BY B
  const kdRounds: number[] = []
  let mom = 0 // positive = A on top
  let trailing: [number, number] = [0, 0] // cumulative round points lead for A, B (judge average proxy)
  let ended: { winner: 0 | 1; method: FightMethod; round: number; second: number } | null = null

  for (let r = 1; r <= rounds && !ended; r++) {
    const rd = { t: [0, 0, 0, 0, 0, 0, 0, 0], k: [0, 0] as [number, number], dmgDealt: [0, 0], dmgTaken: [0, 0], landed: [0, 0], sc: [0, 0] }
    let hurtThisRound = [0, 0]
    let kdInRound = [0, 0]
    const momStart = mom

    for (let seg = 0; seg < S.segments && !ended; seg++) {
      const vols = fighters.map((f, i) => {
        const aggr = 0.65 + 0.7 * f.agg
        return S.baseThrow * sty[i].vol * aggr * (0.5 + 0.5 * st[i].energy) * (0.85 + 0.3 * f.spd) * (1 + 0.12 * mom * (i === 0 ? 1 : -1)) * (1 - 0.25 * st[i].hurt)
      })
      const pace = 1 + 0.25 * (Math.max(sty[0].paceSetter, sty[1].paceSetter) - 0.4) * (vols[0] + vols[1] > 0 ? 1 : 0)
      const segLanded = [0, 0]
      const segDmg = [0, 0]
      const bigs = [0, 0]
      for (let i = 0; i < 2; i++) {
        const j = 1 - i
        const att = fighters[i], def = fighters[j]
        const aSt = st[i], dSt = st[j]
        const n = Math.max(3, Math.round(vols[i] * pace * (0.85 + 0.3 * rng.next())))
        const powShare = clamp(0.28 + 0.3 * att.pow + sty[i].powerShift + 0.1 * (att.agg - 0.5), 0.18, 0.72)
        const pt = clamp(Math.round(n * powShare + rng.normal(0, 1.2)), 0, n)
        const spdE = att.spd * (0.75 + 0.25 * aSt.energy) * (1 - 0.25 * aSt.hurt)
        const spdD = def.spd * (0.75 + 0.25 * dSt.energy) * (1 - 0.25 * dSt.hurt)
        const atk = 0.42 * spdE + 0.3 * att.iq + 0.14 * att.dis + 0.14 * clamp(aSt.adapt, 0, 0.5) * 2 + form[i]
        const dfn = (0.38 * def.def + 0.26 * spdD + 0.26 * def.iq + 0.1 * def.dis + 0.7 * form[j]) * (0.78 + 0.22 * dSt.energy) * (1 - 0.35 * dSt.hurt)
        const counter = sty[i].counter * 0.1 * clamp((vols[j] / S.baseThrow - 0.8) / 0.8, 0, 1)
        const chase = trailingFor(i, trailing) > 6 && r > 6 ? sty[i].chasePenalty : 0
        const reachEdge = clamp((att.reach - def.reach) / 100 * 0.25, -0.03, 0.03)
        let p = S.landBase + S.landSpread * (atk - dfn) + sty[i].land - sty[j].guard + (0.05 * mom * (i === 0 ? 1 : -1)) + counter + reachEdge - chase
        if (opts.homeSide === i) p += S.homeLandBonus
        p *= att.sharp
        p = clamp(p, 0.08, 0.6)
        const jl = binom(rng, n - pt, clamp(p * S.jabLandMult, 0.05, 0.7))
        const pp = clamp(p * S.powerLandMult, 0.05, 0.55)
        const pl = binom(rng, pt, pp)
        // damage
        const powEff = att.pow * (0.9 + 0.2 * aSt.conf) * (1 + form[i])
        const dmgPer = (S.powerDamageBase + S.powerDamageScale * powEff) * sty[i].dmgDealt * (1 + 0.15 * mom * (i === 0 ? 1 : -1)) * (0.92 + 0.16 * att.sharp)
        const takenMult = sty[j].dmgTaken * (1 + 0.35 * (1 - dSt.energy)) * (1 + 0.4 * dSt.hurt)
        const dealt = (jl * S.jabDamage + pl * dmgPer * (1 + counter * 3)) * takenMult
        dSt.dmg += dealt
        segDmg[i] = dealt
        segLanded[i] = jl + pl
        rd.t[i * 4] += n; rd.t[i * 4 + 1] += jl + pl; rd.t[i * 4 + 2] += pt; rd.t[i * 4 + 3] += pl
        rd.dmgDealt[i] += dealt; rd.dmgTaken[j] += dealt; rd.landed[i] += jl + pl
        aSt.t += n; aSt.l += jl + pl; aSt.pt += pt; aSt.pl += pl
        // stamina
        aSt.energy = clamp(aSt.energy - (n / S.baseThrow) * S.drainPerSegment * (0.7 + 0.5 * powShare) * (1.3 - 0.7 * att.sta) * sty[i].drain * (1 + 0.5 * Math.max(0, aSt.hurt)), 0.04, 1)
        // big shots
        const bigFrac = (S.bigFracBase + S.bigFracScale * powEff) * (1 + 0.8 * dSt.hurt) * (sty[i].dmgDealt)
        bigs[i] = binom(rng, pl, clamp(bigFrac, 0, 0.6))
      }
      // knockdown checks (at most one per segment per direction)
      for (let i = 0; i < 2 && !ended; i++) {
        const j = 1 - i
        const att = fighters[i], def = fighters[j]
        const dSt = st[j]
        const cap = capacity(def, dSt)
        const ratio = dSt.dmg / cap
        let knocked = false
        for (let k = 0; k < Math.min(2, bigs[i]) && !knocked; k++) {
          const z = S.kd.intercept + S.kd.dmg * ratio + S.kd.power * (att.pow - def.chin) + S.kd.fatigue * (1 - dSt.energy) + S.kd.hurt * dSt.hurt + S.kd.momentum * mom * (i === 0 ? 1 : -1)
          if (rng.next() < sigmoid(z)) knocked = true
        }
        if (knocked) {
          dSt.kdSuffered++
          kdInRound[j]++
          kd[i]++
          rd.k[i]++
          if (!kdRounds.includes(r - 1)) kdRounds.push(r - 1)
          dSt.dmg += S.kdDamageOfCapacity * cap
          dSt.hurt = 1
          dSt.conf = clamp(dSt.conf - 0.15, 0, 1)
          st[i].conf = clamp(st[i].conf + 0.06, 0, 1)
          mom = clamp(mom + (i === 0 ? 0.5 : -0.5), -1, 1)
          const r2 = dSt.dmg / cap
          const pRise = clamp(0.94 - 0.55 * r2 - 0.1 * (dSt.kdSuffered - 1) - 0.12 * (kdInRound[j] - 1) + 0.18 * (def.hrt - 0.5) + 0.12 * (def.com * (0.85 + 0.3 * dSt.conf) - 0.5), 0.04, 0.97)
          const secs = seg * 60 + rng.int(8, 55)
          if (kdInRound[j] >= 3) ended = { winner: i as 0 | 1, method: 'TKO', round: r, second: secs }
          else if (rng.next() > pRise) ended = { winner: i as 0 | 1, method: 'KO', round: r, second: secs }
        } else if (bigs[i] > 0 && rng.next() < 0.5) {
          dSt.hurt = Math.max(dSt.hurt, clamp(0.35 + 0.4 * ratio, 0, 0.9))
        }
      }
      // referee stoppage after the exchange
      for (let j = 0; j < 2 && !ended; j++) {
        const i = 1 - j
        const cap = capacity(fighters[j], st[j])
        const ratio = st[j].dmg / cap
        const unanswered = segLanded[i] / (segLanded[i] + segLanded[j] + 3)
        if ((ratio > 0.6 && (st[j].hurt > 0.3 || ratio > 0.85)) || ratio > 1.1) {
          const p = ratio > 1.1 ? 0.6 : clamp(0.55 * (ratio - 0.5) + 0.3 * st[j].hurt + 0.3 * (unanswered - 0.5) - 0.2 * (fighters[j].hrt - 0.5) - 0.1 * (fighters[j].com - 0.5), 0, 0.5)
          if (rng.next() < p) ended = { winner: i as 0 | 1, method: 'TKO', round: r, second: seg * 60 + rng.int(20, 59) }
        }
      }
      // momentum & composure update
      const net = (segDmg[0] - segDmg[1]) / 10 + (segLanded[0] - segLanded[1]) / 12
      mom = clamp(S.momentumInertia * mom + (1 - S.momentumInertia) * Math.tanh(net), -1, 1)
      for (let i = 0; i < 2; i++) {
        const gain = i === 0 ? mom : -mom
        st[i].conf = clamp(st[i].conf + 0.025 * gain, 0, 1)
        st[i].hurt = Math.max(0, st[i].hurt - (0.35 + 0.25 * fighters[i].com))
        hurtThisRound[i] = Math.max(hurtThisRound[i], st[i].hurt)
      }
    }

    // ----- end of round -----
    const rec = scoreRound(rd, fighters, st, mom, momStart, judgeBias, rng, opts.homeSide ?? null, kdInRound, hurtThisRound)
    // fouls
    for (let i = 0; i < 2; i++) {
      if (rng.next() < S.foulPerRound * (1.3 - fighters[i].dis) * (0.5 + fighters[i].agg)) {
        st[i].warnings++
        if (st[i].warnings >= 2 && st[i].warnings % 2 === 0) st[i].deduct++
      }
    }
    for (let j = 0; j < 3; j++) { judgeTotals[j][0] += rec.s[j * 2]; judgeTotals[j][1] += rec.s[j * 2 + 1] }
    trailing = [trailing[0] + (rec.s[0] - rec.s[1]), trailing[1] + (rec.s[1] - rec.s[0])]
    recs.push(rec)

    if (!ended) {
      // injury stoppage (cuts, hand injuries …)
      for (let i = 0; i < 2 && !ended; i++) {
        const cap = capacity(fighters[i], st[i])
        const share = clamp(rd.dmgTaken[i] / cap, 0, 0.5)
        if (rng.next() < (S.injuryStoppagePerRound + 0.02 * share) * (0.5 + fighters[i].injuryRisk)) ended = { winner: (1 - i) as 0 | 1, method: 'INJ', round: r, second: rng.int(30, 175) }
      }
    }
    if (!ended && r < rounds) {
      // corner decides whether to send them out for another round
      for (let i = 0; i < 2 && !ended; i++) {
        const cap = capacity(fighters[i], st[i])
        const ratio = st[i].dmg / cap
        const behind = trailingFor(i, trailing)
        if (r >= 3 && ratio > 0.5 && behind > 5) {
          const p = clamp(0.3 * (ratio - 0.45) + 0.012 * (behind - 5) - 0.2 * (fighters[i].hrt - 0.5), 0, 0.4)
          if (rng.next() < p) ended = { winner: (1 - i) as 0 | 1, method: 'RTD', round: r, second: 180 }
        }
      }
    }
    // recovery between rounds
    for (let i = 0; i < 2; i++) {
      st[i].energy = clamp(st[i].energy + S.recoverPerRound * (0.7 + 0.5 * fighters[i].sta) * fighters[i].recovery, 0.04, 1)
      st[i].dmg *= 1 - S.damageDecayPerRound * (0.6 + 0.8 * fighters[i].hrt) * fighters[i].recovery
      const adaptGain = S.adaptRate * fighters[i].ada * (0.5 + fighters[i].iq)
      st[i].adapt = clamp(st[i].adapt + adaptGain, 0, 0.5)
    }
  }

  const tot = [st[0].t, st[0].l, st[0].pt, st[0].pl, st[1].t, st[1].l, st[1].pt, st[1].pl]
  const endDamage: [number, number] = [st[0].dmg / capacity(a, st[0]), st[1].dmg / capacity(b, st[1])]
  const ded: [number, number] = [st[0].deduct, st[1].deduct]
  const perf = performance(st, kd, ended ? ended.winner : null)

  if (ended) {
    return { winner: ended.winner, method: ended.method, round: ended.round, second: ended.second, cards: [], kd, tot, deductions: ded, rounds: recs, endDamage, perf, kdRounds }
  }
  const cards: [number, number][] = judgeTotals.map((t) => [t[0] - ded[0], t[1] - ded[1]])
  const { winner, method } = decide(cards)
  return { winner, method, round: rounds, second: 180, cards, kd, tot, deductions: ded, rounds: recs, endDamage, perf, kdRounds }
}

function trailingFor(i: number, trailing: [number, number]): number {
  return -trailing[i] > 0 ? -trailing[i] : 0
}

function performance(st: FS[], kd: [number, number], winner: 0 | 1 | null): [number, number] {
  const landed = st[0].l + st[1].l || 1
  const out: [number, number] = [0, 0]
  for (let i = 0; i < 2; i++) {
    const j = 1 - i
    const share = st[i].l / landed
    const dmgShare = st[j].dmg / (st[0].dmg + st[1].dmg || 1)
    out[i] = clamp(0.45 * share + 0.35 * dmgShare + 0.1 * (kd[i] > 0 ? 1 : 0) - 0.08 * st[i].kdSuffered + (winner === i ? 0.12 : winner === j ? -0.05 : 0.03), 0, 1)
  }
  return out
}

/** Scorecards → result. Handles unanimous/majority/split decisions and the three kinds of draw. */
export function decide(cards: [number, number][]): { winner: 0 | 1 | null; method: FightMethod } {
  const votes = cards.map((c) => (c[0] > c[1] ? 0 : c[1] > c[0] ? 1 : 2))
  const a = votes.filter((v) => v === 0).length
  const b = votes.filter((v) => v === 1).length
  const d = votes.filter((v) => v === 2).length
  if (a === 3) return { winner: 0, method: 'UD' }
  if (b === 3) return { winner: 1, method: 'UD' }
  if (d === 3) return { winner: null, method: 'DRAW' }
  if (a === 2 && b === 1) return { winner: 0, method: 'SD' }
  if (b === 2 && a === 1) return { winner: 1, method: 'SD' }
  if (a === 2 && d === 1) return { winner: 0, method: 'MD' }
  if (b === 2 && d === 1) return { winner: 1, method: 'MD' }
  if (d === 2) return { winner: null, method: 'MDRAW' }
  if (a === 1 && b === 1 && d === 1) return { winner: null, method: 'SDRAW' }
  if (a === 1 && d === 2) return { winner: null, method: 'MDRAW' }
  return { winner: null, method: 'DRAW' }
}

function scoreRound(
  rd: { t: number[]; k: [number, number]; dmgDealt: number[]; dmgTaken: number[]; landed: number[] },
  f: SimFighter[], st: FS[], mom: number, momStart: number, bias: number[], rng: Rng, homeSide: 0 | 1 | null,
  kdInRound: number[], hurt: number[],
): RoundRec {
  const val = (i: number) => {
    const jab = rd.t[i * 4 + 1] - rd.t[i * 4 + 3]
    return jab * 1 + rd.t[i * 4 + 3] * 2.3 + rd.dmgDealt[i] * 0.5 + rd.k[i] * 14
  }
  const D = val(0) - val(1) + 2.5 * mom + (STYLES[f[0].style].judgeAppeal - STYLES[f[1].style].judgeAppeal) * 40
  const scores: number[] = []
  for (let j = 0; j < 3; j++) {
    let dj = D + bias[j] * (rd.t[0] - rd.t[4]) * 0.15 + rng.normal(0, S.judgeNoise)
    if (homeSide !== null) dj += (homeSide === 0 ? 1 : -1) * S.homeJudgeBias
    let a = 10, b = 10
    const abs = Math.abs(dj)
    if (abs >= S.evenRoundThreshold) {
      const winKd = dj > 0 ? rd.k[0] : rd.k[1]
      const loser = 10 - (winKd >= 3 || (winKd >= 2 && abs > 14) ? 3 : winKd >= 2 || (winKd >= 1 && abs > 6) || abs > 22 ? 2 : 1)
      if (dj > 0) b = loser; else a = loser
    }
    scores.push(a, b)
  }
  // story beat
  const side: 0 | 1 | 2 = Math.abs(D) < 2 ? 2 : D > 0 ? 0 : 1
  const winner: number = side === 2 ? -1 : side
  let beat: number = BEAT.EVEN
  if (winner >= 0) {
    const l = 1 - winner
    if (rd.k[winner as 0 | 1] > 0) beat = BEAT.KNOCKDOWN
    else if (Math.abs(D) > 18) beat = BEAT.DOMINATED
    else if (hurt[l] > 0.4) beat = BEAT.HURT
    else if (st[l].energy < 0.4 && st[winner].energy - st[l].energy > 0.15) beat = BEAT.FADING
    else if (Math.sign(momStart) === (winner === 0 ? -1 : 1) && Math.abs(momStart) > 0.25) beat = BEAT.COMEBACK
    else if (STYLES[f[winner].style].counter > 0.5 && rd.t[l * 4] > rd.t[winner * 4]) beat = BEAT.COUNTERS
    else if (rd.t[winner * 4] > rd.t[l * 4] * 1.25) beat = BEAT.BUSY
    else beat = BEAT.DISTANCE
  } else if (kdInRound[0] + kdInRound[1] > 0) beat = BEAT.SURVIVED
  const punish = (i: number) => Math.min(9, Math.round((rd.dmgTaken[i] / (S.chinBase + S.chinScale * f[i].chin)) * 40))
  return { t: rd.t.slice(), k: [rd.k[0], rd.k[1]], s: scores, b: [side, beat], p: [punish(0), punish(1)] }
}
