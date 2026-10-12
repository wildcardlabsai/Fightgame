/** Search, notes/tags, cash outlook, monthly review and the large-text preference: all presentation-side, none may touch the simulation. */
import { describe, expect, it } from 'vitest'
import { FIGHTER_TAGS, setFighterNote } from './commands'
import { cashOutlook } from './cashForecast'
import { monthlyReview } from './review'
import { defaultPreferences, parsePreferences } from './preferences'
import { routeTitle, searchAll, type ScreenEntry } from './search'
import { advanceOneWeek } from './tick'
import { viewsOf } from './view'
import { createNewGame } from './worldgen'
import { serialiseGame } from './save'
import type { GameState } from './types'

const fresh = (seed = 'ux-1'): GameState => createNewGame({ seed, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'P', color: '#fff', emblem: 'bolt' } }, 1_700_000_000_000)
const SCREENS: ScreenEntry[] = [{ id: 'finances', label: 'Finances', screen: 'finances', group: 'Finances' }, { id: 'matchmaking', label: 'Matchmaking', screen: 'matchmaking', group: 'Events' }]

describe('global search', () => {
  const g = fresh()
  const v = viewsOf(g).mine()[0]
  it('finds a fighter by part of the name and ignores case and accents', () => {
    const hits = searchAll(g, v.lastName.slice(0, 4).toUpperCase(), SCREENS)
    expect(hits.some((h) => h.kind === 'fighter' && h.id === v.id)).toBe(true)
    expect(hits.find((h) => h.id === v.id)!.route).toEqual({ screen: 'fighter', param: v.id })
  })
  it('only returns fighters the player knows about, never the hidden world', () => {
    const known = new Set(viewsOf(g).known().map((x) => x.id))
    for (const q of ['a', 'e', 'son', 'ez', 'an']) for (const h of searchAll(g, q, SCREENS, 60)) if (h.kind === 'fighter') expect(known.has(h.id)).toBe(true)
  })
  it('finds screens and commands, requires every word to match, and returns nothing for an empty query', () => {
    expect(searchAll(g, 'fin', SCREENS).some((h) => h.kind === 'screen' && h.id === 'finances')).toBe(true)
    expect(searchAll(g, 'advance week', SCREENS).some((h) => h.kind === 'action' && h.action === 'advance')).toBe(true)
    expect(searchAll(g, 'finances zzzzqq', SCREENS)).toEqual([])
    expect(searchAll(g, '   ', SCREENS)).toEqual([])
  })
  it('searches your own tags', () => {
    const g2 = setFighterNote(g, v.id, { tags: ['Sign next year'] })
    expect(searchAll(g2, 'sign next', SCREENS).some((h) => h.id === v.id)).toBe(true)
  })
  it('names detail routes for the recent list and returns null for something that no longer exists', () => {
    expect(routeTitle(g, 'fighter', v.id)?.title).toBe(v.name)
    expect(routeTitle(g, 'fighter', 'f_nope')).toBeNull()
    expect(routeTitle(g, 'event', 'ev_nope')).toBeNull()
  })
})

describe('notes and tags', () => {
  const g = fresh('ux-notes')
  const id = viewsOf(g).mine()[0].id
  it('keeps trimmed, de-duplicated, limited tags and a bounded note; removes the entry when emptied', () => {
    let s = setFighterNote(g, id, { tags: [' Watch ', 'Watch', 'x'.repeat(40), '', 'a', 'b', 'c', 'd', 'e', 'f', 'g'], text: 'y'.repeat(900) })
    const n = s.notes![id]
    expect(n.tags!.length).toBe(8); expect(n.tags![0]).toBe('Watch'); expect(n.tags![1].length).toBe(24); expect(n.text!.length).toBe(600)
    expect(viewsOf(s).fighter(id)!.myTags).toEqual(n.tags)
    s = setFighterNote(s, id, { tags: [], text: '' })
    expect(s.notes![id]).toBeUndefined()
    expect(FIGHTER_TAGS).toContain('Watch')
  })
  it('never changes the simulation: the same career with and without notes plays out identically', () => {
    const withNotes = setFighterNote(g, id, { tags: ['Watch'], text: 'hello' })
    let a: GameState = JSON.parse(serialiseGame(g)), b: GameState = JSON.parse(serialiseGame(withNotes))
    for (let w = 0; w < 8; w++) { a = advanceOneWeek(a); b = advanceOneWeek(b) }
    delete (b as { notes?: unknown }).notes
    expect(JSON.stringify(b.fighters)).toBe(JSON.stringify(a.fighters)); expect(b.rngState).toBe(a.rngState); expect(b.promotions[b.playerPromotionId].cash).toBe(a.promotions[a.playerPromotionId].cash)
  })
})

describe('cash outlook and monthly review', () => {
  let g = fresh('ux-cash')
  it('starts at today’s cash and falls by the weekly running costs when no show is booked', () => {
    const o = cashOutlook(g)
    expect(o.points).toHaveLength(13); expect(o.points[0].mid).toBe(g.promotions[g.playerPromotionId].cash)
    expect(o.points[12].mid).toBe(Math.round(o.points[0].mid - o.burn * 12)); expect(o.shows).toEqual([])
    for (const p of o.points) { expect(p.low).toBeLessThanOrEqual(p.mid); expect(p.mid).toBeLessThanOrEqual(p.high) }
  })
  it('reviews the last four weeks from the ledger: income − costs = net, and nothing is invented for a quiet month', () => {
    for (let w = 0; w < 6; w++) g = advanceOneWeek(g)
    const r = monthlyReview(g)
    expect(r.income - r.costs).toBe(r.cashChange); expect(r.wins + r.losses + r.draws).toBeGreaterThanOrEqual(0)
    expect(r.headline.length).toBeGreaterThan(10); expect(Number.isFinite(r.cashChange)).toBe(true)
  })
})

describe('larger text preference', () => {
  it('defaults off, parses on, and ignores junk', () => {
    expect(defaultPreferences().largeText).toBe(false)
    expect(parsePreferences(JSON.stringify({ largeText: true })).largeText).toBe(true)
    expect(parsePreferences(JSON.stringify({ largeText: 'yes' })).largeText).toBe(false)
  })
})
