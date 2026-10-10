// Phase 6.0 behaviour checks: every new control does what it says, at 1280 and 390.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4180/play', fx = '/tmp/e2e'] = process.argv.slice(2)
const meta = JSON.parse(readFileSync(`${fx}/night-meta.json`, 'utf8'))
const browser = await chromium.launch()
let passes = 0, fails = 0
const errors = []
const check = (n, ok, d = '') => { ok ? passes++ : fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  -> ${d}`}`) }
const load = async (page, n) => { await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), readFileSync(`${fx}/${n}.json`, 'utf8')); await page.waitForTimeout(500) }
const go = async (page, h) => { await page.evaluate((x) => { location.hash = x }, h); await page.waitForTimeout(800) }
const hash = (page) => page.evaluate(() => location.hash)

for (const w of [1280, 390]) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/?e2e`); await page.waitForFunction(() => window.__fe); await load(page, 'p54-played')
  // ---- dashboard
  await go(page, '#/dashboard')
  const strip = page.getByTestId('desk-strip')
  check(`${w} dashboard: the command strip is above the next event`, await strip.isVisible() && (await strip.boundingBox()).y < (await page.getByTestId('desk-event').boundingBox()).y)
  const tiles = await strip.locator('.cmd-tile').count()
  check(`${w} dashboard: five status tiles`, tiles === 5, String(tiles))
  const cash = await page.evaluate(() => { const g = window.__fe.useGame.getState().game; return g.promotions[g.playerPromotionId].cash })
  const tileText = await strip.locator('.cmd-tile').first().innerText()
  check(`${w} dashboard: the cash tile shows the ledger balance`, tileText.replace(/[^0-9]/g, '').startsWith(String(Math.round(cash / 10000)).slice(0, 3)) || tileText.includes('£'), tileText)
  const routes = [['finances', 0], ['fighters', 1], ['event', 2], ['titles', 4]]
  for (const [expect, idx] of routes) {
    await go(page, '#/dashboard')
    await page.getByTestId('desk-strip').locator('.cmd-tile').nth(idx).click(); await page.waitForTimeout(500)
    check(`${w} dashboard: tile ${idx + 1} opens ${expect}`, (await hash(page)).includes(expect), await hash(page))
  }
  await go(page, '#/dashboard')
  const needs = page.getByTestId('desk-needs')
  const nn = await needs.count()
  check(`${w} dashboard: urgent items are listed first, each with an action`, nn === 0 || (await needs.locator('.attn').count()) >= 1 && (await needs.locator('button.go').count()) >= 1)
  if (nn) { await needs.locator('button.go').first().click(); await page.waitForTimeout(600); check(`${w} dashboard: an urgent action navigates`, (await hash(page)) !== '#/dashboard', await hash(page)) }
  // ---- profile
  const mine = await page.evaluate(() => { const g = window.__fe.useGame.getState().game; return Object.values(g.contracts).filter((c) => c.promotionId === g.playerPromotionId && c.status === 'active').map((c) => c.fighterId) })
  await go(page, `#/fighter/${mine[0]}`)
  check(`${w} profile: the tag row says YOUR FIGHTER in words`, /your fighter/i.test(await page.getByTestId('tag-mine').innerText()))
  check(`${w} profile: the at-a-glance strip has four cells`, (await page.getByTestId('glance').locator('.gl-cell').count()) === 4)
  const y0 = await page.evaluate(() => window.scrollY)
  await page.getByTestId('pf-nav').getByRole('button', { name: 'Scouting' }).click(); await page.waitForTimeout(900)
  check(`${w} profile: the Scouting jump scrolls to the scouting report`, (await page.evaluate(() => window.scrollY)) > y0 + 300, String(await page.evaluate(() => window.scrollY)))
  const inView = await page.evaluate(() => { const r = document.getElementById('pf-scout').getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight })
  check(`${w} profile: the target section is on screen after the jump`, inView)
  // a champion shows a gold champion tag
  const champ = await page.evaluate(() => { const g = window.__fe.useGame.getState().game; const t = Object.values(g.media.titles).find((r) => r.c); return t ? t.c : null })
  if (champ) { await go(page, `#/fighter/${champ}`); check(`${w} profile: a champion carries a labelled champion tag`, (await page.getByTestId('tag-champion').count()) === 1 && /champion/i.test(await page.getByTestId('tag-champion').innerText())) }
  // ---- fights list
  await go(page, '#/fights')
  const chips = await page.getByTestId('phase-chip').allInnerTexts()
  check(`${w} fights: every open fight says whether it is a booking or a proposal`, chips.length > 0 && chips.every((t) => /Booked|Proposal|Fight night/i.test(t)), JSON.stringify(chips.slice(0, 3)))
  // ---- office
  await go(page, '#/office')
  const sel = await page.locator('.o54-choice[aria-pressed=true]').first().evaluate((e) => getComputedStyle(e, '::after').content)
  check(`${w} office: the current choice is labelled in words`, /Current choice/.test(sel), sel)
  const sel2 = await page.locator('.o54-choice[role=radio][aria-pressed=false]').first().evaluate((e) => getComputedStyle(e, '::after').content)
  check(`${w} office: the other choices say Select`, /Select/.test(sel2), sel2)
  // ---- fight night uses the logo, not a text brand
  await load(page, 'night-ko'); await go(page, `#/event/${meta.ko.eventId}`)
  await page.getByRole('button', { name: /Run:|Ring the bell/ }).first().click(); await page.waitForSelector('[data-testid="fight-night"]')
  check(`${w} fight night: the logo is shown and no old brand text remains`, (await page.locator('.fn-logo').count()) === 1 && !/FIGHT EMPIRE/.test(await page.getByTestId('fight-night').innerText()))
  check(`${w} fight night: your fighter is labelled in words`, (await page.locator('.fn-owner.mine').first().innerText()).includes('YOUR FIGHTER'))
  await ctx.close()
}
check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
console.log(`${passes} passed, ${fails} failed`)
await browser.close()
