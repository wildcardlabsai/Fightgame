/**
 * OFFLINE PHOTOGRAPHIC PORTRAIT PIPELINE. Generates photorealistic portraits of FICTIONAL boxers with an image-generation provider you
 * configure (the same env contract as src/assetgen/provider.ts) and files them into the shared portrait slots. The game never calls a
 * provider: it only ships the finished files. With no provider configured this script plans, validates and reports; it will not draw
 * anything itself, and it never fabricates a photograph.
 *
 *   Replicate:  IMAGE_GEN_PROVIDER=replicate REPLICATE_API_TOKEN=…  [REPLICATE_MODEL=black-forest-labs/flux-2-pro]
 *   Generic:    IMAGE_GEN_PROVIDER=openai-compatible IMAGE_GEN_API_KEY=… IMAGE_GEN_BASE_URL=… IMAGE_GEN_MODEL=… \
 *   npx tsx scripts/assets/portrait-photos.ts --provider-check        free, read-only: token accepted? model + live schema as expected? (Replicate)
 *   npx tsx scripts/assets/portrait-photos.ts --pilot --yes           generate the 25-portrait pilot (slots 0–24), status "pilot"; without --yes it only prints the cost estimate
 *   npx tsx scripts/assets/portrait-photos.ts --generate --limit 40   next 40 missing slots in priority order (resumable)
 *   npx tsx scripts/assets/portrait-photos.ts --generate --slots 7,9  specific slots
 *   npx tsx scripts/assets/portrait-photos.ts --redo 7                regenerate one slot (the only way an existing file is overwritten)
 *   python3 -I scripts/assets/portrait_ingest.py extract asset-pipeline/portrait-source/SHEET.png   cut a supplied contact sheet into 4:5 crops (no provider)
 *   npx tsx scripts/assets/portrait-photos.ts --ingest-sheet SHEET.png   slot, encode and record the accepted crops as "pilot" (rejected crops get no slot)
 *   python3 -I scripts/assets/portrait_ingest.py extract asset-pipeline/portrait-source/SHEET.png   cut a SUPPLIED contact sheet into 4:5 crops (no provider needed)
 *   npx tsx scripts/assets/portrait-photos.ts --ingest-sheet SHEET.png   slot + encode the accepted crops as "pilot" (rejected crops get no slot, no file)
 *   npx tsx scripts/assets/portrait-photos.ts --approve 0-24          mark reviewed slots approved (only approved slots are ever shown)
 *   npx tsx scripts/assets/portrait-photos.ts --reject 3,8            mark slots rejected (they are queued for --generate again)
 *   npx tsx scripts/assets/portrait-photos.ts --activate              switch the game from the cartoon pool to the photographic library
 *   npx tsx scripts/assets/portrait-photos.ts --plan [--world SEED --weeks 104]   priority order + prompts, no provider needed
 *   npx tsx scripts/assets/portrait-photos.ts --contact-sheet out.png [--only pilot|approved]
 *   npx tsx scripts/assets/portrait-photos.ts --check                 validate files, hashes, sizes and the manifest (exit 1 on a problem)
 *
 * Files: public/assets/portraits-photo/pNNNN.webp (480×600) and pNNNN_t.webp (96×120), record in photos.json, summary in manifest.json.
 * Resumable: a slot with a file and a recorded hash is skipped; failures are recorded and retried (at most 3 attempts per run).
 * Needs python3 with Pillow (WebP) for resizing/encoding.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { providerFromEnv, type ImageGenerationProvider } from '../../src/assetgen/provider'
import { makeSpec, type Spec } from './portraits'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const DIR = process.env.PORTRAIT_PHOTO_DIR ?? join(ROOT, 'public', 'assets', 'portraits-photo')
const RECORD = join(DIR, 'photos.json')
const MANIFEST = process.env.PORTRAIT_MANIFEST ?? join(ROOT, 'public', 'assets', 'manifest.json')
const POOL = join(ROOT, 'public', 'assets', 'portraits', 'pool.json')
export const SIZE = { w: 480, h: 600, tw: 96, th: 120 }
export const BUDGET_BYTES = 12_000_000

export type Status = 'pilot' | 'approved' | 'rejected'
/** `resolution` is about the SOURCE: high ≥ 960 px wide crop (≥2× the 480 target), medium ≥ 640, low below (anything smaller than 480 is upscaled and must not be passed off as high-resolution). */
export type Resolution = 'high' | 'medium' | 'low'
export interface PhotoEntry { slot: number; status: Status; sha: string; thumbSha?: string; promptSha: string; bytes: number; provider: string; model: string; resolution?: Resolution; cropWidth?: number; supersedes?: string }
/** Where a supplied (not provider-generated) portrait came from, including crops that were rejected and so hold no slot. */
export interface SourceEntry { sheet: string; tile: string; slot: number | null; status: Status; note: string; cropSha: string; flags: string[]; resolution?: Resolution; cropWidth?: number; originalSha?: string; originalName?: string; superseded?: boolean; meta?: Record<string, unknown> }
export interface PhotoRecord { version: 1; entries: PhotoEntry[]; failures: Record<string, { attempts: number; error: string }>; sources?: SourceEntry[] }

const sha = (b: string | Uint8Array): string => createHash('sha256').update(b).digest('hex').slice(0, 16)
export const fileOf = (slot: number, thumb = false): string => `p${String(slot).padStart(4, '0')}${thumb ? '_t' : ''}.webp`

