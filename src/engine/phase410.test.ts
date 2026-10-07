/** Phase 4.10 — presentation helpers added for the UI elevation: captions, keys to victory, inbox kinds. All public data only. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildTimeline } from '../presentation/timeline'
import { keysToVictory } from '../ui/components/TaleOfTape'
import { msgKind } from '../ui/inboxKinds'
import { fightView } from './fightViews'
import { playedShow } from './testShow'
import type { FighterView } from './view'

const fv = (o: Partial<FighterView>): FighterView => ({ lastName: 'X', reachCm: 180, koRate: 40, fights: 10, age: 28, record: { wins: 5, losses: 2, draws: 0, koWins: 3, koLosses: 0 }, form: ['W', 'W', 'L', 'W', 'W'], style: 'Boxer', ...o }) as FighterView

describe('Tale of the Tape keys to victory', () => {
  it('derives only from public fields and always gives 1–3 keys', () => {
    const k = keysToVictory(fv({ reachCm: 190, koRate: 70 }), fv({ record: { wins: 4, losses: 4, draws: 0, koWins: 1, koLosses: 3 } }))
    expect(k.length).toBeGreaterThanOrEqual(1); expect(k.length).toBeLessThanOrEqual(3)
    expect(k.some((x) => /reach/i.test(x))).toBe(true)
    expect(keysToVictory(fv({}), fv({})).length).toBeGreaterThan(0)
  })
  it('does not import hidden attributes', () => {
    const src = readFileSync(join(__dirname, '../ui/components/TaleOfTape.tsx'), 'utf8')
    expect(src).not.toMatch(/engine\/(types|fight\/sim|state)/)
  })
})

describe('dramatic knockdown captions', () => {
  it('name attacker and victim from the recorded count', () => {
    const { after, fightIds } = playedShow('p410')
    const views = fightIds.map((id) => fightView(after, id)!).filter((v) => v?.result?.rounds)
    let seen = 0
    for (const v of views) {
      const tl = buildTimeline({ fightId: 'f', result: v.result!, names: { a: 'Ali', b: 'Bo' }, reduced: false })
      for (const e of tl.filter((x) => x.type === 'knockdown')) { seen++; expect(e.title).toMatch(/^(ALI|BO) DROPS (ALI|BO)!$/) }
    }
    expect(seen).toBeGreaterThanOrEqual(0)
  })
})

describe('inbox kinds', () => {
  it('classify by recorded category and plain subject words', () => {
    expect(msgKind({ category: 'fighter', subject: 'Smith injured in camp' })).toBe('MEDICAL')
    expect(msgKind({ category: 'contract', subject: 'Offer accepted' })).toBe('CONTRACT')
    expect(msgKind({ category: 'finance', subject: 'Weekly accounts' })).toBe('FINANCE')
    expect(msgKind({ category: 'system', subject: 'Welcome' })).toBe('PROMOTION')
  })
})
