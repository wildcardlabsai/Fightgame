/**
 * NARRATIVES AND RIVALRIES. Persistent storylines the media follow. Each one is opened by a real event, strengthened or weakened
 * by later real events, and eventually resolves, fades or expires — it never lingers forever. Rivalry strength is a public
 * number that feeds back into fight appeal.
 */
import { weightClassLabel } from '../../data/weightClasses'
import { fighterAge, fighterName } from '../fighters'
import { keyedRng } from '../rng'
import type { Fight, Fighter, GameState, Id } from '../types'
import { LIMITS } from './state'
import { getList, pushDone } from './records'
import { addInterest } from './popularity'
import { titlesHeldBy } from './titles'
import type { Facts, MediaState, Narrative, NarrativeType } from './types'
import type { WorldEvent } from './worldEvents'
import { primaryRank, STOPPAGES } from './worldEvents'
import { clampTo, nextId, pairKey, totalFightsOf, weekIndex } from './util'

const RULES: Record<NarrativeType, { quiet: number; max: number }> = {
  RIVALRY: { quiet: 40, max: 150 }, RISING_STAR: { quiet: 30, max: 104 }, FALLING_STAR: { quiet: 20, max: 52 }, COMEBACK: { quiet: 10, max: 14 },
  UNBEATEN_RUN: { quiet: 40, max: 260 }, CHAMPIONSHIP_HUNT: { quiet: 30, max: 90 }, MANDATORY_CHALLENGE: { quiet: 30, max: 40 }, AVOIDANCE: { quiet: 20, max: 30 },
  CALL_OUT: { quiet: 12, max: 14 }, CONTROVERSY: { quiet: 26, max: 40 }, PROSPECT_HYPE: { quiet: 30, max: 78 }, TITLE_REIGN: { quiet: 60, max: 400 },
  LEGACY: { quiet: 4, max: 6 }, RETIREMENT: { quiet: 6, max: 8 }, UPSET_STORY: { quiet: 6, max: 8 }, KO_ARTIST: { quiet: 30, max: 90 }, DIVISION_DOMINANCE: { quiet: 60, max: 400 },
}

const same = (a: Id[], b: Id[]) => a.length === b.length && a.every((x) => b.includes(x))
export const activeNarratives = (media: MediaState) => media.narratives.filter((n) => n.status === 'active')
export function findNarrative(media: MediaState, type: NarrativeType, parts: Id[]): Narrative | undefined {
  return media.narratives.find((n) => n.status === 'active' && n.type === type && same(n.participants, parts))
}

export function open(state: GameState, media: MediaState, type: NarrativeType, parts: Id[], strength: number, facts: Facts = {}, extra: Partial<Narrative> = {}): { n: Narrative; created: boolean } {
  const ex = findNarrative(media, type, parts)
  const week = weekIndex(state)
  if (ex) return { n: ex, created: false }
  const r = RULES[type]
  const n: Narrative = {
    id: nextId(media, 'nr'), type, status: 'active', participants: parts.slice(), names: parts.map((id) => fighterName(state.fighters[id] ?? { firstName: 'Unknown', lastName: 'fighter' })),
    strength: clampTo(strength), startWeek: week, lastUpdatedWeek: week, momentum: 4, mediaAttention: clampTo(strength * 0.9), fanInterest: clampTo(strength * 0.8),
    relatedEvents: [], relatedStories: [], expiryRules: { quietWeeks: r.quiet, maxWeeks: r.max }, facts, ...extra,
  }
  media.narratives.unshift(n)
  if (media.narratives.length > LIMITS.narratives) {
    // Make room by retiring the weakest storyline (never the one just opened), and keep it on the record.
    const weakest = media.narratives.filter((x) => x !== n).sort((a, b) => a.strength - b.strength)[0]
    if (weakest) resolve(state, media, weakest, 'The story faded', 'expired')
  }
  return { n, created: true }
}

