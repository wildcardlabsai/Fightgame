/* Phase 9: how often the forecast shown at 'put on sale' contains what settlement later reports (balanced reference bot, 3 years, regional x4 + groundUp x3 seeds). Usage: npx tsx scripts/audit/phase9-forecast-accuracy.ts */
import { createNewGame } from '../../src/engine/worldgen'
import { advanceOneWeek } from '../../src/engine/tick'
import { newLog, playWeek, STRATEGIES } from '../../src/engine/sim/strategies'
import { eventView } from '../../src/engine/eventViews'
const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const rows: any[] = []
for (const [sc, seeds] of [['regional', 4], ['groundUp', 3]] as const) for (let k = 1; k <= seeds; k++) {
  let s = createNewGame({ seed: `fc-${k}`, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo, scenario: sc }, 1_700_000_000_000)
  const log = newLog(); const snap: Record<string, any> = {}
  for (let w = 1; w <= 156; w++) {
    s = playWeek(s, STRATEGIES.balanced, log)
    for (const e of Object.values(s.events)) if (e.promotionId === s.playerPromotionId && ['onSale'].includes(e.status) && !snap[e.id]) { const v = eventView(s, e.id)!; const ec = v.economics!; snap[e.id] = { att: v.forecast!.attendance, profit: ec.profit, costs: ec.costTotal, rev: ec.revenueTotal, be: ec.breakEven.attendance, lines: Object.fromEntries(ec.costs.map(l => [l.key, l.lo])), cap: ec.breakEven.capacity } }
    s = advanceOneWeek(s)
    for (const [id, f] of Object.entries(snap)) { const e = s.events[id]; if (e?.result && !f.done) { f.done = true; rows.push({ sc, k, id, f, actual: { att: e.result.attendance, profit: e.result.profit, rev: e.result.revenue, costs: e.result.costs, fin: e.finance } }) } }
  }
}
let inRange = 0, attIn = 0
for (const r of rows) { const p = r.actual.profit; if (p >= r.f.profit.lo && p <= r.f.profit.hi) inRange++; if (r.actual.att >= r.f.att.lo * 0.98 && r.actual.att <= r.f.att.hi * 1.02) attIn++ }
console.log('events', rows.length, 'profit in range', inRange, `(${(100 * inRange / rows.length).toFixed(1)}%)`, 'attendance in range', attIn, `(${(100 * attIn / rows.length).toFixed(1)}%)`)
const signOk = rows.filter((r) => r.f.profit.hi < 0 || r.f.profit.lo > 0)
console.log('forecasts that called the SIGN of the result (whole range loss or whole range profit):', signOk.length, 'of which the actual result had that sign:', signOk.filter((r) => (r.f.profit.hi < 0) === (r.actual.profit < 0)).length)
const mae = rows.reduce((n, r) => n + Math.abs(r.actual.profit - (r.f.profit.lo + r.f.profit.hi) / 2), 0) / rows.length
console.log('mean absolute error of the midpoint profit: £' + Math.round(mae))
for (const r of rows.slice(0, 12)) console.log(r.sc, r.k, 'att', Math.round(r.f.att.lo), Math.round(r.f.att.hi), 'act', r.actual.att, '| profit', Math.round(r.f.profit.lo), Math.round(r.f.profit.hi), 'act', Math.round(r.actual.profit), '| cap', r.f.cap, 'BE', r.f.be)
