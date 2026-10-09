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
import { CONTENDER_CONFIG, TITLE_DEFS, TITLE_DEF_BY_ID, experienceGap, levelOf } from './business/titleDefs'
import { assessChallenger } from './business/contender'
import { maintainTitles } from './media/titles'
import { myTitlePaths } from './business/views'
import { requestTitleFight } from './business/titlePath'
import { newLog, playWeek, STRATEGIES } from './sim/strategies'
import type { GameState } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const mk = (seed: string) => createNewGame({ seed, promotionName: 'P54', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
const world = (() => { let s: GameState | null = null; return () => (s ??= (() => { let g = mk('p54-challengers'); for (let i = 0; i < 110; i++) g = advanceOneWeek(g); return g })()) })()

/** A world belt with a champion and a ranked fighter inside its challenger range, in a scratch copy. */
function worldBelt(s: GameState) {
  for (const [key, rec] of Object.entries(s.media!.titles)) {
    const [body, wc] = key.split('|')
    if (!rec.c || levelOf(body) !== 'world' || rec.mand || rec.elim) continue // a belt with no order outstanding
    const d = TITLE_DEF_BY_ID[body]
    const list = getList(s.media!, body, wc as never)!.e.filter((e) => e.r >= 1 && e.r <= d.challengerLimit && e.f !== rec.c && s.fighters[e.f].status === 'active')
    if (list.length >= 2) return { body, wc: wc as never, champ: rec.c, list, rec }
  }
  throw new Error('no world belt in the test world')
}

const setRecord = (s: GameState, id: string, w: number, l: number) => { s.fighters[id].record.wins = w; s.fighters[id].record.losses = l; s.fighters[id].record.draws = 0 }

/** Give a fighter a recent history: results against opponents of a given standing at the time (public, from the fights themselves). */
function giveHistory(s: GameState, id: string, bouts: { win: boolean; oppRep: number }[]) {
  const f = s.fighters[id]
  f.recentFights = []
  bouts.forEach((b, i) => {
    const fid = `ft_h${id}_${i}`
    s.fights[fid] = { id: fid, day: s.today - 40 - 20 * (bouts.length - i), status: 'postFight', kind: 'ai', organiserId: 'x', weightClass: f.weightClass, scheduledRounds: 10, terms: {}, venueId: null, city: '', country: '', createdDay: 0, paid: true,
      sideA: { fighterId: id, promotionId: null, prep: {}, preRecord: '10-0-0', preRep: 50, prePop: 20 }, sideB: { fighterId: `opp${i}`, promotionId: null, prep: {}, preRecord: '10-3-0', preRep: b.oppRep, prePop: 20 },
      result: { winner: b.win ? 0 : 1, method: 'UD', round: 10, second: 0, cards: [], kd: [0, 0], tot: [], deductions: [0, 0], pExpA: 0.5, dRep: [0, 0], dPop: [0, 0] } } as never
    f.recentFights.push(fid)
  })
  f.lastFightDay = s.today - 21
}

/** A genuine contender on the numbers (experience, credible wins, recent form, active) — so what varies in a test is the champion's appetite, not eligibility. */
function makeContender(s: GameState, id: string) {
  setRecord(s, id, 16, 3)
  giveHistory(s, id, [{ win: true, oppRep: 52 }, { win: true, oppRep: 54 }, { win: false, oppRep: 58 }, { win: true, oppRep: 50 }, { win: true, oppRep: 51 }, { win: true, oppRep: 49 }, { win: true, oppRep: 53 }, { win: true, oppRep: 48 }])
  s.fighters[id].birthDay = s.today - 28 * 365
}

describe('how a challenger is assessed', () => {
  it('the experience floor rises with the level; a 5-2 fighter is not eligible for any belt, whatever their ranking', () => {
    const order = ['area', 'domestic', 'european', 'world'] as const
    for (let i = 1; i < order.length; i++) {
      expect(CONTENDER_CONFIG[order[i]].floor.fights).toBeGreaterThan(CONTENDER_CONFIG[order[i - 1]].floor.fights)
      expect(CONTENDER_CONFIG[order[i]].bar).toBeGreaterThan(CONTENDER_CONFIG[order[i - 1]].bar)
      expect(CONTENDER_CONFIG[order[i]].credibleWins).toBeGreaterThanOrEqual(CONTENDER_CONFIG[order[i - 1]].credibleWins)
    }
    for (const lv of order) expect(experienceGap(lv, { wins: 5, losses: 2, draws: 0 }), lv).toMatch(/Insufficient professional experience/)
    expect(experienceGap('world', { wins: 15, losses: 0, draws: 0 })).toBeNull()
  })

  it('the reported case: a 5-2 fighter ranked in a champion\'s range cannot be matched with a 15-3 champion for the belt', () => {
    const s = clone(world())
    const { body, wc, champ, list } = worldBelt(s)
    setRecord(s, champ, 15, 3)
    const x = list[0].f
    setRecord(s, x, 5, 2)
    expect(qualifiesFor(s, body, x)).toBe(false)
    expect(assessChallenger(s, body, x).tier).toBe('notEligible')
    expect(bodiesFor(s, x, champ, wc)).not.toContain(body)
    expect(stakesBetween(s, x, champ, wc).bodies).not.toContain(body)
    const e0 = titleEligibility(s, s.fighters[x], body)
    expect(['unranked', 'unqualified']).toContain(e0.status)
    expect(e0.canChallengeNow).toBe(false)
    // …and the board says so with the right label, not a ranking position.
    const row = titleBoard(s, 'world', wc).find((c) => c.body === body)!.contenders.find((c) => c.id === x)
    if (row) { expect(row.status).toBe('notEligible'); expect(row.step).toMatch(/professional experience/) }
  })

  it('an undefeated record against weak opposition does not outrank a fighter who has beaten credible contenders', () => {
    const s = clone(world())
    const { body, list } = worldBelt(s)
    const a = list[0].f, b = list[1].f
    for (const id of [a, b]) s.fighters[id].birthDay = s.today - 28 * 365
    setRecord(s, a, 16, 0); giveHistory(s, a, Array.from({ length: 8 }, () => ({ win: true, oppRep: 8 })))
    setRecord(s, b, 14, 2); giveHistory(s, b, [{ win: true, oppRep: 58 }, { win: true, oppRep: 55 }, { win: true, oppRep: 52 }, { win: false, oppRep: 60 }, { win: true, oppRep: 50 }, { win: true, oppRep: 48 }, { win: true, oppRep: 45 }, { win: true, oppRep: 44 }])
    s.fighters[a].reputation = s.fighters[b].reputation
    const A = assessChallenger(s, body, a), B = assessChallenger(s, body, b)
    expect(B.score).toBeGreaterThan(A.score)
    expect(B.tier).toBe('contender')
    expect(A.tier).toBe('building')
    expect(A.step).toBe('Needs a win over a credible contender')
  })

  it('a fighter on a losing record is never a title contender, however many wins or however high the ranking', () => {
    const s = clone(world())
    for (const lv of ['area', 'domestic', 'european', 'world'] as const) {
      const body = TITLE_DEFS.find((d) => d.level === lv)!.id
      const { list } = worldBelt(s)
      const x = list[0].f
      makeContender(s, x)
      setRecord(s, x, 15, 17)
      const a = assessChallenger(s, body, x)
      expect(a.tier, lv).not.toBe('contender')
      expect(a.step, lv).toMatch(/better record|credible|experience/)
    }
  })

  it('a lower belt can be within reach of a fighter who is not ready for a world title', () => {
    const s = clone(world())
    const { body, list } = worldBelt(s)
    const x = list[0].f
    setRecord(s, x, 9, 2); giveHistory(s, x, Array.from({ length: 8 }, (_, i) => ({ win: i % 4 !== 3, oppRep: 36 })))
    s.fighters[x].birthDay = s.today - 26 * 365
    expect(assessChallenger(s, body, x).tier).not.toBe('contender') // 11 fights: below the world floor
    const domestic = TITLE_DEFS.find((d) => d.level === 'domestic')!.id
    const t = assessChallenger(s, domestic, x)
    expect(t.tier).not.toBe('notEligible') // …but past the domestic floor, and assessed on the merits
  })

  it('a challenger the body has ordered is exempt from the assessment', () => {
    const s = clone(world())
    const { body, wc, champ, list, rec } = worldBelt(s)
    const x = list[0].f
    setRecord(s, x, 5, 2)
    rec.mand = { challenger: x, cn: 'X', ordered: s.today, due: s.today + 120 }
    expect(bodiesFor(s, x, champ, wc)).toContain(body)
  })

  it('a mandatory challenger is chosen only among credible contenders, never just the top of the list', () => {
    const s = clone(world())
    const { body, wc, list, rec } = worldBelt(s)
    rec.mand = undefined; rec.elim = undefined
    rec.lastFight = s.today - 7 * 200; rec.since = s.today - 7 * 220 // long overdue for a defence
    // the top-ranked fighter has not got the experience; the board must look past them
    const top = list[0].f
    setRecord(s, top, 6, 1)
    const ev = maintainTitles(s, s.media!)
    const rec2 = s.media!.titles[titleKey(body, wc)]
    const ordered = ev.find((e) => e.kind === 'MANDATORY' && e.body === body && e.wc === wc)
    if (ordered) { expect(ordered.o).not.toBe(top); expect(qualifiesFor(s, body, rec2.mand!.challenger)).toBe(true) }
  })

  it('views carry a status and a next step, never the scores behind them', () => {
    const s = clone(world())
    const { wc } = worldBelt(s)
    const json = JSON.stringify([titleBoard(s, 'world', wc), myTitlePaths(s)])
    expect(json).not.toMatch(/"score"|"bar"|"credibleRep"|"weights"/)
    expect(json).toMatch(/"status":"(contender|building|notEligible|mandatory|eliminator)"/)
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
    for (const id of [strong, weak]) makeContender(s0, id)
    s0.fighters[strong].reputation = s0.fighters[champ].reputation; s0.fighters[strong].popularity = s0.fighters[champ].popularity
    s0.fighters[weak].reputation = 8; s0.fighters[weak].popularity = 6
    let ok = { strong: 0, weak: 0 }
    const N = 120
    for (let i = 0; i < N; i++) {
      const s = clone(s0); s.seed = `roll-${i}`
      if (championCampResponse(s, champ, strong, wc, [body]).accept) ok.strong++
      if (championCampResponse(s, champ, weak, wc, [body]).accept) ok.weak++
    }
    expect(ok.strong / N).toBeGreaterThan(0.4)
    expect(ok.strong / N).toBeLessThan(0.95) // never guaranteed
    expect(ok.weak / N).toBeLessThan(0.45)
    expect(ok.strong / N - ok.weak / N).toBeGreaterThan(0.2)
  })

  it('the player\'s approach is turned down by the champion\'s camp when it should be, and cannot be when the board ordered it', () => {
    const s = clone(world())
    const { body, wc, champ, list } = worldBelt(s)
    const weak = list[list.length - 1].f
    makeContender(s, weak)
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
      if (!r.ok) { declined = true; expect(r.error).toMatch(/turned the challenge down/); expect(r.state.business!.declines![`${weak}|${champ}`]).toBeTruthy(); expect(approachOpponent(r.state, weak, champ).error).toBe(r.error) /* same answer again */
        t.media!.titles[titleKey(body, wc)].mand = { challenger: weak, cn: 'W', ordered: t.today, due: t.today + 120 }
        const o = approachOpponent(t, weak, champ)
        expect(o.ok, o.error).toBe(true)
        expect(o.state.fights[o.fightId!].status).toBe('negotiating') }
    }
    expect(declined).toBe(true)
  })

  it('a champion who owes a mandatory defence, or is waiting on an eliminator, takes no voluntary challenge — whatever the challenger\'s appeal', () => {
    const s = clone(world())
    const { body, wc, champ, list, rec } = worldBelt(s)
    const x = list[0].f, other = list[1].f
    for (const id of [x, other]) { setRecord(s, id, 20, 1); s.fighters[id].reputation = 90; s.fighters[id].popularity = 90 }
    rec.mand = { challenger: other, cn: 'O', ordered: s.today, due: s.today + 120 }
    const r1 = championCampResponse(s, champ, x, wc, [body])
    expect(r1.accept).toBe(false)
    expect(r1.reason).toMatch(/mandatory defence first/)
    rec.mand = undefined
    rec.elim = { a: list[2].f, b: list[3].f, ordered: s.today, due: s.today + 120 }
    expect(championCampResponse(s, champ, x, wc, [body]).reason).toMatch(/eliminator/)
    // the mandatory challenger himself is never refused, appeal or no appeal
    rec.elim = undefined
    rec.mand = { challenger: other, cn: 'O', ordered: s.today, due: s.today + 120 }
    s.fighters[other].popularity = 1; s.fighters[other].reputation = 1
    expect(championCampResponse(s, champ, other, wc, [body])).toMatchObject({ accept: true, ordered: true })
  })

  it('a refusal is remembered: the same answer comes back with no new roll, the title path says so, and it lapses with the cooldown', () => {
    const base = clone(world())
    const { body, wc, champ, list } = worldBelt(base)
    const weak = list[list.length - 1].f
    makeContender(base, weak)
    base.fighters[weak].reputation = 4; base.fighters[weak].popularity = 4
    const own = Object.values(base.contracts).find((x) => x.promotionId === base.playerPromotionId && x.status === 'active')!
    base.fighters[own.fighterId].contractId = null
    own.fighterId = weak; base.fighters[weak].contractId = own.id
    for (const id of [weak, champ]) { base.fighters[id].activeFightId = null; base.fighters[id].injury = null; base.fighters[id].suspendedUntil = null; base.fighters[id].lastFightDay = null }
    let declined: ReturnType<typeof approachOpponent> | null = null, t: GameState | null = null
    for (let i = 0; i < 60 && !declined; i++) { t = clone(base); t.seed = `memo-${i}`; const r = approachOpponent(t, weak, champ); if (!r.ok) declined = r }
    expect(declined, 'a quarter in which the long shot is refused').toBeTruthy()
    const after = declined!.state
    const key = `${weak}|${champ}`
    expect(after.business!.declines![key].reason).toMatch(/turned the challenge down/)
    // Asking again — even if the challenger has become a far bigger name — does not roll again inside the cooldown.
    after.fighters[weak].reputation = 95; after.fighters[weak].popularity = 95
    const again = approachOpponent(after, weak, champ)
    expect(again.ok).toBe(false)
    expect(again.error).toBe(after.business!.declines![key].reason)
    expect(again.state).toBe(after)
    // The title path shows it, and refuses the request.
    const target = myTitlePaths(after).find((p) => p.id === weak)!.targets.find((x) => x.body === body)
    if (target) { expect(target.state).toBe('declined'); expect(target.blocked).toMatch(/will not change the answer/) }
    expect(requestTitleFight(after, weak, body).ok).toBe(false)
    // An order overrides the memory.
    const ordered = clone(after)
    ordered.media!.titles[titleKey(body, wc)].mand = { challenger: weak, cn: 'W', ordered: ordered.today, due: ordered.today + 120 }
    expect(approachOpponent(ordered, weak, champ).ok).toBe(true)
    // After the cooldown the camp may be asked again (the answer is rolled afresh).
    const later = clone(after); later.today = after.business!.declines![key].until + 1
    expect(later.business!.declines![key].until).toBeLessThanOrEqual(later.today)
    const next = approachOpponent(later, weak, champ)
    expect(next.error === after.business!.declines![key].reason).toBe(false)
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
