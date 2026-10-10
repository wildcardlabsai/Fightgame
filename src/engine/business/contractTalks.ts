/**
 * CONTRACT CONVERSATIONS (signing and renewal). A multi-turn exchange with a fighter’s camp, not a single “offer → counter” button.
 *
 * The player can ASK (what is the camp looking for? what does the fighter want from the sport?), PROPOSE terms (money, length, fights,
 * a real pathway, a development plan), ACCEPT the camp’s counter, ASK FOR TIME, or WALK. The camp answers in its manager’s own voice.
 *
 * What the camp does with a proposal is decided by `utility()`: the engine’s own hidden valuation (`scoreOffer`: personality, relationship,
 * standing, promotion prestige, soft terms) bent by the manager’s priorities, the fighter’s ambition, their stage in the sport, the
 * development plan on the table and the camp’s memory of the player (promises kept / broken, lowballs). Counters are BUILT from that
 * state: the camp asks first for the thing it cares most about that is missing (a route to a title, more fights, a plan, security),
 * and only then for money; they concede over the turns, never asking for more than their last counter, and never below their reserve.
 *
 * Nothing hidden is returned: the view shows the camp’s words, a mood and a three-step tension, and whatever the camp has chosen to tell.
 */
import { BALANCE as B } from '../balance'
import { canAfford } from '../ledger'
import { availabilityFor, normaliseOffer, offerValue } from '../market'
import { concludeSigning, renewalWindowOpen, scoreOffer, suggestedOffer, type Score } from '../negotiation'
import { fighterName } from '../fighters'
import { postMessage } from '../messages'
import { rosterFull } from '../roster'
import { player } from '../selectors'
import { stateIds } from '../ids'
import type { Contract, Fighter, GameState, Id, Negotiation, NegotiationKind, Offer, Promotion } from '../types'
import { createCommitment, pathwayIsReal, pathwayOptions, pathwayText } from './commitments'
import { ambitionLabel, ambitionLine, ambitionOf, AMBITION_PATHWAYS, managerOf, topPriorities, type Manager, type Priority } from './manager'
import { planFit, setPlan } from './plans'
import { negStage, STAGE_BEND, type NegStage } from './stage'
import { biz, demandFor, evasiveLine, expectationsLine, learn, moodOf, nameOf, nextBizId, pushLine, trimTalks, voiceLine, wantsText, type Verdict4 } from './talkCore'
import type { DevPlan, Talk } from './types'

export type ContractMove =
  | { kind: 'ask'; topic: 'priorities' | 'ambition' }
  | { kind: 'propose'; offer: Offer }
  | { kind: 'acceptCounter' }
  | { kind: 'time' }
  | { kind: 'walk' }

export interface TalkOutcome { ok: boolean; error?: string; state: GameState; talkId?: string; signed?: Contract }

const PRIORITIES: Priority[] = ['money', 'title', 'activity', 'exposure', 'career', 'loyalty', 'development', 'security']
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

// ------------------------------------------------------------- valuation

export interface Utility {
  ratio: number
  base: Score
  sat: Record<Priority, number>
  /** The priority the offer fails the most, weighted by how much this camp cares. */
  unmet: Priority | null
  weights: Record<Priority, number>
  mgr: Manager
  stage: NegStage
}

/** Priority weights for this camp: the manager’s hidden weights bent by the fighter’s stage, normalised to sum to 1. */
export function campWeights(mgr: Manager, stage: NegStage): Record<Priority, number> {
  const bend = STAGE_BEND[stage].weights
  const raw = Object.fromEntries(PRIORITIES.map((p) => [p, mgr.weights[p] * (bend[p] ?? 1)])) as Record<Priority, number>
  const sum = PRIORITIES.reduce((a, p) => a + raw[p], 0) || 1
  return Object.fromEntries(PRIORITIES.map((p) => [p, raw[p] / sum])) as Record<Priority, number>
}

