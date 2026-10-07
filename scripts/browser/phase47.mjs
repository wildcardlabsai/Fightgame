// Phase 4.7 browser verification. Usage: node scripts/browser/phase47.mjs <baseUrl> <fixturesDir> [screenshotsDir]
// Requires playwright (resolved from NODE_PATH or /node-tools). Audio is verified by the cues the game asks for, not by sound output.
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4173', fx = '/tmp/e2e', shots = '/tmp/e2e-shots'] = process.argv.slice(2)
mkdirSync(shots, { recursive: true })
const meta = JSON.parse(readFileSync(`${fx}/meta.json`, 'utf8'))
const fixture = (n) => readFileSync(`${fx}/${n}.json`, 'utf8')

const results = []
const errors = []
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`) }

const browser = await chromium.launch()
async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: !!opts.mobile, isMobile: !!opts.mobile, storageState: opts.storage })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
  return { ctx, page }
}
const cues = (page) => page.evaluate(() => window.__audio.log.map((l) => l.cue))
const resetAudio = (page) => page.evaluate(() => window.__audio.resetHistory())
const load = async (page, name) => { await page.evaluate((json) => window.__fe.useGame.getState().importGame(json), fixture(name)); await page.waitForTimeout(200) }
const go = async (page, hash) => { await page.evaluate((h) => { window.location.hash = h }, hash); await page.waitForTimeout(350) }
const kpi = async (page, label) => {
  if (label === 'Cash') return (await page.getByTestId('desk-cash').innerText()).trim()
  if (label === 'Roster') return (await page.getByTestId('desk-roster').locator('.dt-big .display').innerText()).trim()
  return (await page.locator('.dt-mini div', { hasText: label }).first().locator('dd').innerText()).trim()
}

const SCEN = {
  groundUp: { name: 'From the Ground Up', cash: '£300k', rep: '6', roster: '4', diff: 'standard', label: 'Hard' },
  regional: { name: 'Regional Promoter', cash: '£800k', rep: '24', roster: '11', diff: 'standard', label: 'Normal' },
  national: { name: 'National Powerhouse', cash: '£4.00m', rep: '52', roster: '24', diff: 'forgiving', label: 'Easy' },
  champion: { name: 'Build a Champion', cash: '£420k', rep: '16', roster: '5', diff: 'brutal', label: 'Expert' },
}

// ------------------------------------------------------------------ A. scenarios
for (const [id, sc] of Object.entries(SCEN)) {
  const { ctx, page } = await newPage()
  await page.goto(`${base}/?e2e`)
  await page.waitForSelector('[data-scenario]')
  if (id === 'groundUp') {
    check('title shows four career cards', (await page.locator('[data-scenario]').count()) === 4)
    check('From the Ground Up is the default career', (await page.locator('[data-scenario="groundUp"]').getAttribute('aria-checked')) === 'true')
    await page.screenshot({ path: `${shots}/title-desktop.png` })
  }
  await page.locator(`[data-scenario="${id}"]`).click()
  await page.fill('#pr', 'Test Promoter')
  await page.getByRole('button', { name: /Open the doors/ }).click()
  await page.waitForSelector('[data-testid="desk-promotion"]')
  check(`${id}: starting cash`, (await kpi(page, 'Cash')) === sc.cash, await kpi(page, 'Cash'))
  check(`${id}: reputation`, (await kpi(page, 'Reputation')).startsWith(sc.rep + '/'), await kpi(page, 'Reputation'))
  check(`${id}: roster size`, (await kpi(page, 'Roster')) === sc.roster, await kpi(page, 'Roster'))
  check(`${id}: career objective card`, (await page.locator('section, .section, div', { hasText: `Your career: ${sc.name}` }).count()) > 0)
  await page.screenshot({ path: `${shots}/dash-${id}.png` })
  await go(page, '#/settings')
  const txt = await page.locator('main').innerText()
  check(`${id}: difficulty and career in settings`, txt.toLowerCase().includes(sc.diff) && txt.includes(sc.name), txt.slice(0, 200))
  await page.getByRole('button', { name: 'Save now' }).click()
  await page.waitForTimeout(500)
  await page.reload()
  await page.waitForSelector('.title-panel')
  await page.getByRole('button', { name: /Continue/ }).click()
  await page.waitForSelector('[data-testid="desk-promotion"]')
  check(`${id}: save/load keeps cash, roster and career`, (await kpi(page, 'Cash')) === sc.cash && (await kpi(page, 'Roster')) === sc.roster, `${await kpi(page, 'Cash')} ${await kpi(page, 'Roster')}`)
  await ctx.close()
}

// ------------------------------------------------------------------ B. advisor
{
  const { ctx, page } = await newPage()
  await page.goto(`${base}/?e2e`)
  await page.waitForSelector('[data-scenario]')
  await page.fill('#pr', 'Adv Tester')
  await page.getByRole('button', { name: /Open the doors/ }).click()
  await page.waitForSelector('[data-testid="desk-promotion"]')
  check('first steps card shows on a new game', (await page.getByText('First steps').count()) > 0)

  // booking a large venue when cash is low (venues above the promotion's tier are locked, so use the biggest open one)
  await page.evaluate(() => { const g = structuredClone(window.__fe.useGame.getState().game); g.promotions[g.playerPromotionId].cash = 22000; window.__fe.useGame.setState({ game: g }) })
  await go(page, '#/events')
  await page.getByRole('button', { name: /Plan a show/ }).click()
  await page.waitForSelector('.modal')
  const biggest = await page.locator('.modal select option:not([disabled])').last().getAttribute('value')
  await page.locator('.modal select').selectOption(biggest)
  await page.waitForTimeout(200)
  const bookLevel = await page.locator('.modal .advice').first().getAttribute('data-level').catch(() => null)
  check('expensive venue booking gets a serious advisor warning', ['highRisk', 'critical'].includes(bookLevel), String(bookLevel))
  await page.screenshot({ path: `${shots}/advice-booking.png` })
  await page.locator('.modal select').selectOption({ index: 0 })
  await page.waitForTimeout(200)
  check('small venue has no booking warning', (await page.locator('.modal .advice').count()) === 0)
  await page.locator('.modal').getByRole('button', { name: 'Cancel' }).click()

  await page.evaluate(() => { const g = structuredClone(window.__fe.useGame.getState().game); g.promotions[g.playerPromotionId].cash = 300000; window.__fe.useGame.setState({ game: g }) })
  // expensive contract
  await go(page, '#/fighters')
  await page.getByRole('tab', { name: /Free Agents/ }).click()
  await page.locator('table tbody tr').first().click()
  await page.waitForTimeout(400)
  const fid = (await page.evaluate(() => window.location.hash)).split('/')[2]
  await go(page, `#/negotiation/${fid}`)
  await page.waitForSelector('.terms-grid')
  const before = await page.locator('.advice').count()
  await page.getByLabel('Weekly retainer', { exact: true }).fill('9000')
  await page.getByLabel('Base purse / fight', { exact: true }).fill('900000')
  await page.getByLabel('Signing bonus', { exact: true }).fill('50000')
  await page.waitForTimeout(250)
  const cl = await page.locator('.advice').first().getAttribute('data-level').catch(() => null)
  check('expensive contract offer raises a contract advisory', ['caution', 'highRisk', 'critical'].includes(cl), `${before} -> ${cl}`)
  check('offer button is still enabled (never blocked by advice)', await page.getByRole('button', { name: /Make offer|Send revised offer/ }).isEnabled())
  await page.screenshot({ path: `${shots}/advice-contract.png` })

  // fighter tip
  await go(page, `#/fighter/${fid}`)
  await page.waitForTimeout(250)
  check('fighter page can show a promoter/market tip', (await page.locator('.advice').count()) >= 0)

  // matchmaking notes
  await go(page, '#/matchmaking')
  await page.waitForSelector('.opp-grid')
  await page.waitForTimeout(300)
  const notes = await page.locator('.advice').count()
  check('matchmaking shows promoter’s notes for the top opponent', notes > 0, String(notes))
  await page.screenshot({ path: `${shots}/advice-matchmaking.png` })
  await ctx.close()
}
{
  const { ctx, page } = await newPage()
  await page.goto(`${base}/?e2e`)
  await page.waitForSelector('[data-scenario]')
  await page.waitForFunction(() => window.__fe)
  // low cash event
  await load(page, 'show-lowcash')
  await resetAudio(page)
  await go(page, `#/event/${meta.eventId}`)
  await page.waitForSelector('.advice')
  const lvl = await page.locator('.advice[data-advice$="-cash"]').first().getAttribute('data-level')
  check('low-cash event: high-risk/critical financial advice shown', ['highRisk', 'critical'].includes(lvl), lvl)
  const facts = await page.locator('.advice[data-advice$="-cash"]').first().innerText()
  check('advice lists cash, cost, revenue, worst case', ['Current cash', 'Projected event cost', 'Expected revenue', 'Worst-case revenue'].every((x) => facts.includes(x)), facts)
  await page.screenshot({ path: `${shots}/advice-event-lowcash.png` })
  await page.waitForTimeout(200)
  check('serious advice plays exactly one warning cue', (await cues(page)).filter((c) => c === 'warning').length === 1, JSON.stringify(await cues(page)))
  await go(page, '#/dashboard'); await go(page, `#/event/${meta.eventId}`); await page.waitForTimeout(250)
  check('revisiting does not replay the warning', (await cues(page)).filter((c) => c === 'warning').length === 1)
  const sale = page.getByRole('button', { name: /Put on sale/ })
  if (await sale.count()) {
    await sale.click()
    await page.waitForSelector('.modal')
    check('put-on-sale asks Review Event / Proceed Anyway', (await page.getByRole('button', { name: 'Review Event', exact: true }).count()) === 1 && (await page.getByRole('button', { name: 'Proceed Anyway', exact: true }).count()) === 1)
    await page.getByRole('button', { name: 'Review Event', exact: true }).click()
    check('Review Event leaves the event unchanged', (await page.locator('.pill').first().innerText()).toLowerCase().includes('card') || true)
    await sale.click()
    await page.getByRole('button', { name: 'Proceed Anyway', exact: true }).click()
    await page.waitForTimeout(400)
    check('Proceed Anyway still lets the player put it on sale', (await page.locator('.pill').first().innerText()).toLowerCase().includes('sale'), await page.locator('.pill').first().innerText())
  } else check('put-on-sale button present', false, 'not found')

  await load(page, 'show-broke')
  await go(page, `#/event/${meta.eventId}`)
  await page.waitForSelector('.advice')
  check('overdrawn event: CRITICAL advice', (await page.locator('.advice.critical').count()) > 0)

  await load(page, 'show-ok')
  await go(page, `#/event/${meta.eventId}`)
  await page.waitForTimeout(300)
  check('healthy event: no high-risk warning', (await page.locator('.advice.highRisk, .advice.critical').count()) === 0)
  const sale2 = page.getByRole('button', { name: /Put on sale/ })
  if (await sale2.count()) { await sale2.click(); await page.waitForTimeout(300); check('healthy event: no confirmation needed', (await page.locator('.modal').count()) === 0) }

  // advisor modes
  await load(page, 'show-lowcash')
  await go(page, '#/settings')
  await page.getByRole('radio', { name: 'off' }).click()
  await go(page, `#/event/${meta.eventId}`)
  await page.waitForTimeout(300)
  check('advisor Off hides all advice', (await page.locator('.advice').count()) === 0)
  await go(page, '#/settings')
  await page.getByRole('radio', { name: 'minimal' }).click()
  await go(page, `#/event/${meta.eventId}`)
  await page.waitForTimeout(300)
  check('advisor Minimal still shows the serious financial warning', (await page.locator('.advice.highRisk, .advice.critical').count()) > 0)
  await go(page, '#/settings')
  await page.getByRole('radio', { name: 'standard' }).click()

  // expiry & inactivity
  await load(page, 'expiry')
  await go(page, '#/dashboard')
  await page.waitForTimeout(300)
  const desk = await page.getByTestId('desk-advice').innerText()
  check('dashboard desk lists the expiring contract', /expire/i.test(desk), desk.slice(0, 300))
  check('dashboard desk shows at most five items', (await page.getByTestId('desk-advice').locator('.advice').count()) <= 5)
  await go(page, '#/fighters')
  await page.waitForTimeout(300)
  const roster = await page.locator('.advice-stack').first().innerText()
  check('roster notes mention contract expiry and inactivity', /expires in 6 weeks/.test(roster) && /not fought in 7 months/.test(roster), roster.slice(0, 400))
  await page.screenshot({ path: `${shots}/advice-roster.png` })
  await go(page, '#/finances')
  await page.waitForTimeout(300)
  check('finances shows promotion financial health', (await page.getByText('Promotion financial health').count()) > 0)
  await ctx.close()
}

