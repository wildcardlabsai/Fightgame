import { useEffect, useMemo, useState } from 'react'
import { guideView, type GuideStepView } from '../../engine/guide'
import { useGame } from '../../store/gameStore'
import '../../styles/guide.css'

/** The live guide view for the current career (null when the guide is off). Derived from state on every change, so it can never disagree with the game. */
export function useGuide() {
  const game = useGame((s) => s.game)
  return useMemo(() => (game ? guideView(game) : null), [game])
}

/** Marks the real control the current step points at (see `[data-guide]` in the screens and guide.css). Cleans up when the guide goes away. */
export function useGuideTarget(step: GuideStepView | null | undefined, on = true) {
  const target = on && step ? step.go.target : null
  useEffect(() => {
    if (!target) return
    document.body.dataset.guideTarget = target
    return () => { delete document.body.dataset.guideTarget }
  }, [target])
}

function Go({ s, big }: { s: GuideStepView; big?: boolean }) {
  const navigate = useGame((st) => st.navigate)
  const route = useGame((st) => st.route)
  const go = s.go
  // Nothing to point at when you are already standing on the screen it names.
  const here = route.screen === go.screen && (route.param ?? undefined) === go.param
  if (here && s.id === 'position') return null
  // Already on the right screen: the action may be far down a long page (the event page on a phone), so scroll to the real control instead of navigating.
  const act = () => {
    if (here) { const el = document.querySelector<HTMLElement>(`[data-guide="${go.target}"]`); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus({ preventScroll: true }); return } }
    navigate(go.screen as never, go.param)
  }
  return <button type="button" className={`btn ${big ? 'primary' : 'small go'} guide-go`} data-testid={s.optional ? 'guide-go-optional' : 'guide-go'} disabled={!!s.blocker && s.id !== 'matchup'} onClick={act}>{here && document.querySelector(`[data-guide="${go.target}"]`) ? 'Show me the button' : go.label} ▸</button>
}

function StepBody({ s }: { s: GuideStepView }) {
  const doAck = useGame((st) => st.guideDo)
  return (
    <div className="guide-body">
      <p><b>Why it matters.</b> {s.why}</p>
      <p><b>What to do.</b> {s.how}</p>
      {s.facts && s.facts.length > 0 && <ul className="guide-facts">{s.facts.map((f) => <li key={f}>{f}</li>)}</ul>}
      {s.blocker && <p className="guide-blocker" role="status" data-testid="guide-blocker">{s.blocker}</p>}
      <div className="guide-actions">
        <Go s={s} big />
        {s.ack && <button type="button" className="btn small" data-testid="guide-ack" onClick={() => doAck('ack', s.id)}>{s.id === 'next' ? 'Got it — finish the guide' : s.id === 'review' ? 'I have read the result' : 'Got it'}</button>}
        {!s.optional && <button type="button" className="linkbtn" data-testid="guide-skip" onClick={() => doAck('skip', s.id)}>Skip this step</button>}
      </div>
    </div>
  )
}

/** The full guide on the desk: every milestone, the current one opened. */
export function GuidePanel() {
  const v = useGuide()
  const dismiss = useGame((s) => s.guideDismiss)
  useGuideTarget(v?.current)
  if (!v) return null
  const optional = v.steps.filter((s) => s.optional)
  return (
    <section className="guide" aria-label="Guided first career" data-testid="guide-panel">
      <div className="guide-head">
        <div>
          <div className="caps">Your first career</div>
          <h2 className="display">{v.current ? v.current.title : 'You have run your first show'}</h2>
        </div>
        <div className="guide-meta">
          <span className="chip" data-testid="guide-progress">{v.progress.done} of {v.progress.total} done</span>
          <button type="button" className="linkbtn" data-testid="guide-hide" onClick={dismiss}>Hide the guide</button>
        </div>
      </div>
      <div className="guide-bar" role="progressbar" aria-valuemin={0} aria-valuemax={v.progress.total} aria-valuenow={v.progress.done} aria-label="Guide progress"><i style={{ width: `${(100 * v.progress.done) / v.progress.total}%` }} /></div>
      <ol className="guide-steps">
        {v.steps.filter((s) => !s.optional).map((s) => (
          <li key={s.id} className={`${s.done ? 'done' : s.skipped ? 'skipped' : ''}${s.current ? ' current' : ''}`} data-step={s.id} aria-current={s.current ? 'step' : undefined}>
            <span className="guide-mark" aria-hidden="true">{s.done ? '✓' : s.skipped ? '–' : ''}</span>
            <div className="guide-line">
              <div className="guide-title">{s.title}{s.done ? <span className="sr-only"> (done)</span> : s.skipped ? <span className="sr-only"> (skipped)</span> : null}</div>
              {s.current && <StepBody s={s} />}
            </div>
          </li>
        ))}
      </ol>
      {optional.length > 0 && (
        <div className="guide-optional" data-testid="guide-optional">
          <div className="caps">Also worth knowing — optional</div>
          {optional.map((s) => (
            <details key={s.id} className={s.done ? 'done' : ''}>
              <summary>{s.done ? '✓ ' : ''}{s.title}</summary>
              <div className="guide-body"><p><b>Why it matters.</b> {s.why}</p><p><b>What to do.</b> {s.how}</p><div className="guide-actions"><Go s={s} /></div></div>
            </details>
          ))}
        </div>
      )}
      <p className="dim guide-note">Every step is ticked off by what really happens in your promotion. You can hide this at any time and bring it back from Settings. Nothing here changes your money, fighters or results.</p>
    </section>
  )
}

/** A single line on every other screen: where you are in the guide and the next action. Hidden on the desk (which has the panel) and during Fight Night. */
export function GuideBar() {
  const v = useGuide()
  const route = useGame((s) => s.route)
  const nightFight = useGame((s) => s.nightFight)
  const dismiss = useGame((s) => s.guideDismiss)
  const doAck = useGame((s) => s.guideDo)
  const [open, setOpen] = useState(false)
  const quiet = route.screen === 'dashboard' || route.screen === 'fight' || !!nightFight
  useGuideTarget(v?.current, !quiet)
  if (!v || !v.current || quiet) return null
  const s = v.current
  return (
    <aside className="guide-strip" aria-label="Guide" data-testid="guide-strip" data-step={s.id}>
      <div className="guide-strip-row">
        <span className="chip" aria-hidden="true">Guide {v.progress.done + 1}/{v.progress.total}</span>
        <b className="guide-strip-title">{s.title}</b>
        <span className="guide-strip-btns">
          {!open && <Go s={s} />}
          <button type="button" className="btn small ghost" aria-expanded={open} data-testid="guide-more" onClick={() => setOpen((o) => !o)}>{open ? 'Less' : 'Why?'}</button>
          <button type="button" className="linkbtn" aria-label="Hide the guide" data-testid="guide-hide" onClick={dismiss}>Hide</button>
        </span>
      </div>
      {open && <StepBody s={s} />}
      {!open && s.blocker && <p className="guide-blocker" role="status">{s.blocker}</p>}
      {!open && s.ack && <button type="button" className="btn small" data-testid="guide-ack" onClick={() => doAck('ack', s.id)}>{s.id === 'next' ? 'Got it — finish the guide' : s.id === 'review' ? 'I have read the result' : 'Got it'}</button>}
    </aside>
  )
}
