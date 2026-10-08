/** Typed access to the packed bulk records (see packed.ts). Reads are shared/read-only. Writes are buffered and flushed once per
 * pipeline run (`flushRecords`), so a busy week costs one decode/encode per record, not one per entry. */
import { edit, unpack } from './packed'
import { LIMITS } from './state'
import type { AwardRec, CareerEntry, DoneNarrative, HistoryRec, MediaState, RankList, Reign } from './types'
import type { Id, WeightClassId } from '../types'

interface Pending { hist: HistoryRec[]; done: DoneNarrative[]; reigns: Reign[]; awards: AwardRec[]; career: Map<Id, CareerEntry[]> }
const pending = new WeakMap<MediaState, Pending>()
const pend = (m: MediaState): Pending => { let p = pending.get(m); if (!p) { p = { hist: [], done: [], reigns: [], awards: [], career: new Map() }; pending.set(m, p) } return p }

/** Write every buffered record into its packed string. Call at the end of a pipeline run. */
export function flushRecords(m: MediaState): void {
  const p = pending.get(m)
  if (!p) return
  pending.delete(m)
  if (p.hist.length) m.history = edit<HistoryRec[]>(m.history, [], (l) => { l.unshift(...p.hist); if (l.length > LIMITS.history) l.length = LIMITS.history })
  if (p.done.length) m.narrativesDone = edit<DoneNarrative[]>(m.narrativesDone, [], (l) => { l.unshift(...p.done); if (l.length > LIMITS.narrativesDone) l.length = LIMITS.narrativesDone })
  if (p.reigns.length) m.reigns = edit<Reign[]>(m.reigns, [], (l) => { l.unshift(...p.reigns); if (l.length > LIMITS.reigns) l.length = LIMITS.reigns })
  if (p.awards.length) m.awards = edit<AwardRec[]>(m.awards, [], (l) => { l.unshift(...p.awards); if (l.length > LIMITS.awards) l.length = LIMITS.awards })
  for (const [id, entries] of p.career) m.career[id] = edit<CareerEntry[]>(m.career[id], [], (list) => { for (const e of entries) addEntry(list, e) })
}

const KEEP: Partial<Record<CareerEntry['k'], number>> = { START: 9, TITLE_WON: 9, NO1: 8, TITLE_LOST: 7, TITLE_DEFENCE: 6, AWARD: 7, RETIRED: 9, UPSET: 5, FIRST_LOSS: 6, TOP5: 5, VIRAL: 4, RANKED: 3, MAIN_EVENT: 2, SIGNED: 3, KO_STREAK: 4, UNBEATEN: 5, COMEBACK: 4, RIVALRY: 4, RELEASED: 2, ELIM_WON: 6, MANDATORY: 5, UNIFIED: 8, UNDISPUTED: 9, VACATED: 5, STRIPPED: 6, DIVISION_MOVE: 5, PROMISE_KEPT: 3, PROMISE_BROKEN: 4 }

const KIND_CAP: Partial<Record<CareerEntry['k'], number>> = { MAIN_EVENT: 3, UPSET: 4, SIGNED: 3, RELEASED: 2, TITLE_LOST: 4, TITLE_WON: 6, ELIM_WON: 3, VACATED: 3, STRIPPED: 2, DIVISION_MOVE: 3, PROMISE_KEPT: 2, PROMISE_BROKEN: 2 }

/** Insert a career entry keeping the line short: duplicates are ignored and the least important lines are dropped first. */
export function addEntry(list: CareerEntry[], e: CareerEntry): void {
  if (list.some((x) => x.k === e.k && x.d === e.d && x.a === e.a && x.n === e.n)) return
  if ((e.k === 'RANKED' || e.k === 'TOP5' || e.k === 'NO1') && list.some((x) => x.k === e.k && x.a === e.a)) return
  // Successive defences of one belt are one milestone line carrying the running count.
  if (e.k === 'TITLE_DEFENCE') { const i = list.findIndex((x) => x.k === 'TITLE_DEFENCE' && x.a === e.a); if (i >= 0 && (list[i].n ?? 0) < (e.n ?? 0) && !list.some((x) => x.k === 'TITLE_LOST' && x.a === e.a && x.d > list[i].d)) list.splice(i, 1) }
  list.push(e)
  list.sort((a, b) => a.d - b.d)
  // A career line keeps the latest few of each recurring kind (the first signing and the first title stay).
  const cap = KIND_CAP[e.k]
  if (cap !== undefined) {
    const same = list.filter((x) => x.k === e.k)
    if (same.length > cap) { const drop = e.k === 'SIGNED' || e.k === 'TITLE_WON' ? same[1] : same[0]; list.splice(list.indexOf(drop), 1) }
  }
  while (list.length > LIMITS.career) {
    let worst = 0, wv = 99
    list.forEach((x, i) => { const v = KEEP[x.k] ?? 1; if (v < wv || (v === wv && i < worst)) { wv = v; worst = i } })
    list.splice(worst, 1)
  }
}

export const getHistory = (m: MediaState): readonly HistoryRec[] => { flushRecords(m); return unpack<HistoryRec[]>(m.history, []) }
export function pushHistory(m: MediaState, h: HistoryRec): void { pend(m).hist.unshift(h) }

export const getDone = (m: MediaState): readonly DoneNarrative[] => { flushRecords(m); return unpack<DoneNarrative[]>(m.narrativesDone, []) }
export function pushDone(m: MediaState, d: DoneNarrative): void { pend(m).done.unshift(d) }

export const getReigns = (m: MediaState): readonly Reign[] => { flushRecords(m); return unpack<Reign[]>(m.reigns, []) }
export function pushReign(m: MediaState, r: Reign): void { pend(m).reigns.unshift(r) }

export const getAwards = (m: MediaState): readonly AwardRec[] => { flushRecords(m); return unpack<AwardRec[]>(m.awards, []) }
export function pushAwards(m: MediaState, a: AwardRec[]): void { pend(m).awards.unshift(...a) }

export const getCareer = (m: MediaState, id: Id): readonly CareerEntry[] => {
  const base = unpack<CareerEntry[]>(m.career[id], [])
  const extra = pending.get(m)?.career.get(id)
  return extra && extra.length ? [...base, ...extra].sort((a, b) => a.d - b.d) : base
}
export function pushCareer(m: MediaState, id: Id, e: CareerEntry): void {
  const p = pend(m)
  const list = p.career.get(id)
  if (list) list.push(e); else p.career.set(id, [e])
}

export const getList = (m: MediaState, org: string, wc: WeightClassId): RankList | undefined => {
  const s = m.rankings[org]?.[wc]
  return s ? unpack<RankList | undefined>(s, undefined) : undefined
}

/** Retired for two years: keep the milestones that make a legacy (belts, number-one runs, retirement), drop the passing detail. */
const LEGACY_KEEP = 8
export function pruneRetiredCareer(m: MediaState, id: Id): void {
  const list = unpack<CareerEntry[]>(m.career[id], [])
  if (list.length <= LEGACY_KEEP) return
  const rank = (x: CareerEntry): number => KEEP[x.k] ?? 1
  const keep = list.map((x, i) => ({ x, i })).sort((a, b) => rank(b.x) - rank(a.x) || b.i - a.i).slice(0, LEGACY_KEEP).sort((a, b) => a.i - b.i).map((r) => r.x)
  m.career[id] = edit<CareerEntry[]>(m.career[id], [], (l) => { l.length = 0; l.push(...keep) })
}
