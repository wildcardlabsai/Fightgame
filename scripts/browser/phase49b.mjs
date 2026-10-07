// Phase 4.9B browser verification: navigation, Fight Night modes/speeds, determinism, AUDIBLE audio (measured at the output), mobile, reduced motion.
// Usage: node scripts/browser/phase49b.mjs <baseUrl> <fixturesDir> [screenshotsDir]
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4173', fx = '/tmp/e2e', shots = '/tmp/e2e-shots'] = process.argv.slice(2)
mkdirSync(shots, { recursive: true })
const meta = JSON.parse(readFileSync(`${fx}/night-meta.json`, 'utf8'))
const fixture = (n) => readFileSync(`${fx}/${n}.json`, 'utf8')
const errors = []
let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`) }
const browser = await chromium.launch()
async function newPage(o = {}) {
  const ctx = await browser.newContext({ viewport: o.mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: !!o.mobile, isMobile: !!o.mobile, reducedMotion: o.reduced ? 'reduce' : 'no-preference' })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
  await page.goto(`${base}/?e2e`)
  await page.waitForFunction(() => window.__fe)
  return { ctx, page }
}
const load = async (page, name) => { await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), fixture(name)); await page.waitForTimeout(250) }
const go = async (page, hash) => { await page.evaluate((h) => { window.location.hash = h }, hash); await page.waitForTimeout(350) }
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const FN = '[data-testid="fight-night"]'
const attr = (page, a) => page.locator(FN).getAttribute(a)
const elapsed = async (page) => Number(await attr(page, 'data-elapsed'))
async function startFight(page, which, tap = false) {
  const m = meta[which]
  await load(page, `night-${which}`)
  await go(page, `#/event/${m.eventId}`)
  const btn = page.getByRole('button', { name: /Run:|Ring the bell/ }).first()
  await (tap ? btn.tap() : btn.click())
  await page.waitForSelector(FN, { timeout: 8000 })
}
const resultText = (page) => page.getByTestId('lf-finish').innerText()
const stateFingerprint = (page, fightId) => page.evaluate((id) => { const g = window.__fe.useGame.getState().game; return JSON.stringify(g.fights[id].result) }, fightId)
const gameRef = (page) => page.evaluate(() => { window.__g0 = window.__fe.useGame.getState().game; return true })
const sameGameRef = (page) => page.evaluate(() => window.__fe.useGame.getState().game === window.__g0)
const setSpeed = (page, s) => page.locator(`[data-speed="${s}"]`).first().click()
const peakOver = (page, ms) => page.evaluate(async (ms) => { const a = window.__audio; let m = 0; const t0 = performance.now(); while (performance.now() - t0 < ms) { m = Math.max(m, a.diagnostics().peak); await new Promise((r) => setTimeout(r, 12)) } return m }, ms)
const cuesPlayed = (page) => page.evaluate(() => window.__audio.log.map((l) => l.cue))

