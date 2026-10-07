import { useEffect, useMemo, useState } from 'react'
import { formatDay } from '../../engine/calendar'
import { contractAdvice } from '../../engine/advisor'
import { negotiationInfo, offerSummary } from '../../engine/quotes'
import type { FighterView } from '../../engine/view'
import type { NegotiationKind, NegotiationRound, Offer } from '../../engine/types'
import { useGame } from '../../store/gameStore'
import { useViews } from '../../store/hooks'
import { AdvicePanel } from '../components/Advice'
import { Avatar, Flag, Section } from '../components/Bits'
import { FighterPortrait } from '../visual/FighterPortrait'
import { RangeText } from '../components/Estimates'
import { Stepper } from '../components/Overlay'
import { money } from '../format'

const FIELD_LABEL: Record<string, string> = {
  years: 'Length (years)', fights: 'Fights', minFightsPerYear: 'Guaranteed fights / year', signingBonus: 'Signing bonus', weeklyRetainer: 'Weekly retainer',
  basePurse: 'Base purse / fight', winBonus: 'Win bonus', titleBonus: 'Title bonus', ppvShare: 'PPV share', titlePromise: 'Title shot promised',
}

function fmt(k: keyof Offer, v: number | boolean): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (k === 'ppvShare') return `${(v * 100).toFixed(1)}%`
  if (k === 'years' || k === 'fights' || k === 'minFightsPerYear') return String(v)
  return money(v, false)
}

function OfferSummaryList({ o, against }: { o: Offer; against?: Offer }) {
  const keys = Object.keys(FIELD_LABEL) as (keyof Offer)[]
  return (
    <dl>
      {keys.map((k) => {
        const changed = against && against[k] !== o[k]
        return (
          <div key={k} className="kv" style={{ gridTemplateColumns: '1fr auto', padding: '4px 0' }}>
            <dt>{FIELD_LABEL[k]}</dt>
            <dd className={changed ? 'gold' : ''}>{changed && <span className="dim" style={{ marginRight: 6, textDecoration: 'line-through' }}>{fmt(k, against[k] as number | boolean)}</span>}{fmt(k, o[k] as number | boolean)}</dd>
          </div>
        )
      })}
    </dl>
  )
}

const MOOD: Record<string, string> = { eager: 'Eager to sign', warm: 'Warm', lukewarm: 'Lukewarm', cold: 'Cold' }
const TENSION: Record<string, string> = { Patient: 'Calm', Cooling: 'Rising', 'Running out of patience': 'Tense' }

const youLine = (o: Offer, kind: NegotiationKind) =>
  kind === 'renewal'
    ? `I’d like to keep you: ${o.years} years, ${money(o.basePurse, false)} a fight, ${money(o.weeklyRetainer, false)} a week${o.signingBonus ? `, and ${money(o.signingBonus, false)} to re-sign` : ''}.`
    : `How about ${money(o.basePurse, false)} per fight over ${o.years} year${o.years === 1 ? '' : 's'}, ${money(o.weeklyRetainer, false)} a week${o.signingBonus ? ` and ${money(o.signingBonus, false)} up front` : ''}${o.titlePromise ? ', with a title shot promised' : ''}?`

