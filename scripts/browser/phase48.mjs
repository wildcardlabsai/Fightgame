// Phase 4.8 browser verification. Usage: node scripts/browser/phase48.mjs <baseUrl> <fixturesDir> [screenshotsDir]
// Visual checks (dashboard, venues, events, fighters, gallery gate, title badge). The fight/nav/audio checks live in phase49b.mjs. Fixtures come from: E2E_FIXTURES=<dir> npx vitest run src/engine/phase48.test.ts (night-ko.json, night-dec.json, night-meta.json).
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4173', fx = '/tmp/e2e', shots = '/tmp/e2e-shots'] = process.argv.slice(2)
mkdirSync(shots, { recursive: true })
const meta = JSON.parse(readFileSync(`${fx}/night-meta.json`, 'utf8'))
const fixture = (n) => readFileSync(`${fx}/${n}.json`, 'utf8')
const errors = []
let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`) }

const browser = await chromium.launch()
async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: !!opts.mobile, isMobile: !!opts.mobile, reducedMotion: opts.reduced ? 'reduce' : 'no-preference' })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
  const requests = []
  page.on('request', (r) => requests.push(r.url()))
  await page.goto(`${base}/?e2e`)
  await page.waitForFunction(() => window.__fe)
  return { ctx, page, requests }
}
const load = async (page, name) => { await page.evaluate((json) => window.__fe.useGame.getState().importGame(json), fixture(name)); await page.waitForTimeout(250) }
const go = async (page, hash) => { await page.evaluate((h) => { window.location.hash = h }, hash); await page.waitForTimeout(400) }
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const setMode = async (page, m) => page.locator(`.seg-b[data-mode="${m}"]`).click()

/** Opens the show, runs the first fight, optionally picks a mode, waits for the finish, returns what the screen ended on. */
async function runFirst(page, which, { mode, skip, wait = 90000 } = {}) {
  const m = meta[which]
  await load(page, `night-${which}`)
  await go(page, `#/event/${m.eventId}`)
  await page.getByRole('button', { name: /Run:|Ring the bell/ }).first().click()
  await page.waitForSelector('.lf', { timeout: 8000 })
  if (mode) await setMode(page, mode)
  if (skip) await page.getByTestId('lf-skip').click()
  await page.waitForSelector('[data-testid="lf-finish"]', { timeout: wait })
  await page.waitForTimeout(500)
  return snapshot(page)
}
async function snapshot(page) {
  return page.evaluate(() => {
    const t = (sel) => document.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    const stats = Object.fromEntries([...document.querySelectorAll('[data-stat]')].map((e) => [e.getAttribute('data-stat'), e.textContent.replace(/\s+/g, ' ').trim()]))
    return { finish: t('[data-testid="lf-finish"]'), stats, rows: [...document.querySelectorAll('[data-testid="lf-history"] tbody tr')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()), round: t('[data-testid="lf-round"]') }
  })
}

// ------------------------------------------------------------------ A. dashboard visuals + existing save loads
{
  const { ctx, page, requests } = await newPage()
  await load(page, 'show-ok')
  await go(page, '#/dashboard')
  check('existing save loads into the new dashboard', (await page.locator('[data-testid="desk-promotion"]').count()) === 1)
  check('dashboard shows the next-event hero (Promoter\'s Desk)', (await page.getByTestId('desk-event').count()) === 1)
  check('dashboard shows the roster summary', (await page.getByTestId('desk-roster').count()) === 1)
  
  await page.waitForTimeout(500)
  const bgOk = await page.evaluate(() => [...document.querySelectorAll('.v-poster-bg img, .v-venue img')].every((i) => i.complete && i.naturalWidth > 0))
  check('poster/venue images load (no broken images)', bgOk)
  check('no horizontal overflow (desktop dashboard)', (await overflow(page)) <= 0, String(await overflow(page)))
  await page.screenshot({ path: `${shots}/p48-dashboard-desktop.png`, fullPage: true })
  // fighters list: only thumbnails, no per-fighter full-size downloads
  requests.length = 0
  await go(page, '#/fighters')
  await page.waitForTimeout(400)
  const fighterImgReqs = requests.filter((u) => /assets\/fighters\//.test(u))
  check('fighters list requests no fighter artwork when none exists (fallback silhouettes)', fighterImgReqs.length === 0, fighterImgReqs.join(','))
  check('fighters list renders silhouettes, not broken images', (await page.locator('.v-portrait[data-asset-state="fallback"]').count()) >= 3 && (await page.locator('.v-portrait img').count()) === 0)
  check('no horizontal overflow (fighters)', (await overflow(page)) <= 0)
  await go(page, '#/venues')
  check('venue cards show for every tier with images', (await page.locator('.v-vcard').count()) >= 20 && (await page.locator('.v-vcard img').count()) >= 1)
  check('locked venues explain why', (await page.locator('.v-vcard.locked .v-vcard-lock').count()) > 0)
  await page.screenshot({ path: `${shots}/p48-venues-desktop.png` })
  await go(page, '#/events')
  check('events list shows poster thumbnails', (await page.getByTestId('event-posters').count()) === 1)
  await go(page, '#/assets')
  check('asset gallery is not reachable in the production build', (await page.locator('h1', { hasText: 'Asset gallery' }).count()) === 0)
  await ctx.close()
}

// ------------------------------------------------------------------ G. title contract (explicit data only)
{
  const { ctx, page } = await newPage()
  await load(page, 'night-dec')
  await go(page, `#/event/${meta.dec.eventId}`)
  check('no title badge unless the fight data says so', (await page.getByTestId('poster-title').count()) === 0)
  await page.evaluate((id) => { const st = window.__fe.useGame; const g = structuredClone(st.getState().game); const ev = g.events[id]; g.fights[ev.card[ev.card.length - 1]].title = { name: 'World Welterweight', tier: 'world' }; st.setState({ game: g }) }, meta.dec.eventId)
  await page.waitForTimeout(300)
  check('an explicit title fight shows the WORLD TITLE badge on the poster', (await page.getByTestId('poster-title').first().innerText()).includes('WORLD TITLE'))
  await ctx.close()
}

check('no console or page errors during the whole run', errors.length === 0, errors.slice(0, 5).join(' | '))
await browser.close()
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED')
process.exit(failed ? 1 : 0)
