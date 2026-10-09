/*
 * Mandatory-challenge consistency audit (Phase 5.5): every week, for every standing mandatory order, can the champion and the named
 * challenger actually meet for that belt (bodiesFor)? Counts orders that cannot, how long they last and how they end.
 * Usage: npx tsx scripts/audit/phase55-mandatory.ts [years=6] [seeds=6] [--bot]
 */
import { createNewGame } from '../../src/engine/worldgen'
import { advanceOneWeek } from '../../src/engine/tick'
import { newLog, playWeek, STRATEGIES } from '../../src/engine/sim/strategies'
import { bodiesFor, higherBeltOf } from '../../src/engine/media/titles'
import { rankIn } from '../../src/engine/media/rankings'
import { RANKING_ORGS } from '../../src/engine/media/orgs'
import { levelOf } from '../../src/engine/business/titleDefs'
import { getReigns } from '../../src/engine/media/records'
import type { GameState } from '../../src/engine/types'

const years = Number(process.argv[2] ?? 6), seeds = Number(process.argv[3] ?? 6), bot = process.argv.includes('--bot')
const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const tot: Record<string, number> = {}
const add = (k: string, v = 1) => (tot[k] = (tot[k] ?? 0) + v)
const samples: string[] = []
for (let k = 1; k <= seeds; k++) {
  let s: GameState = createNewGame({ seed: `mand-${k}`, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
  const log = newLog()
  const bad = new Map<string, number>() // key -> first week seen
  const champOf = new Map<string, string>()
  for (let w = 1; w <= years * 52; w++) {
    if (bot) s = playWeek(s, STRATEGIES.balanced, log)
    s = advanceOneWeek(s)
    const seen = new Set<string>()
    for (const [key, rec] of Object.entries(s.media!.titles)) {
      if (!rec.mand || !rec.c) continue
      add('mand.weeks')
      const [body, wc] = key.split('|')
      const ok = bodiesFor(s, rec.c, rec.mand.challenger, wc as never).includes(body)
      if (!ok) {
        const id = `${key}|${rec.mand.challenger}`
        seen.add(id); add('mand.unreachable.weeks')
        {
          const org = RANKING_ORGS.find((o) => o.id === body)!
          const r = rankIn(s.media!, body, wc as never, rec.mand.challenger)
          const lvl = levelOf(body)
          const why = higherBeltOf(s.media!, rec.c, wc as never, lvl) ? 'championHoldsHigherBelt' : higherBeltOf(s.media!, rec.mand.challenger, wc as never, lvl) ? 'challengerHoldsHigherBelt' : r === null || r < 1 ? 'challengerUnranked' : r > org.challengerLimit ? 'rankBeyondLimit' : 'other'
          add(`cause.${why}.weeks`)
          if (why === 'other' && !bad.has(id) && samples.length < 14) samples.push(`OTHER seed ${k} wk ${w} ${key} rank ${r}/${org.challengerLimit} bodiesFor=${JSON.stringify(bodiesFor(s, rec.c, rec.mand.challenger, wc as never))} champ=${JSON.stringify(Object.entries(s.media!.titles).filter(([, x]) => x.c === rec.c).map(([kk]) => kk))} chall=${JSON.stringify(Object.entries(s.media!.titles).filter(([, x]) => x.c === rec.mand!.challenger).map(([kk]) => kk))}`)
          if (!bad.has(id)) add(`cause.${why}.orders`)
        }
        if (!bad.has(id)) {
          bad.set(id, w); champOf.set(id, rec.c); add('mand.unreachable.orders')
          const org = RANKING_ORGS.find((o) => o.id === body)
          const r = rankIn(s.media!, body, wc as never, rec.mand.challenger)
          if (samples.length < 4) samples.push(`seed ${k} wk ${w} ${key}: challenger rank ${r} (limit ${org?.challengerLimit}) champion ${rec.c}`)
        }
      }
    }
    for (const id of [...bad.keys()]) if (!seen.has(id)) {
      const [b, wc] = id.split('|')[0].split('|').concat(id.split('|')[1]).slice(0, 2)
      void b; void wc
      const [body, div] = id.split('|')
      const reign = getReigns(s.media!).filter((r) => r.b === body && r.wc === div && r.f === champOf.get(id) && r.to !== null).pop()
      const how = reign && s.today - (reign.to as number) <= 14 ? (/refusing/.test(reign.how) ? 'stripped' : /lost to/.test(reign.how) ? 'championBeaten' : /retired|inactivity|relinquish|vacate|moved/.test(reign.how) ? 'championLeft' : 'reignOther') : 'orderLapsed'
      add(`ending.${how}`)
      add('mand.unreachable.ended'); add('mand.unreachable.endedAfterWeeks', w - bad.get(id)!); bad.delete(id) }
  }
  add('mand.unreachable.stillOpenAtEnd', bad.size)
}
console.log(`Mandatory audit: ${seeds} seeds x ${years} years ${bot ? '(bot)' : '(passive)'}`)
for (const k of Object.keys(tot).sort()) console.log(`  ${k}: ${tot[k]}`)
for (const x of samples) console.log('  e.g.', x)
