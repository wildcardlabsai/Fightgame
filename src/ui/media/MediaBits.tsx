import type { ReactNode } from 'react'
import type { NarrativeView, OrgBadge, RivalryView, StoryView, TrendingView, VideoView } from '../../engine/media/views'
import { useGame } from '../../store/gameStore'

const initials = (s: string) => s.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase()

/** The outlet's mark: its logo asset when one is installed, otherwise a monogram in its brand colour. */
export function OrgMark({ org, size = 28 }: { org: { name: string; shortName: string; colour: string; accent: string }; size?: number }) {
  return (
    <span className="m-mark" style={{ width: size, height: size, background: org.colour, color: org.accent, fontSize: Math.round(size * 0.38) }} aria-hidden="true">
      {initials(org.shortName)}
    </span>
  )
}

export const ago = (weeks: number): string => (weeks <= 0 ? 'THIS WEEK' : weeks === 1 ? '1 WK AGO' : `${weeks} WKS AGO`)

const PRIORITY_LABEL: Record<string, string> = { BREAKING: 'BREAKING', MAJOR: 'MAJOR', FEATURE: 'FEATURE', NEWS: 'NEWS', RUMOUR: 'RUMOUR' }
const KIND_TAG: Record<string, string> = {
  FIGHT_RESULT: 'RESULT', UPSET: 'UPSET', KNOCKOUT: 'KNOCKOUT', WAR: 'WAR', TITLE_CHANGE: 'NEW CHAMPION', TITLE_DEFENCE: 'TITLE DEFENCE', TITLE_FIGHT_SET: 'TITLE SHOT', CONTROVERSIAL_DECISION: 'CONTROVERSY',
  UNBEATEN_FELL: 'UNBEATEN NO MORE', PROSPECT_BREAKOUT: 'RISING', COMEBACK: 'COMEBACK', RETIREMENT: 'RETIREMENT', SIGNING: 'SIGNING', RELEASE: 'RELEASE', RANKING_CHANGE: 'RATINGS', MANDATORY: 'MANDATORY',
  SELL_OUT: 'SELL-OUT', RECORD_CROWD: 'RECORD CROWD', PPV_SUCCESS: 'PPV', PPV_FAILURE: 'PPV', BROADCAST_DEAL: 'BROADCAST', WEIGH_IN: 'WEIGH-IN', CALL_OUT: 'CALL-OUT', RIVALRY: 'RIVALRY', FIGHT_ANNOUNCED: 'MADE',
  PRESS_CONFERENCE: 'PRESS', VIRAL: 'VIRAL', AWARD: 'AWARD', EVENT_CANCELLED: 'CANCELLED', FEATURE: 'FEATURE', STRIPPED: 'STRIPPED', TITLE_VACANT: 'VACANT',
}
export const kindTag = (k: string) => KIND_TAG[k] ?? k

/** Opens whatever the story is about: the fight, then the show, then the first fighter. */
export function useOpenStory() {
  const navigate = useGame((s) => s.navigate)
  return (s: StoryView) => {
    if (s.fightId) navigate('fight', s.fightId)
    else if (s.eventId) navigate('event', s.eventId)
    else if (s.people[0]) navigate('fighter', s.people[0].id)
  }
}

export function StoryCard({ s, variant = 'row', onOpen }: { s: StoryView; variant?: 'lead' | 'row' | 'compact'; onOpen?: () => void }) {
  const Tag = onOpen ? 'button' : 'div'
  return (
    <Tag className={`m-story ${variant} p-${s.priority.toLowerCase()}${s.breaking ? ' brk' : ''}`} {...(onOpen ? { onClick: onOpen, type: 'button' as const } : {})} data-testid={variant === 'lead' ? 'story-lead' : 'story'} data-kind={s.kind}>
      <span className="m-story-top">
        {s.breaking ? <span className="m-flag brk">BREAKING</span> : <span className={`m-flag ${s.priority.toLowerCase()}`}>{PRIORITY_LABEL[s.priority]}</span>}
        <span className="m-tag">{kindTag(s.kind)}</span>
        <span className="m-when">{ago(s.weeksAgo)}</span>
      </span>
      <span className="m-head display">{s.headline}</span>
      {variant !== 'compact' && s.sub && <span className="m-sub">{s.sub}</span>}
      {variant === 'lead' && <span className="m-body">{s.body}</span>}
      <span className="m-by"><OrgMark org={s.org} size={20} /><b>{s.org.name}</b>{variant !== 'compact' && s.reach > 0 && <span className="dim"> · reach {s.reach >= 1_000_000 ? `${(s.reach / 1_000_000).toFixed(1)}m` : `${Math.round(s.reach / 1000)}k`}</span>}</span>
    </Tag>
  )
}

