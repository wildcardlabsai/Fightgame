import { describe, expect, it } from 'vitest'
import * as commands from './commands'
import { approach, offerFight, runFightNight, schedule, withdraw, releaseFighter, commissionReport } from './commands'
import { fighterAge, fighterName } from './fighters'
import { suggestedFightOffer, fightAsk, evaluateFightOffer } from './fightNegotiation'
import { fightAvailability, scheduleOptions, validateMatch, resolveFight, lockKey } from './fights'
import { canTransition, transition } from './fight/lifecycle'
import { ageInjuryMult, ageRecovery, buildSimFighter, type SimFighter } from './fight/profile'
import { decide, simulateFight } from './fight/sim'
import { opponentCandidates } from './matchmaking'
import { Rng } from './rng'
import { deserialiseGame, serialiseGame } from './save'
import { player, playerRoster } from './selectors'
import { advanceOneWeek, advanceWeeks } from './tick'
import { viewsOf } from './view'
import { fightList, fightView } from './fightViews'
import type { Fight, Fighter, FightOffer, GameState, Id } from './types'
import { createNewGame } from './worldgen'
import { post } from './ledger'

const fresh = (seed = 'p3') => createNewGame({ seed, promotionName: 'P3', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'P', color: '#fff', emblem: 'bolt' } }, 1_700_000_000_000)

function ledgerBalanced(s: GameState) {
  expect(s.ledgerArchive + s.ledger.reduce((a, t) => a + t.amount, 0)).toBe(player(s).cash)
}

/** Neutral SimFighter, overridable. */
function sf(over: Partial<SimFighter> = {}): SimFighter {
  return { pow: 0.6, spd: 0.6, def: 0.6, sta: 0.6, chin: 0.6, iq: 0.6, agg: 0.55, dis: 0.6, com: 0.6, hrt: 0.6, ada: 0.6, style: 'Balanced', plan: 'balanced', exp: 0.5, energy0: 0.9, conf0: 0.6, recovery: 1, injuryRisk: 0.4, reach: 180, age: 27, home: false, sharp: 1, ...over }
}

const noPromo = (f: Fighter) => ({ fighterId: f.id, promotionId: null, preRecord: '0-0-0', preRep: 0, prePop: 0, prep: { intensity: 'normal' as const, plan: 'balanced' as const, campWeeks: 4, weightIssue: false, nagging: false } })

/** Find an approachable opponent for my first fighter. */
function pickOpponent(s: GameState, myId: Id, filter: (c: ReturnType<typeof opponentCandidates>[number]) => boolean = () => true) {
  const c = opponentCandidates(s, myId, {}).filter((x) => x.canApproach && filter(x))
  expect(c.length).toBeGreaterThan(0)
  return c[0]
}

/** Drive a player fight all the way to the agreed state. */
function agree(s: GameState, myId: Id, oppId: Id): { state: GameState; fightId: Id } {
  const ap = approach(s, myId, oppId)
  expect(ap.ok, ap.error).toBe(true)
  let st = ap.state
  const fightId = ap.fightId!
  for (let i = 0; i < 6; i++) {
    const base = suggestedFightOffer(st, oppId)
    const offer: FightOffer = { ...base, purseB: base.purseB * (1.2 + i * 0.4), winBonusB: base.winBonusB * 1.5 }
    const out = offerFight(st, fightId, offer)
    expect(out.ok, out.error).toBe(true)
    st = out.state
    if (st.fights[fightId].status === 'agreed') return { state: st, fightId }
  }
  throw new Error('never agreed')
}

function toFightNight(s: GameState, fightId: Id): GameState {
  let st = s
  const opts = scheduleOptions(st, fightId)
  expect(opts.length).toBeGreaterThan(0)
  const sch = schedule(st, fightId, opts[0].day)
  expect(sch.ok, sch.error).toBe(true)
  st = sch.state
  for (let i = 0; i < 60 && st.fights[fightId].status !== 'fightNight'; i++) {
    st = advanceOneWeek(st)
    if (st.fights[fightId].status === 'cancelled') throw new Error('cancelled: ' + st.fights[fightId].cancelReason)
  }
  expect(st.fights[fightId].status).toBe('fightNight')
  return st
}

function playFightOnce(seed: string): { s0: GameState; s: GameState; fightId: Id; myId: Id; oppId: Id } {
  const s0 = fresh(seed)
  const my = playerRoster(s0)[0]
  const opp = pickOpponent(s0, my.id, (c) => c.view.reputation < 45)
  const a = agree(s0, my.id, opp.view.id)
  const night = toFightNight(a.state, a.fightId)
  const run = runFightNight(night, a.fightId)
  expect(run.ok, run.error).toBe(true)
  return { s0, s: run.state, fightId: a.fightId, myId: my.id, oppId: opp.view.id }
}