// ------------------------------------------------------------------------------------------------ prompts
const SKIN = ['very fair skin', 'fair skin with a light flush', 'light olive skin', 'warm tan skin', 'light brown skin', 'medium brown skin', 'rich brown skin', 'deep brown skin', 'dark brown skin', 'very dark brown skin']
const HAIR: Record<Spec['hairStyle'], string> = {
  bald: 'a shaved bald head', buzz: 'a very short buzz cut', crop: 'short cropped hair', fade: 'a short skin-fade haircut', slick: 'short slicked-back hair', curly: 'short natural curly hair',
  afro: 'a short natural afro', locs: 'short locs', bun: 'hair tied back in a small bun', quiff: 'a short textured quiff', waves: 'short wavy hair', 'shaved-part': 'short hair with a shaved side parting',
}
const BEARD: Record<Spec['beard'], string> = { none: 'clean-shaven', stubble: 'light stubble', moustache: 'a trimmed moustache', goatee: 'a neat goatee', full: 'a full short beard', soul: 'a small soul patch', chinstrap: 'a thin chinstrap beard' }
const MOOD: Record<Spec['expression'], string> = { neutral: 'a neutral, relaxed expression', determined: 'a focused, determined stare with a slightly furrowed brow', stern: 'a stern, serious expression', calm: 'a calm, composed expression with the faintest hint of a smile', smirk: 'a confident half-smirk', tired: 'a tired, heavy-lidded look' }
const MARK: Record<Spec['mark'], string> = { none: '', 'brow-scar': 'a faint old scar through one eyebrow', 'cheek-scar': 'a small faint scar on one cheekbone', 'lip-scar': 'a slight scar on the upper lip', 'swollen-brow': 'slight scar tissue over one brow', 'broken-nose': 'a slightly flattened, once-broken nose' }
const KIT: Record<Spec['kit'], string> = { tee: 'a plain dark fitted training t-shirt', hoodie: 'a plain dark training hoodie', robe: 'a plain dark satin boxing robe with no lettering', jacket: 'a plain dark zip training jacket', vest: 'a bare-shouldered athletic vest' }
/** A believable boxing age range (20–38), deterministic per slot, independent of the cartoon spec. */
export const ageOf = (slot: number): number => 20 + (parseInt(sha(`age-${slot}`).slice(0, 6), 16) % 19)
const face = (s: Spec): string => `${s.headW > 19.5 ? 'broad' : s.headW < 17.5 ? 'narrow' : 'medium-width'} face with ${s.jawW > 14.5 ? 'a square, strong jaw' : s.jawW < 11.5 ? 'a lean, tapered jaw' : 'a defined jaw'}`

/** One slot's prompt. Describes appearance only: no real person, no names, no text, no marks of any organisation. */
export function promptFor(slot: number): string {
  const s = makeSpec(slot)
  const bits = [
    `Professional boxing media-day portrait photograph of a fictional adult male boxer, about ${ageOf(slot)} years old, ${SKIN[s.skin]}, ${face(s)}, ${HAIR[s.hairStyle]}, ${BEARD[s.beard]}, ${MOOD[s.expression]}${MARK[s.mark] ? `, ${MARK[s.mark]}` : ''}.`,
    `Wearing ${KIT[s.kit]}. Head-and-shoulders framing, looking at the camera, shot on a full-frame camera with an 85mm lens at f/2.8, soft key light with a subtle rim light, understated dark charcoal studio background, shallow depth of field.`,
    'Natural skin texture with visible pores, fine lines and slight imperfections, realistic eyes with catchlights, natural teeth, realistic ears, individual hair strands. Sharp focus on the eyes, true photographic colour, no retouching, no illustration, no painting, no CGI.',
    'No text, no watermark, no logos, no championship belt, no gloves, not resembling any real person.',
  ]
  return bits.join(' ')
}

// ------------------------------------------------------------------------------------------------ record
export function loadRecord(): PhotoRecord { return existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, 'utf8')) : { version: 1, entries: [], failures: {} } }
export function saveRecord(r: PhotoRecord): void { mkdirSync(DIR, { recursive: true }); r.entries.sort((a, b) => a.slot - b.slot); writeFileSync(RECORD, JSON.stringify(r, null, 1) + '\n') }
const poolCount = (): number => (existsSync(POOL) ? JSON.parse(readFileSync(POOL, 'utf8')).count : 360)

export function syncManifest(r: PhotoRecord, activate?: boolean): void {
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  const prev = m.portraitPhotos
  m.portraitPhotos = {
    dir: 'portraits-photo', ext: 'webp', thumbSuffix: '_t', count: poolCount(), generator: 'external-provider', provider: r.entries[0]?.provider ?? prev?.provider ?? 'none',
    approved: r.entries.filter((e) => e.status === 'approved').map((e) => e.slot).sort((a, b) => a - b), active: activate ?? prev?.active ?? false,
  }
  if (!m.portraitPhotos.approved.length && !m.portraitPhotos.active) delete m.portraitPhotos
  writeFileSync(MANIFEST, JSON.stringify(m, null, 1) + '\n')
}

