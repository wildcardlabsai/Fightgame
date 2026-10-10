// Phase 6.4: the Fight Night journey at 1280 / 1024 / 390 from deterministic fixtures, as JPEGs.
// Usage: node scripts/browser/phase64-shots.mjs <baseUrl> <fixturesDir> <outDir>
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4180/play', fx = '/tmp/e2e', out = '/tmp/p64/shots'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const nm = JSON.parse(readFileSync(`${fx}/night-meta.json`, 'utf8'))
const tm = JSON.parse(readFileSync(`${fx}/p64-meta.json`, 'utf8'))
const om = JSON.parse(readFileSync(`${fx}/p63-meta.json`, 'utf8'))
const browser = await chromium.launch()
const load = async (page, n) => { await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), readFileSync(`${fx}/${n}.json`, 'utf8')); await page.waitForTimeout(500) }
const go = async (page, h) => { await page.evaluate((x) => { location.hash = x }, h); await page.waitForTimeout(900) }
const bell = (page) => page.getByRole('button', { name: /Run:|Ring the bell|Start/i }).first().click()
const errors = []
for (const w of [1280, 1024, 390]) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))
  const snap = async (name, full = true) => { await page.mouse.move(0, 0); await page.screenshot({ path: `${out}/${name}-${w}.jpg`, type: 'jpeg', quality: 70, fullPage: full }) }
  const finish = async () => { await page.getByTestId('lf-skip').click().catch(() => undefined); await page.waitForSelector('[data-testid=fight-night][data-finished=true]', { timeout: 15000 }); await page.waitForTimeout(700) }
  await page.goto(`${base}/?e2e`); await page.waitForFunction(() => window.__fe); await page.waitForTimeout(800)
  // ---- 1 ordinary undercard before the bell (event page) and its fight page
  await load(page, 'p64-title'); await go(page, `#/event/${tm.eventId}`)
  await snap('01-undercard-prebell'); await page.evaluate(() => window.scrollTo(0, 0)); await snap('01a-undercard-prebell-top', false)
  await page.getByTestId('night-bar').scrollIntoViewIfNeeded().catch(() => undefined)
  await page.locator('.night-banner').first().scrollIntoViewIfNeeded().catch(() => undefined); await page.waitForTimeout(300); await snap('01b-undercard-prebell-banner', false)
  await go(page, `#/fight/${tm.results[0].id}`); await snap('02-undercard-fightpage')
  // ---- 3 championship fight before the bell
  await go(page, `#/fight/${tm.titleFight}`); await snap('03-title-prebell-fightpage'); await page.evaluate(() => window.scrollTo(0, 0)); await snap('03a-title-prebell-top', false)
  await page.getByTestId('ring-bell').scrollIntoViewIfNeeded().catch(() => undefined); await page.waitForTimeout(300); await snap('03b-title-prebell-bell', false)
  // ---- run the card: undercard 1 (KO) result, then next
  await go(page, `#/event/${tm.eventId}`)
  await bell(page); await page.waitForSelector('[data-testid="fight-night"]', { timeout: 10000 })
  await page.waitForTimeout(1200); await snap('04-live', false)
  await finish(); await snap('05-undercard-ko-result', false)
  await page.getByTestId('lf-next-fight').click(); await page.waitForSelector('[data-testid=fight-night][data-live=true]', { timeout: 8000 })
  await finish(); await snap('06-undercard2-result-next-available', false)
  await page.getByTestId('lf-next-fight').click(); await page.waitForSelector('[data-testid=fight-night][data-live=true]', { timeout: 8000 })
  await page.waitForTimeout(1200); await snap('07-title-live', false)
  await finish(); await snap('08-title-result', false)
  await page.getByTestId('lf-details').click().catch(() => undefined); await page.waitForTimeout(700); await snap('09-title-result-page')
  await page.getByTestId('lf-end-event').click().catch(() => undefined); await page.waitForTimeout(800)
  await go(page, `#/event/${tm.eventId}`); await snap('10-event-complete'); await page.getByTestId('event-complete').scrollIntoViewIfNeeded().catch(() => undefined); await page.waitForTimeout(300); await snap('10a-event-complete-panel', false)
  // ---- decision
  await load(page, 'night-dec'); await go(page, `#/event/${nm.dec.eventId}`)
  await bell(page); await page.waitForSelector('[data-testid="fight-night"]', { timeout: 10000 })
  await finish(); await snap('11-decision-result', false)
  await page.getByTestId('lf-details').click().catch(() => undefined); await page.waitForTimeout(700); await snap('12-decision-result-page')
  // ---- rival event
  await load(page, 'p63-offer'); await go(page, '#/fights/offers')
  await page.locator(`[data-testid=offer-card][data-offer=${om.offerId}]`).getByTestId('offer-accept').click(); await page.waitForTimeout(600)
  const ids = await page.evaluate((id) => { const g = window.__fe.useGame.getState().game; const o = g.office.offers[id]; return { ev: o.eventId, f: o.fightId } }, om.offerId)
  await go(page, `#/event/${ids.ev}`); await snap('13-rival-event', false)
  await go(page, `#/fight/${ids.f}`); await snap('14-rival-fightpage')
  await go(page, '#/fights/open'); await snap('15-fights-list')
  await ctx.close()
}
console.log('errors:', errors.length, errors.slice(0, 3).join(' | '))
await browser.close()
