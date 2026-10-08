/**
 * UI-facing views of the fight business. Everything is built from public facts and the engine's own lists; nothing hidden
 * (manager weights, ambitions not yet told, reservation prices, potential, attributes) can appear here. The audit test
 * `HIDDEN_VIEW_KEYS` runs over these views.
 */
import { WEIGHT_CLASSES, weightClassLabel } from '../../data/weightClasses'
import { nation } from '../../data/nations'
import { bodyIdentity } from '../../data/mediaIdentity'
import { weeksBetween } from '../calendar'
import { fighterAge, fighterName } from '../fighters'
import { SANCTIONING } from '../media/orgs'
import { decodeWhy, rankIn } from '../media/rankings'
import { getList, getReigns } from '../media/records'
import { titleName, titleKey, titlesHeldBy } from '../media/titles'
import { reasonText } from '../media/reasons'
import { rosterOf } from '../media/requests'
import type { Fighter, GameState, Id, WeightClassId } from '../types'
import { campAgrees, divisionMoveOptions } from './divisions'
import { openCommitments, pathwayText } from './commitments'
import { careerValue, commercialAppeal, valueBreakdown } from './marketValue'
import { ambitionLabel, ambitionOf, managerOf } from './manager'
import { planChoices, toldSummary } from './talkViews'
import { negStage, STAGE_LABEL } from './stage'
import { expectedContractTerms, type ExpectedContractTerms } from './terms'
import { LADDER, STATUS_LABEL, currentTitleLabel, allEligibility, championObligations, contenderStatus, nextMilestone, titleOpportunities, type ContenderStatus, type Eligibility, type Opportunity } from './titleEco'
import { LEVEL_LABEL, LEVEL_ORDER, TITLE_DEF_BY_ID, levelOf, type TitleLevel } from './titleDefs'
import { planOf } from './plans'

// ------------------------------------------------------------------ title boards (Titles screen)

export interface ContenderRow { rank: number; id: Id; name: string; record: string; mine: boolean; reason: string; inChallengeRange: boolean; tag: 'mandatory' | 'eliminator' | null }
export interface BeltCard {
  body: string
  bodyName: string
  shortName: string
  colour: string
  level: TitleLevel
  division: WeightClassId
  divisionLabel: string
  title: string
  state: 'champion' | 'vacant' | 'dormant'
  /** Plain-language reason for the state (why a belt is vacant, dormant, in a contest...). */
  note: string
  territory: string
  champion: { id: Id; name: string; record: string; mine: boolean; sinceDay: number; weeks: number; defences: number } | null
  mandatory: { challengerId: Id; challenger: string; dueWeeks: number; extended: boolean } | null
  eliminator: { aId: Id; bId: Id; a: string; b: string; dueWeeks: number } | null
  contenders: ContenderRow[]
  /** Closed reigns of this belt, most recent first. Historical only: never used to decide who is champion. */
  history: { name: string; id: Id; from: number; to: number; defences: number; how: string }[]
  challengerLimit: number
  poolEligible: number
  poolNeeded: number
}

const territoryText = (body: string): string => {
  const d = TITLE_DEF_BY_ID[body]
  if (!d) return ''
  const e = d.eligibility
  if (e.kind === 'any') return 'Open to every fighter in the division'
  const names = e.nations.map((n) => nation(n)?.name ?? n)
  return e.kind === 'nations' ? `Fighters from ${names.join(', ')}` : `Fighters based in ${e.towns.join(', ')}`
}

