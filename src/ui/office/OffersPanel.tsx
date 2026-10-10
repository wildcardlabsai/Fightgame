import { useState } from 'react'
import { offersBoard, type OfferView } from '../../engine/office/views'
import { useGame } from '../../store/gameStore'
import { money } from '../format'
import '../../styles/office54c.css'

type Seg = 'incoming' | 'active' | 'sent' | 'agreed' | 'closed'
const SEGS: { key: Seg; label: string }[] = [
  { key: 'incoming', label: 'Incoming' }, { key: 'active', label: 'Active negotiations' }, { key: 'sent', label: 'Sent counters' }, { key: 'agreed', label: 'Agreed' }, { key: 'closed', label: 'Declined & expired' },
]

function FighterBox({ f, side }: { f: OfferView['mine']; side: string }) {
  return (
    <div className="o54-fighter">
      <span className="caps">{side}</span>
      <b>{f.name}</b>
      <span>{f.record} · {f.division} · age {f.age}</span>
      <span>{f.rank}{f.belts.length ? ` · ${f.belts.join(', ')}` : ''}</span>
    </div>
  )
}

function OfferCard({ v }: { v: OfferView }) {
  const officeDo = useGame((s) => s.officeDo)
  const navigate = useGame((s) => s.navigate)
  const [countering, setCountering] = useState(false)
  const [purse, setPurse] = useState(v.terms.purse)
  const [bonus, setBonus] = useState(v.terms.winBonus)
  const [override, setOverride] = useState(false)
  const tone = v.status === 'agreed' ? 'good' : v.status === 'open' ? 'gold' : v.status === 'countered' ? 'warn' : 'red'
  const accept = (ov: boolean) => { const r = officeDo('accept', v.id, ov); if (r.needsOverride) setOverride(true); else setOverride(false); return r }
  return (
    <article className={`o54-card ${v.tab === 'agreed' ? 'agreed' : v.tab === 'closed' ? 'closed' : ''}`} data-testid="offer-card" data-status={v.status} data-offer={v.id}>
      <div className="o54-head">
        <div><h3>{v.reason}</h3><div className="o54-sub">{v.promotion} · {v.promotionTier} · promoter {v.promoter} · relationship {v.standing.toLowerCase()}</div></div>
        <span className={`o54-chip ${tone}`}>{v.statusLabel}{v.weeksLeft !== null ? ` · ${v.weeksLeft}w left` : ''}</span>
      </div>
      <p style={{ margin: 0 }}>{v.message}</p>
      <div className="o54-vs"><FighterBox f={v.mine} side="Your fighter" /><span className="x">V</span><FighterBox f={v.theirs} side="Their fighter" /></div>
      <div className="o54-facts">
        <div><span className="k">Stakes</span>{v.stakes}</div>
        <div><span className="k">Distance</span>{v.rounds} rounds</div>
        <div><span className="k">Staged by</span>{v.hostLabel}</div>
        <div><span className="k">Date and venue</span>{v.date ? `${v.date} · ${v.venue}` : 'You choose the date'}</div>
        <div><span className="k">Fit with the plan</span>{v.fit.label}</div>
      </div>
      <div className="o54-money">
        <div><b>{v.terms.label}: {money(v.terms.purse, false)}</b> <span className="dim">+ {money(v.terms.winBonus, false)} win bonus{v.terms.rematch ? ' · rematch clause' : ''}</span></div>
        <div className="dim" style={{ fontSize: 13 }}>{v.terms.note}</div>
        <ul>{v.responsibilities.map((r) => <li key={r}>{r}</li>)}</ul>
      </div>
      {v.history.length > 1 && <div className="o54-hist" aria-label="Negotiation so far">{v.history.map((h, i) => <span key={i}>{h.day} · {h.by}: {money(h.purse, false)} — {h.note}</span>)}</div>}
      {v.fit.note && <div className="o54-warn" role="status">{v.fit.note}</div>}
      {v.problem && v.status !== 'agreed' && v.tab !== 'closed' && <div className="o54-warn" role="alert">This cannot go ahead right now: {v.problem}.</div>}
      {v.closed && <div className="o54-sub">{v.closed}</div>}
      {override && (
        <div className="o54-warn" role="alert">
          {v.mine.name}'s camp objects. Taking the fight over their objection costs morale and the camp's trust. <button className="btn primary" onClick={() => accept(true)}>Take it anyway</button> <button className="linkbtn" onClick={() => setOverride(false)}>Think again</button>
        </div>
      )}
      {v.status === 'open' && (
        <div className="o54-actions">
          <button className="btn primary" disabled={!v.canAccept} onClick={() => accept(false)} data-testid="offer-accept">Accept</button>
          <button className="btn" disabled={!v.canCounter} onClick={() => setCountering((c) => !c)} aria-expanded={countering} data-testid="offer-counter">Counter</button>
          <button className="btn ghost" onClick={() => officeDo('reject', v.id)} data-testid="offer-reject">Decline</button>
        </div>
      )}
      {countering && v.status === 'open' && (
        <div className="o54-counter">
          <label>{v.host === 'you' ? 'Purse you will pay' : 'Fee you want'}<input className="input" type="number" min={0} step={100} value={purse} onChange={(e) => setPurse(Number(e.target.value))} aria-label="Counter purse" /></label>
          <label>Win bonus<input className="input" type="number" min={0} step={100} value={bonus} onChange={(e) => setBonus(Number(e.target.value))} aria-label="Counter win bonus" /></label>
          <button className="btn primary" onClick={() => { const r = officeDo('counter', v.id, { purse, winBonus: bonus, rematch: v.terms.rematch }); if (r.ok) setCountering(false) }} data-testid="offer-send-counter">Send counter</button>
        </div>
      )}
      {v.status === 'countered' && <div className="o54-actions"><span className="dim">They will reply within a week.</span><button className="btn ghost" onClick={() => officeDo('withdrawCounter', v.id)}>Withdraw your counter</button></div>}
      {v.status === 'agreed' && v.fightId && (
        <div className="o54-actions">
          <button className="btn primary" onClick={() => navigate('fight', v.fightId!)}>Open the fight</button>
          <button className="btn ghost" onClick={() => { if (window.confirm('Pull out of this fight? The promotion will remember it.')) officeDo('pullOut', v.id) }}>Pull out</button>
        </div>
      )}
    </article>
  )
}

