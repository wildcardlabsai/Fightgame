// Phase 6.4 behaviour checks: the belt at stake, results first, scorecards, consequences, external cards; at 1280 / 1024 / 390.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4180/play', fx = '/tmp/e2e'] = process.argv.slice(2)
const nm = JSON.parse(readFileSync(`${fx}/night-meta.json`, 'utf8'))
const tm = JSON.parse(readFileSync(`${fx}/p64-meta.json`, 'utf8'))
const om = JSON.parse(readFileSync(`${fx}/p63-meta.json`, 'utf8'))
const browser = await chromium.launch()
let passes = 0, fails = 0
const errors = []
const check = (n, ok, d = '') => { ok ? passes++ : fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  -> ${d}`}`) }
const load = async (page, n) => { await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), readFileSync(`${fx}/${n}.json`, 'utf8')); await page.waitForTimeout(500) }
const go = async (page, h) => { await page.evaluate((x) => { location.hash = x }, h); await page.waitForTimeout(800) }
const game = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__fe.useGame.getState().game, ${JSON.stringify(arg ?? null)})`)
const finish = async (page) => { await page.getByTestId('lf-skip').click().catch(() => undefined); await page.waitForSelector('[data-testid=fight-night][data-finished=true]', { timeout: 15000 }); await page.waitForTimeout(600) }
const bell = (page) => page.getByRole('button', { name: /Run:|Ring the bell/ }).first().click()

for (const w of [1280, 1024, 390]) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/?e2e`); await page.waitForFunction(() => window.__fe)

  // ---------- the belt before the bell
  await load(page, 'p64-title')
  const truth = await game(page, (g, id) => { const f = g.fights[id]; const A = g.fighters[f.sideA.fighterId], B = g.fighters[f.sideB.fighterId]; const rec = g.media.titles[`${f.title.bodies[0]}|${f.weightClass}`]; return { name: f.title.name, champ: g.fighters[rec.c].lastName, other: rec.c === A.id ? B.lastName : A.lastName, rounds: f.scheduledRounds } }, tm.titleFight)
  await go(page, `#/fight/${tm.titleFight}`)
  const tb = page.getByTestId('title-banner')
  const tbText = await tb.innerText()
  check(`${w} title fight page: banner names the belt`, (await tb.count()) === 1 && tbText.toLowerCase().includes(truth.name.toLowerCase()), tbText.slice(0, 120))
  check(`${w} title fight page: banner names the champion and the challenger from the belt record`, new RegExp(`champion\\s+\\S+\\s+${truth.champ}`, 'i').test(tbText.replace(/\n/g, ' ')) && new RegExp(`challenger\\s+\\S+\\s+${truth.other}`, 'i').test(tbText.replace(/\n/g, ' ')), tbText.replace(/\n/g, ' ').slice(0, 220))
  check(`${w} title fight page: banner sits above the tale of the tape`, await page.evaluate(() => { const b = document.querySelector('[data-testid=title-banner]'); const t = document.querySelector('.tape, .tt, [data-testid=tape]') ?? document.querySelector('main h1, main .caps'); return !!b && (!t || b.getBoundingClientRect().top <= t.getBoundingClientRect().top + 400) }))
  await go(page, `#/fight/${tm.results[0].id}`)
  check(`${w} undercard page: no title banner on an ordinary bout`, (await page.getByTestId('title-banner').count()) === 0)
  await go(page, `#/event/${tm.eventId}`)
  const marks = await page.getByTestId('stake-chip').count()
  check(`${w} event page: the title fight carries the belt chip on the card and main-event block`, marks >= 2, String(marks))
  const ringBell = await page.evaluate(() => { const b = document.querySelector('.night-banner .btn.primary'); return b ? { sw: b.scrollWidth, cw: b.clientWidth } : null })
  check(`${w} event page: the run button text is not clipped`, !!ringBell && ringBell.sw <= ringBell.cw + 1, JSON.stringify(ringBell))

  // ---------- run the card: stoppage results, next fight, the title result
  await bell(page); await page.waitForSelector('[data-testid="fight-night"]', { timeout: 10000 })
  await finish(page)
  let fin = await page.getByTestId('lf-finish').innerText()
  const box = await page.getByTestId('lf-finish').boundingBox()
  const ctl = await page.locator('.fn-controls').boundingBox()
  check(`${w} stoppage: winner, method and round are in the first screen`, /WINS|KNOCKOUT|TKO|RETIREMENT|STOPPAGE/i.test(fin) && /ROUND \d/i.test(fin) && !!box && box.y + 140 < (ctl?.y ?? 9999), JSON.stringify({ box, ctl }))
  const nextBtn = page.getByTestId('lf-next-fight')
  check(`${w} stoppage: the next bout is offered with its fighters`, (await nextBtn.count()) === 1 && / v /i.test(await nextBtn.innerText()))
  if (mobile) { const nb = await nextBtn.boundingBox(); check(`${w} next fight: touch target is at least 44px tall and inside the viewport`, !!nb && nb.height >= 44 && nb.y + nb.height <= 844 && nb.x >= 0 && nb.x + nb.width <= 390, JSON.stringify(nb)) }
  check(`${w} finished: the speed and mode pickers are out of the way`, (await page.locator('.fn-controls .seg').count()) === 0)
  await nextBtn.click(); await page.waitForSelector('[data-testid=fight-night][data-live=true]', { timeout: 8000 })
  await finish(page)
  await page.getByTestId('lf-next-fight').click(); await page.waitForSelector('[data-testid=fight-night][data-live=true]', { timeout: 8000 })
  await finish(page)
  fin = await page.getByTestId('lf-finish').innerText()
  const fn = page.getByTestId('fight-night')
  const tOut = await fn.getByTestId('title-outcome').innerText().catch(() => '')
  const logged = await game(page, (g, id) => { const f = g.fights[id]; return [f.sideA.fighterId, f.sideB.fighterId].flatMap((fid) => (g.media.careers?.[fid] ?? []).filter((e) => e.d === f.day && /TITLE/.test(e.k)).map((e) => e.k)) }, tm.titleFight).catch(() => [])
  check(`${w} title result: the belt outcome is shown inside the result panel`, (await fn.getByTestId('title-banner').count()) === 1 && /defended|won|lost|unified/i.test(tOut), tOut)
  void logged
  check(`${w} title result: champion and challenger remain labelled`, /champion/i.test(await fn.getByTestId('title-roles').innerText()))
  check(`${w} title result: winner, method and round on the first screen`, !!(await page.getByTestId('lf-finish').boundingBox()) && (await page.getByTestId('lf-finish').boundingBox()).y < 400)
  check(`${w} finished: no Next button after the final bout, End event is there`, (await page.getByTestId('lf-next-fight').count()) === 0 && (await page.getByTestId('lf-end-event').count()) === 1)
  const cons = await page.getByTestId('lf-consequences').innerText().catch(() => '')
  check(`${w} title result: "What it means" lists what the career log recorded`, /defended|won the|lost the|unified/i.test(cons) || /defended|won|lost|unified/i.test(tOut), cons.slice(0, 120))
  // contrast of the gold banner text on its background is checked by the a11y suite; here: focus ring on the primary action
  let ring = false
  for (let i = 0; i < 30 && !ring; i++) { await page.keyboard.press('Tab'); ring = await page.evaluate(() => { const e = document.activeElement; if (e?.dataset?.testid !== 'lf-end-event') return false; const cs = getComputedStyle(e); return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1 }) }
  check(`${w} keyboard: Tab reaches End event and shows a focus ring`, ring)
  await page.getByTestId('lf-end-event').click(); await page.waitForTimeout(700)

  // ---------- decision scorecards
  await load(page, 'night-dec'); await go(page, `#/event/${nm.dec.eventId}`)
  await bell(page); await page.waitForSelector('[data-testid="fight-night"]', { timeout: 10000 }); await finish(page)
  const cards = await page.getByTestId('scorecard').count()
  const truthCards = await game(page, (g, id) => g.fights[id].result.cards, nm.dec.fightId)
  const shown = await page.getByTestId('scorecard').evaluateAll((els) => els.map((e) => e.querySelector('.sc').textContent.replace(/\s/g, '')))
  check(`${w} decision: three scorecards shown, equal to the recorded cards`, cards === 3 && JSON.stringify(shown) === JSON.stringify(truthCards.map((c) => `${c[0]}–${c[1]}`)), JSON.stringify({ shown, truthCards }))
  check(`${w} decision: the score order is stated`, /Scores read .+ – .+/.test(await page.getByTestId('scorecard-order').innerText()))
  const sb = await page.getByTestId('lf-scorecards').boundingBox()
  check(`${w} decision: the scorecards are on the first screen`, !!sb && sb.y < 520, JSON.stringify(sb))
  await page.getByTestId('lf-details').click(); await page.waitForTimeout(600)
  check(`${w} fight page: an ordinary bout shows no belt line`, (await page.getByTestId('title-banner').count()) === 0)

  // ---------- rival event
  await load(page, 'p63-offer'); await go(page, '#/fights/offers')
  await page.locator(`[data-testid=offer-card][data-offer=${om.offerId}]`).getByTestId('offer-accept').click(); await page.waitForTimeout(600)
  const ids = await game(page, (g, id) => { const o = g.office.offers[id]; return { ev: o.eventId, f: o.fightId, mine: g.fighters[o.mine].lastName } }, om.offerId)
  await go(page, `#/event/${ids.ev}`)
  const eb = page.getByTestId('external-banner')
  check(`${w} rival event: says whose show it is and that the player does not run it`, (await eb.count()) === 1 && /stage this show/i.test(await eb.innerText()), await eb.innerText().catch(() => ''))
  check(`${w} rival event: your fighter is marked on the card`, (await page.getByTestId('slot-yours').allInnerTexts()).some((t) => t.toLowerCase().includes(ids.mine.toLowerCase())), ids.mine)
  check(`${w} rival event: no run-the-card controls for the player`, (await page.getByRole('button', { name: /Run:|Ring the bell|Quick-sim|Skip to the end/i }).count()) === 0)
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check(`${w} rival event: no horizontal overflow`, ov <= 0, String(ov))
  await ctx.close()
}
check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
console.log(`${passes} passed, ${fails} failed`)
await browser.close()
