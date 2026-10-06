import type { Fight, FightStatus } from '../types'

/** Legal fight state transitions. Anything else is a bug and is refused. */
const NEXT: Record<FightStatus, FightStatus[]> = {
  negotiating: ['agreed', 'cancelled'],
  agreed: ['scheduled', 'cancelled'],
  scheduled: ['training', 'cancelled'],
  training: ['fightNight', 'cancelled'],
  fightNight: ['completed', 'cancelled'],
  completed: ['processed'],
  processed: ['postFight'],
  postFight: [],
  cancelled: [],
}

export const STATUS_LABEL: Record<FightStatus, string> = {
  negotiating: 'Negotiating', agreed: 'Agreed — to schedule', scheduled: 'Scheduled', training: 'In camp', fightNight: 'Fight night',
  completed: 'Completed', processed: 'Result processed', postFight: 'Final', cancelled: 'Cancelled',
}

export const OPEN_STATUSES: FightStatus[] = ['negotiating', 'agreed', 'scheduled', 'training', 'fightNight']

export function canTransition(from: FightStatus, to: FightStatus): boolean {
  return NEXT[from].includes(to)
}

export function transition(fight: Fight, to: FightStatus): void {
  if (!canTransition(fight.status, to)) throw new Error(`Illegal fight transition ${fight.status} → ${to} (${fight.id})`)
  fight.status = to
}

export function isOpen(fight: Fight): boolean {
  return OPEN_STATUSES.includes(fight.status)
}
