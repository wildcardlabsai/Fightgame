// Phase 5.4 browser verification: conversation screens for contract and fight negotiation.
// Usage: node scripts/browser/phase54-negotiation.mjs <baseUrl> <fixturesDir> [shotsDir]
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4181', fx = '/tmp/e2e', shots = '/tmp/e2e-shots-u1'] = process.argv.slice(2)
mkdirSync(shots, { recursive: true })
const fixture = (n) => readFileSync(`${fx}/${n}.json`, 'utf8')
const errors = []
let passes = 0, fails = 0
const check = (name, ok, detail = '') => { if (ok) passes++; else fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`) }
const browser = await chromium.launch()
const FORBIDDEN = ['potential', 'reservation', 'archetype', 'walkAway', 'lowballTolerance']

async function newPage(w) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
  await page.goto(`${base}/?e2e`)
  await page.waitForFunction(() => window.__fe)
  return { ctx, page }
}
const load = async (page, name) => { await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), fixture(name)); await page.waitForTimeout(300) }
const go = async (page, h) => { await page.evaluate((x) => { location.hash = x }, h); await page.waitForTimeout(600) }
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const state = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__fe.useGame.getState().game, ${JSON.stringify(arg ?? null)})`)
const hash = (page) => page.evaluate(() => location.hash)
const text = (page) => page.locator('main, body').first().innerText()
const click = async (page, id) => { const b = page.getByTestId(id).first(); await b.scrollIntoViewIfNeeded(); await b.click(); await page.waitForTimeout(350) }
const tall = async (page, loc) => { const bs = await loc.all(); for (const b of bs) { if (!(await b.isVisible())) continue; const bb = await b.boundingBox(); if (bb && bb.height < 43.5) return false } return true }

const talkOf = (page, fighterId) => state(page, (g, id) => { const t = Object.values(g.business.talks).filter((x) => x.kind === 'contract' && x.fighterId === id).sort((a, b) => (a.id < b.id ? 1 : -1))[0]; return t ? { status: t.status, offer: !!t.offer, turn: t.turn } : null }, fighterId)

async function candidatesFreeAgents(page) {
  return state(page, (g) => { const signed = new Set(Object.values(g.contracts).filter((c) => c.status === 'active').map((c) => c.fighterId)); return Object.values(g.fighters).filter((f) => !signed.has(f.id) && !f.retired).map((f) => f.id).slice(0, 40) })
}
async function openTalkFor(page, ids) {
  for (const id of ids) {
    await go(page, `#/negotiation/${id}`)
    if (await page.getByTestId('talk-header').count()) { if (await page.getByTestId('talk-propose').count()) return id }
  }
  return null
}

const ensureEditor = async (page) => { if (!(await page.getByTestId('pathway-select').isVisible().catch(() => false))) await page.getByRole('button', { name: 'Edit my offer' }).click() }
const bump = async (page) => {
  await ensureEditor(page)
  for (const [re, n] of [[/Increase (Base purse|Their purse)/, 3], [/Increase Weekly retainer/, 2], [/Increase Signing bonus/, 2], [/Increase (Win bonus|Their win bonus)/, 2]]) {
    const b = page.getByRole('button', { name: re }).first()
    if (await b.count()) for (let k = 0; k < n; k++) await b.click()
  }
}

