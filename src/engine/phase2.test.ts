import { describe, expect, it } from 'vitest'
import { BALANCE as B } from './balance'
import { endNegotiation, makeOffer, releaseFighter, commissionReport, commissionSearch, toggleShortlist } from './commands'
import { fighterAge } from './fighters'
import { trueValue, SCOUT_TRAITS, beliefOf, applyReport } from './knowledge'
import { askTerms, normaliseOffer, offerValue } from './market'
import { evaluateOffer, suggestedOffer } from './negotiation'
import { Rng } from './rng'
import { deserialiseGame, migrate, serialiseGame } from './save'
import { aiFit } from './systems/aiMarket'
import { cashRunwayWeeks, playerRoster, freeAgents, rosterOf, player } from './selectors'
import { advanceOneWeek } from './tick'
import { viewsOf } from './view'
import type { Fighter, GameState, Offer } from './types'
import { createNewGame, type NewGameOptions } from './worldgen'
import { releaseCost } from './roster'
import { processContracts } from './systems/contracts'
import { post } from './ledger'

const opts: NewGameOptions = {
  seed: 'phase2', promotionName: 'Test Promotions', promoterName: 'Tester', homeCountry: 'ENG',
  difficulty: 'standard', logo: { monogram: 'TP', color: '#e11d2a', emblem: 'crown' },
}
const fresh = (seed = 'phase2') => createNewGame({ ...opts, seed }, 1_700_000_000_000)

/** A discovered, signable free agent of modest standing. */
function target(s: GameState, filter: (f: Fighter) => boolean = () => true): Fighter {
  const list = Object.keys(s.knowledge)
    .map((id) => s.fighters[id])
    .filter((f) => f.status === 'active' && !f.contractId && f.reputation < 60 && fighterAge(f, s.today) < 33 && filter(f))
  expect(list.length).toBeGreaterThan(0)
  return list[0]
}

function ledgerBalanced(s: GameState) {
  const sum = s.ledger.reduce((a, t) => a + t.amount, 0)
  expect(s.ledgerArchive + sum).toBe(player(s).cash)
}

function sign(s: GameState, f: Fighter): GameState {
  const promo = player(s)
  const ask = askTerms(s, f, promo, 'signing')
  const out = makeOffer(s, f.id, { ...ask, signingBonus: ask.signingBonus * 1.5, basePurse: ask.basePurse * 1.4, weeklyRetainer: ask.weeklyRetainer * 1.4, titlePromise: true }, 'signing')
  expect(out.ok).toBe(true)
  expect(out.round?.verdict).toBe('accept')
  return out.state
}

