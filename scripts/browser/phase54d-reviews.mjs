// Phase 5.4D browser verification: post-fight decisions through the real screens.
// Usage: node scripts/browser/phase54d-reviews.mjs <baseUrl> <fixturesDir> [shotsDir]
// Fixture: npx tsx scripts/browser/make-phase54-fixtures.ts <fixturesDir>  (p54d-reviews.json)
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4180/play/', fx = '/tmp/e2e', shots = '/tmp/e2e-shots-54d'] = process.argv.slice(2)
mkdirSync(shots, { recursive: true })
const errors = []
let passes = 0, fails = 0
const check = (name, ok, detail = '') => { if (ok) passes++; else fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`) }
const browser = await chromium.launch()
const fixture = readFileSync(`${fx}/p54d-reviews.json`, 'utf8')
const go = async (p, h) => { await p.evaluate((x) => { location.hash = x }, h); await p.waitForTimeout(500) }
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const HIDDEN = ['competence', 'urgency', 'cooldown', 'prospectFactory', 'bailout', 'distress', 'fin.state', 'potential']
const game = (p, fn) => p.evaluate(fn)

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
  await go(page, '#/dashboard'); await go(page, '#/office')
  check('office: decisions panel shows both open decisions', (await page.getByTestId('review-card').count()) === 2, String(await page.getByTestId('review-card').count()))
  const text = await page.getByTestId('reviews-panel').innerText()
  check('office: states the choices and the time left, no hidden data', /to decide/i.test(text) && /Fast-track him/i.test(text) && /Rebuild him/i.test(text) && HIDDEN.every((h) => !text.toLowerCase().includes(h.toLowerCase())), text.slice(0, 200))
  check('office: no horizontal overflow', (await overflow(page)) <= 1, String(await overflow(page)))
  await page.screenshot({ path: `${shots}/reviews-${w}.png`, fullPage: true })
  const aId = await game(page, () => window.__fe.useGame.getState().game.office.reviews.rv_f1.fighterId)
  await page.getByTestId('review-step').first().click(); await page.waitForTimeout(500)
  const st = await game(page, () => { const g = window.__fe.useGame.getState().game; return { r: g.office.reviews.rv_f1.status, c: g.office.reviews.rv_f1.choice, plan: g.business?.plans?.[g.office.reviews.rv_f1.fighterId], d: g.office.decisions[g.office.reviews.rv_f1.fighterId]?.[0]?.text } })
  check('office: fast-tracking resolves the decision, sets the accelerated plan and records it', st.r === 'resolved' && st.c === 'step' && st.plan === 'accelerated' && /Fast-tracked/.test(st.d ?? ''), JSON.stringify(st))
  check('office: the answered card is gone', (await page.getByTestId('review-card').count()) === 1)
  // profile of the other fighter shows only its own decision
  const bId = await game(page, () => window.__fe.useGame.getState().game.office.reviews.rv_f2.fighterId)
  await go(page, `#/fighter/${bId}`)
  check('profile: the fighter\'s own decision is shown there', (await page.getByTestId('review-card').count()) === 1 && (await page.getByTestId('review-card').getAttribute('data-kind')) === 'setback')
  await page.getByTestId('review-rebuild').click(); await page.waitForTimeout(500)
  const g2 = await game(page, () => { const g = window.__fe.useGame.getState().game; return { r: g.office.reviews.rv_f2.status, goal: g.office.goals[g.office.reviews.rv_f2.fighterId]?.kind } })
  check('profile: rebuilding resolves it and sets the Rebuilding objective', g2.r === 'resolved' && g2.goal === 'rebuild', JSON.stringify(g2))
  check('profile: nothing left to decide', (await page.getByTestId('review-card').count()) === 0)
  check('profile: no horizontal overflow', (await overflow(page)) <= 1, String(await overflow(page)))
  void aId
  await ctx.close()
}
console.log(`\n${passes} passed, ${fails} failed, errors: ${errors.length}`)
for (const e of errors.slice(0, 10)) console.log(e)
await browser.close()
process.exit(fails || errors.length ? 1 : 0)
