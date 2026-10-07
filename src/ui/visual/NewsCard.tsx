import { NEWS_KIND_LABEL, newsKind, resolveNewsImage } from '../../assets/registry'
import { formatDay } from '../../engine/calendar'
import type { NewsItem } from '../../engine/types'
import { Img } from './Img'

const KIND_TONE: Record<string, string> = { signing: '#16301f', knockout: '#3a0a10', championship: '#3a2a08', retirement: '#22222c', comeback: '#0f2a3a', injury: '#3a1a08', upset: '#2a0f3a', rivalry: '#3a0a14', press: '#1b2a3a', 'sold-out': '#331a1a', contract: '#2a2410', media: '#1a1a2e', training: '#0f2a1c', milestone: '#2a1a05', business: '#1b2a22', world: '#10202a' }

/** News card: category image, category chip, headline, optional summary, date. Pure presentation of one NewsItem. */
export function NewsCard({ n, summary, compact, onClick, breaking }: { n: NewsItem; summary?: string; compact?: boolean; onClick?: () => void; breaking?: boolean }) {
  const a = resolveNewsImage(n)
  const kind = newsKind(n)
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={`v-news${compact ? ' compact' : ''}${onClick ? ' clickable' : ''}`} {...(onClick ? { onClick, type: 'button' as const } : {})} data-news-kind={kind} data-asset-state={a.state}>
      <span className="v-news-img"><Img src={a.url} alt="" width={a.width || 640} height={a.height || 360} fallback={<span className="v-news-fb" style={{ background: `linear-gradient(135deg, ${KIND_TONE[kind]}, #07070a)` }} />} /></span>
      <span className="v-news-body">
        <span className="v-news-meta">{breaking && <span className="chip news-breaking">BREAKING</span>}<span className={`chip news-kind k-${kind}`}>{NEWS_KIND_LABEL[kind]}</span><span className="dim">{formatDay(n.day, false)}</span></span>
        <span className="v-news-head">{n.headline}</span>
        {summary && !compact && <span className="v-news-sum dim">{summary}</span>}
      </span>
    </Tag>
  )
}
