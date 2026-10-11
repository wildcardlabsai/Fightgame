// Phase 2 before/after shots. Usage: node scripts/browser/ux2-shots.mjs <baseUrl> <outDir> <label>
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4180/play', out = 'docs/ux-phase2', label = 'before'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const MAIN = readFileSync('/tmp/e2e/p54-played.json', 'utf8'), EVENT = readFileSync('/tmp/e2e/p7-ready.json', 'utf8'), meta = JSON.parse(readFileSync('/tmp/e2e/p7-meta.json', 'utf8'))
const browser = await chromium.launch()
const rows = []
async function sess(w, fx) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 800 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  await page.goto(`${base}/?e2e`); await page.waitForFunction(() => window.__fe); await page.waitForTimeout(500)
  await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), fx); await page.waitForTimeout(5200)
  return { ctx, page }
}
const go = async (p, h) => { await p.evaluate((x) => { if (location.hash === x) location.hash = '#/__'; location.hash = x }, h); await p.waitForTimeout(1200); await p.evaluate(() => document.fonts.ready); await p.mouse.move(1, 1) }
const snap = async (p, w, name, full = false) => {
  await p.screenshot({ path: `${out}/${label}-${name}-${w}.png`, fullPage: full })
  rows.push({ w, name, h: +(await p.evaluate(() => document.documentElement.scrollHeight / innerHeight)).toFixed(2), ox: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1) })
}
for (const w of [1280, 1024, 390]) {
  let s = await sess(w, MAIN)
  const ids = await s.page.evaluate(() => { const g = window.__fe.useGame.getState().game, me = g.playerPromotionId; const mine = Object.values(g.contracts).filter((c) => c.promotionId === me && c.status === 'active').map((c) => g.fighters[c.fighterId]); const star = mine.find((f) => f.firstName === 'Liam' && f.lastName === 'Stokes') ?? mine[0]; return { fighter: star.id } })
  for (const [n, h] of [['overview', '#/dashboard'], ['roster', '#/fighters'], ['fighter', `#/fighter/${ids.fighter}`], ['inbox', '#/inbox'], ['matchmaking', '#/matchmaking'], ['scouting', '#/scouting']]) { await go(s.page, h); await snap(s.page, w, n) }
  await s.ctx.close()
  s = await sess(w, EVENT)
  await go(s.page, `#/event/${meta.eventId}`)
  const scrollToTabs = async () => { await s.page.evaluate(() => { const t = document.querySelector('[data-testid=event-tabs]'); if (t) window.scrollTo(0, window.scrollY + t.getBoundingClientRect().top - 150) }); await s.page.waitForTimeout(400) }
  await snap(s.page, w, 'event-top')
  if (w > 700) {
    for (const [tab, n] of [['Fight card', 'event-card'], ['Tickets & promotion', 'event-tickets'], ['Broadcast & sponsors', 'event-broadcast']]) {
      const b = s.page.getByTestId('event-tabs').getByRole('tab', { name: tab }); if (await b.count()) { await b.click(); await s.page.waitForTimeout(400) }
      await scrollToTabs(); await snap(s.page, w, n)
    }
  } else { await snap(s.page, w, 'event-full', false) }
  await s.ctx.close()
}
await browser.close()
for (const r of rows) console.log(`${r.w} ${r.name} ${r.h}vp${r.ox ? ' OVERFLOW' : ''}`)
