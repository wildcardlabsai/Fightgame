/**
 * AI promotions in the fighter market. Each rival has a strategy that changes who it wants:
 *   traditional      — proven, established fighters in their prime
 *   prospectFactory  — young fighters with high (appraised) potential
 *   money            — popular, marketable names
 *   regional         — fighters from its home region
 * Rivals appraise fighters with noise that shrinks with their tier, renew or let go of expiring
 * contracts, release surplus/declining fighters, and bid against each other and against the player.
 */
import { BALANCE as B } from '../balance'
import { behaviour } from './aiFinance'
import { regionOf } from '../../data/nations'
import { weeksBetween } from '../calendar'
import { fighterAge, fighterName } from '../fighters'
import type { IdSource } from '../ids'
import { appraise, askTerms, aiLuck, normaliseOffer, valueOf } from '../market'
import { postMessage, postNews } from '../messages'
import { archiveContract, becomeFreeAgent, buildContract, pushHistory, rosterFull } from '../roster'
import type { Rng } from '../rng'
import type { Contract, Fighter, GameState, Offer, Promotion } from '../types'

const regionOfPromo = (p: Promotion) => regionOf(p.homeCountry)

/** How much this promotion wants this fighter (0–100-ish), under its own noisy appraisal. */
export function aiFit(state: GameState, promo: Promotion, f: Fighter): { fit: number; eligible: boolean } {
  const a = appraise(state, promo, f)
  const age = fighterAge(f, state.today)
  const target = B.ai.targetRating[promo.tier]
  const wins = f.record.wins
  switch (promo.ai?.strategy ?? 'traditional') {
    case 'traditional': {
      const ageAdj = age >= 25 && age <= 33 ? 5 : age < 22 ? -12 : age > 34 ? -10 : 0
      return { fit: a.rating + Math.min(wins, 25) * 0.3 + ageAdj, eligible: a.rating >= target - 6 && age <= 36 }
    }
    case 'prospectFactory':
      return { fit: 0.55 * a.potential + 0.45 * a.rating + (a.potential - a.rating) * 0.2, eligible: age <= 25 && a.potential >= target + 6 }
    case 'money':
      return { fit: f.popularity * 0.8 + f.attributes.marketability * 0.3 + a.rating * 0.3 + f.reputation * 0.2, eligible: f.popularity >= Math.max(20, target * 0.5) && age <= 37 }
    case 'regional': {
      const home = regionOf(f.nationality) === regionOfPromo(promo)
      return { fit: home ? a.rating * 0.9 + 25 : a.rating * 0.6 - 8, eligible: a.rating >= target - 14 && age <= 36 && (home || f.reputation >= 40) }
    }
  }
}

function affordable(promo: Promotion, ask: Offer): boolean {
  return ask.basePurse <= B.ai.maxPurse[promo.tier] && ask.signingBonus <= promo.cash * 0.2
}

function aiContract(state: GameState, ids: IdSource, f: Fighter, promo: Promotion, kind: 'signing' | 'renewal'): Contract {
  const ask = normaliseOffer(askTerms(state, f, promo, kind))
  promo.cash -= ask.signingBonus
  if (promo.accounting) promo.accounting.costs += ask.signingBonus
  const c = buildContract(state, f, promo.id, ask)
  c.id = ids.next('c')
  c.aiReviewed = false
  return c
}

/** Rivals decide, a couple of months out, whether to keep fighters whose contracts are ending. */
export function aiRenewals(state: GameState, rng: Rng, ids: IdSource): void {
  for (const c of Object.values(state.contracts)) {
    const promo = state.promotions[c.promotionId]
    if (promo.isPlayer || c.aiReviewed) continue
    if (weeksBetween(state.today, c.endDay) > B.contracts.expiringWeeks) continue
    const f = state.fighters[c.fighterId]
    c.aiReviewed = true
    const { fit, eligible } = aiFit(state, promo, f)
    const keep = (eligible || fit > B.ai.targetRating[promo.tier]) && rng.chance(B.ai.renewChance * (behaviour(promo).signing ? 1 : 0.35))
    if (!keep) continue
    const next = aiContract(state, ids, f, promo, 'renewal')
    archiveContract(state, c, 'renewed')
    state.contracts[next.id] = next
    f.contractId = next.id
    pushHistory(f, { day: state.today, kind: 'renewed', promotionId: promo.id })
    if (f.reputation >= 60) postNews(state, { headline: `${fighterName(f)} re-signs with ${promo.name}`, category: 'market', fighterId: f.id })
  }
}

