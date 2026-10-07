/**
 * SANCTIONING BODIES AND TITLES. Three fictional bodies each recognise one champion per division. A fight is a title fight only
 * when the body's own rules make it one (champion v a ranked challenger, or the top contenders for a vacant belt). Defences,
 * changes, vacancies, mandatory orders and strippings are all consequences of real fights and real dates.
 *
 * Not modelled (deliberately): sanctioning fees, purse bids, interim belts, unification mandates, eliminators.
 */
import { weightClassLabel } from '../../data/weightClasses'
import { bodyIdentity } from '../../data/mediaIdentity'
import { DAYS_PER_WEEK } from '../calendar'
import { fighterName } from '../fighters'
import { keyedRng } from '../rng'
import type { Day, Fight, GameState, Id, WeightClassId } from '../types'
import { SANCTIONING } from './orgs'
import { rankIn } from './rankings'
import type { MediaState, Reign, TitleRec } from './types'
import { getList, pushReign } from './records'

const LIVE = new Set(['agreed', 'scheduled', 'training', 'fightNight'])
export const titleKey = (body: string, wc: WeightClassId) => `${body}|${wc}`
const WEEKS = (n: number) => n * DAYS_PER_WEEK
export const MANDATORY_AFTER_WEEKS = 40
export const MANDATORY_WINDOW_WEEKS = 26
export const INACTIVE_STRIP_WEEKS = 78
const VACANT_CONTENDER_LIMIT = 6

export type TitleEventKind = 'TITLE_CHANGE' | 'TITLE_DEFENCE' | 'TITLE_FILLED' | 'TITLE_VACANT' | 'STRIPPED' | 'MANDATORY' | 'MANDATORY_WARNING' | 'TITLE_FIGHT_SET'
export interface TitleEvent { kind: TitleEventKind; body: string; wc: WeightClassId; f?: Id; o?: Id; fightId?: Id; defences?: number; how?: string }

export function championOf(media: MediaState, body: string, wc: WeightClassId): Id | null { return media.titles[titleKey(body, wc)]?.c ?? null }

/** Titles a fighter currently holds. */
export function titlesHeldBy(media: MediaState, id: Id): { body: string; wc: WeightClassId; rec: TitleRec }[] {
  const out: { body: string; wc: WeightClassId; rec: TitleRec }[] = []
  for (const [k, rec] of Object.entries(media.titles)) if (rec.c === id) { const [body, wc] = k.split('|'); out.push({ body, wc: wc as WeightClassId, rec }) }
  return out
}

export const titleName = (body: string, wc: WeightClassId): string => `${bodyIdentity(body).titleName} ${weightClassLabel(wc)} Championship`

function closeReign(media: MediaState, body: string, wc: WeightClassId, rec: TitleRec, to: Day, how: string): void {
  if (!rec.c) return
  const r: Reign = { b: body, wc, f: rec.c, fn: rec.cn ?? 'Unknown', from: rec.since, to, defences: rec.defences, how }
  pushReign(media, r)
}

function vacate(state: GameState, media: MediaState, body: string, wc: WeightClassId, rec: TitleRec, how: string, ev: TitleEvent[], kind: 'TITLE_VACANT' | 'STRIPPED'): void {
  const old = rec.c
  closeReign(media, body, wc, rec, state.today, how)
  ev.push({ kind, body, wc, f: old ?? undefined, how, defences: rec.defences })
  rec.c = null; rec.cn = undefined; rec.vacantSince = state.today; rec.defences = 0; rec.mand = undefined
}

/** Install inaugural champions from the first rankings (a reign is dated before the game began, so nothing is invented about it). */
export function installChampions(state: GameState, media: MediaState): void {
  for (const org of SANCTIONING) {
    for (const wc of Object.keys(media.rankings[org.id] ?? {})) {
      const top = getList(media, org.id, wc as WeightClassId)?.e.find((e) => e.r === 1)
      if (!top) continue
      const f = state.fighters[top.f]
      const rng = keyedRng(state.seed, 'init-title', org.id, wc)
      media.titles[titleKey(org.id, wc as WeightClassId)] = { c: top.f, cn: fighterName(f), since: state.today - WEEKS(rng.int(20, 90)), defences: rng.int(0, 2), lastFight: state.today - WEEKS(rng.int(4, 26)) }
    }
  }
}