describe('scouting', () => {
  it('is deterministic for a seed', () => {
    const run = () => {
      const s = fresh()
      const f = target(s)
      const r = commissionReport(s, f.id, 'standard', s.scouts[0].id)
      expect(r.ok).toBe(true)
      let t = r.state
      for (let i = 0; i < 3; i++) t = advanceOneWeek(t)
      return JSON.stringify(t.knowledge[f.id])
    }
    expect(run()).toBe(run())
  })

  it('costs money through the ledger and arrives after the stated time', () => {
    const s = fresh()
    const f = target(s)
    const cash0 = player(s).cash
    const r = commissionReport(s, f.id, 'deep', s.scouts[0].id)
    const op = r.state.scoutOps[0]
    expect(op.cost).toBeGreaterThan(0)
    expect(player(r.state).cash).toBe(cash0 - op.cost)
    ledgerBalanced(r.state)
    expect(r.state.knowledge[f.id].reports.length).toBe(0) // not instant
    let t = r.state
    for (let i = 0; i < B.scouting.reportWeeks.deep; i++) t = advanceOneWeek(t)
    expect(t.knowledge[f.id].reports.length).toBe(1)
    expect(t.inbox.some((m) => m.subject.startsWith('Scout report ready'))).toBe(true)
  })

  it('refuses reports you cannot afford or a scout cannot take on', () => {
    const s = fresh()
    const f = target(s)
    player(s).cash = 10
    expect(commissionReport(s, f.id, 'deep', s.scouts[0].id).ok).toBe(false)
    const s2 = fresh()
    const [a, b, c] = Object.keys(s2.knowledge).map((id) => s2.fighters[id]).filter((x) => x.status === 'active')
    let t = commissionReport(s2, a.id, 'basic', s2.scouts[0].id).state
    t = commissionReport(t, b.id, 'basic', s2.scouts[0].id).state
    expect(commissionReport(t, c.id, 'basic', s2.scouts[0].id).ok).toBe(false)
  })

  it('never reveals exact hidden values: every range has width and the mean differs from truth', () => {
    let s = fresh()
    const ids = Object.keys(s.knowledge).slice(0, 40)
    for (const id of ids) {
      const r = commissionReport(s, id, 'deep', s.scouts[0].id)
      if (r.ok) s = r.state
      else {
        for (let i = 0; i < 4; i++) s = advanceOneWeek(s)
        s = commissionReport(s, id, 'deep', s.scouts[0].id).state
      }
    }
    for (let i = 0; i < 5; i++) s = advanceOneWeek(s)
    const v = viewsOf(s)
    let exact = 0, total = 0
    for (const id of ids) {
      const view = v.fighter(id)!
      for (const t of [...view.traits.physical, ...view.traits.technical, ...view.traits.mental, view.ceiling, view.grade]) {
        expect(t.hi - t.lo).toBeGreaterThanOrEqual(B.scouting.minRangeWidth)
        expect(t.lo).toBeLessThan(t.hi)
      }
      for (const k of SCOUT_TRAITS) {
        const truth = trueValue(s.fighters[id], k)
        total++
        if (Math.round(beliefOf(s, s.fighters[id], k).mean) === truth) exact++
      }
    }
    expect(exact / total).toBeLessThan(0.2) // best guesses are close but almost never the exact value
  })

  it('better scouts and deeper reports give narrower, more accurate estimates', () => {
    const measure = (depth: 'basic' | 'deep', quality: number) => {
      let err = 0, width = 0, n = 0
      for (let seed = 0; seed < 3; seed++) {
        const s = fresh('acc' + seed)
        const scout = { ...s.scouts[0], quality }
        const fighters = Object.keys(s.knowledge).map((id) => s.fighters[id]).filter((f) => f.status === 'active' && !s.knowledge[f.id].reports.length).slice(0, 40)
        for (const f of fighters) {
          applyReport(s, f, depth, scout)
          const t = viewsOf(s).fighter(f.id)!.traits.physical[0]
          err += Math.abs(beliefOf(s, f, 'power').mean - f.attributes.power)
          width += t.hi - t.lo
          n++
        }
      }
      return { err: err / n, width: width / n }
    }
    const basicLow = measure('basic', 25)
    const deepLow = measure('deep', 25)
    const deepHigh = measure('deep', 90)
    expect(deepLow.width).toBeLessThan(basicLow.width)
    expect(deepHigh.width).toBeLessThan(deepLow.width)
    expect(deepLow.err).toBeLessThan(basicLow.err)
    expect(deepHigh.err).toBeLessThan(deepLow.err)
  })

  it('repeated reports keep narrowing the range, and stale knowledge widens again', () => {
    let s = fresh()
    const f = target(s)
    const widthOf = (st: GameState) => { const t = viewsOf(st).fighter(f.id)!.traits.physical[0]; return t.hi - t.lo }
    const w0 = widthOf(s)
    for (let i = 0; i < 3; i++) {
      s = commissionReport(s, f.id, 'deep', s.scouts[0].id).state
      for (let k = 0; k < 4; k++) s = advanceOneWeek(s)
    }
    const w3 = widthOf(s)
    expect(w3).toBeLessThan(w0)
    for (let k = 0; k < 80; k++) s = advanceOneWeek(s)
    expect(widthOf(s)).toBeGreaterThan(w3)
  })

  it('talent searches discover previously unknown fighters', () => {
    let s = fresh()
    const before = Object.keys(s.knowledge).length
    const r = commissionSearch(s, { nation: null, weightClass: null, level: 'wide' }, s.scouts[0].id)
    expect(r.ok).toBe(true)
    s = r.state
    for (let i = 0; i < B.scouting.search.wide.weeks; i++) s = advanceOneWeek(s)
    expect(Object.keys(s.knowledge).length).toBeGreaterThanOrEqual(before + B.scouting.search.wide.found)
    ledgerBalanced(s)
  })

  it('a roster fighter becomes better known over time through daily contact', () => {
    let s = fresh()
    const f = playerRoster(s)[0]
    const w0 = viewsOf(s).fighter(f.id)!.grade
    for (let i = 0; i < 40; i++) s = advanceOneWeek(s)
    const w1 = viewsOf(s).fighter(f.id)!.grade
    expect(w1.hi - w1.lo).toBeLessThanOrEqual(w0.hi - w0.lo)
  })

  it('shortlist toggles', () => {
    const s = fresh()
    const f = target(s)
    const on = toggleShortlist(s, f.id)
    expect(on.shortlist).toContain(f.id)
    expect(toggleShortlist(on, f.id).shortlist).not.toContain(f.id)
  })
})