/** Every belt of one ladder level in one division, with the champion, orders, the contenders and why. */
export function titleBoard(state: GameState, level: TitleLevel, wc: WeightClassId): BeltCard[] {
  const media = state.media
  if (!media) return []
  const mine = new Set(rosterOf(state).map((f) => f.id))
  const nm = (id: Id) => (state.fighters[id] ? fighterName(state.fighters[id]) : 'Unknown')
  const rec = (id: Id) => (state.fighters[id] ? `${state.fighters[id].record.wins}-${state.fighters[id].record.losses}-${state.fighters[id].record.draws}` : '')
  const out: BeltCard[] = []
  for (const org of SANCTIONING.filter((o) => levelOf(o.id) === level)) {
    const d = TITLE_DEF_BY_ID[org.id]
    const idn = bodyIdentity(org.id)
    const t = media.titles[titleKey(org.id, wc)]
    const list = getList(media, org.id, wc)
    const eligible = Object.values(state.fighters).filter((f) => f.status === 'active' && f.weightClass === wc && (!d || d.eligibility.kind === 'any' || fighterEligible(d, f))).length
    const contenders: ContenderRow[] = (list?.e ?? []).filter((e) => e.r >= 1).map((e) => {
      const why = reasonText(decodeWhy(e.why), e.p, e.r, (x) => (state.fighters[x] ? fighterName(state.fighters[x]) : undefined))
      const tag = t?.mand?.challenger === e.f ? 'mandatory' as const : t?.elim && (t.elim.a === e.f || t.elim.b === e.f) ? 'eliminator' as const : null
      return { rank: e.r, id: e.f, name: nm(e.f), record: rec(e.f), mine: mine.has(e.f), reason: why, inChallengeRange: e.r <= (d?.challengerLimit ?? 0), tag }
    })
    let state_: BeltCard['state'] = 'dormant'
    let note = `Not being contested: fewer than ${d?.minPool ?? 4} eligible, rated fighters in ${weightClassLabel(wc)}.`
    if (t) {
      if (t.c) { state_ = 'champion'; note = t.mand ? `Mandatory defence ordered against ${t.mand.cn}.` : t.elim ? `An eliminator is ordered between ${nm(t.elim.a)} and ${nm(t.elim.b)}.` : `${t.defences} successful defence${t.defences === 1 ? '' : 's'}.` }
      else {
        state_ = 'vacant'
        const top = contenders.slice(0, 2)
        note = t.vacantSince ? `Vacant for ${weeksBetween(t.vacantSince, state.today)} weeks.` : 'Vacant.'
        if (top.length >= 2) note += ` The leading contenders are ${top[0].name} and ${top[1].name}.`
        else note += ' Waiting for enough rated contenders to fill it.'
      }
    }
    out.push({
      body: org.id, bodyName: idn.name, shortName: idn.shortName, colour: idn.colour, level, division: wc, divisionLabel: weightClassLabel(wc), title: titleName(org.id, wc), state: state_, note, territory: territoryText(org.id),
      champion: t?.c ? { id: t.c, name: nm(t.c), record: rec(t.c), mine: mine.has(t.c), sinceDay: t.since, weeks: weeksBetween(t.since, state.today), defences: t.defences } : null,
      mandatory: t?.mand ? { challengerId: t.mand.challenger, challenger: t.mand.cn, dueWeeks: Math.max(0, weeksBetween(state.today, t.mand.due)), extended: !!t.mand.ext } : null,
      eliminator: t?.elim ? { aId: t.elim.a, bId: t.elim.b, a: nm(t.elim.a), b: nm(t.elim.b), dueWeeks: Math.max(0, weeksBetween(state.today, t.elim.due)) } : null,
      contenders, history: getReigns(media).filter((r) => r.b === org.id && r.wc === wc && r.to !== null).slice(-4).reverse().map((r) => ({ name: r.fn, id: r.f, from: r.from, to: r.to as number, defences: r.defences, how: r.how })), challengerLimit: d?.challengerLimit ?? 0, poolEligible: eligible, poolNeeded: d?.minPool ?? 4,
    })
  }
  return out
}

function fighterEligible(d: (typeof TITLE_DEF_BY_ID)[string], f: Fighter): boolean {
  const e = d.eligibility
  if (e.kind === 'any') return true
  return e.kind === 'nations' ? e.nations.includes(f.nationality) : e.nations.includes(f.nationality) && e.towns.includes(f.hometown)
}

export const titleLevels = (): { id: TitleLevel; label: string }[] => LEVEL_ORDER.map((l) => ({ id: l, label: LEVEL_LABEL[l] }))
export const divisionOptions = (): { id: WeightClassId; label: string }[] => WEIGHT_CLASSES.map((w) => ({ id: w.id, label: w.name }))

// ------------------------------------------------------------------ the fighter's business profile

export interface LadderStep { status: ContenderStatus; label: string; state: 'done' | 'current' | 'next' | 'later' }
export interface ValueDriver { label: string; score: number; note: string }

export interface FighterBusinessView {
  id: Id
  name: string
  stage: string
  status: ContenderStatus
  statusLabel: string
  ladder: LadderStep[]
  next: { text: string; concrete: boolean }
  /** The belts held NOW (from the live title records). */
  held: { title: string; level: TitleLevel; weeks: number; defences: number; body: string; short: string }[]
  /** One line for the headline: "WBC world champion", "Unified world champion", "Undisputed world champion", "European champion"… or null. */
  currentLabel: string | null
  /** Closed reigns, most recent first: these are history and are never shown as current. */
  former: { title: string; level: TitleLevel; division: string; from: number; to: number; defences: number; how: string }[]
  duties: ReturnType<typeof championObligations>
  opportunities: Opportunity[]
  eligibility: Eligibility[]
  history: { won: number; defences: number; best: string | null; unified: boolean; undisputed: boolean }
  value: { score: number; label: string; drivers: ValueDriver[]; commercial: number; commercialLabel: string }
  /** Ranges for signing / renewing — shown before any offer is made (null for fighters under another contract). */
  expected: ExpectedContractTerms | null
  commitments: { id: string; text: string; status: string; dueWeeks: number | null; note: string }[]
  plan: { current: string; choices: ReturnType<typeof planChoices> } | null
  /** Revealed only after the camp has told the player. */
  told: { priorities: string[]; ambition: string | null }
  manager: string
  division: { options: { dir: 'up' | 'down'; to: WeightClassId; label: string; blocked: string | null }[]; campNote: string | null } | null
  age: number
}

