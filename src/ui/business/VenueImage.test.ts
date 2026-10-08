import { describe, expect, it } from 'vitest'
import type { VenueImage } from '../../assets/venueAssets'
import { captionFor, safeSourceUrl } from './venueImageCaption'

const photo: VenueImage = { kind: 'photo', src: '/assets/venues/x.webp', attribution: 'Jane Doe', licence: 'CC BY 4.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:X.jpg' }
const placeholder: VenueImage = { kind: 'placeholder', label: 'Illustration — no licensed photograph' }

describe('captionFor', () => {
  it('credits the author and licence for a photograph', () => {
    expect(captionFor(photo)).toBe('Photo: Jane Doe · CC BY 4.0')
    expect(safeSourceUrl(photo)).toBe('https://commons.wikimedia.org/wiki/File:X.jpg')
  })
  it('labels a placeholder as an illustration and has no source link', () => {
    expect(captionFor(placeholder)).toMatch(/Illustration/)
    expect(safeSourceUrl(placeholder)).toBeNull()
  })
  it('never links a non-http source', () => {
    expect(safeSourceUrl({ ...photo, sourceUrl: 'javascript:alert(1)' } as VenueImage)).toBeNull()
  })
})
