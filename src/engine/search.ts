/**
 * GLOBAL SEARCH and route labels for the command palette and the recent-items list. Public facts only: fighters come from the player's own
 * knowledge (`views.known()`, the same list Scouting shows), never the raw fighter table.
 */
import { eventList } from './eventViews'
import { fightListItem } from './fightViews'
import { viewsOf } from './view'
import { titleStanding } from './business/titleStanding'
import type { GameState } from './types'

export interface SearchHit {
  kind: 'fighter' | 'event' | 'screen' | 'action'
  /** Stable key (fighter id, event id, screen id, action id). */
  id: string
  title: string
  sub: string
  /** Where Enter goes (screens, fighters, events). */
  route?: { screen: string; param?: string }
  /** A command rather than a destination. */
  action?: 'advance' | 'advance4' | 'save'
  /** Short chip for fighters: champion / ranked etc. */
  chip?: string
  score: number
}
export interface ScreenEntry { id: string; label: string; screen: string; param?: string; group: string }

const norm = (t: string): string => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const ACTIONS: { id: SearchHit['action'] & string; title: string; words: string }[] = [
  { id: 'advance', title: 'Advance one week', words: 'advance week continue next time' },
  { id: 'advance4', title: 'Advance four weeks', words: 'advance four weeks skip' },
  { id: 'save', title: 'Save the game', words: 'save game slot' },
]

/** Scores how well `text` matches every word of the query: start of a word beats the middle of one; all words must match. */
function match(text: string, words: string[]): number {
  const t = norm(text)
  let s = 0
  for (const w of words) {
    const i = t.indexOf(w)
    if (i < 0) return 0
    s += i === 0 ? 6 : t[i - 1] === ' ' ? 4 : 1
  }
  return s
}

export function searchAll(state: GameState, query: string, screens: ScreenEntry[], limit = 14): SearchHit[] {
  const words = norm(query).split(/\s+/).filter(Boolean)
  const out: SearchHit[] = []
  if (words.length === 0) return out
  const views = viewsOf(state)
  const stand = new Map<string, string>()
  for (const v of views.known()) {
    const s = match(`${v.name} ${v.nickname ?? ''} ${v.nationName} ${v.nationKey} ${v.division} ${v.hometown} ${v.style} ${v.myTags.join(' ')}`, words) + (match(v.name, words) ? 4 : 0)
    if (!s) continue
    if (!stand.has(v.id)) { const st = titleStanding(state, v.id); if (st.role !== 'unranked') stand.set(v.id, st.label) }
    out.push({ kind: 'fighter', id: v.id, title: v.name + (v.nickname ? ` “${v.nickname}”` : ''), sub: `${v.recordText} · ${v.division} · ${v.nationKey}${v.status === 'retired' ? ' · retired' : ''}`, route: { screen: 'fighter', param: v.id }, chip: stand.get(v.id), score: s + (v.shortlisted ? 2 : 0) + (v.own !== null ? 2 : 0) + v.reputation / 100 })
  }
  for (const mode of ['mine-open', 'world-upcoming', 'mine-history'] as const) {
    for (const e of eventList(state, mode, 40)) {
      const s = match(`${e.name} ${e.venueName} ${e.city} ${e.promotion}`, words)
      if (s) out.push({ kind: 'event', id: e.id, title: e.name, sub: `${e.promotion} · ${e.venueName}, ${e.city} · ${e.status}`, route: { screen: 'event', param: e.id }, score: s + (e.mine ? 1 : 0) - 1 })
    }
  }
  for (const sc of screens) { const s = match(`${sc.label} ${sc.group}`, words); if (s) out.push({ kind: 'screen', id: sc.id, title: sc.label, sub: `Go to · ${sc.group}`, route: { screen: sc.screen, param: sc.param }, score: s + 2 }) }
  for (const a of ACTIONS) { const s = match(a.words + ' ' + a.title, words); if (s) out.push({ kind: 'action', id: a.id, title: a.title, sub: 'Command', action: a.id, score: s }) }
  return out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit)
}

/** What a detail route is called, for the "recent" list. Null when the target no longer exists. */
export function routeTitle(state: GameState, screen: string, param?: string): { title: string; sub: string } | null {
  if (screen === 'fighter' && param) { const v = viewsOf(state).fighter(param); return v ? { title: v.name, sub: `${v.recordText} · ${v.division}` } : null }
  if (screen === 'event' && param) { const e = state.events[param]; return e ? { title: e.name, sub: 'Event' } : null }
  if (screen === 'fight' && param) { const f = fightListItem(state, param); return f ? { title: `${f.aName} v ${f.bName}`, sub: 'Fight' } : null }
  return null
}
