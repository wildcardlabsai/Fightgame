/**
 * FIRST STEPS (Phase 4.7) — a short, state-derived checklist for new promoters. No tutorial text: each step is one line
 * that ticks itself off when the player has actually done the thing, and links to where to do it.
 */
import type { GameState } from './types'

export interface FirstStep { id: string; label: string; hint: string; done: boolean; screen: string }

export function firstSteps(state: GameState): FirstStep[] {
  const me = state.playerPromotionId
  const fights = Object.values(state.fights).filter((f) => f.sideA.promotionId === me || f.sideB.promotionId === me || f.organiserId === me)
  const events = Object.values(state.events).filter((e) => e.promotionId === me && e.status !== 'cancelled')
  const scouted = state.scoutOps.length > 0 || Object.values(state.knowledge).some((k) => k.reports.length > 0 && !k.reports.every((r) => r.scoutName === 'Head Coach'))
  return [
    { id: 'scout', label: 'Scout a fighter', hint: 'Reports cost money but cut the guesswork.', done: scouted, screen: 'scouting' },
    { id: 'fight', label: 'Agree a fight', hint: 'Pick an opponent your scouts rate as winnable.', done: fights.some((f) => ['agreed', 'scheduled', 'training', 'fightNight', 'completed', 'processed', 'postFight'].includes(f.status)), screen: 'matchmaking' },
    { id: 'event', label: 'Book a small show', hint: 'Check the forecast before you commit.', done: events.length > 0, screen: 'events' },
    { id: 'sale', label: 'Put it on sale', hint: 'Prices and marketing change the result.', done: events.some((e) => e.onSaleDay !== null || !!e.result), screen: 'events' },
    { id: 'result', label: 'Run the night and read the result', hint: 'The profit figure is the lesson.', done: events.some((e) => !!e.result), screen: 'events' },
  ]
}