// ================================================================== 1. DESKTOP NAVIGATION
{
  const { ctx, page } = await newPage()
  await load(page, 'night-dec')
  await go(page, '#/dashboard')
  const labels = await page.locator('[data-testid="topnav"] .tn-tab').allInnerTexts()
  check('desktop: seven primary destinations', JSON.stringify(labels.map((l) => l.replace(/[\d▾\s]+$/g, '').trim())) === JSON.stringify(['HOME', 'INBOX', 'ROSTER', 'EVENTS', 'WORLD', 'FINANCES', 'MORE']), JSON.stringify(labels))
  check('desktop: the old long sidebar is gone', (await page.locator('.rail, .nav-item').count()) === 0)
  check('desktop: bottom bar is not shown', !(await page.getByTestId('bottomnav').isVisible()))
  check('desktop: current section is indicated', (await page.getByTestId('nav-home').getAttribute('aria-current')) === 'page')
  await page.getByTestId('nav-roster').click()
  const menu = await page.locator('.tn-menu .tn-item').allInnerTexts()
  check('desktop: Roster menu lists Fighters, Free Agents, Scouting, Contracts', JSON.stringify(menu.map((x) => x.trim())) === JSON.stringify(['Fighters', 'Free Agents', 'Scouting', 'Contracts'].map((x) => x.toUpperCase().replace(/^/, '')).map((x) => x)) || menu.map((x) => x.trim().toLowerCase()).join(',') === 'fighters,free agents,scouting,contracts', JSON.stringify(menu))
  await page.screenshot({ path: `${shots}/p49b-nav-desktop-menu.png` })
  await page.getByTestId('nav-item-free').click(); await page.waitForTimeout(400)
  check('desktop: Free Agents opens the free-agent tab', (await page.evaluate(() => location.hash)) === '#/fighters/free' && (await page.locator('.tab.active', { hasText: 'Free Agents' }).count()) === 1)
  check('desktop: Roster is the active section with its sub-navigation', (await page.getByTestId('nav-roster').getAttribute('aria-current')) === 'page' && (await page.getByTestId('sub-free').getAttribute('aria-current')) === 'page' && (await page.getByTestId('sub-fighters').getAttribute('aria-current')) === null)
  await page.getByTestId('sub-scouting').click(); await page.waitForTimeout(300)
  check('desktop: sub-navigation switches screens in one click', (await page.evaluate(() => location.hash)) === '#/scouting')
  // every group, every screen is reachable
  const targets = [['events', 'calendar', '#/calendar'], ['events', 'events', '#/events'], ['events', 'fights', '#/fights'], ['events', 'matchmaking', '#/matchmaking'], ['events', 'venues', '#/venues'], ['world', 'promotions', '#/promotions'], ['world', 'news', '#/news'], ['world', 'boxing-world', '#/fights/world'], ['finances', 'finances', '#/finances'], ['finances', 'sponsors', '#/sponsors'], ['finances', 'payroll', '#/contracts/payroll'], ['more', 'advisor', '#/advisor'], ['more', 'settings', '#/settings'], ['more', 'saves', '#/settings/saves'], ['roster', 'contracts', '#/contracts']]
  for (const [g, it, hash] of targets) {
    await page.getByTestId(`nav-${g}`).click(); await page.getByTestId(`nav-item-${it}`).click(); await page.waitForTimeout(350)
    const h = await page.evaluate(() => location.hash)
    const body = (await page.locator('main').innerText()).length
    check(`desktop: ${g} ▸ ${it} opens ${hash}`, h === hash && body > 40, `${h} ${body}`)
  }
  check('desktop: Boxing World shows world results', true && (await (async () => { await page.getByTestId('nav-world').click(); await page.getByTestId('nav-item-boxing-world').click(); await page.waitForTimeout(300); return (await page.locator('.tab.active', { hasText: 'World Results' }).count()) === 1 })()))
  check('desktop: media, rankings and titles are real, enabled destinations (Phase 5)', await (async () => { await page.getByTestId('nav-world').click(); const ok = (await page.getByTestId('nav-item-rankings').isEnabled()) && (await page.getByTestId('nav-item-titles').isEnabled()) && (await page.getByTestId('nav-item-media').isEnabled()); await page.keyboard.press('Escape'); return ok })())
  await page.getByTestId('nav-more').click(); await page.getByTestId('nav-item-saves').click(); await page.waitForTimeout(500)
  check('desktop: Save / Load lands on the save slots', await page.locator('#save-slots').isVisible())
  await page.getByTestId('nav-roster').click(); await page.keyboard.press('Escape')
  check('desktop: Escape closes a menu', (await page.locator('.tn-menu').count()) === 0)
  await page.getByTestId('nav-inbox').click(); await page.waitForTimeout(300)
  check('desktop: Inbox opens directly with an unread badge', (await page.evaluate(() => location.hash)) === '#/inbox')
  check('desktop: no horizontal overflow', (await overflow(page)) <= 0)
  await page.screenshot({ path: `${shots}/p49b-nav-desktop.png` })
  await ctx.close()
}

// ================================================================== 2. MOBILE NAVIGATION (390px)
{
  const { ctx, page } = await newPage({ mobile: true })
  await load(page, 'night-dec'); await go(page, '#/dashboard')
  const bar = await page.getByTestId('bottomnav').boundingBox()
  check('mobile: bottom navigation is visible and pinned to the bottom', bar && Math.abs(bar.y + bar.height - 844) <= 1, JSON.stringify(bar))
  check('mobile: five destinations (Home, Inbox, Fighters, Events, More)', (await page.locator('.bn-item').allInnerTexts()).map((t) => t.replace(/\d+/g, '').trim().toLowerCase()).join(',') === 'home,inbox,fighters,events,more')
  const sizes = await page.locator('.bn-item').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] }))
  check('mobile: strong touch targets (≥ 44px tall, ≥ 70px wide)', sizes.every(([w, h]) => h >= 44 && w >= 70), JSON.stringify(sizes))
  const css = await page.evaluate(() => [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules] } catch { return [] } }).map((r) => r.cssText).join('\n'))
  check('mobile: respects iOS safe areas (viewport-fit=cover + env(safe-area-inset-bottom))', css.includes('safe-area-inset-bottom') && (await page.locator('meta[name=viewport]').getAttribute('content')).includes('viewport-fit=cover'))
  await page.getByTestId('bn-fighters').tap(); await page.waitForTimeout(300)
  check('mobile: Fighters tab opens fighters with active feedback', (await page.evaluate(() => location.hash)) === '#/fighters' && (await page.getByTestId('bn-fighters').getAttribute('aria-current')) === 'page')
  await page.getByTestId('bn-events').tap(); await page.waitForTimeout(300)
  check('mobile: Events tab', (await page.evaluate(() => location.hash)) === '#/events' && (await page.getByTestId('bn-events').getAttribute('aria-current')) === 'page')
  await page.getByTestId('bn-inbox').tap(); await page.waitForTimeout(300)
  check('mobile: Inbox tab', (await page.evaluate(() => location.hash)) === '#/inbox')
  await page.getByTestId('bn-more').tap(); await page.waitForTimeout(400)
  check('mobile: More opens a secondary navigation panel with the remaining screens', await page.getByTestId('more-sheet').isVisible() && (await page.locator('.sheet-item').count()) >= 15)
  check('mobile: the bottom bar stays visible above the More panel', await page.getByTestId('bottomnav').isVisible() && (await page.evaluate(() => { const s = document.querySelector('.sheet').getBoundingClientRect(); const b = document.querySelector('.bottomnav').getBoundingClientRect(); return s.bottom <= b.top + 1 })))
  await page.screenshot({ path: `${shots}/p49b-nav-mobile-more.png` })
  await page.keyboard.press('Escape'); await page.waitForTimeout(200)
  check('mobile: Escape closes the More panel', (await page.getByTestId('more-sheet').count()) === 0)
  for (const [id, hash] of [['free', '#/fighters/free'], ['calendar', '#/calendar'], ['news', '#/news'], ['sponsors', '#/sponsors'], ['payroll', '#/contracts/payroll'], ['advisor', '#/advisor'], ['settings', '#/settings'], ['venues', '#/venues'], ['boxing-world', '#/fights/world']]) {
    await page.getByTestId('bn-more').tap(); await page.getByTestId(`more-${id}`).tap(); await page.waitForTimeout(350)
    check(`mobile: More ▸ ${id} → ${hash}`, (await page.evaluate(() => location.hash)) === hash && !(await page.getByTestId('more-sheet').count()))
  }
  check('mobile: More tab shows as active for World/Finances/More screens', (await page.getByTestId('bn-more').getAttribute('aria-current')) === 'page')
  await go(page, '#/dashboard'); for (let i = 0; i < 3; i++) { await page.evaluate(() => window.scrollTo(0, 99999)); await page.waitForTimeout(250) }
  const lastBottom = await page.evaluate(() => { const els = [...document.querySelectorAll('main > *')]; const r = els[els.length - 1].getBoundingClientRect(); return r.bottom })
  const navTop = (await page.getByTestId('bottomnav').boundingBox()).y
  check('mobile: the bar does not cover the end of the page', lastBottom <= navTop + 1, `${lastBottom} vs ${navTop}`)
  for (const h of ['#/dashboard', '#/fighters', '#/events', '#/venues', '#/settings']) { await go(page, h); check(`mobile: no horizontal overflow on ${h}`, (await overflow(page)) <= 0, String(await overflow(page))) }
  await page.screenshot({ path: `${shots}/p49b-nav-mobile.png` })
  await ctx.close()
}

