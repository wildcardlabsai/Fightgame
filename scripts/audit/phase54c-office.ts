/*
 * Promoter's-office audit (Phase 5.4C): incoming offers, career objectives, relationships, campaigns, over several seeds and years.
 * Usage: npx tsx scripts/audit/phase54c-office.ts [years=5] [seeds=5] [--policy=none|smart|all]
 * The balanced bot runs the promotion. `--policy` is how the bot answers incoming offers (none: ignores them).
 */
import { offerDiag } from '../../src/engine/office/offers'
import { createNewGame } from '../../src/engine/worldgen'
import { advanceOneWeek } from '../../src/engine/tick'
import { newLog, playWeek, STRATEGIES } from '../../src/engine/sim/strategies'
import { acceptOffer, counterOffer, rejectOffer, isLive } from '../../src/engine/office/offers'
import { opponentFit } from '../../src/engine/office/goals'
import { fightAvailability } from '../../src/engine/fights'
import type { GameState } from '../../src/engine/types'

const years = Number(process.argv[2] ?? 5), seeds = Number(process.argv[3] ?? 5)
const policy = (process.argv.find((a) => a.startsWith('--policy='))?.split('=')[1] ?? 'smart') as 'none' | 'smart' | 'all'
const passive = process.argv.includes('--passive') // the player runs no shows of their own: only answers offers
const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const tot: Record<string, number> = {}
const add = (k: string, v = 1) => (tot[k] = (tot[k] ?? 0) + v)
let tickMs = 0, ticks = 0
const T0 = Date.now()

for (let k = 1; k <= seeds; k++) {
  let s: GameState = createNewGame({ seed: `office-${k}`, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
  const log = newLog()
  const seen = new Set<string>(), closedSeen = new Set<string>()
  const startCash = s.promotions[s.playerPromotionId].cash
  for (let w = 1; w <= years * 52; w++) {
    if (!passive) s = playWeek(s, STRATEGIES.balanced, log)
    // answer incoming offers
    for (const o of Object.values(s.office?.offers ?? {})) {
      if (o.status !== 'open' || policy === 'none') continue
      const y = s.fighters[o.mine], x = s.fighters[o.theirs]
      const fit = opponentFit(s, y, x)
      const net = o.host === 'them' ? o.terms.purse - (y.contractId ? s.contracts[y.contractId].basePurse : 0) : -o.terms.purse
      const want = policy === 'all' || (o.host === 'them' ? net > 0 : s.promotions[s.playerPromotionId].cash > o.terms.purse * 5 && fit.label !== 'A big step up')
      if (want) { const r = acceptOffer(s, o.id, policy === 'all'); s = r.state; add(r.ok ? 'answer.accepted' : `answer.acceptFailed: ${(r.error ?? '').slice(0, 30)}`) }
      else if (policy === 'smart' && o.history.filter((h) => h.by === 'you').length === 0 && (o.host === 'them' ? net > -2000 : true) && fit.label !== 'A big step up') {
        const t = { ...o.terms, purse: Math.round(o.terms.purse * (o.host === 'them' ? 1.12 : 0.9)) }
        const r = counterOffer(s, o.id, t); s = r.state; add(r.ok ? 'answer.countered' : 'answer.counterFailed')
      } else { const r = rejectOffer(s, o.id); s = r.state; add('answer.rejected') }
    }
    const t = performance.now(); s = advanceOneWeek(s); tickMs += performance.now() - t; ticks++
    for (const o of Object.values(s.office?.offers ?? {})) {
      if (!seen.has(o.id)) { seen.add(o.id); add('offers.made'); add(`reason.${o.reason}`); add(`host.${o.host}`); add(`stakes.${o.stakes}`) }
      if (!isLive(o) && !closedSeen.has(o.id + o.status)) { closedSeen.add(o.id + o.status); add(`end.${o.status}`) }
    }
    // consistency: fighters never double-booked, no fight with two live offers
    const byFighter: Record<string, number> = {}
    for (const f of Object.values(s.fights)) if (['agreed', 'scheduled', 'training', 'fightNight'].includes(f.status)) for (const id of [f.sideA.fighterId, f.sideB.fighterId]) byFighter[id] = (byFighter[id] ?? 0) + 1
    for (const [id, n] of Object.entries(byFighter)) if (n > 1 && s.fighters[id].activeFightId) add('PROBLEM.doubleBooked')
    void fightAvailability
  }
  for (const o of Object.values(s.office?.offers ?? {})) if (o.status === 'agreed' && o.fightId) {
    const f = s.fights[o.fightId]
    if (!f) continue
    add(`agreedFight.${f.status === 'postFight' || f.status === 'completed' || f.result ? 'fought' : f.status}`)
  }
  const p = s.promotions[s.playerPromotionId]
  add('player.cashEnd', Math.round(p.cash)); add('player.cashStart', startCash)
  add('relations.rows', Object.keys(s.office?.rel ?? {}).length)
  add('stateKB', Math.round(JSON.stringify(s).length / 1024))
  add('seed-years', years)
}
console.log(`Office audit: ${seeds} seeds x ${years} years, offer policy "${policy}"`)
for (const [k, v] of Object.entries(tot).sort()) console.log(`  ${k}: ${v}${k === 'offers.made' ? ` (${(v / tot['seed-years']).toFixed(1)} per seed-year)` : ''}`)
console.log('  diag', JSON.stringify(offerDiag))
console.log(`weekly tick avg ${(tickMs / ticks).toFixed(1)} ms; wall ${((Date.now() - T0) / 1000).toFixed(0)}s`)