const valueLabel = (v: number): string => (v >= 85 ? 'Elite' : v >= 70 ? 'Premium' : v >= 55 ? 'Strong' : v >= 40 ? 'Solid' : v >= 25 ? 'Modest' : 'Low')

export function fighterBusinessView(state: GameState, id: Id): FighterBusinessView | null {
  const f = state.fighters[id]
  if (!f) return null
  const media = state.media
  const own = !!(f.contractId && state.contracts[f.contractId]?.promotionId === state.playerPromotionId)
  const status = contenderStatus(state, f)
  const idx = LADDER.indexOf(status)
  const ladder: LadderStep[] = LADDER.map((s, i) => ({ status: s, label: STATUS_LABEL[s], state: s === status ? 'current' : idx < 0 ? 'later' : i < idx ? 'done' : i === idx + 1 ? 'next' : 'later' }))
  const vb = valueBreakdown(state, f)
  const drivers: ValueDriver[] = [
    { label: 'Reputation', score: Math.round(vb.reputation), note: 'How respected they are in the sport' },
    { label: 'Fame', score: Math.round(vb.fame), note: 'Popularity and media attention' },
    { label: 'Quality of opposition', score: Math.round(vb.opposition), note: 'Who they have been in with' },
    { label: 'Record', score: Math.round(vb.record), note: 'Win rate and volume of work' },
    { label: 'Ranking', score: Math.round(vb.ranking), note: 'Where the lists place them' },
    { label: 'Titles', score: Math.round(vb.titles), note: 'Belts held now, and before' },
    { label: 'Form', score: Math.round(vb.form), note: 'Recent momentum' },
    { label: 'Activity', score: Math.round(vb.activity), note: 'How recently they have fought' },
  ]
  const value = careerValue(state, f)
  const commercial = Math.round(commercialAppeal(state, f))
  const hist = state.business?.titleHist[id]
  const t = state.business?.neg[id]
  void t
  const expected = !own && f.status === 'active' && !f.contractId ? expectedContractTerms(state, id, 'signing') : own ? expectedContractTerms(state, id, 'renewal') : null
  const commitments = (state.business?.commitments ?? []).filter((c) => c.fighterId === id).slice(-6).reverse().map((c) => ({
    id: c.id, text: pathwayText({ kind: c.kind, weeks: 0, maxRank: c.maxRank ?? undefined }), status: c.status, dueWeeks: c.status === 'open' ? Math.max(0, Math.ceil((c.dueDay - state.today) / 7)) : null, note: c.note,
  }))
  void openCommitments
  const learned = toldSummary(state, f, undefined)
  const held = media ? titlesHeldBy(media, id).map((h) => ({ title: titleName(h.body, h.wc), level: levelOf(h.body), weeks: weeksBetween(h.rec.since, state.today), defences: h.rec.defences, body: h.body, short: bodyIdentity(h.body).shortName })) : []
  const former = media ? getReigns(media).filter((r) => r.f === id && r.to !== null).slice(-8).reverse().map((r) => ({ title: titleName(r.b, r.wc), level: levelOf(r.b), division: weightClassLabel(r.wc), from: r.from, to: r.to as number, defences: r.defences, how: r.how })) : []
  return {
    id, name: fighterName(f), stage: STAGE_LABEL[negStage(state, f)], status, statusLabel: STATUS_LABEL[status], ladder, next: nextMilestone(state, f), held, currentLabel: currentTitleLabel(state, id), former, duties: championObligations(state, f), opportunities: titleOpportunities(state, f),
    eligibility: allEligibility(state, f), history: { won: hist?.won ?? 0, defences: hist?.defences ?? 0, best: hist?.best ? LEVEL_LABEL[hist.best] : null, unified: !!hist?.unifiedDay, undisputed: !!hist?.undisputedDay },
    value: { score: Math.round(value), label: valueLabel(value), drivers, commercial, commercialLabel: valueLabel(commercial) }, expected, commitments,
    plan: own ? { current: planOf(state, id), choices: planChoices(state, f) } : null, told: learned,
    manager: managerOf(state, f).name,
    division: own ? { options: divisionMoveOptions(state, f), campNote: campAgrees(state, f) } : null, age: fighterAge(f, state.today),
  }
}

export { currentTitleLabel }
export { myTitlePaths, titlePathFor } from './titlePath'
export type { TitlePathView, TitleTarget } from './titlePath'

/** Short names of every belt a fighter holds, any level (for the rankings champion row). */
export function beltsHeld(state: GameState, id: Id): { short: string; title: string; level: TitleLevel }[] {
  const media = state.media
  if (!media) return []
  return titlesHeldBy(media, id).map((h) => ({ short: bodyIdentity(h.body).shortName, title: titleName(h.body, h.wc), level: levelOf(h.body) })).sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level))
}

export { ambitionLabel, ambitionOf, getReigns, rankIn }
