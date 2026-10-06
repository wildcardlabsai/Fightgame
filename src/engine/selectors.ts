import { TIER_DEFS } from './tiers'
import { DAYS_PER_WEEK, weeksBetween } from './calendar'
import { WEEKLY_COSTS } from './config'
import { BALANCE } from './balance'
import { fighterAge, fighterName } from './fighters'
import { cardFights, officialsCost, productionCost, purseCommitments } from './events/demand'
import type { Contract, Fighter, FinancialHealth, GameState, Promotion } from './types'

export function player(state: GameState): Promotion {
  return state.promotions[state.playerPromotionId]
}

export function rosterOf(state: GameState, promotionId: string): Fighter[] {
  return Object.values(state.contracts)
    .filter((c) => c.promotionId === promotionId)
    .map((c) => state.fighters[c.fighterId])
    .filter((f): f is Fighter => !!f && f.status === 'active')
}

export function playerRoster(state: GameState): Fighter[] {
  return rosterOf(state, state.playerPromotionId)
}

export function freeAgents(state: GameState): Fighter[] {
  return Object.values(state.fighters).filter((f) => f.status === 'active' && f.contractId === null)
}

export function contractOf(state: GameState, f: Fighter): Contract | null {
  return f.contractId ? state.contracts[f.contractId] ?? null : null
}

export function promotionOf(state: GameState, f: Fighter): Promotion | null {
  const c = contractOf(state, f)
  return c ? state.promotions[c.promotionId] ?? null : null
}

/** Total weekly running costs of the player's promotion. */
export function weeklyBurn(state: GameState): { overheads: number; scouting: number; retainers: number; total: number } {
  const retainers = Object.values(state.contracts)
    .filter((c) => c.promotionId === state.playerPromotionId)
    .reduce((s, c) => s + c.weeklyRetainer, 0)
  const overheads = overheadCost(state)
  const scouting = state.scouts.reduce((n, x) => n + x.weeklyWage, 0)
  return { overheads, scouting, retainers, total: overheads + scouting + retainers }
}

export function overheadCost(state: GameState): number {
  const mult = state.settings.difficulty === 'brutal' ? 1.2 : state.settings.difficulty === 'forgiving' ? 0.85 : 1
  return Math.round((WEEKLY_COSTS.office + WEEKLY_COSTS.staff + WEEKLY_COSTS.gym + WEEKLY_COSTS.insurance) * mult * TIER_DEFS[player(state).tier].overheadMult)
}

export function cashRunwayWeeks(state: GameState): number | null {
  const burn = weeklyBurn(state).total
  if (burn <= 0) return null
  return Math.max(0, Math.floor(player(state).cash / burn))
}

export interface HealthReport {
  state: FinancialHealth
  label: string
  reason: string
  runwayWeeks: number | null
  /** Cash still to be paid out for shows that have not yet run (purses, production, officials). */
  commitments: number
}

/** Cash still owed on open shows: purses, staging and officials that have not been paid yet. */
export function eventCommitments(state: GameState): number {
  let n = 0
  for (const ev of Object.values(state.events)) {
    if (ev.promotionId !== state.playerPromotionId || !['venueBooked', 'cardBuilding', 'onSale', 'promoting', 'fightWeek', 'live'].includes(ev.status)) continue
    const fights = cardFights(state, ev).filter((f) => !f.paid)
    if (fights.length === 0) continue
    const pc = purseCommitments(state, ev)
    const v = state.venues[ev.venueId]
    n += pc.purses + (ev.status === 'fightWeek' || ev.status === 'live' ? 0 : productionCost(v)) + officialsCost(fights.length) + Math.max(0, ev.marketing.budget - ev.marketing.spent)
  }
  return Math.round(n)
}

/** Healthy → concern → critical → insolvent. Never a game over: insolvency just blocks new spending. */
export function financialHealth(state: GameState): HealthReport {
  const H = BALANCE.events.health
  const cash = player(state).cash
  const runway = cashRunwayWeeks(state)
  const commitments = eventCommitments(state)
  const free = cash - commitments
  if (cash < H.insolventCash) return { state: 'insolvent', label: 'INSOLVENT', reason: 'You owe more than you can cover. New spending is blocked until cash recovers.', runwayWeeks: 0, commitments }
  if (cash < 0 || (runway !== null && runway < H.criticalWeeks) || free < 0) {
    return { state: 'critical', label: 'CRITICAL', reason: cash < 0 ? 'The account is overdrawn.' : free < 0 ? 'Upcoming show costs exceed your cash.' : `Only ${runway} weeks of running costs in the bank.`, runwayWeeks: runway, commitments }
  }
  if ((runway !== null && runway < H.concernWeeks) || free < cash * 0.25) return { state: 'concern', label: 'CONCERN', reason: runway !== null && runway < H.concernWeeks ? `${runway} weeks of running costs in the bank.` : 'Most of your cash is already committed to upcoming shows.', runwayWeeks: runway, commitments }
  return { state: 'healthy', label: 'HEALTHY', reason: 'Comfortable cash and no pressing commitments.', runwayWeeks: runway, commitments }
}

