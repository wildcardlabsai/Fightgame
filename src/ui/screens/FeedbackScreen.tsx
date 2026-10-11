import { diagnostics } from '../../store/diagnostics'
import { AboutBeta, FeedbackPanel } from '../components/Feedback'

/** In-game entry point. It is a normal screen under More, so it never interrupts play and the report names the screen the tester came from. */
export function FeedbackScreen() {
  // The screen the tester was on before opening this one.
  const prev = [...diagnostics.trail()].reverse().find((s) => s !== 'feedback') ?? 'dashboard'
  return (
    <>
      <div className="page-head"><div><h1 className="display">Report a problem</h1><p className="sub">Tell us what went wrong, what confused you, or what you would change.</p></div></div>
      <div className="grid-2">
        <FeedbackPanel screen={prev} />
        <AboutBeta />
      </div>
    </>
  )
}
