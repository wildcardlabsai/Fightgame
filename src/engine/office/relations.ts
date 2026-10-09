/**
 * THE RELATIONSHIP BOOK. One reusable model for the people and organisations that control boxing opportunities: rival promoters,
 * venues and (read from the media world) broadcasters, plus fighters' managers (read from the negotiation memory). A relationship is a
 * number from -100 to 100 with the last few reasons behind it, so the player can always see WHY it moved.
 *
 * Relationships change only because something real happened (an offer honoured or broken, a show cancelled, a fighter contested, a
 * clash of dates), each effect is applied once (see `once`), and they drift slowly back towards neutral. They tilt business -
 * how often an offer arrives, how much room a counterpart gives, what a venue charges - but never override contracts, finances,
 * fighter eligibility or the title rules.
 */
import { relationOf as mediaRelation } from '../media/orgs'
import { MEDIA_ORDER } from '../media/orgs'
import { mediaIdentity } from '../../data/mediaIdentity'
import type { GameState, Id } from '../types'
import { officeOf, once } from './state'
import { OFFICE_LIMITS, type Relation } from './types'

export type RelCategory = 'promoter' | 'venue' | 'media'
export const relKey = (cat: RelCategory, id: Id): string => `${cat}:${id}`

const clamp = (v: number, lo = -100, hi = 100) => Math.max(lo, Math.min(hi, v))

/** Current standing with a counterpart (media outlets are read from the media world's own book). */
export function relation(state: GameState, cat: RelCategory, id: Id): number {
  if (cat === 'media') return state.media ? mediaRelation(state.media, id, state.playerPromotionId) : 0
  return state.office?.rel[relKey(cat, id)]?.v ?? 0
}

/** Move a relationship for a recorded reason. `eventKey` makes the effect idempotent. Returns whether it was applied. */
export function shiftRelation(state: GameState, cat: Exclude<RelCategory, 'media'>, id: Id, delta: number, why: string, eventKey: string): boolean {
  if (!once(state, eventKey)) return false
  const o = officeOf(state)
  const k = relKey(cat, id)
  const r: Relation = (o.rel[k] ??= { v: 0, log: [] })
  r.v = Math.round(clamp(r.v + delta) * 10) / 10
  r.log.unshift({ day: state.today, delta: Math.round(delta * 10) / 10, why })
  if (r.log.length > OFFICE_LIMITS.relLog) r.log.length = OFFICE_LIMITS.relLog
  // Bounded: drop the quietest neutral entries first.
  const keys = Object.keys(o.rel)
  if (keys.length > OFFICE_LIMITS.rel) {
    keys.sort((a, b) => Math.abs(o.rel[a].v) - Math.abs(o.rel[b].v))
    for (const x of keys) { if (Object.keys(o.rel).length <= OFFICE_LIMITS.rel) break; if (x !== k) delete o.rel[x] }
  }
  return true
}

/** Once a quarter every relationship eases a tenth of the way back to neutral; empty ones are dropped. */
export function easeRelations(state: GameState): void {
  const o = state.office
  if (!o) return
  for (const [k, r] of Object.entries(o.rel)) {
    r.v = Math.round(r.v * 0.9 * 10) / 10
    if (Math.abs(r.v) < 1) delete o.rel[k]
  }
}

export type Standing = 'Excellent' | 'Good' | 'Cordial' | 'Neutral' | 'Strained' | 'Hostile'
export const standingOf = (v: number): Standing => (v >= 45 ? 'Excellent' : v >= 20 ? 'Good' : v >= 6 ? 'Cordial' : v > -6 ? 'Neutral' : v > -30 ? 'Strained' : 'Hostile')

/** A multiplier near 1 that a relationship tilts (never beyond +-`span`): friendly counterparts flex a little, hostile ones a little less. */
export const tilt = (v: number, span: number): number => 1 + clamp(v, -60, 60) / 60 * span

// ------------------------------------------------------------------------------------------------ Views

export interface RelationRow { key: string; category: 'Promoter' | 'Venue' | 'Broadcaster' | 'Manager'; name: string; standing: Standing; trend: 'up' | 'down' | 'steady'; reasons: { day: number; text: string }[]; effect: string }

const EFFECT: Record<RelationRow['category'], string> = {
  Promoter: 'How often they bring you fights, and how much room they give in a negotiation.',
  Venue: 'What the building charges you to hire it.',
  Broadcaster: 'How readily they cover your shows and fighters.',
  Manager: 'How much patience a camp gives you at the table.',
}

/** Everything the player has a standing with, strongest feeling first. Public: names, a word for the standing and the reasons. */
export function relationRows(state: GameState): RelationRow[] {
  const rows: RelationRow[] = []
  const o = state.office
  for (const [k, r] of Object.entries(o?.rel ?? {})) {
    const [cat, id] = k.split(':') as [RelCategory, Id]
    const name = cat === 'promoter' ? state.promotions[id]?.name : state.venues[id]?.name
    if (!name) continue
    const last = r.log[0]
    rows.push({ key: k, category: cat === 'promoter' ? 'Promoter' : 'Venue', name, standing: standingOf(r.v), trend: !last ? 'steady' : last.delta > 0 ? 'up' : 'down', reasons: r.log.map((x) => ({ day: x.day, text: x.why })), effect: EFFECT[cat === 'promoter' ? 'Promoter' : 'Venue'] })
  }
  if (state.media) {
    for (const id of MEDIA_ORDER) {
      const v = mediaRelation(state.media, id, state.playerPromotionId)
      if (Math.abs(v) < 6) continue
      rows.push({ key: `media:${id}`, category: 'Broadcaster', name: mediaIdentity(id).name, standing: standingOf(v), trend: 'steady', reasons: [], effect: EFFECT.Broadcaster })
    }
  }
  const neg = state.business?.neg ?? {}
  for (const [fid, n] of Object.entries(neg)) {
    const f = state.fighters[fid]
    const mine = f?.contractId && state.contracts[f.contractId]?.promotionId === state.playerPromotionId
    if (!f || !mine || ((n.kept ?? 0) === 0 && (n.broken ?? 0) === 0)) continue
    const v = (n.kept ?? 0) * 12 - (n.broken ?? 0) * 25
    rows.push({ key: `mgr:${fid}`, category: 'Manager', name: `${f.firstName} ${f.lastName}'s camp`, standing: standingOf(v), trend: 'steady', reasons: [...((n.broken ?? 0) ? [{ day: n.lastDay, text: `${n.broken} broken promise${n.broken === 1 ? '' : 's'}` }] : []), ...((n.kept ?? 0) ? [{ day: n.lastDay, text: `${n.kept} promise${n.kept === 1 ? '' : 's'} kept` }] : [])], effect: EFFECT.Manager })
  }
  const weight = (r: RelationRow) => ({ Excellent: 3, Good: 2, Cordial: 1, Neutral: 0, Strained: -2, Hostile: -3 }[r.standing])
  return rows.sort((a, b) => Math.abs(weight(b)) - Math.abs(weight(a)) || (a.name < b.name ? -1 : 1))
}

/** What a venue charges the player, tilted by how it feels about them: up to 5% off for a warm relationship, up to 5% extra for a cold one. */
export function venueTilt(state: GameState, venueId: Id): number {
  const v = state.office?.rel[relKey('venue', venueId)]?.v ?? 0
  return 1 - clamp(v, -60, 60) / 60 * 0.05
}
