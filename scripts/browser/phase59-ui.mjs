// Phase 5.9 browser checks: fight-talk money in figures and the draft verdict; champion vs your-fighter on the Titles and Rankings screens.
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const base = (process.argv[2] ?? 'http://localhost:4180/play/').replace(/\/$/, '')
const fx = process.argv[3] ?? '/tmp/e2e'
const shots = process.argv[4] ?? '/tmp/e2e-shots-59'
mkdirSync(shots, { recursive: true })
let passes = 0, fails = 0
const errors = []
const check = (n, ok, d = '') => { ok ? passes++ : fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  -> ${d}`}`) }
const browser = await chromium.launch()
const go = async (page, h) => { await page.evaluate((x) => { location.hash = x }, h); await page.waitForTimeout(700) }

for (const w of [1280, 1024, 390]) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/?e2e`); await page.waitForFunction(() => window.__fe)
  let fightId = null
  for (const name of ['p54-played', 'p54-new']) {
    await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), readFileSync(`${fx}/${name}.json`, 'utf8')); await page.waitForTimeout(400)
    fightId = await page.evaluate(() => {
      const s = window.__fe.useGame.getState(), g = s.game
      const mine = Object.values(g.contracts).filter((c) => c.promotionId === g.playerPromotionId && c.status === 'active').map((c) => c.fighterId)
      for (const m of mine) for (const o of Object.values(g.fighters).filter((f) => f.weightClass === g.fighters[m].weightClass && f.id !== m && !f.retired)) { const id = s.approachOpponent(m, o.id); if (id && window.__fe.useGame.getState().game.fights[id]?.status === 'negotiating') return id }
      return null
    })
    if (fightId) break
  }
  check(`${w} a fight talk can be opened`, !!fightId)
  if (fightId) {
    await go(page, `#/deal/${fightId}`)
    const verdict = page.getByTestId('draft-verdict')
    check(`${w} the draft carries a plain-words verdict`, (await verdict.count()) === 1 && /going rate/i.test(await verdict.innerText()) && /£/.test(await verdict.innerText()), await verdict.count() ? await verdict.innerText() : 'missing')
    await page.getByTestId('ask-priorities').click(); await page.waitForTimeout(400)
    const log = await page.getByTestId('talk-log').innerText()
    check(`${w} asking what the camp needs gives pounds`, /purse, with a win bonus of £/.test(log), log.slice(-300))
    // a light (but not insulting) offer, so the talk carries on whoever the world has put on the other side (a generous one can settle it at once)
    const tog = page.getByTestId('offer-editor').locator('button.n54-toggle')
    if ((await tog.count()) && (await tog.getAttribute('aria-expanded')) === 'false') await tog.click()
    const purseIn = page.getByLabel('Their purse', { exact: true })
    if (await purseIn.count()) { const cur = Number((await purseIn.inputValue()).replace(/[^0-9]/g, '')); await purseIn.fill(String(Math.round((cur * 0.6) / 100) * 100)); await purseIn.blur() }
    await page.getByTestId('talk-propose').click(); await page.waitForTimeout(500)
    const log2 = await page.getByTestId('talk-log').innerText()
    check(`${w} after an offer the log says how it compares`, /against the going/i.test(log2) && /(generous|reasonable|light) offer|lowball/i.test(log2), log2.slice(-400))
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check(`${w} no horizontal overflow on the fight talk`, ov <= 0, String(ov))
    await page.screenshot({ path: `${shots}/talk-${w}.png`, fullPage: true })
  }
  // Rankings and Titles
  await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), readFileSync(`${fx}/p54-played.json`, 'utf8')); await page.waitForTimeout(400)
  await go(page, '#/rankings/atlas')
  check(`${w} rankings explain gold vs blue`, (await page.getByTestId('rank-legend').count()) === 1 && /YOUR FIGHTER/.test(await page.getByTestId('rank-legend').innerText()))
  const colours = await page.evaluate(() => { const c = document.querySelector('.rk-legend .chip.gold'), m = document.querySelector('.rk-legend .chip.mine'); return c && m ? [getComputedStyle(c).color, getComputedStyle(m).backgroundColor] : null })
  check(`${w} champion and your-fighter chips use different colours`, !!colours && colours[0] !== colours[1], JSON.stringify(colours))
  await page.screenshot({ path: `${shots}/rankings-${w}.png`, fullPage: true })
  await go(page, '#/titles/world/heavyweight')
  await page.getByTestId('titles-tab-belts').click().catch(() => {}); await page.waitForTimeout(500)
  const eyebrows = await page.getByTestId('champ-eyebrow').count()
  check(`${w} each belt with a champion says "Champion" above the name`, eyebrows > 0, String(eyebrows))
  const ov2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check(`${w} no horizontal overflow on titles`, ov2 <= 0, String(ov2))
  await page.screenshot({ path: `${shots}/titles-${w}.png`, fullPage: true })
  await ctx.close()
}
check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
console.log(`${passes} passed, ${fails} failed`)
await browser.close()
