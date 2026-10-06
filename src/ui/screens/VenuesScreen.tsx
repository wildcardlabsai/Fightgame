import { useMemo, useState } from 'react'
import { nation } from '../../data/nations'
import { formatDay } from '../../engine/calendar'
import { venueViews, type VenueView } from '../../engine/eventViews'
import { useGame } from '../../store/gameStore'
import { Meter, Stars } from '../components/Bits'
import { money } from '../format'

const TIERS = ['all', 'local', 'regional', 'national', 'arena', 'stadium'] as const

export function VenuesScreen() {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const venues = useMemo(() => venueViews(game), [game])
  const [tier, setTier] = useState<(typeof TIERS)[number]>('all')
  const [open, setOpen] = useState<string | null>(null)
  const rows = venues.filter((v) => tier === 'all' || v.tier === tier)
  const max = Math.max(...venues.map((v) => v.capacity))
  const mine = Object.values(game.events).filter((e) => e.promotionId === game.playerPromotionId && ['venueBooked', 'cardBuilding', 'onSale', 'promoting', 'fightWeek'].includes(e.status))
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="display">Venues</h1>
          <p className="sub">From social clubs to stadiums. Bigger buildings sell more tickets and add prestige — but an empty stadium is a disaster. Book one from the Events screen.</p>
        </div>
        <button className="btn primary" onClick={() => navigate('events')}>Plan a show ▸</button>
      </div>
      <div className="tabs" role="tablist">
        {TIERS.map((t) => <button key={t} role="tab" aria-selected={tier === t} className={`tab${tier === t ? ' active' : ''}`} onClick={() => setTier(t)}>{t === 'all' ? 'All' : t[0].toUpperCase() + t.slice(1)}</button>)}
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Venue</th><th>Tier</th><th>Prestige</th><th style={{ minWidth: 160 }}>Capacity</th><th>Card</th><th className="r">Hire / night</th></tr></thead>
          <tbody>
            {rows.map((v) => <Row key={v.id} v={v} max={max} open={open === v.id} toggle={() => setOpen(open === v.id ? null : v.id)} />)}
          </tbody>
        </table>
      </div>
      {mine.length > 0 && <p className="dim" style={{ marginTop: 10, fontSize: 13 }}>Your bookings: {mine.map((e) => `${e.name} (${game.venues[e.venueId].name}, ${formatDay(e.day, false)})`).join(' · ')}</p>}
    </>
  )
}

function Row({ v, max, open, toggle }: { v: VenueView; max: number; open: boolean; toggle: () => void }) {
  return (
    <>
      <tr className="row" tabIndex={0} onClick={toggle} onKeyDown={(e) => { if (e.key === 'Enter') toggle() }}>
        <td className="fighter-name">{v.name}<div className="fighter-sub">{v.city}, {v.country === 'KSA' ? 'Saudi Arabia' : (nation(v.country)?.name ?? v.country)}</div></td>
        <td><span className="chip">{v.tierLabel}</span>{v.locked && <div className="fighter-sub warn" title={v.locked}>🔒 {v.locked}</div>}</td>
        <td><Stars n={v.prestige} /></td>
        <td><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="num" style={{ fontSize: 18, minWidth: 64 }}>{v.capacity.toLocaleString('en-GB')}</span>
          <div style={{ flex: 1 }}><Meter value={(v.capacity / max) * 100} tone="gold" label="Capacity" /></div></div></td>
        <td className="num dim">{v.minFights}–{v.maxFights} fights</td>
        <td className="r num" style={{ fontSize: 18 }}>{money(v.hireCost, false)}</td>
      </tr>
      {open && (
        <tr><td colSpan={6}>
          <dl>
            <div className="kv"><dt>Production capability</dt><dd>{v.production}/5 · staging bill ≈ {money(v.productionCost, false)}</dd></div>
            <div className="kv"><dt>Local market</dt><dd>{v.market >= 1.3 ? 'Huge' : v.market >= 1.05 ? 'Strong' : v.market >= 0.85 ? 'Average' : 'Small'} fight city (×{v.market.toFixed(2)})</dd></div>
            <div className="kv"><dt>Next free Saturdays</dt><dd>{v.freeDates.length ? v.freeDates.map((d) => formatDay(d, false)).join(' · ') : 'None soon'}</dd></div>
            {v.bookedBy.length > 0 && <div className="kv"><dt>Already booked</dt><dd>{v.bookedBy.slice(0, 5).map((b) => `${formatDay(b.day, false)} ${b.mine ? '(you)' : ''}`).join(' · ')}</dd></div>}
          </dl>
        </td></tr>
      )}
    </>
  )
}
