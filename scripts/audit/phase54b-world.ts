/*
 * Living-world audit (Phase 5.4B): the boxing industry beyond the player's promotion, over several seeds and years.
 * Usage: npx tsx scripts/audit/phase54b-world.ts [years=5] [seeds=5]
 * Reproducible: seeds "world-1".."world-N", the balanced bot plays the promotion. Nothing here changes the game.
 */
import { createNewGame } from '../../src/engine/worldgen'
import { advanceOneWeek } from '../../src/engine/tick'
import { newLog, playWeek, STRATEGIES } from '../../src/engine/sim/strategies'
import { fighterAge, fighterRating } from '../../src/engine/fighters'
import { WEIGHT_CLASSES } from '../../src/data/weightClasses'
import type { GameState } from '../../src/engine/types'

const years = Number(process.argv[2] ?? 5), seeds = Number(process.argv[3] ?? 5)
const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const stage = (s: GameState, f: { record: { wins: number; losses: number; draws: number } }, age: number) => {
  const n = f.record.wins + f.record.losses + f.record.draws
  return n < 6 ? 'prospect' : age >= 34 ? 'veteran' : n < 20 ? 'rising' : 'prime'
}
const rivals0 = (s: GameState) => Object.values(s.promotions).filter((p) => !p.isPlayer)
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
const pct = (a: number, b: number) => (b ? (100 * a / b).toFixed(0) + '%' : '–')
const T0 = Date.now()
const agg: Record<string, number[]> = {}
const add = (k: string, v: number) => (agg[k] ??= []).push(v)
for (let k = 1; k <= seeds; k++) {
  let s = createNewGame({ seed: `world-${k}`, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
  const log = newLog()
  const seenPro = new Set<string>(), seenRetire = new Set<string>()
  const startCount = Object.keys(s.fighters).length
  const yearly: string[] = []
  let yEvents = 0, yAiFightsDone = 0, ySignAi = 0, ySignMe = 0, yTurnedPro = 0, yRetired = 0, yExpired = 0, yReleased = 0
  const seenEv = new Set<string>(), seenSign = new Set<string>()
  let minCash = Infinity, negCash = 0
  const liveP: Record<string, string> = {}
  const pur = { started: 0, rivalWon: 0, playerWon: 0, lapsed: 0, onRadar: 0 }
  for (let w = 1; w <= years * 52; w++) {
    s = playWeek(s, STRATEGIES.balanced, log); s = advanceOneWeek(s)
    for (const ev of Object.values(s.events)) if (ev.promotionId !== s.playerPromotionId && !seenEv.has(ev.id) && ev.status !== 'planning') { seenEv.add(ev.id); yEvents++ }
    for (const f of Object.values(s.fighters)) {
      for (const h of f.history) {
        const key = `${f.id}|${h.day}|${h.kind}`
        if (seenSign.has(key)) continue; seenSign.add(key)
        if (h.kind === 'signed') (h.promotionId === s.playerPromotionId ? ySignMe++ : ySignAi++)
        if (h.kind === 'turnedPro') yTurnedPro++
        if (h.kind === 'retired') yRetired++
        if (h.kind === 'expired') yExpired++
        if (h.kind === 'released') yReleased++
      }
    }
    for (const [fid, p] of Object.entries(s.world?.pursuits ?? {})) if (!liveP[fid]) { liveP[fid] = p.promoId; pur.started++; if (s.knowledge[fid]) pur.onRadar++ }
    for (const fid of Object.keys(liveP)) if (!s.world?.pursuits[fid]) {
      const c = s.fighters[fid].contractId ? s.contracts[s.fighters[fid].contractId!] : null
      if (!c) pur.lapsed++; else if (c.promotionId === s.playerPromotionId) pur.playerWon++; else if (c.promotionId === liveP[fid]) pur.rivalWon++; else pur.lapsed++
      delete liveP[fid]
    }
    for (const p of Object.values(s.promotions)) if (!p.isPlayer) { minCash = Math.min(minCash, p.cash); if (p.cash < 0) negCash++ }
    if (w % 52 === 0) {
      const act = Object.values(s.fighters).filter((f) => f.status === 'active')
      const fa = act.filter((f) => f.contractId === null)
      const st: Record<string, number> = {}
      for (const f of act) { const a = fighterAge(f, s.today); const g = stage(s, f, a); st[g] = (st[g] ?? 0) + 1 }
      const div: Record<string, number> = {}
      for (const f of act) div[f.weightClass] = (div[f.weightClass] ?? 0) + 1
      const rivals = Object.values(s.promotions).filter((p) => !p.isPlayer)
      const fin: Record<string, number> = {}
      for (const p of rivals) fin[p.ai!.fin.state] = (fin[p.ai!.fin.state] ?? 0) + 1
      const wsum = WEIGHT_CLASSES.reduce((a, w) => a + w.weight, 0)
      const fill = WEIGHT_CLASSES.map((w) => (div[w.id] ?? 0) / (act.length * w.weight / wsum))
      const thin = fill.filter((r) => r < 0.6).length
      const rated55 = act.filter((f) => fighterRating(f) >= 55).length, rated65 = act.filter((f) => fighterRating(f) >= 65).length
      const faGood = fa.filter((f) => fighterRating(f) >= 55).length
      const alive = rivals0(s).filter((p) => !p.ai!.fin.collapsing).length
      const done = Object.values(s.fights).filter((f) => f.result).length
      const mePro = fa.filter((f) => (s.knowledge[f.id]?.reports.length ?? 0) > 0).length
      yearly.push(`y${w / 52}: fighters ${Object.keys(s.fighters).length} active ${act.length} FA ${fa.length} stage ${JSON.stringify(st)} thinDivs(<60% of share) ${thin} minFill ${Math.min(...fill).toFixed(2)} r55 ${rated55} r65 ${rated65} FAr55 ${faGood} alive ${alive} fightsRecorded ${done} rivalEvents ${yEvents} signAI ${ySignAi} signMe ${ySignMe} pro ${yTurnedPro} retired ${yRetired} expired ${yExpired} released ${yReleased} fin ${JSON.stringify(fin)} scoutedFA ${mePro}`)
      add('active', act.length); add('fa', fa.length); add('events', yEvents); add('signAI', ySignAi); add('signMe', ySignMe); add('pro', yTurnedPro); add('retired', yRetired)
      yEvents = ySignAi = ySignMe = yTurnedPro = yRetired = yExpired = yReleased = 0
    }
  }
  const rivals = Object.values(s.promotions).filter((p) => !p.isPlayer)
  const cash = rivals.map((p) => Math.round(p.cash / 1000))
  console.log(`seed world-${k}: start fighters ${startCount} -> ${Object.keys(s.fighters).length}; rivals ${rivals.length}; rival cash(k) min ${Math.min(...cash)} max ${Math.max(...cash)}; negative-cash promo-weeks ${negCash}; collapsing ${rivals.filter((p) => p.ai!.fin.collapsing).length}`)
  for (const y of yearly) console.log('  ' + y)
  console.log(`  pursuits ${JSON.stringify(pur)}`)
  for (const p of rivals.filter((x) => x.foundedDay > s.startDay)) console.log(`  founded: ${p.name} fin ${p.ai!.fin.state}${p.ai!.fin.collapsing ? ' (collapsing)' : ''} tier ${p.tier} roster ${Object.values(s.contracts).filter((c) => c.promotionId === p.id).length} events ${p.stats.events} rep ${p.reputation.toFixed(0)} cash ${Math.round(p.cash / 1000)}k`)
}
const avg = (k: string) => (sum(agg[k]) / agg[k].length).toFixed(1)
console.log(`\nPer seed-year averages: active ${avg('active')} FA ${avg('fa')} rivalEvents ${avg('events')} AIsignings ${avg('signAI')} playerSignings ${avg('signMe')} newPros ${avg('pro')} retirements ${avg('retired')}`)
console.log(`wall time ${((Date.now() - T0) / 1000).toFixed(0)}s`)
