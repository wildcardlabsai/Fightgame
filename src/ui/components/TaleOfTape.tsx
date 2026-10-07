import type { FighterView } from '../../engine/view'
import { FighterPortrait } from '../visual/FighterPortrait'
import { Flag } from './Bits'

/** Short, public-data-only reasons each fighter could win. No hidden attributes are read. */
export function keysToVictory(me: FighterView, opp: FighterView): string[] {
  const keys: string[] = []
  const reach = me.reachCm - opp.reachCm
  if (reach >= 4) keys.push(`Use the ${reach} cm reach advantage — keep the jab long.`)
  else if (reach <= -4) keys.push(`Close the distance: ${-reach} cm shorter, so work inside.`)
  if (me.koRate >= 55 && me.fights >= 5) keys.push(`Hunt the stoppage — ${me.koRate}% of the record has come by knockout.`)
  else if (me.koRate <= 25 && me.fights >= 8) keys.push('Bank rounds and win on the cards.')
  if (me.age + 4 <= opp.age) keys.push(`Youth: ${opp.age - me.age} years younger — make it a long night.`)
  else if (me.age >= opp.age + 4) keys.push('Experience: stay patient and avoid a young fighter’s early rush.')
  if (opp.record.koLosses >= 2) keys.push(`${opp.lastName} has been stopped ${opp.record.koLosses} times — test the chin early.`)
  const mf = me.form.filter((x) => x === 'W').length, of = opp.form.filter((x) => x === 'W').length
  if (mf > of) keys.push('Ride the form — more recent wins than the opposition.')
  if (me.style !== opp.style) keys.push(`Impose the ${me.style.toLowerCase()} game on a ${opp.style.toLowerCase()}.`)
  if (keys.length === 0) keys.push('Stay disciplined and respect the other corner.')
  return keys.slice(0, 3)
}

function Row({ label, a, b }: { label: string; a: string | number; b: string | number }) {
  return <div className="tt-row"><div className="num">{a}</div><div className="tt-l">{label}</div><div className="num">{b}</div></div>
}

export function TaleOfTape({ a, b, rounds, division, onBell, bellLabel }: { a: FighterView; b: FighterView; rounds: number; division: string; onBell?: () => void; bellLabel?: string }) {
  const side = (v: FighterView, s: 'a' | 'b') => (
    <div className={`tt-side ${s}`}>
      <FighterPortrait f={v} size="large" />
      {v.nickname && <div className="display tt-nick">“{v.nickname}”</div>}
      <div className="display tt-name">{v.firstName} <span>{v.lastName}</span></div>
      <div className="tt-rec num">{v.recordText}</div>
      <div className="dim"><Flag code={v.nationKey} /> {v.nationName}</div>
    </div>
  )
  return (
    <section className="tape" aria-label="Tale of the tape" data-testid="tale-of-tape">
      <div className="caps gold tt-title">Tale of the Tape · {division} · {rounds} rounds</div>
      <div className="tt-top">
        {side(a, "a")}
        <div className="tt-vs display">VS</div>
        {side(b, "b")}
      </div>
      <div className="tt-rows">
        <Row label="Age" a={a.age} b={b.age} />
        <Row label="Height" a={`${a.heightCm} cm`} b={`${b.heightCm} cm`} />
        <Row label="Reach" a={`${a.reachCm} cm`} b={`${b.reachCm} cm`} />
        <Row label="Stance" a={a.stance} b={b.stance} />
        <Row label="Style" a={a.style} b={b.style} />
        <Row label="Division rank" a={`#${a.standing.rank}`} b={`#${b.standing.rank}`} />
        <Row label="KO rate" a={`${a.koRate}%`} b={`${b.koRate}%`} />
        <Row label="Fights" a={a.fights} b={b.fights} />
      </div>
      <div className="tt-keys">
        {[a, b].map((v, i) => (
          <div key={v.id}>
            <div className="caps">Keys to victory — {v.lastName}</div>
            <ul>{keysToVictory(v, i === 0 ? b : a).map((k) => <li key={k}>{k}</li>)}</ul>
          </div>
        ))}
      </div>
      {onBell && <div className="tt-bell"><button className="btn primary big bell" data-testid="ring-bell" onClick={onBell}>{bellLabel ?? 'Ring the bell'} ▸</button></div>}
    </section>
  )
}
