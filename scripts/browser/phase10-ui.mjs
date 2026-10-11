// Phase 10: first launch, beta identity, feedback report and save safety in a real browser at 1280 / 1024 / 390.
// Usage: node scripts/browser/phase10-ui.mjs <baseUrl> <shotsDir>
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4180/play', out = 'docs/phase10-shots'] = process.argv.slice(2)
const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version
mkdirSync(out, { recursive: true })
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('PASS ', m) } else { fail++; console.log('FAIL ', m) } }
const browser = await chromium.launch()
const errors = []
for (const w of [1280, 1024, 390]) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, acceptDownloads: true })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(base).origin }).catch(() => {})
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))
  const T = (id) => page.getByTestId(id)
  const snap = async (n, full = false) => { await page.mouse.move(0, 0); await page.screenshot({ path: `${out}/${n}-${w}.jpg`, type: 'jpeg', quality: 70, fullPage: full }) }
  const noOverflow = async (l) => ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${w} ${l}: no horizontal overflow`)
  const state = () => page.evaluate(() => { const s = window.__fe.useGame.getState(); return { game: !!s.game, saves: s.saves.map((m) => ({ id: m.id, name: m.name, savedAt: m.savedAt })), notices: s.notices.map((n) => n.text), hash: location.hash, name: s.game ? s.game.promotions[s.game.playerPromotionId].name : null, saveId: s.game?.saveId } })
  const open = async () => { await page.goto(`${base}/?e2e`); await page.waitForFunction(() => window.__fe); await page.waitForTimeout(900) }

  // ---- 1 first launch: empty browser -> the new-career form, beta identity, no dev controls
  await open()
  ok(await page.locator('#pn').isVisible(), `${w} first launch opens the new-career form`)
  ok(/beta/i.test(await T('beta-chip').innerText()) && (await T('beta-chip').innerText()).toLowerCase().includes(VERSION.toLowerCase()), `${w} the title screen says beta and shows the version`)
  ok(!/assets \(dev\)|dev only/i.test(await page.locator('body').innerText()), `${w} no dev-only controls on the title screen`)
  await noOverflow('first launch'); await snap('01-first-launch')
  await T('open-about').click(); await page.waitForTimeout(200)
  ok(await T('about-beta').isVisible() && (await T('about-version').innerText()) === VERSION, `${w} About this beta shows version and limitations`)
  ok(/Saves live only in this browser/.test(await T('about-beta').innerText()), `${w} the browser-only save limitation is stated`)
  await T('about-beta').scrollIntoViewIfNeeded(); await noOverflow('about'); await snap('02-about')

  // ---- 2 feedback from the title screen (no career open)
  await T('open-feedback').click(); await page.waitForTimeout(200)
  await T('feedback-text').fill('The scenario cards were hard to compare.')
  const rep0 = await T('feedback-report').inputValue()
  ok(rep0.includes(VERSION) && /Game: no career open/.test(rep0) && /Screen: title/.test(rep0) && rep0.includes('hard to compare'), `${w} title-screen report names the build and screen`)
  await T('feedback-panel').scrollIntoViewIfNeeded(); await noOverflow('feedback on title'); await snap('03-feedback-title')

  // ---- 3 start a career through the form
  await page.reload(); await page.waitForFunction(() => window.__fe); await page.waitForTimeout(700)
  await page.locator('#pn').fill('Ironbridge Boxing'); await page.locator('#pr').fill('Sam Reid')
  await page.getByRole('button', { name: /Open the doors/ }).click(); await page.waitForTimeout(1500)
  let st = await state()
  ok(st.game && st.hash === '#/dashboard' && st.saves.length === 1, `${w} a new career opens on the dashboard and is saved (${st.saves.length} slot)`)
  const firstId = st.saveId

  // ---- 4 feedback from inside the game; sensitive data stays out
  await page.evaluate(() => { location.hash = '#/finances' }); await page.waitForTimeout(500)
  await page.evaluate(() => { location.hash = '#/feedback' }); await page.waitForTimeout(800)
  ok(await T('feedback-panel').isVisible(), `${w} the in-game report screen opens (#/feedback)`)
  await T('feedback-kind').selectOption('confusing'); await T('feedback-text').fill('I could not tell what the first show would cost.')
  const rep = await T('feedback-report').inputValue()
  ok(/Screen: finances/.test(rep) && /Game date:/.test(rep) && /Career: groundUp|Career: \w+/.test(rep) && rep.includes(VERSION), `${w} in-game report names the previous screen, date, career and build`)
  ok(!/Ironbridge|Sam Reid/.test(rep), `${w} the report does not contain the promotion or promoter name`)
  const leaks = await page.evaluate((r) => { const g = window.__fe.useGame.getState().game; return Object.values(g.fighters).filter((f) => r.includes(`${f.firstName} ${f.lastName}`) || r.includes(f.id)).length }, rep)
  ok(leaks === 0, `${w} the report contains no fighter name or id`)
  ok(rep.length < 1500 && !rep.includes('"fighters"'), `${w} the report is a short text, not the save (${rep.length} chars)`)
  await T('feedback-copy').click(); await page.waitForTimeout(300)
  ok(/Nothing has been sent/.test(await T('feedback-status').innerText()), `${w} copying says nothing has been sent`)
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null)
  ok(clip === null || clip === rep, `${w} the clipboard holds exactly the previewed report`)
  const [dl] = await Promise.all([page.waitForEvent('download'), T('feedback-download').click()])
  const dlText = readFileSync(await dl.path(), 'utf8')
  ok(dlText === rep && /\.txt$/.test(dl.suggestedFilename()), `${w} the downloaded file is the same report (${dl.suggestedFilename()})`)
  await noOverflow('feedback in game'); await snap('04-feedback-game', true)
  // reachable from More and Settings
  ok((await page.locator('a[href="#/feedback"], button:has-text("Report a problem")').count()) >= 1, `${w} Report a problem is reachable from the navigation`)

  // ---- 5 settings: about + export slot
  await page.evaluate(() => { location.hash = '#/settings' }); await page.waitForTimeout(800)
  ok(await T('about-beta').isVisible(), `${w} Settings has About this beta`)
  const [sd] = await Promise.all([page.waitForEvent('download'), T('export-slot').first().click()])
  const exported = readFileSync(await sd.path(), 'utf8')
  ok(JSON.parse(exported).saveId === firstId, `${w} per-slot Export downloads the career as a backup file`)
  await snap('05-settings', false)

  // ---- 6 import the backup: adds a slot, original untouched
  await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), exported); await page.waitForTimeout(1200)
  st = await state()
  ok(st.saves.length === 2 && st.saveId !== firstId && st.saves.some((m) => m.id === firstId), `${w} importing a backup of an existing career adds a slot and keeps the original (${st.saves.length} slots)`)
  ok(st.notices.some((t) => /new slot/.test(t)), `${w} the player is told it was added as a new slot`)
  const origBefore = st.saves.find((m) => m.id === firstId).savedAt

  // ---- 7 title screen: Continue vs new vs restore wording; refuse a bad file through the real file input
  await page.evaluate(() => window.__fe.useGame.getState().quitToMenu()); await page.waitForTimeout(800)
  ok(await T('continue').isVisible() && await T('new-career').isVisible() && await T('restore-backup').isVisible(), `${w} title offers Continue, Start a new career and Restore from a backup separately`)
  ok(/never replaces an existing one/.test(await page.locator('.title-block').innerText()), `${w} the title explains that new/restored careers never replace saves`)
  await noOverflow('title with saves'); await snap('06-title-saves', true)
  await page.locator('input[type=file]').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"nope": true}') })
  await page.waitForTimeout(600)
  st = await state()
  ok(!st.game && st.saves.length === 2 && st.notices.some((t) => /not a valid save/.test(t) && /unchanged/.test(t)), `${w} a broken file is refused with a clear message and changes nothing`)
  await page.locator('input[type=file]').setInputFiles({ name: 'newer.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...JSON.parse(exported), version: 999 })) })
  await page.waitForTimeout(600)
  st = await state()
  ok(!st.game && st.saves.length === 2 && st.notices.some((t) => /newer version/.test(t)), `${w} a save from a newer version is refused with its own message`)
  await page.locator('input[type=file]').setInputFiles({ name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(exported) })
  await page.waitForTimeout(1200)
  st = await state()
  ok(st.game && st.saves.length === 3 && st.saves.some((m) => m.id === firstId && m.savedAt === origBefore), `${w} restoring through the file picker adds a third slot; the original slot was not rewritten`)

  // ---- 8 damaged newest save: Continue falls back, nothing is deleted
  await page.evaluate(() => window.__fe.useGame.getState().quitToMenu()); await page.waitForTimeout(600)
  const newest = (await state()).saves.sort((a, b) => b.savedAt - a.savedAt)[0].id
  await page.evaluate(async (id) => {
    await new Promise((res, rej) => { const r = indexedDB.open('fightempire'); r.onsuccess = () => { const tx = r.result.transaction('data', 'readwrite'); tx.objectStore('data').put(new Uint8Array([1, 2, 3, 4]), id); tx.oncomplete = () => { r.result.close(); res() }; tx.onerror = () => rej(tx.error) }; r.onerror = () => rej(r.error) })
  }, newest)
  await page.reload(); await page.waitForFunction(() => window.__fe); await page.waitForTimeout(900)
  await T('continue').click(); await page.waitForTimeout(1200)
  st = await state()
  ok(st.game && st.saveId !== newest && st.notices.some((t) => /newest save could not be opened/.test(t)), `${w} Continue skips a damaged newest save, opens the next one and says so`)
  ok(st.saves.some((m) => m.id === newest), `${w} the damaged slot is still listed (nothing deleted)`)
  await snap('07-continue-fallback')
  await page.evaluate(() => window.__fe.useGame.getState().quitToMenu()); await page.waitForTimeout(600)
  await page.evaluate((id) => window.__fe.useGame.getState().loadSaved(id), newest); await page.waitForTimeout(500)
  st = await state()
  ok(!st.game && st.notices.some((t) => /has not been changed or deleted/.test(t)), `${w} loading the damaged slot explains that it was left untouched`)
  await snap('08-damaged-load', false)
  await ctx.close()
}
const real = errors.filter((e) => !/favicon|net::ERR/.test(e))
ok(real.length === 0, `no console errors (${real.length}${real[0] ? ': ' + real[0] : ''})`)
await browser.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
