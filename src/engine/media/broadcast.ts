/**
 * BROADCAST MARKET. Fictional broadcasters bid for the player's shows. An offer is priced from the same public numbers the
 * player's own forecast uses (event interest, card quality, expected audience) and shaped by the broadcaster's reach, prestige
 * and appetite for boxing. Accepting one fixes the event's broadcast option and, at settlement, the money is paid through the
 * normal event ledger (`receive`) — the media world never touches cash directly.
 */
import { broadcastTerms, cardQuality, eventInterest, ppvBuysFor, viewersFor } from '../events/demand'
import { BALANCE as B } from '../balance'
import { broadcasterIdentity } from '../../data/mediaIdentity'
import { keyedRng } from '../rng'
import { tierAllowsBroadcast } from '../tiers'
import type { BoxingEvent, BroadcastKind, GameState, Id } from '../types'
import { fighterName } from '../fighters'
import { coverEvent } from './stories'
import { BROADCAST_BEHAVIOURS, BROADCAST_ORDER } from './orgs'
import { mediaMessage } from './inbox'
import { LIMITS } from './state'
import type { BroadcastDeal, BroadcastOffer, MediaState, RightsKind } from './types'
import type { WorldEvent } from './worldEvents'
import { clampTo, nextId, weekIndex } from './util'

const E = B.events
const OPEN_STATUSES = ['cardBuilding', 'onSale', 'promoting']
const TERRITORY: Record<string, string> = { Global: 'Worldwide', UKI: 'UK & Ireland', AMERICAS: 'The Americas', WORLD: 'International' }
export const territoryLabel = (reach: string[]): string => reach.map((r) => TERRITORY[r] ?? r).join(' & ')

export const dealFor = (state: GameState, ev: BoxingEvent): BroadcastDeal | null => state.media?.deals[ev.id] ?? null

const rightsFor = (orgId: string, kind: BroadcastKind): RightsKind => {
  const b = BROADCAST_BEHAVIOURS[orgId]
  if (kind === 'ppv') return 'PPV_DISTRIBUTION'
  if (b.kind === 'INTERNATIONAL') return 'INTERNATIONAL'
  if (kind === 'streaming') return 'STREAMING'
  if (b.kind === 'CABLE') return 'REGIONAL'
  return b.exclusiveRights ? 'EXCLUSIVE' : 'EVENT'
}

/** What the broadcaster would pay for this show, from public numbers only. Null if it has no use for the show. */
function priceOffer(state: GameState, media: MediaState, ev: BoxingEvent, orgId: string): Omit<BroadcastOffer, 'id' | 'createdWeek' | 'expiresWeek' | 'status'> | null {
  const b = BROADCAST_BEHAVIOURS[orgId]
  const st = media.bcOrgs[orgId]
  if (!st?.active) return null
  const p = state.promotions[ev.promotionId]
  const interest = eventInterest(state, ev)
  const venue = state.venues[ev.venueId]
  const req = Math.max(1, Math.min(5, Math.round((b.prestige - 30) / 18)))
  if (venue.production < req) return null
  const need = 20 + b.prestige * 0.2
  if (interest < need) return null
  const q = cardQuality(state, ev)
  const mult = (0.85 + 0.003 * st.boxingInterest + 0.002 * b.prestige) * st.budget
  type Pick = { kind: BroadcastKind; guaranteed: number; share: number; minAudience: number }
  const picks: Pick[] = []
  for (const kind of b.carries) {
    if (kind === 'none') continue
    if (p.isPlayer && !tierAllowsBroadcast(p.tier, kind)) continue
    const t = broadcastTerms(state, ev, kind, 'public')
    if (!t.available) continue
    if (kind === 'ppv') {
      if (!b.ppvCapable) continue
      const buys = ppvBuysFor(state, ev, 'public')
      const floor = Math.round(buys * ev.broadcast.ppvPrice * E.ppv.promoterShare * 0.6 / 100) * 100
      picks.push({ kind, guaranteed: floor, share: Math.round((E.ppv.promoterShare - 0.06) * 100) / 100, minAudience: Math.round(buys * 0.7) })
    } else if (kind === 'streaming') {
      const viewers = viewersFor(state, ev, 'public')
      picks.push({ kind, guaranteed: Math.round(viewers * E.tv.streaming.perViewer * 0.8 * mult / 100) * 100, share: Math.round(E.tv.streaming.perViewer * 0.5 * 100) / 100, minAudience: Math.round(viewers * 0.8) })
    } else {
      const viewers = viewersFor(state, ev, 'public')
      picks.push({ kind, guaranteed: Math.round(t.fee * mult / 100) * 100, share: 0, minAudience: Math.round(viewers * 0.6) })
    }
  }
  const best = picks.filter((x) => x.guaranteed > 0).sort((a, c) => c.guaranteed - a.guaranteed)[0]
  if (!best) return null
  const main = q.mainFight
  return {
    organisationId: orgId, eventId: ev.id, rights: rightsFor(orgId, best.kind), kind: best.kind, guaranteed: best.guaranteed, share: best.share, minAudience: best.minAudience,
    productionReq: req, exclusive: b.exclusiveRights, territory: territoryLabel(b.regionalReach),
    basis: { interest: Math.round(interest), mainEvent: main ? `${fighterName(state.fighters[main.sideA.fighterId])} v ${fighterName(state.fighters[main.sideB.fighterId])}` : 'the card', relationship: 0 },
  }
}

