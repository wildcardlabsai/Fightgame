/**
 * PATHWAY COMMITMENTS. A promise made in the talks (a shot at an area / British / European / world title, an eliminator, a headline
 * slot, a minimum number of fights) is a real, tracked obligation:
 *
 *   open → fulfilled  when the fighter really fights the promised bout (read from the fights themselves, never from a flag);
 *   open → broken     when the deadline passes without it — morale and the camp’s trust fall, the promotion’s name suffers,
 *                     the camp remembers (harder talks, less patience) and the rest of the roster notices;
 *   open → void       when the condition no longer binds (“if ranked top 10” and the fighter has dropped out), the fighter has gone,
 *                     or the contract ended. One extension is granted when the fighter is injured at the deadline.
 *
 * Only pathways that are GENUINELY available are offered (`pathwayOptions`): a body whose territory the fighter is outside, a belt that
 * is dormant in the division, a fighter below the body’s minimum number of fights — none of these can be promised.
 */
import { WEIGHT_CLASSES } from '../../data/weightClasses'
import { fighterName, totalFights } from '../fighters'
import { postMessage } from '../messages'
import { addCareer } from '../media/career'
import { rankIn } from '../media/rankings'
import { titleKey } from '../media/titles'
import type { Fight, Fighter, GameState, Id } from '../types'
import { TITLE_DEF_BY_ID, TITLE_DEFS, isEligibleFor, levelOf, levelRank, type TitleLevel } from './titleDefs'
import { biz, nameOf, nextBizId } from './talkCore'
import { BUSINESS_LIMITS, type Commitment, type PathwayKind, type PathwayOffer } from './types'

const WEEK = 7

export interface PathwayChoice {
  offer: PathwayOffer
  label: string
  detail: string
}

const LEVEL_FOR: Partial<Record<PathwayKind, TitleLevel>> = { areaShot: 'area', domesticShot: 'domestic', europeanRoute: 'european', worldIfRanked: 'world', eliminator: 'world' }

/** The best-placed body of a level the fighter could actually challenge for now (dormant belts and ineligible bodies are excluded). */
export function bodyFor(state: GameState, f: Fighter, level: TitleLevel): { id: string; rank: number | null } | null {
  const media = state.media
  if (!media) return null
  let best: { id: string; rank: number | null } | null = null
  for (const d of TITLE_DEFS) {
    if (d.level !== level || !isEligibleFor(d, f) || totalFights(f) < d.minFights) continue
    if (!media.titles[titleKey(d.id, f.weightClass)]) continue
    const r = rankIn(media, d.id, f.weightClass, f.id)
    if (best === null || (r !== null && (best.rank === null || r < best.rank))) best = { id: d.id, rank: r }
  }
  return best
}

/** Everything the player may honestly promise this fighter. Empty when nothing is real. */
export function pathwayOptions(state: GameState, f: Fighter): PathwayChoice[] {
  const out: PathwayChoice[] = []
  const media = state.media
  if (!media) return out
  const a = bodyFor(state, f, 'area'), d = bodyFor(state, f, 'domestic'), e = bodyFor(state, f, 'european'), w = bodyFor(state, f, 'world')
  const top = (x: { rank: number | null } | null, n: number) => !!x && x.rank !== null && x.rank <= n
  if (a && (top(a, 5) || a.rank === null)) out.push({ offer: { kind: 'areaShot', weeks: 52 }, label: 'An area title shot', detail: 'A fight for an area championship within a year.' })
  if (d && top(d, 6)) out.push({ offer: { kind: 'domesticShot', weeks: 52 }, label: 'A British / Commonwealth title shot', detail: 'A domestic title fight within a year — only while the fighter is ranked.' })
  if (e && top(e, 6)) out.push({ offer: { kind: 'europeanRoute', weeks: 65 }, label: 'A route to the European title', detail: 'A European title fight within fifteen months.' })
  if (w && top(w, 10)) out.push({ offer: { kind: 'worldIfRanked', weeks: 78, maxRank: 8 }, label: 'A world title opportunity if ranked top 8', detail: 'A world title fight within eighteen months — it binds only while the fighter stays ranked in the top 8.' })
  if (w && top(w, 8)) out.push({ offer: { kind: 'eliminator', weeks: 52 }, label: 'A world title eliminator', detail: 'An eliminator within a year.' })
  if (totalFights(f) >= 3) out.push({ offer: { kind: 'headline', weeks: 39 }, label: 'A headline slot', detail: 'Top or second billing on one of your shows within nine months.' })
  out.push({ offer: { kind: 'activity', weeks: 52 }, label: 'Four fights in a year', detail: 'A minimum of four bouts in twelve months.' })
  return out
}

