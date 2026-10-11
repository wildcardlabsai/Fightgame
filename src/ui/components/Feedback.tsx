import { useMemo, useRef, useState } from 'react'
import { buildReport, coarseBrowser, FEEDBACK_KINDS, MAX_DESCRIPTION, reportFileName, type FeedbackKind } from '../../engine/feedback'
import { buildLabel, FEEDBACK_CONTACT, GAME_NAME, KNOWN_LIMITATIONS, RELEASE_CHANNEL, VERSION } from '../../engine/release'
import { diagnostics } from '../../store/diagnostics'
import { useGame } from '../../store/gameStore'
import '../../styles/beta.css'
import { copyText, downloadText } from '../download'

/**
 * Report a problem / give feedback. Nothing is sent anywhere: the tester reads the exact text, then copies it or saves it as a file and sends it
 * themselves. The preview IS the report, so what they see is everything that leaves.
 */
export function FeedbackPanel({ screen, onClose }: { screen: string; onClose?: () => void }) {
  const game = useGame((s) => s.game)
  const storage = useGame((s) => s.storageKind)
  const [kind, setKind] = useState<FeedbackKind>('confusing')
  const [text, setText] = useState('')
  const [status, setStatus] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)
  const report = useMemo(() => buildReport({
    kind, description: text, screen, game,
    trail: diagnostics.trail(), lastError: diagnostics.lastError() || undefined,
    env: { browser: coarseBrowser(navigator.userAgent), viewport: `${window.innerWidth}x${window.innerHeight}`, storage },
  }), [kind, text, screen, game, storage])
  const hint = FEEDBACK_KINDS.find((k) => k.id === kind)?.hint
  const mail = FEEDBACK_CONTACT ? `mailto:${FEEDBACK_CONTACT}?subject=${encodeURIComponent(`${GAME_NAME} ${VERSION} feedback`)}&body=${encodeURIComponent(report.slice(0, 1500))}` : ''

  return (
    <section className="section feedback" data-testid="feedback-panel" aria-labelledby="fb-title">
      <div className="section-head"><h2 id="fb-title">Report a problem or share feedback</h2>{onClose && <div className="right"><button className="linkbtn" onClick={onClose}>Close</button></div>}</div>
      <p className="dim" style={{ marginBottom: 12 }}>This build ({buildLabel()}) is a {RELEASE_CHANNEL}. There is no feedback server, so nothing is sent from here. Write what happened, then copy the report or save it as a file and send it to {FEEDBACK_CONTACT ? <b>{FEEDBACK_CONTACT}</b> : 'whoever invited you to the beta'}.</p>
      <div className="field"><label htmlFor="fb-kind">What kind of feedback?</label>
        <select id="fb-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value as FeedbackKind)} data-testid="feedback-kind">
          {FEEDBACK_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        <span className="dim" style={{ fontSize: 13 }}>{hint}</span></div>
      <div className="field" style={{ marginTop: 12 }}><label htmlFor="fb-text">What happened? What did you expect?</label>
        <textarea id="fb-text" ref={area} className="input" rows={5} maxLength={MAX_DESCRIPTION} value={text} placeholder="e.g. I booked Hartley Park but the forecast said a loss and I could not tell why." onChange={(e) => { setText(e.target.value); setStatus('') }} data-testid="feedback-text" />
        <span className="dim" style={{ fontSize: 13 }}>Please do not type passwords, email addresses or anything private — your words are included exactly as written.</span></div>
      <div className="field" style={{ marginTop: 12 }}><label htmlFor="fb-preview">The report (exactly what will be copied)</label>
        <textarea id="fb-preview" className="input mono" rows={9} readOnly value={report} data-testid="feedback-report" /></div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        <button className="btn primary" data-testid="feedback-copy" onClick={async () => setStatus((await copyText(report)) ? 'Copied to the clipboard. Nothing has been sent — paste it into a message to the person who invited you.' : 'Your browser blocked copying. Select the text above and copy it by hand, or save it as a file.')}>Copy report</button>
        <button className="btn ghost" data-testid="feedback-download" onClick={() => { downloadText(reportFileName(), report, 'text/plain'); setStatus('Saved as a file. Nothing has been sent — attach it to a message to the person who invited you.') }}>Save as file</button>
        {mail && <a className="btn ghost" href={mail} data-testid="feedback-mail">Open in email</a>}
      </div>
      <p role="status" aria-live="polite" data-testid="feedback-status" className="dim" style={{ marginTop: 10, minHeight: 20 }}>{status}</p>
      <p className="dim" style={{ fontSize: 13 }}>Your save file is not part of this report. If you are asked for it, use Export save (Save &amp; Settings, or the saved-games list on the title screen) and share it only with the people running the beta — it contains your whole career.</p>
    </section>
  )
}

export function AboutBeta() {
  return (
    <section className="section" data-testid="about-beta" aria-labelledby="ab-title">
      <div className="section-head"><h2 id="ab-title">About this beta</h2></div>
      <dl>
        <div className="kv"><dt>Game</dt><dd>{GAME_NAME}</dd></div>
        <div className="kv"><dt>Version</dt><dd data-testid="about-version">{VERSION}</dd></div>
        <div className="kv"><dt>Build</dt><dd>{buildLabel()}</dd></div>
        <div className="kv"><dt>Status</dt><dd>Public beta — expect rough edges</dd></div>
      </dl>
      <p className="dim" style={{ margin: '12px 0 6px' }}>Known limitations</p>
      <ul className="plain-list" style={{ display: 'grid', gap: 6, paddingLeft: 18 }}>
        {KNOWN_LIMITATIONS.map((l) => <li key={l.id}>{l.text}</li>)}
      </ul>
    </section>
  )
}
