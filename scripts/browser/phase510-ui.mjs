// Phase 5.10: screenshots of the running production build in an active career at 1280 / 1024 / 390, with text checks beside them.
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const base = (process.argv[2] ?? 'http://localhost:4180/play/').replace(/\/$/, '')
const fx = process.argv[3] ?? '/tmp/e2e'
const shots = process.argv[4] ?? '/tmp/e2e-shots-510'
mkdirSync(shots, { recursive: true })
let passes = 0, fails = 0
const errors = []
const check = (n, ok, d = '') => { ok ? passes++ : fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  -> ${d}`}`) }
const browser = await chromium.launch()
const go = async (page, h) => { await page.evaluate((x) => { location.hash = x }, h); await page.waitForTimeout(800) }
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const snap = async (page, w, name) => { await page.screenshot({ path: `${shots}/${name}-${w}.png`, fullPage: true }); const o = await overflow(page); check(`${w} ${name}: no horizontal overflow`, o <= 0, String(o))
  // the page clips sideways overflow, so also look for content that sits past the right edge
  const clipped = await page.evaluate(() => { const vw = document.documentElement.clientWidth; const out = []; for (const el of document.querySelectorAll('main *')) { if (el.closest('.n54-log, .table-wrap, .fn-track, [style*="overflow"]')) continue; const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > vw + 1) out.push(`${el.tagName}.${(el.className + '').toString().slice(0, 24)}`) } return out.slice(0, 5) })
  check(`${w} ${name}: nothing is cut off at the right edge`, clipped.length === 0, JSON.stringify(clipped)) }

for (const w of [1280, 1024, 390]) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/?e2e`); await page.waitForFunction(() => window.__fe)
  await page.waitForTimeout(1200)
  await snap(page, w, '01-title')
  check(`${w} title logo is shown and loaded`, await page.evaluate(() => { const i = document.querySelector('.title-art img'); return !!i && i.complete && i.naturalWidth > 0 }))
  await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), readFileSync(`${fx}/p54-played.json`, 'utf8')); await page.waitForTimeout(600)
  // give the roster the next-belt cases: inexperienced, unrated with a decent record, a champion
  await page.evaluate(() => {
    const st = window.__fe.useGame
    const g = structuredClone(st.getState().game)
    const mine = Object.values(g.contracts).filter((c) => c.promotionId === g.playerPromotionId && c.status === 'active').map((c) => g.fighters[c.fighterId]).filter((f) => f.status === 'active')
    if (mine[0]) mine[0].record = { wins: 1, losses: 2, draws: 0, koWins: 0, koLosses: 0 }
    if (mine[1]) mine[1].record = { wins: 7, losses: 1, draws: 0, koWins: 3, koLosses: 0 }
    if (mine[2]) mine[2].record = { wins: 16, losses: 2, draws: 0, koWins: 9, koLosses: 0 }
    if (mine[3]) { const k = `atlas|${mine[3].weightClass}`; if (g.media.titles[k]) { g.media.titles[k].c = mine[3].id; g.media.titles[k].since = g.today - 70 } }
    st.setState({ game: g })
  })
  await go(page, '#/dashboard')
  const nav = await page.evaluate(() => { const i = document.querySelector('.tn-brand img'); return i ? { ok: i.complete && i.naturalWidth > 0, w: i.getBoundingClientRect().width, h: i.getBoundingClientRect().height } : null })
  check(`${w} top-bar logo present, loaded, legible (>= 70px wide)`, !!nav && nav.ok && (mobile || nav.w >= 70), JSON.stringify(nav))
  await snap(page, w, '02-dashboard')
  await go(page, '#/titles/mine'); await snap(page, w, '03-titles-mine')
  const cards = await page.getByTestId('path-card').count()
  const bestText = await page.getByTestId('path-best').allInnerTexts()
  console.log(`   ${w} next-belt cards:`, JSON.stringify(bestText.map((t) => t.replace(/\s+/g, ' ').slice(0, 90))))
  check(`${w} title paths list shows a card per active fighter`, cards > 0)
  const goals = bestText.filter((t) => /NOT ELIGIBLE/.test(t))
  check(`${w} a fighter who is not eligible is shown a "Long-term goal", never a "Next belt"`, goals.every((t) => /^LONG-TERM GOAL/i.test(t)) && !bestText.some((t) => /^NEXT BELT/i.test(t) && /NOT ELIGIBLE/.test(t)), JSON.stringify(goals))
  check(`${w} the requirement names fights and wins`, goals.every((t) => /professional fights \(has \d+\)/.test(t) || /wins \(has \d+\)/.test(t)), JSON.stringify(goals))
  await go(page, '#/titles/world/welterweight'); await page.getByTestId('titles-tab-belts').click().catch(() => {}); await page.waitForTimeout(600); await snap(page, w, '04-belts')
  await go(page, '#/rankings/atlas'); await snap(page, w, '05-rankings')
  await go(page, '#/finances'); await snap(page, w, '06-finances')
  // contract negotiation with the forecast
  const free = await page.evaluate(() => { const g = window.__fe.useGame.getState().game; const signed = new Set(Object.values(g.contracts).filter((c) => c.status === 'active').map((c) => c.fighterId)); return Object.values(g.fighters).filter((f) => !signed.has(f.id) && !f.retired).map((f) => f.id).slice(0, 30) })
  let opened = null
  for (const id of free) { await go(page, `#/negotiation/${id}`); if (await page.getByTestId('talk-propose').count()) { opened = id; break } }
  check(`${w} a signing negotiation opens`, !!opened)
  if (opened) {
    check(`${w} the forecast sits with the offer`, await page.getByTestId('signing-forecast').isVisible())
    await snap(page, w, '07-negotiation-before')
    await page.getByTestId('talk-propose').click(); await page.waitForTimeout(600)
    await snap(page, w, '08-negotiation-after')
  }
  // fight negotiation
  await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), readFileSync(`${fx}/p54-new.json`, 'utf8')); await page.waitForTimeout(500)
  const fightId = await page.evaluate(() => {
    const s = window.__fe.useGame.getState(), g = s.game
    const mine = Object.values(g.contracts).filter((c) => c.promotionId === g.playerPromotionId && c.status === 'active').map((c) => c.fighterId)
    for (const m of mine) for (const o of Object.values(g.fighters).filter((f) => f.weightClass === g.fighters[m].weightClass && f.id !== m && !f.retired)) { const id = s.approachOpponent(m, o.id); if (id) return id }
    return null
  })
  if (fightId) {
    await go(page, `#/deal/${fightId}`); await snap(page, w, '09-fight-talk-before')
    await page.getByTestId('ask-priorities').click(); await page.waitForTimeout(400)
    await page.getByTestId('talk-propose').click(); await page.waitForTimeout(500); await snap(page, w, '10-fight-talk-after')
  } else check(`${w} a fight talk could be opened`, false)
  await ctx.close()
}
check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
console.log(`${passes} passed, ${fails} failed`)
await browser.close()
