/**
 * FIGHT PROMOTION CAMPAIGNS. Beyond how much is spent (the marketing budget) and where (the media buy), the promoter chooses the ANGLE
 * a show is sold on. Each angle suits some cards and not others, and says so honestly:
 *
 *   traditional  a straightforward professional campaign; works for anything, excites nothing
 *   prestige     sold on sporting stakes: suits a title or eliminator, or two ranked fighters; hollow otherwise
 *   rivalry      sold on bad blood: suits a real, public rivalry or a rematch; looks manufactured otherwise
 *   showcase     sold on young talent: suits cards full of unbeaten prospects
 *   local        sold on home support: suits cards with local fighters in the room's own country
 *   headline     sold on a star: suits a main event with a real draw
 *
 * The effect is a number of points of show interest (the same scale as a press conference's hype), scaled by how well the angle fits
 * the card and how much is being spent behind it, with a keyed, hidden element of luck at the gate. A poor fit is a real cost: it
 * points the wrong way, and a campaign that overreaches costs the promotion a little standing when the show is settled.
 */
import { keyedFloat } from '../rng'
import { rivalryStrength } from '../media/narratives'
import { spend } from '../eventFinance'
import { fighterAge } from '../fighters'
import type { BoxingEvent, Fight, GameState, Id } from '../types'
import { cardProfile } from './strategy'
import { nextOfficeId, noteDecision, officeOf, once } from './state'
import type { CampaignKind } from './types'

export const CAMPAIGN_ORDER: CampaignKind[] = ['traditional', 'prestige', 'rivalry', 'showcase', 'local', 'headline']
export const CAMPAIGN_INFO: Record<CampaignKind, { label: string; blurb: string; max: number; fee: number }> = {
  traditional: { label: 'Traditional promotion', blurb: 'A straightforward professional campaign: posters, press and the usual outlets.', max: 2, fee: 0 },
  prestige: { label: 'Sporting prestige', blurb: 'Sell the stakes: the belt, the rankings, what the result means for the division.', max: 7, fee: 1 },
  rivalry: { label: 'Rivalry-led', blurb: 'Sell the bad blood. Only convincing when the two fighters have real history.', max: 8, fee: 1.2 },
  showcase: { label: 'Prospect showcase', blurb: 'Sell the next generation: unbeaten young fighters, a night of firsts.', max: 4, fee: 0.6 },
  local: { label: 'Local and regional appeal', blurb: 'Sell home support: the local fighters, the local rooms.', max: 5, fee: 0.6 },
  headline: { label: 'High-profile headline campaign', blurb: 'Sell a star. Expensive, and only worth it with a genuine draw on top.', max: 7, fee: 1.6 },
}

const topFights = (state: GameState, ev: BoxingEvent): Fight[] => ev.card.map((id) => state.fights[id]).filter((f): f is Fight => !!f && f.status !== 'cancelled').slice(-2)

export interface Suitability { score: number; why: string }

/** How well an angle fits THIS card, 0-1, from public facts. */
export function campaignSuitability(state: GameState, ev: BoxingEvent, kind: CampaignKind): Suitability {
  const p = cardProfile(state, ev)
  const top = topFights(state, ev)
  const main = top[top.length - 1]
  switch (kind) {
    case 'traditional': return { score: 0.55, why: 'Suits any card.' }
    case 'prestige':
      return p.titleMain ? { score: 1, why: 'A championship or eliminator in the top two bouts.' } : p.rankedMain ? { score: 0.6, why: 'Two ranked fighters in the top two bouts.' } : { score: 0.1, why: 'No title and no ranked matchup at the top: there is little stake to sell.' }
    case 'rivalry': {
      if (!main) return { score: 0, why: 'There is no main event yet.' }
      const strength = state.media ? rivalryStrength(state.media, main.sideA.fighterId, main.sideB.fighterId) : 0
      const rematch = !!main.rematchOf || state.fighters[main.sideA.fighterId].recentFights.some((id) => state.fights[id]?.result && (state.fights[id].sideA.fighterId === main.sideB.fighterId || state.fights[id].sideB.fighterId === main.sideB.fighterId))
      const score = Math.min(1, strength / 55 + (rematch ? 0.15 : 0))
      return { score, why: score >= 0.5 ? 'The main event has real history between the two fighters.' : score >= 0.25 ? 'Some history, not much heat yet.' : 'The two fighters have no history worth selling: it would look manufactured.' }
    }
    case 'showcase': return { score: p.prospectShare >= 0.5 ? 0.4 + 0.6 * p.prospectShare : p.prospectShare * 0.5, why: p.prospectShare >= 0.5 ? 'A card of young fighters.' : 'Too many established names for a showcase.' }
    case 'local': {
      const v = state.venues[ev.venueId]
      let n = 0, hit = 0
      for (const f of top) for (const s of [f.sideA, f.sideB]) { n++; if (state.fighters[s.fighterId].nationality === v?.country) hit++ }
      const score = n ? hit / n : 0
      return { score, why: score >= 0.5 ? 'Home fighters in the top bouts.' : 'Few local fighters at the top of the card.' }
    }
    case 'headline': return { score: Math.min(1, p.headlinerPop / 65), why: p.headlinerPop >= 45 ? 'A main event with a genuine draw.' : 'The main event has no real pull yet: the money would be wasted.' }
  }
}

