// Phase 8: a genuinely fresh player's complete career through the real UI (no state injection): title screen, guided onboarding, scouting, signing,
// fight negotiation, planning and running shows, rival offer -> counter -> external booking, reloads at risky moments, then more shows.
// Usage: node scripts/browser/phase8-walkthrough.mjs <width 390|1024|1280> [baseUrl] [shotsDir] [scenario=groundUp|regional|national|champion]
// Exits 1 on any critical/high finding (a lost decision, a dead end, a fight that never finishes) and prints every finding it saw.
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const BASE = process.argv[3] ?? 'http://localhost:4180/play'
const OUT = process.argv[4] ?? '/tmp/p8/shots'
mkdirSync(OUT, { recursive: true })
async function open(w = 1280) {
  const b = await chromium.launch(); const mobile = w < 700
  const ctx = await b.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage(); const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) }); page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/?e2e`); await page.waitForFunction(() => window.__fe); await page.waitForTimeout(600)
  return { b, ctx, page, errors }
}
async function fresh(page, seed = 'beta-1') {
  await page.evaluate(() => { try { localStorage.clear(); indexedDB.databases?.().then((d) => d.forEach((x) => indexedDB.deleteDatabase(x.name))) } catch {} })
  await page.reload(); await page.waitForFunction(() => window.__fe); await page.waitForTimeout(700)
  if (!(await page.getByRole('button', { name: /Open the doors/i }).count())) await page.getByRole('button', { name: /New Game/i }).click()
  await page.locator('#pn').fill('Ironbridge Boxing'); await page.locator('#pr').fill('Sam Reid')
  await page.locator(`[data-scenario="${process.argv[5] ?? 'groundUp'}"]`).click()
  await page.locator('#sd').fill(seed)
  await page.getByRole('button', { name: /Open the doors/i }).click(); await page.waitForTimeout(1000)
}

const mk = (page, w, tag, out = OUT) => {
  const J = { log: [], findings: [] }
  const go = async (h) => { await page.evaluate((x) => { if (location.hash === x) location.hash = '#/__'; location.hash = x }, h); await page.waitForTimeout(700) }
  const st = (fn, arg) => page.evaluate(fn, arg)
  const snap = async (n, full = true) => { await page.mouse.move(0, 0); await page.screenshot({ path: `${out}/${tag}-${n}-${w}.jpg`, type: 'jpeg', quality: 62, fullPage: full }) }
  const say = (m) => { J.log.push(m); console.log(m) }
  const find = (sev, m) => { J.findings.push({ sev, m }); FIND.push({ sev, m }); console.log(`FINDING[${sev}] ${m}`) }
  const overflow = async (label) => { const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (o > 1) find('medium', `${w}px horizontal overflow ${o}px on ${label}`) }
  const game = () => page.evaluate(() => { const g = window.__fe.useGame.getState().game; const me = g.playerPromotionId; return { today: g.today, cash: g.promotions[me].cash, me } })
  return { J, go, st, snap, say, find, overflow, game }
}

const w = Number(process.argv[2] ?? 1280)
const FIND = []
const { b, page, errors } = await open(w); await fresh(page, 'beta-1')
const { go, st, snap, say, find, overflow, game } = mk(page, w, 'a')
const toast = async () => (await page.locator('.toast, [role=status]').allInnerTexts()).join(' / ').slice(0, 160)
// guide + desk
await snap('01-desk', false); await overflow('desk')
await page.getByTestId('guide-ack').click()
await go('#/finances'); await snap('02-finances'); await overflow('finances')
await go('#/fighters'); await snap('03-fighters'); await overflow('fighters')
// scout
await go('#/scouting'); await page.locator('main button.btn.small:text-is("Scout")').nth(3).click(); await page.waitForTimeout(400)
await snap('04-scout-dialog', false)
await page.getByRole('button', { name: /SEND SCOUT/i }).click(); await page.waitForTimeout(500)
say('scout ops ' + await st(() => window.__fe.useGame.getState().game.scoutOps.length))
// advance two weeks via the desk
await go('#/dashboard')
for (let i = 0; i < 3; i++) { await page.locator('[data-guide="advance"]:visible').first().click(); await page.waitForTimeout(700) }
say('after 3 weeks: ' + JSON.stringify(await game()))
await go('#/inbox'); await snap('05-inbox'); await overflow('inbox')
// pick a cheap free agent: lowest reputation active, age<=31, >=4 fights
const target = await st(() => { const g = window.__fe.useGame.getState().game; const me = g.playerPromotionId
  const c = Object.values(g.fighters).filter(f => f.status==='active' && f.contractId===null && !f.injury && f.record.wins+f.record.losses>=4 && f.reputation<20).sort((a,b)=>a.reputation-b.reputation)[0]; return c ? { id: c.id, name: c.firstName+' '+c.lastName, rep: c.reputation } : null })
say('signing target ' + JSON.stringify(target))
await go('#/fighter/' + target.id); await snap('06-profile'); await overflow('profile')
const neg = page.getByRole('button', { name: /negotiat|make an offer|open talks|offer/i }).first()
say('profile buttons: ' + (await page.locator('main button:visible').allInnerTexts()).map(t=>t.replace(/\n+/g,' ').slice(0,30)).slice(0,14).join(' | '))

await page.getByRole('button', { name: /^MAKE AN OFFER/i }).click(); await page.waitForTimeout(900)
say('url ' + page.url())
await snap('07-negotiation')
for (let r = 0; r < 5; r++) {
  const t = await page.locator('.n54').innerText()
  const acc = page.getByRole('button', { name: /accept (their )?counter|accept/i }).first()
  if (await acc.count() && await acc.isVisible().catch(()=>false)) { say('accepting counter'); await acc.click(); await page.waitForTimeout(800); }
  else { const mo = page.getByRole('button', { name: /MAKE THIS OFFER/i }); if (!(await mo.count())) break; await mo.click(); await page.waitForTimeout(800) }
  const rost = await st(() => Object.values(window.__fe.useGame.getState().game.contracts).filter(c=>c.promotionId===window.__fe.useGame.getState().game.playerPromotionId && c.status==='active').length)
  say('round '+r+' roster '+rost+' url '+page.url().split('#')[1])
  if (rost > 4) break
}
await snap('08-after-signing')
// ---- matchmaking
await go('#/matchmaking'); await snap('09-matchmaking'); await overflow('matchmaking')
say('mm controls: ' + (await page.locator('main select:visible, main [role=tab]:visible, main button.pick:visible').allInnerTexts()).map(t=>t.replace(/\n+/g,' ').slice(0,40)).slice(0,10).join(' | '))
const appr = page.locator('[data-guide="make-fight"]:not([disabled])').first()
say('approach buttons enabled: ' + await page.locator('[data-guide="make-fight"]:not([disabled])').count())
await appr.click(); await page.waitForTimeout(1000)
say('url ' + page.url().split('#')[1]); await snap('10-fight-deal'); await overflow('fight deal')
say('deal buttons: ' + (await page.locator('main button:visible').allInnerTexts()).map(t=>t.replace(/\n+/g,' ').slice(0,30)).slice(0,16).join(' | '))

const agreeDeal = async (label) => {
  for (let r = 0; r < 6; r++) {
    const acc = page.getByRole('button', { name: /accept (their )?counter/i }).first()
    if (await acc.count() && await acc.isVisible().catch(() => false)) { await acc.click() } else { const mo = page.getByRole('button', { name: /MAKE THIS OFFER/i }); if (!(await mo.count())) break; await mo.click() }
    await page.waitForTimeout(900)
    if (!page.url().includes('/deal/')) break
  }
  say(label + ' -> ' + page.url().split('#')[1])
}
await agreeDeal('fight 1')
await snap('11-fight-agreed'); await overflow('fight page')
say('fights: ' + await st(() => Object.values(window.__fe.useGame.getState().game.fights).filter(f=>f.kind==='player').map(f=>f.status+'/'+f.eventId).join(',')))

for (let k = 2; k <= 3; k++) {
  await go('#/matchmaking')
  const n = await page.locator('[data-guide="make-fight"]:not([disabled])').count()
  if (!n) { find('high', 'no approachable opponent for fight ' + k); break }
  await page.locator('[data-guide="make-fight"]:not([disabled])').first().click(); await page.waitForTimeout(900)
  if (page.url().includes('/matchmaking')) { find('medium', 'Approach on fight ' + k + ' did not open a deal (override prompt?) ' + await toast()); await snap('x-approach-' + k, false); break }
  await agreeDeal('fight ' + k)
}
say('agreed fights: ' + await st(() => Object.values(window.__fe.useGame.getState().game.fights).filter(f=>f.kind==='player' && f.status==='agreed').length))
// ---- plan a show through the UI
await go('#/events'); await page.locator('[data-guide="plan-show"]').first().click(); await page.waitForTimeout(500)
await snap('12-plan-modal', false); await overflow('plan modal')
await page.getByLabel('Event name').fill('Ironbridge Opening Night')
say('modal buttons: ' + (await page.locator('.modal button:visible').allInnerTexts()).map(t=>t.replace(/\n+/g,' ').slice(0,30)).slice(0,12).join(' | '))
await page.getByRole('button', { name: /Book venue/i }).click(); await page.waitForTimeout(900)
say('after booking url ' + page.url().split('#')[1]); await snap('13-event-booked'); await overflow('event page')
const evId = page.url().split('/event/')[1]
for (let k = 0; k < 3; k++) {
  await page.locator('[data-guide="add-fight"]').click(); await page.waitForTimeout(400)
  const addb = page.locator('.modal button:has-text("Add"):not([disabled])').first()
  if (!(await addb.count())) { find('high', 'no addable fight at k=' + k + ' ' + (await page.locator('.modal').innerText()).slice(0, 200)); await page.keyboard.press('Escape'); break }
  await addb.click(); await page.waitForTimeout(600)
}
await snap('14-card-built'); await overflow('card built')
say('card: ' + await st((id) => window.__fe.useGame.getState().game.events[id].card.length + ' status ' + window.__fe.useGame.getState().game.events[id].status, evId))
await page.locator('[data-guide="put-on-sale"]').click(); await page.waitForTimeout(700)
if (await page.locator('.modal').count()) { say('sale confirmation modal: ' + (await page.locator('.modal').innerText()).slice(0, 200).replace(/\n+/g, ' | ')); await snap('15-sale-confirm', false); await page.getByRole('button', { name: /Proceed Anyway/i }).click(); await page.waitForTimeout(700) }
say('event status ' + await st((id) => window.__fe.useGame.getState().game.events[id].status, evId)); await snap('16-on-sale')

const summary = () => page.evaluate(() => { const g = window.__fe.useGame.getState().game
  return { v: g.version, today: g.today, cash: Math.round(g.promotions[g.playerPromotionId].cash), ledger: g.ledger.length + g.ledgerArchive, ledgerSum: Math.round(g.ledger.reduce((a, l) => a + l.amount, 0)),
    events: Object.values(g.events).filter(e => e.promotionId === g.playerPromotionId).map(e => e.id + ':' + e.status + ':' + e.card.length).join(','), fights: Object.keys(g.fights).length, inbox: g.inbox.length,
    guide: JSON.stringify({ a: g.guide.active, d: Object.keys(g.guide.done).sort().join('+'), s: g.guide.skipped.join('+') }), offers: Object.values(g.office?.offers ?? {}).filter(o => o.status === 'open').length } })
const before = await summary(); say('BEFORE RELOAD ' + JSON.stringify(before))
await page.getByRole('button', { name: /^Save/i }).first().click().catch(() => undefined)
await go('#/settings'); await page.getByRole('button', { name: /save game|save now|save/i }).first().click().catch(() => {}); await page.waitForTimeout(800)
await page.reload(); await page.waitForFunction(() => window.__fe); await page.waitForTimeout(1000)
say('after reload: title screen buttons: ' + (await page.locator('button:visible').allInnerTexts()).slice(0, 6).join(' | '))
await snap('17-after-reload', false)
const cont = page.getByRole('button', { name: /Continue/i }); if (await cont.count()) { await cont.click(); await page.waitForTimeout(1200) } else find('critical', 'no Continue button after reload')
const after = await summary(); say('AFTER RELOAD ' + JSON.stringify(after))
for (const k of Object.keys(before)) if (before[k] !== after[k]) find('high', 'reload changed ' + k + ': ' + before[k] + ' -> ' + after[k])
await snap('18-continued', false)
// ---- advance to fight week through the desk
await go('#/dashboard')
for (let i = 0; i < 12; i++) {
  const night = await st(() => Object.values(window.__fe.useGame.getState().game.fights).some(f => f.status === 'fightNight'))
  if (night) break
  await page.locator('[data-guide="advance"]:visible').first().click(); await page.waitForTimeout(600)
  if (page.url().includes('#/event/') || page.url().includes('#/fight/')) break
}
say('now ' + JSON.stringify(await game()) + ' url ' + page.url().split('#')[1]); await snap('19-fight-week')

await snap('19-fight-week', false); await overflow('fight week event page')
await page.locator('[data-guide="ring-bell"]:visible').first().click(); await page.waitForTimeout(1500)
for (let k = 0; k < 4; k++) {
  await page.getByTestId('lf-skip').click().catch(() => find('medium', 'no lf-skip on fight ' + k))
  try { await page.waitForSelector('[data-testid=fight-night][data-finished=true]', { timeout: 20000 }) } catch { find('high', 'fight ' + k + ' never finished'); break }
  await page.waitForTimeout(600); await snap('20-result-' + k, false); await overflow('result ' + k)
  const next = page.getByTestId('lf-next-fight')
  if (await next.count() && await next.isVisible()) { await next.click(); await page.waitForSelector('[data-testid=fight-night][data-live=true]', { timeout: 10000 }).catch(() => find('medium', 'next fight did not go live')); continue }
  await page.getByTestId('lf-end-event').click().catch(() => find('medium', 'no end-event button')); await page.waitForTimeout(900); break
}
say('url ' + page.url().split('#')[1] + ' event status ' + await st((id) => window.__fe.useGame.getState().game.events[id].status, evId))
await go('#/event/' + evId); await snap('22-event-complete'); await overflow('event complete')
const fid = await st((id) => window.__fe.useGame.getState().game.events[id].card[0], evId); await go('#/fight/' + fid); await snap('21-fight-page-scorecards'); await overflow('fight page'); await go('#/event/' + evId)
say('guide: ' + JSON.stringify(await st(() => window.__fe.useGame.getState().game.guide)))
say('result: ' + JSON.stringify(await st((id) => { const r = window.__fe.useGame.getState().game.events[id].result; return r && { att: r.attendance, profit: Math.round(r.profit), rep: r.reputation } }, evId)))
say('finance: ' + JSON.stringify(await st((id) => { const e = window.__fe.useGame.getState().game.events[id]; return { rev: e.finance.revenue, cost: e.finance.costs, prices: e.prices, mkt: e.marketing, venue: window.__fe.useGame.getState().game.venues[e.venueId].name } }, evId)))
say('errors: ' + JSON.stringify(errors))

// ---- rival offers
const offers = () => st(() => { const g = window.__fe.useGame.getState().game; return Object.values(g.office.offers).map(o => ({ id: o.id, st: o.status, f: o.fighterId })) })
say('offers now ' + JSON.stringify(await offers()))
await go('#/fights'); await snap('23-fights-screen'); await overflow('fights screen')
say('fights tabs: ' + (await page.locator('main [role=tab]:visible').allInnerTexts()).map(t=>t.replace(/\n+/g,' ')).join(' | '))
const offTab = page.locator('main [role=tab]:has-text("Offers")'); if (await offTab.count()) { await offTab.first().click(); await page.waitForTimeout(500) } else find('medium', 'no Offers tab on the Fights screen')
await snap('24-offers'); await overflow('offers')
say('offer cards: ' + await page.getByTestId('offer-card').count())
const card = page.getByTestId('offer-card').first()
if (await card.count()) {
  say('card text: ' + (await card.innerText()).replace(/\n+/g, ' | ').slice(0, 400))
  await page.getByTestId('offer-counter').first().click().catch(() => find('medium', 'counter not available')); await page.waitForTimeout(400); await snap('25-offer-counter', false)
  await page.getByTestId('offer-send-counter').first().click().catch(() => {}); await page.waitForTimeout(800)
  say('after counter: ' + (await page.getByTestId('offer-card').first().innerText().catch(() => 'gone')).replace(/\n+/g, ' | ').slice(0, 300))
}

say('offers after counter: ' + JSON.stringify(await offers()))
say('offer tabs: ' + (await page.locator('[data-testid^="offers-"]').allInnerTexts()).map(t=>t.replace(/\n+/g,' ')).join(' | '))
await snap('26-offers-after-counter', false)

const extFights = () => st(() => { const g = window.__fe.useGame.getState().game; return Object.values(g.fights).filter(f => f.kind === 'ai' && (f.sideA.promotionId === g.playerPromotionId || f.sideB.promotionId === g.playerPromotionId)).map(f => ({ id: f.id, status: f.status, day: f.day, org: g.promotions[f.organiserId].name, ev: f.eventId, evStatus: f.eventId && g.events[f.eventId]?.status })) })
let agreed = false
for (let t = 0; t < 6 && !agreed; t++) {
  const o = await offers(); if (o.some(x => x.st === 'agreed')) { agreed = true; break }
  const acc = page.getByTestId('offer-accept').first(); await go('#/fights'); await page.locator('main [role=tab]:has-text("Offers")').first().click().catch(() => {}); await page.waitForTimeout(300)
  if (await acc.count() && await acc.isEnabled().catch(() => false)) { await acc.click(); await page.waitForTimeout(900); continue }
  await go('#/dashboard'); await page.locator('[data-guide="advance"]:visible').first().click(); await page.waitForTimeout(700)
}
say('offer agreed ' + agreed + ' ' + JSON.stringify(await extFights()))
await go('#/fights'); await snap('27-fights-after-agree'); await overflow('fights after agree')
const ex = (await extFights())[0]
if (ex) { await go('#/event/' + ex.ev); await snap('28-rival-event'); await overflow('rival event page'); await go('#/fight/' + ex.id); await snap('29-external-fight'); await overflow('external fight page') }
// reload with the booking pending
const pre = await summary(); await page.waitForTimeout(1500); await page.reload(); await page.waitForFunction(() => window.__fe); await page.waitForTimeout(800); await page.getByRole('button', { name: /Continue/i }).click(); await page.waitForTimeout(1000)
const post = await summary()
for (const k of Object.keys(pre)) if (pre[k] !== post[k]) find('high', 'reload (external booking pending) changed ' + k + ': ' + pre[k] + ' -> ' + post[k])
say('external after reload ' + JSON.stringify(await extFights()))
// advance until the external fight completes
await go('#/dashboard')
for (let t = 0; t < 14; t++) { const e = await extFights(); if (e[0] && ['completed', 'processed', 'postFight'].includes(e[0].status)) break; await page.locator('[data-guide="advance"]:visible').first().click(); await page.waitForTimeout(600) }
const done = await extFights(); say('external completed? ' + JSON.stringify(done))
await go('#/fight/' + done[0].id); await snap('30-external-result'); await overflow('external result')
const led = await st(() => { const g = window.__fe.useGame.getState().game; const m = {}; for (const l of g.ledger) m[l.category] = (m[l.category] || 0) + 1; return m })
say('ledger categories ' + JSON.stringify(led))
say('loan: ' + JSON.stringify(await st(() => { const g = window.__fe.useGame.getState().game; return { l: g.ledger.filter(x => x.category === 'loanFee'), bridge: g.bridge, cash: g.promotions[g.playerPromotionId].cash, today: g.today } })))
say('errors ' + JSON.stringify(errors))

// ---- more shows through the same UI path
const agreeOne = async () => {
  await go('#/matchmaking')
  if (!(await page.locator('[data-guide="make-fight"]:not([disabled])').count())) return false
  await page.locator('[data-guide="make-fight"]:not([disabled])').first().click(); await page.waitForTimeout(900)
  if (page.url().includes('/matchmaking')) return false
  await agreeDeal('  fight'); return true
}
const cycle = async (n) => {
  const cash0 = (await game()).cash
  if (cash0 < 90000) { find('medium', 'cycle ' + n + ': cash £' + Math.round(cash0) + ' too low to book another show; the player cannot continue without a loan or sponsor'); return false }
  say('--- cycle ' + n + ' cash ' + Math.round(cash0))
  let have = 0
  for (let tries = 0; tries < 10 && have < 3; tries++) { if (await agreeOne()) have++; else { await go('#/dashboard'); await page.locator('[data-guide="advance"]:visible').first().click(); await page.waitForTimeout(600) } }
  if (have < 3) { find('high', 'cycle ' + n + ': could only agree ' + have + ' fights in 10 tries'); return false }
  await go('#/events'); await page.locator('[data-guide="plan-show"]').first().click(); await page.waitForTimeout(400)
  await page.getByLabel('Event name').fill('Show ' + n); await page.getByRole('button', { name: /Book venue/i }).click(); await page.waitForTimeout(800)
  const id = page.url().split('/event/')[1]
  for (let k = 0; k < 3; k++) { await page.locator('[data-guide="add-fight"]').click(); await page.waitForTimeout(300); const ab = page.locator('.modal button:has-text("Add"):not([disabled])').first(); if (!(await ab.count())) { find('high', 'cycle ' + n + ': nothing to add'); await page.keyboard.press('Escape'); return false } await ab.click(); await page.waitForTimeout(500) }
  await page.locator('[data-guide="put-on-sale"]').click(); await page.waitForTimeout(600)
  if (await page.locator('.modal').count()) await page.getByRole('button', { name: /Proceed Anyway/i }).click().catch(() => {})
  await page.waitForTimeout(500)
  for (let i = 0; i < 14; i++) { const stt = await st((x) => window.__fe.useGame.getState().game.events[x].status, id); if (['fightWeek', 'live'].includes(stt)) break; await go('#/dashboard'); await page.locator('[data-guide="advance"]:visible').first().click(); await page.waitForTimeout(600) }
  await go('#/event/' + id)
  await page.locator('[data-guide="ring-bell"]:visible').first().click(); await page.waitForTimeout(1200)
  for (let k = 0; k < 4; k++) { await page.getByTestId('lf-skip').click().catch(() => {}); await page.waitForSelector('[data-testid=fight-night][data-finished=true]', { timeout: 20000 }).catch(() => find('high', 'fight never finished')); await page.waitForTimeout(500); const nx = page.getByTestId('lf-next-fight'); if (await nx.count() && await nx.isVisible()) { await nx.click(); await page.waitForSelector('[data-testid=fight-night][data-live=true]', { timeout: 10000 }).catch(() => {}); continue } await page.getByTestId('lf-end-event').click().catch(() => {}); await page.waitForTimeout(600); break }
  const r = await st((x) => { const e = window.__fe.useGame.getState().game.events[x]; return e.result ? { status: e.status, profit: Math.round(e.result.profit), att: e.result.attendance } : { status: e.status } }, id)
  say('  result ' + JSON.stringify(r)); await snap('31-cycle-' + n + '-done', false)
  say('  finance ' + JSON.stringify(await st((x) => { const g = window.__fe.useGame.getState().game; const e = g.events[x]; return { rev: e.finance.revenue, cost: e.finance.costs, fights: e.card.map(id => { const f = g.fights[id]; return [f.sideA.purse ?? f.sideA.basePurse, f.sideB.purse ?? f.sideB.basePurse, g.fighters[f.sideA.fighterId].reputation, g.fighters[f.sideB.fighterId].reputation, g.fighters[f.sideA.fighterId].weightClass] }) } }, id)))
  return true
}
for (let n = 2; n <= 4; n++) { if (!(await cycle(n))) break }
say('final ' + JSON.stringify(await game()) + ' guide done: ' + JSON.stringify(await st(() => window.__fe.useGame.getState().game.guide.done)))
for (const h of ['#/rankings', '#/titles', '#/fighters', '#/finances', '#/promotions', '#/news']) { await go(h); await snap('32-' + h.slice(2)); await overflow(h) }
await go('#/dashboard'); await snap('33-desk-late')
say('errors ' + JSON.stringify(errors))
await b.close()
const bad = FIND.filter((f) => f.sev === 'critical' || f.sev === 'high')
console.log(`\n${FIND.length} findings (${bad.length} critical/high)`)
process.exit(bad.length ? 1 : 0)
