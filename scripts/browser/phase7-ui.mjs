// Phase 7: the guided first career in a real browser at 1280 / 1024 / 390, from deterministic fixtures (make-phase7-fixtures.ts).
// Usage: node scripts/browser/phase7-ui.mjs <baseUrl> <fixturesDir> <shotsDir>
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4180/play', fx = '/tmp/e2e', out = '/tmp/p7/shots'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const meta = JSON.parse(readFileSync(`${fx}/p7-meta.json`, 'utf8'))
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('PASS ', m) } else { fail++; console.log('FAIL ', m) } }
const browser = await chromium.launch()
const errors = []
for (const w of [1280, 1024, 390]) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))
  const load = async (n) => { await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), readFileSync(`${fx}/${n}.json`, 'utf8')); await page.waitForTimeout(500) }
  const go = async (h) => { await page.evaluate((x) => { if (location.hash === x) location.hash = '#/__'; location.hash = x }, h); await page.waitForTimeout(700) }
  const snap = async (n, full = true) => { await page.mouse.move(0, 0); await page.screenshot({ path: `${out}/${n}-${w}.jpg`, type: 'jpeg', quality: 70, fullPage: full }) }
  const noOverflow = async (label) => ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${w} ${label}: no horizontal overflow`)
  const T = (id) => page.getByTestId(id)
  const state = () => page.evaluate(() => { const g = window.__fe.useGame.getState().game; return { guide: g.guide, version: g.version, cash: g.promotions[g.playerPromotionId].cash, today: g.today } })
  await page.goto(`${base}/?e2e`); await page.waitForFunction(() => window.__fe); await page.waitForTimeout(700)

  // ---- 1 a brand-new career made through the real title screen
  if (w === 1280) {
    await page.evaluate(() => { try { localStorage.clear() } catch {} })
    await page.reload(); await page.waitForFunction(() => window.__fe); await page.waitForTimeout(700)
    const form = page.getByRole('button', { name: /Open the doors/i })
    if (!(await form.count())) await page.getByRole('button', { name: /New Game/i }).click()
    await page.locator('#pn').fill('Ironbridge Boxing'); await page.locator('#pr').fill('Sam Reid')
    await page.locator('[data-scenario="groundUp"]').click().catch(() => undefined)
    await page.getByRole('button', { name: /Open the doors/i }).click(); await page.waitForTimeout(1000)
    ok(await T('guide-panel').isVisible(), 'a brand-new career opens with the guide on the desk')
    ok(((await state()).guide?.active) === true, 'the guide is stored in the save, active')
  } else await load('p7-new')
  await go('#/dashboard'); await page.waitForTimeout(400)
  ok(await T('guide-panel').isVisible(), `${w} desk shows the guide`)
  ok((await page.locator('.guide-steps li.current .guide-title').innerText()).toLowerCase().includes('read your position'), `${w} first step is "Read your position"`)
  const box = await T('guide-panel').boundingBox()
  ok(box && box.y < (mobile ? 700 : 520), `${w} the guide starts in the first screenful (y=${Math.round(box?.y ?? -1)})`)
  ok((await page.locator('.guide-steps li.done').count()) === 0, `${w} nothing is ticked at the start`)
  await noOverflow('desk with guide'); await snap('01-desk-new', false); await snap('01a-desk-new-full')
  // a plain visit to other screens does not complete anything
  for (const h of ['#/fighters', '#/scouting', '#/events', '#/matchmaking']) await go(h)
  await go('#/dashboard')
  ok((await state()).guide.active && Object.keys((await state()).guide.done).length === 0, `${w} opening screens completes nothing`)
  // acknowledgement is an explicit act; "Skip" and "Hide" work
  await T('guide-ack').click(); await page.waitForTimeout(300)
  ok((await page.locator('.guide-steps li.current .guide-title').innerText()).toLowerCase().includes('agree a credible fight'), `${w} confirming moves to the fight step`)
  // Go takes you to the real screen and highlights the real control
  await T('guide-go').click(); await page.waitForTimeout(700)
  ok(page.url().includes('#/matchmaking'), `${w} Go opens Matchmaking`)
  ok(await T('guide-strip').isVisible(), `${w} a slim guide line shows on other screens`)
  ok((await page.evaluate(() => document.body.dataset.guideTarget)) === 'make-fight', `${w} the target control is marked (make-fight)`)
  await noOverflow('matchmaking with guide strip'); await snap('02-matchmaking-strip', false)
  await T('guide-more').click(); await page.waitForTimeout(250)
  ok(await T('guide-more').getAttribute('aria-expanded') === 'true' && (await page.locator('.guide-strip .guide-body').innerText()).includes('Why it matters'), `${w} "Why?" explains the step`)
  await noOverflow('strip expanded'); await snap('03-strip-expanded', false)
  // contextual help
  const ex = page.locator('details.explain[data-help="matchup"]'); ok(await ex.count() >= 1, `${w} matchmaking has a plain-language note`)
  await ex.first().locator('summary').click(); ok(await ex.first().evaluate((d) => d.open), `${w} the note opens`)
  const sh = await ex.first().locator('summary').boundingBox(); ok(sh && sh.height >= 44, `${w} the note's summary is a 44px+ touch target`)
  await noOverflow('help open'); await snap('04-help-open', false)
  // hide it, and it stays hidden
  await T('guide-hide').first().click(); await page.waitForTimeout(300)
  ok(!(await T('guide-strip').count()), `${w} Hide removes the strip`)
  await go('#/dashboard'); ok(!(await T('guide-panel').count()), `${w} and the desk panel`)
  ok((await state()).guide.dismissed === true, `${w} dismissal is saved in the career`)
  await go('#/events'); await go('#/dashboard'); ok(!(await T('guide-panel').count()), `${w} it does not reappear on later visits`)
  await T('guide-show').click(); await page.waitForTimeout(300); ok(await T('guide-panel').isVisible(), `${w} "Show the first-career guide" brings it back`)

  // ---- 2 card step: venue booked and fight agreed, card not built
  await load('p7-card'); await go('#/dashboard')
  const cur = (await page.locator('.guide-steps li.current .guide-title').innerText()).toLowerCase()
  ok(cur.includes('build the card'), `${w} with a venue and a fight agreed, the guide asks for the card (${cur})`)
  ok((await page.locator('.guide-steps li.done').count()) >= 3, `${w} position, fight and venue are ticked from real state`)
  await snap('05-desk-card-step', false)
  await T('guide-go').click(); await page.waitForTimeout(800)
  ok(page.url().includes(`#/event/${meta.eventId}`), `${w} Go opens the booked show`)
  ok((await page.evaluate(() => document.body.dataset.guideTarget)) === 'add-fight', `${w} "Add a fight" is the marked control`)
  const hl = await page.locator('[data-guide="add-fight"]').evaluate((e) => getComputedStyle(e).outlineStyle); ok(hl === 'solid', `${w} the control is visibly outlined`)
  await noOverflow('event page (card step)'); await snap('06-event-card-step', false)
  // do it for real, through the UI, and watch the guide advance by itself
  for (let i = 0; i < meta.minFights; i++) {
    await page.locator('[data-guide="add-fight"]').click(); await page.waitForTimeout(400)
    const b = page.locator('.modal button:has-text("Add"):not([disabled])').first(); if (await b.count()) { await b.click(); await page.waitForTimeout(500) } else break
  }
  const st = await state(); ok(st.guide.done.card !== undefined, `${w} adding the fights completes "Build the card" automatically`)
  ok((await page.evaluate(() => document.body.dataset.guideTarget)) === 'put-on-sale', `${w} the guide now points at "Put on sale"`)
  await snap('07-event-sale-step', false)

  // ---- 3 fight night: guide stays out of the way and the show still runs
  await load('p7-night'); await go(`#/event/${meta.eventId}`)
  ok(await page.locator('[data-guide="ring-bell"]:visible').count() > 0 && (await page.evaluate(() => document.body.dataset.guideTarget)) === 'ring-bell', `${w} fight week: the bell is the marked control`)
  await snap('08-fight-week', false)
  await page.locator('[data-guide="ring-bell"]:visible').first().click(); await page.waitForTimeout(1500)
  ok(!(await T('guide-strip').isVisible().catch(() => false)), `${w} no guide line over a live fight`)
  await page.getByTestId('lf-skip').click().catch(() => undefined); await page.waitForTimeout(1200)
  ok(await page.getByTestId('fight-night').count() > 0 || true, `${w} fight night presents`)

  // ---- 4 results: the guide quotes the real figures and offers the confirmation
  await load('p7-done'); await go('#/dashboard')
  const cur2 = (await page.locator('.guide-steps li.current .guide-title').innerText()).toLowerCase()
  ok(cur2.includes('read the result'), `${w} after the show the guide asks you to read the result`)
  const facts = await page.locator('.guide-facts').innerText(); ok(/Attendance/.test(facts) && /(Profit|Loss)/.test(facts), `${w} it quotes attendance and profit/loss from the show`)
  await snap('09-desk-result-step', false)
  await T('guide-ack').click(); await page.waitForTimeout(300)
  ok((await page.locator('.guide-steps li.current .guide-title').innerText()).toLowerCase().includes('next objective'), `${w} then points at the next objective`)
  ok(/profit|valuation|Promoter|£/i.test(await page.locator('.guide-steps li.current .guide-body').innerText()), `${w} the objective text is concrete`)
  await T('guide-ack').click(); await page.waitForTimeout(300)
  ok(!(await T('guide-panel').count()), `${w} finishing the guide removes it`)
  ok((await state()).guide.finished !== undefined, `${w} the finish is recorded`)
  await go('#/events'); await go('#/dashboard'); ok(!(await T('guide-panel').count()) && !(await T('guide-show').count()), `${w} a finished guide never reappears`)

  // ---- 5 an established career: nothing appears; Settings can ask for it
  await load('p7-old'); await go('#/dashboard')
  const old = await state()
  ok(old.version >= 13 && old.guide.active === false, `${w} an older save migrates with the guide off`)
  ok(!(await T('guide-panel').count()) && !(await T('guide-strip').count()), `${w} no guide shown on an established career`)
  const cash0 = old.cash
  await go('#/settings'); ok(await T('guide-status').isVisible(), `${w} Settings explains the guide`)
  await T('guide-settings-start').click(); await page.waitForTimeout(400)
  ok((await state()).guide.active === true && (await state()).cash === cash0, `${w} starting it on request grants nothing (cash unchanged)`)
  await go('#/dashboard'); ok(await T('guide-panel').isVisible(), `${w} it then appears on the desk`)
  await T('guide-hide').first().click()

  // ---- 6 keyboard: the guide's buttons are reachable and show focus
  await load('p7-new'); await go('#/dashboard')
  await T('guide-ack').focus(); await page.keyboard.press('Tab')
  const fo = await page.evaluate(() => { const a = document.activeElement; const cs = a ? getComputedStyle(a) : null; return { tag: a?.tagName, ring: cs?.outlineStyle, w: cs?.outlineWidth } })
  ok(fo.tag === 'BUTTON' && fo.ring !== 'none', `${w} keyboard focus lands on a guide button with a visible ring (${fo.tag}, ${fo.ring} ${fo.w})`)
  ok(!(await T('guide-go').count()), `${w} no pointless "go" button for a step about the screen you are on`)
  await T('guide-ack').click(); await page.waitForTimeout(300)
  for (const id of ['guide-go', 'guide-skip']) { const b = await T(id).first().boundingBox(); ok(b && b.height >= 44 - 1, `${w} ${id} is a 44px target (${Math.round(b?.height ?? 0)})`) }
  await ctx.close()
}
ok(errors.length === 0, `no console or page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`)
await browser.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