/** Resize/crop to 4:5 and encode WebP (full and thumbnail) with Pillow. Returns the encoded file sizes. */
export function encode(input: Uint8Array, slot: number): { bytes: number } {
  mkdirSync(DIR, { recursive: true })
  const tmp = join(DIR, `.incoming-${slot}`)
  writeFileSync(tmp, input)
  const py = `
import sys
from PIL import Image
src, out, thumb, W, H, TW, TH = sys.argv[1:8]
W,H,TW,TH = int(W),int(H),int(TW),int(TH)
im = Image.open(src).convert('RGB')
w,h = im.size; target = W/H
if w/h > target: nw = int(h*target); im = im.crop(((w-nw)//2, 0, (w-nw)//2+nw, h))
else: nh = int(w/target); im = im.crop((0, int((h-nh)*0.3), w, int((h-nh)*0.3)+nh))
im.resize((W,H), Image.LANCZOS).save(out, 'WEBP', quality=80, method=6)
im.resize((TW,TH), Image.LANCZOS).save(thumb, 'WEBP', quality=72, method=6)
`
  try { execFileSync('python3', ['-I', '-c', py, tmp, join(DIR, fileOf(slot)), join(DIR, fileOf(slot, true)), String(SIZE.w), String(SIZE.h), String(SIZE.tw), String(SIZE.th)]) } finally { rmSync(tmp, { force: true }) }
  return { bytes: statSync(join(DIR, fileOf(slot))).size }
}

// ------------------------------------------------------------------------------------------------ priority
import { NAME_GROUPS } from '../../src/data/namePools'
const HERITAGE: Record<string, string[]> = {
  ENG: ['British', 'Black British / Caribbean or African heritage', 'British South Asian', 'Irish heritage', 'Polish heritage', 'Italian heritage'],
  SCO: ['Scottish', 'British South Asian'], WAL: ['Welsh', 'mixed heritage'], USA: ['African American', 'Anglo American', 'Latino', 'Italian American', 'Irish American', 'Eastern European heritage', 'East / Southeast Asian heritage'],
  GER: ['German', 'Turkish heritage', 'Russian-German'], AUS: ['Anglo Australian', 'Pacific Islander heritage', 'Vietnamese heritage'], ARG: ['Argentine', 'Italian-Argentine'],
}
/** Casting hint from the NAME pool the fighter's names were drawn from (a fictional name, not a fact about appearance). */
export function heritageOf(nation: string, first: string, last: string): string {
  const gs = NAME_GROUPS[nation] ?? [], labels = HERITAGE[nation] ?? []
  const label = (i: number) => labels[i] ?? ({ MEX: 'Mexican', PUR: 'Puerto Rican', CUB: 'Cuban', DOM: 'Dominican', UKR: 'Ukrainian', POL: 'Polish', NGA: 'Nigerian', GHA: 'Ghanaian', JPN: 'Japanese', PHI: 'Filipino', KAZ: 'Kazakh', IRL: 'Irish' } as Record<string, string>)[nation] ?? nation
  const fi = gs.findIndex((g) => g.first.includes(first)), li = gs.findIndex((g) => g.last.includes(last))
  if (fi >= 0 && fi === li) return label(fi)
  if (fi >= 0 && li >= 0) return `${label(fi)} given name, ${label(li)} surname`
  return label(Math.max(fi, li, 0))
}
export const bracket = (age: number): string => (age < 23 ? 'early 20s' : age < 27 ? 'mid 20s' : age < 31 ? 'late 20s' : age < 35 ? 'early 30s' : 'mid to late 30s')

export interface PriorityFighter { rank: number; id: string; name: string; group: string; why: string; slot: number; slotState: string; nationality: string; heritage: string; age: number; division: string; heightCm: number; record: string; nickname: string | null }
export interface LoadedWorld { g: import('../../src/engine/types').GameState; label: string }
/** A world to plan against: an exported save (the player's real career), or a seed (+ weeks of simulation). */
export async function loadWorld(o: { save?: string; world?: string; weeks?: number }): Promise<LoadedWorld> {
  if (o.save) {
    const { deserialiseGame } = await import('../../src/engine/save')
    const g = deserialiseGame(readFileSync(o.save, 'utf8'))
    if (!g) throw new Error(`${o.save} is not a readable save`)
    return { g, label: `save ${g.seed}` }
  }
  const { createNewGame } = await import('../../src/engine/worldgen')
  const { advanceOneWeek } = await import('../../src/engine/tick')
  let g = createNewGame({ seed: o.world ?? 'promoter-ref', promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'P', color: '#fff', emblem: 'bolt' } }, 1_700_000_000_000)
  for (let w = 0; w < (o.weeks ?? 0); w++) g = advanceOneWeek(g)
  return { g, label: `seed ${g.seed} after ${o.weeks ?? 0} weeks` }
}

