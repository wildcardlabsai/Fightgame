// Generates the shipped placeholder art (small hand-built SVG scenes) and public/assets/manifest.json.
// Real photography/illustration can replace any file in public/assets without code changes: keep the same path.
import { mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../public/assets')
const out = (p, s) => { mkdirSync(dirname(join(ROOT, p)), { recursive: true }); writeFileSync(join(ROOT, p), s) }
const rnd = (seed) => { let t = seed >>> 0; return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296 } }

// --- venues (800x450) -------------------------------------------------------------------------------------------
const VENUES = [
  ['local-hall', 'Local hall', '#3a2418', '#c9792b', 1, false],
  ['sports-centre', 'Sports centre', '#1b2a3a', '#4aa3d8', 2, false],
  ['theatre', 'Theatre', '#2a1520', '#d4a24c', 2, false],
  ['regional-arena', 'Regional arena', '#1d2433', '#5b8def', 3, false],
  ['national-arena', 'National arena', '#2a1a33', '#b266e0', 4, false],
  ['major-arena', 'Major arena', '#331a1a', '#e11d2a', 5, false],
  ['stadium', 'Stadium', '#102a22', '#35c97f', 6, false],
  ['outdoor-stadium', 'Outdoor stadium', '#1a2a4a', '#f0a23a', 6, true],
  ['international', 'International venue', '#2a2410', '#ffd36b', 5, false],
  ['vegas-arena', 'Las Vegas-style arena', '#2a0f2a', '#ff4fd8', 5, false],
  ['uk-arena', 'UK arena', '#10202a', '#4aa3d8', 4, false],
]
const venueSvg = ([id, label, bg, accent, scale, outdoor], i) => {
  const r = rnd(1000 + i)
  const rows = []
  for (let row = 0; row < 2 + scale; row++) {
    const y = 250 + row * (22 - scale)
    const n = 24 + scale * 6
    for (let k = 0; k < n; k++) rows.push(`${Math.round(((k + r() * 0.6) * 800) / n)} ${Math.round(y + r() * 6)}`)
  }
  const lights = Array.from({ length: 2 + Math.min(scale, 4) }, (_, k) => {
    const x = ((k + 1) * 800) / (3 + Math.min(scale, 4))
    return `<polygon points="${x - 6},0 ${x + 6},0 ${x + 90},330 ${x - 90},330" fill="${accent}" opacity=".13"/>`
  }).join('')
  const sky = outdoor ? `<rect width="800" height="170" fill="url(#sky)"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" role="img" aria-label="${label}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#07070a"/></linearGradient><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1230"/><stop offset="1" stop-color="${bg}"/></linearGradient></defs><rect width="800" height="450" fill="url(#g)"/>${sky}${lights}<path stroke="#000" stroke-opacity=".55" stroke-width="12" stroke-linecap="round" d="${rows.map((c) => `M${c}h0`).join('')}"/><g transform="translate(400 345)"><polygon points="-150,0 150,0 190,40 -190,40" fill="#1c1c25"/><polygon points="-150,0 150,0 130,-26 -130,-26" fill="#0d0d12" stroke="${accent}" stroke-width="2"/><path d="M-130 -26V-70M130 -26V-70M-130 -50H130M-130 -66H130" stroke="${accent}" stroke-width="2.5" fill="none"/></g></svg>`
}
VENUES.forEach((v, i) => out(`venues/${v[0]}.svg`, venueSvg(v, i)))

