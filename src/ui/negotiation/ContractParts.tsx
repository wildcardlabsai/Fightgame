import type { ContractTalkView } from '../../engine/business/talkViews'
import type { Offer } from '../../engine/types'
import { Stepper } from '../components/Overlay'
import { money } from '../format'
import { ConfidenceBadge } from './parts'

const rng = (r: { lo: number; hi: number }, plain = false): string => (plain ? (r.lo === r.hi ? `${r.lo}` : `${r.lo}–${r.hi}`) : `${money(r.lo, false)} – ${money(r.hi, false)}`)

export function ExpectedContract({ x }: { x: NonNullable<ContractTalkView['expected']> }) {
  return (
    <section className="n54-panel" data-testid="expected-terms" aria-label="Expected terms">
      <h2 className="n54-panel-h n54-static">Expected terms</h2>
      <div className="n54-panel-b">
        <ConfidenceBadge level={x.confidence.level} basis={x.confidence.basis} />
        <dl className="n54-ranges">
          <div><dt>Base purse / fight</dt><dd>{rng(x.purse)}</dd></div>
          <div><dt>Win bonus</dt><dd>{rng(x.winBonus)}</dd></div>
          <div><dt>Weekly retainer</dt><dd>{rng(x.retainer)}</dd></div>
          <div><dt>Signing bonus</dt><dd>{rng(x.signing)}</dd></div>
          <div><dt>Fights / year</dt><dd>{rng(x.fightsPerYear, true)}</dd></div>
          <div><dt>Length (years)</dt><dd>{rng(x.years, true)}</dd></div>
          <div><dt>Pathway</dt><dd>{x.pathway}</dd></div>
        </dl>
        <p className="n54-assess" data-testid="assessment">Your current draft: <b className={`as-${x.assessment.split(' ')[0]}`}>{x.assessment}</b></p>
        <p className="dim n54-note">{x.note}</p>
      </div>
    </section>
  )
}

const FIELDS: [keyof Offer, string, (o: Offer) => string][] = [
  ['years', 'Length', (o) => `${o.years} yr`], ['fights', 'Fights', (o) => `${o.fights}`], ['minFightsPerYear', 'Guaranteed fights / yr', (o) => `${o.minFightsPerYear}`],
  ['signingBonus', 'Signing bonus', (o) => money(o.signingBonus, false)], ['weeklyRetainer', 'Weekly retainer', (o) => money(o.weeklyRetainer, false)],
  ['basePurse', 'Base purse', (o) => money(o.basePurse, false)], ['winBonus', 'Win bonus', (o) => money(o.winBonus, false)],
]

export const PATH_LABEL = (o: Offer, v: ContractTalkView): string => (o.pathway ? (v.pathways.find((p) => p.kind === o.pathway!.kind)?.label ?? 'A pathway') : 'None')
export const PLAN_NAME = (o: Offer, v: ContractTalkView): string => (o.plan ? (v.plans.find((p) => p.plan === o.plan)?.label ?? '') : 'Keep current plan')

export function CounterCard({ v, onAccept, onLoad, disabled }: { v: ContractTalkView; onAccept: () => void; onLoad: () => void; disabled?: boolean }) {
  const c = v.counter!
  return (
    <div className="n54-counter" data-testid="talk-counter">
      <div className="caps gold">Their counter</div>
      {v.counterChanges.length > 0 && <ul className="n54-chips" aria-label="What changed">{v.counterChanges.map((x, i) => <li key={i} className="chip gold">{x}</li>)}</ul>}
      <dl className="n54-terms-list">
        {FIELDS.map(([k, l, f]) => <div key={k} className={v.offer && v.offer[k] !== c[k] ? 'chg' : ''}><dt>{l}</dt><dd>{f(c)}</dd></div>)}
        <div><dt>Pathway</dt><dd>{PATH_LABEL(c, v)}</dd></div>
        <div><dt>Development plan</dt><dd>{PLAN_NAME(c, v)}</dd></div>
      </dl>
      <div className="n54-row">
        <button type="button" className="btn primary n54-btn" data-testid="accept-counter" disabled={disabled} onClick={onAccept}>Accept their counter</button>
        <button type="button" className="btn ghost n54-btn" data-testid="load-counter" onClick={onLoad}>Load into my offer</button>
      </div>
    </div>
  )
}

