// Phase 5.4B browser verification: the living world through the real screens.
// Usage: node scripts/browser/phase54b-world.mjs <baseUrl> <fixturesDir> [shotsDir]
// Fixture: npx tsx scripts/browser/make-phase54-fixtures.ts <fixturesDir>  (p54b-world: a rival offer on a followed fighter, a rival show on a free date)
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4180/play/', fx = '/tmp/e2e', shots = '/tmp/e2e-shots-54b'] = process.argv.slice(2)
mkdirSync(shots, { recursive: true })
const errors = []
let passes = 0, fails = 0
const check = (name, ok, detail = '') => { if (ok) passes++; else fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`) }
const browser = await chromium.launch()
const fixture = readFileSync(`${fx}/p54b-world.json`, 'utf8')
const go = async (p, h) => { await p.evaluate((x) => { location.hash = x }, h); await p.waitForTimeout(500) }
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const HIDDEN = ['competence', 'urgency', 'cooldown', 'prospectFactory', 'bailout', 'distress', 'fin.state']

for (const w of [1280, 1024, 390]) {
  console.log(`\n=== ${w}px ===`)
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console ${w}] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[pageerror ${w}] ${e.message}`))
  await page.goto(`${base}?e2e`)
  await page.waitForFunction(() => window.__fe)
  await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), fixture)
  await page.waitForTimeout(300)
  const ff = await page.evaluate(() => Object.keys(window.__fe.useGame.getState().game.world.pursuits)[0])
  check('fixture: a rival offer is on the table', !!ff)

  // ---- Promotions: public standing of each rival, moves of a selected one
  await go(page, '#/promotions')
  const chips = await page.getByTestId('rival-status').count()
  check('promotions: every rival shows a public standing', chips >= 6, String(chips))
  const body = await page.locator('main').innerText()
  check('promotions: states how many rivals are trading', /\d+ rival promotions are trading/.test(body))
  check('promotions: no hidden rival data on the page', HIDDEN.every((h) => !body.toLowerCase().includes(h.toLowerCase())), HIDDEN.filter((h) => body.toLowerCase().includes(h.toLowerCase())).join(','))
  const rows = page.locator('tr.row:not(.mine)')
  await rows.first().click(); await page.waitForTimeout(300)
  const moves = await page.getByTestId('rival-moves').count()
  check('promotions: selecting a rival lists its recent signings and departures', moves === 1 && (await page.getByTestId('rival-moves').locator('li').count()) >= 1)
  check('promotions: no horizontal overflow', (await overflow(page)) <= 1, String(await overflow(page)))
  await page.screenshot({ path: `${shots}/promotions-${w}.png`, fullPage: true })
  if (moves) { const before = await page.evaluate(() => location.hash); await page.getByTestId('rival-moves').locator('button').first().click(); await page.waitForTimeout(400); check('promotions: a move opens that fighter', (await page.evaluate(() => location.hash)).includes('/fighter/') && before !== (await page.evaluate(() => location.hash))) }

  // ---- Fighters: the pending offer is visible in the market and on the profile
  await go(page, '#/fighters/offers')
  const rowsOffers = await page.locator('main tbody tr, main .fighter-card, main [data-testid=fighter-row]').count()
  check('fighters: the "Offers Pending" tab lists the fighter', rowsOffers >= 1 && (await page.locator('main').innerText()).toLowerCase().includes('offer'), String(rowsOffers))
  await go(page, `#/fighter/${ff}`)
  const banner = await page.getByTestId('rival-offer').count()
  check('profile: a banner names the rival and the time left', banner === 1 && /Offer on the table from .+\./.test(await page.getByTestId('rival-offer').innerText()) && /within about \d+ week/.test(await page.getByTestId('rival-offer').innerText()), await page.getByTestId('rival-offer').allInnerTexts().catch(() => ''))
  check('profile: no rival appraisal or finances shown', !/appraisal|fit score|cash/i.test(await page.getByTestId('rival-offer').innerText()))
  await page.screenshot({ path: `${shots}/profile-offer-${w}.png`, fullPage: false })

  // ---- Negotiation: the camp knows it has options
  await go(page, `#/negotiation/${ff}`)
  const tb = await page.getByTestId('talk-rival').count()
  check('negotiation: the conversation says another promotion has an offer out', tb === 1 && /have an offer on the table/.test(await page.getByTestId('talk-rival').innerText()), String(tb))
  check('negotiation: no horizontal overflow', (await overflow(page)) <= 1, String(await overflow(page)))
  await page.screenshot({ path: `${shots}/negotiation-offer-${w}.png`, fullPage: false })

  // ---- Events: a rival show on a date the player might pick
  await go(page, '#/events')
  await page.getByRole('button', { name: /Plan a show/ }).click(); await page.waitForTimeout(400)
  const flags = await page.getByTestId('date-clash').count()
  check('events: dates cut across by a rival show are flagged', flags >= 1, String(flags))
  const note = await page.getByTestId('clash-note').count()
  check('events: the chosen date explains the clash', note === 1 && /rival show/i.test(await page.getByTestId('clash-note').innerText()), String(note))
  await page.screenshot({ path: `${shots}/plan-show-${w}.png`, fullPage: false })
  await ctx.close()
}
check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
console.log(`\n${passes} passed, ${fails} failed`)
await browser.close()
process.exit(fails ? 1 : 0)
