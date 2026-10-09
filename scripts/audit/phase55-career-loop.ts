/*
 * Integrated career-loop audit (Phase 5.5): does the world stay coherent and playable over 5-15 years?
 * Usage: npx tsx scripts/audit/phase55-career-loop.ts [years=10] [seeds=4] [--bot] [--first=1]
 * --bot: the balanced bot runs the player's promotion (shows, signings, fight offers); otherwise the player is passive.
 */
import { createNewGame } from '../../src/engine/worldgen'
import { advanceOneWeek } from '../../src/engine/tick'
import { newLog, playWeek, STRATEGIES } from '../../src/engine/sim/strategies'
import { auditWorld } from '../../src/engine/business/audit'
import { contenderStatus } from '../../src/engine/business/titleEco'
import { getReigns, getCareer } from '../../src/engine/media/records'
import { fighterAge } from '../../src/engine/fighters'
import { isDefunct } from '../../src/engine/world/lifecycle'
import { acceptOffer, isLive } from '../../src/engine/office/offers'
import { rosterOf } from '../../src/engine/media/requests'
import type { Fighter, GameState } from '../../src/engine/types'

const years = Number(process.argv[2] ?? 10), seeds = Number(process.argv[3] ?? 4), bot = process.argv.includes('--bot')
const first = Number(process.argv.find((a) => a.startsWith('--first='))?.split('=')[1] ?? 1)
const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const tot: Record<string, number> = {}
const add = (k: string, v = 1) => (tot[k] = (tot[k] ?? 0) + v)
const issues = new Map<string, number>()
const total = (f: Fighter) => f.record.wins + f.record.losses + f.record.draws
const T0 = Date.now()

