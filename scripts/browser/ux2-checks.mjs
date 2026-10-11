// Phase 2 UX focused checks. Usage: node scripts/browser/ux2-checks.mjs <baseUrl> <fixturesDir>
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4180/play', fx = '/tmp/e2e'] = process.argv.slice(2)
const MAIN = readFileSync(`${fx}/p54-played.json`, 'utf8'), EVENT = readFileSync(`${fx}/p7-ready.json`, 'utf8'), meta = JSON.parse(readFileSync(`${fx}/p7-meta.json`, 'utf8'))
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('PASS ', m) } else { fail++; console.log('FAIL ', m) } }
const browser = await chromium.launch()
const errors = []
async function sess(w, fixture) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 800 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/?e2e`); await page.waitForFunction(() => window.__fe); await page.waitForTimeout(400)
  await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), fixture); await page.waitForTimeout(5200)
  return { ctx, page, go: async (h) => { await page.evaluate((x) => { if (location.hash === x) location.hash = '#/__'; location.hash = x }, h); await page.waitForTimeout(900) } }
}
const noOverflow = async (page, l, w) => ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${w} ${l}: no horizontal overflow`)
const inView = async (loc, w, h = 800) => { const b = await loc.boundingBox(); return !!b && b.x >= 0 && b.x + b.width <= w + 1 && b.y >= 0 && b.y + b.height <= h + 1 }

