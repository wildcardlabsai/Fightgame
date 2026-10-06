import type { ReactNode } from 'react'
import type { FighterView } from '../../engine/view'
import { Flag } from './Bits'

export function StarRating({ n, max = 5, label }: { n: number; max?: number; label: string }) {
  return (
    <span className="stars" role="img" aria-label={`${label}: ${n} of ${max}`}>
      {'★'.repeat(n)}<span className="off">{'★'.repeat(max - n)}</span>
    </span>
  )
}

export function FormDots({ form }: { form: ('W' | 'L' | 'D')[] }) {
  if (form.length === 0) return <span className="dim">—</span>
  return <span className="form-dots" aria-label={`Recent form ${form.join(' ')}`}>{form.map((r, i) => <b key={i} className={r}>{r}</b>)}</span>
}

export function VerdictChip({ v }: { v: 'Low risk' | 'Competitive' | 'High risk' }) {
  return <span className={`verdict ${v === 'Low risk' ? 'low' : v === 'Competitive' ? 'mid' : 'high'}`}>{v}</span>
}

export function Corner({ v, side, record, extra }: { v: FighterView; side: 'a' | 'b'; record: string; extra?: ReactNode }) {
  return (
    <div className={`corner ${side}`}>
      <div className="display nm"><small>{v.nickname ? `“${v.nickname}”` : v.style}</small>{v.firstName} <span className="l">{v.lastName}</span></div>
      <div className="rec">{record} <Flag code={v.nationKey} /></div>
      {extra}
    </div>
  )
}

/** Two-sided comparison bar. */
export function StatBar({ label, a, b, fmt }: { label: string; a: number; b: number; fmt?: (n: number) => string }) {
  const tot = a + b || 1
  const f = fmt ?? String
  return (
    <div className="statbar">
      <div className="l">{f(a)}</div>
      <div className="mid"><span>{label}</span><div className="split"><i className="a" style={{ width: `${(a / tot) * 100}%` }} /><i className="b" style={{ width: `${(b / tot) * 100}%` }} /></div></div>
      <div className="r">{f(b)}</div>
    </div>
  )
}
