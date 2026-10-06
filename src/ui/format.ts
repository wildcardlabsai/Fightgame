export function money(n: number, compact = true): string {
  const sign = n < 0 ? '-' : ''
  const a = Math.abs(n)
  if (compact) {
    if (a >= 1_000_000_000) return `${sign}£${(a / 1_000_000_000).toFixed(2)}bn`
    if (a >= 10_000_000) return `${sign}£${(a / 1_000_000).toFixed(1)}m`
    if (a >= 1_000_000) return `${sign}£${(a / 1_000_000).toFixed(2)}m`
    if (a >= 100_000) return `${sign}£${Math.round(a / 1000)}k`
    if (a >= 10_000) return `${sign}£${(a / 1000).toFixed(1)}k`
  }
  return `${sign}£${Math.round(a).toLocaleString('en-GB')}`
}

export function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`
  return String(Math.round(n))
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
