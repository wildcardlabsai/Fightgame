/*
 * Living-world activity audit (Phase 6.1).
 * Usage: npx tsx scripts/audit/phase61-activity.ts [years=8] [seeds=6] [--first=1] [--prefix=act] [--json=out.json]
 * The player promotion does nothing, so only the world's own fighters, promotions and title bodies are measured.
 * Bouts are counted from record changes; availability from injury / suspension state, weekly.
 */
import { writeFileSync } from 'node:fs'
import { createNewGame } from '../../src/engine/worldgen'
import { advanceOneWeek } from '../../src/engine/tick'
import { careerStage } from '../../src/engine/fight/context'
import { qualifiesFor } from '../../src/engine/media/titles'
import { levelOf } from '../../src/engine/business/titleDefs'
import { aiTrace } from '../../src/engine/systems/aiFights'
import { BALANCE } from '../../src/engine/balance'
import { WEIGHT_CLASSES } from '../../src/data/weightClasses'
import type { Fighter, GameState } from '../../src/engine/types'

const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const years = Number(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 8)
const seeds = Number(process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 6)
const first = Number(arg('first', '1')), prefix = arg('prefix', 'act'), jsonOut = arg('json', '')
const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const nB = (f: Fighter) => f.record.wins + f.record.losses + f.record.draws
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0 }
const pct = (a: number, b: number) => (b ? (100 * a) / b : 0)
const f1 = (n: number) => n.toFixed(2)

interface Row { champ?: boolean; id: string; stage: string; contracted: boolean; tier: string; bouts: number; weeks: number; unavailWeeks: number; whole: boolean; gaps: number[] }
const rows: Row[] = []                        // one row per fighter-year, fighters in the AI world for the whole year
const zero24: { n: number; zero: number } = { n: 0, zero: 0 }
const zero12 = { n: 0, zero: 0 }
let retired = 0, intake = 0, ticks = 0, tickMs = 0
const popByWc: Record<string, number[]> = {}, faByWc: Record<string, number[]> = {}, credByWc: Record<string, number[]> = {}
const finEnd: Record<string, number> = {}
let collapsed = 0
const titleFights: Record<number, number> = {}, elimFights: Record<number, number> = {}
const vacancy: Record<string, { vacant: number; held: number; dormant: number }> = {}
const runs: { level: string; len: number }[] = []
const stat: Record<string, number> = {}
aiTrace.on = true; aiTrace.c = {}
const shareArg = process.argv.find((a) => a.startsWith('--share='))
if (shareArg) (BALANCE.fights.ai as { freeAgentCardShare: number }).freeAgentCardShare = Number(shareArg.split('=')[1])
if (process.argv.includes('--baseline')) (BALANCE.fights.ai as { freeAgentFill: boolean }).freeAgentFill = false

