// Summarise balance-audit runs: node scripts/audit/summarize.mjs <dir> [section...]
import { readdirSync, readFileSync } from 'node:fs'
const dir = process.argv[2] || '/tmp/bench'
const want = new Set(process.argv.slice(3))
const runs = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')))
const q = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
const k = (n) => (Number.isFinite(n) ? `${Math.round(n / 1000)}k` : '–')
const pct = (n) => (Number.isFinite(n) ? `${Math.round(n * 100)}%` : '–')
const show = (s) => !want.size || want.has(s)
const strategies = [...new Set(runs.map((r) => r.strategy))]

if (show('players')) {
  console.log('\n## PLAYER STRATEGIES (cash £, mean [min..max] across seeds)')
  for (const st of strategies.filter((s) => s !== 'passive')) {
    const rs = runs.filter((r) => r.strategy === st)
    const maxY = Math.max(...rs.map((r) => r.years))
    const line = [5, 10, 20].filter((y) => y <= maxY).map((y) => {
      const v = rs.filter((r) => r.years >= y).map((r) => r.rows[y - 1].cash)
      return `y${y}: ${k(mean(v))} [${k(Math.min(...v))}..${k(Math.max(...v))}]`
    }).join(' | ')
    const insolvent = rs.filter((r) => r.rows.some((x) => x.health === 'insolvent')).length
    const last = rs.map((r) => r.rows[r.rows.length - 1])
    const shows = rs.map((r) => r.playerShows.length / r.years)
    const profits = rs.flatMap((r) => r.playerShows.map((s) => s.profit))
    const fill = rs.flatMap((r) => r.playerShows.map((s) => s.attendance / s.capacity))
    console.log(`${st.padEnd(13)} n=${rs.length} ${line}\n   insolvent-ever ${insolvent}/${rs.length} | shows/yr ${mean(shows).toFixed(1)} | roster ${mean(last.map((x) => x.roster)).toFixed(1)} | rep ${mean(last.map((x) => x.reputation)).toFixed(0)} | fans ${k(mean(last.map((x) => x.fans)))} | show profit p10/p50/p90 ${k(q(profits, 0.1))}/${k(q(profits, 0.5))}/${k(q(profits, 0.9))} | loss ${pct(profits.filter((p) => p < 0).length / profits.length)} | fill p10/p50/p90 ${pct(q(fill, 0.1))}/${pct(q(fill, 0.5))}/${pct(q(fill, 0.9))}`)
  }
}

if (show('flows')) {
  console.log('\n## PLAYER CASH FLOW by category (mean £k per year, years 1-5)')
  for (const st of strategies.filter((x) => x !== 'passive')) {
    const rs = runs.filter((r) => r.strategy === st)
    const cats = new Set(); rs.forEach((r) => r.rows.slice(0, 5).forEach((x) => Object.keys(x.flows ?? {}).forEach((c) => cats.add(c))))
    const line = [...cats].map((c) => [c, mean(rs.flatMap((r) => r.rows.slice(0, 5).map((x) => (x.flows ?? {})[c] ?? 0)))]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([c, v]) => `${c} ${Math.round(v / 1000)}k`).join(' | ')
    console.log(`${st.padEnd(13)} ${line}`)
  }
}

