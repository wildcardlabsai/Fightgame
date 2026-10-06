import type { RangeView, TraitView } from '../../engine/view'

/** "62–70" (dimmed and prefixed when the number is only a public-information guess). */
export function RangeText({ r, scouted = true }: { r: RangeView; scouted?: boolean }) {
  return (
    <span className={`range-text${scouted ? '' : ' guess'}`} title={scouted ? 'Scout estimate' : 'Rough guess from public information only — commission a report'}>
      {scouted ? '' : '~'}{r.lo}–{r.hi}
    </span>
  )
}

/** A horizontal track with the believed range shaded. Hatched when unscouted. */
export function RangeBar({ r, scouted = true, label }: { r: RangeView; scouted?: boolean; label?: string }) {
  return (
    <div className={`range-bar${scouted ? '' : ' guess'}`} role="img" aria-label={`${label ?? 'Estimate'}: ${scouted ? '' : 'rough guess, '}${r.lo} to ${r.hi}`}>
      <i style={{ left: `${r.lo}%`, width: `${Math.max(2, r.hi - r.lo)}%` }} />
    </div>
  )
}

export function TraitRow({ t }: { t: TraitView }) {
  return (
    <div className="trait-row">
      <span>{t.name}</span>
      <RangeBar r={t} scouted={t.scouted} label={t.name} />
      <span className="trait-val">
        <RangeText r={t} scouted={t.scouted} />
        <small className="dim">{t.scouted ? t.label : 'Unscouted'}</small>
      </span>
    </div>
  )
}

export function KnowledgePips({ level }: { level: string }) {
  const n = ['Unknown', 'Rumour', 'Basic', 'Detailed', 'Comprehensive'].indexOf(level)
  return (
    <span className="pips" title={`Scouting knowledge: ${level}`} aria-label={`Scouting knowledge: ${level}`}>
      {[1, 2, 3, 4].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}
    </span>
  )
}
