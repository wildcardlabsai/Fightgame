import type { Day } from './types'

export const DAYS_PER_WEEK = 7
const MS_PER_DAY = 86_400_000

export function dayFromIso(iso: string): Day {
  return Math.floor(Date.parse(iso + 'T00:00:00Z') / MS_PER_DAY)
}

/** Year, month (1–12) and day-of-month for a day number, by integer arithmetic (no Date allocation — this is called per fighter per week). */
export function civil(day: Day): [number, number, number] {
  const z = day + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d]
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
  return civil(day)[0]
}

export function monthIndex(day: Day): number {
  return civil(day)[1] - 1
}

/** Whole years between a birth day and `today`. */
export function ageOn(birthDay: Day, today: Day): number {
  const [by, bm, bd] = civil(birthDay)
  const [ty, tm, td] = civil(today)
  let age = ty - by
  if (tm < bm || (tm === bm && td < bd)) age--
  return age
}

/** True if the fighter's birthday falls in the 7 days ending at `today` (exclusive of the previous tick). */
export function birthdayInWeek(birthDay: Day, today: Day): boolean {
  const [, bm, bd] = civil(birthDay)
  for (let i = 0; i < DAYS_PER_WEEK; i++) {
    const [, m, d] = civil(today - i)
    if (m === bm && d === bd) return true
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
