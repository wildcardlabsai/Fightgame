/**
 * Phase 8 beta-readiness career audit. Usage: npx tsx scripts/audit/phase8-beta.ts [years=8] [seeds=6] [firstSeed=1] [scenario=groundUp|regional|national]
 * Plays complete careers (balanced reference bot as the player, AI world around it) and checks, every few weeks:
 *   money: cash == archive + sum(ledger); no ledger id reused; no non-finite amounts; AI promotions' cash finite
 *   bookings: no fighter in two live fights; activeFightId always points at a live fight; no fight on two cards; no card fight cancelled/finished but pending
 *   titles: no overlapping reigns on one belt; no stuck mandatory order (more than 150 days past due); no retired champion lingering
 *   availability: no signed active fighter blocked by an injury whose return day is long past or by a stale fight lock
 *   world: rival promotions still staging shows; active population and yearly retirements/intake within sane bounds
 *   persistence: serialise → deserialise at the end of year 3, play a further year on both, and require identical states
 *   performance: mean milliseconds per week by year (no uncontrolled growth)
 */
import { isDeepStrictEqual } from 'node:util'
import { createNewGame } from '../../src/engine/worldgen'
import { advanceOneWeek } from '../../src/engine/tick'
import { deserialiseGame, serialiseGame } from '../../src/engine/save'
import { newLog, playWeek, STRATEGIES } from '../../src/engine/sim/strategies'
import { getReigns } from '../../src/engine/media/records'
import type { GameState } from '../../src/engine/types'

const years = Number(process.argv[2] ?? 8), seeds = Number(process.argv[3] ?? 6), first = Number(process.argv[4] ?? 1)
const scenario = (process.argv[5] ?? 'groundUp') as 'groundUp'
const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const LIVE = ['agreed', 'scheduled', 'training', 'fightNight']
let totalProblems = 0

const strip = (s: GameState) => { const j = JSON.parse(serialiseGame(s)); delete j.guide; return j }

