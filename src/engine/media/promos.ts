/**
 * PROMOTION REPUTATION. Four public dimensions beside the engine's own reputation number, and reputation tags that are only ever
 * awarded for behaviour that can be counted from real events, fights and finances.
 */
import { rosterAvg } from './promoStats'
import type { GameState, Id } from '../types'
import type { MediaState, PromotionMedia } from './types'
import { clampTo } from './util'

const TAGS = {
  great: 'Great fights', big: 'Big events', cheap: 'Cheap cards', prospects: 'Develops prospects', controversial: 'Controversial matchmaking', production: 'Excellent production', finance: 'Poor financial management',
}

export function promoMediaOf(media: MediaState, id: Id): PromotionMedia {
  return media.promotions[id] ?? { sporting: 50, media: 50, fan: 50, commercial: 50, tags: [], mentions: 0 }
}

/** Every four weeks: refresh each promotion's reputation dimensions and tags from what it has actually done. */
export function updatePromotionMedia(state: GameState, media: MediaState): void {
  for (const p of Object.values(state.promotions)) {
    const cur = (media.promotions[p.id] ??= { sporting: 50, media: 50, fan: 50, commercial: 50, tags: [], mentions: 0 })
    const evs = Object.values(state.events).filter((e) => e.promotionId === p.id && e.result)
    const recent = evs.sort((a, b) => b.day - a.day).slice(0, 6)
    const roster = rosterAvg(state, p.id)
    cur.sporting = Math.round(clampTo(0.45 * p.reputation + 0.55 * roster.rep, 0, 100))
    cur.mentions = Math.round(cur.mentions * 0.9 * 10) / 10
    cur.media = Math.round(clampTo(0.45 * p.reputation + Math.min(45, cur.mentions * 3), 0, 100))
    cur.fan = Math.round(clampTo(Math.log10(Math.max(100, p.fanbase)) * 17 - 22, 0, 100))
    const profit = recent.reduce((n, e) => n + (e.result?.profit ?? 0), 0)
    cur.commercial = Math.round(clampTo(25 + Math.log10(Math.max(1, p.stats.revenue)) * 6.5 + (profit > 0 ? 8 : profit < 0 ? -6 : 0), 0, 100))
    const tags: string[] = []
    if (recent.length >= 3 && p.stats.form >= 62) tags.push(TAGS.great)
    if (p.stats.bestAttendance >= 5000) tags.push(TAGS.big)
    if (recent.length >= 3 && recent.reduce((n, e) => n + (e.result?.cardQuality ?? 0), 0) / recent.length < 35) tags.push(TAGS.cheap)
    if (roster.youngWinners >= 3) tags.push(TAGS.prospects)
    const lopsided = Object.values(state.fights).filter((f) => f.organiserId === p.id && f.result && (f.result.pExpA < 0.12 || f.result.pExpA > 0.88) && state.today - f.day < 182).length
    if (lopsided >= 3) tags.push(TAGS.controversial)
    if (recent.length >= 3 && recent.reduce((n, e) => n + state.venues[e.venueId].production, 0) / recent.length >= 4) tags.push(TAGS.production)
    const troubled = p.isPlayer ? p.cash < 0 : !!p.ai && ['struggling', 'critical', 'insolvent'].includes(p.ai.fin.state)
    if (troubled) tags.push(TAGS.finance)
    cur.tags = tags
  }
}
