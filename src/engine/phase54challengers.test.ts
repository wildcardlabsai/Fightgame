/**
 * Realistic title challenges. Being rated is not enough: a challenger needs the record the belt asks for, and the champion's camp
 * takes a voluntary challenge only when it makes sense for them. The body's own orders (mandatory, eliminator) cannot be refused.
 */
import { describe, expect, it } from 'vitest'
import { createNewGame } from './worldgen'
import { advanceOneWeek } from './tick'
import { clone } from './media/testing'
import { getList } from './media/records'
import { bodiesFor, qualifiesFor, titleKey } from './media/titles'
import { approachOpponent } from './fightNegotiation'
import { championCampResponse } from './business/titleCamp'
import { stakesBetween } from './business/stakes'
import { titleEligibility } from './business/titleEco'
import { titleBoard } from './business/views'
import { CHALLENGER_REQ, TITLE_DEFS, TITLE_DEF_BY_ID, challengerShortfall, levelOf } from './business/titleDefs'
import { newLog, playWeek, STRATEGIES } from './sim/strategies'
import type { GameState } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const mk = (seed: string) => createNewGame({ seed, promotionName: 'P54', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
const world = (() => { let s: GameState | null = null; return () => (s ??= (() => { let g = mk('p54-challengers'); for (let i = 0; i < 110; i++) g = advanceOneWeek(g); return g })()) })()

/** A world belt with a champion and a ranked fighter inside its challenger range, in a scratch copy. */
function worldBelt(s: GameState) {
  for (const [key, rec] of Object.entries(s.media!.titles)) {
    const [body, wc] = key.split('|')
    if (!rec.c || levelOf(body) !== 'world') continue
    const d = TITLE_DEF_BY_ID[body]
    const list = getList(s.media!, body, wc as never)!.e.filter((e) => e.r >= 1 && e.r <= d.challengerLimit && e.f !== rec.c && s.fighters[e.f].status === 'active')
    if (list.length >= 2) return { body, wc: wc as never, champ: rec.c, list, rec }
  }
  throw new Error('no world belt in the test world')
}

const setRecord = (s: GameState, id: string, w: number, l: number) => { s.fighters[id].record.wins = w; s.fighters[id].record.losses = l; s.fighters[id].record.draws = 0 }

describe('the record a challenger needs', () => {
  it('rises with the level, and a 5-2 fighter is not a title challenger at any level', () => {
    const order = ['area', 'domestic', 'european', 'world'] as const
    for (let i = 1; i < order.length; i++) { expect(CHALLENGER_REQ[order[i]].fights).toBeGreaterThan(CHALLENGER_REQ[order[i - 1]].fights); expect(CHALLENGER_REQ[order[i]].wins).toBeGreaterThanOrEqual(CHALLENGER_REQ[order[i - 1]].wins) }
    for (const d of TITLE_DEFS) {
      expect(challengerShortfall(d, { wins: 5, losses: 2, draws: 0 }), d.id).toMatch(/professional fights/)
      const q = d.challenger
      expect(challengerShortfall(d, { wins: q.wins, losses: Math.max(0, Math.ceil(q.wins / q.share) - q.wins), draws: 0 }) === null || q.fights > q.wins, d.id).toBe(true)
      expect(challengerShortfall(d, { wins: q.fights, losses: 0, draws: 0 }), d.id).toBeNull()
      expect(challengerShortfall(d, { wins: q.wins - 1, losses: q.fights, draws: 0 }), d.id).toMatch(/wins|record/)
    }
  })

  it('the reported case: a 5-2 fighter ranked in a champion\'s range cannot be matched with a 15-3 champion for the belt', () => {
    const s = clone(world())
    const { body, wc, champ, list } = worldBelt(s)
    setRecord(s, champ, 15, 3)
    const x = list[0].f
    setRecord(s, x, 5, 2)
    expect(qualifiesFor(s, body, x)).toBe(false)
    expect(bodiesFor(s, x, champ, wc)).not.toContain(body)
    expect(stakesBetween(s, x, champ, wc).bodies).not.toContain(body)
    const e0 = titleEligibility(s, s.fighters[x], body)
    expect(['unranked', 'unqualified']).toContain(e0.status) // too few fights to be rated at all for a world belt
    expect(e0.canChallengeNow).toBe(false)
    // Rated and inside the range, but the record is not enough: say so.
    setRecord(s, x, 9, 4)
    const e = titleEligibility(s, s.fighters[x], body)
    expect(e.status).toBe('unqualified')
    expect(e.canChallengeNow).toBe(false)
    expect(e.reasons.join(' ')).toMatch(/not yet a credible challenger/)
    // …and the board shows it, instead of listing him as a challenger.
    const row = titleBoard(s, 'world', wc).find((c) => c.body === body)!.contenders.find((c) => c.id === x)
    if (row) { expect(row.qualified).toBe(false); expect(row.need).toMatch(/Needs/) }
  })

  it('a challenger the body has ordered is exempt from the record requirement', () => {
    const s = clone(world())
    const { body, wc, champ, list, rec } = worldBelt(s)
    const x = list[0].f
    setRecord(s, x, 5, 2)
    rec.mand = { challenger: x, cn: 'X', ordered: s.today, due: s.today + 120 }
    expect(bodiesFor(s, x, champ, wc)).toContain(body)
  })
})

describe('the champion\'s camp decides a voluntary challenge', () => {
  it('a board-ordered challenge is always accepted; a voluntary one is not; the answer is the same when asked again; the outlook is a word, not a number', () => {
    const s = clone(world())
    const { body, wc, champ, list, rec } = worldBelt(s)
    const sorted = list.slice().sort((a, b) => b.r - a.r)
    const weak = sorted[0].f
    for (const id of [weak, list[0].f]) setRecord(s, id, 14, 3)
    s.fighters[weak].reputation = 5; s.fighters[weak].popularity = 5
    const a = championCampResponse(s, champ, weak, wc, [body]), b = championCampResponse(s, champ, weak, wc, [body])
    expect(a).toEqual(b)
    expect(a.ordered).toBe(false)
    expect(['strong', 'fair', 'weak']).toContain(a.outlook)
    rec.mand = { challenger: weak, cn: 'W', ordered: s.today, due: s.today + 120 }
    const ordered = championCampResponse(s, champ, weak, wc, [body])
    expect(ordered).toMatchObject({ accept: true, ordered: true })
    expect(JSON.stringify(a)).not.toMatch(/probab|roll|0\.\d{3}/)
  })

  it('across many quarters, a bankable challenger is accepted far more often than a long shot', () => {
    const s0 = clone(world())
    const { body, wc, champ, list } = worldBelt(s0)
    const strong = list[0].f, weak = list[list.length - 1].f
    for (const id of [strong, weak]) setRecord(s0, id, 16, 3)
    s0.fighters[strong].reputation = s0.fighters[champ].reputation; s0.fighters[strong].popularity = s0.fighters[champ].popularity
    s0.fighters[weak].reputation = 8; s0.fighters[weak].popularity = 6
    let ok = { strong: 0, weak: 0 }
    const N = 120
    for (let i = 0; i < N; i++) {
      const s = clone(s0); s.seed = `roll-${i}`
      if (championCampResponse(s, champ, strong, wc, [body]).accept) ok.strong++
      if (championCampResponse(s, champ, weak, wc, [body]).accept) ok.weak++
    }
    expect(ok.strong / N).toBeGreaterThan(0.45)
    expect(ok.weak / N).toBeLessThan(0.4)
    expect(ok.strong / N - ok.weak / N).toBeGreaterThan(0.25)
  })

  it('the player\'s approach is turned down by the champion\'s camp when it should be, and cannot be when the board ordered it', () => {
    const s = clone(world())
    const { body, wc, champ, list } = worldBelt(s)
    const weak = list[list.length - 1].f
    setRecord(s, weak, 14, 3)
    s.fighters[weak].reputation = 4; s.fighters[weak].popularity = 4
    const own = Object.values(s.contracts).find((x) => x.promotionId === s.playerPromotionId && x.status === 'active')!
    s.fighters[own.fighterId].contractId = null
    own.fighterId = weak; s.fighters[weak].contractId = own.id
    for (const id of [weak, champ]) { s.fighters[id].activeFightId = null; s.fighters[id].injury = null; s.fighters[id].suspendedUntil = null; s.fighters[id].lastFightDay = null }
    // Find a quarter in which the camp declines (the long shot is refused most of the time), then show the same ask succeeds once ordered.
    let declined = false
    for (let i = 0; i < 40 && !declined; i++) {
      const t = clone(s); t.seed = `ask-${i}`
      const r = approachOpponent(t, weak, champ)
      if (!r.ok) { declined = true; expect(r.error).toMatch(/turned the challenge down/); expect(r.state).toBe(t); expect(approachOpponent(t, weak, champ).ok).toBe(false) /* same answer again */
        t.media!.titles[titleKey(body, wc)].mand = { challenger: weak, cn: 'W', ordered: t.today, due: t.today + 120 }
        const o = approachOpponent(t, weak, champ)
        expect(o.ok, o.error).toBe(true)
        expect(o.state.fights[o.fightId!].status).toBe('negotiating') }
    }
    expect(declined).toBe(true)
  })

  it('a champion who has not defended for a long time is likelier to take a challenger', () => {
    const s = clone(world())
    const { body, wc, champ, list } = worldBelt(s)
    const x = list[list.length - 1].f
    setRecord(s, x, 14, 3)
    let fresh = 0, stale = 0
    for (let i = 0; i < 150; i++) {
      const t = clone(s); t.seed = `idle-${i}`
      t.media!.titles[titleKey(body, wc)].lastFight = t.today - 7
      if (championCampResponse(t, champ, x, wc, [body]).accept) fresh++
      t.media!.titles[titleKey(body, wc)].lastFight = t.today - 7 * 80
      if (championCampResponse(t, champ, x, wc, [body]).accept) stale++
    }
    expect(stale).toBeGreaterThanOrEqual(fresh)
  })
})

describe('over three bot-played years', () => {
  it('no title fight is booked with an unqualified challenger unless the body ordered it; far fewer fighters can challenge than are rated', () => {
    let s = mk('p54-challengers-long')
    const log = newLog()
    const seen = new Set<string>()
    const bad: string[] = []
    let checked = 0
    let rated = 0, credible = 0
    for (let w = 1; w <= 156; w++) {
      s = playWeek(s, STRATEGIES.balanced, log)
      s = advanceOneWeek(s)
      const m = s.media!
      for (const f of Object.values(s.fights)) {
        if (!f.title || seen.has(f.id) || f.result) continue
        seen.add(f.id)
        if (f.title.kind === 'eliminator') continue
        for (const b of f.title.bodies ?? []) {
          const rec = m.titles[titleKey(b, f.weightClass)]
          const ids = [f.sideA.fighterId, f.sideB.fighterId]
          const ch = ids.filter((i) => i !== rec?.c)
          checked++
          for (const id of ch) if (rec?.mand?.challenger !== id && !qualifiesFor(s, b, id)) bad.push(`w${w} ${f.id} ${b}: ${id} ${s.fighters[id].record.wins}-${s.fighters[id].record.losses}`)
        }
      }
      if (w === 156) for (const d of TITLE_DEFS) for (const k of Object.keys(m.titles).filter((x) => x.startsWith(d.id + '|'))) {
        for (const e of getList(m, d.id, k.split('|')[1] as never)?.e.filter((x) => x.r >= 1 && x.r <= d.challengerLimit) ?? []) { rated++; if (qualifiesFor(s, d.id, e.f)) credible++ }
      }
    }
    expect(bad).toEqual([])
    expect(checked).toBeGreaterThan(30)
    expect(credible).toBeLessThan(rated) // some of those ranked inside the challenger range are not yet credible challengers
  }, 600_000)
})
