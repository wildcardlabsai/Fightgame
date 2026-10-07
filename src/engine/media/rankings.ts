/**
 * RANKINGS. Several independent authorities rank every division from PUBLIC results only (records, who beat whom, how long
 * ago, titles, popularity). They use different weights, so they disagree like real lists do, and every movement stores a
 * reason built from a real fight or a real change in who is above.
 */
import { WEIGHT_CLASSES } from '../../data/weightClasses'
import type { Day, Fighter, GameState, Id, WeightClassId } from '../types'
import { RANKING_ORGS, RANK_ORG_BY_ID } from './orgs'
import { pack } from './packed'
import { getList } from './records'
import type { MediaState, RankEntry, RankList, RankingMethod, RankingOrg, RankReason } from './types'
import { totalFightsOf, weekIndex } from './util'

export const MIN_FIGHTS_TO_RANK = 5

export const encodeWhy = (w: RankReason): string => (w.o ? `${w.k}:${w.o}:${w.or ?? ''}` : w.k)
export function decodeWhy(s: string): RankReason {
  const [k, o, or] = s.split(':')
  return { k: k as RankReason['k'], ...(o ? { o } : {}), ...(or !== undefined && or !== '' ? { or: Number(or) } : {}) }
}
const MIN_DIVISION_SIZE = 5

interface FightRec { opp: Id; win: boolean | null; stop: boolean; day: Day; oq: number }
export interface RecCtx { id: Id; fights: FightRec[]; streak: number; idleWeeks: number; total: number; titles: number }

function oppQuality(o: Fighter | undefined, memo: Map<Id, number>): number {
  if (!o) return 0.5
  let q = memo.get(o.id)
  if (q === undefined) {
    // Same public formula as publicStanding(), without building a facts object per opponent.
    const r = o.record, n = r.wins + r.losses + r.draws
    const st = 0.5 * o.reputation + 0.25 * o.popularity + 20 * ((n ? r.wins / n : 0.5) - 0.5) * Math.min(1, n / 10) + 0.05 * o.momentum
    q = Math.min(1.8, Math.max(0.3, st / 40)); memo.set(o.id, q)
  }
  return q
}

/** Everything the lists need from a fighter's recent history, computed once per update. */
export function buildContexts(state: GameState, media: MediaState): Map<Id, RecCtx> {
  const champs = new Map<Id, number>()
  for (const t of Object.values(media.titles)) if (t.c) champs.set(t.c, (champs.get(t.c) ?? 0) + 1)
  const out = new Map<Id, RecCtx>()
  const memo = new Map<Id, number>()
  for (const f of Object.values(state.fighters)) {
    if (f.status !== 'active') continue
    const total = totalFightsOf(f)
    if (total < MIN_FIGHTS_TO_RANK) continue
    const fights: FightRec[] = []
    for (let i = f.recentFights.length - 1; i >= Math.max(0, f.recentFights.length - 8); i--) {
      const ft = state.fights[f.recentFights[i]]
      if (!ft?.result) continue
      const isA = ft.sideA.fighterId === f.id
      const oppId = isA ? ft.sideB.fighterId : ft.sideA.fighterId
      const w = ft.result.winner
      fights.push({ opp: oppId, win: w === null ? null : (w === 0) === isA, stop: ['KO', 'TKO', 'RTD', 'INJ'].includes(ft.result.method), day: ft.day, oq: oppQuality(state.fighters[oppId], memo) })
    }
    let streak = 0
    for (const x of fights) { if (x.win === true) { if (streak < 0) break; streak++ } else if (x.win === false) { if (streak > 0) break; streak-- } else break }
    const idleWeeks = f.lastFightDay === null ? 60 : Math.max(0, Math.floor((state.today - f.lastFightDay) / 7))
    out.set(f.id, { id: f.id, fights, streak, idleWeeks, total, titles: champs.get(f.id) ?? 0 })
  }
  return out
}

export function rankScore(f: Fighter, c: RecCtx, m: RankingMethod): number {
  const r = f.record
  let s = f.reputation * 0.045 + (r.wins - 1.2 * r.losses) * 0.06 + r.koWins * 0.02
  c.fights.forEach((x, i) => {
    const w = Math.pow(0.85, i)
    if (x.win === true) s += w * (m.recent + m.opposition * x.oq * 1.2) * (x.stop ? 1.15 : 1)
    else if (x.win === false) s -= w * m.losses * (1.1 - 0.4 * Math.min(1.5, x.oq))
    else s += w * 0.1
  })
  s += Math.max(-3, Math.min(6, c.streak)) * m.streak * 0.35
  if (c.idleWeeks > m.idleWeeks) s -= Math.min(3.5, m.activity * 0.08 * (c.idleWeeks - m.idleWeeks))
  s += c.titles * m.titles * 2.5
  s += f.popularity * 0.03 * m.popularity
  return s
}

