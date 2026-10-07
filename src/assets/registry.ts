/**
 * Central visual asset registry. The UI asks for "the portrait of fighter X", "the image for this venue", "the poster
 * template for this show" — never for a filename. Everything here is pure and deterministic (no RNG, no game state),
 * and resolves to either a shipped file or a generated fallback description, so a missing image can never break a screen.
 */
import manifestJson from '../../public/assets/manifest.json'

export type AssetKind = 'fighter.profile' | 'fighter.action' | 'fighter.celebration' | 'promotion.logo' | 'promotion.banner' | 'venue' | 'eventTemplate' | 'news' | 'ui'
export type AssetState = 'real' | 'fallback'

export interface ManifestEntry { id: string; type: string; entityId: string; path: string; width: number; height: number; format: string; status: string }
interface ClassDef { dir: string; file: string; width: number; height: number; thumb?: { width: number; height: number; file: string }; format: string; status: string; ids: string[] }
interface Manifest { version: number; shipped: ManifestEntry[]; classes: Record<string, ClassDef> }
export const MANIFEST = manifestJson as unknown as Manifest

/** Where static assets are served from. Not bundled into JS: they are plain files under /assets. */
export function assetUrl(path: string): string {
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
  return `${base.endsWith('/') ? base : base + '/'}assets/${path}`
}

export interface ResolvedAsset {
  assetId: string
  kind: AssetKind
  entityId: string
  state: AssetState
  /** Full-size file, or null when the fallback is used (the UI never requests a missing file). */
  url: string | null
  /** Small version for lists (falls back to `url`). */
  thumbUrl: string | null
  width: number
  height: number
  /** Key the fallback renderer uses (venue kind, template id, news kind…). */
  fallbackKey: string
}

const byEntity = new Map<string, ManifestEntry>()
for (const e of MANIFEST.shipped) byEntity.set(`${e.type}:${e.entityId}`, e)

function shipped(type: string, entityId: string, kind: AssetKind): ResolvedAsset {
  const e = byEntity.get(`${type}:${entityId}`)
  if (!e) return { assetId: `${type}.${entityId}`, kind, entityId, state: 'fallback', url: null, thumbUrl: null, width: 0, height: 0, fallbackKey: entityId }
  const url = assetUrl(e.path)
  return { assetId: e.id, kind, entityId, state: 'real', url, thumbUrl: url, width: e.width, height: e.height, fallbackKey: entityId }
}

// ------------------------------------------------------------------------------------------------ fighters
export type FighterVariant = 'profile' | 'action' | 'celebration'
export interface FighterRef { id: string; firstName: string; lastName: string; division?: string }

const fighterIds: Record<FighterVariant, Set<string>> = {
  profile: new Set(MANIFEST.classes['fighter.profile'].ids),
  action: new Set(MANIFEST.classes['fighter.action'].ids),
  celebration: new Set(MANIFEST.classes['fighter.celebration'].ids),
}

/** Test/dev hook: register art for fighters (e.g. an asset pack loaded at start-up). */
export function registerFighterArt(variant: FighterVariant, ids: string[]): void { for (const id of ids) fighterIds[variant].add(id) }
export function clearFighterArt(): void { for (const s of Object.values(fighterIds)) s.clear() }

export function resolveFighterImage(f: FighterRef, variant: FighterVariant = 'profile'): ResolvedAsset {
  const cls = MANIFEST.classes[`fighter.${variant}`]
  const kind = `fighter.${variant}` as AssetKind
  const has = fighterIds[variant].has(f.id)
  const fallbackKey = fighterFallback(f).key
  if (!has) return { assetId: `fighter.${variant}.${f.id}`, kind, entityId: f.id, state: 'fallback', url: null, thumbUrl: null, width: cls.width, height: cls.height, fallbackKey }
  const url = assetUrl(`${cls.dir}/${cls.file.replace('{id}', f.id)}`)
  const thumbUrl = cls.thumb ? assetUrl(`${cls.dir}/${cls.thumb.file.replace('{id}', f.id)}`) : url
  return { assetId: `fighter.${variant}.${f.id}`, kind, entityId: f.id, state: 'real', url, thumbUrl, width: cls.width, height: cls.height, fallbackKey }
}

