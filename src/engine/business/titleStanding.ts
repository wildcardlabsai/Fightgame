/**
 * TITLE STANDING — read-only presentation models that say where a fighter stands in the championship picture, and whether a bout
 * between two fighters could be for a belt. Nothing here decides anything and nothing is inferred from reputation or fame:
 *   • who is champion comes from the live title records (`media.titles`),
 *   • mandatory and eliminator involvement comes from the orders stored on those same records,
 *   • "ranked contender" comes from the sanctioning bodies' own ranking lists,
 *   • "former champion" comes from the closed reigns in the title history,
 *   • "could be for a title" asks `bodiesFor` — the very function the scheduler uses to flag a fight — so the matchmaking screen
 *     can never promise a belt the rules would not put on the line.
 * Public facts only: nothing hidden (attributes, potential, manager) is read.
 */
import { WEIGHT_CLASSES, weightClassLabel } from '../../data/weightClasses'
import { bodyIdentity } from '../../data/mediaIdentity'
import { weeksBetween } from '../calendar'
import { fighterName } from '../fighters'
import { sizeEdge } from '../fight/profile'
import { SANCTIONING } from '../media/orgs'
import { getList, getReigns } from '../media/records'
import { bodiesFor, fightTitleMeta, holdsWorldBelt, qualifiesFor, titleName, titlesHeldBy } from '../media/titles'
import { currentTitleLabel } from './titleEco'
import { LEVEL_LABEL, LEVEL_ORDER, TITLE_DEF_BY_ID, levelOf, type TitleLevel } from './titleDefs'
import type { GameState, Id, WeightClassId } from '../types'

export type StandingRole = 'champion' | 'mandatory' | 'eliminator' | 'contender' | 'former' | 'unranked'

export interface BeltRef { body: string; short: string; colour: string; level: TitleLevel; title: string; division: string }

export interface TitleStanding {
  role: StandingRole
  /** Chip text: "World champion", "Mandatory challenger", "Ranked #3 WBC", "Former WBO champion", "Unranked". */
  label: string
  /** One factual line for a detail view (null for an unranked fighter with no history). */
  note: string | null
  /** Belts held right now, highest level first. */
  held: BeltRef[]
  /** Highest level of belt involved in the label (for colouring). */
  level: TitleLevel | null
  /** Best current ranking among the sanctioning bodies' lists: where a ranked fighter sits. */
  ranked: { body: string; short: string; rank: number; inRange: boolean; division: string } | null
  /** Closed reigns, most recent first (history only; never shown as current). */
  former: { title: string; short: string; level: TitleLevel; defences: number }[]
  /** Open mandatory / eliminator orders involving this fighter. */
  order: { kind: 'mandatory' | 'eliminator'; title: string; short: string; dueWeeks: number } | null
}

const ref = (body: string, wc: WeightClassId): BeltRef => { const i = bodyIdentity(body); return { body, short: i.shortName, colour: i.colour, level: levelOf(body), title: titleName(body, wc), division: weightClassLabel(wc) } }
const lvl = (l: TitleLevel | null): number => (l ? LEVEL_ORDER.indexOf(l) : -1)

/**
 * Builds the lookup once (one pass over the title records, ranking lists and reigns) so a screen listing hundreds of fighters stays cheap.
 * The returned function never throws for an unknown id: that fighter is simply unranked.
 */
