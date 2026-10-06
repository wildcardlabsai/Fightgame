// Summarise career audit output: node scripts/audit/careers.mjs <careers.json>
import { readFileSync } from 'node:fs'
const runs = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0 }
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0 }
const all = runs.flatMap((r) => r.careers)
const years = runs.length
console.log('careers', all.length, 'worldFights/yr', Math.round(runs.reduce((n, r) => n + r.worldFights, 0) / runs.length / 12))
const retired = all.filter((c) => c.retiredAge != null)
console.log('retired', retired.length, 'retAge med', med(retired.map((c) => c.retiredAge)), 'p10', q(retired.map((c) => c.retiredAge), .1), 'p90', q(retired.map((c) => c.retiredAge), .9))
const pros = all.filter((c) => !c.originallyInWorld)
console.log('new pros', pros.length)
const grp = (name, list) => {
  if (!list.length) return
  console.log(name.padEnd(22), 'n', String(list.length).padStart(4), 'fights', med(list.map((c) => c.fights)), 'W%', Math.round(100 * list.reduce((n, c) => n + c.wins, 0) / Math.max(1, list.reduce((n, c) => n + c.fights, 0))), 'peakRep', Math.round(med(list.map((c) => c.peakRep))), 'peakPop', Math.round(med(list.map((c) => c.peakPop))), 'contracts', med(list.map((c) => c.contracts)), 'promos', med(list.map((c) => c.promos.length)), 'max12', med(list.map((c) => c.maxFightsIn12)))
}
grp('all', all)
grp('start<=23', all.filter((c) => c.startAge <= 23))
grp('start 24-29', all.filter((c) => c.startAge > 23 && c.startAge < 30))
grp('start 30+', all.filter((c) => c.startAge >= 30))
// activity by type: yearly fights per snap by rep tier
const snaps = all.flatMap((c) => c.snaps.filter((s) => s.status === 'active'))
const tier = (s) => s.age <= 23 && s.rep < 40 ? 'prospect' : s.rep >= 65 ? 'champion/star' : s.rep >= 40 ? 'contender' : s.age >= 33 ? 'veteran' : 'journeyman'
const byT = {}
for (const s of snaps) (byT[tier(s)] ??= []).push(s)
for (const [k, v] of Object.entries(byT)) console.log('activity', k.padEnd(14), 'n', v.length, 'fights/yr mean', (v.reduce((n, s) => n + s.fights12, 0) / v.length).toFixed(2), 'zero%', Math.round(100 * v.filter((s) => s.fights12 === 0).length / v.length))
// pop / rep by year, active fighters with rep>=50 ("established")
for (let y = 1; y <= 12; y++) { const v = all.flatMap((c) => c.snaps.filter((s) => s.y === y && s.status === 'active')); if (!v.length) continue; console.log('year', y, 'n', v.length, 'meanPop', (v.reduce((n, s) => n + s.pop, 0) / v.length).toFixed(1), 'pop>50', v.filter((s) => s.pop > 50).length, 'rep>60', v.filter((s) => s.rep > 60).length) }
// flags
console.log('flags: >40 fights', all.filter((c) => c.fights > 40).length, ' >55', all.filter((c) => c.fights > 55).length, ' retired<=1 fight', retired.filter((c) => c.fights <= 1).length, ' retiredAge>45', retired.filter((c) => c.retiredAge > 45).length, ' active>=40', all.filter((c) => c.retiredAge == null && c.snaps.length && c.snaps[c.snaps.length - 1].age >= 40).length)
console.log('max12 dist p50/p90/max', med(all.map((c) => c.maxFightsIn12)), q(all.map((c) => c.maxFightsIn12), .9), Math.max(...all.map((c) => c.maxFightsIn12)))
// prospect progression: young high-potential
const hp = all.filter((c) => c.startAge <= 22 && c.potential >= 70)
console.log('young high-pot n', hp.length, 'peakRep med', Math.round(med(hp.map((c) => c.peakRep))), 'p90', Math.round(q(hp.map((c) => c.peakRep), .9)), 'peakPop med', Math.round(med(hp.map((c) => c.peakPop))), 'p90', Math.round(q(hp.map((c) => c.peakPop), .9)), 'fights', med(hp.map((c) => c.fights)))
const lowp = all.filter((c) => c.startAge <= 22 && c.potential < 50)
console.log('young low-pot n', lowp.length, 'peakRep med', Math.round(med(lowp.map((c) => c.peakRep))), 'peakPop med', Math.round(med(lowp.map((c) => c.peakPop))))
// example arcs
const ex = (c) => { console.log(`-- ${c.id} potential ${c.potential} startAge ${c.startAge} fights ${c.fights} W-L ${c.wins}-${c.losses} contracts ${c.contracts} promos ${c.promos.length} retAge ${c.retiredAge}`); for (const s of c.snaps) console.log(`   y${s.y} age${s.age} ${s.w}-${s.l} pop${s.pop.toFixed(0)} rep${s.rep.toFixed(0)} val${s.value.toFixed(0)} purse ${s.purse ?? '-'} ${s.promo ?? 'FA'} f12=${s.fights12} ${s.status}`) }
const pick = (list, n) => list.slice(0, n)
console.log('\nPROSPECT arcs (young, high potential):'); pick(hp.filter((c) => c.snaps.length >= 8).sort((a, b) => b.peakRep - a.peakRep), 1).forEach(ex)
pick(hp.filter((c) => c.snaps.length >= 8).sort((a, b) => a.peakRep - b.peakRep), 1).forEach(ex)
console.log('\nVETERAN arc:'); pick(all.filter((c) => c.originallyInWorld && c.startAge >= 31 && c.peakRep >= 55 && c.snaps.length >= 4), 1).forEach(ex)
