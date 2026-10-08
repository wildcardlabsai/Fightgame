// Phase 5.4 career walkthrough in the browser: a promoter plays through the fight business using only the real screens.
// Usage: node scripts/browser/phase54-walkthrough.mjs <baseUrl> <fixturesDir> [shotsDir]
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4173', fx = '/tmp/e2e', shots = '/tmp/e2e-shots-walk'] = process.argv.slice(2)
mkdirSync(shots, { recursive: true })
const errors = []
let passes = 0, fails = 0
const check = (name, ok, detail = '') => { if (ok) passes++; else fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`) }
const browser = await chromium.launch()
const FORBIDDEN = ['reservation', 'archetype', 'walkAway', 'lowballTolerance', 'MONEY_FOCUSED', 'TITLE_FOCUSED', 'BECOME_']

for (const w of [1280, 1024, 390]) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
  await page.goto(`${base}/?e2e`)
  await page.waitForFunction(() => window.__fe)
  await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), readFileSync(`${fx}/p54-played.json`, 'utf8'))
  await page.waitForTimeout(300)
  const go = async (h) => { await page.evaluate((x) => { location.hash = x }, h); await page.waitForTimeout(500) }
  const ovf = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  const game = (fn, arg) => page.evaluate(`(${fn.toString()})(window.__fe.useGame.getState().game, ${JSON.stringify(arg ?? null)})`)
  const body = () => page.locator('main, body').first().innerText()
  const noHidden = async (tag) => { const t = await body(); const bad = FORBIDDEN.filter((s) => t.includes(s)); check(`${w} ${tag}: no hidden-information words`, bad.length === 0, bad.join(',')) }
  const noOverflow = async (tag) => check(`${w} ${tag}: no horizontal overflow`, (await ovf()) <= 0, String(await ovf()))

  // 1. Scout the market: a free agent's profile shows the career ladder, value and expected-term RANGES.
  const target = await game((g) => Object.values(g.fighters).filter((f) => f.status === 'active' && !f.contractId && !f.injury && (f.record.wins + f.record.losses) >= 6 && f.reputation < g.promotions[g.playerPromotionId].reputation + 8).sort((a, b) => b.reputation - a.reputation)[0].id)
  await go(`#/fighter/${target}`)
  check(`${w} 1 profile shows the business panel`, (await page.getByTestId('biz-panel').count()) === 1)
  check(`${w} 1 contender ladder with a current rung`, (await page.getByTestId('ladder-step').count()) >= 8)
  check(`${w} 1 expected terms with a confidence badge, before any offer`, (await page.getByTestId('expected-terms').count()) >= 1 && /LOW|MODERATE|HIGH/i.test(await page.getByTestId('expected-terms').first().innerText()))
  await noOverflow('profile'); await noHidden('profile')
  await page.screenshot({ path: `${shots}/walk-profile-${w}.png` })

  // 2. Talk to the camp: ask, propose, read the counter, accept.
  await go(`#/negotiation/${target}`)
  check(`${w} 2 a conversation opens with the manager's greeting`, (await page.getByTestId('talk-line').count()) >= 1)
  await page.getByTestId('ask-priorities').click(); await page.waitForTimeout(300)
  check(`${w} 2 asking reveals a priority in the camp's words`, /cares most about/.test(await page.getByTestId('talk-log').innerText()))
  let signed = false
  for (let i = 0; i < 10 && !signed; i++) {
    if (await page.getByTestId('accept-counter').count()) await page.getByTestId('accept-counter').click()
    else {
      await page.getByTestId('talk-propose').click()
      if (!(await page.getByTestId('accept-counter').count()) && !(await page.getByTestId('talk-closed').count())) {
        const edit = page.getByRole('button', { name: 'Edit my offer' }); if (await edit.count()) await edit.click().catch(() => {})
        for (const [re, n] of [[/Increase Base purse/, 3], [/Increase Signing bonus/, 2], [/Increase Weekly retainer/, 2]]) { const b = page.getByRole('button', { name: re }).first(); if (await b.count()) for (let k = 0; k < n; k++) await b.click() }
      }
    }
    await page.waitForTimeout(350)
    signed = await game((g, id) => !!g.fighters[id].contractId && g.contracts[g.fighters[id].contractId]?.promotionId === g.playerPromotionId, target)
    if (await page.getByTestId('talk-closed').count()) break
  }
  await noOverflow('negotiation'); await noHidden('negotiation')
  await page.screenshot({ path: `${shots}/walk-talk-${w}.png` })
  check(`${w} 2 the deal is struck through the conversation`, signed)

  // 3. Steer the career: development plan on the profile.
  if (signed) {
    await go(`#/fighter/${target}`)
    const opts = page.locator('[data-testid=plan-option][aria-checked=false]')
    if (await opts.count()) { const plan = await opts.first().getAttribute('data-plan'); await opts.first().click(); await page.waitForTimeout(300); check(`${w} 3 choosing a plan changes the game`, (await game((g, id) => g.business.plans[id] ?? 'normal', target)) === plan) }
    check(`${w} 3 the profile now offers a division move`, (await page.getByTestId('division-move').count()) >= 1)
  }

  // 4. The title world: every level has an honest board; rankings explain themselves.
  for (const lvl of ['area', 'domestic', 'european', 'world']) {
    await go(`#/titles/${lvl}`)
    const cards = await page.getByTestId('belt-card').count()
    const t = await body()
    check(`${w} 4 titles/${lvl}: belts or honest reasons`, cards > 0 && /Vacant|Not contested|Champion|champion|dormant|since/i.test(t), `cards ${cards}`)
    await noOverflow(`titles/${lvl}`)
  }
  await go('#/rankings')
  check(`${w} 4 rankings show contenders with reasons`, (await page.getByTestId('rank-row').count()) > 0 || (await page.getByTestId('rank-empty').count()) > 0)
  await noOverflow('rankings'); await page.screenshot({ path: `${shots}/walk-rankings-${w}.png` })

  // 5. The venues: real facts, honest labels, no external images.
  const ext = []
  page.on('request', (r) => { if (r.resourceType() === 'image' && !r.url().startsWith(base) && !r.url().startsWith('data:')) ext.push(r.url()) })
  await go('#/venues')
  check(`${w} 5 venues list real and generic halls`, (await page.getByTestId('venue-card').count()) >= 20)
  const t5 = await body()
  check(`${w} 5 states plainly that there are no licensed photographs and capacity is the boxing configuration`, /no licensed photograph/i.test(t5) && /boxing/i.test(t5))
  check(`${w} 5 no external image requests`, ext.length === 0, ext.join(','))
  await noOverflow('venues'); await page.screenshot({ path: `${shots}/walk-venues-${w}.png` })

  // 6. Time passes: the world keeps its rules.
  await page.evaluate(() => { const st = window.__fe.useGame.getState(); st.advance(8) })
  await page.waitForTimeout(1200)
  const sound = await game((g) => ({ v: g.version, champsRetired: Object.entries(g.media.titles).filter(([, r]) => r.c && g.fighters[r.c]?.status === 'retired').length }))
  check(`${w} 6 eight weeks later the world is sound`, sound.v === 10 && sound.champsRetired === 0, JSON.stringify(sound))
  await ctx.close()
}
check('no console errors or page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
console.log(`\n${passes} passed, ${fails} failed`)
await browser.close()
process.exit(fails ? 1 : 0)