export function contractUtility(state: GameState, f: Fighter, promo: Promotion, offer: Offer, kind: NegotiationKind): Utility {
  const base = scoreOffer(state, f, promo, offer, kind)
  const mgr = managerOf(state, f)
  const stage = negStage(state, f)
  const w = campWeights(mgr, stage)
  const amb = ambitionOf(state, f)
  const ask = base.ask
  const memory = state.business?.neg[f.id]
  const rel = f.promoRelations[promo.id] ?? 0

  const wantsPaths = AMBITION_PATHWAYS[amb.kind] ?? []
  const titleStage = stage === 'contender' || stage === 'champion'
  const pathMatch = !!offer.pathway && wantsPaths.includes(offer.pathway.kind)
  const sat = {} as Record<Priority, number>
  sat.money = clamp((offerValue(offer, f.popularity) / Math.max(1, base.vAsk) - 1) * 3, -1, 1)
  sat.title = pathMatch ? 1 : offer.pathway ? (offer.pathway.kind === 'activity' ? 0 : 0.55) : offer.titlePromise ? 0.35 : (titleStage || wantsPaths.some((k) => k !== 'activity' && k !== 'headline')) ? -1 : -0.2
  sat.activity = clamp((offer.minFightsPerYear - ask.minFightsPerYear) / 2, -1, 1) + (offer.pathway?.kind === 'activity' ? 0.4 : 0)
  sat.exposure = clamp((promo.reputation - f.reputation) / 30, -1, 0.6) + (offer.pathway?.kind === 'headline' ? 0.7 : 0)
  const planScore = offer.plan ? planFit(state, f, offer.plan).score : 0
  sat.career = (offer.pathway ? 0.5 : 0) + planScore * 0.8 + (offer.plan ? 0.2 : 0) - (offer.pathway || offer.plan ? 0 : 0.4)
  sat.loyalty = clamp(rel / 60, -1, 1) * 0.7 + (offer.years >= ask.years ? 0.2 : -0.1) + 0.3 * Math.min(2, memory?.kept ?? 0) - 0.55 * Math.min(2, memory?.broken ?? 0)
  sat.development = (offer.plan === 'protected' && stage === 'prospect' ? 1 : offer.plan ? planScore : stage === 'prospect' ? -0.5 : 0)
  sat.security = clamp((offer.years - ask.years) * 0.35 + (offer.signingBonus / Math.max(1, ask.signingBonus) - 1) * 0.5, -1, 1)
  for (const p of PRIORITIES) sat[p] = clamp(sat[p], -1, 1)

  // The overlay is bounded (±16% of the hidden valuation) so a manager cannot turn a poor deal into a good one, only reorder what matters.
  let adj = 0
  for (const p of PRIORITIES) adj += w[p] * sat[p]
  let ratio = base.ratio * (1 + 0.16 * clamp(adj * 2, -1, 1))
  // The camp’s memory of the player: a broken promise is not forgotten; kept ones buy a little patience.
  ratio -= 0.04 * Math.min(3, memory?.broken ?? 0)
  ratio += 0.015 * Math.min(3, memory?.kept ?? 0)
  // A contender / champion whose ambition is a title does not sign a deal with nothing on titles in it, however well it pays.
  if (titleStage && wantsPaths.some((k) => k !== 'activity' && k !== 'headline') && !offer.pathway && !offer.titlePromise && w.title > 0.14) ratio = Math.min(ratio, 0.99)

  let unmet: Priority | null = null, worst = 0.05
  for (const p of PRIORITIES) { const gap = w[p] * Math.max(0, -sat[p] + (p === 'money' ? 0 : 0)); if (gap > worst) { worst = gap; unmet = p } }
  if (ratio >= 1.0 && unmet === null) unmet = null
  return { ratio, base, sat, unmet, weights: w, mgr, stage }
}

// ------------------------------------------------------------- counters

const sameMoney = (a: Offer, b: Offer): boolean => a.basePurse === b.basePurse && a.signingBonus === b.signingBonus && a.weeklyRetainer === b.weeklyRetainer && a.winBonus === b.winBonus

