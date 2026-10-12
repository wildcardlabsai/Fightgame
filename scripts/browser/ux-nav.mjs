// Navigation, search, shortcuts, tables, popovers, notes, outlook and review in the production build (/play/).
// usage: node scripts/browser/ux-nav.mjs [base] [outDir]
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium; try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4180/play', out = 'docs/ux-features'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const browser = await chromium.launch(); let bad = 0; const errs = []
const check = (n, ok, x = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`) }
async function sess(w, h = 800) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : h }, isMobile: mobile, hasTouch: mobile })
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
  await p.goto(`${base}/?e2e`); await p.waitForFunction(() => window.__fe)
  await p.evaluate(() => window.__fe.useGame.getState().startNewGame({ seed: 'ux-nav', promotionName: 'Harbour Boxing', promoterName: 'Sam Reid', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'H', color: '#c0392b', emblem: 'bolt' } }))
  await p.waitForTimeout(1500); return { ctx, p }
}
const hash = (p) => p.evaluate(() => location.hash)
const text = (p) => p.evaluate(() => (document.getElementById('root')?.innerText ?? '').length)
{
  const { ctx, p } = await sess(1280)
  const mine = await p.evaluate(() => { const g = window.__fe.useGame.getState().game; const c = Object.values(g.contracts).find((x) => x.promotionId === g.playerPromotionId); const f = g.fighters[c.fighterId]; return { id: f.id, last: f.lastName, first: f.firstName } })
  // search palette
  await p.keyboard.press('Control+k'); await p.waitForTimeout(300)
  check('Ctrl+K opens the search palette', (await p.getByTestId('palette').count()) === 1)
  await p.keyboard.type(mine.last.slice(0, 5)); await p.waitForTimeout(300)
  const rows = await p.locator('.palette-row').allInnerTexts()
  check('typing finds the fighter', rows.some((r) => r.includes(mine.last)), rows.slice(0, 2).join(' | ').replace(/\n/g, ' '))
  await p.screenshot({ path: `${out}/palette-1280.png` })
  await p.keyboard.press('Enter'); await p.waitForTimeout(1500)
  check('Enter opens the profile (no black screen)', (await hash(p)).startsWith('#/fighter/') && (await p.locator('[data-testid=dossier]').count()) === 1)
  // keyboard shortcuts
  await p.keyboard.press('?'); await p.waitForTimeout(250)
  check('? shows the shortcut sheet', (await p.getByTestId('shortcut-help').count()) === 1); await p.screenshot({ path: `${out}/shortcuts-1280.png` })
  await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  check('Esc closes it', (await p.getByTestId('shortcut-help').count()) === 0)
  await p.keyboard.press('g'); await p.keyboard.press('e'); await p.waitForTimeout(800)
  check('g then e goes to Events', (await hash(p)).startsWith('#/events'))
  await p.keyboard.press('g'); await p.keyboard.press('r'); await p.waitForTimeout(800)
  check('g then r goes to the roster', (await hash(p)).startsWith('#/fighters'))
  // history
  await p.getByTestId('nav-back').click(); await p.waitForTimeout(700)
  check('Back returns to the previous screen', (await hash(p)).startsWith('#/events'))
  await p.getByTestId('nav-forward').click(); await p.waitForTimeout(700)
  check('Forward goes on again', (await hash(p)).startsWith('#/fighters'))
  await p.getByTestId('nav-recent').click(); await p.waitForTimeout(300)
  check('Recent places lists where you have been', (await p.locator('[data-testid=recent-menu] button').count()) >= 2)
  await p.keyboard.press('Escape'); await p.getByTestId('nav-recent').click().catch(() => {})
  check('the continue hint says what needs attention', ((await p.getByTestId('continue-hint').innerText()) ?? '').length > 2)
  check('save indicator is shown', (await p.getByTestId('saved-indicator').count()) === 1 || (await p.locator('.hud-saved').count()) === 1)
  // column menu + persistence
  await p.evaluate(() => { location.hash = '#/fighters' }); await p.waitForTimeout(900)
  const heads = () => p.locator('thead th').allInnerTexts()
  check('Age column present by default', (await heads()).some((h) => /^Age/i.test(h.trim())))
  await p.getByTestId('column-menu').click(); await p.locator('.col-menu-pop label', { hasText: /^\s*Age/ }).locator('input').uncheck(); await p.waitForTimeout(300)
  check('column menu hides Age', !(await heads()).some((h) => /^Age/i.test(h.trim())))
  await p.reload(); await p.waitForFunction(() => window.__fe); await p.waitForTimeout(800)
  await p.evaluate(() => window.__fe.useGame.getState().continueLatest()); await p.waitForTimeout(3500)
  await p.evaluate(() => { location.hash = '#/fighters' }); await p.waitForTimeout(900)
  check('the column choice is remembered after a reload', !(await heads()).some((h) => /^Age/i.test(h.trim())))
  await p.getByTestId('column-menu').click(); await p.getByRole('button', { name: 'Reset to default' }).click(); await p.waitForTimeout(300)
  check('Reset restores the default columns', (await heads()).some((h) => /^Age/i.test(h.trim())))
  // saved views
  await p.getByTestId('views-menu').click(); await p.getByLabel('View name').fill('By age'); await p.getByTestId('save-view').click(); await p.waitForTimeout(300)
  check('a view can be saved and listed', (await p.getByTestId('views-menu').innerText()).includes('(1)'))
  // star + popover + notes
  await p.evaluate(() => { location.hash = '#/fighters/free' }); await p.waitForTimeout(900)
  await p.getByTestId('column-menu').click(); await p.locator('.col-menu-pop label', { hasText: /★|Shortlist/ }).first().locator('input').check(); await p.waitForTimeout(300)
  const star = p.locator('.star-btn').first()
  await star.click(); await p.waitForTimeout(300)
  check('the shortlist star toggles', (await p.locator('.star-btn.on').count()) >= 1)
  await p.mouse.move(5, 5); await p.locator('[data-fighter-id]').first().hover(); await p.waitForTimeout(900)
  check('hovering a fighter shows the quick card', (await p.getByTestId('fighter-popover').count()) === 1); await p.screenshot({ path: `${out}/popover-1280.png` })
  await p.getByTestId('fighter-popover').getByRole('button', { name: 'Open profile' }).click(); await p.waitForTimeout(1200)
  check('the quick card opens the profile', (await hash(p)).startsWith('#/fighter/') && (await p.locator('[data-testid=dossier]').count()) === 1)
  await p.getByRole('button', { name: 'Watch', exact: true }).click().catch(() => {}); await p.waitForTimeout(300)
  check('tags can be set on the profile', (await p.locator('.fn-tags .tag-chip.on').count()) >= 1)
  // large text + finances + dashboard review
  await p.evaluate(() => { location.hash = '#/settings' }); await p.waitForTimeout(800)
  await p.getByTestId('large-text').check(); await p.waitForTimeout(200)
  check('larger text switches on', (await p.evaluate(() => document.documentElement.dataset.text)) === 'large')
  await p.getByTestId('large-text').uncheck()
  await p.evaluate(() => { location.hash = '#/finances' }); await p.waitForTimeout(900)
  check('finances has the 12-week outlook', (await p.getByTestId('cash-outlook').count()) === 1); await p.getByTestId('cash-outlook').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${out}/cash-outlook-1280.png` })
  await p.evaluate(() => window.__fe.useGame.getState().advance(5)); await p.waitForTimeout(3500)
  await p.evaluate(() => { location.hash = '#/dashboard' }); await p.waitForTimeout(1200)
  check('the dashboard shows the monthly review after four weeks', (await p.getByTestId('monthly-review').count()) === 1); await p.screenshot({ path: `${out}/dashboard-1280.png` })
  await ctx.close()
}
{
  const { ctx, p } = await sess(390)
  await p.locator('[data-testid=open-search]:visible').click(); await p.waitForTimeout(300)
  check('mobile: the search button opens the palette', (await p.getByTestId('palette').count()) === 1); await p.screenshot({ path: `${out}/palette-390.png` })
  await p.keyboard.press('Escape'); await p.evaluate(() => { location.hash = '#/fighters' }); await p.waitForTimeout(900)
  check('mobile: no horizontal overflow on the roster', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)))
  await ctx.close()
}
await browser.close()
check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '))
console.log(bad ? `${bad} failed` : 'all passed'); process.exit(bad ? 1 : 0)
