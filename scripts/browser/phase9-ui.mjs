// Phase 9: event economics, inbox priority and mobile toasts in a real browser at 1280 / 1024 / 390.
// Usage: node scripts/browser/phase9-ui.mjs <baseUrl> <fixturesDir> <shotsDir>   (needs p7-ready.json and p9-inbox.json in fixturesDir)
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4180/play', fx = '/tmp/e2e', out = '/tmp/p9/shots'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const p7 = JSON.parse(readFileSync(`${fx}/p7-meta.json`, 'utf8'))
const meta = JSON.parse(readFileSync(`${fx}/p9-meta.json`, 'utf8'))
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('PASS ', m) } else { fail++; console.log('FAIL ', m) } }
const browser = await chromium.launch()
const errors = []
for (const w of [1280, 1024, 390]) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))
  const load = async (n) => { await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), readFileSync(`${fx}/${n}.json`, 'utf8')); await page.waitForTimeout(500) }
  const go = async (h) => { await page.evaluate((x) => { if (location.hash === x) location.hash = '#/__'; location.hash = x }, h); await page.waitForTimeout(800) }
  const snap = async (n, full = false) => { await page.mouse.move(0, 0); await page.screenshot({ path: `${out}/${n}-${w}.jpg`, type: 'jpeg', quality: 66, fullPage: full }) }
  const noOverflow = async (l) => ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${w} ${l}: no horizontal overflow`)
  const T = (id) => page.getByTestId(id)
  await page.goto(`${base}/?e2e`); await page.waitForFunction(() => window.__fe); await page.waitForTimeout(700)

  // ---- 1 event economics on a show forecast to lose money
  await load('p7-ready'); await go(`#/event/${p7.eventId}`)
  await T('economics').scrollIntoViewIfNeeded()
  ok(await T('econ-loss').isVisible(), `${w} a forecast loss is explained on the event page`)
  // Phase 2 UX: the short reason is always visible; the rest, the levers and the cost table are behind deliberate controls.
  ok(/Even the best case|forecast loses|loss/i.test(await T('econ-loss').innerText()), `${w} the headline reason is visible without opening anything`)
  ok(!(await T('econ-table').evaluate((d) => d.open)), `${w} the cost breakdown is folded until the player opens it`)
  await T('econ-why-toggle').click(); await T('econ-table').locator('summary').click(); await page.waitForTimeout(250)
  const lossText = await T('econ-loss').innerText()
  ok(/sell-out would still lose|a sell-out would/.test(lossText) && /owed whatever the crowd|owed regardless/.test(await T('economics').innerText()), `${w} the explanation covers a sell-out and the money owed regardless`)
  ok(/none of these guarantees a profit/i.test(lossText) && !/guarantee a profit\./.test(lossText.replace(/none of these guarantees a profit/i, '')), `${w} it never promises a profit`)
  ok((await page.locator('[data-lever]').count()) >= 1 && (await page.locator('[data-lever="prices"]').count()) === 1, `${w} the levers named exist (ticket prices)`)
  ok(await T('econ-table').evaluate((d) => d.open), `${w} the cost table opens from its summary`)
  const rows = await page.locator('.econ-lines tbody tr').count(); ok(rows >= 8, `${w} cost and income lines are listed (${rows} rows)`)
  ok(/(Not reachable|About [\d,]+ tickets|covered)/.test(await T('econ-breakeven').innerText()), `${w} break-even is stated`)
  await noOverflow('event economics'); await snap('01-econ', false)
  await T('econ-table').scrollIntoViewIfNeeded(); await snap('02-econ-table', false)
  // the sale confirmation carries the same numbers
  await page.locator('[data-guide="put-on-sale"]').scrollIntoViewIfNeeded(); await page.locator('[data-guide="put-on-sale"]').click(); await page.waitForTimeout(500)
  ok(await T('econ-summary').isVisible(), `${w} putting a loss-making show on sale asks first, with the numbers`)
  const sumText = await T('econ-summary').innerText(); ok(/Owed whatever the crowd/.test(sumText) && /Break-even/.test(sumText) && /Cash if the poor end happens/.test(sumText), `${w} the confirmation shows owed money, break-even and cash at risk`)
  await noOverflow('sale confirmation'); await snap('03-sale-confirm', false)
  await page.getByRole('button', { name: /Review Event/i }).click(); await page.waitForTimeout(300)
  ok((await page.evaluate((id) => window.__fe.useGame.getState().game.events[id].status, p7.eventId)) !== 'onSale', `${w} "Review Event" does not put the show on sale`)

  // ---- 2 inbox priority
  await load('p9-inbox'); await go('#/inbox')
  ok(await T('inbox-tiers').isVisible(), `${w} the inbox has priority tabs`)
  const summary = await T('inbox-summary').innerText(); ok(/waiting for a decision|Nothing is waiting/.test(summary), `${w} the head says what is waiting (${summary.slice(0, 50)})`)
  const tabs = await T('inbox-tiers').locator('[role=tab]').allInnerTexts(); ok(tabs.length === 5 && /needs action/i.test(tabs.join(' ')), `${w} tabs: ${tabs.map((t) => t.replace(/\n/g, ' ')).join(' | ')}`)
  const rowsAll = await page.locator('.inbox-list .msg-row').count()
  ok(rowsAll < meta.messages, `${w} repeated information is folded (${rowsAll} rows for ${meta.messages} messages)`)
  ok((await page.locator('[data-testid=inbox-fold]').count()) >= 1, `${w} at least one fold exists`)
  const fold = page.locator('[data-testid=inbox-fold] .msg-row.fold').first()
  const before = await page.locator('.inbox-list .msg-row').count(); await fold.click(); await page.waitForTimeout(200)
  ok((await page.locator('.inbox-list .msg-row').count()) > before && (await fold.getAttribute('aria-expanded')) === 'true', `${w} a fold expands to every message in it`)
  if (meta.open > 0) {
    ok(await T('inbox-waiting').isVisible(), `${w} decisions still waiting are pinned first`)
    await page.locator('.msg-row[data-open="true"]').first().click(); await page.waitForTimeout(250)
    ok(/still waiting for your decision/.test(await T('inbox-decision').innerText()), `${w} an open offer says it is still waiting`)
  }
  await T('inbox-tiers').locator('[data-tier="updates"]').click(); await page.waitForTimeout(200)
  ok((await page.locator('.inbox-list .msg-row[data-tier="updates"]').count()) > 0 && (await page.locator('.inbox-list .msg-row:not([data-tier="updates"])').count()) === 0 || (await page.locator('.inbox-list .msg-row.fold').count()) > 0, `${w} the Updates tab shows only updates`)
  await noOverflow('inbox'); await snap('04-inbox', false)
  const tb = await T('inbox-tiers').locator('[role=tab]').first().boundingBox(); ok(tb && tb.height >= 40, `${w} tabs are a comfortable touch target (${Math.round(tb?.height ?? 0)}px)`)
  const before2 = await page.evaluate(() => window.__fe.useGame.getState().game.inbox.length)
  await T('inbox-read-view').click(); await page.waitForTimeout(200)
  ok((await page.evaluate(() => window.__fe.useGame.getState().game.inbox.length)) === before2, `${w} marking read deletes nothing`)

  // ---- 3 toasts (phone rules)
  await load('p9-inbox'); await go('#/dashboard')
  for (let i = 0; i < 4; i++) { await page.locator('[data-guide="advance"]:visible').first().click(); await page.waitForTimeout(250) }
  const toasts = await T('toast').count(); ok(toasts <= 2, `${w} at most two toasts at once (${toasts})`)
  const mailToasts = await page.locator('[data-testid=toast]:has-text("new message")').count(); ok(mailToasts <= 1, `${w} message counts add up into one toast (${mailToasts})`)
  if (mobile && toasts > 0) {
    const t = T('toast').last(); const tbox = await t.boundingBox(); const nav = await page.locator('nav.bottomnav, .bottom-nav, [data-testid=bottom-nav]').first().boundingBox().catch(() => null)
    const pe = await t.evaluate((e) => getComputedStyle(e).pointerEvents); ok(pe === 'none', `${w} a phone toast never intercepts a tap (pointer-events: ${pe})`)
    if (nav) ok(tbox.y + tbox.height <= nav.y + 1, `${w} the toast sits above the bottom bar (toast bottom ${Math.round(tbox.y + tbox.height)} <= bar top ${Math.round(nav.y)})`)
    const visible = await page.locator('[data-testid=toast]').evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== 'none').length); ok(visible <= 1, `${w} only one note shows at a time on a phone (${visible})`)
    const c = await T('desk-advance').boundingBox(); const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.getAttribute('data-testid'), [tbox.x + 20, tbox.y + tbox.height / 2])
    ok(hit !== 'toast', `${w} a tap where the toast is reaches the page underneath (hit ${hit}); advance button ${c ? 'present' : 'absent'}`)
  }
  await snap('05-toast', false)
  await ctx.close()
}
ok(errors.length === 0, `no console or page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`)
await browser.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