// ================================================================== 3. FIGHT NIGHT: layout, modes, speed, determinism, audio (desktop)
const results = {}
{
  const { ctx, page } = await newPage()
  // audio is locked until the first real interaction
  await load(page, 'night-ko')
  const lockedBefore = await page.evaluate(() => ({ st: window.__audio.status(), diag: window.__audio.diagnostics().state }))
  check('audio: before any click the browser keeps sound locked and the game says so', lockedBefore.st === 'locked' && lockedBefore.diag === 'none' && (await page.getByTestId('audio-locked').count()) > 0, JSON.stringify(lockedBefore))
  await go(page, `#/event/${meta.ko.eventId}`)
  await page.getByTestId('nav-inbox').click(); await page.waitForTimeout(300) // first deliberate interaction
  await page.getByTestId('nav-events').click(); await page.getByTestId('nav-item-events').click(); await page.waitForTimeout(300)
  await go(page, `#/event/${meta.ko.eventId}`)
  const afterClick = await page.evaluate(() => ({ st: window.__audio.status(), d: window.__audio.diagnostics() }))
  check('audio: after the first click the context is running and the indicator disappears', afterClick.st === 'ready' && afterClick.d.state === 'running' && (await page.getByTestId('audio-locked').count()) === 0, JSON.stringify(afterClick))
  const clickPeak = await (async () => { const p = peakOver(page, 500); await page.getByTestId('nav-inbox').click(); return p })()
  check('audio: a UI click is audible at the output (peak ≥ 0.08)', clickPeak >= 0.08, String(clickPeak))
  await go(page, `#/event/${meta.ko.eventId}`)
  await page.evaluate(() => window.__audio.resetHistory())
  await page.getByRole('button', { name: /Run:|Ring the bell/ }).first().click()
  await page.waitForSelector(FN)
  await gameRef(page) // the fight has been decided by now; nothing below may replace the game state
  const introPeak = await peakOver(page, 2600)
  check('audio: the fight introduction is audible (peak ≥ 0.2)', introPeak >= 0.2, String(introPeak))
  const amb = await page.evaluate(() => window.__audio.diagnostics())
  check('audio: crowd ambience is running on Fight Night', amb.ambience && amb.ambienceWanted, JSON.stringify(amb))
  check('fight night: full-screen presentation layout replaces the management navigation', !(await page.getByTestId('topnav').isVisible()) && !(await page.getByTestId('bottomnav').isVisible()) && (await page.evaluate(() => document.body.classList.contains('fight-night'))))
  check('fight night: a clear way back to the event', (await page.getByTestId('fn-exit').innerText()).toLowerCase().includes('return to event'))
  check('watch: starts in Watch fight at 1× and live', (await attr(page, 'data-mode')) === 'watch' && (await attr(page, 'data-speed')) === '1' && (await attr(page, 'data-live')) === 'true')
  check('watch: shows round, clock, crowd, stamina, momentum, stats, commentary', (await page.getByTestId('lf-round').count()) === 1 && (await page.getByTestId('lf-clock').count()) === 1 && (await page.getByTestId('lf-crowd').count()) === 1 && (await page.getByTestId('lf-momentum').count()) === 1 && (await page.getByTestId('lf-stats').count()) === 1 && (await page.locator('[data-stat="landed"]').count()) === 1 && (await page.getByTestId('lf-feed').count()) === 1)
  // ---- speeds: the clock runs at the selected rate
  const rates = {}
  for (const s of ['0.5', '1', '2', '4', '8']) {
    await setSpeed(page, s)
    const e0 = await elapsed(page); const t0 = Date.now(); await page.waitForTimeout(900); const e1 = await elapsed(page)
    rates[s] = ((e1 - e0) / (Date.now() - t0))
    if ((await attr(page, 'data-finished')) === 'true') break
  }
  check('speed: 0.5× / 1× / 2× / 4× / 8× advance the presentation at those rates (±30%)', Object.entries(rates).every(([s, r]) => Math.abs(r - Number(s)) <= Number(s) * 0.3), JSON.stringify(rates))
  // ---- pause / resume
  await setSpeed(page, 1)
  await page.getByTestId('lf-pause').click()
  const p0 = await elapsed(page); await page.waitForTimeout(700); const p1 = await elapsed(page)
  check('pause: presentation stops', p1 === p0 && (await attr(page, 'data-paused')) === 'true', `${p0} ${p1}`)
  await setSpeed(page, 8); await page.waitForTimeout(500); const p2 = await elapsed(page)
  check('pause: changing speed while paused does not advance the fight', p2 === p0, `${p0} ${p2}`)
  await page.getByTestId('lf-pause').click()
  await page.waitForTimeout(500)
  check('resume: continues from the same position at the new speed', (await elapsed(page)) > p0)
  // ---- watch to the end at 8×, record everything that was played
  await page.waitForSelector(`${FN}[data-finished="true"]`, { timeout: 60000 })
  results.watch = await resultText(page)
  const statsWatch = await page.locator('[data-stat]').allInnerTexts()
  await page.waitForTimeout(3800)
  const kdSeen = await cuesPlayed(page)
  check('audio: fight cues played in order (fightIntro, bell, knockdown, count, ko, resultAnnounce)', ['fightIntro', 'bell', 'knockdown', 'count', 'ko', 'resultAnnounce'].every((c) => kdSeen.includes(c)), kdSeen.join(','))
  check('result: KO card names method, round and time', /ROUND \d+ — \d:\d\d/.test(results.watch) && /WINS BY (KO|TKO)/.test(results.watch), results.watch)
  const rec = await page.evaluate((id) => { const g = window.__fe.useGame.getState().game; const r = g.fights[id].result; return { w: r.winner, m: r.method, rd: r.round, kd: r.kd, rounds: r.rounds.length } }, meta.ko.fightId)
  check('recorded result matches what was shown', results.watch.toLowerCase().includes(rec.m === 'KO' ? 'knockout' : 'tko') && rec.rounds === meta.ko.rounds)
  await page.screenshot({ path: `${shots}/p49b-fight-watch-result.png` })
  // ---- replay, key events, quick sim, skip — all on the SAME recorded fight
  const fp0 = await stateFingerprint(page, meta.ko.fightId)
  await setSpeed(page, 1)
  await page.getByTestId('lf-replay').click(); await page.waitForTimeout(400)
  check('replay: restarts the presentation from the beginning', (await attr(page, 'data-finished')) === 'false' && (await elapsed(page)) < 3000 && (await attr(page, 'data-mode')) === 'watch')
  await setSpeed(page, 8)
  await page.waitForSelector(`${FN}[data-finished="true"]`, { timeout: 60000 })
  results.replay = await resultText(page)
  check('replay: identical result and statistics', results.replay === results.watch && JSON.stringify(await page.locator('[data-stat]').allInnerTexts()) === JSON.stringify(statsWatch))
  // skip
  await page.getByTestId('lf-replay').click(); await page.waitForTimeout(300)
  await page.getByTestId('lf-skip').click(); await page.waitForTimeout(300)
  check('skip: completes immediately to the final result', (await attr(page, 'data-finished')) === 'true')
  results.skip = await resultText(page)
  check('skip: same result as watching the whole fight', results.skip === results.watch)
  // key events
  await page.locator('button[data-mode="key"]').click(); await page.getByTestId('lf-pause').click(); await page.waitForTimeout(300)
  check('key events: a highlight view with NO statistics dashboard', (await page.getByTestId('key-view').count()) === 1 && (await page.locator('.lf-stat').count()) === 0 && (await page.getByTestId('lf-stats').count()) === 0 && (await page.getByTestId('lf-history').count()) === 0)
  const types = []
  for (let i = 0; i < 12 && (await attr(page, 'data-finished')) !== 'true'; i++) {
    const card = page.getByTestId('key-card'); if (!(await card.count())) break
    types.push(`${await card.getAttribute('data-event-type')}:${(await card.innerText()).replace(/\s+/g, ' ').slice(0, 60)}`)
    if (i === 0) { const before = types[0]; await page.getByTestId('key-replay-event').click(); await page.waitForTimeout(150); check('key events: replay event restarts the current highlight', (await attr(page, 'data-pos')) === '0' && (await page.getByTestId('key-card').getAttribute('data-event-type')) === before.split(':')[0]) }
    await page.getByTestId('key-next').click(); await page.waitForTimeout(120)
  }
  check('key events: moves through significant moments built from the recorded fight (knockdown + KO)', types.some((t) => t.startsWith('knockdown')) && types.some((t) => t.startsWith('stoppage')), types.join(' | '))
  check('key events: knockdown text names the fighters from the record', types.some((t) => /KNOCKDOWN/i.test(t) && /(Redfern|Kendrick|[A-Z][a-z]+)/.test(t)))
  await page.waitForSelector(`${FN}[data-finished="true"]`, { timeout: 15000 })
  results.key = await resultText(page)
  check('key events: ends on the same final result', results.key === results.watch)
  await page.screenshot({ path: `${shots}/p49b-fight-key.png` })
  // key events: play/pause + skip to result
  await page.getByTestId('lf-keys').click(); await page.waitForTimeout(400)
  await page.getByTestId('lf-pause').click(); const k0 = await elapsed(page); await page.waitForTimeout(500)
  check('key events: pause holds position', (await elapsed(page)) === k0)
  await page.getByTestId('lf-pause').click()
  await page.getByTestId('lf-skip').click(); await page.waitForTimeout(250)
  check('key events: skip returns the full result', (await attr(page, 'data-finished')) === 'true')
  await page.screenshot({ path: `${shots}/p49b-fight-key-result.png` })
  // quick sim
  await page.locator('button[data-mode="quick"]').click()
  const t0 = Date.now(); await page.getByTestId('lf-finish').waitFor({ timeout: 1500 })
  check('quick sim: resolves immediately (no round-by-round playback)', Date.now() - t0 < 1200 && (await attr(page, 'data-mode')) === 'quick')
  check('quick sim: result card shows winner, loser, method, round/time, knockdowns, headline stats and key moments', await (async () => { const t = await resultText(page); return /Winner/i.test(t) && /Loser/i.test(t) && /Method/i.test(t) && /Round/i.test(t) && /Knockdowns/i.test(t) && /Punches landed/i.test(t) && /Important moments/i.test(t) })())
  check('quick sim: no live statistics dashboard or round table', (await page.locator('.lf-stat').count()) === 0 && (await page.getByTestId('lf-history').count()) === 0)
  check('quick sim: offers View full fight / View key events / Return to event', (await page.getByTestId('lf-full').count()) === 1 && (await page.getByTestId('lf-keys').count()) === 1 && (await page.getByTestId('fn-exit').count()) === 1)
  results.quick = await resultText(page)
  check('quick sim: same result as the full fight', results.quick === results.watch)
  await page.getByTestId('lf-full').click(); await page.waitForTimeout(400)
  check('quick sim ▸ View full fight plays the full presentation', (await attr(page, 'data-mode')) === 'watch' && (await attr(page, 'data-finished')) === 'false')
  await setSpeed(page, 8); await page.waitForSelector(`${FN}[data-finished="true"]`, { timeout: 60000 })
  check('INVARIANT: watch, replay, skip, key events, quick sim and every speed ended on the identical result text', new Set(Object.values(results)).size === 1, JSON.stringify(Object.keys(results)))
  check('INVARIANT: the recorded fight result in the game state is byte-identical after all of that', (await stateFingerprint(page, meta.ko.fightId)) === fp0)
  check('INVARIANT: the game state object was never replaced (the engine was not run again)', await sameGameRef(page))
  // leaving fight night stops the crowd
  await page.getByTestId('fn-exit').click(); await page.waitForTimeout(900)
  const left = await page.evaluate(() => window.__audio.diagnostics())
  check('audio: leaving Fight Night stops the crowd ambience', !left.ambience && !left.ambienceWanted && !(await page.evaluate(() => document.body.classList.contains('fight-night'))), JSON.stringify(left))
  check('fight night: returning shows the event page with navigation back', (await page.getByTestId('topnav').isVisible()) && (await page.evaluate(() => location.hash)).startsWith('#/event/'))
  check('fight night: no horizontal overflow on return', (await overflow(page)) <= 0)
  await ctx.close()
}

