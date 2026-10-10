// Phase 6.3 behaviour checks: rival-staged offers become real bookings on the rival's card; Fight Night moves from bout to bout.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4180/play', fx = '/tmp/e2e'] = process.argv.slice(2)
const meta = JSON.parse(readFileSync(`${fx}/night-meta.json`, 'utf8'))
const p63 = JSON.parse(readFileSync(`${fx}/p63-meta.json`, 'utf8'))
const browser = await chromium.launch()
let passes = 0, fails = 0
const errors = []
const check = (n, ok, d = '') => { ok ? passes++ : fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  -> ${d}`}`) }
const load = async (page, n) => { await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), readFileSync(`${fx}/${n}.json`, 'utf8')); await page.waitForTimeout(500) }
const go = async (page, h) => { await page.evaluate((x) => { location.hash = x }, h); await page.waitForTimeout(800) }
const game = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__fe.useGame.getState().game, ${JSON.stringify(arg ?? null)})`)
const inView = async (page, loc) => { const b = await loc.boundingBox(); const h = page.viewportSize().height; return !!b && b.y >= 0 && b.y + b.height <= h + 1 }

for (const w of [1280, 390]) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/?e2e`); await page.waitForFunction(() => window.__fe)

  // ------------------------------------------------ an external offer: review, accept, verify the rival card
  await load(page, 'p63-offer'); await go(page, '#/fights/offers')
  const card = page.locator(`[data-testid=offer-card][data-offer=${p63.offerId}]`)
  check(`${w} offer: the incoming offer is shown with its status`, (await card.count()) === 1 && (await card.getAttribute('data-status')) === 'open')
  const text = await card.innerText()
  check(`${w} offer: names the rival, the show, the date and who stages it`, /Staged by/i.test(text) && /Their card:/i.test(text) && /\d{4}/.test(text) && /Your fighter/i.test(text) && /Their fighter/i.test(text), text.slice(0, 200))
  check(`${w} offer: says the rival runs the show (nothing for the player to arrange)`, /stage the fight on/i.test(text) && !/choose the date and the show/i.test(text))
  const before = await game(page, (g, id) => { const o = g.office.offers[id]; return { fights: Object.keys(g.fights).length, card: g.events[o.eventId].card.length, ev: o.eventId, mine: o.mine, theirs: o.theirs, promo: o.promoId } }, p63.offerId)
  await card.getByTestId('offer-accept').click(); await page.waitForTimeout(600)
  const after = await game(page, (g, id) => { const o = g.office.offers[id]; const f = o.fightId ? g.fights[o.fightId] : null; return { status: o.status, fights: Object.keys(g.fights).length, card: g.events[o.eventId].card.length, org: f?.organiserId, evId: f?.eventId, fid: f?.id, a: g.fighters[o.mine].activeFightId, b: g.fighters[o.theirs].activeFightId, player: g.playerPromotionId, onCard: g.events[o.eventId].card.includes(f?.id) } }, p63.offerId)
  check(`${w} offer: accepting creates exactly one fight on the rival's event`, after.status === 'agreed' && after.fights === before.fights + 1 && after.card === before.card + 1 && after.org === before.promo && after.evId === before.ev && after.onCard, JSON.stringify(after))
  check(`${w} offer: both fighters are committed to that bout`, after.a === after.fid && after.b === after.fid)
  check(`${w} offer: it is no longer actionable`, (await page.locator(`[data-testid=offer-card][data-offer=${p63.offerId}] [data-testid=offer-accept]`).count()) === 0)
  await page.getByTestId('offers-agreed').click(); await page.waitForTimeout(200)
  check(`${w} offer: it moves to Agreed`, (await page.locator(`[data-testid=offer-card][data-offer=${p63.offerId}][data-status=agreed]`).count()) === 1)
  // schedule / listings
  await go(page, '#/fights/open')
  const chip = page.locator('[data-testid=host-chip][data-external=true]').first()
  check(`${w} fights: the booking is listed as on the rival's card`, (await chip.count()) === 1 && /card/i.test(await chip.innerText()), await chip.innerText().catch(() => ''))
  await go(page, `#/event/${before.ev}`)
  const evText = await page.locator('main').innerText()
  const names = await game(page, (g, id) => { const o = g.office.offers[id]; return [g.fighters[o.mine].lastName, g.fighters[o.theirs].lastName] }, p63.offerId)
  check(`${w} rival card: the event page shows both fighters on the card`, evText.toLowerCase().includes(names[0].toLowerCase()) && evText.toLowerCase().includes(names[1].toLowerCase()), names.join('/'))
  await go(page, `#/fight/${after.fid}`)
  check(`${w} fight page: no "ring the bell" for a rival's show`, (await page.getByRole('button', { name: /Run:|Ring the bell/ }).count()) === 0)

  // ------------------------------------------------ decline
  await load(page, 'p63-offer'); await go(page, '#/fights/offers')
  const fightsBefore = await game(page, (g) => Object.keys(g.fights).length)
  await page.locator(`[data-testid=offer-card][data-offer=${p63.offerId}]`).getByTestId('offer-reject').click(); await page.waitForTimeout(500)
  const dec = await game(page, (g, id) => ({ status: g.office.offers[id].status, fights: Object.keys(g.fights).length }), p63.offerId)
  check(`${w} decline: closes the offer with no booking`, dec.status === 'rejected' && dec.fights === fightsBefore, JSON.stringify(dec))
  await page.getByTestId('offers-closed').click(); await page.waitForTimeout(200)
  check(`${w} decline: it shows under Declined & expired`, (await page.locator(`[data-testid=offer-card][data-offer=${p63.offerId}][data-status=rejected]`).count()) === 1)

  // ------------------------------------------------ Fight Night: Next fight
  await load(page, 'night-ko'); await go(page, `#/event/${meta.ko.eventId}`)
  const total = await game(page, (g, id) => g.events[id].card.length, meta.ko.eventId)
  await page.getByRole('button', { name: /Run:|Ring the bell/ }).first().click(); await page.waitForSelector('[data-testid="fight-night"]')
  const ran = new Set()
  for (let i = 1; i <= total; i++) {
    await page.getByTestId('lf-skip').click().catch(() => undefined)
    await page.waitForSelector('[data-testid=fight-night][data-finished=true]')
    const fid = await game(page, (g) => Object.values(g.fights).filter((f) => f.result).length)
    ran.add(fid)
    const next = page.getByTestId('lf-next-fight')
    if (i < total) {
      check(`${w} next fight: bout ${i} result offers the next bout in the overlay`, (await next.count()) === 1, String(await next.count()))
      const label = await next.innerText()
      check(`${w} next fight: names the fighters${i === total - 1 ? ' and flags the main event' : ''}`, / v /i.test(label) && (i === total - 1 ? /Main event/i.test(label) : /Next fight/i.test(label)), label)
      if (mobile) check(`${w} next fight: visible without scrolling on mobile`, await inView(page, next))
      await next.click(); await page.waitForSelector('[data-testid=fight-night][data-live=true]', { timeout: 8000 })
    } else {
      check(`${w} next fight: no Next button after the final bout`, (await next.count()) === 0)
      check(`${w} next fight: the card finishes with End event`, (await page.getByTestId('lf-end-event').count()) === 1)
    }
  }
  const results = await game(page, (g, id) => g.events[id].card.filter((c) => g.fights[c].result).length, meta.ko.eventId)
  check(`${w} next fight: every bout was fought exactly once`, results === total && ran.size === total, `${results}/${total} ${[...ran]}`)
  await ctx.close()
}