/** Fighters in the order portraits should be supplied: contracted, champions, contenders, main-event, then prospects and the rest. */
export async function priorityFighters(g: LoadedWorld['g'], limit = 12): Promise<PriorityFighter[]> {
  const { standingIndex } = await import('../../src/engine/business/titleStanding')
  const { assignPortraitSlots } = await import('../../src/assets/registry')
  const { cardSlots } = await import('../../src/engine/eventViews')
  const { weightClassLabel } = await import('../../src/data/weightClasses')
  const { fighterAge } = await import('../../src/engine/fighters')
  const slots = assignPortraitSlots(Object.keys(g.fighters), g.seed, poolCount())
  const stand = standingIndex(g)
  const rec = loadRecord()
  const mine = new Set(Object.values(g.contracts).filter((c) => c.promotionId === g.playerPromotionId && c.status === 'active').map((c) => c.fighterId))
  const main = new Set<string>()
  for (const ev of Object.values(g.events)) {
    if (ev.status === 'completed' || ev.status === 'cancelled') continue
    const cs = cardSlots(g, ev)
    for (const x of cs) if (x.slot === 'MAIN EVENT') { main.add(x.aId); main.add(x.bId) }
  }
  const LEVEL = ['area', 'domestic', 'european', 'world']
  const info = (id: string): { group: number; why: string; key: number } => {
    const f = g.fighters[id], s = stand(id)
    if (mine.has(id)) return { group: 0, why: 'contracted to you', key: -f.reputation }
    if (s.role === 'champion') return { group: 1, why: `champion: ${s.held.map((h) => h.short).join(' / ')} ${s.held[0]?.division ?? ''}`, key: -(LEVEL.indexOf(s.level ?? 'area') * 1000 + s.held.length * 100 + f.reputation) }
    if (s.role === 'mandatory' || s.role === 'eliminator' || s.role === 'contender') return { group: 2, why: `${s.role === 'contender' ? 'ranked contender' : s.role + ' challenger'}: ${s.label}`, key: (s.role === 'mandatory' ? 0 : s.role === 'eliminator' ? 1 : 2) * 1000 + (s.ranked?.rank ?? 99) * 10 - f.reputation / 100 }
    if (main.has(id)) return { group: 3, why: 'in an upcoming main event', key: -f.reputation }
    return { group: 4, why: 'other', key: -f.reputation }
  }
  const act = Object.values(g.fighters).filter((f) => f.status === 'active')
  const order = act.map((f) => ({ f, ...info(f.id) })).sort((a, b) => a.group - b.group || a.key - b.key).filter((x) => x.group < 4).slice(0, limit)
  return order.map((x, i) => {
    const slot = slots.get(x.f.id)!, e = rec.entries.find((y) => y.slot === slot)
    return { rank: i + 1, id: x.f.id, name: `${x.f.firstName} ${x.f.lastName}`, group: ['contracted', 'champion', 'contender', 'main-event'][x.group], why: x.why, slot, slotState: e ? `pilot photo (${e.status}${e.provider === 'supplied-artwork' ? ', low-res' : ''})` : 'empty', nationality: x.f.nationality, heritage: heritageOf(x.f.nationality, x.f.firstName, x.f.lastName), age: fighterAge(x.f, g.today), division: weightClassLabel(x.f.weightClass), heightCm: x.f.heightCm, record: `${x.f.record.wins}-${x.f.record.losses}-${x.f.record.draws}`, nickname: x.f.nickname }
  })
}

/** Slots in the order they should be produced. Without a world: 0..n-1. With one: the priority fighters' slots first, then the rest. */
export async function priorityOrder(opts: { world?: string; weeks?: number; save?: string }): Promise<number[]> {
  const n = poolCount()
  if (!opts.world && !opts.save) return Array.from({ length: n }, (_, i) => i)
  const { g } = await loadWorld(opts)
  const first = (await priorityFighters(g, 400)).map((p) => p.slot)
  const seen = new Set<number>(), out: number[] = []
  for (const s of first) if (!seen.has(s)) { seen.add(s); out.push(s) }
  for (let i = 0; i < n; i++) if (!seen.has(i)) out.push(i)
  return out
}

// ------------------------------------------------------------------------------------------------ generation
export interface GenOptions { slots: number[]; status: Status; provider: ImageGenerationProvider; attempts?: number; redo?: boolean; backoffMs?: number }
/** Generates the given slots. Skips finished ones (unless `redo`), records failures, never throws for a single bad image. Returns counts. */
export async function generate(o: GenOptions): Promise<{ made: number[]; skipped: number[]; failed: number[] }> {
  const st = await o.provider.checkStatus()
  if (!st.ready) throw new Error(`No image provider ready: ${st.detail}`)
  const rec = loadRecord()
  const made: number[] = [], skipped: number[] = [], failed: number[] = []
  for (const slot of o.slots) {
    const have = rec.entries.find((e) => e.slot === slot)
    if (have && have.status !== 'rejected' && !o.redo && existsSync(join(DIR, fileOf(slot)))) { skipped.push(slot); continue }
    const prompt = promptFor(slot)
    let ok = false, err = ''
    for (let a = 1; a <= (o.attempts ?? 3) && !ok; a++) {
      if (a > 1) await new Promise((r) => setTimeout(r, (o.backoffMs ?? 3000) * (a - 1)))
      const size = o.provider.portraitSize ?? { w: 1024, h: 1280 }
      const res = await o.provider.generateImage({ assetId: `portrait.${slot}`, prompt, width: size.w, height: size.h, seed: 100000 + slot, format: 'png' })
      if (!res.ok || !res.data) { err = res.error ?? 'no data'; continue }
      try {
        const { bytes } = encode(res.data, slot)
        const entry: PhotoEntry = { slot, status: o.status, sha: sha(readFileSync(join(DIR, fileOf(slot)))), thumbSha: sha(readFileSync(join(DIR, fileOf(slot, true)))), promptSha: sha(prompt), bytes, provider: st.provider, model: st.model, resolution: resolutionOf(size.w), cropWidth: size.w }
        rec.entries = rec.entries.filter((e) => e.slot !== slot).concat(entry)
        delete rec.failures[slot]
        ok = true
      } catch (e) { err = e instanceof Error ? e.message : String(e) }
    }
    if (ok) made.push(slot); else { failed.push(slot); rec.failures[slot] = { attempts: (rec.failures[slot]?.attempts ?? 0) + (o.attempts ?? 3), error: err.replace(/r8_[A-Za-z0-9]+/g, '[redacted]').slice(0, 200) } }
    saveRecord(rec) // after every image, so an interrupted run loses nothing
    syncManifest(rec)
  }
  return { made, skipped, failed }
}

