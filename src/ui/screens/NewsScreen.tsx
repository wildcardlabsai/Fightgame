import { useMemo, useState } from 'react'
import { newsKind, NEWS_KIND_LABEL } from '../../assets/registry'
import { useGame } from '../../store/gameStore'
import { NewsCard } from '../visual/NewsCard'

/** Every headline the world has produced, newest first, with the same image cards as the dashboard. */
export function NewsScreen() {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const [cat, setCat] = useState<string>('all')
  const kinds = useMemo(() => [...new Set(game.news.map((n) => newsKind(n)))], [game.news])
  const list = game.news.filter((n) => cat === 'all' || newsKind(n) === cat).slice(0, 80)
  return (
    <>
      <div className="page-head"><div><h1 className="display">Boxing news</h1><p className="sub">Signings, results, retirements and business from across the sport — every headline comes from something that actually happened.</p></div></div>
      <div className="tabs" role="tablist">
        {['all', ...kinds].map((k) => <button key={k} role="tab" aria-selected={cat === k} className={`tab${cat === k ? ' active' : ''}`} onClick={() => setCat(k)}>{k === 'all' ? 'All' : NEWS_KIND_LABEL[k as keyof typeof NEWS_KIND_LABEL]}</button>)}
      </div>
      {list.length === 0 ? <p className="empty">The world is quiet. Advance time and the headlines will follow.</p> : (
        <div className="v-news-grid">
          {list.map((n) => <NewsCard key={n.id} n={n} breaking={game.today - n.day <= 14 && ['knockout', 'upset', 'championship', 'comeback'].includes(newsKind(n))} onClick={n.fightId || n.eventId || n.fighterId ? () => (n.eventId ? navigate('event', n.eventId) : n.fightId ? navigate('fight', n.fightId) : navigate('fighter', n.fighterId!)) : undefined} />)}
        </div>
      )}
    </>
  )
}
