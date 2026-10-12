/**
 * "Since last week" deltas for the numbers a promoter watches (cash, promotion reputation, and your fighters' reputation and popularity).
 * Recorded once per in-game week as the game advances, kept per save on this device, and used only for display arrows. Never read by the simulation.
 */
import { create } from 'zustand'
import { loadJson, saveJson } from '../engine/uiStorage'
import { viewsOf } from '../engine/view'
import { useGame } from './gameStore'

interface Snap { day: number; cash: number; rep: number; roster: Record<string, [number, number]> }
interface TrendState { saveId: string | null; snaps: Snap[] }
export const useTrends = create<TrendState>(() => ({ saveId: null, snaps: [] }))
const key = (id: string) => `promoter.trends.${id}`

export function startTrends(): void {
  useGame.subscribe((s) => {
    const g = s.game
    if (!g) { if (useTrends.getState().saveId) useTrends.setState({ saveId: null, snaps: [] }); return }
    if (useTrends.getState().saveId !== g.saveId) useTrends.setState({ saveId: g.saveId, snaps: loadJson<Snap[]>(key(g.saveId), []) })
    const snaps = useTrends.getState().snaps
    const last = snaps[snaps.length - 1]
    if (last && g.today < last.day) { useTrends.setState({ snaps: snaps.filter((x) => x.day <= g.today) }); return } // loaded an earlier save
    if (last && g.today - last.day < 7) return
    const me = g.promotions[g.playerPromotionId]
    const roster: Snap['roster'] = {}
    for (const v of viewsOf(g).mine()) roster[v.id] = [Math.round(v.reputation), Math.round(v.popularity)]
    const next = snaps.concat({ day: g.today, cash: me.cash, rep: Math.round(me.reputation), roster }).slice(-26)
    useTrends.setState({ snaps: next }); saveJson(key(g.saveId), next)
  })
}

/** Change since the snapshot at least a week old (null when there is no earlier week to compare). */
export function useDelta(read: (s: Snap) => number | undefined, current: number): number | null {
  const snaps = useTrends((t) => t.snaps)
  const today = useGame((s) => s.game?.today ?? 0)
  const prev = [...snaps].reverse().find((x) => today - x.day >= 7 && read(x) !== undefined)
  const p = prev ? read(prev) : undefined
  return p === undefined ? null : current - p
}
