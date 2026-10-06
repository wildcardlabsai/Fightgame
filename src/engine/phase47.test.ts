import { describe, expect, it } from 'vitest'
import { addFightToEvent, approach, createEvent, offerFight, setEventPrices } from './commands'
import { allAdvice, contractAdvice, contractCheck, deskAdvice, eventAdvice, eventRiskOf, financeAdvisor, fighterAdvice, LEVEL_RANK, matchmakingAdvice, needsConfirmation, rosterAdvice, sortAdvice, venueBookingAdvice, visibleAdvice, type Advice } from './advisor'
import { post } from './ledger'
import { opponentCandidates } from './matchmaking'
import { negotiationInfo } from './quotes'
import { deserialiseGame, serialiseGame } from './save'
import { objectiveStatuses, promotionValuation, SCENARIOS, SCENARIO_ORDER, scenarioById } from './scenarios'
import { player, playerRoster, weeklyBurn } from './selectors'
import { advanceOneWeek } from './tick'
import { GAME_STATE_VERSION, type FightOffer, type GameState, type Id, type Offer } from './types'
import { suggestedFightOffer } from './fightNegotiation'
import { viewsOf } from './view'
import { createNewGame } from './worldgen'
import { defaultPreferences, parsePreferences, loadPreferences, savePreferences, PREFS_KEY, type PrefStorage } from './preferences'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const fresh = (seed = 'p47') => createNewGame({ seed, promotionName: 'P47', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
const career = (scenario: 'groundUp' | 'regional' | 'national' | 'champion', seed = 'p47') => createNewGame({ seed, promotionName: 'P47', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo, scenario }, 1_700_000_000_000)

const SAT = 5
const satIn = (s: GameState, weeks: number) => s.today + SAT + 7 * (weeks - 1)
const venueByName = (s: GameState, name: string) => Object.values(s.venues).find((v) => v.name === name)!

function agreeFight(s: GameState, myId: Id, taken: Set<Id>): { state: GameState; fightId: Id } | null {
  const cands = opponentCandidates(s, myId, {}).filter((x) => x.canApproach && !taken.has(x.view.id) && x.view.reputation < 50)
  for (const c of cands.slice(0, 8)) {
    const ap = approach(s, myId, c.view.id)
    if (!ap.ok) continue
    let st = ap.state
    const fightId = ap.fightId!
    for (let i = 0; i < 6; i++) {
      const base = suggestedFightOffer(st, c.view.id)
      const out = offerFight(st, fightId, { ...base, purseB: base.purseB * (1.2 + i * 0.4), winBonusB: base.winBonusB * 1.5 } as FightOffer)
      if (!out.ok) break
      st = out.state
      if (st.fights[fightId].status === 'agreed') { taken.add(c.view.id); return { state: st, fightId } }
      if (st.fights[fightId].status === 'cancelled') break
    }
  }
  return null
}

function buildShow(seed = 'p47', n = 3, venueName = 'Ironworks Social Club'): { s: GameState; eventId: Id } {
  let s = fresh(seed)
  const r = createEvent(s, { name: 'Test Night', day: satIn(s, 8), venueId: venueByName(s, venueName).id })
  expect(r.ok, r.error).toBe(true)
  s = r.state
  const eventId = r.eventId!
  const taken = new Set<Id>()
  for (const f of playerRoster(s).slice(0, n)) {
    const a = agreeFight(s, f.id, taken)
    if (!a) continue
    const add = addFightToEvent(a.state, eventId, a.fightId)
    expect(add.ok, add.error).toBe(true)
    s = add.state
  }
  return { s, eventId }
}

const drain = (s: GameState, to: number): GameState => { const c = structuredClone(s); post(c, 'other', to - player(c).cash, 'test'); return c }
const levelOf = (list: Advice[], topic: string) => list.filter((a) => a.topic === topic).sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])[0]?.level

