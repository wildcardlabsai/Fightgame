// Visual review pack: real screenshots of the current build. Usage: node scripts/browser/ux-review-pack.mjs <baseUrl> <outDir>
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4180/play', out = 'docs/ux-review'] = process.argv.slice(2)
const MAIN = readFileSync('/tmp/e2e/p54-played.json', 'utf8')
const EVENT = readFileSync('/tmp/e2e/p7-ready.json', 'utf8')
const evMeta = JSON.parse(readFileSync('/tmp/e2e/p7-meta.json', 'utf8'))
const shots = []
const notes = []
const browser = await chromium.launch()

async function session(w, h, fixture) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  const page = await ctx.newPage()
  await page.goto(`${base}/?e2e`); await page.waitForFunction(() => window.__fe); await page.waitForTimeout(600)
  await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), fixture)
  await page.waitForTimeout(5500) // let the "Save imported" toast leave
  return { ctx, page }
}
const go = async (page, hash) => { await page.evaluate((x) => { if (location.hash === x) location.hash = '#/__'; location.hash = x }, hash); await page.waitForTimeout(1300); await page.evaluate(() => document.fonts.ready); await page.mouse.move(1, 1) }
const snap = async (page, w, h, name, title, extra = {}) => {
  const dir = `${out}/${w}x${h}`; mkdirSync(dir, { recursive: true })
  const file = `${dir}/${name}.png`
  await page.screenshot({ path: file })
  const m = await page.evaluate(() => ({ docH: document.documentElement.scrollHeight, vh: innerHeight, overflowX: document.documentElement.scrollWidth > innerWidth + 1, sidebar: !!document.querySelector('.sidenav') && getComputedStyle(document.querySelector('.sidenav')).display !== 'none' }))
  shots.push({ w, h, name, title, file: file.replace(/^docs\/ux-review\//, ''), ...m, ...extra })
}

// ---------------------------------------------------------------- 1280 x 800, main career
{
  const W = 1280, H = 800
  const { ctx, page } = await session(W, H, MAIN)
  const ids = await page.evaluate(() => {
    const g = window.__fe.useGame.getState().game, me = g.playerPromotionId
    const mine = Object.values(g.contracts).filter((c) => c.promotionId === me && c.status === 'active').map((c) => g.fighters[c.fighterId])
    const star = mine.find((f) => f.firstName === 'Liam' && f.lastName === 'Stokes') ?? mine[0]
    return { fighter: star.id, name: `${star.firstName} ${star.lastName}` }
  })
  await go(page, '#/dashboard'); await snap(page, W, H, '01-overview', 'Overview')
  await go(page, '#/fighters'); await snap(page, W, H, '02-roster', 'Roster')
  await go(page, `#/fighter/${ids.fighter}`); await snap(page, W, H, '03-fighter-profile', `Fighter profile (${ids.name}) — Overview tab`)
  await page.getByTestId('pf-nav').getByRole('button', { name: 'Career & titles' }).click(); await page.waitForTimeout(700); await snap(page, W, H, '03b-fighter-profile-career-tab', 'Fighter profile — Career & titles tab')
  await go(page, '#/events'); await snap(page, W, H, '04-events', 'Events overview')
  await go(page, '#/finances'); await snap(page, W, H, '08-finances', 'Finances')
  await go(page, '#/matchmaking'); await snap(page, W, H, '09-matchmaking', 'Matchmaking')
  await page.evaluate(() => window.scrollTo(0, 650)); await page.waitForTimeout(400); await snap(page, W, H, '09b-matchmaking-scrolled', 'Matchmaking — scrolled 650px (what currently needs scrolling)')
  await go(page, '#/scouting'); await snap(page, W, H, '10-scouting', 'Scouting')
  await go(page, '#/office'); await snap(page, W, H, '11-office', 'Promoter’s Office')
  await go(page, '#/inbox'); await snap(page, W, H, '12-inbox', 'Inbox')
  await go(page, '#/rankings'); await snap(page, W, H, '13-world-rankings', 'World — Rankings')
  await go(page, '#/media'); await snap(page, W, H, '13b-world-media', 'World — Media (the World section’s first tab)')
  await go(page, '#/settings'); await snap(page, W, H, '14-settings', 'Settings')
  // Fight Night: through the real button on the Overview
  await go(page, '#/dashboard')
  await page.getByRole('button', { name: /Go to the fight/i }).click(); await page.waitForTimeout(2500)
  await page.evaluate(() => document.fonts.ready)
  const state = () => page.evaluate(() => ({ hash: location.hash, bodyClass: document.body.className, sidenav: getComputedStyle(document.querySelector('.sidenav')).display, bottomnav: getComputedStyle(document.querySelector('.bottomnav')).display }))
  const pre = await state()
  notes.push(`Fight page before the bell (tale of the tape): route ${pre.hash}, body class "${pre.bodyClass}", sidebar display=${pre.sidenav}`)
  await snap(page, W, H, '15a-fight-page-before-bell', 'Fight page before the bell (tale of the tape) — still inside the management shell', { sidebarHidden: pre.sidenav === 'none' })
  await page.getByTestId('ring-bell').click(); await page.waitForTimeout(1500)
  notes.push(`After "Ring the bell" on the fight page the app opens the event's night panel at ${await page.evaluate(() => location.hash)}; the bell there starts the live presentation.`)
  await page.getByRole('button', { name: /Ring the bell|^Run:/ }).first().click(); await page.waitForTimeout(3500); await page.evaluate(() => document.fonts.ready)
  const live = await state()
  notes.push(`Fight Night presenter: route ${live.hash}, body class "${live.bodyClass}", sidebar display=${live.sidenav}, bottom bar display=${live.bottomnav}`)
  await snap(page, W, H, '15-fight-night', 'Fight Night — live full-screen presentation', { sidebarHidden: live.sidenav === 'none' })
  await page.waitForTimeout(7000); const later = await state()
  await snap(page, W, H, '15b-fight-night-later', 'Fight Night — a few seconds later', { sidebarHidden: later.sidenav === 'none' })
  await ctx.close()
}

// ---------------------------------------------------------------- 1280 x 800, editable event (a second career: the main one has no event with a card still being built)
{
  const W = 1280, H = 800
  const { ctx, page } = await session(W, H, EVENT)
  await go(page, `#/event/${evMeta.eventId}`)
  await snap(page, W, H, '05-event-fight-card-top', 'Editable event — Fight card tab (top of page)')
  const jump = async (name, file, title) => {
    await page.getByTestId('event-tabs').getByRole('tab', { name }).click(); await page.waitForTimeout(500)
    await page.getByTestId('event-tabs').scrollIntoViewIfNeeded(); await page.evaluate(() => { const t = document.querySelector('[data-testid=event-tabs]'); window.scrollTo(0, window.scrollY + t.getBoundingClientRect().top - 150) }); await page.waitForTimeout(500)
    await snap(page, W, H, file, title)
  }
  await jump('Fight card', '05b-event-fight-card-tab', 'Editable event — Fight card tab (scrolled to the tabs; forecast column at right)')
  await jump('Tickets & promotion', '06-event-tickets-promotion-tab', 'Editable event — Tickets & promotion tab')
  await jump('Broadcast & sponsors', '07-event-broadcast-sponsors-tab', 'Editable event — Broadcast & sponsors tab')
  await ctx.close()
}

// ---------------------------------------------------------------- 1024 x 800
{
  const W = 1024, H = 800
  const { ctx, page } = await session(W, H, MAIN)
  await go(page, '#/dashboard'); await snap(page, W, H, '01-overview', 'Overview')
  await go(page, '#/fighters'); await snap(page, W, H, '02-roster', 'Roster')
  await go(page, '#/events'); await snap(page, W, H, '04-events', 'Events overview')
  await go(page, '#/finances'); await snap(page, W, H, '08-finances', 'Finances')
  await ctx.close()
}
await browser.close()
writeFileSync(`${out}/manifest.json`, JSON.stringify({ shots, notes }, null, 1))
for (const s of shots) console.log(`${s.w}x${s.h} ${s.name} page=${(s.docH / s.vh).toFixed(2)}vp overflowX=${s.overflowX} sidebar=${s.sidebar}`)
console.log(notes.join('\n'))
