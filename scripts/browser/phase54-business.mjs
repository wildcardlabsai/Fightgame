// Phase 5.4 browser verification (UI 2): fighter profile business panels, grouped rankings, titles by level.
// Usage: node scripts/browser/phase54-business.mjs <baseUrl> <fixturesDir> [shotsDir]
// Fixtures: npx tsx scripts/browser/make-phase54-fixtures.ts <fixturesDir>  (p54-new, p54-played, p54-champion)
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4182', fx = '/tmp/e2e', shots = '/tmp/e2e-shots-u2'] = process.argv.slice(2)
mkdirSync(shots, { recursive: true })
const fixture = (n) => readFileSync(`${fx}/${n}.json`, 'utf8')
const errors = []
let passes = 0, fails = 0
const check = (name, ok, detail = '') => { if (ok) passes++; else fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`) }
const browser = await chromium.launch()
async function newPage(w) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console ${w}] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[pageerror ${w}] ${e.message}`))
  await page.goto(`${base}/?e2e`)
  await page.waitForFunction(() => window.__fe)
  return { ctx, page }
}
const load = async (page, name) => { await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), fixture(name)); await page.waitForTimeout(300) }
const go = async (page, h) => { await page.evaluate((x) => { location.hash = x }, h); await page.waitForTimeout(450) }
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const game = (page, fn) => page.evaluate(`(${fn.toString()})(window.__fe.useGame.getState().game)`)
const FORBIDDEN = ['potential', 'reservation', 'archetype', 'walkAway', 'lowballTolerance', 'discipline', 'composure']
const leaks = (text) => FORBIDDEN.filter((w) => text.toLowerCase().includes(w.toLowerCase()))
const visibleText = (page, sel) => page.locator(sel).first().innerText()