function reasonFor(c: RecCtx, org: RankingOrg, prev: RankList | undefined, prevRank: number | null, rank: number, isChamp: boolean): RankReason {
  if (isChamp) return { k: 'title' }
  if (prev) {
    const last = c.fights.find((x) => x.day > prev.u)
    if (last) {
      const or = prev.e.find((e) => e.f === last.opp)
      const base = { o: last.opp, or: or ? or.r : undefined }
      if (last.win === true) return { k: 'beat', ...base }
      if (last.win === false) return { k: 'lost', ...base }
      return { k: 'drew', ...base }
    }
    if (prevRank === null) return { k: 'new' }
    if (c.idleWeeks > org.methodology.idleWeeks + 4 && rank > prevRank) return { k: 'inactive' }
    return rank < prevRank ? { k: 'rose' } : rank > prevRank ? { k: 'fell' } : { k: 'same' }
  }
  return { k: 'same' }
}

export const listFor = getList

/** Rank shown for a fighter: 0 = champion, 1…n = contender, null = unranked. */
export function rankIn(media: MediaState, orgId: string, wc: WeightClassId, id: Id): number | null {
  const l = listFor(media, orgId, wc)
  return l?.e.find((e) => e.f === id)?.r ?? null
}

function computeList(state: GameState, media: MediaState, org: RankingOrg, wc: WeightClassId, ctx: Map<Id, RecCtx>, pool: Fighter[], first: boolean): RankList | null {
  const prev = getList(media, org.id, wc)
  if (pool.length < MIN_DIVISION_SIZE) return prev ? { u: state.today, e: [] } : null
  const champId = org.sanctions ? media.titles[`${org.id}|${wc}`]?.c ?? null : null
  const scored = pool.map((f) => ({ f, s: rankScore(f, ctx.get(f.id)!, org.methodology) })).sort((a, b) => b.s - a.s || (a.f.id < b.f.id ? -1 : 1))
  const prevRankOf = (id: Id): number | null => prev?.e.find((e) => e.f === id)?.r ?? null
  const entries: RankEntry[] = []
  let r = 0
  if (champId && ctx.has(champId)) entries.push({ f: champId, r: 0, p: first ? 0 : prevRankOf(champId), why: 'title' })
  for (const x of scored) {
    if (x.f.id === champId) continue
    if (r >= org.rankingCount) break
    r++
    const p = prevRankOf(x.f.id)
    entries.push({ f: x.f.id, r, p: first ? r : p, why: encodeWhy(reasonFor(ctx.get(x.f.id)!, org, first ? undefined : prev, p, r, false)) })
  }
  return { u: state.today, e: entries }
}

export interface RankMove { orgId: string; wc: WeightClassId; f: Id; from: number | null; to: number | null; why: RankReason }

/** Recompute every list that is due this week. Returns the notable movements for the story engine. */
export function updateRankings(state: GameState, media: MediaState, first = false): RankMove[] {
  const week = weekIndex(state)
  const due = RANKING_ORGS.filter((o) => o.active && media.rankOrgs[o.id]?.active !== false && (first || week % o.updateEveryWeeks === o.offset))
  if (due.length === 0) return []
  const ctx = buildContexts(state, media)
  const byWc = new Map<WeightClassId, Fighter[]>()
  for (const f of Object.values(state.fighters)) if (ctx.has(f.id)) { const l = byWc.get(f.weightClass); if (l) l.push(f); else byWc.set(f.weightClass, [f]) }
  const moves: RankMove[] = []
  for (const org of due) {
    media.rankings[org.id] ??= {}
    for (const wc of WEIGHT_CLASSES) {
      const prev = getList(media, org.id, wc.id)
      const list = computeList(state, media, org, wc.id, ctx, byWc.get(wc.id) ?? [], first)
      if (!list) continue
      media.rankings[org.id][wc.id] = pack(list)
      if (first || !prev) continue
      for (const e of list.e) {
        const from = e.p
        if (from === e.r) continue
        // Only movements worth a story: into / within the top five, to #1, into the list, or any move of five places or more.
        const bigJump = from !== null && Math.abs(from - e.r) >= 5
        if (e.r <= 5 || bigJump || from === null) moves.push({ orgId: org.id, wc: wc.id, f: e.f, from, to: e.r, why: decodeWhy(e.why) })
      }
      for (const old of prev.e) if (!list.e.some((e) => e.f === old.f) && old.r <= 5) moves.push({ orgId: org.id, wc: wc.id, f: old.f, from: old.r, to: null, why: { k: 'vacated' } })
    }
  }
  return moves
}

export const orgDef = (id: string): RankingOrg => RANK_ORG_BY_ID[id]
