import { useMemo, useState } from 'react'
import { formatDay } from '../../engine/calendar'
import { eventList, venueViews, type EventListItem } from '../../engine/eventViews'
import { venueBookingAdvice } from '../../engine/advisor'
import { financialHealth } from '../../engine/selectors'
import { useGame } from '../../store/gameStore'
import { AdvicePanel } from '../components/Advice'
import { Modal } from '../components/Overlay'
import { money } from '../format'

type Tab = 'open' | 'history' | 'upcoming' | 'world'

function Row({ e }: { e: EventListItem }) {
  const navigate = useGame((s) => s.navigate)
  const go = () => navigate('event', e.id)
  const done = e.profit !== undefined
  return (
    <tr className={`row${e.mine ? ' mine' : ''}`} tabIndex={0} onClick={go} onKeyDown={(k) => { if (k.key === 'Enter') go() }}>
      <td data-label="Date" className="num">{formatDay(e.day, true)}</td>
      <td className="primary" data-label="Show">
        <div className="fighter-name">{e.name}</div>
        <div className="fighter-sub">{e.mine ? '' : `${e.promotion} · `}{e.venueName}, {e.city} · {e.fights} fights</div>
        <div className="fighter-sub">{e.main}</div>
      </td>
      <td data-label="Status">{e.statusKey === 'cancelled' ? <span className="red">Cancelled</span> : <span className={e.statusKey === 'fightWeek' || e.statusKey === 'live' ? 'red' : ''}>{e.status}{e.open && e.weeksAway ? ` · ${e.weeksAway}w` : ''}</span>}</td>
      <td data-label={done ? 'Result' : 'Sales'} className="num">
        {done ? <><div>{e.attendance!.toLocaleString('en-GB')} in the building</div><div className={e.profit! >= 0 ? 'good' : 'red'}>{e.profit! >= 0 ? '+' : ''}{money(e.profit!)}</div></> :
          e.statusKey === 'cancelled' ? <span className="dim">{e.cancelReason}</span> : e.sold > 0 ? <><div>{e.sold.toLocaleString('en-GB')} / {e.capacity.toLocaleString('en-GB')}</div><div className="dim">{e.fillPct}% sold</div></> : <span className="dim">{e.capacity.toLocaleString('en-GB')} seats</span>}
      </td>
    </tr>
  )
}

