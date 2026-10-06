// Cash-flow decomposition per configuration. node scripts/audit/diagnose.mjs <dir> [years=5]
import { readdirSync, readFileSync } from 'node:fs'
const dir = process.argv[2]; const H = Number(process.argv[3] ?? 5)
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN }
const k = (n) => (Number.isFinite(n) ? `${Math.round(n / 1000)}k` : '–')
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f.split('_').length >= 4)
const runs = files.map((f) => { const [sc, st] = f.split('_'); return { sc, st, r: JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) } })
const cfgs = [...new Set(runs.map((x) => `${x.sc}|${x.st}`))].sort()
const INC = ['tickets', 'sponsorship', 'standingSponsor', 'broadcast', 'ppv']
const OUT = ['purses', 'retainers', 'venue', 'production', 'marketing', 'officials', 'security', 'office', 'staff', 'gym', 'insurance', 'scouting', 'signingBonus', 'releaseFees', 'other']
console.log(`mean £k per year over first ${H} years (income | costs | net) — by configuration`)
for (const c of cfgs) {
  const [sc, st] = c.split('|')
  const rs = runs.filter((x) => x.sc === sc && x.st === st && x.r.rows.length >= H)
  if (!rs.length) continue
  const per = (cat) => mean(rs.map((x) => x.r.rows.slice(0, H).reduce((n, y) => n + ((y.flows ?? {})[cat] ?? 0), 0) / H))
  const inc = INC.map((x) => [x, per(x)]).filter(([, v]) => Math.abs(v) > 500)
  const out = OUT.map((x) => [x, per(x)]).filter(([, v]) => Math.abs(v) > 500)
  const iSum = inc.reduce((n, [, v]) => n + v, 0), oSum = out.reduce((n, [, v]) => n + v, 0)
  console.log(`\n${sc}/${st} (n=${rs.length}): income ${k(iSum)} | costs ${k(oSum)} | net ${k(iSum + oSum)}`)
  console.log('  in : ' + inc.map(([x, v]) => `${x} ${k(v)} (${Math.round((100 * v) / iSum)}%)`).join(', '))
  console.log('  out: ' + out.map(([x, v]) => `${x} ${k(v)} (${Math.round((100 * v) / iSum)}%rev)`).join(', '))
}
