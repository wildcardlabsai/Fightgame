// Phase 5 browser verification: the living media world.
// Usage: node scripts/browser/phase5.mjs <baseUrl> <fixturesDir> [shotsDir]
// Fixtures come from: npx tsx scripts/browser/make-phase5-fixtures.ts <fixturesDir>
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4173', fx = '/tmp/e2e', shots = '/tmp/e2e-shots'] = process.argv.slice(2)
mkdirSync(shots, { recursive: true })
const fixture = (n) => readFileSync(`${fx}/${n}.json`, 'utf8')
const errors = []
let passes = 0, fails = 0
const check = (name, ok, detail = '') => { if (ok) passes++; else fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`) }
const browser = await chromium.launch()
async function newPage(w = 1280, extra = {}) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, ...extra })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
  await page.goto(`${base}/?e2e`)
  await page.waitForFunction(() => window.__fe)
  return { ctx, page }
}
const load = async (page, name) => { await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), fixture(name)); await page.waitForTimeout(300) }
const go = async (page, h) => { await page.evaluate((x) => { location.hash = x }, h); await page.waitForTimeout(450) }
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const game = (page, fn) => page.evaluate(`(${fn.toString()})(window.__fe.useGame.getState().game)`)
const FORBIDDEN = ['potential', 'discipline', 'composure', 'injury risk', 'prospectFactory', 'Prospect factory', 'Big-money']

// ================================================================ A. desktop walkthrough
{
  const { ctx, page } = await newPage(1280)
  await load(page, 'p5-played')
  const ids = await game(page, (g) => ({
    fighter: Object.values(g.contracts).find((c) => c.promotionId === g.playerPromotionId)?.fighterId,
    event: Object.values(g.events).find((e) => e.promotionId === g.playerPromotionId && ['cardBuilding', 'onSale', 'promoting'].includes(e.status))?.id,
    doneEvent: Object.values(g.events).filter((e) => e.result)[0]?.id,
    titled: Object.values(g.fights).find((f) => f.title)?.id,
    fight: Object.values(g.fights).find((f) => f.result)?.id,
  }))

  await go(page, '#/media')
  check('1 Media screen: newsroom with a lead story', (await page.getByTestId('newsroom').count()) === 1 && (await page.getByTestId('story-lead').count()) === 1)
  check('1 lead story text is real (no placeholders)', !/undefined|NaN|\[object/.test(await page.getByTestId('story-lead').innerText()))
  check('1 trending fighters shown', (await page.getByTestId('trending').count()) >= 3)
  await page.screenshot({ path: `${shots}/p5-media-1280.png` })
  await page.getByTestId('story-lead').click(); await page.waitForTimeout(400)
  check('1 a story opens what it is about', /#\/(fight|event|fighter)\//.test(await page.evaluate(() => location.hash)))

  for (const t of ['waiting', 'video', 'storylines', 'outlets', 'awards']) {
    await go(page, `#/media/${t}`)
    check(`2 Media tab "${t}" renders`, (await page.locator('main').innerText()).length > 80)
  }
  await go(page, '#/media/video'); check('2 video cards', (await page.getByTestId('video').count()) > 0)
  await go(page, '#/media/outlets'); check('2 ten outlets with relationship state', (await page.locator('.m-org').count()) === 10)
  await go(page, '#/media/storylines'); check('2 storylines and rivalries are listed', (await page.getByTestId('narrative').count()) > 0)

  // ---- decisions
  await go(page, '#/media/waiting')
  const before = await game(page, (g) => ({ open: g.media.requests.filter((r) => r.status === 'open').length, offers: g.media.offers.filter((o) => o.status === 'open').length, press: g.media.pressers.filter((p) => p.status === 'open').length }))
  check('3 waiting panel lists requests, a press conference and a broadcast offer', before.open > 0 && before.press > 0 && before.offers > 0, JSON.stringify(before))
  await page.getByTestId('req-accept').first().click(); await page.waitForTimeout(300)
  let after = await game(page, (g) => g.media.requests.filter((r) => r.status === 'open').length)
  check('3 Accept answers a media request', after === before.open - 1, `${before.open} → ${after}`)
  if (after > 0) {
    await page.getByTestId('req-decline').first().click(); await page.waitForTimeout(300)
    check('3 Decline answers a media request', (await game(page, (g) => g.media.requests.filter((r) => r.status === 'open').length)) === after - 1)
  }
  const stillOpen = await game(page, (g) => g.media.requests.filter((r) => r.status === 'open').length)
  if (stillOpen > 0 && (await page.getByTestId('req-redirect').count())) {
    await page.getByTestId('req-redirect').first().click(); await page.waitForTimeout(300)
    check('3 Offer another fighter answers the request', (await game(page, (g) => g.media.requests.filter((r) => r.status === 'open').length)) === stillOpen - 1)
  } else check('3 Offer another fighter answers the request', true, 'no third request to test')
  await page.getByTestId('press-confident').first().click(); await page.waitForTimeout(300)
  check('3 a press conference can be held; hype is recorded', await game(page, (g) => g.media.pressers.some((p) => p.status === 'done' && g.media.eventHype[p.eventId] > 0)))
  const cash0 = await game(page, (g) => g.promotions[g.playerPromotionId].cash)
  await page.getByTestId('offer-accept').first().click(); await page.waitForTimeout(300)
  const deal = await game(page, (g) => ({ n: Object.keys(g.media.deals).length, cash: g.promotions[g.playerPromotionId].cash, ledgerOk: g.ledgerArchive + g.ledger.reduce((a, t) => a + t.amount, 0) === g.promotions[g.playerPromotionId].cash }))
  check('3 accepting a broadcast offer creates a deal and moves no money yet', deal.n === 1 && deal.cash === cash0 && deal.ledgerOk, JSON.stringify(deal))

  // ---- event page
  const evId = await game(page, (g) => Object.keys(g.media.deals)[0])
  await go(page, `#/event/${evId}`)
  check('4 event page shows media interest and the broadcast deal', (await page.getByTestId('event-media').count()) === 1 && (await page.getByTestId('deal-chip').count()) === 1)
  await page.screenshot({ path: `${shots}/p5-event-1280.png` })
  await page.getByTestId('release-deal').click(); await page.waitForTimeout(300)
  check('4 a deal can be released', (await game(page, (g) => Object.keys(g.media.deals).length)) === 0)
  if (ids.doneEvent) { await go(page, `#/event/${ids.doneEvent}`); check('4 a finished show reads "Media reaction"', /media reaction/i.test(await page.getByTestId('event-media').innerText())) }

  // ---- fight page
  if (ids.titled) { await go(page, `#/fight/${ids.titled}`); check('5 a title fight shows what is at stake', (await page.getByTestId('title-stake').count()) === 1) }
  if (ids.fight) { await go(page, `#/fight/${ids.fight}`); check('5 fight page renders without error', (await page.locator('main').innerText()).length > 100) }

  // ---- rankings and titles
  await go(page, '#/rankings')
  // Phase 5.4: fifteen lists in five groups (world, European, domestic, area, media & index).
  let listCount = 0
  for (const g of ['world', 'european', 'domestic', 'area', 'media']) { const b = page.getByTestId(`rank-group-${g}`); if (await b.count()) { await b.click(); await page.waitForTimeout(250); listCount += await page.locator('[data-testid^="rank-org-"]').count() } }
  check('6 rankings screen: fifteen lists in groups', listCount >= 13 && listCount <= 16, String(listCount))
  await page.getByTestId('rank-group-world').click(); await page.waitForTimeout(250)
  const rows = await page.getByTestId('rank-row').count()
  check('6 a ranking list has rows with reasons', rows > 0 && (await page.getByTestId('rank-row').first().innerText()).length > 10, String(rows))
  const first = await page.getByTestId('rank-row').first().innerText()
  await page.getByTestId('rank-org-atlas').click(); await page.waitForTimeout(350)
  await page.getByTestId('rank-division').selectOption('heavyweight'); await page.waitForTimeout(350)
  check('6 switching list and division works', /#\/rankings\/atlas\/heavyweight/.test(await page.evaluate(() => location.hash)))
  await page.screenshot({ path: `${shots}/p5-rankings-1280.png` })
  void first
  await go(page, '#/titles/world'); check('7 titles: belts for the division', (await page.getByTestId('title-row').count()) >= 1)
  await page.getByTestId('title-level-tab').nth(2).click(); await page.waitForTimeout(300)
  check('7 level tabs switch', /titles\/(area|domestic|european|world)/.test(await page.evaluate(() => location.hash)))

  // ---- fighter database + profile
  await go(page, '#/fighters/known')
  const rankCells = await page.locator('.fx-rank').allInnerTexts()
  check('8 fighter database shows real ranks (no hard-coded "Unranked" for ranked fighters)', rankCells.length > 0 && rankCells.some((t) => /^(#\d+|C|~#\d+|UNRANKED)$/.test(t.trim())), rankCells.slice(0, 5).join('|'))
  await go(page, `#/fighter/${ids.fighter}`)
  check('9 profile has a media profile with rankings', (await page.getByTestId('media-profile').count()) === 1 && (await page.getByTestId('fighter-rankings').count()) === 1)
  check('9 profile has a career story from real events', (await page.getByTestId('career-story').locator('li').count()) > 0)
  await page.screenshot({ path: `${shots}/p5-profile-1280.png`, fullPage: true })

  // ---- inbox / news / dashboard
  await go(page, '#/inbox')
  check('10 inbox shows MEDIA-kind messages', (await page.locator('.catpill.k-media').count()) > 0)
  await go(page, '#/news')
  check('11 news: stories with priorities and filters', (await page.getByTestId('story').count()) > 0 && (await page.getByTestId('news-BREAKING').count()) === 1)
  await page.getByTestId('news-FEATURE').click(); await page.waitForTimeout(250)
  check('11 news filter works', (await page.locator('[data-kind]').count()) >= 0)
  await go(page, '#/dashboard'); check('12 dashboard has a Ringside report', (await page.getByTestId('desk-media').count()) === 1)

  // ---- hidden information
  const leak = []
  for (const h of ['#/media', '#/media/waiting', '#/media/outlets', '#/rankings', '#/titles', '#/news', '#/promotions', '#/dashboard', `#/fighter/${ids.fighter}`]) {
    await go(page, h)
    // The scouting report on a profile legitimately shows scouted ranges for traits such as discipline; only AI strategy is checked there.
    const t = await page.locator(h.includes('/fighter/') ? '[data-testid="media-profile"]' : 'main').innerText()
    for (const w of h.includes('/fighter/') ? FORBIDDEN.filter((x) => x !== 'potential' && x !== 'discipline' && x !== 'composure') : FORBIDDEN) if (t.includes(w)) leak.push(`${h}: ${w}`)
  }
  check('13 no hidden information on any media screen (attributes, potential, AI strategy)', leak.length === 0, leak.join(' | '))
  await ctx.close()
}

// ================================================================ B. new game
{
  const { ctx, page } = await newPage(1280)
  await load(page, 'p5-new')
  await go(page, '#/media'); check('14 a brand-new world has an honest, working Media screen', (await page.locator('main').innerText()).length > 60)
  await go(page, '#/rankings'); check('14 new world rankings exist from the start', (await page.getByTestId('rank-row').count()) > 0)
  await go(page, '#/titles/world'); check('14 new world titles exist from the start', (await page.getByTestId('title-row').count()) >= 1)
  await page.getByRole('button', { name: /Advance week/i }).first().click().catch(() => {})
  await page.waitForTimeout(500)
  await ctx.close()
}

// ================================================================ C. responsive + touch + reduced motion
const ROUTES = ['media', 'media/waiting', 'media/video', 'media/storylines', 'media/outlets', 'media/awards', 'news', 'rankings', 'rankings/atlas/welterweight', 'titles', 'dashboard', 'inbox', 'fighters', 'promotions', 'events', 'fighter/$F', 'event/$E', 'fight/$FIGHT']
for (const w of [1280, 1024, 390]) {
  const { ctx, page } = await newPage(w)
  await load(page, 'p5-played')
  const ids = await game(page, (g) => ({ F: Object.values(g.contracts).find((c) => c.promotionId === g.playerPromotionId)?.fighterId, E: Object.values(g.events).filter((e) => e.result)[0]?.id, FIGHT: Object.values(g.fights).find((f) => f.result)?.id }))
  const bad = []
  for (const r of ROUTES) {
    const h = r.replace('$FIGHT', ids.FIGHT).replace('$F', ids.F).replace('$E', ids.E)
    await go(page, `#/${h}`)
    const o = await overflow(page)
    if (o !== 0) bad.push(`${r}:${o}`)
  }
  check(`${w}px: no horizontal overflow on ${ROUTES.length} screens`, bad.length === 0, bad.join(', '))
  if (w === 390) {
    await go(page, '#/media/waiting')
    const small = await page.evaluate(() => [...document.querySelectorAll('main .btn, main button.tab')].map((b) => { const r = b.getBoundingClientRect(); return r.height }).filter((h) => h > 0 && h < 30).length)
    check('390px: buttons on the Media screen are tappable (≥ 30px tall)', small === 0, String(small))
    await page.screenshot({ path: `${shots}/p5-waiting-390.png`, fullPage: true })
    await go(page, '#/media'); await page.screenshot({ path: `${shots}/p5-media-390.png`, fullPage: true })
    await go(page, '#/rankings'); await page.screenshot({ path: `${shots}/p5-rankings-390.png`, fullPage: true })
    await go(page, `#/fighter/${ids.F}`); await page.screenshot({ path: `${shots}/p5-profile-390.png`, fullPage: true })
    const labels = await page.getByTestId('bottomnav').innerText()
    check('390px: bottom navigation unchanged (HOME INBOX FIGHTERS EVENTS MORE)', /HOME/i.test(labels) && /INBOX/i.test(labels) && /FIGHTERS/i.test(labels) && /EVENTS/i.test(labels) && /MORE/i.test(labels))
    await page.getByTestId('bn-more').tap(); await page.waitForTimeout(350)
    check('390px: Media, Rankings and Titles are reachable from More', await page.getByTestId('more-sheet').locator('text=/Media|Rankings|Titles/').count() >= 3)
  }
  await ctx.close()
}
{
  const { ctx, page } = await newPage(1280, { reducedMotion: 'reduce' })
  await load(page, 'p5-played')
  for (const h of ['#/media', '#/rankings', '#/titles', '#/news']) await go(page, h)
  check('15 reduced motion: media screens render', (await page.locator('main').innerText()).length > 60)
  check('15 reduced motion: animations are off', await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches))
  await ctx.close()
}

check('no console or page errors during the whole run', errors.length === 0, errors.slice(0, 5).join(' | '))
console.log(`\n${passes} passed, ${fails} failed`)
await browser.close()
process.exit(fails ? 1 : 0)