/** A counter built from the negotiation’s real state. See the header: asks for the missing priority first, then money. */
export function buildContractCounter(state: GameState, f: Fighter, promo: Promotion, offer: Offer, kind: NegotiationKind, talk: Talk): Offer {
  const u0 = contractUtility(state, f, promo, offer, kind)
  const { mgr, weights: w } = u0
  let c: Offer = { ...offer }
  const ask = u0.base.ask
  const amb = ambitionOf(state, f)
  const target = B.negotiation.counterMargin + (mgr.archetype === 'AGGRESSIVE' ? 0.03 : 0) - (talk.patience / Math.max(1, talk.p0) < 0.4 ? 0.0 : 0.01)

  const order = PRIORITIES.slice().sort((a, b) => w[b] * Math.max(0, -u0.sat[b]) - w[a] * Math.max(0, -u0.sat[a]))
  for (const p of order) {
    if (contractUtility(state, f, promo, c, kind).ratio >= target) break
    if (w[p] * Math.max(0, -u0.sat[p]) <= 0.01) continue
    switch (p) {
      case 'title': case 'career': {
        const opts = pathwayOptions(state, f)
        const want = (AMBITION_PATHWAYS[amb.kind] ?? []).map((k) => opts.find((o) => o.offer.kind === k)).find(Boolean) ?? opts.find((o) => o.offer.kind !== 'activity' && o.offer.kind !== 'headline')
        if (p === 'title' && !c.pathway && want) c.pathway = want.offer
        else if (p === 'career' && !c.plan) c.plan = planFit(state, f, 'normal').recommended
        break
      }
      case 'activity': if (c.minFightsPerYear < ask.minFightsPerYear) c.minFightsPerYear = ask.minFightsPerYear; else if (!c.pathway) { const a = pathwayOptions(state, f).find((o) => o.offer.kind === 'activity'); if (a) c.pathway = a.offer } break
      case 'development': if (!c.plan) c.plan = planFit(state, f, 'normal').recommended; break
      case 'exposure': if (!c.pathway) { const h = pathwayOptions(state, f).find((o) => o.offer.kind === 'headline'); if (h) c.pathway = h.offer } break
      case 'security': case 'loyalty': c.years = Math.max(c.years, ask.years); c.signingBonus = Math.max(c.signingBonus, ask.signingBonus * 0.9); break
      default: break
    }
    c = normaliseOffer(c)
  }
  // Money last, split the way this manager likes it.
  for (let i = 0; i < 14; i++) {
    const u = contractUtility(state, f, promo, c, kind)
    if (u.ratio >= target) break
    const deficit = (target - u.ratio) * u.base.vAsk * (B.negotiation.threshold[f.personality] ?? 1)
    const upfront = mgr.archetype === 'CAUTIOUS' || mgr.archetype === 'LOYAL' ? 0.7 : mgr.archetype === 'MONEY_FOCUSED' ? 0.35 : 0.5
    c = normaliseOffer({
      ...c,
      signingBonus: c.signingBonus + deficit * upfront + 100,
      basePurse: c.basePurse + (deficit * (1 - upfront)) / Math.max(1, c.fights) + 100,
    })
  }
  // They concede as the talks go on: never ask for more money than the last counter did, unless that no longer clears their bar.
  const prev = talk.counter
  if (prev && !sameMoney(prev, c)) {
    const eased = normaliseOffer({
      ...c,
      signingBonus: Math.min(c.signingBonus, prev.signingBonus), basePurse: Math.min(c.basePurse, prev.basePurse),
      weeklyRetainer: Math.min(c.weeklyRetainer, prev.weeklyRetainer), winBonus: Math.min(c.winBonus, prev.winBonus),
    })
    if (contractUtility(state, f, promo, eased, kind).ratio >= B.negotiation.acceptRatio) c = eased
  }
  return c
}

/** Plain-language list of what changed between two offers (for the UI’s “their counter” strip). */
export function describeChange(from: Offer, to: Offer): string[] {
  const out: string[] = []
  const m = (n: number) => `£${n.toLocaleString('en-GB')}`
  if (to.basePurse !== from.basePurse) out.push(`Purse ${m(from.basePurse)} → ${m(to.basePurse)}`)
  if (to.winBonus !== from.winBonus) out.push(`Win bonus ${m(from.winBonus)} → ${m(to.winBonus)}`)
  if (to.signingBonus !== from.signingBonus) out.push(`Signing bonus ${m(from.signingBonus)} → ${m(to.signingBonus)}`)
  if (to.weeklyRetainer !== from.weeklyRetainer) out.push(`Retainer ${m(from.weeklyRetainer)} → ${m(to.weeklyRetainer)}`)
  if (to.years !== from.years) out.push(`Length ${from.years} → ${to.years} yr`)
  if (to.minFightsPerYear !== from.minFightsPerYear) out.push(`Minimum fights ${from.minFightsPerYear} → ${to.minFightsPerYear} a year`)
  if (to.pathway && (!from.pathway || from.pathway.kind !== to.pathway.kind)) out.push(`Wants ${pathwayText(to.pathway)}`)
  if (to.plan && to.plan !== from.plan) out.push(`Development plan: ${to.plan}`)
  if (to.titlePromise && !from.titlePromise) out.push('Wants a title-opportunity clause')
  return out
}

