/**
 * Central visual asset registry. The UI asks for "the portrait of fighter X", "the image for this venue", "the poster
 * template for this show" — never for a filename. Everything here is pure and deterministic (no RNG, no game state),
 * and resolves to either a shipped file or a generated fallback description, so a missing image can never break a screen.
 */
import manifestJson from '../../public/assets/manifest.json'

export type AssetKind = 'fighter.profile' | 'fighter.action' | 'fighter.celebration' | 'promotion.logo' | 'promotion.mark' | 'venue' | 'eventTemplate' | 'news' | 'ui'
export type AssetState = 'real' | 'fallback'

export interface ManifestEntry { id: string; type: string; entityId: string; path: string; width: number; height: number; format: string; status: string }
interface ClassDef { dir: string; file: string; width: number; height: number; format: string; status: string; ids: string[] }
interface Manifest { version: number; shipped: ManifestEntry[]; artWorld: { seed: string | null }; classes: Record<string, ClassDef> }
export const MANIFEST = manifestJson as unknown as Manifest

/** Where static assets are served from. Not bundled into JS: they are plain files under /assets. */
export function assetUrl(path: string, base: string = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'): string {
  // '/' (dev, production at the site root), './' or '' (relative builds such as the hosted preview, whose files are published
  // next to the page as `assets/...`). Never produces a leading './' so a relative page resolves it as a sibling path.
  const b = base === './' || base === '.' || base === '' ? '' : base.endsWith('/') ? base : base + '/'
  return `${b}assets/${path}`
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

// ------------------------------------------------------------------------------------------------ art index
/** Entities that currently have a generated file, per asset class (from the manifest; tests/dev can register more). */
const artIds = new Map<string, Set<string>>()
const thumbIds = new Set<string>()
function idsOf(cls: string): Set<string> {
  let s = artIds.get(cls)
  if (!s) { s = new Set(MANIFEST.classes[cls]?.ids ?? []); artIds.set(cls, s) }
  return s
}
for (const t of (MANIFEST.classes['fighter.profile'] as ClassDef & { thumbIds?: string[] }).thumbIds ?? []) thumbIds.add(t)
let activeWorld: string | null = null
/** Fighter artwork belongs to one generated world: it only appears in a game created with that world seed. */
export function setArtWorld(seed: string | null): void { activeWorld = seed }
export const artWorldSeed = (): string | null => MANIFEST.artWorld?.seed ?? null
/** True if any generated fighter art exists (the title screen then offers the illustrated world). */
export const hasFighterArt = (): boolean => !!artWorldSeed() && ['fighter.profile', 'fighter.action', 'fighter.celebration'].some((c) => idsOf(c).size > 0)
const worldMatches = () => !artWorldSeed() || activeWorld === artWorldSeed()
/** Test/dev hook: register art for entities of a class (e.g. 'fighter.profile', 'venue'). */
export function registerArt(cls: string, ids: string[]): void { for (const id of ids) idsOf(cls).add(id) }
export function clearArt(): void { for (const c of Object.keys(MANIFEST.classes)) idsOf(c).clear(); thumbIds.clear() }
function classUrl(cls: string, id: string, suffix = ''): string {
  const def = MANIFEST.classes[cls]
  return assetUrl(`${def.dir}/${def.file.replace('{id}', id).replace(/\.webp$/, `${suffix}.webp`)}`)
}

// ------------------------------------------------------------------------------------------------ fighters
export type FighterVariant = 'profile' | 'action' | 'celebration'
export interface FighterRef { id: string; firstName: string; lastName: string; division?: string }

export function registerFighterArt(variant: FighterVariant, ids: string[]): void { registerArt(`fighter.${variant}`, ids) }
export function clearFighterArt(): void { for (const v of ['profile', 'action', 'celebration']) idsOf(`fighter.${v}`).clear(); thumbIds.clear() }
export function registerFighterThumbs(ids: string[]): void { for (const i of ids) thumbIds.add(i) }

export function resolveFighterImage(f: FighterRef, variant: FighterVariant = 'profile'): ResolvedAsset {
  const cls = MANIFEST.classes[`fighter.${variant}`]
  const kind = `fighter.${variant}` as AssetKind
  const fallbackKey = fighterFallback(f).key
  if (!worldMatches() || !idsOf(`fighter.${variant}`).has(f.id)) return { assetId: `fighter.${variant}.${f.id}`, kind, entityId: f.id, state: 'fallback', url: null, thumbUrl: null, width: cls.width, height: cls.height, fallbackKey }
  const url = classUrl(`fighter.${variant}`, f.id)
  const thumbUrl = variant === 'profile' && thumbIds.has(f.id) ? classUrl('fighter.profile', f.id, '_thumb') : url
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
export const VENUE_KINDS = ['local-hall', 'sports-centre', 'theatre', 'regional-arena', 'national-arena', 'major-arena', 'stadium', 'outdoor-stadium', 'international', 'vegas-arena', 'uk-arena'] as const
export type VenueKind = (typeof VENUE_KINDS)[number]
export const VENUE_KIND_LABEL: Record<VenueKind, string> = {
  'local-hall': 'Local hall', 'sports-centre': 'Sports centre', theatre: 'Theatre', 'regional-arena': 'Regional arena', 'national-arena': 'National arena',
  'major-arena': 'Major arena', stadium: 'Stadium', 'outdoor-stadium': 'Outdoor stadium', international: 'International venue', 'vegas-arena': 'Las Vegas-style arena', 'uk-arena': 'UK arena',
}
export interface VenueRef { id?: string; name: string; tier: 'local' | 'regional' | 'national' | 'arena' | 'stadium'; capacity: number; city?: string; country?: string }

const UK = new Set(['ENG', 'WAL', 'SCO', 'NIR', 'GBR'])
/** Public venue facts (tier, capacity, name) → one of the nine venue looks. */
export function venueKind(v: VenueRef): VenueKind {
  const n = v.name.toLowerCase()
  if (/international|world|global/.test(n)) return 'international'
  if (/theatre|theater|ballroom/.test(n)) return 'theatre'
  if ((v.tier === 'national' || v.tier === 'arena') && (v.city === 'Las Vegas' || /casino|resort/.test(n))) return 'vegas-arena'
  if (/sports centre|sports center|leisure|gym/.test(n)) return 'sports-centre'
  switch (v.tier) {
    case 'local': return 'local-hall'
    case 'regional': return v.capacity < 2000 ? 'sports-centre' : 'regional-arena'
    case 'national': return v.country && UK.has(v.country) && v.capacity >= 4000 ? 'uk-arena' : 'national-arena'
    case 'arena': return v.capacity >= 15000 ? 'major-arena' : v.country && UK.has(v.country) ? 'uk-arena' : 'national-arena'
    case 'stadium': return v.capacity >= 50000 ? 'outdoor-stadium' : 'stadium'
  }
}
/** A generated image for this exact venue entity if one exists, otherwise the reusable look for its kind, otherwise the tier backdrop. */
export function resolveVenueImage(v: VenueRef): ResolvedAsset {
  if (v.id && idsOf('venue').has(v.id)) {
    const def = MANIFEST.classes.venue
    const url = classUrl('venue', v.id)
    return { assetId: `venue.${v.id}`, kind: 'venue', entityId: v.id, state: 'real', url, thumbUrl: url, width: def.width, height: def.height, fallbackKey: venueKind(v) }
  }
  return { ...shipped('venue', venueKind(v), 'venue'), entityId: v.id ?? venueKind(v) }
}

export function resolveVenueKind(k: VenueKind): ResolvedAsset { return shipped('venue', k, 'venue') }

// ------------------------------------------------------------------------------------------------ promotions
export function registerPromotionArt(variant: 'logo' | 'mark', ids: string[]): void { registerArt(`promotion.${variant}`, ids) }
export function clearPromotionArt(): void { idsOf('promotion.logo').clear(); idsOf('promotion.mark').clear() }
/** Logo (large) or compact mark. Promotion ids are stable across worlds, so no world check. Falls back to the generated monogram. */
export function resolvePromotionImage(promotionId: string, variant: 'logo' | 'mark' = 'logo'): ResolvedAsset {
  const cls = MANIFEST.classes[`promotion.${variant}`]
  const kind = `promotion.${variant}` as AssetKind
  if (!idsOf(`promotion.${variant}`).has(promotionId)) return { assetId: `promotion.${variant}.${promotionId}`, kind, entityId: promotionId, state: 'fallback', url: null, thumbUrl: null, width: cls.width, height: cls.height, fallbackKey: 'monogram' }
  const url = classUrl(`promotion.${variant}`, promotionId)
  return { assetId: `promotion.${variant}.${promotionId}`, kind, entityId: promotionId, state: 'real', url, thumbUrl: url, width: cls.width, height: cls.height, fallbackKey: 'monogram' }
}

// ------------------------------------------------------------------------------------------------ events
export const POSTER_TEMPLATES = ['fight-night', 'championship', 'rivalry', 'main-event', 'ppv', 'international', 'next-generation', 'big-event'] as const
export type PosterTemplateId = (typeof POSTER_TEMPLATES)[number]
export const POSTER_LABEL: Record<PosterTemplateId, string> = {
  'fight-night': 'Fight Night', championship: 'Championship', rivalry: 'Rivalry', 'main-event': 'Main Event', ppv: 'Pay-per-view', international: 'International', 'next-generation': 'Next Generation', 'big-event': 'Big Event',
}
export function resolveEventTemplate(id: PosterTemplateId): ResolvedAsset {
  if (idsOf('eventTemplate').has(id)) { const def = MANIFEST.classes.eventTemplate; const url = classUrl('eventTemplate', id); return { assetId: `eventTemplate.${id}`, kind: 'eventTemplate', entityId: id, state: 'real', url, thumbUrl: url, width: def.width, height: def.height, fallbackKey: id } }
  return shipped('eventTemplate', id, 'eventTemplate')
}

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
export function resolveNewsImage(n: NewsRef): ResolvedAsset { return resolveNewsKind(newsKind(n)) }
export function resolveNewsKind(k: NewsKind): ResolvedAsset {
  if (idsOf('news').has(k)) { const def = MANIFEST.classes.news; const url = classUrl('news', k); return { assetId: `news.${k}`, kind: 'news', entityId: k, state: 'real', url, thumbUrl: url, width: def.width, height: def.height, fallbackKey: k } }
  return shipped('news', k, 'news')
}

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