/** Changes review status. Approving a LOW-resolution source (upscaled from under 640 px) is refused unless `allowLowRes` is set: it must be a deliberate choice. */
export function setStatus(slots: number[], status: Status, opts: { allowLowRes?: boolean } = {}): number {
  const rec = loadRecord()
  if (status === 'approved' && !opts.allowLowRes) {
    const low = rec.entries.filter((e) => slots.includes(e.slot) && (e.resolution ?? 'low') === 'low').map((e) => e.slot)
    if (low.length) throw new Error(`Slot(s) ${low.join(',')} come from low-resolution sources (upscaled). Replace them with high-resolution images, or pass --allow-lowres to approve them anyway.`)
  }
  let n = 0
  for (const e of rec.entries) if (slots.includes(e.slot) && e.status !== status) { e.status = status; n++ }
  saveRecord(rec); syncManifest(rec)
  return n
}

// ------------------------------------------------------------------------------------------------ supplied artwork
export const SOURCE_DIR = process.env.PORTRAIT_SOURCE_DIR ?? join(ROOT, 'asset-pipeline', 'portrait-source')
/**
 * Brings portraits cut from a supplied contact sheet into the library. Run `python3 -I scripts/assets/portrait_ingest.py extract <sheet>` first
 * (it writes <sheet>.tiles.json and the 4:5 crops); this step reads `<sheet>.review.json` for each tile's decision, gives every accepted crop a
 * stable slot (the lowest free one; a tile that already has a slot keeps it), encodes it to the standard WebP sizes and records it as "pilot".
 * Rejected crops get no slot and no file. Nothing is approved or activated here, and an existing slot's file is never overwritten.
 */
export function ingestSheet(sheet: string, opts: { startSlot?: number } = {}): { added: SourceEntry[]; kept: SourceEntry[]; rejected: SourceEntry[] } {
  const base = join(SOURCE_DIR, sheet.replace(/\.png$/, ''))
  const tiles = (JSON.parse(readFileSync(`${base}.tiles.json`, 'utf8')) as { tiles: { id: string; flags: string[]; crop_size?: number[] }[] }).tiles
  const review = existsSync(`${base}.review.json`) ? (JSON.parse(readFileSync(`${base}.review.json`, 'utf8')) as { tiles: Record<string, { status: Status; note: string }>; default?: Status }) : { tiles: {}, default: 'pilot' as Status }
  const rec = loadRecord()
  rec.sources ??= []
  const added: SourceEntry[] = [], kept: SourceEntry[] = [], rejected: SourceEntry[] = []
  const taken = new Set(rec.entries.map((e) => e.slot))
  let next = opts.startSlot ?? 0
  const nextFree = (): number => { while (taken.has(next)) next++; taken.add(next); return next }
  for (const t of tiles) {
    const crop = join(SOURCE_DIR, 'crops', `${t.id}.png`)
    const bytes = readFileSync(crop)
    const rv = review.tiles[t.id] ?? { status: review.default ?? 'pilot', note: '' }
    const prior = rec.sources.find((x) => x.tile === t.id)
    if (prior) { kept.push(prior); continue }
    const src: SourceEntry = { sheet, tile: t.id, slot: null, status: rv.status === 'rejected' ? 'rejected' : 'pilot', note: rv.note, cropSha: sha(bytes), flags: t.flags }
    if (src.status === 'rejected') { rejected.push(src); rec.sources.push(src); continue }
    const slot = nextFree()
    const { bytes: size } = encode(bytes, slot)
    const cropWidth = Number((tiles.find((x) => x.id === t.id) as unknown as { crop_size?: number[] }).crop_size?.[0] ?? 0)
    src.cropWidth = cropWidth; src.resolution = resolutionOf(cropWidth)
    rec.entries = rec.entries.filter((e) => e.slot !== slot).concat({ slot, status: 'pilot', sha: sha(readFileSync(join(DIR, fileOf(slot)))), thumbSha: sha(readFileSync(join(DIR, fileOf(slot, true)))), promptSha: src.cropSha, bytes: size, provider: 'supplied-artwork', model: `contact sheet ${sheet}, tile ${t.id}`, resolution: src.resolution, cropWidth })
    src.slot = slot
    rec.sources.push(src); added.push(src)
    saveRecord(rec); syncManifest(rec)
  }
  saveRecord(rec); syncManifest(rec)
  return { added, kept, rejected }
}

export const resolutionOf = (cropWidth: number): Resolution => (cropWidth >= 960 ? 'high' : cropWidth >= 640 ? 'medium' : 'low')
const IMG_EXT = /\.(png|jpe?g|webp)$/i
export const INCOMING_RE = /^slot-(\d{4})(?:__([\w.-]+))?\.(png|jpe?g|webp)$/i

