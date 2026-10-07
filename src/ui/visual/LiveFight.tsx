import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FightView, ResultView } from '../../engine/fightViews'
import { control, finishCard, hasKnockdown, knockdownSteps, PLAY_MODES, planRounds, roundCommentary, roundsWon, stamina, totalsThrough, type CommentaryLine, type PlayMode } from '../../presentation/fightPlayback'
import { emitGameEvent } from '../../store/gameEvents'
import { usePrefs } from '../../store/prefs'
import { CountUp } from './CountUp'
import { cardFighter, FighterCard } from './FighterCard'
import { useReducedMotion } from './motion'

type Tab = 'stats' | 'rounds' | 'commentary'
const BELL_MS = 650

/** One two-sided statistic whose numbers and bar ease to the latest revealed round. */
function LiveStat({ label, a, b, fmt, id }: { label: string; a: number; b: number; fmt?: (n: number) => string; id: string }) {
  const tot = a + b || 1
  return (
    <div className="lf-stat" data-stat={id}>
      <CountUp className="l num" value={a} fmt={fmt} ms={600} />
      <div className="mid"><span>{label}</span><div className="split"><i className="a" style={{ width: `${(a / tot) * 100}%` }} /><i className="b" style={{ width: `${(b / tot) * 100}%` }} /></div></div>
      <CountUp className="r num" value={b} fmt={fmt} ms={600} />
    </div>
  )
}

/**
 * The live fight screen. It PLAYS BACK a result the engine has already decided: nothing here simulates, randomises or
 * writes game state, and the three modes (watch / key moments / quick sim) differ only in how long each round is shown.
 */
