import { reviewsView } from '../../engine/office/views'
import { useGame } from '../../store/gameStore'
import { Section } from '../components/Bits'
import '../../styles/office54c.css'

/** Decisions a result has genuinely opened up: shown only when one applies, lapse on their own, act through the normal systems. */
export function ReviewsPanel({ fighterId }: { fighterId?: string }) {
  const game = useGame((s) => s.game)!
  const officeDo = useGame((s) => s.officeDo)
  const navigate = useGame((s) => s.navigate)
  const list = reviewsView(game, fighterId)
  if (list.length === 0) return null
  return (
    <Section title="Decisions after the fight">
      <div data-testid="reviews-panel">
        {list.map((r) => (
          <div key={r.id} className="o54-choice" style={{ cursor: 'default', marginBottom: 8 }} data-testid="review-card" data-kind={r.kind}>
            <b>{r.title} <span className="o54-chip gold">{r.weeksLeft} week{r.weeksLeft === 1 ? '' : 's'} to decide</span></b>
            <small>{r.text}</small>
            <div className="o54-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {r.choices.map((c) => (
                <button key={c.key} className="btn" title={c.detail} onClick={() => { const x = officeDo('review', r.id, c.key); if (x.ok && x.fightId) navigate('fight', x.fightId) }} data-testid={`review-${c.key}`}>{c.label}</button>
              ))}
            </div>
            <small className="dim">{r.choices.map((c) => `${c.label}: ${c.detail}`).join(' ')}</small>
          </div>
        ))}
      </div>
    </Section>
  )
}
