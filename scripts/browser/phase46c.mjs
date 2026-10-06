// Phase 4.6c browser verification: promotion tiers, venue locks, standing sponsors, tier-up notice, mobile.
// Usage: node scripts/browser/phase46c.mjs <baseUrl> <fixturesDir> [screenshotsDir]
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4173', fx = '/tmp/e2e', shots = '/tmp/e2e-shots'] = process.argv.slice(2)
mkdirSync(shots, { recursive: true })
const fixture = (n) => readFileSync(`${fx}/${n}.json`, 'utf8')
const results = [], errors = []
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`) }
const browser = await chromium.launch()
async function newPage(mobile = false) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: mobile, isMobile: mobile })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
  await page.goto(`${base}/?e2e`)
  await page.waitForFunction(() => window.__fe)
  return { ctx, page }
}
const load = async (page, name) => { await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), fixture(name)); await page.waitForTimeout(250) }
const go = async (page, h) => { await page.evaluate((x) => { window.location.hash = x }, h); await page.waitForTimeout(350) }
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
const start = async (page, scen) => {
  await page.waitForSelector('[data-scenario]')
  await page.locator(`[data-scenario="${scen}"]`).click()
  await page.fill('#pr', 'Tier Tester')
  await page.getByRole('button', { name: /Open the doors/ }).click()
  await page.waitForSelector('.hero .kpis')
}

// ---- starting tiers
const START = { groundUp: ['LOCAL', 'Roster capacity 10'], regional: ['REGIONAL', 'Roster capacity 18'], national: ['NATIONAL', 'Roster capacity 28'], champion: ['LOCAL', 'Roster capacity 10'] }
for (const [id, [label, cap]] of Object.entries(START)) {
  const { ctx, page } = await newPage()
  await start(page, id)
  const tier = (await page.locator('.tierpanel .tier-name').first().innerText()).trim().toUpperCase()
  const meta = await page.locator('.tierpanel .tier-meta').first().innerText()
  check(`${id}: starts as ${label} promotion`, tier === label, tier)
  check(`${id}: shows ${cap}`, meta.includes(cap), meta)
  check(`${id}: next-tier requirements are listed`, (await page.locator('.tierpanel .reqs li').count()) >= 3 || id === 'national')
  if (id === 'groundUp') {
    await page.screenshot({ path: `${shots}/tier-dashboard.png`, fullPage: false })
    await go(page, '#/events')
    await page.getByRole('button', { name: /Plan a show/ }).click()
    await page.waitForSelector('.modal')
    const locked = await page.locator('.modal select option[disabled]').count()
    check('ground-up: arenas and stadiums are locked in the venue picker', locked >= 8, String(locked))
    check('ground-up: locked venues say what unlocks them', (await page.locator('.modal select option[disabled]').first().innerText()).includes('Opens at'))
    await page.keyboard.press('Escape')
    await go(page, '#/venues')
    check('venues screen marks locked venues', (await page.getByText(/Opens at (Regional|National) promotion level/).count()) > 0)
    await go(page, '#/sponsors')
    check('sponsors screen explains who will talk to you', (await page.getByText('Who is out there').count()) > 0)
    check('ground-up: bigger sponsors show what they need', (await page.getByText(/Needs a (Regional|National|International|Global) promotion/).count()) > 0)
  }
  await ctx.close()
}

// ---- sponsors: offers, accept, finances, instalments
{
  const { ctx, page } = await newPage()
  await page.waitForSelector('[data-scenario]')
  await load(page, 'sponsor-offers')
  await go(page, '#/sponsors')
  check('two offers are shown', (await page.locator('.deal.offer').count()) === 2)
  const txt = await page.locator('.deal.offer').first().innerText()
  check('offer shows value, per-show fee, obligations, exclusivity', /£\d/.test(txt) && /per qualifying show/.test(txt) && /qualifying shows a year/.test(txt) && /Exclusive/.test(txt), txt.slice(0, 300))
  await page.screenshot({ path: `${shots}/sponsors-offers.png`, fullPage: true })
  // exclusivity: knockout (energy) and northlink (telecom) are different industries, so both can be signed up to the slot limit (Regional = 2)
  await page.locator('.deal.offer[data-offer="knockout"]').getByRole('radio', { name: '3 years' }).click()
  await page.locator('.deal.offer[data-offer="knockout"]').getByRole('button', { name: 'Accept' }).click()
  await page.waitForTimeout(300)
  check('accepting creates a standing deal', (await page.locator('.deal[data-deal="Knockout Energy"]').count()) === 1)
  check('deal shows relationship, shows this year, next payment', await page.locator('.deal[data-deal="Knockout Energy"]').innerText().then((t) => /relationship/i.test(t) && /0 \/ 6/.test(t) && /next payment/i.test(t)))
  await page.locator('.deal.offer[data-offer="northlink"]').getByRole('button', { name: 'Decline' }).click()
  await page.waitForTimeout(250)
  check('declining removes the offer', (await page.locator('.deal.offer').count()) === 0)
  await go(page, '#/finances')
  check('finances separates event sponsorship from standing sponsors', (await page.getByText('Standing sponsors (last 12 months)').count()) > 0 && (await page.getByText('Event sponsorship (last 12 months)').count()) > 0)
  check('finances lists sponsor commitments', (await page.getByText(/Knockout Energy: 6 more qualifying shows/).count()) > 0)
  // advance 13 weeks → first instalment lands in the ledger
  await go(page, '#/dashboard')
  for (let i = 0; i < 4; i++) { await page.getByRole('button', { name: '+4 Weeks' }).first().click(); await page.waitForTimeout(700) }
  await go(page, '#/finances')
  await page.waitForTimeout(300)
  check('the quarterly instalment appears in the ledger', (await page.getByText(/Standing sponsor — Knockout Energy \(quarterly instalment\)/).count()) >= 1)
  await ctx.close()
}

// ---- tier up
{
  const { ctx, page } = await newPage()
  await load(page, 'tier-ready')
  await go(page, '#/dashboard')
  check('before: Local promotion', (await page.locator('.tierpanel .tier-name').first().innerText()).trim().toUpperCase() === 'LOCAL')
  await page.getByRole('button', { name: 'Advance Week ▸' }).first().click()
  await page.waitForSelector('.tierup')
  const t = await page.locator('.tierup').innerText()
  check('tier-up notice appears', /PROMOTION TIER INCREASED/i.test(t) && /Regional promotion/i.test(t), t)
  check('notice lists what unlocked', /Roster capacity 18/.test(t) && /Venues up to 6,000 seats/.test(t))
  await page.screenshot({ path: `${shots}/tierup.png` })
  await page.getByTestId('tier-ack').click()
  await page.waitForTimeout(300)
  check('notice dismisses and does not return', (await page.locator('.tierup').count()) === 0)
  check('dashboard now shows Regional with the bigger roster cap', (await page.locator('.tierpanel .tier-name').first().innerText()).trim().toUpperCase() === 'REGIONAL' && (await page.locator('.tierpanel .tier-meta').first().innerText()).includes('Roster capacity 18'))
  await page.getByRole('button', { name: 'Advance Week ▸' }).first().click(); await page.waitForTimeout(500)
  check('the notice does not reappear next week', (await page.locator('.tierup').count()) === 0)
  await go(page, '#/events')
  await page.getByRole('button', { name: /Plan a show/ }).click()
  await page.waitForSelector('.modal')
  const enabledNational = await page.locator('.modal select option:not([disabled])').evaluateAll((os) => os.some((o) => /Hallam|Bayou|Docklands/.test(o.textContent)))
  check('national venues unlocked after promotion', enabledNational)
  await ctx.close()
}

// ---- advisor
{
  const { ctx, page } = await newPage()
  await load(page, 'sponsor-behind')
  await go(page, '#/dashboard')
  await page.waitForTimeout(300)
  const desk = await page.locator('.desk').innerText()
  check('advisor flags a sponsor falling behind on events', /requires 6 qualifying events this contract year and you have promoted 1/.test(desk) || /Sponsor commitments/.test(desk), desk.slice(0, 300))
  check('desk is still at most five items', (await page.locator('.desk .advice').count()) <= 5)
  await ctx.close()
}

// ---- mobile
{
  const { ctx, page } = await newPage(true)
  await start(page, 'groundUp')
  check('mobile: dashboard with tier panel fits', await fits(page))
  await page.screenshot({ path: `${shots}/tier-mobile.png`, fullPage: true })
  await load(page, 'sponsor-offers')
  await go(page, '#/sponsors')
  check('mobile: sponsors screen fits', await fits(page))
  await page.screenshot({ path: `${shots}/sponsors-mobile.png`, fullPage: true })
  await go(page, '#/finances')
  check('mobile: finances fits', await fits(page))
  await load(page, 'tier-ready')
  await go(page, '#/dashboard')
  await page.getByRole('button', { name: 'Advance Week ▸' }).first().tap()
  await page.waitForSelector('.tierup')
  const box = await page.locator('.tierup').boundingBox()
  check('mobile: tier-up notice fits the screen', box.width <= 390 && box.height <= 844 && (await fits(page)))
  await page.screenshot({ path: `${shots}/tierup-mobile.png` })
  await ctx.close()
}

await browser.close()
const real = errors.filter((e) => !/favicon|Failed to load resource.*404/.test(e))
check('no console errors', real.length === 0, real.slice(0, 5).join(' | '))
console.log(`\n${results.filter((r) => r.ok).length} checks passed, ${results.filter((r) => !r.ok).length} failed`)
process.exit(results.some((r) => !r.ok) ? 1 : 0)