export interface IncomingResult { ingested: { file: string; slot: number; resolution: Resolution; flags: string[] }[]; skipped: { file: string; reason: string }[] }
/**
 * Ingests individually supplied images from `<source>/incoming/`. File name: `slot-NNNN.png` (NNNN = the target slot, 4 digits; .png/.jpg/.webp),
 * optionally `slot-NNNN__<fighterId>.png` (the id is recorded, the SLOT is what maps). An optional sidecar `slot-NNNN.json` may hold
 * {"fighter","world","tags":{…},"crop":{"y":0.08}} (y = top of the 4:5 window as a fraction of the image height).
 * Per file: the original is moved UNCHANGED to `originals/`, an exact 4:5 native-resolution crop is made (never scaled up or padded), the crop is
 * downscaled to 480×600 + 96×120 WebP, hashed and recorded as "pilot" (unapproved). A slot that already holds a photograph is skipped unless
 * `replace`: then the old files are moved to `superseded/` (outside public/) and the slot's status resets to unapproved. Resolution is recorded
 * (high ≥ 960 px crop width, medium ≥ 640, low) and low sources cannot be approved without --allow-lowres.
 */
export function ingestIncoming(opts: { replace?: boolean; minWidth?: number } = {}): IncomingResult {
  const inc = join(SOURCE_DIR, 'incoming')
  const out: IncomingResult = { ingested: [], skipped: [] }
  if (!existsSync(inc)) return out
  const n = poolCount()
  const files = readdirSync(inc).filter((f) => IMG_EXT.test(f)).sort()
  const rec = loadRecord(); rec.sources ??= []
  for (const f of files) {
    const m = INCOMING_RE.exec(f)
    if (!m) { out.skipped.push({ file: f, reason: 'name must be slot-NNNN.png (or slot-NNNN__fighterId.png)' }); continue }
    const slot = Number(m[1])
    if (slot >= n) { out.skipped.push({ file: f, reason: `slot ${slot} is outside the pool (0–${n - 1})` }); continue }
    const prior = rec.entries.find((e) => e.slot === slot)
    if (prior && !opts.replace) { out.skipped.push({ file: f, reason: `slot ${slot} already holds a photograph (${prior.status}); use --replace to supersede it` }); continue }
    const orig = join(inc, f), bytes = readFileSync(orig)
    const meta = existsSync(join(inc, `slot-${m[1]}.json`)) ? (JSON.parse(readFileSync(join(inc, `slot-${m[1]}.json`), 'utf8')) as { fighter?: string; crop?: { y?: number } } & Record<string, unknown>) : {}
    mkdirSync(join(SOURCE_DIR, 'crops'), { recursive: true }); mkdirSync(join(SOURCE_DIR, 'originals'), { recursive: true })
    const cropPath = join(SOURCE_DIR, 'crops', `slot-${m[1]}.png`)
    const args = ['-I', join(ROOT, 'scripts', 'assets', 'portrait_ingest.py'), 'single', orig, cropPath, ...(meta.crop?.y !== undefined ? [String(meta.crop.y)] : [])]
    const info = JSON.parse(execFileSync('python3', args).toString()) as { size: number[]; crop_size: number[]; resolution: Resolution; flags: string[] }
    if (info.crop_size[0] < (opts.minWidth ?? 0)) { out.skipped.push({ file: f, reason: `crop is only ${info.crop_size[0]} px wide (minimum ${opts.minWidth})` }); rmSync(cropPath, { force: true }); continue }
    // Budget guard before anything is written to the library.
    const used = rec.entries.reduce((a, e) => a + e.bytes, 0)
    if (used > BUDGET_BYTES) { out.skipped.push({ file: f, reason: 'asset budget exhausted' }); continue }
    let supersedes: string | undefined
    if (prior) {
      mkdirSync(join(SOURCE_DIR, 'superseded'), { recursive: true })
      supersedes = prior.sha
      for (const th of [false, true]) { const p = join(DIR, fileOf(slot, th)); if (existsSync(p)) writeFileSync(join(SOURCE_DIR, 'superseded', `p${String(slot).padStart(4, '0')}${th ? '_t' : ''}.${prior.sha}.webp`), readFileSync(p)) }
      for (const x of rec.sources.filter((y) => y.slot === slot)) x.superseded = true
    }
    const ext = (m[3] ?? 'png').toLowerCase()
    const origSha = sha(bytes)
    writeFileSync(join(SOURCE_DIR, 'originals', `slot-${m[1]}.${origSha.slice(0, 8)}.${ext}`), bytes)
    rmSync(orig, { force: true })
    const { bytes: size } = encode(readFileSync(cropPath), slot)
    const entry: PhotoEntry = { slot, status: 'pilot', sha: sha(readFileSync(join(DIR, fileOf(slot)))), thumbSha: sha(readFileSync(join(DIR, fileOf(slot, true)))), promptSha: sha(readFileSync(cropPath)), bytes: size, provider: 'supplied-artwork', model: `individual image ${f}`, resolution: info.resolution, cropWidth: info.crop_size[0], supersedes }
    rec.entries = rec.entries.filter((e) => e.slot !== slot).concat(entry)
    rec.sources.push({ sheet: 'individual', tile: `slot-${m[1]}`, slot, status: 'pilot', note: '', cropSha: entry.promptSha, flags: info.flags, resolution: info.resolution, cropWidth: info.crop_size[0], originalSha: origSha, originalName: f, meta: { fighter: m[2] ?? meta.fighter, ...meta } })
    saveRecord(rec); syncManifest(rec)
    out.ingested.push({ file: f, slot, resolution: info.resolution, flags: info.flags })
  }
  return out
}