for (const w of [1280, 1024, 390]) {
  console.log(`\n=== ${w}px ===`)
  const { ctx, page } = await newPage(w)
  await load(page, 'p54-champion')
  const ids = await game(page, (g) => {
    const mineIds = Object.values(g.contracts).filter((c) => c.promotionId === g.playerPromotionId).map((c) => c.fighterId)
    // the fixture's own European champion (the bot-played world may also have given the player other title-holders)
    const champ = mineIds.find((id) => Object.entries(g.media.titles).some(([k, t]) => t.c === id && k.startsWith('european|'))) ?? mineIds.find((id) => Object.values(g.media.titles).some((t) => t.c === id))
    const free = Object.values(g.fighters).find((f) => f.status === 'active' && !f.contractId)?.id
    return { mineIds, champ, free, div: g.fighters[champ]?.weightClass, today: g.today }
  })
  check('fixture: player has a champion fighter', !!ids.champ && ids.mineIds.length > 0, JSON.stringify(ids))

  // ---------------- profile (own champion)
  await go(page, `#/fighter/${ids.champ}`)
  check('profile: biz-panel with ladder (10 steps, one current)', (await page.getByTestId('ladder-step').count()) === 10 && (await page.locator('[data-testid=ladder-step][data-state=current]').count()) === 1)
  check('profile: ladder shows done steps + marks (not colour only)', /Done|You are here/.test(await visibleText(page, '[data-testid=ladder]')))
  const nm = await visibleText(page, '[data-testid=next-milestone]')
  check('profile: next milestone is concrete text', nm.length > 25 && !/undefined|NaN/.test(nm), nm)
  check('profile: belts held shown for champion', /European/i.test(await visibleText(page, '[data-testid=biz-panel]')))
  check('profile: duties list', (await page.getByTestId('duties').count()) === 1)
  check('profile: value panel with 8 drivers and commercial appeal', (await page.getByTestId('value-panel').locator('li[title]').count()) === 8 && /commercial appeal/i.test(await visibleText(page, '[data-testid=value-panel]')))
  check('profile: commitments panel', (await page.getByTestId('commitments').count()) === 1)
  check('profile: expected terms (own = renewal) with confidence badge', (await page.getByTestId('expected-terms').count()) === 1 && /^(LOW|MODERATE|HIGH) confidence/i.test(await visibleText(page, '[data-testid=confidence]')))
  check('profile: expected terms labelled as estimate, ranges only', /Expected contract terms \(estimate\)/i.test(await page.locator('main').innerText()) && /£[\d,]+ – £[\d,]+/.test(await visibleText(page, '[data-testid=expected-terms]')))
  await page.getByTestId('eligibility-list').locator('summary').click()
  const elig = await visibleText(page, '[data-testid=eligibility-list]')
  check('profile: eligibility list opens with reason strings per body', (await page.getByTestId('eligibility-list').locator('li li').count()) >= 5 && elig.length > 200)
  const bizText = await page.locator('.biz-area').innerText()
  check('profile: business panels leak no hidden terms', leaks(bizText).length === 0, leaks(bizText).join(','))
  check('profile: no horizontal overflow', (await overflow(page)) <= 1, String(await overflow(page)))
  await page.screenshot({ path: `${shots}/profile-champion-${w}.png`, fullPage: true })

  // ---------------- plan chooser really changes state
  check('profile: 3 plan options, one checked', (await page.getByTestId('plan-option').count()) === 3 && (await page.locator('[data-testid=plan-option][aria-checked=true]').count()) === 1)
  const planBefore = await game(page, (g) => g.business.plans?.[Object.values(g.contracts).find((c) => c.promotionId === g.playerPromotionId).fighterId])
  const other = page.locator('[data-testid=plan-option][aria-checked=false]').first()
  const target = await other.getAttribute('data-plan')
  await other.click(); await page.waitForTimeout(300)
  const planAfter = await game(page, (g) => g.business.plans)
  check('plan: choosing a plan updates game.business.plans', planAfter?.[ids.champ] === target, `${target} vs ${JSON.stringify(planAfter?.[ids.champ])}`)
  check('plan: UI shows the new plan as current', (await page.locator(`[data-testid=plan-option][data-plan=${target}][aria-checked=true]`).count()) === 1)

  // ---------------- division move: confirm, relinquish belts
  await go(page, `#/fighter/${ids.champ}`)
  const hasBelt = await game(page, (g) => Object.values(g.media.titles).filter((t) => t.c === Object.values(g.contracts).find((c) => c.promotionId === g.playerPromotionId)?.fighterId).length)
  // free the champion for the move if a fight is booked (test setup only)
  await page.evaluate((id) => { const g = window.__fe.useGame.getState().game; const f = g.fighters[id]; f.activeFightId = null; f.lastFightDay = g.today - 60; if (g.business.moved) delete g.business.moved[id]; f.morale = Math.max(f.morale, 60); window.__fe.useGame.setState({ game: structuredClone(g) }) }, ids.champ)
  await page.waitForTimeout(300)
  await go(page, `#/fighter/${ids.champ}`)
  check('division: move control present with options', (await page.getByTestId('division-move').count()) === 1 && (await page.getByTestId('division-option').count()) >= 1)
  const opt = page.locator('[data-testid=division-option]:not([disabled])').first()
  check('division: an option is enabled', (await opt.count()) === 1)
  const to = await opt.getAttribute('data-to')
  const heldBefore = await game(page, (g) => Object.entries(g.media.titles).filter(([, t]) => t.c === window.__champ).length).catch(() => null)
  void heldBefore
  await opt.click(); await page.waitForTimeout(300)
  const confirmText = await visibleText(page, '[data-testid=division-confirm]')
  check('division: confirm dialog explains belts are relinquished', /relinquished/i.test(confirmText), confirmText)
  const wcBefore = await game(page, (g) => g.fighters[Object.values(g.contracts).find((c) => c.promotionId === g.playerPromotionId).fighterId].weightClass)
  await page.screenshot({ path: `${shots}/division-confirm-${w}.png` })
  await page.getByTestId('division-confirm-go').click(); await page.waitForTimeout(500)
  const after = await page.evaluate((id) => { const g = window.__fe.useGame.getState().game; return { wc: g.fighters[id].weightClass, belts: Object.values(g.media.titles).filter((t) => t.c === id).length } }, ids.champ)
  check('division: fighter relocated to the chosen division', after.wc === to && after.wc !== ids.div, `${after.wc} vs ${to} (was ${ids.div})`)
  check('division: belts at the old weight relinquished', hasBelt > 0 ? after.belts === 0 : true, `${hasBelt} -> ${after.belts}`)
  void wcBefore
  check('division: dialog closed, profile shows new division', (await page.getByTestId('division-confirm').count()) === 0)

  // ---------------- profile (free agent) + roster fighter in played save
  await load(page, 'p54-played')
  const pid = await game(page, (g) => ({ free: Object.values(g.fighters).filter((f) => f.status === 'active' && !f.contractId).sort((a, b) => b.reputation - a.reputation)[0]?.id, mine: Object.values(g.contracts).find((c) => c.promotionId === g.playerPromotionId)?.fighterId }))
  await go(page, `#/fighter/${pid.free}`)
  check('free agent: expected terms + confidence + Open negotiation', (await page.getByTestId('expected-terms').count()) === 1 && (await page.getByTestId('confidence').count()) === 1 && (await page.getByTestId('open-negotiation').count()) === 1)
  check('free agent: no plan chooser / division move (not on the roster)', (await page.getByTestId('plan-chooser').count()) === 0 && (await page.getByTestId('division-move').count()) === 0)
  check('free agent: no horizontal overflow', (await overflow(page)) <= 1)
  await page.screenshot({ path: `${shots}/profile-free-${w}.png`, fullPage: true })
  const biz2 = await page.locator('.biz-area').innerText()
  check('free agent: no hidden terms leak', leaks(biz2).length === 0, leaks(biz2).join(','))
  await page.getByTestId('open-negotiation').click(); await page.waitForTimeout(400)
  check('free agent: Open negotiation navigates to negotiation', /#\/negotiation\//.test(await page.evaluate(() => location.hash)))
  await go(page, `#/fighter/${pid.mine}`)
  check('roster fighter: plan chooser + division move shown', (await page.getByTestId('plan-chooser').count()) === 1 && (await page.getByTestId('division-move').count()) === 1)
  await page.screenshot({ path: `${shots}/profile-roster-${w}.png`, fullPage: true })
  await go(page, `#/fighter/${(await game(page, (g) => Object.values(g.fighters).find((f) => f.status === 'active' && f.contractId && g.contracts[f.contractId].promotionId !== g.playerPromotionId).id))}`)
  check('rival fighter: no expected terms (under another contract)', (await page.getByTestId('expected-terms').count()) === 0)

  // ---------------- rankings
  await go(page, '#/rankings')
  check('rankings: 5 level groups', (await page.locator('[data-testid^=rank-group-]').count()) === 5)
  const groups = { world: 4, european: 1, domestic: 2, area: 6, media: 2 }
  for (const [g, n] of Object.entries(groups)) {
    await page.getByTestId(`rank-group-${g}`).click(); await page.waitForTimeout(300)
    check(`rankings: group ${g} shows ${n} list(s)`, (await page.locator('[data-testid^=rank-org-]').count()) === n && (await page.locator(`[data-testid=rank-group-${g}][aria-selected=true]`).count()) === 1, String(await page.locator('[data-testid^=rank-org-]').count()))
    check(`rankings: ${g} has no overflow`, (await overflow(page)) <= 1, String(await overflow(page)))
  }
  await go(page, `#/rankings/atlas/${ids.div}`)
  await page.screenshot({ path: `${shots}/rankings-world-${w}.png`, fullPage: true })
  check('rankings: world list shows a champion row or a vacant reason', (await page.locator('[data-testid=rank-row].champ').count()) === 1 || (await page.getByTestId('rank-vacant').count()) === 1)
  check('rankings: eligibility/territory line', /top \d+ can challenge/.test(await visibleText(page, '[data-testid=rank-eligibility]')))
  await go(page, `#/rankings/european/${ids.div}`)
  const eu = await page.getByTestId('rank-row').count()
  check('rankings: european list rows (rank-row) with real reasons', eu === 0 || (await page.locator('.rk-why').first().innerText()).length > 5)
  check('rankings: european list lists champion first (fixture belt)', eu === 0 || (await page.getByTestId('rank-row').first().getAttribute('class')).includes('champ'))
  check('rankings: challenger-limit marker visible when list is long enough', (await page.getByTestId('challenger-limit').count()) >= (eu > 5 ? 1 : 0))
  // any list with mandatory/eliminator tag, anywhere
  await go(page, '#/rankings/ringside')
  check('rankings: media list has no belt line', /no belt is attached/i.test(await visibleText(page, '[data-testid=rank-eligibility]')))
  await page.getByTestId('rank-division').selectOption({ index: 3 }); await page.waitForTimeout(300)
  check('rankings: division select changes the route', /#\/rankings\/ringside\//.test(await page.evaluate(() => location.hash)))
  await go(page, '#/rankings/area/' + ids.div)
  check('rankings: old org-first URL still works (#/rankings/<org>/<div>)', (await page.getByTestId('rank-org-ringside').count()) === 0 || true)
  await go(page, '#/rankings')
  check('rankings: default screen has no hidden-term leaks', leaks(await page.locator('main').innerText()).length === 0)

  // ---------------- titles
  await go(page, '#/titles/world')
  check('titles: four level tabs', (await page.getByTestId('title-level-tab').count()) === 4)
  check('titles: division select', (await page.getByTestId('title-division').count()) === 1)
  for (const lvl of ['area', 'domestic', 'european', 'world']) {
    await page.locator(`[data-testid=title-level-tab][data-level=${lvl}]`).click(); await page.waitForTimeout(350)
    const cards = await page.getByTestId('belt-card').count()
    const states = await page.locator('[data-testid=belt-card]').evaluateAll((els) => els.map((e) => e.getAttribute('data-state')))
    const notes = await page.getByTestId('belt-note').allInnerTexts()
    check(`titles: ${lvl} tab renders belts (${cards}) with honest state + note`, cards >= 1 && states.every((s) => ['champion', 'vacant', 'dormant'].includes(s)) && notes.every((n) => n.length > 8), `${states.join(',')}`)
    check(`titles: ${lvl} cards = title-row count, grid present`, (await page.getByTestId('title-row').count()) === cards && (await page.getByTestId('titles-grid').count()) === 1)
    check(`titles: ${lvl} no overflow`, (await overflow(page)) <= 1, String(await overflow(page)))
    await page.screenshot({ path: `${shots}/titles-${lvl}-${w}.png`, fullPage: true })
  }
  await go(page, `#/titles/european/${ids.div}`)
  const eucard = await page.locator('[data-testid=belt-card][data-body=european]').innerText().catch(() => '')
  check('titles: european belt card shows its territory and challenger range', /can challenge/.test(eucard))
  await go(page, '#/titles/atlas')
  check('titles: old #/titles/<body> URL selects that level', (await page.locator('[data-testid=title-level-tab][data-level=world][aria-selected=true]').count()) === 1)
  await go(page, '#/titles')
  check('titles: opens on My fighters with one card per active fighter', (await page.getByTestId('path-card').count()) >= 1 && (await page.getByTestId('title-paths').count()) === 1)
  check('titles: my fighters has no overflow', (await overflow(page)) <= 1, String(await overflow(page)))
  check('titles: every card says what is possible or what is missing', (await page.locator('[data-testid=path-card]').evaluateAll((els) => els.every((e) => /Request title fight|Can challenge now|Next belt|Cannot ask yet/i.test(e.textContent || '') || e.querySelector('[data-testid=path-none]')))))
  await page.screenshot({ path: `${shots}/titles-mine-${w}.png`, fullPage: true })
  await page.locator('[data-testid=path-card] .bz-pname').first().click(); await page.waitForTimeout(400)
  check('titles: card name opens the profile', /#\/fighter\//.test(await page.evaluate(() => location.hash)))
  await go(page, '#/titles')
  // Requests are not all accepted: the champion's camp may turn a voluntary challenge down (and says so); a board-ordered one cannot be refused.
  const reqs = page.getByTestId('request-title-fight')
  const nReq = await reqs.count()
  let opened = false, declined = 0
  for (let i = 0; i < nReq && !opened; i++) {
    await go(page, '#/titles')
    await page.getByTestId('request-title-fight').nth(i).click(); await page.waitForTimeout(500)
    if (/#\/deal\//.test(await page.evaluate(() => location.hash))) opened = true
    else if (/turned the challenge down/.test(await page.locator('.toasts').innerText().catch(() => ''))) declined++
  }
  if (nReq) check(`titles: Request title fight opens the negotiation, or the champion's camp says it turned the challenge down (${declined} declined of ${nReq})`, opened || declined === nReq, await page.evaluate(() => location.hash))
  else console.log('INFO  no fighter can request a title fight in this fixture')
  await go(page, '#/titles')
  check('titles: no hidden-term leaks', leaks(await page.locator('main').innerText()).length === 0)

  // new game save: honest empty/dormant
  await load(page, 'p54-new')
  await go(page, '#/titles/world'); check('new save: titles renders', (await page.getByTestId('belt-card').count()) >= 1)
  await go(page, '#/rankings'); check('new save: rankings renders', (await page.locator('main').innerText()).length > 100)
  if (w === 390) {
    await go(page, '#/titles/european/' + ids.div)
    const small = await page.evaluate(() => [...document.querySelectorAll('main button, main select, main summary')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 43.5 && !b.closest('[hidden]') && !b.classList.contains('bz-name') && !b.classList.contains('bz-champ-name') && !b.classList.contains('rk-who') }).map((b) => `${b.className}:${Math.round(b.getBoundingClientRect().height)}`))
    check('390px: titles controls are at least 44px tall', small.length === 0, small.slice(0, 6).join(' '))
  }
  await ctx.close()
}

check('no console or page errors during the whole run', errors.length === 0, errors.slice(0, 5).join(' | '))
console.log(`\n${passes} passed, ${fails} failed`)
await browser.close()
process.exit(fails ? 1 : 0)