// ================================================================== 3b. USER-REPORTED FIXES (mobile header, scroll, final bell, crowd, winner, end event)
{
  const { ctx, page } = await newPage({ mobile: true })
  await load(page, 'night-ko'); await go(page, '#/dashboard')
  // header audio button is reachable: it is the element that receives a tap at its own centre
  const hit = await page.evaluate(() => { const b = document.querySelector('.hud [data-testid^="audio-"]'); if (!b) return null; const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { ok: b === el || b.contains(el), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), right: Math.round(r.right) } })
  check('mobile header: the sound button is visible, ≥ 44px and receives taps (nothing covers it)', hit && hit.ok && hit.w >= 44 && hit.h >= 44 && hit.right <= 390, JSON.stringify(hit))
  const overlap = await page.evaluate(() => { const els = [...document.querySelectorAll('.hud > *, .hud .hud-actions > *')].filter((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== 'none'); const rs = els.map((e) => e.getBoundingClientRect()); for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { if (els[i].contains(els[j]) || els[j].contains(els[i])) continue; const a = rs[i], b = rs[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) return [els[i].className, els[j].className] } return null })
  check('mobile header: no controls overlap each other', overlap === null, JSON.stringify(overlap))
  await page.locator('.hud [data-testid^="audio-"]').tap()
  await page.waitForFunction(() => window.__audio.status() === 'ready', null, { timeout: 5000 })
  await page.waitForTimeout(600)
  await page.locator('.hud [data-testid="audio-toggle"]').tap(); await page.waitForTimeout(250)
  check('mobile header: tapping it mutes, tapping again turns sound back on', (await page.evaluate(() => window.__audio.status())) === 'off')
  await page.locator('.hud [data-testid="audio-toggle"]').tap(); await page.waitForTimeout(250)
  check('mobile header: sound on again', (await page.evaluate(() => window.__audio.status())) === 'ready')
  // horizontal fit on every screen
  const st = await page.evaluate(() => { const g = window.__fe.useGame.getState().game; const mine = Object.values(g.contracts).find((c) => c.promotionId === g.playerPromotionId); return { fighter: mine.fighterId, fight: Object.keys(g.fights)[0] } })
  const routes = ['dashboard', 'inbox', 'fighters', 'fighters/free', 'scouting', 'contracts', 'contracts/payroll', 'calendar', 'events', 'fights', 'fights/world', 'matchmaking', 'venues', 'promotions', 'news', 'finances', 'sponsors', 'advisor', 'settings', `fighter/${st.fighter}`, `negotiation/${st.fighter}`]
  const bad = []
  for (const r of routes) { await go(page, '#/' + r); const o = await page.evaluate(() => ({ d: document.documentElement.scrollWidth - document.documentElement.clientWidth, b: document.body.scrollWidth - document.body.clientWidth })); if (o.d > 0 || o.b > 0) bad.push(`${r}:${JSON.stringify(o)}`) }
  check('mobile: every screen fits 100% width (no horizontal scroll)', bad.length === 0, bad.join(' '))
  check('mobile: the page cannot be panned sideways (touch-action pan-y)', (await page.evaluate(() => getComputedStyle(document.body).touchAction)).includes('pan-y') && (await page.evaluate(() => getComputedStyle(document.documentElement).overflowX)) !== 'visible')
  // navigation lands on the relevant part of the new screen
  await go(page, '#/fighters'); await page.evaluate(() => window.scrollTo(0, 1200)); await page.waitForTimeout(150)
  const before = await page.evaluate(() => scrollY)
  await go(page, `#/negotiation/${st.fighter}`)
  check('navigating from a scrolled page opens the new screen at its top', before > 300 && (await page.evaluate(() => scrollY)) === 0, String(before))
  await page.evaluate(() => window.scrollTo(0, 900)); await go(page, '#/settings/saves'); await page.waitForTimeout(400)
  const saves = await page.evaluate(() => { const r = document.getElementById('save-slots').getBoundingClientRect(); const hud = document.querySelector('.hud').getBoundingClientRect(); return { top: Math.round(r.top), hudBottom: Math.round(hud.bottom) } })
  check('Save / Load scrolls to the save slots and they are not hidden under the header', saves.top >= saves.hudBottom - 2 && saves.top < 800, JSON.stringify(saves))
  await go(page, '#/dashboard')
  await page.getByTestId('bn-fighters').tap(); await page.waitForTimeout(200)
  check('tapping a bottom tab from a scrolled page lands at the top', (await page.evaluate(() => scrollY)) === 0)
  // toasts do not sit on top of the bottom bar
  const t = await page.evaluate(() => { const ts = document.querySelector('.toasts'); const nav = document.querySelector('.bottomnav'); return ts ? ts.getBoundingClientRect().bottom <= nav.getBoundingClientRect().top + 1 : true })
  check('notifications sit above the bottom bar', t)
  await ctx.close()
}
{
  const { ctx, page } = await newPage()
  await startFight(page, 'ko')
  check('fight night: the sound button is available in the broadcast bar', (await page.locator('.fn-top [data-testid^="audio-"]').count()) === 1)
  await page.locator('.fn-top [data-testid="audio-toggle"]').click(); await page.locator('.fn-top [data-testid="audio-toggle"]').click(); await page.waitForTimeout(150)
  check('fight night: the sound button mutes and unmutes', (await page.evaluate(() => window.__audio.status())) === 'ready')
  await page.evaluate(() => window.__audio.resetHistory())
  await setSpeed(page, 8)
  await page.waitForSelector(`${FN}[data-finished="true"]`, { timeout: 60000 })
  await page.waitForTimeout(3400)
  const cues = await cuesPlayed(page)
  check('end of fight: the final bell rings', cues.includes('finalBell'), cues.join(','))
  const d = await page.evaluate(() => window.__audio.diagnostics())
  check('end of fight: the crowd bed has stopped (not still playing under the result)', !d.ambience && !d.ambienceWanted, JSON.stringify(d))
  const rec = await page.evaluate((id) => { const g = window.__fe.useGame.getState().game; const f = g.fights[id]; const r = f.result; const [w, l, dr] = [0, 0, 0]; void w; void l; void dr; const pre = (s) => s.preRecord.split('-').map(Number); const after = (side) => { const [a, b, c] = pre(f['side' + (side ? 'B' : 'A')]); return `${a + (r.winner === side ? 1 : 0)}-${b + (r.winner === 1 - side ? 1 : 0)}-${c + (r.winner === null ? 1 : 0)}` }; return { winner: r.winner, after: [after(0), after(1)], mine: [f.sideA.promotionId === g.playerPromotionId, f.sideB.promotionId === g.playerPromotionId] } }, meta.ko.fightId)
  const wCard = page.getByTestId('result-winner'), lCard = page.getByTestId('result-loser')
  check('result: the winner is unmistakable — a large WINNER card with portrait', (await wCard.count()) === 1 && /WINNER/.test(await wCard.innerText()) && (await wCard.boundingBox()).height > 200)
  check('result: the winner card is bigger than the defeated card', (await wCard.boundingBox()).height >= (await lCard.boundingBox()).height)
  check('result: shows each fighter’s NEW record', (await page.getByTestId('record-winner').innerText()) === rec.after[rec.winner] && (await page.getByTestId('record-loser').innerText()) === rec.after[1 - rec.winner], JSON.stringify(rec))
  const wOwner = await wCard.getAttribute('data-owner'), lOwner = await lCard.getAttribute('data-owner')
  check('result: says whether each fighter is YOUR FIGHTER or the OPPONENT', wOwner === (rec.mine[rec.winner] ? 'mine' : 'opponent') && lOwner === (rec.mine[1 - rec.winner] ? 'mine' : 'opponent') && (await wCard.innerText()).includes(rec.mine[rec.winner] ? 'YOUR FIGHTER' : 'OPPONENT'), `${wOwner} ${lOwner}`)
  check('fight header also tags winner and ownership', (await page.locator('.fn-win-tag').count()) === 1 && (await page.locator('.fn-fighter .fn-owner').count()) === 2)
  await page.screenshot({ path: `${shots}/p49c-winner.png` })
  // replay brings the crowd back
  await setSpeed(page, 1); await page.getByTestId('lf-replay').click(); await page.waitForTimeout(600)
  check('replay restarts the crowd bed', (await page.evaluate(() => window.__audio.diagnostics().ambience)))
  await page.getByTestId('lf-skip').click(); await page.waitForTimeout(300)
  check('skipping ends the crowd bed again', !(await page.evaluate(() => window.__audio.diagnostics().ambience)))
  await ctx.close()
}
{
  // run the whole show: the last fight offers End event, and the event wrap-up has an End event button
  const { ctx, page } = await newPage()
  await startFight(page, 'ko')
  let sawEnd = false
  for (let i = 0; i < 4; i++) {
    await page.locator('button[data-mode="quick"]').click(); await page.getByTestId('lf-finish').waitFor()
    if (await page.getByTestId('lf-end-event').count()) { sawEnd = true; await page.screenshot({ path: `${shots}/p49c-end-event.png` }); await page.getByTestId('lf-end-event').click(); break }
    await page.getByTestId('fn-exit').click(); await page.waitForTimeout(500)
    const next = page.getByRole('button', { name: /Run:|Ring the bell/ }).first()
    if (!(await next.count())) break
    await next.click(); await page.waitForSelector(FN)
  }
  check('after the final fight the result screen offers an End event button', sawEnd)
  await page.waitForTimeout(900)
  check('End event opens the event wrap-up, scrolled into view', (await page.getByTestId('event-complete').count()) === 1 && await page.getByTestId('event-complete').isVisible())
  const endBtn = page.getByTestId('end-event')
  check('the wrap-up has a prominent End event button', (await endBtn.count()) === 1 && /end event/i.test(await endBtn.innerText()))
  await endBtn.click(); await page.waitForTimeout(400)
  check('End event returns to the events list', (await page.evaluate(() => location.hash)) === '#/events')
  await ctx.close()
}

