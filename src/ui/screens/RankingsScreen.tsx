import { useMemo } from 'react'
import { Flag } from '../components/Bits'
import { divisionsList, defaultDivision, rankingOrgs, rankingView, reignsList, titlesOverview } from '../../engine/media/views'
import { formatDay } from '../../engine/calendar'
import { useGame } from '../../store/gameStore'
import { RankMark } from '../media/RankMark'

/** Rankings (five independent lists) and Titles (who holds each sanctioning body's belts). */
export function RankingsScreen({ mode, param }: { mode: 'rankings' | 'titles'; param?: string }) {
  return mode === 'rankings' ? <Rankings param={param} /> : <Titles param={param} />
}

function Rankings({ param }: { param?: string }) {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const orgs = useMemo(() => rankingOrgs(), [])
  const divisions = useMemo(() => divisionsList(), [])
  const [orgParam, divParam] = (param ?? '').split('/')
  const org = orgs.find((o) => o.id === orgParam) ?? orgs.find((o) => o.id === 'ringside') ?? orgs[0]
  const division = (divisions.find((d) => d.id === divParam)?.id ?? defaultDivision(game))
  const view = useMemo(() => rankingView(game, org.id, division), [game, org.id, division])
  const go = (o: string, d: string) => navigate('rankings', `${o}/${d}`)
  return (
    <>
      <div className="page-head"><div><h1 className="display">Rankings</h1><p className="sub">Five independent lists, five different views of the same fighters. Every movement has a reason; none of it is an official verdict from the game.</p></div></div>
      <div className="tabs" role="tablist" aria-label="Ranking lists">
        {orgs.map((o) => <button key={o.id} role="tab" aria-selected={o.id === org.id} className={`tab${o.id === org.id ? ' active' : ''}`} onClick={() => go(o.id, division)} data-testid={`rank-org-${o.id}`}>{o.shortName}</button>)}
      </div>
      <div className="rk-controls">
        <label htmlFor="rk-div" className="caps">Division</label>
        <select id="rk-div" className="select" value={division} onChange={(e) => go(org.id, e.target.value)} data-testid="rank-division">
          {divisions.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </div>
      {view && (
        <div className="rk-wrap">
          <div className="rk-head" style={{ borderColor: view.colour }}>
            <div className="display rk-name">{view.name}</div>
            <div className="rk-meta"><span className="chip">{view.kind.replace('_', ' ')}</span><span className="dim">Authority {view.authority}</span>{view.sanctions && <span className="chip gold">SANCTIONS TITLES</span>}</div>
            <ul className="rk-method">{view.method.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
          {view.rows.length === 0 ? <p className="empty" data-testid="rank-empty">Not enough fighters with five or more fights to rank this division yet.</p> : (
            <ol className="rk-list" data-testid="rank-list">
              {view.rows.map((r) => (
                <li key={r.id} className={`rk-row${r.champion ? ' champ' : ''}${r.mine ? ' mine' : ''}`} data-testid="rank-row">
                  <RankMark label={r.label} champion={r.champion} />
                  <button type="button" className="rk-who" onClick={() => navigate('fighter', r.id)}><span className="rk-n">{r.name}{r.mine && <span className="chip gold">YOURS</span>}</span><span className="dim"><Flag code={r.nation} /> {r.record}</span></button>
                  <span className={`rk-move ${r.movementTone}`} aria-label={`Movement ${r.movement}`}>{r.movement}</span>
                  <span className="rk-why dim">{r.why}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="dim rk-foot">Last updated {view.updated ? formatDay(view.updated) : '—'}. Lists use public results only: records, who beat whom, how recently, titles and (for some) popularity.</p>
        </div>
      )}
    </>
  )
}

function Titles({ param }: { param?: string }) {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const all = useMemo(() => titlesOverview(game), [game])
  const bodies = [...new Map(all.map((t) => [t.body, t])).values()]
  const body = bodies.find((b) => b.body === param)?.body ?? bodies[0]?.body
  const rows = all.filter((t) => t.body === body)
  const reigns = useMemo(() => reignsList(game).filter((r) => r.b === body).slice(0, 12), [game, body])
  const cur = bodies.find((b) => b.body === body)
  return (
    <>
      <div className="page-head"><div><h1 className="display">Titles</h1><p className="sub">Three sanctioning bodies each recognise one champion per division. A belt changes hands only when a champion loses, retires, or is stripped for refusing a mandatory defence.</p></div></div>
      <div className="tabs" role="tablist" aria-label="Sanctioning bodies">
        {bodies.map((b) => <button key={b.body} role="tab" aria-selected={b.body === body} className={`tab${b.body === body ? ' active' : ''}`} onClick={() => navigate('titles', b.body)} data-testid={`title-body-${b.body}`}>{b.shortName}</button>)}
      </div>
      {cur && <p className="sub" style={{ marginBottom: 12 }}>{cur.bodyName}</p>}
      <div className="tt-grid" data-testid="titles-grid">
        {rows.map((t) => (
          <div key={t.division} className={`tt-card${t.champion ? '' : ' vacant'}${t.champion?.mine ? ' mine' : ''}`} data-testid="title-row">
            <div className="caps">{t.divisionLabel}</div>
            {t.champion ? <button type="button" className="tt-champ display" onClick={() => navigate('fighter', t.champion!.id)}>{t.champion.name}</button> : <div className="tt-champ display dim">VACANT</div>}
            <div className="dim">{t.champion ? `${t.champion.record} · champion since ${formatDay(t.since!, false)} · ${t.defences} defence${t.defences === 1 ? '' : 's'}` : t.vacantSince ? `Vacant since ${formatDay(t.vacantSince, false)}` : 'No champion recognised'}</div>
            {t.mandatory && <div className="tt-mand"><b>MANDATORY</b> {t.mandatory.challenger} · due {formatDay(t.mandatory.due, false)}</div>}
            {t.champion?.mine && <span className="chip gold">YOURS</span>}
          </div>
        ))}
      </div>
      <h2 className="m-sec display">Reign history</h2>
      {reigns.length === 0 ? <p className="dim">No reign has ended in this game yet.</p> : <ul className="m-done">{reigns.map((r, i) => <li key={i}>{r.fn} · {r.title} · {formatDay(r.from, false)}–{r.to ? formatDay(r.to, false) : 'now'} · {r.defences} defence{r.defences === 1 ? '' : 's'} — {r.how}</li>)}</ul>}
    </>
  )
}