export function unreadCount(state: GameState): number {
  return state.inbox.reduce((n, m) => n + (m.read ? 0 : 1), 0)
}

export type Severity = 'critical' | 'warning' | 'info'

export interface AttentionItem {
  id: string
  severity: Severity
  title: string
  detail: string
  link?: { kind: 'fighter'; id: string } | { kind: 'screen'; screen: string }
  actionLabel?: string
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }

/** Everything on the player's desk that needs a decision, most urgent first. */
export function attentionItems(state: GameState): AttentionItem[] {
  const items: AttentionItem[] = []
  const runway = cashRunwayWeeks(state)
  const cash = player(state).cash

  if (cash < 0) {
    items.push({ id: 'cash-neg', severity: 'critical', title: 'Promotion is overdrawn', detail: 'You are running at a loss with no money in the bank.', link: { kind: 'screen', screen: 'finances' }, actionLabel: 'Open finances' })
  } else if (runway !== null && runway < 8) {
    items.push({ id: 'cash-low', severity: 'critical', title: `Only ${runway} weeks of cash left`, detail: 'Weekly costs will exhaust your funds soon.', link: { kind: 'screen', screen: 'finances' }, actionLabel: 'Review costs' })
  } else if (runway !== null && runway < 26) {
    items.push({ id: 'cash-watch', severity: 'warning', title: `Cash runway: ${runway} weeks`, detail: 'Income needs to start covering the weekly burn.', link: { kind: 'screen', screen: 'finances' }, actionLabel: 'Review costs' })
  }

  for (const f of playerRoster(state)) {
    const c = contractOf(state, f)
    if (c) {
      const weeksLeft = weeksBetween(state.today, c.endDay)
      if (weeksLeft <= BALANCE.contracts.approachingWeeks) {
        const closing = weeksLeft <= BALANCE.contracts.expiringWeeks
        items.push({
          id: `contract-${f.id}`, severity: closing ? 'critical' : weeksLeft <= BALANCE.contracts.windowWeeks ? 'warning' : 'info',
          title: `${fighterName(f)}'s contract ${weeksLeft <= 0 ? 'expires this week' : `expires in ${weeksLeft} week${weeksLeft === 1 ? '' : 's'}`}`,
          detail: state.negotiations[f.id] ? 'Renewal talks are open.' : 'Open renewal talks before a rival gets to them.',
          link: { kind: 'screen', screen: `negotiation/${f.id}` }, actionLabel: 'Negotiate',
        })
      }
    }
    if (f.morale < 40) {
      items.push({ id: `morale-${f.id}`, severity: 'warning', title: `${fighterName(f)} is unhappy`, detail: 'Low morale hurts development and negotiating goodwill.', link: { kind: 'fighter', id: f.id }, actionLabel: 'View fighter' })
    }
    if (f.fitness < 60) {
      items.push({ id: `fit-${f.id}`, severity: 'info', title: `${fighterName(f)} is run down`, detail: 'Consider switching training to Recovery.', link: { kind: 'fighter', id: f.id }, actionLabel: 'Adjust training' })
    }
    if (fighterAge(f, state.today) >= 35 && f.status === 'active') {
      items.push({ id: `age-${f.id}`, severity: 'info', title: `${fighterName(f)} is ${fighterAge(f, state.today)}`, detail: 'Retirement risk grows every week.', link: { kind: 'fighter', id: f.id } })
    }
  }

  for (const n of Object.values(state.negotiations)) {
    const f = state.fighters[n.fighterId]
    if (n.status === 'open' && n.lastCounter && f) {
      items.push({ id: `counter-${f.id}`, severity: 'warning', title: `Counter-offer from ${fighterName(f)}'s camp`, detail: 'They are waiting on your answer.', link: { kind: 'screen', screen: `negotiation/${f.id}` }, actionLabel: 'Review' })
    }
  }
  const done = state.scoutOps.filter((o) => o.status === 'active').length
  const idle = state.scouts.length > 0 && done === 0
  if (idle && Object.keys(state.knowledge).length > 0) {
    items.push({ id: 'scout-idle', severity: 'info', title: 'Your scout is idle', detail: 'Commission a report or a talent search.', link: { kind: 'screen', screen: 'scouting' }, actionLabel: 'Scouting' })
  }

  const urgentUnread = state.inbox.filter((m) => !m.read && m.priority === 'urgent').length
  if (urgentUnread > 0) {
    items.push({ id: 'urgent-mail', severity: 'critical', title: `${urgentUnread} urgent message${urgentUnread === 1 ? '' : 's'}`, detail: 'Waiting in your inbox.', link: { kind: 'screen', screen: 'inbox' }, actionLabel: 'Open inbox' })
  }

  return items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
}

export function weeksSince(state: GameState, day: number | null): number | null {
  return day === null ? null : Math.floor((state.today - day) / DAYS_PER_WEEK)
}