if (show('events')) {
  for (const kind of ['player', 'ai']) {
    const ev = runs.flatMap((r) => r.events.filter((e) => e.kind === kind))
    if (!ev.length) continue
    console.log(`\n## ${kind.toUpperCase()} EVENTS (n=${ev.length})`)
    const bins = [0, 0.2, 0.4, 0.6, 0.8, 0.95, 1.01]
    const hist = bins.slice(0, -1).map((b, i) => `${Math.round(b * 100)}-${Math.round(bins[i + 1] * 100)}%:${pct(ev.filter((e) => e.fill >= b && e.fill < bins[i + 1]).length / ev.length)}`)
    console.log(`fill histogram  ${hist.join('  ')}   | sellouts(≥99%) ${pct(ev.filter((e) => e.fill >= 0.99).length / ev.length)}`)
    for (const tier of ['local', 'regional', 'national', 'arena', 'stadium']) {
      const t = ev.filter((e) => e.tier === tier)
      if (!t.length) continue
      const p = t.map((e) => e.profit)
      console.log(`${tier.padEnd(9)} n=${String(t.length).padStart(4)} att p50 ${Math.round(q(t.map((e) => e.att), 0.5))} fill p50 ${pct(q(t.map((e) => e.fill), 0.5))} profit p10/p50/p90 ${k(q(p, 0.1))}/${k(q(p, 0.5))}/${k(q(p, 0.9))} loss ${pct(p.filter((x) => x < 0).length / p.length)} | tickets ${k(mean(t.map((e) => e.tickets)))} spons ${k(mean(t.map((e) => e.sponsor)))} bcast ${k(mean(t.map((e) => e.broadcast)))} ppv ${k(mean(t.map((e) => e.ppv)))} costs ${k(mean(t.map((e) => e.costs)))} purses ${k(mean(t.map((e) => e.purses)))} purse/rev ${pct(mean(t.map((e) => e.purses)) / mean(t.map((e) => e.revenue)))}`)
    }
    console.log(`promotion reputation Δ per event: p5/p50/p95 ${q(ev.map((e) => e.repDelta), .05)}/${q(ev.map((e) => e.repDelta), .5)}/${q(ev.map((e) => e.repDelta), .95)} | event rating p10/p50/p90 ${q(ev.map((e) => e.evRating), .1)}/${q(ev.map((e) => e.evRating), .5)}/${q(ev.map((e) => e.evRating), .9)} | atmosphere p10/p50/p90 ${q(ev.map((e) => e.atmosphere), .1)}/${q(ev.map((e) => e.atmosphere), .5)}/${q(ev.map((e) => e.atmosphere), .9)}`)
    const withF = ev.filter((e) => e.fa)
    if (withF.length) {
      const inside = withF.filter((e) => e.att >= e.fa[0] && e.att <= e.fa[1]).length / withF.length
      const err = withF.map((e) => (e.att - (e.fa[0] + e.fa[1]) / 2) / Math.max(1, (e.fa[0] + e.fa[1]) / 2))
      const width = withF.map((e) => (e.fa[1] - e.fa[0]) / Math.max(1, (e.fa[0] + e.fa[1]) / 2))
      console.log(`forecast: actual inside range ${pct(inside)} | mean width ±${pct(mean(width) / 2)} | error p10/p50/p90 ${pct(q(err, 0.1))}/${pct(q(err, 0.5))}/${pct(q(err, 0.9))} | below range ${pct(withF.filter((e) => e.att < e.fa[0]).length / withF.length)} above ${pct(withF.filter((e) => e.att > e.fa[1]).length / withF.length)}`)
    }
  }
}

if (show('demand')) {
  console.log('\n## DEMAND vs CAPACITY (at fight week, uncapped)')
  for (const kind of ['player', 'ai']) {
    const d = runs.flatMap((r) => (r.demand ?? []).filter((x) => x.kind === kind))
    if (!d.length) continue
    const act = d.map((x) => x.act / x.cap), pub = d.map((x) => x.pub / x.cap), ratio = d.map((x) => Math.log(x.act / Math.max(1, x.pub)))
    const sd = Math.sqrt(mean(ratio.map((x) => (x - mean(ratio)) ** 2)))
    const drift = d.filter((x) => x.pub0 > 0).map((x) => Math.log(x.pub / x.pub0))
    console.log(`  drift public demand (on-sale → 2 weeks out): median ${Math.exp(q(drift, .5)).toFixed(2)} mean-log ${mean(drift).toFixed(3)} sd ${Math.sqrt(mean(drift.map((x) => (x - mean(drift)) ** 2))).toFixed(3)}`)
    console.log(`${kind}: n=${d.length} public demand/cap p10/p50/p90 ${q(pub, .1).toFixed(2)}/${q(pub, .5).toFixed(2)}/${q(pub, .9).toFixed(2)} | actual demand/cap p10/p50/p90 ${q(act, .1).toFixed(2)}/${q(act, .5).toFixed(2)}/${q(act, .9).toFixed(2)} | actual/public median ${Math.exp(q(ratio, .5)).toFixed(2)} mean-log ${mean(ratio).toFixed(3)} sd-log ${sd.toFixed(3)} | P(actual>cap) ${pct(act.filter((x) => x > 1).length / act.length)}`)
  }
}

