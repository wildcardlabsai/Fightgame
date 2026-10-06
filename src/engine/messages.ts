import { DAYS_PER_WEEK } from './calendar'
import type { GameState, InboxMessage, NewsItem } from './types'
import { MAX_INBOX, MAX_NEWS } from './config'
import { discover } from './knowledge'

type NewMessage = Omit<InboxMessage, 'id' | 'day' | 'read'> & { cooldownWeeks?: number }

/** Post an inbox message. If `key` is set, skips when the same key was posted within the cooldown. */
export function postMessage(state: GameState, m: NewMessage): InboxMessage | null {
  if (m.key) {
    const cutoff = state.today - (m.cooldownWeeks ?? 12) * DAYS_PER_WEEK
    if (state.inbox.some((x) => x.key === m.key && x.day > cutoff)) return null
  }
  const { cooldownWeeks: _cw, ...rest } = m
  void _cw
  state.idCounter += 1
  const msg: InboxMessage = { ...rest, id: `m_${state.idCounter.toString(36)}`, day: state.today, read: false }
  state.inbox.unshift(msg)
  if (state.inbox.length > MAX_INBOX) state.inbox.length = MAX_INBOX
  return msg
}

export function postNews(state: GameState, n: Omit<NewsItem, 'id' | 'day'>): NewsItem {
  state.idCounter += 1
  const item: NewsItem = { ...n, id: `n_${state.idCounter.toString(36)}`, day: state.today }
  state.news.unshift(item)
  if (n.fighterId && state.fighters[n.fighterId]) discover(state, n.fighterId, 'tip') // headlines put names on your radar
  if (state.news.length > MAX_NEWS) state.news.length = MAX_NEWS
  return item
}
