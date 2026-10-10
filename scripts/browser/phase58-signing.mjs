// Phase 5.8 browser verification: the signing-time forecast on the real negotiation screen (signing, counter, renewal), at three widths.
// Usage: node scripts/browser/phase58-signing.mjs <baseUrl> <fixturesDir> [shotsDir]
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4180/play/', fx = '/tmp/e2e', shots = '/tmp/e2e-shots-58'] = process.argv.slice(2)
mkdirSync(shots, { recursive: true })
const errors = []
let passes = 0, fails = 0
const check = (name, ok, detail = '') => { if (ok) passes++; else fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`) }
const browser = await chromium.launch()
const go = async (p, h) => { await p.evaluate((x) => { location.hash = x }, h); await p.waitForTimeout(500) }
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const num = (s) => Number(String(s).replace(/[^0-9.]/g, ''))
const rowValue = async (page, scope, label) => { const dd = page.getByTestId(scope).locator('.kv', { hasText: label }).first().locator('dd'); return (await dd.locator('b').count()) ? dd.locator('b').innerText() : dd.innerText() }

for (const w of [1280, 1024, 390]) {
  console.log(`\n=== ${w}px ===`)
  const mobile = w < 700
  for (const fixture of ['p54-new', 'p54-played']) {
    const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile })
    const page = await ctx.newPage()
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console ${w}] ${m.text()}`) })
    page.on('pageerror', (e) => errors.push(`[pageerror ${w}] ${e.message}`))
    await page.goto(`${base}?e2e`)
    await page.waitForFunction(() => window.__fe)
    await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), readFileSync(`${fx}/${fixture}.json`, 'utf8')); await page.waitForTimeout(300)
    const ids = await page.evaluate(() => { const g = window.__fe.useGame.getState().game; const signed = new Set(Object.values(g.contracts).filter((c) => c.status === 'active').map((c) => c.fighterId)); return Object.values(g.fighters).filter((f) => f.status === 'active' && !signed.has(f.id)).map((f) => f.id).slice(0, 40) })
    let fid = null
    for (const id of ids) { await go(page, `#/negotiation/${id}`); if (await page.getByTestId('talk-propose').count()) { fid = id; break } }
    check(`${fixture}/${w}: a signing conversation opens`, !!fid)
    if (!fid) { await ctx.close(); continue }
    const box = page.getByTestId('signing-forecast')
    check(`${fixture}/${w}: the forecast is shown next to the offer button`, (await box.count()) === 1 && (await box.isVisible()))
    const conf = await page.getByTestId('signing-forecast-confidence').innerText()
    check(`${fixture}/${w}: states how much to trust it`, /Insufficient history|Early estimate|Historical estimate/i.test(conf), conf)
    const text = await box.innerText()
    check(`${fixture}/${w}: separates paid-today from every-year costs`, /Paid today/i.test(text) && /Every year/i.test(text) && /Signing bonus/i.test(text) && /Running costs after/i.test(text), text.slice(0, 200))
    check(`${fixture}/${w}: no hidden-information words`, !/potential|appraisal|competence|hidden/i.test(text))
    const before = num(await rowValue(page, 'signing-forecast', 'Running costs after'))
    // raise the weekly retainer by 200 (4 steps of 50): running costs after rise by 200 x 52 = 10,400 (to the pound shown)
    if (!(await page.getByTestId('pathway-select').isVisible().catch(() => false))) await page.getByRole('button', { name: 'Edit my offer' }).click()
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Increase Weekly retainer' }).click()
    await page.waitForTimeout(200)
    const after = num(await rowValue(page, 'signing-forecast', 'Running costs after'))
    check(`${fixture}/${w}: the forecast follows the offer being edited (+£10,400 a year for +£200 a week)`, Math.abs(after - before - 10400) <= 60, `${before} -> ${after}`)
    await page.getByRole('button', { name: 'Increase Signing bonus' }).click()
    await page.waitForTimeout(150)
    const bonus = num(await rowValue(page, 'signing-forecast', 'Signing bonus'))
    check(`${fixture}/${w}: the signing bonus is shown as a one-off payment`, bonus > 0)
    await page.getByTestId('signing-forecast').locator('summary').click(); await page.waitForTimeout(150)
    check(`${fixture}/${w}: "How this is worked out" lists the assumptions`, /not a promise|history/i.test(await box.innerText()) && /nothing stops you signing/i.test(await box.innerText()))
    check(`${fixture}/${w}: the offer button is still on screen and enabled`, await page.getByTestId('talk-propose').isVisible() && !(await page.getByTestId('talk-propose').isDisabled()))
    check(`${fixture}/${w}: no horizontal overflow`, (await overflow(page)) <= 1, String(await overflow(page)))
    await page.screenshot({ path: `${shots}/forecast-${fixture}-${w}.png`, fullPage: true })
    // finishing the deal is unchanged by the forecast
    await page.getByTestId('talk-propose').click(); await page.waitForTimeout(600)
    const state = await page.evaluate((id) => { const g = window.__fe.useGame.getState().game; const t = Object.values(g.business.talks).find((x) => x.fighterId === id && x.kind === 'contract'); return { status: t?.status, hasCounter: !!t?.counter } }, fid)
    if (state.hasCounter && state.status === 'open') {
      check(`${fixture}/${w}: a counter shows its own forecast`, (await page.getByTestId('signing-forecast-counter').count()) === 1 && /Paid today/i.test(await page.getByTestId('signing-forecast-counter').innerText()))
      await page.screenshot({ path: `${shots}/forecast-counter-${fixture}-${w}.png`, fullPage: true })
    } else console.log(`INFO  ${fixture}/${w}: the camp ${state.status} the offer outright (no counter to show a forecast for)`)
    await ctx.close()
  }
  // a renewal of one of the player's own fighters
  {
    const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile })
    const page = await ctx.newPage()
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console ${w}] ${m.text()}`) })
    page.on('pageerror', (e) => errors.push(`[pageerror ${w}] ${e.message}`))
    await page.goto(`${base}?e2e`); await page.waitForFunction(() => window.__fe)
    await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), readFileSync(`${fx}/p58-renewal.json`, 'utf8')); await page.waitForTimeout(300)
    const own = await page.evaluate(() => { const g = window.__fe.useGame.getState().game; return Object.values(g.contracts).filter((c) => c.promotionId === g.playerPromotionId && c.status === 'active').map((c) => c.fighterId) })
    let opened = null
    for (const id of own) { await go(page, `#/negotiation/${id}`); if (await page.getByTestId('talk-propose').count()) { opened = id; break } }
    if (opened) {
      const t = await page.getByTestId('signing-forecast').innerText()
      check(`renewal/${w}: shows the retainer as was → now and no extra roster place`, /was → now/i.test(t) && /Roster: (\d+) → \1/.test((await page.getByTestId('signing-forecast').locator('summary').click(), await page.getByTestId('signing-forecast').innerText())), t.slice(0, 160))
      check(`renewal/${w}: no horizontal overflow`, (await overflow(page)) <= 1)
    } else check(`renewal/${w}: a renewal conversation opens for the fighter whose contract is running out`, false, 'none opened')
    await ctx.close()
  }
}
console.log(`\n${passes} passed, ${fails} failed, errors: ${errors.length}`)
for (const e of errors.slice(0, 10)) console.log(e)
await browser.close()
process.exit(fails || errors.length ? 1 : 0)
