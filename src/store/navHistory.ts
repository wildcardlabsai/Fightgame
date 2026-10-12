/**
 * In-app back / forward and the recently-visited list. The URL hash already drives routing (and the browser's own buttons work), but the game
 * needs its OWN stack so the buttons can show whether there is somewhere to go and "Recent" can list people and events, not just URLs.
 * Presentation only: nothing here touches the career.
 */
import { create } from 'zustand'
import { routeToHash, useGame, type Route } from './gameStore'

interface NavState { stack: string[]; index: number; version: number }
export const useNavHistory = create<NavState>(() => ({ stack: [], index: -1, version: 0 }))
let moving = false

const parse = (h: string): Route => { const [, screen, ...rest] = h.replace(/^#/, '').split('/'); return { screen: screen as Route['screen'], param: rest.length ? rest.join('/') : undefined } }

function record(route: Route): void {
  if (moving) return
  const h = routeToHash(route)
  const { stack, index } = useNavHistory.getState()
  if (stack[index] === h) return
  const next = stack.slice(0, index + 1); next.push(h)
  useNavHistory.setState({ stack: next.slice(-60), index: Math.min(next.length, 60) - 1, version: useNavHistory.getState().version + 1 })
}
export function startNavHistory(): void {
  record(useGame.getState().route)
  useGame.subscribe((s, prev) => { if (s.route !== prev.route) record(s.route) })
}
function go(delta: -1 | 1): void {
  const { stack, index } = useNavHistory.getState(), i = index + delta
  if (i < 0 || i >= stack.length) return
  moving = true
  useNavHistory.setState({ index: i })
  const r = parse(stack[i]); useGame.getState().navigate(r.screen, r.param)
  moving = false
}
export const goBack = (): void => go(-1)
export const goForward = (): void => go(1)
/** Most recent distinct places, newest first, excluding the one you are on. */
export function recentRoutes(limit = 8): Route[] {
  const { stack, index } = useNavHistory.getState(), seen = new Set<string>(), out: Route[] = []
  for (let i = stack.length - 1; i >= 0 && out.length < limit; i--) { if (i === index || seen.has(stack[i])) continue; seen.add(stack[i]); out.push(parse(stack[i])) }
  return out
}
