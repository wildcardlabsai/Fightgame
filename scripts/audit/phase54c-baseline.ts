/*
 * Phase 5.4C baseline / office audit: what the promoter's office does over several seeds and years (balanced bot plays the promotion).
 * Usage: npx tsx scripts/audit/phase54c-baseline.ts [years=5] [seeds=5]
 * Counts only what exists in the state; features that do not exist yet report zeros honestly.
 */
import { createNewGame } from '../../src/engine/worldgen'
import { advanceOneWeek } from '../../src/engine/tick'
import { newLog, playWeek, STRATEGIES } from '../../src/engine/sim/strategies'
import { cloneState } from '../../src/engine/clone'
import type { GameState } from '../../src/engine/types'

const years = Number(process.argv[2] ?? 5), seeds = Number(process.argv[3] ?? 5)
const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const T0 = Date.now()
const tot: Record<string, number> = {}
const add = (k: string, v = 1) => (tot[k] = (tot[k] ?? 0) + v)
let tickMs = 0, ticks = 0
for (let k = 1; k <= seeds; k++) {
  let s: GameState = createNewGame({ seed: `office-${k}`, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
  const log = newLog()
  const seenPc = new Set<string>(), seenRq = new Set<string>(), seenCancel = new Set<string>(), seenCommit = new Set<string>(), seenNar = new Set<string>()
  const startCash = s.promotions[s.playerPromotionId].cash
  for (let w = 1; w <= years * 52; w++) {
    s = playWeek(s, STRATEGIES.balanced, log)
    const t = performance.now(); s = advanceOneWeek(s); tickMs += performance.now() - t; ticks++
    const m = s.media!
    for (const p of m.pressers) if (!seenPc.has(p.id)) { seenPc.add(p.id); add('pressers.created') }
    for (const p of m.pressers) if (p.status === 'done' && !seenPc.has(p.id + 'd')) { seenPc.add(p.id + 'd'); add('pressers.held') }
    for (const r of m.requests) if (!seenRq.has(r.id)) { seenRq.add(r.id); add('mediaRequests') }
    for (const n of m.narratives) if (n.kind === 'RIVALRY' && !seenNar.has(n.id)) { seenNar.add(n.id); add('rivalry.narratives') }
    for (const f of Object.values(s.fights)) if (f.status === 'cancelled' && !seenCancel.has(f.id)) {
      seenCancel.add(f.id)
      const mine = f.organiserId === s.playerPromotionId
      add(mine ? 'fights.cancelled.mine' : 'fights.cancelled.rival')
      if (mine) add(`cancel: ${(f.cancelReason ?? '?').replace(/[A-Z][a-z]+ [A-Z][a-z]+/g, 'X').slice(0, 40)}`)
    }
    for (const c of s.business?.commitments ?? []) if (!seenCommit.has(c.id)) { seenCommit.add(c.id); add('commitments.made') }
    if (w % 52 === 0) {
      add('seed-years')
      add('rivalry.pairsAtYearEnd', Object.keys(m.rivalry).length)
      add('relations.nonZero', Object.keys(m.rel).length)
      add('stateKB', Math.round(JSON.stringify(s).length / 1024))
      add('plansSet', Object.keys(s.business?.plans ?? {}).length)
    }
  }
  for (const c of s.business?.commitments ?? []) add(`commitments.${c.status}`)
  const p = s.promotions[s.playerPromotionId]
  add('player.cashEnd', Math.round(p.cash)); add('player.cashStart', startCash); add('player.rep', Math.round(p.reputation))
  add('player.events', Object.values(s.events).filter((e) => e.promotionId === p.id && ['completed', 'settled', 'archived'].includes(e.status)).length)
  add('rival.events', Object.values(s.events).filter((e) => e.promotionId !== p.id && ['completed', 'settled', 'archived'].includes(e.status)).length)
}
console.log(`Phase 5.4C baseline, ${seeds} seeds x ${years} years`)
for (const [k, v] of Object.entries(tot).sort()) console.log(`  ${k}: ${v}${k.endsWith('KB') || k.startsWith('rivalry.pairs') || k.startsWith('relations') || k.startsWith('plansSet') ? ` (avg ${(v / tot['seed-years']).toFixed(1)}/seed-year)` : ''}`)
console.log(`weekly tick avg ${(tickMs / ticks).toFixed(1)} ms; wall ${((Date.now() - T0) / 1000).toFixed(0)}s`)
