/**
 * THE TITLE ECOSYSTEM, READ-ONLY. Eligibility, opportunities, contender status, champion obligations and belts held — every answer
 * derived from the lists, the title records and the fights that really exist, and every one explained in plain language. Nothing here
 * promises an opportunity the engine would not honour: an opportunity is listed only when the rules of that body currently allow it.
 */
import { weightClassLabel } from '../../data/weightClasses'
import { nation } from '../../data/nations'
import { weeksBetween } from '../calendar'
import { keyedFloat } from '../rng'
import { fighterAge, fighterName } from '../fighters'
import { SANCTIONING } from '../media/orgs'
import { rankIn } from '../media/rankings'
import { bodiesFor, higherBeltOf, mandateVoidReason, qualifiedRank, qualifiesFor, vacantLimit, holdsWorldBelt, titleKey, titleName, titlesHeldBy } from '../media/titles'
import { getList } from '../media/records'
import type { Fight, Fighter, GameState, Id, WeightClassId } from '../types'
import { bodyIdentity } from '../../data/mediaIdentity'
import { assessChallenger } from './contender'
import { LEVEL_STAKES, LEVEL_LABEL, LEVEL_ORDER, TITLE_DEF_BY_ID, eligibilityReason, isEligibleFor, levelOf, levelRank, type TitleLevel } from './titleDefs'


export type EligibilityStatus = 'champion' | 'mandatory' | 'eliminator' | 'challenger' | 'unqualified' | 'ranked' | 'unranked' | 'ineligible' | 'dormant'
export interface Eligibility {
  body: string
  wc: WeightClassId
  title: string
  level: TitleLevel
  status: EligibilityStatus
  rank: number | null
  limit: number
  champion: Id | null
  /** The fighter could be matched for this belt right now. */
  canChallengeNow: boolean
  reasons: string[]
}

const countFights = (f: Fighter) => f.record.wins + f.record.losses + f.record.draws