describe('negotiation & signing', () => {
  it('accepts a generous offer: fighter joins roster, leaves the market, bonus hits the ledger', () => {
    const s0 = fresh()
    const f = target(s0)
    const cash0 = player(s0).cash
    const rosterBefore = playerRoster(s0).length
    const marketBefore = freeAgents(s0).length
    const s = sign(s0, f)
    expect(s.fighters[f.id].contractId).toBeTruthy()
    expect(playerRoster(s).map((x) => x.id)).toContain(f.id)
    expect(playerRoster(s).length).toBe(rosterBefore + 1)
    expect(freeAgents(s).length).toBe(marketBefore - 1)
    const c = s.contracts[s.fighters[f.id].contractId!]
    expect(c.promotionId).toBe(s.playerPromotionId)
    expect(player(s).cash).toBe(cash0 - c.signingBonus)
    expect(s.ledger.some((t) => t.category === 'signingBonus' && t.amount === -c.signingBonus)).toBe(true)
    expect(s.obligations.some((o) => o.fighterId === f.id)).toBe(true) // title promise tracked
    ledgerBalanced(s)
  })

  it('rejects an insulting offer and counters a borderline one', () => {
    const s = fresh()
    const f = target(s)
    const promo = player(s)
    const ask = askTerms(s, f, promo, 'signing')
    const low = evaluateOffer(s, f, promo, { ...ask, signingBonus: 0, basePurse: ask.basePurse * 0.2, weeklyRetainer: ask.weeklyRetainer * 0.2, winBonus: 0 }, 'signing')
    expect(low.verdict).toBe('reject')
    expect(low.reasons.length).toBeGreaterThan(0)
    const mid = evaluateOffer(s, f, promo, { ...ask, signingBonus: ask.signingBonus * 0.5, basePurse: ask.basePurse * 0.85, weeklyRetainer: ask.weeklyRetainer * 0.85 }, 'signing')
    expect(['counter', 'accept']).toContain(mid.verdict)
  })

  it('a counter-offer is always acceptable when presented back', () => {
    for (let seed = 0; seed < 12; seed++) {
      const s = fresh('ctr' + seed)
      const f = target(s)
      const base = suggestedOffer(s, f, 'signing')
      const first = makeOffer(s, f.id, { ...base, basePurse: base.basePurse * 0.8, signingBonus: base.signingBonus * 0.7 }, 'signing')
      expect(first.ok).toBe(true)
      if (first.round!.verdict === 'counter') {
        const counter = first.round!.counter!
        const second = makeOffer(first.state, f.id, counter, 'signing')
        expect(second.round!.verdict).toBe('accept')
        expect(second.signed).toBeDefined()
      } else {
        expect(['accept', 'reject']).toContain(first.round!.verdict)
      }
    }
  })

  it('personality changes the ask: greedy fighters want more than humble ones; ambitious demand a title promise', () => {
    const s = fresh()
    const f = target(s, (x) => x.reputation > 20)
    const promo = player(s)
    const clone = (p: Fighter['personality']) => { const c = structuredClone(s); c.fighters[f.id].personality = p; return askTerms(c, c.fighters[f.id], promo, 'signing') }
    const greedy = offerValue(clone('Greedy'), f.popularity)
    const humble = offerValue(clone('Humble'), f.popularity)
    expect(greedy).toBeGreaterThan(humble * 1.1)
    const amb = structuredClone(s)
    amb.fighters[f.id].personality = 'Ambitious'
    amb.fighters[f.id].reputation = 60
    const rich = askTerms(amb, amb.fighters[f.id], promo, 'signing')
    const ev = evaluateOffer(amb, amb.fighters[f.id], promo, { ...rich, titlePromise: false, signingBonus: rich.signingBonus * 3, basePurse: rich.basePurse * 3 }, 'signing')
    expect(ev.verdict).toBe('counter')
    expect(ev.counter?.titlePromise).toBe(true)
  })

  it('loyal fighters give discounts on renewals; relationship matters', () => {
    const s = fresh()
    const f = playerRoster(s)[0]
    const loyal = structuredClone(s)
    loyal.fighters[f.id].personality = 'Loyal'
    const other = structuredClone(s)
    other.fighters[f.id].personality = 'Professional'
    const a = askTerms(loyal, loyal.fighters[f.id], player(loyal), 'renewal').basePurse
    const b = askTerms(other, other.fighters[f.id], player(other), 'renewal').basePurse
    expect(a).toBeLessThan(b)
    const happy = structuredClone(other)
    happy.fighters[f.id].promoRelations[happy.playerPromotionId] = 50
    expect(askTerms(happy, happy.fighters[f.id], player(happy), 'renewal').basePurse).toBeLessThan(b)
  })

  it('lowball spam breaks talks and locks the fighter out', () => {
    let s = fresh()
    const f = target(s)
    const low: Offer = normaliseOffer({ years: 1, fights: 2, minFightsPerYear: 2, signingBonus: 0, weeklyRetainer: 10, basePurse: 100, winBonus: 0, titleBonus: 0, ppvShare: 0, titlePromise: false })
    let broke = false
    for (let i = 0; i < 6 && !broke; i++) {
      const out = makeOffer(s, f.id, low, 'signing')
      s = out.state
      broke = s.negotiations[f.id]?.status === 'broken'
    }
    expect(broke).toBe(true)
    const again = makeOffer(s, f.id, low, 'signing')
    expect(again.ok).toBe(false)
    expect(again.error).toMatch(/weeks|collapsed/i)
  })

  it('walking away ends the negotiation without penalty', () => {
    const s = fresh()
    const f = target(s)
    const base = suggestedOffer(s, f, 'signing')
    const out = makeOffer(s, f.id, { ...base, basePurse: base.basePurse * 0.5 }, 'signing')
    expect(out.state.negotiations[f.id]).toBeDefined()
    expect(endNegotiation(out.state, f.id).negotiations[f.id]).toBeUndefined()
  })

  it('cannot sign what you cannot afford, a fighter under contract, or beyond the roster cap', () => {
    const s = fresh()
    const f = target(s)
    const ask = askTerms(s, f, player(s), 'signing')
    player(s).cash = 50
    expect(makeOffer(s, f.id, { ...ask, signingBonus: 5000 }, 'signing').ok).toBe(false)
    const s2 = fresh()
    const rival = Object.values(s2.fighters).find((x) => x.contractId && s2.contracts[x.contractId].promotionId !== s2.playerPromotionId)!
    expect(makeOffer(s2, rival.id, suggestedOffer(s2, rival, 'signing'), 'signing').ok).toBe(false)
    let s3 = fresh()
    const cap = B.market.rosterCap.Startup
    const pool = Object.keys(s3.knowledge).map((id) => s3.fighters[id]).filter((x) => x.status === 'active' && !x.contractId && x.reputation < 60)
    let signed = 0
    for (const g of pool) {
      if (playerRoster(s3).length >= cap) break
      player(s3).cash = 5_000_000
      const ask = askTerms(s3, g, player(s3), 'signing')
      const out = makeOffer(s3, g.id, { ...ask, signingBonus: ask.signingBonus * 2, basePurse: ask.basePurse * 2, weeklyRetainer: ask.weeklyRetainer * 2, titlePromise: true }, 'signing')
      if (out.ok && out.round?.verdict === 'accept') { s3 = out.state; signed++ }
    }
    expect(signed).toBeGreaterThan(0)
    expect(playerRoster(s3).length).toBeLessThanOrEqual(cap)
    const extra = pool.find((x) => !x.contractId && !s3.fighters[x.id].contractId)!
    const r = makeOffer(s3, extra.id, suggestedOffer(s3, extra, 'signing'), 'signing')
    if (playerRoster(s3).length >= cap) expect(r.ok).toBe(false)
  })
})

