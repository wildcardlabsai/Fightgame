/*
 * Fighter-development and championship-pipeline audit (Phase 6.5).
 * Usage: npx tsx scripts/audit/phase65-pipeline.ts [years=8] [seeds=6] [--first=1] [--prefix=act] [--json=out.json]
 * The player promotion does nothing, so only the world's own fighters, promotions and title bodies are measured (same seeds and run length as the
 * Phase 6.1 activity baseline: prefix act, seeds 1-6, 8 years; held-out: --first=11). Audit-only: it reads true attributes (potential) to diagnose
 * generation versus development; nothing here is available to the game's views.
 *
 * Measures: population by division and career stage; fighters meeting each eligibility floor and credible contenders; belt vacancy and duration;
 * a prospect cohort (<= 6 fights when first seen) followed to the floor / to credible, by hidden-potential band; wins, losses and opposition by
 * career stage; retirement and intake; mandatory orders, eliminators and title fights; promotion health; ms per week.
 */
import { writeFileSync } from 'node:fs'
import { createNewGame } from '../../src/engine/worldgen'
import { advanceOneWeek } from '../../src/engine/tick'
import { careerStage } from '../../src/engine/fighters'
import { assessChallenger } from '../../src/engine/business/contender'
import { experienceGap, levelOf, type TitleLevel } from '../../src/engine/business/titleDefs'
import { WEIGHT_CLASSES } from '../../src/data/weightClasses'
import type { Fighter, GameState } from '../../src/engine/types'

const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const years = Number(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 8)
const seeds = Number(process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 6)
const first = Number(arg('first', '1')), prefix = arg('prefix', 'act'), jsonOut = arg('json', '')
import { BALANCE } from '../../src/engine/balance'
const devArg = process.argv.find((a) => a.startsWith('--dev='))
if (devArg) (BALANCE.fights.ai as { developmentPriority: number }).developmentPriority = Number(devArg.split('=')[1])
const idleArg = process.argv.find((a) => a.startsWith('--idle='))
if (idleArg) (BALANCE.fights.ai as { minIdleWeeks: number }).minIdleWeeks = Number(idleArg.split('=')[1])
const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const nB = (f: Fighter) => f.record.wins + f.record.losses + f.record.draws
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0 }
const pct = (a: number, b: number) => (b ? (100 * a) / b : 0)
const f1 = (n: number) => n.toFixed(1)
const LEVELS: TitleLevel[] = ['area', 'domestic', 'european', 'world']
const REP_BODY: Record<TitleLevel, string> = { area: 'area_wal', domestic: 'british', european: 'european', world: 'atlas' }

// ---- accumulators (all across seeds)
const snaps = { n: 0, byStage: {} as Record<string, number>, perDiv: [] as number[], floor: { area: 0, domestic: 0, european: 0, world: 0 } as Record<string, number>, credWorld: 0, credEuro: 0, credDom: 0, credArea: 0, perDivCred: [] as number[] }
const vacancy: Record<string, { vacant: number; held: number }> = {}
const runs: { level: string; len: number }[] = []
const stage: Record<string, { n: number; wins: number; losses: number; draws: number; oppRep: number; ownRep: number }> = {}
let retired = 0, intake = 0, ticks = 0, tickMs = 0, collapsed = 0
const finEnd: Record<string, number> = {}
let titleFights = 0, elimFights = 0, mandOrders = 0, elimOrders = 0, mandFought = 0
interface Coh { id: string; pot: number; start: number; floorAt: number | null; credAt: number | null; ret: number | null; wc: string; endActive: boolean; endFloor: boolean; endCred: boolean; fights: number; startFights: number; wins: number; losses: number; endTotal: number; endWins: number; ageAtFloor: number | null; wkSigned: number; wkFree: number; bSigned: number; bFree: number }
const cohort: Coh[] = []

