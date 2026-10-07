import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatDay } from '../../engine/calendar'
import { eventList } from '../../engine/eventViews'
import { fightView, type FightSideView, type FightView, type ResultView } from '../../engine/fightViews'
import type { CampIntensity, FightPlan } from '../../engine/types'
import { useGame } from '../../store/gameStore'
import { Section } from '../components/Bits'
import { RangeText } from '../components/Estimates'
import { Corner, FormDots, StarRating, StatBar, VerdictChip } from '../components/FightBits'
import { Modal } from '../components/Overlay'
import { LiveFight } from '../visual/LiveFight'
import { money } from '../format'

const INTENSITY: Record<CampIntensity, { n: string; d: string }> = {
  light: { n: 'Light', d: 'Safer on the body, but less sharpness on the night.' },
  normal: { n: 'Normal', d: 'A standard camp.' },
  intense: { n: 'Intense', d: 'Peak sharpness — at a higher risk of camp injury and weight trouble.' },
}
const PLAN: Record<FightPlan, { n: string; d: string }> = {
  balanced: { n: 'Balanced', d: 'Fight to the fighter’s natural style.' },
  aggressive: { n: 'Aggressive', d: 'Push the pace and hunt the stoppage — but leave gaps.' },
  cautious: { n: 'Cautious', d: 'Stay safe, protect the chin, win rounds.' },
}

function Hero({ fv, after, showWinner, hideMatchup }: { fv: FightView; after?: [string, string]; showWinner: boolean; hideMatchup?: boolean }) {
  const r = fv.result
  const wName = r && r.winner !== null ? (r.winner === 0 ? fv.a.fighter : fv.b.fighter) : null
  const lName = r && r.winner !== null ? (r.winner === 0 ? fv.b.fighter : fv.a.fighter) : null
  return (
    <div className="fight-hero">
      <div className="fight-top">
        <div>
          <button className="linkbtn" onClick={() => history.back()}>◂ Back</button>
          <div className="caps" style={{ marginTop: 6 }}>{fv.division} · {fv.rounds} rounds · {fv.city || 'Venue TBC'}{fv.country ? `, ${fv.country}` : ''} · {fv.day ? formatDay(fv.day) : 'Date to be set'}</div>
        </div>
        <div className="caps">{fv.status}{fv.seriesNote ? ` · ${fv.seriesNote}` : ''}</div>
      </div>
      {!hideMatchup && <div className="matchup">
        <Corner v={fv.a.fighter} side="a" record={after && showWinner ? after[0] : fv.a.preRecord} extra={<div style={{ marginTop: 6 }}><FormDots form={fv.a.fighter.form} /></div>} />
        <div className="vs">VS</div>
        <Corner v={fv.b.fighter} side="b" record={after && showWinner ? after[1] : fv.b.preRecord} extra={<div style={{ marginTop: 6 }}><FormDots form={fv.b.fighter.form} /></div>} />
      </div>}
      {r && showWinner && (
        <div className={`result-banner${r.upsetLabel ? ' upset' : ''}`}>
          <div className="caps">{r.upsetLabel ?? 'Result'}{r.stoppage ? ' · Stoppage' : ''}</div>
          {wName && lName ? <div className="display big"><span className="gold">{wName.lastName}</span> defeats {lName.lastName}</div> : <div className="display big">{r.methodLabel}</div>}
          {r.winner !== null && <div className="num" style={{ fontSize: 26 }}>{r.methodLabel} · Round {r.round}{r.stoppage ? ` · ${Math.floor(r.seconds / 60)}:${String(r.seconds % 60).padStart(2, '0')}` : ''}</div>}
          <p style={{ marginTop: 8, maxWidth: '70ch' }}>{r.summary}</p>
        </div>
      )}
    </div>
  )
}

