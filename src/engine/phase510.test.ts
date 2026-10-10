/** Phase 5.10 — the experience floors, tested at every boundary and across every place they are used. */
import { describe, expect, it } from 'vitest'
import { createNewGame } from './worldgen'
import { advanceOneWeek } from './tick'
import { rankingFloor, TITLE_DEF_BY_ID } from './business/titleDefs'
import { updateRankings } from './media/rankings'
import { getList } from './media/records'
import { titleEligibility, contenderStatus } from './business/titleEco'
import { mandateVoidReason } from './media/titles'
import { titlePathFor } from './business/titlePath'
import type { Fighter, GameState } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const world = (() => { let s: GameState | null = null; return () => (s ??= (() => { let g = createNewGame({ seed: 'p510', promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000); for (let i = 0; i < 70; i++) g = advanceOneWeek(g); return g })()) })()

// one body per level, all open to an English fighter
const BODIES = ['atlas', 'european', 'british', 'area_eng'] as const

/** A clone of the world in which `f` has exactly this record, a top reputation, and the lists have been recomputed. */
function withRecord(base: GameState, id: string, wins: number, fights: number): { s: GameState; f: Fighter } {
  const s = structuredClone(base)
  const f = s.fighters[id]
  f.nationality = 'ENG'; f.status = 'active'; f.injury = null; f.contractId = f.contractId ?? null
  f.record = { wins, losses: fights - wins, draws: 0, koWins: Math.floor(wins / 2), koLosses: 0 }
  f.reputation = 100; f.popularity = 100
  updateRankings(s, s.media!, true)
  return { s, f }
}

describe('the floors are the same wherever they are applied', () => {
  const base = world()
  // a welterweight with no title, so the champion exemption does not get in the way
  const pick = Object.values(base.fighters).find((f) => f.status === 'active' && f.weightClass === 'lightweight' && !Object.values(base.media!.titles).some((r) => r.c === f.id))!

  for (const body of BODIES) {
    const d = TITLE_DEF_BY_ID[body]
    const fl = rankingFloor(d)
    const cases: { label: string; wins: number; fights: number; ok: boolean }[] = [
      { label: 'one fight short', wins: fl.wins, fights: fl.fights - 1, ok: false },
      { label: 'one win short', wins: fl.wins - 1, fights: fl.fights, ok: false },
      { label: 'exactly at the floor', wins: fl.wins, fights: fl.fights, ok: true },
      { label: 'one fight and one win above', wins: fl.wins + 1, fights: fl.fights + 1, ok: true },
      { label: 'far above', wins: fl.wins + 6, fights: fl.fights + 8, ok: true },
    ]
    for (const c of cases) {
      it(`${body} (${fl.fights} fights, ${fl.wins} wins): ${c.label} (${c.wins}-${c.fights - c.wins})`, () => {
        // keep the share high enough that only the floor decides
        const wins = Math.max(c.wins, Math.ceil(c.fights * 0.5))
        const { s, f } = withRecord(base, pick.id, c.ok ? c.wins : Math.min(c.wins, wins), c.fights)
        const listed = getList(s.media!, body, f.weightClass)?.e.some((e) => e.f === f.id && e.r >= 1) ?? false
        const el = titleEligibility(s, f, body)
        const gap = el.reasons.join(' ')
        if (!c.ok) {
          expect(listed, 'a fighter under the floor is not rated').toBe(false)
          expect(el.status).toBe('unranked')
          expect(gap).toMatch(/professional fights|wins/)
          // never "mandatory", even if an order names them
          const rec = s.media!.titles[`${body}|${f.weightClass}`]
          if (rec?.c) {
            rec.mand = { challenger: f.id, cn: 'X', ordered: s.today, due: s.today + 7 * 26 }
            expect(mandateVoidReason(s, s.media!, body, f.weightClass, rec.c, f.id)).toBeTruthy()
            expect(contenderStatus(s, f)).not.toBe('MANDATORY_CHALLENGER')
          }
          // the next-belt card agrees: it names the same requirement and never offers a title request
          const t = titlePathFor(s, f).targets.find((x) => x.body === body)
          if (t) { expect(t.request).toBeNull(); expect(t.standing).not.toBe('contender'); expect(t.needs.join(' ')).toMatch(/professional fights|wins/) }
        } else {
          expect(gap, 'the floor is not what is holding them back').not.toMatch(/to be rated/)
          expect(listed, 'a fighter who meets the floor, with the reputation to match, is rated').toBe(true)
          expect(el.status).not.toBe('ineligible')
        }
      })
    }
  }

  it('a body never rates a fighter below its own level floor, and the helper agrees with the numbers in the rules', () => {
    for (const body of BODIES) {
      const d = TITLE_DEF_BY_ID[body]
      expect(rankingFloor(d).fights).toBeGreaterThanOrEqual(d.minFights)
    }
    expect(rankingFloor(TITLE_DEF_BY_ID.atlas)).toEqual({ fights: 14, wins: 9 })
  })

  it('a reigning champion stays on the list whatever their record, and the belt history is untouched by a recompute', () => {
    const s = structuredClone(base)
    const [key, rec] = Object.entries(s.media!.titles).find(([, r]) => r.c)!
    const [body, wc] = key.split('|')
    const champ = s.fighters[rec.c!]
    champ.record = { wins: 2, losses: 3, draws: 0, koWins: 0, koLosses: 0 }
    const before = JSON.stringify(s.media!.titles[key])
    updateRankings(s, s.media!, true)
    expect(getList(s.media!, body, wc as never)?.e.find((e) => e.r === 0)?.f).toBe(champ.id)
    expect(JSON.stringify(s.media!.titles[key])).toBe(before)
  })
})

describe('orders and title fights respect the floors over a simulated career of the world', () => {
  it('every mandatory challenger, eliminator participant and title-fight contender has the experience for that level', () => {
    for (const seed of ['p510-a', 'p510-b']) {
      let s: GameState = createNewGame({ seed, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
      let checked = 0
      for (let w = 1; w <= 3 * 52; w++) {
        s = advanceOneWeek(s)
        if (w % 4) continue
        for (const [key, rec] of Object.entries(s.media!.titles)) {
          const body = key.split('|')[0]
          const d = TITLE_DEF_BY_ID[body]
          const fl = rankingFloor(d)
          const people = [rec.mand?.challenger, rec.elim?.a, rec.elim?.b].filter(Boolean) as string[]
          for (const id of people) {
            const f = s.fighters[id]
            const n = f.record.wins + f.record.losses + f.record.draws
            checked++
            expect(n, `${key} order names ${id} with ${f.record.wins}-${f.record.losses}`).toBeGreaterThanOrEqual(fl.fights)
            expect(f.record.wins).toBeGreaterThanOrEqual(fl.wins)
          }
        }
        for (const [fid, bodies] of Object.entries(s.media!.titleFights)) {
          const fight = s.fights[fid]
          if (!fight || fight.result) continue
          for (const body of bodies) {
            const fl = rankingFloor(TITLE_DEF_BY_ID[body])
            const champ = s.media!.titles[`${body}|${s.fighters[fight.sideA.fighterId].weightClass}`]?.c
            for (const side of [fight.sideA.fighterId, fight.sideB.fighterId]) {
              if (side === champ) continue
              const f = s.fighters[side]
              checked++
              expect(f.record.wins + f.record.losses + f.record.draws, `${body} title fight ${fid} contender ${side}`).toBeGreaterThanOrEqual(fl.fights)
            }
          }
        }
      }
      expect(checked).toBeGreaterThan(0)
    }
  }, 300_000)
})

// ---------------------------------------------------------------- fight-talk advice is accurate and honest
import { approachOpponent } from './fightNegotiation'
import { startFightTalk, fightTalkMove } from './commands'
import { expectedFightTerms } from './business/terms'
import { playerRoster } from './selectors'
import type { FightOffer } from './types'

describe('fight-talk verdicts match the terms actually proposed', () => {
  const open = (s0: GameState, skipTalks = 0) => {
    let skipped = 0
    for (const me of playerRoster(s0).filter((f) => f.status === 'active' && !f.activeFightId && !f.injury)) {
      for (const o of Object.values(s0.fighters).filter((f) => f.status === 'active' && f.weightClass === me.weightClass && f.id !== me.id && !f.activeFightId && !f.injury && f.contractId && s0.contracts[f.contractId].promotionId !== s0.playerPromotionId)) {
        const a = approachOpponent(s0, me.id, o.id)
        if (!a.ok) continue
        const t = startFightTalk(a.state, a.fightId!)
        if (!t.ok) continue
        if (skipped++ < skipTalks) continue
        return { s: t.state, talkId: t.talkId!, fightId: a.fightId! }
      }
    }
    throw new Error('no talk')
  }
  const worldTalk = (() => { let g: GameState = createNewGame({ seed: 'p510-talk', promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000); for (let i = 0; i < 80; i++) g = advanceOneWeek(g); return g })()
  const offer = (purseB: number, winBonusB: number): FightOffer => ({ purseB, winBonusB, rematch: false, venuePref: 'neutral', fights: 1 })

  it('money inside the printed range is never called light or a lowball; below it never reads as reasonable', () => {
    const { s, fightId } = open(worldTalk)
    const x = expectedFightTerms(s, fightId)!
    const lo = expectedFightTerms(s, fightId, offer(x.purse.lo, x.winBonus.lo))!
    expect(['Light offer', 'Lowball']).not.toContain(lo.assessment)
    expect(lo.position).toBe('low')
    const hi = expectedFightTerms(s, fightId, offer(x.purse.hi, x.winBonus.hi))!
    expect(['high', 'above']).toContain(hi.position)
    expect(['Light offer', 'Lowball']).not.toContain(hi.assessment)
    const below = expectedFightTerms(s, fightId, offer(Math.round(x.purse.lo * 0.6), 0))!
    expect(below.position).toBe('below')
    expect(['Light offer', 'Lowball']).toContain(below.assessment)
    // a large guaranteed purse with no bonus is not a lowball, and the bonus counts when it is the only difference
    expect(expectedFightTerms(s, fightId, offer(x.purse.hi, 0))!.assessment).not.toBe('Lowball')
    const a = expectedFightTerms(s, fightId, offer(x.purse.lo, 0))!, b = expectedFightTerms(s, fightId, offer(x.purse.lo, x.winBonus.hi))!
    expect(['below', 'low', 'mid', 'high', 'above'].indexOf(b.position!)).toBeGreaterThanOrEqual(['below', 'low', 'mid', 'high', 'above'].indexOf(a.position!))
  })

  it('every logged verdict quotes the proposed purse and bonus and the printed range, and says it is an estimate', () => {
    const { s, talkId, fightId } = open(worldTalk)
    const x = expectedFightTerms(s, fightId)!
    const mid = Math.round((x.purse.lo + x.purse.hi) / 2)
    for (const o of [offer(Math.round(x.purse.lo * 0.5), 0), offer(mid, Math.round(mid * 0.1)), offer(Math.round(x.purse.hi * 1.5), Math.round(mid * 0.2))]) {
      const r = fightTalkMove(s, talkId, { kind: 'propose', offer: o })
      const note = r.state.business!.talks[talkId].log.filter((l) => l.who === 'sys').map((l) => l.text).join('\n')
      const sent = r.state.business!.talks[talkId].fightOffer! // the offer as the camp holds it (rounded to the usual steps)
      expect(note).toContain(`£${sent.purseB.toLocaleString('en-GB')} purse`)
      expect(note).toContain(`£${sent.winBonusB.toLocaleString('en-GB')} win bonus`)
      expect(note).toContain(`£${x.purse.lo.toLocaleString('en-GB')} to £${x.purse.hi.toLocaleString('en-GB')}`)
      expect(note).toMatch(/estimate from public ranges, not a promise/)
    }
  })

  it('a counter is written out exactly as the camp holds it, and an accepted offer is not described as likely to be refused', () => {
    const { s, talkId, fightId } = open(worldTalk)
    const x = expectedFightTerms(s, fightId)!
    const mid = Math.round((x.purse.lo + x.purse.hi) / 2)
    const light = fightTalkMove(s, talkId, { kind: 'propose', offer: offer(Math.round(x.purse.lo * 0.9), Math.round(mid * 0.05)) })
    const t = light.state.business!.talks[talkId]
    if (t.fightCounter) expect(t.log.map((l) => l.text).join('\n')).toContain(`£${t.fightCounter.purseB.toLocaleString('en-GB')} purse`)
    const rich = fightTalkMove(s, talkId, { kind: 'propose', offer: offer(Math.round(x.purse.hi * 2.5), Math.round(mid * 0.3)) })
    const tr = rich.state.business!.talks[talkId]
    if (tr.status === 'agreed') {
      const notes = tr.log.filter((l) => l.who === 'sys').map((l) => l.text).join('\n')
      expect(notes).toMatch(/They accepted it/)
      expect(notes).not.toMatch(/likely to turn it down|Expect a counter/)
    }
  })

  it('advice never changes an outcome: the same moves give the same talk, and a second talk is judged on its own fight', () => {
    const a = open(worldTalk), b = open(worldTalk)
    const o = offer(40000, 4000)
    const ra = fightTalkMove(a.s, a.talkId, { kind: 'propose', offer: o }), rb = fightTalkMove(b.s, b.talkId, { kind: 'propose', offer: o })
    const strip = (st: GameState, id: string) => { const t = st.business!.talks[id]; return JSON.stringify({ ...t, log: t.log.filter((l) => l.who !== 'sys') }) }
    expect(strip(ra.state, a.talkId)).toBe(strip(rb.state, b.talkId))
    // in succession
    let second
    try { second = open(ra.state, 1) } catch { second = null }
    if (second) {
      const x2 = expectedFightTerms(second.s, second.fightId)!
      const r2 = fightTalkMove(second.s, second.talkId, { kind: 'ask', topic: 'priorities' })
      expect(r2.state.business!.talks[second.talkId].log.map((l) => l.text).join('\n')).toContain(`£${x2.purse.lo.toLocaleString('en-GB')}`)
    }
  })
})

import { expectedContractTerms } from './business/terms'
import { openingOffer } from './business/contractTalks'

describe('contract advice is consistent with its own ranges', () => {
  it('terms inside every printed range are not light or a lowball, for a signing and a renewal', () => {
    const s = world()
    const free = Object.values(s.fighters).filter((f) => f.status === 'active' && !f.contractId).slice(0, 3)
    const mine = playerRoster(s).slice(0, 2)
    for (const f of [...free.map((x) => [x, 'signing'] as const), ...mine.map((x) => [x, 'renewal'] as const)]) {
      const [fighter, kind] = f
      const e = expectedContractTerms(s, fighter.id, kind, null)!
      const o = { ...openingOffer(s, fighter, kind), basePurse: e.purse.lo, weeklyRetainer: e.retainer.lo, winBonus: e.winBonus.lo }
      const a = expectedContractTerms(s, fighter.id, kind, o)!.assessment
      expect(['Light offer', 'Lowball'], `${kind} ${fighter.id} at the bottom of every range`).not.toContain(a)
      const under = { ...o, basePurse: Math.round(e.purse.lo * 0.5), weeklyRetainer: Math.round(e.retainer.lo * 0.5), winBonus: Math.round(e.winBonus.lo * 0.5) }
      expect(['Light offer', 'Lowball']).toContain(expectedContractTerms(s, fighter.id, kind, under)!.assessment)
    }
  })
})

describe('the profile\'s next step names the floor when a fighter is under it', () => {
  it('a fighter below the world floor is told what they lack, not to "enter the ratings"', () => {
    const base = world()
    const s = structuredClone(base)
    const f = Object.values(s.fighters).find((x) => x.status === 'active' && x.weightClass === 'lightweight')!
    f.record = { wins: 5, losses: 8, draws: 0, koWins: 1, koLosses: 4 }
    f.nationality = 'USA'
    const text = nextMilestone(s, f).text
    expect(text).toMatch(/professional fights|wins/)
    expect(text).not.toMatch(/Win against rated opposition/)
  })
})
import { nextMilestone } from './business/titleEco'
