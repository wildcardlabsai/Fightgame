import type { FightTalkView } from '../../engine/business/talkViews'
import type { FightOffer } from '../../engine/types'
import { Stepper } from '../components/Overlay'
import { money } from '../format'
import { ConfidenceBadge } from './parts'

const rng = (r: { lo: number; hi: number }): string => `${money(r.lo, false)} – ${money(r.hi, false)}`
export const VENUE: Record<FightOffer['venuePref'], string> = { neutral: 'Neutral venue', B: 'Their ground', A: 'Your fighter’s ground' }

export function StakeBadge({ v }: { v: FightTalkView }) {
  return <span className={`chip gold n54-stake k-${v.stake.kind}`} data-testid="fight-stake" title="Set by the title system, not by the negotiation">{v.stake.label}{v.stake.level ? ` · ${v.stake.level}` : ''}</span>
}

export function ExpectedFight({ x }: { x: NonNullable<FightTalkView['expected']> }) {
  return (
    <section className="n54-panel" data-testid="expected-terms" aria-label="Expected terms">
      <h2 className="n54-panel-h n54-static">Expected terms</h2>
      <div className="n54-panel-b">
        <ConfidenceBadge level={x.confidence.level} basis={x.confidence.basis} />
        <dl className="n54-ranges">
          <div><dt>Their purse</dt><dd>{rng(x.purse)}</dd></div>
          <div><dt>Win bonus</dt><dd>{rng(x.winBonus)}</dd></div>
          <div><dt>Location</dt><dd>{x.location}</dd></div>
          <div><dt>Timing</dt><dd>{x.timing}</dd></div>
          <div><dt>Stake</dt><dd>{x.stake}</dd></div>
        </dl>
        <p className="n54-assess" data-testid="assessment">Your current draft: <b className={`as-${x.assessment.split(' ')[0]}`}>{x.assessment}</b></p>
        {x.economics && <p className="dim n54-note">{x.economics}</p>}
        <p className="dim n54-note">{x.note}</p>
      </div>
    </section>
  )
}

export function FightCounterCard({ v, onAccept, onLoad, disabled }: { v: FightTalkView; onAccept: () => void; onLoad: () => void; disabled?: boolean }) {
  const c = v.counter!
  return (
    <div className="n54-counter" data-testid="talk-counter">
      <div className="caps gold">Their counter</div>
      {v.counterChanges.length > 0 && <ul className="n54-chips" aria-label="What changed">{v.counterChanges.map((x, i) => <li key={i} className="chip gold">{x}</li>)}</ul>}
      <dl className="n54-terms-list">
        <div><dt>Their purse</dt><dd>{money(c.purseB, false)}</dd></div>
        <div><dt>Win bonus</dt><dd>{money(c.winBonusB, false)}</dd></div>
        <div><dt>Venue</dt><dd>{VENUE[c.venuePref]}</dd></div>
        <div><dt>Rematch clause</dt><dd>{c.rematch ? 'Yes' : 'No'}</dd></div>
        <div><dt>Fights</dt><dd>{c.fights}</dd></div>
        {c.rounds ? <div><dt>Rounds</dt><dd>{c.rounds}</dd></div> : null}
      </dl>
      <div className="n54-row">
        <button type="button" className="btn primary n54-btn" data-testid="accept-counter" disabled={disabled} onClick={onAccept}>Accept their counter</button>
        <button type="button" className="btn ghost n54-btn" data-testid="load-counter" onClick={onLoad}>Load into my offer</button>
      </div>
    </div>
  )
}

export function FightEditor({ v, draft, setDraft }: { v: FightTalkView; draft: FightOffer; setDraft: (o: FightOffer) => void }) {
  const set = <K extends keyof FightOffer>(k: K, val: FightOffer[K]) => setDraft({ ...draft, [k]: val })
  const m = (n: number) => money(n, false)
  return (
    <div className="n54-editor">
      <div className="terms-grid">
        <Stepper label="Their purse" value={draft.purseB} step={1000} onChange={(n) => set('purseB', n)} format={m} />
        <Stepper label="Their win bonus" value={draft.winBonusB} step={500} onChange={(n) => set('winBonusB', n)} format={m} />
        <div className="field"><label htmlFor="n54-venue">Venue</label>
          <select id="n54-venue" className="select n54-select" value={draft.venuePref} onChange={(e) => set('venuePref', e.target.value as FightOffer['venuePref'])}>
            <option value="neutral">{VENUE.neutral}</option><option value="B">{VENUE.B}</option><option value="A">{VENUE.A}</option>
          </select></div>
        <div className="field"><label htmlFor="n54-fights">Number of fights</label>
          <select id="n54-fights" className="select n54-select" value={draft.fights} onChange={(e) => set('fights', Number(e.target.value) as 1 | 2)}>
            <option value={1}>One fight</option><option value={2}>Two fights</option>
          </select></div>
        {v.roundsOptions.length > 1 && (
          <div className="field"><label htmlFor="n54-rounds">Scheduled rounds</label>
            <select id="n54-rounds" className="select n54-select" data-testid="rounds-select" value={draft.rounds ?? v.rounds} onChange={(e) => set('rounds', Number(e.target.value))}>
              {v.roundsOptions.map((r) => <option key={r} value={r}>{r} rounds</option>)}
            </select></div>
        )}
      </div>
      <label className={`toggle${draft.rematch ? ' on' : ''} n54-toggle-row`}>
        <input type="checkbox" checked={draft.rematch} onChange={(e) => set('rematch', e.target.checked)} />
        <span><b>Rematch clause</b><br /><small className="dim">If they lose, they are entitled to a return fight. Camps that like a second chance value this.</small></span>
      </label>
    </div>
  )
}