// ------------------------------------------------------------- commands

function fail(state: GameState, error: string): TalkOutcome { return { ok: false, error, state } }

export function openTalkFor(state: GameState, fighterId: Id, kind: NegotiationKind): Talk | undefined {
  return Object.values(state.business?.talks ?? {}).find((t) => t.kind === 'contract' && t.fighterId === fighterId && t.contractKind === kind && t.status === 'open')
}

export function openContractTalk(input: GameState, fighterId: Id, kind: NegotiationKind): TalkOutcome {
  const f0 = input.fighters[fighterId]
  if (!f0) return fail(input, 'Unknown fighter.')
  const existing = openTalkFor(input, fighterId, kind)
  if (existing) return { ok: true, state: input, talkId: existing.id }
  const lock = input.negotiations[fighterId]
  if (lock?.status === 'broken' && lock.lockedUntil !== null && lock.lockedUntil > input.today) return fail(input, 'Their camp is not taking your calls yet.')
  if (kind === 'signing') {
    const av = availabilityFor(input, f0)
    if (!av.signable) return fail(input, av.reason ?? 'This fighter cannot be signed right now.')
  } else {
    const c = f0.contractId ? input.contracts[f0.contractId] : null
    if (!c || c.promotionId !== input.playerPromotionId) return fail(input, 'That fighter is not on your roster.')
    if (!renewalWindowOpen(input, c)) return fail(input, 'Renewal talks open six months before a contract ends.')
  }
  const state = structuredClone(input)
  const f = state.fighters[fighterId]
  const promo = player(state)
  const b = biz(state)
  const mgr = managerOf(state, f)
  const stage = negStage(state, f)
  const rel = f.promoRelations[promo.id] ?? 0
  const p0 = Math.max(1.5, (B.negotiation.startingPatience[f.personality] ?? 3) * (0.7 + mgr.patience * 0.6) * STAGE_BEND[stage].patience)
  const t: Talk = {
    id: nextBizId(state, 't'), kind: 'contract', fighterId, fightId: null, contractKind: kind, openedDay: state.today, turn: 0, status: 'open',
    mood: rel >= 25 ? 'warm' : rel <= -15 ? 'cold' : 'lukewarm', patience: p0, p0, asked: [], offer: null, counter: null, fightOffer: null, fightCounter: null,
    extras: null, demands: [], told: [], log: [], closedDay: null,
  }
  pushLine(t, state.today, 'mgr', 'ask', voiceLine(state, t, f, mgr, 'open', null))
  b.talks[t.id] = t
  const rec = (b.neg[fighterId] ??= { talks: 0, agreed: 0, lowballs: 0, walkouts: 0, lastDay: state.today, kept: 0, broken: 0 })
  rec.talks += 1; rec.lastDay = state.today
  trimTalks(state)
  return { ok: true, state, talkId: t.id }
}

function walkOut(state: GameState, t: Talk, f: Fighter, promo: Promotion, why: string): void {
  t.status = 'broken'; t.closedDay = state.today
  pushLine(t, state.today, 'sys', 'walk', `${fighterName(f)}’s camp walks away. ${why}`)
  const lockedUntil = state.today + B.negotiation.lockWeeks * 7
  const neg: Negotiation = { id: stateIds(state).next('n'), fighterId: f.id, promotionId: promo.id, kind: t.contractKind, openedDay: t.openedDay, patience: 0, status: 'broken', lockedUntil, rounds: [], lastCounter: null }
  state.negotiations[f.id] = neg
  f.promoRelations[promo.id] = (f.promoRelations[promo.id] ?? 0) - (f.personality === 'Loyal' || f.personality === 'Fragile' ? 10 : 7)
  const rec = (biz(state).neg[f.id] ??= { talks: 0, agreed: 0, lowballs: 0, walkouts: 0, lastDay: state.today, kept: 0, broken: 0 })
  rec.walkouts += 1; rec.lastDay = state.today
  postMessage(state, {
    from: 'Agent', category: 'contract', priority: 'important', subject: `${fighterName(f)} walks away from talks`,
    body: `${fighterName(f)}’s camp has ended the conversation. They will not negotiate with ${promo.name} for ${B.negotiation.lockWeeks} weeks.`, link: { kind: 'fighter', id: f.id },
  })
}

