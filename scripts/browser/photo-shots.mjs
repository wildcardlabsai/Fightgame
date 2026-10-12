// Photographic pilot portraits in the real production build (served at /play/). Run against a build whose manifest has the pilot approved + active.
// usage: node scripts/browser/photo-shots.mjs [base] [outDir]
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4180/play', out = 'docs/identity/photo-pilot'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const MAIN = readFileSync('/tmp/e2e/p54-played.json', 'utf8'), EVENT = readFileSync('/tmp/e2e/p7-ready.json', 'utf8'), meta = JSON.parse(readFileSync('/tmp/e2e/p7-meta.json', 'utf8'))
const browser = await chromium.launch()
const results = []; const failed = []
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`) }
async function sess(w, fx) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 800 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  page.on('response', (r) => { if (r.url().includes('/assets/') && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`) })
  page.on('pageerror', (e) => failed.push(`pageerror ${e.message}`))
  await page.goto(`${base}/?e2e`); await page.waitForFunction(() => window.__fe); await page.waitForTimeout(500)
  await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), fx); await page.waitForTimeout(5200)
  return { ctx, page }
}
const go = async (p, h) => { await p.evaluate((x) => { if (location.hash === x) location.hash = '#/__'; location.hash = x }, h); await p.waitForTimeout(1500); await p.evaluate(() => document.fonts.ready); await p.mouse.move(1, 1) }
const imgs = (p) => p.evaluate(async () => {
  await new Promise((r) => setTimeout(r, 1200))
  const l = [...document.querySelectorAll('img[src*="portraits-photo/"]')].filter((i) => i.complete || i.getBoundingClientRect().top < innerHeight * 1.5)
  await Promise.race([Promise.all(l.map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r })))), new Promise((r) => setTimeout(r, 3000))])
  return l.map((i) => ({ src: i.getAttribute('src'), ok: i.naturalWidth > 0 }))
})
for (const w of [1280, 390]) {
  const s = await sess(w, MAIN); const p = s.page
  const id = await p.evaluate(() => { const g = window.__fe.useGame.getState().game; const me = g.playerPromotionId; const m = Object.values(g.contracts).filter((c) => c.promotionId === me && c.status === 'active').map((c) => g.fighters[c.fighterId]); return (m.find((f) => f.lastName === 'Stokes') ?? m[0]).id })
  for (const [n, h] of [['roster', '#/fighters'], ['fighter', `#/fighter/${id}`], ['matchmaking', `#/matchmaking/${id}`]]) {
    await go(p, h); await p.screenshot({ path: `${out}/${n}-${w}.png` })
    const l = await imgs(p)
    check(`${n} (${w}) shows photographs`, l.length >= (n === 'fighter' ? 1 : 3) && l.every((x) => x.ok) && l.every((x) => /_t\.webp$|\.webp$/.test(x.src)), `${l.length} images`)
    if (n === 'roster' || n === 'matchmaking') check(`${n} (${w}) uses thumbnails in lists`, l.some((x) => /_t\.webp$/.test(x.src)))
    if (n === 'fighter') check('profile uses the full 480×600 file', l.some((x) => !/_t\.webp$/.test(x.src)))
  }
  await s.ctx.close()
  const e = await sess(w, EVENT); const q = e.page
  await go(q, `#/event/${meta.eventId}`)
  if (w > 700) { const b = q.getByTestId('event-tabs').getByRole('tab', { name: 'Fight card' }); if (await b.count()) await b.click(); await q.waitForTimeout(500) }
  await q.evaluate(() => { const t = document.querySelector('[data-testid=event-tabs]') ?? document.body; window.scrollTo(0, window.scrollY + t.getBoundingClientRect().top - 120) }); await q.waitForTimeout(400)
  await q.screenshot({ path: `${out}/event-card-${w}.png` })
  const l = await imgs(q); check(`event card (${w}) shows photographs`, l.length >= 2 && l.every((x) => x.ok), `${l.length} images`)
  const fid = await q.evaluate(() => { const g = window.__fe.useGame.getState().game; return Object.values(g.fights).find((f) => f.status !== 'cancelled')?.id })
  await go(q, `#/fight/${fid}`); await q.screenshot({ path: `${out}/fight-${w}.png` })
  const f = await imgs(q); check(`fight page (${w}) shows photographs`, f.length >= 2 && f.every((x) => x.ok), `${f.length} images`)
  await e.ctx.close()
}
{
  // Missing files: every photograph blocked, the roster must still render with silhouettes.
  const s = await sess(1280, MAIN)
  await s.ctx.route('**/assets/portraits-photo/**', (r) => r.abort())
  await go(s.page, '#/fighters'); await s.page.waitForTimeout(1500)
  await s.page.screenshot({ path: `${out}/roster-photos-blocked-1280.png` })
  const fb = await s.page.evaluate(() => ({ svg: document.querySelectorAll('svg.v-portrait-fb').length, imgs: [...document.querySelectorAll('img[src*="portraits-photo/"]')].filter((i) => i.naturalWidth > 0).length, rows: document.querySelectorAll('tbody tr').length }))
  check('with every photograph missing the roster renders silhouettes', fb.svg >= 8 && fb.imgs === 0 && fb.rows >= 8, JSON.stringify(fb))
  await s.ctx.close()
}
await browser.close()
const bad = failed.filter((f) => !f.includes('portraits-photo'))
check('no failed asset requests or page errors outside the deliberate block', bad.length === 0, bad.slice(0, 3).join(' | '))
// asset requests or page errors', failed.length === 0, failed.slice(0, 3).join(' | '))
const n = results.filter((x) => !x).length
console.log(`\n${results.length - n} passed, ${n} failed`); process.exit(n ? 1 : 0)
