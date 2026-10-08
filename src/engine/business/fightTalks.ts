/**
 * FIGHT CONVERSATIONS. Making a bout is a conversation with the OPPONENT’s camp: what is at stake (decided by the real title system,
 * never by the offer), the purse and win bonus, where it is fought, how many rounds, a rematch clause, a one- or two-fight deal.
 *
 * Camps differ: a title-minded manager wants the stake, an exposure manager the stage, a cautious one the guarantees and a rematch,
 * a development camp protects a prospect from a mismatch, an aggressive one walks quickly. The opponent’s stage matters too — a champion
 * wants a champion’s purse, a prospect’s camp wants a soft landing, a journeyman wants the money now.
 *
 * As with contracts, the hidden valuation is the engine’s own (`evaluateFightOffer`); the manager, stage, venue and memory bend it
 * inside bounds; counters are built from the state of the talk and concede over the turns; nothing hidden is returned.
 */
import { B_ } from './talkBalance'
import { agreeFight, evaluateFightOffer, fightAsk, normaliseFightOffer, offerValueB, suggestedFightOffer } from '../fightNegotiation'
import { cancelFight, lockKey, validateMatch } from '../fights'
import { fighterName } from '../fighters'
import { postMessage } from '../messages'
import { bodiesFor } from '../media/titles'
import { levelRank, levelOf, type TitleLevel } from './titleDefs'
import { careerValue } from './marketValue'
import { managerOf, topPriorities, type Manager, type Priority } from './manager'
import { planFactors, planOf } from './plans'
import { negStage, STAGE_BEND } from './stage'
import { campWeights } from './contractTalks'
import { biz, demandFor, evasiveLine, expectationsLine, learn, moodOf, nameOf, nextBizId, pushLine, trimTalks, voiceLine, wantsText } from './talkCore'
import type { Fight, FightOffer, GameState, Id } from '../types'
import type { Talk } from './types'

export type FightMove =
  | { kind: 'ask'; topic: 'priorities' | 'location' | 'timing' }
  | { kind: 'propose'; offer: FightOffer }
  | { kind: 'acceptCounter' }
  | { kind: 'time' }
  | { kind: 'walk' }

export interface FightTalkOutcome { ok: boolean; error?: string; state: GameState; talkId?: string; fightAgreed?: boolean }

const PRIORITIES: Priority[] = ['money', 'title', 'activity', 'exposure', 'career', 'loyalty', 'development', 'security']
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

export type StakeKind = 'standard' | 'eliminator' | 'title' | 'unification'
export interface Stakes { kind: StakeKind; level: TitleLevel | null; bodies: string[] }

/** What a bout between these two would be, according to the title system as it stands right now. Never a promise: it is read, not set. */
export function fightStakes(state: GameState, fight: Fight): Stakes {
  const media = state.media
  if (!media) return { kind: 'standard', level: null, bodies: [] }
  const a = fight.sideA.fighterId, b = fight.sideB.fighterId
  const bodies = bodiesFor(media, a, b, fight.weightClass)
  if (bodies.length) {
    const level = bodies.map(levelOf).sort((x, y) => levelRank(y) - levelRank(x))[0]
    const champs = new Set(bodies.filter((x) => levelOf(x) === 'world').map((x) => media.titles[`${x}|${fight.weightClass}`]?.c).filter(Boolean))
    return { kind: champs.size >= 2 ? 'unification' : 'title', level, bodies }
  }
  for (const [k, rec] of Object.entries(media.titles)) {
    const e = rec.elim
    if (!e || e.fightId || !k.endsWith(`|${fight.weightClass}`)) continue
    if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return { kind: 'eliminator', level: levelOf(k.split('|')[0]), bodies: [k.split('|')[0]] }
  }
  return { kind: 'standard', level: null, bodies: [] }
}

export interface FightUtility { ratio: number; base: number; unmet: Priority | null; sat: Record<Priority, number>; weights: Record<Priority, number>; mgr: Manager }