/** Weekly: broadcasters make offers on the player's open shows and old offers lapse. */
export function weeklyOffers(state: GameState, media: MediaState, week: number, steps = 1): void {
  for (const o of media.offers) {
    const ev = state.events[o.eventId]
    if (o.status === 'open' && (week > o.expiresWeek || !ev || !OPEN_STATUSES.includes(ev.status) || media.deals[o.eventId])) o.status = week > o.expiresWeek ? 'expired' : 'void'
  }
  media.offers = media.offers.filter((o) => o.status === 'open' || week - o.createdWeek < 12).slice(0, LIMITS.offers)
  const rng = keyedRng(state.seed, 'bcoffer', week)
  for (const ev of Object.values(state.events)) {
    if (ev.promotionId !== state.playerPromotionId || !OPEN_STATUSES.includes(ev.status) || media.deals[ev.id]) continue
    const weeks = Math.floor((ev.day - state.today) / 7)
    if (weeks < 3 || ev.card.length === 0) continue
    const open = media.offers.filter((o) => o.eventId === ev.id && o.status === 'open')
    if (open.length >= 3) continue
    const interest = eventInterest(state, ev)
    for (const orgId of BROADCAST_ORDER) {
      const st = media.bcOrgs[orgId]
      const b = BROADCAST_BEHAVIOURS[orgId]
      if (!st?.active || (st.cool ?? 0) > week || open.some((o) => o.organisationId === orgId) || media.offers.some((o) => o.eventId === ev.id && o.organisationId === orgId)) continue
      const p = clampTo(Math.pow(Math.max(0, interest - 20) / 80, 1.2) * (st.boxingInterest / 100) * (b.prestige / 100 + 0.3) * 0.5 * steps, 0, 0.6)
      if (rng.next() >= p) continue
      const priced = priceOffer(state, media, ev, orgId)
      if (!priced) continue
      const offer: BroadcastOffer = { ...priced, id: nextId(media, 'bo'), createdWeek: week, expiresWeek: week + 3, status: 'open' }
      media.offers.unshift(offer)
      open.push(offer)
      const id = broadcasterIdentity(orgId)
      mediaMessage(state, media, {
        from: id.shortName, category: 'finance', priority: 'important', key: `bco-${offer.id}`,
        subject: `BROADCAST OFFER: ${id.name} for ${ev.name}`,
        body: `${id.name} would put ${ev.name} on ${offer.kind === 'ppv' ? 'pay-per-view' : offer.kind === 'streaming' ? 'streaming' : 'television'}: £${offer.guaranteed.toLocaleString('en-GB')} guaranteed${offer.share && offer.kind !== 'ppv' ? `, plus £${offer.share.toFixed(2)} a viewer over ${offer.minAudience.toLocaleString('en-GB')}` : ''}${offer.kind === 'ppv' ? `, with you keeping ${Math.round(offer.share * 100)}% of each buy` : ''}. They need a venue production level of ${offer.productionReq}+ and expect at least ${offer.minAudience.toLocaleString('en-GB')} ${offer.kind === 'ppv' ? 'buys' : 'viewers'}. The offer stands for 3 weeks.`,
        link: { kind: 'event', id: ev.id },
      })
      if (open.length >= 3) break
    }
  }
}

export interface DealOutcome { ok: boolean; message: string }

