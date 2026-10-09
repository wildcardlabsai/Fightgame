/**
 * Player-facing views of the promoter's office. Public facts only: records, rankings, belts, terms on the table, what a relationship
 * is called and why it moved. No appraisal, no AI finances, no internal scores.
 */
import { formatDay } from '../calendar'
import { weightClassLabel } from '../../data/weightClasses'
import { fighterName } from '../fighters'
import { beltsHeld } from '../business/views'
import { headlineRank } from '../media/views'
import { rivalryStrength } from '../media/narratives'
import { planOf } from '../business/plans'
import { PLAN_LABEL } from '../business/plans'
import type { Fighter, GameState, Id } from '../types'
import { GOAL_INFO, GOAL_ORDER, goalProgress, opponentFit, suggestedGoal, type GoalProgress } from './goals'
import { OFFER_REASON_LABEL, isLive, offerProblem, stakesLabel } from './offers'
import { CAMPAIGN_INFO, CAMPAIGN_ORDER, campaignFee, campaignPoints, campaignSuitability } from './promotion'
import { relation, standingOf } from './relations'
export { relationRows, type RelationRow } from './relations'
import { cardProfile, FOCUS_INFO, FOCUS_ORDER, STANCE_INFO, STANCE_ORDER, strategyNote, strategyOf, strategyWeight } from './strategy'
import { COACH, COACH_ORDER, coachWeekly } from './trainer'
import type { CampaignKind, CoachLevel, FightProposal, GoalKind, StrategyFocus, StrategyStance } from './types'

const WEEK = 7

export interface FighterLine { id: Id; name: string; record: string; rank: string; belts: string[]; age: number; division: string; popularity: number }
export interface OfferView {
  id: Id
  status: FightProposal['status']
  statusLabel: string
  tab: 'incoming' | 'active' | 'sent' | 'agreed' | 'closed'
  promotion: string
  promoter: string
  promotionTier: string
  standing: string
  reason: string
  message: string
  mine: FighterLine
  theirs: FighterLine
  stakes: string
  rounds: number
  hostLabel: string
  host: 'you' | 'them'
  date: string | null
  venue: string | null
  eventName: string | null
  terms: { label: string; purse: number; winBonus: number; rematch: boolean; note: string }
  responsibilities: string[]
  weeksLeft: number | null
  history: { by: string; day: string; purse: number; note: string }[]
  closed: string | null
  fit: { label: string; note: string | null; objection: boolean }
  problem: string | null
  canAccept: boolean
  canCounter: boolean
  fightId: Id | null
  counters: number
}

const fighterLine = (state: GameState, f: Fighter): FighterLine => ({
  id: f.id, name: fighterName(f), record: `${f.record.wins}-${f.record.losses}-${f.record.draws}`, rank: headlineRank(state, f).text,
  belts: beltsHeld(state, f.id).map((b) => b.title), age: Math.floor((state.today - f.birthDay) / 365.25), division: weightClassLabel(f.weightClass), popularity: Math.round(f.popularity),
})

const STATUS_LABEL: Record<FightProposal['status'], string> = { open: 'Awaiting your answer', countered: 'Awaiting their reply', agreed: 'Agreed', rejected: 'Declined', expired: 'Expired', withdrawn: 'Withdrawn' }

