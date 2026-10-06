import { formatDay } from '../../engine/calendar'
import { money } from '../format'

export interface Point { x: number; y: number }

/** Area/line chart of a series, with labelled min/max and endpoint dates. Pure SVG. */
export function AreaChart({ points, height = 160, color = 'var(--red)', formatY = money }: {
  points: Point[]; height?: number; color?: string; formatY?: (n: number) => string
}) {
  const W = 640
  const pad = { l: 8, r: 8, t: 14, b: 22 }
  if (points.length < 2) return <p className="empty">The chart fills in as weeks pass.</p>
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minY = Math.min(...ys, 0)
  const maxY = Math.max(...ys)
  const spanY = maxY - minY || 1
  const sx = (x: number) => pad.l + ((x - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * (W - pad.l - pad.r)
  const sy = (y: number) => pad.t + (1 - (y - minY) / spanY) * (height - pad.t - pad.b)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
  const area = `${line} L${sx(xs[xs.length - 1])},${height - pad.b} L${sx(xs[0])},${height - pad.b} Z`
  const last = points[points.length - 1]
  const gid = `g${color.replace(/[^a-z0-9]/gi, '')}`
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Chart">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".5" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {minY < 0 && <line x1={pad.l} x2={W - pad.r} y1={sy(0)} y2={sy(0)} stroke="rgba(255,255,255,.25)" strokeDasharray="4 4" />}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx={sx(last.x)} cy={sy(last.y)} r="4.5" fill={color} />
      <text x={pad.l} y={height - 6}>{formatDay(xs[0], false)}</text>
      <text x={W - pad.r} y={height - 6} textAnchor="end">{formatDay(xs[xs.length - 1], false)}</text>
      <text x={pad.l} y={11}>{formatY(maxY)}</text>
    </svg>
  )
}

export function Ring({ value, size = 132, stroke = 9, color = 'var(--red)' }: { value: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1c1c25" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${(c * Math.min(100, value)) / 100} ${c}`} strokeLinecap="butt" style={{ transition: 'stroke-dasharray .6s ease' }} />
    </svg>
  )
}