function Strengths({ a, b }: { a: FightSideView; b: FightSideView }) {
  const rows = a.fighter.traits.physical.map((t, i) => ({ t, u: b.fighter.traits.physical[i] }))
  return (
    <Section title="What you know about the fighters">
      <div className="compare" style={{ ['--cols' as string]: 2 }}>
        <div className="compare-row compare-head"><div /><div className="fighter-name">{a.fighter.name}</div><div className="fighter-name">{b.fighter.name}</div></div>
        <div className="compare-row"><div>Style</div><div>{a.fighter.style}</div><div>{b.fighter.style}</div></div>
        <div className="compare-row"><div>Age</div><div>{a.fighter.age}</div><div>{b.fighter.age}</div></div>
        <div className="compare-row"><div>Reach</div><div>{a.fighter.reachCm} cm</div><div>{b.fighter.reachCm} cm</div></div>
        <div className="compare-row"><div>Scout grade</div><div><RangeText r={a.fighter.grade} scouted={a.fighter.knowledge.reports > 0 || a.mine} /></div><div><RangeText r={b.fighter.grade} scouted={b.fighter.knowledge.reports > 0 || b.mine} /></div></div>
        {rows.map(({ t, u }) => <div className="compare-row" key={t.key}><div>{t.name}</div><div><RangeText r={t} scouted={t.scouted} /></div><div><RangeText r={u} scouted={u.scouted} /></div></div>)}
        <div className="compare-row"><div>Scout notes</div><div className="dim" style={{ fontSize: 13 }}>{a.fighter.notes.join(' · ') || '—'}</div><div className="dim" style={{ fontSize: 13 }}>{b.fighter.notes.join(' · ') || 'Little known'}</div></div>
        <div className="compare-row"><div>Intel</div><div>{a.fighter.knowledge.level}</div><div>{b.fighter.knowledge.level}</div></div>
      </div>
    </Section>
  )
}

function ResultSection({ fv, r, done }: { fv: FightView; r: ResultView; done: boolean }) {
  const navigate = useGame((s) => s.navigate)
  const a = fv.a.fighter, b = fv.b.fighter
  return (
    <>
      {!r.rounds && <Section title="Round by round"><p className="empty">Round-by-round detail is only recorded for fights you are involved in.</p></Section>}

      {done && (
        <div className="grid-2">
          <div>
            <Section title="Fight statistics">
              <StatBar label="Punches landed" a={r.stats.landed[0]} b={r.stats.landed[1]} />
              <StatBar label="Punches thrown" a={r.stats.thrown[0]} b={r.stats.thrown[1]} />
              <StatBar label="Accuracy" a={r.stats.acc[0]} b={r.stats.acc[1]} fmt={(n) => `${n}%`} />
              <StatBar label="Power punches landed" a={r.stats.power[0]} b={r.stats.power[1]} />
              <StatBar label="Knockdowns" a={r.kd[0]} b={r.kd[1]} />
              {(r.deductions[0] > 0 || r.deductions[1] > 0) && <p className="warn" style={{ marginTop: 8 }}>Point deductions: {a.lastName} {r.deductions[0]} · {b.lastName} {r.deductions[1]}</p>}
            </Section>
            {r.cards.length > 0 && (
              <Section title="Scorecards">
                <div className="cards">
                  {r.cards.map((c, i) => (
                    <div className="card-j" key={i}><div className="caps">Judge {i + 1}</div>
                      <div className="sc"><span className={c.a > c.b ? 'w' : ''}>{c.a}</span> – <span className={c.b > c.a ? 'w' : ''}>{c.b}</span></div>
                      <div className="dim" style={{ fontSize: 12.5 }}>{c.a > c.b ? a.lastName : c.b > c.a ? b.lastName : 'Even'}</div></div>
                  ))}
                </div>
                <p className="dim" style={{ marginTop: 8 }}>{r.methodLabel}.</p>
              </Section>
            )}
            <Section title="Performance">
              <p style={{ marginBottom: 6 }}>{r.assessment[0]}</p>
              <p>{r.assessment[1]}</p>
            </Section>
          </div>
          <div>
            <Section title="Consequences">
              <dl>
                <div className="kv"><dt>Records</dt><dd>{a.lastName} {r.after[0]} · {b.lastName} {r.after[1]}</dd></div>
                <div className="kv"><dt>Reputation</dt><dd>{a.lastName} <b className={r.dRep[0] >= 0 ? 'good' : 'red'}>{r.dRep[0] >= 0 ? '+' : ''}{r.dRep[0]}</b> · {b.lastName} <b className={r.dRep[1] >= 0 ? 'good' : 'red'}>{r.dRep[1] >= 0 ? '+' : ''}{r.dRep[1]}</b></dd></div>
                <div className="kv"><dt>Popularity</dt><dd>{a.lastName} <b className={r.dPop[0] >= 0 ? 'good' : 'red'}>{r.dPop[0] >= 0 ? '+' : ''}{r.dPop[0]}</b> · {b.lastName} <b className={r.dPop[1] >= 0 ? 'good' : 'red'}>{r.dPop[1] >= 0 ? '+' : ''}{r.dPop[1]}</b></dd></div>
                {r.injuries.map((inj, i) => inj && <div className="kv" key={i}><dt>Injury</dt><dd className="warn">{(i === 0 ? a : b).lastName}: {inj.severity} {inj.kind} — out about {inj.weeks} weeks</dd></div>)}
                {r.stoppage && <div className="kv"><dt>Medical</dt><dd>{r.winner !== null ? (r.winner === 0 ? b : a).lastName : ''} faces a medical suspension.</dd></div>}
              </dl>
              {r.money.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div className="caps">Paid from your account</div>
                  {r.money.map((m, i) => <div key={i} className="kv" style={{ gridTemplateColumns: '1fr auto' }}><dt style={{ color: 'var(--text)' }}>{m.label}</dt><dd className="num red">−{money(m.amount, false)}</dd></div>)}
                  <p className="dim" style={{ fontSize: 13 }}>No gate or TV money yet — that arrives with events in Phase 4.</p>
                </div>
              )}
              {fv.mine && <p className="dim" style={{ marginTop: 10, fontSize: 13 }}>Watching the fight sharpened your scouts’ read on both fighters — check their profiles.</p>}
              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <button className="btn" onClick={() => navigate('fighter', a.id)}>{a.lastName}’s profile</button>
                <button className="btn" onClick={() => navigate('fighter', b.id)}>{b.lastName}’s profile</button>
                {fv.mine && <button className="btn primary" onClick={() => navigate('matchmaking')}>Make the next fight ▸</button>}
              </div>
            </Section>
          </div>
        </div>
      )}
    </>
  )
}