export function fightUtility(state: GameState, fight: Fight, offer: FightOffer): FightUtility {
  const opp = state.fighters[fight.sideB.fighterId], me = state.fighters[fight.sideA.fighterId]
  const mgr = managerOf(state, opp)
  const stage = negStage(state, opp)
  const w = campWeights(mgr, stage)
  const ev = evaluateFightOffer(state, fight, offer)
  const st = fightStakes(state, fight)
  const memory = state.business?.neg[opp.id]
  const mvOpp = careerValue(state, opp), mvMe = careerValue(state, me)
  const gap = mvMe - mvOpp
  const ask = fightAsk(state, fight)

  const sat = {} as Record<Priority, number>
  sat.money = clamp((ev.ratio - 1) * 3, -1, 1)
  sat.title = st.kind === 'standard' ? (stage === 'contender' || stage === 'champion' ? -0.4 : 0) : st.kind === 'eliminator' ? 0.8 : 1
  sat.exposure = (offer.venuePref === 'B' ? 0.5 : offer.venuePref === 'A' ? -0.8 : 0) + (st.kind !== 'standard' ? 0.5 : 0) + (gap >= 10 ? 0.3 : 0)
  sat.activity = (offer.fights === 2 ? 0.8 : 0) + (offer.purseB >= ask.purseB ? 0.2 : -0.2)
  sat.career = gap >= 8 ? 0.5 : gap <= -15 ? -0.6 : 0
  sat.loyalty = clamp(((opp.promoRelations[state.playerPromotionId] ?? 0) / 60), -1, 1) * 0.6 + 0.3 * Math.min(2, memory?.kept ?? 0) - 0.55 * Math.min(2, memory?.broken ?? 0)
  // A mismatch the camp cannot stomach: their man is the prospect, ours is far stronger.
  const prospect = stage === 'prospect'
  sat.development = prospect ? (gap > 14 ? -1 : gap > 8 ? -0.5 : 0.3) : 0
  sat.security = (offer.rematch ? 0.7 : 0) + clamp((offer.winBonusB / Math.max(1, ask.winBonusB) - 1), -0.5, 0.5) + (offer.venuePref === 'A' ? -0.4 : 0)
  for (const p of PRIORITIES) sat[p] = clamp(sat[p], -1, 1)

  let adj = 0
  for (const p of PRIORITIES) adj += w[p] * sat[p]
  let ratio = ev.ratio * (1 + 0.14 * clamp(adj * 2, -1, 1))
  ratio -= 0.04 * Math.min(3, memory?.broken ?? 0)
  ratio += 0.015 * Math.min(3, memory?.kept ?? 0)
  if (stage === 'champion' && st.kind === 'standard' && w.title > 0.14 && gap < 5) ratio = Math.min(ratio, 0.99) // a champion’s camp does not take a non-title risk for pocket money

  let unmet: Priority | null = null, worst = 0.05
  for (const p of PRIORITIES) { const g = w[p] * Math.max(0, -sat[p]); if (g > worst) { worst = g; unmet = p } }
  return { ratio, base: ev.ratio, unmet, sat, weights: w, mgr }
}

function buildCounter(state: GameState, fight: Fight, offer: FightOffer, talk: Talk): FightOffer {
  const u0 = fightUtility(state, fight, offer)
  const target = B_.counterMargin + (u0.mgr.archetype === 'AGGRESSIVE' ? 0.03 : 0)
  let c: FightOffer = { ...offer }
  if (c.venuePref === 'A') c.venuePref = 'neutral'
  const order = PRIORITIES.slice().sort((a, b) => u0.weights[b] * Math.max(0, -u0.sat[b]) - u0.weights[a] * Math.max(0, -u0.sat[a]))
  for (const p of order) {
    if (fightUtility(state, fight, c).ratio >= target) break
    if (u0.weights[p] * Math.max(0, -u0.sat[p]) <= 0.01) continue
    if (p === 'security' && !c.rematch) c.rematch = true
    else if (p === 'exposure' && c.venuePref === 'neutral') c.venuePref = 'B'
    else if (p === 'activity' && c.fights === 1) c.fights = 2
  }
  for (let i = 0; i < 14; i++) {
    const u = fightUtility(state, fight, c)
    if (u.ratio >= target) break
    const need = (target - u.ratio) * offerValueB(fightAsk(state, fight))
    c = normaliseFightOffer({ ...c, purseB: c.purseB + need / (1 + (c.rematch ? 0.06 : 0)) + 100, winBonusB: Math.max(c.winBonusB, Math.round(c.purseB * 0.1)) })
  }
  const prev = talk.fightCounter
  if (prev && prev.fights === c.fights && prev.venuePref === c.venuePref && prev.rematch === c.rematch && prev.purseB < c.purseB) {
    const eased = normaliseFightOffer({ ...c, purseB: prev.purseB, winBonusB: Math.min(c.winBonusB, prev.winBonusB) })
    if (fightUtility(state, fight, eased).ratio >= 1) c = eased
  }
  return c
}

