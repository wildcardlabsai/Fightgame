import { useEffect, useMemo } from 'react'
import { LEVEL_LABEL, visibleAdvice, type Advice, type AdviceLevel } from '../../engine/advisor'
import { useGame } from '../../store/gameStore'
import { emitGameEvent } from '../../store/gameEvents'
import { usePrefs } from '../../store/prefs'
import { money } from '../format'

const GLYPH: Record<AdviceLevel, string> = { info: 'i', tip: '✦', caution: '▲', highRisk: '◆', critical: '✖' }

/** The advisor's filtered view of a list (mode comes from Settings → Advisor). */
export function useAdvice(list: Advice[], cap = 4): Advice[] {
  const mode = usePrefs((s) => s.advisor)
  return useMemo(() => visibleAdvice(list, mode, cap), [list, mode, cap])
}

export function AdviceCard({ a, compact }: { a: Advice; compact?: boolean }) {
  const openLink = useGame((s) => s.openLink)
  const route = useGame((s) => s.route)
  // No "Review event" button on the event's own page: you are already there.
  const here = a.link?.kind === 'event' && route.screen === 'event' && route.param === a.link.id
  return (
    <div className={`advice ${a.level}`} role={a.level === 'critical' || a.level === 'highRisk' ? 'alert' : 'note'} data-advice={a.id} data-level={a.level}>
      <div className="advice-icon" aria-hidden="true">{GLYPH[a.level]}</div>
      <div className="advice-main">
        <div className="advice-head"><span className="advice-level">{LEVEL_LABEL[a.level]}</span><span className="advice-title">{a.title}</span></div>
        <div className="advice-body">{a.body}</div>
        {!compact && a.facts && a.facts.length > 0 && (
          <dl className="advice-facts">
            {a.facts.map((f) => (
              <div key={f.label}><dt>{f.label}</dt><dd className={f.tone ?? ''}>{f.text ?? money(f.money ?? 0, false)}</dd></div>
            ))}
          </dl>
        )}
      </div>
      {a.link && a.actionLabel && !here && <button className="btn small go" onClick={() => openLink(a.link!)}>{a.actionLabel}</button>}
    </div>
  )
}

/** A stack of advice cards. Renders nothing when the advisor has nothing to say (or is switched off). */
export function AdvicePanel({ list, cap = 4, compact, title }: { list: Advice[]; cap?: number; compact?: boolean; title?: string }) {
  const shown = useAdvice(list, cap)
  const key = shown.map((a) => `${a.id}:${a.level}`).join('|')
  // One warning sound per piece of serious advice, however often this re-renders (the manager de-duplicates by id).
  useEffect(() => { for (const a of shown) emitGameEvent({ type: 'advice', id: a.id, level: a.level }) }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  if (shown.length === 0) return null
  return (
    <div className="advice-stack" aria-label={title ?? 'Promoter advice'}>
      {title && <div className="caps advice-title-row">{title}</div>}
      {shown.map((a) => <AdviceCard key={a.id} a={a} compact={compact} />)}
    </div>
  )
}
