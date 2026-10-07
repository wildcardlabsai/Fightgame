import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FightView, ResultView } from '../../engine/fightViews'
import { control, finishCard, PLAY_MODES, roundCommentary, roundsWon, stamina, totalsThrough, type PlayMode } from '../../presentation/fightPlayback'
import { advance, buildTimeline, clockNow, finish, keyEvents, nextEvent, previousEvent, restartEvent, shownRounds, SPEEDS, startPlayback, stepAt, type Playback, type Speed, type TlEvent } from '../../presentation/timeline'
import { emitGameEvent } from '../../store/gameEvents'
import { useGame } from '../../store/gameStore'
import { AudioToggle } from '../components/AudioStatus'
import { usePrefs } from '../../store/prefs'
import { CountUp } from './CountUp'
import { cardFighter, FighterCard } from './FighterCard'
import { FighterPortrait } from './FighterPortrait'
import { useReducedMotion } from './motion'

type Tab = 'stats' | 'rounds' | 'commentary'
type Stage = 'watch' | 'key' | 'result'
const TICK = 80

function LiveStat({ label, a, b, fmt, id }: { label: string; a: number; b: number; fmt?: (n: number) => string; id: string }) {
  const tot = a + b || 1
  return (
    <div className="lf-stat" data-stat={id}>
      <CountUp className="l num" value={a} fmt={fmt} ms={500} />
      <div className="mid"><span>{label}</span><div className="split"><i className="a" style={{ width: `${(a / tot) * 100}%` }} /><i className="b" style={{ width: `${(b / tot) * 100}%` }} /></div></div>
      <CountUp className="r num" value={b} fmt={fmt} ms={500} />
    </div>
  )
}

const ownerTag = (mine: boolean) => <span className={`fn-owner ${mine ? 'mine' : 'opp'}`} data-owner={mine ? 'mine' : 'opponent'}>{mine ? 'YOUR FIGHTER' : 'OPPONENT'}</span>
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/**
 * Fight Night. It PRESENTS a result the engine decided before the first bell. Every mode and speed walks the same
 * deterministic timeline built from the recorded fight (presentation/timeline.ts); nothing here simulates, draws a random
 * number or writes game state. Pressing a mode, speed, skip or replay therefore can never change what happened.
 */
