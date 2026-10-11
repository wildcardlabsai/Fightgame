// Builds docs/ux-review/contact-sheet-*.png and INDEX.md from docs/ux-review/manifest.json (no app code involved).
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const dir = 'docs/ux-review'
const { shots, notes } = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'))
const browser = await chromium.launch()
async function sheet(list, file, title, cols) {
  const cells = list.map((s) => `<figure><img src="${s.file}"><figcaption><b>${s.name}</b><br>${s.title}<br><small>${s.w}×${s.h} · page ${(s.docH / s.vh).toFixed(1)} screens</small></figcaption></figure>`).join('')
  const html = `<html><body style="margin:0;background:#101014;color:#ddd;font:13px/1.35 system-ui,sans-serif"><h1 style="margin:14px 18px;font:700 20px system-ui">${title}</h1><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:16px;padding:0 18px 18px">${cells}</div><style>figure{margin:0;background:#18181d;border:1px solid #2a2a33}img{width:100%;display:block;border-bottom:1px solid #2a2a33}figcaption{padding:8px 10px}</style></body></html>`
  writeFileSync(`${dir}/_sheet.html`, html)
  const p = await browser.newPage({ viewport: { width: 1500, height: 900 } })
  await p.goto(`file://${process.cwd()}/${dir}/_sheet.html`); await p.waitForLoadState('load'); await p.waitForTimeout(800)
  await p.screenshot({ path: `${dir}/${file}`, fullPage: true }); await p.close()
}
const big = shots.filter((s) => s.w === 1280)
await sheet(big.slice(0, 12), 'contact-sheet-1280-a.png', 'The Promoter — desktop review pack, 1280×800 (1 of 2)', 3)
await sheet(big.slice(12), 'contact-sheet-1280-b.png', 'The Promoter — desktop review pack, 1280×800 (2 of 2)', 3)
await sheet(shots.filter((s) => s.w === 1024), 'contact-sheet-1024.png', 'The Promoter — desktop review pack, 1024×800', 2)
await browser.close()
const rows = (list) => list.map((s) => `| ${s.name} | ${s.title} | ${s.w}×${s.h} | [${s.file}](${s.file}) | ${(s.docH / s.vh).toFixed(1)} |`).join('\n')
writeFileSync(`${dir}/INDEX.md`, `# Desktop UX review pack — index

Real screenshots of the running production build (commit ${process.env.COMMIT ?? 'HEAD'}), Playwright/Chromium, no CSS or content altered. Contact sheets: [1280 (1/2)](contact-sheet-1280-a.png) · [1280 (2/2)](contact-sheet-1280-b.png) · [1024](contact-sheet-1024.png). Last column = full page height in viewport-heights.

Career: \`p54-played\` (Regional promotion, 11 fighters, week 36) for everything except the three editable-event tabs, which use \`p7-ready\` (a startup promotion with a show still being built; the main career has no event with a card in progress).

## 1280 × 800
| id | screen | size | file | page height |
|---|---|---|---|---|
${rows(shots.filter((s) => s.w === 1280))}

## 1024 × 800
| id | screen | size | file | page height |
|---|---|---|---|---|
${rows(shots.filter((s) => s.w === 1024))}

## Capture notes
${notes.map((n) => `- ${n}`).join('\n')}
`)