if (show('style')) {
  console.log('\n## RIVAL STYLES (do they behave differently?) and dominance')
  const ai = runs.flatMap((r) => r.events.filter((e) => e.kind === 'ai').map((e) => ({ ...e, years: r.years })))
  const names = [...new Set(ai.map((e) => e.promo))]
  const totalAtt = ai.reduce((n, e) => n + e.att, 0), totalFights = ai.reduce((n, e) => n + e.fights, 0), totalProfit = ai.reduce((n, e) => n + e.profit, 0)
  const nRuns = runs.length, yrs = mean(runs.map((r) => r.years))
  for (const n of names) {
    const e = ai.filter((x) => x.promo === n)
    const tiers = {}; e.forEach((x) => (tiers[x.tier] = (tiers[x.tier] ?? 0) + 1))
    console.log(`${n.padEnd(26)} events/yr ${(e.length / nRuns / yrs).toFixed(1)} | mean seats ${Math.round(mean(e.map((x) => x.cap)))} | mean fights ${mean(e.map((x) => x.fights)).toFixed(1)} | PPV ${pct(e.filter((x) => x.ppvKind).length / e.length)} | sellout ${pct(e.filter((x) => x.fill >= 0.99).length / e.length)} | loss ${pct(e.filter((x) => x.profit < 0).length / e.length)} | profit/event ${k(mean(e.map((x) => x.profit)))} | share of attendance ${pct(e.reduce((a, x) => a + x.att, 0) / totalAtt)}, fights ${pct(e.reduce((a, x) => a + x.fights, 0) / totalFights)} | tiers ${Object.entries(tiers).map(([a, b]) => a[0] + a[1] + ':' + Math.round((100 * b) / e.length) + '%').join(' ')}`)
  }
  const all = runs.flatMap((r) => r.events)
  for (const tier of ['local', 'regional', 'national', 'arena', 'stadium']) {
    const t = all.filter((e) => e.tier === tier)
    if (t.length) console.log(`${tier.padEnd(9)} share of all events ${pct(t.length / all.length)} | share of all profit ${pct(t.reduce((a, e) => a + e.profit, 0) / all.reduce((a, e) => a + e.profit, 0))} | PPV used ${pct(t.filter((e) => e.ppvKind).length / t.length)} | loss ${pct(t.filter((e) => e.profit < 0).length / t.length)}`)
  }
  const ppv = all.filter((e) => e.ppvKind)
  console.log(`PPV events: ${ppv.length} (${pct(ppv.length / all.length)}); loss ${pct(ppv.filter((e) => e.profit < 0).length / Math.max(1, ppv.length))}; median profit ${k(q(ppv.map((e) => e.profit), 0.5))} vs non-PPV ${k(q(all.filter((e) => !e.ppvKind).map((e) => e.profit), 0.5))}`)
}