export function standingIndex(state: GameState): (id: Id) => TitleStanding {
  const media = state.media
  const empty = (): TitleStanding => ({ role: 'unranked', label: 'Unranked', note: null, held: [], level: null, ranked: null, former: [], order: null })
  if (!media) return empty
  const held = new Map<Id, BeltRef[]>()
  const orders = new Map<Id, NonNullable<TitleStanding['order']>>()
  for (const [k, rec] of Object.entries(media.titles)) {
    const [body, wc] = k.split('|') as [string, WeightClassId]
    if (rec.c) { const l = held.get(rec.c) ?? []; l.push(ref(body, wc)); held.set(rec.c, l) }
    const r = ref(body, wc)
    if (rec.mand) orders.set(rec.mand.challenger, { kind: 'mandatory', title: r.title, short: r.short, dueWeeks: Math.max(0, weeksBetween(state.today, rec.mand.due)) })
    if (rec.elim && !rec.elim.fightId) for (const x of [rec.elim.a, rec.elim.b]) if (!orders.has(x)) orders.set(x, { kind: 'eliminator', title: r.title, short: r.short, dueWeeks: Math.max(0, weeksBetween(state.today, rec.elim.due)) })
  }
  const ranked = new Map<Id, NonNullable<TitleStanding['ranked']>>()
  for (const org of SANCTIONING) {
    const limit = TITLE_DEF_BY_ID[org.id]?.challengerLimit ?? 0
    for (const wc of Object.keys(media.rankings[org.id] ?? {}) as WeightClassId[]) {
      for (const e of getList(media, org.id, wc)?.e ?? []) {
        if (e.r < 1) continue
        const cur = ranked.get(e.f)
        const l = lvl(levelOf(org.id)), cl = cur ? lvl(levelOf(cur.body)) : -2
        // Prefer the higher level of ranking, then the better position.
        if (!cur || l > cl || (l === cl && e.r < cur.rank)) ranked.set(e.f, { body: org.id, short: bodyIdentity(org.id).shortName, rank: e.r, inRange: e.r <= limit, division: weightClassLabel(wc) })
      }
    }
  }
  const former = new Map<Id, TitleStanding['former']>()
  for (const r of getReigns(media)) {
    if (r.to === null) continue
    const l = former.get(r.f) ?? []
    l.unshift({ title: titleName(r.b, r.wc), short: bodyIdentity(r.b).shortName, level: levelOf(r.b), defences: r.defences })
    former.set(r.f, l)
  }
  return (id: Id): TitleStanding => {
    const belts = (held.get(id) ?? []).slice().sort((a, b) => lvl(b.level) - lvl(a.level))
    const rk = ranked.get(id) ?? null
    const ord = orders.get(id) ?? null
    const fm = former.get(id) ?? []
    const base = { held: belts, ranked: rk, former: fm, order: ord }
    if (belts.length > 0) {
      const top = belts[0]
      const label = currentTitleLabel(state, id) ?? `${LEVEL_LABEL[top.level]} champion`
      return { ...base, role: 'champion', label, level: top.level, note: belts.map((b) => b.title).join(' · ') }
    }
    if (ord?.kind === 'mandatory') return { ...base, role: 'mandatory', label: 'Mandatory challenger', level: rk ? levelOf(rk.body) : null, note: `Next in line for the ${ord.title}${ord.dueWeeks > 0 ? ` — due within ${ord.dueWeeks} week${ord.dueWeeks === 1 ? '' : 's'}` : ''}` }
    if (ord?.kind === 'eliminator') return { ...base, role: 'eliminator', label: 'Eliminator', level: rk ? levelOf(rk.body) : null, note: `Ordered into an eliminator for the ${ord.title}` }
    if (rk) return { ...base, role: 'contender', label: `Ranked #${rk.rank} ${rk.short}`, level: levelOf(rk.body), note: `Ranked #${rk.rank} by ${rk.short} at ${rk.division}${rk.inRange ? ' — inside the title challenge range' : ' — outside the title challenge range'}` }
    if (fm.length > 0) return { ...base, role: 'former', label: `Former ${fm[0].short} champion`, level: fm[0].level, note: `Former ${fm[0].title} holder${fm[0].defences > 0 ? ` (${fm[0].defences} defence${fm[0].defences === 1 ? '' : 's'})` : ''}` }
    return { ...base, ...empty() }
  }
}

export const titleStanding = (state: GameState, id: Id): TitleStanding => standingIndex(state)(id)

// ------------------------------------------------------------------------------------------------ the bout itself

export interface BoutTitleView {
  /** Would the scheduler flag this pairing as a title bout (or an ordered eliminator) if it were booked now? */
  couldContest: boolean
  kind: 'title' | 'unification' | 'eliminator' | null
  /** True when the belt has no champion and the bout would fill the vacancy. */
  vacant: boolean
  /** True when one of the two is the mandatory challenger for a belt that is on the line. */
  mandatory: boolean
  /** "WBC World Light-welterweight Championship" (what is at stake), or null. */
  name: string | null
  /** Highest level on the line, for the tier label. */
  level: TitleLevel | null
  tier: string | null
  belts: BeltRef[]
  division: string
  /** Why a pairing that involves a champion or two ranked fighters is NOT for a belt (null when nothing needs saying). */
  reason: string | null
}