describe('advisor: event finance warnings', () => {
  it('says nothing alarming about a modest show with plenty of cash', () => {
    const { s, eventId } = buildShow()
    const r = eventRiskOf(s, eventId)!
    expect(r.cash).toBeGreaterThan(r.remainingCost)
    expect(['info', 'caution']).toContain(r.level)
    expect(eventAdvice(s, eventId).every((a) => LEVEL_RANK[a.level] < LEVEL_RANK.highRisk)).toBe(true)
  })

  it('escalates as cash shrinks: critical when the worst case would cross the insolvency line', () => {
    const { s, eventId } = buildShow()
    const r = eventRiskOf(s, eventId)!
    const low = drain(s, Math.round(r.remainingCost * 0.4))
    const rl = eventRiskOf(low, eventId)!
    expect(LEVEL_RANK[rl.level]).toBeGreaterThanOrEqual(LEVEL_RANK.highRisk)
    expect(needsConfirmation(eventAdvice(low, eventId).find((a) => a.id.endsWith('-cash')))).toBe(true)
    const broke = drain(s, -200_000)
    const a = eventAdvice(broke, eventId).find((x) => x.id.endsWith('-cash'))!
    expect(a.level).toBe('critical')
    expect(a.facts!.map((f) => f.label)).toEqual(expect.arrayContaining(['Current cash', 'Projected event cost', 'Expected revenue', 'Worst-case revenue', 'Cash after (worst case)']))
  })

  it('is monotone: less cash never lowers the warning level', () => {
    const { s, eventId } = buildShow()
    let last = -1
    for (const cash of [900_000, 200_000, 60_000, 20_000, 0, -50_000, -150_000]) {
      const lvl = LEVEL_RANK[eventRiskOf(drain(s, cash), eventId)!.level]
      expect(lvl).toBeGreaterThanOrEqual(last)
      last = lvl
    }
  })

  it('is advice only: computing it changes nothing and the player can still proceed', () => {
    const { s, eventId } = buildShow()
    const low = drain(s, 5_000)
    const before = JSON.stringify(low)
    eventAdvice(low, eventId); allAdvice(low); deskAdvice(low, 'full'); financeAdvisor(low)
    expect(JSON.stringify(low)).toBe(before)
    // The same state still advances and the event commands still work: nothing is blocked by the advisor.
    expect(setEventPrices(low, eventId, { ga: 20, premium: 40, vip: 90 }).ok).toBe(true)
  })

  it('does not feed back into results: identical worlds play out identically with or without advice calls', () => {
    const a = buildShow('same').s
    const b = structuredClone(a)
    allAdvice(b)
    let x = a, y = b
    for (let i = 0; i < 12; i++) { x = advanceOneWeek(x); y = advanceOneWeek(y) }
    expect(JSON.stringify(x)).toBe(JSON.stringify(y))
  })

  it('warns about venue booking that dwarfs the bank', () => {
    const s = fresh()
    expect(venueBookingAdvice(s, 10_000, 5_000, 'Hall')).toBeNull()
    expect(venueBookingAdvice(s, player(s).cash * 0.7, 0, 'Arena')?.level).toBe('highRisk')
    expect(venueBookingAdvice(s, player(s).cash * 1.5, 0, 'Stadium')?.level).toBe('critical')
  })
})

describe('advisor: contracts', () => {
  const target = (s: GameState) => viewsOf(s).freeAgents().find((v) => v.market.signable && v.reputation > 20)!
  it('compares the offer with the market estimate and cash — tip, caution, high risk', () => {
    const s = fresh()
    const v = target(s)
    const info = negotiationInfo(s, v.id, 'signing')!
    const base = info.suggested
    const scale = (m: number): Offer => ({ ...base, weeklyRetainer: Math.round(base.weeklyRetainer * m), basePurse: Math.round(base.basePurse * m), signingBonus: Math.round(base.signingBonus * m) })
    const fair = contractAdvice(s, v.id, scale(0.9)).find((a) => a.id.endsWith('-price'))
    expect(fair).toBeUndefined()
    const worst = (m: number) => levelOf(contractAdvice(s, v.id, scale(m)), 'contract')
    expect(['tip', 'caution', 'highRisk', 'critical']).toContain(worst(1.6))
    expect(LEVEL_RANK[worst(3)!]).toBeGreaterThanOrEqual(LEVEL_RANK.caution)
    const chk = contractCheck(s, v.id, scale(3))!
    expect(chk.overMarketPct).toBeGreaterThan(0.25)
    const dire = contractAdvice(drain(s, 12_000), v.id, scale(1))
    expect(dire.some((a) => a.level === 'critical')).toBe(true)
    // Never prevents the offer: advice is data only.
    expect(dire.every((a) => typeof a.body === 'string')).toBe(true)
  })
})

