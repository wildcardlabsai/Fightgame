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
import { once } from './state'

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

/**
 * Phase 5.4D: what a result of ours does to the people around it, once per fight. A fighter's camp remembers whether the promoter put
 * them in a fair fight (a win in a real test warms them; a defeat in an obvious mismatch cools them); a rival promotion remembers being
 * beaten as the favourite, and respects a close, well-matched fight. Bounded, explained, and never touching contracts or eligibility.
 */
export function afterFightResult(state: GameState, fightId: Id): void {
  const fight = state.fights[fightId]
  const r = fight?.result
  if (!fight || !r) return
  const me = state.playerPromotionId
  const sides = [fight.sideA, fight.sideB] as const
  for (const i of [0, 1] as const) {
    const side = sides[i], other = sides[1 - i]
    if (side.promotionId !== me) continue
    const f = state.fighters[side.fighterId]
    const opp = state.fighters[other.fighterId]
    if (!f || !opp) continue
    const pWin = i === 0 ? r.pExpA : 1 - r.pExpA
    const won = r.winner === i, lost = r.winner === 1 - i
    // The camp
    if (won && pWin < 0.45 && once(state, `camp:${fightId}:${f.id}`)) {
      f.promoRelations[me] = Math.min(100, (f.promoRelations[me] ?? 0) + 1 + 3 * (0.45 - pWin))
    } else if (lost && pWin < 0.3 && once(state, `camp:${fightId}:${f.id}`)) {
      f.promoRelations[me] = Math.max(-100, (f.promoRelations[me] ?? 0) - (1 + 3 * (0.3 - pWin)))
    }
    // The other promotion
    const rival = other.promotionId && other.promotionId !== me ? other.promotionId : null
    if (!rival || !state.promotions[rival]) continue
    const name = `${opp.firstName} ${opp.lastName}`
    if (won && pWin < 0.4) shiftRelation(state, 'promoter', rival, -1.5, `${f.firstName} ${f.lastName} beat their man ${name}, who was favoured`, `rival:${fightId}`)
    else if (Math.abs(r.pExpA - 0.5) < 0.2 && (r.winner === null || ['UD', 'SD', 'MD'].includes(r.method))) shiftRelation(state, 'promoter', rival, 1, `A close, well-matched fight with ${name}`, `rival:${fightId}`)
  }
}
