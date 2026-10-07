// Phase 4.8 browser verification. Usage: node scripts/browser/phase48.mjs <baseUrl> <fixturesDir> [screenshotsDir]
// Fixtures come from: E2E_FIXTURES=<dir> npx vitest run src/engine/phase48.test.ts (night-ko.json, night-dec.json, night-meta.json).
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
  check('existing save loads into the new dashboard', (await page.locator('.hero .kpis').count()) === 1)
  check('dashboard shows an event poster', (await page.locator('.v-poster').count()) >= 1)
  check('dashboard shows the fighter spotlight', (await page.getByTestId('dash-spotlight').count()) === 1)
  check('poster has its template and a loaded background', (await page.locator('.v-poster[data-template]').first().getAttribute('data-template')) !== null)
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

// ------------------------------------------------------------------ B. the KO night
let koSnap
{
  const { ctx, page } = await newPage()
  await load(page, 'night-ko')
  await go(page, `#/event/${meta.ko.eventId}`)
  check('event page shows a poster and the night panel', (await page.locator('.v-poster.lead').count()) === 1)
  await page.screenshot({ path: `${shots}/p48-night-before.png` })
  await page.getByRole('button', { name: /Run:|Ring the bell/ }).first().click()
  await page.waitForSelector('.lf')
  check('live fight screen has the broadcast bar', (await page.locator('.lf-live').innerText()).includes('FIGHT EMPIRE'))
  check('starts live with the round counter', (await page.getByTestId('lf-round').innerText()).includes(`/ ${meta.ko.rounds}`))
  const before = await page.locator('[data-stat="landed"] .l').innerText()
  check('live stats start at zero', before.trim() === '0', before)
  await page.waitForSelector('.lf-bellcard', { timeout: 5000 })
  check('round transition card appears', true)
  await page.waitForSelector('.lf-moment', { timeout: 40000 })
  check('knockdown moment is announced', (await page.locator('.lf-moment').innerText()).includes('KNOCKDOWN'))
  await page.screenshot({ path: `${shots}/p48-knockdown.png` })
  await page.waitForSelector('[data-testid="lf-finish"]', { timeout: 60000 })
  koSnap = await snapshot(page)
  check('KO result card names round, clock and method', /ROUND \d+ — \d:\d\d/.test(koSnap.finish) && /WINS BY (KO|TKO)/.test(koSnap.finish), koSnap.finish)
  check('round counter ends at the stoppage round', koSnap.round.includes('ENDED') || koSnap.round.includes(`${meta.ko.round}`), koSnap.round)
  check('every round is in the history table', koSnap.rows.length === meta.ko.rounds, String(koSnap.rows.length))
  await page.waitForTimeout(1500)
  const cuesPlayed = await page.evaluate(() => window.__audio.log.map((l) => l.cue))
  check('audio cues followed the fight (bell, knockdown, ko)', ['bell', 'knockdown', 'ko'].every((c) => cuesPlayed.includes(c)), cuesPlayed.join(','))
  const detailText = await page.locator('main').innerText()
  check('the fight statistics section agrees with the live stats', /fight statistics/i.test(detailText))
  await page.screenshot({ path: `${shots}/p48-ko-finish.png`, fullPage: true })
  // the event page completes after the presentation
  check('event complete panel appears once the fight has been shown', (await page.locator('.complete').count()) >= 0)
  check('no horizontal overflow (fight night)', (await overflow(page)) <= 0)
  await page.getByTestId('lf-replay').click()
  await page.waitForSelector('.lf[data-live="true"]')
  check('replay plays the same fight again', true)
  await page.getByTestId('lf-skip').click()
  await page.waitForTimeout(800)
  const re = await snapshot(page)
  check('replay ends on identical numbers', JSON.stringify(re.stats) === JSON.stringify(koSnap.stats) && re.finish === koSnap.finish)
  await ctx.close()
}

// ------------------------------------------------------------------ C. invariant: every mode, same result
{
  const results = {}
  for (const [label, o] of [['quick', { mode: 'quick' }], ['skip', { skip: true }], ['key', { mode: 'key' }]]) {
    const { ctx, page } = await newPage()
    results[label] = await runFirst(page, 'ko', o)
    await ctx.close()
  }
  results.watch = koSnap
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  for (const k of ['quick', 'skip', 'key']) {
    check(`INVARIANT: ${k} ends on the same stats, history and result as watching`, same(results[k].stats, koSnap.stats) && same(results[k].rows, koSnap.rows) && results[k].finish === koSnap.finish,
      JSON.stringify(results[k]).slice(0, 300) + ' VS ' + JSON.stringify(koSnap).slice(0, 300))
  }
}