export function check(): string[] {
  const problems: string[] = []
  if (!existsSync(RECORD)) return existsSync(DIR) ? ['photos.json is missing'] : []
  const rec = loadRecord()
  const files = new Set(readdirSync(DIR).filter((f) => f.endsWith('.webp')))
  let total = 0
  const n = poolCount()
  for (const e of rec.entries) {
    if (e.slot < 0 || e.slot >= n) problems.push(`slot ${e.slot} outside the pool`)
    for (const f of [fileOf(e.slot), fileOf(e.slot, true)]) { if (!files.has(f)) problems.push(`missing ${f}`); files.delete(f) }
    const p = join(DIR, fileOf(e.slot))
    const tp = join(DIR, fileOf(e.slot, true))
    if (e.thumbSha && existsSync(tp) && sha(readFileSync(tp)) !== e.thumbSha) problems.push(`${fileOf(e.slot, true)} changed since it was recorded`)
    if (existsSync(p)) { const b = readFileSync(p); total += b.length + (existsSync(join(DIR, fileOf(e.slot, true))) ? statSync(join(DIR, fileOf(e.slot, true))).size : 0); if (sha(b) !== e.sha) problems.push(`${fileOf(e.slot)} changed since it was recorded`) }
  }
  for (const f of files) problems.push(`orphan ${f}`)
  if (new Set(rec.entries.map((e) => e.slot)).size !== rec.entries.length) problems.push('duplicate slot entries')
  for (const x of rec.sources ?? []) {
    const crop = join(SOURCE_DIR, 'crops', `${x.tile}.png`)
    if (existsSync(crop) && sha(readFileSync(crop)) !== x.cropSha) problems.push(`source crop ${x.tile} changed since it was recorded`)
    if (x.status === 'rejected' && x.slot !== null) problems.push(`rejected source ${x.tile} still holds slot ${x.slot}`)
    if (x.slot !== null && !x.superseded && !rec.entries.some((e) => e.slot === x.slot)) problems.push(`source ${x.tile} points at missing slot ${x.slot}`)
    if (x.originalSha && x.originalName) { const o = join(SOURCE_DIR, 'originals', `slot-${x.tile.slice(5)}.${x.originalSha.slice(0, 8)}.${(x.originalName.split('.').pop() ?? 'png').toLowerCase()}`); if (!existsSync(o)) problems.push(`original for ${x.tile} is missing`); else if (sha(readFileSync(o)) !== x.originalSha) problems.push(`original for ${x.tile} changed`) }
  }
  if (total > BUDGET_BYTES) problems.push(`photo library is ${(total / 1e6).toFixed(1)} MB, over the ${BUDGET_BYTES / 1e6} MB budget`)
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8')).portraitPhotos
  const approved = rec.entries.filter((e) => e.status === 'approved').map((e) => e.slot).sort((a, b) => a - b)
  if (JSON.stringify(m?.approved ?? []) !== JSON.stringify(approved)) problems.push('manifest.portraitPhotos.approved does not match photos.json')
  return problems
}

export const parseSlots = (t: string): number[] => t.split(',').flatMap((p) => { const [a, b] = p.split('-').map(Number); return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i) })

async function contactSheet(out: string, only?: string): Promise<void> {
  const rec = loadRecord()
  const es = rec.entries.filter((e) => (only === 'pilot' ? e.status === 'pilot' : only === 'approved' ? e.status === 'approved' : true))
  const html = `<body style="margin:0;background:#101012;color:#ddd;font:12px sans-serif"><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;padding:8px;width:1500px">${es.map((e) => `<figure style="margin:0"><img src="file://${join(DIR, fileOf(e.slot))}" style="width:100%;display:block"><figcaption style="padding:2px 4px">#${e.slot} · ${e.status}</figcaption></figure>`).join('')}</div></body>`
  const tmp = join(DIR, '.sheet.html'); writeFileSync(tmp, html)
  const { createRequire } = await import('node:module')
  const req = createRequire(import.meta.url)
  let chromium: { launch(): Promise<{ newPage(o: unknown): Promise<{ goto(u: string): Promise<void>; waitForTimeout(n: number): Promise<void>; screenshot(o: unknown): Promise<void> }>; close(): Promise<void> }> }
  try { ({ chromium } = req('playwright')) } catch { ({ chromium } = req('/opt/node-tools/node_modules/playwright')) }
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1516, height: 900 } })
  await p.goto(`file://${tmp}`); await p.waitForTimeout(800); await p.screenshot({ path: out, fullPage: true }); await b.close(); rmSync(tmp, { force: true })
}