export function offerView(state: GameState, o: FightProposal): OfferView | null {
  const x = state.fighters[o.theirs], y = state.fighters[o.mine], promo = state.promotions[o.promoId]
  if (!x || !y || !promo) return null
  const ev = o.eventId ? state.events[o.eventId] : null
  const venue = ev ? state.venues[ev.venueId] : null
  const contract = y.contractId ? state.contracts[y.contractId] : null
  const fit = opponentFit(state, y, x)
  const youCounters = o.history.filter((h) => h.by === 'you').length
  const tab: OfferView['tab'] = o.status === 'agreed' ? 'agreed' : !isLive(o) ? 'closed' : o.status === 'countered' ? 'sent' : youCounters > 0 ? 'active' : 'incoming'
  const net = o.host === 'them' ? o.terms.purse - (contract?.basePurse ?? 0) : null
  const responsibilities = o.host === 'you'
    ? [`You stage the fight: choose the date and the show.`, `You pay ${x.firstName} ${x.lastName}'s purse (£${o.terms.purse.toLocaleString('en-GB')}) and a win bonus of £${o.terms.winBonus.toLocaleString('en-GB')}.`, `${promo.name} supply their fighter and nothing else.`]
    : [`${promo.name} stage the fight on ${ev?.name ?? 'their show'}: they handle the venue, tickets, broadcast and production.`, `They pay your promotion a fee of £${o.terms.purse.toLocaleString('en-GB')} (plus £${o.terms.winBonus.toLocaleString('en-GB')} if ${y.firstName} wins).`, `You pay ${y.firstName} ${y.lastName} their contract purse (£${(contract?.basePurse ?? 0).toLocaleString('en-GB')}) out of it${net !== null ? `; the promotion keeps ${net >= 0 ? '' : '-'}£${Math.abs(net).toLocaleString('en-GB')}` : ''}.`]
  const problem = isLive(o) ? offerProblem(state, o) : null
  return {
    id: o.id, status: o.status, statusLabel: STATUS_LABEL[o.status], tab, promotion: promo.name, promoter: promo.promoterName, promotionTier: promo.tier, standing: standingOf(relation(state, 'promoter', promo.id)),
    reason: OFFER_REASON_LABEL[o.reason], message: o.message, mine: fighterLine(state, y), theirs: fighterLine(state, x), stakes: stakesLabel(o), rounds: o.rounds,
    hostLabel: o.host === 'you' ? 'You host' : `${promo.name} host`, host: o.host, date: o.day ? formatDay(o.day, true) : null, venue: venue ? `${venue.name}, ${venue.city}` : null, eventName: ev?.name ?? null,
    terms: { label: o.host === 'you' ? `Purse for ${x.firstName} ${x.lastName}` : `Fee for ${y.firstName} ${y.lastName}`, purse: o.terms.purse, winBonus: o.terms.winBonus, rematch: o.terms.rematch, note: net !== null ? `Net to your promotion after ${y.firstName}'s contract purse: ${net >= 0 ? '' : '-'}£${Math.abs(net).toLocaleString('en-GB')}.` : 'Paid by your promotion.' },
    responsibilities, weeksLeft: isLive(o) ? Math.max(0, Math.ceil((o.expiresDay - state.today) / WEEK)) : null,
    history: o.history.map((h) => ({ by: h.by === 'you' ? 'You' : promo.name, day: formatDay(h.day, false), purse: h.terms.purse, note: h.note })),
    closed: o.closed ?? null, fit: { label: fit.label, note: fit.note, objection: fit.objection }, problem,
    canAccept: o.status === 'open' && !problem, canCounter: o.status === 'open' && youCounters < 2 && !problem, fightId: o.fightId, counters: youCounters,
  }
}

export interface OffersBoard { incoming: OfferView[]; active: OfferView[]; sent: OfferView[]; agreed: OfferView[]; closed: OfferView[]; counts: { incoming: number; active: number; sent: number; agreed: number; closed: number }; negotiating: { fightId: Id; text: string }[] }

export function offersBoard(state: GameState): OffersBoard {
  const all = Object.values(state.office?.offers ?? {}).map((o) => offerView(state, o)).filter((v): v is OfferView => !!v)
  const by = (t: OfferView['tab']) => all.filter((v) => v.tab === t).sort((a, b) => (a.weeksLeft ?? 99) - (b.weeksLeft ?? 99) || (a.id < b.id ? -1 : 1))
  const incoming = by('incoming'), active = by('active'), sent = by('sent')
  const agreed = by('agreed').slice(0, 12)
  const closed = by('closed').slice(0, 12)
  const negotiating = Object.values(state.fights).filter((f) => f.status === 'negotiating' && f.organiserId === state.playerPromotionId).map((f) => ({ fightId: f.id, text: `${fighterName(state.fighters[f.sideA.fighterId])} v ${fighterName(state.fighters[f.sideB.fighterId])}` }))
  return { incoming, active, sent, agreed, closed, negotiating, counts: { incoming: incoming.length, active: active.length + negotiating.length, sent: sent.length, agreed: by('agreed').length, closed: by('closed').length } }
}

