import { useMemo, useState } from 'react'
import { formatDay } from '../../engine/calendar'
import { awardsList, mediaHome, rankingView, reignsList, type OfferView, type PressView, type RequestView } from '../../engine/media/views'
import { useGame } from '../../store/gameStore'
import { money } from '../format'
import { NarrativeRow, OrgMark, RivalryRow, StoryCard, TrendingRow, VideoCard, ago, useOpenStory } from '../media/MediaBits'

const TABS = [
  { id: 'newsroom', label: 'Newsroom' }, { id: 'waiting', label: 'Waiting on you' }, { id: 'video', label: 'Video' },
  { id: 'storylines', label: 'Storylines' }, { id: 'outlets', label: 'Outlets' }, { id: 'awards', label: 'Awards' },
] as const
type Tab = (typeof TABS)[number]['id']

export function MediaScreen({ tab: param }: { tab?: string }) {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const home = useMemo(() => mediaHome(game), [game])
  const tab: Tab = (TABS.find((t) => t.id === param)?.id ?? 'newsroom') as Tab
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="display">Media</h1>
          <p className="sub">The boxing newsroom: what the press is saying about your fighters, your shows and the sport — every story comes from something that really happened.</p>
        </div>
        {home.openRequests > 0 && <button className="btn primary" onClick={() => navigate('media', 'waiting')} data-testid="media-waiting">{home.openRequests} waiting on you ▸</button>}
      </div>
      <div className="tabs" role="tablist" aria-label="Media sections">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab${tab === t.id ? ' active' : ''}`} onClick={() => navigate('media', t.id === 'newsroom' ? undefined : t.id)} data-testid={`media-tab-${t.id}`}>
            {t.label}{t.id === 'waiting' && home.openRequests > 0 ? ` (${home.openRequests})` : ''}
          </button>
        ))}
      </div>
      {tab === 'newsroom' && <Newsroom home={home} />}
      {tab === 'waiting' && <Waiting home={home} />}
      {tab === 'video' && <VideoTab home={home} />}
      {tab === 'storylines' && <Storylines home={home} />}
      {tab === 'outlets' && <Outlets home={home} />}
      {tab === 'awards' && <AwardsTab />}
    </>
  )
}

type Home = ReturnType<typeof mediaHome>

function Newsroom({ home }: { home: Home }) {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const open = useOpenStory()
  const ring = useMemo(() => rankingView(game, 'ringside', 'heavyweight'), [game])
  if (!home.lead) return <p className="empty" data-testid="newsroom-empty">The press are waiting for something to write about. Fights, shows, signings and rankings all become stories — advance time and check back.</p>
  return (
    <div className="m-room" data-testid="newsroom">
      <div className="m-main">
        {home.breaking.length > 0 && <div className="m-brkbar" role="status">{home.breaking.map((b) => <button key={b.id} type="button" onClick={() => open(b)}><b>BREAKING</b> {b.headline}</button>)}</div>}
        <StoryCard s={home.lead} variant="lead" onOpen={() => open(home.lead!)} />
        <h2 className="m-sec display">Latest</h2>
        <div className="m-list">{home.latest.map((s) => <StoryCard key={s.id} s={s} onOpen={() => open(s)} />)}</div>
      </div>
      <aside className="m-side" aria-label="Trending and ratings">
        <section>
          <h2 className="m-sec display">Trending</h2>
          {home.trending.length === 0 ? <p className="dim">Nobody is making noise yet.</p> : home.trending.map((t, i) => <TrendingRow key={t.id} t={t} rank={i + 1} />)}
        </section>
        <section>
          <h2 className="m-sec display">Rivalries</h2>
          {home.rivalries.length === 0 ? <p className="dim">No rivalry has caught fire yet.</p> : home.rivalries.map((r) => <RivalryRow key={r.a + r.b} r={r} />)}
        </section>
        {ring && ring.rows.length > 0 && (
          <section>
            <h2 className="m-sec display">Ratings <small>{ring.shortName} · {ring.divisionLabel}</small></h2>
            <ol className="m-mini-rank">{ring.rows.slice(0, 6).map((r) => <li key={r.id}><b className="num">{r.label}</b><button className="linkbtn" onClick={() => navigate('fighter', r.id)}>{r.name}</button><small className="dim">{r.record}</small></li>)}</ol>
            <button className="linkbtn" onClick={() => navigate('rankings')}>All rankings ▸</button>
          </section>
        )}
        {home.narratives.length > 0 && (
          <section>
            <h2 className="m-sec display">Storylines</h2>
            {home.narratives.slice(0, 4).map((n) => <NarrativeRow key={n.id} n={n} />)}
            <button className="linkbtn" onClick={() => navigate('media', 'storylines')}>All storylines ▸</button>
          </section>
        )}
      </aside>
    </div>
  )
}

function Waiting({ home }: { home: Home }) {
  const nothing = home.requests.every((r) => r.status !== 'open') && home.pressers.every((p) => p.status !== 'open') && home.offers.length === 0
  const closedReq = home.requests.filter((r) => r.status !== 'open').slice(0, 6)
  const closedPress = home.pressers.filter((p) => p.status === 'done').slice(0, 4)
  return (
    <div className="m-wait" data-testid="media-waiting-panel">
      {nothing && <p className="empty">Nothing is waiting on you. Outlets ask for interviews when your fighters are in the news, press conferences are called before your shows, and broadcasters make offers on shows with a strong card.</p>}
      {home.offers.length > 0 && <><h2 className="m-sec display">Broadcast offers</h2>{home.offers.map((o) => <OfferCard key={o.id} o={o} />)}</>}
      {home.pressers.some((p) => p.status === 'open') && <><h2 className="m-sec display">Press conferences</h2>{home.pressers.filter((p) => p.status === 'open').map((p) => <PressCard key={p.id} p={p} />)}</>}
      {home.requests.some((r) => r.status === 'open') && <><h2 className="m-sec display">Media requests</h2>{home.requests.filter((r) => r.status === 'open').map((r) => <RequestCard key={r.id} r={r} />)}</>}
      {(closedReq.length > 0 || closedPress.length > 0) && (
        <>
          <h2 className="m-sec display">Recently answered</h2>
          <ul className="m-done">
            {closedPress.map((p) => <li key={p.id}><b>PRESS</b> {p.names[0]} v {p.names[1]} — {p.result}</li>)}
            {closedReq.map((r) => <li key={r.id}><b>{r.status.toUpperCase()}</b> {r.org.name} · {r.fighterName} · {r.label}{r.result ? ` — ${r.result}` : ''}</li>)}
          </ul>
        </>
      )}
    </div>
  )
}

function RequestCard({ r }: { r: RequestView }) {
  const mediaDo = useGame((s) => s.mediaDo)
  const [alt, setAlt] = useState(r.alternatives[0]?.id ?? '')
  return (
    <div className="m-req" data-testid="media-request">
      <div className="m-req-head"><OrgMark org={r.org} size={34} /><div><div className="caps">Media request · {r.weeksLeft} wk left · relationship {r.relation.toLowerCase()}</div><div className="m-req-t display">{r.org.name} wants {r.fighterName}</div><div className="dim">{r.org.shortName} asks for {r.label}.</div></div></div>
      <div className="m-req-act">
        <button className="btn primary" onClick={() => mediaDo('respond', r.id, 'accept')} data-testid="req-accept">Accept</button>
        <button className="btn ghost" onClick={() => mediaDo('respond', r.id, 'decline')} data-testid="req-decline">Decline</button>
        {r.alternatives.length > 0 && (
          <span className="m-alt">
            <label className="sr-only" htmlFor={`alt-${r.id}`}>Offer another fighter</label>
            <select id={`alt-${r.id}`} className="select" value={alt} onChange={(e) => setAlt(e.target.value)}>
              {r.alternatives.map((a) => <option key={a.id} value={a.id}>{a.name} (interest {a.interest})</option>)}
            </select>
            <button className="btn small" disabled={!alt} onClick={() => mediaDo('respond', r.id, 'redirect', alt)} data-testid="req-redirect">Offer another</button>
          </span>
        )}
      </div>
    </div>
  )
}

function PressCard({ p }: { p: PressView }) {
  const mediaDo = useGame((s) => s.mediaDo)
  const navigate = useGame((s) => s.navigate)
  return (
    <div className="m-req press" data-testid="media-press">
      <div className="caps">Press conference · {p.weeksLeft} wk left</div>
      <div className="m-req-t display">{p.names[0]} <i>v</i> {p.names[1]}</div>
      <div className="dim">{p.eventName} — choose how you handle the press. <button className="linkbtn" onClick={() => navigate('event', p.eventId)}>Open the show ▸</button></div>
      <div className="m-approach">
        {p.options.map((o) => <button key={o.key} className="btn small" title={o.hint} onClick={() => mediaDo('press', p.id, o.key)} data-testid={`press-${o.key.toLowerCase()}`}><b>{o.label}</b><small>{o.hint}</small></button>)}
      </div>
    </div>
  )
}

export function OfferCard({ o, compact }: { o: OfferView; compact?: boolean }) {
  const mediaDo = useGame((s) => s.mediaDo)
  return (
    <div className="m-offer" data-testid="broadcast-offer" style={{ ['--bc' as string]: o.org.colour }}>
      <div className="m-offer-head"><span className="m-bcmark" style={{ background: o.org.colour }}>{o.org.shortName.slice(0, 3)}</span><div><div className="caps">Broadcast offer · {o.weeksLeft} wk left</div><div className="m-req-t display">{o.org.name}</div>{!compact && <div className="dim">{o.org.tagline} · {o.eventName} · {o.mainEvent}</div>}</div></div>
      <dl className="m-terms">
        <div><dt>Guaranteed</dt><dd className="num">{money(o.guaranteed, false)}</dd></div>
        <div><dt>{o.kind === 'ppv' ? 'Your share' : 'Audience bonus'}</dt><dd>{o.shareLabel}</dd></div>
        <div><dt>Expects</dt><dd className="num">{o.minAudience.toLocaleString('en-GB')} {o.audienceUnit}</dd></div>
        <div><dt>Rights</dt><dd>{o.rights.toLowerCase()} · {o.territory}{o.exclusive ? ' · exclusive' : ''}</dd></div>
        <div><dt>Production</dt><dd className={o.venueOk ? '' : 'red'}>level {o.productionReq}+ {o.venueOk ? '✓' : '— venue falls short'}</dd></div>
      </dl>
      <div className="m-req-act">
        <button className="btn primary" disabled={!o.venueOk} onClick={() => mediaDo('acceptOffer', o.id)} data-testid="offer-accept">Accept the deal</button>
        <button className="btn ghost" onClick={() => mediaDo('declineOffer', o.id)} data-testid="offer-decline">Decline</button>
      </div>
    </div>
  )
}

function VideoTab({ home }: { home: Home }) {
  if (home.videos.length === 0) return <p className="empty">No video has been published yet. Highlights, interviews and press conferences are posted after fights and shows.</p>
  return <div className="m-vgrid" data-testid="video-grid">{home.videos.map((v) => <VideoCard key={v.id} v={v} />)}</div>
}

function Storylines({ home }: { home: Home }) {
  return (
    <div className="m-two">
      <section>
        <h2 className="m-sec display">Active storylines</h2>
        {home.narratives.length === 0 ? <p className="empty">No storylines yet. They grow out of streaks, rivalries, comebacks and title chases.</p> : home.narratives.map((n) => <NarrativeRow key={n.id} n={n} />)}
      </section>
      <section>
        <h2 className="m-sec display">Rivalries</h2>
        {home.rivalries.length === 0 ? <p className="empty">No rivalry has caught fire yet.</p> : home.rivalries.map((r) => <RivalryRow key={r.a + r.b} r={r} />)}
        <h2 className="m-sec display">For the record</h2>
        {home.history.length === 0 ? <p className="dim">History is written as the years go by.</p> : <ul className="m-done">{home.history.map((h, i) => <li key={i}><b>{h.kind.replace(/_/g, ' ')}</b> {h.headline}</li>)}</ul>}
      </section>
    </div>
  )
}

function Outlets({ home }: { home: Home }) {
  return (
    <div className="m-orgs" data-testid="outlets">
      {home.orgs.map((o) => (
        <div key={o.id} className="m-org">
          <OrgMark org={o} size={44} />
          <div className="m-org-b">
            <div className="display m-org-n">{o.name}</div>
            <div className="dim">{o.tagline}</div>
            <div className="m-org-s"><span>Audience <b className="num">{o.audience >= 1_000_000 ? `${(o.audience / 1_000_000).toFixed(1)}m` : `${Math.round(o.audience / 1000)}k`}</b></span><span>Credibility <b className="num">{o.credibility}</b></span><span>Influence <b className="num">{o.influence}</b></span><span>{o.style.toLowerCase().replace('_', ' ')}</span>{o.publishesRankings && <span className="chip gold">RATINGS</span>}</div>
          </div>
          <div className={`m-rel r-${o.relationState.toLowerCase()}`} title={`Relationship ${o.relation}`}><span className="caps">With you</span><b>{o.relationState}</b></div>
        </div>
      ))}
    </div>
  )
}

function AwardsTab() {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const awards = useMemo(() => awardsList(game, { limit: 80 }), [game])
  const reigns = useMemo(() => reignsList(game).slice(0, 12), [game])
  const years = [...new Set(awards.map((a) => a.year))].sort((a, b) => b - a)
  return (
    <div className="m-two">
      <section data-testid="awards">
        <h2 className="m-sec display">Annual awards</h2>
        {years.length === 0 ? <p className="empty">The first awards are announced at the turn of the year, decided from what actually happened over those twelve months.</p> : years.map((y) => (
          <div key={y} className="m-year"><h3 className="display">{y}</h3>
            {awards.filter((a) => a.year === y).map((a, i) => <div key={i} className="m-award"><span className="caps">{a.category}</span><button className="linkbtn" onClick={() => (a.fighterId ? navigate('fighter', a.fighterId) : a.eventId ? navigate('event', a.eventId) : undefined)}>{a.who}</button>{a.fighterId || a.eventId ? '' : null}<small className="dim"> · {a.org.shortName}</small></div>)}
          </div>
        ))}
      </section>
      <section>
        <h2 className="m-sec display">Recent title reigns</h2>
        {reigns.length === 0 ? <p className="dim">No reign has ended yet.</p> : <ul className="m-done">{reigns.map((r, i) => <li key={i}><b>{r.bodyName}</b> {r.fn} · {r.title.replace(' Championship', '')} · {formatDay(r.from, false)}–{r.to ? formatDay(r.to, false) : 'now'} · {r.defences} def. ({r.how})</li>)}</ul>}
      </section>
    </div>
  )
}

export { ago }
