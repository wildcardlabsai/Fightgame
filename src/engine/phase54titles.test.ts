/**
 * Phase 5.4 — the title business around the ecosystem: appeal and unification effects, division moves with relinquishment,
 * new career codes, and the title-integrity invariants those moves must keep.
 */
import { describe, expect, it } from 'vitest'
import { createNewGame } from './worldgen'
import { advanceOneWeek } from './tick'
import { clone } from './media/testing'
import { getCareer, getReigns } from './media/records'
import { titlesHeldBy } from './media/titles'
import { fightAppeal } from './events/demand'
import { titleAppeal } from './business/titleEco'
import { applyDivisionMove, campAgrees, divisionMoveOptions, aiDivisionMoves } from './business/divisions'
import { changeDivision } from './commands'
import { LEVEL_STAKES } from './business/titleDefs'
import type { Fight, GameState } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const world = (() => { let s: GameState | null = null; return () => (s ??= (() => { let g = createNewGame({ seed: 'p54-titles', promotionName: 'P54', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000); for (let i = 0; i < 90; i++) g = advanceOneWeek(g); return g })()) })()

function championMoving(s: GameState) {
  for (const [k, rec] of Object.entries(s.media!.titles)) {
    if (!rec.c) continue
    const f = s.fighters[rec.c]
    if (f.status !== 'active' || f.activeFightId) continue
    if (divisionMoveOptions(s, f).some((o) => o.dir === 'up' && !o.blocked)) return { f, key: k }
  }
  throw new Error('no champion free to move')
}

describe('division moves and title relinquishment', () => {
  it('a champion who moves up relinquishes every belt at the old weight, with the reason recorded; no overlapping reigns, no belt held in a division the holder has left', () => {
    const s = clone(world())
    const { f } = championMoving(s)
    const from = f.weightClass
    const held = titlesHeldBy(s.media!, f.id).filter((t) => t.wc === from)
    expect(held.length).toBeGreaterThan(0)
    const to = divisionMoveOptions(s, f).find((o) => o.dir === 'up')!.to
    const power = f.attributes.power, speed = f.attributes.speed
    expect(applyDivisionMove(s, f.id, to)).toBeNull()
    expect(f.weightClass).toBe(to)
    expect(f.attributes.power).toBeGreaterThan(power)
    expect(f.attributes.speed).toBeLessThan(speed)
    expect(titlesHeldBy(s.media!, f.id).filter((t) => t.wc === from)).toHaveLength(0)
    const reigns = getReigns(s.media!).filter((r) => r.f === f.id && r.wc === from && r.to === s.today)
    expect(reigns.length).toBeGreaterThanOrEqual(held.length)
    for (const r of reigns) expect(r.how).toMatch(/relinquished/)
    // The media pass turns it into career lines and a story.
    let g = s
    for (let i = 0; i < 2; i++) g = advanceOneWeek(g)
    const kinds = getCareer(g.media!, f.id).map((c) => c.k)
    expect(kinds).toContain('DIVISION_MOVE')
    expect(kinds).toContain('VACATED')
    for (const [k, rec] of Object.entries(g.media!.titles)) if (rec.c && g.fighters[rec.c].status === 'active') expect(g.fighters[rec.c].weightClass, k).toBe(k.split('|')[1])
  })

  it('a booked fighter cannot move; only one move a year; the camp must agree; the player can only move their own fighters', () => {
    const s = clone(world())
    const f = Object.values(s.fighters).find((x) => x.status === 'active' && !x.activeFightId && (x.lastFightDay === null || s.today - x.lastFightDay > 28) && !divisionMoveOptions(s, x)[0]?.blocked)!
    const o = divisionMoveOptions(s, f)[0]
    f.activeFightId = 'f_x'
    expect(applyDivisionMove(s, f.id, o.to)).toMatch(/fight booked/i)
    f.activeFightId = null
    expect(applyDivisionMove(s, f.id, o.to)).toBeNull()
    expect(applyDivisionMove(s, f.id, divisionMoveOptions(s, f)[0].to)).toMatch(/within the last year/i)
    const mine = Object.values(s.fighters).find((x) => x.contractId && s.contracts[x.contractId]?.promotionId === s.playerPromotionId)!
    mine.lastFightDay = null; if (s.business?.moved) delete s.business.moved[mine.id] // a fixture: this fighter is free to move (the world may have moved or booked them)
    const other = Object.values(s.fighters).find((x) => x.status === 'active' && x.id !== mine.id && !(x.contractId && s.contracts[x.contractId]?.promotionId === s.playerPromotionId))!
    expect(changeDivision(s, other.id, divisionMoveOptions(s, other)[0].to).ok).toBe(false)
    mine.promoRelations[s.playerPromotionId] = -40
    expect(campAgrees(s, mine)).toMatch(/trust/)
    expect(changeDivision(s, mine.id, divisionMoveOptions(s, mine)[0].to).ok).toBe(false)
    mine.promoRelations[s.playerPromotionId] = 10
    mine.activeFightId = null
    const r = changeDivision(s, mine.id, divisionMoveOptions(s, mine)[0].to)
    expect(r.ok, r.error).toBe(true)
    expect(r.state.fighters[mine.id].weightClass).not.toBe(mine.weightClass)
  })

  it('rivals’ moves are rare, deterministic and only happen on the fighter’s own ambition', () => {
    const a = clone(world()), b = clone(world())
    const before = Object.fromEntries(Object.values(a.fighters).map((f) => [f.id, f.weightClass]))
    for (let w = 0; w < 52; w++) { a.today += 7; b.today += 7; aiDivisionMoves(a); aiDivisionMoves(b) }
    expect(JSON.stringify(a.fighters)).toBe(JSON.stringify(b.fighters))
    const moved = Object.values(a.fighters).filter((f) => before[f.id] !== f.weightClass).length
    expect(moved).toBeLessThan(Object.keys(a.fighters).length * 0.08)
  })
})

describe('title appeal and unification', () => {
  const fightOf = (s: GameState, level: 'area' | 'domestic' | 'european' | 'world', kind: 'title' | 'eliminator' | 'unification'): Fight => {
    const t = Object.values(s.fights).find((x) => x.result)!
    return { ...t, id: 'f_ap', title: { name: 'x', tier: 'world', level, kind, bodies: kind === 'unification' ? ['atlas', 'pioneer'] : ['atlas'] } } as Fight
  }
  it('a belt adds pull in proportion to its level; a unification adds more; an eliminator less; nothing when no belt', () => {
    const s = clone(world())
    s.media!.effects = true
    const none = { ...fightOf(s, 'world', 'title'), title: undefined } as Fight
    expect(titleAppeal(s, none)).toBe(0)
    const a = titleAppeal(s, fightOf(s, 'area', 'title')), d = titleAppeal(s, fightOf(s, 'domestic', 'title')), e = titleAppeal(s, fightOf(s, 'european', 'title')), w = titleAppeal(s, fightOf(s, 'world', 'title'))
    expect(a).toBeLessThan(d); expect(d).toBeLessThan(e); expect(e).toBeLessThan(w)
    expect(titleAppeal(s, fightOf(s, 'world', 'unification'))).toBeGreaterThan(w)
    expect(titleAppeal(s, fightOf(s, 'world', 'eliminator'))).toBeLessThan(w)
    expect(w).toBeLessThanOrEqual(LEVEL_STAKES.world.appeal)
    const f = fightOf(s, 'world', 'title')
    expect(fightAppeal(s, f)).toBeGreaterThan(fightAppeal(s, none))
  })
  it('the coupling gate holds: with the media world not feeding the economy a belt adds nothing', () => {
    const s = clone(world())
    s.media!.effects = false
    expect(titleAppeal(s, fightOf(s, 'world', 'title'))).toBe(0)
  })
})

describe('advisor integration (public facts only)', () => {
  it('flags a promise that is running out of time and an offer that is a lowball, without revealing anything hidden', async () => {
    const { businessAdvice, contractTalkAdvice } = await import('./advisor')
    const { createCommitment } = await import('./business/commitments')
    const { openingOffer } = await import('./business/contractTalks')
    const { ambitionOf } = await import('./business/manager')
    const s = clone(world())
    const mine = Object.values(s.fighters).find((x) => x.contractId && s.contracts[x.contractId]?.promotionId === s.playerPromotionId)!
    const c = createCommitment(s, mine, { kind: 'activity', weeks: 4 })!
    s.business!.commitments.find((x) => x.id === c.id)!.dueDay = s.today + 3 * 7
    const adv = businessAdvice(s)
    const a = adv.find((x) => x.id === `promise-${c.id}`)
    expect(a?.level).toBe('highRisk')
    expect(JSON.stringify(adv)).not.toContain(ambitionOf(s, mine).label)
    const free = Object.values(s.fighters).find((f) => f.status === 'active' && !f.contractId)!
    const low = { ...openingOffer(s, free, 'signing'), basePurse: 100, signingBonus: 0, weeklyRetainer: 10, winBonus: 0 }
    expect(contractTalkAdvice(s, free.id, low, 'signing').some((x) => /lowball/i.test(x.title))).toBe(true)
    expect(contractTalkAdvice(s, free.id, { ...openingOffer(s, free, 'signing'), pathway: { kind: 'activity', weeks: 52 } }, 'signing').some((x) => /promise/i.test(x.title))).toBe(true)
  })
})