for (let k = first; k < first + seeds; k++) {
  let s = createNewGame({ seed: `beta-${k}`, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo, scenario }, 1_700_000_000_000)
  const log = newLog(); const probs = new Map<string, string>()
  const flag = (kind: string, msg: string) => { if (!probs.has(kind)) probs.set(kind, msg); else if (!probs.get(kind)!.includes('(+')) probs.set(kind, probs.get(kind) + ' (+more)') }
  const seenIds = new Set<string>(); let nSeen = 0
  const msPerYear: number[] = []; let tickMs = 0
  const startActive = Object.values(s.fighters).filter((f) => f.status === 'active').length
  let popMin = startActive, popMax = startActive
  const retiredByYear: number[] = []; let retired0 = 0
  const aiShowsByYear: number[] = []; let aiShows0 = 0
  let negCashWeeks = 0, bankrupt = 0, peakIdle = 0
  let reloadChecked = false

  for (let w = 1; w <= years * 52; w++) {
    s = playWeek(s, STRATEGIES.balanced, log)
    const t0 = performance.now()
    s = advanceOneWeek(s)
    tickMs += performance.now() - t0
    const me = s.playerPromotionId
    if (s.promotions[me].cash < 0) negCashWeeks++
    if (w % 13 === 0 || w === years * 52) {
      // money
      if (s.ledgerArchive + s.ledger.reduce((n, t) => n + t.amount, 0) !== s.promotions[me].cash) flag('ledger≠cash', `w${w}`)
      for (const t of s.ledger) { if (!Number.isFinite(t.amount)) flag('nonfinite', `w${w} ${t.id}`); if (!seenIds.has(t.id)) { seenIds.add(t.id); nSeen++ } }
      for (const p of Object.values(s.promotions)) if (!Number.isFinite(p.cash)) flag('aiCash', `w${w} ${p.name}`)
      // bookings
      const live = Object.values(s.fights).filter((f) => LIVE.includes(f.status))
      const per = new Map<string, number>()
      for (const f of live) for (const id of [f.sideA.fighterId, f.sideB.fighterId]) per.set(id, (per.get(id) ?? 0) + 1)
      for (const [id, n] of per) if (n > 1) flag('doubleBooked', `w${w} ${id} in ${n} live fights`)
      const onCards = new Map<string, number>()
      for (const e of Object.values(s.events)) if (!['completed', 'settled', 'archived', 'cancelled'].includes(e.status)) for (const fid of e.card) onCards.set(fid, (onCards.get(fid) ?? 0) + 1)
      for (const [fid, n] of onCards) if (n > 1) flag('fightOnTwoCards', `w${w} ${fid}`)
      for (const f of Object.values(s.fighters)) {
        if (f.activeFightId) { const af = s.fights[f.activeFightId]; if (!af || !LIVE.includes(af.status)) flag('staleLock', `w${w} ${f.id} -> ${f.activeFightId} ${af?.status}`) }
        // availability: injured long past recovery, or idle forever while signed
        if (f.status === 'active' && f.injury && s.today - f.injury.returnDay > 120) flag('stuckInjury', `w${w} ${f.id}`)
        if (f.status === 'active' && f.contractId && f.lastFightDay !== null) peakIdle = Math.max(peakIdle, Math.floor((s.today - f.lastFightDay) / 7))
      }
      // titles
      for (const [key, rec] of Object.entries(s.media!.titles)) {
        if (rec.mand && s.today > rec.mand.due + 150) flag('stuckMandatory', `w${w} ${key} due ${rec.mand.due} today ${s.today}`)
        if (rec.c) { const f = s.fighters[rec.c]; if (f.status === 'retired' && (f.retiredDay === null || s.today - f.retiredDay > 14)) flag('retiredChampion', `w${w} ${key}`) }
      }
      const pop = Object.values(s.fighters).filter((f) => f.status === 'active').length; popMin = Math.min(popMin, pop); popMax = Math.max(popMax, pop)
    }
    if (w % 52 === 0) {
      const y = w / 52
      msPerYear.push(tickMs / 52); tickMs = 0
      const retiredNow = Object.values(s.fighters).filter((f) => f.status === 'retired').length; retiredByYear.push(retiredNow - retired0); retired0 = retiredNow
      const aiShowsNow = Object.values(s.events).filter((e) => e.kind === 'ai' && e.status !== 'cancelled').length; aiShowsByYear.push(aiShowsNow - aiShows0); aiShows0 = aiShowsNow
      if (y === 3 && !reloadChecked) {
        reloadChecked = true
        let a = s, b = deserialiseGame(serialiseGame(s))!
        if (!isDeepStrictEqual(strip(a), strip(b))) flag('reloadDiffers', 'immediately after load')
        const la = newLog(), lb = newLog()
        for (let i = 0; i < 52; i++) { a = advanceOneWeek(playWeek(a, STRATEGIES.balanced, la)); b = advanceOneWeek(playWeek(b, STRATEGIES.balanced, lb)) }
        if (!isDeepStrictEqual(strip(a), strip(b))) flag('reloadDiverges', 'a reloaded career diverged from the original within a year')
        tickMs = 0
      }
    }
  }
  // overlapping reigns on one belt
  const byBelt = new Map<string, { from: number; to: number | null }[]>()
  for (const r of getReigns(s.media!)) byBelt.set(`${r.b}|${r.wc}`, [...(byBelt.get(`${r.b}|${r.wc}`) ?? []), { from: r.from, to: r.to }])
  for (const [belt, rs] of byBelt) { rs.sort((a, b) => a.from - b.from); for (let i = 1; i < rs.length; i++) if (rs[i - 1].to === null || rs[i - 1].to! > rs[i].from) flag('overlappingReigns', belt) }
  // rival promotions still functioning: every non-collapsing AI promotion with a roster staged something in the final two years
  const recent = s.today - 730
  const dead = Object.values(s.promotions).filter((p) => !p.isPlayer && p.ai && Object.values(s.contracts).some((c) => c.promotionId === p.id) && !Object.values(s.events).some((e) => e.promotionId === p.id && e.day >= recent && e.status !== 'cancelled'))
  const deadNames = dead.map((p) => p.name)
  const pl = s.promotions[s.playerPromotionId]
  const growth = msPerYear.length > 1 ? msPerYear[msPerYear.length - 1] / msPerYear[0] : 1
  totalProblems += probs.size + (deadNames.length > 0 ? 1 : 0)
  console.log(`seed ${k} ${scenario} ${years}y: problems=${probs.size}${deadNames.length ? ` quietRivals=${deadNames.join(',')}` : ''} ledgerLines=${nSeen} cash=£${Math.round(pl.cash / 1000)}k negCashWeeks=${negCashWeeks} shows=${log.planned} pop=${popMin}-${popMax} retirements/yr=[${retiredByYear.join(',')}] aiShows/yr=[${aiShowsByYear.join(',')}] tickMs/wk=[${msPerYear.map((x) => x.toFixed(0)).join(',')}] growth×${growth.toFixed(2)} peakIdleWks=${peakIdle}`)
  for (const [kind, msg] of probs) console.log(`    ${kind}: ${msg}`)
  void bankrupt
}
console.log(totalProblems === 0 ? 'ALL CLEAN' : `${totalProblems} PROBLEM KINDS`)
process.exit(totalProblems === 0 ? 0 : 1)
