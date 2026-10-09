import { useState } from 'react'
import { formatDay } from '../../engine/calendar'
import { TIER_ORDER } from '../../engine/promotions'
import { promotionMediaView } from '../../engine/media/views'
import { useGame } from '../../store/gameStore'
import { useViews } from '../../store/hooks'
import { Section } from '../components/Bits'
import { PromoMark } from '../visual/PromoMark'
import { TierPanel } from '../components/TierPanel'
import { tierLabel } from '../../engine/tiers'
import { FighterTable } from '../components/FighterTable'
import { sortRows } from '../fighterFilters'
import { compactNumber } from '../format'
import { rivalStandings, recentMoves } from '../../engine/world/views'
import '../../styles/world54b.css'

export function PromotionsScreen() {
  const game = useGame((s) => s.game)!
  const views = useViews()
  const [sel, setSel] = useState<string | null>(null)
  const promos = Object.values(game.promotions)
    .map((p) => {
      const roster = views.rosterOf(p.id)
      const avgRep = roster.length ? Math.round(roster.reduce((s, f) => s + f.reputation, 0) / roster.length) : 0
      const avgAge = roster.length ? Math.round(roster.reduce((s, f) => s + f.age, 0) / roster.length) : 0
      return { p, roster, avgRep, avgAge }
    })
    .sort((a, b) => TIER_ORDER.indexOf(b.p.tier) - TIER_ORDER.indexOf(a.p.tier) || b.p.reputation - a.p.reputation)
  const chosen = promos.find((x) => x.p.id === sel)
  const standing = Object.fromEntries(rivalStandings(game).map((r) => [r.id, r]))
  const trading = Object.values(standing).filter((r) => r.status !== 'Folded' && r.status !== 'Folding').length
  const moves = chosen && !chosen.p.isPlayer ? recentMoves(game, chosen.p.id) : []
  const openFighter = useGame((st) => st.navigate)

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="display">Promotions</h1>
          <p className="sub">{trading} rival promotions are trading. The competition. Rivals scout, bid, re-sign and release, and they will go after the same fighters you do. What they are known for is earned from what they actually promote.</p>
        </div>
      </div>
      <Section title="Your promotion"><TierPanel /></Section>
      <div className="table-wrap">
        <table className="table stack">
          <thead><tr><th>Promotion</th><th>Tier</th><th>Standing</th><th>Next show</th><th>Public image</th><th className="r">Reputation</th><th className="r">Fanbase</th><th className="r">Roster</th><th className="r">Avg rep.</th><th className="r">Avg age</th></tr></thead>
          <tbody>
            {promos.map(({ p, roster, avgRep, avgAge }) => (
              <tr key={p.id} className={`row${p.isPlayer ? ' mine' : ''}`} onClick={() => setSel(p.id === sel ? null : p.id)}>
                <td className="primary" data-label="Promotion"><div className="fighter-cell"><PromoMark p={p} size={36} />
                  <div><div className="fighter-name">{p.name}{p.isPlayer && <span className="chip gold" style={{ marginLeft: 8 }}>You</span>}</div>
                    <div className="fighter-sub">{p.promoterName} · est. {formatDay(p.foundedDay, true).split(' ').pop()}</div></div></div></td>
                <td data-label="Tier">{tierLabel(p.tier)}</td>
                <td data-label="Standing">{(() => { const r = standing[p.id]; return r ? <span><span className={`w54-chip w54-${r.status.split(' ')[0]}`} data-testid="rival-status">{r.status}</span><span className="w54-why">{r.why}{r.belts ? ` · ${r.belts} belt${r.belts === 1 ? '' : 's'}` : ''}</span></span> : <span className="dim">You</span> })()}</td>
                <td data-label="Next show" className="dim" style={{ fontSize: 13.5 }}>{(() => { const n = standing[p.id]?.next ?? (p.isPlayer ? null : null); return n ? <span>{formatDay(n.day, false)}<span className="w54-why">{n.city}</span></span> : '—' })()}</td>
                <td data-label="Public image" className="dim" style={{ fontSize: 13.5 }}>{(() => { const pm = promotionMediaView(game, p.id); return pm && pm.tags.length ? <span className="pi-tags">{pm.tags.map((t) => <span key={t} className="chip">{t}</span>)}</span> : <span title="Reputation tags are earned from what a promotion actually does">Still making its name</span> })()}</td>
                <td className="r num" data-label="Reputation" style={{ fontSize: 20 }}>{Math.round(p.reputation)}</td>
                <td className="r num" data-label="Fanbase">{compactNumber(p.fanbase)}</td>
                <td className="r num" data-label="Roster">{roster.length}</td>
                <td className="r num" data-label="Avg rep.">{avgRep || '—'}</td>
                <td className="r num" data-label="Avg age">{avgAge || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {chosen ? (
        <Section title={`${chosen.p.name} — roster`}>
          {moves.length > 0 && (
            <ul className="w54-moves" data-testid="rival-moves" aria-label="Recent signings and departures">
              {moves.map((m, i) => <li key={`${m.fighterId}${m.day}${i}`}><span className="dim num">{formatDay(m.day, false)}</span><button type="button" onClick={() => openFighter('fighter', m.fighterId)}>{m.text}</button></li>)}
            </ul>
          )}
          <FighterTable rows={sortRows(chosen.roster, 'rep', -1)} cols={['fighter', 'division', 'age', 'record', 'stage', 'rep', 'pop']} emptyText="No fighters under contract." />
        </Section>
      ) : <p className="dim" style={{ marginTop: 12, fontSize: 13 }}>Select a promotion to see its roster. Rival finances and contract terms are private.</p>}
    </>
  )
}
