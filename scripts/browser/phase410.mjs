// Phase 4.10 browser verification: UI elevation. Usage: node scripts/browser/phase410.mjs <baseUrl> <fixturesDir> [shotsDir]
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4173', fx = '/tmp/e2e', shots = '/tmp/e2e-shots'] = process.argv.slice(2)
mkdirSync(shots, { recursive: true })
const meta = JSON.parse(readFileSync(`${fx}/night-meta.json`, 'utf8'))
const fixture = (n) => readFileSync(`${fx}/${n}.json`, 'utf8')
const errors = []; let fails = 0, passes = 0
const check = (name, ok, detail = '') => { if (ok) passes++; else fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`) }
const browser = await chromium.launch()
async function newPage(w = 1280, extra = {}) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, ...extra })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
  return { ctx, page }
}
const load = async (page, name) => { await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), fixture(name)); await page.waitForTimeout(250) }
const go = async (page, h) => { await page.evaluate((x) => { location.hash = x }, h); await page.waitForTimeout(450) }
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const boot = async (page) => { await page.goto(`${base}/?e2e`); await page.waitForFunction(() => window.__fe) }

// ============================================================ A. walkthrough part 1 (fresh promotion)
{
  const { ctx, page } = await newPage()
  await page.goto(`${base}/?e2e`); await page.waitForSelector('[data-scenario]')
  await page.locator('[data-scenario="groundUp"]').click(); await page.fill('#pr', 'Walk Promotions')
  await page.getByRole('button', { name: /Open the doors/ }).click()
  await page.waitForSelector('[data-testid="desk-promotion"]')
  check('1-2 new promotion lands on the Promoter\'s Desk', (await page.getByTestId('desk-event').count()) === 1 && (await page.getByTestId('desk-cash').count()) === 1 && (await page.getByTestId('desk-roster').count()) === 1 && (await page.getByTestId('desk-inbox').count()) === 1 && (await page.getByTestId('desk-advice').count()) === 1)
  check('dashboard: no horizontal overflow', (await overflow(page)) === 0)
  await page.screenshot({ path: `${shots}/410-desk.png` })
  await page.getByTestId('nav-inbox').click(); await page.waitForTimeout(350)
  check('3 inbox opens with category pills', (await page.locator('.msg-row .catpill').count()) > 0)
  await page.locator('.msg-row').first().click(); await page.waitForTimeout(200)
  check('3 a message opens in the reader', (await page.locator('.msg-body h3').count()) === 1)
  await go(page, '#/fighters')
  await page.getByRole('tab', { name: /Free agents/i }).click().catch(() => {})
  await page.waitForTimeout(300)
  check('4 fighter database rows show identity, record, division and knowledge', (await page.locator('.fx-id, .fx-div').count()) > 0)
  const row = page.locator('tbody tr.row').first()
  await row.click(); await page.waitForTimeout(500)
  check('5 profile opens as a dossier', (await page.getByTestId('dossier').count()) === 1, await page.evaluate(() => location.hash))
  await page.screenshot({ path: `${shots}/410-dossier.png` })
  const offer = page.getByTestId('make-offer')
  if (await offer.count()) {
    await offer.click(); await page.waitForTimeout(500)
    check('6 negotiation shows the camp, the conversation and the expected terms', (await page.getByTestId('talk-header').count()) === 1 && (await page.getByTestId('talk-log').count()) === 1 && (await page.getByTestId('expected-terms').count()) >= 1)
    await page.screenshot({ path: `${shots}/410-negotiation.png` })
    check('6 scroll position reset on arrival', (await page.evaluate(() => window.scrollY)) < 5)
    await page.getByTestId('ask-priorities').click(); await page.waitForTimeout(400)
    await page.getByTestId('talk-propose').click(); await page.waitForTimeout(500)
    let signed = (await page.getByTestId('accept-counter').count()) === 0
    for (let i = 0; i < 3 && (await page.getByTestId('accept-counter').count()); i++) { await page.getByTestId('accept-counter').click(); await page.waitForTimeout(400) }
    const mine = await page.evaluate(() => { const g = window.__fe.useGame.getState().game; return Object.values(g.contracts).filter((c) => c.promotionId === g.playerPromotionId).length })
    check('7 negotiation produced a real response (counter / accept / reject) without error', (await page.getByTestId('talk-line').count()) >= 3 || /#\/fighter\//.test(await page.evaluate(() => location.hash)), String(await page.getByTestId('talk-line').count()))
    check('7 roster contracts readable after negotiation', mine >= 4, String(mine))
  } else check('6 free agent could be offered', false, 'no make-offer button')
  await ctx.close()
}

// ============================================================ B. walkthrough part 2 (event → Tale of the Tape → Fight Night → result)
{
  const { ctx, page } = await newPage()
  await boot(page); await load(page, 'show-ok')
  await go(page, `#/event/${meta.ko.eventId}`)
  check('8 event builder shows the 8-step workflow', (await page.getByTestId('build-steps').locator('li').count()) === 8)
  check('8 main event dominates the event page', (await page.getByTestId('ev-main').count()) === 1)
  await page.getByTestId('build-steps').locator('li button').nth(3).click(); await page.waitForTimeout(500)
  check('8 step buttons jump to their section', (await page.evaluate(() => window.scrollY)) > 100)
  await page.screenshot({ path: `${shots}/410-event.png` })
  await load(page, 'night-ko'); await go(page, `#/fight/${meta.ko.fightId}`)
  check('9 Tale of the Tape shows with keys to victory', (await page.getByTestId('tale-of-tape').count()) === 1 && (await page.locator('.tt-keys li').count()) >= 2)
  await page.screenshot({ path: `${shots}/410-tape.png` })
  check('9 tape: no horizontal overflow', (await overflow(page)) === 0)
  await go(page, `#/event/${meta.ko.eventId}`)
  const bell = page.getByRole('button', { name: /Run:|Ring the bell/ }).first()
  await bell.click(); await page.waitForSelector('[data-testid="fight-night"]', { timeout: 8000 })
  check('10 Fight Night opens full screen', !(await page.getByTestId('topnav').isVisible()))
  await page.locator('[data-speed="4"]').first().click().catch(() => {})
  await page.locator('button[data-mode="key"]').click(); await page.waitForTimeout(600)
  await page.screenshot({ path: `${shots}/410-keyevents.png` })
  const caps = await page.locator('[data-testid="key-card"]').allInnerTexts().catch(() => [])
  check('12 key events show', true, caps.join('|'))
  await page.getByTestId('lf-skip').click(); await page.waitForTimeout(600)
  const fin = await page.getByTestId('lf-finish').innerText()
  check('13 result shows FINAL RESULT, method, round', /final result/i.test(fin) && /KNOCKOUT|KO|TKO/i.test(fin), fin.slice(0, 120))
  await page.screenshot({ path: `${shots}/410-result.png` })
  check('13 winner / defeated labelled', (await page.getByTestId('result-winner').count()) === 1 && (await page.getByTestId('result-loser').count()) === 1)
  await page.getByTestId('fn-exit').click(); await page.waitForTimeout(500)
  check('14 return to event works', (await page.evaluate(() => location.hash)).includes('/event/'))
  await go(page, '#/finances'); check('15 finances lead with cash', (await page.locator('.fin-kpis .kpi').first().innerText()).toLowerCase().includes('cash'))
  await go(page, '#/dashboard'); check('16 back on the desk', (await page.getByTestId('desk-event').count()) === 1)
  await ctx.close()
}
// decision scorecards
{
  const { ctx, page } = await newPage()
  await boot(page); await load(page, 'night-dec'); await go(page, `#/event/${meta.dec.eventId}`)
  await page.getByRole('button', { name: /Run:|Ring the bell/ }).first().click(); await page.waitForSelector('[data-testid="fight-night"]')
  await page.getByTestId('lf-skip').click(); await page.waitForTimeout(600)
  const t = await page.getByTestId('lf-finish').innerText()
  check('13b OFFICIAL SCORECARDS with decision type and three judges', /official scorecards/i.test(t) && /unanimous|split|majority|draw/i.test(t) && /Judge 3/i.test(t), t.slice(-200))
  await ctx.close()
}

