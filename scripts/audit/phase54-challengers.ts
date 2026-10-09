/* How credible are title challengers? Usage: npx tsx scripts/audit/phase54-challengers.ts [years=5] [seed=ch-1] */
import { createNewGame } from '../../src/engine/worldgen'
import { advanceOneWeek } from '../../src/engine/tick'
import { newLog, playWeek, STRATEGIES } from '../../src/engine/sim/strategies'
import * as defs from '../../src/engine/business/titleDefs'
const { levelOf, TITLE_DEF_BY_ID } = defs
const challengerShortfall: undefined | ((d: unknown, r: unknown) => string | null) = (defs as never as { challengerShortfall?: never }).challengerShortfall

const years = Number(process.argv[2] ?? 5), seed = process.argv[3] ?? 'ch-1'
let s = createNewGame({ seed, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'P', color: '#fff', emblem: 'bolt' } } as any, 1_700_000_000_000)
const log = newLog()
const seen = new Set<string>()
const by: Record<string, { n: number; minFights: number; minWins: number; weak: number; ordered: number }> = {}
let vacantWeeks = 0, belts = 0
for (let w = 1; w <= years * 52; w++) {
  s = playWeek(s, STRATEGIES.balanced, log); s = advanceOneWeek(s)
  for (const f of Object.values(s.fights)) {
    if (!f.title || seen.has(f.id) || f.status === 'negotiating') continue
    seen.add(f.id)
    if (f.title.kind === 'eliminator') continue
    for (const b of f.title.bodies ?? []) {
      const lvl = levelOf(b); const rec = s.media!.titles[`${b}|${f.weightClass}`]
      const ids = [f.sideA.fighterId, f.sideB.fighterId]
      const chall = ids.find((i) => i !== rec?.c) ?? ids[0]
      const fi = s.fighters[chall]; const n = fi.record.wins + fi.record.losses + fi.record.draws
      const e = (by[lvl] ??= { n: 0, minFights: 99, minWins: 99, weak: 0, ordered: 0 })
      e.n++; e.minFights = Math.min(e.minFights, n); e.minWins = Math.min(e.minWins, fi.record.wins)
      if (challengerShortfall?.(TITLE_DEF_BY_ID[b], fi.record)) e.weak++
    }
  }
  if (w % 13 === 0) for (const r of Object.values(s.media!.titles)) { belts++; if (!r.c) vacantWeeks++ }
}
console.log(`seed ${seed} ${years}y title fights by level (challenger record at the time of booking is not stored; shown = at end of run, so fights may only look weaker):`, JSON.stringify(by))
console.log(`vacant belt share (sampled quarterly): ${(vacantWeeks / belts * 100).toFixed(1)}%  title fights total=${seen.size}`)
const strong = Object.values(s.fights).filter((f) => f.title && f.result)
console.log('resolved title fights', strong.length)
