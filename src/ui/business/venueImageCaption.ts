import type { VenueImage } from '../../assets/venueAssets'

/** The credit / disclosure line shown under a venue picture. Pure so it can be tested without a DOM. */
export function captionFor(image: VenueImage): string {
  if (image.kind === 'photo') return `Photo: ${image.attribution} · ${image.licence}`
  return image.label || 'Illustration — no licensed photograph'
}

/** Only an http(s) source link is ever rendered as a link. */
export function safeSourceUrl(image: VenueImage): string | null {
  return image.kind === 'photo' && /^https?:\/\//.test(image.sourceUrl) ? image.sourceUrl : null
}
