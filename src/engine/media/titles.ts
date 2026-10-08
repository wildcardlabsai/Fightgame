/**
 * TITLES. Thirteen bodies — four world titles, European, British, Commonwealth and six area titles — each recognise one champion
 * per division where there are enough eligible fighters for the belt to be contested at all. A fight is a title fight only when the
 * body's own rules make it one (the champion v a ranked, eligible challenger, or the top contenders for a vacant belt); an eliminator
 * is a fight the body has ordered between two contenders, and its winner becomes the mandatory challenger. Defences, changes,
 * vacancies, mandatory orders, extensions and strippings are all consequences of real fights and real dates, each with a stated reason.
 *
 * Every number that drives a body (territory, how many contenders it lists, how long a champion may wait) lives in
 * business/titleDefs.ts as DATA. These are GAME ABSTRACTIONS, not the rulebook of any real organisation.
 *
 * Not modelled (deliberately): sanctioning fees, purse bids, interim belts.
 */
import { weightClassLabel, WEIGHT_CLASSES } from '../../data/weightClasses'
import { bodyIdentity } from '../../data/mediaIdentity'
import { DAYS_PER_WEEK } from '../calendar'
import { fighterName } from '../fighters'
import { keyedFloat, keyedRng } from '../rng'
import type { Day, Fight, FightTitle, GameState, Id, WeightClassId } from '../types'
import { TITLE_DEF_BY_ID, LEVEL_ORDER, levelOf, levelRank, type TitleDef, type TitleLevel } from '../business/titleDefs'
import { noteDefence, noteTitleWon, noteUnified } from '../business/titleHistory'
import { SANCTIONING } from './orgs'
import { rankIn } from './rankings'
import type { MediaState, Reign, TitleRec } from './types'
import { getList, pushReign } from './records'
import { weekIndex } from './util'

const LIVE = new Set(['agreed', 'scheduled', 'training', 'fightNight'])
export const titleKey = (body: string, wc: WeightClassId) => `${body}|${wc}`
const WEEKS = (n: number) => n * DAYS_PER_WEEK
/** Kept as exports for older callers and tests: the world-level defaults (each body carries its own in titleDefs). */
export const MANDATORY_AFTER_WEEKS = 40
export const MANDATORY_WINDOW_WEEKS = 26
export const INACTIVE_STRIP_WEEKS = 78
/** For a vacant belt: how far down a body's list the two contenders may be (its challenger limit plus one). */
const vacantLimit = (body: string): number => (def(body)?.challengerLimit ?? 5) + 1
/** An eliminator is rare: one per body per season at most, and only a few across the whole sport at once. */
const ELIM_GAP_WEEKS = 78
const ELIM_MAX_OPEN = 5
const ELIM_WINDOW_WEEKS = 26
const ELIM_GATE = 0.2

export type TitleEventKind =
  | 'TITLE_CHANGE' | 'TITLE_DEFENCE' | 'TITLE_FILLED' | 'TITLE_VACANT' | 'STRIPPED' | 'MANDATORY' | 'MANDATORY_WARNING' | 'MANDATORY_EXTENDED'
  | 'TITLE_FIGHT_SET' | 'ELIM_ORDERED' | 'ELIM_RESULT' | 'ELIM_LAPSED' | 'TITLE_OPEN' | 'UNIFIED' | 'UNDISPUTED'
export interface TitleEvent { kind: TitleEventKind; body: string; wc: WeightClassId; f?: Id; o?: Id; fightId?: Id; defences?: number; how?: string }

const def = (body: string): TitleDef => TITLE_DEF_BY_ID[body]

export function championOf(media: MediaState, body: string, wc: WeightClassId): Id | null { return media.titles[titleKey(body, wc)]?.c ?? null }

/**
 * Who holds what, indexed once per change of hands (the index is dropped by `touchTitles` wherever a champion changes, so the
 * hot paths — matchmaking, valuation, contracts — never rescan every belt).
 */
const HOLDERS = new WeakMap<object, Map<Id, string[]>>()
export function touchTitles(media: MediaState): void { HOLDERS.delete(media.titles) }
function holderIndex(media: MediaState): Map<Id, string[]> {
  let ix = HOLDERS.get(media.titles)
  if (!ix) {
    ix = new Map()
    for (const k in media.titles) { const c = media.titles[k].c; if (c) { const l = ix.get(c); if (l) l.push(k); else ix.set(c, [k]) } }
    HOLDERS.set(media.titles, ix)
  }
  return ix
}