/** How many offers are waiting on the player (for the badge on the Fights tab). */
export const offersWaiting = (state: GameState): number => Object.values(state.office?.offers ?? {}).filter((o) => o.status === 'open').length

// ------------------------------------------------------------------------------------------------ Career

export interface CareerView {
  hasGoal: boolean
  goal: GoalProgress | null
  suggested: { kind: GoalKind; label: string }
  choices: { kind: GoalKind; label: string; blurb: string; plan: string }[]
  planLabel: string
  decisions: { day: string; text: string }[]
  promises: { text: string; status: string; dueWeeks: number | null }[]
  rivalries: { opponent: string; intensity: string; why: string }[]
}

export function careerView(state: GameState, id: Id): CareerView | null {
  const f = state.fighters[id]
  const c = f?.contractId ? state.contracts[f.contractId] : null
  if (!f || !c || c.promotionId !== state.playerPromotionId) return null
  const sug = suggestedGoal(state, f)
  const b = state.business
  const promises = (b?.commitments ?? []).filter((x) => x.fighterId === id).slice(-4).reverse().map((x) => ({ text: x.note.replace(/^Promised /, 'Promised: ').replace(/\.$/, ''), status: x.status === 'open' ? 'Open' : x.status === 'fulfilled' ? 'Kept' : x.status === 'broken' ? 'Broken' : 'Void', dueWeeks: x.status === 'open' ? Math.max(0, Math.ceil((x.dueDay - state.today) / WEEK)) : null }))
  return {
    hasGoal: !!state.office?.goals[id], goal: goalProgress(state, f), suggested: { kind: sug, label: GOAL_INFO[sug].label },
    choices: GOAL_ORDER.map((k) => ({ kind: k, label: GOAL_INFO[k].label, blurb: GOAL_INFO[k].blurb, plan: PLAN_LABEL[GOAL_INFO[k].plan] })), planLabel: PLAN_LABEL[planOf(state, id)],
    decisions: (state.office?.decisions[id] ?? []).map((d) => ({ day: formatDay(d.day, false), text: d.text })), promises, rivalries: rivalriesOf(state, f),
  }
}

/** A fighter's live rivalries: public strength from the media world and why it exists (from their meetings and what was said). */
export function rivalriesOf(state: GameState, f: Fighter): { opponent: string; intensity: string; why: string }[] {
  const media = state.media
  if (!media) return []
  const out: { opponent: string; intensity: string; why: string; v: number }[] = []
  for (const [k, v] of Object.entries(media.rivalry)) {
    const [a, b] = k.split('|')
    if (a !== f.id && b !== f.id) continue
    const oppId = a === f.id ? b : a
    const opp = state.fighters[oppId]
    if (!opp || v < 12) continue
    const meetings = f.recentFights.map((id) => state.fights[id]).filter((x) => x?.result && (x.sideA.fighterId === oppId || x.sideB.fighterId === oppId))
    const last = meetings[meetings.length - 1]
    const notes = state.office?.rivalNotes[k]?.[0]
    const closeOne = last?.result && ['SD', 'MD', 'SDRAW', 'MDRAW', 'DRAW'].includes(last.result.method)
    const why = notes ? notes.why : last ? (closeOne ? `Their last fight was close (${last.result!.method}) and nothing was settled.` : `They have fought ${meetings.length === 1 ? 'once' : `${meetings.length} times`}${last.result!.kd[0] + last.result!.kd[1] > 0 ? ' with knockdowns' : ''}.`) : 'Public feeling built from what each has said.'
    out.push({ opponent: fighterName(opp), intensity: v >= 60 ? 'Bitter' : v >= 35 ? 'Heated' : 'Simmering', why, v })
  }
  return out.sort((a, b) => b.v - a.v).slice(0, 3).map(({ v: _v, ...r }) => (void _v, r))
}

// ------------------------------------------------------------------------------------------------ Campaigns

export interface CampaignView {
  current: CampaignKind
  options: { kind: CampaignKind; label: string; blurb: string; fit: 'Strong fit' | 'Some fit' | 'Poor fit'; why: string; fee: number; chosen: boolean }[]
  points: number
  note: string | null
  canChange: boolean
  strategyNote: string | null
}

