import { BALANCE as B } from '../balance'
import { weeksBetween } from '../calendar'
import { fighterName } from '../fighters'
import { postMessage, postNews } from '../messages'
import { archiveContract, becomeFreeAgent } from '../roster'
import type { Contract, GameState } from '../types'

export type ContractStage = 'healthy' | 'approaching' | 'window' | 'expiring' | 'expired'

export const STAGE_LABEL: Record<ContractStage, string> = {
  healthy: 'Healthy', approaching: 'Approaching expiry', window: 'Negotiation window', expiring: 'Expiring soon', expired: 'Expired',
}

export function stageForWeeks(weeksLeft: number): ContractStage {
  if (weeksLeft <= 0) return 'expired'
  if (weeksLeft <= B.contracts.expiringWeeks) return 'expiring'
  if (weeksLeft <= B.contracts.windowWeeks) return 'window'
  if (weeksLeft <= B.contracts.approachingWeeks) return 'approaching'
  return 'healthy'
}

export function contractStage(state: GameState, c: Contract): ContractStage {
  return stageForWeeks(weeksBetween(state.today, c.endDay))
}

/** Send renewal-stage notices for the player's contracts and close contracts that have run out. */
export function processContracts(state: GameState): void {
  for (const c of Object.values(state.contracts)) {
    const f = state.fighters[c.fighterId]
    if (!f) { delete state.contracts[c.id]; continue }
    const weeksLeft = weeksBetween(state.today, c.endDay)
    const mine = c.promotionId === state.playerPromotionId
    const name = fighterName(f)

    if (mine) {
      if (weeksLeft <= B.contracts.approachingWeeks && !c.notices.approaching) {
        c.notices.approaching = true
        postMessage(state, {
          from: 'Legal', category: 'contract', priority: 'normal',
          subject: `Contract approaching expiry: ${name}`,
          body: `${name}'s contract runs for about ${weeksLeft} more weeks. Renewal talks are now open — leaving it late gives rivals a chance to circle.`,
          link: { kind: 'fighter', id: f.id },
        })
      }
      if (weeksLeft <= B.contracts.windowWeeks && !c.notices.window) {
        c.notices.window = true
        const flavour =
          f.personality === 'Loyal' ? 'would like to stay and wants to talk.'
          : f.personality === 'Ambitious' || f.personality === 'Arrogant' ? 'is looking at their options and expects improved terms.'
          : f.personality === 'Greedy' ? 'has asked their agent to test the market.'
          : 'is ready to discuss a new deal.'
        postMessage(state, {
          from: 'Agent', category: 'contract', priority: 'important',
          subject: `${name} wants to talk about a new deal`,
          body: `${name}'s camp has been in touch: ${f.firstName} ${flavour} Their value may have changed since you signed them.`,
          link: { kind: 'fighter', id: f.id },
        })
      }
      if (weeksLeft <= B.contracts.expiringWeeks && !c.notices.expiring) {
        c.notices.expiring = true
        postMessage(state, {
          from: 'Legal', category: 'contract', priority: 'urgent',
          subject: `Final warning: ${name}'s contract`,
          body: `${name} is out of contract in ${Math.max(0, weeksLeft)} weeks. Renew now or lose them to the open market.`,
          link: { kind: 'fighter', id: f.id },
        })
      }
    }

    if (c.endDay <= state.today) {
      const promo = state.promotions[c.promotionId]
      archiveContract(state, c, 'expired')
      becomeFreeAgent(state, f, 'expired', c.promotionId)
      if (mine) {
        postMessage(state, {
          from: 'Legal', category: 'contract', priority: 'important',
          subject: `${name} has left`,
          body: `${name}'s contract with ${promo.name} has expired and they are now a free agent. You can still negotiate — but expect rivals to be interested.`,
          link: { kind: 'fighter', id: f.id },
        })
      } else {
        if (promo.ai) promo.ai.urgency = Math.min(3, promo.ai.urgency + 1)
        if (f.reputation >= 55) postNews(state, { headline: `${name} leaves ${promo.name} as a free agent`, category: 'market', fighterId: f.id })
      }
    }
  }
}