function Turn({ r, v, kind, onUse }: { r: NegotiationRound; v: FighterView; kind: NegotiationKind; onUse: (o: Offer) => void }) {
  const reply = r.verdict === 'accept' ? 'Deal. Let’s get it done.' : r.verdict === 'counter' ? 'We’re getting closer — but I need a bit more.' : 'No. That is not close to what I need.'
  return (
    <>
      <div className="chat you" data-testid="turn-you">
        <div className="chat-who caps">You · {formatDay(r.day, false)}</div>
        <div className="chat-bubble">{youLine(r.offer, kind)}</div>
        <div className="chat-terms">{r.offer.years}y · {r.offer.fights} fights · {money(r.offer.signingBonus, false)} up front · {money(r.offer.weeklyRetainer, false)}/wk · {money(r.offer.basePurse, false)} purse</div>
      </div>
      <div className={`chat them ${r.verdict}`} data-testid="turn-them">
        <Avatar f={v} />
        <div className="chat-col">
          <div className="chat-who caps">{v.lastName} <span className={`mood ${r.mood}`}>{MOOD[r.mood]}</span></div>
          <div className="chat-bubble">{reply}</div>
          {r.reasons.length > 0 && <ul className="chat-why">{r.reasons.map((x, i) => <li key={i}>“{x[0].toUpperCase() + x.slice(1)}{x.endsWith('.') ? '' : '.'}”</li>)}</ul>}
          {r.counter && (
            <div className="chat-counter">
              <div className="caps">Their number</div>
              <OfferSummaryList o={r.counter} against={r.offer} />
              <button className="btn small" onClick={() => onUse(r.counter!)}>Load into my offer</button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export function NegotiationScreen({ id }: { id: string }) {
  const game = useGame((s) => s.game)!
  const views = useViews()
  const navigate = useGame((s) => s.navigate)
  const makeOffer = useGame((s) => s.makeOffer)
  const walkAway = useGame((s) => s.walkAway)
  const v = views.fighter(id)
  const kind: NegotiationKind = v?.contract.kind === 'own' ? 'renewal' : 'signing'
  const info = useMemo(() => negotiationInfo(game, id, kind), [game, id, kind])
  const [draft, setDraft] = useState<Offer | null>(null)

  // Re-seed the form only when the conversation moves on (a new round / counter) — never on unrelated state changes,
  // so the player's in-progress edits are not overwritten.
  const seedKey = info ? `${id}|${kind}|${info.rounds.length}|${info.counter ? 1 : 0}` : ''
  useEffect(() => {
    if (info) setDraft(info.counter ?? info.rounds[info.rounds.length - 1]?.offer ?? info.suggested)
  }, [seedKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const offer = draft ?? info?.suggested ?? null
  const setOffer = (o: Offer) => setDraft(o)

  if (!v || !info || !offer) {
    return <><h1 className="display" style={{ fontSize: 44 }}>Not found</h1><button className="btn" onClick={() => navigate('fighters')}>Back</button></>
  }
  const set = <K extends keyof Offer>(k: K, val: Offer[K]) => setOffer({ ...offer, [k]: val })
  const sum = offerSummary(offer)
  const advice = contractAdvice(game, id, offer)
  const broke = info.status === 'broken'
  const cannotAfford = offer.signingBonus > info.cash
  const afterCash = info.cash - offer.signingBonus
  const submit = () => {
    const r = makeOffer(id, offer, kind)
    if (r === 'accept') navigate('fighter', id)
  }

  const last = info.rounds[info.rounds.length - 1]
  const counter = info.counter
  const tension = info.patience ? TENSION[info.patience] : null
  const mid = (x: Offer, y: Offer): Offer => {
    const r = (n: number, q: number) => Math.round(n / q) * q
    return { ...x, years: Math.round((x.years + y.years) / 2), fights: Math.max(Math.round((x.fights + y.fights) / 2), Math.round((x.years + y.years) / 2)), minFightsPerYear: Math.round((x.minFightsPerYear + y.minFightsPerYear) / 2), signingBonus: r((x.signingBonus + y.signingBonus) / 2, 500), weeklyRetainer: r((x.weeklyRetainer + y.weeklyRetainer) / 2, 50), basePurse: r((x.basePurse + y.basePurse) / 2, 500), winBonus: r((x.winBonus + y.winBonus) / 2, 250), ppvShare: (x.ppvShare + y.ppvShare) / 2, titlePromise: x.titlePromise || y.titlePromise }
  }
  const send = (o: Offer) => { setDraft(o); const r = makeOffer(id, o, kind); if (r === 'accept') navigate('fighter', id) }
  const canSend = !cannotAfford && !broke
  const [showTerms, setShowTerms] = useState(false)

  return (
    <>
      <header className="neg-head" data-testid="neg-dossier">
        <FighterPortrait f={v} size="large" eager />
        <div className="neg-id">
          <button className="linkbtn" onClick={() => navigate('fighter', id)}>◂ Fighter dossier</button>
          <div className="caps gold">{kind === 'renewal' ? 'Contract renewal' : 'Signing negotiation'}</div>
          {v.nickname && <div className="ds-nick display">“{v.nickname}”</div>}
          <h1 className="display neg-name">{v.firstName} <span>{v.lastName}</span></h1>
          <div className="ds-line"><Flag code={v.nationKey} /> <b>{v.nationName}</b> <span className="ds-dot" /> <b>{v.division}</b> <span className="ds-dot" /> <span className="num" style={{ fontSize: 22 }}>{v.recordText}</span> <span className="ds-dot" /> {v.age}y · {v.style}</div>
          <div className="dim" style={{ marginTop: 4 }}>Scout grade <RangeText r={v.grade} scouted={v.knowledge.reports > 0 || !!v.own} /> · typical ask {money(v.market.askBand.retainerLo, false)}–{money(v.market.askBand.retainerHi, false)}/wk, {money(v.market.askBand.purseLo)}–{money(v.market.askBand.purseHi)}/fight</div>
        </div>
        <dl className="neg-gauges" aria-label="State of the talks">
          <div><dt>Interest</dt><dd className={`mood-t ${last?.mood ?? ''}`}>{last ? MOOD[last.mood] : 'Unknown yet'}</dd></div>
          <div><dt>Tension</dt><dd className={`tension ${tension ?? ''}`}>{tension ?? 'Calm'}</dd></div>
          <div><dt>Their counter</dt><dd>{counter ? 'On the table' : last ? (last.verdict === 'accept' ? 'Deal agreed' : 'None') : '—'}</dd></div>
        </dl>
      </header>

      {!info.canNegotiate ? (
        <>
          <p className="attn critical" style={{ marginTop: 20 }}>{info.blockedReason}</p>
          {info.rounds.length > 0 && <Section title="How it went">{info.rounds.map((r, i) => <Turn key={i} r={r} v={v} kind={kind} onUse={setOffer} />)}</Section>}
          <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
            <button className="btn" onClick={() => navigate('scouting')}>Back to scouting</button>
            <button className="btn ghost" onClick={() => navigate('fighter', id)}>View profile</button>
          </div>
        </>
      ) : (
        <div className="neg-grid">
          <section className="neg-talk" aria-label="The conversation" data-testid="neg-conversation">
            <div className="chat them intro">
              <Avatar f={v} />
              <div className="chat-col"><div className="chat-who caps">{v.lastName}</div>
                <div className="chat-bubble">{kind === 'renewal' ? 'My contract is coming up. I want to know where I stand with you.' : 'I’m looking for a promoter who can get me to the top.'}</div></div>
            </div>
            <div className="chat you intro"><div className="chat-who caps">You</div><div className="chat-bubble">{kind === 'renewal' ? 'You’ve earned a place here. What would it take to keep you?' : 'We’d love to have you on our roster. What are you looking for?'}</div></div>
            <div className="chat them intro"><Avatar f={v} /><div className="chat-col"><div className="chat-bubble">{`I need to know the per-fight number${v.market.askBand.purseHi ? ` — fighters at my level are usually looking at ${money(v.market.askBand.purseLo)} to ${money(v.market.askBand.purseHi)}.` : '.'}`}</div></div></div>
            {info.rounds.map((r, i) => <Turn key={i} r={r} v={v} kind={kind} onUse={setOffer} />)}
            {broke && <p className="warn" style={{ marginTop: 10 }}>Talks have broken down. They will not negotiate for a while.</p>}
          </section>

          <aside className="neg-move" aria-label="Your move">
            <h2 className="display">Your move</h2>
            <div className="move-opts" role="group" aria-label="Quick responses">
              {counter && <button className="move-btn primary" data-testid="move-accept" disabled={!canSend} onClick={() => send(counter)}><b>Accept their number</b><span>{money(counter.basePurse, false)} a fight · {counter.years}y · {money(counter.signingBonus, false)} up front</span></button>}
              {counter && last && <button className="move-btn" data-testid="move-middle" disabled={!canSend} onClick={() => send(mid(last.offer, counter))}><b>Meet in the middle</b><span>Split the difference with your last offer</span></button>}
              {!counter && info.rounds.length === 0 && <button className="move-btn primary" data-testid="move-suggested" disabled={!canSend} onClick={() => send(info.suggested)}><b>Make a fair offer</b><span>{money(info.suggested.basePurse, false)} a fight · {money(info.suggested.weeklyRetainer, false)}/wk · {info.suggested.years}y</span></button>}
              {last && last.verdict !== 'accept' && <button className="move-btn" data-testid="move-hold" disabled={!canSend} onClick={() => send(last.offer)}><b>Hold firm</b><span>Repeat your last terms{tension === 'Tense' ? ' — their patience is thin' : ''}</span></button>}
              {last && last.verdict !== 'accept' && <button className="move-btn" data-testid="move-sweeten" disabled={!canSend || offer.signingBonus + 2000 > info.cash} onClick={() => send({ ...(counter ?? last.offer), signingBonus: (counter ?? last.offer).signingBonus + 2000 })}><b>Sweeten the deal</b><span>Add {money(2000, false)} to the signing bonus</span></button>}
              <button className="move-btn" data-testid="move-custom" onClick={() => setShowTerms((x) => !x)} aria-expanded={showTerms}><b>{showTerms ? 'Hide the terms' : 'Write your own terms'}</b><span>Length, purse, retainer, bonuses, promises</span></button>
              {info.status !== 'none' && <button className="move-btn quiet" onClick={() => { walkAway(id); navigate('fighter', id) }}><b>Walk away</b><span>End the talks</span></button>}
            </div>
            {(showTerms || info.rounds.length === 0) && (
              <div className="neg-terms" data-testid="neg-terms">
                <div className="terms-grid">
                  <Stepper label="Length" value={offer.years} min={1} max={5} step={1} onChange={(n) => set('years', n)} format={(n) => `${n} yr`} />
                  <Stepper label="Fights" value={offer.fights} min={offer.years} max={14} step={1} onChange={(n) => set('fights', n)} />
                  <Stepper label="Guaranteed fights / yr" value={offer.minFightsPerYear} min={1} max={5} step={1} onChange={(n) => set('minFightsPerYear', n)} />
                  <Stepper label="Signing bonus" value={offer.signingBonus} step={500} onChange={(n) => set('signingBonus', n)} format={(n) => money(n, false)} />
                  <Stepper label="Weekly retainer" value={offer.weeklyRetainer} step={50} onChange={(n) => set('weeklyRetainer', n)} format={(n) => money(n, false)} />
                  <Stepper label="Base purse / fight" value={offer.basePurse} step={1000} onChange={(n) => set('basePurse', n)} format={(n) => money(n, false)} />
                  <Stepper label="Win bonus" value={offer.winBonus} step={500} onChange={(n) => set('winBonus', n)} format={(n) => money(n, false)} />
                  <Stepper label="PPV share" value={Math.round(offer.ppvShare * 1000) / 10} step={0.5} min={0} max={20} onChange={(n) => set('ppvShare', n / 100)} format={(n) => `${n}%`} />
                </div>
                <label className={`toggle${offer.titlePromise ? ' on' : ''}`} style={{ marginTop: 12 }}>
                  <input type="checkbox" checked={offer.titlePromise} onChange={(e) => set('titlePromise', e.target.checked)} />
                  <span><b>Promise a title opportunity</b><br /><small className="dim">Ambitious fighters value this. It becomes an obligation: break it and they will remember. Titles arrive in a later phase, so it is tracked now and enforced then.</small></span>
                </label>
                <button className="btn primary big" style={{ marginTop: 14, width: '100%' }} data-testid="neg-send" onClick={submit} disabled={!canSend}>{info.counter ? 'Send revised offer' : 'Make offer'} ▸</button>
              </div>
            )}
            <AdvicePanel list={advice} cap={3} />
            {cannotAfford && <p className="red" style={{ marginTop: 8 }}>You can’t afford that signing bonus ({money(info.cash, false)} in the bank).</p>}
            {kind === 'signing' && info.rosterCount >= info.rosterCap && <p className="red" style={{ marginTop: 8 }}>Your roster is full ({info.rosterCount}/{info.rosterCap}).</p>}
            <dl className="neg-cost">
              <div><dt>Paid today</dt><dd className="num">{money(sum.upfront, false)}</dd></div>
              <div><dt>Retainers over {offer.years} yr</dt><dd className="num">{money(sum.retainers, false)}</dd></div>
              <div><dt>Guaranteed purses ({offer.fights})</dt><dd className="num">{money(sum.guaranteedPurses, false)}</dd></div>
              <div className="tot"><dt>Total guaranteed</dt><dd className="num red">{money(sum.guaranteedTotal, false)}</dd></div>
              <div><dt>Adds to weekly burn</dt><dd className="num">{money(sum.weeklyCost, false)}</dd></div>
              <div><dt>Cash after signing bonus</dt><dd className={`num ${afterCash < 0 ? 'red' : ''}`}>{money(afterCash, false)}</dd></div>
            </dl>
          </aside>
        </div>
      )}
    </>
  )
}