function AddToEvent({ fightId }: { fightId: string }) {
  const game = useGame((s) => s.game)!
  const act = useGame((s) => s.eventDo)
  const navigate = useGame((s) => s.navigate)
  const evs = eventList(game, 'mine-open').filter((e) => ['venueBooked', 'cardBuilding', 'onSale', 'promoting'].includes(e.statusKey))
  if (evs.length === 0) return <p className="empty">You have no show open for cards. <button className="linkbtn" onClick={() => navigate('events')}>Plan one</button></p>
  return (
    <>
      {evs.map((e) => (
        <div key={e.id} className="attn">
          <div><div className="t">{e.name}</div><div className="d">{formatDay(e.day, false)} · {e.venueName} · {e.fights} fights so far</div></div>
          <button className="btn small go" onClick={() => { if (act('addFight', e.id, fightId)) navigate('event', e.id) }}>Add to this show</button>
        </div>
      ))}
    </>
  )
}

export function FightPage({ id }: { id: string }) { return <FightPageInner key={id} id={id} /> }

function FightPageInner({ id }: { id: string }) {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const justRan = useGame((s) => s.justRan)
  const ack = useGame((s) => s.ackFight)
  const run = useGame((s) => s.runFightNight)
  const schedule = useGame((s) => s.scheduleFight)
  const setPrep = useGame((s) => s.setPrep)
  const withdraw = useGame((s) => s.withdrawFight)
  const fv = useMemo(() => fightView(game, id), [game, id])
  const total = fv?.result?.rounds?.length ?? 0
  // Decided once, on arrival: this fight was just run, so it is presented live. (The result already exists in the game state.)
  const [animate] = useState(() => !!fv?.result && justRan === id && total > 0)
  const [revealed, setRevealed] = useState(!animate)
  const onDone = useCallback(() => { setRevealed(true); ack() }, [ack])
  const [picked, setPicked] = useState<number | null>(null)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => () => { if (animate) ack() }, [animate, ack])

  if (!fv) return <><h1 className="display" style={{ fontSize: 44 }}>Fight not found</h1><button className="btn" onClick={() => navigate('fights')}>Back to fights</button></>
  const mySide: 0 | 1 | null = fv.a.mine ? 0 : fv.b.mine ? 1 : null
  const myPrep = mySide === 0 ? fv.a.prep : mySide === 1 ? fv.b.prep : null
  const open = ['scheduled', 'training', 'fightNight'].includes(fv.statusKey)

  return (
    <>
      <Hero fv={fv} after={fv.result?.after} showWinner={revealed} hideMatchup={!!fv.result?.rounds} />
      {fv.result?.rounds && <LiveFight fv={fv} r={fv.result} live={animate} onDone={onDone} />}
      {fv.eventId && <p className="dim" style={{ marginTop: 8 }}>Part of <button className="linkbtn" onClick={() => navigate('event', fv.eventId!)}>{fv.eventName}</button></p>}

      {fv.statusKey === 'fightNight' && fv.canRunNight && (
        <div style={{ textAlign: 'center', padding: '30px 0 6px' }}>
          <div className="caps">It’s fight week</div>
          <p style={{ margin: '8px 0 18px' }}>Both fighters have made weight{fv.a.prep?.weightIssue || fv.b.prep?.weightIssue ? ' — though not without drama' : ''}. The crowd is in. Ring the bell.</p>
          <button className="btn primary bell" onClick={() => (fv.eventId ? navigate('event', fv.eventId) : run(id))}>{fv.eventId ? 'Go to the show ▸' : 'Ring the bell ▸'}</button>
        </div>
      )}

      {fv.statusKey === 'negotiating' && <p className="empty">Talks are ongoing. <button className="linkbtn" onClick={() => navigate('deal', id)}>Open the negotiation</button></p>}

      {fv.statusKey === 'agreed' && (
        <Section title="Choose a date">
          <p className="dim" style={{ marginBottom: 10 }}>Terms are agreed. Pick a Saturday that works for both fighters (injuries, rest, contracts and suspensions are respected). Camp opens four weeks before.</p>
          {fv.scheduleOptions.length === 0 ? <p className="empty">No date works right now — a fighter may be injured or resting. Check back later.</p> : (
            <>
              <div className="opp-grid">
                {fv.scheduleOptions.slice(0, 24).map((o) => (
                  <button key={o.day} className={`pick${picked === o.day ? ' on' : ''}`} onClick={() => setPicked(o.day)} aria-pressed={picked === o.day}>
                    <div className="num" style={{ fontSize: 20 }}>{formatDay(o.day)}</div><div className="fighter-sub">in {o.weeksAway} weeks</div>
                  </button>
                ))}
              </div>
              <button className="btn primary" disabled={picked === null} onClick={() => { if (picked !== null && schedule(id, picked)) setPicked(null) }}>Schedule the fight</button>
            </>
          )}
          <button className="linkbtn" style={{ marginLeft: 16 }} onClick={() => { withdraw(id); navigate('fights') }}>Call it off</button>
        </Section>
      )}
      {fv.statusKey === 'agreed' && fv.mine && (
        <Section title="Or put it on a bigger show">
          <p className="dim" style={{ marginBottom: 10 }}>Fights earn most as part of a card: a venue, tickets, sponsors and broadcast turn them into a show.</p>
          <AddToEvent fightId={id} />
        </Section>
      )}

      {open && myPrep && mySide !== null && (
        <Section title="Preparation" right={<span className="dim" style={{ fontSize: 13 }}>Camp {Math.min(4, myPrep.campWeeks)}/4 weeks{myPrep.nagging ? ' · nursing a niggle' : ''}{myPrep.weightIssue ? ' · weight trouble' : ''}</span>}>
          <div className="grid-2">
            <div>
              <div className="caps" style={{ marginBottom: 6 }}>Camp intensity</div>
              <div className="focus-grid">
                {(Object.keys(INTENSITY) as CampIntensity[]).map((k) => (
                  <button key={k} className={`focus-opt${myPrep.intensity === k ? ' on' : ''}`} aria-pressed={myPrep.intensity === k} disabled={fv.statusKey === 'fightNight'} onClick={() => setPrep(id, mySide, { intensity: k })}>
                    <div className="n">{INTENSITY[k].n}</div><div className="d">{INTENSITY[k].d}</div></button>
                ))}
              </div>
            </div>
            <div>
              <div className="caps" style={{ marginBottom: 6 }}>Fight plan</div>
              <div className="focus-grid">
                {(Object.keys(PLAN) as FightPlan[]).map((k) => (
                  <button key={k} className={`focus-opt${myPrep.plan === k ? ' on' : ''}`} aria-pressed={myPrep.plan === k} disabled={fv.statusKey === 'fightNight'} onClick={() => setPrep(id, mySide, { plan: k })}>
                    <div className="n">{PLAN[k].n}</div><div className="d">{PLAN[k].d}</div></button>
                ))}
              </div>
            </div>
          </div>
          <p className="dim" style={{ marginTop: 10, fontSize: 13 }}>Training focus on the fighter’s profile also shapes camp. Fitness, morale, confidence and age all carry into the ring.</p>
        </Section>
      )}

      {fv.matchup && (
        <Section title="Your read on the fight">
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center' }}>
            <div><div className="caps">Verdict</div><VerdictChip v={fv.matchup.verdict} /></div>
            <div><div className="caps">Difficulty</div><StarRating n={fv.matchup.difficulty} label="Difficulty" /></div>
            <div><div className="caps">Reward</div><StarRating n={fv.matchup.reward} label="Reward" /></div>
            <div><div className="caps">Win chance (est.)</div><b>{fv.matchup.winLabel}</b> <span className="dim">{fv.matchup.winLo}–{fv.matchup.winHi}%</span></div>
            <div><div className="caps">KO risk</div><b>{fv.matchup.koRisk}</b></div>
            <div><div className="caps">Confidence</div><b>{fv.matchup.confidence}</b></div>
          </div>
          <p className="dim" style={{ marginTop: 10 }}>{fv.matchup.styleNote}{fv.matchup.notes.length ? ' ' + fv.matchup.notes.join(' ') : ''}</p>
        </Section>
      )}
      {(open || fv.statusKey === 'agreed') && <Strengths a={fv.a} b={fv.b} />}

      {fv.terms && open && (
        <Section title="Terms">
          <dl>
            <div className="kv"><dt>Purses</dt><dd>{fv.a.fighter.lastName} {money(fv.terms.purseA, false)} · {fv.b.fighter.lastName} {money(fv.terms.purseB, false)}</dd></div>
            <div className="kv"><dt>Win bonuses</dt><dd>{money(fv.terms.winBonusA, false)} / {money(fv.terms.winBonusB, false)}</dd></div>
            <div className="kv"><dt>Rematch clause</dt><dd>{fv.terms.rematch ? 'Yes' : 'No'}</dd></div>
          </dl>
        </Section>
      )}

      {fv.result && <ResultSection fv={fv} r={fv.result} done={revealed} />}

      {fv.statusKey === 'cancelled' && <p className="attn critical">This fight was cancelled: {fv.cancelReason}.</p>}
      {['scheduled', 'training'].includes(fv.statusKey) && fv.mine && <div style={{ marginTop: 18 }}><button className="linkbtn" onClick={() => setConfirm(true)}>Withdraw from this fight</button></div>}
      {confirm && (
        <Modal title="Withdraw from the fight?" onClose={() => setConfirm(false)}>
          <p style={{ marginBottom: 12 }}>Pulling out of a signed fight costs you standing: your promotion’s reputation takes a small hit and the opponent’s camp will not deal with you for a few months.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn ghost" onClick={() => setConfirm(false)}>Keep the fight</button>
            <button className="btn primary" onClick={() => { withdraw(id); setConfirm(false); navigate('fights') }}>Withdraw</button>
          </div>
        </Modal>
      )}
    </>
  )
}
