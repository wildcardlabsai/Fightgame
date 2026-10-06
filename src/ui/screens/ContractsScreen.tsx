import { useState } from 'react'
import { formatDay } from '../../engine/calendar'
import { commitments, ownContractHistory, releaseQuote } from '../../engine/quotes'
import { STAGE_LABEL } from '../../engine/systems/contracts'
import { useGame } from '../../store/gameStore'
import { useViews } from '../../store/hooks'
import { Section } from '../components/Bits'
import { FighterCell } from '../components/FighterTable'
import { Modal } from '../components/Overlay'
import { money } from '../format'

export function ContractsScreen() {
  const game = useGame((s) => s.game)!
  const views = useViews()
  const navigate = useGame((s) => s.navigate)
  const release = useGame((s) => s.release)
  const [confirm, setConfirm] = useState<string | null>(null)
  const mine = views.mine().filter((v) => v.contract.kind === 'own').sort((a, b) => (a.contract.kind === 'own' ? a.contract.weeksLeft : 0) - (b.contract.kind === 'own' ? b.contract.weeksLeft : 0))
  const c = commitments(game)
  const history = ownContractHistory(game).slice(0, 12)
  const quote = confirm ? releaseQuote(game, confirm) : null
  const target = confirm ? views.fighter(confirm) : null

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="display">Contracts</h1>
          <p className="sub">Every fighter you employ, what you owe them, and when it ends. Renew early, or lose them to the market.</p>
        </div>
      </div>
      <div className="kpis" style={{ marginTop: 0 }}>
        <div className="kpi"><div className="caps">Contracts</div><div className="v num">{c.count}</div></div>
        <div className="kpi"><div className="caps">Weekly retainers</div><div className="v num">{money(c.weeklyRetainers, false)}</div></div>
        <div className="kpi"><div className="caps">Guaranteed purses owed</div><div className="v num">{money(c.guaranteedPurses)}</div><div className="s">paid as fights happen (Phase 3)</div></div>
      </div>

      <Section title="Roster contracts">
        {mine.length === 0 ? <p className="empty">No fighters under contract. Visit Scouting to find talent.</p> : (
          <div className="table-wrap">
            <table className="table stack">
              <thead><tr><th>Fighter</th><th>Status</th><th>Ends</th><th className="r">Retainer</th><th className="r">Purse</th><th>Fights</th><th>Terms</th><th /></tr></thead>
              <tbody>
                {mine.map((v) => {
                  if (v.contract.kind !== 'own') return null
                  const k = v.contract.contract
                  return (
                    <tr key={v.id} className="row" onClick={() => navigate('fighter', v.id)}>
                      <td className="primary" data-label="Fighter"><FighterCell v={v} /></td>
                      <td data-label="Status"><span className={`pill ${v.contract.stage}`}>{STAGE_LABEL[v.contract.stage]}</span></td>
                      <td data-label="Ends">{formatDay(k.endDay)} <small className="dim">({v.contract.weeksLeft}w)</small></td>
                      <td className="r num" data-label="Retainer">{money(k.weeklyRetainer, false)}/wk</td>
                      <td className="r num" data-label="Purse">{money(k.basePurse, false)}</td>
                      <td data-label="Fights" className="num">{k.fightsRemaining}/{k.fightsTotal}</td>
                      <td data-label="Terms" className="dim" style={{ fontSize: 13 }}>
                        win {money(k.winBonus, false)}{k.ppvShare > 0 ? ` · PPV ${(k.ppvShare * 100).toFixed(1)}%` : ''} · min {k.minFightsPerYear}/yr{k.titlePromise ? ' · title promised' : ''}
                      </td>
                      <td className="actions" onClick={(e) => e.stopPropagation()}>
                        <span className="action-row">
                          <button className={`btn small${v.contract.stage !== 'healthy' ? ' primary' : ''}`} onClick={() => navigate('negotiation', v.id)}>Renew</button>
                          <button className="linkbtn" onClick={() => setConfirm(v.id)}>Release</button>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Contract history">
        {history.length === 0 ? <p className="empty">Nothing yet. Completed, renewed and terminated deals will appear here.</p> : history.map((h) => {
          const v = views.fighter(h.fighterId)
          return (
            <div key={h.id} className="attn" style={{ cursor: 'pointer' }} onClick={() => navigate('fighter', h.fighterId)}>
              <span className="caps" style={{ minWidth: 80 }}>{formatDay(h.endDay, false)}</span>
              <span>{v?.name ?? 'Fighter'}</span>
              <span className="dim">{money(h.weeklyRetainer, false)}/wk · {money(h.basePurse, false)} purse</span>
              <span className="chip" style={{ marginLeft: 'auto' }}>{h.status}</span>
            </div>
          )
        })}
      </Section>

      {confirm && target && quote && (
        <Modal title={`Release ${target.name}?`} onClose={() => setConfirm(null)}>
          <p style={{ marginBottom: 12 }}>Releasing a fighter mid-contract has consequences:</p>
          <ul style={{ margin: '0 0 14px 20px', lineHeight: 1.7 }}>
            <li>Release fee: <b className="red">{money(quote.fee, false)}</b> (paid now)</li>
            <li>Your promotion’s reputation takes a hit{target.popularity >= 50 ? ' — bigger for a popular fighter' : ''}</li>
            <li>{target.name.split(' ')[0]} will hold a grudge and be harder to sign again</li>
            <li>Loyal and fragile fighters on your roster will notice how you treat people</li>
          </ul>
          {!quote.affordable && <p className="red">You can’t afford the release fee.</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn ghost" onClick={() => setConfirm(null)}>Keep them</button>
            <button className="btn primary" disabled={!quote.affordable} onClick={() => { if (release(confirm)) setConfirm(null) }}>Release · {money(quote.fee, false)}</button>
          </div>
        </Modal>
      )}
    </>
  )
}
