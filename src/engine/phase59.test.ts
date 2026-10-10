/** Phase 5.9 — ranking floors, and (below) fight-talk guidance. */
import { describe, expect, it } from 'vitest'
import { createNewGame } from './worldgen'
import { advanceOneWeek } from './tick'
import { CONTENDER_CONFIG, levelOf } from './business/titleDefs'
import { SANCTIONING } from './media/orgs'
import { getList } from './media/records'
import type { GameState } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const mk = (seed: string) => createNewGame({ seed, promotionName: 'P59', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)

describe('title-body rankings respect the experience floor of their level', () => {
  it('nobody under the floor is rated by a body (an 8-2 fighter is not the world number one), and the lists stay populated', () => {
    for (const seed of ['p59-a', 'p59-b']) {
      let s: GameState = mk(seed)
      let checked = 0, populated = 0, lists = 0
      for (let w = 1; w <= 3 * 52; w++) {
        s = advanceOneWeek(s)
        if (w % 26) continue
        for (const o of SANCTIONING) {
          const fl = CONTENDER_CONFIG[levelOf(o.id)].floor
          for (const wc of new Set(Object.values(s.fighters).map((f) => f.weightClass))) {
            const l = getList(s.media!, o.id, wc)
            if (!l) continue
            lists++
            if (l.e.some((e) => e.r >= 1)) populated++
            for (const e of l.e) {
              if (e.r < 1) continue
              const f = s.fighters[e.f]
              const n = f.record.wins + f.record.losses + f.record.draws
              checked++
              expect(n, `${o.id} #${e.r} ${f.id} has ${f.record.wins}-${f.record.losses}`).toBeGreaterThanOrEqual(fl.fights)
              expect(f.record.wins).toBeGreaterThanOrEqual(fl.wins)
            }
          }
        }
      }
      expect(checked).toBeGreaterThan(0)
      console.log(seed, 'ranked entries', checked, 'lists', lists, 'with contenders', populated)
    }
  }, 240_000)
})

// ---------------------------------------------------------------- fight talks: amounts and verdicts
import { approachOpponent } from './fightNegotiation'
import { startFightTalk, fightTalkMove } from './commands'
import { expectedFightTerms } from './business/terms'
import { playerRoster } from './selectors'

describe('fight talks put the money in figures and judge every offer', () => {
  const setup = () => {
    let s: GameState = mk('p59-talk')
    for (let i = 0; i < 80; i++) s = advanceOneWeek(s)
    for (const me of playerRoster(s).filter((f) => f.status === 'active' && !f.activeFightId && !f.injury)) {
      for (const o of Object.values(s.fighters).filter((f) => f.status === 'active' && f.weightClass === me.weightClass && f.id !== me.id && !f.activeFightId && !f.injury && f.contractId && s.contracts[f.contractId].promotionId !== s.playerPromotionId)) {
        const a = approachOpponent(s, me.id, o.id)
        if (!a.ok) continue
        const t = startFightTalk(a.state, a.fightId!)
        if (t.ok) return { s: t.state, talkId: t.talkId!, fightId: a.fightId! }
      }
    }
    throw new Error('no fight talk could be opened')
  }
  const lines = (s: GameState, talkId: string) => s.business!.talks[talkId].log.map((l) => l.text)

  it('asking what the camp needs also gives the going purse and win bonus in pounds', () => {
    const { s, talkId, fightId } = setup()
    const r = fightTalkMove(s, talkId, { kind: 'ask', topic: 'priorities' })
    expect(r.ok).toBe(true)
    const x = expectedFightTerms(r.state, fightId)!
    const text = lines(r.state, talkId).join('\n')
    expect(text).toContain(`£${x.purse.lo.toLocaleString('en-GB')}`)
    expect(text).toContain(`£${x.winBonus.hi.toLocaleString('en-GB')}`)
  })

  it('every offer is judged in words against the going range, and a counter lists its terms', () => {
    const { s, talkId, fightId } = setup()
    const x = expectedFightTerms(s, fightId)!
    const mid = Math.round((x.purse.lo + x.purse.hi) / 2)
    const low = fightTalkMove(s, talkId, { kind: 'propose', offer: { purseB: Math.round(mid * 0.3), winBonusB: 0, rematch: false, venuePref: 'neutral', fights: 1 } })
    expect(low.ok).toBe(true)
    const lowText = lines(low.state, talkId).slice(-4).join('\n')
    expect(lowText).toMatch(/lowball/i)
    expect(lowText).toMatch(/going/i)
    const fair = fightTalkMove(s, talkId, { kind: 'propose', offer: { purseB: mid, winBonusB: Math.round(mid * 0.1), rematch: false, venuePref: 'neutral', fights: 1 } })
    expect(lines(fair.state, talkId).join('\n')).toMatch(/reasonable offer|generous offer/i)
    // a light offer that is not a lowball draws a counter, and the counter's terms are written out
    const light = fightTalkMove(s, talkId, { kind: 'propose', offer: { purseB: Math.round(mid * 0.85), winBonusB: Math.round(mid * 0.08), rematch: false, venuePref: 'neutral', fights: 1 } })
    const tl = light.state.business!.talks[talkId]
    if (tl.fightCounter) expect(lines(light.state, talkId).join('\n')).toMatch(/Their counter: £/)
    expect(lines(light.state, talkId).join('\n')).toMatch(/offer|lowball/i)
  })

  it('the verdict is a log note only: it never changes the outcome of the talk', () => {
    const { s, talkId } = setup()
    const o = { purseB: 20000, winBonusB: 2000, rematch: false, venuePref: 'neutral' as const, fights: 1 as const }
    const a = fightTalkMove(s, talkId, { kind: 'propose', offer: o })
    const b = fightTalkMove(s, talkId, { kind: 'propose', offer: o })
    expect(JSON.stringify(a.state.business!.talks[talkId])).toEqual(JSON.stringify(b.state.business!.talks[talkId]))
  })
})

// ---------------------------------------------------------------- the next belt for an inexperienced fighter
import { titlePathFor } from './business/titlePath'
import { levelRank } from './business/titleDefs'

describe('a fighter with almost no fights is not pointed at a world belt', () => {
  it('the next belt is the lowest rung available, and the gap names both fights and wins', () => {
    let s: GameState = mk('p59-path')
    for (let i = 0; i < 40; i++) s = advanceOneWeek(s)
    const me = Object.values(s.fighters).find((f) => f.contractId && s.contracts[f.contractId].promotionId === s.playerPromotionId)!
    me.record = { wins: 1, losses: 2, draws: 0, koWins: 0, koLosses: 0 }
    const path = titlePathFor(s, me)
    expect(path.best, 'some belt is shown').toBeTruthy()
    const lowest = Math.min(...path.targets.map((t) => levelRank(t.level)))
    expect(levelRank(path.best!.level)).toBe(lowest)
    const worldT = path.targets.find((t) => t.level === 'world')
    if (worldT) { expect(worldT.needs.join(' ')).toMatch(/professional fights \(has 3\)/); expect(worldT.needs.join(' ')).toMatch(/wins \(has 1\)/) }
  })
})
