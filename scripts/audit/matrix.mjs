// Economy calibration summary. node scripts/audit/matrix.mjs <dir> [horizons=3,5,10] [--json out.json]
// Files are named <scenario>_<strategy>_<seed>_<years>.json (see scripts/audit/runmatrix.sh).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
const dir = process.argv[2]
const horizons = (process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : '3,5,10').split(',').map(Number)
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null
const START = Math.floor(Date.parse('2026-10-05T00:00:00Z') / 86400000)
const med = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
const k = (n) => (Number.isFinite(n) ? (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}m` : `${Math.round(n / 1000)}k`) : '–')
const pct = (n) => (Number.isFinite(n) ? `${Math.round(n * 100)}%` : '–')
const TIER_RANK = { Startup: 0, Regional: 1, National: 2, Major: 3, Global: 4 }
const TIER_LABEL = ['Local', 'Regional', 'National', 'Intl', 'Global']
const REV = ['tickets', 'sponsorship', 'standingSponsor', 'broadcast', 'ppv']
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f.split('_').length >= 4)
const runs = files.map((f) => { const [sc, st, sd, yrs] = f.replace('.json', '').split('_'); return { sc, st, sd, years: Number(yrs), r: JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) } })
const cfgs = [...new Set(runs.map((x) => `${x.sc}|${x.st}`))].sort()
const out = []
for (const H of horizons) {
  console.log(`\n### Horizon ${H} years`)
  console.log('scenario | strategy | n | survive | bankrupt | tier | cash med | rev/yr med | evt profit med | evt loss med | worst | best | roster | payroll/yr | shows/yr | fill | att | bcast/yr | spons evt/yr | spons stand/yr | ppv/yr')
  for (const c of cfgs) {
    const [sc, st] = c.split('|')
    const rs = runs.filter((x) => x.sc === sc && x.st === st && x.years >= H)
    if (!rs.length) continue
    const rows = rs.map((x) => x.r.rows.slice(0, H))
    const bankrupt = rows.filter((rw) => rw.some((y) => y.health === 'insolvent') || rw[rw.length - 1].cash < 0).length
    const cash = rows.map((rw) => rw[rw.length - 1].cash)
    const flow = (rw, cats) => rw.reduce((n, y) => n + cats.reduce((m, cc) => m + Math.max(0, (y.flows ?? {})[cc] ?? 0), 0), 0) / H
    const revYr = rows.map((rw) => flow(rw, REV))
    const ev = rs.flatMap((x) => x.r.events.filter((e) => e.kind === 'player' && e.day - START <= H * 364))
    const profits = ev.map((e) => e.profit)
    const losses = profits.filter((p) => p < 0)
    const tiers = rows.map((rw) => TIER_RANK[rw[rw.length - 1].tier] ?? 0)
    const payroll = rows.map((rw) => rw.reduce((n, y) => n - ((y.flows ?? {}).retainers ?? 0) - ((y.flows ?? {}).purses ?? 0), 0) / H)
    const rec = {
      horizon: H, scenario: sc, strategy: st, n: rs.length, survive: 1 - bankrupt / rs.length, bankrupt: bankrupt / rs.length, tierMed: med(tiers), tierMax: Math.max(...tiers),
      cashMed: med(cash), revYrMed: med(revYr), evtProfitMed: med(profits), evtLossMed: med(losses), worst: Math.min(...profits, 0), best: Math.max(...profits, 0),
      roster: med(rows.map((rw) => rw[rw.length - 1].roster)), payrollYr: med(payroll), showsYr: med(rows.map((rw) => rw.reduce((n, y) => n + y.shows, 0) / H)),
      fill: med(ev.map((e) => e.fill)), att: med(ev.map((e) => e.att)),
      bcastYr: med(rows.map((rw) => flow(rw, ['broadcast']))), sponEvtYr: med(rows.map((rw) => flow(rw, ['sponsorship']))), sponStandYr: med(rows.map((rw) => flow(rw, ['standingSponsor']))), ppvYr: med(rows.map((rw) => flow(rw, ['ppv']))),
      repMed: med(rows.map((rw) => rw[rw.length - 1].reputation)), fansMed: med(rows.map((rw) => rw[rw.length - 1].fans)),
      tierDay: (() => { const t = {}; for (const x of rs) for (const h of (x.r.rows[x.r.rows.length - 1].tierHistory ?? [])) (t[h.to] ??= []).push(h.day); return Object.fromEntries(Object.entries(t).map(([a, v]) => [a, { n: v.length, medYears: med(v) / 365 }])) })(),
    }
    out.push(rec)
    console.log(`${sc} | ${st} | ${rec.n} | ${pct(rec.survive)} | ${pct(rec.bankrupt)} | ${TIER_LABEL[Math.round(rec.tierMed)]}${rec.tierMax > rec.tierMed ? `(max ${TIER_LABEL[rec.tierMax]})` : ''} | ${k(rec.cashMed)} | ${k(rec.revYrMed)} | ${k(rec.evtProfitMed)} | ${k(rec.evtLossMed)} | ${k(rec.worst)} | ${k(rec.best)} | ${rec.roster} | ${k(rec.payrollYr)} | ${rec.showsYr.toFixed(1)} | ${pct(rec.fill)} | ${Math.round(rec.att)} | ${k(rec.bcastYr)} | ${k(rec.sponEvtYr)} | ${k(rec.sponStandYr)} | ${k(rec.ppvYr)}`)
  }
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out))
