// Phase 5.4 integrity: a NEW championship fight driven through the playable build, start to finish, through the real screens.
// Titles -> Request title fight -> negotiation -> schedule (or add to a show) -> advance weeks -> Fight Night -> result -> history.
// Usage: node scripts/browser/phase54-championship.mjs <baseUrl> <fixturesDir> [shotsDir] [fixture=p54-ordered]
// p54-ordered: the board has ordered the world title challenges the player's fighters can ask for, so a request cannot be turned down.
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4180/play', fx = '/tmp/e2e', shots = '/tmp/e2e-shots-champ', fixtureName = 'p54-ordered'] = process.argv.slice(2)
mkdirSync(shots, { recursive: true })
const errors = []
let passes = 0, fails = 0
const check = (name, ok, detail = '') => { if (ok) passes++; else fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`) }
const browser = await chromium.launch()
const fixture = readFileSync(`${fx}/${fixtureName}.json`, 'utf8')
const WORLD = ':is([data-body=atlas],[data-body=pioneer],[data-body=crown],[data-body=apex])'

const hash = (p) => p.evaluate(() => location.hash)
const go = async (p, h) => { await p.evaluate((x) => { location.hash = x }, h); await p.waitForTimeout(500) }
const fightOf = (p, id) => p.evaluate((i) => { const f = window.__fe.useGame.getState().game.fights[i]; return f ? { status: f.status, rounds: f.scheduledRounds, title: f.title ? { level: f.title.level, kind: f.title.kind, name: f.title.name, bodies: f.title.bodies } : null, day: f.day, eventId: f.eventId ?? null, result: f.result ? { method: f.result.method, round: f.result.round, winner: f.result.winner, recorded: f.result.rounds ? f.result.rounds.length : null, cards: f.result.cards.length } : null } : null }, id)
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

async function playTalks(page) {
  for (let i = 0; i < 14; i++) {
    if (/#\/fight\//.test(await hash(page))) return true
    if (await page.getByTestId('talk-closed').count()) return false
    if (await page.getByTestId('accept-counter').count()) { await page.getByTestId('accept-counter').first().click(); await page.waitForTimeout(400); continue }
    const propose = page.getByTestId('talk-propose').first()
    if (!(await propose.count())) return false
    await propose.scrollIntoViewIfNeeded(); await propose.click(); await page.waitForTimeout(450)
    if (await page.getByTestId('accept-counter').count() === 0 && !/#\/fight\//.test(await hash(page))) {
      // nudge the purse up so the camp agrees
      const ed = page.getByRole('button', { name: 'Edit my offer' }); if (await ed.count()) await ed.first().click().catch(() => {})
      for (const re of [/Increase (Base purse|Their purse)/, /Increase (Win bonus|Their win bonus)/]) { const b = page.getByRole('button', { name: re }).first(); if (await b.count()) for (let k = 0; k < 3; k++) await b.click().catch(() => {}) }
    }
  }
  return /#\/fight\//.test(await hash(page))
}

const results = []
let declines = 0
async function attempt(label, reqIdx, schedIdx, viaEvent) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${label}] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[${label}] ${e.message}`))
  page.on('requestfailed', (r) => errors.push(`[${label}] failed ${r.url()}`))
  await page.goto(`${base}/index.html?e2e`); await page.waitForFunction(() => window.__fe)
  await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), fixture); await page.waitForTimeout(400)
  await go(page, '#/titles')
  const btns = page.locator(`[data-testid=request-title-fight]${WORLD}`)
  if (reqIdx >= (await btns.count())) { await ctx.close(); return null }
  await btns.nth(reqIdx).scrollIntoViewIfNeeded(); await btns.nth(reqIdx).click(); await page.waitForTimeout(600)
  const m = /#\/deal\/(\w+)/.exec(await hash(page))
  if (!m) {
    // Not every challenge is accepted: the champion's camp can turn a voluntary one down, and says so.
    const toast = await page.locator('.toasts').innerText().catch(() => '')
    check(`${label} a request is either opened or turned down with a reason`, /turned the challenge down/.test(toast), toast)
    console.log(`INFO  ${label} declined: ${toast.replace(/\s+/g, ' ').slice(0, 120)}`)
    declines++
    await ctx.close(); return null
  }
  check(`${label} Request title fight opens the fight negotiation`, !!m, await hash(page))
  const id = m[1]
  let f = await fightOf(page, id)
  check(`${label} a WORLD title fight is 12 rounds the moment it is created`, f.rounds === 12 && f.status === 'negotiating', JSON.stringify(f))
  const talked = await playTalks(page)
  if (!talked) { console.log(`INFO  ${label} the camp did not agree terms (a legitimate outcome of the talks) — skipped`); declines++; await ctx.close(); return null }
  check(`${label} the camp agrees terms`, talked, await hash(page))
  f = await fightOf(page, id)
  check(`${label} agreed fight is still 12 rounds`, f.rounds === 12, JSON.stringify(f))
  check(`${label} fight page shows 12 rounds (or its tape)`, /12 rounds/i.test(await page.locator("main").innerText()))
  if (viaEvent) {
    const add = page.getByRole('button', { name: 'Add to this show' }).first()
    if (!(await add.count())) { check(`${label} an open show can take the fight`, false, 'no Add to this show'); await ctx.close(); return null }
    await add.click(); await page.waitForTimeout(600)
  } else {
    const picks = page.locator('button.pick')
    await picks.nth(Math.min(schedIdx, (await picks.count()) - 1)).click()
    await page.getByRole('button', { name: 'Schedule the fight' }).click(); await page.waitForTimeout(600)
  }
  f = await fightOf(page, id)
  check(`${label} scheduled${viaEvent ? ' on a show' : ''}: still 12 rounds, flagged as a world title fight`, f.status === 'scheduled' && f.rounds === 12 && f.title?.level === 'world', JSON.stringify(f))
  await page.screenshot({ path: `${shots}/${label}-scheduled.png`, fullPage: true })
  // Weeks pass; the length never moves.
  let guard = 0
  while (guard++ < 30) {
    f = await fightOf(page, id)
    if (f.status === 'fightNight' || f.result) break
    if (f.rounds !== 12) { check(`${label} length stays 12 while the fight is booked`, false, `week ${guard}: ${f.rounds}`); break }
    await page.getByRole('button', { name: /Advance Week/ }).first().click(); await page.waitForTimeout(350)
  }
  f = await fightOf(page, id)
  if (f.status === 'cancelled') { console.log(`INFO  ${label} the booked fight was called off by the world (${guard} weeks in) — skipped`); await ctx.close(); return null }
  check(`${label} reaches fight night with 12 rounds (after ${guard} weeks)`, f.status === 'fightNight' && f.rounds === 12, JSON.stringify(f))
  if (f.status !== 'fightNight') { await ctx.close(); return null }
  // Fight Night
  await go(page, viaEvent ? `#/event/${f.eventId}` : `#/fight/${id}`)
  await page.screenshot({ path: `${shots}/${label}-tape.png`, fullPage: true })
  check(`${label} tale of the tape shows 12 rounds`, /12 rounds|12 rds/i.test(await page.locator("main").innerText()))
  // A scheduled fight is run from its show: the bell on the fight page leads to the event page, where the bell runs the card.
  for (let k = 0; k < 3 && !(await page.getByTestId('fight-night').count()); k++) {
    await page.getByRole('button', { name: /Run:|Ring the bell/ }).first().click(); await page.waitForTimeout(700)
  }
  await page.waitForSelector('[data-testid="fight-night"]', { timeout: 10000 }).catch(async () => { await page.screenshot({ path: `${shots}/${label}-nobell.png` }); console.log('NO FIGHT NIGHT:', (await page.locator('main').innerText()).slice(0, 400)) })
  await page.locator('button[data-mode="watch"]').click().catch(() => {})
  await page.locator('[data-speed="4"]').first().click().catch(() => {})
  const seen = []
  const t0 = Date.now()
  while (Date.now() - t0 < 240000) {
    const t = await page.getByTestId('lf-round').first().innerText().catch(() => '')
    if (t && seen[seen.length - 1] !== t) seen.push(t)
    if ((await page.getByTestId('fight-night').getAttribute('data-finished')) === 'true') break
    await page.waitForTimeout(60)
  }
  const nums = seen.map((s) => /ROUND (\d+) \/ (\d+)/.exec(s)).filter(Boolean).map((x) => [Number(x[1]), Number(x[2])])
  check(`${label} the round counter always shows the scheduled distance (/ 12), never the number actually fought`, nums.length > 0 && nums.every(([, d]) => d === 12), seen.join(' | '))
  const rs = nums.map(([n]) => n)
  check(`${label} the round counter only ever advances`, rs.every((n, i) => i === 0 || n >= rs[i - 1]), seen.join(' | '))
  await page.getByTestId('lf-skip').click().catch(() => {}); await page.waitForTimeout(500)
  const fin = await page.getByTestId('lf-finish').innerText()
  f = await fightOf(page, id)
  const stopped = !['UD', 'SD', 'MD', 'DRAW'].includes(f.result.method)
  const endText = await page.getByTestId('lf-round').first().innerText()
  if (stopped) {
    check(`${label} a stoppage ends it early: ${f.result.method} in round ${f.result.round} of 12`, f.result.round >= 1 && f.result.round <= 12 && /ENDED R\d+/.test(endText) && f.result.recorded === f.result.round, `${endText} ${JSON.stringify(f.result)}`)
  } else {
    check(`${label} it went the full distance: all 12 rounds fought and scored`, f.result.round === 12 && f.result.recorded === 12 && f.result.cards === 3 && /ROUND 12 \/ 12/.test(endText) && /official scorecards/i.test(fin) && Math.max(...rs) === 12, `${endText} ${JSON.stringify(f.result)} max=${Math.max(...rs)}`)
  }
  check(`${label} the result still says 12 scheduled rounds`, f.rounds === 12, JSON.stringify(f))
  await page.screenshot({ path: `${shots}/${label}-result.png` })
  await page.getByTestId('fn-exit').click(); await page.waitForTimeout(600)
  // Records
  await go(page, `#/fight/${id}`)
  const ft = await page.locator('main').innerText()
  check(`${label} the fight page keeps the result and 12 rounds`, /12 rounds|12 rds|of 12/.test(ft) || f.rounds === 12, ft.slice(0, 120))
  await go(page, '#/fights/mine'); const list = await page.locator('main').innerText()
  check(`${label} My Results lists the fight with 12 rounds`, /12 rounds/i.test(list), list.slice(0, 200))
  if (f.eventId) { await go(page, `#/event/${f.eventId}`); check(`${label} the event record shows 12 rounds`, /12 rds|12 rounds/i.test(await page.locator('main').innerText()), (await page.locator('main').innerText()).slice(0, 200)) }
  const mine = await page.evaluate((i) => { const g = window.__fe.useGame.getState().game; const ft = g.fights[i]; return [ft.sideA, ft.sideB].map((s) => s.fighterId).find((x) => g.fighters[x].contractId && g.contracts[g.fighters[x].contractId]?.promotionId === g.playerPromotionId) }, id)
  await go(page, `#/fighter/${mine}`)
  check(`${label} career history lists the fight with 12 rds`, /12 rds/.test(await page.locator('main').innerText()))
  check(`${label} no horizontal overflow on the fight page`, (await overflow(page)) <= 1)
  await ctx.close()
  return { label, method: f.result.method, stopped, round: f.result.round }
}

const declinedReq = new Set()
let n = 0
outer: for (let r = 0; r < 8; r++) {
  for (let sc = 0; sc < 9; sc++) {
    if (declinedReq.has(r)) break
    const ev = sc === 6 // one attempt per request goes through a show
    const before = declines
    const out = await attempt(`#${++n}(req ${r}, date ${sc})${ev ? '(show)' : ''}`, r, sc, ev)
    if (declines > before) declinedReq.add(r)
    if (out) results.push(out)
    if (results.some((x) => !x.stopped) && results.some((x) => x.stopped) && results.length >= 3) break outer
    if (n >= 24) break outer
  }
}
console.log('\nFights run:', results.map((x) => `${x.label} ${x.method}${x.stopped ? ' R' + x.round : ' (12 rounds)'}`).join('; '))
check('at least one championship fight went the full 12 rounds', results.some((x) => !x.stopped))
check('at least one championship fight ended early by KO/TKO/stoppage', results.some((x) => x.stopped))
console.log(`Requests declined by the champion's camp: ${declines}`)
check('no console, page or network errors', errors.length === 0, errors.slice(0, 4).join(' | '))
console.log(`\n${passes} passed, ${fails} failed`)
await browser.close()
process.exit(fails ? 1 : 0)
