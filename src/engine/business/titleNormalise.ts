/**
 * Repairs a title state that the old rules let drift (v9 → v10 saves): a fighter holding belts of two levels in one division, a champion
 * who has retired or left the division, a booked title fight whose length or belts no longer follow the rules. History is preserved:
 * reigns are closed with an explicit reason, never deleted or rewritten, and nothing legitimate is touched (several world belts, or
 * British and Commonwealth together, stay exactly as they are). Idempotent: a healthy state is returned unchanged.
 */
import { settleRounds } from './fightRounds'
import { flushRecords } from '../media/records'
import { enforceHierarchy, higherBeltOf, vacateTitle } from '../media/titles'
import { levelOf, levelRank } from './titleDefs'
import type { GameState } from '../types'

export interface NormaliseReport { closed: number; vacated: number; flagsFixed: number; roundsFixed: number }

export function normaliseTitles(state: GameState): NormaliseReport {
  const rep: NormaliseReport = { closed: 0, vacated: 0, flagsFixed: 0, roundsFixed: 0 }
  const media = state.media
  if (!media) return rep
  const queue = (media.queue ??= [])
  // Champions who are retired or no longer fight in the belt's division give the belt up, with the reason on the record.
  for (const [k, rec] of Object.entries(media.titles)) {
    if (!rec.c) continue
    const [body, wc] = k.split('|')
    const f = state.fighters[rec.c]
    if (!f) continue
    if (f.status === 'retired') { queue.push(...vacateTitle(state, media, body, wc as never, 'retired as champion')); rep.vacated++ }
    else if (f.weightClass !== wc) { queue.push(...vacateTitle(state, media, body, wc as never, `relinquished — moved from ${wc} to ${f.weightClass}`)); rep.vacated++ }
  }
  const ev = enforceHierarchy(state, media)
  queue.push(...ev)
  rep.closed = ev.length
  // Booked title fights: drop belts the ladder of levels no longer lets these two contest, then fix the length.
  for (const fight of Object.values(state.fights)) {
    if (fight.result) continue
    const bodies = media.titleFights?.[fight.id]
    if (bodies && fight.title) {
      const ok = bodies.filter((b) => !higherBeltOf(media, fight.sideA.fighterId, fight.weightClass, levelOf(b)) && !higherBeltOf(media, fight.sideB.fighterId, fight.weightClass, levelOf(b)))
      const top = ok.length ? Math.max(...ok.map((b) => levelRank(levelOf(b)))) : 0
      const keep = ok.filter((b) => levelRank(levelOf(b)) === top)
      if (keep.length !== bodies.length) {
        rep.flagsFixed++
        if (keep.length) { media.titleFights[fight.id] = keep; fight.title = { ...fight.title, bodies: keep, level: levelOf(keep[0]) } }
        else { delete media.titleFights[fight.id]; fight.title = undefined }
      }
    }
    if (['negotiating', 'agreed', 'scheduled', 'training'].includes(fight.status)) {
      const before = fight.scheduledRounds
      settleRounds(state, fight)
      if (fight.scheduledRounds !== before) rep.roundsFixed++
    }
  }
  flushRecords(media) // closed reigns are written into the save now, not at the next weekly pass
  return rep
}