describe('advisor: fighters, matchmaking, roster', () => {
  it('fighter tips use public information only', () => {
    const s = fresh()
    const tips = viewsOf(s).known().flatMap((v) => fighterAdvice(v))
    expect(tips.length).toBeGreaterThan(0)
    const src = readFileSync(join(__dirname, 'advisor.ts'), 'utf8')
    for (const re of [/\bfighterRating\b/, /\.attributes\b/, /\.potential\b/, /\.(discipline|composure|injuryRisk|personalityNote|promoRelations)\b/, /\.personality\b/]) expect(src).not.toMatch(re)
  })

  it('matchmaking: low confidence and a step up are called out', () => {
    const s = fresh()
    const me = viewsOf(s).mine()[0]
    const cands = opponentCandidates(s, me.id, {}).filter((c) => c.canApproach)
    expect(cands.length).toBeGreaterThan(0)
    const c = cands[0]
    const low = matchmakingAdvice(me.id ? me : me, c.view, { ...c.assessment, confidence: 'Low' })
    expect(low.some((a) => a.title === 'Scouting warning')).toBe(true)
    const up = matchmakingAdvice({ ...me, reputation: 10 }, { ...c.view, reputation: 40 }, { ...c.assessment, confidence: 'High', verdict: 'Competitive', reward: 4, winLo: 45, winHi: 60, koRisk: 'Low' })
    expect(up.map((a) => a.title)).toEqual(expect.arrayContaining(['Matchmaking tip', 'Career tip']))
  })

  it('a fresh roster is not nagged about inactivity it did not cause', () => {
    const s = fresh()
    expect(rosterAdvice(s).filter((a) => a.id.endsWith('-idle') || a.id.endsWith('-needs'))).toHaveLength(0)
    expect(deskAdvice(s, 'standard').filter((a) => a.topic === 'roster')).toHaveLength(0)
  })

  it('roster: expiring contract and inactivity surface', () => {
    const s0 = fresh()
    const s = structuredClone(s0)
    const f = playerRoster(s)[0]
    const c = s.contracts[f.contractId!]
    c.endDay = s.today + 7 * 6
    c.startDay = s.today - 7 * 20
    f.lastFightDay = s.today - 7 * 31
    const adv = rosterAdvice(s)
    expect(adv.find((a) => a.id === `roster-${f.id}-expiry`)?.body).toMatch(/expires in 6 weeks/)
    expect(adv.find((a) => a.id === `roster-${f.id}-idle`)?.body).toMatch(/not fought in 7 months/)
    expect(allAdvice(s).some((a) => a.topic === 'roster')).toBe(true)
  })
})

describe('advisor: ordering, caps and modes', () => {
  const mk = (id: string, level: Advice['level'], topic: Advice['topic'] = 'event'): Advice => ({ id, level, topic, title: id, body: id })
  const pool = [mk('a', 'tip'), mk('b', 'critical'), mk('c', 'caution'), mk('d', 'highRisk'), mk('e', 'info'), mk('f', 'highRisk', 'finance'), mk('g', 'caution'), mk('h', 'tip', 'growth'), mk('i', 'caution'), mk('j', 'highRisk')]
  it('sorts by severity then topic', () => {
    const ids = sortAdvice(pool).map((a) => a.id)
    expect(ids[0]).toBe('b')
    expect(ids.slice(1, 4)).toEqual(['f', 'd', 'j'])
    const ranks = sortAdvice(pool).map((a) => LEVEL_RANK[a.level])
    expect([...ranks].sort((x, y) => y - x)).toEqual(ranks)
  })
  it('never shows more than the cap and honours the mode', () => {
    expect(visibleAdvice(pool, 'full', 4)).toHaveLength(4)
    expect(visibleAdvice(pool, 'full', 5)).toHaveLength(5)
    expect(visibleAdvice(pool, 'off')).toHaveLength(0)
    expect(visibleAdvice(pool, 'minimal', 10).every((a) => LEVEL_RANK[a.level] >= LEVEL_RANK.highRisk)).toBe(true)
    const std = visibleAdvice(pool, 'standard', 4)
    expect(std.length).toBeLessThanOrEqual(4)
    expect(std.filter((a) => LEVEL_RANK[a.level] < LEVEL_RANK.caution).length).toBeLessThanOrEqual(1)
    expect(visibleAdvice([mk('t1', 'tip'), mk('t2', 'tip'), mk('t3', 'info')], 'standard').length).toBe(1)
  })
  it('the desk of a fresh game stays small and calm', () => {
    const s = fresh()
    expect(deskAdvice(s, 'full').length).toBeLessThanOrEqual(4)
    expect(deskAdvice(s, 'standard').every((a) => LEVEL_RANK[a.level] <= LEVEL_RANK.caution)).toBe(true)
  })
})

