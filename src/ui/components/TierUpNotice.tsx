import { TIER_DEFS } from '../../engine/tiers'
import { useGame } from '../../store/gameStore'

/** The one big moment: shown once when the promotion changes tier, then dismissed. */
export function TierUpNotice() {
  const game = useGame((s) => s.game)
  const ack = useGame((s) => s.ackTier)
  const n = game?.promotionProgress?.notice
  if (!n) return null
  const up = TIER_DEFS[n.to].rank > TIER_DEFS[n.from].rank
  const to = TIER_DEFS[n.to], from = TIER_DEFS[n.from]
  const gained = up ? to.unlocks : ['Venues, roster places and sponsors above this level are closed to you until you rebuild.']
  return (
    <div className="modal-back" role="presentation">
      <div className={`modal tierup${up ? '' : ' down'}`} role="dialog" aria-modal="true" aria-label={up ? 'Promotion tier increased' : 'Promotion tier reduced'}>
        <div className="caps tierup-kicker">{up ? 'Promotion tier increased' : 'Promotion tier reduced'}</div>
        <div className="display tierup-name">{to.label} promotion</div>
        <div className="dim" style={{ marginBottom: 14 }}>{from.label} ▸ {to.label}</div>
        <div className="caps" style={{ marginBottom: 6 }}>{up ? 'New opportunities unlocked' : 'What changes'}</div>
        <ul className="tierup-list">{gained.map((u) => <li key={u}>{u}</li>)}</ul>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn primary big" autoFocus onClick={ack} data-testid="tier-ack">Continue ▸</button>
        </div>
      </div>
    </div>
  )
}
