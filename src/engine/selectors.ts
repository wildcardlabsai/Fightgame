import { DAYS_PER_WEEK, weeksBetween } from './calendar'
import { WEEKLY_COSTS } from './config'
import { fighterAge, fighterName, fighterRating } from './fighters'
import type { Contract, Fighter, GameState, Promotion } from './types'

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
export function weeklyBurn(state: GameState): { overheads: number; retainers: number; total: number } {
  const retainers = Object.values(state.contracts)
    .filter((c) => c.promotionId === state.playerPromotionId)
    .reduce((s, c) => s + c.weeklyRetainer, 0)
  const overheads = overheadCost(state)
  return { overheads, retainers, total: overheads + retainers }
}

export function overheadCost(state: GameState): number {
  const mult = state.settings.difficulty === 'brutal' ? 1.2 : state.settings.difficulty === 'forgiving' ? 0.85 : 1
  return Math.round((WEEKLY_COSTS.office + WEEKLY_COSTS.staff + WEEKLY_COSTS.gym + WEEKLY_COSTS.insurance) * mult)
}

export function cashRunwayWeeks(state: GameState): number | null {
  const burn = weeklyBurn(state).total
  if (burn <= 0) return null
  return Math.max(0, Math.floor(player(state).cash / burn))
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
      if (weeksLeft <= 12) {
        items.push({
          id: `contract-${f.id}`, severity: weeksLeft <= 4 ? 'critical' : 'warning',
          title: `${fighterName(f)}'s contract ${weeksLeft <= 0 ? 'expires this week' : `expires in ${weeksLeft} week${weeksLeft === 1 ? '' : 's'}`}`,
          detail: 'Contract renewals arrive with Phase 2 — the fighter will become a free agent.',
          link: { kind: 'fighter', id: f.id }, actionLabel: 'View fighter',
        })
      }
    }
    if (f.morale < 40) {
      items.push({ id: `morale-${f.id}`, severity: 'warning', title: `${fighterName(f)} is unhappy`, detail: `Morale ${Math.round(f.morale)} — low morale hurts development and performance.`, link: { kind: 'fighter', id: f.id }, actionLabel: 'View fighter' })
    }
    if (f.fitness < 60) {
      items.push({ id: `fit-${f.id}`, severity: 'info', title: `${fighterName(f)} is run down`, detail: `Fitness ${Math.round(f.fitness)}. Consider switching training to Recovery.`, link: { kind: 'fighter', id: f.id }, actionLabel: 'Adjust training' })
    }
    if (fighterAge(f, state.today) >= 35 && f.status === 'active') {
      items.push({ id: `age-${f.id}`, severity: 'info', title: `${fighterName(f)} is ${fighterAge(f, state.today)}`, detail: 'Retirement risk grows every week.', link: { kind: 'fighter', id: f.id } })
    }
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

/** Fighters on the player's roster sorted best first. */
export function rosterByRating(state: GameState): Fighter[] {
  return playerRoster(state).sort((a, b) => fighterRating(b) - fighterRating(a))
}
