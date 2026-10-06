import { nation } from '../../data/nations'
import { useGame } from '../../store/gameStore'
import { Stars } from '../components/Bits'
import { Meter } from '../components/Bits'
import { money } from '../format'

export function VenuesScreen() {
  const game = useGame((s) => s.game)!
  const venues = Object.values(game.venues).sort((a, b) => a.capacity - b.capacity)
  const max = Math.max(...venues.map((v) => v.capacity))
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="display">Venues</h1>
          <p className="sub">From social clubs to stadiums. You’ll book these for fight nights in Phase 4 — for now this is the ladder you’re climbing.</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Venue</th><th>City</th><th>Prestige</th><th style={{ minWidth: 180 }}>Capacity</th><th className="r">Hire cost / night</th></tr></thead>
          <tbody>
            {venues.map((v) => (
              <tr key={v.id}>
                <td className="fighter-name">{v.name}</td>
                <td>{v.city}, <span className="dim">{v.country === 'KSA' ? 'Saudi Arabia' : (nation(v.country)?.name ?? v.country)}</span></td>
                <td><Stars n={v.prestige} /></td>
                <td><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span className="num" style={{ fontSize: 18, minWidth: 64 }}>{v.capacity.toLocaleString('en-GB')}</span>
                  <div style={{ flex: 1 }}><Meter value={(v.capacity / max) * 100} tone="gold" label="Capacity" /></div></div></td>
                <td className="r num" style={{ fontSize: 18 }}>{money(v.hireCost, false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