// ------------------------------------------------ the on-page bar (after closing the overlay), mobile clearance
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/?e2e`); await page.waitForFunction(() => window.__fe)
  await load(page, 'night-ko'); await go(page, `#/event/${meta.ko.eventId}`)
  await page.getByRole('button', { name: /Run:|Ring the bell/ }).first().click(); await page.waitForSelector('[data-testid="fight-night"]')
  await page.getByTestId('lf-skip').click(); await page.waitForSelector('[data-testid=fight-night][data-finished=true]')
  await page.getByTestId('lf-details').click(); await page.waitForTimeout(500)
  const bar = page.getByTestId('night-bar')
  await page.evaluate(() => window.scrollTo(0, document.querySelector('.night-wrap').getBoundingClientRect().y + scrollY + 400)); await page.waitForTimeout(300)
  check('390 night bar: shown on the page after the result', (await bar.count()) === 1 && (await bar.getAttribute('data-state')) === 'next')
  const btn = page.getByTestId('next-fight')
  const bb = await btn.boundingBox(); const nav = await page.locator('.bottomnav').boundingBox()
  check('390 night bar: the button is not hidden under the bottom nav', !!bb && (!nav || bb.y + bb.height <= nav.y + 1), JSON.stringify({ bb, nav }))
  check('390 night bar: has an accessible name and region label', /Next fight/i.test(await btn.innerText()) && (await bar.getAttribute('aria-label')) === 'Fight night progress')
  const n0 = await game(page, (g) => Object.values(g.fights).filter((f) => f.result).length)
  await btn.click(); await page.waitForTimeout(800)
  const n1 = await game(page, (g) => Object.values(g.fights).filter((f) => f.result).length)
  check('390 night bar: Next fight runs exactly one more bout', n1 === n0 + 1, `${n0} -> ${n1}`)
  await ctx.close()
}
check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
console.log(`${passes} passed, ${fails} failed`)
await browser.close()
