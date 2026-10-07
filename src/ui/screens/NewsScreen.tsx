import { useMemo, useState } from 'react'
import { newsKind, NEWS_KIND_LABEL } from '../../assets/registry'
import { storiesList } from '../../engine/media/views'
import { useGame } from '../../store/gameStore'
import { StoryCard, useOpenStory } from '../media/MediaBits'
import { NewsCard } from '../visual/NewsCard'

const FILTERS = [{ id: 'all', label: 'All' }, { id: 'BREAKING', label: 'Breaking' }, { id: 'MAJOR', label: 'Major' }, { id: 'FEATURE', label: 'Features' }, { id: 'NEWS', label: 'News' }, { id: 'wire', label: 'Wire' }] as const

/**
 * Every headline the world has produced, newest first. Stories written by the outlets (BREAKING / MAJOR / FEATURE / NEWS) lead;
 * the plain wire items from the game's own news feed follow, minus any that an outlet has already covered.
 */
export function NewsScreen() {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const open = useOpenStory()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const stories = useMemo(() => storiesList(game, { limit: 120 }), [game])
  const covered = useMemo(() => new Set(stories.flatMap((s) => [s.fightId, s.eventId]).filter(Boolean) as string[]), [stories])
  const wire = useMemo(() => game.news.filter((n) => !(n.fightId && covered.has(n.fightId)) && !(n.eventId && covered.has(n.eventId))).slice(0, 60), [game.news, covered])
  const shown = filter === 'wire' ? [] : stories.filter((s) => filter === 'all' || s.priority === filter)
  const showWire = filter === 'all' || filter === 'wire'
  const lead = filter === 'all' || filter === 'BREAKING' ? shown.find((s) => s.breaking) ?? null : null
  const rest = shown.filter((s) => s.id !== lead?.id)
  const empty = !lead && rest.length === 0 && (!showWire || wire.length === 0)
  const kinds = useMemo(() => [...new Set(wire.map((n) => newsKind(n)))], [wire])
  return (
    <>
      <div className="page-head"><div><h1 className="display">Boxing news</h1><p className="sub">Signings, results, rankings and business from across the sport — every headline comes from something that actually happened.</p></div></div>
      <div className="tabs" role="tablist" aria-label="News priority">
        {FILTERS.map((f) => <button key={f.id} role="tab" aria-selected={filter === f.id} className={`tab${filter === f.id ? ' active' : ''}`} onClick={() => setFilter(f.id)} data-testid={`news-${f.id}`}>{f.label}</button>)}
      </div>
      {empty ? <p className="empty">The world is quiet. Advance time and the headlines will follow.</p> : (
        <>
          {lead && <StoryCard s={lead} variant="lead" onOpen={() => open(lead)} />}
          {rest.length > 0 && <div className="m-list" data-testid="news-stories">{rest.map((s) => <StoryCard key={s.id} s={s} onOpen={() => open(s)} />)}</div>}
          {showWire && wire.length > 0 && (
            <>
              <h2 className="m-sec display">From the wire {kinds.length > 0 && <small>{kinds.map((k) => NEWS_KIND_LABEL[k as keyof typeof NEWS_KIND_LABEL]).slice(0, 4).join(' · ')}</small>}</h2>
              <div className="v-news-grid">{wire.map((n) => <NewsCard key={n.id} n={n} onClick={n.fightId || n.eventId || n.fighterId ? () => (n.eventId ? navigate('event', n.eventId) : n.fightId ? navigate('fight', n.fightId) : navigate('fighter', n.fighterId!)) : undefined} />)}</div>
            </>
          )}
        </>
      )}
    </>
  )
}