export function campaignView(state: GameState, eventId: Id): CampaignView | null {
  const ev = state.events[eventId]
  if (!ev || ev.promotionId !== state.playerPromotionId) return null
  const cur = state.office?.campaigns[eventId]?.kind ?? 'traditional'
  const options = CAMPAIGN_ORDER.map((kind) => {
    const s = campaignSuitability(state, ev, kind)
    return { kind, label: CAMPAIGN_INFO[kind].label, blurb: CAMPAIGN_INFO[kind].blurb, fit: s.score >= 0.6 ? ('Strong fit' as const) : s.score >= 0.3 ? ('Some fit' as const) : ('Poor fit' as const), why: s.why, fee: campaignFee(state, ev, kind), chosen: kind === cur }
  })
  const pts = campaignPoints(state, ev)
  const canChange = ['venueBooked', 'cardBuilding', 'onSale', 'promoting'].includes(ev.status) && ev.day - state.today >= 7
  const prof = cardProfile(state, ev)
  void prof
  return { current: cur, options, points: pts, note: pts === 0 ? null : pts > 0 ? `This angle is adding about ${pts} points of interest to the show.` : 'This angle is pointing the wrong way for this card.', canChange, strategyNote: strategyNote(state, ev) }
}

// ------------------------------------------------------------------------------------------------ Office (strategy, staff, relationships)

export interface OfficeView {
  strategy: { focus: StrategyFocus | null; stance: StrategyStance | null; weight: 'full' | 'turning'; changes: number }
  focusChoices: { kind: StrategyFocus; label: string; blurb: string; gain: string; cost: string }[]
  stanceChoices: { kind: StrategyStance; label: string; blurb: string; gain: string; cost: string }[]
  coach: { level: CoachLevel; label: string; weekly: number; blurb: string; options: { level: CoachLevel; label: string; weekly: number; blurb: string; effect: string }[] }
}

export function officeView(state: GameState): OfficeView {
  const s = strategyOf(state)
  return {
    strategy: { focus: s.focus, stance: s.stance, weight: strategyWeight(state) < 1 ? 'turning' : 'full', changes: s.changes },
    focusChoices: FOCUS_ORDER.map((k) => ({ kind: k, ...FOCUS_INFO[k] })), stanceChoices: STANCE_ORDER.map((k) => ({ kind: k, ...STANCE_INFO[k] })),
    coach: {
      level: state.office?.coach ?? 'standard', label: COACH[state.office?.coach ?? 'standard'].label, weekly: coachWeekly(state), blurb: COACH[state.office?.coach ?? 'standard'].blurb,
      options: COACH_ORDER.map((l) => ({ level: l, label: COACH[l].label, weekly: coachWeekly(state, l), blurb: COACH[l].blurb, effect: l === 'standard' ? 'Baseline.' : `Development ${Math.round((COACH[l].growth - 1) * 100)}% faster; camp injuries ${Math.round((1 - COACH[l].injury) * 100)}% rarer.` })),
    },
  }
}

void rivalryStrength

/** Rivalries across the roster (public strength and the reason), strongest first, each pair once. */
export function rosterRivalries(state: GameState): { mine: string; opponent: string; intensity: string; why: string }[] {
  const out: { mine: string; opponent: string; intensity: string; why: string; v: number }[] = []
  const seen = new Set<string>()
  for (const c of Object.values(state.contracts)) {
    if (c.promotionId !== state.playerPromotionId || c.status !== 'active') continue
    const f = state.fighters[c.fighterId]
    if (!f) continue
    for (const r of rivalriesOf(state, f)) {
      const k = [f.id, r.opponent].sort().join('|')
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ mine: fighterName(f), opponent: r.opponent, intensity: r.intensity, why: r.why, v: r.intensity === 'Bitter' ? 3 : r.intensity === 'Heated' ? 2 : 1 })
    }
  }
  return out.sort((a, b) => b.v - a.v).slice(0, 6).map(({ v: _v, ...r }) => (void _v, r))
}
