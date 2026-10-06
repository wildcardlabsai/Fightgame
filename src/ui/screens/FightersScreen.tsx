import { useMemo, useState } from 'react'
import { NATIONS } from '../../data/nations'
import { WEIGHT_CLASSES, weightClassLabel } from '../../data/weightClasses'
import {
  fighterAge, fighterName, fighterRating, recordLabel,
} from '../../engine/fighters'
import { freeAgents, playerRoster, promotionOf } from '../../engine/selectors'
import type { Fighter, WeightClassId } from '../../engine/types'
import { useGame } from '../../store/gameStore'
import { Avatar, Flag, Meter, Rating } from '../components/Bits'

type Tab = 'roster' | 'free' | 'all'
type SortKey = 'rating' | 'age' | 'popularity' | 'name' | 'record'

const PAGE = 60

export function FighterRow({ f, showClub = true }: { f: Fighter; showClub?: boolean }) {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const promo = promotionOf(game, f)
  const mine = promo?.isPlayer
  return (
    <tr className={`row${mine ? ' mine' : ''}`} onClick={() => navigate('fighter', f.id)} tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') navigate('fighter', f.id) }}>
      <td>
        <div className="fighter-cell">
          <Avatar f={f} />
          <div>
            <div className="fighter-name">{fighterName(f)} <Flag code={f.nationality} /></div>
            <div className="fighter-sub">{f.nickname ? `“${f.nickname}” · ` : ''}{f.style} · {f.stance}</div>
          </div>
        </div>
      </td>
      <td>{weightClassLabel(f.weightClass)}</td>
      <td className="r num">{fighterAge(f, game.today)}</td>
      <td className="num">{recordLabel(f)}</td>
      <td><Rating f={f} /></td>
      <td style={{ minWidth: 90 }}><Meter value={f.popularity} tone="gold" label="Popularity" /></td>
      {showClub && <td className={promo ? '' : 'dim'}>{promo ? promo.name : f.status === 'retired' ? 'Retired' : 'Free agent'}</td>}
    </tr>
  )
}

export function FightersScreen() {
  const game = useGame((s) => s.game)!
  const [tab, setTab] = useState<Tab>('roster')
  const [wc, setWc] = useState<WeightClassId | ''>('')
  const [nat, setNat] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortKey>('rating')
  const [dir, setDir] = useState<1 | -1>(-1)
  const [shown, setShown] = useState(PAGE)

  const roster = playerRoster(game)
  const free = freeAgents(game)
  const all = useMemo(() => Object.values(game.fighters).filter((f) => f.status === 'active'), [game.fighters])

  const base = tab === 'roster' ? roster : tab === 'free' ? free : all
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = base.filter((f) =>
      (!wc || f.weightClass === wc) && (!nat || f.nationality === nat) &&
      (!needle || fighterName(f).toLowerCase().includes(needle) || (f.nickname ?? '').toLowerCase().includes(needle)))
    const val = (f: Fighter): number | string => {
      switch (sort) {
        case 'rating': return fighterRating(f)
        case 'age': return fighterAge(f, game.today)
        case 'popularity': return f.popularity
        case 'record': return f.record.wins - f.record.losses
        case 'name': return f.lastName
      }
    }
    return list.sort((a, b) => {
      const x = val(a), y = val(b)
      const c = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)
      return c * dir || fighterRating(b) - fighterRating(a)
    })
  }, [base, wc, nat, q, sort, dir, game.today])

  const th = (key: SortKey, label: string, cls = '') => (
    <th className={`sortable ${cls}`} onClick={() => { if (sort === key) setDir((d) => (d === 1 ? -1 : 1)); else { setSort(key); setDir(key === 'name' || key === 'age' ? 1 : -1) } }}
      aria-sort={sort === key ? (dir === 1 ? 'ascending' : 'descending') : 'none'}>
      {label}{sort === key ? (dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="display">Fighters</h1>
          <p className="sub">Your gym, the open market, and every professional in the world. Click anyone for their full profile.</p>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {([['roster', 'My Roster', roster.length], ['free', 'Free Agents', free.length], ['all', 'All Fighters', all.length]] as const).map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => { setTab(k); setShown(PAGE) }}>
            {label}<span className="count">{n}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Search name or nickname…" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE) }} aria-label="Search fighters" />
        <select className="select" style={{ maxWidth: 220 }} value={wc} onChange={(e) => { setWc(e.target.value as WeightClassId | ''); setShown(PAGE) }} aria-label="Weight class">
          <option value="">All divisions</option>
          {WEIGHT_CLASSES.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select className="select" style={{ maxWidth: 200 }} value={nat} onChange={(e) => { setNat(e.target.value); setShown(PAGE) }} aria-label="Nationality">
          <option value="">All nations</option>
          {NATIONS.map((n) => <option key={n.key} value={n.key}>{n.name}</option>)}
        </select>
        <span className="dim" style={{ alignSelf: 'center' }}>{rows.length} fighter{rows.length === 1 ? '' : 's'}</span>
      </div>

      {rows.length === 0 ? (
        <p className="empty">{tab === 'roster' ? 'No fighters match. Your roster is empty — signing arrives with scouting in Phase 2.' : 'No fighters match those filters.'}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr>
              {th('name', 'Fighter')}<th>Division</th>{th('age', 'Age', 'r')}{th('record', 'Record')}{th('rating', 'Rating')}{th('popularity', 'Popularity')}<th>Promotion</th>
            </tr></thead>
            <tbody>{rows.slice(0, shown).map((f) => <FighterRow key={f.id} f={f} />)}</tbody>
          </table>
          {rows.length > shown && (
            <div style={{ padding: 16, textAlign: 'center' }}>
              <button className="btn ghost" onClick={() => setShown((n) => n + PAGE)}>Show more ({rows.length - shown} left)</button>
            </div>
          )}
        </div>
      )}
      {tab !== 'roster' && <p className="dim" style={{ marginTop: 14, fontSize: 13 }}>Hidden potential is only revealed for fighters on your roster. Scouting reports arrive in Phase 2 — signing too.</p>}
    </>
  )
}