export function talkMove(input: GameState, talkId: string, move: ContractMove): TalkOutcome {
  const t0 = input.business?.talks[talkId]
  if (!t0 || t0.kind !== 'contract' || t0.status !== 'open') return fail(input, 'That conversation is over.')
  const f0 = input.fighters[t0.fighterId]
  if (!f0) return fail(input, 'Unknown fighter.')
  if (move.kind === 'propose') {
    const o = normaliseOffer(move.offer)
    if (!canAfford(input, o.signingBonus)) return fail(input, `You cannot afford a £${o.signingBonus.toLocaleString('en-GB')} signing bonus.${input.promotions[input.playerPromotionId].cash < 0 ? ' The account is overdrawn: Finances shows the way back.' : ''}`)
    if (o.pathway && !pathwayIsReal(input, f0, o.pathway)) return fail(input, 'That pathway is not available to this fighter.')
  }
  const state = structuredClone(input)
  const t = state.business!.talks[talkId]
  const f = state.fighters[t.fighterId]
  const promo = player(state)
  const mgr = managerOf(state, f)
  const rec = (biz(state).neg[f.id] ??= { talks: 0, agreed: 0, lowballs: 0, walkouts: 0, lastDay: state.today, kept: 0, broken: 0 })
  const kind = t.contractKind
  t.turn += 1
  const day = state.today
  const say = (tag: Verdict4, unmet: Priority | null) => voiceLine(state, t, f, mgr, tag, unmet)

  // ------------------------------------------------------------- walk (the player ends it)
  if (move.kind === 'walk') {
    t.status = 'withdrawn'; t.closedDay = day
    pushLine(t, day, 'you', 'note', 'You step away from the table.')
    if (t.offer) f.promoRelations[promo.id] = (f.promoRelations[promo.id] ?? 0) - 1
    return { ok: true, state, talkId }
  }

  // ------------------------------------------------------------- ask
  if (move.kind === 'ask') {
    const known = t.told.length
    const rel = f.promoRelations[promo.id] ?? 0
    if (move.topic === 'priorities') {
      pushLine(t, day, 'you', 'ask', 'What is your camp looking for in this deal?')
      const top = topPriorities(mgr, 3)
      // Trust opens the door: a cold camp, or a hostile one on a first turn, says little. Each answer reveals one more priority.
      const reveal = Math.min(known >= 1 ? 3 : 2, 1 + t.told.filter((x) => x.startsWith('priority:')).length + (rel >= 15 ? 1 : 0))
      const already = t.told.filter((x) => x.startsWith('priority:')).length
      if (t.mood === 'cold' && rel < 0 && already === 0) {
        pushLine(t, day, 'mgr', 'answer', evasiveLine(state, f))
      } else {
        const shown = top.slice(0, Math.max(1, Math.min(top.length, reveal)))
        for (const p of shown) { const tag = `priority:${p}`; if (!t.told.includes(tag)) t.told.push(tag); learn(state, f.id, tag) }
        pushLine(t, day, 'mgr', 'answer', expectationsLine(state, f, mgr, shown))
      }
      t.patience -= mgr.archetype === 'AGGRESSIVE' ? 0.9 : 0.25
    } else {
      pushLine(t, day, 'you', 'ask', `What does ${f.firstName} want out of the next few years?`)
      const trust = rel >= 10 || rec.talks > 1 || t.told.filter((x) => x.startsWith('priority:')).length >= 2 || mgr.archetype === 'LOYAL' || mgr.archetype === 'CAREER_FOCUSED'
      if (!trust) {
        pushLine(t, day, 'mgr', 'answer', 'That is not a conversation for a first call. Show us some respect and we will talk about the future.')
      } else {
        const amb = ambitionOf(state, f)
        if (!t.told.includes('ambition')) t.told.push('ambition')
        learn(state, f.id, 'ambition')
        pushLine(t, day, 'mgr', 'answer', ambitionLine(amb, f, (id) => nameOf(state, id)))
      }
      t.patience -= mgr.archetype === 'AGGRESSIVE' ? 0.9 : 0.2
    }
    return finishTurn(state, t, f, promo, mgr, undefined, talkId)
  }

  // ------------------------------------------------------------- time
  if (move.kind === 'time') {
    pushLine(t, day, 'you', 'note', 'Give us a few days to think it over.')
    t.patience -= mgr.archetype === 'AGGRESSIVE' ? 1.2 : mgr.archetype === 'CAUTIOUS' ? 0 : 0.3
    // A camp that likes you takes it well; a fast-moving one resents being kept waiting.
    if (mgr.archetype === 'CAUTIOUS' || mgr.archetype === 'LOYAL') pushLine(t, day, 'mgr', 'hold', 'Of course. Take the time you need — we would rather you were sure.')
    else if (mgr.archetype === 'AGGRESSIVE') pushLine(t, day, 'mgr', 'hold', 'Do not take too long. Other people want to talk to us.')
    else pushLine(t, day, 'mgr', 'hold', 'Fine, but the offer on the table is not going to improve while we wait.')
    return finishTurn(state, t, f, promo, mgr, undefined, talkId)
  }

  // ------------------------------------------------------------- accept the counter
  let offer: Offer
  if (move.kind === 'acceptCounter') {
    if (!t.counter) return fail(input, 'There is no counter to accept.')
    offer = normaliseOffer(t.counter)
    pushLine(t, day, 'you', 'offer', 'We accept your terms.')
  } else {
    offer = normaliseOffer(move.offer)
    pushLine(t, day, 'you', 'offer', offerLine(offer))
  }
  if (!canAfford(state, offer.signingBonus)) return fail(input, `You cannot afford a £${offer.signingBonus.toLocaleString('en-GB')} signing bonus.${input.promotions[input.playerPromotionId].cash < 0 ? ' The account is overdrawn: Finances shows the way back.' : ''}`)
  if (kind === 'signing' && rosterFull(state, promo.id)) return fail(input, 'Your roster is full.')

  // The same offer again is not a move.
  const repeat = !!t.offer && sameOffer(t.offer, offer) && move.kind === 'propose'
  const u = contractUtility(state, f, promo, offer, kind)
  t.offer = offer
  t.mood = moodOf(u.ratio)
  const know = state.knowledge[f.id]
  if (know) know.insight = Math.min(100, know.insight + 4)

  // Elite fighters will not entertain tiny promotions at all.
  if (f.reputation >= B.negotiation.eliteReputation && promo.reputation < B.negotiation.eliteMinPromotionRep) {
    pushLine(t, day, 'mgr', 'reject', 'We do not see a promotion of your standing as a serious home for a fighter of this profile.')
    t.patience -= 1.5
    return finishTurn(state, t, f, promo, mgr, undefined, talkId)
  }

  if (u.ratio >= B.negotiation.acceptRatio) {
    pushLine(t, day, 'mgr', 'accept', say('accept', null))
    const generous = u.ratio >= 1.12
    t.status = 'agreed'; t.closedDay = day
    const signed = conclude(state, t, f, promo, offer, kind)
    f.promoRelations[promo.id] = Math.min(100, (f.promoRelations[promo.id] ?? 0) + (generous ? 4 : 1))
    rec.agreed += 1; rec.lastDay = day
    biz(state).exp += 1
    return { ok: true, state, talkId, signed }
  }

  // A lowball: far below what they would ever consider. Camps differ in how long they put up with it.
  const lowFloor = 0.5 + 0.14 * mgr.lowballTolerance
  if (u.ratio < lowFloor) {
    rec.lowballs += 1
    f.promoRelations[promo.id] = (f.promoRelations[promo.id] ?? 0) - 3
    t.patience -= 1.8 + (mgr.archetype === 'AGGRESSIVE' ? 1.7 : 0)
    pushLine(t, day, 'mgr', 'reject', say('reject', u.unmet))
    if (u.unmet) { learn(state, f.id, `priority:${u.unmet}`); if (!t.told.includes(`priority:${u.unmet}`)) t.told.push(`priority:${u.unmet}`) }
    return finishTurn(state, t, f, promo, mgr, undefined, talkId)
  }

  // Close enough on the money (the engine’s own valuation) to keep talking: a missing priority earns a counter that asks for it, not a flat no.
  if ((u.ratio >= B.negotiation.counterRatio || u.base.ratio >= B.negotiation.counterRatio) && !repeat) {
    const counter = buildContractCounter(state, f, promo, offer, kind, t)
    t.counter = counter
    pushLine(t, day, 'mgr', 'counter', say('counter', u.unmet))
    if (u.unmet) { const tag = `priority:${u.unmet}`; if (!t.told.includes(tag)) t.told.push(tag); learn(state, f.id, tag); t.demands = [demandFor(u.unmet, wantsText(state, f, u.unmet, t.turn, t.id))] }
    t.patience -= mgr.counters > 0.7 ? 0.35 : 0.6
    return finishTurn(state, t, f, promo, mgr, counter, talkId)
  }

  // Repeat of a proposal, or a proposal too far below to counter: the camp holds or declines.
  if (repeat) {
    t.patience -= mgr.archetype === 'AGGRESSIVE' ? 2 : 1.2
    pushLine(t, day, 'mgr', 'hold', say('hold', u.unmet))
    f.promoRelations[promo.id] = (f.promoRelations[promo.id] ?? 0) - 1
  } else {
    t.patience -= mgr.archetype === 'AGGRESSIVE' ? 1.5 : 1
    pushLine(t, day, 'mgr', 'reject', say('reject', u.unmet))
  }
  if (u.unmet) { const tag = `priority:${u.unmet}`; if (!t.told.includes(tag)) t.told.push(tag); learn(state, f.id, tag) }
  return finishTurn(state, t, f, promo, mgr, undefined, talkId)
}

