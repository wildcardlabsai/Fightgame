import { weeksBetween } from '../calendar'
import { fighterName } from '../fighters'
import { postMessage, postNews } from '../messages'
import type { GameState } from '../types'

/** Warn about, and process, expiring contracts. AI re-signing is handled in aiRoster. */
export function processContracts(state: GameState): void {
  for (const c of Object.values(state.contracts)) {
    const f = state.fighters[c.fighterId]
    if (!f) { delete state.contracts[c.id]; continue }
    const weeksLeft = weeksBetween(state.today, c.endDay)
    const mine = c.promotionId === state.playerPromotionId

    if (mine && weeksLeft <= 12 && !c.warned12 && weeksLeft > 4) {
      c.warned12 = true
      postMessage(state, {
        from: 'Legal', category: 'contract', priority: 'important',
        subject: `Contract expiring: ${fighterName(f)}`,
        body: `${fighterName(f)}'s contract runs out in ${weeksLeft} weeks. Renewal negotiations arrive in Phase 2; until then the fighter will leave as a free agent when the contract ends.`,
        link: { kind: 'fighter', id: f.id },
      })
    }
    if (mine && weeksLeft <= 4 && !c.warned4) {
      c.warned4 = true
      postMessage(state, {
        from: 'Legal', category: 'contract', priority: 'urgent',
        subject: `Final warning: ${fighterName(f)}'s contract`,
        body: `${fighterName(f)} is out of contract in ${Math.max(0, weeksLeft)} weeks.`,
        link: { kind: 'fighter', id: f.id },
      })
    }

    if (c.endDay <= state.today) {
      const promo = state.promotions[c.promotionId]
      f.contractId = null
      delete state.contracts[c.id]
      if (mine) {
        postMessage(state, {
          from: 'Legal', category: 'contract', priority: 'important',
          subject: `${fighterName(f)} has left`,
          body: `${fighterName(f)}'s contract with ${promo.name} has expired and they are now a free agent.`,
          link: { kind: 'fighter', id: f.id },
        })
      } else if (f.reputation >= 55) {
        postNews(state, { headline: `${fighterName(f)} leaves ${promo.name} as a free agent`, category: 'signing', fighterId: f.id })
      }
    }
  }
}