/** Titles a fighter currently holds. */
export function titlesHeldBy(media: MediaState, id: Id): { body: string; wc: WeightClassId; rec: TitleRec }[] {
  const out: { body: string; wc: WeightClassId; rec: TitleRec }[] = []
  const keys = holderIndex(media).get(id)
  if (!keys) return out
  for (const k of keys) { const rec = media.titles[k]; if (rec?.c === id) { const [body, wc] = k.split('|'); out.push({ body, wc: wc as WeightClassId, rec }) } }
  return out
}

export const titleName = (body: string, wc: WeightClassId): string => `${bodyIdentity(body).titleName} ${weightClassLabel(wc)} Championship`

const TIER_OF: Record<TitleLevel, FightTitle['tier']> = { area: 'regional', domestic: 'national', european: 'international', world: 'world' }

/** The presentation record for a flagged fight: name, tier, level and what is at stake. */
export function fightTitleMeta(bodies: string[], wc: WeightClassId, kind: 'title' | 'eliminator' | 'unification'): FightTitle {
  const byLevel = bodies.slice().sort((a, b) => levelRank(levelOf(b)) - levelRank(levelOf(a)))
  const level = levelOf(byLevel[0])
  const label = weightClassLabel(wc)
  let name: string
  if (kind === 'unification') name = `${byLevel.filter((b) => levelOf(b) === 'world').map((b) => bodyIdentity(b).titleName).join(' / ')} ${label} Unification`
  else if (kind === 'eliminator') name = `${bodyIdentity(byLevel[0]).titleName} ${label} Eliminator`
  else if (byLevel.length === 1) name = titleName(byLevel[0], wc)
  else name = `${byLevel.map((b) => bodyIdentity(b).titleName).join(' / ')} ${label} Championship`
  return { name, tier: TIER_OF[level], level, kind, bodies: byLevel }
}

function closeReign(media: MediaState, body: string, wc: WeightClassId, rec: TitleRec, to: Day, how: string): void {
  if (!rec.c) return
  const r: Reign = { b: body, wc, f: rec.c, fn: rec.cn ?? 'Unknown', from: rec.since, to, defences: rec.defences, how }
  pushReign(media, r)
}

function vacate(state: GameState, media: MediaState, body: string, wc: WeightClassId, rec: TitleRec, how: string, ev: TitleEvent[], kind: 'TITLE_VACANT' | 'STRIPPED'): void {
  const old = rec.c
  const endDay = Math.max(state.today, rec.since)
  closeReign(media, body, wc, rec, endDay, how)
  ev.push({ kind, body, wc, f: old ?? undefined, how, defences: rec.defences })
  touchTitles(media)
  rec.c = null; rec.cn = undefined; rec.vacantSince = endDay; rec.defences = 0; rec.mand = undefined; rec.elim = undefined
}

/** A champion leaves the belt for a reason the game can state (retirement, a move of division, …). */
export function vacateTitle(state: GameState, media: MediaState, body: string, wc: WeightClassId, how: string): TitleEvent[] {
  const rec = media.titles[titleKey(body, wc)]
  const ev: TitleEvent[] = []
  if (rec?.c) vacate(state, media, body, wc, rec, how, ev, 'TITLE_VACANT')
  return ev
}

/**
 * Install inaugural champions from the first rankings (a reign is dated before the game began, so nothing is invented about it).
 * One fighter never starts as the champion of two world bodies in a division: the sport begins with a fragmented world title picture.
 */
export function installChampions(state: GameState, media: MediaState): void {
  for (const wc of WEIGHT_CLASSES.map((w) => w.id)) {
    const heldWorld = new Set<Id>()
    for (const org of SANCTIONING) {
      const d = def(org.id)
      const entries = (getList(media, org.id, wc)?.e ?? []).filter((e) => e.r >= 1)
      if (entries.length < (d?.minPool ?? 5)) continue
      const top = entries.find((e) => !(d?.level === 'world' && heldWorld.has(e.f)))
      if (!top) continue
      if (d?.level === 'world') heldWorld.add(top.f)
      const f = state.fighters[top.f]
      const rng = keyedRng(state.seed, 'init-title', org.id, wc)
      touchTitles(media)
      media.titles[titleKey(org.id, wc)] = { c: top.f, cn: fighterName(f), since: state.today - WEEKS(rng.int(20, 90)), defences: rng.int(0, 2), lastFight: state.today - WEEKS(rng.int(4, 26)) }
    }
  }
}

