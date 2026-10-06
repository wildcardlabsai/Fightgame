import { useMemo, useState } from 'react'
import type { FighterView } from '../../engine/view'
import { useGame } from '../../store/gameStore'
import { useViews } from '../../store/hooks'
import { FighterTable, type SortKey } from '../components/FighterTable'
import { applyFilter, EMPTY_FILTER, sortRows, type FighterFilter } from '../fighterFilters'
import { FilterBar } from './ScoutingScreen'

type Tab = 'roster' | 'free' | 'expiring' | 'signed' | 'released' | 'known'
const RECENT_DAYS = 12 * 7

const TABS: { key: Tab; label: string }[] = [
  { key: 'roster', label: 'My Roster' }, { key: 'free', label: 'Free Agents' }, { key: 'expiring', label: 'Expiring Contracts' },
  { key: 'signed', label: 'Recently Signed' }, { key: 'released', label: 'Recently Released' }, { key: 'known', label: 'All Known' },
]

export function FightersScreen() {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const views = useViews()
  const [tab, setTab] = useState<Tab>('roster')
  const [filter, setFilter] = useState<FighterFilter>(EMPTY_FILTER)
  const [sort, setSort] = useState<SortKey>('grade')
  const [dir, setDir] = useState<1 | -1>(-1)
  const [shown, setShown] = useState(50)

  const base = useMemo<FighterView[]>(() => {
    const recent = (v: FighterView, kind: string, mineOnly: boolean) =>
      v.history.some((h) => h.kind === kind && game.today - h.day <= RECENT_DAYS && (mineOnly ? h.promotionId === game.playerPromotionId : true))
    switch (tab) {
      case 'roster': return views.mine()
      case 'free': return views.freeAgents().filter((v) => v.status === 'active')
      case 'expiring': return views.mine().filter((v) => v.contract.kind === 'own' && v.contract.stage !== 'healthy')
      case 'signed': return views.known().filter((v) => recent(v, 'signed', false) || recent(v, 'renewed', false)).filter((v) => v.status === 'active')
      case 'released': return views.known().filter((v) => (recent(v, 'released', false) || recent(v, 'expired', false)) && v.contract.kind === 'none' && v.status === 'active')
      case 'known': return views.known().filter((v) => v.status === 'active')
    }
  }, [tab, views, game.today, game.playerPromotionId])

  const counts: Record<Tab, number> = {
    roster: views.mine().length, free: views.freeAgents().length, expiring: views.mine().filter((v) => v.contract.kind === 'own' && v.contract.stage !== 'healthy').length,
    signed: 0, released: 0, known: 0,
  }

  const rows = useMemo(() => sortRows(applyFilter(base, filter), sort, dir), [base, filter, sort, dir])
  const onSort = (k: SortKey) => { if (k === sort) setDir((d) => (d === 1 ? -1 : 1)); else { setSort(k); setDir(k === 'name' || k === 'age' ? 1 : -1) } }

  const cols = tab === 'roster' || tab === 'expiring'
    ? (['fighter', 'division', 'age', 'record', 'stage', 'grade', 'ceiling', 'rep', 'pop', 'club'] as const)
    : (['fighter', 'division', 'age', 'record', 'stage', 'rep', 'pop', 'grade', 'club', 'tags'] as const)

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="display">Fighters</h1>
          <p className="sub">Your roster and the wider market. Grades and ceilings are your scouts’ estimates, not facts — fighters you have not scouted show a rough “~” guess.</p>
        </div>
        <button className="btn" onClick={() => navigate('scouting')}>Open Scouting ▸</button>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => { setTab(t.key); setShown(50) }}>
            {t.label}{counts[t.key] > 0 && <span className="count">{counts[t.key]}</span>}
          </button>
        ))}
      </div>

      <FilterBar f={filter} set={(f) => { setFilter(f); setShown(50) }} />
      <FighterTable rows={rows.slice(0, shown)} cols={[...cols]} sort={sort} dir={dir} onSort={onSort}
        emptyText={tab === 'roster' ? 'No fighters match.' : tab === 'expiring' ? 'No contracts need attention right now.' : tab === 'signed' ? 'No notable signings in the last 12 weeks that you know about.' : tab === 'released' ? 'Nobody you know of has hit the market in the last 12 weeks.' : 'No fighters match those filters.'} />
      {rows.length > shown && <div style={{ textAlign: 'center', padding: 16 }}><button className="btn ghost" onClick={() => setShown((n) => n + 50)}>Show more ({rows.length - shown} left)</button></div>}
    </>
  )
}
