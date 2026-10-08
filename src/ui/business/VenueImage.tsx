import { venueImageFor, type VenueAssetType } from '../../assets/venueAssets'
import type { VenueRef } from '../../assets/registry'
import { VenueImage as VenueArt } from '../visual/VenueImage'
import { captionFor, safeSourceUrl } from './venueImageCaption'
import '../../styles/venues54.css'

/**
 * A venue picture. An approved, fully documented photograph (via `venueImageFor`, which never returns an unapproved record) is shown lazily
 * with its credit and licence; otherwise the game's own venue illustration with a plain "Illustration" label. Never hot-links.
 */
export function VenueImage({ venue, type = 'exterior', className = '', eager }: { venue: VenueRef & { id: string }; type?: VenueAssetType; className?: string; eager?: boolean }) {
  const image = venueImageFor(venue.id, type)
  const caption = captionFor(image)
  if (image.kind === 'photo') {
    const src = safeSourceUrl(image)
    return (
      <figure className={`vn-img ${className}`} data-testid="venue-image" data-image-kind="photo">
        <img src={image.src} srcSet={image.srcset} sizes="(max-width: 700px) 100vw, 360px" alt={`${venue.name}, exterior`} width={image.width ?? 800} height={image.height ?? 450} loading={eager ? 'eager' : 'lazy'} decoding="async" />
        <figcaption className="vn-cap">{caption}{src && <> · <a href={src} target="_blank" rel="noopener noreferrer">Source</a></>}</figcaption>
      </figure>
    )
  }
  return (
    <figure className={`vn-img ${className}`} data-testid="venue-image" data-image-kind="placeholder">
      <VenueArt venue={venue} eager={eager} />
      <figcaption className="vn-cap">{caption}</figcaption>
    </figure>
  )
}
