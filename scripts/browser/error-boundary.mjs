// A screen whose lazy chunk stylesheet cannot load must not leave a black page (it used to), and a screen that throws shows the error card.
// usage: node scripts/browser/error-boundary.mjs [base]
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let chromium; try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const base = process.argv[2] ?? 'http://localhost:4180/play'
const b = await chromium.launch(); let bad = 0
const check = (n, ok, x = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`) }
async function open(routeFn) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage()
  if (routeFn) await routeFn(ctx)
  await p.goto(`${base}/?e2e`); await p.waitForFunction(() => window.__fe)
  await p.evaluate(() => window.__fe.useGame.getState().startNewGame({ seed: 'eb-1', promotionName: 'H', promoterName: 'S', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'H', color: '#c0392b', emblem: 'bolt' } }))
  await p.waitForTimeout(1500); return { ctx, p }
}
const text = (p) => p.evaluate(() => (document.getElementById('root')?.innerText ?? '').length)
{ // 1. lazy-chunk stylesheets blocked (the hosted-preview failure): the profile must still render
  const { ctx, p } = await open((c) => c.route('**/assets/*.css', (r) => (r.request().url().includes('index-') ? r.continue() : r.abort())))
  const id = await p.evaluate(() => Object.keys(window.__fe.useGame.getState().game.fighters)[5])
  await p.evaluate((x) => { location.hash = '#/fighter/' + x }, id); await p.waitForTimeout(2500)
  check('profile renders although the screen stylesheet could not load', (await text(p)) > 300 && (await p.locator('[data-testid=dossier]').count()) === 1)
  await ctx.close()
}
{ // 2. the screen's code chunk cannot load at all: an explanatory card with a way out, not a black page
  const { ctx, p } = await open((c) => c.route('**/assets/FighterProfile-*.js', (r) => r.abort()))
  const id = await p.evaluate(() => Object.keys(window.__fe.useGame.getState().game.fighters)[5])
  await p.evaluate((x) => { location.hash = '#/fighter/' + x }, id); await p.waitForTimeout(2500)
  check('a chunk that fails to load shows the error card', (await p.getByTestId('screen-error').count()) === 1 && /could not be loaded/i.test(await p.getByTestId('screen-error').innerText()))
  await p.getByRole('button', { name: 'Back to Overview' }).click(); await p.waitForTimeout(1200)
  check('the way out works and the app is usable again', (await text(p)) > 200 && (await p.getByTestId('screen-error').count()) === 0)
  await ctx.close()
}
{ // 3. a screen that throws while rendering
  const { ctx, p } = await open()
  await p.evaluate(() => { const g = window.__fe.useGame.getState().game; const id = Object.keys(g.fighters)[5]; g.fighters[id].record = null })
  const id = await p.evaluate(() => Object.keys(window.__fe.useGame.getState().game.fighters)[5])
  await p.evaluate((x) => { location.hash = '#/fighter/' + x }, id); await p.waitForTimeout(2000)
  check('a render crash shows the error card instead of a black page', (await p.getByTestId('screen-error').count()) === 1)
  await p.evaluate(() => { location.hash = '#/dashboard' }); await p.waitForTimeout(1200)
  check('navigating away clears the error', (await p.getByTestId('screen-error').count()) === 0 && (await text(p)) > 200)
  await ctx.close()
}
await b.close(); console.log(bad ? `${bad} failed` : 'all passed'); process.exit(bad ? 1 : 0)
