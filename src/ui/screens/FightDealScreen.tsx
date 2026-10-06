import { useEffect, useMemo, useState } from 'react'
import { formatDay } from '../../engine/calendar'
import { fightView } from '../../engine/fightViews'
import type { FightOffer } from '../../engine/types'
import { useGame } from '../../store/gameStore'
import { Avatar, Section } from '../components/Bits'
import { RangeText } from '../components/Estimates'
import { StarRating, VerdictChip } from '../components/FightBits'
import { Stepper } from '../components/Overlay'
import { money } from '../format'

const MOOD: Record<string, string> = { eager: 'Eager', warm: 'Warm', lukewarm: 'Lukewarm', cold: 'Cold' }

export function FightDealScreen({ id }: { id: string }) {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const offerFight = useGame((s) => s.offerFight)
  const withdraw = useGame((s) => s.withdrawFight)
  const fv = useMemo(() => fightView(game, id), [game, id])
  const [draft, setDraft] = useState<FightOffer | null>(null)
  const neg = fv?.negotiation ?? null
  const key = fv ? `${id}|${neg?.rounds.length ?? 0}|${neg?.counter ? 1 : 0}|${fv.statusKey}` : ''
  useEffect(() => {
    if (neg) setDraft(neg.counter ?? neg.rounds[neg.rounds.length - 1]?.offer ?? neg.suggested)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!fv) return <><h1 className="display" style={{ fontSize: 44 }}>Fight not found</h1><button className="btn" onClick={() => navigate('matchmaking')}>Back</button></>
  // Once agreed, scheduling lives on the fight page.
  if (fv.statusKey !== 'negotiating' || !neg) {
    return (
      <>
        <h1 className="display" style={{ fontSize: 44 }}>{fv.headline}</h1>
        <p className="dim" style={{ margin: '10px 0 18px' }}>{fv.statusKey === 'cancelled' ? `This fight is off: ${fv.cancelReason}.` : `Status: ${fv.status}.`}</p>
        <button className="btn primary" onClick={() => navigate(fv.statusKey === 'cancelled' ? 'matchmaking' : 'fight', fv.statusKey === 'cancelled' ? undefined : id)}>{fv.statusKey === 'cancelled' ? 'Back to matchmaking' : 'Open the fight'}</button>
        {neg === null && fv.statusKey === 'cancelled' && null}
      </>
    )
  }
  const offer = draft ?? neg.suggested
  const set = <K extends keyof FightOffer>(k: K, v: FightOffer[K]) => setDraft({ ...offer, [k]: v })
  const opp = fv.b.fighter
  const me = fv.a.fighter
  const cost = fv.terms ? fv.terms.purseA + fv.terms.winBonusA + offer.purseB * (offer.fights) + offer.winBonusB : 0
  const total = (fv.terms?.purseA ?? 0) + offer.purseB
  return (
    <>
      <div className="profile-hero">
        <Avatar f={opp} large />
        <div style={{ flex: 1, minWidth: 240 }}>
          <button className="linkbtn" onClick={() => navigate('matchmaking', me.id)}>◂ Matchmaking</button>
          <div className="caps" style={{ marginTop: 8 }}>Fight negotiation · {me.name} vs …</div>
          <h1 className="display" style={{ fontSize: 'clamp(38px, 5vw, 64px)' }}>{opp.firstName} <span className="red">{opp.lastName}</span></h1>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            <span>{opp.division}</span><span className="chip">{opp.style}</span><span className="chip">{opp.recordText}</span>
            <span className="dim">Scout grade <RangeText r={opp.grade} scouted={opp.knowledge.reports > 0} /></span>
            {fv.a.promotionName !== fv.b.promotionName && <span className="dim">{fv.b.promotionName ?? 'Free agent'}</span>}
          </div>
        </div>
        {fv.matchup && (
          <div style={{ minWidth: 220 }}>
            <div className="caps">Your read on this fight</div>
            <div style={{ margin: '4px 0' }}><VerdictChip v={fv.matchup.verdict} /> <span className="dim" style={{ fontSize: 13 }}>{fv.matchup.winLabel} ({fv.matchup.winLo}–{fv.matchup.winHi}%)</span></div>
            <div>Difficulty <StarRating n={fv.matchup.difficulty} label="Difficulty" /></div>
            <div>Reward <StarRating n={fv.matchup.reward} label="Reward" /></div>
            <div className="dim" style={{ fontSize: 13, marginTop: 4 }}>Their camp: <b style={{ color: 'var(--text)' }}>{neg.patience}</b></div>
          </div>
        )}
      </div>

      <div className="grid-2" style={{ marginTop: 6 }}>
        <div>
          <Section title="Your offer to their camp">
            <p className="dim" style={{ marginBottom: 12 }}>{me.name}’s own purse ({money(fv.terms?.purseA ?? 0, false)}, win bonus {money(fv.terms?.winBonusA ?? 0, false)}) comes from their contract. You are negotiating {opp.name}’s side.</p>
            <div className="terms-grid">
              <Stepper label="Opponent purse" value={offer.purseB} step={1000} onChange={(n) => set('purseB', n)} format={(n) => money(n, false)} />
              <Stepper label="Opponent win bonus" value={offer.winBonusB} step={500} onChange={(n) => set('winBonusB', n)} format={(n) => money(n, false)} />
              <div className="field"><label htmlFor="vn">Venue preference</label>
                <select id="vn" className="select" value={offer.venuePref} onChange={(e) => set('venuePref', e.target.value as FightOffer['venuePref'])}>
                  <option value="neutral">Neutral</option><option value="A">Your fighter’s turf</option><option value="B">Their turf</option>
                </select></div>
              <div className="field"><label htmlFor="nf">Number of fights</label>
                <select id="nf" className="select" value={offer.fights} onChange={(e) => set('fights', Number(e.target.value) as 1 | 2)}>
                  <option value={1}>Single fight</option><option value={2}>Two-fight deal</option>
                </select></div>
            </div>
            <label className={`toggle${offer.rematch ? ' on' : ''}`} style={{ marginTop: 14 }}>
              <input type="checkbox" checked={offer.rematch} onChange={(e) => set('rematch', e.target.checked)} />
              <span><b>Rematch clause</b><br /><small className="dim">If they lose, they are entitled to a return fight. Fighters who like a second chance value this.</small></span>
            </label>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              <button className="btn primary big" disabled={neg.status !== 'open'} onClick={() => { const v = offerFight(id, offer); if (v === 'accept') navigate('fight', id) }}>{neg.counter ? 'Send revised offer' : 'Make offer'} ▸</button>
              <button className="btn ghost" onClick={() => { withdraw(id); navigate('matchmaking', me.id) }}>Walk away</button>
            </div>
          </Section>
          <Section title="What it costs you">
            <dl>
              <div className="kv" style={{ gridTemplateColumns: '1fr auto' }}><dt>{me.name}’s purse</dt><dd className="num" style={{ fontSize: 20 }}>{money(fv.terms?.purseA ?? 0, false)}</dd></div>
              <div className="kv" style={{ gridTemplateColumns: '1fr auto' }}><dt>{opp.name}’s purse</dt><dd className="num" style={{ fontSize: 20 }}>{money(offer.purseB, false)}</dd></div>
              <div className="kv" style={{ gridTemplateColumns: '1fr auto' }}><dt className="caps">Guaranteed for this fight</dt><dd className="num red" style={{ fontSize: 26 }}>{money(total, false)}</dd></div>
              <div className="kv" style={{ gridTemplateColumns: '1fr auto', borderBottom: 0 }}><dt>If the bonus is earned (worst case)</dt><dd className="num" style={{ fontSize: 20 }}>{money(total + Math.max(fv.terms?.winBonusA ?? 0, offer.winBonusB), false)}</dd></div>
            </dl>
            <p className="dim" style={{ fontSize: 13 }}>Paid on fight night, not now. There is no gate or TV income yet — events and revenue arrive in Phase 4, so every fight is a cost.{cost ? '' : ''}</p>
          </Section>
        </div>
        <div>
          <Section title="The conversation">
            {neg.rounds.length === 0 ? <p className="empty">No offers yet. Their camp weighs how dangerous your fighter looks, what the fight does for them, and what you’ll pay.</p> : neg.rounds.slice().reverse().map((r, i) => (
              <div key={i}>
                <div className="bubble you"><div className="caps who">You · {formatDay(r.day, false)}</div>
                  <div className="num" style={{ fontSize: 18 }}>{money(r.offer.purseB, false)} purse · {money(r.offer.winBonusB, false)} bonus · {r.offer.venuePref === 'neutral' ? 'neutral venue' : r.offer.venuePref === 'A' ? 'your turf' : 'their turf'}{r.offer.rematch ? ' · rematch' : ''}{r.offer.fights === 2 ? ' · two fights' : ''}</div></div>
                <div className={`bubble them ${r.verdict}`}>
                  <div className="caps who">{opp.lastName}’s camp <span className={`mood ${r.mood}`} style={{ marginLeft: 8 }}>{MOOD[r.mood]}</span></div>
                  <div style={{ fontWeight: 600 }}>{r.verdict === 'accept' ? 'Deal.' : r.verdict === 'counter' ? 'Close — but not quite.' : 'No. Not close.'}</div>
                  {r.reasons.length > 0 && <ul style={{ margin: '6px 0 0 18px' }}>{r.reasons.map((x, j) => <li key={j}>{x[0].toUpperCase() + x.slice(1)}{x.endsWith('.') ? '' : '.'}</li>)}</ul>}
                  {r.counter && <><div className="caps" style={{ margin: '8px 0 2px' }}>Their counter</div><div className="num" style={{ fontSize: 18 }}>{money(r.counter.purseB, false)} purse · {money(r.counter.winBonusB, false)} bonus · {r.counter.venuePref === 'neutral' ? 'neutral' : r.counter.venuePref === 'A' ? 'your turf' : 'their turf'}</div><button className="btn small" style={{ marginTop: 8 }} onClick={() => setDraft(r.counter)}>Load into my offer</button></>}
                </div>
              </div>
            ))}
          </Section>
          {fv.stakes.length > 0 && <Section title="What’s at stake"><ul style={{ marginLeft: 18, lineHeight: 1.8 }}>{fv.stakes.map((x, i) => <li key={i}>{x}</li>)}</ul></Section>}
        </div>
      </div>
    </>
  )
}
