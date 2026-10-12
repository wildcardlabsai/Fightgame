import { useMemo } from 'react'
import { cashOutlook } from '../../engine/cashForecast'
import { useGame } from '../../store/gameStore'
import { money } from '../format'

/** Next 12 weeks of cash: the middle line, a band from your shows' low to high forecasts, and where it would run out. Drawn to one scale. */
export function CashOutlook() {
  const game = useGame((s) => s.game)!
  const o = useMemo(() => cashOutlook(game, 12), [game])
  const W = 640, H = 220, L = 58, R = 12, T = 14, B = 28
  const vals = o.points.flatMap((p) => [p.low, p.mid, p.high, 0])
  const min = Math.min(...vals), max = Math.max(...vals), span = Math.max(1, max - min)
  const x = (w: number) => L + ((W - L - R) * w) / 12
  const y = (v: number) => T + (H - T - B) * (1 - (v - min) / span)
  const line = (k: 'low' | 'mid' | 'high') => o.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.week).toFixed(1)} ${y(p[k]).toFixed(1)}`).join('')
  const band = `${o.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.week).toFixed(1)} ${y(p.high).toFixed(1)}`).join('')}${[...o.points].reverse().map((p) => `L${x(p.week).toFixed(1)} ${y(p.low).toFixed(1)}`).join('')}Z`
  const ticks = [min, min + span / 2, max]
  const last = o.points[o.points.length - 1]
  return (
    <div data-testid="cash-outlook">
      <svg viewBox={`0 0 ${W} ${H}`} className="cash-chart" role="img" aria-label={`Cash outlook for 12 weeks: from ${money(o.points[0].mid)} to about ${money(last.mid)}${o.runsOutWeek !== null ? `, running out in week ${o.runsOutWeek}` : ''}`}>
        {ticks.map((t, i) => <g key={i}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="cc-grid" /><text x={L - 6} y={y(t) + 4} textAnchor="end" className="cc-label">{money(t)}</text></g>)}
        {min < 0 && max > 0 && <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="cc-zero" />}
        <path d={band} className="cc-band" />
        <path d={line('mid')} className="cc-line" fill="none" />
        {o.shows.map((s, i) => <g key={i}><line x1={x(s.week)} x2={x(s.week)} y1={T} y2={H - B} className="cc-show" /><text x={x(s.week)} y={T + 9} textAnchor="middle" className="cc-label">{s.name.length > 18 ? s.name.slice(0, 17) + '…' : s.name}</text></g>)}
        {[0, 3, 6, 9, 12].map((w) => <text key={w} x={x(w)} y={H - 8} textAnchor="middle" className="cc-label">{w === 0 ? 'Now' : `+${w}w`}</text>)}
        <circle cx={x(12)} cy={y(last.mid)} r="4" className="cc-end" />
      </svg>
      <p className="dim cc-note">
        Running costs are about {money(o.burn)} a week{o.shows.length ? `; ${o.shows.length} open show${o.shows.length === 1 ? '' : 's'} add their forecast profit in the week they are held (the shaded band is the low-to-high forecast).` : '; no show is booked yet, so nothing is expected to come in.'}
        {o.runsOutWeek !== null ? <b className="red"> On this outlook cash runs out around week {o.runsOutWeek}.</b> : <> The lowest point is {money(o.lowestMid.cash)}{o.lowestMid.week ? ` in week ${o.lowestMid.week}` : ' now'}.</>}
      </p>
    </div>
  )
}