if (process.argv[1] && process.argv[1].endsWith('portrait-photos.ts')) {
  const argv = process.argv.slice(2)
  const arg = (k: string): string | undefined => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
  const has = (k: string) => argv.includes(k)
  const main = async () => {
    if (has('--provider-check')) {
      const prov = providerFromEnv(process.env)
      const v = (prov as unknown as { verify?: () => Promise<{ ok: boolean; lines: string[] }> }).verify
      if (!v) { const st = await prov.checkStatus(); console.log(`${st.provider}: ${st.ready ? 'configured' : st.detail} (this provider has no free verification call)`); process.exit(st.ready ? 0 : 1) }
      const r = await v.call(prov); console.log(r.lines.join('\n')); process.exit(r.ok ? 0 : 1)
    }
    if (has('--check')) { const p = check(); console.log(p.length ? p.join('\n') : 'photographic portrait library healthy'); process.exit(p.length ? 1 : 0) }
    if (has('--priority')) {
      const w = await loadWorld({ world: arg('--world'), weeks: arg('--weeks') ? Number(arg('--weeks')) : undefined, save: arg('--save') })
      const list = await priorityFighters(w.g, Number(arg('--count') ?? 12))
      console.log(`Priority fighters for ${w.label} (pool of ${poolCount()} slots; slot is a pure function of the seed and the fighter id)`)
      for (const p of list) console.log(`${String(p.rank).padStart(2)}. ${p.id.padEnd(8)} slot ${String(p.slot).padStart(3)} [${p.slotState}] ${p.name}${p.nickname ? ` "${p.nickname}"` : ''} · ${p.why} · ${p.age} (${bracket(p.age)}) · ${p.division} ${p.heightCm} cm · ${p.nationality}/${p.heritage} · ${p.record}`)
      if (arg('--out')) writeFileSync(arg('--out')!, JSON.stringify({ world: w.label, seed: w.g.seed, poolSize: poolCount(), fighters: list }, null, 1) + '\n')
      return
    }
    if (has('--ingest-incoming')) {
      const r = ingestIncoming({ replace: has('--replace'), minWidth: arg('--min-width') ? Number(arg('--min-width')) : undefined })
      for (const x of r.ingested) console.log(`ingested ${x.file} → slot ${x.slot} (${x.resolution}-resolution${x.flags.length ? ', flags: ' + x.flags.join(',') : ''}) — unapproved`)
      for (const x of r.skipped) console.log(`skipped ${x.file}: ${x.reason}`)
      console.log(`${r.ingested.length} ingested, ${r.skipped.length} skipped`)
      return
    }
    if (has('--ingest-sheet')) {
      const r = ingestSheet(arg('--ingest-sheet')!, { startSlot: arg('--start-slot') ? Number(arg('--start-slot')) : 0 })
      console.log(`ingested ${r.added.length} (slots ${r.added.map((a) => a.slot).join(',')}), already present ${r.kept.length}, rejected ${r.rejected.length}${r.rejected.length ? ' (' + r.rejected.map((x) => x.tile).join(', ') + ')' : ''}`)
      return
    }
    if (has('--approve') || has('--reject')) { const k = has('--approve') ? '--approve' : '--reject'; console.log(`${setStatus(parseSlots(arg(k)!), k === '--approve' ? 'approved' : 'rejected', { allowLowRes: has('--allow-lowres') })} slot(s) updated`); return }
    if (has('--activate')) { const rec = loadRecord(); if (!rec.entries.some((e) => e.status === 'approved')) { console.error('Nothing is approved yet; refusing to activate.'); process.exit(1) } syncManifest(rec, true); console.log('photographic library active'); return }
    if (has('--contact-sheet')) { await contactSheet(arg('--contact-sheet')!, arg('--only')); console.log('contact sheet written'); return }
    const order = await priorityOrder({ world: arg('--world'), weeks: arg('--weeks') ? Number(arg('--weeks')) : undefined, save: arg('--save') })
    if (has('--plan')) {
      const rec = loadRecord(), have = new Set(rec.entries.map((e) => e.slot))
      const status = await providerFromEnv(process.env).checkStatus()
      console.log(`provider: ${status.provider} (${status.ready ? 'ready' : 'NOT ready: ' + status.detail})`)
      console.log(`slots: ${order.length}; recorded ${have.size}; to generate ${order.filter((s) => !have.has(s)).length}`)
      for (const s of order.slice(0, Number(arg('--show') ?? 5))) console.log(`\n#${s}${have.has(s) ? ' (done)' : ''}: ${promptFor(s)}`)
      return
    }
    const provider = providerFromEnv(process.env)
    let slots: number[]
    if (has('--pilot')) slots = Array.from({ length: 25 }, (_, i) => i)
    else if (arg('--redo')) slots = parseSlots(arg('--redo')!)
    else if (arg('--slots')) slots = parseSlots(arg('--slots')!)
    else if (has('--generate')) { const have = new Set(loadRecord().entries.filter((e) => e.status !== 'rejected').map((e) => e.slot)); slots = order.filter((s) => !have.has(s)).slice(0, Number(arg('--limit') ?? 25)) }
    else { console.log('Nothing to do. See the usage notes at the top of this file.'); return }
    const st = await provider.checkStatus()
    const redoOnly = !!arg('--redo')
    const todo = slots.filter((x) => redoOnly || !loadRecord().entries.some((e) => e.slot === x && e.status !== 'rejected'))
    const est = st.costPerImage === null ? null : todo.length * st.costPerImage
    console.log(`provider ${st.provider} · model ${st.model} · ${todo.length} image(s) to generate${est === null ? '' : ` · estimated cost up to $${est.toFixed(2)} (${st.costPerImage} per image; verify current pricing)`}`)
    if (!has('--yes')) { console.log('Not generating: add --yes to confirm and spend. (Use --plan to read the prompts first.)'); process.exit(0) }
    const r = await generate({ slots, status: 'pilot', provider, redo: has('--redo') })
    console.log(`made ${r.made.length}, skipped ${r.skipped.length}, failed ${r.failed.length}${r.failed.length ? ' (' + r.failed.join(',') + ')' : ''}`)
    process.exit(r.failed.length ? 1 : 0)
  }
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
}