/** Why a fighter can, or cannot, fight for one body's belt in their division. */
export function titleEligibility(state: GameState, f: Fighter, body: string, wc: WeightClassId = f.weightClass): Eligibility {
  const media = state.media
  const d = TITLE_DEF_BY_ID[body]
  const base = { body, wc, title: titleName(body, wc), level: levelOf(body), limit: d?.challengerLimit ?? 0 }
  if (!media || !d) return { ...base, status: 'dormant', rank: null, champion: null, canChallengeNow: false, reasons: ['Titles are not available in this save.'] }
  const rec = media.titles[titleKey(body, wc)]
  const reasons: string[] = []
  const nationName = nation(f.nationality)?.name ?? f.nationality
  const terr = isEligibleFor(d, f)
  reasons.push(eligibilityReason(d, f, nationName))
  if (!terr) return { ...base, status: 'ineligible', rank: null, champion: rec?.c ?? null, canChallengeNow: false, reasons }
  if (f.weightClass !== wc) { reasons.push(`Fights at ${weightClassLabel(f.weightClass)}, not ${weightClassLabel(wc)}.`); return { ...base, status: 'ineligible', rank: null, champion: rec?.c ?? null, canChallengeNow: false, reasons } }
  if (!rec) { reasons.push(`The ${bodyIdentity(body).shortName} ${weightClassLabel(wc)} title is not being contested — too few eligible fighters in the division.`); return { ...base, status: 'dormant', rank: null, champion: null, canChallengeNow: false, reasons } }
  const up = higherBeltOf(media, f.id, wc, levelOf(body))
  if (up) { reasons.push(`Holds the ${bodyIdentity(up).shortName} ${LEVEL_LABEL[levelOf(up)].toLowerCase()} title, so the ${LEVEL_LABEL[levelOf(body)].toLowerCase()} belts are behind them.`); return { ...base, status: 'ineligible', rank: null, champion: rec.c ?? null, canChallengeNow: false, reasons } }
  if (rec.c === f.id) { reasons.push(`Champion since ${weeksBetween(rec.since, state.today)} weeks ago, ${rec.defences} defence${rec.defences === 1 ? '' : 's'}.`); return { ...base, status: 'champion', rank: 0, champion: f.id, canChallengeNow: false, reasons } }
  const rank = rankIn(media, body, wc, f.id)
  const n = countFights(f)
  if (n < d.minFights) { reasons.push(`Needs ${d.minFights} professional fights to be rated (has ${n}).`); return { ...base, status: 'unranked', rank: null, champion: rec.c, canChallengeNow: false, reasons } }
  if (rec.mand?.challenger === f.id && rec.c && bodiesFor(state, rec.c, f.id, wc).includes(body)) { reasons.push(`Named mandatory challenger by ${bodyIdentity(body).shortName}.`); return { ...base, status: 'mandatory', rank, champion: rec.c, canChallengeNow: !!rec.c, reasons } }
  if (rec.elim && (rec.elim.a === f.id || rec.elim.b === f.id)) { reasons.push(`Ordered to an eliminator by ${bodyIdentity(body).shortName}.`); return { ...base, status: 'eliminator', rank, champion: rec.c, canChallengeNow: false, reasons } }
  if (rank === null || rank < 1) { reasons.push(`Not in the ${bodyIdentity(body).shortName} top ${d.rankingCount}.`); return { ...base, status: 'unranked', rank: null, champion: rec.c, canChallengeNow: false, reasons } }
  const limit = rec.c ? d.challengerLimit : vacantLimit(body)
  const a = assessChallenger(state, body, f.id)
  // A champion's challengers come from the top of the list; a vacant belt goes to the best CREDIBLE contenders, wherever they are placed.
  const inRange = rec.c || a.tier !== 'contender' ? rank <= limit : (qualifiedRank(state, body, wc, f.id) ?? 99) <= limit
  if (inRange) {
    // High enough on the list, but not yet a credible challenger.
    if (a.tier !== 'contender') { reasons.push(`Ranked #${rank} by ${bodyIdentity(body).shortName}, inside the top ${limit}, but not yet a credible challenger. ${a.step}.`.replace('..', '.')); return { ...base, status: 'unqualified', rank, champion: rec.c, canChallengeNow: false, reasons, limit } }
    reasons.push(`Ranked #${rank} by ${bodyIdentity(body).shortName}; ${rec.c ? 'challenges are open to the top' : 'the top'} ${limit}.`)
    return { ...base, status: 'challenger', rank, champion: rec.c, canChallengeNow: true, reasons, limit }
  }
  reasons.push(`Ranked #${rank} by ${bodyIdentity(body).shortName}; needs to reach the top ${limit}.`)
  return { ...base, status: 'ranked', rank, champion: rec.c, canChallengeNow: false, reasons, limit }
}

/** Every body's verdict for this fighter, highest level first, dormant ones last. */
export function allEligibility(state: GameState, f: Fighter): Eligibility[] {
  return SANCTIONING.map((o) => titleEligibility(state, f, o.id)).sort((a, b) => levelRank(b.level) - levelRank(a.level) || (a.rank ?? 99) - (b.rank ?? 99))
}

// ----------------------------------------------------------- Opportunities

export type OpportunityKind = 'DEFENCE_DUE' | 'DEFENCE_OPEN' | 'MANDATORY_SHOT' | 'ELIMINATOR' | 'VACANT' | 'CHALLENGE'
export interface Opportunity {
  kind: OpportunityKind
  body: string
  wc: WeightClassId
  level: TitleLevel
  title: string
  opponentId: Id | null
  /** Weeks left when something is due. */
  dueWeeks: number | null
  text: string
}

const liveFight = (state: GameState, a: Id, b: Id): Fight | undefined =>
  Object.values(state.fights).find((x) => !x.result && ['agreed', 'scheduled', 'training', 'fightNight'].includes(x.status) && [x.sideA.fighterId, x.sideB.fighterId].includes(a) && [x.sideA.fighterId, x.sideB.fighterId].includes(b))

