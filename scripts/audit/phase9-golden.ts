/**
 * Phase 9: determinism fingerprint. Prints a SHA-256 of the canonical (key-sorted) game state at several checkpoints for a few seeds, passive and with the
 * reference bot. A performance-only change must leave every line identical. Usage: npx tsx scripts/audit/phase9-golden.ts [years=5]
 */
import { createHash } from 'node:crypto'
import { createNewGame } from '../../src/engine/worldgen'
import { advanceOneWeek } from '../../src/engine/tick'
import { newLog, playWeek, STRATEGIES } from '../../src/engine/sim/strategies'

const years = Number(process.argv[2] ?? 5)
const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v)
const hash = (s: unknown) => { const o = JSON.parse(JSON.stringify(s)); delete o.guide; return createHash('sha256').update(JSON.stringify(canon(o))).digest('hex').slice(0, 16) }
for (const [scenario, seed, mode] of [['regional', 'g1', 'passive'], ['groundUp', 'g2', 'passive'], ['national', 'g3', 'passive'], ['regional', 'g4', 'bot']] as const) {
  let s = createNewGame({ seed: `golden-${seed}`, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo, scenario }, 1_700_000_000_000)
  const log = newLog(); const out: string[] = []
  const y = mode === 'bot' ? Math.min(years, 3) : years
  for (let w = 1; w <= y * 52; w++) {
    if (mode === 'bot') s = playWeek(s, STRATEGIES.balanced, log)
    s = advanceOneWeek(s)
    if (w === 26 || w % 52 === 0) out.push(`w${w}:${hash(s)}`)
  }
  console.log(`${scenario}/${seed}/${mode} ${out.join(' ')}`)
}
