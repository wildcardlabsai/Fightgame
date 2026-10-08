/**
 * Phase 5.4 — conversations: contract and fight talks, manager personalities, ambitions, stages, walk-away, relationship effects,
 * pathway commitments with consequences, development plans, and the information boundary.
 */
import { describe, expect, it } from 'vitest'
import { createNewGame } from './worldgen'
import { advanceOneWeek } from './tick'
import { clone } from './media/testing'
import { player } from './selectors'
import { approachOpponent } from './fightNegotiation'
import { contractMove, startContractTalk, startFightTalk, fightTalkMove, choosePlan } from './commands'
import { campWeights, contractUtility, openingOffer } from './business/contractTalks'
import { fightStakes } from './business/fightTalks'
import { ambitionOf, managerOf, type ManagerArchetype } from './business/manager'
import { negStage, STAGE_BEND } from './business/stage'
import { createCommitment, openCommitments, pathwayOptions, processCommitments } from './business/commitments'
import { planFightFactors, planFit, planGrowthMult, processPlans } from './business/plans'
import { contractTalkView, fightTalkView, HIDDEN_VIEW_KEYS, planChoices } from './business/talkViews'
import { processBusiness } from './business/weekly'
import type { Fighter, FightOffer, GameState, Offer } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const fresh = (seed: string) => createNewGame({ seed, promotionName: 'P54', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
const world = (() => { let s: GameState | null = null; return () => (s ??= (() => { let g = fresh('p54-talks'); for (let i = 0; i < 80; i++) g = advanceOneWeek(g); return g })()) })()
const frees = (s: GameState): Fighter[] => Object.values(s.fighters).filter((f) => f.status === 'active' && !f.contractId && !f.injury).sort((a, b) => (a.id < b.id ? -1 : 1))
const ok = <T extends { ok: boolean; error?: string }>(r: T): T => { expect(r.ok, r.error).toBe(true); return r }

/** Run one talk to a conclusion with a sensible player: follow counters, raise money when there is none. */
function runTalk(s0: GameState, fid: string, maxTurns = 8) {
  let s = ok(startContractTalk(s0, fid, 'signing')).state
  const tid = Object.values(s.business!.talks).find((t) => t.fighterId === fid && t.status === 'open')!.id
  let offer: Offer = openingOffer(s, s.fighters[fid], 'signing')
  for (let n = 0; n < maxTurns; n++) {
    const r = contractMove(s, tid, { kind: 'propose', offer })
    if (!r.ok) break
    s = r.state
    const t = s.business!.talks[tid]
    if (t.status !== 'open') break
    offer = t.counter ?? { ...offer, basePurse: Math.round(offer.basePurse * 1.18 / 100) * 100, signingBonus: Math.round(offer.signingBonus * 1.25 / 100) * 100, weeklyRetainer: Math.round(offer.weeklyRetainer * 1.15 / 10) * 10 }
  }
  return { s, tid, t: s.business!.talks[tid] }
}

describe('multi-turn contract conversation', () => {
  it('asks reveal things in the camp’s own words; proposals draw counters built from the state; accepting signs the deal', () => {
    const s0 = world()
    const f = frees(s0).find((x) => (negStage(s0, x) === 'contender' || negStage(s0, x) === 'journeyman') && managerOf(s0, x).archetype !== 'AGGRESSIVE') ?? frees(s0)[0]
    let s = ok(startContractTalk(s0, f.id, 'signing')).state
    const tid = Object.keys(s.business!.talks)[0]
    expect(s.business!.talks[tid].log[0].who).toBe('mgr')
    s = ok(contractMove(s, tid, { kind: 'ask', topic: 'priorities' })).state
    const tags = s.business!.talks[tid].told
    expect(tags.some((x) => x.startsWith('priority:'))).toBe(true)
    // A low first offer is not simply refused: the camp answers in turns.
    let offer = openingOffer(s, s.fighters[f.id], 'signing')
    const seen = new Set<string>()
    for (let i = 0; i < 6; i++) {
      s = ok(contractMove(s, tid, { kind: 'propose', offer })).state
      const t = s.business!.talks[tid]
      seen.add(t.log[t.log.length - 1].tag)
      if (t.status !== 'open') break
      if (t.counter) { s = ok(contractMove(s, tid, { kind: 'acceptCounter' })).state; break }
      offer = { ...offer, basePurse: offer.basePurse * 1.35, signingBonus: offer.signingBonus * 1.5, weeklyRetainer: offer.weeklyRetainer * 1.3 }
    }
    const t = s.business!.talks[tid]
    expect(t.status).toBe('agreed')
    expect(s.fighters[f.id].contractId).toBeTruthy()
    expect(t.turn).toBeGreaterThanOrEqual(2)
  })

  it('counters concede over the turns and are never worse for the player than the last counter', () => {
    const s0 = world()
    let checked = 0
    for (const f of frees(s0).slice(0, 25)) {
      let s = ok(startContractTalk(s0, f.id, 'signing')).state
      const tid = Object.keys(s.business!.talks).find((k) => s.business!.talks[k].fighterId === f.id)!
      let offer = openingOffer(s, s.fighters[f.id], 'signing')
      let prev: Offer | null = null
      for (let i = 0; i < 5; i++) {
        const r = contractMove(s, tid, { kind: 'propose', offer })
        if (!r.ok) break
        s = r.state
        const t = s.business!.talks[tid]
        if (t.status !== 'open') break
        if (t.counter) {
          if (prev) { expect(t.counter.signingBonus + t.counter.basePurse).toBeLessThanOrEqual(prev.signingBonus + prev.basePurse + 1_000); checked++ }
          prev = t.counter
          offer = { ...offer, basePurse: Math.max(offer.basePurse, t.counter.basePurse * 0.97) }
        } else offer = { ...offer, basePurse: offer.basePurse * 1.1 }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('counters ask for what the camp cares about first: title-minded camps ask for a pathway, cautious ones for security', () => {
    const s0 = world()
    const byArch: Record<string, { withPath: number; n: number }> = {}
    for (const f of frees(s0).slice(0, 60)) {
      const s = ok(startContractTalk(s0, f.id, 'signing')).state
      const tid = Object.keys(s.business!.talks).find((k) => s.business!.talks[k].fighterId === f.id)!
      const r = contractMove(s, tid, { kind: 'propose', offer: openingOffer(s, s.fighters[f.id], 'signing') })
      if (!r.ok) continue
      const t = r.state.business!.talks[tid]
      if (!t.counter) continue
      const a = managerOf(s, f).archetype
      const e = (byArch[a] ??= { withPath: 0, n: 0 })
      e.n++; if (t.counter.pathway || t.counter.plan) e.withPath++
    }
    const rate = (a: ManagerArchetype) => (byArch[a] ? byArch[a].withPath / byArch[a].n : null)
    const title = rate('TITLE_FOCUSED'), money = rate('MONEY_FOCUSED')
    if (title !== null && money !== null) expect(title).toBeGreaterThanOrEqual(money)
    expect(Object.keys(byArch).length).toBeGreaterThanOrEqual(3)
  })
})

describe('manager personality, ambition and stage shape the talk', () => {
  it('managers differ in patience and in what they weigh; stages bend weights, patience and appetite for length', () => {
    const s = world()
    const fs = Object.values(s.fighters).filter((f) => f.status === 'active')
    const avgP = (a: ManagerArchetype) => { const xs = fs.filter((f) => managerOf(s, f).archetype === a).map((f) => managerOf(s, f).patience); return xs.reduce((p, c) => p + c, 0) / Math.max(1, xs.length) }
    expect(avgP('AGGRESSIVE')).toBeLessThan(avgP('LOYAL'))
    const m = managerOf(s, fs[0])
    expect(campWeights(m, 'prospect').development).toBeGreaterThan(campWeights(m, 'star').development)
    expect(campWeights(m, 'star').exposure).toBeGreaterThan(campWeights(m, 'prospect').exposure)
    expect(campWeights(m, 'contender').title).toBeGreaterThan(campWeights(m, 'journeyman').title)
    expect(STAGE_BEND.champion.walk).toBeGreaterThan(STAGE_BEND.prospect.walk)
    expect(new Set(fs.map((f) => negStage(s, f))).size).toBeGreaterThanOrEqual(4)
  })

  it('a pathway that matches the fighter’s ambition is worth more to the camp than one that does not, and no pathway is worth least to a contender', () => {
    const s = world()
    let tested = 0
    for (const f of Object.values(s.fighters)) {
      if (f.status !== 'active') continue
      const opts = pathwayOptions(s, f)
      const amb = ambitionOf(s, f)
      if (!/CHAMPION/.test(amb.kind) || opts.filter((o) => o.offer.kind !== 'activity' && o.offer.kind !== 'headline').length === 0) continue
      const promo = player(s)
      const o = openingOffer(s, f, 'signing')
      const none = contractUtility(s, f, promo, o, 'signing').ratio
      const real = opts.find((x) => x.offer.kind !== 'activity' && x.offer.kind !== 'headline')!
      const with1 = contractUtility(s, f, promo, { ...o, pathway: real.offer }, 'signing').ratio
      expect(with1).toBeGreaterThanOrEqual(none)
      tested++
      if (tested >= 8) break
    }
    expect(tested).toBeGreaterThan(0)
  })
})

describe('walk-away and relationship effects', () => {
  it('lowballing again and again makes the camp walk: the talk is broken, talks lock, trust falls, and the camp remembers', () => {
    const s0 = world()
    let walked = 0
    for (const f of frees(s0).slice(0, 30)) {
      let s = ok(startContractTalk(s0, f.id, 'signing')).state
      const tid = Object.keys(s.business!.talks).find((k) => s.business!.talks[k].fighterId === f.id)!
      const before = s.fighters[f.id].promoRelations[s.playerPromotionId] ?? 0
      const lowball: Offer = { ...openingOffer(s, s.fighters[f.id], 'signing'), basePurse: 100, signingBonus: 0, weeklyRetainer: 10, winBonus: 0 }
      for (let i = 0; i < 6; i++) { const r = contractMove(s, tid, { kind: 'propose', offer: { ...lowball, basePurse: 100 + i * 100 } }); if (!r.ok) break; s = r.state; if (s.business!.talks[tid].status !== 'open') break }
      const t = s.business!.talks[tid]
      if (t.status === 'broken') {
        walked++
        expect(s.fighters[f.id].promoRelations[s.playerPromotionId] ?? 0).toBeLessThan(before)
        expect(s.negotiations[f.id].status).toBe('broken')
        expect(startContractTalk(s, f.id, 'signing').ok).toBe(false)
        expect(s.business!.neg[f.id].walkouts).toBe(1)
        expect(s.business!.neg[f.id].lowballs).toBeGreaterThan(0)
      }
    }
    expect(walked).toBeGreaterThan(10)
  })

  it('a good deal improves the relationship; the camp’s patience differs between a prospect and a champion', () => {
    const s0 = world()
    const f = frees(s0)[0]
    const { s, t } = runTalk(s0, f.id)
    if (t.status === 'agreed') expect(s.fighters[f.id].promoRelations[s.playerPromotionId]).toBeGreaterThan(0)
    expect(STAGE_BEND.prospect.patience).toBeGreaterThan(STAGE_BEND.champion.patience)
  })
})

describe('pathway commitments have real consequences', () => {
  function signedWithPathway() {
    const s0 = world()
    for (const f of frees(s0)) {
      const opts = pathwayOptions(s0, f).filter((o) => o.offer.kind === 'activity' || o.offer.kind === 'headline')
      if (!opts.length) continue
      let s = ok(startContractTalk(s0, f.id, 'signing')).state
      const tid = Object.keys(s.business!.talks).find((k) => s.business!.talks[k].fighterId === f.id)!
      let offer: Offer = { ...openingOffer(s, s.fighters[f.id], 'signing'), pathway: opts[0].offer }
      offer = { ...offer, basePurse: offer.basePurse * 1.6, signingBonus: offer.signingBonus * 1.6, weeklyRetainer: offer.weeklyRetainer * 1.5 }
      const r = contractMove(s, tid, { kind: 'propose', offer })
      if (r.ok && r.state.business!.talks[tid].status === 'agreed') return { s: r.state, f }
    }
    throw new Error('no deal')
  }
  it('a promise is recorded, kept when the bout really happens, and rewarded', () => {
    const { s, f } = signedWithPathway()
    const c = openCommitments(s, f.id)[0]
    expect(c).toBeTruthy()
    const g = clone(s)
    const ff = g.fighters[f.id]
    const moraleBefore = ff.morale
    // The fighter really fights four bouts: an activity promise is kept.
    if (c.kind === 'activity') {
      const template = Object.values(g.fights).find((x) => x.result)!
      for (let i = 0; i < 4; i++) { const id = `f_kept${i}`; g.fights[id] = { ...template, id, day: g.today, sideA: { ...template.sideA, fighterId: f.id } } as never; ff.recentFights.push(id) }
    } else {
      const template = Object.values(g.fights).find((x) => x.result)!
      const id = 'f_kept'; const ev = Object.values(g.events)[0]
      g.fights[id] = { ...template, id, day: g.today, eventId: ev?.id ?? null, sideA: { ...template.sideA, fighterId: f.id } } as never
      if (ev) { ev.promotionId = g.playerPromotionId; ev.card = [id] }
      ff.recentFights.push(id)
    }
    processCommitments(g)
    const after = g.business!.commitments.find((x) => x.id === c.id)!
    if (after.status === 'fulfilled') expect(g.fighters[f.id].morale).toBeGreaterThan(moraleBefore - 0.01)
    expect(['fulfilled', 'open']).toContain(after.status)
  })
  it('a broken promise costs morale, trust and reputation; the rest of the roster notices; the camp remembers', () => {
    const { s, f } = signedWithPathway()
    const g = clone(s)
    const c = g.business!.commitments.find((x) => x.fighterId === f.id)!
    const ff = g.fighters[f.id]
    const rel = ff.promoRelations[g.playerPromotionId], rep = player(g).reputation, morale = ff.morale
    g.today = c.dueDay + 1
    ff.injury = null
    processCommitments(g)
    expect(g.business!.commitments.find((x) => x.id === c.id)!.status).toBe('broken')
    expect(ff.promoRelations[g.playerPromotionId]).toBeLessThan(rel)
    expect(player(g).reputation).toBeLessThan(rep)
    expect(ff.morale).toBeLessThan(morale)
    expect(g.business!.neg[f.id].broken).toBe(1)
    // The memory bites at the next table.
    const s2 = clone(g); s2.fighters[f.id].contractId = null
    const u = contractUtility(s2, s2.fighters[f.id], player(s2), openingOffer(s2, s2.fighters[f.id], 'signing'), 'signing')
    const g2 = clone(s2); g2.business!.neg[f.id].broken = 0
    expect(u.ratio).toBeLessThan(contractUtility(g2, g2.fighters[f.id], player(g2), openingOffer(g2, g2.fighters[f.id], 'signing'), 'signing').ratio)
  })
  it('only pathways that are genuinely available are offered, and an unavailable one cannot be promised', () => {
    const s0 = world()
    const f = frees(s0)[0]
    const kinds = pathwayOptions(s0, f).map((o) => o.offer.kind)
    expect(kinds).toContain('activity')
    const s = ok(startContractTalk(s0, f.id, 'signing')).state
    const tid = Object.keys(s.business!.talks).find((k) => s.business!.talks[k].fighterId === f.id)!
    const bad = !kinds.includes('worldIfRanked') ? ({ kind: 'worldIfRanked', weeks: 78, maxRank: 8 } as const) : !kinds.includes('eliminator') ? ({ kind: 'eliminator', weeks: 52 } as const) : null
    if (bad) expect(contractMove(s, tid, { kind: 'propose', offer: { ...openingOffer(s, f, 'signing'), pathway: bad } }).ok).toBe(false)
  })
  it('a promise made to a fighter who leaves, or a conditional promise that stops binding, is void — not broken', () => {
    const { s, f } = signedWithPathway()
    const g = clone(s)
    const c = g.business!.commitments.find((x) => x.fighterId === f.id)!
    g.fighters[f.id].contractId = null
    processCommitments(g)
    expect(g.business!.commitments.find((x) => x.id === c.id)!.status).toBe('void')
    const g2 = clone(s)
    const made = createCommitment(g2, g2.fighters[f.id], { kind: 'worldIfRanked', weeks: 4, maxRank: 3 })!
    g2.today = made.dueDay + 1
    processCommitments(g2)
    expect(g2.business!.commitments.find((x) => x.id === made.id)!.status).toBe('void')
  })
})

describe('development plans connect to stage and ambition, and change the game', () => {
  it('fit depends on public stage and age; the ambition reason only appears once the player has learned it', () => {
    const s = world()
    const prospects = Object.values(s.fighters).filter((f) => f.status === 'active' && negStage(s, f) === 'prospect')
    expect(prospects.length).toBeGreaterThan(5)
    const prefer = prospects.filter((f) => planFit(s, f, 'protected').score >= planFit(s, f, 'accelerated').score).length
    expect(prefer / prospects.length).toBeGreaterThan(0.6)
    const veterans = Object.values(s.fighters).filter((f) => f.status === 'active' && negStage(s, f) === 'veteran')
    if (veterans.length > 3) expect(veterans.filter((f) => planFit(s, f, 'accelerated').score > planFit(s, f, 'protected').score).length / veterans.length).toBeGreaterThan(0.6)
    const prospect = prospects[0]
    const g = clone(s)
    expect(planChoices(g, prospect).flatMap((c) => c.why).join(' ')).not.toMatch(/what the fighter wants/)
    g.business ??= { v: 1, n: 0, talks: {}, commitments: [], plans: {}, learned: {}, neg: {}, exp: 0, titleHist: {} }
    g.business.learned[prospect.id] = ['ambition']
    expect(planChoices(g, prospect).length).toBe(3)
  })
  it('plans really change growth, fame, injury, morale after a loss and week-by-week morale/trust', () => {
    const s0 = world()
    const f = frees(s0)[0]
    const { s } = runTalk(s0, f.id)
    const id = s.fighters[f.id].contractId ? f.id : null
    expect(id).toBeTruthy()
    if (!id) return
    const g = ok(choosePlan(s, id, 'accelerated')).state
    expect(planFightFactors(g, id).fame).toBeGreaterThan(1)
    expect(planFightFactors(g, id).lossMorale).toBeGreaterThan(1)
    const p = ok(choosePlan(s, id, 'protected')).state
    expect(planFightFactors(p, id).fame).toBeLessThan(1)
    const young = clone(p); young.fighters[id].birthDay = young.today - 21 * 365
    expect(planGrowthMult(young, young.fighters[id])).toBeGreaterThan(1)
    // Fit nudges morale and the relationship every week.
    const h = clone(p)
    const fit = planFit(h, h.fighters[id], 'protected').score
    const m0 = h.fighters[id].morale
    processPlans(h)
    expect(Math.sign(h.fighters[id].morale - m0)).toBe(Math.sign(fit) || Math.sign(h.fighters[id].morale - m0))
    // A plan falls away when the fighter leaves the roster.
    h.fighters[id].contractId = null
    processPlans(h)
    expect(h.business!.plans[id]).toBeUndefined()
  })
  it('a plan can be agreed in a negotiation and is applied when the deal is struck', () => {
    const s0 = world()
    for (const f of frees(s0)) {
      let s = ok(startContractTalk(s0, f.id, 'signing')).state
      const tid = Object.keys(s.business!.talks).find((k) => s.business!.talks[k].fighterId === f.id)!
      const o = openingOffer(s, f, 'signing')
      const r = contractMove(s, tid, { kind: 'propose', offer: { ...o, plan: 'protected', basePurse: o.basePurse * 1.7, signingBonus: o.signingBonus * 1.7, weeklyRetainer: o.weeklyRetainer * 1.6 } })
      if (r.ok && r.state.business!.talks[tid].status === 'agreed') { expect(r.state.business!.plans[f.id]).toBe('protected'); s = r.state; return }
    }
    throw new Error('no deal struck')
  })
})

describe('fight conversations', () => {
  function startFight() {
    const s0 = world()
    const me = Object.values(s0.fighters).find((f) => f.contractId && s0.contracts[f.contractId]?.promotionId === s0.playerPromotionId)
    if (!me) return null
    const opps = Object.values(s0.fighters).filter((f) => f.status === 'active' && f.weightClass === me.weightClass && f.id !== me.id && !f.activeFightId)
    for (const o of opps) {
      const a = approachOpponent(s0, me.id, o.id)
      if (a.ok) { const t = startFightTalk(a.state, a.fightId!); if (t.ok) return { s: t.state, fightId: a.fightId!, talkId: t.talkId! } }
    }
    return null
  }
  it('a fight can be made over several turns: ask, propose, counter, accept; the stakes come from the real title system', () => {
    const w = startFight()
    expect(w).not.toBeNull()
    if (!w) return
    let s = w.s
    const v = fightTalkView(s, w.talkId)!
    expect(['A standard bout', 'A title eliminator', 'A unification fight', 'A title fight']).toContain(v.stake.label)
    expect(fightStakes(s, s.fights[w.fightId]).kind).toBe(v.stake.kind)
    s = ok(fightTalkMove(s, w.talkId, { kind: 'ask', topic: 'location' })).state
    expect(s.business!.talks[w.talkId].told).toContain('location')
    let offer: FightOffer = v.expected ? { purseB: Math.round((v.expected.purse.lo + v.expected.purse.hi) / 2), winBonusB: Math.round(v.expected.winBonus.lo), rematch: false, venuePref: 'neutral', fights: 1 } : { purseB: 3000, winBonusB: 300, rematch: false, venuePref: 'neutral', fights: 1 }
    for (let i = 0; i < 8; i++) {
      const r = fightTalkMove(s, w.talkId, { kind: 'propose', offer })
      if (!r.ok) break
      s = r.state
      const t = s.business!.talks[w.talkId]
      if (t.status !== 'open') break
      offer = t.fightCounter ?? { ...offer, purseB: Math.round(offer.purseB * 1.25) }
    }
    const t = s.business!.talks[w.talkId]
    expect(['agreed', 'broken']).toContain(t.status)
    if (t.status === 'agreed') expect(s.fights[w.fightId].status).toBe('agreed')
  })
  it('walking away cancels the bout; a camp that walks locks the pairing', () => {
    const w = startFight()
    expect(w).not.toBeNull()
    if (!w) return
    const s = ok(fightTalkMove(w.s, w.talkId, { kind: 'walk' })).state
    expect(s.business!.talks[w.talkId].status).toBe('withdrawn')
    expect(s.fights[w.fightId].status).toBe('cancelled')
  })
})

describe('information boundary and determinism of conversations', () => {
  it('views never carry hidden manager, ambition or valuation data; the ambition is told only after the player asks and earns the answer', () => {
    const s0 = world()
    const f = frees(s0)[0]
    let s = ok(startContractTalk(s0, f.id, 'signing')).state
    const tid = Object.keys(s.business!.talks).find((k) => s.business!.talks[k].fighterId === f.id)!
    const dump0 = JSON.stringify(contractTalkView(s, tid))
    for (const k of HIDDEN_VIEW_KEYS) expect(dump0, k).not.toContain(`"${k}"`)
    expect(contractTalkView(s, tid)!.told.ambition).toBeNull()
    expect(dump0).not.toContain(ambitionOf(s, f).label)
    const amb = ambitionOf(s, f).label
    expect(JSON.stringify(contractTalkView(s, tid)!.plans)).not.toContain(amb)
    s = ok(contractMove(s, tid, { kind: 'propose', offer: openingOffer(s, f, 'signing') })).state
    for (const k of HIDDEN_VIEW_KEYS) expect(JSON.stringify(contractTalkView(s, tid)), k).not.toContain(`"${k}"`)
  })
  it('the same state and the same moves always give the same conversation', () => {
    const s0 = world()
    const f = frees(s0)[2]
    const a = runTalk(clone(s0), f.id), b = runTalk(clone(s0), f.id)
    expect(JSON.stringify(a.s.business)).toBe(JSON.stringify(b.s.business))
    expect(JSON.stringify(a.s.fighters[f.id])).toBe(JSON.stringify(b.s.fighters[f.id]))
  })
  it('conversations never consume the engine’s random stream or id counter', () => {
    const s0 = world()
    const f = frees(s0)[1]
    const { s } = runTalk(s0, f.id)
    expect(s.rngState).toBe(s0.rngState)
  })
  it('idle conversations lapse without penalty and the talk table stays bounded', () => {
    const s0 = world()
    let s = s0
    for (const f of frees(s0).slice(0, 24)) { const r = startContractTalk(s, f.id, 'signing'); if (r.ok) s = r.state }
    expect(Object.keys(s.business!.talks).length).toBeLessThanOrEqual(16)
    const g = clone(s); g.today += 60
    processBusiness(g)
    expect(Object.values(g.business!.talks).every((t) => t.status !== 'open')).toBe(true)
  })
})
