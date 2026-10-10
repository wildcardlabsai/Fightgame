// Phase 6.0: the key screens of the running build at 1280 / 1024 / 390, as JPEGs, for the before/after record.
// Usage: node scripts/browser/phase60-shots.mjs <baseUrl> <fixturesDir> <outDir>
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4180/play', fx = '/tmp/e2e', out = '/tmp/p60/shots'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const meta = JSON.parse(readFileSync(`${fx}/night-meta.json`, 'utf8'))
const browser = await chromium.launch()
const load = async (page, n) => { await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), readFileSync(`${fx}/${n}.json`, 'utf8')); await page.waitForTimeout(500) }
const go = async (page, h) => { await page.evaluate((x) => { location.hash = x }, h); await page.waitForTimeout(900) }
const errors = []
for (const w of [1280, 1024, 390]) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))
  const snap = async (name) => { await page.mouse.move(0, 0); await page.screenshot({ path: `${out}/${name}-${w}.jpg`, type: 'jpeg', quality: 62, fullPage: true }) }
  await page.goto(`${base}/?e2e`); await page.waitForFunction(() => window.__fe); await page.waitForTimeout(1000)
  await snap('01-title')
  await load(page, 'p54-played')
  await go(page, '#/dashboard'); await snap('02-dashboard')
  const mine = await page.evaluate(() => { const g = window.__fe.useGame.getState().game; return Object.values(g.contracts).filter((c) => c.promotionId === g.playerPromotionId && c.status === 'active').map((c) => c.fighterId) })
  await go(page, `#/fighter/${mine[0]}`); await snap('03-profile-own')
  await go(page, '#/rankings/atlas'); await snap('04-rankings')
  await go(page, `#/matchmaking/${mine[0]}`); await snap('05-matchmaking')
  await go(page, '#/fights'); await snap('06-fights')
  await go(page, '#/finances'); await snap('07-finances')
  await go(page, '#/office'); await snap('08-office')
  await go(page, '#/inbox'); await snap('09-inbox')
  const free = await page.evaluate(() => { const g = window.__fe.useGame.getState().game; const signed = new Set(Object.values(g.contracts).filter((c) => c.status === 'active').map((c) => c.fighterId)); return Object.values(g.fighters).filter((f) => !signed.has(f.id) && !f.retired).map((f) => f.id).slice(0, 20) })
  for (const id of free) { await go(page, `#/negotiation/${id}`); if (await page.getByTestId('talk-propose').count()) break }
  await snap('10-negotiation')
  await load(page, 'night-ko')
  await go(page, `#/fight/${meta.ko.fightId}`); await snap('11-fight-page')
  await go(page, `#/event/${meta.ko.eventId}`)
  await page.getByRole('button', { name: /Run:|Ring the bell/ }).first().click(); await page.waitForSelector('[data-testid="fight-night"]', { timeout: 10000 })
  await page.waitForTimeout(2500); await snap('12-fight-night-live')
  await page.getByTestId('lf-skip').click(); await page.waitForTimeout(1200); await snap('13-fight-night-result')
  await ctx.close()
}
console.log('errors:', errors.length, errors.slice(0, 3).join(' | '))
await browser.close()
