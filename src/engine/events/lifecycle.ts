import type { BoxingEvent, EventStatus } from '../types'

/** Legal event transitions. Anything else is a bug and is refused. */
const NEXT: Record<EventStatus, EventStatus[]> = {
  planning: ['venueBooked', 'cancelled'],
  venueBooked: ['cardBuilding', 'cancelled'],
  cardBuilding: ['onSale', 'cancelled'],
  onSale: ['promoting', 'fightWeek', 'cancelled'],
  promoting: ['fightWeek', 'cancelled'],
  fightWeek: ['live', 'cancelled'],
  live: ['completed'],
  completed: ['settled'],
  settled: ['archived'],
  archived: [],
  cancelled: [],
}

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  planning: 'Planning', venueBooked: 'Venue booked', cardBuilding: 'Building the card', onSale: 'Tickets on sale', promoting: 'Promoting',
  fightWeek: 'Fight week', live: 'Live', completed: 'Completed', settled: 'Settled', archived: 'Archived', cancelled: 'Cancelled',
}

export const OPEN_EVENT: EventStatus[] = ['planning', 'venueBooked', 'cardBuilding', 'onSale', 'promoting', 'fightWeek', 'live']

export function canEventTransition(from: EventStatus, to: EventStatus): boolean {
  return NEXT[from].includes(to)
}

export function eventTransition(ev: BoxingEvent, to: EventStatus): void {
  if (!canEventTransition(ev.status, to)) throw new Error(`Illegal event transition ${ev.status} → ${to} (${ev.id})`)
  ev.status = to
}

export function isEventOpen(ev: BoxingEvent): boolean {
  return OPEN_EVENT.includes(ev.status)
}

/** Statuses in which tickets are being sold. */
export function isOnSale(ev: BoxingEvent): boolean {
  return ev.status === 'onSale' || ev.status === 'promoting'
}