describe('advisor: finance standing', () => {
  it('maps health to Healthy / Watch spending / High risk / Critical with reasons', () => {
    const s = fresh()
    expect(financeAdvisor(s).standing).toBe('Healthy')
    expect(financeAdvisor(drain(s, 40_000)).standing).not.toBe('Healthy')
    expect(financeAdvisor(drain(s, 5_000)).reasons.length).toBeGreaterThan(0)
    expect(financeAdvisor(drain(s, -200_000)).standing).toBe('Critical')
  })
})

describe('career scenarios', () => {
  it('there are at least four, each with a distinct id, objective and difficulty', () => {
    expect(SCENARIO_ORDER).toHaveLength(4)
    expect(new Set(SCENARIO_ORDER.map((id) => SCENARIOS[id].difficultyLabel)).size).toBe(4)
    for (const id of SCENARIO_ORDER) expect(SCENARIOS[id].objectives.length).toBeGreaterThan(0)
    expect(scenarioById('nope')).toBeNull()
  })

  for (const id of ['groundUp', 'regional', 'national', 'champion'] as const) {
    it(`${id}: starts with the configured cash, roster, reputation and difficulty`, () => {
      const sc = SCENARIOS[id]
      const s = career(id)
      const p = player(s)
      expect(p.cash).toBe(sc.startingCash)
      expect(p.reputation).toBe(sc.reputation)
      expect(p.fanbase).toBe(sc.fanbase)
      expect(p.tier).toBe(sc.tier)
      expect(s.settings.difficulty).toBe(sc.difficulty)
      expect(s.scenario).toEqual({ id, done: {} })
      expect(playerRoster(s)).toHaveLength(sc.roster.reduce((n, g) => n + g.count, 0))
      expect(s.ledger[0].amount).toBe(sc.startingCash)
      // Every contracted fighter is real, active and discovered.
      for (const f of playerRoster(s)) { expect(f.status).toBe('active'); expect(s.knowledge[f.id]).toBeTruthy() }
      expect(weeklyBurn(s).total * 26).toBeLessThan(p.cash * (id === 'groundUp' ? 1.2 : 1))
    })
  }

  it('roster quality ladders up: ground-up < regional < national, champion has one standout', () => {
    const best = (s: GameState) => Math.max(...playerRoster(s).map((f) => f.reputation))
    const mean = (s: GameState) => playerRoster(s).reduce((n, f) => n + f.reputation, 0) / playerRoster(s).length
    const g = career('groundUp'), r = career('regional'), n = career('national'), c = career('champion')
    expect(mean(r)).toBeGreaterThan(mean(g)); expect(mean(n)).toBeGreaterThan(mean(r))
    expect(best(c)).toBeGreaterThan(best(r) - 5)
    const rs = playerRoster(c).map((f) => f.reputation).sort((a, b) => b - a)
    expect(rs[0] - rs[1]).toBeGreaterThan(8)
  })

  it('classic starts (no scenario) are unchanged', () => {
    const s = fresh()
    expect(s.scenario).toBeUndefined()
    expect(player(s).cash).toBe(500_000)
    expect(playerRoster(s)).toHaveLength(4)
  })

  it('survive save/load and a year of play', () => {
    for (const id of SCENARIO_ORDER) {
      const s = career(id)
      const back = deserialiseGame(serialiseGame(s))!
      expect(back.scenario).toEqual(s.scenario)
      expect(back.version).toBe(GAME_STATE_VERSION)
      expect(player(back).cash).toBe(player(s).cash)
      let t = s
      for (let i = 0; i < 26; i++) t = advanceOneWeek(t)
      expect(t.scenario?.id).toBe(id)
    }
  })

  it('objectives report progress and complete once', () => {
    const s = career('groundUp')
    const [o] = objectiveStatuses(s)
    expect(o.done).toBe(false)
    expect(promotionValuation(s)).toBeLessThan(1_000_000)
    const rich = structuredClone(s); post(rich, 'other', 900_000, 'x')
    expect(objectiveStatuses(rich)[0].done).toBe(true)
    let t = rich
    t = advanceOneWeek(t)
    expect(t.scenario!.done['valuation-1m']).toBe(t.today)
    const mails = t.inbox.filter((m) => m.subject === 'Objective complete').length
    t = advanceOneWeek(t); t = advanceOneWeek(t)
    expect(t.inbox.filter((m) => m.subject === 'Objective complete').length).toBe(mails)
  })

  it('migrates an older save without a scenario', () => {
    const s = fresh()
    const raw = JSON.parse(serialiseGame(s)); raw.version = 5; delete raw.scenario
    expect(deserialiseGame(JSON.stringify(raw))!.version).toBe(GAME_STATE_VERSION)
  })
})