/** Title opportunities that exist for this fighter right now. Each is real: it follows from a list position or an order that is on the books. */
export function titleOpportunities(state: GameState, f: Fighter): Opportunity[] {
  const media = state.media
  if (!media || f.status !== 'active') return []
  const out: Opportunity[] = []
  const nm = (id: Id) => (state.fighters[id] ? fighterName(state.fighters[id]) : 'the champion')
  for (const o of SANCTIONING) {
    const rec = media.titles[titleKey(o.id, f.weightClass)]
    if (!rec) continue
    const e = titleEligibility(state, f, o.id)
    const base = { body: o.id, wc: f.weightClass, level: e.level, title: e.title }
    const sb = bodyIdentity(o.id).shortName
    if (e.status === 'champion') {
      if (rec.mand) out.push({ ...base, kind: 'DEFENCE_DUE', opponentId: rec.mand.challenger, dueWeeks: Math.max(0, weeksBetween(state.today, rec.mand.due)), text: `Mandatory defence of the ${e.title} against ${nm(rec.mand.challenger)} — due in ${Math.max(0, weeksBetween(state.today, rec.mand.due))} weeks.` })
      else {
        const top = getList(media, o.id, f.weightClass)?.e.find((x) => x.r === 1)
        out.push({ ...base, kind: 'DEFENCE_OPEN', opponentId: top?.f ?? null, dueWeeks: null, text: `Voluntary defence available${top ? ` — #1 contender ${nm(top.f)}` : ''}.` })
      }
    } else if (e.status === 'mandatory' && rec.mand) out.push({ ...base, kind: 'MANDATORY_SHOT', opponentId: rec.c, dueWeeks: Math.max(0, weeksBetween(state.today, rec.mand.due)), text: `${sb} mandatory challenger for ${nm(rec.c ?? '')} — a fight must be made within ${Math.max(0, weeksBetween(state.today, rec.mand.due))} weeks.` })
    else if (e.status === 'eliminator' && rec.elim) {
      const other = rec.elim.a === f.id ? rec.elim.b : rec.elim.a
      out.push({ ...base, kind: 'ELIMINATOR', opponentId: other, dueWeeks: Math.max(0, weeksBetween(state.today, rec.elim.due)), text: `${sb} eliminator against ${nm(other)} — the winner becomes mandatory challenger. ${liveFight(state, f.id, other) ? 'The fight is booked.' : `Due in ${Math.max(0, weeksBetween(state.today, rec.elim.due))} weeks.`}` })
    } else if (e.status === 'challenger') {
      if (rec.c) out.push({ ...base, kind: 'CHALLENGE', opponentId: rec.c, dueWeeks: null, text: `Ranked #${e.rank} by ${sb}: eligible to challenge ${nm(rec.c)} for the ${e.title}.` })
      else {
        const rival = (getList(media, o.id, f.weightClass)?.e ?? []).find((x) => x.r >= 1 && x.f !== f.id && (qualifiedRank(state, o.id, f.weightClass, x.f) ?? 99) <= vacantLimit(o.id))
        out.push({ ...base, kind: 'VACANT', opponentId: rival?.f ?? null, dueWeeks: null, text: `The ${e.title} is vacant. Ranked #${e.rank}: eligible to fight for it${rival ? ` — for instance against ${nm(rival.f)} (#${rival.r})` : ''}.` })
      }
    }
  }
  return out.sort((a, b) => levelRank(b.level) - levelRank(a.level) || (a.dueWeeks ?? 99) - (b.dueWeeks ?? 99))
}

// --------------------------------------------------------- Contender status

export type ContenderStatus =
  | 'JOURNEYMAN' | 'PROSPECT' | 'DEVELOPING' | 'REGIONAL_CONTENDER' | 'DOMESTIC_CONTENDER' | 'EUROPEAN_CONTENDER' | 'WORLD_CONTENDER'
  | 'ELIMINATOR' | 'MANDATORY_CHALLENGER' | 'TITLE_CHALLENGER' | 'CHAMPION' | 'UNIFIED_CHAMPION' | 'UNDISPUTED_CHAMPION'

export const STATUS_LABEL: Record<ContenderStatus, string> = {
  JOURNEYMAN: 'Journeyman', PROSPECT: 'Prospect', DEVELOPING: 'Developing', REGIONAL_CONTENDER: 'Regional contender', DOMESTIC_CONTENDER: 'Domestic contender',
  EUROPEAN_CONTENDER: 'European contender', WORLD_CONTENDER: 'World contender', ELIMINATOR: 'Eliminator', MANDATORY_CHALLENGER: 'Mandatory challenger',
  TITLE_CHALLENGER: 'Title challenger', CHAMPION: 'Champion', UNIFIED_CHAMPION: 'Unified champion', UNDISPUTED_CHAMPION: 'Undisputed champion',
}

/** The rungs of the career ladder, in order, as the profile displays it. */
export const LADDER: ContenderStatus[] = ['PROSPECT', 'REGIONAL_CONTENDER', 'DOMESTIC_CONTENDER', 'EUROPEAN_CONTENDER', 'WORLD_CONTENDER', 'MANDATORY_CHALLENGER', 'TITLE_CHALLENGER', 'CHAMPION', 'UNIFIED_CHAMPION', 'UNDISPUTED_CHAMPION']

export function worldBelts(state: GameState, id: Id, wc: WeightClassId): number {
  const media = state.media
  if (!media) return 0
  return Object.entries(media.titles).filter(([k, r]) => r.c === id && k.endsWith(`|${wc}`) && levelOf(k.split('|')[0]) === 'world').length
}
export function worldBodiesIn(state: GameState, wc: WeightClassId): number {
  const media = state.media
  return media ? Object.keys(media.titles).filter((k) => k.endsWith(`|${wc}`) && levelOf(k.split('|')[0]) === 'world').length : 0
}

export function contenderStatus(state: GameState, f: Fighter): ContenderStatus {
  const media = state.media
  if (!media || f.status === 'retired') return 'DEVELOPING'
  const held = titlesHeldBy(media, f.id)
  if (held.length) {
    const wb = worldBelts(state, f.id, f.weightClass)
    if (wb >= 2 && wb >= worldBodiesIn(state, f.weightClass)) return 'UNDISPUTED_CHAMPION'
    if (wb >= 2) return 'UNIFIED_CHAMPION'
    return 'CHAMPION'
  }
  for (const fid of Object.keys(media.titleFights)) {
    const ft = state.fights[fid]
    if (ft && !ft.result && (ft.sideA.fighterId === f.id || ft.sideB.fighterId === f.id)) return 'TITLE_CHALLENGER'
  }
  let best: ContenderStatus | null = null
  const bump = (s: ContenderStatus) => { if (!best || LADDER_ORDER.indexOf(s) > LADDER_ORDER.indexOf(best)) best = s }
  for (const o of SANCTIONING) {
    const rec = media.titles[titleKey(o.id, f.weightClass)]
    if (!rec) continue
    // an order that can no longer be staged (the challenger fell out of range, or a belt changed) is not a mandatory challenge
    if (rec.mand?.challenger === f.id && rec.c && !mandateVoidReason(state, media, o.id, f.weightClass, rec.c, f.id)) bump(levelOf(o.id) === 'world' ? 'MANDATORY_CHALLENGER' : levelOf(o.id) === 'european' ? 'EUROPEAN_CONTENDER' : 'DOMESTIC_CONTENDER')
    else if (rec.elim && (rec.elim.a === f.id || rec.elim.b === f.id)) bump(levelOf(o.id) === 'world' ? 'ELIMINATOR' : levelOf(o.id) === 'european' ? 'EUROPEAN_CONTENDER' : 'DOMESTIC_CONTENDER')
    else {
      const r = rankIn(media, o.id, f.weightClass, f.id)
      if (r !== null && r >= 1) bump(({ world: 'WORLD_CONTENDER', european: 'EUROPEAN_CONTENDER', domestic: 'DOMESTIC_CONTENDER', area: 'REGIONAL_CONTENDER' } as const)[levelOf(o.id)])
    }
  }
  if (best) return best
  const n = countFights(f)
  if (n >= 18 && f.record.wins / Math.max(1, n) < 0.5 && f.reputation < 40) return 'JOURNEYMAN'
  return n <= 8 && fighterAge(f, state.today) <= 26 ? 'PROSPECT' : 'DEVELOPING'
}

const LADDER_ORDER: ContenderStatus[] = ['JOURNEYMAN', 'DEVELOPING', 'PROSPECT', 'REGIONAL_CONTENDER', 'DOMESTIC_CONTENDER', 'EUROPEAN_CONTENDER', 'WORLD_CONTENDER', 'ELIMINATOR', 'MANDATORY_CHALLENGER', 'TITLE_CHALLENGER', 'CHAMPION', 'UNIFIED_CHAMPION', 'UNDISPUTED_CHAMPION']

/**
 * What is realistically next. Always grounded in the lists: a concrete opportunity if there is one, otherwise the exact rank the next
 * rung asks for. Never an opportunity that does not exist.
 */
export function nextMilestone(state: GameState, f: Fighter): { text: string; concrete: boolean } {
  const ops = titleOpportunities(state, f)
  if (ops.length) { const o = ops[0]; return { text: o.text, concrete: true } }
  const media = state.media
  const status = contenderStatus(state, f)
  if (!media) return { text: 'Build a record.', concrete: false }
  const eligibleBodies = allEligibility(state, f).filter((e) => e.status !== 'ineligible' && e.status !== 'dormant')
  const next = eligibleBodies.filter((e) => e.status === 'ranked' || e.status === 'unranked' || e.status === 'unqualified')
  const bestRanked = next.filter((e) => e.rank !== null).sort((a, b) => levelRank(b.level) - levelRank(a.level) || (a.rank ?? 99) - (b.rank ?? 99))[0]
  if (bestRanked?.status === 'unqualified') return { text: `Ranked #${bestRanked.rank} by ${bodyIdentity(bestRanked.body).shortName}, but not yet a credible challenger for the ${bestRanked.title}. ${bestRanked.reasons[bestRanked.reasons.length - 1].split('. ').pop()}`, concrete: false }
  if (bestRanked) return { text: `Climb to the top ${bestRanked.limit} of the ${bodyIdentity(bestRanked.body).shortName} ratings (now #${bestRanked.rank}) to earn a shot at the ${bestRanked.title}.`, concrete: false }
  const firstRung = eligibleBodies.filter((e) => e.status === 'unranked').sort((a, b) => levelRank(a.level) - levelRank(b.level))[0]
  if (status === 'PROSPECT' || status === 'DEVELOPING' || status === 'JOURNEYMAN') {
    if (firstRung) return { text: `Win against rated opposition to enter the ${bodyIdentity(firstRung.body).shortName} ${LEVEL_LABEL[firstRung.level].toLowerCase()} ratings.`, concrete: false }
    return { text: 'Build a record against ranked opposition to enter the ratings.', concrete: false }
  }
  if (status === 'CHAMPION' || status === 'UNIFIED_CHAMPION') return { text: 'Defend the belt — or look for a unification fight against another world champion.', concrete: false }
  if (status === 'UNDISPUTED_CHAMPION') return { text: 'Every world title in the division is yours. Defend it and build the legacy.', concrete: false }
  return { text: 'Keep winning.', concrete: false }
}

// -------------------------------------------------------- Champion duties

export interface BeltView {
  body: string
  wc: WeightClassId
  title: string
  level: TitleLevel
  reignWeeks: number
  defences: number
  lastDefenceWeeks: number | null
  mandatory: { challenger: Id; name: string; dueWeeks: number; extended: boolean } | null
  eliminator: { a: Id; b: Id; dueWeeks: number } | null
  nextAction: string
  activity: 'Active' | 'Due a defence' | 'At risk'
}

export function championObligations(state: GameState, f: Fighter): BeltView[] {
  const media = state.media
  if (!media) return []
  return titlesHeldBy(media, f.id).map(({ body, wc, rec }) => {
    const idleWeeks = weeksBetween(Math.max(rec.lastFight, rec.since), state.today)
    const d = TITLE_DEF_BY_ID[body]
    const mand = rec.mand ? { challenger: rec.mand.challenger, name: fighterName(state.fighters[rec.mand.challenger] ?? ({ firstName: 'The', lastName: 'challenger' } as Fighter)), dueWeeks: Math.max(0, weeksBetween(state.today, rec.mand.due)), extended: !!rec.mand.ext } : null
    const elim = rec.elim ? { a: rec.elim.a, b: rec.elim.b, dueWeeks: Math.max(0, weeksBetween(state.today, rec.elim.due)) } : null
    const risk = d ? idleWeeks >= d.inactiveStripWeeks * 0.7 : false
    const nextAction = mand ? `Negotiate the mandatory defence against ${mand.name} — ${mand.dueWeeks} weeks left` : elim ? 'Watch the eliminator — its winner becomes mandatory challenger.' : risk ? 'Defend soon: a long layoff puts the belt at risk.' : 'No defence is required yet.'
    return {
      body, wc, title: titleName(body, wc), level: levelOf(body), reignWeeks: weeksBetween(rec.since, state.today), defences: rec.defences,
      lastDefenceWeeks: rec.defences > 0 || rec.lastFight > rec.since ? weeksBetween(rec.lastFight, state.today) : null,
      mandatory: mand, eliminator: elim, nextAction, activity: (mand && mand.dueWeeks <= 8 ? 'Due a defence' : risk ? 'At risk' : 'Active') as BeltView['activity'],
    }
  }).sort((a, b) => levelRank(b.level) - levelRank(a.level))
}

// ------------------------------------------------- AI: obligations first

/**
 * A fighter's most pressing title obligation and the opponent it needs — used by AI promotions (the same rules the player faces),
 * so mandatory defences, eliminators and vacant-title fights actually get made.
 */
type Obligation = { partner: Id; kind: 'mandatory' | 'eliminator' | 'vacant'; body: string }
const obCache = new WeakMap<object, { today: number; map: Map<Id, Obligation> }>()

/** Every fighter's most pressing title obligation, built once per media state and day (cheap to ask for in a booking loop). */
function obligationMap(state: GameState): Map<Id, Obligation> {
  const media = state.media!
  const hit = obCache.get(media)
  if (hit && hit.today === state.today) return hit.map
  const map = new Map<Id, Obligation>()
  const put = (id: Id, o: Obligation, strong: boolean) => { if (strong || !map.has(id)) map.set(id, o) }
  for (const [k, rec] of Object.entries(media.titles)) {
    const [body, wc] = k.split('|')
    if (rec.mand && rec.c) { put(rec.c, { partner: rec.mand.challenger, kind: 'mandatory', body }, true); put(rec.mand.challenger, { partner: rec.c, kind: 'mandatory', body }, true) }
    if (rec.elim) { put(rec.elim.a, { partner: rec.elim.b, kind: 'eliminator', body }, false); put(rec.elim.b, { partner: rec.elim.a, kind: 'eliminator', body }, false) }
    if (!rec.c) {
      // The best credible contenders who are not already paired by another vacant belt (several bodies share the same few contenders; one
      // bout can settle them all, so a fighter is paired once and the next body pairs the rest). Nobody is paired who is not credible.
      const top = (getList(media, body, wc as WeightClassId)?.e ?? []).filter((e) => e.r >= 1 && !(levelOf(body) === 'world' && holdsWorldBelt(media, e.f, wc as WeightClassId)) && qualifiesFor(state, body, e.f) && !map.has(e.f)).slice(0, 2)
      if (top.length === 2) { put(top[0].f, { partner: top[1].f, kind: 'vacant', body }, false); put(top[1].f, { partner: top[0].f, kind: 'vacant', body }, false) }
    }
  }
  obCache.set(media, { today: state.today, map })
  return map
}

/**
 * A fighter's most pressing title obligation and the opponent it needs — used by AI promotions (the same rules the player faces),
 * so mandatory defences, eliminators and vacant-title fights actually get made.
 */
export function titleObligation(state: GameState, id: Id): Obligation | null {
  if (!state.media?.effects) return null
  return obligationMap(state).get(id) ?? null
}

/**
 * A unification is made on purpose: now and then (a quarterly gate, deterministic) two champions of different world bodies in a
 * division, neither facing a mandatory order, are matched. Nothing forces it, and the AI does not chase it every week.
 */
export function unificationPartner(state: GameState, id: Id): Id | null {
  const media = state.media
  const f = state.fighters[id]
  if (!media?.effects || !f) return null
  const mine = titlesHeldBy(media, id).filter((t) => t.wc === f.weightClass && levelOf(t.body) === 'world')
  if (mine.length === 0 || mine.some((t) => t.rec.mand || t.rec.elim)) return null
  const quarter = Math.floor(state.today / 91)
  if (keyedFloat(state.seed, 'unify', f.weightClass, quarter) >= 0.07) return null
  const others = Object.entries(media.titles).filter(([k, r]) => r.c && r.c !== id && k.endsWith(`|${f.weightClass}`) && levelOf(k.split('|')[0]) === 'world' && !r.mand && !r.elim).map(([, r]) => r.c!)
  const pick = [...new Set(others)].filter((o) => !mine.some((t) => t.body === Object.entries(media.titles).find(([, r]) => r.c === o)?.[0].split('|')[0])).sort()[0]
  return pick ?? null
}

/** The champion's headline, from the live records only: one world belt names the body; two or more is unified; all of them is undisputed. */
export function currentTitleLabel(state: GameState, id: Id): string | null {
  const media = state.media
  if (!media) return null
  const held = titlesHeldBy(media, id)
  if (!held.length) return null
  const wc = held[0].wc
  const world = held.filter((h) => h.wc === wc && levelOf(h.body) === 'world')
  if (world.length >= 2) {
    const all = Object.keys(media.titles).filter((k) => k.endsWith(`|${wc}`) && levelOf(k.slice(0, k.indexOf('|'))) === 'world').length
    return world.length >= all ? 'Undisputed world champion' : 'Unified world champion'
  }
  if (world.length === 1) return `${bodyIdentity(world[0].body).shortName} world champion`
  const top = held.slice().sort((a, b) => levelRank(levelOf(b.body)) - levelRank(levelOf(a.body)))[0]
  return `${LEVEL_LABEL[levelOf(top.body)]} champion`
}

export { bodiesFor, LEVEL_ORDER }

// ------------------------------------------------------------------ appeal

/**
 * What a belt on the line adds to a fight’s pull (a game weighting, `LEVEL_STAKES`): bigger for higher levels, more again for a
 * unification, a little for an eliminator, and a premium when the winner could become undisputed. Zero unless the media world is
 * feeding the economy (the flags themselves come from it). Read from the fight’s own `title` record, never inferred.
 */
export function titleAppeal(state: GameState, fight: Fight): number {
  if (!state.media?.effects || !fight.title?.level) return 0
  const base = LEVEL_STAKES[fight.title.level].appeal * 0.65
  const kind = fight.title.kind ?? 'title'
  let v = kind === 'eliminator' ? base * 0.5 : kind === 'unification' ? base * 1.45 : base
  if (kind === 'unification' && fight.title.level === 'world') {
    const worlds = worldBodiesIn(state, fight.weightClass)
    const bodies = (fight.title.bodies ?? []).filter((b) => levelOf(b) === 'world').length
    if (worlds > 0 && bodies >= worlds) v += 3 // the winner is the undisputed champion
  }
  return v
}