describe('contracts: renewal, expiry, release', () => {
  it('moves through renewal stages with messages', () => {
    let s = fresh()
    const f = playerRoster(s)[0]
    s.contracts[f.contractId!].endDay = s.today + 25 * 7
    s = advanceOneWeek(s)
    expect(s.inbox.some((m) => m.subject.includes('approaching expiry'))).toBe(true)
    for (let i = 0; i < 9; i++) s = advanceOneWeek(s)
    expect(s.inbox.some((m) => m.subject.includes('wants to talk about a new deal'))).toBe(true)
    for (let i = 0; i < 8; i++) s = advanceOneWeek(s)
    expect(s.inbox.some((m) => m.subject.startsWith('Final warning'))).toBe(true)
  })

  it('renews a contract: old one archived, new one active, bonus paid', () => {
    const s0 = fresh()
    const f = playerRoster(s0)[0]
    s0.contracts[f.contractId!].endDay = s0.today + 10 * 7
    const cash0 = player(s0).cash
    const ask = askTerms(s0, f, player(s0), 'renewal')
    const out = makeOffer(s0, f.id, { ...ask, signingBonus: ask.signingBonus * 1.5, basePurse: ask.basePurse * 1.5, weeklyRetainer: ask.weeklyRetainer * 1.5, titlePromise: true }, 'renewal')
    expect(out.ok).toBe(true)
    expect(out.round!.verdict).toBe('accept')
    const s = out.state
    const nc = s.contracts[s.fighters[f.id].contractId!]
    expect(nc.endDay).toBeGreaterThan(s0.today + 300)
    expect(s.contractHistory.some((c) => c.fighterId === f.id && c.status === 'renewed')).toBe(true)
    expect(player(s).cash).toBe(cash0 - nc.signingBonus)
    expect(Object.values(s.contracts).filter((c) => c.fighterId === f.id)).toHaveLength(1)
    ledgerBalanced(s)
  })

  it('renewal talks are closed when a contract is healthy', () => {
    const s = fresh()
    const f = playerRoster(s)[0]
    expect(makeOffer(s, f.id, suggestedOffer(s, f, 'renewal'), 'renewal').ok).toBe(false)
  })

  it('fighters get more expensive as their public standing grows', () => {
    const s = fresh()
    const f = playerRoster(s)[0]
    const before = offerValue(askTerms(s, f, player(s), 'renewal'), f.popularity)
    const t = structuredClone(s)
    t.fighters[f.id].reputation += 30
    t.fighters[f.id].popularity += 30
    expect(offerValue(askTerms(t, t.fighters[f.id], player(t), 'renewal'), t.fighters[f.id].popularity)).toBeGreaterThan(before * 1.4)
  })

  it('an expired contract frees the fighter into the market', () => {
    let s = fresh()
    const f = playerRoster(s).sort((a, b) => fighterAge(b, s.today) - fighterAge(a, s.today)).slice(-1)[0] // youngest: will not retire this week
    s.contracts[f.contractId!].endDay = s.today + 7
    s = advanceOneWeek(s)
    expect(s.fighters[f.id].contractId).toBeNull()
    expect(s.contractHistory.find((h) => h.fighterId === f.id)?.status).toBe('expired')
    expect(viewsOf(s).freeAgents().some((v) => v.id === f.id)).toBe(true)
  })

  it('releasing costs money, reputation and goodwill, and reaches the news and inbox', () => {
    const s0 = fresh()
    const [a, b] = playerRoster(s0)
    const c = s0.contracts[a.contractId!]
    const fee = releaseCost(s0, c)
    const cash0 = player(s0).cash
    const rep0 = player(s0).reputation
    const moraleB = s0.fighters[b.id].morale
    const r = releaseFighter(s0, a.id)
    expect(r.ok).toBe(true)
    const s = r.state
    expect(player(s).cash).toBe(cash0 - fee)
    expect(player(s).reputation).toBeLessThan(rep0)
    expect(s.fighters[a.id].contractId).toBeNull()
    expect(s.fighters[a.id].promoRelations[s.playerPromotionId]).toBeLessThan(0)
    expect(s.fighters[b.id].morale).toBeLessThan(moraleB)
    expect(playerRoster(s).map((x) => x.id)).not.toContain(a.id)
    expect(s.news[0].category).toBe('release')
    expect(s.inbox[0].subject).toContain('released')
    expect(s.contractHistory[0].status).toBe('released')
    ledgerBalanced(s)
    expect(releaseFighter(s, a.id).ok).toBe(false) // already gone
  })

  it('releasing an ex-signing who was promised a title shot marks the promise broken', () => {
    const f = target(fresh())
    let s = sign(fresh(), f)
    s = releaseFighter(s, f.id).state
    expect(s.obligations.find((o) => o.fighterId === f.id)?.status).toBe('broken')
  })
})

