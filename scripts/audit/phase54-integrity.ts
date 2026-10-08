/* Title / fight integrity audit over several multi-year worlds. Usage: npx tsx scripts/audit/phase54-integrity.ts [years=5] [seeds=3] */
import { createNewGame } from '../../src/engine/worldgen'
import { advanceOneWeek } from '../../src/engine/tick'
import { newLog, playWeek, STRATEGIES } from '../../src/engine/sim/strategies'
import { levelOf, levelRank } from '../../src/engine/business/titleDefs'
import { fightRoundsProblem } from '../../src/engine/business/fightRounds'
import { getReigns } from '../../src/engine/media/records'

const years = Number(process.argv[2] ?? 5), seeds = Number(process.argv[3] ?? 3)
const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
let bad = 0
for (let k = 1; k <= seeds; k++) {
  for (const mode of ['bot', 'passive'] as const) {
    let s = createNewGame({ seed: `integrity-${k}`, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
    const log = newLog()
    const probs: string[] = []
    let maxWorldBelts = 0, titleFights = 0, shortTitle = 0, relinquished = 0
    const rounds: Record<string, number> = {}
    for (let w = 1; w <= years * 52; w++) {
      if (mode === 'bot') s = playWeek(s, STRATEGIES.balanced, log)
      s = advanceOneWeek(s)
      const m = s.media!
      const per = new Map<string, number[]>()
      for (const [key, rec] of Object.entries(m.titles)) {
        if (!rec.c) continue
        const [body, wc] = key.split('|'); const f = s.fighters[rec.c]
        if (f.status === 'retired' && (f.retiredDay === null || s.today - f.retiredDay > 7)) probs.push(`w${w} ${key} retired champion`)
        if (f.status !== 'retired' && f.weightClass !== wc) probs.push(`w${w} ${key} champion fights at ${f.weightClass}`)
        const id = `${rec.c}@${wc}`; per.set(id, [...(per.get(id) ?? []), levelRank(levelOf(body))])
      }
      for (const [id, ls] of per) { if (new Set(ls).size > 1) probs.push(`w${w} ${id} holds several levels ${ls}`); maxWorldBelts = Math.max(maxWorldBelts, ls.filter((l) => l === levelRank('world')).length) }
      if (w % 13 === 0) for (const f of Object.values(s.fights)) if (f.title) { const p = fightRoundsProblem(s, f); if (p) probs.push(`w${w} ${f.id}: ${p}`) }
    }
    for (const f of Object.values(s.fights)) if (f.title) { titleFights++; rounds[f.scheduledRounds] = (rounds[f.scheduledRounds] ?? 0) + 1; if (f.scheduledRounds <= 4) shortTitle++; const p = fightRoundsProblem(s, f); if (p) probs.push(`end ${f.id}: ${p}`) }
    for (const r of getReigns(s.media!)) { if (!r.how) probs.push(`reign without a reason ${r.b}|${r.wc}`); if (/relinquished — moved up/.test(r.how)) relinquished++; if (r.to !== null && r.to < r.from) probs.push(`reign runs backwards ${r.b}|${r.wc}`) }
    bad += probs.length
    console.log(`seed ${k} ${mode} ${years}y: problems=${probs.length} titleFights=${titleFights} rounds=${JSON.stringify(rounds)} short(<=4)=${shortTitle} maxWorldBeltsHeld=${maxWorldBelts} hierarchyRelinquishments=${relinquished}`)
    for (const p of probs.slice(0, 5)) console.log('   ', p)
  }
}
console.log(bad === 0 ? 'ALL CLEAN' : `${bad} PROBLEMS`)
process.exit(bad === 0 ? 0 : 1)
