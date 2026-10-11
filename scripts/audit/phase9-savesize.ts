/**
 * Phase 9: where does save size come from, and how does it grow? Usage: npx tsx scripts/audit/phase9-savesize.ts [years=8] [seed=1] [scenario=regional] [bot|passive]
 * Prints JSON bytes (what the vault compresses) and a breakdown by top-level key and by the biggest collections at each year-end.
 */
import { gzipSync } from 'node:zlib'
import { createNewGame } from '../../src/engine/worldgen'
import { advanceOneWeek } from '../../src/engine/tick'
import { serialiseGame } from '../../src/engine/save'
import { newLog, playWeek, STRATEGIES } from '../../src/engine/sim/strategies'

const years = Number(process.argv[2] ?? 8), seed = process.argv[3] ?? '1', scenario = (process.argv[4] ?? 'regional') as 'regional', mode = process.argv[5] ?? 'bot'
const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
let s = createNewGame({ seed: `size-${seed}`, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo, scenario }, 1_700_000_000_000)
const log = newLog()
const kb = (n: number) => (n / 1024).toFixed(0)
const bytes = (v: unknown) => JSON.stringify(v ?? null).length
for (let w = 1; w <= years * 52; w++) {
  if (mode === 'bot') s = playWeek(s, STRATEGIES.balanced, log)
  s = advanceOneWeek(s)
  if (w % 52 === 0 || w === 26) {
    const json = serialiseGame(s)
    const top = Object.entries(s as unknown as Record<string, unknown>).map(([k, v]) => [k, bytes(v)] as const).sort((a, b) => b[1] - a[1]).slice(0, 7)
    const fights = Object.values(s.fights)
    const status: Record<string, number> = {}
    for (const f of fights) status[f.status] = (status[f.status] ?? 0) + 1
    console.log(`week ${w} (y${(w / 52).toFixed(1)}): json ${kb(json.length)}kB gzip ${kb(gzipSync(json).length)}kB | fights ${fights.length} events ${Object.keys(s.events).length} fighters ${Object.keys(s.fighters).length} (retired ${Object.values(s.fighters).filter((f) => f.status === 'retired').length}) | top: ${top.map(([k, n]) => `${k} ${kb(n)}`).join(', ')}`)
    console.log(`   fight statuses ${JSON.stringify(status)}  avg fight ${(bytes(s.fights) / Math.max(1, fights.length)).toFixed(0)}B  avg event ${(bytes(s.events) / Math.max(1, Object.keys(s.events).length)).toFixed(0)}B  avg fighter ${(bytes(s.fighters) / Math.max(1, Object.keys(s.fighters).length)).toFixed(0)}B`)
  }
}