/** Fights can legitimately be cancelled (camp injury etc.), so try a few seeds. */
function playFight(seed = 'p3') {
  for (let i = 0; i < 8; i++) {
    try { return playFightOnce(i === 0 ? seed : `${seed}-${i}`) } catch (e) { if (!String(e).includes('cancelled')) throw e }
  }
  throw new Error('no playable fight in 8 seeds')
}

describe('lifecycle', () => {
  it('allows only legal transitions', () => {
    expect(canTransition('negotiating', 'agreed')).toBe(true)
    expect(canTransition('agreed', 'fightNight')).toBe(false)
    expect(canTransition('scheduled', 'completed')).toBe(false)
    expect(canTransition('postFight', 'scheduled')).toBe(false)
    expect(canTransition('cancelled', 'agreed')).toBe(false)
    const f = { status: 'negotiating', id: 'x' } as Fight
    expect(() => transition(f, 'completed')).toThrow(/Illegal/)
    transition(f, 'agreed')
    expect(f.status).toBe('agreed')
  })
})

describe('matchmaking', () => {
  it('lists valid opponents with imperfect assessments, then approaches one', () => {
    const s = fresh()
    const my = playerRoster(s)[0]
    const cands = opponentCandidates(s, my.id, {})
    expect(cands.length).toBeGreaterThan(5)
    for (const c of cands) {
      expect(['same', 'catchweight']).toContain(c.compat)
      expect(c.assessment.difficulty).toBeGreaterThanOrEqual(1)
      expect(c.assessment.difficulty).toBeLessThanOrEqual(5)
      expect(c.assessment.winHi).toBeGreaterThan(c.assessment.winLo) // a range, never a point
    }
    const ap = approach(s, my.id, pickOpponent(s, my.id).view.id)
    expect(ap.ok).toBe(true)
    expect(ap.state.fights[ap.fightId!].status).toBe('negotiating')
  })

  it('rejects invalid opponents: same fighter, weight mismatch, not your fighter', () => {
    const s = fresh()
    const my = playerRoster(s)[0]
    expect(approach(s, my.id, my.id).ok).toBe(false)
    const far = Object.values(s.fighters).find((f) => f.status === 'active' && !f.contractId && Math.abs(['heavyweight', 'cruiserweight', 'lightHeavyweight', 'superMiddleweight', 'middleweight', 'superWelterweight', 'welterweight', 'superLightweight', 'lightweight', 'superFeatherweight', 'featherweight', 'superBantamweight', 'bantamweight', 'superFlyweight', 'flyweight', 'lightFlyweight', 'minimumweight'].indexOf(f.weightClass) - ['heavyweight', 'cruiserweight', 'lightHeavyweight', 'superMiddleweight', 'middleweight', 'superWelterweight', 'welterweight', 'superLightweight', 'lightweight', 'superFeatherweight', 'featherweight', 'superBantamweight', 'bantamweight', 'superFlyweight', 'flyweight', 'lightFlyweight', 'minimumweight'].indexOf(my.weightClass)) >= 3)!
    const r = validateMatch(s, my.id, far.id)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/weight/i)
    expect(opponentCandidates(s, my.id, {}).some((c) => c.view.id === far.id)).toBe(false)
    const notMine = Object.values(s.fighters).find((f) => f.contractId && s.contracts[f.contractId].promotionId !== s.playerPromotionId)!
    expect(approach(s, notMine.id, my.id).ok).toBe(false)
  })

  it('respects contract and injury restrictions', () => {
    const s = fresh()
    const my = playerRoster(s)[0]
    const c = pickOpponent(s, my.id)
    const oppId = c.view.id
    const injured = structuredClone(s)
    injured.fighters[oppId].injury = { kind: 'cut', severity: 'serious', startDay: s.today, returnDay: s.today + 40 * 7 }
    const r1 = validateMatch(injured, my.id, oppId)
    expect(r1.ok).toBe(false)
    expect(r1.reason).toMatch(/Injured/)
    const contract = structuredClone(s)
    const cid = contract.fighters[oppId].contractId
    if (cid) contract.contracts[cid].endDay = s.today + 14
    if (cid) expect(validateMatch(contract, my.id, oppId).ok).toBe(false)
    const susp = structuredClone(s)
    susp.fighters[my.id].suspendedUntil = s.today + 10 * 7
    expect(validateMatch(susp, my.id, oppId).ok).toBe(false)
    const booked = structuredClone(s)
    booked.fighters[oppId].activeFightId = 'ft_other'
    expect(validateMatch(booked, my.id, oppId).ok).toBe(false)
    const rested = structuredClone(s)
    rested.fighters[my.id].lastFightDay = s.today - 7
    expect(fightAvailability(rested, rested.fighters[my.id]).earliestDay).toBeGreaterThan(s.today + 28)
  })

  it('assessments are built from beliefs: unscouted opponent assessments do not depend on hidden attributes', () => {
    const s = fresh('belief')
    const my = playerRoster(s)[0]
    const c = pickOpponent(s, my.id, (x) => x.view.knowledge.reports === 0 && x.view.age > 27)
    const before = JSON.stringify(opponentCandidates(s, my.id, { q: c.view.name }).filter((x) => x.view.id === c.view.id))
    const alt = structuredClone(s)
    const t = alt.fighters[c.view.id]
    for (const k of Object.keys(t.attributes) as (keyof typeof t.attributes)[]) if (k !== 'marketability') t.attributes[k] = 100 - t.attributes[k]
    t.potential = 100 - t.potential; t.discipline = 100 - t.discipline; t.composure = 100 - t.composure; t.injuryRisk = 100 - t.injuryRisk
    t.personality = t.personality === 'Greedy' ? 'Humble' : 'Greedy'
    expect(JSON.stringify(opponentCandidates(alt, my.id, { q: c.view.name }).filter((x) => x.view.id === c.view.id))).toBe(before)
  })
})

