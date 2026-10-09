import { useMemo, useState } from 'react'
import { careerView } from '../../engine/office/views'
import { useGame } from '../../store/gameStore'
import { Section } from '../components/Bits'
import '../../styles/office54c.css'

/** The promoter's career objective for one of their fighters: where the promotion is taking him, what comes next, what stands in the way. */
export function ObjectivePanel({ id }: { id: string }) {
  const game = useGame((s) => s.game)!
  const officeDo = useGame((s) => s.officeDo)
  const v = useMemo(() => careerView(game, id), [game, id])
  const [picking, setPicking] = useState(false)
  if (!v) return null
  const g = v.goal
  return (
    <Section title="Career objective" right={<span className="dim" style={{ fontSize: 13 }}>Plan: {v.planLabel}</span>}>
      <div data-testid="objective-panel">
        {g ? (
          <>
            <div className="o54-head"><h3 style={{ margin: 0 }} data-testid="objective-label">{g.label}</h3><span className="o54-chip gold">{g.done} of {g.steps.length} milestones</span></div>
            <div className="o54-bar" aria-hidden="true"><i style={{ width: `${(g.done / Math.max(1, g.steps.length)) * 100}%` }} /></div>
            <ul className="o54-steps" data-testid="objective-steps">
              {g.steps.map((s) => (
                <li key={s.label} className={s.done ? 'done' : ''}><span className="tick" aria-hidden="true">{s.done ? '✓' : '○'}</span><span>{s.label}<small>{s.done ? 'Done. ' : ''}{s.detail}</small></span></li>
              ))}
            </ul>
            {g.next && <p style={{ margin: '4px 0' }} data-testid="objective-next"><b>Next:</b> {g.next.label}. <span className="dim">{g.next.detail}</span></p>}
            {g.obstacles.length > 0 && <ul className="w54-notes" data-testid="objective-obstacles">{g.obstacles.map((o) => <li key={o}>{o}</li>)}</ul>}
          </>
        ) : (
          <p style={{ margin: 0 }} className="dim">No objective set. A promoter decides where a career is going; the trainers decide how to get the fighter ready. Suggested: <b>{v.suggested.label}</b>.</p>
        )}
        <div className="o54-actions" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => setPicking((p) => !p)} aria-expanded={picking} data-testid="objective-change">{g ? 'Change objective' : 'Set an objective'}</button>
          {g && <button className="linkbtn" onClick={() => officeDo('goal', id, null)}>Clear</button>}
        </div>
        {picking && (
          <div className="o54-grid" style={{ marginTop: 10 }} role="group" aria-label="Career objectives">
            {v.choices.map((c) => (
              <button key={c.kind} type="button" className="o54-choice" aria-pressed={g?.kind === c.kind} onClick={() => { if (officeDo('goal', id, c.kind).ok) setPicking(false) }} data-testid={`objective-${c.kind}`}>
                <b>{c.label}{v.suggested.kind === c.kind ? ' · suggested' : ''}</b><small>{c.blurb}</small><small>Default risk appetite: {c.plan}. An objective is a matchmaking strategy, not a guarantee: titles still go through the rankings and the champion's camp.</small>
              </button>
            ))}
          </div>
        )}
        {v.promises.length > 0 && (
          <div style={{ marginTop: 12 }} data-testid="objective-promises">
            <div className="caps">Promises made</div>
            <ul className="w54-notes">{v.promises.map((p, i) => <li key={i}>{p.text} <span className={`o54-chip ${p.status === 'Kept' ? 'good' : p.status === 'Broken' ? 'red' : p.status === 'Open' ? 'gold' : ''}`}>{p.status}{p.dueWeeks !== null ? ` · ${p.dueWeeks}w` : ''}</span></li>)}</ul>
          </div>
        )}
        {v.rivalries.length > 0 && (
          <div style={{ marginTop: 12 }} data-testid="objective-rivalries">
            <div className="caps">Rivalries</div>
            <ul className="w54-notes">{v.rivalries.map((r) => <li key={r.opponent}><b>{r.opponent}</b> <span className="o54-chip warn">{r.intensity}</span> <span className="dim">{r.why}</span></li>)}</ul>
          </div>
        )}
        {v.decisions.length > 0 && (
          <div style={{ marginTop: 12 }} data-testid="objective-decisions">
            <div className="caps">Recent career decisions</div>
            <ul className="w54-notes">{v.decisions.map((d, i) => <li key={i}><span className="dim">{d.day}</span> {d.text}</li>)}</ul>
          </div>
        )}
      </div>
    </Section>
  )
}
