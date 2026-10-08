/**
 * NEGOTIATION
 * A fighter's camp judges an offer against its (hidden) ask. Personality, career stage, prestige of the
 * promotion, relationship and the soft terms (fights, length, title promise) all move the verdict.
 * The response — accept / counter / reject — plus plain-language reasons is all the player gets to see.
 */
import { BALANCE as B } from './balance'
import { FEATURES } from './config'
import { fighterAge, fighterName } from './fighters'
import { stateIds } from './ids'
import { canAfford } from './ledger'
import { askTerms, availabilityFor, baseMoney, normaliseOffer, offerValue, preferredYears, valueOf } from './market'
import { keyedNormal } from './rng'
import { postMessage, postNews } from './messages'
import { completeSigning, rosterFull } from './roster'
import { player } from './selectors'
import type {
  Contract, Fighter, GameState, Id, Mood, Negotiation, NegotiationKind, NegotiationRound, Offer, Promotion, Verdict,
} from './types'

export interface Evaluation {
  verdict: Verdict
  ratio: number
  counter: Offer | null
  reasons: string[]
  mood: Mood
}

const AMBITIOUS_TYPES = ['Ambitious', 'Arrogant']

function moodOf(ratio: number): Mood {
  return ratio >= 1 ? 'eager' : ratio >= 0.92 ? 'warm' : ratio >= B.negotiation.counterRatio ? 'lukewarm' : 'cold'
}

/** Does this fighter insist on a title commitment? */
export function demandsTitlePromise(f: Fighter): boolean {
  return AMBITIOUS_TYPES.includes(f.personality) && f.reputation >= 45
}

function titlePromiseWeight(f: Fighter): number {
  const w = B.negotiation.titlePromiseValue
  const v = w[f.personality] ?? w.default
  return FEATURES.titlesImplemented ? v : v * B.negotiation.titlePromiseDiscount
}

export interface Score {
  ratio: number
  ask: Offer
  vAsk: number
  reasons: string[]
  titleMissing: boolean
}

/** The single source of truth for how a camp values an offer. */
export function scoreOffer(state: GameState, f: Fighter, promo: Promotion, offer: Offer, kind: NegotiationKind): Score {
  const age = fighterAge(f, state.today)
  const ask = askTerms(state, f, promo, kind)
  const vAsk = offerValue(ask, f.popularity)
  const reasons: string[] = []

  let thr = B.negotiation.threshold[f.personality] ?? 1
  if (f.personality === 'Volatile') thr += keyedNormal(state.seed, 'thr', f.id, Math.floor(state.today / 14)) * 0.04
  thr -= (f.promoRelations[promo.id] ?? 0) * B.negotiation.relationValuePerPoint
  if (kind === 'renewal' && f.personality === 'Loyal') thr -= 0.03

  // Soft terms, expressed as a fraction of the ask value.
  let credit = 0
  const fpyDiff = offer.minFightsPerYear - ask.minFightsPerYear
  if (fpyDiff > 0) credit += Math.min(0.08, fpyDiff * 0.03) * vAsk
  else if (fpyDiff < 0) {
    credit -= -fpyDiff * (f.personality === 'Ambitious' || f.personality === 'Showman' ? 0.06 : 0.03) * vAsk
    reasons.push(`wants to be active — at least ${ask.minFightsPerYear} fights a year`)
  }
  const dy = offer.years - ask.years
  if (dy > 0) {
    credit += (['Loyal', 'Fragile'].includes(f.personality) || age <= 22 ? 0.04 : AMBITIOUS_TYPES.includes(f.personality) || f.personality === 'Greedy' ? -0.05 : 0) * dy * vAsk
    if (AMBITIOUS_TYPES.includes(f.personality)) reasons.push('does not want to be tied up for that long')
  } else if (dy < 0) {
    credit += (AMBITIOUS_TYPES.includes(f.personality) ? 0.03 : -0.02) * -dy * vAsk
    if (['Loyal', 'Fragile'].includes(f.personality) || preferredYears(f, age) > offer.years) reasons.push('prefers more security than a deal this short')
  }
  if (offer.titlePromise) credit += titlePromiseWeight(f) * vAsk
  const titleMissing = demandsTitlePromise(f) && !offer.titlePromise
  if (titleMissing) reasons.push('wants a commitment to a title opportunity')

  const ratio = (offerValue(offer, f.popularity) + credit) / (vAsk * thr)
  if (ratio < 1) {
    if (offer.signingBonus < ask.signingBonus * 0.85) reasons.push('wants more up front')
    if (offer.basePurse < ask.basePurse * 0.9) reasons.push('expects a bigger purse per fight')
    if (offer.weeklyRetainer < ask.weeklyRetainer * 0.9) reasons.push('needs a higher weekly retainer')
    if (f.reputation - promo.reputation > 15) reasons.push('is a bigger name than your promotion and wants to be paid for the step down')
  }
  return { ratio, ask, vAsk, reasons: [...new Set(reasons)], titleMissing }
}