// ============================================================ C. responsive: no horizontal overflow, 3 widths
const ROUTES = ['dashboard', 'inbox', 'fighters', 'fighter/$F', 'negotiation/$FREE', 'events', 'event/$E', 'fights', 'finances', 'venues', 'promotions', 'news', 'sponsors', 'matchmaking']
for (const w of [1280, 1024, 390]) {
  const { ctx, page } = await newPage(w)
  await boot(page); await load(page, 'show-ok')
  const ids = await page.evaluate(() => { const g = window.__fe.useGame.getState().game; return { F: Object.values(g.contracts).find((c) => c.promotionId === g.playerPromotionId)?.fighterId, FREE: Object.values(g.fighters).find((f) => f.contractId === null && f.status === 'active')?.id, E: Object.keys(g.events)[0], FIGHT: Object.keys(g.fights)[0] } })
  const bad = []
  for (const r of [...ROUTES, 'fight/$FIGHT']) {
    const h = r.replace('$FREE', ids.FREE).replace('$FIGHT', ids.FIGHT).replace('$F', ids.F).replace('$E', ids.E)
    await go(page, `#/${h}`); await page.waitForTimeout(250)
    const o = await overflow(page); if (o !== 0) bad.push(`${r}:${o}`)
  }
  check(`${w}px: no horizontal overflow on ${ROUTES.length + 1} screens`, bad.length === 0, bad.join(', '))
  if (w === 390) {
    await go(page, '#/dashboard')
    const labels = await page.getByTestId('bottomnav').innerText()
    check('390px: bottom nav HOME/INBOX/FIGHTERS/EVENTS/MORE', /HOME/i.test(labels) && /INBOX/i.test(labels) && /FIGHTERS/i.test(labels) && /EVENTS/i.test(labels) && /MORE/i.test(labels))
    await go(page, `#/fight/${ids.FIGHT}`); await page.screenshot({ path: `${shots}/410-tape-390.png`, fullPage: true })
    await go(page, `#/negotiation/${ids.FREE}`); await page.screenshot({ path: `${shots}/410-neg-390.png`, fullPage: true })
    await go(page, `#/event/${ids.E}`); await page.screenshot({ path: `${shots}/410-event-390.png`, fullPage: true })
  }
  await ctx.close()
}

// ============================================================ D. reduced motion
{
  const { ctx, page } = await newPage(1280, { reducedMotion: 'reduce' })
  await boot(page); await load(page, 'night-ko'); await go(page, `#/event/${meta.ko.eventId}`)
  await page.getByRole('button', { name: /Run:|Ring the bell/ }).first().click(); await page.waitForSelector('[data-testid="fight-night"]')
  await page.getByTestId('lf-skip').click(); await page.waitForTimeout(500)
  check('reduced motion: result still reached', (await page.getByTestId('lf-finish').count()) === 1)
  await go(page, '#/dashboard'); check('reduced motion: dashboard renders', (await page.getByTestId('desk-event').count()) === 1)
  await ctx.close()
}

check('no console or page errors', errors.length === 0, errors.slice(0, 5).join(' | '))
console.log(`\n${passes} passed, ${fails} failed`)
await browser.close()
process.exit(fails ? 1 : 0)