export function OffersPanel() {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const [seg, setSeg] = useState<Seg>('incoming')
  const board = offersBoard(game)
  const rows = board[seg] as OfferView[]
  return (
    <div data-testid="offers-panel">
      <p className="o54-tabs-note">Rival promoters write to you when a fight between their fighter and yours could really be staged. Accepting books your fighter onto the rival’s own card, which they run; countering lets them think it over for a week.</p>
      <div className="tabs" role="tablist" aria-label="Offer status">
        {SEGS.map((s) => (
          <button key={s.key} role="tab" aria-selected={seg === s.key} className={`tab${seg === s.key ? ' active' : ''}`} onClick={() => setSeg(s.key)} data-testid={`offers-${s.key}`}>{s.label}<span className="count">{board.counts[s.key]}</span></button>
        ))}
      </div>
      {seg === 'active' && board.negotiating.length > 0 && (
        <div className="o54-list" style={{ marginBottom: 12 }}>
          {board.negotiating.map((n) => <div key={n.fightId} className="o54-card"><div className="o54-head"><h3>{n.text}</h3><span className="o54-chip gold">Your negotiation</span></div><div className="o54-actions"><button className="btn" onClick={() => navigate('deal', n.fightId)}>Open the talks</button></div></div>)}
        </div>
      )}
      {rows.length === 0 && !(seg === 'active' && board.negotiating.length > 0) ? (
        <p className="empty">{seg === 'incoming' ? 'No rival is asking for a fight right now. Offers arrive when your fighters are free, fit and well matched to someone on another roster.' : seg === 'active' ? 'Nothing is being negotiated.' : seg === 'sent' ? 'You have no counters waiting for an answer.' : seg === 'agreed' ? 'No fights agreed from offers yet.' : 'Nothing declined or expired.'}</p>
      ) : (
        <div className="o54-list">{rows.map((v) => <OfferCard key={v.id} v={v} />)}</div>
      )}
    </div>
  )
}