export function touch(n: Narrative, week: number, pts: number, fightId?: Id): void {
  n.strength = clampTo(n.strength * 0.92 + pts)
  n.momentum = Math.max(-10, Math.min(10, n.momentum * 0.5 + pts / 4))
  n.mediaAttention = clampTo(n.mediaAttention * 0.85 + pts * 0.9)
  n.fanInterest = clampTo(n.fanInterest * 0.9 + pts * 0.7)
  n.lastUpdatedWeek = week
  if (fightId && !n.relatedEvents.includes(fightId)) { n.relatedEvents.unshift(fightId); if (n.relatedEvents.length > 6) n.relatedEvents.length = 6 }
}

export function resolve(state: GameState, media: MediaState, n: Narrative, outcome: string, status: 'resolved' | 'expired' = 'resolved'): void {
  if (n.status !== 'active') return
  n.status = status; n.outcome = outcome; n.endWeek = weekIndex(state)
  media.narratives = media.narratives.filter((x) => x !== n)
  pushDone(media, { id: n.id, type: n.type, participants: n.participants, names: n.names, startWeek: n.startWeek, endWeek: n.endWeek ?? weekIndex(state), outcome, status })
}

/** Add to a public rivalry between two fighters. */
export function bumpRivalry(media: MediaState, a: Id, b: Id, pts: number): number {
  const k = pairKey(a, b)
  const v = clampTo((media.rivalry[k] ?? 0) + pts, 0, 100)
  media.rivalry[k] = Math.round(v * 10) / 10
  return v
}
/** Open the rivalry storyline when public feeling between two fighters has grown strong enough. */
export function ensureRivalryNarrative(state: GameState, media: MediaState, a: Id, b: Id): void {
  const s = rivalryStrength(media, a, b)
  if (s < 28) return
  const { n, created } = open(state, media, 'RIVALRY', [a, b], s, {})
  if (created) touch(n, weekIndex(state), 6)
}
export const rivalryStrength = (media: MediaState, a: Id, b: Id): number => media.rivalry[pairKey(a, b)] ?? 0

function meetings(state: GameState, a: Fighter, b: Fighter): Fight[] {
  const seen = new Set<Id>()
  const out: Fight[] = []
  for (const id of [...a.recentFights, ...b.recentFights]) {
    if (seen.has(id)) continue
    seen.add(id)
    const f = state.fights[id]
    if (f?.result && [f.sideA.fighterId, f.sideB.fighterId].includes(a.id) && [f.sideA.fighterId, f.sideB.fighterId].includes(b.id)) out.push(f)
  }
  return out.sort((x, y) => x.day - y.day)
}

const feature = (state: GameState, ids: Id[], h: string, s: string, body: string, sig: number, fightId?: Id): WorldEvent => ({
  kind: 'FEATURE', day: state.today, fighters: ids, names: ids.map((id) => fighterName(state.fighters[id])), promotions: [], fightId, facts: { h, s, body }, sig: Math.round(clampTo(sig)), parts: { narrative: sig }, tags: ['feature'],
})

