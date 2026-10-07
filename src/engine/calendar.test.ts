import { describe, expect, it } from 'vitest'
import { ageOn, birthdayInWeek, civil, dayToDate, monthIndex, yearOf } from './calendar'

describe('integer calendar arithmetic matches the Date-based definition', () => {
  it('civil / yearOf / monthIndex agree with Date for 80 years of days', () => {
    for (let d = -3000; d < 26000; d += 1) {
      const dt = dayToDate(d)
      const [y, m, day] = civil(d)
      expect([y, m - 1, day]).toEqual([dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()])
      expect(yearOf(d)).toBe(dt.getUTCFullYear()); expect(monthIndex(d)).toBe(dt.getUTCMonth())
    }
  })
  it('ageOn and birthdayInWeek agree with the Date-based reference, including 29 February', () => {
    const refAge = (b: number, t: number) => { const x = dayToDate(b), y = dayToDate(t); let a = y.getUTCFullYear() - x.getUTCFullYear(); if (y.getUTCMonth() < x.getUTCMonth() || (y.getUTCMonth() === x.getUTCMonth() && y.getUTCDate() < x.getUTCDate())) a--; return a }
    const refBday = (b: number, t: number) => { const x = dayToDate(b); for (let i = 0; i < 7; i++) { const y = dayToDate(t - i); if (y.getUTCMonth() === x.getUTCMonth() && y.getUTCDate() === x.getUTCDate()) return true } return false }
    for (let b = -6000; b < 3000; b += 37) for (let t = 15000; t < 22000; t += 7) {
      expect(ageOn(b, t)).toBe(refAge(b, t))
      expect(birthdayInWeek(b, t)).toBe(refBday(b, t))
    }
  })
})
