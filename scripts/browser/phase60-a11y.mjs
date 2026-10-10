// Phase 6.0 accessibility and responsive checks across the key screens at 1280 / 1024 / 390.
// Checks: accessible names, image alts, one h1, sideways clipping, tap-target size, visible focus on Tab, text contrast (WCAG ratio on solid backgrounds).
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const [base = 'http://localhost:4180/play', fx = '/tmp/e2e'] = process.argv.slice(2)
const meta = JSON.parse(readFileSync(`${fx}/night-meta.json`, 'utf8'))
const browser = await chromium.launch()
let fails = 0, passes = 0
const check = (n, ok, d = '') => { ok ? passes++ : fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  -> ${d}`}`) }
const load = async (page, n) => { await page.evaluate((j) => window.__fe.useGame.getState().importGame(j), readFileSync(`${fx}/${n}.json`, 'utf8')); await page.waitForTimeout(500) }
const go = async (page, h) => { await page.evaluate((x) => { location.hash = x }, h); await page.waitForTimeout(900) }

const audit = () => {
  const out = { unnamed: [], noAlt: [], h1: document.querySelectorAll('main h1, #root h1').length, clipped: [], small: [], lowContrast: [] }
  const vw = document.documentElement.clientWidth
  const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.textContent || '').trim()
  for (const el of document.querySelectorAll('button, a[href], [role=button], [role=tab], [role=radio], input, select, textarea')) {
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue
    const label = name(el) || (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) || (el.closest('label')?.textContent) || ''
    if (!label.trim() && !el.querySelector('img[alt]:not([alt=""])')) out.unnamed.push(`${el.tagName}.${(el.className + '').slice(0, 24)}`)
    if (['BUTTON', 'A'].includes(el.tagName) && !el.matches('.linkbtn, .bz-name, .rk-who, .bz-champ-name, .tn-brand, .mr-s') && !el.closest('.table, .mailrow, .rk-row, .bz-crow, .v-news-grid, .dh-fighter, .dt-fight') && (r.height < 32 || r.width < 32)) out.small.push(`${el.tagName}.${(el.className + '').slice(0, 24)} ${Math.round(r.width)}x${Math.round(r.height)}`)
  }
  for (const img of document.querySelectorAll('img')) { const r = img.getBoundingClientRect(); if (r.width > 0 && !img.hasAttribute('alt')) out.noAlt.push(img.src.slice(-30)) }
  for (const el of document.querySelectorAll('main *, #root *')) { if (el.closest('.table-wrap, .n54-log, .fn-track, .pf-nav, .tabs, .subnav, [style*="overflow"]')) continue; const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > vw + 1) out.clipped.push(`${el.tagName}.${(el.className + '').toString().slice(0, 20)}`) }
  // contrast on solid backgrounds
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]) }
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { c: p.slice(0, 3), a: p[3] === undefined ? 1 : p[3] } }
  const bgOf = (el) => { let e = el; while (e) { const p = parse(getComputedStyle(e).backgroundColor); if (p && p.a > 0.9) return p.c; e = e.parentElement } return [7, 7, 10] }
  const seen = new Set()
  for (const el of document.querySelectorAll('main *, #root *')) {
    if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2)) continue
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.5) continue
    const fg = parse(cs.color); if (!fg) continue
    const bg = bgOf(el); const a = fg.a
    const mix = fg.c.map((v, i) => v * a + bg[i] * (1 - a))
    const L1 = lum(mix), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
    const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5
    const key = `${el.className}|${cs.color}|${cs.fontSize}`
    if (ratio < need && !seen.has(key)) { seen.add(key); out.lowContrast.push(`${(el.className + '').slice(0, 28) || el.tagName} ${ratio.toFixed(1)}:1 "${el.textContent.trim().slice(0, 24)}"`) }
  }
  return out
}

const SCREENS = [['dashboard', '#/dashboard'], ['profile', null], ['rankings', '#/rankings/atlas'], ['titles', '#/titles/mine'], ['matchmaking', null], ['fights', '#/fights'], ['finances', '#/finances'], ['office', '#/office'], ['inbox', '#/inbox']]
for (const w of [1280, 1024, 390]) {
  const mobile = w < 700
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  await page.goto(`${base}/?e2e`); await page.waitForFunction(() => window.__fe); await load(page, 'p54-played')
  const mine = await page.evaluate(() => { const g = window.__fe.useGame.getState().game; return Object.values(g.contracts).filter((c) => c.promotionId === g.playerPromotionId && c.status === 'active').map((c) => c.fighterId) })
  for (const [name, hash] of SCREENS) {
    await go(page, hash ?? (name === 'profile' ? `#/fighter/${mine[0]}` : `#/matchmaking/${mine[0]}`))
    const a = await page.evaluate(audit)
    check(`${w} ${name}: every control has an accessible name`, a.unnamed.length === 0, a.unnamed.slice(0, 4).join(', '))
    check(`${w} ${name}: images have alt text`, a.noAlt.length === 0, a.noAlt.slice(0, 3).join(', '))
    check(`${w} ${name}: exactly one h1`, a.h1 === 1, String(a.h1))
    check(`${w} ${name}: nothing is cut off at the right edge`, a.clipped.length === 0, a.clipped.slice(0, 4).join(', '))
    if (mobile) check(`${w} ${name}: stand-alone controls are at least 32px`, a.small.length === 0, a.small.slice(0, 4).join(', '))
    check(`${w} ${name}: text contrast meets WCAG AA`, a.lowContrast.length === 0, a.lowContrast.slice(0, 5).join(' | '))
    // keyboard: the first few Tab stops show a focus indicator
    await page.evaluate(() => { (document.activeElement)?.blur?.(); window.scrollTo(0, 0) })
    let seenFocus = 0, tried = 0
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); tried++; const ok = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); window.__lastFocus = `${e.tagName}.${(e.className + '').slice(0, 30)} ${cs.outlineStyle} ${cs.outlineWidth}`; return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1 }); if (ok) seenFocus++; else if (ok === false) { seenFocus = -99; console.log('   no ring on', await page.evaluate(() => window.__lastFocus)); break } }
    check(`${w} ${name}: Tab shows a visible focus ring`, seenFocus > 0, `ring on ${seenFocus}/${tried}`)
  }
  // negotiation (with the forecast) and a fight page
  const free = await page.evaluate(() => { const g = window.__fe.useGame.getState().game; const signed = new Set(Object.values(g.contracts).filter((c) => c.status === 'active').map((c) => c.fighterId)); return Object.values(g.fighters).filter((f) => !signed.has(f.id) && !f.retired).map((f) => f.id).slice(0, 20) })
  for (const id of free) { await go(page, `#/negotiation/${id}`); if (await page.getByTestId('talk-propose').count()) break }
  await load(page, 'night-ko'); await go(page, `#/fight/${meta.ko.fightId}`)
  for (const [name, pre] of [['fight page', null]]) { const a = await page.evaluate(audit); check(`${w} ${name}: controls named, alt text, no clipping, contrast`, !a.unnamed.length && !a.noAlt.length && !a.clipped.length && !a.lowContrast.length, JSON.stringify(a).slice(0, 300)) }
  await ctx.close()
}
console.log(`${passes} passed, ${fails} failed`)
await browser.close()