export function VideoCard({ v }: { v: VideoView }) {
  const navigate = useGame((s) => s.navigate)
  const open = v.fightId ? () => navigate('fight', v.fightId!) : undefined
  const Tag = open ? 'button' : 'div'
  return (
    <Tag className={`m-video${v.viralScore >= 72 ? ' viral' : ''}`} {...(open ? { onClick: open, type: 'button' as const } : {})} data-testid="video">
      <span className="m-thumb" style={{ background: `linear-gradient(135deg, ${v.org.colour}, #0b0b10 80%)` }}>
        <span className="m-play" aria-hidden="true">▶</span>
        <span className="m-vtype">{v.type}</span>
        {v.viralScore >= 72 && <span className="m-viral">VIRAL</span>}
      </span>
      <span className="m-vtitle">{v.title}</span>
      <span className="m-vmeta"><OrgMark org={v.org} size={16} /> {v.org.shortName} · <b className="num">{v.views.toLocaleString('en-GB')}</b> views · {ago(v.weeksAgo)}</span>
    </Tag>
  )
}

export function NarrativeRow({ n }: { n: NarrativeView }) {
  const navigate = useGame((s) => s.navigate)
  return (
    <button type="button" className="m-narr" onClick={() => n.fighterIds[0] && navigate('fighter', n.fighterIds[0])} data-testid="narrative">
      <span className={`m-ntype t-${n.type.toLowerCase()}`}>{n.label}</span>
      <span className="m-nline">{n.line}</span>
      <span className="m-nmeta"><span className={`m-trend ${n.trend.toLowerCase()}`}>{n.trend === 'RISING' ? '▲' : n.trend === 'FADING' ? '▼' : '●'} {n.trend}</span><span className="dim">strength {n.strength} · {n.weeks} wk{n.weeks === 1 ? '' : 's'}</span></span>
    </button>
  )
}

export function RivalryRow({ r }: { r: RivalryView }) {
  const navigate = useGame((s) => s.navigate)
  return (
    <div className="m-riv" data-testid="rivalry">
      <button type="button" className="linkbtn" onClick={() => navigate('fighter', r.a)}>{r.aName}</button>
      <span className="m-vs">VS</span>
      <button type="button" className="linkbtn" onClick={() => navigate('fighter', r.b)}>{r.bName}</button>
      <span className={`m-heat h-${r.label.toLowerCase()}`}>{r.label}</span>
      <span className="m-bar" role="img" aria-label={`Rivalry strength ${r.strength} of 100`}><i style={{ width: `${r.strength}%` }} /></span>
    </div>
  )
}

export function TrendingRow({ t, rank }: { t: TrendingView; rank: number }) {
  const navigate = useGame((s) => s.navigate)
  return (
    <button type="button" className="m-trend-row" onClick={() => navigate('fighter', t.id)} data-testid="trending">
      <span className="m-rankn num">{rank}</span>
      <span className="m-tname"><b>{t.name}</b>{t.mine && <span className="chip gold">YOURS</span>}<small>{t.division}{t.rank ? ` · ${t.rank}` : ''}</small></span>
      <span className={`m-trend ${t.trend.toLowerCase()}`}>{t.trend === 'HOT' ? '🔥 HOT' : t.trend === 'RISING' ? '▲ RISING' : t.trend === 'COOLING' ? '▼ COOLING' : '● STEADY'}</span>
      <span className="num m-int" title="Media interest">{t.interest}</span>
    </button>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'red' | 'gold' }) {
  return <div className={`m-stat${tone ? ` ${tone}` : ''}`}><span className="caps">{label}</span><b className="num">{value}</b>{sub && <small>{sub}</small>}</div>
}

export type { OrgBadge }