/**
 * Weekly: a belt becomes contestable when its division has enough eligible, rated fighters (it opens vacant and is filled by a
 * fight), and a vacant belt nobody can contest for a year goes dormant again. Nothing is crowned without a fight.
 */
export function activateTitles(state: GameState, media: MediaState): TitleEvent[] {
  const ev: TitleEvent[] = []
  for (const org of SANCTIONING) {
    const d = def(org.id)
    if (!d) continue
    for (const w of WEIGHT_CLASSES) {
      const k = titleKey(org.id, w.id)
      const rec = media.titles[k]
      const depth = (getList(media, org.id, w.id)?.e ?? []).filter((e) => e.r >= 1).length
      if (!rec && depth >= d.minPool) {
        media.titles[k] = { c: null, since: state.today, defences: 0, lastFight: state.today, vacantSince: state.today }
        ev.push({ kind: 'TITLE_OPEN', body: org.id, wc: w.id })
      } else if (rec && !rec.c && !rec.elim && depth < d.minPool && rec.vacantSince !== undefined && state.today - rec.vacantSince > WEEKS(52)) {
        delete media.titles[k]
      }
    }
  }
  return ev
}

const isLiveFight = (f: Fight | undefined, a: Id, b: Id) =>
  !!f && !f.result && ['agreed', 'scheduled', 'training', 'fightNight'].includes(f.status) && [f.sideA.fighterId, f.sideB.fighterId].includes(a) && [f.sideA.fighterId, f.sideB.fighterId].includes(b)

const free = (state: GameState, id: Id): boolean => {
  const f = state.fighters[id]
  return !!f && f.status === 'active' && !f.activeFightId && !f.injury && (f.suspendedUntil ?? 0) <= state.today
}

function openEliminators(media: MediaState): number {
  let n = 0
  for (const r of Object.values(media.titles)) if (r.elim) n++
  return n
}

