import { useMemo } from 'react'
import { monthlyReview } from '../../engine/review'
import { useGame } from '../../store/gameStore'
import { money } from '../format'

/** A once-a-month look back, from the books and results. Appears after the first four weeks. */
export function MonthlyReviewCard() {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const r = useMemo(() => monthlyReview(game), [game])
  if (game.today - game.startDay < 28) return null
  return (
    <section className="month-review" aria-label="Monthly review" data-testid="monthly-review">
      <div className="sec-head"><h2 className="display">Last four weeks</h2><span className="dim" style={{ fontSize: 13 }}>{r.from} – {r.to}</span></div>
      <p>{r.headline}</p>
      <dl className="mr-grid">
        <div><dt>Money in</dt><dd className="num good">{money(r.income)}</dd></div>
        <div><dt>Money out</dt><dd className="num">{money(r.costs)}</dd></div>
        <div><dt>Net</dt><dd className={`num ${r.cashChange < 0 ? 'bad' : 'good'}`}>{r.cashChange < 0 ? '−' : '+'}{money(Math.abs(r.cashChange))}</dd></div>
        <div><dt>Fights</dt><dd className="num">{r.wins}W · {r.losses}L{r.draws ? ` · ${r.draws}D` : ''}</dd></div>
      </dl>
      {r.shows.length > 0 && <ul className="mr-shows">{r.shows.map((s) => <li key={s.name}><b>{s.name}</b>{s.profit !== null && <span className={s.profit < 0 ? 'bad' : 'good'}> · {s.profit < 0 ? 'lost' : 'made'} {money(Math.abs(s.profit))}</span>}{s.attendance !== null && <span className="dim"> · {s.attendance.toLocaleString('en-GB')} in the hall</span>}</li>)}</ul>}
      {r.watch && <p className="mr-watch"><b>Keep an eye on:</b> {r.watch.title}. <button type="button" className="linkbtn" onClick={() => navigate('advisor')}>Open the advisor</button></p>}
    </section>
  )
}