// --- event poster backgrounds (800x1000) -----------------------------------------------------------------------
const POSTERS = [
  ['fight-night', 'Fight Night', '#7a0f19', '#e11d2a', 'diag'],
  ['championship', 'Championship', '#4a3410', '#ffd36b', 'rays'],
  ['rivalry', 'Rivalry', '#3a0a14', '#ff3a46', 'split'],
  ['main-event', 'Main Event', '#1a1a2e', '#d4a24c', 'rays'],
  ['ppv', 'Pay-per-view', '#16103a', '#8b5cf6', 'diag'],
  ['international', 'International', '#0e2a3a', '#35c9c0', 'rings'],
  ['next-generation', 'Next Generation', '#0f2a1c', '#35c97f', 'diag'],
  ['big-event', 'Big Event', '#2a1a05', '#f0a23a', 'rays'],
]
const posterSvg = ([id, label, bg, accent, motif]) => {
  let m = ''
  if (motif === 'diag') for (let k = -4; k < 14; k++) m += `<rect x="${k * 90}" y="-100" width="26" height="1300" fill="${accent}" opacity=".09" transform="rotate(18 400 500)"/>`
  if (motif === 'rays') for (let k = 0; k < 14; k++) m += `<polygon points="400,520 ${k * 62 - 60},0 ${k * 62 + 2},0" fill="${accent}" opacity=".08"/>`
  if (motif === 'split') m = `<polygon points="0,0 470,0 330,1000 0,1000" fill="${accent}" opacity=".12"/><polygon points="800,0 800,1000 330,1000 470,0" fill="#3b82f6" opacity=".14"/>`
  if (motif === 'rings') for (let k = 1; k < 7; k++) m += `<circle cx="400" cy="460" r="${k * 95}" fill="none" stroke="${accent}" stroke-width="2" opacity=".14"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" role="img" aria-label="${label} poster background"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#050507"/></linearGradient></defs><rect width="800" height="1000" fill="url(#g)"/>${m}<rect y="900" width="800" height="100" fill="${accent}" opacity=".18"/></svg>`
}
POSTERS.forEach((p) => out(`events/templates/${p[0]}.svg`, posterSvg(p)))

// --- news category images (640x360) ----------------------------------------------------------------------------
const NEWS = [
  ['signing', 'Signing', '#16301f', '#35c97f', 'M120 230h200l30-50h110v50h60v30H120z'],
  ['knockout', 'Knockout', '#3a0a10', '#ff3a46', 'M260 120l40 70-80 10 70 60-30-100 100 40z'],
  ['championship', 'Championship', '#3a2a08', '#ffd36b', 'M240 110h160v60c0 50-35 80-80 80s-80-30-80-80zM300 250h40v40h-40z'],
  ['retirement', 'Retirement', '#22222c', '#8d8b95', 'M240 250c0-80 40-130 80-130s80 50 80 130z'],
  ['comeback', 'Comeback', '#0f2a3a', '#4aa3d8', 'M200 250l60-110 50 70 40-50 90 90z'],
  ['injury', 'Injury', '#3a1a08', '#f0a23a', 'M290 120h60v60h60v60h-60v60h-60v-60h-60v-60h60z'],
  ['upset', 'Upset', '#2a0f3a', '#b266e0', 'M220 240l100-130 100 130h-60l-40 50-40-50z'],
  ['rivalry', 'Rivalry', '#3a0a14', '#e11d2a', 'M170 150l140 100-140 100zM470 150l-140 100 140 100z'],
  ['press', 'Press conference', '#1b2a3a', '#5b8def', 'M250 120h140v80H250zM300 200h40v60h-40zM250 270h140v24H250z'],
  ['sold-out', 'Sold-out event', '#331a1a', '#e11d2a', 'M150 140h340v90H150zM150 250h340v30H150z'],
  ['contract', 'Contract', '#2a2410', '#d4a24c', 'M230 100h180v200H230zM255 140h130M255 175h130M255 210h90'],
  ['media', 'Media', '#1a1a2e', '#8b5cf6', 'M200 140h240v150H200zM260 300h120'],
  ['training', 'Training', '#0f2a1c', '#35c97f', 'M170 200h60v-40h40v120h-40v-40h-60zM470 200h-60v-40h-40v120h40v-40h60z'],
  ['milestone', 'Milestone', '#2a1a05', '#f0a23a', 'M320 100l30 70 75 8-56 50 17 74-66-39-66 39 17-74-56-50 75-8z'],
  ['business', 'Business', '#1b2a22', '#35c9c0', 'M190 290V200h50v90zM270 290V150h50v140zM350 290V110h50v180z'],
  ['world', 'World boxing', '#10202a', '#4aa3d8', 'M320 90a110 110 0 100 220 110 110 0 100-220zM210 200h220M320 90c60 60 60 160 0 220M320 90c-60 60-60 160 0 220'],
]
const newsSvg = ([id, label, bg, accent, d]) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img" aria-label="${label}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#07070a"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><g opacity=".1" stroke="${accent}" stroke-width="2">${Array.from({ length: 10 }, (_, k) => `<line x1="${k * 80 - 40}" y1="360" x2="${k * 80 + 140}" y2="0"/>`).join('')}</g><path d="${d}" fill="${accent}" fill-opacity=".85" stroke="${accent}" stroke-width="6" stroke-linejoin="round"/></svg>`
NEWS.forEach((n) => out(`news/${n[0]}.svg`, newsSvg(n)))

