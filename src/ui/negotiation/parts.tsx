import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import type { TalkHeader } from '../../engine/business/talkViews'
import type { TalkLine } from '../../engine/business/types'
import { FighterPortrait } from '../visual/FighterPortrait'
import { Avatar } from '../components/Bits'

type Ref = { firstName: string; lastName: string; id: string; division?: string }

const STEPS = ['Calm', 'Rising', 'Tense'] as const

/** Three-step tension reading. Text AND shape, never colour alone. Never a number. */
export function TensionMeter({ tension }: { tension: TalkHeader['tension'] }) {
  const at = STEPS.indexOf(tension)
  return (
    <span className={`n54-tension t-${tension}`} data-testid="tension" aria-label={`Tension: ${tension}`}>
      <span className="n54-steps" aria-hidden="true">{STEPS.map((s, i) => <i key={s} className={i <= at ? 'on' : ''} />)}</span>
      <b>{tension}</b>
    </span>
  )
}

const MOOD: Record<string, string> = { eager: 'Eager', warm: 'Warm', lukewarm: 'Lukewarm', cold: 'Cold' }

export function TalkHeaderBar({ h, f, eyebrow, sub, onBack, backLabel }: { h: TalkHeader; f: Ref; eyebrow: string; sub?: ReactNode; onBack: () => void; backLabel: string }) {
  return (
    <header className="n54-head" data-testid="talk-header">
      <FighterPortrait f={f} size="card" eager />
      <div className="n54-id">
        <button type="button" className="linkbtn n54-back" onClick={onBack}>◂ {backLabel}</button>
        <div className="caps gold">{eyebrow}</div>
        <h1 className="display n54-name">{h.name}</h1>
        <div className="dim n54-meta">{h.division} · {h.record} · age {h.age} · {h.stage}</div>
        {sub}
      </div>
      <dl className="n54-gauges" aria-label="State of the talks">
        <div><dt>Manager</dt><dd>{h.managerName}</dd></div>
        <div><dt>Relationship</dt><dd data-testid="relationship">{h.relationship}</dd></div>
        <div><dt>Mood</dt><dd data-testid="mood"><span className={`mood ${h.mood}`}>{MOOD[h.mood]}</span></dd></div>
        <div><dt>Tension</dt><dd><TensionMeter tension={h.tension} /></dd></div>
        <div><dt>Turn</dt><dd>{h.turn}</dd></div>
      </dl>
    </header>
  )
}

export function ChatLog({ lines, f, counterCard, counterAfter, label }: { lines: TalkLine[]; f: Ref; counterCard: ReactNode; counterAfter: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight }, [lines.length, !!counterCard])
  return (
    <div className="n54-log" role="log" aria-live="polite" aria-label={label} data-testid="talk-log" ref={ref} tabIndex={0}>
      {lines.map((l, i) => (
        <Fragment key={i}>
        <div className={`n54-line ${l.who} tag-${l.tag}`} data-testid="talk-line" data-who={l.who} data-tag={l.tag}>
          {l.who === 'mgr' && <Avatar f={f} />}
          <div className="n54-bubble-col">
            <div className="chat-who caps">{l.who === 'mgr' ? 'Their camp' : l.who === 'you' ? 'You' : 'Note'}<span className="dim"> · turn {l.turn}</span></div>
            <div className="chat-bubble n54-bubble">{l.text}</div>
          </div>
        </div>
        {i === counterAfter && counterCard}
        </Fragment>
      ))}
      {counterAfter < 0 && counterCard}
    </div>
  )
}

export function Collapsible({ title, open, onToggle, children, testid }: { title: string; open: boolean; onToggle: () => void; children: ReactNode; testid?: string }) {
  return (
    <section className="n54-panel" data-testid={testid}>
      <h2 className="n54-panel-h"><button type="button" className="n54-toggle" aria-expanded={open} onClick={onToggle}><span>{title}</span><span aria-hidden="true">{open ? '−' : '+'}</span></button></h2>
      {open && <div className="n54-panel-b">{children}</div>}
    </section>
  )
}

export function ToldBox({ told }: { told: { priorities: string[]; ambition: string | null } }) {
  const empty = told.priorities.length === 0 && !told.ambition
  return (
    <section className="n54-panel" data-testid="told-box" aria-label="What you've learned">
      <h2 className="n54-panel-h n54-static">What you've learned</h2>
      <div className="n54-panel-b">
        {empty ? <p className="dim">Nothing yet. Ask them what they are looking for: camps tell you more as they come to trust you.</p> : (
          <dl className="n54-told">
            {told.priorities.length > 0 && <div><dt>Their camp wants</dt><dd>{told.priorities.map((p) => <span key={p} className="chip gold" data-testid="told-priority">{p}</span>)}</dd></div>}
            {told.ambition && <div><dt>The fighter's ambition</dt><dd data-testid="told-ambition"><span className="chip gold">{told.ambition}</span></dd></div>}
          </dl>
        )}
      </div>
    </section>
  )
}

export function ConfidenceBadge({ level, basis }: { level: string; basis: string[] }) {
  return (
    <div className="n54-conf" data-testid="confidence">
      <span className={`chip n54-conf-${level}`}>Confidence: {level}</span>
      <span className="dim n54-conf-why">{basis.length ? `Based on ${basis.join(', ')}.` : 'You know little about this camp yet.'}</span>
    </div>
  )
}

export function Walk({ onWalk, disabled }: { onWalk: () => void; disabled?: boolean }) {
  const [sure, setSure] = useState(false)
  if (!sure) return <button type="button" className="btn ghost n54-btn" data-testid="talk-walk" disabled={disabled} onClick={() => setSure(true)}>Walk away</button>
  return (
    <span className="n54-confirm" role="group" aria-label="Confirm walking away">
      <button type="button" className="btn n54-btn danger" data-testid="talk-walk-confirm" onClick={onWalk}>Yes, walk away</button>
      <button type="button" className="btn ghost n54-btn" onClick={() => setSure(false)}>Stay</button>
    </span>
  )
}

/** Where the counter card goes: after the last counter line (-1 = append). */
export const lastCounterIndex = (lines: TalkLine[]): number => { for (let i = lines.length - 1; i >= 0; i--) if (lines[i].tag === 'counter') return i; return -1 }

export function ClosedPanel({ status, locked, children }: { status: string; locked: string; children?: ReactNode }) {
  const title = status === 'agreed' ? 'Deal agreed' : status === 'broken' ? 'Their camp walked away' : 'You walked away'
  return (
    <div className={`n54-closed ${status}`} role="status" data-testid="talk-closed" data-status={status}>
      <div className="caps">Talks closed</div>
      <h2 className="display">{title}</h2>
      <p>{locked}</p>
      {children}
    </div>
  )
}
