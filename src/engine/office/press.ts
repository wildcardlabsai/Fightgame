/**
 * PRESS CONFERENCES: which fights earn one, what one costs, and what it does to the people involved. The media-side effects (hype,
 * rivalry, interest) live in media/requests.ts; this module holds the promoter-level rules around them.
 */
import { keyedFloat } from '../rng'
import { stakesBetween } from '../business/stakes'
import { rivalryStrength } from '../media/narratives'
import { totalFights } from '../fighters'
import type { Fight, GameState, Id } from '../types'
import type { BoxingEvent } from '../types'
import type { PressApproach, PressConference } from '../media/types'
import { pairKey } from './state'
import { OFFICE_LIMITS } from './types'
import { shiftRelation } from './relations'
import { officeOf } from './state'

/** What a conference costs to stage: a hall, hospitality and staff, scaled to the room the show is in. */
export const pressCost = (capacity: number): number => Math.round((500 + 0.3 * capacity) / 50) * 50

/** Why this show's main event warrants a press conference (public facts), or null when it does not. */
export function pressWorthy(state: GameState, ev: BoxingEvent, main: Fight): string | null {
  const a = state.fighters[main.sideA.fighterId], b = state.fighters[main.sideB.fighterId]
  if (!a || !b) return null
  const st = stakesBetween(state, a.id, b.id, main.weightClass)
  if (main.title || st.kind === 'title' || st.kind === 'unification') return st.kind === 'unification' ? 'A unification fight' : 'A championship fight'
  if (st.kind === 'eliminator') return 'A title eliminator'
  const rematch = !!main.rematchOf || a.recentFights.some((id) => { const f = state.fights[id]; return f?.result && (f.sideA.fighterId === b.id || f.sideB.fighterId === b.id) })
  if (rematch) return 'A rematch'
  if (state.media && rivalryStrength(state.media, a.id, b.id) >= 20) return 'An established rivalry'
  for (const x of [a, b]) if (x.record.losses === 0 && totalFights(x) <= 12 && totalFights(x) >= 4 && x.popularity >= 35) return 'A high-profile prospect'
  const talks = Object.values(state.business?.talks ?? {})
  if (talks.some((t) => t.kind === 'fight' && t.status === 'broken' && (t.fighterId === a.id || t.fighterId === b.id) && (t.closedDay ?? 0) >= state.today - 84)) return 'A fight that took some making'
  const v = state.venues[ev.venueId]
  if (v && ['arena', 'stadium'].includes(v.tier)) return 'A major show'
  return null
}

/**
 * The people around the fight react to how it was sold: the rival's promoter if the opponent is theirs, and a note of why a rivalry
 * exists when the conference put real heat into one.
 */
export function pressPolitics(state: GameState, pc: PressConference, approach: PressApproach, a: Id, b: Id, rivalryAdded: number, heatBefore: number): void {
  const opp = [a, b].map((id) => state.fighters[id]).find((f) => f.contractId && state.contracts[f.contractId]?.promotionId !== state.playerPromotionId && state.contracts[f.contractId]?.promotionId !== undefined)
  const promoId = opp?.contractId ? state.contracts[opp.contractId]?.promotionId : undefined
  if (promoId && promoId !== state.playerPromotionId) {
    if (approach === 'AGGRESSIVE' || approach === 'CONTROVERSIAL') shiftRelation(state, 'promoter', promoId, -2, `A heated press conference ahead of ${pc.names[0]} v ${pc.names[1]}`, `press:${pc.id}`)
    else if (approach === 'DIPLOMATIC' || approach === 'RESPECTFUL') shiftRelation(state, 'promoter', promoId, 1, `A respectful press conference ahead of ${pc.names[0]} v ${pc.names[1]}`, `press:${pc.id}`)
  }
  if (rivalryAdded >= 8 && heatBefore + rivalryAdded >= 15) {
    const o = officeOf(state)
    const k = pairKey(a, b)
    const list = (o.rivalNotes[k] ??= [])
    list.unshift({ day: state.today, why: `Words were exchanged at the press conference for ${pc.names[0]} v ${pc.names[1]}` })
    if (list.length > 3) list.length = 3
    const keys = Object.keys(o.rivalNotes)
    if (keys.length > OFFICE_LIMITS.rivalNotes) delete o.rivalNotes[keys[keys.length - 1]]
  }
}
void keyedFloat
