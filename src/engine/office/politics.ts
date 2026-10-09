/**
 * BOXING POLITICS. The few moments where the business of boxing moves a relationship, each applied once and each with a stated reason:
 *   a show run in a venue (+), a show cancelled at short notice (-), a rival's show our fighter was on going ahead (+) or being
 *   called off (-), a show staged on top of a rival's (-), a fighter signed from under a rival's offer (-).
 * None of these can change a contract, a price already agreed, a fighter's eligibility or a title rule: relationships only tilt
 * what is on offer and how much room a counterpart gives.
 */
import { weeksBetween } from '../calendar'
import type { BoxingEvent, GameState, Id } from '../types'
import { campaignPoints, settleCampaign } from './promotion'
import { shiftRelation } from './relations'

const live = (s: string) => s !== 'cancelled' && s !== 'planning'
const hostsMyFighter = (state: GameState, ev: BoxingEvent): boolean =>
  ev.card.some((id) => { const f = state.fights[id]; return !!f && (f.sideA.promotionId === state.playerPromotionId || f.sideB.promotionId === state.playerPromotionId) })

export function afterShowSettled(state: GameState, ev: BoxingEvent, fill: number): void {
  const me = state.playerPromotionId
  if (ev.promotionId === me) {
    const v = state.venues[ev.venueId]
    if (v) shiftRelation(state, 'venue', v.id, fill >= 0.7 ? 1 : 0.4, fill >= 0.7 ? `A well-attended show at ${v.name}` : `A show run at ${v.name}`, `venue:show:${ev.id}`)
    // Staging a show on top of a rival's that was announced first costs goodwill with that promoter.
    for (const o of Object.values(state.events)) {
      if (o.id === ev.id || o.promotionId === me || !live(o.status) || o.country !== ev.country || Math.abs(o.day - ev.day) > 2 || o.createdDay > ev.createdDay) continue
      shiftRelation(state, 'promoter', o.promotionId, -1.5, `Your show ${ev.name} clashed with theirs (${o.name})`, `clash:${ev.id}:${o.id}`)
    }
    settleCampaign(state, ev, fill)
  } else if (hostsMyFighter(state, ev)) {
    shiftRelation(state, 'promoter', ev.promotionId, 2, `Your fighter appeared on their show ${ev.name}`, `host:${ev.id}`)
  }
}

export function afterEventCancelled(state: GameState, ev: BoxingEvent): void {
  if (ev.promotionId === state.playerPromotionId) {
    const v = state.venues[ev.venueId]
    if (v && weeksBetween(state.today, ev.day) < 4) shiftRelation(state, 'venue', v.id, -4, `${ev.name} was cancelled at short notice`, `venue:cancel:${ev.id}`)
  } else if (hostsMyFighter(state, ev)) {
    shiftRelation(state, 'promoter', ev.promotionId, -3, `They cancelled ${ev.name}, which your fighter was on`, `cancel:${ev.id}`)
  }
}

/** The player signed a fighter a rival had an offer out for. */
export function outbid(state: GameState, fighterId: Id, rivalPromoId: Id): void {
  const f = state.fighters[fighterId]
  if (f) shiftRelation(state, 'promoter', rivalPromoId, -1.5, `You signed ${f.firstName} ${f.lastName} while they had an offer out`, `outbid:${fighterId}:${rivalPromoId}`)
}

void campaignPoints