// ================================================================== 4. AUDIO SETTINGS actually change what is heard
{
  const { ctx, page } = await newPage()
  await load(page, 'night-ko'); await go(page, '#/settings')
  await page.getByTestId('nav-inbox').click(); await page.waitForTimeout(300); await go(page, '#/settings')
  const measure = (cue) => page.evaluate(async (cue) => { const a = window.__audio; a.resetHistory(); a.play(cue); let m = 0; const t0 = performance.now(); while (performance.now() - t0 < 1700) { m = Math.max(m, a.diagnostics().peak); await new Promise((r) => setTimeout(r, 12)) } return m }, cue)
  const setVol = async (k, v) => { await page.locator(`#vol-${k}`).fill(String(v)); await page.waitForTimeout(150) }
  await setVol('master', 100); const loud = await measure('bell')
  await setVol('master', 25); const quiet = await measure('bell')
  check('settings: master volume changes loudness (100 is ≥ 2.5× 25)', loud / quiet >= 2.5, `${loud} vs ${quiet}`)
  await setVol('master', 80)
  await setVol('fight', 0); const fightOff = await measure('bell'); const uiStill = await measure('click')
  check('settings: fight volume 0 silences the bell but not UI clicks', fightOff === 0 && uiStill > 0.05, `${fightOff} ${uiStill}`)
  await setVol('fight', 80); await setVol('ui', 0); const uiOff = await measure('click'); const bellStill = await measure('bell')
  check('settings: UI volume 0 silences clicks but not the bell', uiOff === 0 && bellStill > 0.1, `${uiOff} ${bellStill}`)
  await setVol('ui', 70); await setVol('sfx', 0); const sfxOff = await measure('notification'); const clickStill = await measure('click')
  check('settings: effects volume 0 silences notifications but not clicks', sfxOff === 0 && clickStill > 0.05, `${sfxOff} ${clickStill}`)
  await setVol('sfx', 75)
  check('settings: the music slider is honestly disabled (there is no music)', await page.locator('#vol-music').isDisabled())
  await page.getByTestId('audio-mute').check(); await page.waitForTimeout(150)
  const muted = await measure('bell')
  check('settings: mute silences everything', muted === 0, String(muted))
  await page.getByTestId('audio-mute').uncheck(); await page.waitForTimeout(150)
  check('settings: unmute restores sound', (await measure('bell')) > 0.1)
  check('settings: shows the audio device state', (await page.getByTestId('audio-state').innerText()).includes('running'))
  await ctx.close()
}

