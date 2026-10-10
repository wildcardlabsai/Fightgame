import { useMemo } from 'react'
import { signingForecast } from '../../engine/advisor'
import type { NegotiationKind, Offer } from '../../engine/types'
import { useGame } from '../../store/gameStore'
import { money } from '../format'

/**
 * What the terms on the table do to the books, shown where the player commits (the draft being offered, or the camp's counter being accepted).
 * Derived from the live state every render: nothing is cached. Recurring and immediate costs are separate; warnings never block anything.
 */
export function SigningForecastBox({ fighterId, offer, kind, label, testid = 'signing-forecast' }: { fighterId: string; offer: Offer; kind: NegotiationKind; label: string; testid?: string }) {
  const game = useGame((s) => s.game)!
  const f = useMemo(() => signingForecast(game, fighterId, offer, kind), [game, fighterId, offer, kind])
  if (!f) return null
  const m = (n: number) => money(n, false)
  const delta = f.runningAfter - f.runningBefore
  return (
    <section className="sf" data-testid={testid} aria-label={`What this does to the books ${label}`}>
      <div className="sf-head"><span className="caps">The books {label}</span><span className={`chip sf-${f.confidence}`} data-testid={`${testid}-confidence`}>{f.confidenceLabel}</span></div>
      <div className="sf-cols">
        <dl className="sf-col" aria-label="Paid today">
          <div className="caps dim">Paid today</div>
          <div className="kv"><dt>Signing bonus</dt><dd className="num">{m(f.upfront)}</dd></div>
          <div className="kv"><dt>Cash now</dt><dd className={`num ${f.cash < 0 ? 'red' : ''}`}>{m(f.cash)}</dd></div>
          <div className="kv"><dt>Cash after</dt><dd className={`num ${f.cashAfter < 0 ? 'red' : ''}`}>{m(f.cashAfter)}{f.weeksOfCostsAfter !== null ? <span className="dim"> · {f.weeksOfCostsAfter} wks of costs</span> : null}</dd></div>
        </dl>
        <dl className="sf-col" aria-label="Every year">
          <div className="caps dim">Every year</div>
          <div className="kv"><dt>Running costs now</dt><dd className="num">{m(f.runningBefore)}</dd></div>
          <div className="kv"><dt>{kind === 'renewal' ? 'Retainer (was → now)' : 'His retainer'}</dt><dd className="num">{kind === 'renewal' ? `${m(f.retainerOld)} → ${m(f.retainerNew)}` : m(f.retainerNew)}</dd></div>
          <div className="kv"><dt>Running costs after</dt><dd className="num"><b>{m(f.runningAfter)}</b>{delta !== 0 ? <span className={delta > 0 ? 'red' : 'good'}> {delta > 0 ? '+' : '−'}{m(Math.abs(delta))}</span> : null}</dd></div>
          {f.debtService > 0 && <div className="kv"><dt>…of which loan instalments</dt><dd className="num">{m(f.debtService)}</dd></div>}
        </dl>
      </div>
      <p className="sf-summary" data-testid={`${testid}-summary`}>{f.summary}</p>
      {f.warnings.length > 0 && <ul className="sf-warn" role="status" data-testid={`${testid}-warnings`}>{f.warnings.map((w) => <li key={w.id} data-warning={w.id}>{w.text}</li>)}</ul>}
      <details className="sf-more">
        <summary>How this is worked out</summary>
        <p className="dim">Per fight: {f.purseNote}</p>
        <ul>{f.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
        <p className="dim">Roster: {f.rosterBefore} → {f.rosterAfter}. This is information, not a rule: nothing stops you signing.</p>
      </details>
    </section>
  )
}
