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

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="display">Promotions</h1>
          <p className="sub">The competition. Rivals scout, bid, re-sign and release, and they will go after the same fighters you do. What they are known for is earned from what they actually promote.</p>
        </div>
      </div>
      <Section title="Your promotion"><TierPanel /></Section>
      <div className="table-wrap">
        <table className="table stack">
          <thead><tr><th>Promotion</th><th>Tier</th><th>Public image</th><th className="r">Reputation</th><th className="r">Fanbase</th><th className="r">Roster</th><th className="r">Avg rep.</th><th className="r">Avg age</th></tr></thead>
          <tbody>
            {promos.map(({ p, roster, avgRep, avgAge }) => (
              <tr key={p.id} className={`row${p.isPlayer ? ' mine' : ''}`} onClick={() => setSel(p.id === sel ? null : p.id)}>
                <td className="primary" data-label="Promotion"><div className="fighter-cell"><PromoMark p={p} size={36} />
                  <div><div className="fighter-name">{p.name}{p.isPlayer && <span className="chip gold" style={{ marginLeft: 8 }}>You</span>}</div>
                    <div className="fighter-sub">{p.promoterName} · est. {formatDay(p.foundedDay, true).split(' ').pop()}</div></div></div></td>
                <td data-label="Tier">{tierLabel(p.tier)}</td>
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
          <FighterTable rows={sortRows(chosen.roster, 'rep', -1)} cols={['fighter', 'division', 'age', 'record', 'stage', 'rep', 'pop']} emptyText="No fighters under contract." />
        </Section>
      ) : <p className="dim" style={{ marginTop: 12, fontSize: 13 }}>Select a promotion to see its roster. Rival finances and contract terms are private.</p>}
    </>
  )
}