if (show('ai')) {
  console.log('\n## AI PROMOTIONS (end of run, all runs)')
  const names = [...new Set(runs.flatMap((r) => r.ai.map((a) => a.name)))]
  for (const n of names) {
    const a = runs.flatMap((r) => r.ai.filter((x) => x.name === n))
    const comp = [...new Set(a.map((x) => x.competence))].join('/')
    console.log(`${n.padEnd(26)} ${a[0].tier.padEnd(9)} ${a[0].strategy.padEnd(16)} comp ${comp.padEnd(18)} events/run ${mean(a.map((x) => x.events)).toFixed(0)} profit/run ${k(mean(a.map((x) => x.profit)))} cash ${k(mean(a.map((x) => x.cash)))} bail ${k(mean(a.map((x) => x.bailouts)))} distrib ${k(mean(a.map((x) => x.distributions)))} rep ${mean(a.map((x) => x.rep)).toFixed(0)} roster ${mean(a.map((x) => x.roster)).toFixed(0)} states ${[...new Set(a.map((x) => x.state))].join(',')} collapsing ${a.filter((x) => x.collapsing).length}`)
  }
}

if (show('world')) {
  console.log('\n## WORLD')
  for (const y of [5, 10, 20]) {
    const rs = runs.filter((r) => r.years >= y && r.rows.length >= y)
    if (!rs.length) continue
    const rr = rs.map((r) => r.rows.slice(0, y))
    const fights = rr.map((rows) => rows.reduce((n, r) => n + r.fightsYear, 0))
    console.log(`y${y} (n=${rs.length}): fights/yr ${mean(fights.map((f) => f / y)).toFixed(0)} | retired/yr ${mean(rr.map((rows) => rows.reduce((n, r) => n + r.retiredYear, 0) / y)).toFixed(0)} | new pros/yr ${mean(rr.map((rows) => rows.reduce((n, r) => n + r.newProsYear, 0) / y)).toFixed(0)} | active ${mean(rr.map((rows) => rows[y - 1].active)).toFixed(0)} | avg age ${mean(rr.map((rows) => rows[y - 1].avgAge)).toFixed(1)} | pop>50 ${pct(mean(rr.map((rows) => rows[y - 1].popOver50)))} | ms/wk ${mean(rs.map((r) => r.rows.slice(0, y).reduce((n, x) => n + x.ms, 0) / y)).toFixed(0)}`)
  }
  for (const y of [5, 10, 20]) {
    const rs = runs.filter((r) => r.rows.length >= y && r.rows[y - 1].meanPop !== undefined)
    if (!rs.length) continue
    const g = (f) => mean(rs.map((r) => r.rows[y - 1][f]))
    console.log(`y${y} careers: mean pop ${g('meanPop').toFixed(1)} rep ${g('meanRep').toFixed(1)} | prospects (≤23) who fought in last 12m ${pct(g('prospectFought'))} | top-20 by rep: mean age ${g('top20Age').toFixed(1)}, mean rep ${g('top20Rep').toFixed(0)}, share aged 34+ ${pct(g('vetShareTop20'))} | fights per active fighter-year ${g('fightsPerActive').toFixed(2)}`)
  }
  console.log(`max repeat pairings: ${Math.max(...runs.map((r) => r.maxPairRepeats))} | pairs fought ≥3×: ${mean(runs.map((r) => r.pairs?.ge3 ?? 0)).toFixed(1)}/run, ≥5×: ${mean(runs.map((r) => r.pairs?.ge5 ?? 0)).toFixed(1)}/run of ${mean(runs.map((r) => r.pairs?.total ?? 0)).toFixed(0)} distinct pairings`)
}

if (show('sizes')) {
  console.log('\n## SAVE SIZE')
  for (const y of [5, 10, 20]) {
    const rs = runs.filter((r) => r.sizes[y])
    if (!rs.length) continue
    const parts = {}
    for (const r of rs) for (const [kk, v] of Object.entries(r.sizes[y].parts)) parts[kk] = (parts[kk] ?? 0) + v / rs.length
    const top = Object.entries(parts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([kk, v]) => `${kk} ${Math.round(v / 1024)}kB`).join(', ')
    console.log(`y${y}: json ${Math.round(mean(rs.map((r) => r.sizes[y].json)) / 1024)}kB gz ${Math.round(mean(rs.map((r) => r.sizes[y].gz)) / 1024)}kB load ${Math.round(mean(rs.map((r) => r.sizes[y].loadMs)))}ms | ${top}`)
  }
}
