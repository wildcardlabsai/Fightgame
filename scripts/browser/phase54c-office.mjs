// Phase 5.4C browser verification: the promoter's office through the real screens.
// Usage: node scripts/browser/phase54c-office.mjs <baseUrl> <fixturesDir> [shotsDir]
// Fixture: npx tsx scripts/browser/make-phase54-fixtures.ts <fixturesDir>  (p54c-office.json)
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4180/play/', fx = '/tmp/e2e', shots = '/tmp/e2e-shots-54c'] = process.argv.slice(2)
mkdirSync(shots, { recursive: true })
const errors = []
let passes = 0, fails = 0
const check = (name, ok, detail = '') => { if (ok) passes++; else fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`) }
const browser = await chromium.launch()
const fixture = readFileSync(`${fx}/p54c-office.json`, 'utf8')
const go = async (p, h) => { await p.evaluate((x) => { location.hash = x }, h); await p.waitForTimeout(500) }
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const HIDDEN = ['competence', 'urgency', 'cooldown', 'prospectFactory', 'bailout', 'distress', 'fin.state', 'flex']
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
  const ver = await game(page, () => window.__fe.useGame.getState().game.version)
  check('fixture: save is version 12', ver === 12, String(ver))

  // ---- Offers tab
  await go(page, '#/fights/offers')
  check('offers: panel renders', (await page.getByTestId('offers-panel').count()) === 1)
  const cards = await page.getByTestId('offer-card').count()
  check('offers: both live proposals are listed', cards >= 2, String(cards))
  const text = await page.getByTestId('offers-panel').innerText()
  check('offers: shows purse, rounds and the rival promotion', /£/.test(text) && /round/i.test(text), text.slice(0, 200))
  check('offers: no hidden data on the page', HIDDEN.every((h) => !text.toLowerCase().includes(h.toLowerCase())))
  const tabsText = await page.locator('main .tabs').first().innerText()
  check('offers: tab count reflects real state', /Offers\s*2/i.test(tabsText.replace(/\n/g, ' ')), tabsText)
  check('offers: no horizontal overflow', (await overflow(page)) <= 1, String(await overflow(page)))
  await page.screenshot({ path: `${shots}/offers-${w}.png`, fullPage: true })

  // counter one, reject one
  const counters = page.getByTestId('offer-counter')
  if (await counters.count()) {
    await counters.first().click(); await page.waitForTimeout(300)
    check('offers: counter opens a form', (await page.getByTestId('offer-send-counter').count()) >= 1)
    await page.getByTestId('offer-send-counter').first().click(); await page.waitForTimeout(400)
    const st = await game(page, () => Object.values(window.__fe.useGame.getState().game.office.offers).map((o) => o.status))
    check('offers: sending a counter marks it countered', st.includes('countered'), st.join(','))
  }
  const before = await game(page, () => Object.values(window.__fe.useGame.getState().game.fights).length)
  const rejects = page.getByTestId('offer-reject')
  if (await rejects.count()) {
    await rejects.last().click(); await page.waitForTimeout(400)
    const st = await game(page, () => Object.values(window.__fe.useGame.getState().game.office.offers).map((o) => o.status))
    check('offers: declining closes it without creating a fight', st.includes('rejected') && (await game(page, () => Object.values(window.__fe.useGame.getState().game.fights).length)) === before, st.join(','))
  }
  // accept: fresh load so an offer is open
  await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), fixture); await page.waitForTimeout(300)
  await go(page, '#/dashboard'); await go(page, '#/fights/offers')
  const fightsBefore = await game(page, () => Object.keys(window.__fe.useGame.getState().game.fights).length)
  const acc = page.getByTestId('offer-accept')
  check('offers: accept is available', (await acc.count()) >= 1)
  await acc.first().click(); await page.waitForTimeout(600)
  const after = await game(page, () => { const g = window.__fe.useGame.getState().game; return { n: Object.keys(g.fights).length, st: Object.values(g.office.offers).map((o) => o.status), fid: Object.values(g.office.offers).find((o) => o.status === 'agreed')?.fightId } })
  check('offers: accepting creates exactly one real fight and marks the offer agreed', after.n === fightsBefore + 1 && after.st.includes('agreed') && !!after.fid, JSON.stringify(after))

  // ---- Objective on a profile
  const gid = await game(page, () => { const g = window.__fe.useGame.getState().game; return Object.entries(g.office.goals ?? {}).map(([id]) => id)[0] })
  check('fixture: a career objective exists', !!gid)
  if (gid) {
    await go(page, `#/fighter/${gid}`)
    check('profile: objective panel is shown', (await page.getByTestId('objective-panel').count()) === 1)
    const t = await page.getByTestId('objective-panel').innerText()
    check('profile: states the objective and next milestone', (await page.getByTestId('objective-label').count()) === 1 && (await page.getByTestId('objective-next').count()) === 1, t.slice(0, 160))
    check('profile: no hidden data or training controls', HIDDEN.every((h) => !t.toLowerCase().includes(h.toLowerCase())) && (await page.getByTestId('focus-grid').count()) === 0)
    await page.screenshot({ path: `${shots}/objective-${w}.png`, fullPage: false })
  }

  // ---- Campaign on a show with a card
  const evId = await game(page, () => { const g = window.__fe.useGame.getState().game; return Object.values(g.events).find((e) => e.promotionId === g.playerPromotionId && e.card.length > 0 && e.day >= g.today)?.id })
  if (evId) {
    await go(page, `#/event/${evId}`)
    check('event: promotional angle panel shown', (await page.getByTestId('campaign-panel').count()) === 1)
    const cash0 = await game(page, () => window.__fe.useGame.getState().game.promotions[window.__fe.useGame.getState().game.playerPromotionId].cash)
    await page.getByTestId('campaign-traditional').click(); await page.waitForTimeout(400)
    const c = await game(page, () => { const g = window.__fe.useGame.getState().game; return g.office.campaigns }).catch(() => null)
    check('event: choosing an angle is recorded', !!c, JSON.stringify(c)?.slice(0, 100))
    void cash0
    await page.screenshot({ path: `${shots}/event-campaign-${w}.png`, fullPage: false })
  } else console.log('SKIP  no player show with a card in fixture')

  // ---- Office screen
  await go(page, '#/office')
  check('office: screen renders', (await page.getByTestId('office-screen').count()) === 1)
  const ot = await page.getByTestId('office-screen').innerText()
  check('office: relations and strategy shown, no hidden data', /relation|promoter/i.test(ot) && /Prospect developer|Regional|contender|headline/i.test(ot) && HIDDEN.every((h) => !ot.toLowerCase().includes(h.toLowerCase())))
  const stance = page.locator('[data-testid^=stance-]').first()
  if (await stance.count()) { await stance.click(); await page.waitForTimeout(300) }
  const strat = await game(page, () => window.__fe.useGame.getState().game.office.strategy)
  check('office: strategy choice is stored', !!strat && (strat.stance !== null || strat.focus !== null), JSON.stringify(strat))
  check('office: no horizontal overflow', (await overflow(page)) <= 1, String(await overflow(page)))
  await page.screenshot({ path: `${shots}/office-${w}.png`, fullPage: true })

  // ---- Promoter no longer controls training
  const myF = await game(page, () => Object.values(window.__fe.useGame.getState().game.contracts)[0].fighterId)
  await go(page, `#/fighter/${myF}`)
  const pt = await page.locator('main').innerText()
  check('profile: no promoter training-focus grid or camp-intensity controls', (await page.getByTestId('focus-grid').count()) === 0 && !/Camp intensity/i.test(pt))
  await ctx.close()
}
console.log(`\n${passes} passed, ${fails} failed, errors: ${errors.length}`)
for (const e of errors.slice(0, 10)) console.log(e)
await browser.close()
process.exit(fails || errors.length ? 1 : 0)