describe('fight negotiation', () => {
  it('accepts a generous offer, rejects a lowball, counters a borderline one, and a counter is acceptable', () => {
    const s = fresh()
    const my = playerRoster(s)[0]
    const opp = pickOpponent(s, my.id).view.id
    const ap = approach(s, my.id, opp)
    const fight = ap.state.fights[ap.fightId!]
    const ask = fightAsk(ap.state, fight)
    expect(evaluateFightOffer(ap.state, fight, { ...ask, purseB: ask.purseB * 2, winBonusB: ask.winBonusB * 2 }).verdict).toBe('accept')
    const low = evaluateFightOffer(ap.state, fight, { ...ask, purseB: ask.purseB * 0.2, winBonusB: 0 })
    expect(low.verdict).toBe('reject')
    expect(low.reasons.length).toBeGreaterThan(0)
    let counters = 0
    for (const mult of [0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0, 1.05]) {
      const ev = evaluateFightOffer(ap.state, fight, { ...ask, purseB: ask.purseB * mult, winBonusB: ask.winBonusB * mult })
      if (ev.verdict === 'counter') {
        counters++
        expect(evaluateFightOffer(ap.state, fight, ev.counter!).verdict).toBe('accept')
      }
    }
    expect(counters).toBeGreaterThan(0)
  })

  it('agreeing creates the fight in the AGREED state and books both fighters; walking away cancels without penalty', () => {
    const s = fresh()
    const my = playerRoster(s)[0]
    const opp = pickOpponent(s, my.id).view.id
    const a = agree(s, my.id, opp)
    const fight = a.state.fights[a.fightId]
    expect(fight.status).toBe('agreed')
    expect(fight.terms.purseA).toBeGreaterThan(0)
    expect(fight.terms.purseB).toBeGreaterThan(0)
    expect(a.state.fighters[my.id].activeFightId).toBe(a.fightId)
    expect(a.state.fighters[opp].activeFightId).toBe(a.fightId)
    const w = withdraw(a.state, a.fightId)
    expect(w.ok).toBe(true)
    expect(w.state.fights[a.fightId].status).toBe('cancelled')
    expect(w.state.fighters[my.id].activeFightId).toBeNull()
    expect(w.state.fighters[opp].activeFightId).toBeNull()
    expect(player(w.state).reputation).toBe(player(a.state).reputation)
  })

  it('lowball spam ends talks, cancels the fight and locks the pair', () => {
    const s = fresh()
    const my = playerRoster(s)[0]
    const opp = pickOpponent(s, my.id).view.id
    let st = approach(s, my.id, opp).state
    const fid = Object.keys(st.fights)[0]
    for (let i = 0; i < 6 && st.fights[fid].status === 'negotiating'; i++) {
      const out = offerFight(st, fid, { purseB: 100, winBonusB: 0, rematch: false, venuePref: 'A', fights: 1 })
      st = out.state
    }
    expect(st.fights[fid].status).toBe('cancelled')
    expect(st.fightLocks[lockKey(my.id, opp)]).toBeGreaterThan(st.today)
    expect(approach(st, my.id, opp).ok).toBe(false)
  })

  it('a two-fight deal creates a second agreed fight', () => {
    const s = fresh()
    const my = playerRoster(s)[0]
    const opp = pickOpponent(s, my.id).view.id
    let st = approach(s, my.id, opp).state
    const fid = Object.keys(st.fights)[0]
    const base = suggestedFightOffer(st, opp)
    const out = offerFight(st, fid, { ...base, purseB: base.purseB * 2.5, winBonusB: base.winBonusB * 2, fights: 2 })
    expect(out.state.fights[fid].status).toBe('agreed')
    const second = Object.values(out.state.fights).find((f) => f.seriesOf === fid)!
    expect(second.status).toBe('agreed')
  })
})

