import { describe, expect, it } from 'vitest'
import { ageOn, dayFromIso, formatDay } from './calendar'
import { fighterAge, fighterRating } from './fighters'
import { Rng } from './rng'
import { deserialiseGame, listSaves, loadGame, memoryStorage, saveGame, serialiseGame, deleteSave } from './save'
import { attentionItems, cashRunwayWeeks, playerRoster, rosterOf, weeklyBurn } from './selectors'
import { advanceOneWeek, advanceWeeks } from './tick'
import type { GameState } from './types'
import { createNewGame, type NewGameOptions } from './worldgen'

const opts: NewGameOptions = {
  seed: 'test-seed', promotionName: 'Test Promotions', promoterName: 'Tester', homeCountry: 'ENG',
  difficulty: 'standard', logo: { monogram: 'TP', color: '#e11d2a', emblem: 'crown' },
}
const fresh = () => createNewGame(opts, 1_700_000_000_000)

/** Cross-reference integrity that must hold at every point in the game. */
function assertConsistent(s: GameState) {
  for (const c of Object.values(s.contracts)) {
    const f = s.fighters[c.fighterId]
    expect(f, `contract ${c.id} fighter exists`).toBeDefined()
    expect(f.contractId).toBe(c.id)
    expect(f.status).toBe('active')
    expect(s.promotions[c.promotionId]).toBeDefined()
  }
  for (const f of Object.values(s.fighters)) {
    if (f.contractId) expect(s.contracts[f.contractId]?.fighterId).toBe(f.id)
    if (f.status === 'retired') expect(f.contractId).toBeNull()
    for (const v of Object.values(f.attributes)) {
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(100)
    }
    expect(Number.isFinite(f.morale + f.fitness + f.confidence + f.conditioning)).toBe(true)
    expect(f.record.koWins).toBeLessThanOrEqual(f.record.wins)
    expect(f.record.koLosses).toBeLessThanOrEqual(f.record.losses)
  }
  const ids = Object.keys(s.fighters)
  expect(new Set(ids).size).toBe(ids.length)
  const msgIds = s.inbox.map((m) => m.id)
  expect(new Set(msgIds).size).toBe(msgIds.length)
}

describe('rng', () => {
  it('is deterministic for a seed and resumable from state', () => {
    const a = Rng.fromSeed('x')
    const b = Rng.fromSeed('x')
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()])
    const resumed = new Rng(a.state)
    expect(resumed.next()).toBe(a.next())
  })
  it('int stays in range', () => {
    const r = Rng.fromSeed('range')
    for (let i = 0; i < 2000; i++) {
      const n = r.int(3, 7)
      expect(n).toBeGreaterThanOrEqual(3)
      expect(n).toBeLessThanOrEqual(7)
    }
  })
})

describe('calendar', () => {
  it('computes ages and formats dates', () => {
    const today = dayFromIso('2026-10-05')
    expect(ageOn(dayFromIso('2000-10-05'), today)).toBe(26)
    expect(ageOn(dayFromIso('2000-10-06'), today)).toBe(25)
    expect(formatDay(today)).toBe('5 Oct 2026')
  })
})

describe('world generation', () => {
  it('is reproducible and internally consistent', () => {
    const a = fresh()
    const b = fresh()
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    assertConsistent(a)
  })
  it('different seeds produce different worlds', () => {
    const other = createNewGame({ ...opts, seed: 'another' }, 1_700_000_000_000)
    expect(JSON.stringify(other.fighters)).not.toBe(JSON.stringify(fresh().fighters))
  })
  it('gives the player a starting roster and rivals', () => {
    const s = fresh()
    expect(playerRoster(s)).toHaveLength(4)
    expect(Object.values(s.promotions).filter((p) => !p.isPlayer).length).toBeGreaterThanOrEqual(5)
    const apex = Object.values(s.promotions).find((p) => p.name === 'Apex Fight Group')!
    expect(rosterOf(s, apex.id).length).toBeGreaterThan(20)
    expect(Object.values(s.fighters).length).toBeGreaterThan(250)
  })
  it('produces a spread of fighter quality', () => {
    const ratings = Object.values(fresh().fighters).map(fighterRating)
    expect(Math.min(...ratings)).toBeLessThan(45)
    expect(Math.max(...ratings)).toBeGreaterThan(75)
  })
  it('makes major promotions stronger than regional ones', () => {
    const s = fresh()
    const avg = (name: string) => {
      const p = Object.values(s.promotions).find((x) => x.name === name)!
      const r = rosterOf(s, p.id).map(fighterRating)
      return r.reduce((a, b) => a + b, 0) / r.length
    }
    expect(avg('Apex Fight Group')).toBeGreaterThan(avg('Steel City Boxing'))
  })
})