const DIVISION_HUE: [RegExp, number][] = [
  [/minimum|strawweight/i, 205], [/fly/i, 190], [/bantam/i, 165], [/feather/i, 140], [/light ?heavy/i, 350], [/cruiser/i, 320], [/heavy/i, 280], [/light/i, 100], [/welter/i, 48], [/middle/i, 28],
]
export interface FighterFallback { key: string; initials: string; hue: number }
/** Silhouette + initials + division colour. Uses only public data (name, division, id). */
export function fighterFallback(f: FighterRef): FighterFallback {
  const initials = `${f.firstName[0] ?? ''}${f.lastName[0] ?? ''}`.toUpperCase()
  let hue = f.division ? DIVISION_HUE.find(([re]) => re.test(f.division!))?.[1] : undefined
  if (hue === undefined) { let h = 0; for (const c of f.id) h = (h * 31 + c.charCodeAt(0)) >>> 0; hue = h % 360 }
  return { key: `${initials}:${hue}`, initials, hue }
}

// ------------------------------------------------------------------------------------------------ venues
export const VENUE_KINDS = ['local-hall', 'sports-centre', 'theatre', 'regional-arena', 'national-arena', 'major-arena', 'stadium', 'outdoor-stadium', 'international'] as const
export type VenueKind = (typeof VENUE_KINDS)[number]
export const VENUE_KIND_LABEL: Record<VenueKind, string> = {
  'local-hall': 'Local hall', 'sports-centre': 'Sports centre', theatre: 'Theatre', 'regional-arena': 'Regional arena', 'national-arena': 'National arena',
  'major-arena': 'Major arena', stadium: 'Stadium', 'outdoor-stadium': 'Outdoor stadium', international: 'International venue',
}
export interface VenueRef { id?: string; name: string; tier: 'local' | 'regional' | 'national' | 'arena' | 'stadium'; capacity: number }

/** Public venue facts (tier, capacity, name) → one of the nine venue looks. */
export function venueKind(v: VenueRef): VenueKind {
  const n = v.name.toLowerCase()
  if (/international|world|global/.test(n)) return 'international'
  if (/theatre|theater|ballroom/.test(n)) return 'theatre'
  if (/sports centre|sports center|leisure|gym/.test(n)) return 'sports-centre'
  switch (v.tier) {
    case 'local': return 'local-hall'
    case 'regional': return v.capacity < 2000 ? 'sports-centre' : 'regional-arena'
    case 'national': return 'national-arena'
    case 'arena': return v.capacity >= 15000 ? 'major-arena' : 'national-arena'
    case 'stadium': return v.capacity >= 50000 ? 'outdoor-stadium' : 'stadium'
  }
}
export function resolveVenueImage(v: VenueRef): ResolvedAsset { return { ...shipped('venue', venueKind(v), 'venue'), entityId: v.id ?? venueKind(v) } }

export function resolveVenueKind(k: VenueKind): ResolvedAsset { return shipped('venue', k, 'venue') }

// ------------------------------------------------------------------------------------------------ promotions
const promoIds = { logo: new Set(MANIFEST.classes['promotion.logo'].ids), banner: new Set(MANIFEST.classes['promotion.banner'].ids) }
export function registerPromotionArt(variant: 'logo' | 'banner', ids: string[]): void { for (const id of ids) promoIds[variant].add(id) }
export function clearPromotionArt(): void { promoIds.logo.clear(); promoIds.banner.clear() }
export function resolvePromotionImage(promotionId: string, variant: 'logo' | 'banner' = 'logo'): ResolvedAsset {
  const cls = MANIFEST.classes[`promotion.${variant}`]
  const kind = `promotion.${variant}` as AssetKind
  if (!promoIds[variant].has(promotionId)) return { assetId: `promotion.${variant}.${promotionId}`, kind, entityId: promotionId, state: 'fallback', url: null, thumbUrl: null, width: cls.width, height: cls.height, fallbackKey: 'monogram' }
  const url = assetUrl(`${cls.dir}/${cls.file.replace('{id}', promotionId)}`)
  return { assetId: `promotion.${variant}.${promotionId}`, kind, entityId: promotionId, state: 'real', url, thumbUrl: url, width: cls.width, height: cls.height, fallbackKey: 'monogram' }
}

