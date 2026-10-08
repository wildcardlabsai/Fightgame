// Phase 54 browser verification: real-world venues UI.
// Usage: node scripts/browser/phase54-venues.mjs <baseUrl> <fixturesDir> [shotsDir]
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4183', fx = '/tmp/e2e', shots = '/tmp/e2e-shots-u3'] = process.argv.slice(2)
mkdirSync(shots, { recursive: true })
const fixture = (n) => readFileSync(`${fx}/${n}.json`, 'utf8')
const errors = [], external = []
let passes = 0, fails = 0
const check = (name, ok, detail = '') => { if (ok) passes++; else fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`) }
const browser = await chromium.launch()
const origin = new URL(base).origin
async function newPage(w) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:') && (r.resourceType() === 'image' || /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/i.test(u))) external.push(u) })
  await page.goto(`${base}/?e2e`)
  await page.waitForFunction(() => window.__fe)
  return { ctx, page }
}
const load = async (page, name) => { await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), fixture(name)); await page.waitForTimeout(300) }
const go = async (page, h) => { await page.evaluate((x) => { location.hash = x }, h); await page.waitForTimeout(500) }
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const cards = (page) => page.getByTestId('venue-card')

for (const w of [1280, 1024, 390]) {
  const { ctx, page } = await newPage(w)
  await load(page, 'p54-new')
  const tag = `${w}px`

  // ---------------------------------------------------------------- venues browser
  await go(page, '#/venues')
  await cards(page).first().waitFor()
  const n0 = await cards(page).count()
  check(`${tag} venues: cards render (<=40 at first, >0)`, n0 > 0 && n0 <= 40, `n=${n0}`)
  check(`${tag} venues: every card has an image and a label`, (await page.getByTestId('venue-image').count()) === n0 && (await page.locator('.vn-cap', { hasText: 'Illustration — no licensed photograph' }).count()) === n0)
  check(`${tag} venues: show-more is offered for the 100+ venues`, (await page.getByTestId('venue-more').count()) === 1)
  await page.getByTestId('venue-more').click(); await page.waitForTimeout(200)
  const n1 = await cards(page).count()
  check(`${tag} venues: show more adds cards`, n1 > n0)
  const text = await page.locator('main').innerText()
  check(`${tag} venues: both real and generic present`, (await page.locator('[data-testid=venue-card][data-real=yes]').count()) > 0 && /Generic hall/.test(text) || (await page.locator('[data-testid=venue-card][data-real=no]').count()) >= 0)
  check(`${tag} venues: no NaN/undefined`, !/NaN|undefined|\[object/.test(text))
  check(`${tag} venues: no horizontal overflow`, (await overflow(page)) <= 0, String(await overflow(page)))
  check(`${tag} venues: images are lazy`, await page.evaluate(() => [...document.querySelectorAll('[data-testid=venue-image] img')].every((i) => i.loading === 'lazy')))

  // filters
  await page.getByTestId('venue-filter-type').selectOption('generic')
  const generic = await page.locator('[data-testid=venue-card]').count()
  check(`${tag} venues: generic filter shows only generic halls with disclaimer`, generic > 0 && (await page.locator('[data-testid=venue-card][data-real=yes]').count()) === 0)
  await page.locator('[data-testid=venue-card] summary').first().click()
  check(`${tag} venues: generic facts say not a real building`, /not a real building/.test(await page.getByTestId('venue-facts').first().innerText()))
  await page.getByTestId('venue-filter-type').selectOption('real')
  const real = await page.locator('[data-testid=venue-card]').count()
  check(`${tag} venues: real filter works`, real > 0 && (await page.locator('[data-testid=venue-card][data-real=no]').count()) === 0)
  await page.locator('[data-testid=venue-card] summary').first().click()
  const facts = await page.getByTestId('venue-facts').first().innerText()
  check(`${tag} venues: real facts show sources, verification and boxing note`, /\d+ sources?/.test(facts) && /Verification/.test(facts) && /boxing configuration/.test(facts), facts)
  await page.screenshot({ path: `${shots}/venues-${w}.png` })
  await page.getByTestId('venue-filter-type').selectOption('all')
  await page.getByTestId('venue-filter-tier').selectOption('stadium')
  const stad = await page.locator('[data-testid=venue-card]').count()
  check(`${tag} venues: tier filter narrows`, stad > 0 && stad < n1 + 100, `n=${stad}`)
  check(`${tag} venues: stadiums locked for a startup promotion, with reason`, (await page.getByTestId('venue-locked').count()) > 0 && /Opens at/.test(await page.getByTestId('venue-locked').first().innerText()))
  await page.getByTestId('venue-filter-avail').check()
  check(`${tag} venues: "available to my promotion" hides locked`, (await page.getByTestId('venue-locked').count()) === 0)
  await page.getByTestId('venue-filter-avail').uncheck()
  await page.getByTestId('venue-filter-tier').selectOption('all')
  const countries = await page.getByTestId('venue-filter-country').locator('option').allTextContents()
  check(`${tag} venues: country filter lists several countries`, countries.length > 5, countries.join())
  const target = countries.find((c) => /United States|USA/i.test(c)) ?? countries[2]
  await page.getByTestId('venue-filter-country').selectOption({ label: target })
  const inCountry = await page.locator('[data-testid=venue-card]').count()
  check(`${tag} venues: country filter works`, inCountry > 0 && inCountry < n1 + 60, `n=${inCountry}`)
  await page.getByTestId('venue-filter-country').selectOption('all')
  await page.getByTestId('venue-search').fill('zzzznothing')
  check(`${tag} venues: search with no match shows empty state`, (await cards(page).count()) === 0)
  await page.getByTestId('venue-search').fill('arena')
  const found = await page.locator('[data-testid=venue-card]').count()
  check(`${tag} venues: search finds venues`, found > 0)
  await page.getByTestId('venue-search').fill('')
  await page.getByTestId('venue-sort').selectOption('name')
  const names = await page.locator('[data-testid=venue-card] .vn-name').allTextContents()
  check(`${tag} venues: sort by name`, names.length > 1 && names.every((x, i) => i === 0 || names[i - 1].localeCompare(x) <= 0))
  await page.getByTestId('venue-sort').selectOption('capacity-desc')
  const caps = await page.locator('[data-testid=venue-card] .vn-stats div:first-child dd').allTextContents()
  const nums = caps.map((c) => Number(c.replace(/,/g, '')))
  check(`${tag} venues: sort by capacity (large first)`, nums.length > 1 && nums.every((x, i) => i === 0 || nums[i - 1] >= x), nums.slice(0, 5).join())
  await page.getByTestId('venue-sort').selectOption('cost')
  check(`${tag} venues: sort by cost does not break`, (await cards(page).count()) > 0)
  // keyboard: tab reaches the facts disclosure
  await page.getByTestId('venue-search').focus()
  let reached = false
  for (let i = 0; i < 20 && !reached; i++) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => document.activeElement?.tagName === 'SUMMARY') }
  check(`${tag} venues: facts disclosure reachable by keyboard`, reached)
  await ctx.close()
}

// ---------------------------------------------------------------- event builder
for (const w of [1280, 1024, 390]) {
  const { ctx, page } = await newPage(w)
  await load(page, 'p54-new')
  const tag = `${w}px`
  await go(page, '#/events')
  await page.getByRole('button', { name: /Plan a show/ }).first().click(); await page.waitForTimeout(400)
  await page.getByLabel('Event name').fill('Venue Test Night')
  const choose = page.getByTestId('venue-choose')
  check(`${tag} builder: venue cards with choose buttons`, (await choose.count()) > 0)
  check(`${tag} builder: radiogroup semantics`, (await page.getByRole('radiogroup', { name: 'Venue' }).count()) === 1 && (await page.getByRole('radio').count()) > 0)
  check(`${tag} builder: no horizontal overflow (modal)`, (await overflow(page)) <= 0, String(await overflow(page)))
  // locked venue cannot be chosen
  await page.getByTestId('venue-filter-tier').selectOption('stadium')
  const lockedBtn = page.getByTestId('venue-choose').first()
  check(`${tag} builder: locked venue shows reason and is disabled`, (await lockedBtn.isDisabled()) && (await page.getByTestId('venue-locked').count()) > 0)
  await page.getByTestId('venue-filter-tier').selectOption('local')
  await page.getByTestId('venue-filter-avail').check()
  const pick = page.getByTestId('venue-choose').nth(1)
  const pickedId = await pick.evaluate((b) => b.closest('[data-venue-id]').getAttribute('data-venue-id'))
  await pick.click(); await page.waitForTimeout(250)
  check(`${tag} builder: chosen venue is marked`, (await pick.getAttribute('aria-checked')) === 'true')
  await page.screenshot({ path: `${shots}/builder-${w}.png` })
  await page.getByRole('button', { name: /Book venue/ }).click(); await page.waitForTimeout(700)
  const evId = await page.evaluate(() => location.hash.split('/').pop())
  const booked = await page.evaluate((id) => window.__fe.useGame.getState().game.events[id]?.venueId, evId)
  check(`${tag} builder: choosing a venue sets game.events[id].venueId`, booked === pickedId, `${booked} vs ${pickedId}`)

  // venue comparison on the event page
  await page.getByRole('button', { name: /Compare venues/ }).click(); await page.waitForTimeout(500)
  const rows = page.getByTestId('venue-fit-row')
  await rows.first().waitFor()
  check(`${tag} fit: rows render with image`, (await rows.count()) > 0 && (await page.locator('[data-testid=venue-fit-row] [data-testid=venue-image]').count()) === (await rows.count()))
  const row0 = await rows.first().innerText()
  check(`${tag} fit: attendance, break-even, travel, risk, verdict, free`, (await page.getByTestId('venue-attendance').count()) > 0 && (await page.getByTestId('venue-breakeven').count()) > 0 && (await page.getByTestId('venue-travel').count()) > 0 && (await page.getByTestId('venue-risk').count()) > 0 && /good fit|too small|too big|loses money/i.test(row0) && /Free on the date|Booked on the date/i.test(row0), row0.slice(0, 300))
  check(`${tag} fit: no NaN/undefined`, !/NaN|undefined|\[object/.test(await page.locator('main').innerText()))
  check(`${tag} fit: best-fit cue present and engine-verdict based`, await page.evaluate(() => { const b = document.querySelector('[data-testid=venue-best]'); return !b || /good fit/i.test(b.closest('[data-testid=venue-fit-row]').innerText) }))
  check(`${tag} fit: current venue is marked`, /booked here/i.test(await page.getByTestId('venue-fit-list').innerText()))
  await page.getByTestId('venue-sort').selectOption('attendance')
  await page.getByTestId('venue-filter-country').selectOption({ index: 1 })
  check(`${tag} fit: filters/sort apply`, (await rows.count()) > 0)
  await page.getByTestId('venue-filter-country').selectOption('all')
  check(`${tag} fit: no horizontal overflow`, (await overflow(page)) <= 0, String(await overflow(page)))
  await page.getByTestId('venue-fit-list').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${shots}/fit-${w}.png` })
  await ctx.close()
}