describe('the AI market', () => {
  it('rivals sign free agents, and the market refreshes', () => {
    let s = fresh()
    const start = freeAgents(s).length
    const day0 = s.today
    const signedBy = (st: GameState) => Object.values(st.fighters).filter((f) => f.history.some((h) => h.kind === 'signed' && h.day > day0 && h.promotionId !== st.playerPromotionId)).length
    for (let i = 0; i < 52; i++) s = advanceOneWeek(s)
    expect(signedBy(s)).toBeGreaterThan(5)
    const newPros = Object.values(s.fighters).filter((f) => f.history.some((h) => h.kind === 'turnedPro' && h.day > day0)).length
    expect(newPros).toBeGreaterThan(5)
    expect(freeAgents(s).length).toBeGreaterThan(start * 0.4)
    expect(freeAgents(s).length).toBeLessThan(start * 3)
  })

  it('strategies value fighters differently', () => {
    const s = fresh()
    const promos = Object.values(s.promotions).filter((p) => p.ai)
    const by = (st: string) => promos.find((p) => p.ai!.strategy === st)!
    const base = Object.values(s.fighters)[0]
    const mk = (over: Partial<Fighter>, attrs: number): Fighter => {
      const f = structuredClone(base)
      Object.assign(f, over)
      for (const k of Object.keys(f.attributes)) (f.attributes as unknown as Record<string, number>)[k] = attrs
      return f
    }
    const young = mk({ birthDay: s.today - 20 * 365, potential: 92, popularity: 15, reputation: 20, record: { wins: 4, losses: 0, draws: 0, koWins: 3, koLosses: 0 } }, 55)
    const old = mk({ birthDay: s.today - 30 * 365, potential: 70, popularity: 15, reputation: 60, record: { wins: 24, losses: 4, draws: 0, koWins: 14, koLosses: 1 } }, 70)
    const star = mk({ birthDay: s.today - 28 * 365, potential: 72, popularity: 85, reputation: 70, record: { wins: 20, losses: 2, draws: 0, koWins: 10, koLosses: 0 } }, 62)
    const prospect = by('prospectFactory'), trad = by('traditional'), money = by('money')
    // Judge with identical noise by using one promotion tier for all.
    for (const p of [prospect, trad, money]) p.tier = 'National'
    expect(aiFit(s, prospect, young).fit - aiFit(s, prospect, old).fit).toBeGreaterThan(aiFit(s, trad, young).fit - aiFit(s, trad, old).fit)
    expect(aiFit(s, prospect, young).eligible).toBe(true)
    expect(aiFit(s, prospect, old).eligible).toBe(false)
    expect(aiFit(s, money, star).fit - aiFit(s, money, old).fit).toBeGreaterThan(aiFit(s, trad, star).fit - aiFit(s, trad, old).fit)
  })

  it('regional promotions favour home-region fighters', () => {
    const s = fresh()
    const regional = Object.values(s.promotions).find((p) => p.ai?.strategy === 'regional' && p.homeCountry === 'ENG')!
    const base = Object.values(s.fighters)[0]
    const eng = structuredClone(base); eng.nationality = 'ENG'
    const arg = structuredClone(base); arg.nationality = 'ARG'
    expect(aiFit(s, regional, eng).fit).toBeGreaterThan(aiFit(s, regional, arg).fit)
  })

  it('rival signing a fighter you were negotiating with tells you and ends the talks', () => {
    let hit = false
    for (let seed = 0; seed < 6 && !hit; seed++) {
      let s = fresh('rival' + seed)
      // shortlist the best-looking free agents the rivals are likely to want
      const best = Object.keys(s.knowledge).map((id) => s.fighters[id]).filter((f) => f.status === 'active' && !f.contractId).sort((a, b) => b.reputation - a.reputation).slice(0, 12)
      for (const f of best) s = toggleShortlist(s, f.id)
      for (let i = 0; i < 40; i++) s = advanceOneWeek(s)
      hit = s.inbox.some((m) => /^.* sign .*/.test(m.subject) && m.from === 'Scouting')
    }
    expect(hit).toBe(true)
  })

  it('a rival that loses a fighter becomes more urgent to replace them', () => {
    let s = fresh()
    const rival = Object.values(s.promotions).find((p) => p.ai)!
    const c = Object.values(s.contracts).find((x) => x.promotionId === rival.id)!
    c.endDay = s.today + 7
    c.aiReviewed = true // rival decided not to renew
    s.today += 7
    processContracts(s) // the contract runs out…
    expect(s.promotions[rival.id].ai!.urgency).toBeGreaterThanOrEqual(1) // …so the rival is now in a hurry
  })
})