const isLiveFight = (f: Fight | undefined, a: Id, b: Id) =>
  !!f && !f.result && ['agreed', 'scheduled', 'training', 'fightNight'].includes(f.status) && [f.sideA.fighterId, f.sideB.fighterId].includes(a) && [f.sideA.fighterId, f.sideB.fighterId].includes(b)

/** Weekly: retired or idle champions lose the belt; bodies order mandatory defences and strip those who refuse. */
export function maintainTitles(state: GameState, media: MediaState): TitleEvent[] {
  const ev: TitleEvent[] = []
  for (const org of SANCTIONING) {
    for (const [k, rec] of Object.entries(media.titles)) {
      if (!k.startsWith(org.id + '|')) continue
      const wc = k.split('|')[1] as WeightClassId
      if (!rec.c) continue
      const f = state.fighters[rec.c]
      if (!f || f.status === 'retired') { vacate(state, media, org.id, wc, rec, 'retired as champion', ev, 'TITLE_VACANT'); continue }
      const idle = state.today - Math.max(rec.lastFight, rec.since)
      if (idle > WEEKS(INACTIVE_STRIP_WEEKS) && !f.activeFightId) { vacate(state, media, org.id, wc, rec, 'inactivity', ev, 'STRIPPED'); continue }
      if (rec.mand) {
        const ch = state.fighters[rec.mand.challenger]
        if (!ch || ch.status === 'retired') { rec.mand = undefined; continue }
        const scheduled = Object.entries(media.titleFights).some(([fid, bodies]) => bodies.includes(org.id) && isLiveFight(state.fights[fid], rec.c!, rec.mand!.challenger))
        if (scheduled) continue
        if (state.today >= rec.mand.due) { vacate(state, media, org.id, wc, rec, 'refusing a mandatory defence', ev, 'STRIPPED'); continue }
        if (state.today >= rec.mand.due - WEEKS(8) && state.today < rec.mand.due - WEEKS(6)) ev.push({ kind: 'MANDATORY_WARNING', body: org.id, wc, f: rec.c, o: rec.mand.challenger })
      } else if (idle >= WEEKS(MANDATORY_AFTER_WEEKS)) {
        const list = getList(media, org.id, wc)
        const top = list?.e.find((e) => e.r === 1)
        if (top && top.f !== rec.c) {
          rec.mand = { challenger: top.f, cn: fighterName(state.fighters[top.f]), ordered: state.today, due: state.today + WEEKS(MANDATORY_WINDOW_WEEKS) }
          ev.push({ kind: 'MANDATORY', body: org.id, wc, f: rec.c, o: top.f })
        }
      }
    }
  }
  return ev
}

/** Which bodies recognise this pairing as a title fight right now? */
export function bodiesFor(media: MediaState, aId: Id, bId: Id, wc: WeightClassId): string[] {
  const out: string[] = []
  for (const org of SANCTIONING) {
    const rec = media.titles[titleKey(org.id, wc)]
    const rA = rankIn(media, org.id, wc, aId), rB = rankIn(media, org.id, wc, bId)
    if (rec?.c) {
      if (rec.c === aId && rB !== null && rB >= 1 && rB <= org.challengerLimit) out.push(org.id)
      else if (rec.c === bId && rA !== null && rA >= 1 && rA <= org.challengerLimit) out.push(org.id)
    } else if (rec && rA !== null && rB !== null && rA >= 1 && rB >= 1 && rA <= VACANT_CONTENDER_LIMIT && rB <= VACANT_CONTENDER_LIMIT) out.push(org.id)
  }
  return out
}

/** Mark upcoming fights that qualify. Idempotent. Returns one event per newly flagged fight. */
export function flagTitleFights(state: GameState, media: MediaState): TitleEvent[] {
  const ev: TitleEvent[] = []
  // Only fighters who appear in some body's list can be in a title fight: build that set once.
  const open = Object.values(state.fights).filter((f) => !f.result && !media.titleFights[f.id] && LIVE.has(f.status))
  if (open.length === 0) return ev
  const listed = new Set<Id>()
  for (const org of SANCTIONING) for (const wc of Object.keys(media.rankings[org.id] ?? {})) for (const e of getList(media, org.id, wc as WeightClassId)?.e ?? []) listed.add(e.f)
  for (const fight of open) {
    if (!listed.has(fight.sideA.fighterId) || !listed.has(fight.sideB.fighterId)) continue
    const a = state.fighters[fight.sideA.fighterId], b = state.fighters[fight.sideB.fighterId]
    if (!a || !b) continue
    const bodies = bodiesFor(media, a.id, b.id, fight.weightClass)
    if (bodies.length === 0) continue
    media.titleFights[fight.id] = bodies
    const names = bodies.map((id) => bodyIdentity(id).titleName)
    fight.title = bodies.length === 1 ? { name: titleName(bodies[0], fight.weightClass), tier: 'world' } : { name: `${names.join(' / ')} ${weightClassLabel(fight.weightClass)} Unification`, tier: 'world' }
    ev.push({ kind: 'TITLE_FIGHT_SET', body: bodies[0], wc: fight.weightClass, f: a.id, o: b.id, fightId: fight.id })
  }
  return ev
}

