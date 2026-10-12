/**
 * OFFLINE PHOTOGRAPHIC PORTRAIT PIPELINE. Generates photorealistic portraits of FICTIONAL boxers with an image-generation provider you
 * configure (the same env contract as src/assetgen/provider.ts) and files them into the shared portrait slots. The game never calls a
 * provider: it only ships the finished files. With no provider configured this script plans, validates and reports; it will not draw
 * anything itself, and it never fabricates a photograph.
 *
 *   IMAGE_GEN_PROVIDER=openai-compatible IMAGE_GEN_API_KEY=… IMAGE_GEN_BASE_URL=… IMAGE_GEN_MODEL=… \
 *   npx tsx scripts/assets/portrait-photos.ts --pilot                 generate the 25-portrait pilot (slots 0–24), status "pilot"
 *   npx tsx scripts/assets/portrait-photos.ts --generate --limit 40   next 40 missing slots in priority order (resumable)
 *   npx tsx scripts/assets/portrait-photos.ts --generate --slots 7,9  specific slots
 *   npx tsx scripts/assets/portrait-photos.ts --redo 7                regenerate one slot (the only way an existing file is overwritten)
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
export interface PhotoEntry { slot: number; status: Status; sha: string; promptSha: string; bytes: number; provider: string; model: string }
export interface PhotoRecord { version: 1; entries: PhotoEntry[]; failures: Record<string, { attempts: number; error: string }> }

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
/** Slots in the order they should be produced. Without a world: 0..n-1. With one: the player's fighters, champions and ranked contenders, then the rest. */
export async function priorityOrder(opts: { world?: string; weeks?: number }): Promise<number[]> {
  const n = poolCount()
  if (!opts.world) return Array.from({ length: n }, (_, i) => i)
  const { createNewGame } = await import('../../src/engine/worldgen')
  const { advanceOneWeek } = await import('../../src/engine/tick')
  const { standingIndex } = await import('../../src/engine/business/titleStanding')
  const { assignPortraitSlots } = await import('../../src/assets/registry')
  let g = createNewGame({ seed: opts.world, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'P', color: '#fff', emblem: 'bolt' } }, 1_700_000_000_000)
  for (let w = 0; w < (opts.weeks ?? 0); w++) g = advanceOneWeek(g)
  const slots = assignPortraitSlots(Object.keys(g.fighters), g.seed, n)
  const stand = standingIndex(g)
  const mine = new Set(Object.values(g.contracts).filter((c) => c.promotionId === g.playerPromotionId).map((c) => c.fighterId))
  const tier = (id: string): number => {
    const f = g.fighters[id]
    if (mine.has(id)) return 0
    const r = stand(id).role
    if (r === 'champion') return 1
    if (r === 'mandatory' || r === 'eliminator' || r === 'contender') return 2
    const main = Object.values(g.fights).some((x) => !x.result && (x.sideA.fighterId === id || x.sideB.fighterId === id) && x.scheduledRounds >= 10)
    if (main || f.reputation >= 55) return 3
    if (f.record.wins + f.record.losses + f.record.draws <= 6 && f.potential >= 60) return 4
    return 5
  }
  const ids = Object.keys(g.fighters).sort((a, b) => tier(a) - tier(b) || g.fighters[b].reputation - g.fighters[a].reputation)
  const seen = new Set<number>(), out: number[] = []
  for (const id of ids) { const s = slots.get(id)!; if (!seen.has(s)) { seen.add(s); out.push(s) } }
  for (let i = 0; i < n; i++) if (!seen.has(i)) out.push(i)
  return out
}

// ------------------------------------------------------------------------------------------------ generation
export interface GenOptions { slots: number[]; status: Status; provider: ImageGenerationProvider; attempts?: number; redo?: boolean }
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
      const res = await o.provider.generateImage({ assetId: `portrait.${slot}`, prompt, width: 1024, height: 1280, seed: 100000 + slot, format: 'png' })
      if (!res.ok || !res.data) { err = res.error ?? 'no data'; continue }
      try {
        const { bytes } = encode(res.data, slot)
        const entry: PhotoEntry = { slot, status: o.status, sha: sha(readFileSync(join(DIR, fileOf(slot)))), promptSha: sha(prompt), bytes, provider: st.provider, model: st.model }
        rec.entries = rec.entries.filter((e) => e.slot !== slot).concat(entry)
        delete rec.failures[slot]
        ok = true
      } catch (e) { err = e instanceof Error ? e.message : String(e) }
    }
    if (ok) made.push(slot); else { failed.push(slot); rec.failures[slot] = { attempts: (rec.failures[slot]?.attempts ?? 0) + (o.attempts ?? 3), error: err.slice(0, 200) } }
    saveRecord(rec) // after every image, so an interrupted run loses nothing
    syncManifest(rec)
  }
  return { made, skipped, failed }
}

export function setStatus(slots: number[], status: Status): number {
  const rec = loadRecord()
  let n = 0
  for (const e of rec.entries) if (slots.includes(e.slot) && e.status !== status) { e.status = status; n++ }
  saveRecord(rec); syncManifest(rec)
  return n
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
    if (existsSync(p)) { const b = readFileSync(p); total += b.length + (existsSync(join(DIR, fileOf(e.slot, true))) ? statSync(join(DIR, fileOf(e.slot, true))).size : 0); if (sha(b) !== e.sha) problems.push(`${fileOf(e.slot)} changed since it was recorded`) }
  }
  for (const f of files) problems.push(`orphan ${f}`)
  if (new Set(rec.entries.map((e) => e.slot)).size !== rec.entries.length) problems.push('duplicate slot entries')
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
    if (has('--check')) { const p = check(); console.log(p.length ? p.join('\n') : 'photographic portrait library healthy'); process.exit(p.length ? 1 : 0) }
    if (has('--approve') || has('--reject')) { const k = has('--approve') ? '--approve' : '--reject'; console.log(`${setStatus(parseSlots(arg(k)!), k === '--approve' ? 'approved' : 'rejected')} slot(s) updated`); return }
    if (has('--activate')) { const rec = loadRecord(); if (!rec.entries.some((e) => e.status === 'approved')) { console.error('Nothing is approved yet; refusing to activate.'); process.exit(1) } syncManifest(rec, true); console.log('photographic library active'); return }
    if (has('--contact-sheet')) { await contactSheet(arg('--contact-sheet')!, arg('--only')); console.log('contact sheet written'); return }
    const order = await priorityOrder({ world: arg('--world'), weeks: arg('--weeks') ? Number(arg('--weeks')) : undefined })
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
    const r = await generate({ slots, status: 'pilot', provider, redo: has('--redo') })
    console.log(`made ${r.made.length}, skipped ${r.skipped.length}, failed ${r.failed.length}${r.failed.length ? ' (' + r.failed.join(',') + ')' : ''}`)
    process.exit(r.failed.length ? 1 : 0)
  }
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
}
