/**
 * Everything an event poster/hero needs, as public facts only (names, records, venue, promotion, broadcast).
 * Assembled from the same views the rest of the UI uses — no hidden attributes, no RNG, no mutation.
 */
import { choosePosterTemplate } from '../assets/poster'
import { POSTER_LABEL, venueKind, type PosterTemplateId, type VenueKind } from '../assets/registry'
import { cardSlots, TIER_LABEL } from './eventViews'
import { cardFights } from './events/demand'
import { viewsOf } from './view'
import type { GameState, Id, PromotionLogo, Venue } from './types'

export interface PosterFighter { id: Id; firstName: string; lastName: string; name: string; nickname: string | null; division: string; record: string }
export interface EventPosterView {
  id: Id
  name: string
  day: number
  city: string
  country: string
  statusKey: string
  mine: boolean
  templateId: PosterTemplateId
  templateLabel: string
  promotion: { id: Id; name: string; logo: PromotionLogo }
  venue: { id: Id; name: string; tier: Venue['tier']; tierLabel: string; capacity: number; kind: VenueKind }
  main: { a: PosterFighter; b: PosterFighter; rounds: number; division: string } | null
  coMain: { a: PosterFighter; b: PosterFighter } | null
  fights: number
  broadcastKind: string
  broadcastLabel: string | null
  ppv: boolean
  championship: boolean
  rivalry: boolean
  /** Sold / capacity, only once tickets are on sale. */
  soldPct: number | null
  soldOut: boolean
}

const BCAST: Record<string, string | null> = { none: null, localTv: 'Local TV', nationalTv: 'National TV', streaming: 'Streaming', ppv: 'Pay-per-view' }

export function eventPosterView(state: GameState, eventId: Id): EventPosterView | null {
  const ev = state.events[eventId]
  if (!ev) return null
  const v = state.venues[ev.venueId]
  const promo = state.promotions[ev.promotionId]
  if (!v || !promo) return null
  const views = viewsOf(state)
  const ref = (id: Id): PosterFighter | null => {
    const f = views.fighter(id)
    return f ? { id: f.id, firstName: f.firstName, lastName: f.lastName, name: f.name, nickname: f.nickname, division: f.division, record: f.recordText } : null
  }
  const slots = cardSlots(state, ev)
  const mainSlot = slots[slots.length - 1]
  const coSlot = slots.length >= 3 ? slots[slots.length - 2] : null
  const mA = mainSlot ? ref(mainSlot.aId) : null, mB = mainSlot ? ref(mainSlot.bId) : null
  const cA = coSlot ? ref(coSlot.aId) : null, cB = coSlot ? ref(coSlot.bId) : null
  const mainFight = mainSlot ? cardFights(state, ev).find((f) => f.id === mainSlot.fightId) : undefined
  const fa = mainSlot ? views.fighter(mainSlot.aId) : null, fb = mainSlot ? views.fighter(mainSlot.bId) : null
  const rivalry = !!(fa && fb && fa.fightHistory.some((h) => h.opponentId === fb.id && h.fightId !== mainFight?.id))
  const nextGen = !!(fa && fb && fa.age <= 24 && fb.age <= 24)
  const international = v.country !== promo.homeCountry
  const sold = ev.sales.sold[0] + ev.sales.sold[1] + ev.sales.sold[2]
  const onSale = ['onSale', 'promoting', 'fightWeek', 'live', 'complete'].includes(ev.status) && sold > 0
  const templateId = choosePosterTemplate({
    hasMain: !!mA && !!mB, championship: false, ppv: ev.broadcast.kind === 'ppv', international, rivalry, nextGen,
    bigVenue: v.tier === 'arena' || v.tier === 'stadium', fights: slots.length,
  })
  return {
    id: ev.id, name: ev.name, day: ev.day, city: ev.city, country: ev.country ?? v.country, statusKey: ev.status, mine: ev.promotionId === state.playerPromotionId,
    templateId, templateLabel: POSTER_LABEL[templateId],
    promotion: { id: promo.id, name: promo.name, logo: promo.logo },
    venue: { id: v.id, name: v.name, tier: v.tier, tierLabel: TIER_LABEL[v.tier], capacity: v.capacity, kind: venueKind({ name: v.name, tier: v.tier, capacity: v.capacity }) },
    main: mA && mB ? { a: mA, b: mB, rounds: mainSlot.rounds, division: mainSlot.division } : null,
    coMain: cA && cB ? { a: cA, b: cB } : null,
    fights: slots.length, broadcastKind: ev.broadcast.kind, broadcastLabel: BCAST[ev.broadcast.kind] ?? null, ppv: ev.broadcast.kind === 'ppv',
    championship: false, rivalry,
    soldPct: onSale ? Math.min(100, Math.round((100 * sold) / v.capacity)) : null, soldOut: sold >= v.capacity,
  }
}