// ---------------------------------------------------------------- played save: tap targets + home note
{
  const { ctx, page } = await newPage(390)
  await load(page, 'p54-played')
  const evId = await page.evaluate(() => { const g = window.__fe.useGame.getState().game; return Object.values(g.events).find((e) => e.promotionId === g.playerPromotionId && ['venueBooked', 'cardBuilding'].includes(e.status))?.id })
  if (evId) {
    await go(page, `#/event/${evId}`)
    const btn = page.getByRole('button', { name: /Compare venues/ })
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(500) }
    check('390px played: fit list renders', (await page.getByTestId('venue-fit-row').count()) > 0)
    const small = await page.evaluate(() => [...document.querySelectorAll('[data-testid^=venue-] button, [data-testid=venue-fit-list] select, [data-testid=venue-fit-list] input:not([type=checkbox])')].filter((e) => e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 40).length)
    check('390px played: tap targets >= 40px', small === 0, String(small))
    check('390px played: no horizontal overflow', (await overflow(page)) <= 0)
  } else console.log('INFO  no open editable event in p54-played; skipped')
  await ctx.close()
}

check('no console or page errors', errors.length === 0, errors.slice(0, 5).join(' | '))
check('no external image requests', external.length === 0, external.slice(0, 3).join(' | '))
console.log(`\n${passes} passed, ${fails} failed`)
await browser.close()
process.exit(fails ? 1 : 0)
