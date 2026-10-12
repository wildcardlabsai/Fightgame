/** Individually supplied high-resolution images: naming, crop, resolution classes, slots, supersede, approval gating. Synthetic images in a temp folder; nothing here is shipped. */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const tmp = mkdtempSync(join(tmpdir(), 'ingest-'))
process.env.PORTRAIT_PHOTO_DIR = join(tmp, 'photo'); process.env.PORTRAIT_MANIFEST = join(tmp, 'manifest.json'); process.env.PORTRAIT_SOURCE_DIR = join(tmp, 'source')
copyFileSync(join(__dirname, '../../public/assets/manifest.json'), process.env.PORTRAIT_MANIFEST)
const inc = join(tmp, 'source', 'incoming'); mkdirSync(inc, { recursive: true })
const make = (name: string, w: number, h: number, headTop = Math.round(h * 0.13)) => execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image, ImageDraw
w,h,top=int(sys.argv[2]),int(sys.argv[3]),int(sys.argv[4])
im=Image.new('RGB',(w,h),(24,24,26)); d=ImageDraw.Draw(im)
d.ellipse((w*0.25,top,w*0.75,top+h*0.55),fill=(190,140,110)); d.rectangle((w*0.1,top+h*0.5,w*0.9,h),fill=(150,100,80))
im.save(sys.argv[1])`, join(inc, name), String(w), String(h), String(headTop)])
const dims = (p: string) => execFileSync('python3', ['-I', '-c', 'import sys;from PIL import Image;i=Image.open(sys.argv[1]);print(i.format,i.size[0],i.size[1])', p]).toString().trim()

describe('ingesting individual images', async () => {
  const P = await import('../../scripts/assets/portrait-photos')
  const src = (n: string) => join(tmp, 'source', n)

  it('accepts only slot-NNNN names inside the pool and leaves everything else untouched', () => {
    make('portrait.png', 1024, 1536); make('slot-12.png', 1024, 1536); make('slot-9999.png', 1024, 1536)
    const r = P.ingestIncoming()
    expect(r.ingested).toEqual([]); expect(r.skipped.map((x) => x.reason).join('|')).toMatch(/name must be slot-NNNN/); expect(r.skipped.map((x) => x.reason).join('|')).toMatch(/outside the pool/)
    for (const f of ['portrait.png', 'slot-12.png', 'slot-9999.png']) expect(existsSync(join(inc, f))).toBe(true)
    for (const f of ['portrait.png', 'slot-12.png', 'slot-9999.png']) execFileSync('rm', [join(inc, f)])
  })

  it('a 1024×1536 image becomes an exact native 4:5 crop (1024×1280, no scaling), a 480×600 WebP and a 96×120 thumbnail, unapproved and high-resolution', () => {
    make('slot-0269__f_8i.png', 1024, 1536)
    const before = readFileSync(join(inc, 'slot-0269__f_8i.png'))
    const r = P.ingestIncoming()
    expect(r.ingested).toEqual([{ file: 'slot-0269__f_8i.png', slot: 269, resolution: 'high', flags: [] }])
    expect(dims(src('crops/slot-0269.png'))).toBe('PNG 1024 1280')
    expect(dims(join(P.DIR, 'p0269.webp'))).toBe('WEBP 480 600'); expect(dims(join(P.DIR, 'p0269_t.webp'))).toBe('WEBP 96 120')
    const rec = P.loadRecord(); const e = rec.entries.find((x) => x.slot === 269)!
    expect(e).toMatchObject({ status: 'pilot', resolution: 'high', cropWidth: 1024, provider: 'supplied-artwork' }); expect(e.sha).toBeTruthy(); expect(e.thumbSha).toBeTruthy()
    expect(rec.sources!.find((x) => x.slot === 269)).toMatchObject({ sheet: 'individual', originalName: 'slot-0269__f_8i.png', meta: { fighter: 'f_8i' } })
    // the original is preserved byte for byte and removed from the inbox
    const kept = readdirSync(src('originals')).find((f) => f.startsWith('slot-0269.'))!
    expect(readFileSync(src(`originals/${kept}`)).equals(before)).toBe(true); expect(existsSync(join(inc, 'slot-0269__f_8i.png'))).toBe(false)
    expect(JSON.parse(readFileSync(process.env.PORTRAIT_MANIFEST!, 'utf8')).portraitPhotos).toBeUndefined() // nothing approved, nothing active
    expect(P.check()).toEqual([])
  })

  it('the 4:5 window follows the head: a sidecar y fraction moves it, and the crop never leaves the image', () => {
    make('slot-0010.png', 1024, 1536, 150); P.ingestIncoming()
    const auto = JSON.parse(execFileSync('python3', ['-I', join(__dirname, '../../scripts/assets/portrait_ingest.py'), 'single', src('originals/' + readdirSync(src('originals')).find((f) => f.startsWith('slot-0010.'))!), join(tmp, 'c1.png')]).toString())
    const low = JSON.parse(execFileSync('python3', ['-I', join(__dirname, '../../scripts/assets/portrait_ingest.py'), 'single', src('originals/' + readdirSync(src('originals')).find((f) => f.startsWith('slot-0010.'))!), join(tmp, 'c2.png'), '0.5']).toString())
    expect(auto.crop_box[1]).toBeLessThanOrEqual(150); expect(auto.crop_box[3]).toBeLessThanOrEqual(1536)
    expect(low.crop_box[1]).toBe(1536 - 1280) // clamped: a 0.5 fraction would run off the bottom
  })

  it('resolution classes: 1024 high, 700 medium, 600 low; nothing is ever scaled up before the 480×600 step, and low sources cannot be approved by accident', () => {
    make('slot-0011.png', 700, 1050); make('slot-0012.png', 600, 900)
    const r = P.ingestIncoming()
    expect(r.ingested.map((x) => [x.slot, x.resolution])).toEqual([[11, 'medium'], [12, 'low']])
    expect(dims(src('crops/slot-0012.png'))).toBe('PNG 600 750') // native size kept: the crop is NOT enlarged
    expect(() => P.setStatus([12], 'approved')).toThrow(/low-resolution/)
    expect(P.setStatus([269, 11], 'approved')).toBe(2)
    expect(P.setStatus([12], 'approved', { allowLowRes: true })).toBe(1)
    expect(JSON.parse(readFileSync(process.env.PORTRAIT_MANIFEST!, 'utf8')).portraitPhotos).toMatchObject({ approved: [11, 12, 269], active: false })
    P.setStatus([11, 12, 269], 'pilot')
  })

  it('--min-width refuses small sources before anything is written; square and landscape images are flagged because the sides are lost', () => {
    make('slot-0020.png', 500, 750); make('slot-0021.png', 1200, 1200)
    const r = P.ingestIncoming({ minWidth: 960 })
    expect(r.skipped.map((x) => x.reason).join('|')).toMatch(/only 500 px wide/)
    expect(r.ingested[0].flags).toContain('cropped_sides')
    expect(P.loadRecord().entries.some((e) => e.slot === 20)).toBe(false)
    execFileSync('rm', [join(inc, 'slot-0020.png')])
  })

  it('an occupied slot is never overwritten without --replace; --replace moves the old files to superseded/ and resets approval', () => {
    make('slot-0269.png', 1024, 1536)
    expect(P.ingestIncoming().skipped[0].reason).toMatch(/already holds a photograph/)
    expect(existsSync(join(inc, 'slot-0269.png'))).toBe(true)
    const oldSha = P.loadRecord().entries.find((e) => e.slot === 269)!.sha
    P.setStatus([269], 'approved')
    const r = P.ingestIncoming({ replace: true })
    expect(r.ingested[0].slot).toBe(269)
    const e = P.loadRecord().entries.find((x) => x.slot === 269)!
    expect(e.status).toBe('pilot'); expect(e.supersedes).toBe(oldSha)
    expect(existsSync(src(`superseded/p0269.${oldSha}.webp`))).toBe(true); expect(existsSync(src(`superseded/p0269_t.${oldSha}.webp`))).toBe(true)
    expect(JSON.parse(readFileSync(process.env.PORTRAIT_MANIFEST!, 'utf8')).portraitPhotos?.approved ?? []).not.toContain(269)
    expect(P.check()).toEqual([])
  })

  it('--check catches a changed original and a changed thumbnail', () => {
    const o = readdirSync(src('originals')).find((f) => f.startsWith('slot-0011.'))!
    execFileSync('python3', ['-I', '-c', `open(${JSON.stringify(src('originals/' + o))},'ab').write(b'x')`])
    execFileSync('python3', ['-I', '-c', `open(${JSON.stringify(join(P.DIR, 'p0011_t.webp'))},'ab').write(b'x')`])
    const p = P.check().join('|'); expect(p).toMatch(/original for slot-0011 changed/); expect(p).toMatch(/p0011_t\.webp changed/)
  })
})

describe('the committed pilot library', () => {
  it('records every pilot slot as low-resolution, so approving it needs an explicit --allow-lowres', () => {
    const rec = JSON.parse(readFileSync(join(__dirname, '../../public/assets/portraits-photo/photos.json'), 'utf8')) as { entries: { resolution?: string; cropWidth?: number; thumbSha?: string }[] }
    expect(rec.entries).toHaveLength(23)
    expect(rec.entries.every((e) => e.resolution === 'low' && (e.cropWidth ?? 0) < 200 && !!e.thumbSha)).toBe(true)
  })
})
