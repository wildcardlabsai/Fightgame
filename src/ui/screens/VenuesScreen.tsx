import { useMemo } from 'react'
import { formatDay } from '../../engine/calendar'
import { useGame } from '../../store/gameStore'
import { BROWSE_SORTS, ShowMore, VenueFilters, VenueRowCard, useVenueList } from '../venues/VenueList'
import { venueRows } from '../venues/venueInfo'
import '../../styles/venues54.css'

export function VenuesScreen() {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const rows = useMemo(() => venueRows(game), [game])
  const { f, set, list, visible, more, showMore } = useVenueList(rows, 'capacity', 40)
  const real = rows.filter((r) => r.place.real).length
  const mine = Object.values(game.events).filter((e) => e.promotionId === game.playerPromotionId && ['venueBooked', 'cardBuilding', 'onSale', 'promoting', 'fightWeek'].includes(e.status))
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="display">Venues</h1>
          <p className="sub">{real} real venues and {rows.length - real} generic halls. Bigger buildings sell more tickets and add prestige, but an empty stadium is a disaster. Capacity shown is the boxing configuration. Book one from the Events screen.</p>
        </div>
        <button className="btn primary" onClick={() => navigate('events')}>Plan a show ▸</button>
      </div>
      <VenueFilters rows={rows} f={f} set={set} sorts={BROWSE_SORTS} />
      <p className="dim vn-count" aria-live="polite" data-testid="venue-count">Showing {visible.length} of {list.length} matching venues ({rows.length} in total)</p>
      <div className="vn-grid" data-testid="venue-cards">
        {visible.map((r) => <VenueRowCard key={r.v.id} r={r} mode="browse" />)}
      </div>
      {list.length === 0 && <p className="empty">No venues match those filters.</p>}
      <ShowMore more={more} onClick={showMore} />
      {mine.length > 0 && <p className="dim" style={{ marginTop: 10, fontSize: 13 }}>Your bookings: {mine.map((e) => `${e.name} (${game.venues[e.venueId].name}, ${formatDay(e.day, false)})`).join(' · ')}</p>}
    </>
  )
}
