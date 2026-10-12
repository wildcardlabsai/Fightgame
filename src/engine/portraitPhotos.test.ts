/**
 * Photographic portrait pipeline and registry behaviour. The "provider" here is a test double that returns a tiny PNG into a temp folder:
 * nothing it writes is ever shipped, and no photograph is fabricated for the game.
 */
import { copyFileSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assignPortraitSlots, MANIFEST, portraitSlot, resolveFighterImage, setPortraitRoster, setArtWorld, clearFighterArt, hashString } from '../assets/registry'
import type { ImageGenerationProvider, ImageRequest, ImageResult } from '../assetgen/provider'
import { createNewGame } from './worldgen'

const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'))
const tmp = mkdtempSync(join(tmpdir(), 'photos-'))
process.env.PORTRAIT_PHOTO_DIR = join(tmp, 'photo')
process.env.PORTRAIT_MANIFEST = join(tmp, 'manifest.json')
copyFileSync(join(__dirname, '../../public/assets/manifest.json'), process.env.PORTRAIT_MANIFEST)

class Fake implements ImageGenerationProvider {
  readonly id = 'fake'; readonly model = 'test-double'
  failing = new Set<number>(); calls: string[] = []
  async checkStatus() { return { configured: true, ready: true, provider: 'fake', model: 'test-double', detail: '', costPerImage: null } }
  async generateImage(r: ImageRequest): Promise<ImageResult> { this.calls.push(r.assetId); return this.failing.has(Number(r.assetId.split('.')[1])) ? { ok: false, error: 'boom' } : { ok: true, data: PNG, format: 'png' } }
  async generateBatch(rs: ImageRequest[]) { const o: ImageResult[] = []; for (const r of rs) o.push(await this.generateImage(r)); return o }
}

describe('photographic portrait pipeline', async () => {
  const P = await import('../../scripts/assets/portrait-photos')
  const fake = new Fake()

  it('prompts describe a fictional photographed boxer and forbid text, logos, belts and real likenesses; every slot differs', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 360; i++) {
      const t = P.promptFor(i)
      expect(t).toMatch(/fictional adult male boxer/); expect(t).toMatch(/no watermark/); expect(t).toMatch(/not resembling any real person/); expect(t).toMatch(/no championship belt/)
      expect(P.ageOf(i)).toBeGreaterThanOrEqual(20); expect(P.ageOf(i)).toBeLessThanOrEqual(38)
      seen.add(t)
    }
    expect(seen.size).toBeGreaterThan(340)
  })

  it('refuses to run without a provider instead of drawing anything', async () => {
    const { providerFromEnv } = await import('../assetgen/provider')
    await expect(P.generate({ slots: [0], status: 'pilot', provider: providerFromEnv({}) })).rejects.toThrow(/No image provider ready/)
    expect(existsSync(join(P.DIR, 'photos.json'))).toBe(false)
  })

  it('is resumable: a failed slot is recorded and retried alone; finished slots are never regenerated or overwritten', async () => {
    fake.failing = new Set([2])
    const a = await P.generate({ slots: [0, 1, 2, 3], status: 'pilot', provider: fake, attempts: 2 })
    expect(a.made).toEqual([0, 1, 3]); expect(a.failed).toEqual([2])
    expect(P.loadRecord().failures['2'].attempts).toBe(2)
    const before = P.loadRecord().entries.map((e) => e.sha)
    fake.calls = []; fake.failing = new Set()
    const b = await P.generate({ slots: [0, 1, 2, 3], status: 'pilot', provider: fake })
    expect(b.made).toEqual([2]); expect(b.skipped).toEqual([0, 1, 3]); expect(fake.calls).toEqual(['portrait.2'])
    expect(P.loadRecord().entries.filter((e) => e.slot !== 2).map((e) => e.sha)).toEqual(before)
    expect(P.loadRecord().failures['2']).toBeUndefined()
    for (const s of [0, 1, 2, 3]) { expect(existsSync(join(P.DIR, P.fileOf(s)))).toBe(true); expect(existsSync(join(P.DIR, P.fileOf(s, true)))).toBe(true) }
    expect(P.check()).toEqual([])
  })

  it('only approved slots reach the manifest; rejected slots are queued again; --check catches a changed file', async () => {
    expect(P.setStatus([0, 1], 'approved')).toBe(2)
    const m = JSON.parse((await import('node:fs')).readFileSync(process.env.PORTRAIT_MANIFEST!, 'utf8'))
    expect(m.portraitPhotos.approved).toEqual([0, 1]); expect(m.portraitPhotos.active).toBe(false)
    P.setStatus([3], 'rejected')
    fake.calls = []
    await P.generate({ slots: [3], status: 'pilot', provider: fake })
    expect(fake.calls).toEqual(['portrait.3'])
    ;(await import('node:fs')).writeFileSync(join(P.DIR, P.fileOf(0)), 'tampered')
    expect(P.check().join()).toMatch(/changed since it was recorded/)
  })

  it('parses slot lists and ranges', () => { expect(P.parseSlots('0-3,7,9-10')).toEqual([0, 1, 2, 3, 7, 9, 10]) })
})

