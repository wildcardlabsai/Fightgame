import { useMemo } from 'react'
import { useGame } from '../../store/gameStore'
import { BROWSE_SORTS, ShowMore, VenueFilters, VenueRowCard, useVenueList } from './VenueList'
import { venueRows } from './venueInfo'

/** Venue step of "Plan a new show": pick one venue (radio semantics). Locked venues show their reason and cannot be chosen. */
export function VenuePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const game = useGame((s) => s.game)!
  const rows = useMemo(() => venueRows(game), [game])
  const { f, set, list, visible, more, showMore } = useVenueList(rows, 'capacity', 8)
  return (
    <div className="vn-picker">
      {/* On a phone the six filters would fill the first screen before any venue; they fold away until asked for. */}
      <details className="vn-fold" open={typeof window === 'undefined' || window.innerWidth > 700} data-testid="venue-filter-fold">
        <summary>Search and filter venues</summary>
        <VenueFilters rows={rows} f={f} set={set} sorts={BROWSE_SORTS} />
      </details>
      <p className="dim vn-count" aria-live="polite">{list.length} of {rows.length} venues</p>
      <div className="vn-grid" role="radiogroup" aria-label="Venue">
        {visible.map((r) => (
          <VenueRowCard key={r.v.id} r={r} mode="browse" selected={r.v.id === value}
            action={<button type="button" role="radio" aria-checked={r.v.id === value} className={`btn vn-choose${r.v.id === value ? ' primary' : ''}`} data-testid="venue-choose" disabled={!!r.v.locked}
              onClick={() => onChange(r.v.id)} aria-label={`Choose ${r.v.name}`}>{r.v.locked ? 'Locked' : r.v.id === value ? 'Chosen' : 'Choose this venue'}</button>} />
        ))}
      </div>
      {list.length === 0 && <p className="empty">No venues match those filters.</p>}
      <ShowMore more={more} onClick={showMore} />
    </div>
  )
}
