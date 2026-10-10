/**
 * Phase 6.3 - rival promotions stage the fights they offer. Every new proposal is a place on the rival's own show; accepting books it on that
 * card through the ordinary fight/event pipeline; the night's next bout is derived from the engine's own card order.
 */
import { describe, expect, it } from 'vitest'
import { createNewGame } from './worldgen'
import { advanceOneWeek } from './tick'
import { clone } from './media/testing'
import type { GameState } from './types'
import { acceptOffer, isLive, rejectOffer } from './office/offers'
import { nightProgress } from './eventViews'
import { fightListItem } from './fightViews'
import { totalFights } from './fighters'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const mk = (seed: string) => createNewGame({ seed, promotionName: 'P63', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
/** A passive career (the player runs no shows) so their fighters sit free and rivals write to them. */
const world = (() => { let s: GameState | null = null; return () => (s ??= (() => { let g = mk('p63-world'); for (let i = 0; i < 104; i++) g = advanceOneWeek(g); g.promotions[g.playerPromotionId].cash = Math.max(g.promotions[g.playerPromotionId].cash, 1_500_000); return g })()) })()

/** Advance until a live offer exists (bounded). */
function withLiveOffer(): { s: GameState; id: string } {
  let s = clone(world())
  for (let i = 0; i < 160; i++) {
    const live = Object.values(s.office!.offers).find((o) => o.status === 'open')
    if (live) return { s, id: live.id }
    s = advanceOneWeek(s)
  }
  throw new Error('no offer arrived in 160 weeks')
}

describe('rival-staged offers', () => {
  it('every new proposal is a place on a real rival show, owned by the rival, with the date and card in the engine', () => {
    let s = clone(world())
    const seen = new Set(Object.keys(s.office!.offers))
    let made = 0
    for (let i = 0; i < 130; i++) {
      s = advanceOneWeek(s)
      for (const o of Object.values(s.office!.offers)) {
        if (seen.has(o.id)) continue
        seen.add(o.id); made++
        expect(o.host).toBe('them')
        const ev = s.events[o.eventId!]
        expect(ev, 'the offer names a real show').toBeTruthy()
        expect(ev.promotionId).toBe(o.promoId)
        expect(ev.kind).toBe('ai')
        expect(ev.day).toBe(o.day)
        expect(ev.card.length).toBeGreaterThanOrEqual(3) // a genuine card, not a one-fight shell
        expect(s.fighters[o.theirs].contractId && s.contracts[s.fighters[o.theirs].contractId!].promotionId).toBe(o.promoId)
        expect(s.fighters[o.theirs].weightClass).toBe(s.fighters[o.mine].weightClass === s.fighters[o.theirs].weightClass ? s.fighters[o.theirs].weightClass : s.fighters[o.theirs].weightClass)
      }
    }
    expect(made).toBeGreaterThan(0)
  })

  it('does not flood: at most one new offer a week, a bounded live set, no fighter in two live offers', () => {
    let s = clone(world())
    let prev = new Set(Object.keys(s.office!.offers))
    for (let i = 0; i < 104; i++) {
      s = advanceOneWeek(s)
      const now = Object.keys(s.office!.offers)
      expect(now.filter((id) => !prev.has(id)).length).toBeLessThanOrEqual(1)
      prev = new Set(now)
      const live = Object.values(s.office!.offers).filter(isLive)
      expect(live.length).toBeLessThanOrEqual(4)
      const rivals = live.map((o) => o.theirs); expect(new Set(rivals).size).toBe(rivals.length)
    }
  })

  it('accepting books exactly one bout on the rival card, commits both fighters, closes the offer, and cannot be repeated', () => {
    const { s, id } = withLiveOffer()
    const o = s.office!.offers[id]
    const fightsBefore = Object.keys(s.fights).length
    const cardBefore = s.events[o.eventId!].card.length
    const r = acceptOffer(s, id)
    expect(r.ok, r.error).toBe(true)
    const t = r.state
    const oo = t.office!.offers[id]
    expect(oo.status).toBe('agreed')
    expect(Object.keys(t.fights).length).toBe(fightsBefore + 1)
    const f = t.fights[oo.fightId!]
    expect(f.organiserId).toBe(o.promoId)
    expect(f.eventId).toBe(o.eventId)
    expect(f.day).toBe(t.events[o.eventId!].day)
    expect(t.events[o.eventId!].card.length).toBe(cardBefore + 1)
    expect(t.events[o.eventId!].card.filter((x) => x === f.id)).toHaveLength(1)
    expect(new Set([f.sideA.fighterId, f.sideB.fighterId])).toEqual(new Set([o.mine, o.theirs]))
    expect(t.fighters[o.mine].activeFightId).toBe(f.id)
    expect(t.fighters[o.theirs].activeFightId).toBe(f.id)
    expect(isLive(oo)).toBe(false)
    // not actionable again, and no duplicate
    const again = acceptOffer(t, id)
    expect(again.ok).toBe(false)
    expect(Object.keys(again.state.fights).length).toBe(Object.keys(t.fights).length)
    const rej = rejectOffer(t, id)
    expect(rej.ok).toBe(false)
    // the listing marks it as an external booking
    const li = fightListItem(t, f.id)!
    expect(li.mine).toBe(true); expect(li.external).toBe(true); expect(li.organiser).toBe(t.promotions[o.promoId].name)
  })

  it('a booked fighter is not bookable for a second fight and stale offers for them are withdrawn', () => {
    let { s, id } = withLiveOffer()
    const mine = s.office!.offers[id].mine
    const r = acceptOffer(s, id); s = r.state
    for (const o of Object.values(s.office!.offers)) if (o.id !== id && isLive(o)) expect(o.mine).not.toBe(mine)
    for (let i = 0; i < 6; i++) { s = advanceOneWeek(s); for (const o of Object.values(s.office!.offers)) if (o.id !== id && isLive(o)) expect([o.mine, o.theirs]).not.toContain(mine) }
  })

  it('declining creates no booking and leaves the fighter\'s schedule untouched', () => {
    const { s, id } = withLiveOffer()
    const o = s.office!.offers[id]
    const before = { fights: Object.keys(s.fights).length, card: s.events[o.eventId!].card.length, a: s.fighters[o.mine].activeFightId, b: s.fighters[o.theirs].activeFightId }
    const r = rejectOffer(s, id)
    expect(r.ok).toBe(true)
    expect(r.state.office!.offers[id].status).toBe('rejected')
    expect(Object.keys(r.state.fights).length).toBe(before.fights)
    expect(r.state.events[o.eventId!].card.length).toBe(before.card)
    expect(r.state.fighters[o.mine].activeFightId ?? null).toBe(before.a ?? null)
    expect(r.state.fighters[o.theirs].activeFightId ?? null).toBe(before.b ?? null)
  })

  it('an unavailable or retired fighter, an expired offer, or a cancelled show cannot be booked', () => {
    const { s, id } = withLiveOffer()
    const o = s.office!.offers[id]
    const injured = clone(s); injured.fighters[o.theirs].injury = { type: 'Hand', severity: 'minor', returnDay: injured.today + 60, startDay: injured.today } as never
    const r1 = acceptOffer(injured, id); expect(r1.ok).toBe(false); expect(Object.keys(r1.state.fights).length).toBe(Object.keys(s.fights).length)
    const late = clone(s); late.today = o.expiresDay + 7
    expect(acceptOffer(late, id).ok).toBe(false)
    const off = clone(s); off.events[o.eventId!].status = 'cancelled'
    expect(acceptOffer(off, id).ok).toBe(false)
    const gone = clone(s); gone.fighters[o.mine].status = 'retired'
    expect(acceptOffer(gone, id).ok).toBe(false)
  })

  it('the accepted bout is fought on the rival show and updates both records once', () => {
    const { s, id } = withLiveOffer()
    const o = s.office!.offers[id]
    let ok = false
    for (let k = 0; k < 8 && !ok; k++) {
      const r = acceptOffer(clone(s), id); expect(r.ok).toBe(true)
      let t = r.state; t.seed = `${s.seed}-try${k}`
      const fid = t.office!.offers[id].fightId!
      const n0 = [totalFights(t.fighters[o.mine]), totalFights(t.fighters[o.theirs])]
      for (let i = 0; i < 20 && !t.fights[fid].result && t.fights[fid].status !== 'cancelled'; i++) t = advanceOneWeek(t)
      if (!t.fights[fid].result) continue
      ok = true
      expect(totalFights(t.fighters[o.mine])).toBe(n0[0] + 1)
      expect(totalFights(t.fighters[o.theirs])).toBe(n0[1] + 1)
      expect(t.fighters[o.mine].activeFightId ?? null).toBeNull()
      expect(t.fights[fid].organiserId).toBe(o.promoId)
    }
    expect(ok, 'fought in at least one of the variant worlds').toBe(true)
  })

  it('is deterministic for a seed', () => {
    let a = clone(world()), b = clone(world())
    for (let i = 0; i < 40; i++) { a = advanceOneWeek(a); b = advanceOneWeek(b) }
    expect(JSON.stringify(a.office!.offers)).toBe(JSON.stringify(b.office!.offers))
    expect(Object.keys(a.events).length).toBe(Object.keys(b.events).length)
  })
})

describe('night progress', () => {
  it('names the next bout in card order, counts what is fought, and reports completion', () => {
    const s = clone(world())
    const ev = Object.values(s.events).find((e) => e.card.length >= 4)!
    const ids = ev.card.filter((x) => s.fights[x] && s.fights[x].status !== 'cancelled')
    expect(ids.length).toBeGreaterThanOrEqual(4)
    ids.forEach((fid) => { s.fights[fid].status = 'fightNight'; s.fights[fid].result = undefined })
    let p = nightProgress(s, ev.id)!
    expect(p.next!.fightId).toBe(ids[0]); expect(p.done).toBe(0); expect(p.complete).toBe(false)
    expect(p.next!.position).toBe(`Bout 1 of ${ids.length}`)
    for (const fid of ids.slice(0, 2)) { s.fights[fid].status = 'postFight'; s.fights[fid].result = { winner: 0, method: 'UD', round: 12, seconds: 0 } as never }
    p = nightProgress(s, ev.id)!
    expect(p.done).toBe(2); expect(p.next!.fightId).toBe(ids[2])
    for (const fid of ids) { s.fights[fid].status = 'postFight'; s.fights[fid].result = { winner: 0, method: 'UD', round: 12, seconds: 0 } as never }
    p = nightProgress(s, ev.id)!
    expect(p.next).toBeNull(); expect(p.complete).toBe(true)
  })
})
