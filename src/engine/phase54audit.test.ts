/**
 * Phase 5.4 — hidden-information audit and determinism audit of the fight business.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createNewGame } from './worldgen'
import { advanceOneWeek } from './tick'
import { askTerms } from './market'
import { player } from './selectors'
import { serialiseGame, deserialiseGame } from './save'
import { clone } from './media/testing'
import { contractMove, startContractTalk, startFightTalk, choosePlan, changeDivision } from './commands'
import { approachOpponent, fightAsk } from './fightNegotiation'
import { openingOffer } from './business/contractTalks'
import { ARCHETYPES, ambitionOf } from './business/manager'
import { confidenceFor, expectedContractTerms, expectedFightTerms } from './business/terms'
import { contractTalkView, fightTalkView, HIDDEN_VIEW_KEYS, planChoices } from './business/talkViews'
import { fighterBusinessView, titleBoard, titleLevels, divisionOptions } from './business/views'
import { businessAdvice } from './advisor'
import { venueFits, venueViews } from './eventViews'
import { auditWorld } from './business/audit'
import type { Fighter, GameState } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const fresh = (seed: string) => createNewGame({ seed, promotionName: 'P54', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
const world = (() => { let s: GameState | null = null; return () => (s ??= (() => { let g = fresh('p54-audit'); for (let i = 0; i < 80; i++) g = advanceOneWeek(g); return g })()) })()
const frees = (s: GameState): Fighter[] => Object.values(s.fighters).filter((f) => f.status === 'active' && !f.contractId && !f.injury).sort((a, b) => (a.id < b.id ? -1 : 1))

const AMBITION_KINDS = ['BECOME_AREA_CHAMPION', 'BECOME_BRITISH_CHAMPION', 'BECOME_EUROPEAN_CHAMPION', 'BECOME_WORLD_CHAMPION', 'UNIFY_TITLES', 'BECOME_UNDISPUTED', 'MAXIMISE_EARNINGS', 'MOVE_UP_DIVISION', 'AVENGE_LOSS', 'FIGHT_RIVAL', 'BUILD_LEGACY']

describe('hidden information', () => {
  it('no business view carries a hidden key, a manager archetype or an ambition kind — and the ambition stays null until the camp tells it', () => {
    const s = world()
    const dumps: string[] = []
    const people = Object.values(s.fighters).filter((f) => f.status === 'active').slice(0, 70)
    for (const f of people) dumps.push(JSON.stringify(fighterBusinessView(s, f.id)))
    for (const l of titleLevels()) for (const d of divisionOptions().slice(0, 8)) dumps.push(JSON.stringify(titleBoard(s, l.id, d.id)))
    dumps.push(JSON.stringify(businessAdvice(s)))
    dumps.push(JSON.stringify(venueViews(s).slice(0, 30)))
    let g = s
    for (const f of frees(s).slice(0, 6)) {
      const r = startContractTalk(g, f.id, 'signing'); if (!r.ok) continue
      g = r.state
      const tid = r.talkId!
      const m = contractMove(g, tid, { kind: 'ask', topic: 'priorities' }); if (m.ok) g = m.state
      dumps.push(JSON.stringify(contractTalkView(g, tid)), JSON.stringify(planChoices(g, f)))
      expect(contractTalkView(g, tid)!.told.ambition).toBeNull()
    }
    const all = dumps.join('\n')
    for (const k of HIDDEN_VIEW_KEYS) expect(all, `key ${k}`).not.toContain(`"${k}"`)
    for (const a of ARCHETYPES) expect(all, a).not.toContain(a)
    for (const a of AMBITION_KINDS) expect(all, a).not.toContain(a)
  })
  it('the fight talk view is just as clean', () => {
    const s = world()
    const me = Object.values(s.fighters).find((f) => f.contractId && s.contracts[f.contractId]?.promotionId === s.playerPromotionId)!
    for (const o of Object.values(s.fighters).filter((f) => f.status === 'active' && f.weightClass === me.weightClass && f.id !== me.id && !f.activeFightId)) {
      const a = approachOpponent(s, me.id, o.id)
      if (!a.ok) continue
      const t = startFightTalk(a.state, a.fightId!)
      const tid = t.talkId!
      const dump = JSON.stringify(fightTalkView(t.state, tid))
      for (const k of HIDDEN_VIEW_KEYS) expect(dump, k).not.toContain(`"${k}"`)
      const ask = fightAsk(t.state, t.state.fights[a.fightId!])
      const v = fightTalkView(t.state, tid)!
      // The exact reservation purse is neither an edge of the range nor printed anywhere in the view.
      expect([v.expected!.purse.lo, v.expected!.purse.hi]).not.toContain(ask.purseB)
      expect(dump).not.toContain(`${ask.purseB}`)
      return
    }
    throw new Error('no fight to audit')
  })
  it('expected terms are estimates: never the exact ask, the ask is not at a fixed place in the range, and repeated queries reveal nothing more', () => {
    const s = world()
    const pos: number[] = []
    let edge = 0
    for (const f of frees(s).slice(0, 60)) {
      const a = expectedContractTerms(s, f.id, 'signing')!
      const b = expectedContractTerms(s, f.id, 'signing')!
      expect(JSON.stringify(a)).toBe(JSON.stringify(b))
      const truth = askTerms(s, f, player(s), 'signing')
      if (a.purse.hi > a.purse.lo) pos.push((truth.basePurse - a.purse.lo) / (a.purse.hi - a.purse.lo))
      if (truth.basePurse === a.purse.lo || truth.basePurse === a.purse.hi) edge++
      expect(a.purse.hi - a.purse.lo).toBeGreaterThan(0)
    }
    expect(edge).toBe(0)
    const mean = pos.reduce((x, y) => x + y, 0) / pos.length
    const sd = Math.sqrt(pos.reduce((x, y) => x + (y - mean) ** 2, 0) / pos.length)
    expect(sd).toBeGreaterThan(0.12) // the truth does not sit at a predictable place inside the range
    // A more knowing player gets a narrower range, but only by legitimate means.
    const f = frees(s)[0]
    const low = expectedContractTerms(s, f.id, 'signing')!
    const g = clone(s)
    g.business ??= { v: 1, n: 0, talks: {}, commitments: [], plans: {}, learned: {}, neg: {}, exp: 0, titleHist: {} }
    g.business.learned[f.id] = ['priority:money', 'priority:title', 'ambition']
    g.business.neg[f.id] = { talks: 3, agreed: 0, lowballs: 0, walkouts: 0, lastDay: g.today }
    g.business.exp = 6
    const high = expectedContractTerms(g, f.id, 'signing')!
    expect(confidenceFor(g, f.id).score).toBeGreaterThan(confidenceFor(s, f.id).score)
    expect(high.purse.hi - high.purse.lo).toBeLessThan(low.purse.hi - low.purse.lo)
    void expectedFightTerms
  })
  it('conversation text never prints the camp’s numbers or a hidden trait; a saved game without conversations carries no hidden business data', () => {
    const s0 = world()
    const raw = serialiseGame(s0)
    for (const a of ARCHETYPES) expect(raw).not.toContain(a)
    for (const a of AMBITION_KINDS) expect(raw).not.toContain(a)
    expect(raw).not.toContain('walkAway'); expect(raw).not.toContain('lowballTolerance')
    const f = frees(s0)[3]
    let s = startContractTalk(s0, f.id, 'signing').state
    const tid = Object.keys(s.business!.talks).find((k) => s.business!.talks[k].fighterId === f.id)!
    for (const topic of ['priorities', 'ambition'] as const) { const r = contractMove(s, tid, { kind: 'ask', topic }); if (r.ok) s = r.state }
    let offer = openingOffer(s, f, 'signing')
    for (let i = 0; i < 4; i++) { const r = contractMove(s, tid, { kind: 'propose', offer }); if (!r.ok) break; s = r.state; const t = s.business!.talks[tid]; if (t.status !== 'open') break; offer = t.counter ?? offer }
    const ask = askTerms(s0, f, player(s0), 'signing')
    const text = s.business!.talks[tid].log.map((l) => l.text).join(' ')
    // The camp never speaks a number at all (the player's own offer lines do, and are theirs to print).
    for (const l of s.business!.talks[tid].log.filter((x) => x.who === 'mgr')) expect(l.text, l.text).not.toMatch(/\d/)
    void ask
    for (const a of ARCHETYPES) expect(text).not.toContain(a)
    expect(text).not.toMatch(/ratio|reservation|walk-?away|patience:/i)
  })
  it('an ambition appears in a view only after the camp has told it, and then it is the true one', () => {
    const s0 = world()
    const f = frees(s0)[5]
    let s = startContractTalk(s0, f.id, 'signing').state
    const tid = Object.keys(s.business!.talks).find((k) => s.business!.talks[k].fighterId === f.id)!
    expect(fighterBusinessView(s, f.id)!.told.ambition).toBeNull()
    for (let i = 0; i < 3 && !(s.business!.learned[f.id] ?? []).includes('ambition'); i++) {
      const r1 = contractMove(s, tid, { kind: 'ask', topic: 'priorities' }); if (r1.ok) s = r1.state
      const r2 = contractMove(s, tid, { kind: 'ask', topic: 'ambition' }); if (r2.ok) s = r2.state
      if (s.business!.talks[tid].status !== 'open') break
    }
    const told = fighterBusinessView(s, f.id)!.told.ambition
    if ((s.business!.learned[f.id] ?? []).includes('ambition')) expect(told).toBe(ambitionOf(s, f).label)
  })
})

describe('determinism', () => {
  const session = (s0: GameState): GameState => {
    let s = s0
    const f = frees(s0)[1]
    s = startContractTalk(s, f.id, 'signing').state
    const tid = Object.keys(s.business!.talks).find((k) => s.business!.talks[k].fighterId === f.id)!
    s = contractMove(s, tid, { kind: 'ask', topic: 'priorities' }).state
    let offer = openingOffer(s, f, 'signing')
    for (let i = 0; i < 6; i++) { const r = contractMove(s, tid, { kind: 'propose', offer }); if (!r.ok) break; s = r.state; const t = s.business!.talks[tid]; if (t.status !== 'open') break; offer = t.counter ?? { ...offer, basePurse: offer.basePurse * 1.2, signingBonus: offer.signingBonus * 1.3 } }
    if (s.fighters[f.id].contractId) { s = choosePlan(s, f.id, 'protected').state; s = changeDivision(s, f.id, 'welterweight' as never).state }
    for (let i = 0; i < 26; i++) s = advanceOneWeek(s)
    return s
  }
  it('the same start and the same session give byte-identical games, including every business record', () => {
    const a = session(clone(world())), b = session(clone(world()))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.stringify(a.business)).toBe(JSON.stringify(b.business))
  }, 120000)
  it('saving and loading in the middle of a conversation changes nothing afterwards', () => {
    const s0 = world()
    const f = frees(s0)[2]
    let s = startContractTalk(s0, f.id, 'signing').state
    const tid = Object.keys(s.business!.talks).find((k) => s.business!.talks[k].fighterId === f.id)!
    s = contractMove(s, tid, { kind: 'propose', offer: openingOffer(s, f, 'signing') }).state
    const loaded = deserialiseGame(serialiseGame(s))!
    const step = (g: GameState) => { let x = g; const t = x.business!.talks[tid]; x = contractMove(x, tid, t.counter ? { kind: 'acceptCounter' } : { kind: 'time' }).state; for (let i = 0; i < 8; i++) x = advanceOneWeek(x); return x }
    // Compared as saved data (JSON drops `undefined` fields and may reorder keys, never values).
    const norm = (g: GameState) => JSON.parse(JSON.stringify(g))
    expect(norm(step(s))).toEqual(norm(step(loaded)))
  }, 120000)
  it('no engine code draws from Math.random or the wall clock', () => {
    const root = join(__dirname)
    const bad: string[] = []
    const walk = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n)
        if (statSync(p).isDirectory()) { walk(p); continue }
        if (!/\.ts$/.test(n) || /\.test\.ts$/.test(n) || /(^|\/)(testing|benchTime)\.ts$/.test(p)) continue
        const src = readFileSync(p, 'utf8')
        if (/Math\.random\s*\(/.test(src)) bad.push(`${p}: Math.random`)
        if (/business\//.test(p) && /Date\.now\s*\(|new Date\s*\(\s*\)/.test(src)) bad.push(`${p}: wall clock`)
      }
    }
    walk(root)
    expect(bad).toEqual([])
  })
  it('the world stays structurally sound after a played-through session of talks, plans and division moves', () => {
    const s = session(clone(world()))
    expect(auditWorld(s)).toEqual([])
    void venueFits
  }, 120000)
})