/** One-off cost of mounting the campaign, scaled to the room (a bigger building means a bigger campaign). */
export function campaignFee(state: GameState, ev: BoxingEvent, kind: CampaignKind): number {
  const v = state.venues[ev.venueId]
  return Math.round(((800 + 0.5 * (v?.capacity ?? 1000)) * CAMPAIGN_INFO[kind].fee) / 50) * 50
}

const spendFactor = (state: GameState, ev: BoxingEvent): number => {
  const cap = state.venues[ev.venueId]?.capacity ?? 1000
  return 0.35 + 0.65 * (1 - Math.exp(-ev.marketing.budget / (3000 + 1.2 * cap)))
}

/** Points of show interest the chosen angle adds (public: it is what the forecast shows). Negative when the angle does not fit the card. */
export function campaignPoints(state: GameState, ev: BoxingEvent): number {
  if (!state.media?.effects) return 0
  const c = state.office?.campaigns[ev.id]
  if (!c || ev.promotionId !== state.playerPromotionId) return 0
  const s = campaignSuitability(state, ev, c.kind).score
  const info = CAMPAIGN_INFO[c.kind]
  const raw = info.max * s * spendFactor(state, ev)
  const misfit = c.kind !== 'traditional' && s < 0.25 ? -2 : 0
  return Math.round((raw + misfit) * 10) / 10
}

/** The hidden element: how the campaign actually lands with the public (about +-4% of demand at most). Only for the real gate. */
export function campaignLuck(state: GameState, ev: BoxingEvent): number {
  const pts = campaignPoints(state, ev)
  if (pts === 0) return 1
  const luck = keyedFloat(state.seed, 'campaign', ev.id) // 0..1
  return Math.exp(0.02 * pts * (luck - 0.5) * 2)
}

export interface CampaignResult { ok: boolean; error?: string }

export function setCampaign(state: GameState, eventId: Id, kind: CampaignKind): CampaignResult {
  const ev = state.events[eventId]
  if (!ev || ev.promotionId !== state.playerPromotionId) return { ok: false, error: 'That is not one of your shows.' }
  if (!['venueBooked', 'cardBuilding', 'onSale', 'promoting'].includes(ev.status)) return { ok: false, error: 'The show is too close, or too late, to change the campaign.' }
  if (ev.day - state.today < 7) return { ok: false, error: 'It is fight week: the campaign is what it is.' }
  const o = officeOf(state)
  const cur = o.campaigns[ev.id]?.kind ?? 'traditional'
  if (cur === kind) return { ok: true }
  if (state.promotions[state.playerPromotionId].cash < campaignFee(state, ev, kind)) return { ok: false, error: 'You cannot afford that campaign.' }
  const fee = campaignFee(state, ev, kind) * (cur === 'traditional' ? 1 : 0.5) // changing course midway costs half again
  if (fee > 0) spend(state, ev, 'marketing', fee, `Campaign — ${CAMPAIGN_INFO[kind].label} (${ev.name})`)
  o.campaigns[ev.id] = { kind, set: state.today, budget: fee }
  void nextOfficeId
  return { ok: true }
}

/** At settlement: a campaign that overreached costs standing; one that fitted lifts the fighters it was built on. Applied once, bounded. */
export function settleCampaign(state: GameState, ev: BoxingEvent, fill: number): void {
  const c = state.office?.campaigns[ev.id]
  if (!c || ev.promotionId !== state.playerPromotionId || !state.media?.effects) return
  if (!once(state, `campaign:${ev.id}`)) return
  const s = campaignSuitability(state, ev, c.kind).score
  const p = state.promotions[ev.promotionId]
  if (c.kind !== 'traditional' && s < 0.25) {
    p.reputation = Math.max(0, p.reputation - 0.4)
    state.office!.campaigns[ev.id].budget = c.budget
  } else if (s >= 0.7 && fill >= 0.7 && c.kind === 'showcase') {
    for (const f of topFights(state, ev).concat(ev.card.map((id) => state.fights[id]).filter((f): f is Fight => !!f))) for (const side of [f.sideA, f.sideB]) {
      const x = state.fighters[side.fighterId]
      if (x && fighterAge(x, state.today) <= 24) x.popularity = Math.min(100, x.popularity + 0.6)
    }
  } else if (c.kind === 'headline' && fill < 0.6) {
    p.reputation = Math.max(0, p.reputation - 0.3) // the star did not sell the building
  }
  void noteDecision
}