export function acceptOffer(state: GameState, media: MediaState, offerId: string): DealOutcome {
  const o = media.offers.find((x) => x.id === offerId)
  const week = weekIndex(state)
  if (!o || o.status !== 'open') return { ok: false, message: 'That offer is no longer on the table.' }
  const ev = state.events[o.eventId]
  if (!ev || ev.promotionId !== state.playerPromotionId || !OPEN_STATUSES.includes(ev.status)) { o.status = 'void'; return { ok: false, message: 'The show can no longer take a broadcast deal.' } }
  if (media.deals[ev.id]) return { ok: false, message: 'This show already has a broadcast deal.' }
  const venue = state.venues[ev.venueId]
  if (venue.production < o.productionReq) { o.status = 'void'; return { ok: false, message: `The venue's production level (${venue.production}) is below the ${o.productionReq} they require.` } }
  const t = broadcastTerms(state, ev, o.kind, 'public')
  if (!t.available) return { ok: false, message: t.reason ?? 'That broadcast option is not available to this show.' }
  ev.broadcast.kind = o.kind
  if (o.kind === 'ppv') ev.broadcast.ppvPrice = Math.max(ev.broadcast.ppvPrice, 5)
  media.deals[ev.id] = { organisationId: o.organisationId, offerId: o.id, rights: o.rights, kind: o.kind, guaranteed: o.guaranteed, share: o.share, minAudience: o.minAudience, exclusive: o.exclusive, territory: o.territory, acceptedWeek: week }
  o.status = 'accepted'
  for (const x of media.offers) if (x.eventId === ev.id && x.id !== o.id && x.status === 'open') x.status = 'void'
  const org = broadcasterIdentity(o.organisationId)
  const promo = state.promotions[ev.promotionId]
  const w: WorldEvent = { kind: 'BROADCAST_DEAL', day: state.today, fighters: [], names: [], promotions: [promo.id], eventId: ev.id, facts: { promo: promo.name, org: org.name, ev: ev.name }, sig: Math.round(clampTo(20 + o.basis.interest * 0.35)), parts: {}, tags: ['deal'] }
  coverEvent(state, media, w, `deal:${o.id}`)
  return { ok: true, message: `${org.name} will broadcast ${ev.name}. £${o.guaranteed.toLocaleString('en-GB')} is guaranteed at settlement.` }
}

export function declineOffer(media: MediaState, offerId: string): DealOutcome {
  const o = media.offers.find((x) => x.id === offerId)
  if (!o || o.status !== 'open') return { ok: false, message: 'That offer is no longer on the table.' }
  o.status = 'declined'
  return { ok: true, message: 'Offer declined.' }
}

/** Walk away from an accepted deal. The broadcaster will not come back for twelve weeks. */
export function releaseDeal(state: GameState, media: MediaState, eventId: Id): DealOutcome {
  const d = media.deals[eventId]
  const ev = state.events[eventId]
  if (!d || !ev || !OPEN_STATUSES.includes(ev.status)) return { ok: false, message: 'There is no broadcast deal that can be released.' }
  delete media.deals[eventId]
  const st = media.bcOrgs[d.organisationId]
  if (st) st.cool = weekIndex(state) + 12
  return { ok: true, message: `You released ${ev.name} from its deal with ${broadcasterIdentity(d.organisationId).name}. They will not bid again for 12 weeks.` }
}

export function voidBroadcast(state: GameState, eventId: Id): void {
  const media = state.media
  if (!media) return
  delete media.deals[eventId]
  for (const o of media.offers) if (o.eventId === eventId && o.status === 'open') o.status = 'void'
}

/** Settlement money for a deal. Paid by the caller through the event ledger. */
export function settleDeal(deal: BroadcastDeal, viewers: number, ppvBuys: number, price: number): { revenue: number; label: string } {
  const org = broadcasterIdentity(deal.organisationId).name
  if (deal.kind === 'ppv') {
    const gross = Math.round(ppvBuys * price * deal.share)
    return { revenue: Math.max(gross, deal.guaranteed), label: `PPV revenue — ${org} distribution (${ppvBuys.toLocaleString('en-GB')} buys, ${Math.round(deal.share * 100)}% share${gross < deal.guaranteed ? ', guarantee applied' : ''})` }
  }
  const factor = viewers >= deal.minAudience ? 1 : Math.max(0.6, viewers / Math.max(1, deal.minAudience))
  const bonus = Math.max(0, viewers - deal.minAudience) * deal.share
  return { revenue: Math.round(deal.guaranteed * factor + bonus), label: `Broadcast fee — ${org}${factor < 1 ? ' (audience below the minimum)' : bonus > 0 ? ' (audience bonus)' : ''}` }
}