const sameOffer = (a: Offer, b: Offer): boolean =>
  a.years === b.years && a.fights === b.fights && a.minFightsPerYear === b.minFightsPerYear && a.signingBonus === b.signingBonus && a.weeklyRetainer === b.weeklyRetainer &&
  a.basePurse === b.basePurse && a.winBonus === b.winBonus && a.titleBonus === b.titleBonus && a.ppvShare === b.ppvShare && a.titlePromise === b.titlePromise &&
  (a.pathway?.kind ?? null) === (b.pathway?.kind ?? null) && (a.plan ?? null) === (b.plan ?? null)

function finishTurn(state: GameState, t: Talk, f: Fighter, promo: Promotion, _mgr: Manager, counter: Offer | undefined, talkId: string): TalkOutcome {
  if (counter === undefined && t.counter && t.status === 'open') { /* the old counter stands */ }
  if (t.patience <= 0 && t.status === 'open') walkOut(state, t, f, promo, 'They have run out of patience.')
  return { ok: true, state, talkId }
}

function conclude(state: GameState, t: Talk, f: Fighter, promo: Promotion, offer: Offer, kind: NegotiationKind): Contract {
  const signed = concludeSigning(state, f, promo, offer, kind)
  if (offer.pathway) createCommitment(state, f, offer.pathway)
  if (offer.plan) setPlan(state, f.id, offer.plan as DevPlan)
  pushLine(t, state.today, 'sys', 'note', `Agreed: ${offer.years}-year deal${offer.pathway ? `, with ${pathwayText(offer.pathway)} in writing` : ''}${offer.plan ? `, development plan: ${offer.plan}` : ''}.`)
  return signed
}

function offerLine(o: Offer): string {
  const m = (n: number) => `£${n.toLocaleString('en-GB')}`
  const bits = [`${o.years}-year deal`, `${m(o.basePurse)} a fight`, `${m(o.weeklyRetainer)} a week`, `${m(o.signingBonus)} up front`, `${o.minFightsPerYear}+ fights a year`]
  if (o.pathway) bits.push(`and ${pathwayText(o.pathway)}`)
  if (o.plan) bits.push(`plan: ${o.plan}`)
  return `Our offer: ${bits.join(', ')}.`
}

/** The opening position the UI pre-fills: public, personality-free (never the camp’s ask). */
export function openingOffer(state: GameState, f: Fighter, kind: NegotiationKind): Offer { return suggestedOffer(state, f, kind) }

export { ambitionLabel, nameOf }
export type { Fighter, Promotion }