/** Weekly: retired or idle champions lose the belt; bodies order eliminators and mandatory defences and strip those who refuse. */
export function maintainTitles(state: GameState, media: MediaState): TitleEvent[] {
  const ev: TitleEvent[] = []
  const week = weekIndex(state)
  let elimOpen = openEliminators(media)
  for (const [k, rec] of Object.entries(media.titles)) {
    const [body, wcRaw] = k.split('|')
    const d = def(body)
    if (!d) continue
    const wc = wcRaw as WeightClassId
    // An open eliminator that has run out of road, or lost a fighter, lapses without a result.
    if (rec.elim) {
      const a = state.fighters[rec.elim.a], b = state.fighters[rec.elim.b]
      const live = Object.values(state.fights).some((x) => isLiveFight(x, rec.elim!.a, rec.elim!.b))
      if (!a || !b || a.status === 'retired' || b.status === 'retired' || (!live && state.today >= rec.elim.due)) {
        ev.push({ kind: 'ELIM_LAPSED', body, wc, f: rec.elim.a, o: rec.elim.b, how: !a || !b || a.status === 'retired' || b.status === 'retired' ? 'one of the contenders retired' : 'no fight was made in time' })
        rec.elim = undefined; rec.lastElim = state.today; elimOpen--
      }
    }
    if (!rec.c) continue
    const f = state.fighters[rec.c]
    if (!f || f.status === 'retired') { vacate(state, media, body, wc, rec, 'retired as champion', ev, 'TITLE_VACANT'); continue }
    const idle = state.today - Math.max(rec.lastFight, rec.since)
    if (idle > WEEKS(d.inactiveStripWeeks) && !f.activeFightId) { vacate(state, media, body, wc, rec, 'inactivity', ev, 'STRIPPED'); continue }
    // A champion holding three or more world belts cannot defend them all: from time to time one is relinquished (the one with a
    // mandatory order pending first, otherwise the lowest-ranked body's), which keeps the world titles from collapsing into one fighter.
    // A new champion is given eight weeks before any belt is given up, so a belt just won is never handed straight back.
    if (d.level === 'world' && state.today - rec.since >= WEEKS(8) && worldBeltsOf(media, rec.c, wc) >= 3 && keyedFloat(state.seed, 'relinquish', rec.c, wc, Math.floor(week / 13)) < 0.35) {
      const held = titlesHeldBy(media, rec.c).filter((t) => t.wc === wc && levelOf(t.body) === 'world')
      const pending = held.find((t) => t.rec.mand)
      const pick = pending ?? held.slice().sort((a, b) => (SANCTIONING.find((o) => o.id === a.body)?.authority ?? 0) - (SANCTIONING.find((o) => o.id === b.body)?.authority ?? 0))[0]
      if (pick.body === body) { vacate(state, media, body, wc, rec, 'relinquished to concentrate on the other titles', ev, 'TITLE_VACANT'); continue }
    }
    if (rec.mand) {
      const ch = state.fighters[rec.mand.challenger]
      if (!ch || ch.status === 'retired') { rec.mand = undefined; continue }
      const scheduled = Object.entries(media.titleFights).some(([fid, bodies]) => bodies.includes(body) && isLiveFight(state.fights[fid], rec.c!, rec.mand!.challenger))
      if (scheduled) continue
      if (state.today >= rec.mand.due) {
        // A valid reason (injury to either man) earns ONE extension; anything else is a refused mandatory.
        const excuse = f.injury ? `${fighterName(f)} is injured` : ch.injury ? `${fighterName(ch)} is injured` : f.activeFightId ? `${fighterName(f)} is already booked to fight` : ch.activeFightId ? `${fighterName(ch)} is already booked to fight` : null
        if (excuse && !rec.mand.ext) { rec.mand.ext = true; rec.mand.due += WEEKS(8); ev.push({ kind: 'MANDATORY_EXTENDED', body, wc, f: rec.c, o: rec.mand.challenger, how: excuse }); continue }
        vacate(state, media, body, wc, rec, 'refusing a mandatory defence', ev, 'STRIPPED'); continue
      }
      if (state.today >= rec.mand.due - WEEKS(8) && state.today < rec.mand.due - WEEKS(6)) ev.push({ kind: 'MANDATORY_WARNING', body, wc, f: rec.c, o: rec.mand.challenger })
      continue
    }
    const list = getList(media, body, wc)
    if (!rec.elim && idle >= WEEKS(d.mandatoryAfterWeeks)) {
      const top = list?.e.find((e) => e.r === 1)
      if (top && top.f !== rec.c) {
        rec.mand = { challenger: top.f, cn: fighterName(state.fighters[top.f]), ordered: state.today, due: state.today + WEEKS(d.mandatoryWindowWeeks) }
        ev.push({ kind: 'MANDATORY', body, wc, f: rec.c, o: top.f })
      }
      continue
    }
    // An eliminator: two real contenders, both free and unbooked, ordered rarely and only where the list has depth.
    if (!rec.elim && elimOpen < ELIM_MAX_OPEN && idle >= WEEKS(14) && state.today - (rec.lastElim ?? -1e9) >= WEEKS(ELIM_GAP_WEEKS) && list && list.e.filter((e) => e.r >= 1).length >= Math.max(5, d.minPool)) {
      if (keyedFloat(state.seed, 'elim', k, week) < ELIM_GATE) {
        const pool = list.e.filter((e) => e.r >= 1 && e.r <= Math.min(5, d.challengerLimit) && e.f !== rec.c && free(state, e.f))
        const x = pool[0], y = pool[1]
        if (x && y && state.fighters[x.f].weightClass === wc) {
          rec.elim = { a: x.f, b: y.f, ordered: state.today, due: state.today + WEEKS(ELIM_WINDOW_WEEKS) }
          elimOpen++
          ev.push({ kind: 'ELIM_ORDERED', body, wc, f: x.f, o: y.f })
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
    if (!rec) continue
    const rA = rankIn(media, org.id, wc, aId), rB = rankIn(media, org.id, wc, bId)
    if (rec.c) {
      if (rec.c === aId && rB !== null && rB >= 1 && rB <= org.challengerLimit) out.push(org.id)
      else if (rec.c === bId && rA !== null && rA >= 1 && rA <= org.challengerLimit) out.push(org.id)
    } else if (rA !== null && rB !== null && rA >= 1 && rB >= 1 && rA <= vacantLimit(org.id) && rB <= vacantLimit(org.id)) {
      // A vacant WORLD belt is contested by contenders, not by another body's champion (that is the unification route).
      if (levelOf(org.id) === 'world' && (holdsWorldBelt(media, aId, wc) || holdsWorldBelt(media, bId, wc))) continue
      out.push(org.id)
    }
  }
  return out
}

export function holdsWorldBelt(media: MediaState, id: Id, wc: WeightClassId): boolean {
  for (const t of titlesHeldBy(media, id)) if (t.wc === wc && levelOf(t.body) === 'world') return true
  return false
}

/** Mark upcoming fights that qualify. Idempotent. Returns one event per newly flagged fight. */
export function flagTitleFights(state: GameState, media: MediaState): TitleEvent[] {
  const ev: TitleEvent[] = []
  const elimFights = (media.elimFights ??= {})
  // Only fighters who appear in some body's list can be in a title fight: build that set once.
  const open = Object.values(state.fights).filter((f) => !f.result && !media.titleFights[f.id] && !elimFights[f.id] && LIVE.has(f.status))
  if (open.length === 0) return ev
  const listed = new Set<Id>()
  for (const org of SANCTIONING) for (const wc of Object.keys(media.rankings[org.id] ?? {})) for (const e of getList(media, org.id, wc as WeightClassId)?.e ?? []) listed.add(e.f)
  for (const fight of open) {
    if (!listed.has(fight.sideA.fighterId) || !listed.has(fight.sideB.fighterId)) continue
    const a = state.fighters[fight.sideA.fighterId], b = state.fighters[fight.sideB.fighterId]
    if (!a || !b) continue
    const bodies = bodiesFor(media, a.id, b.id, fight.weightClass)
    if (bodies.length > 0) {
      media.titleFights[fight.id] = bodies
      const worlds = bodies.filter((x) => levelOf(x) === 'world')
      const champs = new Set(worlds.map((x) => media.titles[titleKey(x, fight.weightClass)]?.c).filter((x): x is Id => !!x))
      const kind = champs.size >= 2 ? 'unification' : 'title'
      fight.title = fightTitleMeta(bodies, fight.weightClass, kind)
      ev.push({ kind: 'TITLE_FIGHT_SET', body: fight.title.bodies![0], wc: fight.weightClass, f: a.id, o: b.id, fightId: fight.id })
      continue
    }
    // An ordered eliminator between exactly these two contenders.
    for (const [k, rec] of Object.entries(media.titles)) {
      const e = rec.elim
      if (!e || e.fightId) continue
      const [body, wc] = k.split('|')
      if (wc !== fight.weightClass || !((e.a === a.id && e.b === b.id) || (e.a === b.id && e.b === a.id))) continue
      e.fightId = fight.id
      elimFights[fight.id] = k
      fight.title = fightTitleMeta([body], fight.weightClass, 'eliminator')
      ev.push({ kind: 'TITLE_FIGHT_SET', body, wc: fight.weightClass, f: a.id, o: b.id, fightId: fight.id })
      break
    }
  }
  return ev
}

const worldBeltsOf = (media: MediaState, id: Id, wc: WeightClassId): number =>
  Object.entries(media.titles).filter(([k, r]) => r.c === id && k.endsWith(`|${wc}`) && levelOf(k.split('|')[0]) === 'world').length
const worldBodiesActive = (media: MediaState, wc: WeightClassId): number =>
  Object.keys(media.titles).filter((k) => k.endsWith(`|${wc}`) && levelOf(k.split('|')[0]) === 'world').length

/** A flagged fight has a result: defences, changes, filled vacancies, eliminator winners, unification. */
export function settleTitleFight(state: GameState, media: MediaState, fight: Fight): TitleEvent[] {
  const ev: TitleEvent[] = []
  const r = fight.result
  const A = fight.sideA.fighterId, B = fight.sideB.fighterId
  const W = !r || r.winner === null ? null : r.winner === 0 ? A : B
  // Eliminators: the winner becomes the mandatory challenger.
  const ek = media.elimFights?.[fight.id]
  if (ek && r) {
    delete media.elimFights![fight.id]
    const rec = media.titles[ek]
    const [body, wc] = ek.split('|')
    if (rec?.elim) {
      if (W) {
        const loser = W === A ? B : A
        rec.elim = undefined; rec.lastElim = state.today
        if (rec.c && !rec.mand) rec.mand = { challenger: W, cn: fighterName(state.fighters[W]), ordered: state.today, due: state.today + WEEKS(def(body)?.mandatoryWindowWeeks ?? 26) }
        ev.push({ kind: 'ELIM_RESULT', body, wc: wc as WeightClassId, f: W, o: loser, fightId: fight.id })
      } else {
        // A draw settles nothing: the order stands, with a fresh window, once.
        rec.elim.fightId = undefined; rec.elim.due = state.today + WEEKS(ELIM_WINDOW_WEEKS)
      }
    }
  }
  const bodies = media.titleFights[fight.id]
  if (!bodies) return ev
  delete media.titleFights[fight.id]
  if (!r) return ev
  for (const body of bodies) {
    const k = titleKey(body, fight.weightClass)
    const rec = media.titles[k]
    if (!rec) continue
    const level = levelOf(body)
    if (rec.c && (rec.c === A || rec.c === B)) {
      const challenger = rec.c === A ? B : A
      if (W === null || W === rec.c) {
        rec.defences++; rec.lastFight = fight.day; if (rec.mand?.challenger === challenger) rec.mand = undefined
        noteDefence(state, rec.c)
        ev.push({ kind: 'TITLE_DEFENCE', body, wc: fight.weightClass, f: rec.c, o: challenger, fightId: fight.id, defences: rec.defences })
      } else {
        const old = rec.c
        const endDay = Math.max(fight.day, rec.since)
        closeReign(media, body, fight.weightClass, rec, endDay, `lost to ${fighterName(state.fighters[W])}`)
        touchTitles(media)
        rec.c = W; rec.cn = fighterName(state.fighters[W]); rec.since = endDay; rec.defences = 0; rec.lastFight = fight.day; rec.mand = undefined; rec.vacantSince = undefined; rec.elim = undefined
        noteTitleWon(state, W, level)
        ev.push({ kind: 'TITLE_CHANGE', body, wc: fight.weightClass, f: W, o: old, fightId: fight.id })
      }
    } else if (!rec.c && W) {
      touchTitles(media)
      rec.c = W; rec.cn = fighterName(state.fighters[W]); rec.since = Math.max(fight.day, rec.vacantSince ?? fight.day); rec.defences = 0; rec.lastFight = fight.day; rec.vacantSince = undefined
      noteTitleWon(state, W, level)
      ev.push({ kind: 'TITLE_FILLED', body, wc: fight.weightClass, f: W, o: W === A ? B : A, fightId: fight.id })
    }
  }
  // Unified and undisputed status follow from the belts now held in the division.
  if (W) {
    const wc = fight.weightClass
    const belts = worldBeltsOf(media, W, wc)
    if (belts >= 2 && (state.business?.titleHist[W]?.unifiedDay ?? null) === null) {
      const undisputed = belts >= worldBodiesActive(media, wc) && worldBodiesActive(media, wc) >= 2
      noteUnified(state, W, fight.day, undisputed)
      ev.push({ kind: undisputed ? 'UNDISPUTED' : 'UNIFIED', body: bodies.find((b) => levelOf(b) === 'world') ?? bodies[0], wc, f: W, fightId: fight.id })
    } else if (belts >= 2) {
      const undisputed = belts >= worldBodiesActive(media, wc) && worldBodiesActive(media, wc) >= 2
      if (undisputed && (state.business?.titleHist[W]?.undisputedDay ?? null) === null) {
        noteUnified(state, W, fight.day, true)
        ev.push({ kind: 'UNDISPUTED', body: bodies.find((b) => levelOf(b) === 'world') ?? bodies[0], wc, f: W, fightId: fight.id })
      }
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
    if (rec.elim && ((rec.elim.a === x && rec.elim.b === o) || (rec.elim.a === o && rec.elim.b === x))) { best = Math.max(best, 24); continue }
    const rX = rankIn(media, org.id, wc, x)
    if (rX === null) continue
    const rO = rankIn(media, org.id, wc, o)
    if (rO === null) continue
    if (rec.c) {
      if ((rec.c === x && rO >= 1 && rO <= org.challengerLimit) || (rec.c === o && rX >= 1 && rX <= org.challengerLimit)) {
        const mand = rec.mand && (rec.mand.challenger === x || rec.mand.challenger === o)
        // Two champions of different world bodies meeting is a unification: it is made by intent (see unificationPartner), not by drift.
        const other = rec.c === x ? o : x
        if (!mand && levelOf(org.id) === 'world' && holdsWorldBelt(media, other, wc)) { best = Math.max(best, 6); continue }
        best = Math.max(best, mand ? 32 : 20)
      } else if (rX >= 1 && rO >= 1 && rX <= 6 && rO <= 6) best = Math.max(best, 3)
    } else if (rX >= 1 && rO >= 1 && rX <= vacantLimit(org.id) && rO <= vacantLimit(org.id)) best = Math.max(best, 26)
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

export { LEVEL_ORDER }
