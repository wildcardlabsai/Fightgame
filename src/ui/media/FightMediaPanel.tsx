import { useMemo } from 'react'
import { fightMediaView } from '../../engine/media/views'
import { RivalryRow, StoryCard, NarrativeRow, useOpenStory } from './MediaBits'
import { useGame } from '../../store/gameStore'

/** Title at stake, where each fighter is rated, the rivalry and the coverage around one fight. */
export function FightMediaPanel({ fightId }: { fightId: string }) {
  const game = useGame((s) => s.game)!
  const open = useOpenStory()
  const m = useMemo(() => fightMediaView(game, fightId), [game, fightId])
  if (!m) return null
  const hasRank = m.ranks.some((r) => r.lines.length > 0)
  if (!m.title && !hasRank && !m.rivalry && m.stories.length === 0 && m.narratives.length === 0) return null
  return (
    <section className="em" aria-label="Fight media" data-testid="fight-media">
      <div className="fm-head"><h2 className="display">Ringside report</h2>{m.title && <span className="chip gold" data-testid="title-stake">{m.title}</span>}</div>
      {hasRank && (
        <div className="fm-ranks">
          {m.ranks.map((r) => <div key={r.name} className="fm-rankcol"><b>{r.name}</b>{r.lines.length === 0 ? <span className="dim">unranked</span> : r.lines.map((l) => <span key={l.orgId} className="rk-chip" title={l.why}><b>{l.shortName}</b> {l.label}</span>)}</div>)}
        </div>
      )}
      {m.rivalry && <RivalryRow r={m.rivalry} />}
      {m.narratives.map((n) => <NarrativeRow key={n.id} n={n} />)}
      {m.stories.map((s) => <StoryCard key={s.id} s={s} variant="compact" onOpen={() => open(s)} />)}
    </section>
  )
}
