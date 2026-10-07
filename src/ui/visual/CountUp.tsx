import { useCountUp } from './motion'

/** A number that eases to its value. `fmt` formats each frame (money, thousands separators…). */
export function CountUp({ value, fmt, ms = 800, className, from }: { value: number; fmt?: (n: number) => string; ms?: number; className?: string; /** Start here on first show (e.g. 0 to count up when a panel appears). */ from?: number }) {
  const v = useCountUp(value, ms, from)
  return <span className={className}>{fmt ? fmt(v) : v.toLocaleString('en-GB')}</span>
}

/** A signed change chip ("+£2,400") that appears beside a count-up. */
export function Delta({ value, fmt }: { value: number; fmt?: (n: number) => string }) {
  if (!value) return null
  const f = fmt ?? ((n: number) => Math.abs(n).toLocaleString('en-GB'))
  return <span className={`v-delta ${value > 0 ? 'good' : 'red'}`}>{value > 0 ? '+' : '−'}{f(Math.abs(value))}</span>
}