/** Judge an offer. Pure and deterministic for a given state. */
export function evaluateOffer(state: GameState, f: Fighter, promo: Promotion, rawOffer: Offer, kind: NegotiationKind): Evaluation {
  const offer = normaliseOffer(rawOffer)

  // Elite fighters won't entertain tiny promotions at all.
  if (f.reputation >= B.negotiation.eliteReputation && promo.reputation < B.negotiation.eliteMinPromotionRep) {
    return { verdict: 'reject', ratio: 0.4, counter: null, mood: 'cold', reasons: ['Their camp does not see a promotion of your standing as a serious home for a fighter of this profile.'] }
  }
  const sc = scoreOffer(state, f, promo, offer, kind)
  if (sc.ratio >= B.negotiation.acceptRatio && !sc.titleMissing) {
    return { verdict: 'accept', ratio: sc.ratio, counter: null, reasons: [], mood: moodOf(sc.ratio) }
  }
  if (sc.ratio >= B.negotiation.counterRatio || (sc.titleMissing && sc.ratio >= 1)) {
    return { verdict: 'counter', ratio: sc.ratio, counter: buildCounter(state, f, promo, offer, sc.ask, kind), reasons: sc.reasons, mood: moodOf(sc.ratio) }
  }
  return {
    verdict: 'reject', ratio: sc.ratio, counter: null, mood: 'cold',
    reasons: sc.reasons.length ? sc.reasons : ['feels the offer is nowhere near what they are worth'],
  }
}

/** Build a counter that the fighter will definitely accept if the player agrees. */
function buildCounter(state: GameState, f: Fighter, promo: Promotion, offer: Offer, ask: Offer, kind: NegotiationKind): Offer {
  let c: Offer = { ...offer }
  // Fix the non-money demands first.
  if (c.minFightsPerYear < ask.minFightsPerYear) c.minFightsPerYear = ask.minFightsPerYear
  if (demandsTitlePromise(f)) c.titlePromise = true
  if (AMBITIOUS_TYPES.includes(f.personality) && c.years > ask.years) c.years = ask.years
  c = normaliseOffer(c)
  // Then top up money until accepted, mostly up front.
  for (let i = 0; i < 10; i++) {
    const sc = scoreOffer(state, f, promo, c, kind)
    if (sc.ratio >= B.negotiation.counterMargin) break
    const deficit = (B.negotiation.counterMargin - sc.ratio) * sc.vAsk * (B.negotiation.threshold[f.personality] ?? 1)
    c = normaliseOffer({
      ...c,
      signingBonus: c.signingBonus + deficit * 0.5 + 100,
      basePurse: c.basePurse + (deficit * 0.5) / Math.max(1, c.fights) + 100,
    })
  }
  return c
}

// ------------------------------------------------------------- Commands

