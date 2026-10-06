// Before/after table. node scripts/audit/compare.mjs <beforeDir> <afterDir> <years>
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const [a, b, H = '5'] = process.argv.slice(2)
const run = (d) => { const out = `/tmp/_cmp_${Math.random().toString(36).slice(2)}.json`; execFileSync('node', [new URL('./matrix.mjs', import.meta.url).pathname, d, H, '--json', out], { stdio: 'ignore' }); return JSON.parse(readFileSync(out, 'utf8')) }
const A = run(a), B = run(b)
const k = (n) => (Number.isFinite(n) ? (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}m` : `${Math.round(n / 1000)}k`) : '–')
const pct = (n) => `${Math.round(n * 100)}%`
console.log(`| scenario | strategy | n before→after | survive before→after | cash med before→after | rev/yr med | tier after | roster after |`)
console.log('|---|---|---|---|---|---|---|---|')
for (const r of B) {
  const o = A.find((x) => x.scenario === r.scenario && x.strategy === r.strategy)
  console.log(`| ${r.scenario} | ${r.strategy} | ${o?.n ?? '–'}→${r.n} | ${o ? pct(o.survive) : '–'}→${pct(r.survive)} | ${o ? k(o.cashMed) : '–'}→${k(r.cashMed)} | ${o ? k(o.revYrMed) : '–'}→${k(r.revYrMed)} | ${['Local', 'Regional', 'National', 'Intl', 'Global'][Math.round(r.tierMed)]} | ${r.roster} |`)
}