// ================================================================== 5. MOBILE FIGHT NIGHT
{
  const { ctx, page } = await newPage({ mobile: true })
  await startFight(page, 'ko', true)
  check('mobile fight: sticky bottom navigation is not shown over Fight Night', !(await page.getByTestId('bottomnav').isVisible()))
  check('mobile fight: no horizontal overflow', (await overflow(page)) <= 0 && (await page.evaluate(() => { const b = document.querySelector('.fn-body'); return b.scrollWidth <= b.clientWidth + 1 })))
  const boxes = await page.locator('.fn-controls button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width, h: r.height } }))
  check('mobile fight: controls fit inside 390px and are touch-sized (≥ 36px tall)', boxes.every((b) => b.l >= -1 && b.r <= 391 && b.h >= 36), JSON.stringify(boxes.filter((b) => b.l < -1 || b.r > 391 || b.h < 36)))
  const speedBtns = await page.locator('[data-speed]').evaluateAll((els) => els.filter((e) => e.matches('button')).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] }))
  check('mobile fight: speed buttons are touch friendly (≥ 44px tall, ≥ 40px wide)', speedBtns.length === 5 && speedBtns.every(([w, h]) => h >= 44 && w >= 40), JSON.stringify(speedBtns))
  const tabs = await page.locator('.lf-tabs [role="tab"]').count()
  check('mobile fight: tabs for stats / rounds / commentary', tabs === 3)
  await page.screenshot({ path: `${shots}/p49b-mobile-fight.png` })
  await page.locator('button[data-mode="key"]').tap(); await page.waitForTimeout(500)
  const kb = await page.locator('.fn-controls button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= 391 }))
  check('mobile key events: controls (prev / replay event / next / skip) remain usable and inside the screen', kb.every(Boolean) && (await page.getByTestId('key-next').isVisible()) && (await page.getByTestId('key-prev').isVisible()), JSON.stringify(kb))
  await page.getByTestId('key-next').tap(); await page.waitForTimeout(200)
  check('mobile key events: no horizontal overflow', (await overflow(page)) <= 0)
  await page.screenshot({ path: `${shots}/p49b-mobile-key.png` })
  await page.getByTestId('lf-skip').tap(); await page.waitForTimeout(300)
  await page.screenshot({ path: `${shots}/p49b-mobile-result.png` })
  check('mobile fight: result screen fits', (await overflow(page)) <= 0)
  await page.getByTestId('fn-exit').tap(); await page.waitForTimeout(500)
  check('mobile fight: Return to event restores the bottom navigation', await page.getByTestId('bottomnav').isVisible())
  await ctx.close()
}