/** Is this offered pathway still among the real options? (A saved offer is re-checked when it is struck.) */
export const pathwayIsReal = (state: GameState, f: Fighter, p: PathwayOffer): boolean => pathwayOptions(state, f).some((x) => x.offer.kind === p.kind)

export function pathwayText(p: PathwayOffer): string {
  switch (p.kind) {
    case 'areaShot': return 'an area title shot'
    case 'domesticShot': return 'a British / Commonwealth title shot'
    case 'europeanRoute': return 'a route to the European title'
    case 'worldIfRanked': return `a world title opportunity while ranked in the top ${p.maxRank ?? 8}`
    case 'eliminator': return 'a world title eliminator'
    case 'headline': return 'a headline slot'
    case 'activity': return 'four fights in a year'
  }
}

export function openCommitments(state: GameState, id?: Id): Commitment[] {
  return (state.business?.commitments ?? []).filter((c) => c.status === 'open' && (id === undefined || c.fighterId === id))
}

/** Record the promise made in an agreed deal. Returns the commitment (or null if nothing was promised). */
export function createCommitment(state: GameState, f: Fighter, p: PathwayOffer | null | undefined): Commitment | null {
  if (!p) return null
  const b = biz(state)
  const level = LEVEL_FOR[p.kind] ?? null
  const body = level ? bodyFor(state, f, level)?.id ?? null : null
  const c: Commitment = {
    id: nextBizId(state, 'm'), fighterId: f.id, kind: p.kind, body, level, wc: f.weightClass,
    madeDay: state.today, dueDay: state.today + p.weeks * WEEK, maxRank: p.maxRank ?? null, count: p.kind === 'activity' ? 4 : 1, done: 0, status: 'open',
    note: `Promised ${pathwayText(p)}.`,
  }
  b.commitments.push(c)
  if (b.commitments.length > BUSINESS_LIMITS.commitments) {
    // Bounded: settled promises are forgotten oldest first; open ones are never dropped.
    const settled = b.commitments.filter((x) => x.status !== 'open')
    if (settled.length) b.commitments.splice(b.commitments.indexOf(settled[0]), 1)
  }
  return c
}

function fightsSince(state: GameState, f: Fighter, day: number): Fight[] {
  const out: Fight[] = []
  for (const id of f.recentFights) { const ft = state.fights[id]; if (ft?.result && ft.day >= day) out.push(ft) }
  return out
}

function met(state: GameState, c: Commitment, f: Fighter): boolean {
  const fights = fightsSince(state, f, c.madeDay)
  switch (c.kind) {
    case 'activity': c.done = fights.length; return fights.length >= c.count
    case 'headline': {
      return fights.some((ft) => { const ev = ft.eventId ? state.events[ft.eventId] : undefined; if (!ev || ev.promotionId !== state.playerPromotionId) return false; const i = ev.card.indexOf(ft.id); return i >= 0 && i >= ev.card.length - 2 })
    }
    case 'eliminator': return fights.some((ft) => ft.title?.kind === 'eliminator' && ft.title.level !== undefined && levelRank(ft.title.level) >= levelRank('european'))
    default: {
      const need = c.level ? levelRank(c.level) : 0
      // A title shot: a real title or unification fight at (or above) the promised level.
      return fights.some((ft) => ft.title && (ft.title.kind === 'title' || ft.title.kind === 'unification') && ft.title.level !== undefined && levelRank(ft.title.level) >= need)
    }
  }
}

