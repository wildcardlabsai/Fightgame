// Phase 5.6 browser verification: the way back from a hole, through the real Finances screen.
// Usage: node scripts/browser/phase56-bridge.mjs <baseUrl> <fixturesDir> [shotsDir]
// Fixtures: npx tsx scripts/browser/make-phase54-fixtures.ts <fixturesDir>  (p56-distress.json, p54-played.json)
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4180/play/', fx = '/tmp/e2e', shots = '/tmp/e2e-shots-56'] = process.argv.slice(2)
mkdirSync(shots, { recursive: true })
const errors = []
let passes = 0, fails = 0
const check = (name, ok, detail = '') => { if (ok) passes++; else fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`) }
const browser = await chromium.launch()
const distress = readFileSync(`${fx}/p56-distress.json`, 'utf8')
const played = readFileSync(`${fx}/p54-played.json`, 'utf8')
const go = async (p, h) => { await p.evaluate((x) => { location.hash = x }, h); await p.waitForTimeout(500) }
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const game = (p, fn) => p.evaluate(fn)

for (const w of [1280, 1024, 390]) {
  console.log(`\n=== ${w}px ===`)
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console ${w}] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[pageerror ${w}] ${e.message}`))
  page.on('dialog', (d) => d.accept())
  await page.goto(`${base}?e2e`)
  await page.waitForFunction(() => window.__fe)

  // a healthy promotion is not offered a loan
  await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), played); await page.waitForTimeout(300)
  await go(page, '#/dashboard'); await go(page, '#/finances')
  check('healthy: no bridge panel', (await page.getByTestId('bridge-panel').count()) === 0)
  check('finances: shows what staying open costs, from the books', (await page.getByTestId('break-even').count()) === 1 && /Running costs a year/.test(await page.getByTestId('break-even').innerText()) && /Bouts per fighter/.test(await page.getByTestId('break-even').innerText()))
  const be = await page.getByTestId('break-even').innerText()
  check('finances: gives a verdict note and a shows-needed figure or says it is too early', (await page.getByTestId('break-even-note').innerText()).length > 20 && /Shows a year needed/.test(be))
  check('finances: break-even has no horizontal overflow', (await overflow(page)) <= 1, String(await overflow(page)))

  // a promotion in a hole
  await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), distress); await page.waitForTimeout(300)
  await go(page, '#/dashboard')
  const dash = await page.locator('main').innerText()
  check('dashboard: names the overdraft and where the way back is', /overdrawn/i.test(dash) && /Finances shows the way back/i.test(dash), dash.slice(0, 200))
  await go(page, '#/finances')
  check('finances: bridge panel shown', (await page.getByTestId('bridge-panel').count()) === 1)
  const t = await page.getByTestId('bridge-panel').innerText()
  check('finances: explains why, what is paid in, what is owed and the price', /overdrawn/i.test(t) && /Paid in/i.test(t) && /You repay/i.test(t) && /interest/i.test(t) && /Reputation/i.test(t) && /not income|lifeline/i.test(t), t.slice(0, 300))
  check('finances: no horizontal overflow', (await overflow(page)) <= 1, String(await overflow(page)))
  await page.screenshot({ path: `${shots}/bridge-offer-${w}.png`, fullPage: true })
  const before = await game(page, () => { const g = window.__fe.useGame.getState().game; return { cash: g.promotions[g.playerPromotionId].cash, rep: g.promotions[g.playerPromotionId].reputation } })
  await page.getByTestId('bridge-accept').click(); await page.waitForTimeout(500)
  const after = await game(page, () => { const g = window.__fe.useGame.getState().game; return { cash: g.promotions[g.playerPromotionId].cash, rep: g.promotions[g.playerPromotionId].reputation, loan: g.bridge?.loan ?? null, ledger: g.ledger.filter((x) => x.category === 'loan').length } })
  check('accepting pays the loan in through the ledger, once, and costs reputation', before.cash < 0 && after.cash > 0 && after.ledger === 1 && !!after.loan && after.rep < before.rep, JSON.stringify({ before, after }))
  check('the panel now shows the running loan and offers no second one', /still to repay/i.test(await page.getByTestId('bridge-panel').innerText()) && (await page.getByTestId('bridge-accept').count()) === 0)
  await page.screenshot({ path: `${shots}/bridge-running-${w}.png`, fullPage: true })
  // and the ordinary route works again: the free-agent market is open
  await go(page, '#/fighters')
  check('fighters screen still opens', (await page.locator('main').innerText()).length > 50)
  await ctx.close()
}
console.log(`\n${passes} passed, ${fails} failed, errors: ${errors.length}`)
for (const e of errors.slice(0, 10)) console.log(e)
await browser.close()
process.exit(fails || errors.length ? 1 : 0)
