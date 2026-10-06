import { useState } from 'react'
import { formatDay } from '../../engine/calendar'
import { fighterRating } from '../../engine/fighters'
import { TIER_ORDER } from '../../engine/promotions'
import { rosterOf } from '../../engine/selectors'
import { useGame } from '../../store/gameStore'
import { PromoLogo, Section } from '../components/Bits'
import { compactNumber, money } from '../format'
import { FighterRow } from './FightersScreen'

export function PromotionsScreen() {
  const game = useGame((s) => s.game)!
  const [sel, setSel] = useState<string | null>(null)
  const promos = Object.values(game.promotions)
    .map((p) => {
      const roster = rosterOf(game, p.id)
      const avg = roster.length ? Math.round(roster.reduce((s, f) => s + fighterRating(f), 0) / roster.length) : 0
      return { p, roster, avg }
    })
    .sort((a, b) => TIER_ORDER.indexOf(b.p.tier) - TIER_ORDER.indexOf(a.p.tier) || b.p.reputation - a.p.reputation)
  const chosen = promos.find((x) => x.p.id === sel)

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="display">Promotions</h1>
          <p className="sub">The competition. Rivals sign free agents and re-stock their rosters as the weeks pass; full AI matchmaking and events arrive in Phase 6.</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Promotion</th><th>Tier</th><th className="r">Reputation</th><th className="r">Fanbase</th><th className="r">Roster</th><th className="r">Avg rating</th><th className="r">Cash</th></tr></thead>
          <tbody>
            {promos.map(({ p, roster, avg }) => (
              <tr key={p.id} className={`row${p.isPlayer ? ' mine' : ''}`} onClick={() => setSel(p.id === sel ? null : p.id)}>
                <td><div className="fighter-cell"><PromoLogo p={p} size={36} />
                  <div><div className="fighter-name">{p.name}{p.isPlayer && <span className="chip gold" style={{ marginLeft: 8 }}>You</span>}</div>
                    <div className="fighter-sub">{p.promoterName} · est. {formatDay(p.foundedDay, true).split(' ').pop()}</div></div></div></td>
                <td>{p.tier}</td>
                <td className="r num" style={{ fontSize: 20 }}>{Math.round(p.reputation)}</td>
                <td className="r num">{compactNumber(p.fanbase)}</td>
                <td className="r num">{roster.length}</td>
                <td className="r num">{avg || '—'}</td>
                <td className="r num">{money(p.cash)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {chosen && (
        <Section title={`${chosen.p.name} — roster`}>
          {chosen.roster.length === 0 ? <p className="empty">No fighters under contract.</p> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Fighter</th><th>Division</th><th className="r">Age</th><th>Record</th><th>Rating</th><th>Popularity</th></tr></thead>
              <tbody>{chosen.roster.sort((a, b) => fighterRating(b) - fighterRating(a)).map((f) => <FighterRow key={f.id} f={f} showClub={false} />)}</tbody>
            </table></div>
          )}
        </Section>
      )}
      {!chosen && <p className="dim" style={{ marginTop: 12, fontSize: 13 }}>Select a promotion to see its roster.</p>}
    </>
  )
}