describe('weekly simulation', () => {
  it('advances exactly seven days and does not mutate its input', () => {
    const s = fresh()
    const snapshot = JSON.stringify(s)
    const next = advanceOneWeek(s)
    expect(JSON.stringify(s)).toBe(snapshot)
    expect(next.today - s.today).toBe(7)
  })
  it('is deterministic', () => {
    const a = advanceWeeks(fresh(), 20).state
    const b = advanceWeeks(fresh(), 20).state
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
  it('keeps state consistent over three years', () => {
    let s = fresh()
    for (let i = 0; i < 52 * 3; i++) {
      s = advanceOneWeek(s)
      if (i % 26 === 0) assertConsistent(s)
    }
    assertConsistent(s)
    expect(s.ledger.length).toBeLessThanOrEqual(600)
    expect(s.financeHistory.length).toBeLessThanOrEqual(156)
  }, 30_000)
  it('charges weekly costs and the ledger matches cash', () => {
    const s = fresh()
    const burn = weeklyBurn(s).total
    const cash0 = s.promotions[s.playerPromotionId].cash
    const n = advanceOneWeek(s)
    expect(n.promotions[n.playerPromotionId].cash).toBe(cash0 - burn)
    const ledgerSum = n.ledger.reduce((a, t) => a + t.amount, 0)
    expect(ledgerSum).toBe(n.promotions[n.playerPromotionId].cash)
  })
  it('develops young fighters and declines old ones', () => {
    let s = fresh()
    const young = Object.values(s.fighters).find((f) => fighterAge(f, s.today) <= 21 && f.potential - fighterRating(f) > 10)!
    const r0 = fighterRating(young)
    for (let i = 0; i < 104; i++) s = advanceOneWeek(s)
    expect(fighterRating(s.fighters[young.id])).toBeGreaterThan(r0)
    expect(fighterRating(s.fighters[young.id])).toBeLessThanOrEqual(young.potential + 4)
  })
  it('training focus changes where gains land', () => {
    const base = fresh()
    const id = playerRoster(base).sort((a, b) => fighterAge(a, base.today) - fighterAge(b, base.today))[0].id
    const run = (focus: 'power' | 'stamina') => {
      let s = structuredClone(base)
      s.fighters[id].trainingFocus = focus
      s.fighters[id].potential = 95
      for (let i = 0; i < 52; i++) s = advanceOneWeek(s)
      return s.fighters[id].attributes
    }
    const p = run('power')
    const st = run('stamina')
    expect(p.power - st.power).toBeGreaterThan(0)
    expect(st.stamina - p.stamina).toBeGreaterThan(0)
  })
  it('expires contracts and frees fighters', () => {
    let s = fresh()
    const f = playerRoster(s)[0]
    const c = s.contracts[f.contractId!]
    c.endDay = s.today + 14
    for (let i = 0; i < 3; i++) s = advanceOneWeek(s)
    expect(s.fighters[f.id].contractId).toBeNull()
    expect(s.contracts[c.id]).toBeUndefined()
    expect(s.inbox.some((m) => m.category === 'contract' && m.subject.includes('left'))).toBe(true)
    assertConsistent(s)
  })
  it('stops early on urgent news', () => {
    const s = fresh()
    const f = playerRoster(s)[0]
    s.contracts[f.contractId!].endDay = s.today + 21 // inside the 4-week warning window
    const r = advanceWeeks(s, 8)
    expect(r.weeksAdvanced).toBeLessThan(8)
    expect(r.interrupted).toBe(true)
  })
  it('retires old fighters', () => {
    let s = fresh()
    const old = Object.values(s.fighters).filter((f) => fighterAge(f, s.today) >= 36)
    expect(old.length).toBeGreaterThan(0)
    for (let i = 0; i < 52; i++) s = advanceOneWeek(s)
    expect(Object.values(s.fighters).some((f) => f.status === 'retired')).toBe(true)
    assertConsistent(s)
  })
  it('rival promotions keep their rosters stocked', () => {
    let s = fresh()
    const apex = Object.values(s.promotions).find((p) => p.name === 'Redline Promotions')!
    for (let i = 0; i < 104; i++) s = advanceOneWeek(s)
    expect(rosterOf(s, apex.id).length).toBeGreaterThanOrEqual(15)
  })
  it('surfaces cash problems as attention items', () => {
    const s = fresh()
    s.promotions[s.playerPromotionId].cash = weeklyBurn(s).total * 5
    expect(cashRunwayWeeks(s)).toBe(5)
    expect(attentionItems(s).some((i) => i.id === 'cash-low')).toBe(true)
  })
})

describe('regressions from soak testing', () => {
  it('never reports negative runway and does not spam urgent mail when broke', () => {
    let s = fresh()
    s.promotions[s.playerPromotionId].cash = -50_000
    expect(cashRunwayWeeks(s)).toBe(0)
    for (let i = 0; i < 104; i++) s = advanceOneWeek(s)
    const urgent = s.inbox.filter((m) => m.priority === 'urgent' && m.category === 'finance')
    expect(urgent.length).toBeLessThanOrEqual(5)
  })
  it('starting contracts last at least three years', () => {
    const s = fresh()
    for (const f of playerRoster(s)) {
      expect(s.contracts[f.contractId!].endDay - s.today).toBeGreaterThanOrEqual(3 * 365)
    }
  })
  it('keeps the player roster content at the start', () => {
    for (const f of playerRoster(fresh())) expect(f.morale).toBeGreaterThanOrEqual(60)
  })
})

describe('save / load', () => {
  it('round-trips exactly and resumes the same random sequence', () => {
    const s = advanceWeeks(fresh(), 10).state
    const loaded = deserialiseGame(serialiseGame(s))!
    expect(loaded).toEqual(s)
    expect(JSON.stringify(advanceOneWeek(loaded))).toBe(JSON.stringify(advanceOneWeek(s)))
  })
  it('manages multiple slots', () => {
    const store = memoryStorage()
    const a = fresh()
    const b = createNewGame({ ...opts, seed: 'b', promotionName: 'Other' }, 1_700_000_000_001)
    saveGame(store, a)
    saveGame(store, b)
    expect(listSaves(store)).toHaveLength(2)
    expect(loadGame(store, b.saveId)!.promotions[b.playerPromotionId].name).toBe('Other')
    deleteSave(store, a.saveId)
    expect(listSaves(store)).toHaveLength(1)
    expect(loadGame(store, a.saveId)).toBeNull()
  })
  it('rejects corrupt and future-version saves', () => {
    expect(deserialiseGame('not json')).toBeNull()
    expect(deserialiseGame(JSON.stringify({ version: 999, promotions: {}, fighters: {} }))).toBeNull()
  })
})
