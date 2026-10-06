import { useMemo, useState } from 'react'
import { DAYS_PER_WEEK, MONTHS, dayToDate, weeksBetween, formatDay } from '../../engine/calendar'
import { fighterAge } from '../../engine/fighters'
import { playerRoster, contractOf } from '../../engine/selectors'
import { useGame } from '../../store/gameStore'

interface Marker { day: number; label: string; tone: 'gold' | 'red'; fighterId?: string }

export function CalendarScreen() {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const t = dayToDate(game.today)
  const [offset, setOffset] = useState(0) // months relative to the current month

  const first = Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + offset, 1)
  const firstDate = new Date(first)
  const year = firstDate.getUTCFullYear()
  const month = firstDate.getUTCMonth()
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const lead = (firstDate.getUTCDay() + 6) % 7 // Monday-first grid
  const dayNum = (d: number) => Math.floor(Date.UTC(year, month, d) / 86_400_000)

  const markers = useMemo<Marker[]>(() => {
    const out: Marker[] = []
    for (const f of playerRoster(game)) {
      const c = contractOf(game, f)
      if (c) out.push({ day: c.endDay, label: `${f.lastName}: contract ends`, tone: 'red', fighterId: f.id })
      const b = dayToDate(f.birthDay)
      for (const y of new Set([t.getUTCFullYear(), t.getUTCFullYear() + 1, year])) {
        const d = Math.floor(Date.UTC(y, b.getUTCMonth(), b.getUTCDate()) / 86_400_000)
        if (d >= game.today) out.push({ day: d, label: `${f.lastName}'s birthday (${fighterAge(f, d)})`, tone: 'gold', fighterId: f.id })
      }
    }
    return out
  }, [game, year, t])

  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(null)

  const weekStart = game.today
  const upcoming = markers.filter((m) => m.day >= game.today).sort((a, b) => a.day - b.day).slice(0, 10)

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="display">Calendar</h1>
          <p className="sub">Time moves in weekly steps. Contract deadlines and birthdays for your fighters are tracked here; fight nights and events join the calendar in Phases 3–4.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn ghost small" onClick={() => setOffset((o) => o - 1)} aria-label="Previous month">◂</button>
          <div className="display" style={{ fontSize: 28, minWidth: 170, textAlign: 'center' }}>{MONTHS[month]} {year}</div>
          <button className="btn ghost small" onClick={() => setOffset((o) => o + 1)} aria-label="Next month">▸</button>
          {offset !== 0 && <button className="linkbtn" onClick={() => setOffset(0)}>Today</button>}
        </div>
      </div>

      <div className="cal">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="cal-h caps">{d}</div>)}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="cal-d out" />
          const dn = dayNum(d)
          const isToday = dn >= weekStart && dn < weekStart + DAYS_PER_WEEK
          return (
            <div key={i} className={`cal-d${isToday ? ' today' : ''}`} title={isToday ? 'Current week' : undefined}>
              <div className="dn">{d}</div>
              {markers.filter((m) => m.day === dn).map((m, j) => (
                <div key={j} className={`cal-ev ${m.tone}`} style={{ cursor: 'pointer' }} onClick={() => m.fighterId && navigate('fighter', m.fighterId)}>{m.label}</div>
              ))}
            </div>
          )
        })}
      </div>
      <p className="dim" style={{ marginTop: 10, fontSize: 13 }}>Highlighted cells mark the current game week ({formatDay(game.today)} onwards).</p>

      <div className="section">
        <div className="section-head"><h2>Coming up</h2></div>
        {upcoming.length === 0 ? <p className="empty">Nothing scheduled.</p> : upcoming.map((m, i) => (
          <div key={i} className={`attn ${m.tone === 'red' ? 'warning' : 'info'}`} style={{ cursor: 'pointer' }} onClick={() => m.fighterId && navigate('fighter', m.fighterId)}>
            <span className="caps" style={{ minWidth: 90 }}>{formatDay(m.day)}</span>
            <span>{m.label}</span>
            <span className="dim" style={{ marginLeft: 'auto' }}>in {Math.max(0, weeksBetween(game.today, m.day))} wk</span>
          </div>
        ))}
      </div>
    </>
  )
}