function NewEventModal({ onClose }: { onClose: () => void }) {
  const game = useGame((s) => s.game)!
  const create = useGame((s) => s.createEvent)
  const navigate = useGame((s) => s.navigate)
  const venues = useMemo(() => venueViews(game), [game])
  const [name, setName] = useState('')
  const [venueId, setVenueId] = useState((venues.find((x) => !x.locked && x.tier === 'regional') ?? venues.find((x) => !x.locked) ?? venues[0]).id)
  const v = venues.find((x) => x.id === venueId)!
  const [day, setDay] = useState<number | null>(null)
  const date = day !== null && v.freeDates.includes(day) ? day : v.freeDates[0]
  const cash = game.promotions[game.playerPromotionId].cash
  const ok = name.trim().length >= 3 && date !== undefined && !v.locked
  const bookingAdvice = useMemo(() => { const a = venueBookingAdvice(game, v.hireCost, v.productionCost, v.name); return a ? [a] : [] }, [game, v])
  return (
    <Modal title="Plan a new show" onClose={onClose} wide>
      <label className="field"><span className="caps">Event name</span>
        <input className="input" value={name} placeholder="e.g. Fight Night at the Rialto" onChange={(e) => setName(e.target.value)} maxLength={48} aria-label="Event name" /></label>
      <label className="field"><span className="caps">Venue</span>
        <select className="select" value={venueId} onChange={(e) => setVenueId(e.target.value)} aria-label="Venue">
          {venues.map((x) => <option key={x.id} value={x.id} disabled={!!x.locked}>{x.name}, {x.city} — {x.capacity.toLocaleString('en-GB')} seats · hire {money(x.hireCost, false)}{x.locked ? ` · 🔒 ${x.locked}` : ''}</option>)}
        </select></label>
      <div className="kpis" style={{ margin: '10px 0' }}>
        <div className="kpi"><div className="caps">Tier</div><div className="v num" style={{ fontSize: 22 }}>{v.tierLabel}</div></div>
        <div className="kpi"><div className="caps">Capacity</div><div className="v num" style={{ fontSize: 22 }}>{v.capacity.toLocaleString('en-GB')}</div></div>
        <div className="kpi"><div className="caps">Hire fee</div><div className={`v num ${v.hireCost > cash ? 'red' : ''}`} style={{ fontSize: 22 }}>{money(v.hireCost, false)}</div><div className="s">paid now</div></div>
        <div className="kpi"><div className="caps">Card size</div><div className="v num" style={{ fontSize: 22 }}>{v.minFights}–{v.maxFights}</div><div className="s">fights</div></div>
      </div>
      <AdvicePanel list={bookingAdvice} cap={1} />
      <div className="caps" style={{ marginBottom: 6 }}>Date (Saturdays, at least 6 weeks away)</div>
      {v.freeDates.length === 0 ? <p className="empty">No free dates at this venue.</p> : (
        <div className="opp-grid">
          {v.freeDates.map((d) => (
            <button key={d} className={`pick${date === d ? ' on' : ''}`} onClick={() => setDay(d)} aria-pressed={date === d}><div className="num" style={{ fontSize: 18 }}>{formatDay(d)}</div></button>
          ))}
        </div>
      )}
      <p className="dim" style={{ fontSize: 13, margin: '10px 0' }}>Pick a building you can honestly fill. A half-empty hall wastes money and hurts atmosphere; a packed small hall leaves money on the table. The event page shows a venue-fit forecast once you have a card.</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!ok || v.hireCost > cash} onClick={() => { const id = create({ name: name.trim(), day: date, venueId }); if (id) { onClose(); navigate('event', id) } }}>Book venue & start</button>
      </div>
    </Modal>
  )
}

export function EventsScreen() {
  const game = useGame((s) => s.game)!
  const [tab, setTab] = useState<Tab>('open')
  const [creating, setCreating] = useState(false)
  const lists = { open: eventList(game, 'mine-open'), history: eventList(game, 'mine-history', 80), upcoming: eventList(game, 'world-upcoming', 40), world: eventList(game, 'world-results', 40) }
  const rows = lists[tab]
  const health = financialHealth(game)
  const blocked = health.state === 'insolvent'
  const labels: Record<Tab, string> = { open: 'My Shows', history: 'My History', upcoming: 'Rival Shows', world: 'Rival Results' }
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="display">Events</h1>
          <p className="sub">Shows are where the money is made — and lost. Book a venue, build a card, set prices, promote, sell tickets, and run the night.</p>
        </div>
        <button className="btn primary" disabled={blocked} title={blocked ? 'Insolvent: cannot book venues' : undefined} onClick={() => setCreating(true)}>Plan a show ▸</button>
      </div>
      <div className="tabs" role="tablist">
        {(Object.keys(labels) as Tab[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{labels[k]}<span className="count">{lists[k].length}</span></button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="empty">{tab === 'open' ? 'No shows planned. Plan one, then bring fights to the card.' : tab === 'history' ? 'No completed shows yet.' : tab === 'upcoming' ? 'No rival shows announced yet.' : 'No rival results yet.'}</p>
      ) : (
        <div className="table-wrap"><table className="table stack">
          <thead><tr><th>Date</th><th>Show</th><th>Status</th><th>{tab === 'history' || tab === 'world' ? 'Result' : 'Sales'}</th></tr></thead>
          <tbody>{rows.map((e) => <Row key={e.id} e={e} />)}</tbody>
        </table></div>
      )}
      {creating && <NewEventModal onClose={() => setCreating(false)} />}
    </>
  )
}