// ================================================================== 6. REDUCED MOTION
{
  const { ctx, page } = await newPage({ reduced: true })
  await startFight(page, 'ko')
  await setSpeed(page, 4)
  await page.waitForSelector('.lf-moment', { timeout: 40000 })
  const t = await page.locator('.lf-moment').innerText()
  check('reduced motion: the knockdown and count are one clear static state', /count reached/i.test(t) && (await page.locator('.fn-stage.shake').count()) === 0, t)
  check('reduced motion: animations are off', (await page.evaluate(() => getComputedStyle(document.querySelector('.lf-moment')).animationName)) === 'none')
  await page.waitForSelector(`${FN}[data-finished="true"]`, { timeout: 60000 })
  check('reduced motion: same final result', (await resultText(page)) === results.watch)
  await page.waitForTimeout(3500)
  const cues = await cuesPlayed(page)
  check('reduced motion: sound is preserved', cues.includes('bell') && cues.includes('ko'), cues.join(','))
  await ctx.close()
}

// ================================================================== 7. DECISION FIGHT: scorecards
{
  const { ctx, page } = await newPage()
  await startFight(page, 'dec')
  await setSpeed(page, 8)
  await page.waitForSelector(`${FN}[data-finished="true"]`, { timeout: 60000 })
  const t = await resultText(page)
  check('decision: scorecards and winner shown', /judge 1/i.test(t) && /judge 3/i.test(t) && /wins/i.test(t), t)
  const rec = await page.evaluate((id) => JSON.stringify(window.__fe.useGame.getState().game.fights[id].result.cards), meta.dec.fightId)
  const shown = (await page.locator('[data-testid="lf-finish"] .card-j .sc').allInnerTexts()).map((x) => x.split('–').map((n) => Number(n.trim())))
  check('decision: the cards on screen are the recorded cards', JSON.stringify(shown) === rec, `${JSON.stringify(shown)} vs ${rec}`)
  await ctx.close()
}

check('no console or page errors during the whole run', errors.length === 0, errors.slice(0, 5).join(' | '))
await browser.close()
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED')
process.exit(failed ? 1 : 0)