for (let seed = first; seed < first + seeds; seed++) {
  let s: GameState = createNewGame({ seed: `${prefix}-${seed}`, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
  const player = s.playerPromotionId
  const known = new Set(Object.keys(s.fighters))
  const cur = new Map<string, { level: string; len: number }>()
  const mandSeen = new Set<string>(), elimSeen = new Set<string>(), seenFight = new Set<string>()
  const retiredSeen = new Set<string>()
  const track = new Map<string, Coh>()
  const addToCohort = (f: Fighter, w: number) => { if (track.has(f.id) || nB(f) > 6 || f.status !== 'active') return; const c: Coh = { id: f.id, pot: f.potential, start: w, floorAt: null, credAt: null, ret: null, wc: f.weightClass, endActive: true, endFloor: false, endCred: false, fights: 0, startFights: nB(f), wins: 0, losses: 0, endTotal: nB(f), endWins: f.record.wins, ageAtFloor: null, wkSigned: 0, wkFree: 0, bSigned: 0, bFree: 0 }; track.set(f.id, c); cohort.push(c) }
  for (let w = 1; w <= years * 52; w++) {
    const t0 = Date.now(); s = advanceOneWeek(s); tickMs += Date.now() - t0; ticks++
    if (w === 1) for (const f of Object.values(s.fighters)) if (f.status === 'active') addToCohort(f, w) // the opening world's own prospects
    for (const f of Object.values(s.fighters)) {
      if (!known.has(f.id)) { known.add(f.id); intake++; if (w > 1) addToCohort(f, w) }
      if (f.status === 'retired' && f.retiredDay !== null && f.retiredDay > s.today - 7 && f.retiredDay <= s.today && !retiredSeen.has(f.id)) { retiredSeen.add(f.id); retired++; const c = track.get(f.id); if (c) { c.ret = w; c.endActive = false } }
    }
    // cohort: when did each reach the world floor, and credible?
    for (const c of track.values()) {
      const f = s.fighters[c.id]
      if (!f || f.status !== 'active') continue
      if (f.contractId) c.wkSigned++; else c.wkFree++
      if (c.floorAt === null && !experienceGap('world', f.record)) { c.floorAt = w; c.ageAtFloor = (s.today - f.birthDay) / 365.25 }
      if (c.credAt === null && c.floorAt !== null && w % 4 === 0 && assessChallenger(s, 'atlas', f.id).tier === 'contender') c.credAt = w
    }
    // results of the week: stage-by-stage wins, losses and opposition
    for (const ft of Object.values(s.fights)) {
      if (!ft.result || ft.processedDay !== s.today || seenFight.has(ft.id)) continue
      seenFight.add(ft.id)
      const r = ft.result
      for (const side of [0, 1] as const) {
        const f = s.fighters[side === 0 ? ft.sideA.fighterId : ft.sideB.fighterId]
        const me = side === 0 ? ft.sideA : ft.sideB, opp = side === 0 ? ft.sideB : ft.sideA
        const cp = f?.contractId ? s.contracts[f.contractId]?.promotionId : null
        if (!f || cp === player) continue
        const st = careerStage(f, s.today)
        const g = (stage[st] ??= { n: 0, wins: 0, losses: 0, draws: 0, oppRep: 0, ownRep: 0 })
        g.n++; g.oppRep += opp.preRep; g.ownRep += me.preRep
        if (r.winner === null) g.draws++; else if (r.winner === side) g.wins++; else g.losses++
        const c = track.get(f.id); if (c) { c.fights++; if (f.contractId) c.bSigned++; else c.bFree++; if (r.winner === side) c.wins++; else if (r.winner !== null) c.losses++ }
      }
    }
    // titles: fights, orders, vacancy
    for (const fid of Object.keys(s.media!.titleFights)) { const ft = s.fights[fid]; if (ft?.result && !seenFight.has(`t${fid}`)) { seenFight.add(`t${fid}`); titleFights++; if (ft.title?.kind === 'eliminator') elimFights++ } }
    for (const [fid] of Object.entries(s.media!.elimFights ?? {})) { const ft = s.fights[fid]; if (ft?.result && !seenFight.has(`e${fid}`)) { seenFight.add(`e${fid}`); elimFights++ } }
    for (const [k, rec] of Object.entries(s.media!.titles)) {
      if (rec.mand) { const key = `${k}|${rec.mand.challenger}|${rec.mand.ordered}`; if (!mandSeen.has(key)) { mandSeen.add(key); mandOrders++ } }
      if (rec.elim) { const key = `${k}|${rec.elim.a}|${rec.elim.b}|${rec.elim.ordered}`; if (!elimSeen.has(key)) { elimSeen.add(key); elimOrders++ } }
      const level = levelOf(k.split('|')[0]); const t = (vacancy[level] ??= { vacant: 0, held: 0 })
      if (rec.c) { t.held++; cur.delete(k) } else { t.vacant++; let r = cur.get(k); if (!r) { r = { level, len: 0 }; cur.set(k, r); runs.push(r) } r.len++ }
    }
    if (w % 52 === 0) {
      const act = Object.values(s.fighters).filter((f) => f.status === 'active' && (f.contractId ? s.contracts[f.contractId]?.promotionId !== player : true))
      snaps.n++
      for (const f of act) { const st = careerStage(f, s.today); snaps.byStage[st] = (snaps.byStage[st] ?? 0) + 1 }
      for (const wc of WEIGHT_CLASSES) {
        const d = act.filter((f) => f.weightClass === wc.id)
        snaps.perDiv.push(d.length)
        let cw = 0
        for (const f of d) {
          for (const lv of LEVELS) if (!experienceGap(lv, f.record)) snaps.floor[lv]++
          if (!experienceGap('world', f.record) && assessChallenger(s, 'atlas', f.id).tier === 'contender') { snaps.credWorld++; cw++ }
          if (!experienceGap('european', f.record) && assessChallenger(s, REP_BODY.european, f.id).tier === 'contender') snaps.credEuro++
          if (!experienceGap('domestic', f.record) && assessChallenger(s, REP_BODY.domestic, f.id).tier === 'contender') snaps.credDom++
          if (!experienceGap('area', f.record) && assessChallenger(s, REP_BODY.area, f.id).tier === 'contender') snaps.credArea++
        }
        snaps.perDivCred.push(cw)
      }
    }
  }
  for (const c of track.values()) { const f = s.fighters[c.id]; c.endActive = !!f && f.status === 'active'; c.endFloor = c.floorAt !== null; c.endCred = c.credAt !== null; if (f) { c.endTotal = nB(f); c.endWins = f.record.wins } }
  for (const p of Object.values(s.promotions)) if (p.ai) { finEnd[p.ai.fin.state] = (finEnd[p.ai.fin.state] ?? 0) + 1; if (p.ai.fin.collapsing) collapsed++ }
}

const nd = snaps.n * WEIGHT_CLASSES.length
const out: Record<string, unknown> = {}
const sy = seeds * years
console.log(`pipeline audit: ${seeds} seeds x ${years} years, prefix ${prefix}${first}.. (${Math.round(tickMs / 1000)}s sim, ${(tickMs / ticks).toFixed(1)} ms/week)`)
console.log(`active AI-world fighters per seed-year-end: ${f1(mean(snaps.perDiv) * WEIGHT_CLASSES.length)} (${f1(mean(snaps.perDiv))} per division)   by stage: ${Object.entries(snaps.byStage).sort().map(([k, v]) => `${k} ${f1(v / snaps.n)}`).join(', ')}`)
console.log(`per division per year-end - meeting floor: ${LEVELS.map((l) => `${l} ${f1(snaps.floor[l] / nd)}`).join(', ')}`)
console.log(`per division per year-end - credible contenders: world ${f1(snaps.credWorld / nd)} (min div-mean ${f1(Math.min(...WEIGHT_CLASSES.map((_, i) => mean(snaps.perDivCred.filter((__, j) => j % WEIGHT_CLASSES.length === i)))))}), european ${f1(snaps.credEuro / nd)}, domestic ${f1(snaps.credDom / nd)}, area ${f1(snaps.credArea / nd)}`)
console.log('belt-weeks:  level  held  vacant  vacant%  episodes median p90 max')
for (const lvl of ['world', 'european', 'domestic', 'area']) { const t = vacancy[lvl]; if (!t) continue; const rs = runs.filter((r) => r.level === lvl).map((r) => r.len).sort((a, b) => a - b); console.log(`  ${lvl.padEnd(9)} ${String(t.held).padStart(7)} ${String(t.vacant).padStart(7)} ${pct(t.vacant, t.held + t.vacant).toFixed(0).padStart(6)}%  ${String(rs.length).padStart(5)} ${String(med(rs)).padStart(5)} ${String(rs[Math.floor(rs.length * 0.9)] ?? 0).padStart(4)} ${String(rs[rs.length - 1] ?? 0).padStart(4)}`) }
console.log('by career stage (fights seen, win%, loss%, draw%, mean own rep, mean opponent rep):')
for (const [k, g] of Object.entries(stage).sort()) console.log(`  ${k.padEnd(9)} n=${String(g.n).padStart(6)}  W ${pct(g.wins, g.n).toFixed(0)}%  L ${pct(g.losses, g.n).toFixed(0)}%  D ${pct(g.draws, g.n).toFixed(0)}%  own ${f1(g.ownRep / g.n)}  opp ${f1(g.oppRep / g.n)}`)
// prospect cohort
const horizon = (c: Coh) => years * 52 - c.start
const band = (p: number) => (p >= 75 ? 'potential 75+' : p >= 62 ? 'potential 62-75' : 'potential <62')
console.log(`prospect cohort (<= 6 fights when first seen; n=${cohort.length}): outcome by end of run`)
const bands = ['potential 75+', 'potential 62-75', 'potential <62']
for (const b of ['all', ...bands]) {
  const cs = cohort.filter((c) => b === 'all' || band(c.pot) === b)
  if (!cs.length) continue
  const ret = cs.filter((c) => c.ret !== null && !c.endFloor).length
  const fl = cs.filter((c) => c.endFloor).length, cr = cs.filter((c) => c.endCred).length
  const still = cs.filter((c) => c.endActive && !c.endFloor).length
  const tFl = cs.filter((c) => c.floorAt !== null).map((c) => (c.floorAt! - c.start) / 52), tCr = cs.filter((c) => c.credAt !== null).map((c) => (c.credAt! - c.start) / 52)
  console.log(`  ${b.padEnd(16)} n=${String(cs.length).padStart(4)}  retired before floor ${pct(ret, cs.length).toFixed(0)}%  reached world floor ${pct(fl, cs.length).toFixed(0)}% (median ${f1(med(tFl))}y)  credible world ${pct(cr, cs.length).toFixed(0)}% (median ${f1(med(tCr))}y)  still active below floor ${pct(still, cs.length).toFixed(0)}%`)
}
for (const b of bands) {
  const cs = cohort.filter((c) => band(c.pot) === b && c.endActive && !c.endFloor)
  if (!cs.length) continue
  const byFights = cs.filter((c) => c.endTotal < 14).length, byWins = cs.filter((c) => c.endTotal >= 14 && c.endWins < 9).length
  console.log(`  ${b.padEnd(16)} still below the world floor at the end (n=${cs.length}): short of 14 fights ${pct(byFights, cs.length).toFixed(0)}%, enough fights but short of 9 wins ${pct(byWins, cs.length).toFixed(0)}%; mean fights now ${f1(mean(cs.map((c) => c.endTotal)))}`)
}
for (const b of bands) { const cs = cohort.filter((c) => band(c.pot) === b); if (!cs.length) continue; const fy = cs.map((c) => c.fights / Math.max(0.5, ((c.ret ?? years * 52) - c.start) / 52)); const wn = cs.reduce((a, c) => a + c.wins, 0), tot = cs.reduce((a, c) => a + c.fights, 0); const af = cs.filter((c) => c.ageAtFloor !== null).map((c) => c.ageAtFloor!); console.log(`  ${b.padEnd(16)} fights per year ${f1(mean(fy))}, win share ${pct(wn, tot).toFixed(0)}%, median age at world floor ${af.length ? f1(med(af)) : '-'}`) }
for (const b of bands) { const cs = cohort.filter((c) => band(c.pot) === b); if (!cs.length) continue; const ws = cs.reduce((a, c) => a + c.wkSigned, 0), wf = cs.reduce((a, c) => a + c.wkFree, 0), bs = cs.reduce((a, c) => a + c.bSigned, 0), bf = cs.reduce((a, c) => a + c.bFree, 0)
  console.log(`  ${b.padEnd(16)} time under contract ${pct(ws, ws + wf).toFixed(0)}%; fights per year signed ${f1(bs / Math.max(1, ws / 52))}, unsigned ${f1(bf / Math.max(1, wf / 52))}`) }
{ const long = cohort.filter((c) => horizon(c) >= 5 * 52); const f2 = (fn: (c: Coh) => boolean) => pct(long.filter(fn).length, long.length).toFixed(0)
  console.log(`  cohort with >= 5 years of observation (n=${long.length}): reached floor ${f2((c) => c.endFloor)}%, credible ${f2((c) => c.endCred)}%, retired ${f2((c) => c.ret !== null)}%, fights/yr while active ${f1(mean(long.map((c) => c.fights / Math.max(1, ((c.ret ?? years * 52) - c.start) / 52))))}`) }
console.log(`title fights per seed-year ${f1(titleFights / sy)}; eliminator fights ${f1(elimFights / sy)}; eliminator orders ${f1(elimOrders / sy)}; mandatory orders ${f1(mandOrders / sy)}; retirements per seed-year ${f1(retired / sy)}; intake ${f1(intake / sy)}`)
console.log(`AI promotions at end: ${JSON.stringify(finEnd)} (collapsing ${collapsed})`)
if (jsonOut) { Object.assign(out, { seeds, years }); writeFileSync(jsonOut, JSON.stringify(out, null, 1)) }
