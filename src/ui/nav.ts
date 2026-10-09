/** Navigation structure: seven primary destinations, each with the screens beneath it. Pure data + helpers (no React). */
import type { ScreenId } from '../store/gameStore'

export interface NavItem { id: string; label: string; screen: ScreenId; param?: string; icon: string; locked?: string }
export interface NavGroup { id: string; label: string; icon: string; items: NavItem[] }

const DEV = import.meta.env.DEV

export const NAV: NavGroup[] = [
  { id: 'home', label: 'Home', icon: 'dashboard', items: [{ id: 'dashboard', label: 'Dashboard', screen: 'dashboard', icon: 'dashboard' }] },
  { id: 'inbox', label: 'Inbox', icon: 'inbox', items: [{ id: 'inbox', label: 'Inbox', screen: 'inbox', icon: 'inbox' }] },
  { id: 'roster', label: 'Roster', icon: 'fighters', items: [
    { id: 'fighters', label: 'Fighters', screen: 'fighters', icon: 'fighters' },
    { id: 'free', label: 'Free Agents', screen: 'fighters', param: 'free', icon: 'fighters' },
    { id: 'scouting', label: 'Scouting', screen: 'scouting', icon: 'scouting' },
    { id: 'contracts', label: 'Contracts', screen: 'contracts', icon: 'contracts' },
  ] },
  { id: 'events', label: 'Events', icon: 'events', items: [
    { id: 'calendar', label: 'Calendar', screen: 'calendar', icon: 'calendar' },
    { id: 'events', label: 'Events', screen: 'events', icon: 'events' },
    { id: 'fights', label: 'Fights', screen: 'fights', icon: 'fights' },
    { id: 'matchmaking', label: 'Matchmaking', screen: 'matchmaking', icon: 'matchmaking' },
    { id: 'venues', label: 'Venues', screen: 'venues', icon: 'venues' },
  ] },
  { id: 'world', label: 'World', icon: 'world', items: [
    { id: 'media', label: 'Media', screen: 'media', icon: 'media' },
    { id: 'news', label: 'News', screen: 'news', icon: 'news' },
    { id: 'rankings', label: 'Rankings', screen: 'rankings', icon: 'rankings' },
    { id: 'titles', label: 'Titles', screen: 'titles', icon: 'titles' },
    { id: 'promotions', label: 'Promotions', screen: 'promotions', icon: 'promotions' },
    { id: 'boxing-world', label: 'Boxing World', screen: 'fights', param: 'world', icon: 'world' },
  ] },
  { id: 'finances', label: 'Finances', icon: 'finances', items: [
    { id: 'finances', label: 'Finances', screen: 'finances', icon: 'finances' },
    { id: 'sponsors', label: 'Sponsors', screen: 'sponsors', icon: 'sponsors' },
    { id: 'payroll', label: 'Payroll & contracts', screen: 'contracts', param: 'payroll', icon: 'contracts' },
  ] },
  { id: 'more', label: 'More', icon: 'more', items: [
    { id: 'advisor', label: 'Advisor', screen: 'advisor', icon: 'advisor' },
    { id: 'settings', label: 'Settings', screen: 'settings', icon: 'settings' },
    { id: 'saves', label: 'Save / Load', screen: 'settings', param: 'saves', icon: 'settings' },
    { id: 'office', label: 'Promoter’s Office', screen: 'office', icon: 'contracts' },
    ...(DEV ? [{ id: 'assets', label: 'Assets (dev)', screen: 'assets' as ScreenId, icon: 'media' }] : []),
  ] },
]

/** Detail routes belong to the section that opens them. */
const ALIAS: Partial<Record<ScreenId, ScreenId>> = { fighter: 'fighters', negotiation: 'contracts', fight: 'fights', deal: 'fights', event: 'events' }
export const baseScreen = (s: ScreenId): ScreenId => ALIAS[s] ?? s

export function itemActive(group: NavGroup, item: NavItem, route: { screen: ScreenId; param?: string }): boolean {
  if (item.locked) return false
  const screen = baseScreen(route.screen)
  if (screen !== item.screen) return false
  // `param` only selects a tab on list screens; detail routes carry an id there instead.
  const tabParam = route.screen === screen ? route.param : undefined
  const siblings = group.items.filter((i) => i.screen === item.screen && i.param)
  if (item.param) return tabParam === item.param
  return !siblings.some((s) => s.param === tabParam)
}

export function activeGroup(route: { screen: ScreenId; param?: string }): NavGroup {
  const screen = baseScreen(route.screen)
  // a tab-specific entry (e.g. Free Agents, Payroll) wins over the plain entry for the same screen
  const exact = NAV.find((g) => g.items.some((i) => !i.locked && i.screen === screen && i.param && route.screen === screen && i.param === route.param))
  if (exact) return exact
  return NAV.find((g) => g.items.some((i) => !i.locked && i.screen === screen)) ?? NAV[0]
}
export function activeItem(route: { screen: ScreenId; param?: string }): { group: NavGroup; item: NavItem | null } {
  const group = activeGroup(route)
  return { group, item: group.items.find((i) => itemActive(group, i, route)) ?? null }
}

/** The five bottom-bar destinations on phones. */
export const BOTTOM: { id: string; label: string; icon: string; screen?: ScreenId; groups: string[] }[] = [
  { id: 'home', label: 'Home', icon: 'dashboard', screen: 'dashboard', groups: ['home'] },
  { id: 'inbox', label: 'Inbox', icon: 'inbox', screen: 'inbox', groups: ['inbox'] },
  { id: 'fighters', label: 'Fighters', icon: 'fighters', screen: 'fighters', groups: ['roster'] },
  { id: 'events', label: 'Events', icon: 'events', screen: 'events', groups: ['events'] },
  { id: 'more', label: 'More', icon: 'more', groups: ['world', 'finances', 'more'] },
]
export const bottomActive = (route: { screen: ScreenId; param?: string }): string => BOTTOM.find((b) => b.groups.includes(activeGroup(route).id))?.id ?? 'more'
