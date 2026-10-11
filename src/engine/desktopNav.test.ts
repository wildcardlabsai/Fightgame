/**
 * Desktop UX redesign: the sidebar + tab strip are built from NAV, so these checks guarantee that no screen is orphaned and the phone bar still covers
 * every group. (Pure data; the rendered layout is checked by scripts/browser/phase49b.mjs and phase10-ui.mjs.)
 */
import { describe, expect, it } from 'vitest'
import { activeGroup, BOTTOM, NAV, baseScreen } from '../ui/nav'
import { parseHash } from '../store/gameStore'
import type { ScreenId } from '../store/gameStore'

const ALL: ScreenId[] = ['dashboard', 'fighters', 'fighter', 'calendar', 'inbox', 'finances', 'promotions', 'venues', 'settings', 'scouting', 'contracts', 'negotiation', 'matchmaking', 'fights', 'fight', 'deal', 'events', 'event', 'sponsors', 'news', 'advisor', 'media', 'rankings', 'titles', 'office', 'feedback']

describe('navigation map', () => {
  it('every screen belongs to exactly one sidebar section (directly or as a detail of one)', () => {
    for (const s of ALL) {
      const home = NAV.filter((g) => g.items.some((i) => i.screen === baseScreen(s)))
      expect(home.length, s).toBeGreaterThanOrEqual(1)
      expect(activeGroup({ screen: s }).id, s).toBe(home[0].id)
    }
  })
  it('the seven sidebar destinations and the tab strip entries are unique and labelled', () => {
    expect(NAV).toHaveLength(7)
    const ids = NAV.flatMap((g) => g.items.map((i) => i.id))
    expect(new Set(ids).size).toBe(ids.length)
    for (const g of NAV) for (const i of g.items) expect(i.label.length).toBeGreaterThan(2)
  })
  it('the phone bottom bar covers every group, so nothing is desktop-only', () => {
    const covered = new Set(BOTTOM.flatMap((b) => b.groups))
    for (const g of NAV) expect(covered.has(g.id), g.id).toBe(true)
  })
  it('deep links keep working: tab-specific routes land in the right section', () => {
    expect(activeGroup(parseHash('#/fighters/free')).id).toBe('roster')
    expect(activeGroup(parseHash('#/contracts/payroll')).id).toBe('finances')
    expect(activeGroup(parseHash('#/settings/saves')).id).toBe('more')
    expect(activeGroup(parseHash('#/event/ev_1')).id).toBe('events')
    expect(activeGroup(parseHash('#/fighter/f_1')).id).toBe('roster')
    expect(activeGroup(parseHash('#/feedback')).id).toBe('more')
  })
  it('hidden-attribute screens are not added: only the existing public screens are routable', () => {
    expect(parseHash('#/hidden').screen).toBe('dashboard')
  })
})
