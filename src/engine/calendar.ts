import type { Day } from './types'

export const DAYS_PER_WEEK = 7
const MS_PER_DAY = 86_400_000

export function dayFromIso(iso: string): Day {
  return Math.floor(Date.parse(iso + 'T00:00:00Z') / MS_PER_DAY)
}

export function dayToDate(day: Day): Date {
  return new Date(day * MS_PER_DAY)
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatDay(day: Day, withYear = true): string {
  const d = dayToDate(day)
  const base = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
  return withYear ? `${base} ${d.getUTCFullYear()}` : base
}

export function yearOf(day: Day): number {
  return dayToDate(day).getUTCFullYear()
}

export function monthIndex(day: Day): number {
  return dayToDate(day).getUTCMonth()
}

/** Whole years between a birth day and `today`. */
export function ageOn(birthDay: Day, today: Day): number {
  const b = dayToDate(birthDay)
  const t = dayToDate(today)
  let age = t.getUTCFullYear() - b.getUTCFullYear()
  const beforeBirthday =
    t.getUTCMonth() < b.getUTCMonth() ||
    (t.getUTCMonth() === b.getUTCMonth() && t.getUTCDate() < b.getUTCDate())
  if (beforeBirthday) age--
  return age
}

/** True if the fighter's birthday falls in the 7 days ending at `today` (exclusive of the previous tick). */
export function birthdayInWeek(birthDay: Day, today: Day): boolean {
  const b = dayToDate(birthDay)
  for (let i = 0; i < DAYS_PER_WEEK; i++) {
    const t = dayToDate(today - i)
    if (t.getUTCMonth() === b.getUTCMonth() && t.getUTCDate() === b.getUTCDate()) return true
  }
  return false
}

export function weeksBetween(from: Day, to: Day): number {
  return Math.floor((to - from) / DAYS_PER_WEEK)
}

/** Season label used in headers, e.g. "Week 41 · 2026". */
export function weekOfYear(day: Day): number {
  const d = dayToDate(day)
  const start = Date.UTC(d.getUTCFullYear(), 0, 1)
  return Math.floor((d.getTime() - start) / (MS_PER_DAY * 7)) + 1
}
