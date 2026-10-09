/**
 * WILL THE CHAMPION'S CAMP TAKE THE FIGHT? A voluntary title challenge is a business decision for the champion: they take a challenger
 * who is a credible, bankable opponent and decline one who is not. A challenge the board has ordered (the mandatory challenger, an
 * eliminator winner) is never declined. The decision is a deterministic roll against a probability built from PUBLIC facts only
 * (career value, where the challenger stands on the list, records, how long the champion has gone without defending). The roll is fixed
 * for a quarter, so asking again straight away gets the same answer; it is never shown, only an outlook ("strong case" … "long shot").
 */
import { keyedFloat } from '../rng'
import { fighterName } from '../fighters'
import { weeksBetween } from '../calendar'
import { rankIn } from '../media/rankings'
import { titleKey } from '../media/titles'
import { careerValue } from './marketValue'
import { TITLE_DEF_BY_ID } from './titleDefs'
import type { GameState, Id, WeightClassId } from '../types'

export type Outlook = 'strong' | 'fair' | 'weak'
export interface CampResponse { accept: boolean; ordered: boolean; outlook: Outlook | null; reason: string | null }

const valueCache = new WeakMap<object, { day: number; m: Map<Id, number> }>()
function valueOf(state: GameState, id: Id): number {
  const media = state.media!
  let c = valueCache.get(media)
  if (!c || c.day !== state.today) { c = { day: state.today, m: new Map() }; valueCache.set(media, c) }
  let v = c.m.get(id)
  if (v === undefined) { v = careerValue(state, state.fighters[id]); c.m.set(id, v) }
  return v
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/** `bodies` are the belts on the line in this pairing; `champId` is the champion whose camp is being asked, `challId` the one asking. */
export function championCampResponse(state: GameState, champId: Id, challId: Id, wc: WeightClassId, bodies: string[]): CampResponse {
  const media = state.media
  const champ = state.fighters[champId], chall = state.fighters[challId]
  if (!media?.effects || !champ || !chall) return { accept: true, ordered: false, outlook: null, reason: null }
  const recs = bodies.map((b) => ({ b, rec: media.titles[titleKey(b, wc)] })).filter((x) => x.rec?.c === champId)
  if (recs.length === 0) return { accept: true, ordered: false, outlook: null, reason: null } // the champion is not the one being asked (a vacant belt, say)
  // A fight that is a mandatory defence of ANY of the belts on the line is the board's order: it cannot be turned down.
  if (recs.some((x) => x.rec!.mand?.challenger === challId)) return { accept: true, ordered: true, outlook: 'strong', reason: null }

  const r = valueOf(state, challId) / Math.max(1, valueOf(state, champId))
  const strength = clamp((r - 0.5) / 0.45, 0, 1)
  let rank = 1, limit = 1, idle = 0
  for (const x of recs) {
    const d = TITLE_DEF_BY_ID[x.b]
    const rk = rankIn(media, x.b, wc, challId) ?? d.challengerLimit
    if (rk >= rank) { rank = Math.max(1, rk); limit = d.challengerLimit }
    idle = Math.max(idle, weeksBetween(Math.max(x.rec!.lastFight, x.rec!.since), state.today) / d.mandatoryAfterWeeks)
  }
  const rankTerm = limit <= 1 ? 1 : 1 - (rank - 1) / limit
  let p = 0.08 + 0.62 * strength + 0.15 * rankTerm + (idle >= 0.6 ? 0.15 : idle >= 0.35 ? 0.07 : 0)
  if (chall.record.wins < 0.5 * champ.record.wins) p *= 0.6 // far less proven than the man they would be fighting
  p = clamp(p, 0.05, 0.92)
  const roll = keyedFloat(state.seed, 'titleAccept', champId, challId, Math.floor(state.today / 91))
  const outlook: Outlook = p >= 0.6 ? 'strong' : p >= 0.35 ? 'fair' : 'weak'
  const reason = r < 0.7 ? 'they want a bigger name before they put the belt on the line' : rankTerm < 0.5 ? 'they want a higher-ranked challenger' : 'they are not interested in that fight right now'
  return { accept: roll < p, ordered: false, outlook, reason: roll < p ? null : `${fighterName(champ)}’s camp has turned the challenge down — ${reason}` }
}