describe('portrait slots stay distinct inside a world and stable as it grows', () => {
  const g = createNewGame({ seed: 'distinct-1', promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'P', color: '#fff', emblem: 'bolt' } }, 1_700_000_000_000)
  const ids = Object.keys(g.fighters)
  it('no two fighters of a 316-fighter world share a portrait when the pool has 360', () => {
    const m = assignPortraitSlots(ids, g.seed, 360)
    expect(new Set(m.values()).size).toBe(ids.length)
  })
  it('adding fighters never moves an existing fighter, and the result does not depend on input order', () => {
    const small = assignPortraitSlots(ids.slice(0, 200), g.seed, 360)
    const all = assignPortraitSlots(ids, g.seed, 360)
    for (const [id, s] of small) expect(all.get(id)).toBe(s)
    const rev = assignPortraitSlots(ids.slice().reverse(), g.seed, 360)
    for (const [id, s] of all) expect(rev.get(id)).toBe(s)
  })
  it('a world bigger than the pool wraps deliberately: slots are reused only once every slot is taken', () => {
    const many = Array.from({ length: 500 }, (_, i) => `f_${(i + 1).toString(36)}`)
    const m = assignPortraitSlots(many, 'w', 360)
    const counts = new Map<number, number>(); for (const s of m.values()) counts.set(s, (counts.get(s) ?? 0) + 1)
    expect(counts.size).toBe(360); expect(Math.max(...counts.values())).toBeLessThanOrEqual(2)
    expect(hashString('a')).toBe(hashString('a'))
  })
  it('the registry uses the roster assignment once told, and the pure hash otherwise', () => {
    clearFighterArt(); setArtWorld(g.seed)
    const id = ids[10]
    const raw = portraitSlot(id, g.seed, 360)
    setPortraitRoster(ids, g.seed)
    expect(portraitSlot(id)).toBe(assignPortraitSlots(ids, g.seed, 360).get(id))
    const urls = ids.map((i) => resolveFighterImage({ id: i, firstName: 'A', lastName: 'B' }).url)
    expect(new Set(urls).size).toBe(ids.length)
    setPortraitRoster(null); setArtWorld(null)
    expect(raw).toBe(portraitSlot(id, g.seed, 360))
  })
})

describe('photographic library in the registry', () => {
  const real = MANIFEST.portraitPhotos
  const withPhotos = (p: NonNullable<typeof MANIFEST.portraitPhotos>, fn: () => void) => { MANIFEST.portraitPhotos = p; try { fn() } finally { MANIFEST.portraitPhotos = real } }
  const ref = { id: 'f_9', firstName: 'A', lastName: 'B' }
  const base = { dir: 'portraits-photo', ext: 'webp', thumbSuffix: '_t', count: 360, provider: 'x' }
  it('stays dormant (the existing pool is shown) until it is activated', () => {
    withPhotos({ ...base, approved: [0, 1, 2], active: false }, () => expect(resolveFighterImage(ref).url).toMatch(/portraits\/p\d{4}\.svg$/))
  })
  it('when active shows approved photographs with thumbnails, and the silhouette (never a cartoon) for unapproved slots', () => {
    setArtWorld('w-photo')
    const slot = portraitSlot(ref.id, 'w-photo', 360)!
    withPhotos({ ...base, approved: [slot], active: true }, () => {
      const a = resolveFighterImage(ref)
      expect(a.state).toBe('real'); expect(a.url).toMatch(/portraits-photo\/p\d{4}\.webp$/); expect(a.thumbUrl).toMatch(/_t\.webp$/)
    })
    withPhotos({ ...base, approved: [(slot + 1) % 360], active: true }, () => {
      const a = resolveFighterImage(ref)
      expect(a.state).toBe('fallback'); expect(a.url).toBeNull()
    })
    setArtWorld(null)
  })
})
