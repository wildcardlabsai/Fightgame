// Fighter identity checks + screenshots against a static build (default http://localhost:4180/play).
// Portraits really load (naturalWidth > 0, from /assets/portraits), are identical across screens, and survive a week and a reload; championship chips appear.
// usage: node scripts/browser/identity-shots.mjs [base] [outDir]
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4180/play', out = 'docs/identity'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const MAIN = readFileSync('/tmp/e2e/p54-played.json', 'utf8'), EVENT = readFileSync('/tmp/e2e/p7-ready.json', 'utf8'), meta = JSON.parse(readFileSync('/tmp/e2e/p7-meta.json', 'utf8'))
const browser = await chromium.launch()
const results = []
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`) }
const failed = []
async function sess(w, fx) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 800 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  page.on('response', (r) => { if (r.url().includes('/assets/') && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`) })
  page.on('pageerror', (e) => failed.push(`pageerror ${e.message}`))
  await page.goto(`${base}/?e2e`); await page.waitForFunction(() => window.__fe); await page.waitForTimeout(500)
  if (fx) { await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), fx); await page.waitForTimeout(5200) }
  return { ctx, page }
}
const go = async (p, h) => { await p.evaluate((x) => { if (location.hash === x) location.hash = '#/__'; location.hash = x }, h); await p.waitForTimeout(1400); await p.evaluate(() => document.fonts.ready); await p.mouse.move(1, 1) }
const shot = (p, w, n, full = false) => p.screenshot({ path: `${out}/${n}-${w}.png`, fullPage: full })
const portraits = (p) => p.evaluate(async () => {
  await new Promise((r) => setTimeout(r, 1200))
  // Lazy images below the fold are not requested yet: only images the browser has started loading are judged.
  const imgs = [...document.querySelectorAll('img[src*="portraits/p"]')].filter((i) => i.complete || i.getBoundingClientRect().top < innerHeight * 1.5)
  await Promise.race([Promise.all(imgs.map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r })))), new Promise((r) => setTimeout(r, 3000))])
  return imgs.map((i) => ({ src: i.getAttribute('src'), ok: i.naturalWidth > 0, id: i.closest('[data-asset-id]')?.getAttribute('data-asset-id') }))
})

for (const w of [1280, 390]) {
  const s = await sess(w, MAIN)
  const p = s.page
  const info = await p.evaluate(() => {
    const g = window.__fe.useGame.getState().game, me = g.playerPromotionId
    const mine = Object.values(g.contracts).filter((c) => c.promotionId === me && c.status === 'active').map((c) => g.fighters[c.fighterId])
    return { fighter: (mine.find((f) => f.firstName === 'Liam' && f.lastName === 'Stokes') ?? mine[0]).id, widePools: g.widePools ?? null }
  })
  if (w === 1280) check('an existing career keeps its legacy name generation (no widePools flag)', info.widePools === null)

  await go(p, '#/fighters'); await shot(p, w, 'roster')
  const roster = await portraits(p)
  check(`roster (${w}) shows real portraits`, roster.length >= 8 && roster.every((x) => x.ok), `${roster.length} images`)
  const rosterById = new Map(roster.map((x) => [x.id, x.src]))

  await go(p, `#/fighter/${info.fighter}`); await shot(p, w, 'fighter')
  const prof = await portraits(p)
  check(`profile (${w}) shows the same portrait as the roster`, prof.length >= 1 && prof.every((x) => x.ok && (!rosterById.has(x.id) || rosterById.get(x.id) === x.src)))

  await go(p, `#/matchmaking/${info.fighter}`); await shot(p, w, 'matchmaking')
  const mm = await portraits(p)
  check(`matchmaking (${w}) shows real portraits`, mm.length >= 5 && mm.every((x) => x.ok), `${mm.length} images`)
  const chips = await p.evaluate(() => ({ standing: [...document.querySelectorAll('[data-testid=standing-chip]')].map((e) => e.getAttribute('data-role')), bout: document.querySelectorAll('[data-testid=bout-title]').length }))
  check(`matchmaking (${w}) shows championship standing chips`, chips.standing.length > 0, JSON.stringify(chips.standing.reduce((a, r) => ((a[r] = (a[r] ?? 0) + 1), a), {})) + ` bouts-for-a-belt:${chips.bout}`)
  // Compare view carries the title picture row.
  if (w === 1280) {
    const boxes = p.locator('input[type=checkbox][aria-label^="Compare"]')
    if (await boxes.count() >= 2) { await boxes.nth(0).check(); await boxes.nth(1).check(); await p.waitForTimeout(500)
      check('compare view has a Title picture row', (await p.getByTestId('compare-title').count()) === 1)
      await p.getByTestId('compare-title').scrollIntoViewIfNeeded(); await shot(p, w, 'matchmaking-compare') }
  }
  await s.ctx.close()

  const e = await sess(w, EVENT)
  await go(e.page, `#/event/${meta.eventId}`)
  if (w > 700) { const b = e.page.getByTestId('event-tabs').getByRole('tab', { name: 'Fight card' }); if (await b.count()) await b.click(); await e.page.waitForTimeout(500) }
  await e.page.evaluate(() => { const t = document.querySelector('[data-testid=event-tabs]') ?? document.body; window.scrollTo(0, window.scrollY + t.getBoundingClientRect().top - 120) }); await e.page.waitForTimeout(400)
  await shot(e.page, w, 'event-card')
  const ev = await portraits(e.page)
  check(`event card (${w}) shows real portraits`, ev.length >= 2 && ev.every((x) => x.ok), `${ev.length} images`)
  await e.ctx.close()
}

