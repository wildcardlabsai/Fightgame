import { officeView, offersWaiting, relationRows, rosterRivalries } from '../../engine/office/views'
import { formatDay } from '../../engine/calendar'
import { useGame } from '../../store/gameStore'
import { Section } from '../components/Bits'
import { money } from '../format'
import { ReviewsPanel } from '../office/ReviewsPanel'
import '../../styles/office54c.css'

export function OfficeScreen() {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const officeDo = useGame((s) => s.officeDo)
  const v = officeView(game)
  const rels = relationRows(game)
  const rivals = rosterRivalries(game)
  const waiting = offersWaiting(game)
  const s = v.strategy
  return (
    <div data-testid="office-screen">
      <div className="page-head">
        <div>
          <h1 className="display">Promoter’s Office</h1>
          <p className="sub">The business side of the promotion: which direction you are building, the coaching you pay for, and who you are on good terms with. Trainers decide how fighters train; boxers decide how they fight.</p>
        </div>
        <button className="btn primary" onClick={() => navigate('fights', 'offers')}>Fight offers{waiting > 0 ? ` (${waiting})` : ''} ▸</button>
      </div>

      <ReviewsPanel />

      <Section title="Direction" right={<span className="dim" style={{ fontSize: 13 }}>{s.focus || s.stance ? (s.weight === 'turning' ? 'Recently changed: half effect for eight weeks' : 'In full effect') : 'Not chosen yet: no effect either way'}</span>}>
        <p className="o54-tabs-note">A tendency, not a class: change it whenever you like. Every direction has a price somewhere else, and none is best in every situation.</p>
        <div className="caps" style={{ marginBottom: 6 }}>What kind of promotion</div>
        <div className="o54-grid" role="radiogroup" aria-label="Focus">
          {v.focusChoices.map((c) => (
            <button key={c.kind} type="button" role="radio" aria-checked={s.focus === c.kind} aria-pressed={s.focus === c.kind} className="o54-choice" onClick={() => officeDo('strategy', c.kind, s.stance)} data-testid={`focus-${c.kind}`}>
              <b>{c.label}</b><small>{c.blurb}</small><small className="good">+ {c.gain}</small><small className="red">− {c.cost}</small>
            </button>
          ))}
        </div>
        <div className="caps" style={{ margin: '14px 0 6px' }}>How you run it</div>
        <div className="o54-grid" role="radiogroup" aria-label="Stance">
          {v.stanceChoices.map((c) => (
            <button key={c.kind} type="button" role="radio" aria-checked={s.stance === c.kind} aria-pressed={s.stance === c.kind} className="o54-choice" onClick={() => officeDo('strategy', s.focus, c.kind)} data-testid={`stance-${c.kind}`}>
              <b>{c.label}</b><small>{c.blurb}</small><small className="good">+ {c.gain}</small><small className="red">− {c.cost}</small>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Coaching staff" right={<span className="dim" style={{ fontSize: 13 }}>{v.coach.label} · {v.coach.weekly > 0 ? `${money(v.coach.weekly, false)} a week` : 'covered by the gym lease'}</span>}>
        <p className="o54-tabs-note">You approve the budget and decide who is hired. What the trainers work on, how hard camps run and the plan on the night are their call, and the boxer's.</p>
        <div className="o54-grid" role="radiogroup" aria-label="Coaching staff">
          {v.coach.options.map((o) => (
            <button key={o.level} type="button" role="radio" aria-checked={v.coach.level === o.level} aria-pressed={v.coach.level === o.level} className="o54-choice" onClick={() => officeDo('coaching', o.level)} data-testid={`coach-${o.level}`}>
              <b>{o.label}</b><small>{o.blurb}</small><small>{o.effect}</small><small>{o.weekly > 0 ? `${money(o.weekly, false)} a week; ${money(o.weekly * 6, false)} to bring them in.` : 'No extra cost.'}</small>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Relationships" right={<span className="dim" style={{ fontSize: 13 }}>Why each stands where it does</span>}>
        {rels.length === 0 ? <p className="empty">No standing with anyone yet beyond the ordinary. Relationships form from what you do: honouring deals, staging shows, answering proposals, clashing dates.</p> : (
          <div data-testid="relations-list">
            {rels.map((r) => (
              <div key={r.key} className="o54-rel">
                <span className={`o54-chip ${r.standing === 'Excellent' || r.standing === 'Good' ? 'good' : r.standing === 'Strained' || r.standing === 'Hostile' ? 'red' : 'gold'}`}>{r.standing}{r.trend === 'up' ? ' ▲' : r.trend === 'down' ? ' ▼' : ''}</span>
                <span><b>{r.name}</b> <span className="dim">· {r.category}</span><small>{r.effect}</small>{r.reasons.slice(0, 3).map((x, i) => <small key={i}>{formatDay(x.day, false)} · {x.text}</small>)}</span>
                <span />
              </div>
            ))}
          </div>
        )}
        <p className="dim" style={{ fontSize: 13, marginTop: 10 }}>A good relationship tilts business a little (how often a promoter writes, how much room they give, what a venue charges). It never overrides a contract, a price already agreed, a fighter's eligibility or the title rules, and a bad one never closes the door.</p>
      </Section>

      {rivals.length > 0 && (
        <Section title="Rivalries" right={<span className="dim" style={{ fontSize: 13 }}>Fights the public wants</span>}>
          <ul className="w54-notes" data-testid="rivalries-list">{rivals.map((r, i) => <li key={i}><b>{r.mine}</b> v <b>{r.opponent}</b> <span className="o54-chip warn">{r.intensity}</span> <span className="dim">{r.why}</span></li>)}</ul>
        </Section>
      )}
    </div>
  )
}