function kept(state: GameState, c: Commitment, f: Fighter): void {
  c.status = 'fulfilled'
  f.morale = Math.min(100, f.morale + 8)
  f.promoRelations[state.playerPromotionId] = Math.min(100, (f.promoRelations[state.playerPromotionId] ?? 0) + 12)
  const rec = (biz(state).neg[f.id] ??= { talks: 0, agreed: 0, lowballs: 0, walkouts: 0, lastDay: state.today, kept: 0, broken: 0 })
  rec.kept = (rec.kept ?? 0) + 1
  if (state.media) addCareer(state.media, f.id, { d: state.today, k: 'PROMISE_KEPT', a: pathwayText({ kind: c.kind, weeks: 0, maxRank: c.maxRank ?? undefined }) })
  postMessage(state, {
    from: 'Agent', category: 'fighter', priority: 'normal', key: `kept-${c.id}`, cooldownWeeks: 9999,
    subject: `${fighterName(f)}’s camp: promise kept`, body: `You promised ${f.firstName} ${pathwayText({ kind: c.kind, weeks: 0, maxRank: c.maxRank ?? undefined })} and delivered. The camp has noticed.`,
    link: { kind: 'fighter', id: f.id },
  })
}

function broke(state: GameState, c: Commitment, f: Fighter): void {
  c.status = 'broken'
  const pid = state.playerPromotionId
  const promo = state.promotions[pid]
  f.morale = Math.max(1, f.morale - 14)
  f.promoRelations[pid] = Math.max(-100, (f.promoRelations[pid] ?? 0) - 22)
  if (promo) promo.reputation = Math.max(0, promo.reputation - 1.2)
  const rec = (biz(state).neg[f.id] ??= { talks: 0, agreed: 0, lowballs: 0, walkouts: 0, lastDay: state.today, kept: 0, broken: 0 })
  rec.broken = (rec.broken ?? 0) + 1
  if (state.media) addCareer(state.media, f.id, { d: state.today, k: 'PROMISE_BROKEN', a: pathwayText({ kind: c.kind, weeks: 0, maxRank: c.maxRank ?? undefined }) })
  // The rest of the roster notices how promises are treated.
  for (const ct of Object.values(state.contracts)) {
    if (ct.promotionId !== pid || ct.fighterId === f.id) continue
    const o = state.fighters[ct.fighterId]
    if (o) o.morale = Math.max(1, o.morale - (o.personality === 'Loyal' || o.personality === 'Ambitious' ? 3 : 1))
  }
  postMessage(state, {
    from: 'Agent', category: 'fighter', priority: 'important', key: `broke-${c.id}`, cooldownWeeks: 9999,
    subject: `${fighterName(f)}’s camp: promise broken`,
    body: `${f.firstName}’s camp was promised ${pathwayText({ kind: c.kind, weeks: 0, maxRank: c.maxRank ?? undefined })} and it never came. Morale and trust have taken a hit, and word gets round.`,
    link: { kind: 'fighter', id: f.id },
  })
}

/** Weekly: settle every open promise. Deterministic and cheap (a handful of open commitments). */
export function processCommitments(state: GameState): void {
  const b = state.business
  if (!b || b.commitments.length === 0) return
  for (const c of b.commitments) {
    if (c.status !== 'open') continue
    const f = state.fighters[c.fighterId]
    const ct = f?.contractId ? state.contracts[f.contractId] : null
    if (!f || f.status !== 'active' || !ct || ct.promotionId !== state.playerPromotionId) { c.status = 'void'; continue }
    if (met(state, c, f)) { kept(state, c, f); continue }
    // “If ranked”: the promise stops binding the moment the fighter falls outside the limit at the deadline.
    if (state.today >= c.dueDay) {
      if (c.maxRank !== null && state.media) {
        const body = c.body ?? 'atlas'
        const r = rankIn(state.media, body, f.weightClass, f.id)
        if (r === null || r > c.maxRank) { c.status = 'void'; c.note += ' The condition no longer applied.'; continue }
      }
      if (f.injury && !c.note.includes('Extended')) { c.dueDay += 8 * WEEK; c.note += ' Extended eight weeks (injury).'; continue }
      broke(state, c, f)
    }
  }
}

export { nameOf, levelOf, TITLE_DEF_BY_ID, WEIGHT_CLASSES }