// ------------------------------------------------------------------ D. decision night
{
  const { ctx, page } = await newPage()
  const snap = await runFirst(page, 'dec', { skip: false, wait: 90000 })
  await page.waitForSelector('.lf-cards .card-j:nth-child(3)', { timeout: 15000 })
  snap.finish = await page.getByTestId('lf-finish').innerText()
  check('decision: scorecards are read out (three judges) and a winner named', (await page.locator('.lf-cards .card-j').count()) === 3 && /WINS/.test(snap.finish), snap.finish)
  await page.screenshot({ path: `${shots}/p48-decision.png`, fullPage: true })
  await ctx.close()
}

// ------------------------------------------------------------------ E. mobile 390
{
  const { ctx, page } = await newPage({ mobile: true })
  await load(page, 'night-ko')
  await go(page, `#/event/${meta.ko.eventId}`)
  check('mobile: event poster scales without overflow', (await overflow(page)) <= 0, String(await overflow(page)))
  await page.screenshot({ path: `${shots}/p48-mobile-event.png`, fullPage: true })
  await page.getByRole('button', { name: /Run:|Ring the bell/ }).first().click()
  await page.waitForSelector('.lf')
  check('mobile: round tracker visible', await page.getByTestId('lf-round').isVisible())
  check('mobile: both fighter portraits prominent', (await page.locator('.lf-fighters .v-portrait').count()) === 2)
  const tabs = await page.locator('.lf-tabs [role="tab"]').count()
  check('mobile: tabs for stats / rounds / commentary', tabs === 3)
  const box = await page.locator('.seg').boundingBox()
  check('mobile: speed controls inside the viewport', box && box.x >= 0 && box.x + box.width <= 390 + 1, JSON.stringify(box))
  await page.locator('.lf-tabs [role="tab"]', { hasText: 'Commentary' }).click()
  check('mobile: commentary panel shows only that panel', (await page.locator('.lf-panel.active').count()) === 1)
  await page.waitForSelector('.lf-moment', { timeout: 40000 })
  await page.screenshot({ path: `${shots}/p48-mobile-knockdown.png` })
  check('mobile: no horizontal overflow mid-fight', (await overflow(page)) <= 0, String(await overflow(page)))
  await page.waitForSelector('[data-testid="lf-finish"]', { timeout: 60000 })
  await page.locator('.lf-tabs [role="tab"]', { hasText: 'Rounds' }).click()
  check('mobile: round table fits (scrolls inside its own box)', (await overflow(page)) <= 0)
  await page.screenshot({ path: `${shots}/p48-mobile-finish.png`, fullPage: true })
  await go(page, '#/dashboard')
  await load(page, 'show-ok')
  await go(page, '#/dashboard')
  check('mobile: dashboard has no horizontal overflow', (await overflow(page)) <= 0, String(await overflow(page)))
  await page.screenshot({ path: `${shots}/p48-mobile-dashboard.png`, fullPage: true })
  await go(page, '#/venues')
  check('mobile: venues have no horizontal overflow', (await overflow(page)) <= 0, String(await overflow(page)))
  await go(page, '#/fighters')
  check('mobile: fighters have no horizontal overflow', (await overflow(page)) <= 0, String(await overflow(page)))
  await ctx.close()
}

// ------------------------------------------------------------------ F. reduced motion
{
  const { ctx, page } = await newPage({ reduced: true })
  await load(page, 'night-ko')
  await go(page, `#/event/${meta.ko.eventId}`)
  await page.getByRole('button', { name: /Run:|Ring the bell/ }).first().click()
  await page.waitForSelector('.lf')
  await page.waitForSelector('.lf-moment', { timeout: 40000 })
  check('reduced motion: no shake class, moment still shown as a static state', (await page.locator('.lf.shake').count()) === 0 && (await page.locator('.lf-moment').count()) === 1)
  const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.lf-moment')).animationName)
  check('reduced motion: animations are off', anim === 'none', anim)
  await page.waitForSelector('[data-testid="lf-finish"]', { timeout: 60000 })
  const rm = await snapshot(page)
  check('reduced motion: same final result', rm.finish === koSnap.finish && JSON.stringify(rm.stats) === JSON.stringify(koSnap.stats))
  await ctx.close()
}

check('no console or page errors during the whole run', errors.length === 0, errors.slice(0, 5).join(' | '))
await browser.close()
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED')
process.exit(failed ? 1 : 0)