describe('integrity over time', () => {
  it('survives four years of mixed play with consistent state and a balanced ledger', () => {
    let s = fresh('long')
    const rng = new Rng(7)
    for (let week = 0; week < 52 * 4; week++) {
      if (player(s).cash < 20_000) post(s, 'other', 100_000, 'Test top-up') // keep the run active, via the ledger
      if (week % 6 === 0) {
        const pool = Object.keys(s.knowledge).map((id) => s.fighters[id]).filter((f) => f.status === 'active' && !f.contractId)
        if (pool.length) {
          const f = rng.pick(pool)
          const r = commissionReport(s, f.id, rng.pick(['basic', 'standard', 'deep'] as const), s.scouts[0].id)
          if (r.ok) s = r.state
        }
      }
      if (week % 13 === 0) {
        const pool = Object.keys(s.knowledge).map((id) => s.fighters[id]).filter((f) => f.status === 'active' && !f.contractId && f.reputation < 55)
        if (pool.length) {
          const f = rng.pick(pool)
          const out = makeOffer(s, f.id, suggestedOffer(s, f, 'signing'), 'signing')
          if (out.ok) s = out.state
        }
      }
      if (week % 17 === 0 && playerRoster(s).length > 3) s = releaseFighter(s, playerRoster(s)[0].id).state
      for (const f of playerRoster(s)) {
        const c = s.contracts[f.contractId!]
        if (Math.floor((c.endDay - s.today) / 7) <= 20 && week % 5 === 0) {
          const out = makeOffer(s, f.id, suggestedOffer(s, f, 'renewal'), 'renewal')
          if (out.ok) s = out.state
        }
      }
      s = advanceOneWeek(s)
    }
    for (const c of Object.values(s.contracts)) {
      expect(s.fighters[c.fighterId].contractId).toBe(c.id)
      expect(s.promotions[c.promotionId]).toBeDefined()
      expect(c.status).toBe('active')
    }
    for (const f of Object.values(s.fighters)) {
      if (f.contractId) expect(s.contracts[f.contractId]).toBeDefined()
      if (f.status === 'retired') expect(f.contractId).toBeNull()
      expect(f.history.length).toBeLessThanOrEqual(40)
    }
    for (const id of Object.keys(s.knowledge)) expect(s.fighters[id]).toBeDefined()
    for (const n of Object.values(s.negotiations)) expect(s.fighters[n.fighterId]).toBeDefined()
    for (const e of Object.values(s.knowledge)) for (const est of Object.values(e.est)) {
      expect(Number.isFinite(est.mean) && Number.isFinite(est.sd)).toBe(true)
      expect(est.sd).toBeGreaterThanOrEqual(B.scouting.minSd - 1e-9)
    }
    for (const p of Object.values(s.promotions)) expect(Number.isFinite(p.cash)).toBe(true)
    ledgerBalanced(s) // every pound is accounted for, including entries that aged out of the visible ledger
    const rosters = Object.values(s.promotions).map((p) => rosterOf(s, p.id).length)
    expect(Math.min(...rosters.filter((_, i) => i > 0))).toBeGreaterThan(3)
    expect(Number.isFinite(cashRunwayWeeks(s) ?? 0)).toBe(true)
  }, 120_000)

  it('ledger archive keeps cash reconciled after the visible ledger is truncated', () => {
    let s = fresh()
    for (let i = 0; i < 160; i++) s = advanceOneWeek(s)
    expect(s.ledger.length).toBeLessThanOrEqual(600)
    expect(s.ledgerArchive).not.toBe(0)
    ledgerBalanced(s)
  })
})