export function describeFightChange(from: FightOffer, to: FightOffer): string[] {
  const out: string[] = []
  const m = (n: number) => `£${n.toLocaleString('en-GB')}`
  if (to.purseB !== from.purseB) out.push(`Purse ${m(from.purseB)} → ${m(to.purseB)}`)
  if (to.winBonusB !== from.winBonusB) out.push(`Win bonus ${m(from.winBonusB)} → ${m(to.winBonusB)}`)
  if (to.venuePref !== from.venuePref) out.push(`Venue: ${to.venuePref === 'B' ? 'their home ground' : to.venuePref === 'A' ? 'your fighter’s home ground' : 'neutral'}`)
  if (to.rematch && !from.rematch) out.push('Wants a rematch clause')
  if (to.fights !== from.fights) out.push(to.fights === 2 ? 'Wants a two-fight deal' : 'One fight only')
  if ((to.rounds ?? 0) !== (from.rounds ?? 0) && to.rounds) out.push(`${to.rounds} rounds`)
  return out
}

// ------------------------------------------------------------- commands

const fail = (state: GameState, error: string): FightTalkOutcome => ({ ok: false, error, state })

export function openFightTalkFor(state: GameState, fightId: Id): Talk | undefined {
  return Object.values(state.business?.talks ?? {}).find((t) => t.kind === 'fight' && t.fightId === fightId && t.status === 'open')
}

/** Open the conversation for a fight that is in the NEGOTIATING state (created by `approachOpponent`). */
export function openFightTalk(input: GameState, fightId: Id): FightTalkOutcome {
  const f0 = input.fights[fightId]
  if (!f0 || f0.status !== 'negotiating' || !f0.negotiation || f0.negotiation.status !== 'open') return fail(input, 'There is no open negotiation for this fight.')
  const existing = openFightTalkFor(input, fightId)
  if (existing) return { ok: true, state: input, talkId: existing.id }
  const state = structuredClone(input)
  const fight = state.fights[fightId]
  const opp = state.fighters[fight.sideB.fighterId]
  const mgr = managerOf(state, opp)
  const stage = negStage(state, opp)
  const rel = opp.promoRelations[state.playerPromotionId] ?? 0
  const p0 = Math.max(1.5, (fight.negotiation!.patience) * (0.75 + mgr.patience * 0.5) * STAGE_BEND[stage].patience)
  const t: Talk = {
    id: nextBizId(state, 't'), kind: 'fight', fighterId: opp.id, fightId, contractKind: 'signing', openedDay: state.today, turn: 0, status: 'open',
    mood: rel >= 25 ? 'warm' : rel <= -15 ? 'cold' : 'lukewarm', patience: p0, p0, asked: [], offer: null, counter: null, fightOffer: null, fightCounter: null,
    extras: { status: fightStakes(state, fight).kind === 'unification' ? 'title' : (fightStakes(state, fight).kind as 'standard' | 'eliminator' | 'title'), rounds: fight.scheduledRounds, exposure: false },
    demands: [], told: [], log: [], closedDay: null,
  }
  pushLine(t, state.today, 'mgr', 'ask', voiceLine(state, t, opp, mgr, 'open', null))
  const b = biz(state)
  b.talks[t.id] = t
  const rec = (b.neg[opp.id] ??= { talks: 0, agreed: 0, lowballs: 0, walkouts: 0, lastDay: state.today, kept: 0, broken: 0 })
  rec.talks += 1; rec.lastDay = state.today
  trimTalks(state)
  return { ok: true, state, talkId: t.id }
}

/** What our own fighter’s camp thinks of the opponent, under the development plan. Returned to the UI as a plain warning. */
export function planWarning(state: GameState, fight: Fight): string | null {
  const me = state.fighters[fight.sideA.fighterId], opp = state.fighters[fight.sideB.fighterId]
  if (!me || !opp) return null
  const plan = planOf(state, me.id)
  if (plan === 'normal') return null
  const gap = careerValue(state, opp) - careerValue(state, me)
  const tol = planFactors(plan).oppTolerance
  if (plan === 'protected' && gap > tol) return `${me.firstName} is on a protected plan — this opponent is a big step up.`
  if (plan === 'accelerated' && gap < -tol) return `${me.firstName} is on the fast track — this opponent is a step down.`
  return null
}