export interface NegotiationOutcome {
  ok: boolean
  error?: string
  state: GameState
  round?: NegotiationRound
  signed?: Contract
}

function fail(state: GameState, error: string): NegotiationOutcome {
  return { ok: false, error, state }
}

/**
 * Default opening offer. Built ONLY from public market value (never the fighter's private ask,
 * which would leak personality and relationship), at roughly the going rate for a fighter of this standing.
 */
export function suggestedOffer(state: GameState, f: Fighter, kind: NegotiationKind): Offer {
  void kind
  const age = fighterAge(f, state.today)
  const base = baseMoney(valueOf(state, f))
  const years = age <= 23 ? 3 : age >= 33 ? 1 : 2
  const fpy = 2
  return normaliseOffer({
    years, fights: years * fpy, minFightsPerYear: fpy,
    weeklyRetainer: base.retainer, basePurse: base.purse,
    signingBonus: base.purse * B.market.signingBonusOfPurse, winBonus: base.purse * B.market.winBonusOfPurse,
    titleBonus: 0, ppvShare: 0, titlePromise: false,
  })
}

export function renewalWindowOpen(state: GameState, c: Contract): boolean {
  return Math.floor((c.endDay - state.today) / 7) <= B.contracts.approachingWeeks
}

/** The agreed deal: the contract, the messages and the news. Shared by the offer flow and the conversational talks. */
export function concludeSigning(state: GameState, f: Fighter, promo: Promotion, offer: Offer, kind: NegotiationKind): Contract {
  const name = fighterName(f)
  const signed = completeSigning(state, f, offer, kind)
  postMessage(state, {
    from: 'Legal', category: 'contract', priority: 'important',
    subject: kind === 'renewal' ? `${name} signs a new deal` : `${name} signs with ${promo.name}`,
    body: `${name} has agreed a ${offer.years}-year contract: ${offer.fights} fights, £${offer.weeklyRetainer.toLocaleString('en-GB')} a week, £${offer.basePurse.toLocaleString('en-GB')} base purse${offer.titlePromise ? ', and a promised title opportunity' : ''}. Signing bonus paid: £${offer.signingBonus.toLocaleString('en-GB')}.`,
    link: { kind: 'fighter', id: f.id },
  })
  if (kind === 'signing' && (f.reputation >= 40 || f.popularity >= 40)) {
    postNews(state, { headline: `${promo.name} sign ${name} (${f.record.wins}-${f.record.losses}-${f.record.draws})`, category: 'signing', fighterId: f.id })
  }
  return signed
}