for (let k = first; k < first + seeds; k++) {
  let s: GameState = createNewGame({ seed: `loop-${k}`, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
  const log = newLog()
  const seenFights = new Set<string>()
  const runs = new Map<string, { n: number; best: number }>() // consecutive lopsided bouts per fighter
  let cohort: string[] | null = null
  const cohortStart: Record<string, number> = {}
  let minCash = Infinity, negWeeks = 0
  const startCash = s.promotions[s.playerPromotionId].cash
  let offersSeen = new Set<string>()
  for (let w = 1; w <= years * 52; w++) {
    if (bot) {
      s = playWeek(s, STRATEGIES.balanced, log)
      // the bot also answers fight offers: accept the first live one it can afford
      const live = Object.values(s.office?.offers ?? {}).filter((o) => isLive(o) && o.status === 'open')
      for (const o of live) { if (!offersSeen.has(o.id)) { offersSeen.add(o.id); add('offers.seen') } }
      const o1 = live[0]
      if (o1) { const r = acceptOffer(s, o1.id); if (r.ok) { s = r.state; add('offers.accepted') } }
    }
    s = advanceOneWeek(s)
    const cash = s.promotions[s.playerPromotionId].cash
    minCash = Math.min(minCash, cash); if (cash < 0) negWeeks++
    for (const f of Object.values(s.fights)) {
      if (!f.result || f.status !== 'postFight' || seenFights.has(f.id)) continue
      seenFights.add(f.id); add('fights')
      const p = f.result.pExpA
      const lop = p < 0.15 || p > 0.85
      if (lop) add('fights.lopsided')
      if (f.title) add('fights.title')
      for (const [i, id] of [f.sideA.fighterId, f.sideB.fighterId].entries()) {
        const pw = i === 0 ? p : 1 - p
        const r = runs.get(id) ?? { n: 0, best: 0 }
        r.n = pw < 0.2 || pw > 0.8 ? r.n + 1 : 0; r.best = Math.max(r.best, r.n); runs.set(id, r)
      }
    }
    if (w === 52) {
      cohort = Object.values(s.fighters).filter((f) => f.status === 'active' && total(f) <= 4 && fighterAge(f, s.today) <= 24).map((f) => f.id)
      for (const id of cohort) cohortStart[id] = s.today
    }
    if (w % 26 === 0) {
      add('samples')
      for (const m of auditWorld(s)) issues.set(m.replace(/f_[0-9a-z]+/g, 'F').slice(0, 90), (issues.get(m.replace(/f_[0-9a-z]+/g, 'F').slice(0, 90)) ?? 0) + 1)
      const act = Object.values(s.fighters).filter((f) => f.status === 'active')
      for (const f of act) {
        if (!f.contractId) continue
        const idle = f.lastFightDay === null ? 0 : (s.today - f.lastFightDay) / 7
        const mine = s.contracts[f.contractId].promotionId === s.playerPromotionId
        add(mine ? 'contracted.mine' : 'contracted.rival')
        if (idle > 52 && fighterAge(f, s.today) <= 36) add(mine ? 'idle52.mine' : 'idle52.rival')
      }
      let vac = 0, belts = 0
      for (const [key, rec] of Object.entries(s.media!.titles)) { belts++; if (!rec.c) vac++; else if (key.includes('x')) void 0 }
      add('belts', belts); add('belts.vacant', vac)
      const rivals = Object.values(s.promotions).filter((p) => !p.isPlayer)
      add('rivals.samples', rivals.length); add('rivals.defunct', rivals.filter((p) => isDefunct(s, p)).length)
      add('rivals.negativeCash', rivals.filter((p) => p.cash < 0).length)
      add('rated55', act.filter((f) => f.reputation >= 55 || f.popularity >= 55).length)
      add('roster.mine', rosterOf(s).length)
    }
  }
  // outcomes
  const reigns = getReigns(s.media!)
  for (const r of reigns) { if (r.to === null) continue; const how = /retired/.test(r.how) ? 'retired' : /inactiv/.test(r.how) ? 'inactivity' : /refusing/.test(r.how) ? 'refusing' : /lost to/.test(r.how) ? 'lost' : /relinquish|moved|vacat/.test(r.how) ? 'relinquished' : 'other'; add(`reign.end.${how}`) }
  add('reigns', reigns.length)
  const retired = Object.values(s.fighters).filter((f) => f.status === 'retired')
  add('retired', retired.length)
  add('retired.keptRecord', retired.filter((f) => total(f) > 0).length)
  add('retired.withReign', retired.filter((f) => reigns.some((r) => r.f === f.id)).length)
  add('retired.careerLineKept', retired.filter((f) => f.reputation >= 30 && getCareer(s.media!, f.id).some((c) => c.k === 'RETIRED')).length)
  add('retired.repGe30', retired.filter((f) => f.reputation >= 30).length)
  if (cohort) {
    for (const id of cohort) {
      const f = s.fighters[id]
      if (!f) { add('cohort.pruned'); continue }
      add('cohort.n')
      if (f.status === 'retired') add('cohort.retired')
      if (total(f) <= 6) { add('cohort.stillUnder7Fights'); if (f.status === 'active') add(f.contractId ? 'cohort.under7.contracted' : 'cohort.under7.freeAgent') }
      if (total(f) >= 12) add('cohort.12plus')
      const st = contenderStatus(s, f)
      if (['REGIONAL_CONTENDER', 'DOMESTIC_CONTENDER', 'EUROPEAN_CONTENDER', 'WORLD_CONTENDER', 'ELIMINATOR', 'MANDATORY_CHALLENGER', 'TITLE_CHALLENGER', 'CHAMPION', 'UNIFIED_CHAMPION', 'UNDISPUTED_CHAMPION'].includes(st)) add('cohort.contenderOrBetter')
      if (['WORLD_CONTENDER', 'ELIMINATOR', 'MANDATORY_CHALLENGER', 'TITLE_CHALLENGER', 'CHAMPION', 'UNIFIED_CHAMPION', 'UNDISPUTED_CHAMPION'].includes(st) || (s.business?.titleHist[id]?.won ?? 0) > 0) add('cohort.worldLevel')
    }
  }
  for (const [, r] of runs) { if (r.best >= 3) add('lopsidedRun3+') ; if (r.best >= 5) add('lopsidedRun5+') }
  add('player.cashStart', startCash); add('player.cashEnd', s.promotions[s.playerPromotionId].cash); add('player.minCash', minCash === Infinity ? 0 : minCash); add('player.negativeCashWeeks', negWeeks)
  add('player.shows', Object.values(s.events).filter((e) => e.promotionId === s.playerPromotionId && ['settled', 'archived'].includes(e.status)).length)
  add('player.fightsFought', Object.values(s.fights).filter((f) => f.result && (f.sideA.promotionId === s.playerPromotionId || f.sideB.promotionId === s.playerPromotionId)).length)
}
console.log(`Career-loop audit: ${seeds} seeds x ${years} years ${bot ? '(balanced bot answering offers)' : '(passive player)'}`)
for (const k of Object.keys(tot).sort()) console.log(`  ${k}: ${Math.round(tot[k])}`)
const pct = (a: string, b: string) => tot[b] ? `${((100 * (tot[a] ?? 0)) / tot[b]).toFixed(1)}%` : 'n/a'
console.log(`  -> idle>52w among contracted: rivals ${pct('idle52.rival', 'contracted.rival')}, mine ${pct('idle52.mine', 'contracted.mine')}; vacant belts ${pct('belts.vacant', 'belts')}; lopsided fights ${pct('fights.lopsided', 'fights')}; title fights ${pct('fights.title', 'fights')}`)
console.log(`  -> cohort of young low-fight debutants (${tot['cohort.n']}): retired ${pct('cohort.retired', 'cohort.n')}, still <7 fights ${pct('cohort.stillUnder7Fights', 'cohort.n')}, contender or better ${pct('cohort.contenderOrBetter', 'cohort.n')}, world level ${pct('cohort.worldLevel', 'cohort.n')}`)
console.log(`  -> rivals: defunct ${pct('rivals.defunct', 'rivals.samples')}, negative cash ${pct('rivals.negativeCash', 'rivals.samples')}`)
console.log(`  world-audit issues: ${[...issues.entries()].map(([m, n]) => `${n}x ${m}`).join(' | ') || 'none'}`)
console.log(`wall ${((Date.now() - T0) / 1000).toFixed(0)}s`)