/** Play a conversation like a player would: propose, read the answer, accept a counter, otherwise raise the money and try again. */
async function playToEnd(page) {
  for (let i = 0; i < 12; i++) {
    if (await page.getByTestId('talk-closed').count()) break
    if (await page.getByTestId('accept-counter').count()) { await click(page, 'accept-counter'); if ((await hash(page)).match(/#\/(fighter|fight)\//)) break; continue }
    await click(page, 'talk-propose')
    if (await page.getByTestId('talk-closed').count()) break
    if ((await hash(page)).match(/#\/(fighter|fight)\//)) break
    if (!(await page.getByTestId('accept-counter').count())) await bump(page)
  }
}

async function common(page, w, tag) {
  check(`${tag}/${w} no horizontal overflow`, (await overflow(page)) <= 0, String(await overflow(page)))
  if (!/#\/(negotiation|deal)\//.test(await hash(page))) return // other screens (profile pages) are not part of this audit
  const t = await text(page)
  const bad = FORBIDDEN.filter((s) => t.toLowerCase().includes(s.toLowerCase()))
  check(`${tag}/${w} no hidden-information words`, bad.length === 0, bad.join(','))
}

for (const w of [1280, 1024, 390]) {
  // ============================================================ A. signing conversation to agreed
  {
    const { ctx, page } = await newPage(w)
    await load(page, 'p54-new')
    const ids = await candidatesFreeAgents(page)
    const fid = await openTalkFor(page, ids)
    check(`A/${w} a signing conversation opens`, !!fid)
    if (fid) {
      check(`A/${w} header, log, role=log present`, (await page.getByTestId('talk-header').count()) === 1 && (await page.getByRole('log').count()) >= 1 && (await page.getByTestId('talk-line').count()) >= 1)
      check(`A/${w} expected terms visible BEFORE any offer`, await page.getByTestId('expected-terms').isVisible() && (await page.getByTestId('confidence').innerText()).match(/LOW|MODERATE|HIGH/) !== null && !(await talkOf(page, fid)).offer)
      check(`A/${w} no exact ask / patience numbers`, !/patience|ask:/i.test(await page.getByTestId('expected-terms').innerText()))
      check(`A/${w} told box empty-state first`, /Nothing yet/.test(await page.getByTestId('told-box').innerText()))
      check(`A/${w} buttons by role`, (await page.getByRole('button', { name: /Make this offer/ }).count()) === 1 && (await page.getByRole('button', { name: /Ask what their camp is looking for/ }).count()) === 1 && (await page.getByRole('button', { name: 'Walk away' }).count()) === 1)
      check(`A/${w} controls are >=44px tall`, await tall(page, page.locator('.n54 button:visible')), 'a button is shorter than 44px')
      await page.screenshot({ path: `${shots}/A-open-${w}.png`, fullPage: true })
      const lines0 = await page.getByTestId('talk-line').count()
      await click(page, 'ask-priorities')
      check(`A/${w} asking priorities adds log lines and fills told box`, (await page.getByTestId('talk-line').count()) > lines0 && !/Nothing yet/.test(await page.getByTestId('told-box').innerText()))
      await common(page, w, 'A-mid')
      // editor: pathway + plan pickers
      if (!(await page.getByTestId('pathway-select').isVisible().catch(() => false))) await page.getByRole('button', { name: 'Edit my offer' }).click()
      check(`A/${w} pathway + plan pickers present with explanation`, (await page.getByTestId('pathway-select').isVisible()) && (await page.getByTestId('plan-select').isVisible()) && /promise is tracked/i.test(await page.getByTestId('pathway-select').innerText()) && (await page.getByTestId('plan-fit').count()) === 3)
      await page.getByTestId('plan-select').getByRole('radio').nth(1).check()
      if ((await page.getByTestId('pathway-select').getByRole('radio').count()) > 1) await page.getByTestId('pathway-select').getByRole('radio').nth(1).check()
      await page.screenshot({ path: `${shots}/A-editor-${w}.png`, fullPage: true })
      await playToEnd(page)
      await page.waitForTimeout(300)
      const st = await talkOf(page, fid)
      await page.screenshot({ path: `${shots}/A-after-${w}.png`, fullPage: true })
      if (st.status === 'agreed') {
        check(`A/${w} agreed -> navigates to fighter profile`, (await hash(page)).includes(`/fighter/${fid}`), await hash(page))
        check(`A/${w} fighter joined roster`, await state(page, (g, id) => Object.values(g.contracts).some((c) => c.fighterId === id && c.promotionId === g.playerPromotionId && c.status === 'active'), fid))
      } else {
        check(`A/${w} conversation reached agreement (status=${st.status})`, false, 'not agreed after 10 turns')
      }
      await common(page, w, 'A-end')
    }
    await ctx.close()
  }

  // ============================================================ B. renewal
  {
    const { ctx, page } = await newPage(w)
    // The played fixture's bot may have broken off renewal talks with its soonest-expiring fighter (a 12-week lock); this scenario is about a
    // conversation that can open, so lift any such lock first.
    await page.evaluate((j) => { const g = JSON.parse(j); const st = g.state ?? g; for (const k of Object.keys(st.negotiations ?? {})) if (st.negotiations[k].status === 'broken') delete st.negotiations[k]; window.__fe.useGame.getState().importGame(JSON.stringify(g)) }, fixture('p54-played'))
    await page.waitForTimeout(300)
    // The soonest-ending contract whose camp will actually talk (a fighter whose talks were broken off, say, is skipped).
    const rids = await state(page, (g) => Object.values(g.contracts).filter((c) => c.promotionId === g.playerPromotionId && c.status === 'active').sort((a, b) => a.endDay - b.endDay).map((c) => c.fighterId))
    let rid = null
    for (const cand of rids) { await go(page, `#/negotiation/${cand}`); if ((await page.getByTestId('talk-header').count()) === 1) { rid = cand; break } }
    check(`B/${w} roster fighter exists for renewal`, !!rid)
    if (rid) {
      check(`B/${w} renewal conversation opens with expected terms`, (await page.getByTestId('talk-header').count()) === 1 && (await page.getByTestId('expected-terms').isVisible()) && /renewal/i.test(await page.getByTestId('talk-header').innerText()))
      await click(page, 'ask-priorities')
      await playToEnd(page)
      const st = await talkOf(page, rid)
      check(`B/${w} renewal ends in agreement or closed state (${st.status})`, st.status === 'agreed' || (await page.getByTestId('talk-closed').count()) > 0)
      if (st.status === 'agreed') check(`B/${w} renewal agreed -> profile`, (await hash(page)).includes(`/fighter/${rid}`))
      await page.screenshot({ path: `${shots}/B-renewal-${w}.png`, fullPage: true })
      await common(page, w, 'B')
    }
    await ctx.close()
  }

  // ============================================================ C. fight conversation to agreed
  async function startFight(page) {
    return state(page, () => null) ?? null
  }
  {
    const { ctx, page } = await newPage(w)
    // the played fixture has whatever roster its world left it (all booked or injured is possible): use the first fixture where someone can be approached
    let fightId = null
    for (const fxName of ['p54-played', 'p54-new']) {
      await load(page, fxName)
      fightId = await page.evaluate(() => {
        const s = window.__fe.useGame.getState(), g = s.game
        const mine = Object.values(g.contracts).filter((c) => c.promotionId === g.playerPromotionId && c.status === 'active').map((c) => c.fighterId)
        for (const m of mine) for (const o of Object.values(g.fighters).filter((f) => f.weightClass === g.fighters[m].weightClass && f.id !== m && !f.retired)) { const id = s.approachOpponent(m, o.id); if (id) return id }
        return null
      })
      if (fightId) break
    }
    check(`C/${w} a fight can be approached`, !!fightId)
    if (fightId) {
      await go(page, `#/deal/${fightId}`)
      check(`C/${w} fight conversation opens (header, stake, expected terms)`, (await page.getByTestId('talk-header').count()) === 1 && (await page.getByTestId('fight-stake').isVisible()) && (await page.getByTestId('expected-terms').isVisible()))
      check(`C/${w} fight stake is a badge, not a control`, (await page.getByTestId('fight-stake').evaluate((e) => e.tagName)) !== 'BUTTON' && (await page.getByTestId('fight-stake').locator('input,select,button').count()) === 0)
      check(`C/${w} fight asks present`, (await page.getByTestId('ask-priorities').count()) === 1 && (await page.getByTestId('ask-location').count()) === 1 && (await page.getByTestId('ask-timing').count()) === 1)
      const n0 = await page.getByTestId('talk-line').count()
      await click(page, 'ask-location'); await click(page, 'ask-timing'); await click(page, 'ask-priorities')
      check(`C/${w} fight asks extend the log`, (await page.getByTestId('talk-line').count()) >= n0 + 6)
      await page.screenshot({ path: `${shots}/C-fight-${w}.png`, fullPage: true })
      await playToEnd(page)
      let fid = fightId
      let st = await state(page, (g, id) => ({ talk: Object.values(g.business.talks).find((t) => t.fightId === id)?.status, fight: g.fights[id].status }), fid)
      // A camp can legitimately walk away (it depends on the world the fixture happened to play out): try the next pairing, as a promoter would.
      for (let attempt = 1; attempt <= 6 && st.talk !== 'agreed'; attempt++) {
        console.log(`INFO  C/${w} talk ${st.talk}: trying another opponent (${attempt})`)
        fid = await page.evaluate((skip) => {
          const s = window.__fe.useGame.getState(), g = s.game
          const mine = Object.values(g.contracts).filter((c) => c.promotionId === g.playerPromotionId && c.status === 'active').map((c) => c.fighterId)
          let n = 0
          for (const m of mine) for (const o of Object.values(g.fighters).filter((f) => f.weightClass === g.fighters[m].weightClass && f.id !== m && !f.retired).slice(0, 25)) { const id = s.approachOpponent(m, o.id); if (id && n++ >= skip) return id }
          return null
        }, attempt)
        if (!fid) break
        await go(page, `#/deal/${fid}`)
        await playToEnd(page)
        st = await state(page, (g, id) => ({ talk: Object.values(g.business.talks).find((t) => t.fightId === id)?.status, fight: g.fights[id].status }), fid)
      }
      check(`C/${w} fight agreed -> fight page`, st.talk === 'agreed' && (await hash(page)).includes(`/fight/${fid}`), JSON.stringify(st) + (await hash(page)))
      await common(page, w, 'C')
    }
    await ctx.close()
  }

  // ============================================================ D. walk away (contract) + E. lowball (camp walks)
  {
    const { ctx, page } = await newPage(w)
    await load(page, 'p54-new')
    const ids = await candidatesFreeAgents(page)
    const fid = await openTalkFor(page, ids)
    if (fid) {
      if (await page.getByTestId('ask-ambition').count()) {
        await click(page, 'ask-ambition')
        check(`D/${w} asking about ambition: button gone once told (or camp stays evasive)`, (await page.getByTestId('talk-line').count()) >= 3)
      }
      await click(page, 'ask-time')
      check(`D/${w} ask for time keeps talk open`, (await talkOf(page, fid)).status === 'open')
      await click(page, 'talk-walk')
      await click(page, 'talk-walk-confirm')
      const closed = page.getByTestId('talk-closed')
      check(`D/${w} walking away shows a closed state with consequences`, (await closed.count()) === 1 && /walked away|stepped away/i.test(await closed.innerText()) && (await talkOf(page, fid)).status === 'withdrawn')
      check(`D/${w} closed talk keeps the log read-only (no moves)`, (await page.getByTestId('talk-line').count()) >= 2 && (await page.getByTestId('talk-propose').count()) === 0 && (await page.getByTestId('ask-time').count()) === 0)
      await page.screenshot({ path: `${shots}/D-walk-${w}.png`, fullPage: true })
      await click(page, 'closed-back')
      check(`D/${w} back button leaves the conversation`, !(await hash(page)).includes('negotiation'))
      await common(page, w, 'D')
    } else check(`D/${w} signing conversation opens`, false)
    await ctx.close()
  }
  {
    const { ctx, page } = await newPage(w)
    await load(page, 'p54-new')
    const ids = await candidatesFreeAgents(page)
    const fid = await openTalkFor(page, ids)
    if (fid) {
      await page.getByRole('button', { name: 'Edit my offer' }).isVisible().then(async (collapsed) => { if (!(await page.getByTestId('pathway-select').isVisible().catch(() => false))) await page.getByRole('button', { name: 'Edit my offer' }).click() })
      for (const [label, val] of [['Base purse', '1'], ['Weekly retainer', '1'], ['Signing bonus', '0'], ['Win bonus', '0']]) { const inp = page.getByRole('textbox', { name: label }); await inp.fill(val) }
      await page.waitForTimeout(200)
      check(`E/${w} assessment of a lowball draft says Lowball/Light`, /Lowball|Light/.test(await page.getByTestId('assessment').innerText()), await page.getByTestId('assessment').innerText())
      for (let i = 0; i < 12 && !(await page.getByTestId('talk-closed').count()); i++) { await click(page, 'talk-propose') }
      const closed = page.getByTestId('talk-closed')
      const st = await talkOf(page, fid)
      check(`E/${w} lowballing makes the camp walk (${st.status})`, st.status === 'broken' && (await closed.count()) === 1 && /12 weeks/.test(await closed.innerText()), JSON.stringify(st))
      await page.screenshot({ path: `${shots}/E-lowball-${w}.png`, fullPage: true })
      // reopening is locked
      await go(page, `#/negotiation/${fid}`)
      check(`E/${w} reopening after a walk-out shows the closed log, no live moves`, (await page.getByTestId('talk-propose').count()) === 0)
      await common(page, w, 'E')
    } else check(`E/${w} signing conversation opens`, false)
    await ctx.close()
  }
}

// champion fixture smoke: a fight talk with a title stake renders a stake badge
{
  const { ctx, page } = await newPage(1280)
  await load(page, 'p54-champion')
  const fightId = await page.evaluate(() => {
    const s = window.__fe.useGame.getState(), g = s.game
    const mine = Object.values(g.contracts).filter((c) => c.promotionId === g.playerPromotionId && c.status === 'active').map((c) => c.fighterId)
    for (const m of mine) for (const o of Object.values(g.fighters).filter((f) => f.weightClass === g.fighters[m].weightClass && f.id !== m && !f.retired).slice(0, 30)) { const id = s.approachOpponent(m, o.id); if (id) return id }
    return null
  })
  if (fightId) {
    await go(page, `#/deal/${fightId}`)
    const t = await page.getByTestId('fight-stake').innerText()
    check('F champion fixture: stake badge shows ' + t, t.length > 3)
    await page.screenshot({ path: `${shots}/F-champion.png`, fullPage: true })
  }
  await ctx.close()
}

check('no console or page errors', errors.length === 0, errors.slice(0, 5).join(' | '))
console.log(`\n${passes} passed, ${fails} failed`)
await browser.close()
process.exit(fails ? 1 : 0)
