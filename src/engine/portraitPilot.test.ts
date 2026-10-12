/** The committed pilot library cut from the supplied contact sheet: provenance, slots, sizes, and that nothing is approved or active. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MANIFEST, resolveFighterImage, setArtWorld } from '../assets/registry'

const root = join(__dirname, '../..')
const photos = join(root, 'public/assets/portraits-photo')
const src = join(root, 'asset-pipeline/portrait-source')
const rec = JSON.parse(readFileSync(join(photos, 'photos.json'), 'utf8')) as { entries: { slot: number; status: string; provider: string; bytes: number }[]; sources: { tile: string; slot: number | null; status: string; note: string }[] }

describe('pilot portrait library (supplied artwork)', () => {
  it('the original supplied sheet is kept unchanged', () => {
    const meta = JSON.parse(readFileSync(join(src, 'pilot-sheet-1.source.json'), 'utf8'))
    expect(createHash('sha256').update(readFileSync(join(src, 'pilot-sheet-1.png'))).digest('hex')).toBe(meta.sha256)
    expect(meta.size).toEqual([1586, 992])
  })
  it('24 tiles were cut: 23 usable crops hold stable slots 0–22; the unusable one holds none and has no file', () => {
    expect(rec.sources).toHaveLength(24)
    const rejected = rec.sources.filter((x) => x.status === 'rejected')
    expect(rejected.map((x) => x.tile)).toEqual(['pilot-sheet-1_r0c0']); expect(rejected[0].slot).toBeNull(); expect(rejected[0].note).toMatch(/clipped/)
    const slots = rec.sources.filter((x) => x.slot !== null).map((x) => x.slot as number)
    expect(slots).toEqual(Array.from({ length: 23 }, (_, i) => i))
    expect(rec.entries).toHaveLength(23)
    expect(rec.entries.every((e) => e.provider === 'supplied-artwork')).toBe(true)
  })
  it('every recorded slot has a 480×600 WebP and a 96×120 thumbnail, and the whole set is far inside the 12 MB budget', () => {
    let total = 0
    for (const e of rec.entries) {
      for (const [f, w, h] of [[`p${String(e.slot).padStart(4, '0')}.webp`, 480, 600], [`p${String(e.slot).padStart(4, '0')}_t.webp`, 96, 120]] as const) {
        const p = join(photos, f); expect(existsSync(p), f).toBe(true); total += statSync(p).size
        const dim = execFileSync('python3', ['-I', '-c', 'import sys;from PIL import Image;i=Image.open(sys.argv[1]);print(i.format,i.size[0],i.size[1])', p]).toString().trim()
        expect(dim).toBe(`WEBP ${w} ${h}`)
      }
    }
    expect(total).toBeLessThan(12_000_000); expect(total).toBeLessThan(1_500_000)
  })
  it('nothing is approved or active: the game still shows its existing artwork', () => {
    expect(rec.entries.every((e) => e.status === 'pilot')).toBe(true)
    expect(MANIFEST.portraitPhotos).toBeUndefined()
    setArtWorld('pilot-w')
    expect(resolveFighterImage({ id: 'f_5', firstName: 'A', lastName: 'B' }).url).toMatch(/portraits\/p\d{4}\.svg$/)
    setArtWorld(null)
  })
})