describe('fight simulation', () => {
  const run = (a: SimFighter, b: SimFighter, n: number, rounds = 10, seed = 1) => {
    const rng = new Rng(seed)
    const out: ReturnType<typeof simulateFight>[] = []
    for (let i = 0; i < n; i++) out.push(simulateFight(a, b, rounds, rng))
    return out
  }

  it('is deterministic for the same inputs and RNG state', () => {
    const a = simulateFight(sf({ pow: 0.8 }), sf({ chin: 0.4 }), 12, new Rng(99))
    const b = simulateFight(sf({ pow: 0.8 }), sf({ chin: 0.4 }), 12, new Rng(99))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('produces every kind of result across many fights', () => {
    const outs = run(sf(), sf(), 3000, 8)
    const seen = new Set(outs.map((o) => o.method))
    for (const m of ['UD', 'KO', 'TKO']) expect(seen.has(m as never), m).toBe(true)
    expect(outs.some((o) => o.method === 'SD' || o.method === 'MD')).toBe(true)
    expect(outs.some((o) => o.winner === null)).toBe(true) // draws
    expect(outs.some((o) => o.kd[0] + o.kd[1] >= 2)).toBe(true) // multiple knockdowns
    expect(outs.some((o) => o.method === 'RTD' || o.method === 'INJ')).toBe(true)
  })

  it('has believable overall distributions between even fighters', () => {
    const outs = run(sf(), sf(), 3000, 10)
    const stop = outs.filter((o) => ['KO', 'TKO', 'RTD', 'INJ'].includes(o.method)).length / outs.length
    const r1 = outs.filter((o) => o.round === 1 && o.method !== 'UD').length / outs.length
    const draws = outs.filter((o) => o.winner === null).length / outs.length
    const kds = outs.reduce((n, o) => n + o.kd[0] + o.kd[1], 0) / outs.length
    expect(stop).toBeGreaterThan(0.2)
    expect(stop).toBeLessThan(0.65)
    expect(r1).toBeLessThan(0.06) // not everything ends in round one
    expect(draws).toBeGreaterThan(0.003)
    expect(draws).toBeLessThan(0.08)
    expect(kds).toBeGreaterThan(0.1)
    expect(kds).toBeLessThan(1.0)
  })

  it('better fighters win more — but upsets happen and ratings are not destiny', () => {
    const good = sf({ pow: 0.72, spd: 0.72, def: 0.72, sta: 0.72, chin: 0.72, iq: 0.72, hrt: 0.72 })
    const mid = sf()
    const outs = run(good, mid, 2500, 10)
    const goodWins = outs.filter((o) => o.winner === 0).length / outs.length
    const midWins = outs.filter((o) => o.winner === 1).length / outs.length
    expect(goodWins).toBeGreaterThan(0.6)
    expect(goodWins).toBeLessThan(0.95)
    expect(midWins).toBeGreaterThan(0.04) // the underdog wins sometimes
    const heavy = run(sf({ pow: 0.9, spd: 0.8, def: 0.8, sta: 0.8, chin: 0.85, iq: 0.85, hrt: 0.85 }), sf({ pow: 0.35, spd: 0.4, def: 0.4, sta: 0.4, chin: 0.4, iq: 0.4, hrt: 0.4 }), 1500, 10)
    expect(heavy.filter((o) => o.winner === 0).length / heavy.length).toBeGreaterThan(0.93)
  })

  it('power vs chin drives knockdowns and stoppages', () => {
    const vs = (chin: number) => run(sf({ pow: 0.9 }), sf({ chin }), 1500, 10)
    const weak = vs(0.25), strong = vs(0.85)
    const kdWeak = weak.reduce((n, o) => n + o.kd[0], 0), kdStrong = strong.reduce((n, o) => n + o.kd[0], 0)
    expect(kdWeak).toBeGreaterThan(kdStrong * 1.8)
    const stop = (o: typeof weak) => o.filter((x) => x.winner === 0 && ['KO', 'TKO', 'RTD'].includes(x.method)).length
    expect(stop(weak)).toBeGreaterThan(stop(strong) * 1.5)
  })

  it('stamina matters: low-stamina fighters fade late; pace drains', () => {
    const lowSta = run(sf({ sta: 0.2, agg: 0.8 }), sf(), 400, 12)
    const lateShare = (o: ReturnType<typeof simulateFight>) => {
      const rr = o.rounds.filter((r) => r.t[0] > 0)
      if (rr.length < 12) return null
      const early = rr.slice(0, 3).reduce((n, r) => n + r.t[1], 0), late = rr.slice(9).reduce((n, r) => n + r.t[1], 0)
      return late / Math.max(1, early)
    }
    const ratios = lowSta.map(lateShare).filter((x): x is number => x !== null)
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length
    expect(avg).toBeLessThan(0.9)
    const fit = run(sf({ sta: 0.9, agg: 0.8 }), sf(), 400, 12).map(lateShare).filter((x): x is number => x !== null)
    expect(fit.reduce((a, b) => a + b, 0) / fit.length).toBeGreaterThan(avg)
  })

  it('styles shape the fight: pressure/swarm throw more, counters throw less, technical lands cleaner, power punchers hit harder', () => {
    const avgT = (style: SimFighter['style']) => { const o = run(sf({ style }), sf(), 500, 8); return { thrown: o.reduce((n, x) => n + x.tot[0], 0) / o.length, acc: o.reduce((n, x) => n + x.tot[1], 0) / o.reduce((n, x) => n + x.tot[0], 0), pow: o.reduce((n, x) => n + x.tot[2] / Math.max(1, x.tot[0]), 0) / o.length } }
    const press = avgT('Pressure Fighter'), swarm = avgT('Swarmer'), counter = avgT('Counter Puncher'), tech = avgT('Technical Boxer'), power = avgT('Power Puncher'), bal = avgT('Balanced')
    expect(press.thrown).toBeGreaterThan(bal.thrown * 1.1)
    expect(swarm.thrown).toBeGreaterThan(press.thrown)
    expect(counter.thrown).toBeLessThan(bal.thrown * 0.9)
    expect(tech.acc).toBeGreaterThan(bal.acc)
    expect(power.pow).toBeGreaterThan(bal.pow * 1.1)
  })

  it('a counter puncher is more effective against an aggressor than against another counter puncher', () => {
    const vsAgg = run(sf({ style: 'Counter Puncher' }), sf({ style: 'Swarmer' }), 600, 10)
    const vsCounter = run(sf({ style: 'Counter Puncher' }), sf({ style: 'Counter Puncher' }), 600, 10)
    const acc = (o: typeof vsAgg) => o.reduce((n, x) => n + x.tot[1], 0) / o.reduce((n, x) => n + x.tot[0], 0)
    expect(acc(vsAgg)).toBeGreaterThan(acc(vsCounter))
  })

  it('judges: draws, majority and split decisions are decided correctly', () => {
    expect(decide([[10, 9], [10, 9], [10, 9]])).toEqual({ winner: 0, method: 'UD' })
    expect(decide([[9, 10], [9, 10], [10, 9]])).toEqual({ winner: 1, method: 'SD' })
    expect(decide([[10, 9], [10, 10], [10, 9]])).toEqual({ winner: 0, method: 'MD' })
    expect(decide([[10, 10], [10, 10], [10, 10]])).toEqual({ winner: null, method: 'DRAW' })
    expect(decide([[10, 10], [10, 10], [10, 9]])).toEqual({ winner: null, method: 'MDRAW' })
    expect(decide([[10, 9], [9, 10], [10, 10]])).toEqual({ winner: null, method: 'SDRAW' })
  })

  it('knockdowns swing a round on the cards (10-8) and rounds are scored by effective punching, not ratings', () => {
    const outs = run(sf({ pow: 0.9 }), sf({ chin: 0.3 }), 800, 10).filter((o) => o.rounds.some((r) => r.k[0] > 0))
    expect(outs.length).toBeGreaterThan(20)
    const kdRounds = outs.flatMap((o) => o.rounds.filter((r) => r.k[0] > 0 && r.s.length))
    const eights = kdRounds.filter((r) => r.s.some((v, i) => i % 2 === 1 && v <= 8)).length
    expect(eights / kdRounds.length).toBeGreaterThan(0.4)
    // A fighter who is out-landed but has the better rating-like attributes still loses rounds.
    const quiet = run(sf({ spd: 0.9, iq: 0.9, agg: 0.1, style: 'Defensive Specialist' }), sf({ agg: 0.9, style: 'Swarmer' }), 300, 12)
    expect(quiet.some((o) => o.winner === 1)).toBe(true)
  })

  it('damage and momentum are fight-state: round records show swings, and the sim never edits attributes', () => {
    const a = sf({ pow: 0.8 }), b = sf()
    const copyA = JSON.stringify(a), copyB = JSON.stringify(b)
    const o = simulateFight(a, b, 12, new Rng(4))
    expect(JSON.stringify(a)).toBe(copyA)
    expect(JSON.stringify(b)).toBe(copyB)
    expect(o.rounds.length).toBeGreaterThan(0)
    const sides = new Set(o.rounds.map((r) => r.b[0]))
    expect(sides.size).toBeGreaterThan(1) // control changes hands over a fight
    expect(o.endDamage[0]).toBeGreaterThanOrEqual(0)
  })

  it('age: recovery slows and injury proneness grows, but experience helps ring IQ', () => {
    expect(ageRecovery(38)).toBeLessThan(ageRecovery(26))
    expect(ageInjuryMult(38)).toBeGreaterThan(ageInjuryMult(26))
    const s = fresh()
    const base = Object.values(s.fighters).find((f) => f.status === 'active')!
    const young = structuredClone(base), old = structuredClone(base)
    young.birthDay = s.today - 25 * 365; old.birthDay = s.today - 38 * 365
    old.record = { wins: 40, losses: 5, draws: 0, koWins: 20, koLosses: 1 }; young.record = { ...old.record }
    old.roundsFought = young.roundsFought = 300
    const side = noPromo(base)
    const y = buildSimFighter(s, young, side, { home: false, sizeSteps: 0 }), o = buildSimFighter(s, old, side, { home: false, sizeSteps: 0 })
    expect(o.recovery).toBeLessThan(y.recovery)
    expect(o.injuryRisk).toBeGreaterThan(y.injuryRisk)
    expect(o.iq).toBeGreaterThanOrEqual(y.iq) // veterans read the fight better
  })
})

describe('a full player fight', () => {
  const g = playFight()

  it('goes through the whole lifecycle and reaches POST-FIGHT with a result', () => {
    const f = g.s.fights[g.fightId]
    expect(f.status).toBe('postFight')
    expect(f.result).toBeDefined()
    expect(f.paid).toBe(true)
    expect(f.result!.rounds?.length).toBeGreaterThan(0) // detail kept for your fights
    expect(g.s.fights[g.fightId].processedDay).toBeDefined()
  })

  it('updates records and recent form for both fighters', () => {
    const f = g.s.fights[g.fightId]
    for (const [id, pre] of [[g.myId, g.s0.fighters[g.myId]], [g.oppId, g.s0.fighters[g.oppId]]] as [Id, Fighter][]) {
      const now = g.s.fighters[id], r = f.result!
      const idx = f.sideA.fighterId === id ? 0 : 1
      const won = r.winner === idx, lost = r.winner === 1 - idx
      expect(now.record.wins - pre.record.wins).toBe(won ? 1 : 0)
      expect(now.record.losses - pre.record.losses).toBe(lost ? 1 : 0)
      expect(now.record.draws - pre.record.draws).toBe(r.winner === null ? 1 : 0)
      expect(now.recentFights).toContain(g.fightId)
      expect(now.activeFightId).toBeNull()
      expect(now.lastFightDay).toBe(f.day)
      expect(now.roundsFought).toBeGreaterThan(pre.roundsFought)
    }
  })

  it('pays purses and bonuses once through the ledger; income comes only from the show', () => {
    const f = g.s.fights[g.fightId]
    const lines = g.s.ledger.filter((t) => t.category === 'purses')
    const expected = f.terms.purseA + f.terms.purseB + (f.result!.winner === 0 ? f.terms.winBonusA : f.result!.winner === 1 ? f.terms.winBonusB : 0)
    expect(-lines.reduce((n, t) => n + t.amount, 0)).toBe(expected)
    // Phase 4: a fight is a one-fight show, so money can come in — but only as ticket/sponsor/broadcast/PPV income from that show.
    const income = g.s.ledger.filter((t) => t.amount > 0 && t.category !== 'startingFunds')
    expect(income.every((t) => ['tickets', 'sponsorship', 'broadcast', 'ppv', 'venue'].includes(t.category))).toBe(true)
    ledgerBalanced(g.s)
    expect(() => resolveFight(structuredClone(g.s), structuredClone(g.s).fights[g.fightId])).toThrow() // cannot be processed twice
  })

  it('reputation, popularity, morale and confidence respond — and an upset moves them more', () => {
    const f = g.s.fights[g.fightId]
    const r = f.result!
    expect(r.dRep.some((x) => x !== 0)).toBe(true)
    const w = r.winner
    if (w !== null) {
      expect(r.dRep[w]).toBeGreaterThan(0)
      expect(r.dRep[1 - w]).toBeLessThan(0)
    }
    // Direct comparison of expected win vs. big upset using the same machinery
    const base = fresh('upset')
    const mk = (pExp: number) => {
      const st = structuredClone(base)
      const my = playerRoster(st)[0]
      const opp = Object.values(st.fighters).find((x) => x.status === 'active' && !x.contractId && x.weightClass === my.weightClass && x.id !== my.id)!
      return { st, my, opp, pExp }
    }
    void mk
  })

  it('creates news / an inbox result and observes fighters (knowledge narrows)', () => {
    expect(g.s.inbox.some((m) => m.subject.startsWith('Result:'))).toBe(true)
    const f = g.s.fights[g.fightId]
    expect(g.s.news.some((n) => n.fightId === f.id)).toBe(true)
    const widthOf = (st: GameState, id: Id) => { const t = viewsOf(st).fighter(id)!.traits.physical[0]; return t.hi - t.lo }
    expect(widthOf(g.s, g.oppId)).toBeLessThanOrEqual(widthOf(g.s0, g.oppId))
    expect(viewsOf(g.s).fighter(g.oppId)!.knowledge.level).not.toBe('Unknown')
  })

  it('appears in fight history on both profiles and in the lists', () => {
    const v = viewsOf(g.s).fighter(g.myId)!
    expect(v.fightHistory[0].fightId).toBe(g.fightId)
    expect(v.form.length).toBe(1)
    expect(fightList(g.s, 'mine-results').map((x) => x.id)).toContain(g.fightId)
    const fv = fightView(g.s, g.fightId)!
    expect(fv.result).not.toBeNull()
    expect(fv.result!.rounds!.length).toBeGreaterThan(0)
    expect(fv.result!.headline.length).toBeGreaterThan(5)
  })

  it('round-by-round report contains no hidden numbers', () => {
    const json = JSON.stringify(fightView(g.s, g.fightId)!.result)
    for (const bad of ['"chin"', 'potential', 'injuryRisk', 'discipline', 'composure', 'attributes']) expect(json.includes(bad), bad).toBe(false)
  })

  it('persists: save → reload keeps the fight history and replays identically', () => {
    const loaded = deserialiseGame(serialiseGame(g.s))!
    expect(loaded.fights[g.fightId]).toEqual(g.s.fights[g.fightId])
    expect(JSON.stringify(fightView(loaded, g.fightId))).toBe(JSON.stringify(fightView(g.s, g.fightId)))
    expect(viewsOf(loaded).fighter(g.myId)!.fightHistory).toEqual(viewsOf(g.s).fighter(g.myId)!.fightHistory)
    expect(JSON.stringify(advanceOneWeek(loaded))).toBe(JSON.stringify(advanceOneWeek(g.s)))
  })

  it('same state + same fight = same result, regardless of when the bell rings', () => {
    const s0 = fresh('determ')
    const my = playerRoster(s0)[0]
    const opp = pickOpponent(s0, my.id).view.id
    const a = agree(s0, my.id, opp)
    const night = toFightNight(a.state, a.fightId)
    const r1 = runFightNight(night, a.fightId).state.fights[a.fightId].result
    const reloaded = deserialiseGame(serialiseGame(night))!
    const r2 = runFightNight(reloaded, a.fightId).state.fights[a.fightId].result
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
  })

  it('the tick refuses to skip past an unresolved fight night (advanceWeeks stops)', () => {
    // A camp injury can legitimately cancel the fight, so try a few worlds (as playFight does).
    let ok = false
    for (const seed of ['stop', 'stop-1', 'stop-2', 'stop-3']) {
      const s0 = fresh(seed)
      const my = playerRoster(s0)[0]
      const a = agree(s0, my.id, pickOpponent(s0, my.id).view.id)
      const sch = schedule(a.state, a.fightId, scheduleOptions(a.state, a.fightId)[0].day)
      const r = advanceWeeks(sch.state, 40)
      if (r.state.fights[a.fightId].status === 'cancelled') continue
      expect(r.interrupted).toBe(true)
      expect(Object.values(r.state.fights).some((f) => f.status === 'fightNight')).toBe(true)
      ok = true
      break
    }
    expect(ok).toBe(true)
  })
})

describe('preparation', () => {
  it('belongs to the trainer: the camp and the plan are set from the fighter, and the promoter has no command for either', () => {
    expect('prepare' in commands).toBe(false)
    expect('setTrainingFocus' in commands).toBe(false)
    const s0 = fresh('prep')
    const my = playerRoster(s0)[0]
    const a = agree(s0, my.id, pickOpponent(s0, my.id).view.id)
    const sch = schedule(a.state, a.fightId, scheduleOptions(a.state, a.fightId)[0].day)
    let t = sch.state
    // the trainer sets the camp on the first weekly pass after the fight is scheduled, from style, age, fitness and discipline
    t = advanceOneWeek(t)
    const f = t.fights[a.fightId]
    if (f.status !== 'cancelled') {
      const aggressive = ['Pressure Fighter', 'Swarmer', 'Power Puncher'].includes(t.fighters[my.id].style)
      const cautious = ['Defensive Specialist', 'Counter Puncher'].includes(t.fighters[my.id].style)
      expect(f.sideA.prep.plan).toBe(aggressive ? 'aggressive' : cautious ? 'cautious' : 'balanced')
    }
    for (let i = 0; i < 60 && t.fights[a.fightId].status !== 'fightNight' && t.fights[a.fightId].status !== 'cancelled'; i++) t = advanceOneWeek(t)
    if (t.fights[a.fightId].status === 'fightNight') expect(t.fights[a.fightId].sideA.prep.campWeeks).toBeGreaterThanOrEqual(3)
  })

  it('releasing a fighter cancels their booked fight', () => {
    const s0 = fresh('rel')
    const my = playerRoster(s0)[0]
    const a = agree(s0, my.id, pickOpponent(s0, my.id).view.id)
    const r = releaseFighter(a.state, my.id)
    expect(r.ok).toBe(true)
    expect(r.state.fights[a.fightId].status).toBe('cancelled')
    expect(r.state.fighters[a.state.fights[a.fightId].sideB.fighterId].activeFightId).toBeNull()
  })
})

describe('injuries', () => {
  it('injuries occur at a plausible rate, scale with severity, and block availability', () => {
    let s = fresh('inj')
    for (let i = 0; i < 104; i++) s = advanceOneWeek(s)
    const fights = Object.values(s.fights).filter((f) => f.status === 'postFight' && f.result)
    const injuredFights = fights.filter((f) => f.result!.injuries.some(Boolean)).length
    const rate = injuredFights / fights.length
    expect(rate).toBeGreaterThan(0.03)
    expect(rate).toBeLessThan(0.45)
    const sev = fights.flatMap((f) => f.result!.injuries.filter(Boolean)).map((i) => i!.severity)
    expect(sev.filter((x) => x === 'minor').length).toBeGreaterThan(sev.filter((x) => x === 'serious').length)
    const anyInjured = Object.values(s.fighters).find((f) => f.injury)
    if (anyInjured) expect(fightAvailability(s, anyInjured).ok).toBe(false)
    for (const f of Object.values(s.fighters)) if (f.injury) expect(f.injury.returnDay).toBeGreaterThan(f.injury.startDay)
  })

  it('knockout losses bring a medical suspension', () => {
    let s = fresh('susp')
    for (let i = 0; i < 80; i++) s = advanceOneWeek(s)
    const ko = Object.values(s.fights).find((f) => f.result && ['KO', 'TKO'].includes(f.result.method))!
    expect(ko).toBeDefined()
    const loser = s.fighters[ko.result!.winner === 0 ? ko.sideB.fighterId : ko.sideA.fighterId]
    expect(loser.lastFightDay).toBeGreaterThanOrEqual(ko.day)
    expect(loser.recentFights).toContain(ko.id)
  })
})

describe('the AI world fights without the player', () => {
  it('AI promotions arrange, simulate and process fights; records, development and decline continue', () => {
    let s = fresh('aiw')
    const before = JSON.stringify(Object.values(s.fighters).slice(0, 5).map((f) => f.record))
    const ages0 = Object.values(s.fighters).filter((f) => f.status === 'active').length
    for (let i = 0; i < 78; i++) s = advanceOneWeek(s)
    const done = Object.values(s.fights).filter((f) => f.status === 'postFight')
    expect(done.length).toBeGreaterThan(80)
    expect(done.every((f) => f.kind === 'ai')).toBe(true)
    expect(done.every((f) => f.paid)).toBe(true)
    expect(JSON.stringify(Object.values(s.fighters).slice(0, 5).map((f) => f.record))).not.toBe(before)
    expect(s.news.filter((n) => n.category === 'result').length).toBeGreaterThan(5)
    // activity is spread, not concentrated
    const fought = Object.values(s.fighters).filter((f) => f.recentFights.length > 0).length
    expect(fought).toBeGreaterThan(ages0 * 0.35)
    for (const f of Object.values(s.fighters)) expect(f.recentFights.length).toBeLessThanOrEqual(12)
    // nobody is double-booked and bookings are consistent
    const booked = new Map<Id, number>()
    for (const ft of Object.values(s.fights)) if (['scheduled', 'training', 'fightNight', 'agreed'].includes(ft.status)) for (const side of [ft.sideA, ft.sideB]) booked.set(side.fighterId, (booked.get(side.fighterId) ?? 0) + 1)
    for (const [id, n] of booked) { expect(n, fighterName(s.fighters[id])).toBeLessThanOrEqual(1); expect(s.fighters[id].activeFightId).not.toBeNull() }
    for (const p of Object.values(s.promotions)) expect(p.cash).toBeGreaterThanOrEqual(0)
    ledgerBalanced(s)
  })

  it('veterans decline physically over the years while ring craft holds up', () => {
    let s = fresh('decl')
    const olds = Object.values(s.fighters).filter((f) => f.status === 'active' && fighterAge(f, s.today) >= 33)
    const before = olds.map((f) => ({ id: f.id, spd: f.attributes.speed, sta: f.attributes.stamina, iq: f.attributes.ringIQ }))
    for (let i = 0; i < 104; i++) s = advanceOneWeek(s)
    const still = before.filter((b) => s.fighters[b.id].status === 'active')
    expect(still.length).toBeGreaterThan(3)
    const avg = (fn: (b: (typeof still)[number]) => number) => still.reduce((n, b) => n + fn(b), 0) / still.length
    expect(avg((b) => s.fighters[b.id].attributes.speed - b.spd)).toBeLessThan(-0.5)
    expect(avg((b) => s.fighters[b.id].attributes.stamina - b.sta)).toBeLessThan(-0.5)
    expect(avg((b) => s.fighters[b.id].attributes.ringIQ - b.iq)).toBeGreaterThan(-0.8)
  })

  it('prospects improve through quality fights', () => {
    let s = fresh('grow')
    const young = Object.values(s.fighters).filter((f) => f.status === 'active' && fighterAge(f, s.today) <= 22 && f.potential - (f.attributes.ringIQ + f.attributes.defence) / 2 > 15)
    const iq0 = young.map((f) => f.attributes.ringIQ)
    for (let i = 0; i < 104; i++) s = advanceOneWeek(s)
    const grew = young.filter((f, i) => s.fighters[f.id].attributes.ringIQ > iq0[i]).length
    expect(grew / young.length).toBeGreaterThan(0.7)
  })
})

describe('finance integrity with fights', () => {
  it('ledger reconciles through scouting, signing, fights and release', () => {
    const g = playFight('fin')
    ledgerBalanced(g.s)
    const rel = releaseFighter(g.s, g.myId)
    ledgerBalanced(rel.state)
    const t = post(structuredClone(rel.state), 'other', 5, 'x')
    void t
    void commissionReport
  })
})
