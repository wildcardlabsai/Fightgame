/**
 * REAL-VENUE IMAGERY — provenance and licensing architecture.
 *
 * No photograph of a real venue is scraped, copied or generated in this project. This module is the only door through which a real
 * venue picture can reach the UI, and it opens only for a record that is APPROVED and fully documented: who made it, where it came
 * from, under what licence, what attribution it needs, where the file lives locally and its content hash. Everything else gets the
 * game's own generated / placeholder art (the venue-kind illustration). A production build never shows an unapproved record.
 *
 * As shipped, `VENUE_ASSET_RECORDS` is EMPTY: the game holds ZERO licensed venue photographs and claims no permission from any venue,
 * operator, photographer or rights holder. Adding one means adding a record here AND the file under `public/assets/venues/`, after the
 * rights have actually been cleared (see docs/FIGHT_BUSINESS.md → “Adding a venue photograph”).
 */
import { REAL_VENUE_BY_ID } from '../data/realVenues'

export type VenueAssetType = 'exterior' | 'interior' | 'ring' | 'aerial' | 'logo'
export type VenueAssetSource = 'wikimedia-commons' | 'venue-official' | 'press-kit' | 'commissioned' | 'user-upload' | 'generated' | 'placeholder'

/** Licences the project is willing to display with attribution. Anything else cannot be approved. */
export const ALLOWED_LICENCES = ['CC0', 'CC BY 4.0', 'CC BY-SA 4.0', 'CC BY 3.0', 'CC BY-SA 3.0', 'Public domain', 'Commissioned (work for hire)', 'Written permission'] as const
export type VenueLicence = (typeof ALLOWED_LICENCES)[number]

export interface VenueAssetRecord {
  venueId: string
  assetType: VenueAssetType
  source: VenueAssetSource
  /** Where it came from (a page a person can open to check the licence). */
  sourceUrl: string
  licence: VenueLicence | 'unknown'
  /** The credit line shown with the image. */
  attribution: string
  /** Only an approved record is ever displayed. Approval is a human decision recorded in source control. */
  approved: boolean
  /** Path under `public/`, e.g. `assets/venues/rv_o2_arena/exterior-1200.webp`. */
  localAssetPath: string | null
  /** SHA-256 (hex) of the file at `localAssetPath`. */
  hash: string | null
  version: number
  width?: number
  height?: number
  /** Optional smaller renditions for responsive loading. */
  srcset?: { path: string; width: number }[]
}

/** The shipped records. EMPTY by design — see the header. */
export const VENUE_ASSET_RECORDS: VenueAssetRecord[] = []

export interface RecordProblem { venueId: string; problem: string }

/** Why a record cannot be shown. An approved record with any problem is a configuration error, caught by the tests. */
export function recordProblems(r: VenueAssetRecord): string[] {
  const out: string[] = []
  if (!REAL_VENUE_BY_ID[r.venueId]) out.push('unknown venue')
  if (r.source === 'generated' || r.source === 'placeholder') { if (r.approved) out.push('generated art is not a photograph of a real venue and cannot be approved as one') }
  if (r.approved) {
    if (r.licence === 'unknown' || !(ALLOWED_LICENCES as readonly string[]).includes(r.licence)) out.push('approved without an allowed licence')
    if (!r.sourceUrl || !/^https?:\/\//.test(r.sourceUrl)) out.push('approved without a source URL')
    if (!r.attribution.trim()) out.push('approved without attribution')
    if (!r.localAssetPath || !r.localAssetPath.startsWith('assets/venues/')) out.push('approved without a local file under assets/venues/')
    if (!r.hash || !/^[0-9a-f]{64}$/.test(r.hash)) out.push('approved without a content hash')
  }
  return out
}

export function validateRecords(records: VenueAssetRecord[]): RecordProblem[] {
  const out: RecordProblem[] = []
  const seen = new Set<string>()
  for (const r of records) {
    for (const p of recordProblems(r)) out.push({ venueId: r.venueId, problem: p })
    const key = `${r.venueId}|${r.assetType}|${r.version}`
    if (seen.has(key)) out.push({ venueId: r.venueId, problem: 'duplicate record' })
    seen.add(key)
  }
  return out
}

/** Approved, fully documented images for a venue (newest version of each type first). */
export function approvedAssets(venueId: string, records: VenueAssetRecord[] = VENUE_ASSET_RECORDS): VenueAssetRecord[] {
  return records.filter((r) => r.venueId === venueId && r.approved && recordProblems(r).length === 0).sort((a, b) => b.version - a.version)
}

export type VenueImage =
  | { kind: 'photo'; src: string; srcset?: string; attribution: string; licence: string; sourceUrl: string; width?: number; height?: number }
  | { kind: 'placeholder'; label: string }

/** What the UI may show for a venue: an approved photograph with its credit, or the game’s own placeholder art. */
export function venueImageFor(venueId: string, assetType: VenueAssetType = 'exterior', records: VenueAssetRecord[] = VENUE_ASSET_RECORDS): VenueImage {
  const hit = approvedAssets(venueId, records).find((r) => r.assetType === assetType)
  if (!hit || !hit.localAssetPath) return { kind: 'placeholder', label: 'Illustration — no licensed photograph' }
  const base = import.meta.env?.BASE_URL ?? '/'
  return {
    kind: 'photo', src: `${base}${hit.localAssetPath}`.replace(/\/{2,}/g, '/'), attribution: hit.attribution, licence: hit.licence, sourceUrl: hit.sourceUrl, width: hit.width, height: hit.height,
    srcset: hit.srcset?.length ? hit.srcset.map((s) => `${base}${s.path} ${s.width}w`.replace(/\/{2,}/g, '/')).join(', ') : undefined,
  }
}

/** How many real venues have an approved photograph (reported in the docs and the dev gallery). */
export function licensedPhotoCount(records: VenueAssetRecord[] = VENUE_ASSET_RECORDS): number {
  return new Set(records.filter((r) => r.approved && recordProblems(r).length === 0).map((r) => r.venueId)).size
}