// A brand-new career: wide name pools, no duplicate names on screen, portraits stable across a week and a reload.
{
  const s = await sess(1280, null)
  const p = s.page
  await p.evaluate(() => window.__fe.useGame.getState().startNewGame({ seed: 'identity-shots', promotionName: 'Harbour Boxing', promoterName: 'Sam Reid', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'H', color: '#c0392b', emblem: 'bolt' } }))
  await p.waitForTimeout(1500)
  const st = await p.evaluate(() => { const g = window.__fe.useGame.getState().game; const names = Object.values(g.fighters).map((f) => `${f.firstName} ${f.lastName}`); return { wide: g.widePools === true, n: names.length, unique: new Set(names).size, surnames: new Set(Object.values(g.fighters).map((f) => f.lastName)).size } }) 
  check('a new career uses the wide name pools with no duplicate full names', st.wide && st.n === st.unique, JSON.stringify(st))
  await go(p, '#/scouting'); await shot(p, 1280, 'new-career-scouting')
  await go(p, '#/scouting')
  const a = await portraits(p)
  const idsBefore = a.map((x) => `${x.id}=${x.src}`)
  await p.evaluate(() => window.__fe.useGame.getState().advance(1)); await p.waitForTimeout(1500)
  await go(p, '#/scouting'); const b = await portraits(p)
  const mapB = new Map(b.map((x) => [x.id, x.src]))
  check('portraits do not change after a week passes', a.length > 5 && a.every((x) => !mapB.has(x.id) || mapB.get(x.id) === x.src))
  await p.reload(); await p.waitForFunction(() => window.__fe); await p.waitForTimeout(2500)
  await p.evaluate(() => window.__fe.useGame.getState().continueLatest?.()); await p.waitForTimeout(3500)
  await go(p, '#/scouting'); const c = await portraits(p)
  const mapC = new Map(c.map((x) => [x.id, x.src]))
  check('portraits do not change after a reload', c.length > 5 && a.every((x) => !mapC.has(x.id) || mapC.get(x.id) === x.src), `${c.length} images`)
  void idsBefore
  // Missing asset never blocks: block the portrait files and the silhouette appears, the screen still works.
  await s.ctx.route('**/assets/portraits/**', (r) => r.abort())
  await go(p, '#/scouting')
  await p.reload(); await p.waitForFunction(() => window.__fe); await p.waitForTimeout(2500)
  await p.evaluate(() => window.__fe.useGame.getState().continueLatest?.()); await p.waitForTimeout(3500)
  await go(p, '#/scouting'); await shot(p, 1280, 'roster-portraits-blocked')
  const fb = await p.evaluate(() => ({ svg: document.querySelectorAll('svg.v-portrait-fb').length, rows: document.querySelectorAll('tbody tr').length + document.querySelectorAll('.fighter-cell').length }))
  check('with every portrait file missing the roster still renders with silhouettes', fb.svg > 3 && fb.rows > 3, JSON.stringify(fb))
  await s.ctx.close()
}
await browser.close()
const bad = failed.filter((f) => !f.includes('/portraits/')) // the blocked-file pass aborts requests on purpose
check('no failed asset requests or page errors outside the deliberate block', bad.length === 0, bad.slice(0, 3).join(' | '))
const n = results.filter((r) => !r.ok).length
console.log(`\n${results.length - n} passed, ${n} failed`)
process.exit(n ? 1 : 0)