/** A flagged fight has a result: defences, changes and filled vacancies. */
export function settleTitleFight(state: GameState, media: MediaState, fight: Fight): TitleEvent[] {
  const bodies = media.titleFights[fight.id]
  if (!bodies) return []
  delete media.titleFights[fight.id]
  const r = fight.result
  if (!r) return []
  const ev: TitleEvent[] = []
  const A = fight.sideA.fighterId, B = fight.sideB.fighterId
  const W = r.winner === null ? null : r.winner === 0 ? A : B
  for (const body of bodies) {
    const k = titleKey(body, fight.weightClass)
    const rec = media.titles[k]
    if (!rec) continue
    if (rec.c && (rec.c === A || rec.c === B)) {
      const challenger = rec.c === A ? B : A
      if (W === null || W === rec.c) {
        rec.defences++; rec.lastFight = fight.day; if (rec.mand?.challenger === challenger) rec.mand = undefined
        ev.push({ kind: 'TITLE_DEFENCE', body, wc: fight.weightClass, f: rec.c, o: challenger, fightId: fight.id, defences: rec.defences })
      } else {
        const old = rec.c
        closeReign(media, body, fight.weightClass, rec, fight.day, `lost to ${fighterName(state.fighters[W])}`)
        rec.c = W; rec.cn = fighterName(state.fighters[W]); rec.since = fight.day; rec.defences = 0; rec.lastFight = fight.day; rec.mand = undefined; rec.vacantSince = undefined
        ev.push({ kind: 'TITLE_CHANGE', body, wc: fight.weightClass, f: W, o: old, fightId: fight.id })
      }
    } else if (!rec.c && W) {
      rec.c = W; rec.cn = fighterName(state.fighters[W]); rec.since = fight.day; rec.defences = 0; rec.lastFight = fight.day; rec.vacantSince = undefined
      ev.push({ kind: 'TITLE_FILLED', body, wc: fight.weightClass, f: W, o: W === A ? B : A, fightId: fight.id })
    }
  }
  return ev
}

/** AI booking nudge: how much a title-relevant pairing is worth to a rival (0 = nothing). Never changes a result. */
export function titleBonus(state: GameState, x: Id, o: Id, wc: WeightClassId): number {
  const media = state.media
  if (!media?.effects) return 0
  let best = 0
  for (const org of SANCTIONING) {
    const rec = media.titles[titleKey(org.id, wc)]
    if (!rec) continue
    const rX = rankIn(media, org.id, wc, x)
    if (rX === null) continue
    const rO = rankIn(media, org.id, wc, o)
    if (rO === null) continue
    if (rec.c) {
      if ((rec.c === x && rO >= 1 && rO <= org.challengerLimit) || (rec.c === o && rX >= 1 && rX <= org.challengerLimit)) {
        const mand = rec.mand && (rec.mand.challenger === x || rec.mand.challenger === o)
        best = Math.max(best, mand ? 32 : 20)
      } else if (rX >= 1 && rO >= 1 && rX <= 6 && rO <= 6) best = Math.max(best, 3)
    } else if (rX >= 1 && rO >= 1 && rX <= VACANT_CONTENDER_LIMIT && rO <= VACANT_CONTENDER_LIMIT) best = Math.max(best, 26)
  }
  return best
}

/** Fighters a booker would want to match with `x` for a title-relevant fight. */
export function titlePartners(state: GameState, x: Id, wc: WeightClassId): Id[] {
  const media = state.media
  if (!media?.effects) return []
  const out = new Set<Id>()
  for (const org of SANCTIONING) {
    const list = getList(media, org.id, wc)
    if (!list || !list.e.some((e) => e.f === x)) continue // an unranked fighter has no title-relevant opponents
    for (const e of list.e) if (e.f !== x && titleBonus(state, x, e.f, wc) >= 20) out.add(e.f)
  }
  return [...out]
}