/** Present an offer to a fighter (new signing or renewal). Returns a NEW state. */
export function submitOffer(input: GameState, fighterId: Id, rawOffer: Offer, kind: NegotiationKind): NegotiationOutcome {
  const f0 = input.fighters[fighterId]
  if (!f0) return fail(input, 'Unknown fighter.')
  const p0 = player(input)
  const offer = normaliseOffer(rawOffer)

  if (kind === 'signing') {
    const av = availabilityFor(input, f0)
    if (!av.signable) return fail(input, av.reason ?? 'This fighter cannot be signed right now.')
  } else {
    const c = f0.contractId ? input.contracts[f0.contractId] : null
    if (!c || c.promotionId !== p0.id) return fail(input, 'That fighter is not on your roster.')
    if (!renewalWindowOpen(input, c)) return fail(input, 'Renewal talks open six months before a contract ends.')
  }
  if (!canAfford(input, offer.signingBonus)) return fail(input, `You cannot afford a £${offer.signingBonus.toLocaleString('en-GB')} signing bonus.`)

  const state = structuredClone(input)
  const f = state.fighters[fighterId]
  const promo = player(state)
  let neg: Negotiation | undefined = state.negotiations[fighterId]
  if (neg && neg.status === 'broken' && neg.lockedUntil !== null && neg.lockedUntil <= state.today) {
    delete state.negotiations[fighterId]
    neg = undefined
  }
  if (!neg) {
    neg = {
      id: stateIds(state).next('n'), fighterId, promotionId: promo.id, kind, openedDay: state.today,
      patience: B.negotiation.startingPatience[f.personality] ?? 3, status: 'open', lockedUntil: null, rounds: [], lastCounter: null,
    }
    state.negotiations[fighterId] = neg
  }

  const ev = evaluateOffer(state, f, promo, offer, kind)
  const round: NegotiationRound = { day: state.today, offer, verdict: ev.verdict, counter: ev.counter, reasons: ev.reasons, mood: ev.mood }
  neg.rounds.push(round)
  if (neg.rounds.length > 12) neg.rounds.shift()
  const knowledge = state.knowledge[f.id]
  if (knowledge) knowledge.insight = Math.min(100, knowledge.insight + 6)

  const name = fighterName(f)
  if (ev.verdict === 'accept') {
    if (kind === 'signing' && rosterFull(state, promo.id)) return fail(input, 'Your roster is full.')
    const signed = concludeSigning(state, f, promo, offer, kind)
    return { ok: true, state, round, signed }
  }

  if (ev.verdict === 'counter') {
    neg.lastCounter = ev.counter
    if (neg.rounds.length > 3) neg.patience -= 0.5
    postMessage(state, {
      from: 'Agent', category: 'contract', priority: 'normal',
      subject: `Counter-offer from ${name}'s camp`,
      body: `${name}'s representatives came back with a counter: ${ev.reasons.length ? ev.reasons.join('; ') : 'a few adjustments'}. Open the negotiation to review the new terms.`,
      link: { kind: 'fighter', id: f.id },
    })
  } else {
    neg.patience -= f.personality === 'Arrogant' || f.personality === 'Volatile' ? 1.5 : 1
    postMessage(state, {
      from: 'Agent', category: 'contract', priority: 'normal',
      subject: `${name} rejects your offer`,
      body: `${name}'s camp turned the offer down: ${ev.reasons.join('; ')}.`,
      link: { kind: 'fighter', id: f.id },
    })
  }

  if (neg.patience <= 0) {
    neg.status = 'broken'
    neg.lockedUntil = state.today + B.negotiation.lockWeeks * 7
    f.promoRelations[promo.id] = (f.promoRelations[promo.id] ?? 0) - 8
    postMessage(state, {
      from: 'Agent', category: 'contract', priority: 'important',
      subject: `${name} walks away from talks`,
      body: `${name}'s camp has lost patience. They will not negotiate with ${promo.name} for ${B.negotiation.lockWeeks} weeks.`,
      link: { kind: 'fighter', id: f.id },
    })
    round.reasons = [...round.reasons, 'Talks have broken down.']
  }
  return { ok: true, state, round }
}

/** Abandon an open negotiation. No penalty. */
export function walkAway(state: GameState, fighterId: Id): GameState {
  const neg = state.negotiations[fighterId]
  if (!neg || neg.status === 'broken') return state
  const next = structuredClone(state)
  delete next.negotiations[fighterId]
  return next
}

export function openNegotiation(state: GameState, fighterId: Id): Negotiation | null {
  return state.negotiations[fighterId] ?? null
}

export function getCounterFor(neg: Negotiation): Offer | null {
  return neg.status === 'open' ? neg.lastCounter : null
}

/** Totals for an offer, shown in the negotiation screen. Uses only the offer itself. */
export function offerSummaryOf(o: Offer) {
  const weeks = o.years * 52
  return {
    upfront: o.signingBonus,
    retainers: o.weeklyRetainer * weeks,
    guaranteedPurses: o.basePurse * o.fights,
    guaranteedTotal: o.signingBonus + o.weeklyRetainer * weeks + o.basePurse * o.fights,
    perYear: Math.round((o.signingBonus + o.weeklyRetainer * weeks + o.basePurse * o.fights) / o.years),
    weeklyCost: o.weeklyRetainer,
  }
}
