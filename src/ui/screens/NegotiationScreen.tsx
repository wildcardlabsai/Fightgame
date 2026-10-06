import { useEffect, useMemo, useState } from 'react'
import { formatDay } from '../../engine/calendar'
import { negotiationInfo, offerSummary } from '../../engine/quotes'
import type { NegotiationKind, NegotiationRound, Offer } from '../../engine/types'
import { useGame } from '../../store/gameStore'
import { useViews } from '../../store/hooks'
import { Avatar, Flag, Section } from '../components/Bits'
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

function RoundView({ r, who, onUse }: { r: NegotiationRound; who: string; onUse: (o: Offer) => void }) {
  return (
    <>
      <div className="bubble you">
        <div className="caps who">You · {formatDay(r.day, false)}</div>
        <div className="num" style={{ fontSize: 18 }}>
          {r.offer.years}y · {r.offer.fights} fights · {money(r.offer.signingBonus, false)} up front · {money(r.offer.weeklyRetainer, false)}/wk · {money(r.offer.basePurse, false)} purse{r.offer.titlePromise ? ' · title promise' : ''}
        </div>
      </div>
      <div className={`bubble them ${r.verdict}`}>
        <div className="caps who">{who}’s camp <span className={`mood ${r.mood}`} style={{ marginLeft: 8 }}>{MOOD[r.mood]}</span></div>
        <div style={{ fontWeight: 600 }}>
          {r.verdict === 'accept' ? 'Deal.' : r.verdict === 'counter' ? 'We can work with this — but not quite.' : 'No. This is not close.'}
        </div>
        {r.reasons.length > 0 && <ul style={{ margin: '6px 0 0 18px' }}>{r.reasons.map((x, i) => <li key={i}>{x[0].toUpperCase() + x.slice(1)}{x.endsWith('.') ? '' : '.'}</li>)}</ul>}
        {r.counter && (
          <>
            <div className="caps" style={{ margin: '10px 0 4px' }}>Their counter</div>
            <OfferSummaryList o={r.counter} against={r.offer} />
            <button className="btn small" style={{ marginTop: 8 }} onClick={() => onUse(r.counter!)}>Load into my offer</button>
          </>
        )}
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
  const broke = info.status === 'broken'
  const cannotAfford = offer.signingBonus > info.cash
  const afterCash = info.cash - offer.signingBonus
  const submit = () => {
    const r = makeOffer(id, offer, kind)
    if (r === 'accept') navigate('fighter', id)
  }

  return (
    <>
      <div className="profile-hero">
        <Avatar f={v} large />
        <div style={{ flex: 1, minWidth: 240 }}>
          <button className="linkbtn" onClick={() => navigate('fighter', id)}>◂ {v.name}</button>
          <div className="caps" style={{ marginTop: 8 }}>{kind === 'renewal' ? 'Contract renewal' : 'Signing negotiation'}</div>
          <h1 className="display" style={{ fontSize: 'clamp(38px, 5vw, 64px)' }}>{v.firstName} <span className="red">{v.lastName}</span></h1>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            <Flag code={v.nationKey} /><span>{v.division}</span><span className="chip">{v.stage}</span><span className="chip">{v.recordText}</span>
            <span className="dim">Scout grade <RangeText r={v.grade} scouted={v.knowledge.reports > 0 || !!v.own} /></span>
          </div>
        </div>
        <div style={{ minWidth: 200 }}>
          <div className="caps">Typical ask for a fighter of this standing</div>
          <div className="num" style={{ fontSize: 24 }}>{money(v.market.askBand.retainerLo, false)}–{money(v.market.askBand.retainerHi, false)}<small className="dim"> /wk</small></div>
          <div className="num" style={{ fontSize: 24 }}>{money(v.market.askBand.purseLo)}–{money(v.market.askBand.purseHi)}<small className="dim"> /fight</small></div>
          {info.patience && <div className="dim" style={{ fontSize: 13, marginTop: 6 }}>Their camp: <b style={{ color: 'var(--text)' }}>{info.patience}</b></div>}
        </div>
      </div>

      {!info.canNegotiate ? (
        <>
          <p className="attn critical" style={{ marginTop: 20 }}>{info.blockedReason}</p>
          {info.rounds.length > 0 && (
            <Section title="How it went">
              {info.rounds.slice().reverse().map((r, i) => <RoundView key={i} r={r} who={v.lastName} onUse={setOffer} />)}
            </Section>
          )}
          <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
            <button className="btn" onClick={() => navigate('scouting')}>Back to scouting</button>
            <button className="btn ghost" onClick={() => navigate('fighter', id)}>View profile</button>
          </div>
        </>      ) : (
        <div className="grid-2" style={{ marginTop: 6 }}>
          <div>
            <Section title="Your offer">
              {broke && <p className="warn" style={{ marginBottom: 12 }}>Talks have broken down. They will not negotiate for a while.</p>}
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
              <label className={`toggle${offer.titlePromise ? ' on' : ''}`} style={{ marginTop: 14 }}>
                <input type="checkbox" checked={offer.titlePromise} onChange={(e) => set('titlePromise', e.target.checked)} />
                <span><b>Promise a title opportunity</b><br /><small className="dim">Ambitious fighters value this. It becomes an obligation: break it and they will remember. Titles arrive in a later phase, so it is tracked now and enforced then.</small></span>
              </label>
              <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
                <button className="btn primary big" onClick={submit} disabled={cannotAfford || broke}>{info.counter ? 'Send revised offer' : 'Make offer'} ▸</button>
                {info.status !== 'none' && <button className="btn ghost" onClick={() => { walkAway(id); navigate('fighter', id) }}>Walk away</button>}
              </div>
              {cannotAfford && <p className="red" style={{ marginTop: 8 }}>You can’t afford that signing bonus ({money(info.cash, false)} in the bank).</p>}
              {kind === 'signing' && info.rosterCount >= info.rosterCap && <p className="red" style={{ marginTop: 8 }}>Your roster is full ({info.rosterCount}/{info.rosterCap}).</p>}
            </Section>

            <Section title="What this costs you">
              <dl>
                <div className="kv" style={{ gridTemplateColumns: '1fr auto' }}><dt>Paid today</dt><dd className="num" style={{ fontSize: 20 }}>{money(sum.upfront, false)}</dd></div>
                <div className="kv" style={{ gridTemplateColumns: '1fr auto' }}><dt>Retainers over {offer.years} yr</dt><dd className="num" style={{ fontSize: 20 }}>{money(sum.retainers, false)}</dd></div>
                <div className="kv" style={{ gridTemplateColumns: '1fr auto' }}><dt>Guaranteed purses ({offer.fights} fights)</dt><dd className="num" style={{ fontSize: 20 }}>{money(sum.guaranteedPurses, false)}</dd></div>
                <div className="kv" style={{ gridTemplateColumns: '1fr auto' }}><dt className="caps">Total guaranteed</dt><dd className="num red" style={{ fontSize: 26 }}>{money(sum.guaranteedTotal, false)}</dd></div>
                <div className="kv" style={{ gridTemplateColumns: '1fr auto' }}><dt>Adds to weekly burn</dt><dd className="num" style={{ fontSize: 20 }}>{money(sum.weeklyCost, false)}</dd></div>
                <div className="kv" style={{ gridTemplateColumns: '1fr auto', borderBottom: 0 }}><dt>Cash after signing bonus</dt><dd className={`num ${afterCash < 0 ? 'red' : ''}`} style={{ fontSize: 20 }}>{money(afterCash, false)}</dd></div>
              </dl>
              <p className="dim" style={{ fontSize: 13 }}>Purses are paid when fights happen (from Phase 3), but they are committed the moment you sign.</p>
            </Section>
          </div>

          <div>
            <Section title="The conversation">
              {info.rounds.length === 0 ? (
                <p className="empty">No offers yet. Their camp will respond to your first offer with a deal, a counter, or a flat no — and tell you why. Lowball repeatedly and they will walk.</p>
              ) : info.rounds.slice().reverse().map((r, i) => <RoundView key={i} r={r} who={v.lastName} onUse={setOffer} />)}
            </Section>
          </div>
        </div>
      )}
    </>
  )
}
