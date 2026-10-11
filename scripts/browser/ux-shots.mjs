// Desktop UX: screenshots + page-height metrics for the main screens.
// Usage: node scripts/browser/ux-shots.mjs <baseUrl> <fixture.json> <outDir> <label>
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4180/play', fixture = '/tmp/e2e/p54-played.json', out = '/tmp/ux/shots', label = 'before'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const json = readFileSync(fixture, 'utf8')
const browser = await chromium.launch()
const metrics = {}
for (const w of [1280, 1024, 390]) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 800 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  await page.goto(`${base}/?e2e`); await page.waitForFunction(() => window.__fe); await page.waitForTimeout(600)
  await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), json); await page.waitForTimeout(800)
  const ids = await page.evaluate(() => {
    const g = window.__fe.useGame.getState().game, me = g.playerPromotionId
    const mine = Object.values(g.contracts).filter((c) => c.promotionId === me && c.status === 'active').map((c) => c.fighterId)
    const ev = Object.values(g.events).filter((e) => e.organiserId === me || e.promotionId === me)
    return { fighter: mine[0], event: (ev.find((e) => e.status !== 'settled') ?? ev[0])?.id, fight: Object.values(g.fights)[0]?.id }
  })
  const routes = ['dashboard', 'fighters', `fighter/${ids.fighter}`, 'events', `event/${ids.event}`, 'finances', 'inbox', 'calendar', 'matchmaking', 'rankings', 'titles', 'contracts', 'scouting', 'promotions', 'venues', 'sponsors', 'news', 'media', 'office', 'settings', 'advisor', 'fights']
  for (const r of routes) {
    await page.evaluate((x) => { location.hash = '#/__'; location.hash = `#/${x}` }, r); await page.waitForTimeout(700)
    const m = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth, vw: window.innerWidth, vh: window.innerHeight }))
    metrics[`${w}/${r.split('/')[0]}`] = { height: m.h, overflowX: m.w > m.vw + 1, screens: +(m.h / m.vh).toFixed(2) }
    await page.mouse.move(0, 0)
    await page.screenshot({ path: `${out}/${label}-${r.split('/')[0]}-${w}.jpg`, type: 'jpeg', quality: 60 })
  }
  await ctx.close()
}
writeFileSync(`${out}/${label}-metrics.json`, JSON.stringify(metrics, null, 1))
console.log(Object.entries(metrics).filter(([k]) => !k.startsWith('390')).map(([k, v]) => `${k} ${v.screens}x${v.overflowX ? ' OVERFLOW' : ''}`).join('\n'))
await browser.close()