describe('persistence of knowledge, contracts and negotiations', () => {
  it('round-trips everything and gives identical views', () => {
    let s = fresh()
    const f = target(s)
    s = commissionReport(s, f.id, 'standard', s.scouts[0].id).state
    s = toggleShortlist(s, f.id)
    for (let i = 0; i < 3; i++) s = advanceOneWeek(s)
    const base = suggestedOffer(s, f, 'signing')
    s = makeOffer(s, f.id, { ...base, basePurse: base.basePurse * 0.6 }, 'signing').state
    const loaded = deserialiseGame(serialiseGame(s))!
    expect(loaded).toEqual(s)
    expect(JSON.stringify(viewsOf(loaded).fighter(f.id))).toBe(JSON.stringify(viewsOf(s).fighter(f.id)))
    expect(loaded.negotiations[f.id]).toBeDefined()
    expect(loaded.shortlist).toContain(f.id)
    expect(JSON.stringify(advanceOneWeek(loaded))).toBe(JSON.stringify(advanceOneWeek(s)))
  })

  it('migrates a Phase 1 (v1) save forward and keeps it playable', () => {
    const v2 = fresh()
    // Rebuild a v1-shaped save from a v2 state.
    const v1 = structuredClone(v2) as unknown as Record<string, any>
    v1.version = 1
    for (const k of ['contractHistory', 'negotiations', 'obligations', 'knowledge', 'scouts', 'scoutOps', 'shortlist', 'ledgerArchive']) delete v1[k]
    for (const p of Object.values<any>(v1.promotions)) delete p.ai
    for (const f of Object.values<any>(v1.fighters)) {
      for (const k of ['personalityNote', 'discipline', 'composure', 'injuryRisk', 'availableSince', 'promoRelations', 'history']) delete f[k]
      f.bio += ' Coaches call him the easiest fighter in the gym — always on weight, always on time.'
    }
    for (const c of Object.values<any>(v1.contracts)) {
      c.minPurse = c.basePurse
      for (const k of ['basePurse', 'winBonus', 'titleBonus', 'ppvShare', 'signingBonus', 'minFightsPerYear', 'releaseFee', 'titlePromise', 'status', 'notices', 'aiReviewed']) delete c[k]
      c.warned12 = false; c.warned4 = false
    }
    const migrated = migrate(JSON.parse(JSON.stringify(v1)))!
    expect(migrated.version).toBe(4)
    expect(migrated.scouts.length).toBe(1)
    expect(Object.keys(migrated.knowledge).length).toBeGreaterThan(50)
    expect(Object.values(migrated.fighters).every((f) => !f.bio.includes('easiest fighter in the gym'))).toBe(true)
    let t = migrated
    for (let i = 0; i < 30; i++) t = advanceOneWeek(t)
    expect(t.today).toBe(migrated.today + 30 * 7)
    expect(viewsOf(t).mine().length).toBe(4)
  })
})
