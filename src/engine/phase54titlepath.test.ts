/**
 * Phase 5.4 UX pass — "request a title fight". The request is only ever offered where the title rules already allow the fight, it opens
 * the ordinary fight negotiation with the right opponent, and fighters who cannot ask yet are told concretely what is missing.
 */
import { describe, expect, it } from 'vitest'
import { createNewGame } from './worldgen'
import { advanceOneWeek } from './tick'
import { clone } from './media/testing'
import { rosterOf } from './media/requests'
import { getList } from './media/records'
import { fighterName } from './fighters'
import { myTitlePaths, titlePathFor, beltsHeld } from './business/views'
import { requestTitleFight } from './business/titlePath'
import { HIDDEN_VIEW_KEYS } from './business/talkViews'
import { titleKey } from './media/titles'
import { TITLE_DEF_BY_ID } from './business/titleDefs'
import type { GameState } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const world = (() => { let s: GameState | null = null; return () => (s ??= (() => { let g = createNewGame({ seed: 'p54-tpath', promotionName: 'P54', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000); for (let i = 0; i < 90; i++) g = advanceOneWeek(g); return g })()) })()

/** Make `fighterId` the player's fighter by handing them one of the player's contracts. */
function adopt(s: GameState, fighterId: string): void {
  const c = Object.values(s.contracts).find((x) => x.promotionId === s.playerPromotionId && x.status === 'active' && x.fighterId !== fighterId)!
  s.fighters[c.fighterId].contractId = null
  const old = s.fighters[fighterId]
  if (old.contractId && s.contracts[old.contractId]) s.contracts[old.contractId].status = 'ended' as never
  c.fighterId = fighterId
  old.contractId = c.id
}

function readyContender(s: GameState) {
  for (const [key, rec] of Object.entries(s.media!.titles)) {
    if (!rec.c || rec.mand || rec.elim) continue
    const [body, wc] = key.split('|')
    const d = TITLE_DEF_BY_ID[body]
    const e = getList(s.media!, body, wc as never)?.e.find((x) => x.r >= 1 && x.r <= d.challengerLimit)
    if (!e) continue
    const f = s.fighters[e.f]
    if (f.status !== 'active' || f.activeFightId || f.injury || f.suspendedUntil || e.f === rec.c) continue
    const champ = s.fighters[rec.c]
    if (champ.activeFightId || champ.injury) continue
    return { f, body, wc, champId: rec.c }
  }
  throw new Error('no ready contender in the test world')
}

describe('request a title fight', () => {
  it('a ranked contender in the challenger range can ask, and the request opens a negotiation with the champion', () => {
    const s = clone(world())
    const r = readyContender(s)
    adopt(s, r.f.id)
    const v = titlePathFor(s, s.fighters[r.f.id])
    const t = v.targets.find((x) => x.body === r.body)!
    expect(t.state).toBe('ready')
    expect(t.request!.opponentId).toBe(r.champId)
    expect(v.best!.state).toBe('ready')
    const out = requestTitleFight(s, r.f.id, r.body)
    expect(out.ok, out.error).toBe(true)
    const fight = out.state.fights[out.fightId!]
    expect(fight.status).toBe('negotiating')
    expect([fight.sideA.fighterId, fight.sideB.fighterId].sort()).toEqual([r.f.id, r.champId].sort())
    // a second request while a fight is in the works is refused with a reason
    const again = requestTitleFight(out.state, r.f.id, r.body)
    expect(again.ok).toBe(false)
    expect(titlePathFor(out.state, out.state.fighters[r.f.id]).targets.find((x) => x.body === r.body)!.state).toBe('blocked')
  })

  it('a fighter who has not earned a shot is refused, and is told concretely what is missing', () => {
    const s = clone(world())
    let found: { body: string; wc: string; low: { f: string }; limit: number } | null = null
    for (const key of Object.keys(s.media!.titles)) {
      if (!s.media!.titles[key].c) continue
      const [body, wc] = key.split('|')
      const d = TITLE_DEF_BY_ID[body]
      const low = getList(s.media!, body, wc as never)?.e.find((x) => x.r > d.challengerLimit && s.fighters[x.f].status === 'active' && !s.fighters[x.f].activeFightId)
      if (low) { found = { body, wc, low, limit: d.challengerLimit }; break }
    }
    expect(found, 'a ranked fighter outside the challenger range').toBeTruthy()
    const { body, wc, limit } = found!
    const low = found!.low as { f: string }
    const d = { challengerLimit: limit }
    adopt(s, low.f)
    const v = titlePathFor(s, s.fighters[low.f])
    const t = v.targets.find((x) => x.body === body)!
    expect(t.state).toBe('building')
    expect(t.request).toBeNull()
    expect(t.needs.join(' ')).toMatch(new RegExp(`top ${d.challengerLimit}`))
    const out = requestTitleFight(s, low.f, body)
    expect(out.ok).toBe(false)
    expect(out.state).toBe(s)
    expect(s.media!.titles[titleKey(body, wc as never)].c).toBeTruthy()
  })

  it('a champion can offer a defence; a belt that is not contested cannot be requested; the player roster view covers every active fighter', () => {
    const s = clone(world())
    const paths = myTitlePaths(s)
    expect(paths.length).toBe(rosterOf(s).filter((f) => f.status === 'active').length)
    expect(paths.every((p, i, a) => i === 0 || a[i - 1].readyCount >= p.readyCount)).toBe(true)
    for (const p of paths) for (const t of p.targets) { expect(t.state === 'building' ? t.request === null : t.request !== null).toBe(true); expect(t.needs.length > 0 || t.request !== null).toBe(true) }
    expect(requestTitleFight(s, 'nobody', 'atlas').ok).toBe(false)
  })

  it('the views show a champion their belts, and expose nothing hidden', () => {
    const s = clone(world())
    const champId = Object.values(s.media!.titles).find((r) => r.c)!.c!
    expect(beltsHeld(s, champId).length).toBeGreaterThan(0)
    adopt(s, readyContender(s).f.id)
    const json = JSON.stringify([myTitlePaths(s), beltsHeld(s, champId)])
    for (const k of HIDDEN_VIEW_KEYS) expect(json).not.toContain(`"${k}"`)
    expect(fighterName(s.fighters[champId])).toBeTruthy()
  })
})
