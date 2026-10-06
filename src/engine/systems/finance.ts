import { MAX_FINANCE_HISTORY, MAX_LEDGER, WEEKLY_COSTS } from '../config'
import { postMessage } from '../messages'
import { cashRunwayWeeks, overheadCost, player } from '../selectors'
import type { GameState, TransactionCategory } from '../types'

function record(state: GameState, category: TransactionCategory, amount: number, description: string): void {
  if (amount === 0) return
  state.idCounter += 1
  state.ledger.unshift({ id: `t_${state.idCounter.toString(36)}`, day: state.today, category, amount, description })
  if (state.ledger.length > MAX_LEDGER) state.ledger.length = MAX_LEDGER
  player(state).cash += amount
}

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
  record(state, 'retainers', -retainers, 'Fighter retainers')

  const expenses = overheadCost(state) + retainers
  state.financeHistory.push({ day: state.today, cash: p.cash, income: 0, expenses })
  if (state.financeHistory.length > MAX_FINANCE_HISTORY) state.financeHistory.shift()

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
