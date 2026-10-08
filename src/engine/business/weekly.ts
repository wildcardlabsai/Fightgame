/**
 * Weekly business processing: pathway promises are settled, conversations that went cold lapse, bounded records are trimmed.
 * Cheap by construction (a handful of open talks and promises); it never touches the engine’s RNG or id counter.
 */
import type { GameState } from '../types'
import { processCommitments } from './commitments'
import { pruneTitleHistory } from './titleHistory'
import { trimTalks } from './talkCore'
import { aiDivisionMoves } from './divisions'

const TALK_IDLE_DAYS = 28

export function processBusiness(state: GameState): void {
  aiDivisionMoves(state)
  const b = state.business
  if (!b) return
  processCommitments(state)
  for (const t of Object.values(b.talks)) {
    if (t.status !== 'open') continue
    const last = t.log.length ? t.log[t.log.length - 1].day : t.openedDay
    const fight = t.fightId ? state.fights[t.fightId] : undefined
    const fightGone = t.kind === 'fight' && (!fight || fight.status !== 'negotiating')
    const f = state.fighters[t.fighterId]
    const gone = !f || f.status === 'retired' || (t.kind === 'contract' && t.contractKind === 'signing' && !!f.contractId)
    if (fightGone || gone || state.today - last > TALK_IDLE_DAYS) { t.status = 'withdrawn'; t.closedDay = state.today }
  }
  if (Math.floor((state.today - state.startDay) / 7) % 13 === 0) { trimTalks(state); pruneTitleHistory(state) }
}
