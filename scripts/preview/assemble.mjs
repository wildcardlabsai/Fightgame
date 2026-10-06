// Assemble dist-preview into one self-contained HTML fragment for hosted preview: node scripts/preview/assemble.mjs <out.html>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
const dir = 'dist-preview'
const assets = readdirSync(`${dir}/assets`)
let js = readFileSync(`${dir}/assets/${assets.find((f) => f.endsWith('.js'))}`, 'utf8')
const css = readFileSync(`${dir}/assets/${assets.find((f) => f.endsWith('.css'))}`, 'utf8')
for (const n of ['badge', 'wordmark']) js = js.split(`/brand/${n}.png`).join(`data:image/png;base64,${readFileSync(`public/brand/${n}.png`).toString('base64')}`)
js = js.replace(/<\/script/gi, '<\\/script')
const html = `<title>Fight Empire</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;0,800;1,800&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet" />
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`
writeFileSync(process.argv[2], html)
console.log('written', (html.length / 1e6).toFixed(2), 'MB')