export function LiveFight({ fv, r, live, onDone }: { fv: FightView; r: ResultView; live: boolean; onDone: () => void }) {
  const rounds = r.rounds!
  const total = rounds.length
  const reduced = useReducedMotion()
  const navigate = useGame((s) => s.navigate)
  const prefMode = usePrefs((s) => s.fightMode)
  const setPrefMode = usePrefs((s) => s.setFightMode)
  const a = fv.a.fighter, b = fv.b.fighter
  const names = useMemo(() => ({ a: a.lastName, b: b.lastName }), [a.lastName, b.lastName])

  const fullTl = useMemo(() => buildTimeline({ fightId: fv.id, result: r, names, title: fv.title, reduced }), [fv.id, r, names, fv.title, reduced])
  const keyTl = useMemo(() => keyEvents(fullTl), [fullTl])

  const [overlay, setOverlay] = useState(live)
  const [stage, setStage] = useState<Stage>(live ? (prefMode === 'quick' ? 'result' : prefMode) : 'result')
  const [quick, setQuick] = useState(live && prefMode === 'quick')
  const [run, setRun] = useState(0)
  const [speed, setSpeed] = useState<Speed>(1)
  const [paused, setPaused] = useState(false)
  const tl = stage === 'key' ? keyTl : fullTl
  const [pb, setPb] = useState<Playback>(() => startPlayback(fullTl))
  const [tab, setTab] = useState<Tab>('stats')
  const emitted = useRef(new Set<string>())
  const doneRef = useRef(onDone); doneRef.current = onDone
  const doneCalled = useRef(!live)
  const speedRef = useRef(speed); speedRef.current = speed
  const pausedRef = useRef(paused); pausedRef.current = paused
  const tlRef = useRef(tl); tlRef.current = tl

  const emit = useCallback((key: string, e: Parameters<typeof emitGameEvent>[0]) => { if (emitted.current.has(key)) return; emitted.current.add(key); emitGameEvent(e) }, [])
  const emitFinish = useCallback(() => emit(`fin:${run}`, { type: 'fight.finish', fightId: fv.id, ko: r.method === 'KO', stoppage: r.stoppage && r.method !== 'KO', upset: r.upsetLabel === 'Major upset' }), [emit, run, fv.id, r.method, r.stoppage, r.upsetLabel])

  // ---- the arena: crowd bed + body class only while the presentation layout is up
  useEffect(() => {
    if (!overlay) return
    document.body.classList.add('fight-night')
    emitGameEvent({ type: 'fightnight.enter' })
    return () => { document.body.classList.remove('fight-night'); emitGameEvent({ type: 'fightnight.leave' }) }
  }, [overlay])

  // ---- clock: real time × speed. Pause stops it; speed only scales it.
  useEffect(() => {
    if (!overlay || stage === 'result') return
    let last = performance.now()
    const t = setInterval(() => {
      const now = performance.now(); const dt = now - last; last = now
      if (pausedRef.current) return
      setPb((p) => advance(tlRef.current, p, dt, speedRef.current))
    }, TICK)
    return () => clearInterval(t)
  }, [overlay, stage, run])

  const cur: TlEvent | undefined = pb.done ? undefined : tl[pb.pos]
  const finished = stage === 'result' || pb.done
  const step = cur ? stepAt(cur, pb.acc) : { index: -1, step: null }

  // ---- entering an event: sound cues (once per event per run)
  useEffect(() => {
    if (!cur || !overlay) return
    const k = `${run}:${stage}:${cur.id}`
    switch (cur.sfx) {
      case 'intro': emit(k, { type: 'fight.intro', fightId: fv.id, title: !!fv.title }); break
      case 'round': emit(k, { type: 'fight.round', fightId: fv.id, round: cur.round }); break
      case 'action': emit(k, { type: 'fight.action', fightId: fv.id, round: cur.round }); break
      case 'knockdown': emit(k, { type: 'fight.knockdown', fightId: fv.id, round: cur.round }); break
      case 'stoppage': case 'finish': emitFinish(); break
    }
  }, [cur, overlay, run, stage, emit, fv.id, fv.title, emitFinish])
  // referee count ticks and the fighter getting up, from the recorded count
  useEffect(() => {
    if (!cur || cur.type !== 'knockdown' || !step.step || !overlay) return
    const m = /^COUNT (\d+)$/.exec(step.step.text)
    if (m) emit(`${run}:${stage}:${cur.id}:c${m[1]}:${step.index}`, { type: 'fight.count', fightId: fv.id, round: cur.round, n: Number(m[1]) })
    else if (step.step.text === 'BACK UP') emit(`${run}:${stage}:${cur.id}:up${step.index}`, { type: 'fight.getup', fightId: fv.id, round: cur.round })
  }, [cur, step.index, step.step, overlay, run, stage, emit, fv.id])

  // ---- finishing: tell the page the result is out, once
  useEffect(() => {
    if (!finished) return
    if (overlay) emitFinish()
    if (live && !doneCalled.current) { doneCalled.current = true; doneRef.current() }
  }, [finished, overlay, live, emitFinish])
  // The fight is over: the crowd bed ends with it (it comes back if the fight is replayed)
  useEffect(() => { if (finished && overlay) emitGameEvent({ type: 'fightnight.leave' }) }, [finished, overlay])
  // Quick sim straight to the result
  useEffect(() => { if (quick && overlay && stage === 'result') emitFinish() }, [quick, overlay, stage, emitFinish])

  // ---- actions (none of them touches the engine)
  const begin = (s: Stage) => { emitGameEvent({ type: 'fightnight.enter' }); emitted.current = new Set(); setRun((n) => n + 1); setStage(s); setQuick(false); setPaused(false); setPb(startPlayback(s === 'key' ? keyTl : fullTl)); setOverlay(true) }
  const chooseMode = (m: PlayMode) => { setPrefMode(m); if (m === 'quick') { setStage('result'); setQuick(true); setPb(finish(fullTl)); emitted.current = new Set(); setRun((n) => n + 1); setOverlay(true) } else begin(m) }
  const skip = () => { setPb(finish(tl)) }
  const replay = () => begin(stage === 'key' ? 'key' : stage === 'result' ? (prefMode === 'key' ? 'key' : 'watch') : 'watch')
  const exit = () => { setOverlay(false); if (fv.eventId) navigate('event', fv.eventId); else navigate('fights') }
  const exitLabel = fv.eventId ? 'Return to event' : 'Return to fights'
  const eventDone = useGame((st) => (fv.eventId ? ['completed', 'settled', 'archived'].includes(st.game?.events[fv.eventId]?.status ?? '') : false))

  // ---- derived presentation state (all from the recorded result)
  const shown = finished ? total : shownRounds(cur, pb.acc, total)
  const [ta, tb] = totalsThrough(rounds, shown)
  const ctrl = control(rounds, shown)
  const sta = stamina(rounds, shown)
  const won = roundsWon(rounds, shown)
  const last = shown > 0 ? rounds[shown - 1] : null
  const fin = finishCard(r, names)
  const feed = useMemo(() => rounds.slice(0, shown).flatMap((rd) => roundCommentary(rd, names, total)), [rounds, shown, names, total])
  const heavy = (side: 0 | 1) => rounds.slice(0, shown).filter((rd) => rd.punish[side] === 'Heavy punishment').length
  const crowd = last && last.kd[0] + last.kd[1] > 0 ? 'ROARING' : last && (last.punish[0] === 'Heavy punishment' || last.punish[1] === 'Heavy punishment') ? 'ON ITS FEET' : shown > 0 ? 'ENGAGED' : 'EXPECTANT'
  const edge = ctrl === null ? 'Not recorded for this fight' : shown === 0 ? 'Waiting for the bell' : ctrl >= 58 ? `${names.a} on top` : ctrl <= 42 ? `${names.b} on top` : 'Even'
  const clockSec = finished ? (r.stoppage ? r.seconds : 180) : clockNow(cur, pb.acc)
  const roundNo = finished ? (r.stoppage ? r.round : total) : Math.max(1, cur?.round || 1)
  const inMoment = cur?.type === 'knockdown' || cur?.type === 'decision'
  const keyIdx = stage === 'key' && cur ? pb.pos : -1
  const elapsed = Math.round(tl.slice(0, Math.min(pb.pos, tl.length)).reduce((m, e) => m + e.ms, 0) + pb.acc)

  // ================================================================== pieces
  const fighters = (
    <div className="lf-fighters">
      <div className={`fn-fighter${finished && r.winner === 0 ? ' won' : ''}${finished && r.winner === 1 ? ' lost' : ''}`}><FighterCard f={{ ...cardFighter(a), record: finished ? r.after[0] : fv.a.preRecord }} size="large" side="a" eager meta={ownerTag(fv.a.mine)} badge={finished && r.winner === 0 ? <span className="fn-win-tag">WINNER</span> : undefined} />
        {sta && <div className="fn-energy" aria-label={`${names.a} stamina ${sta.a}%`}><i style={{ width: `${sta.a}%` }} /><span>{sta.a}%</span></div>}</div>
      <div className="lf-vs"><span className="display">VS</span><span className="lf-score num" aria-label={`Rounds won ${names.a} ${won[0]}, ${names.b} ${won[1]}`}>{won[0]} – {won[1]}{won[2] > 0 ? ` (${won[2]})` : ''}</span></div>
      <div className={`fn-fighter${finished && r.winner === 1 ? ' won' : ''}${finished && r.winner === 0 ? ' lost' : ''}`}><FighterCard f={{ ...cardFighter(b), record: finished ? r.after[1] : fv.b.preRecord }} size="large" side="b" eager meta={ownerTag(fv.b.mine)} badge={finished && r.winner === 1 ? <span className="fn-win-tag">WINNER</span> : undefined} />
        {sta && <div className="fn-energy b" aria-label={`${names.b} stamina ${sta.b}%`}><i style={{ width: `${sta.b}%` }} /><span>{sta.b}%</span></div>}</div>
    </div>
  )

  const resultPanel = (
    <div className={`fn-result ${fin.kind}`} data-testid="lf-finish" role="status">
      <div className="caps gold">Final result</div>
      <div className="display t">{fin.kind === 'draw' ? fin.title : fin.kind === 'ko' ? fin.title : `${fin.winnerName} WINS`}</div>
      <div className="display s">{fin.kind === 'ko' ? fin.subtitle : fin.kind === 'draw' ? fin.subtitle : fin.method.toUpperCase()}</div>
      <div className="fn-duo" data-testid="result-duo">
        {([r.winner ?? 0, r.winner === null ? 1 : 1 - r.winner] as (0 | 1)[]).map((i, k) => {
          const f = i === 0 ? fv.a : fv.b
          const role = r.winner === null ? 'draw' : k === 0 ? 'winner' : 'loser'
          return (
            <div key={i} className={`fn-fcard ${role}`} data-testid={`result-${role}`} data-owner={f.mine ? 'mine' : 'opponent'}>
              <div className="fn-role display">{role === 'winner' ? 'WINNER' : role === 'loser' ? 'DEFEATED' : 'DRAW'}</div>
              <FighterPortrait f={f.fighter} size={role === 'winner' ? 'large' : 'card'} eager />
              <div className="display fn-nm">{f.fighter.firstName} <b>{f.fighter.lastName}</b></div>
              <div className="fn-newrec"><span className="caps">New record</span><b className="num" data-testid={`record-${role}`}>{r.after[i]}</b><small className="dim">was {f.preRecord}</small></div>
              {ownerTag(f.mine)}
            </div>
          )
        })}
      </div>
      <div className="fn-result-grid">
        <div><span className="caps">Winner</span><b>{fin.winnerName ?? '—'}</b></div>
        <div><span className="caps">Loser</span><b>{fin.loserName ?? '—'}</b></div>
        <div><span className="caps">Method</span><b>{r.methodLabel}</b></div>
        <div><span className="caps">Round</span><b>{r.round}{r.stoppage ? ` · ${mmss(r.seconds)}` : ` of ${total}`}</b></div>
        <div><span className="caps">Knockdowns</span><b>{names.a} {r.kd[0]} · {names.b} {r.kd[1]}</b></div>
        <div><span className="caps">Punches landed</span><b>{r.stats.landed[0]}–{r.stats.landed[1]} ({r.stats.acc[0]}% / {r.stats.acc[1]}%)</b></div>
        <div><span className="caps">Power punches</span><b>{r.stats.power[0]}–{r.stats.power[1]}</b></div>
      </div>
      {r.cards.length > 0 && <div className="lf-cards-wrap"><div className="caps gold lf-cards-t">Official scorecards · {r.methodLabel}</div><div className="dim lf-cards-n">{names.a} – {names.b}</div><div className="lf-cards">{r.cards.map((c, i) => <div className="card-j" key={i}><div className="caps">Judge {i + 1}</div><div className="sc"><span className={c.a > c.b ? 'w' : ''}>{c.a}</span> – <span className={c.b > c.a ? 'w' : ''}>{c.b}</span></div></div>)}</div></div>}
      <div className="fn-events"><div className="caps">Important moments</div>
        {keyTl.filter((e) => e.type !== 'result' && e.type !== 'intro').map((e) => <div key={e.id} className="fn-ev"><b>{e.round ? `R${e.round}` : '—'}</b><span><i>{e.title}</i> {e.detail}</span></div>)}
        {keyTl.filter((e) => e.type !== 'result' && e.type !== 'intro').length === 0 && <p className="dim">A tactical fight with no knockdowns or stoppage.</p>}
      </div>
    </div>
  )

  const rowsTable = (
    <div className="table-wrap"><table className="table lf-table" data-testid="lf-history">
      <thead><tr><th>Rd</th><th>{names.a}</th><th>{names.b}</th><th>KD</th><th>Energy</th><th>Cards</th></tr></thead>
      <tbody>
        {rounds.slice(0, shown).map((rd) => (
          <tr key={`${run}-${rd.n}`} className={`lf-row${rd.kd[0] + rd.kd[1] > 0 ? ' kd' : ''}${rd.winner === 0 ? ' wa' : rd.winner === 1 ? ' wb' : ''}`}>
            <td className="num">{rd.n}</td><td className="num">{rd.a.landed}/{rd.a.thrown}</td><td className="num">{rd.b.landed}/{rd.b.thrown}</td>
            <td>{rd.kd[0] > 0 ? `⬇ ${names.b}${rd.kd[0] > 1 ? ' ×' + rd.kd[0] : ''}` : ''}{rd.kd[1] > 0 ? `⬇ ${names.a}${rd.kd[1] > 1 ? ' ×' + rd.kd[1] : ''}` : ''}</td>
            <td className="num">{rd.stamina ? `${rd.stamina.a[1]}/${rd.stamina.b[1]}` : '—'}</td>
            <td className="num sc">{rd.cards.join(' · ')}</td>
          </tr>
        ))}
        {shown === 0 && <tr><td colSpan={6} className="dim">Rounds appear here as they finish.</td></tr>}
      </tbody>
    </table></div>
  )

  const watchBody = (
    <>
      <div className="lf-bar">
        <span className="lf-live"><i aria-hidden />FIGHT EMPIRE • {finished ? 'FIGHT NIGHT' : 'LIVE'}</span>
        <span className="lf-round" aria-live="polite" data-testid="lf-round">{finished && r.stoppage ? `ENDED R${r.round}` : `ROUND ${roundNo} / ${total}`}</span>
        <span className="fn-clock num" data-testid="lf-clock" aria-label="Round clock">{mmss(clockSec)}</span>
        <span className="fn-crowd" data-testid="lf-crowd">CROWD · {crowd}</span>
        {fv.title && <span className="lf-title" data-testid="lf-title">{fv.title.label} · {fv.title.titleName}</span>}
        <span className="lf-div dim">{fv.division}{fv.eventName ? ` · ${fv.eventName}` : ''}</span>
      </div>
      {fighters}
      <div className="lf-momentum" role="img" aria-label={`Round control: ${edge}`} data-testid="lf-momentum">
        <span className="n">{names.a}</span>
        <div className="bar">{ctrl !== null ? <><i className="a" style={{ width: `${ctrl}%` }} /><i className="b" style={{ width: `${100 - ctrl}%` }} /><b style={{ left: `${ctrl}%` }} /></> : <i style={{ width: '100%', background: '#2a2a33' }} />}</div>
        <span className="n">{names.b}</span>
        <div className="cap dim">Control · {edge}</div>
      </div>
      {finished ? resultPanel : (
        <>
          {cur?.type === 'intro' && <div className="fn-intro" role="status"><div className="display">{cur.title}</div><div>{cur.detail}</div></div>}
          {cur?.type === 'roundStart' && <div className="lf-bellcard" role="status" key={`b-${run}-${cur.id}`}><span className="display">{cur.title} OF {total}</span></div>}
          {cur && cur.type !== 'knockdown' && cur.type !== 'decision' && ['action', 'hurt', 'momentum', 'standout', 'stoppage'].includes(cur.type) && <div className="fn-callout" role="status" key={cur.id}><div className="display">{cur.title}</div><div>{cur.detail}</div></div>}
          {inMoment && step.step && <div className={`lf-moment${cur?.type === 'decision' ? ' decision' : ''}`} role="alert" key={`${cur!.id}-${step.index}`}><div className="display">{step.step.text}</div><div>{step.step.sub}</div></div>}
        </>
      )}
      {!quick && <><div className="lf-tabs tabs" role="tablist" aria-label="Fight detail">
        {(['stats', 'rounds', 'commentary'] as Tab[]).map((t) => <button key={t} type="button" role="tab" id={`lf-tab-${t}`} aria-selected={tab === t} aria-controls={`lf-panel-${t}`} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t === 'stats' ? 'Live stats' : t === 'rounds' ? 'Rounds' : 'Commentary'}</button>)}
      </div>
      <div className="lf-grid">
        <div className={`lf-panel${tab === 'stats' ? ' active' : ''}`} id="lf-panel-stats" role="tabpanel" aria-labelledby="lf-tab-stats" data-testid="lf-stats">
          <h3 className="lf-h">Live stats</h3>
          <LiveStat id="landed" label="Punches landed" a={ta.landed} b={tb.landed} />
          <LiveStat id="thrown" label="Punches thrown" a={ta.thrown} b={tb.thrown} />
          <LiveStat id="acc" label="Accuracy" a={ta.accuracy} b={tb.accuracy} fmt={(n) => `${n}%`} />
          <LiveStat id="power" label="Power punches landed" a={ta.power} b={tb.power} />
          <LiveStat id="kd" label="Knockdowns" a={ta.knockdowns} b={tb.knockdowns} />
          {sta ? <LiveStat id="stamina" label="Stamina (energy %)" a={sta.a} b={sta.b} fmt={(n) => `${n}%`} /> : <p className="dim lf-note">Stamina was not recorded for this fight.</p>}
          <div className="lf-dmg"><div className="caps">Damage this round</div>
            <div className="row"><span>{names.a}: <b>{last ? last.punish[0] : '—'}</b></span><span>{names.b}: <b>{last ? last.punish[1] : '—'}</b></span></div>
            <div className="row dim"><span>Heavy-punishment rounds: {heavy(0)}</span><span>{heavy(1)}</span></div></div>
        </div>
        <div className={`lf-panel${tab === 'rounds' ? ' active' : ''}`} id="lf-panel-rounds" role="tabpanel" aria-labelledby="lf-tab-rounds">
          <h3 className="lf-h">Round by round</h3>{rowsTable}
          <div className="timeline" style={{ marginTop: 12 }}>{rounds.map((rd, i) => <div key={i} className={`tl ${i < shown ? (rd.winner === 0 ? 'a' : rd.winner === 1 ? 'b' : '') : 'hidden'}`} title={i < shown ? rd.line : undefined}>{i < shown && rd.kd[0] + rd.kd[1] > 0 && <span className="kdm">⬇</span>}{rd.n}</div>)}</div>
        </div>
        <div className={`lf-panel${tab === 'commentary' ? ' active' : ''}`} id="lf-panel-commentary" role="tabpanel" aria-labelledby="lf-tab-commentary">
          <h3 className="lf-h">Commentary</h3>
          <div className="lf-feed" role="log" aria-live="off" data-testid="lf-feed">
            {feed.length === 0 && <p className="dim">The bell is about to ring…</p>}
            {[...feed].reverse().slice(0, 40).map((l) => <p key={l.id} className={`lf-line ${l.tone}`}><b>R{l.round}</b> {l.text}</p>)}
          </div>
        </div>
      </div></>}
    </>
  )

  // Key events: a highlight package. No statistics dashboard.
  const keyBody = (
    <div className="fn-key" data-testid="key-view">
      <div className="lf-bar"><span className="lf-live"><i aria-hidden />FIGHT EMPIRE • HIGHLIGHTS</span><span className="lf-round">{finished ? 'FULL TIME' : `EVENT ${Math.min(pb.pos + 1, keyTl.length)} / ${keyTl.length}`}</span>
        {fv.title && <span className="lf-title">{fv.title.label} · {fv.title.titleName}</span>}<span className="lf-div dim">{names.a} vs {names.b}</span></div>
      {finished ? resultPanel : cur && (
        <div className={`fn-card t-${cur.type}`} key={`${cur.id}-${run}`} data-testid="key-card" data-event-type={cur.type}>
          <div className="fn-card-round caps">{cur.round ? `ROUND ${cur.round}` : 'FIGHT NIGHT'}</div>
          <div className="fn-card-title display">{step.step && cur.type === 'knockdown' ? step.step.text : cur.title}</div>
          <div className="fn-card-detail">{step.step && (cur.type === 'knockdown' || cur.type === 'decision') ? step.step.sub : cur.detail}</div>
          <div className="fn-card-fighters"><FighterCard f={{ ...cardFighter(a), record: fv.a.preRecord }} size="compact" side="a" /><span className="display">VS</span><FighterCard f={{ ...cardFighter(b), record: fv.b.preRecord }} size="compact" side="b" /></div>
        </div>
      )}
      <ol className="fn-track" aria-label="Key events">
        {keyTl.map((e, i) => <li key={e.id} className={i === keyIdx ? 'on' : i < keyIdx || finished ? 'past' : ''}><button type="button" onClick={() => { setPb({ pos: i, acc: 0, done: false }); setPaused(false); setStage('key') }} aria-label={`${e.round ? `Round ${e.round}: ` : ''}${e.title}`}><b>{e.round ? `R${e.round}` : '★'}</b><span>{e.title}</span></button></li>)}
      </ol>
    </div>
  )

  const controls = (
    <div className="fn-controls" role="toolbar" aria-label="Fight Night controls">
      <div className="seg" role="group" aria-label="Presentation mode">
        {PLAY_MODES.map((m) => <button key={m.id} type="button" className={`seg-b${m.id === 'quick' ? (quick ? ' on' : '') : !quick && m.id === stage ? ' on' : ''}`} aria-pressed={m.id === 'quick' ? quick : !quick && m.id === stage} title={m.hint} data-mode={m.id} onClick={() => chooseMode(m.id)}>{m.id === 'watch' ? 'Watch fight' : m.id === 'key' ? 'Key events' : 'Quick sim'}</button>)}
      </div>
      <div className="seg speed" role="group" aria-label="Playback speed">
        {SPEEDS.map((s) => <button key={s} type="button" className={`seg-b${speed === s ? ' on' : ''}`} aria-pressed={speed === s} data-speed={s} onClick={() => setSpeed(s)}>{s}×</button>)}
        <button type="button" className={`seg-b pause${paused ? ' on' : ''}`} aria-pressed={paused} data-testid="lf-pause" disabled={finished} onClick={() => setPaused((p) => !p)}>{paused ? '▶ Play' : '❚❚ Pause'}</button>
      </div>
      <div className="lf-actions">
        {stage === 'key' && !finished && <button type="button" className="btn small ghost" data-testid="key-prev" onClick={() => setPb((p) => previousEvent(p))}>◂◂ Prev</button>}
        {stage === 'key' && !finished && <button type="button" className="btn small ghost" data-testid="key-replay-event" onClick={() => setPb((p) => restartEvent(p))}>↺ Replay event</button>}
        {stage === 'key' && !finished && <button type="button" className="btn small ghost" data-testid="key-next" onClick={() => setPb((p) => nextEvent(keyTl, p))}>Next ▸▸</button>}
        {!finished && <button type="button" className="btn small ghost" data-testid="lf-skip" onClick={skip}>Skip to result</button>}
        <button type="button" className="btn small ghost" data-testid="lf-replay" onClick={replay}>Replay</button>
        {finished && eventDone && <button type="button" className="btn small primary" data-testid="lf-end-event" onClick={exit}>End event ▸</button>}
        {finished && <button type="button" className="btn small ghost" data-testid="lf-full" onClick={() => begin('watch')}>View full fight</button>}
        {finished && <button type="button" className="btn small ghost" data-testid="lf-keys" onClick={() => begin('key')}>View key events</button>}
        {finished && <button type="button" className="btn small" data-testid="lf-details" onClick={() => setOverlay(false)}>Fight details</button>}
      </div>
    </div>
  )

  if (!overlay) {
    return (
      <section className="lf is-done inline" aria-label="Fight result" data-live="false" data-finished="true" data-mode="result">
        {resultPanel}
        <div className="lf-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn small" data-testid="lf-replay" onClick={() => begin(prefMode === 'key' ? 'key' : 'watch')}>Replay on Fight Night ▸</button>
          <button type="button" className="btn small ghost" data-testid="lf-keys-inline" onClick={() => begin('key')}>Key events</button>
        </div>
        <h3 className="lf-h" style={{ marginTop: 16 }}>Round by round</h3>
        <div className="table-wrap"><table className="table lf-table" data-testid="lf-history">
          <thead><tr><th>Rd</th><th>{names.a}</th><th>{names.b}</th><th>KD</th><th>Energy</th><th>Cards</th></tr></thead>
          <tbody>{rounds.map((rd) => <tr key={rd.n} className={`lf-row${rd.kd[0] + rd.kd[1] > 0 ? ' kd' : ''}`}><td className="num">{rd.n}</td><td className="num">{rd.a.landed}/{rd.a.thrown}</td><td className="num">{rd.b.landed}/{rd.b.thrown}</td><td>{rd.kd[0] > 0 ? `⬇ ${names.b}` : ''}{rd.kd[1] > 0 ? `⬇ ${names.a}` : ''}</td><td className="num">{rd.stamina ? `${rd.stamina.a[1]}/${rd.stamina.b[1]}` : '—'}</td><td className="num sc">{rd.cards.join(' · ')}</td></tr>)}</tbody>
        </table></div>
      </section>
    )
  }

  const stageEl = (
    <div className={`fn-stage${inMoment && step.step && !reduced && cur?.type === 'knockdown' ? ' shake' : ''}`} role="dialog" aria-modal="true" aria-label="Fight Night" data-testid="fight-night" data-stage={stage} data-live={!finished ? 'true' : 'false'} data-finished={finished ? 'true' : 'false'} data-mode={quick ? 'quick' : stage} data-speed={speed} data-paused={paused ? 'true' : 'false'} data-elapsed={elapsed} data-pos={pb.pos} data-events={tl.length}>
      <header className="fn-top">
        <button type="button" className="btn ghost small" data-testid="fn-exit" onClick={exit}>◂ {exitLabel}</button>
        <AudioToggle compact />
        <span className="fn-brand display">FIGHT EMPIRE</span>
        <span className="fn-ev">{fv.eventName ?? 'Fight Night'}</span>
      </header>
      <div className="fn-body">{stage === 'key' ? keyBody : <section className={`lf${finished ? ' is-done' : ' is-live'}`} data-testid="lf-watch">{watchBody}</section>}</div>
      {controls}
    </div>
  )
  return createPortal(stageEl, document.body)
}
