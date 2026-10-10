import { MAX_FINANCE_HISTORY, WEEKLY_COSTS } from '../config'
import { coachWeekly } from '../office/trainer'
import { post as record } from '../ledger'
import { postMessage } from '../messages'
import { processBridge } from './bridge'
import { cashRunwayWeeks, financialHealth, overheadCost, player } from '../selectors'
import type { GameState } from '../types'

/** Pay the week's running costs and record a snapshot for the cash chart. */
export function processWeeklyFinance(state: GameState): void {
  const p = player(state)
  const scale = overheadCost(state) / (WEEKLY_COSTS.office + WEEKLY_COSTS.staff + WEEKLY_COSTS.gym + WEEKLY_COSTS.insurance)
  const retainers = Object.values(state.contracts)
    .filter((c) => c.promotionId === p.id)
    .reduce((s, c) => s + c.weeklyRetainer, 0)

  record(state, 'office', -Math.round(WEEKLY_COSTS.office * scale), 'Office rent & utilities')
  record(state, 'staff', -Math.round(WEEKLY_COSTS.staff * scale), 'Admin & matchmaking staff')
  record(state, 'gym', -Math.round(WEEKLY_COSTS.gym * scale), 'Gym lease')
  record(state, 'insurance', -Math.round(WEEKLY_COSTS.insurance * scale), 'Insurance')
  for (const sc of state.scouts) record(state, 'staff', -sc.weeklyWage, `Scout — ${sc.name}`)
  const coaching = coachWeekly(state)
  if (coaching > 0) record(state, 'coaching', -coaching, 'Coaching staff')
  record(state, 'retainers', -retainers, 'Fighter retainers')
  processBridge(state)

  const expenses = overheadCost(state) + retainers + coaching + state.scouts.reduce((n, x) => n + x.weeklyWage, 0)
  state.financeHistory.push({ day: state.today, cash: p.cash, income: 0, expenses })
  if (state.financeHistory.length > MAX_FINANCE_HISTORY) state.financeHistory.shift()

  const health = financialHealth(state)
  if (health.state === 'insolvent') {
    postMessage(state, { from: 'Accounts', category: 'finance', priority: 'important', key: 'insolvent', cooldownWeeks: 26,
      subject: 'The promotion is insolvent', body: 'Creditors are circling. You cannot book venues, sign fighters or start negotiations until cash recovers. Cut costs or run a profitable show - and if the account is overdrawn, the backers\' bridge loan on the Finances screen is the way to get a venue and a roster back.', link: { kind: 'screen', screen: 'finances' } })
  } else if (health.state === 'critical') {
    postMessage(state, { from: 'Accounts', category: 'finance', priority: 'important', key: 'fin-critical', cooldownWeeks: 26,
      subject: 'Finances are critical', body: health.reason, link: { kind: 'screen', screen: 'finances' } })
  }
  const runway = cashRunwayWeeks(state)
  if (p.cash < 0) {
    postMessage(state, { from: 'Accounts', category: 'finance', priority: 'urgent', key: 'cash-negative', cooldownWeeks: 26,
      subject: 'Your accounts are overdrawn', body: 'The promotion has no money left. Cut costs or find revenue immediately.', link: { kind: 'screen', screen: 'finances' } })
  } else if (runway !== null && runway < 8) {
    postMessage(state, { from: 'Accounts', category: 'finance', priority: 'urgent', key: 'cash-8', cooldownWeeks: 26,
      subject: `Only ${runway} weeks of cash remaining`, body: 'At the current burn rate the promotion will run dry in under two months.', link: { kind: 'screen', screen: 'finances' } })
  } else if (runway !== null && runway < 26) {
    postMessage(state, { from: 'Accounts', category: 'finance', priority: 'important', key: 'cash-26', cooldownWeeks: 13,
      subject: 'Cash runway below six months', body: `At £${(p.cash / 1000).toFixed(0)}k with current costs, you have about ${runway} weeks of funding.`, link: { kind: 'screen', screen: 'finances' } })
  }
}
