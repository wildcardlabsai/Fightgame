import { campaignView } from '../../engine/office/views'
import { useGame } from '../../store/gameStore'
import { money } from '../format'
import '../../styles/office54c.css'

/** The angle a show is sold on. Honest about fit: a poor fit points the wrong way, and the fee is real. */
export function CampaignPanel({ eventId }: { eventId: string }) {
  const game = useGame((s) => s.game)!
  const officeDo = useGame((s) => s.officeDo)
  const v = campaignView(game, eventId)
  if (!v) return null
  return (
    <div data-testid="campaign-panel">
      <div className="caps" style={{ margin: '14px 0 6px' }}>Promotional angle</div>
      <div className="o54-grid" role="radiogroup" aria-label="Promotional angle">
        {v.options.map((o) => (
          <button key={o.kind} type="button" role="radio" aria-checked={o.chosen} className="o54-choice" aria-pressed={o.chosen} disabled={!v.canChange && !o.chosen} onClick={() => { if (!o.chosen) officeDo('campaign', eventId, o.kind) }} data-testid={`campaign-${o.kind}`} data-fit={o.fit}>
            <b>{o.label} <span className={`o54-chip ${o.fit === 'Strong fit' ? 'good' : o.fit === 'Some fit' ? 'gold' : 'warn'}`}>{o.fit}</span></b>
            <small>{o.blurb}</small><small>{o.why}</small><small>{o.fee > 0 ? `Costs about ${money(o.fee, false)}.` : 'No extra cost.'}</small>
          </button>
        ))}
      </div>
      {v.note && <p className="dim" style={{ fontSize: 13, marginTop: 8 }} data-testid="campaign-note">{v.note} The effect is a forecast: how it lands with the public carries some luck.</p>}
      {v.strategyNote && <p className="dim" style={{ fontSize: 13, margin: '4px 0 0' }}>{v.strategyNote}</p>}
    </div>
  )
}