for (let seed = first; seed < first + seeds; seed++) {
  let s: GameState = createNewGame({ seed: `${prefix}-${seed}`, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
  const player = s.playerPromotionId
  const known = new Set(Object.keys(s.fighters))
  let snap = new Map<string, { b: number; last: number | null }>()
  const gapsByF = new Map<string, number[]>(), lastB = new Map<string, number>()
  const unav = new Map<string, number>()
  const seenCount = new Map<string, number>()
  const cur = new Map<string, { level: string; len: number }>()
  const keys = new Set<string>()
  const startB = new Map<string, number>(), startWeek = new Map<string, number>()
  const retiredYearStart = new Set<string>()
  const seenFights = new Set<string>()
  const w0 = new Map<string, number>() // bouts at week 0 for 24m window
  for (const f of Object.values(s.fighters)) { startB.set(f.id, nB(f)); w0.set(f.id, nB(f)) }
  let yrStartTodayFighters = new Set(Object.keys(s.fighters).filter((id) => s.fighters[id].status === 'active'))
  const boutsY = new Map<string, number>(), weeksY = new Map<string, number>()
  for (let w = 1; w <= years * 52; w++) {
    const t0 = Date.now(); s = advanceOneWeek(s); tickMs += Date.now() - t0; ticks++
    for (const f of Object.values(s.fighters)) {
      if (!known.has(f.id)) { known.add(f.id); intake++; startB.set(f.id, nB(f)); }
      const contractP = f.contractId ? s.contracts[f.contractId]?.promotionId : null
      const aiWorld = f.status === 'active' && contractP !== player
      const prev = snap.get(f.id)
      const nb = nB(f)
      if (prev && nb > prev.b) { for (let k = 0; k < nb - prev.b; k++) { boutsY.set(f.id, (boutsY.get(f.id) ?? 0) + 1) } const g = lastB.get(f.id); if (g !== undefined) (gapsByF.get(f.id) ?? gapsByF.set(f.id, []).get(f.id)!).push(w - g); lastB.set(f.id, w) }
      if (!lastB.has(f.id) && nb > (startB.get(f.id) ?? nb)) lastB.set(f.id, w)
      if (aiWorld) { weeksY.set(f.id, (weeksY.get(f.id) ?? 0) + 1); if (f.injury || (f.suspendedUntil !== null && f.suspendedUntil > s.today)) unav.set(f.id, (unav.get(f.id) ?? 0) + 1) }
      snap.set(f.id, { b: nb, last: f.lastFightDay })
    }
    for (const f of Object.values(s.fighters)) if (f.status === 'retired' && f.retiredDay !== null && f.retiredDay > s.today - 7 && f.retiredDay <= s.today && !retiredYearStart.has(f.id)) { retiredYearStart.add(f.id); retired++ }
    // title fights completed this week
    for (const fid of Object.keys(s.media!.titleFights)) { const ft = s.fights[fid]; if (ft?.result && !seenFights.has(fid)) { seenFights.add(fid); const y = Math.floor((w - 1) / 52); titleFights[y] = (titleFights[y] ?? 0) + 1; if (ft.title?.kind === 'eliminator') elimFights[y] = (elimFights[y] ?? 0) + 1 } }
    for (const [fid, b] of Object.entries(s.media!.elimFights ?? {})) { const ft = s.fights[fid]; if (ft?.result && !seenFights.has(`e${fid}`)) { seenFights.add(`e${fid}`); const y = Math.floor((w - 1) / 52); elimFights[y] = (elimFights[y] ?? 0) + 1; void b } }
    // vacancy
    for (const k of Object.keys(s.media!.titles)) keys.add(k)
    for (const k of keys) { const level = levelOf(k.split('|')[0]); const t = (vacancy[level] ??= { vacant: 0, held: 0, dormant: 0 }); const rec = s.media!.titles[k]; if (!rec) { t.dormant++; continue } if (rec.c) { t.held++; cur.delete(k); continue } t.vacant++; let r = cur.get(k); if (!r) { r = { level, len: 0 }; cur.set(k, r); runs.push(r) } r.len++ }
    if (w % 52 === 0) {
      // close the year: one row per fighter who was an active AI-world fighter at the start and still active now
      const yrNow = new Set(Object.keys(s.fighters).filter((id) => s.fighters[id].status === 'active'))
      for (const id of yrStartTodayFighters) {
        const f = s.fighters[id]
        if (!yrNow.has(id) || !f) continue
        const cp = f.contractId ? s.contracts[f.contractId]?.promotionId : null
        if (cp === player) continue
        const wk = weeksY.get(id) ?? 0
        if (wk < 50) continue
        const tier = cp ? s.promotions[cp]?.tier ?? '?' : 'free agent'
        rows.push({ champ: Object.values(s.media!.titles).some((r) => r.c === id), id, stage: careerStage(f, s.today), contracted: !!cp, tier, bouts: boutsY.get(id) ?? 0, weeks: wk, unavailWeeks: unav.get(id) ?? 0, whole: true, gaps: gapsByF.get(id) ?? [] })
        zero12.n++; if ((boutsY.get(id) ?? 0) === 0) zero12.zero++
      }
      if (w % 104 === 0) for (const id of yrStartTodayFighters) { const f = s.fighters[id]; if (!f || f.status !== 'active') continue; if ((w0.get(id) ?? 0) < 0) continue; const cp = f.contractId ? s.contracts[f.contractId]?.promotionId : null; if (cp === player) continue; zero24.n++; if (nB(f) === (w0.get(id) ?? nB(f))) zero24.zero++ }
      if (w % 104 === 0) for (const f of Object.values(s.fighters)) w0.set(f.id, nB(f))
      // population snapshot
      for (const wc of WEIGHT_CLASSES) {
        const all = Object.values(s.fighters).filter((f) => f.status === 'active' && f.weightClass === wc.id && (f.contractId ? s.contracts[f.contractId]?.promotionId !== player : true))
        ;(popByWc[wc.id] ??= []).push(all.length)
        ;(faByWc[wc.id] ??= []).push(all.filter((f) => !f.contractId).length)
        ;(credByWc[wc.id] ??= []).push(all.filter((f) => qualifiesFor(s, 'atlas', f.id)).length)
      }
      yrStartTodayFighters = yrNow
      boutsY.clear(); weeksY.clear(); unav.clear(); gapsByF.clear()
    }
  }
  for (const p of Object.values(s.promotions)) if (p.ai) { finEnd[p.ai.fin.state] = (finEnd[p.ai.fin.state] ?? 0) + 1; if (p.ai.fin.collapsing) collapsed++ }
}

const total = (r: Row[]) => r.length
const rate = (r: Row[]) => mean(r.map((x) => x.bouts))
const hist = (r: Row[]) => { const h = [0, 0, 0, 0, 0]; for (const x of r) h[Math.min(4, x.bouts)]++; return h.map((n) => `${Math.round(pct(n, r.length))}%`).join(' / ') }
const availRate = (r: Row[]) => { const w = r.reduce((a, x) => a + x.weeks, 0), u = r.reduce((a, x) => a + x.unavailWeeks, 0); return { unavailPct: pct(u, w), perAvail: r.reduce((a, x) => a + x.bouts, 0) / Math.max(1, (w - u) / 52) } }
const out: Record<string, unknown> = {}
console.log(`activity audit: ${seeds} seeds x ${years} years, prefix ${prefix}${first}.. (${Math.round(tickMs / 1000)}s sim, ${(tickMs / ticks).toFixed(1)} ms/week)`)
console.log(`fighter-years (active whole year, AI world): ${total(rows)}`)
console.log(`bouts per fighter-year: mean ${f1(rate(rows))} median ${med(rows.map((x) => x.bouts))}   distribution 0 / 1 / 2 / 3 / 4+ : ${hist(rows)}`)
const av = availRate(rows); console.log(`unavailable (injured/suspended) ${av.unavailPct.toFixed(1)}% of fighter-weeks; bouts per AVAILABLE fighter-year ${f1(av.perAvail)}`)
console.log(`zero bouts in 12 months: ${pct(zero12.zero, zero12.n).toFixed(1)}% (n=${zero12.n});  in 24 months: ${pct(zero24.zero, zero24.n).toFixed(1)}% (n=${zero24.n})`)
const groups = (key: (r: Row) => string) => { const m: Record<string, Row[]> = {}; for (const r of rows) (m[key(r)] ??= []).push(r); return m }
console.log('by contract / tier:  n  mean  zero%  unavail%  mean-gap(wk)')
for (const [k, r] of Object.entries(groups((x) => x.tier)).sort()) { const gaps = r.flatMap((x) => x.gaps); console.log(`  ${k.padEnd(12)} ${String(r.length).padStart(6)} ${f1(rate(r)).padStart(5)} ${pct(r.filter((x) => x.bouts === 0).length, r.length).toFixed(0).padStart(5)}% ${availRate(r).unavailPct.toFixed(0).padStart(7)}%  ${gaps.length ? f1(mean(gaps)) : '-'}`) }
console.log('by career stage:')
for (const [k, r] of Object.entries(groups((x) => x.stage)).sort()) { const gaps = r.flatMap((x) => x.gaps); console.log(`  ${k.padEnd(12)} ${String(r.length).padStart(6)} ${f1(rate(r)).padStart(5)} ${pct(r.filter((x) => x.bouts === 0).length, r.length).toFixed(0).padStart(5)}% ${availRate(r).unavailPct.toFixed(0).padStart(7)}%  ${gaps.length ? f1(mean(gaps)) : '-'}`) }
{ const ch = rows.filter((x) => x.champ), nc = rows.filter((x) => !x.champ); console.log(`champions (hold a belt at year end): n=${ch.length}, mean bouts ${f1(rate(ch))}, zero ${pct(ch.filter((x) => x.bouts === 0).length, ch.length).toFixed(0)}%; everyone else ${f1(rate(nc))}`) }
console.log('stage x contract:')
for (const [k, r] of Object.entries(groups((x) => `${x.stage.padEnd(9)} ${x.contracted ? 'contracted' : 'free agent'}`)).sort()) console.log(`  ${k.padEnd(22)} ${String(r.length).padStart(6)} ${f1(rate(r)).padStart(5)} ${pct(r.filter((x) => x.bouts === 0).length, r.length).toFixed(0).padStart(5)}%`)
const wcs = WEIGHT_CLASSES.map((w) => w.id)
console.log(`division population (mean active AI-world fighters): ${f1(mean(wcs.map((w) => mean(popByWc[w] ?? []))))};  free agents ${f1(mean(wcs.map((w) => mean(faByWc[w] ?? []))))};  credible world challengers per division ${f1(mean(wcs.map((w) => mean(credByWc[w] ?? []))))} (min ${f1(Math.min(...wcs.map((w) => mean(credByWc[w] ?? []))))}, max ${f1(Math.max(...wcs.map((w) => mean(credByWc[w] ?? []))))})`)
console.log(`title fights per world-year: ${f1(mean(Object.values(titleFights)) / seeds)} per seed-year;  eliminators ${f1(mean(Object.values(elimFights)) / seeds)};  retirements per seed-year ${f1(retired / seeds / years)};  intake per seed-year ${f1(intake / seeds / years)}`)
console.log('belt-weeks:  level  held  vacant  vacant%  episodes median p90 max')
for (const lvl of ['world', 'european', 'domestic', 'area']) { const t = vacancy[lvl]; if (!t) continue; const rs = runs.filter((r) => r.level === lvl).map((r) => r.len).sort((a, b) => a - b); console.log(`  ${lvl.padEnd(9)} ${String(t.held).padStart(7)} ${String(t.vacant).padStart(7)} ${pct(t.vacant, t.held + t.vacant).toFixed(0).padStart(6)}%  ${String(rs.length).padStart(5)} ${String(med(rs)).padStart(5)} ${String(rs[Math.floor(rs.length * 0.9)] ?? 0).padStart(4)} ${String(rs[rs.length - 1] ?? 0).padStart(4)}`) }
console.log(`AI promotions at end: ${JSON.stringify(finEnd)} (collapsing ${collapsed})`)
const tc = aiTrace.c
console.log('matchmaking trace (per seed-year): ' + Object.entries(tc).filter(([k]) => !k.startsWith('ev.needy') && !k.startsWith('ev.fights')).sort().map(([k, v]) => `${k}=${(v / seeds / years).toFixed(0)}`).join(' '))
console.log('event card sizes: ' + Object.entries(tc).filter(([k]) => k.startsWith('ev.fights')).sort().map(([k, v]) => `${k.slice(10)}:${v}`).join(' ') + '   needy at planning: ' + Object.entries(tc).filter(([k]) => k.startsWith('ev.needy')).sort((a, b) => Number(a[0].slice(9)) - Number(b[0].slice(9))).map(([k, v]) => `${k.slice(9)}:${v}`).join(' '))
if (jsonOut) { Object.assign(out, { seeds, years, fighterYears: rows.length, meanBouts: rate(rows), zero12: pct(zero12.zero, zero12.n), zero24: pct(zero24.zero, zero24.n), trace: tc }); writeFileSync(jsonOut, JSON.stringify(out, null, 1)) }
