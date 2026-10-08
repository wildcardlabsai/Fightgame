/**
 * WORLD AUDIT. Structural invariants of the fight business that must hold at ANY point of ANY game. Used by the long-run script
 * (5/10/20-year worlds) and by the test suite. Returns human-readable violations; an empty list means the world is sound.
 */
import { WEIGHT_CLASSES } from '../../data/weightClasses'
import { getReigns, getList } from '../media/records'
import { SANCTIONING } from '../media/orgs'
import type { GameState, Id } from '../types'
import { TITLE_DEF_BY_ID } from './titleDefs'

export function auditWorld(state: GameState): string[] {
  const out: string[] = []
  const media = state.media
  if (!media) return out
  const divisions = new Set(WEIGHT_CLASSES.map((w) => w.id as string))
  const heldBy = new Map<string, string>() // `${body}|${fighter}` → division
  for (const [k, rec] of Object.entries(media.titles)) {
    const [body, wc] = k.split('|')
    if (!TITLE_DEF_BY_ID[body]) out.push(`${k}: unknown title body`)
    if (!divisions.has(wc)) out.push(`${k}: title without a valid division`)
    if (rec.c) {
      const f = state.fighters[rec.c]
      if (!f) out.push(`${k}: champion ${rec.c} does not exist`)
      else {
        if (f.status === 'retired') out.push(`${k}: retired champion ${rec.c}`)
        if (f.weightClass !== wc) out.push(`${k}: champion ${rec.c} fights at ${f.weightClass}`)
        const hk = `${body}|${rec.c}`
        if (heldBy.has(hk)) out.push(`${body}: ${rec.c} holds the belt in two divisions (${heldBy.get(hk)} and ${wc})`)
        heldBy.set(hk, wc)
      }
    }
    if (rec.mand) {
      const ch = state.fighters[rec.mand.challenger]
      if (!ch || ch.status === 'retired') out.push(`${k}: mandatory challenger ${rec.mand.challenger} is gone`)
      else if (ch.weightClass !== wc) out.push(`${k}: mandatory challenger ${ch.id} is in another division`)
      if (rec.mand.challenger === rec.c) out.push(`${k}: champion is his own mandatory challenger`)
      if (!rec.c) out.push(`${k}: mandatory order on a vacant belt`)
    }
    if (rec.elim) {
      if (rec.elim.a === rec.elim.b) out.push(`${k}: eliminator between one fighter`)
      for (const id of [rec.elim.a, rec.elim.b]) { const f = state.fighters[id]; if (!f || f.status === 'retired') out.push(`${k}: eliminator fighter ${id} is gone`) }
    }
  }
  // Two belts of one body cannot name the same mandatory challenger (a challenger fights for one belt of a body at a time).
  const mand = new Map<string, string>()
  for (const [k, rec] of Object.entries(media.titles)) if (rec.mand) {
    const mk = `${k.split('|')[0]}|${rec.mand.challenger}`
    if (mand.has(mk)) out.push(`${k}: ${rec.mand.challenger} is mandatory challenger for two belts of one body (also ${mand.get(mk)})`)
    mand.set(mk, k)
  }
  // Lists: unique, ordered, in the right division, champion first.
  for (const org of SANCTIONING) for (const wc of divisions) {
    const l = getList(media, org.id, wc as never)
    if (!l) continue
    const seen = new Set<Id>()
    let last = -1
    for (const e of l.e) {
      if (seen.has(e.f)) out.push(`${org.id}|${wc}: ${e.f} listed twice`)
      seen.add(e.f)
      if (e.r < last) out.push(`${org.id}|${wc}: ranks out of order`)
      last = e.r
      const f = state.fighters[e.f]
      if (f && f.weightClass !== wc && f.status === 'active') out.push(`${org.id}|${wc}: ${e.f} listed outside their division`)
    }
  }
  // Reigns: chronological, no overlap per title.
  const by = new Map<string, ReturnType<typeof getReigns>[number][]>()
  for (const r of getReigns(media)) { const k = `${r.b}|${r.wc}`; (by.get(k) ?? by.set(k, []).get(k)!).push(r) }
  for (const [k, rs] of by) {
    const a = rs.slice().sort((x, y) => x.from - y.from)
    a.forEach((r, i) => {
      if (r.to === null || r.to < r.from) out.push(`${k}: reign runs backwards or never closed`)
      if (i > 0 && r.to !== null && a[i - 1].to !== null && r.from < (a[i - 1].to as number)) out.push(`${k}: reigns overlap`)
      if (!r.how) out.push(`${k}: reign ended without a recorded reason`)
    })
    const cur = media.titles[k]
    if (cur?.c && a.length && a[a.length - 1].to !== null && cur.since < (a[a.length - 1].to as number)) out.push(`${k}: current reign starts before the last one ended`)
  }
  // Venues and events.
  for (const e of Object.values(state.events)) {
    const v = state.venues[e.venueId]
    if (!v) { out.push(`${e.id}: event at an unknown venue`); continue }
    if (e.result && e.result.attendance > v.capacity + 1) out.push(`${e.id}: attendance ${e.result.attendance} exceeds ${v.name} capacity ${v.capacity}`)
    if (v.hireCost <= 0 || v.capacity <= 0) out.push(`${v.name}: impossible hire/capacity`)
  }
  return out
}

export interface WorldMetrics {
  active: number
  champions: number
  championShare: number
  everChampion: number
  titleFights: number
  titleFightShare: number
  medianPurse: number
  retiredChampions: number
}

export function worldMetrics(state: GameState): WorldMetrics {
  const media = state.media
  const active = Object.values(state.fighters).filter((f) => f.status === 'active')
  const champs = new Set<Id>()
  if (media) for (const rec of Object.values(media.titles)) if (rec.c) champs.add(rec.c)
  const hist = state.business?.titleHist ?? {}
  const everChampion = Object.values(hist).filter((h) => h.won > 0).length
  const fights = Object.values(state.fights).filter((f) => f.result)
  const titled = fights.filter((f) => f.title).length
  const purses = Object.values(state.contracts).map((c) => c.basePurse).sort((a, b) => a - b)
  return {
    active: active.length, champions: champs.size, championShare: active.length ? champs.size / active.length : 0, everChampion,
    titleFights: titled, titleFightShare: fights.length ? titled / fights.length : 0, medianPurse: purses.length ? purses[Math.floor(purses.length / 2)] : 0,
    retiredChampions: [...champs].filter((id) => state.fighters[id]?.status === 'retired').length,
  }
}