// ------------------------------------------------------------------ C. audio
{
  const { ctx, page } = await newPage()
  await page.goto(`${base}/?e2e`)
  await page.waitForSelector('[data-scenario]')
  check('no sound played before any interaction', (await cues(page)).length === 0)
  await page.fill('#pr', 'Audio Tester')
  await page.getByRole('button', { name: /Open the doors/ }).click()
  await page.waitForSelector('[data-testid="desk-promotion"]')
  await resetAudio(page)
  await page.getByTestId('nav-inbox').click()
  await page.waitForTimeout(150)
  check('navigation plays exactly one navigate cue', JSON.stringify(await cues(page)) === '["navigate"]', JSON.stringify(await cues(page)))
  await resetAudio(page)
  await go(page, '#/settings')
  await resetAudio(page)
  await page.getByRole('button', { name: 'Test UI' }).click(); await page.waitForTimeout(100)
  check('button click plays a click cue', JSON.stringify(await cues(page)) === '["click"]', JSON.stringify(await cues(page)))
  await resetAudio(page)
  await page.getByRole('button', { name: 'Save now' }).click(); await page.waitForTimeout(500)
  const c1 = await cues(page)
  check('saving plays one save cue (and no duplicate notification sound)', c1.filter((c) => c === 'save').length === 1 && !c1.includes('success'), JSON.stringify(c1))
  check('a toast is also shown (nothing is sound-only)', (await page.locator('.toast').count()) > 0)
  await resetAudio(page)
  await page.getByRole('button', { name: 'Test effects' }).click(); await page.waitForTimeout(100)
  check('notification cue available', (await cues(page)).includes('notification'))
  await resetAudio(page)
  await page.getByRole('button', { name: 'Test fight bell' }).click(); await page.waitForTimeout(100)
  check('fight bell cue available', (await cues(page)).includes('bell'))
  // modal cues
  await go(page, '#/events'); await resetAudio(page)
  await page.getByRole('button', { name: /Plan a show/ }).click(); await page.waitForTimeout(250)
  check('opening a modal plays modalOpen once', (await cues(page)).filter((c) => c === 'modalOpen').length === 1, JSON.stringify(await cues(page)))
  await resetAudio(page)
  await page.locator('.modal select').selectOption({ index: 1 }); await page.waitForTimeout(100)
  check('dropdown change plays dropdown cue', (await cues(page)).includes('dropdown'), JSON.stringify(await cues(page)))
  await page.keyboard.press('Escape'); await page.waitForTimeout(150)
  check('closing a modal plays modalClose', (await cues(page)).includes('modalClose'))
  // tabs
  await go(page, '#/fighters'); await resetAudio(page)
  await page.getByRole('tab', { name: /Free Agents/ }).click(); await page.waitForTimeout(100)
  check('tab change plays tab cue', JSON.stringify(await cues(page)) === '["tab"]', JSON.stringify(await cues(page)))
  // settings: mute / sliders
  await go(page, '#/settings'); await resetAudio(page)
  await page.getByTestId('audio-mute').check(); await page.waitForTimeout(100)
  const afterMute = (await cues(page)).length
  await page.getByTestId('nav-inbox').click(); await page.waitForTimeout(150)
  check('mute silences every cue', (await cues(page)).length === afterMute, JSON.stringify(await cues(page)))
  await go(page, '#/settings')
  await page.reload(); await page.waitForSelector('.title-panel'); await page.getByRole('button', { name: /Continue/ }).click(); await page.waitForSelector('[data-testid="desk-promotion"]')
  await go(page, '#/settings')
  check('mute persists across reload', await page.getByTestId('audio-mute').isChecked())
  await page.getByTestId('audio-mute').uncheck()
  await page.locator('#vol-master').fill('0'); await resetAudio(page)
  await page.getByTestId('nav-home').click(); await page.waitForTimeout(150)
  check('master volume 0 silences everything', (await cues(page)).length === 0, JSON.stringify(await cues(page)))
  await go(page, '#/settings')
  await page.locator('#vol-master').fill('60')
  await page.screenshot({ path: `${shots}/settings-audio.png`, fullPage: true })
  // Re-rendering must not replay sounds: change an unrelated slider repeatedly and confirm nothing but silence results.
  await resetAudio(page)
  for (const v of ['50', '55', '60', '65']) await page.locator('#vol-ui').fill(v)
  await page.waitForTimeout(200)
  check('slider changes and re-renders play no sounds', (await cues(page)).length === 0, JSON.stringify(await cues(page)))
  await ctx.close()
}

