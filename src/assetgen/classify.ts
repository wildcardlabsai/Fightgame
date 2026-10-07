/**
 * Decides how much artwork each fighter deserves, from PUBLIC information only (FighterView: reputation, popularity,
 * record, stage, ownership, scheduled main events). No hidden attribute, potential or rating is read.
 */
import { cardSlots } from '../engine/eventViews'
import { isEventOpen } from '../engine/events/lifecycle'
import type { FighterView } from '../engine/view'
import { viewsOf } from '../engine/view'
import type { GameState } from '../engine/types'
import type { FighterPriority } from './types'

export interface Classified { view: FighterView; priority: FighterPriority; reasons: string[] }

export const LIMITS = { premiumTopRep: 12, importantShare: 0.14, standardShare: 0.5 }

export function classifyFighters(state: GameState): Classified[] {
  const views = viewsOf(state)
  const all = Object.keys(state.fighters).map((id) => views.fighter(id)!).filter(Boolean)
  const active = all.filter((v) => v.status === 'active')
  const byRep = [...active].sort((a, b) => b.reputation + b.popularity * 0.5 - (a.reputation + a.popularity * 0.5) || a.id.localeCompare(b.id))
  const reasons = new Map<string, string[]>()
  const note = (id: string, r: string) => { const l = reasons.get(id) ?? []; l.push(r); reasons.set(id, l) }
  const premium = new Set<string>()
  // player-owned
  for (const v of active) if (v.own !== null) { premium.add(v.id); note(v.id, 'player-owned') }
  // main-event fighters of scheduled shows (any promotion)
  for (const ev of Object.values(state.events)) {
    if (!isEventOpen(ev)) continue
    const slots = cardSlots(state, ev)
    const main = slots[slots.length - 1]
    if (main) for (const id of [main.aId, main.bId]) if (state.fighters[id]?.status === 'active') { premium.add(id); note(id, 'main event') }
  }
  // highest reputation + major rivals (met before more than once)
  byRep.slice(0, LIMITS.premiumTopRep).forEach((v) => { premium.add(v.id); note(v.id, 'top reputation') })
  for (const v of active) {
    const counts = new Map<string, number>()
    for (const h of v.fightHistory) counts.set(h.opponentId, (counts.get(h.opponentId) ?? 0) + 1)
    if ([...counts.values()].some((n) => n >= 2)) { premium.add(v.id); note(v.id, 'major rival') }
  }
  // (champions: no title data exists before the rankings phase)
  const important = new Set<string>()
  const nImportant = Math.round(active.length * LIMITS.importantShare)
  for (const v of byRep) { if (important.size >= nImportant) break; if (!premium.has(v.id)) { important.add(v.id); note(v.id, 'strong contender / high reputation') } }
  for (const v of active) if (!premium.has(v.id) && !important.has(v.id) && v.stage === 'Prospect' && v.record.losses === 0 && v.fights >= 3) { important.add(v.id); note(v.id, 'unbeaten prospect') }
  const standardRoom = Math.round(active.length * LIMITS.standardShare)
  let standard = 0
  const out: Classified[] = []
  for (const v of all) {
    let priority: FighterPriority
    if (v.status !== 'active') priority = 'GENERIC'
    else if (premium.has(v.id)) priority = 'PREMIUM'
    else if (important.has(v.id)) priority = 'IMPORTANT'
    else if (v.stage === 'Journeyman' || (v.fights >= 12 && v.record.losses > v.record.wins)) { priority = 'GENERIC'; note(v.id, 'journeyman') }
    else if (standard < standardRoom) { priority = 'STANDARD'; standard++ }
    else { priority = 'GENERIC'; note(v.id, 'background fighter') }
    out.push({ view: v, priority, reasons: reasons.get(v.id) ?? [] })
  }
  return out
}

/** Which fighter images each priority earns. Generic fighters keep the silhouette fallback. */
export const FIGHTER_ASSETS: Record<FighterPriority, ('profile' | 'action' | 'celebration')[]> = {
  PREMIUM: ['profile', 'action', 'celebration'], IMPORTANT: ['profile', 'action'], STANDARD: ['profile'], GENERIC: [],
}