/** Rivals trim surplus and declining fighters. */
export function aiReleases(state: GameState, rng: Rng): void {
  for (const promo of Object.values(state.promotions)) {
    if (promo.isPlayer) continue
    const roster = Object.values(state.contracts).filter((c) => c.promotionId === promo.id)
    if (roster.length <= B.ai.rosterTarget[promo.tier] - 2 || !rng.chance(B.ai.releaseChance)) continue
    let worst: { c: Contract; score: number } | null = null
    for (const c of roster) {
      const f = state.fighters[c.fighterId]
      const { fit } = aiFit(state, promo, f)
      const age = fighterAge(f, state.today)
      const score = fit - (age > 35 ? 15 : 0)
      if (!worst || score < worst.score) worst = { c, score }
    }
    if (!worst) continue
    const over = roster.length > B.ai.rosterTarget[promo.tier]
    const poor = worst.score < B.ai.targetRating[promo.tier] - 12
    if (!over && !poor) continue
    const f = state.fighters[worst.c.fighterId]
    if (f.activeFightId) continue // not in the middle of a booking
    archiveContract(state, worst.c, 'released')
    becomeFreeAgent(state, f, 'released', promo.id)
    if (f.reputation >= 45) postNews(state, { headline: `${promo.name} release ${fighterName(f)} (${f.record.wins}-${f.record.losses}-${f.record.draws})`, category: 'release', fighterId: f.id })
  }
}

interface Bid { promo: Promotion; fit: number }

/** Rivals scout the market and bid; contested fighters go to the most attractive suitor. */
export function aiSigning(state: GameState, rng: Rng, ids: IdSource): void {
  const market = Object.values(state.fighters).filter((f) => f.status === 'active' && f.contractId === null)
  if (market.length === 0) return
  const bids = new Map<string, Bid[]>()
  const promos = rng.shuffle(Object.values(state.promotions).filter((p) => !p.isPlayer && p.ai))

  for (const promo of promos) {
    const ai = promo.ai!
    if (state.today < ai.cooldownUntil || rosterFull(state, promo.id) || !behaviour(promo).signing || ai.fin.collapsing) continue
    const count = Object.values(state.contracts).filter((c) => c.promotionId === promo.id).length
    const needs = count < B.ai.rosterTarget[promo.tier]
    const p = needs ? (ai.urgency > 0 ? B.ai.urgentSignChance : B.ai.signChance) : 0.04
    if (!rng.chance(p)) continue
    let best: { f: Fighter; fit: number } | null = null
    for (const f of market) {
      const { fit, eligible } = aiFit(state, promo, f)
      if (!eligible) continue
      if (!affordable(promo, askTerms(state, f, promo, 'signing'))) continue
      if (!best || fit > best.fit) best = { f, fit }
    }
    if (!best) continue
    const list = bids.get(best.f.id) ?? []
    list.push({ promo, fit: best.fit })
    bids.set(best.f.id, list)
  }

  for (const [fid, list] of bids) {
    const f = state.fighters[fid]
    if (f.contractId) continue
    const winner = list
      .map((b) => ({ ...b, appeal: b.promo.reputation * 0.5 + b.fit * 0.5 + aiLuck(state, b.promo.id, fid) * 10 }))
      .sort((a, b) => b.appeal - a.appeal)
    const win = winner[0]
    for (const lose of winner.slice(1)) lose.promo.ai!.urgency = Math.min(3, lose.promo.ai!.urgency + 1)

    const c = aiContract(state, ids, f, win.promo, 'signing')
    state.contracts[c.id] = c
    f.contractId = c.id
    f.availableSince = null
    pushHistory(f, { day: state.today, kind: 'signed', promotionId: win.promo.id })
    win.promo.ai!.urgency = Math.max(0, win.promo.ai!.urgency - 1)
    win.promo.ai!.cooldownUntil = state.today + rng.int(1, 3) * 7

    const notable = f.reputation >= 40 || f.popularity >= 40 || valueOf(state, f) >= 45
    if (notable) postNews(state, { headline: `${win.promo.name} sign ${fighterName(f)} (${f.record.wins}-${f.record.losses}-${f.record.draws})`, category: 'signing', fighterId: f.id })

    const interested = state.knowledge[f.id] && (state.shortlist.includes(f.id) || state.knowledge[f.id].reports.length > 0 || state.negotiations[f.id])
    if (interested) {
      delete state.negotiations[f.id]
      postMessage(state, {
        from: 'Scouting', category: 'world', priority: 'important',
        subject: `${win.promo.name} sign ${fighterName(f)}`,
        body: `${fighterName(f)} — a fighter you were looking at — has signed with ${win.promo.name}. The market moves fast; shortlisted talent will not wait for you.`,
        link: { kind: 'fighter', id: f.id },
      })
    }
  }
}