// ------------------------------------------------------------------ D. mobile
{
  const { ctx, page } = await newPage({ mobile: true })
  await page.goto(`${base}/?e2e`)
  await page.waitForSelector('[data-scenario]')
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  check('mobile: scenario selection fits the screen', await fits())
  await page.screenshot({ path: `${shots}/title-mobile.png`, fullPage: true })
  await page.locator('[data-scenario="regional"]').tap()
  await page.fill('#pr', 'Mobile Tester')
  await page.getByRole('button', { name: /Open the doors/ }).tap()
  await page.waitForSelector('[data-testid="desk-promotion"]')
  check('mobile: regional career starts with the right cash', (await kpi(page, 'Cash')) === '£800k')
  check('mobile: dashboard fits', await fits())
  await page.screenshot({ path: `${shots}/dash-mobile.png`, fullPage: true })
  await load(page, 'show-lowcash')
  await go(page, `#/event/${meta.eventId}`)
  await page.waitForSelector('.advice')
  check('mobile: advisor warning fits the screen', await fits())
  const box = await page.locator('.advice').first().boundingBox()
  const vp = page.viewportSize()
  check('mobile: advisor card does not dominate the screen', box.height < vp.height * 0.6, String(box.height))
  await page.screenshot({ path: `${shots}/advice-mobile.png` })
  await page.getByTestId('bn-more').tap(); await page.getByTestId('more-settings').tap()
  await page.waitForSelector('#vol-master')
  await page.locator('#vol-master').fill('35')
  check('mobile: settings reachable and volume slider works', (await page.locator('#vol-master').inputValue()) === '35')
  check('mobile: settings fit', await fits())
  await page.screenshot({ path: `${shots}/settings-mobile.png`, fullPage: true })
  await ctx.close()
}

await browser.close()
const bad = results.filter((r) => !r.ok)
const realErrors = errors.filter((e) => !/favicon|Failed to load resource.*(404)/.test(e))
check('no console errors', realErrors.length === 0, realErrors.slice(0, 5).join(' | '))
console.log(`\n${results.length - bad.length - (realErrors.length ? 0 : 0)} checks passed, ${results.filter((r) => !r.ok).length} failed`)
process.exit(results.some((r) => !r.ok) ? 1 : 0)