function walkOut(state: GameState, t: Talk, fight: Fight, why: string): void {
  const opp = state.fighters[fight.sideB.fighterId]
  t.status = 'broken'; t.closedDay = state.today
  pushLine(t, state.today, 'sys', 'walk', `${fighterName(opp)}’s camp walks away. ${why}`)
  if (fight.negotiation) fight.negotiation.status = 'broken'
  state.fightLocks[lockKey(fight.sideA.fighterId, fight.sideB.fighterId)] = state.today + 12 * 7
  opp.promoRelations[state.playerPromotionId] = (opp.promoRelations[state.playerPromotionId] ?? 0) - 5
  const rec = (biz(state).neg[opp.id] ??= { talks: 0, agreed: 0, lowballs: 0, walkouts: 0, lastDay: state.today, kept: 0, broken: 0 })
  rec.walkouts += 1
  cancelFight(state, fight, `talks with ${fighterName(opp)}’s camp collapsed`, 12)
  postMessage(state, { from: 'Matchmaking', category: 'fighter', priority: 'normal', subject: `${fighterName(opp)} turns away from the fight`, body: `${fighterName(opp)}’s camp ended the conversation. Expect no talks about this fight for twelve weeks.`, link: { kind: 'fight', id: fight.id } })
}

export function fightMove(input: GameState, talkId: string, move: FightMove): FightTalkOutcome {
  const t0 = input.business?.talks[talkId]
  if (!t0 || t0.kind !== 'fight' || t0.status !== 'open' || !t0.fightId) return fail(input, 'That conversation is over.')
  const f0 = input.fights[t0.fightId]
  if (!f0 || f0.status !== 'negotiating') return fail(input, 'The fight is no longer being negotiated.')
  const pre = validateMatch(input, f0.sideA.fighterId, f0.sideB.fighterId, f0.id)
  if (!pre.ok) return fail(input, pre.reason ?? 'The match is no longer possible.')

  const state = structuredClone(input)
  const t = state.business!.talks[talkId]
  const fight = state.fights[t.fightId!]
  const opp = state.fighters[fight.sideB.fighterId]
  const mgr = managerOf(state, opp)
  const rec = (biz(state).neg[opp.id] ??= { talks: 0, agreed: 0, lowballs: 0, walkouts: 0, lastDay: state.today, kept: 0, broken: 0 })
  const day = state.today
  t.turn += 1
  const rel = opp.promoRelations[state.playerPromotionId] ?? 0
  const say = (v: Parameters<typeof voiceLine>[4], unmet: Priority | null) => voiceLine(state, t, opp, mgr, v, unmet)
  const done = (): FightTalkOutcome => {
    if (t.patience <= 0 && t.status === 'open') walkOut(state, t, fight, 'They have run out of patience.')
    return { ok: true, state, talkId }
  }

  if (move.kind === 'walk') {
    t.status = 'withdrawn'; t.closedDay = day
    pushLine(t, day, 'you', 'note', 'You step away from the table.')
    cancelFight(state, fight, 'you walked away', 0)
    return { ok: true, state, talkId }
  }

  if (move.kind === 'ask') {
    if (move.topic === 'priorities') {
      pushLine(t, day, 'you', 'ask', 'What does your camp need to make this fight?')
      const already = t.told.filter((x) => x.startsWith('priority:')).length
      if (t.mood === 'cold' && rel < 0 && already === 0) pushLine(t, day, 'mgr', 'answer', evasiveLine(state, opp))
      else {
        const shown = topPriorities(mgr, 3).slice(0, Math.min(3, 1 + already + (rel >= 15 ? 1 : 0)))
        for (const p of shown) { const tag = `priority:${p}`; if (!t.told.includes(tag)) t.told.push(tag); learn(state, opp.id, tag) }
        pushLine(t, day, 'mgr', 'answer', expectationsLine(state, opp, mgr, shown))
      }
    } else if (move.topic === 'location') {
      pushLine(t, day, 'you', 'ask', 'Where would you want to fight this?')
      if (!t.told.includes('location')) t.told.push('location')
      learn(state, opp.id, 'location')
      pushLine(t, day, 'mgr', 'answer', mgr.weights.exposure > 0.6 ? 'Somewhere big, with an audience. A small hall does nothing for us.' : mgr.weights.security > 0.6 ? 'We would rather be on familiar ground, or somewhere genuinely neutral.' : 'We are flexible on the venue if the rest makes sense.')
    } else {
      pushLine(t, day, 'you', 'ask', 'When could your fighter be ready?')
      if (!t.told.includes('timing')) t.told.push('timing')
      learn(state, opp.id, 'timing')
      pushLine(t, day, 'mgr', 'answer', mgr.weights.activity > 0.6 ? 'As soon as you like. We want him busy.' : 'No rush. We want a proper camp.')
    }
    t.patience -= mgr.archetype === 'AGGRESSIVE' ? 0.8 : 0.2
    return done()
  }

  if (move.kind === 'time') {
    pushLine(t, day, 'you', 'note', 'Give us a few days.')
    t.patience -= mgr.archetype === 'AGGRESSIVE' ? 1.2 : mgr.archetype === 'CAUTIOUS' ? 0 : 0.3
    pushLine(t, day, 'mgr', 'hold', mgr.archetype === 'AGGRESSIVE' ? 'Do not take long.' : 'Of course.')
    return done()
  }

  let offer: FightOffer
  if (move.kind === 'acceptCounter') {
    if (!t.fightCounter) return fail(input, 'There is no counter to accept.')
    offer = normaliseFightOffer(t.fightCounter)
    pushLine(t, day, 'you', 'offer', 'We accept your terms.')
  } else {
    offer = normaliseFightOffer(move.offer)
    pushLine(t, day, 'you', 'offer', fightOfferLine(offer))
  }
  const repeat = !!t.fightOffer && sameFightOffer(t.fightOffer, offer) && move.kind === 'propose'
  const u = fightUtility(state, fight, offer)
  t.fightOffer = offer
  t.mood = moodOf(u.ratio)

  if (u.ratio >= 1) {
    pushLine(t, day, 'mgr', 'accept', say('accept', null))
    t.status = 'agreed'; t.closedDay = day
    agreeFight(state, fight, offer)
    opp.promoRelations[state.playerPromotionId] = Math.min(100, (opp.promoRelations[state.playerPromotionId] ?? 0) + (u.ratio >= 1.12 ? 4 : 2))
    rec.agreed += 1; rec.lastDay = day
    biz(state).exp += 1
    const warn = planWarning(state, fight)
    if (warn) {
      const me = state.fighters[fight.sideA.fighterId]
      me.morale = Math.max(1, me.morale - 4)
      me.promoRelations[state.playerPromotionId] = (me.promoRelations[state.playerPromotionId] ?? 0) - 2
      pushLine(t, day, 'sys', 'note', `Your own camp is uneasy: ${warn}`)
    }
    return { ok: true, state, talkId, fightAgreed: true }
  }

  const lowFloor = 0.5 + 0.14 * mgr.lowballTolerance
  if (u.ratio < lowFloor && u.base < lowFloor) {
    rec.lowballs += 1
    opp.promoRelations[state.playerPromotionId] = (opp.promoRelations[state.playerPromotionId] ?? 0) - 2
    t.patience -= 1.8 + (mgr.archetype === 'AGGRESSIVE' ? 1.7 : 0)
    pushLine(t, day, 'mgr', 'reject', say('reject', u.unmet))
    if (u.unmet) { const tag = `priority:${u.unmet}`; if (!t.told.includes(tag)) t.told.push(tag); learn(state, opp.id, tag) }
    return done()
  }

  if ((u.ratio >= B_.counterRatio || u.base >= B_.counterRatio) && !repeat) {
    t.fightCounter = buildCounter(state, fight, offer, t)
    pushLine(t, day, 'mgr', 'counter', say('counter', u.unmet))
    if (u.unmet) { const tag = `priority:${u.unmet}`; if (!t.told.includes(tag)) t.told.push(tag); learn(state, opp.id, tag); t.demands = [demandFor(u.unmet, wantsText(state, opp, u.unmet, t.turn, t.id))] }
    t.patience -= mgr.counters > 0.7 ? 0.35 : 0.6
    return done()
  }

  t.patience -= repeat ? (mgr.archetype === 'AGGRESSIVE' ? 2 : 1.2) : (mgr.archetype === 'AGGRESSIVE' ? 1.5 : 1)
  pushLine(t, day, 'mgr', repeat ? 'hold' : 'reject', say(repeat ? 'hold' : 'reject', u.unmet))
  if (u.unmet) { const tag = `priority:${u.unmet}`; if (!t.told.includes(tag)) t.told.push(tag); learn(state, opp.id, tag) }
  return done()
}

const sameFightOffer = (a: FightOffer, b: FightOffer): boolean => a.purseB === b.purseB && a.winBonusB === b.winBonusB && a.rematch === b.rematch && a.venuePref === b.venuePref && a.fights === b.fights && (a.rounds ?? 0) === (b.rounds ?? 0)

function fightOfferLine(o: FightOffer): string {
  const m = (n: number) => `£${n.toLocaleString('en-GB')}`
  const bits = [`${m(o.purseB)} purse`, `${m(o.winBonusB)} win bonus`, o.venuePref === 'B' ? 'at their home ground' : o.venuePref === 'A' ? 'at ours' : 'on neutral ground']
  if (o.rematch) bits.push('with a rematch clause')
  if (o.fights === 2) bits.push('as a two-fight deal')
  if (o.rounds) bits.push(`over ${o.rounds} rounds`)
  return `Our offer: ${bits.join(', ')}.`
}

export const openingFightOffer = suggestedFightOffer
export { nameOf }