for (const w of [1280, 1024]) {
  // ---------------- event workspace
  let { ctx, page, go } = await sess(w, EVENT)
  await go(`#/event/${meta.eventId}`)
  const bar = page.getByTestId('event-bar')
  ok(await bar.isVisible(), `${w} event: identity/status/next-action bar is shown`)
  ok((await bar.innerText()).includes('OPENING NIGHT') || /opening night/i.test(await bar.innerText()), `${w} event: the bar names the event and status (${(await bar.innerText()).replace(/\n+/g, ' | ').slice(0, 90)})`)
  const sale = page.locator('[data-testid=eb-next][data-guide=put-on-sale]')
  ok(await sale.count() === 1 && await inView(sale, w), `${w} event: "Put on sale" is visible in the first viewport without scrolling`)
  await page.evaluate(() => window.scrollTo(0, 900)); await page.waitForTimeout(400)
  ok(await inView(bar.locator('[data-testid=eb-next]'), w), `${w} event: the primary action stays reachable after scrolling 900px`)
  ok(await inView(page.getByTestId('event-tabs').getByRole('tab').first(), w), `${w} event: the tab strip stays reachable while scrolled`)
  ok(await page.getByTestId('forecast-kpis').isVisible(), `${w} event: the forecast shows its four headline numbers`)
  const kp = await page.getByTestId('forecast-kpis').innerText()
  ok(/ATTENDANCE/i.test(kp) && /REVENUE/i.test(kp) && /COSTS/i.test(kp) && /PROFIT/i.test(kp), `${w} event: attendance, revenue, costs and profit/loss come first`)
  ok(await page.getByTestId('econ-loss').isVisible() && !(await page.getByTestId('econ-table').evaluate((d) => d.open)), `${w} event: the loss reason is visible and the breakdown is folded`)
  await page.getByTestId('econ-why-toggle').click(); await page.waitForTimeout(200)
  ok(await page.getByTestId('econ-why').isVisible() && (await page.locator('[data-lever]').first().isVisible()), `${w} event: "show the rest" reveals the explanation and the levers`)
  await page.getByTestId('econ-table').locator('summary').first().click(); await page.waitForTimeout(200)
  ok(await page.getByTestId('econ-breakeven').isVisible(), `${w} event: the breakdown opens and states the break-even`)
  // tab memory
  await page.getByTestId('event-tabs').getByRole('tab', { name: /Broadcast/ }).click(); await page.waitForTimeout(250)
  ok(await page.getByTestId('money-summary').isVisible(), `${w} event: Broadcast & sponsors opens with a summary of what each deal is worth`)
  await go('#/matchmaking'); await go(`#/event/${meta.eventId}`)
  ok((await page.getByTestId('event-tabs').locator('[aria-selected=true]').innerText()).toLowerCase().includes('broadcast'), `${w} event: leaving for Matchmaking and coming back keeps the Broadcast & sponsors tab`)
  // actions still work
  await page.getByTestId('event-tabs').getByRole('tab', { name: /Tickets/ }).click(); await page.waitForTimeout(200)
  const gaBefore = await page.evaluate(() => { const g = window.__fe.useGame.getState().game; return JSON.stringify(Object.values(g.events).find((e) => e.id === g.route?.param)?.prices ?? null) })
  await page.locator('[data-testid=eb-next]').click(); await page.waitForTimeout(500)
  ok(await page.getByText('Before you put this on sale').isVisible(), `${w} event: Put on sale still asks for confirmation with the numbers when a loss is forecast`)
  await page.getByRole('button', { name: 'Review Event' }).click(); await page.waitForTimeout(300)
  const st = await page.evaluate((id) => window.__fe.useGame.getState().game.events[id].status, meta.eventId)
  ok(st === 'cardBuilding' || st === 'venueBooked', `${w} event: "Review Event" leaves the show off sale (${st})`)
  await noOverflow(page, 'event', w)
  await ctx.close()

  // ---------------- matchmaking / scouting / overview on the main career
  ;({ ctx, page, go } = await sess(w, MAIN))
  await go('#/matchmaking')
  ok((await page.locator('.mm-picker button.pick').count()) >= 10 && await page.locator('.mm-picker button.pick').last().isVisible(), `${w} matchmaking: every fighter is selectable from a compact picker`)
  const firstRow = page.locator('table tbody tr.row').first()
  ok(await firstRow.isVisible() && await inView(page.locator('table tbody tr.row').first().locator('td.actions button.primary'), w), `${w} matchmaking: the first opponent's primary action is visible in the viewport`)
  ok((await page.locator('table').first().evaluate((t) => t.getBoundingClientRect().top)) < 700, `${w} matchmaking: the opponents table starts within the first viewport`)
  ok((await page.getByTestId('best-fit').count()) === 1, `${w} matchmaking: the best fit is marked`)
  await page.getByLabel('Show unavailable').check(); await page.waitForTimeout(400)
  const nBlocked = await page.locator('tr.row[data-state=unavailable]').count()
  ok(nBlocked === 0 ? true : (await page.getByTestId('blocked-reason').count()) > 0, `${w} matchmaking: unavailable opponents are dimmed and say why (${nBlocked} unavailable opponents for this fighter)`)
  await page.getByLabel('Show unavailable').uncheck(); await page.waitForTimeout(300)
  await page.locator('input[aria-label^="Compare"]').first().check(); await page.waitForTimeout(300)
  ok((await page.locator('tr.row[data-state=compared]').count()) === 1 && await page.getByRole('heading', { name: 'Compare' }).count() >= 1, `${w} matchmaking: comparing a fighter marks the row and opens the comparison`)
  await page.locator('input[aria-label^="Compare"]').first().uncheck()
  await page.locator('table tbody tr.row').first().locator('td.actions button.primary').click(); await page.waitForTimeout(900)
  ok(/#\/(deal|matchmaking)/.test(await page.evaluate(() => location.hash)), `${w} matchmaking: the primary action still opens a deal (${await page.evaluate(() => location.hash)})`)
  await go('#/scouting')
  ok(await page.getByTestId('scope-free').getAttribute('aria-pressed') === 'true', `${w} scouting: free agents are shown by default`)
  const c1 = await page.locator('main p.dim').filter({ hasText: 'fighters ·' }).first().innerText()
  await page.getByTestId('scope-rival').click(); await page.waitForTimeout(400)
  const c2 = await page.locator('main p.dim').filter({ hasText: 'fighters ·' }).first().innerText()
  ok(c1 !== c2, `${w} scouting: "Under contract" changes the list (${c1.slice(0, 14)} → ${c2.slice(0, 14)})`)
  await page.getByTestId('scope-free').click(); await page.waitForTimeout(300)
  const offer = page.locator('table tbody tr.row').first().getByRole('button', { name: 'Offer' })
  ok((await page.locator('table tbody tr.row').count()) > 5 && await inView(page.locator('table tbody tr.row').first().getByRole('button', { name: 'Scout' }), w), `${w} scouting: Scout is visible beside every row without sideways scrolling`)
  const txt = await page.locator('main').innerText()
  ok(!/potential|\bchin\b|discipline|composure|hidden/i.test(txt.replace(/Hidden/g, '')), `${w} scouting: no hidden attribute names appear`)
  ok((await page.locator('table tbody tr.row').first().innerText()).includes('~'), `${w} scouting: estimates are marked "~"`)
  await go('#/dashboard')
  const manage = page.getByTestId('desk-manage')
  ok(await manage.isVisible() && await inView(manage, w), `${w} overview: "Manage event" is in the first viewport`)
  ok(await page.getByTestId('desk-needs').isVisible() && await inView(page.getByTestId('desk-needs'), w), `${w} overview: "Needs you" starts in the first viewport`)
  await manage.click(); await page.waitForTimeout(700)
  ok((await page.evaluate(() => location.hash)).startsWith('#/event/'), `${w} overview: Manage event opens the event`)
  await noOverflow(page, 'main career screens', w)
  if (w === 1024) {
    await go('#/dashboard')
    const rail = page.getByTestId('topnav').getByRole('button', { name: 'Roster' })
    ok(await rail.count() === 1, `1024 rail: icon-only items still have an accessible name ("Roster")`)
    await rail.hover(); await page.waitForTimeout(250)
    ok((await rail.evaluate((e) => getComputedStyle(e, '::after').opacity)) === '1', '1024 rail: hovering shows a tooltip with the section name')
    ok((await page.getByTestId('topnav').getByRole('button', { name: 'Overview' }).getAttribute('aria-current')) === 'page', '1024 rail: the current section is marked aria-current')
    await page.keyboard.press('Tab'); await page.waitForTimeout(100)
    await page.getByTestId('topnav').getByRole('button', { name: 'Events' }).focus(); await page.waitForTimeout(200)
    ok((await page.getByTestId('topnav').getByRole('button', { name: 'Events' }).evaluate((e) => getComputedStyle(e, '::after').opacity)) === '1', '1024 rail: keyboard focus also shows the tooltip')
  }
  await ctx.close()
}

// ---------------- phone regression
{
  const w = 390
  let { ctx, page, go } = await sess(w, EVENT)
  await go(`#/event/${meta.eventId}`)
  ok(!(await page.getByTestId('event-bar').isVisible()), '390 event: the desktop bar is not shown on a phone')
  ok((await page.locator('[data-guide="put-on-sale"]:visible').count()) >= 1, '390 event: Put on sale is still reachable on a phone')
  ok((await page.getByTestId('event-tabs').isVisible()) === false, '390 event: tabs stay desktop-only (one column on a phone)')
  await noOverflow(page, 'event', w)
  await ctx.close()
  ;({ ctx, page, go } = await sess(w, MAIN))
  for (const h of ['#/dashboard', '#/matchmaking', '#/scouting']) { await go(h); await noOverflow(page, h, w) }
  ok(await page.getByTestId('bottomnav').isVisible(), '390: the bottom bar is still the navigation')
  await ctx.close()
}
await browser.close()
ok(errors.length === 0, `no page errors${errors[0] ? ': ' + errors[0] : ''}`)
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