const none = (wc: WeightClassId, reason: string | null = null): BoutTitleView => ({ couldContest: false, kind: null, vacant: false, mandatory: false, name: null, level: null, tier: null, belts: [], division: weightClassLabel(wc), reason })

/**
 * Could a bout between these two be for a title? The division is the bigger man's, exactly as `createFight` sets it. Uses the
 * scheduler's own rule (`bodiesFor`), so this can only ever say what the rules would then flag.
 */
export function boutTitleView(state: GameState, aId: Id, bId: Id): BoutTitleView {
  const media = state.media
  const a = state.fighters[aId], b = state.fighters[bId]
  if (!media || !a || !b) return none(a?.weightClass ?? b?.weightClass ?? WEIGHT_CLASSES[0].id)
  const wc = sizeEdge(a.weightClass, b.weightClass) >= 0 ? a.weightClass : b.weightClass
  const holds = (id: Id) => titlesHeldBy(media, id).some((t) => t.wc === wc)
  const aHolds = holds(aId), bHolds = holds(bId)
  const listed = (id: Id) => SANCTIONING.some((o) => (getList(media, o.id, wc)?.e ?? []).some((e) => e.f === id && e.r >= 1))
  const bodies = aHolds || bHolds || (listed(aId) && listed(bId)) ? bodiesFor(state, aId, bId, wc) : []
  if (bodies.length > 0) {
    const worlds = bodies.filter((x) => levelOf(x) === 'world')
    const champs = new Set(worlds.map((x) => media.titles[`${x}|${wc}`]?.c).filter((x): x is Id => !!x))
    const kind = champs.size >= 2 ? 'unification' as const : 'title' as const
    const meta = fightTitleMeta(bodies, wc, kind)
    const vacant = bodies.every((x) => !media.titles[`${x}|${wc}`]?.c)
    const mandatory = bodies.some((x) => { const m = media.titles[`${x}|${wc}`]?.mand; return !!m && (m.challenger === aId || m.challenger === bId) })
    const level = meta.level as TitleLevel
    return { couldContest: true, kind, vacant, mandatory, name: meta.name, level, tier: LEVEL_LABEL[level], belts: bodies.map((x) => ref(x, wc)), division: weightClassLabel(wc), reason: null }
  }
  // An ordered eliminator between exactly these two (the scheduler flags it the same way).
  for (const [k, rec] of Object.entries(media.titles)) {
    const e = rec.elim
    if (!e || e.fightId) continue
    const [body, w] = k.split('|')
    if (w !== wc || !((e.a === aId && e.b === bId) || (e.a === bId && e.b === aId))) continue
    const meta = fightTitleMeta([body], wc, 'eliminator')
    const level = meta.level as TitleLevel
    return { couldContest: true, kind: 'eliminator', vacant: false, mandatory: false, name: meta.name, level, tier: LEVEL_LABEL[level], belts: [ref(body, wc)], division: weightClassLabel(wc), reason: null }
  }
  // Not for a title. Say why only when a champion is involved (the question a promoter actually has), using the same facts the rule reads.
  for (const [champ, other] of [[aId, bId], [bId, aId]] as const) {
    for (const t of titlesHeldBy(media, champ)) {
      if (t.wc !== wc) continue
      const org = SANCTIONING.find((o) => o.id === t.body)
      if (!org) continue
      const rk = (getList(media, t.body, wc)?.e ?? []).find((e) => e.f === other)?.r ?? null
      const who = fighterName(state.fighters[other]), champName = fighterName(state.fighters[champ]), short = bodyIdentity(t.body).shortName
      if (rk === null || rk < 1) return none(wc, `${champName} holds the ${short} belt, but ${who} is not ranked by ${short}.`)
      if (rk > org.challengerLimit) return none(wc, `${champName} holds the ${short} belt, but ${who} is ranked #${rk} — only the top ${org.challengerLimit} can challenge.`)
      if (!qualifiesFor(state, t.body, other)) return none(wc, `${champName} holds the ${short} belt, but ${who} has not yet met the standard of a credible challenger.`)
      if (holdsWorldBelt(media, champ, wc) && levelOf(t.body) !== 'world') continue
      return none(wc, `${champName} holds the ${short} belt, but this pairing does not put it on the line.`)
    }
  }
  return none(wc)
}