describe('presentation-facing engine modules stay on the public side of the leak boundary', () => {
  // These modules are allow-listed for the UI to import (see leakAudit). They may only read public facts and FighterViews.
  const FORBIDDEN = [/\bfighterRating\b/, /\.attributes\b/, /\.potential\b/, /\.(discipline|composure|injuryRisk|personalityNote|promoRelations)\b/, /\.personality\b/, /\bBALANCE\b.*\b(thresh|accept)/, /\bbeliefOf\b/, /\bdemandFor\([^)]*'actual'/]
  for (const file of ['advisor.ts', 'scenarios.ts', 'onboarding.ts', 'preferences.ts']) {
    it(`${file} never reaches for hidden information`, () => {
      const src = readFileSync(join(__dirname, file), 'utf8')
      for (const re of FORBIDDEN) expect(src, `${file} matches ${re}`).not.toMatch(re)
    })
  }
  it('the advisor uses the public forecast, never the hidden "actual" demand', () => {
    expect(readFileSync(join(__dirname, 'advisor.ts'), 'utf8')).not.toMatch(/'actual'/)
  })
})

describe('preferences persistence', () => {
  const mem = (): PrefStorage & { data: Record<string, string> } => { const data: Record<string, string> = {}; return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v } } }
  it('defaults: standard advisor, quiet audio, nothing muted', () => {
    const d = defaultPreferences()
    expect(d.advisor).toBe('standard')
    expect(d.audio.muted).toBe(false)
    expect(d.audio.master).toBeLessThanOrEqual(70)
  })
  it('round-trips and clamps garbage', () => {
    const store = mem()
    const p = defaultPreferences(); p.advisor = 'minimal'; p.audio.muted = true; p.audio.master = 33
    savePreferences(p, store)
    expect(loadPreferences(store)).toEqual(p)
    expect(parsePreferences(JSON.stringify({ advisor: 'nonsense', audio: { master: 900, ui: 'loud', muted: 'yes' } }))).toEqual(defaultPreferences().advisor === 'standard' ? { ...defaultPreferences(), audio: { ...defaultPreferences().audio, master: 100 } } : null)
    expect(parsePreferences('{not json')).toEqual(defaultPreferences())
    expect(parsePreferences(null)).toEqual(defaultPreferences())
  })
  it('survives blocked storage', () => {
    const bad: PrefStorage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(loadPreferences(bad)).toEqual(defaultPreferences())
    expect(() => savePreferences(defaultPreferences(), bad)).not.toThrow()
    expect(PREFS_KEY).toContain('prefs')
  })
})

// Browser-test fixtures (only when E2E_FIXTURES=<dir>): saves the Playwright run imports through the real UI/store.
import { mkdirSync, writeFileSync } from 'node:fs'
describe.skipIf(!process.env.E2E_FIXTURES)('e2e fixtures', () => {
  it('writes saves', () => {
    const dir = process.env.E2E_FIXTURES!
    mkdirSync(dir, { recursive: true })
    const { s, eventId } = buildShow('e2e')
    writeFileSync(`${dir}/show-ok.json`, serialiseGame(s))
    writeFileSync(`${dir}/show-lowcash.json`, serialiseGame(drain(s, 30_000)))
    writeFileSync(`${dir}/show-broke.json`, serialiseGame(drain(s, -150_000)))
    const x = structuredClone(fresh('e2e2'))
    const f = playerRoster(x)[0]
    x.contracts[f.contractId!].endDay = x.today + 7 * 6
    x.contracts[f.contractId!].startDay = x.today - 7 * 20
    f.lastFightDay = x.today - 7 * 31
    writeFileSync(`${dir}/expiry.json`, serialiseGame(x))
    writeFileSync(`${dir}/meta.json`, JSON.stringify({ eventId, fighterId: f.id, fighterName: `${f.firstName} ${f.lastName}`, cash: player(s).cash }))
  })
})
