/**
 * Media messages in the player's inbox. They use the media block's own ids (not the game's id counter), so the media world can
 * never shift an engine id — and therefore never change an engine result.
 */
import { DAYS_PER_WEEK } from '../calendar'
import { MAX_INBOX } from '../config'
import type { GameState, InboxMessage } from '../types'
import type { MediaState } from './types'
import { nextId } from './util'

type NewMsg = Omit<InboxMessage, 'id' | 'day' | 'read'> & { cooldownWeeks?: number }

export function mediaMessage(state: GameState, media: MediaState, m: NewMsg): InboxMessage | null {
  if (m.key) {
    const cutoff = state.today - (m.cooldownWeeks ?? 8) * DAYS_PER_WEEK
    if (state.inbox.some((x) => x.key === m.key && x.day > cutoff)) return null
  }
  const { cooldownWeeks: _cw, ...rest } = m
  void _cw
  const msg: InboxMessage = { ...rest, id: nextId(media, 'mm'), day: state.today, read: false }
  state.inbox.unshift(msg)
  if (state.inbox.length > MAX_INBOX) state.inbox.length = MAX_INBOX
  return msg
}
