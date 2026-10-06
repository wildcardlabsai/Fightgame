import { tierStatus } from '../../engine/tierProgress'
import { TIER_DEFS, TIER_SEQUENCE } from '../../engine/tiers'
import { useGame } from '../../store/gameStore'
import { Meter } from './Bits'
import { compactNumber, money } from '../format'

const fmt = (key: string, n: number, isMoney?: boolean) => (isMoney ? money(n) : key === 'fanbase' || key === 'attendance' ? compactNumber(n) : n.toLocaleString('en-GB'))

/** Where the promotion stands on the tier ladder and what the next step needs. */
export function TierPanel({ compact }: { compact?: boolean }) {
  const game = useGame((s) => s.game)!
  const st = tierStatus(game)
  const cur = TIER_DEFS[st.current]
  const next = st.next ? TIER_DEFS[st.next] : null
  return (
    <div className="tierpanel" data-tier={st.current}>
      <div className="caps">Promotion tier</div>
      <div className="tier-name display">{cur.label}</div>
      <div className="tier-ladder" aria-label="Tier ladder">
        {TIER_SEQUENCE.map((t) => <span key={t} className={`rung${TIER_DEFS[t].rank < cur.rank ? ' done' : TIER_DEFS[t].rank === cur.rank ? ' now' : ''}`} title={TIER_DEFS[t].label} />)}
      </div>
      {!compact && <p className="dim" style={{ fontSize: 13.5 }}>{cur.blurb}</p>}
      <div className="tier-meta dim">Roster capacity {cur.rosterCap} · up to {cur.sponsorSlots} standing sponsor{cur.sponsorSlots === 1 ? '' : 's'}</div>
      {next ? (
        <div className="tier-next">
          <div className="tier-next-head"><span className="caps">Next tier</span><b className="display">{next.label}</b><span className="num dim">{st.pct}%</span></div>
          <Meter value={st.pct} tone="gold" label={`Progress to ${next.label}`} />
          <ul className="reqs">
            {st.rows.map((r) => (
              <li key={r.key} className={r.met ? 'met' : 'unmet'}>
                <span className="tick" aria-hidden="true">{r.met ? '✓' : '✕'}</span>
                <span className="rl">{r.label}</span>
                <span className="rv num">{r.key === 'finance' ? (r.met ? 'yes' : 'not yet') : `${fmt(r.key, r.have, r.money)} / ${fmt(r.key, r.need, r.money)}`}</span>
              </li>
            ))}
          </ul>
          {st.met && <p className="good" style={{ fontSize: 13 }}>Every requirement is met — hold it for {Math.max(0, st.weeksNeeded - st.qualifiedWeeks)} more week{st.weeksNeeded - st.qualifiedWeeks === 1 ? '' : 's'} to be promoted.</p>}
        </div>
      ) : <p className="gold" style={{ marginTop: 8 }}>You are at the top of the sport.</p>}
    </div>
  )
}
