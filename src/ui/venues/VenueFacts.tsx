import type { PlaceInfo } from './venueInfo'

/** "Facts" disclosure: where the capacity comes from and how sure we are. Generic halls say plainly that they are not real. */
export function VenueFacts({ place }: { place: PlaceInfo }) {
  return (
    <details className="vn-facts" data-testid="venue-facts">
      <summary>Facts</summary>
      {place.real ? (
        <dl>
          <div className="kv"><dt>Capacity note</dt><dd>{place.capacityNote}</dd></div>
          <div className="kv"><dt>Verification</dt><dd>{place.verification}</dd></div>
          <div className="kv"><dt>Sources</dt><dd data-testid="venue-sources">{place.sourceCount} {place.sourceCount === 1 ? 'source' : 'sources'}</dd></div>
          {place.kind && <div className="kv"><dt>Kind</dt><dd>{place.kind}</dd></div>}
        </dl>
      ) : null}
      <p className="dim vn-note">Capacity shown is the boxing configuration.</p>
      {place.generic && <p className="vn-note">Generic hall — a game placeholder, not a real building.</p>}
    </details>
  )
}