export function ContractEditor({ v, draft, setDraft }: { v: ContractTalkView; draft: Offer; setDraft: (o: Offer) => void }) {
  const set = <K extends keyof Offer>(k: K, val: Offer[K]) => setDraft({ ...draft, [k]: val })
  const m = (n: number) => money(n, false)
  return (
    <div className="n54-editor">
      <div className="terms-grid">
        <Stepper label="Length" value={draft.years} min={1} max={5} step={1} onChange={(n) => setDraft({ ...draft, years: n, fights: Math.max(draft.fights, n) })} format={(n) => `${n} yr`} />
        <Stepper label="Fights" value={draft.fights} min={draft.years} max={14} step={1} onChange={(n) => set('fights', n)} />
        <Stepper label="Min fights / year" value={draft.minFightsPerYear} min={1} max={5} step={1} onChange={(n) => set('minFightsPerYear', n)} />
        <Stepper label="Signing bonus" value={draft.signingBonus} step={500} onChange={(n) => set('signingBonus', n)} format={m} />
        <Stepper label="Weekly retainer" value={draft.weeklyRetainer} step={50} onChange={(n) => set('weeklyRetainer', n)} format={m} />
        <Stepper label="Base purse" value={draft.basePurse} step={1000} onChange={(n) => set('basePurse', n)} format={m} />
        <Stepper label="Win bonus" value={draft.winBonus} step={500} onChange={(n) => set('winBonus', n)} format={m} />
      </div>

      <fieldset className="n54-fieldset" data-testid="pathway-select">
        <legend className="caps">Pathway promise <span className="dim">(optional)</span></legend>
        <p className="dim n54-help">A promise is tracked: if you don't deliver, morale, trust and reputation fall.</p>
        <label className="n54-opt"><input type="radio" name="pathway" checked={!draft.pathway} onChange={() => set('pathway', null)} /><span><b>No pathway promise</b><small className="dim">Nothing extra to deliver.</small></span></label>
        {v.pathways.map((p) => (
          <label key={p.kind} className="n54-opt"><input type="radio" name="pathway" checked={draft.pathway?.kind === p.kind} onChange={() => set('pathway', p.offer)} /><span><b>{p.label}</b><small className="dim">{p.detail}</small></span></label>
        ))}
        {v.pathways.length === 0 && <p className="dim n54-help">No pathway is realistic for this fighter right now.</p>}
      </fieldset>

      <fieldset className="n54-fieldset" data-testid="plan-select">
        <legend className="caps">Development plan <span className="dim">(optional)</span></legend>
        <p className="dim n54-help">Agree how the fighter is managed. A plan that fits their camp helps; one that does not hurts the talks, and the plan you agree is tracked once signed.</p>
        <label className="n54-opt"><input type="radio" name="plan" checked={!draft.plan} onChange={() => set('plan', null)} /><span><b>Keep the current plan</b><small className="dim">Currently: {v.plans.find((p) => p.plan === v.currentPlan)?.label ?? v.currentPlan}</small></span></label>
        {v.plans.map((p) => (
          <label key={p.plan} className="n54-opt"><input type="radio" name="plan" checked={draft.plan === p.plan} onChange={() => set('plan', p.plan)} />
            <span><b>{p.label} <span className={`chip n54-fit-${p.fit.replace(' ', '')}`} data-testid="plan-fit">{p.fit}</span></b><small className="dim">{p.blurb}</small>
              {p.why.length > 0 && <ul className="n54-why">{p.why.map((w, i) => <li key={i}>{w}</li>)}</ul>}</span></label>
        ))}
      </fieldset>
    </div>
  )
}
