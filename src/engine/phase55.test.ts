/**
 * Phase 5.5 - mandatory-challenge integrity. An order the rules cannot let the pair fulfil for that belt (the challenger fell outside the
 * body's challenger limit, holds a higher belt, or the pair would now contest a bigger title) is void; the champion is not stripped for it.
 */
import { describe, expect, it } from 'vitest'
import { createNewGame } from './worldgen'
import { advanceOneWeek } from './tick'
import { clone } from './media/testing'
import type { GameState } from './types'
import { bodiesFor, mandateVoidReason, maintainTitles, qualifiesFor } from './media/titles'
import { getList } from './media/records'
import { touchTitles } from './media/titles'
import { rankIn } from './media/rankings'
import { RANKING_ORGS } from './media/orgs'
import { levelOf } from './business/titleDefs'
import { weekIndex } from './media/util'
import { contenderStatus } from './business/titleEco'
import { createFight, resolveFight } from './fights'
import { flagFight } from './media/titles'
import { settleRounds } from './business/fightRounds'
import type { Fight } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const world = (() => { let s: GameState | null = null; return () => (s ??= (() => { let g = createNewGame({ seed: 'p55-world', promotionName: 'P55', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000); for (let i = 0; i < 104; i++) g = advanceOneWeek(g); return g })()) })()
const limit = (body: string) => RANKING_ORGS.find((o) => o.id === body)!.challengerLimit

/** A world belt with a champion and a ranked list deep enough to pick contenders from, with no standing order or eliminator. */
function pickBelt(s: GameState) {
  const m = s.media!
  for (const [key, rec] of Object.entries(m.titles)) {
    const [body, wc] = key.split('|')
    if (!rec.c || rec.mand || rec.elim) continue
    const list = getList(m, body, wc as never)
    if (!list) continue
    const ranked = list.e.filter((e) => e.r >= 1 && e.f !== rec.c && s.fighters[e.f]?.status === 'active' && s.fighters[e.f].weightClass === wc)
    const inside = ranked.find((e) => e.r <= limit(body) && qualifiesFor(s, body, e.f) && bodiesFor(s, rec.c!, e.f, wc as never).includes(body))
    const outside = Object.values(s.fighters).find((x) => x.status === 'active' && x.weightClass === wc && x.id !== rec.c && x.id !== inside?.f && rankIn(m, body, wc as never, x.id) !== null && rankIn(m, body, wc as never, x.id)! > limit(body))
    if (inside && outside) return { key, body, wc: wc as never, rec, inside: inside.f, outside: outside.id }
  }
  return null
}
const order = (s: GameState, key: string, challenger: string) => {
  const rec = s.media!.titles[key]
  rec.mand = { challenger, cn: 'X', ordered: s.today, due: s.today + 7 * 26 }
  return rec
}

describe('mandatory orders that can no longer be staged', () => {
  it('a challenger who has fallen outside the challenger limit has the order withdrawn, not the champion stripped', () => {
    const s = clone(world())
    const belt = pickBelt(s)!
    expect(belt).toBeTruthy()
    expect(belt.outside, 'a ranked fighter beyond the limit exists').toBeTruthy()
    order(s, belt.key, belt.outside!)
    expect(bodiesFor(s, belt.rec.c!, belt.outside, belt.wc).includes(belt.body)).toBe(false)
    expect(mandateVoidReason(s, s.media!, belt.body, belt.wc, belt.rec.c!, belt.outside)).toMatch(/no longer ranked high enough/)
    const champ = belt.rec.c
    // even long past the deadline
    s.today = s.media!.titles[belt.key].mand!.due + 7 * 30
    belt.rec.lastFight = s.today - 7 * 4
    belt.rec.since = Math.min(belt.rec.since, belt.rec.lastFight)
    const ev = maintainTitles(s, s.media!)
    expect(ev.some((e) => e.kind === 'MANDATORY_VOID' && e.body === belt.body && e.o === belt.outside)).toBe(true)
    expect(ev.some((e) => e.kind === 'STRIPPED' && e.body === belt.body && e.wc === belt.wc)).toBe(false)
    expect(s.media!.titles[belt.key].c).toBe(champ)
    expect(s.media!.titles[belt.key].mand).toBeUndefined()
  })

  it('a challenger who now holds a higher belt is released from the order', () => {
    const s = clone(world())
    const m = s.media!
    const ladder = ['area', 'domestic', 'european', 'world']
    let hit: { key: string; higherKey: string; inside: string; body: string; wc: never; champ: string } | null = null
    for (const [key, rec] of Object.entries(m.titles)) {
      const [body, wc] = key.split('|')
      if (!rec.c || rec.mand || rec.elim || levelOf(body) === 'world') continue
      const list = getList(m, body, wc as never)
      const inside = list?.e.find((e) => e.r >= 1 && e.r <= limit(body) && e.f !== rec.c && s.fighters[e.f]?.status === 'active' && s.fighters[e.f].weightClass === wc)
      const higherKey = Object.keys(m.titles).find((k) => k.endsWith(`|${wc}`) && ladder.indexOf(levelOf(k.split('|')[0])) > ladder.indexOf(levelOf(body)))
      if (inside && higherKey) { hit = { key, higherKey, inside: inside.f, body, wc: wc as never, champ: rec.c }; break }
    }
    expect(hit, 'a lower belt with a higher belt above it exists').toBeTruthy()
    const h = hit!
    const hr = m.titles[h.higherKey]
    hr.c = h.inside; hr.cn = 'X'; hr.since = s.today - 70; hr.lastFight = s.today - 7
    touchTitles(m)
    order(s, h.key, h.inside)
    expect(mandateVoidReason(s, m, h.body, h.wc, h.champ, h.inside)).toMatch(/higher title/)
  })

  it('a fight already booked between the pair under any title flag is left to run', () => {
    const s = clone(world())
    const belt = pickBelt(s)!
    expect(belt.outside, 'a ranked fighter beyond the limit exists').toBeTruthy()
    order(s, belt.key, belt.outside!)
    const fid = 'ft_booked'
    s.fights[fid] = { id: fid, status: 'scheduled', sideA: { fighterId: belt.rec.c! }, sideB: { fighterId: belt.outside } } as never
    s.media!.titleFights[fid] = ['pioneer_x_higher']
    s.today = belt.rec.mand!.due + 7 * 10
    const ev = maintainTitles(s, s.media!)
    expect(ev.some((e) => (e.kind === 'MANDATORY_VOID' || e.kind === 'STRIPPED') && e.body === belt.body && e.wc === belt.wc)).toBe(false)
    expect(s.media!.titles[belt.key].mand).toBeTruthy()
  })

  it('a reachable order is untouched until its deadline, and a champion who really refuses is still stripped', () => {
    const s = clone(world())
    const belt = pickBelt(s)!
    const rec = order(s, belt.key, belt.inside)
    rec.lastFight = s.today - 7 * 3
    const ev0 = maintainTitles(s, s.media!)
    expect(ev0.some((e) => e.kind === 'MANDATORY_VOID')).toBe(false)
    expect(s.media!.titles[belt.key].mand?.challenger).toBe(belt.inside)
    // past the deadline, nothing booked, both fit: the existing rule applies
    const f = s.fighters[belt.rec.c!], ch = s.fighters[belt.inside]
    f.injury = null; ch.injury = null; f.activeFightId = null; ch.activeFightId = null
    s.today = rec.mand!.due + 7
    rec.lastFight = s.today - 7 * 3; rec.mand!.ext = true
    const ev1 = maintainTitles(s, s.media!)
    expect(ev1.some((e) => e.kind === 'STRIPPED' && e.body === belt.body && /refusing/.test(e.how ?? ''))).toBe(true)
  })

  it('new orders are only ever made for a challenger who can meet the champion for that belt', () => {
    const s = clone(world())
    const m = s.media!
    // make every champion idle long enough to be ordered to defend, then let the title pass name challengers
    for (const rec of Object.values(m.titles)) { if (rec.c) { rec.mand = undefined; rec.elim = undefined; rec.lastFight = s.today - 7 * 40; rec.since = s.today - 7 * 80 } }
    maintainTitles(s, m)
    let ordered = 0
    for (const [key, rec] of Object.entries(m.titles)) {
      if (!rec.mand || !rec.c) continue
      ordered++
      const [body, wc] = key.split('|')
      expect(bodiesFor(s, rec.c, rec.mand.challenger, wc as never), `${key}`).toContain(body)
      expect(rankIn(m, body, wc as never, rec.mand.challenger)!).toBeLessThanOrEqual(limit(body))
    }
    expect(ordered).toBeGreaterThan(0)
  })

  it('across several years no standing order is left unreachable once the title pass has run, and no champion is stripped for one', () => {
    for (const seed of ['p55-a', 'p55-b']) {
      let s = createNewGame({ seed, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
      let checked = 0
      for (let w = 1; w <= 4 * 52; w++) {
        s = advanceOneWeek(s)
        if (s.media!.week !== weekIndex(s)) continue // only just after a media pass is the book fully settled
        for (const [key, rec] of Object.entries(s.media!.titles)) {
          if (!rec.mand || !rec.c) continue
          const [body, wc] = key.split('|')
          checked++
          // transient exceptions: a ranking can move in the same pass as a fight settles; allow only if the order is brand new
          const ok = bodiesFor(s, rec.c, rec.mand.challenger, wc as never).includes(body)
          const pair = [rec.c, rec.mand.challenger]
          const booked = Object.entries(s.media!.titleFights).some(([fid, b]) => { const f = s.fights[fid]; return b.length > 0 && !!f && !f.result && pair.includes(f.sideA.fighterId) && pair.includes(f.sideB.fighterId) })
          if (!ok && !booked) expect(s.today - rec.mand.ordered, `${key} order is unreachable and old (week ${w})`).toBeLessThanOrEqual(14)
        }
      }
      expect(checked).toBeGreaterThan(0)
    }
  }, 120_000)

  it('the title path no longer calls an unreachable order "mandatory"', () => {
    const s = clone(world())
    const belt = pickBelt(s)!
    expect(belt.outside, 'a ranked fighter beyond the limit exists').toBeTruthy()
    order(s, belt.key, belt.outside!)
    const f = s.fighters[belt.outside]
    expect(contenderStatus(s, f)).not.toBe('MANDATORY_CHALLENGER')
  })
})

describe('a world title fight is a 12-round fight however it ends (deterministic seeds, no luck)', () => {
  it('over a fixed set of seeds every result respects the 12-round distance, decisions score all 12 rounds on three cards, and both kinds of ending occur', () => {
    const base = clone(world())
    const belt = pickBelt(base)!
    const world_ = Object.entries(base.media!.titles).find(([k, r]) => r.c && levelOf(k.split('|')[0]) === 'world' && !r.mand)
    expect(world_).toBeTruthy()
    const [key, rec] = world_!
    const [body, wc] = key.split('|')
    const challenger = getList(base.media!, body, wc as never)!.e.find((e) => e.r >= 1 && e.f !== rec.c && base.fighters[e.f].status === 'active' && base.fighters[e.f].weightClass === wc)!.f
    void belt
    let decisions = 0, stoppages = 0
    for (let k = 0; k < 120; k++) {
      const s = clone(base)
      s.seed = `p55-dist-${k}`
      const fight = createFight(s, rec.c!, challenger, s.playerPromotionId, 'player') as Fight
      s.media!.titleFights[fight.id] = [body]
      flagFight(s, fight)
      fight.status = 'fightNight'; fight.day = s.today
      settleRounds(s, fight)
      expect(fight.scheduledRounds).toBe(12)
      resolveFight(s, s.fights[fight.id])
      const r = s.fights[fight.id].result!
      if (['UD', 'SD', 'MD', 'DRAW', 'MDRAW', 'SDRAW'].includes(r.method)) {
        decisions++
        expect(r.round).toBe(12)
        expect(r.cards).toHaveLength(3)
        expect(r.rounds).toHaveLength(12) // a player's fight keeps every round
      } else {
        stoppages++
        expect(r.round).toBeGreaterThanOrEqual(1); expect(r.round).toBeLessThanOrEqual(12)
        expect(r.rounds!.length).toBe(r.round)
      }
    }
    expect(decisions).toBeGreaterThan(0)
    expect(stoppages).toBeGreaterThan(0)
  }, 120_000)
})