// --- ui -------------------------------------------------------------------------------------------------------
out('ui/ring-ropes.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 120"><g fill="none" stroke-width="5"><path d="M0 24H800" stroke="#e11d2a"/><path d="M0 60H800" stroke="#ece8e1"/><path d="M0 96H800" stroke="#3b82f6"/></g></svg>`)

// --- manifest ---------------------------------------------------------------------------------------------------
const entries = []
for (const v of VENUES) entries.push({ id: `venue.${v[0]}`, type: 'venue', entityId: v[0], path: `venues/${v[0]}.svg`, width: 800, height: 450, format: 'svg', status: 'real' })
for (const p of POSTERS) entries.push({ id: `poster.${p[0]}`, type: 'eventTemplate', entityId: p[0], path: `events/templates/${p[0]}.svg`, width: 800, height: 1000, format: 'svg', status: 'real' })
for (const n of NEWS) entries.push({ id: `news.${n[0]}`, type: 'news', entityId: n[0], path: `news/${n[0]}.svg`, width: 640, height: 360, format: 'svg', status: 'real' })
entries.push({ id: 'ui.ring-ropes', type: 'ui', entityId: 'ring-ropes', path: 'ui/ring-ropes.svg', width: 800, height: 120, format: 'svg', status: 'real' })
const manifest = {
  version: 1,
  note: 'Generated by scripts/assets/generate.mjs. Drop real art at the same path (or add a fighter/promotion entry) and it replaces the fallback.',
  shipped: entries,
  // Per-entity classes: art is looked up by entity id. `ids` lists which entities currently have real art (none ship in 4.8).
  // Art lookups by entity id. `ids` lists entities that currently have a COMPLETE generated file (synced by the pipeline).
  // Fighter art belongs to one world (`artWorld.seed`); promotions and venues have stable ids across worlds.
  artWorld: { seed: null },
  classes: {
    'fighter.profile': { dir: 'fighters/profile', file: 'fighter_{id}_profile.webp', width: 960, height: 1200, format: 'webp', status: 'fallback', ids: [] },
    'fighter.action': { dir: 'fighters/action', file: 'fighter_{id}_action.webp', width: 1600, height: 900, format: 'webp', status: 'fallback', ids: [] },
    'fighter.celebration': { dir: 'fighters/celebration', file: 'fighter_{id}_celebration.webp', width: 1600, height: 900, format: 'webp', status: 'fallback', ids: [] },
    'promotion.logo': { dir: 'promotions/logos', file: 'promotion_{id}_logo.webp', width: 1024, height: 1024, format: 'webp', status: 'fallback', ids: [] },
    'promotion.mark': { dir: 'promotions/logos', file: 'promotion_{id}_mark.webp', width: 512, height: 512, format: 'webp', status: 'fallback', ids: [] },
    venue: { dir: 'venues', file: 'venue_{id}.webp', width: 1600, height: 900, format: 'webp', status: 'fallback', ids: [] },
    news: { dir: 'news', file: 'news_{id}.webp', width: 1280, height: 720, format: 'webp', status: 'fallback', ids: [] },
    eventTemplate: { dir: 'events/templates', file: 'poster_{id}.webp', width: 1600, height: 2000, format: 'webp', status: 'fallback', ids: [] },
  },
}
out('manifest.json', JSON.stringify(manifest, null, 1) + '\n')
const size = (d) => readdirSync(d).reduce((n, f) => { const p = join(d, f); return n + (statSync(p).isDirectory() ? size(p) : statSync(p).size) }, 0)
console.log(`wrote ${entries.length} assets, ${size(ROOT)} bytes`)
