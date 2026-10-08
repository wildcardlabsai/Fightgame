import { useMemo } from 'react'
import { venueFits } from '../../engine/eventViews'
import { useGame } from '../../store/gameStore'
import { FIT_SORTS, ShowMore, VenueFilters, VenueRowCard, useVenueList } from './VenueList'
import { bestFitId, venueRows } from './venueInfo'

/** Venue comparison for one event: every venue's forecast for THIS card. Numbers are the engine's public forecast only. */
export function VenueFitList({ eventId, currentVenueId }: { eventId: string; currentVenueId: string }) {
  const game = useGame((s) => s.game)!
  const rows = useMemo(() => venueRows(game, venueFits(game, eventId)), [game, eventId])
  const best = useMemo(() => bestFitId(rows), [rows])
  const { f, set, list, visible, more, showMore } = useVenueList(rows, 'fit', 12)
  return (
    <div data-testid="venue-fit-list">
      <VenueFilters rows={rows} f={f} set={set} sorts={FIT_SORTS} showFree />
      <p className="dim vn-count" aria-live="polite">{list.length} of {rows.length} venues. Best fit is the engine's “good fit” verdict with the highest forecast profit.</p>
      <div className="vn-grid">
        {visible.map((r) => <VenueRowCard key={r.v.id} r={r} mode="fit" best={r.v.id === best} selected={r.v.id === currentVenueId}
          action={r.v.id === currentVenueId ? <p className="vn-current">This show is booked here.</p> : null} />)}
      </div>
      {list.length === 0 && <p className="empty">No venues match those filters.</p>}
      <ShowMore more={more} onClick={showMore} />
      <p className="dim vn-count">A booked show cannot be moved: to switch venue, cancel it and plan a new show (the venue picker on the Events screen).</p>
    </div>
  )
}
