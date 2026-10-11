/** Name diversity audit: legacy pools vs the wide pools, per world size, over several seeds. Run: npx tsx scripts/audit/identity-names.ts */
import { generateFighter } from '../../src/engine/fighters'
import { Rng } from '../../src/engine/rng'
import { IdGen } from '../../src/engine/ids'

const SEEDS = 20
function run(wide: boolean, n: number) {
  let uniqFull = 0, uniqLast = 0, dupFull = 0, maxLast = 0, uniqFirst = 0
  for (let s = 1; s <= SEEDS; s++) {
    const rng = Rng.fromSeed(`names-${s}`); const ids = new IdGen(0); const taken = new Set<string>()
    const full = new Map<string, number>(), last = new Map<string, number>(), first = new Set<string>()
    for (let i = 0; i < n; i++) {
      const f = generateFighter(rng, ids, { quality: 0.4, today: 800_000, ...(wide ? { widePools: true, takenNames: taken } : {}) })
      const k = `${f.firstName} ${f.lastName}`
      full.set(k, (full.get(k) ?? 0) + 1); last.set(f.lastName, (last.get(f.lastName) ?? 0) + 1); first.add(f.firstName)
    }
    uniqFull += full.size; uniqLast += last.size; uniqFirst += first.size
    dupFull += n - full.size; maxLast = Math.max(maxLast, ...last.values())
  }
  return { n, wide, uniqueFull: (uniqFull / SEEDS).toFixed(1), uniqueSurnames: (uniqLast / SEEDS).toFixed(1), uniqueGiven: (uniqFirst / SEEDS).toFixed(1), duplicateFullNames: (dupFull / SEEDS).toFixed(2), maxSharedSurname: maxLast }
}
for (const n of [400, 600, 1000]) { console.table([run(false, n), run(true, n)]) }
