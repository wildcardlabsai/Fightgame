import { resolveVenueImage, venueKind, VENUE_KIND_LABEL, type VenueKind, type VenueRef } from '../../assets/registry'
import { Img } from './Img'

const TONE: Record<VenueKind, string> = {
  'local-hall': '#3a2418', 'sports-centre': '#1b2a3a', theatre: '#2a1520', 'regional-arena': '#1d2433', 'national-arena': '#2a1a33',
  'major-arena': '#331a1a', stadium: '#102a22', 'outdoor-stadium': '#1a2a4a', international: '#2a2410', 'vegas-arena': '#2a0f2a', 'uk-arena': '#10202a',
}
/** Tier-specific stand-in when no image exists (never a blank box). */
export function VenueFallback({ kind }: { kind: VenueKind }) {
  return <span className="v-venue-fb" style={{ background: `linear-gradient(180deg, ${TONE[kind]}, #07070a)` }}><i /></span>
}

/** Venue picture, tier-appropriate. Cover-cropped into whatever box the parent gives it. */
export function VenueImage({ venue, className = '', eager }: { venue: VenueRef; className?: string; eager?: boolean }) {
  const a = resolveVenueImage(venue)
  const kind = venueKind(venue)
  return (
    <span className={`v-venue ${className}`} data-asset-state={a.state} data-asset-id={a.assetId} data-venue-kind={kind}>
      <Img src={a.url} alt={`${venue.name}, ${VENUE_KIND_LABEL[kind].toLowerCase()} interior`} width={a.width || 800} height={a.height || 450} eager={eager} fallback={<VenueFallback kind={kind} />} />
    </span>
  )
}