export function LiveFight({ fv, r, live, onDone }: { fv: FightView; r: ResultView; /** Present the fight as it happens (just ran). Otherwise show the finished fight, with a replay button. */ live: boolean; onDone: () => void }) {
  const rounds = r.rounds!
  const total = rounds.length
  const mode = usePrefs((s) => s.fightMode)
  const setMode = usePrefs((s) => s.setFightMode)
  const reduced = useReducedMotion()
  const a = fv.a.fighter, b = fv.b.fighter
  const names = useMemo(() => ({ a: a.lastName, b: b.lastName }), [a.lastName, b.lastName])

  const [run, setRun] = useState(0)                 // bumped by Replay
  const [playing, setPlaying] = useState(live)
  const [paused, setPaused] = useState(false)
  const [cursor, setCursor] = useState<{ i: number; stage: 0 | 1 }>({ i: 0, stage: 0 })
  const [shown, setShown] = useState(live ? 0 : total)
  const [bell, setBell] = useState<number | null>(null)
  const [moment, setMoment] = useState<{ id: string; text: string; sub: string } | null>(null)
  const [finished, setFinished] = useState(!live)
  const [cardsShown, setCardsShown] = useState(live ? 0 : r.cards.length)
  const [tab, setTab] = useState<Tab>('stats')
  const [feed, setFeed] = useState<CommentaryLine[]>(() => (live ? [] : rounds.flatMap((rd) => roundCommentary(rd, names, total))))
  const emitted = useRef(new Set<string>())
  const doneCalled = useRef(false)
  const momentTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const momentsStarted = useRef(new Set<string>())
  const clearMoments = useCallback(() => { momentTimers.current.forEach(clearTimeout); momentTimers.current = []; setMoment(null) }, [])
  useEffect(() => () => { momentTimers.current.forEach(clearTimeout) }, [])
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const stops = useMemo(() => planRounds(r, mode), [r, mode])
  const active = live || run > 0

  const emit = useCallback((key: string, e: Parameters<typeof emitGameEvent>[0]) => {
    if (emitted.current.has(key)) return
    emitted.current.add(key)
    emitGameEvent(e)
  }, [])

  const finishNow = useCallback((animateCards: boolean) => {
    setShown(total); setBell(null); clearMoments()
    setFeed(rounds.flatMap((rd) => roundCommentary(rd, names, total)))
    emit(`fin:${run}`, { type: 'fight.finish', fightId: fv.id, ko: r.stoppage })
    setFinished(true)
    if (!animateCards || r.stoppage || r.cards.length === 0) setCardsShown(r.cards.length)
    if (r.stoppage || r.cards.length === 0 || !animateCards) { if (!doneCalled.current) { doneCalled.current = true; setTimeout(() => doneRef.current(), animateCards ? 900 : 0) } }
    setPlaying(false)
  }, [total, rounds, names, emit, run, fv.id, r.stoppage, r.cards.length, clearMoments])

  // Quick sim: straight to the result (the same recorded numbers every other mode ends on).
  useEffect(() => { if (active && playing && mode === 'quick' && !finished) finishNow(false) }, [active, playing, mode, finished, finishNow])

  // Step machine: bell → reveal round → dwell → next round.
  useEffect(() => {
    if (!active || !playing || paused || finished || mode === 'quick') return
    const stop = stops[cursor.i]
    if (!stop) return
    const slow = mode === 'watch' || stop.key
    const bellMs = slow && !reduced ? BELL_MS : 0
    let t: ReturnType<typeof setTimeout>
    if (cursor.stage === 0) {
      setBell(cursor.i + 1)
      emit(`bell:${run}:${cursor.i}`, { type: 'fight.round', fightId: fv.id, round: cursor.i + 1 })
      t = setTimeout(() => setCursor({ i: cursor.i, stage: 1 }), bellMs)
    } else {
      const rd = rounds[cursor.i]
      setBell(null)
      setShown(cursor.i + 1)
      setFeed((f) => { const ids = new Set(f.map((x) => x.id)); return [...f, ...roundCommentary(rd, names, total).filter((x) => !ids.has(x.id))] })
      if (hasKnockdown(rd)) {
        const mk = `${run}:${cursor.i}`
        if (!momentsStarted.current.has(mk)) {
          momentsStarted.current.add(mk)
          let at = 0
          knockdownSteps(rd, names, reduced).forEach((stp, k) => {
            const sid = `kd-${mk}-${k}`
            momentTimers.current.push(setTimeout(() => setMoment({ id: sid, text: stp.text, sub: stp.sub }), at))
            at += stp.ms
          })
          momentTimers.current.push(setTimeout(() => setMoment(null), at))
        }
        emit(`kd:${run}:${cursor.i}`, { type: 'fight.knockdown', fightId: fv.id, round: rd.n })
      }
      const last = cursor.i + 1 >= total
      t = setTimeout(() => { if (last) finishNow(true); else setCursor({ i: cursor.i + 1, stage: 0 }) }, Math.max(250, stop.ms - bellMs))
    }
    return () => clearTimeout(t)
  }, [active, playing, paused, finished, mode, stops, cursor, rounds, names, total, emit, run, fv.id, finishNow, reduced])

  // Decision: scorecards are read out one judge at a time.
  useEffect(() => {
    if (!finished || !active || cardsShown >= r.cards.length || r.stoppage || mode === 'quick') return
    const t = setTimeout(() => setCardsShown((n) => n + 1), reduced ? 250 : 750)
    return () => clearTimeout(t)
  }, [finished, active, cardsShown, r.cards.length, r.stoppage, mode, reduced])
  useEffect(() => {
    if (finished && active && !r.stoppage && r.cards.length > 0 && cardsShown >= r.cards.length && !doneCalled.current) { const t = setTimeout(() => { if (!doneCalled.current) { doneCalled.current = true; doneRef.current() } }, 800); return () => clearTimeout(t) }
  }, [finished, active, cardsShown, r.cards.length, r.stoppage])

  const replay = () => {
    emitted.current = new Set(); doneCalled.current = true; momentsStarted.current = new Set(); clearMoments()
    setRun((n) => n + 1); setShown(0); setFeed([]); setCardsShown(0); setFinished(false); setCursor({ i: 0, stage: 0 }); setPaused(false); setPlaying(true); setTab('stats')
  }
  const isLive = playing
  const skip = () => finishNow(false)
  const canControl = active && !finished
  const cur = Math.min(total, Math.max(1, bell ?? shown))
  const [ta, tb] = totalsThrough(rounds, shown)
  const ctrl = control(rounds, shown)
  const sta = stamina(rounds, shown)
  const won = roundsWon(rounds, shown)
  const last = shown > 0 ? rounds[shown - 1] : null
  const fin = finished ? finishCard(r, names) : null
  const heavy = (side: 0 | 1) => rounds.slice(0, shown).filter((rd) => rd.punish[side] === 'Heavy punishment').length
  const edge = ctrl === null ? 'Not recorded for this fight' : shown === 0 ? 'Waiting for the bell' : ctrl >= 58 ? `${names.a} on top` : ctrl <= 42 ? `${names.b} on top` : 'Even'

  return (
    <section className={`lf${moment && !reduced ? ' shake' : ''}${isLive ? ' is-live' : ''}${finished ? ' is-done' : ''}`} aria-label="Fight night" data-live={isLive ? 'true' : 'false'} data-mode={mode} data-finished={finished ? 'true' : 'false'}>
      <div className="lf-bar">
        <span className="lf-live"><i aria-hidden />FIGHT EMPIRE • {isLive ? 'LIVE' : 'FIGHT NIGHT'}</span>
        <span className="lf-round" aria-live="polite" data-testid="lf-round">{finished && r.stoppage ? `ENDED R${r.round}` : `ROUND ${cur} / ${total}`}</span>
        {fv.title && <span className="lf-title" data-testid="lf-title">{fv.title.label} · {fv.title.titleName}</span>}
        <span className="lf-div dim">{fv.division}{fv.eventName ? ` · ${fv.eventName}` : ''}</span>
      </div>

      <div className="lf-fighters">
        <FighterCard f={{ ...cardFighter(a), record: finished ? r.after[0] : fv.a.preRecord }} size="large" side="a" eager />
        <div className="lf-vs"><span className="display">VS</span><span className="lf-score num" aria-label={`Rounds won ${names.a} ${won[0]}, ${names.b} ${won[1]}`}>{won[0]} – {won[1]}{won[2] > 0 ? ` (${won[2]} even)` : ''}</span></div>
        <FighterCard f={{ ...cardFighter(b), record: finished ? r.after[1] : fv.b.preRecord }} size="large" side="b" eager />
      </div>

      <div className="lf-momentum" role="img" aria-label={`Round control: ${edge}`} data-testid="lf-momentum">
        <span className="n">{names.a}</span>
        <div className="bar">{ctrl !== null ? <><i className="a" style={{ width: `${ctrl}%` }} /><i className="b" style={{ width: `${100 - ctrl}%` }} /><b style={{ left: `${ctrl}%` }} /></> : <i style={{ width: '100%', background: '#2a2a33' }} />}</div>
        <span className="n">{names.b}</span>
        <div className="cap dim">Control · {edge}</div>
      </div>

      {bell !== null && !finished && (
        <div className="lf-bellcard" role="status" key={`bell-${run}-${bell}`}><span className="display">ROUND {bell} OF {total}</span></div>
      )}
      {moment && <div className="lf-moment" role="alert" key={moment.id}><div className="display">{moment.text}</div><div>{moment.sub}</div></div>}

      {fin && (
        <div className={`lf-finish ${fin.kind}`} role="status" data-testid="lf-finish">
          <div className="caps">{fin.kind === 'ko' ? 'Fight over' : fin.kind === 'draw' ? 'Final verdict' : 'Going to the scorecards'}</div>
          <div className="display t">{fin.title}</div>
          {(fin.kind === 'ko' || cardsShown >= r.cards.length) && <div className="display s">{fin.subtitle}{fin.winnerName && fin.kind !== 'ko' ? ` · ${fin.method}` : ''}</div>}
          {fin.kind !== 'ko' && r.cards.length > 0 && (
            <div className="lf-cards">
              {r.cards.slice(0, cardsShown).map((c, i) => (
                <div className="card-j" key={i}><div className="caps">Judge {i + 1}</div><div className="sc"><span className={c.a > c.b ? 'w' : ''}>{c.a}</span> – <span className={c.b > c.a ? 'w' : ''}>{c.b}</span></div></div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="lf-controls">
        <div className="seg" role="group" aria-label="Presentation speed">
          {PLAY_MODES.map((m) => <button key={m.id} type="button" className={`seg-b${mode === m.id ? ' on' : ''}`} aria-pressed={mode === m.id} title={m.hint} data-mode={m.id} onClick={() => setMode(m.id as PlayMode)}>{m.label}</button>)}
        </div>
        <div className="lf-actions">
          {canControl && <button type="button" className="btn small ghost" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>{paused ? 'Resume' : 'Pause'}</button>}
          {canControl && <button type="button" className="btn small ghost" onClick={skip} data-testid="lf-skip">Skip to result</button>}
          {finished && <button type="button" className="btn small ghost" onClick={replay} data-testid="lf-replay">Replay</button>}
        </div>
      </div>

      <div className="lf-tabs tabs" role="tablist" aria-label="Fight detail">
        {(['stats', 'rounds', 'commentary'] as Tab[]).map((t) => <button key={t} type="button" role="tab" id={`lf-tab-${t}`} aria-selected={tab === t} aria-controls={`lf-panel-${t}`} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t === 'stats' ? 'Live stats' : t === 'rounds' ? 'Rounds' : 'Commentary'}</button>)}
      </div>

      <div className="lf-grid">
        <div className={`lf-panel${tab === 'stats' ? ' active' : ''}`} id="lf-panel-stats" role="tabpanel" aria-labelledby="lf-tab-stats">
          <h3 className="lf-h">Live stats</h3>
          <LiveStat id="landed" label="Punches landed" a={ta.landed} b={tb.landed} />
          <LiveStat id="thrown" label="Punches thrown" a={ta.thrown} b={tb.thrown} />
          <LiveStat id="acc" label="Accuracy" a={ta.accuracy} b={tb.accuracy} fmt={(n) => `${n}%`} />
          <LiveStat id="power" label="Power punches landed" a={ta.power} b={tb.power} />
          <LiveStat id="kd" label="Knockdowns" a={ta.knockdowns} b={tb.knockdowns} />
          {sta ? <LiveStat id="stamina" label="Stamina (energy %)" a={sta.a} b={sta.b} fmt={(n) => `${n}%`} /> : <p className="dim lf-note">Stamina was not recorded for this fight.</p>}
          <div className="lf-dmg">
            <div className="caps">Damage this round</div>
            <div className="row"><span>{names.a}: <b>{last ? last.punish[0] : '—'}</b></span><span>{names.b}: <b>{last ? last.punish[1] : '—'}</b></span></div>
            <div className="row dim"><span>Heavy-punishment rounds: {heavy(0)}</span><span>{heavy(1)}</span></div>
          </div>
        </div>

        <div className={`lf-panel${tab === 'rounds' ? ' active' : ''}`} id="lf-panel-rounds" role="tabpanel" aria-labelledby="lf-tab-rounds">
          <h3 className="lf-h">Round by round</h3>
          <div className="table-wrap"><table className="table lf-table" data-testid="lf-history">
            <thead><tr><th>Rd</th><th>{names.a}</th><th>{names.b}</th><th>KD</th><th>Energy</th><th>Cards</th></tr></thead>
            <tbody>
              {rounds.slice(0, shown).map((rd) => (
                <tr key={`${run}-${rd.n}`} className={`lf-row${hasKnockdown(rd) ? ' kd' : ''}${rd.winner === 0 ? ' wa' : rd.winner === 1 ? ' wb' : ''}`}>
                  <td className="num">{rd.n}</td>
                  <td className="num">{rd.a.landed}/{rd.a.thrown}</td>
                  <td className="num">{rd.b.landed}/{rd.b.thrown}</td>
                  <td>{rd.kd[0] > 0 ? `⬇ ${names.b}${rd.kd[0] > 1 ? ' ×' + rd.kd[0] : ''}` : ''}{rd.kd[1] > 0 ? `⬇ ${names.a}${rd.kd[1] > 1 ? ' ×' + rd.kd[1] : ''}` : ''}</td>
                  <td className="num">{rd.stamina ? `${rd.stamina.a[1]}/${rd.stamina.b[1]}` : '—'}</td>
                  <td className="num sc">{rd.cards.join(' · ')}</td>
                </tr>
              ))}
              {shown === 0 && <tr><td colSpan={6} className="dim">Rounds appear here as they finish.</td></tr>}
            </tbody>
          </table></div>
          <div className="timeline" style={{ marginTop: 12 }}>
            {rounds.map((rd, i) => <div key={i} className={`tl ${i < shown ? (rd.winner === 0 ? 'a' : rd.winner === 1 ? 'b' : '') : 'hidden'}`} title={i < shown ? rd.line : undefined}>{i < shown && hasKnockdown(rd) && <span className="kdm">⬇</span>}{rd.n}</div>)}
          </div>
        </div>

        <div className={`lf-panel${tab === 'commentary' ? ' active' : ''}`} id="lf-panel-commentary" role="tabpanel" aria-labelledby="lf-tab-commentary">
          <h3 className="lf-h">Commentary</h3>
          <div className="lf-feed" role="log" aria-live="off" data-testid="lf-feed">
            {feed.length === 0 && <p className="dim">The bell is about to ring…</p>}
            {[...feed].reverse().slice(0, 40).map((l) => <p key={l.id} className={`lf-line ${l.tone}`}><b>R{l.round}</b> {l.text}</p>)}
          </div>
        </div>
      </div>
    </section>
  )
}
