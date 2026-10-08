import { useState } from 'react'
import type { FighterBusinessView } from '../../engine/business/views'
import type { ExpectedContractTerms } from '../../engine/business/terms'
import { formatDay } from '../../engine/calendar'
import { useGame } from '../../store/gameStore'
import { Meter, Section } from '../components/Bits'
import { Modal } from '../components/Overlay'
import { money } from '../format'
import '../../styles/business54.css'

const weeks = (n: number) => `${n} week${n === 1 ? '' : 's'}`
const range = (r: { lo: number; hi: number }, fmt: (n: number) => string = (n) => money(n, false)) => (r.lo === r.hi ? fmt(r.lo) : `${fmt(r.lo)} – ${fmt(r.hi)}`)
const STATE_MARK: Record<string, string> = { done: '✓ Done', current: '● You are here', next: '→ Next step', later: 'Later' }

/** Career status, the contender pathway ladder, belts, duties, opportunities and eligibility. */
export function CareerPanel({ bv, mine }: { bv: FighterBusinessView; mine: boolean }) {
  const navigate = useGame((s) => s.navigate)
  return (
    <Section title="Career & titles" right={<span className="chip gold" data-testid="career-status">{bv.statusLabel}</span>}>
      <div data-testid="biz-panel" className="biz">
        <ol className="biz-ladder" data-testid="ladder" aria-label="Contender pathway">
          {bv.ladder.map((s) => (
            <li key={s.status} className={`biz-step ${s.state}`} data-testid="ladder-step" data-state={s.state} aria-current={s.state === 'current' ? 'step' : undefined}>
              <span className="biz-step-label">{s.label}</span>
              <span className="biz-step-mark">{STATE_MARK[s.state]}</span>
            </li>
          ))}
        </ol>
        <p className="biz-next" data-testid="next-milestone"><span className="caps">Next milestone</span> {bv.next.text}</p>

        <div className="biz-block bz-current" data-testid="current-titles">
          <h3 className="caps">Current titles</h3>
          {bv.held.length === 0 ? <p className="dim">None held at the moment.</p> : (
            <>
              {bv.currentLabel && <p className="bz-clabel display" data-testid="current-label">{bv.currentLabel}</p>}
              <ul className="biz-list">
                {bv.held.map((h) => <li key={h.body + h.title} className="bz-cur"><span className="chip gold">CHAMPION</span> <b>{h.title}</b> <span className="dim">· {weeks(h.weeks)} · {h.defences} defence{h.defences === 1 ? '' : 's'}</span></li>)}
              </ul>
            </>
          )}
        </div>
        {bv.former.length > 0 && (
          <details className="biz-block bz-former" data-testid="former-titles">
            <summary className="caps">Former titles ({bv.former.length})</summary>
            <ul className="biz-list">
              {bv.former.map((r, i) => <li key={`${r.title}${r.from}${i}`}><span className="chip">FORMER</span> <b>{r.title}</b> <span className="dim">· {formatDay(r.from, false)}–{formatDay(r.to, false)} · {r.defences} defence{r.defences === 1 ? '' : 's'} · {r.how}</span></li>)}
            </ul>
          </details>
        )}
        {bv.duties.length > 0 && (
          <div className="biz-block">
            <h3 className="caps">Champion duties</h3>
            <ul className="biz-list" data-testid="duties">
              {bv.duties.map((d) => (
                <li key={d.body + d.wc}>
                  <b>{d.title}</b> <span className={`chip ${d.activity === 'Active' ? 'good' : d.activity === 'At risk' ? 'red' : 'gold'}`}>{d.activity}</span>
                  <div className="dim biz-sub">{d.nextAction}</div>
                  {d.mandatory && <div className="biz-sub"><span className="chip red">MANDATORY</span> vs {d.mandatory.name} · {weeks(d.mandatory.dueWeeks)} left{d.mandatory.extended ? ' (extended)' : ''}</div>}
                  {d.eliminator && <div className="biz-sub"><span className="chip gold">ELIMINATOR</span> ordered · {weeks(d.eliminator.dueWeeks)} left</div>}
                  <div className="dim biz-sub">{d.lastDefenceWeeks === null ? 'No defence yet this reign' : `Last defence ${weeks(d.lastDefenceWeeks)} ago`}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="biz-block">
          <h3 className="caps">Title history</h3>
          {bv.history.won === 0 && bv.history.defences === 0 ? <p className="dim">No title won yet.</p> : (
            <p>{bv.history.won} title{bv.history.won === 1 ? '' : 's'} won · {bv.history.defences} successful defence{bv.history.defences === 1 ? '' : 's'}{bv.history.best ? ` · best: ${bv.history.best} level` : ''}
              {bv.history.unified && <> <span className="chip gold">UNIFIED</span></>}{bv.history.undisputed && <> <span className="chip gold">UNDISPUTED</span></>}</p>
          )}
        </div>
        <div className="biz-block">
          <h3 className="caps">Title opportunities</h3>
          {bv.opportunities.length === 0 ? <p className="dim">None on the table right now. {bv.next.text}</p> : (
            <ul className="biz-list" data-testid="opportunities">
              {bv.opportunities.map((o, i) => <li key={`${o.body}${o.kind}${i}`}><span className="chip gold">{o.kind.replace(/_/g, ' ')}</span> <b>{o.title}</b>{o.dueWeeks !== null && <span className="dim"> · {weeks(o.dueWeeks)} left</span>}<div className="dim biz-sub">{o.text}</div></li>)}
            </ul>
          )}
          {mine && bv.opportunities.length > 0 && <button className="btn small ghost" onClick={() => navigate('matchmaking', bv.id)}>Make the fight</button>}
        </div>
        <details className="biz-elig" data-testid="eligibility-list">
          <summary>Title eligibility <span className="dim">({bv.eligibility.filter((e) => e.canChallengeNow).length} of {bv.eligibility.length} bodies could match them now)</span></summary>
          <ul className="biz-list">
            {bv.eligibility.map((e) => (
              <li key={e.body + e.wc}>
                <b>{e.title}</b> <span className={`chip ${e.canChallengeNow ? 'good' : ''}`}>{e.canChallengeNow ? 'CAN CHALLENGE' : e.status.toUpperCase()}</span>
                {e.rank !== null && <span className="dim"> · #{e.rank}</span>}
                <ul className="biz-reasons">{e.reasons.map((r, i) => <li key={i} className="dim">{r}</li>)}</ul>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </Section>
  )
}

export function ValuePanel({ bv }: { bv: FighterBusinessView }) {
  const v = bv.value
  return (
    <Section title="Market value">
      <div data-testid="value-panel">
        <div className="biz-score"><span className="num">{v.score}</span><span className="chip gold">{v.label}</span><span className="dim">career value</span></div>
        <ul className="biz-drivers">
          {v.drivers.map((d) => (
            <li key={d.label} title={d.note}>
              <span className="biz-dl">{d.label}<small className="dim">{d.note}</small></span>
              <Meter value={d.score} tone="gold" label={d.label} />
              <span className="num biz-dv">{d.score}</span>
            </li>
          ))}
        </ul>
        <div className="biz-commercial">
          <div className="biz-score small"><span className="num">{v.commercial}</span><span className="chip">{v.commercialLabel}</span><span className="dim">commercial appeal</span></div>
          <p className="dim biz-sub">What the name sells versus what the career is worth. Commercial appeal is how well the fighter moves tickets, sponsors and TV. Career value is built from results, ranking and titles. A fighter can sell more than the record says, or less.</p>
        </div>
      </div>
    </Section>
  )
}

const CONF_TONE = { LOW: 'red', MODERATE: 'gold', HIGH: 'good' } as const

export function ExpectedTermsPanel({ t, canNegotiate, onOpen }: { t: ExpectedContractTerms; canNegotiate: boolean; onOpen: () => void }) {
  const rows: [string, string][] = [
    ['Purse per fight', range(t.purse)], ['Win bonus', range(t.winBonus)], ['Weekly retainer', range(t.retainer)], ['Signing bonus', range(t.signing)],
    ['Fights per year', range(t.fightsPerYear, String)], ['Contract length', `${range(t.years, String)} year${t.years.hi === 1 ? '' : 's'}`], ['Pathway preference', t.pathway],
  ]
  return (
    <Section title="Expected contract terms (estimate)">
      <div data-testid="expected-terms">
        <p className="biz-conf"><span className={`chip ${CONF_TONE[t.confidence.level]}`} data-testid="confidence">{t.confidence.level} confidence</span> <span className="dim">{t.note}</span></p>
        {t.confidence.basis.length > 0 && <p className="dim biz-sub">Based on {t.confidence.basis.join(', ')}.</p>}
        <dl className="biz-terms">{rows.map(([k, v]) => <div key={k} className="kv"><dt>{k}</dt><dd className="num">{v}</dd></div>)}</dl>
        <p className="dim biz-sub">These are ranges, not the camp’s ask. Scouting, a good relationship and earlier talks narrow them.</p>
        {canNegotiate && <button className="btn primary" data-testid="open-negotiation" onClick={onOpen}>Open negotiation</button>}
      </div>
    </Section>
  )
}

const PROMISE_CHIP: Record<string, string> = { open: 'gold', kept: 'good', broken: 'red', void: '' }
export function CommitmentsPanel({ bv }: { bv: FighterBusinessView }) {
  return (
    <Section title="Promises">
      <div data-testid="commitments">
        {bv.commitments.length === 0 ? <p className="dim">No promises on record for this fighter.</p> : (
          <ul className="biz-list">
            {bv.commitments.map((c) => (
              <li key={c.id}>
                <span className={`chip ${PROMISE_CHIP[c.status] ?? ''}`}>{c.status.toUpperCase()}</span> <b>{c.text.charAt(0).toUpperCase() + c.text.slice(1)}</b>
                {c.dueWeeks !== null && <span className="dim"> · {weeks(c.dueWeeks)} left</span>}
                {c.note && <div className="dim biz-sub">{c.note}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}

const FIT_TONE: Record<string, string> = { 'Good fit': 'good', Neutral: '', 'Poor fit': 'red', Unknown: '' }
export function PlanChooser({ bv }: { bv: FighterBusinessView }) {
  const choosePlan = useGame((s) => s.choosePlan)
  if (!bv.plan) return null
  const plan = bv.plan
  return (
    <Section title="Development plan">
      <div data-testid="plan-chooser" role="radiogroup" aria-label="Development plan" className="biz-plans">
        {plan.choices.map((c) => {
          const on = c.plan === plan.current
          return (
            <button key={c.plan} type="button" role="radio" aria-checked={on} data-testid="plan-option" data-plan={c.plan} className={`biz-plan${on ? ' on' : ''}`} onClick={() => { if (!on) choosePlan(bv.id, c.plan) }}>
              <span className="biz-plan-head"><b className="display">{c.label}</b>{on && <span className="chip gold">CURRENT</span>}<span className={`chip ${FIT_TONE[c.fit]}`}>{c.fit}</span></span>
              <span className="dim biz-sub">{c.blurb}</span>
              {c.why.length > 0 && <ul className="biz-reasons">{c.why.map((w, i) => <li key={i} className="dim">{w}</li>)}</ul>}
            </button>
          )
        })}
      </div>
    </Section>
  )
}

export function DivisionMove({ bv, divisionName }: { bv: FighterBusinessView; divisionName: string }) {
  const changeDivision = useGame((s) => s.changeDivision)
  const [pick, setPick] = useState<{ to: string; label: string } | null>(null)
  if (!bv.division) return null
  const d = bv.division
  return (
    <Section title="Division move">
      <div data-testid="division-move">
        <p className="dim biz-sub">Currently a {divisionName} fighter. A move takes time and can only be made once a year.</p>
        {d.campNote && <p className="warn biz-sub" data-testid="division-camp-note">{d.campNote}</p>}
        <div className="biz-moves">
          {d.options.map((o) => {
            const off = !!o.blocked || !!d.campNote
            return (
              <div key={o.to} className="biz-move">
                <button type="button" className="btn ghost" disabled={off} data-testid="division-option" data-to={o.to} onClick={() => setPick({ to: o.to, label: o.label })}>{o.dir === 'up' ? '▲ Move up to' : '▼ Move down to'} {o.label}</button>
                {o.blocked && <span className="dim biz-sub">Unavailable: {o.blocked}</span>}
              </div>
            )
          })}
          {d.options.length === 0 && <p className="dim">No neighbouring division.</p>}
        </div>
      </div>
      {pick && (
        <Modal title={`Move to ${pick.label}?`} onClose={() => setPick(null)}>
          <div className="biz-confirm" data-testid="division-confirm">
            <p>{bv.name} will leave {divisionName} and start again in {pick.label}.</p>
            {bv.held.length > 0 ? <p className="warn"><b>Belts at the old weight are relinquished:</b> {bv.held.map((h) => h.title).join(', ')}. They become vacant.</p> : <p className="dim">No belts are held, so none are lost.</p>}
            <p className="dim">Rankings start fresh in the new division. Once moved, the fighter cannot change division again for a year.</p>
            <div className="biz-actions">
              <button className="btn ghost" onClick={() => setPick(null)}>Cancel</button>
              <button className="btn primary" data-testid="division-confirm-go" onClick={() => { changeDivision(bv.id, pick.to as never); setPick(null) }}>Confirm move</button>
            </div>
          </div>
        </Modal>
      )}
    </Section>
  )
}

export function ToldPanel({ bv }: { bv: FighterBusinessView }) {
  const t = bv.told
  const any = t.priorities.length > 0 || t.ambition !== null
  return (
    <Section title="Their camp">
      <p className="biz-sub">Manager: <b>{bv.manager}</b></p>
      {any && (
        <div data-testid="camp-told">
          <p className="caps">What the camp has told you</p>
          {t.ambition && <p>Career goal: <b>{t.ambition}</b></p>}
          {t.priorities.length > 0 && <ul className="biz-list">{t.priorities.map((p) => <li key={p}>{p}</li>)}</ul>}
        </div>
      )}
    </Section>
  )
}
