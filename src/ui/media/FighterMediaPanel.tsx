import { useMemo } from 'react'
import { fighterMediaView } from '../../engine/media/views'
import { useGame } from '../../store/gameStore'
import { compactNumber } from '../format'
import { NarrativeRow, RivalryRow, StoryCard, VideoCard, useOpenStory, Stat } from './MediaBits'

/** The fighter's public standing in the press: five separate measures, rankings, coverage and the career story. */
export function FighterMediaPanel({ id, revealPersona }: { id: string; revealPersona: boolean }) {
  const game = useGame((s) => s.game)!
  const open = useOpenStory()
  const m = useMemo(() => fighterMediaView(game, id, revealPersona), [game, id, revealPersona])
  if (!m) return null
  return (
    <section className="fm" aria-label="Media profile" data-testid="media-profile">
      <div className="fm-head"><h2 className="display">Media profile</h2><span className={`m-trend ${m.trending.toLowerCase()}`}>{m.trending === 'HOT' ? '🔥 HOT' : m.trending === 'RISING' ? '▲ RISING' : m.trending === 'COOLING' ? '▼ COOLING' : '● STEADY'}</span></div>
      <div className="m-stats">
        <Stat label="Popularity" value={m.popularity} sub="public" />
        <Stat label="Media interest" value={m.interest} sub="right now" tone={m.interest >= 60 ? 'gold' : undefined} />
        <Stat label="Fanbase" value={compactNumber(m.fanbase)} sub={`${compactNumber(m.followers)} followers`} />
        <Stat label="Commercial appeal" value={m.commercial} sub="sponsors & TV" />
        <Stat label="Sporting credibility" value={m.credibility} sub="results" />
        {m.persona && <Stat label="Press persona" value={m.persona} sub="known to you" />}
      </div>
      <div className="fm-ranks" data-testid="fighter-rankings">
        {m.titles.map((t) => <span key={t.name} className="chip gold">CHAMPION · {t.name}{t.defences ? ` · ${t.defences} def.` : ''}</span>)}
        {m.rankings.map((r) => <span key={r.orgId} className={`rk-chip${r.rank === null ? ' none' : ''}`} title={r.why}><b>{r.shortName}</b> {r.label}{r.movement && <i className={r.movement.startsWith('▲') ? 'up' : r.movement.startsWith('▼') ? 'down' : ''}>{r.movement}</i>}</span>)}
      </div>
      <div className="fm-cols">
        <div>
          <h3 className="m-sec display">Recent coverage</h3>
          {m.stories.length === 0 ? <p className="dim">Nobody has written about this fighter lately.</p> : m.stories.slice(0, 5).map((s) => <StoryCard key={s.id} s={s} variant="compact" onOpen={() => open(s)} />)}
          {m.videos.length > 0 && <><h3 className="m-sec display">Video</h3><div className="m-vgrid small">{m.videos.map((v) => <VideoCard key={v.id} v={v} />)}</div></>}
        </div>
        <div>
          <h3 className="m-sec display">Career story</h3>
          {m.career.length === 0 ? <p className="dim">The story starts here.</p> : <ol className="fm-career" data-testid="career-story">{m.career.slice().reverse().map((c, i) => <li key={i}><b className="num">{c.year}</b><span>{c.text}</span></li>)}</ol>}
          {m.awards.length > 0 && <><h3 className="m-sec display">Awards</h3><ul className="m-done">{m.awards.map((a, i) => <li key={i}><b>{a.year}</b> {a.category}</li>)}</ul></>}
        </div>
      </div>
      {(m.narratives.length > 0 || m.rivalries.length > 0) && (
        <div className="fm-cols">
          <div>{m.narratives.length > 0 && <><h3 className="m-sec display">Storylines</h3>{m.narratives.map((n) => <NarrativeRow key={n.id} n={n} />)}</>}</div>
          <div>{m.rivalries.length > 0 && <><h3 className="m-sec display">Rivalries</h3>{m.rivalries.map((r) => <RivalryRow key={r.a + r.b} r={r} />)}</>}</div>
        </div>
      )}
      {m.relations.length > 0 && (
        <div className="fm-rel"><h3 className="m-sec display">Press relationships</h3>{m.relations.map((r) => <span key={r.org.id} className={`rk-chip r-${r.state.toLowerCase()}`}><b>{r.org.shortName}</b> {r.state}</span>)}</div>
      )}
      <p className="dim fm-foot">Platform split of followers: {m.platforms.slice(0, 3).map((p) => `${p.name} ${compactNumber(p.followers)}`).join(' · ')}.</p>
    </section>
  )
}