// ------------------------------------------------------------------------------------------------ events
export const POSTER_TEMPLATES = ['fight-night', 'championship', 'rivalry', 'main-event', 'ppv', 'international', 'next-generation', 'big-event'] as const
export type PosterTemplateId = (typeof POSTER_TEMPLATES)[number]
export const POSTER_LABEL: Record<PosterTemplateId, string> = {
  'fight-night': 'Fight Night', championship: 'Championship', rivalry: 'Rivalry', 'main-event': 'Main Event', ppv: 'Pay-per-view', international: 'International', 'next-generation': 'Next Generation', 'big-event': 'Big Event',
}
export function resolveEventTemplate(id: PosterTemplateId): ResolvedAsset { return shipped('eventTemplate', id, 'eventTemplate') }

// ------------------------------------------------------------------------------------------------ news
export const NEWS_KINDS = ['signing', 'knockout', 'championship', 'retirement', 'comeback', 'injury', 'upset', 'rivalry', 'press', 'sold-out', 'contract', 'media', 'training', 'milestone', 'business', 'world'] as const
export type NewsKind = (typeof NEWS_KINDS)[number]
export const NEWS_KIND_LABEL: Record<NewsKind, string> = {
  signing: 'Signing', knockout: 'Knockout', championship: 'Championship', retirement: 'Retirement', comeback: 'Comeback', injury: 'Injury', upset: 'Upset', rivalry: 'Rivalry',
  press: 'Press conference', 'sold-out': 'Sold out', contract: 'Contract', media: 'Media', training: 'Training', milestone: 'Milestone', business: 'Business', world: 'World boxing',
}
export interface NewsRef { category: string; headline: string }
/** News category + headline wording (both public) → the image category. */
export function newsKind(n: NewsRef): NewsKind {
  const h = n.headline.toLowerCase()
  if (/sold out|sell-?out/.test(h)) return 'sold-out'
  if (/comeback|returns/.test(h) && n.category !== 'result') return 'comeback'
  if (/injur/.test(h)) return 'injury'
  switch (n.category) {
    case 'retirement': return 'retirement'
    case 'signing': return 'signing'
    case 'release': return 'contract'
    case 'prospect': return 'training'
    case 'market': return 'business'
    case 'business': return 'business'
    case 'event': return 'media'
    case 'result':
      if (/major upset|upset/.test(h)) return 'upset'
      if (/\bko\b|knock|stops|stopped|tko|stoppage/.test(h)) return 'knockout'
      if (/title|champion|belt/.test(h)) return 'championship'
      if (/rematch|rivalry/.test(h)) return 'rivalry'
      return 'milestone'
    default: return 'world'
  }
}
export function resolveNewsImage(n: NewsRef): ResolvedAsset { const k = newsKind(n); return shipped('news', k, 'news') }
export function resolveNewsKind(k: NewsKind): ResolvedAsset { return shipped('news', k, 'news') }

// ------------------------------------------------------------------------------------------------ gallery (dev)
export interface GalleryEntry { assetId: string; kind: AssetKind; entityId: string; type: string; file: string; width: number; height: number; state: AssetState }
/** Everything the registry knows about, for the development-only gallery. */
export function galleryEntries(): GalleryEntry[] {
  const rows: GalleryEntry[] = []
  for (const k of VENUE_KINDS) { const r = resolveVenueKind(k); rows.push({ assetId: r.assetId, kind: 'venue', entityId: k, type: 'venue', file: r.url ?? '(fallback)', width: r.width, height: r.height, state: r.state }) }
  for (const t of POSTER_TEMPLATES) { const r = resolveEventTemplate(t); rows.push({ assetId: r.assetId, kind: 'eventTemplate', entityId: t, type: 'event template', file: r.url ?? '(fallback)', width: r.width, height: r.height, state: r.state }) }
  for (const k of NEWS_KINDS) { const r = resolveNewsKind(k); rows.push({ assetId: r.assetId, kind: 'news', entityId: k, type: 'news', file: r.url ?? '(fallback)', width: r.width, height: r.height, state: r.state }) }
  for (const [cls, def] of Object.entries(MANIFEST.classes)) rows.push({ assetId: cls, kind: cls as AssetKind, entityId: `${def.ids.length} with art`, type: cls.split('.')[0], file: `${def.dir}/${def.file}`, width: def.width, height: def.height, state: def.ids.length ? 'real' : 'fallback' })
  return rows
}
