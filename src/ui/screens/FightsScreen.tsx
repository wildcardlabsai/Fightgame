import { useEffect, useState } from 'react'
import { formatDay } from '../../engine/calendar'
import { fightList, type FightListItem } from '../../engine/fightViews'
import { useGame } from '../../store/gameStore'
import { OffersPanel } from '../office/OffersPanel'
import { offersWaiting } from '../../engine/office/views'

type Tab = 'open' | 'mine' | 'world' | 'offers'

function Row({ f }: { f: FightListItem }) {
  const navigate = useGame((s) => s.navigate)
  const go = () => navigate(f.statusKey === 'negotiating' ? 'deal' : 'fight', f.id)
  const w = f.winner
  return (
    <tr className={`row${f.mine ? ' mine' : ''}${f.stake ? ` has-stake ${f.stake.kind}` : ''}${f.phase === 'negotiating' ? ' proposal' : ''}`} tabIndex={0} onClick={go} onKeyDown={(e) => { if (e.key === 'Enter') go() }}>
      <td data-label="Date" className="num">{f.day ? formatDay(f.day, true) : 'TBC'}</td>
      <td className="primary" data-label="Fight">
        <div className="fighter-name"><span className={w === 0 ? 'gold' : ''}>{f.aName}</span> <span className="dim">vs</span> <span className={w === 1 ? 'gold' : ''}>{f.bName}</span></div>
        <div className="fighter-sub">{f.division} · {f.rounds} rounds{f.city ? ` · ${f.city}` : ''}</div>
        {f.stake && <span className={`stake stake-${f.stake.kind}`} data-testid="stake-chip">{f.stake.label}</span>}
      </td>
      <td data-label="Records" className="num">{f.aRecord} / {f.bRecord}</td>
      <td data-label="Status">{f.phase !== 'done' && <span className={`ph ph-${f.phase}`} data-testid="phase-chip">{f.phase === 'negotiating' ? 'Proposal · in talks' : f.statusKey === 'fightNight' ? 'Fight night' : 'Booked'}</span>}{f.resultText ? <><div>{f.resultText}</div><div className="dim" style={{ fontSize: 13 }}>{f.method}</div></> : <span className={f.statusKey === 'fightNight' ? 'red' : ''}>{f.status}{f.weeksAway ? ` · ${f.weeksAway}w` : ''}</span>}</td>
    </tr>
  )
}

export function FightsScreen() {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const routeParam = useGame((s) => s.route.param)
  const [tab, setTab] = useState<Tab>(routeParam === 'world' || routeParam === 'mine' || routeParam === 'offers' ? routeParam : 'open')
  useEffect(() => { if (routeParam === 'world' || routeParam === 'mine' || routeParam === 'open' || routeParam === 'offers') setTab(routeParam) }, [routeParam])
  const lists = { open: fightList(game, 'mine-open'), mine: fightList(game, 'mine-results'), world: fightList(game, 'world-results', 40) }
  const rows = tab === 'offers' ? [] : lists[tab]
  const waiting = offersWaiting(game)
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="display">Fights</h1>
          <p className="sub">Your bouts from first call to final bell — and the rest of the boxing world’s results.</p>
        </div>
        <button className="btn primary" onClick={() => navigate('matchmaking')}>Make a fight ▸</button>
      </div>
      <div className="tabs" role="tablist">
        {([['open', 'My Fights'], ['offers', 'Offers'], ['mine', 'My Results'], ['world', 'World Results']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{l}<span className="count">{k === 'offers' ? waiting : lists[k].length}</span></button>
        ))}
      </div>
      {tab === 'offers' ? <OffersPanel /> : rows.length === 0 ? (
        <p className="empty">{tab === 'open' ? 'Nothing booked. Open Matchmaking, pick a fighter and find an opponent.' : tab === 'mine' ? 'No completed fights yet.' : 'No results yet — advance time and the sport moves without you.'}</p>
      ) : (
        <div className="table-wrap"><table className="table stack">
          <thead><tr><th>Date</th><th>Fight</th><th>Records</th><th>{tab === 'open' ? 'Status' : 'Result'}</th></tr></thead>
          <tbody>{rows.map((f) => <Row key={f.id} f={f} />)}</tbody>
        </table></div>
      )}
    </>
  )
}