/** A processed fight updates the storylines around its fighters. Returns feature stories worth publishing. */
export function narrativesFromFight(state: GameState, media: MediaState, ev: WorldEvent, fight: Fight): WorldEvent[] {
  const out: WorldEvent[] = []
  const r = fight.result
  if (!r) return out
  const week = weekIndex(state)
  const A = state.fighters[fight.sideA.fighterId], B = state.fighters[fight.sideB.fighterId]
  if (!A || !B) return out
  const decided = r.winner !== null
  const W = decided ? (r.winner === 0 ? A : B) : null
  const L = decided ? (r.winner === 0 ? B : A) : null
  const stop = STOPPAGES.includes(r.method)

  // ---- Rivalry
  const prior = meetings(state, A, B).filter((f) => f.id !== fight.id)
  const meetingsNow = prior.length + 1
  const closeResult = ['SD', 'MD', 'DRAW', 'SDRAW', 'MDRAW'].includes(r.method)
  let pts = 0
  if (prior.length >= 1) pts += 14
  if (closeResult) pts += 12
  pts += Math.min(24, 8 * (r.kd[0] + r.kd[1]))
  if (r.method === 'KO') pts += 8
  if (media.titleFights[fight.id] || fight.title) pts += 10
  if (prior.length >= 2) pts += 10
  if (pts > 0 && (prior.length >= 1 || closeResult || r.kd[0] + r.kd[1] >= 2)) {
    const s = bumpRivalry(media, A.id, B.id, pts)
    if (s >= 28) {
      const { n, created } = open(state, media, 'RIVALRY', [A.id, B.id], s, { fights: meetingsNow })
      touch(n, week, pts, fight.id)
      n.facts.fights = meetingsNow
      if (created) out.push(feature(state, [A.id, B.id], `${fighterName(A)} and ${fighterName(B)}: a rivalry is born`, `${meetingsNow} fight${meetingsNow === 1 ? '' : 's'} on the record`, `${fighterName(A)} and ${fighterName(B)} have now shared a ring ${meetingsNow === 1 ? 'once' : `${meetingsNow} times`}${closeResult ? ', and the latest result was close' : ''}${r.kd[0] + r.kd[1] ? ` with ${r.kd[0] + r.kd[1]} knockdown${r.kd[0] + r.kd[1] === 1 ? '' : 's'}` : ''}. The public wants to see it settled.`, 40 + s * 0.3, fight.id))
      if (prior.length >= 2 && decided) resolve(state, media, n, `${fighterName(W!)} won the series`)
    }
  }
  // A previous call-out between them is answered by the fight itself.
  const co = findNarrative(media, 'CALL_OUT', [A.id, B.id]) ?? findNarrative(media, 'CALL_OUT', [B.id, A.id])
  if (co) resolve(state, media, co, 'The fight was made and fought')

  if (W && L) {
    // ---- Unbeaten run
    const wUnbeaten = W.record.losses === 0 && W.record.draws === 0 && totalFightsOf(W) >= 10
    if (wUnbeaten) {
      const { n, created } = open(state, media, 'UNBEATEN_RUN', [W.id], 40, { wins: W.record.wins })
      touch(n, week, 6 + ev.sig * 0.1, fight.id); n.facts.wins = W.record.wins
      if (created || W.record.wins % 5 === 0) out.push(feature(state, [W.id], `${fighterName(W)} stays unbeaten at ${W.record.wins}-0`, `${W.record.wins} wins, no losses`, `${fighterName(W)} has won all ${W.record.wins} professional fights${W.record.koWins ? `, ${W.record.koWins} of them by knockout` : ''}. The latest win came against ${fighterName(L)} by ${ev.facts.m}.`, 38 + ev.sig * 0.3, fight.id))
    }
    const lun = findNarrative(media, 'UNBEATEN_RUN', [L.id])
    if (lun) {
      resolve(state, media, lun, `Beaten by ${fighterName(W)}${stop ? ' by stoppage' : ''}`)
      const up = open(state, media, 'UPSET_STORY', [W.id, L.id], 30 + ev.sig * 0.4, { by: fighterName(W) }); touch(up.n, week, 10, fight.id)
    }
    // ---- Upset story
    if (ev.tags.includes('upset')) { const up = open(state, media, 'UPSET_STORY', [W.id], 28 + ev.sig * 0.4, { over: fighterName(L) }); touch(up.n, week, 8, fight.id) }

    // ---- Prospects and rising stars
    const age = fighterAge(W, state.today)
    const rank = primaryRank(media, W)
    if (age <= 25 && totalFightsOf(W) <= 14 && !titlesHeldBy(media, W.id).length && ev.facts.streak !== undefined && Number(ev.facts.streak) >= 4) {
      const type: NarrativeType = rank !== null && rank <= 10 ? 'RISING_STAR' : 'PROSPECT_HYPE'
      const { n, created } = open(state, media, type, [W.id], 32, { streak: Number(ev.facts.streak) })
      touch(n, week, 5 + ev.sig * 0.1, fight.id)
      if (created) out.push(feature(state, [W.id], `${fighterName(W)}: the next name to know`, `${W.record.wins}-${W.record.losses}-${W.record.draws} at ${age}`, `${fighterName(W)}, ${age}, has won ${ev.facts.streak} in a row${W.record.koWins ? ` and stopped ${W.record.koWins} opponents` : ''}. ${rank !== null ? `${W.lastName} is rated #${rank} in the ${weightClassLabel(W.weightClass)} division.` : 'The press has started to take notice.'}`, 34 + ev.sig * 0.3, fight.id))
      if (type === 'RISING_STAR') { const old = findNarrative(media, 'PROSPECT_HYPE', [W.id]); if (old) resolve(state, media, old, 'Graduated to the ratings') }
    }
    // ---- KO artist
    if (stop && W.record.koWins >= 8 && W.record.koWins / Math.max(1, W.record.wins) >= 0.7) {
      const { n, created } = open(state, media, 'KO_ARTIST', [W.id], 36, { kos: W.record.koWins })
      touch(n, week, 6, fight.id); n.facts.kos = W.record.koWins
      if (created) out.push(feature(state, [W.id], `${fighterName(W)}: a knockout artist`, `${W.record.koWins} KOs in ${W.record.wins} wins`, `${fighterName(W)} has stopped ${W.record.koWins} of ${W.record.wins} winning opponents.`, 36 + ev.sig * 0.3, fight.id))
    }
    // ---- Comeback
    const wf = prevFights(state, W, fight)
    const lostTwo = wf.length >= 2 && wf[0].win === false && wf[1].win === false
    const layoff = wf.length > 0 && (fight.day - wf[0].day) / 7 > 40
    if ((lostTwo || layoff) && ev.sig >= 22) {
      const { n, created } = open(state, media, 'COMEBACK', [W.id], 34, { how: lostTwo ? 'after two defeats' : 'after a long layoff' })
      touch(n, week, 8, fight.id)
      if (created) out.push(feature(state, [W.id], `${fighterName(W)} returns with a win over ${fighterName(L)}`, lostTwo ? 'First win after back-to-back defeats' : 'First win after a long layoff', `${fighterName(W)} beat ${fighterName(L)} by ${ev.facts.m}${lostTwo ? ' after losing his previous two fights' : ' after more than 40 weeks out of the ring'}.`, 36 + ev.sig * 0.3, fight.id))
    }
    // ---- Falling star
    const lf = prevFights(state, L, fight)
    const losses = [{ win: false }, ...lf].slice(0, 4).filter((x) => x.win === false).length
    if (losses >= 3 && L.popularity >= 30) {
      const { n, created } = open(state, media, 'FALLING_STAR', [L.id], 30, { losses })
      touch(n, week, 6, fight.id)
      if (created) out.push(feature(state, [L.id], `${fighterName(L)}: three defeats in four and the questions start`, `${L.record.wins}-${L.record.losses}-${L.record.draws}`, `${fighterName(L)} has lost ${losses} of his last 4 fights, the latest to ${fighterName(W)} by ${ev.facts.m}.`, 30 + ev.sig * 0.2, fight.id))
    }
    // The beaten rising star's narrative ends.
    for (const t of ['RISING_STAR', 'PROSPECT_HYPE'] as const) { const x = findNarrative(media, t, [L.id]); if (x) resolve(state, media, x, `Beaten by ${fighterName(W)}`) }
    for (const t of ['KO_ARTIST'] as const) { const x = findNarrative(media, t, [L.id]); if (x && stop) touch(x, week, -6) }
  }

  // ---- Controversy
  if (closeResult && ev.sig >= 28) {
    const { n, created } = open(state, media, 'CONTROVERSY', [A.id, B.id], 30 + ev.sig * 0.3, { result: String(ev.facts.m) })
    touch(n, week, 8, fight.id)
    if (created) out.push(feature(state, [A.id, B.id], `Rematch calls grow after ${fighterName(A)} v ${fighterName(B)}`, `${ev.facts.m}${ev.facts.sc ? ` · ${ev.facts.sc}` : ''}`, `${fighterName(A)} and ${fighterName(B)} could not be separated${ev.facts.sc ? ` on the cards (${ev.facts.sc})` : ''}; a ${ev.facts.m} leaves the question open.`, 30 + ev.sig * 0.3, fight.id))
  }
  // Rematch ends a controversy.
  if (fight.rematchOf) { const c = findNarrative(media, 'CONTROVERSY', [A.id, B.id]); if (c) resolve(state, media, c, 'The rematch settled it') }

  // Attention follows the narratives.
  for (const id of [A.id, B.id]) { const f = state.fighters[id]; if (f) addInterest(media, f, Math.min(14, activeNarratives(media).filter((n) => n.participants.includes(id)).length * 2), week) }
  return out
}

function prevFights(state: GameState, f: Fighter, exclude: Fight): { win: boolean | null; day: number }[] {
  const out: { win: boolean | null; day: number }[] = []
  for (let i = f.recentFights.length - 1; i >= 0; i--) {
    const ft = state.fights[f.recentFights[i]]
    if (!ft?.result || ft.id === exclude.id) continue
    const isA = ft.sideA.fighterId === f.id
    out.push({ win: ft.result.winner === null ? null : (ft.result.winner === 0) === isA, day: ft.day })
  }
  return out
}

/** Title changes feed the title narratives. */
export function narrativesFromTitle(state: GameState, media: MediaState, kind: string, champ: Id | undefined, former: Id | undefined, defences: number | undefined, fightId: Id | undefined): WorldEvent[] {
  const out: WorldEvent[] = []
  const week = weekIndex(state)
  if (!champ) return out
  if (kind === 'TITLE_CHANGE' || kind === 'TITLE_FILLED') {
    if (former) for (const t of ['TITLE_REIGN', 'DIVISION_DOMINANCE'] as const) { const x = findNarrative(media, t, [former]); if (x) resolve(state, media, x, `Lost the belt to ${fighterName(state.fighters[champ])}`) }
    const hunt = findNarrative(media, 'CHAMPIONSHIP_HUNT', [champ]); if (hunt) resolve(state, media, hunt, 'Won the title')
    const { n } = open(state, media, 'TITLE_REIGN', [champ], 50, { since: state.today }); touch(n, week, 12, fightId)
    for (const t of ['RISING_STAR', 'PROSPECT_HYPE'] as const) { const x = findNarrative(media, t, [champ]); if (x) resolve(state, media, x, 'Became champion') }
  } else if (kind === 'TITLE_DEFENCE') {
    const { n } = open(state, media, 'TITLE_REIGN', [champ], 50); touch(n, week, 8, fightId); n.facts.defences = defences ?? 0
    if ((defences ?? 0) >= 3) {
      const dom = open(state, media, 'DIVISION_DOMINANCE', [champ], 60, { defences: defences ?? 0 })
      touch(dom.n, week, 8, fightId); dom.n.facts.defences = defences ?? 0
      if (dom.created) out.push(feature(state, [champ], `${fighterName(state.fighters[champ])} rules the division`, `${defences} successful defences`, `${fighterName(state.fighters[champ])} has now defended the title ${defences} times.`, 55, fightId))
    }
  }
  return out
}

/** Weekly sweep: orders, call-outs, championship hunts, fading, expiry, retirement. */
export function weeklyNarratives(state: GameState, media: MediaState, events: WorldEvent[], steps = 1): WorldEvent[] {
  const out: WorldEvent[] = []
  const week = weekIndex(state)

  // Fade and expire
  for (const n of media.narratives.slice()) {
    if (n.status !== 'active') continue
    n.strength = clampTo(n.strength * Math.pow(0.985, steps) - 0.2 * steps)
    n.momentum *= Math.pow(0.8, steps)
    n.mediaAttention = clampTo(n.mediaAttention * Math.pow(0.96, steps))
    n.fanInterest = clampTo(n.fanInterest * Math.pow(0.97, steps))
    const quiet = week - n.lastUpdatedWeek, age = week - n.startWeek
    const gone = n.participants.some((id) => state.fighters[id]?.status === 'retired' || !state.fighters[id])
    if (gone) resolve(state, media, n, n.type === 'RETIREMENT' || n.type === 'LEGACY' ? 'A career ends' : 'A fighter retired', 'expired')
    else if ((n.type === 'RISING_STAR' || n.type === 'PROSPECT_HYPE') && (titlesHeldBy(media, n.participants[0]).length || totalFightsOf(state.fighters[n.participants[0]]) > 18)) resolve(state, media, n, titlesHeldBy(media, n.participants[0]).length ? 'Became champion' : 'No longer a prospect')
    else if (n.type === 'TITLE_REIGN' || n.type === 'DIVISION_DOMINANCE') { if (!titlesHeldBy(media, n.participants[0]).length) resolve(state, media, n, 'No longer champion') }
    else if (n.strength < 8 || quiet > n.expiryRules.quietWeeks || age > n.expiryRules.maxWeeks) resolve(state, media, n, 'The story faded', 'expired')
  }
  for (const [k, v] of Object.entries(media.rivalry)) { const nv = v * Math.pow(0.985, steps) - 0.1 * steps; if (nv < 3) delete media.rivalry[k]; else media.rivalry[k] = Math.round(nv * 10) / 10 }

  // Call-outs: after a notable win, a fighter with the temperament may name a target.
  for (const ev of events) {
    if (!ev.fightId || ev.sig < 38 || ev.fighters.length < 2 || ev.facts.draw) continue
    const W = state.fighters[ev.fighters[0]]
    if (!W || W.status !== 'active') continue
    const rng = keyedRng(state.seed, 'callout', ev.fightId)
    const loud = ['Showman', 'Arrogant', 'Ambitious', 'Volatile'].includes(W.personality)
    if (!rng.chance(loud ? 0.45 : 0.1)) continue
    const target = pickTarget(state, media, W, ev.fighters[1])
    if (!target) continue
    const rivalry = bumpRivalry(media, W.id, target.id, 14)
    const { n, created } = open(state, media, 'CALL_OUT', [W.id, target.id], 34 + ev.sig * 0.2, { div: weightClassLabel(W.weightClass) })
    if (created) {
      touch(n, week, 8)
      out.push({ kind: 'CALL_OUT', day: state.today, fighters: [W.id, target.id], names: [fighterName(W), fighterName(target)], promotions: [], facts: { n: fighterName(W), t: fighterName(target), div: weightClassLabel(W.weightClass), why: `${W.lastName} had just beaten ${ev.facts.l} by ${ev.facts.m}`, rivalry: Math.round(rivalry) }, sig: Math.round(clampTo(24 + ev.sig * 0.35)), parts: { callout: ev.sig * 0.35 }, tags: ['callout'] })
    }
  }

  // Championship hunts: top contenders in the leading body's list with no title fight yet (checked monthly).
  if (week % 4 === 0) for (const [k, rec] of Object.entries(media.titles)) {
    const [body, wc] = k.split('|')
    const list = getList(media, body, wc as Fighter['weightClass'])
    const top = list?.e.find((e) => e.r === 1)
    if (!top || !rec.c || top.f === rec.c) continue
    const f = state.fighters[top.f]
    if (!f || f.status !== 'active') continue
    // One hunt per division, and never for a fighter who already holds a belt there.
    if (titlesHeldBy(media, top.f).some((t) => t.wc === wc)) continue
    if (media.narratives.some((x) => x.status === 'active' && x.type === 'CHAMPIONSHIP_HUNT' && x.facts.wc === wc)) continue
    const { n, created } = open(state, media, 'CHAMPIONSHIP_HUNT', [top.f], 36, { wc, body })
    if (created) { touch(n, week, 6); out.push(feature(state, [top.f], `${fighterName(f)} closes in on the ${weightClassLabel(f.weightClass)} title`, `Ranked #1 by ${body.toUpperCase()}`, `${fighterName(f)} (${f.record.wins}-${f.record.losses}-${f.record.draws}) is the leading contender for the ${weightClassLabel(f.weightClass)} championship.`, 34 + f.popularity * 0.2)) }
  }
  if (week % 4 === 0) for (const n of activeNarratives(media).filter((x) => x.type === 'CHAMPIONSHIP_HUNT')) {
    const id = n.participants[0]
    if (titlesHeldBy(media, id).some((t) => t.wc === n.facts.wc)) { resolve(state, media, n, 'Won the title'); continue }
    const stillTop = Object.entries(media.rankings).some(([org, byWc]) => Object.keys(byWc ?? {}).some((wc) => getList(media, org, wc as Fighter['weightClass'])?.e.some((e) => e.f === id && e.r >= 1 && e.r <= 3)))
    if (!stillTop) resolve(state, media, n, 'No longer a leading contender', 'expired')
  }
  return out
}

function pickTarget(state: GameState, media: MediaState, w: Fighter, justBeaten: Id): Fighter | null {
  const rank = primaryRank(media, w)
  const list = getList(media, 'ringside', w.weightClass)
  if (!list) return null
  const pool = list.e.filter((e) => e.r >= 1 && e.f !== w.id && e.f !== justBeaten && (rank === null || e.r < rank)).slice(-4)
  const target = pool[pool.length - 1]
  const f = target ? state.fighters[target.f] : null
  return f && f.status === 'active' && f.id !== w.id ? f : null
}

/** A retirement closes the fighter's storylines. */
export function narrativesFromRetirement(state: GameState, media: MediaState, f: Fighter): WorldEvent[] {
  const held = titlesHeldBy(media, f.id).length
  const notable = f.reputation >= 55 || held > 0 || f.record.wins >= 20
  for (const n of media.narratives.filter((x) => x.status === 'active' && x.participants.includes(f.id))) resolve(state, media, n, 'Retired', 'expired')
  if (!notable) return []
  const { n } = open(state, media, 'LEGACY', [f.id], 60, { wins: f.record.wins })
  resolve(state, media, n, `Retired with ${f.record.wins}-${f.record.losses}-${f.record.draws}`)
  return []
}

export function narrativeLabel(t: NarrativeType): string {
  return { RIVALRY: 'RIVALRY', RISING_STAR: 'RISING STAR', FALLING_STAR: 'FALLING STAR', COMEBACK: 'COMEBACK', UNBEATEN_RUN: 'UNBEATEN RUN', CHAMPIONSHIP_HUNT: 'TITLE HUNT', MANDATORY_CHALLENGE: 'MANDATORY', AVOIDANCE: 'AVOIDANCE', CALL_OUT: 'CALL-OUT', CONTROVERSY: 'CONTROVERSY', PROSPECT_HYPE: 'PROSPECT HYPE', TITLE_REIGN: 'TITLE REIGN', LEGACY: 'LEGACY', RETIREMENT: 'RETIREMENT', UPSET_STORY: 'UPSET', KO_ARTIST: 'KO ARTIST', DIVISION_DOMINANCE: 'DOMINANCE' }[t]
}
