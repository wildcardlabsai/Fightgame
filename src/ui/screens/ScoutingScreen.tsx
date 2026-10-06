import { useMemo, useState } from 'react'
import { NATIONS } from '../../data/nations'
import { WEIGHT_CLASSES } from '../../data/weightClasses'
import type { PublicStage } from '../../engine/fighters'
import { opViews, quoteSearch, scoutViews } from '../../engine/quotes'
import type { WeightClassId } from '../../engine/types'
import type { FighterView } from '../../engine/view'
import { useGame } from '../../store/gameStore'
import { useViews } from '../../store/hooks'
import { Avatar, Section } from '../components/Bits'
import { RangeText, TraitRow } from '../components/Estimates'
import { FighterTable, statusText, type SortKey } from '../components/FighterTable'
import { ScoutDialog } from '../components/ScoutDialog'
import { applyFilter, EMPTY_FILTER, sortRows, type FighterFilter } from '../fighterFilters'
import { money } from '../format'

type Tab = 'market' | 'shortlist' | 'ops'
const STAGES: PublicStage[] = ['Debutant', 'Prospect', 'Rising', 'Contender', 'Prime', 'Veteran', 'Declining', 'Journeyman']

export function FilterBar({ f, set, showContract }: { f: FighterFilter; set: (f: FighterFilter) => void; showContract?: boolean }) {
  const up = (p: Partial<FighterFilter>) => set({ ...f, ...p })
  const [open, setOpen] = useState(false)
  const active = [f.division, f.nation, f.stage, f.record, f.contract].filter(Boolean).length + (f.minRep ? 1 : 0) + (f.minPop ? 1 : 0) + (f.minAge > 16 || f.maxAge < 45 ? 1 : 0)
  return (
    <div className={`filters${open ? ' open' : ''}`}>
      <input className="input" placeholder="Search name, nickname, town…" value={f.q} onChange={(e) => up({ q: e.target.value })} aria-label="Search" />
      <button type="button" className="btn small ghost filters-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>Filters{active ? ` (${active})` : ''} {open ? '▴' : '▾'}</button>
      <div className="filters-extra">
        <select className="select" value={f.division} onChange={(e) => up({ division: e.target.value })} aria-label="Division">
          <option value="">All divisions</option>
          {WEIGHT_CLASSES.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select className="select" value={f.nation} onChange={(e) => up({ nation: e.target.value })} aria-label="Nationality">
          <option value="">All nations</option>
          {NATIONS.map((n) => <option key={n.key} value={n.key}>{n.name}</option>)}
        </select>
        <select className="select" value={f.stage} onChange={(e) => up({ stage: e.target.value as PublicStage | '' })} aria-label="Career stage">
          <option value="">Any career stage</option>
          {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="select" value={f.record} onChange={(e) => up({ record: e.target.value as FighterFilter['record'] })} aria-label="Record">
          <option value="">Any record</option><option value="unbeaten">Unbeaten</option><option value="winning">Winning record</option><option value="veteran">15+ fights</option>
        </select>
        {showContract && (
          <select className="select" value={f.contract} onChange={(e) => up({ contract: e.target.value as FighterFilter['contract'] })} aria-label="Contract status">
            <option value="">Any contract status</option><option value="free">Free agent</option><option value="rival">Under contract</option>
          </select>
        )}
        <select className="select compact" value={f.minRep} onChange={(e) => up({ minRep: Number(e.target.value) })} aria-label="Minimum reputation">
          <option value={0}>Any reputation</option><option value={25}>Rep 25+</option><option value={40}>Rep 40+</option><option value={55}>Rep 55+</option>
        </select>
        <select className="select compact" value={f.minPop} onChange={(e) => up({ minPop: Number(e.target.value) })} aria-label="Minimum popularity">
          <option value={0}>Any popularity</option><option value={25}>Pop 25+</option><option value={40}>Pop 40+</option><option value={55}>Pop 55+</option>
        </select>
        <label className="age-range">Age
          <input className="input compact" type="number" min={16} max={45} value={f.minAge} onChange={(e) => up({ minAge: Number(e.target.value) || 16 })} aria-label="Minimum age" />
          –
          <input className="input compact" type="number" min={16} max={45} value={f.maxAge} onChange={(e) => up({ maxAge: Number(e.target.value) || 45 })} aria-label="Maximum age" />
        </label>
        <button className="linkbtn" onClick={() => set(EMPTY_FILTER)}>Reset</button>
      </div>
    </div>
  )
}

export function ScoutingScreen() {
  const game = useGame((s) => s.game)!
  const views = useViews()
  const navigate = useGame((s) => s.navigate)
  const toggleShortlist = useGame((s) => s.toggleShortlist)
  const [tab, setTab] = useState<Tab>('market')
  const [filter, setFilter] = useState<FighterFilter>({ ...EMPTY_FILTER, contract: 'free' })
  const [sort, setSort] = useState<SortKey>('grade')
  const [dir, setDir] = useState<1 | -1>(-1)
  const [shown, setShown] = useState(40)
  const [scouting, setScouting] = useState<string | null>(null)

  const market = useMemo(() => views.known().filter((v) => v.status === 'active' && v.contract.kind !== 'own'), [views])
  const rows = useMemo(() => sortRows(applyFilter(market, filter), sort, dir), [market, filter, sort, dir])
  const shortlist = game.shortlist.map((id) => views.fighter(id)).filter((v): v is FighterView => !!v)
  const ops = opViews(game)
  const activeOps = ops.filter((o) => o.status === 'active')

  const onSort = (k: SortKey) => { if (k === sort) setDir((d) => (d === 1 ? -1 : 1)); else { setSort(k); setDir(k === 'name' || k === 'age' ? 1 : -1) } }

  const actions = (v: FighterView) => (
    <span className="action-row">
      <button className={`star${v.shortlisted ? ' on' : ''}`} onClick={() => toggleShortlist(v.id)} aria-label={v.shortlisted ? 'Remove from shortlist' : 'Add to shortlist'} aria-pressed={v.shortlisted} title="Shortlist">{v.shortlisted ? '★' : '☆'}</button>
      <button className="btn small" onClick={() => setScouting(v.id)}>Scout</button>
      {v.market.signable && <button className="btn small primary" onClick={() => navigate('negotiation', v.id)}>Offer</button>}
    </span>
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="display">Scouting</h1>
          <p className="sub">Everything you see here is what you <i>know</i> — public records plus your scouts’ opinions. Ranges are estimates and can be wrong. Only fighters you have heard of appear; run a talent search to find the rest.</p>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {([['market', 'The Market', market.length], ['shortlist', 'Shortlist & Compare', shortlist.length], ['ops', 'Scouting Desk', activeOps.length]] as const).map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{label}<span className="count">{n}</span></button>
        ))}
      </div>

      {tab === 'market' && (
        <>
          <FilterBar f={filter} set={(f) => { setFilter(f); setShown(40) }} showContract />
          <p className="dim" style={{ marginBottom: 8, fontSize: 13 }}>{rows.length} fighters · “~” marks a rough guess from public information only. Typical ask is what fighters of this standing tend to want; the real number depends on the individual.</p>
          <FighterTable rows={rows.slice(0, shown)} sort={sort} dir={dir} onSort={onSort} actions={actions}
            cols={['fighter', 'division', 'age', 'record', 'rep', 'grade', 'ceiling', 'know', 'club', 'ask', 'actions']} />
          {rows.length > shown && <div style={{ textAlign: 'center', padding: 16 }}><button className="btn ghost" onClick={() => setShown((n) => n + 40)}>Show more ({rows.length - shown} left)</button></div>}
        </>
      )}

      {tab === 'shortlist' && <ShortlistTab shortlist={shortlist} onScout={setScouting} />}
      {tab === 'ops' && <OpsTab />}
      {scouting && <ScoutDialog id={scouting} onClose={() => setScouting(null)} />}
    </>
  )
}

function ShortlistTab({ shortlist, onScout }: { shortlist: FighterView[]; onScout: (id: string) => void }) {
  const navigate = useGame((s) => s.navigate)
  const toggle = useGame((s) => s.toggleShortlist)
  const [picked, setPicked] = useState<string[]>([])
  const cmp = shortlist.filter((v) => picked.includes(v.id))
  if (shortlist.length === 0) return <p className="empty">Your shortlist is empty. Star fighters in The Market to track and compare them.</p>
  const rows: [string, (v: FighterView) => React.ReactNode][] = [
    ['Division', (v) => v.division], ['Age', (v) => v.age], ['Record', (v) => v.recordText], ['Stage', (v) => v.stage],
    ['Status', (v) => statusText(v)], ['Reputation', (v) => v.reputation], ['Popularity', (v) => v.popularity],
    ['Scout grade', (v) => <RangeText r={v.grade} scouted={v.knowledge.reports > 0} />],
    ['Ceiling', (v) => <RangeText r={v.ceiling} scouted={v.knowledge.reports > 0} />],
    ['Intel', (v) => `${v.knowledge.level} · ${v.knowledge.confidence} confidence`],
    ['Typical ask', (v) => `${money(v.market.askBand.retainerLo, false)}–${money(v.market.askBand.retainerHi, false)} /wk`],
  ]
  return (
    <>
      <p className="dim" style={{ marginBottom: 10 }}>Tick up to four fighters to compare them side by side.</p>
      <div className="table-wrap">
        <table className="table stack">
          <thead><tr><th></th><th>Fighter</th><th>Division</th><th>Grade</th><th>Ceiling</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {shortlist.map((v) => (
              <tr key={v.id} className="row" onClick={() => navigate('fighter', v.id)}>
                <td data-label="Compare" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" aria-label={`Compare ${v.name}`} checked={picked.includes(v.id)} disabled={!picked.includes(v.id) && picked.length >= 4}
                    onChange={(e) => setPicked(e.target.checked ? [...picked, v.id] : picked.filter((x) => x !== v.id))} />
                </td>
                <td className="primary" data-label="Fighter"><div className="fighter-cell"><Avatar f={v} /><div><div className="fighter-name">{v.name}</div><div className="fighter-sub">{v.age} · {v.recordText}</div></div></div></td>
                <td data-label="Division">{v.division}</td>
                <td data-label="Grade"><RangeText r={v.grade} scouted={v.knowledge.reports > 0} /></td>
                <td data-label="Ceiling"><RangeText r={v.ceiling} scouted={v.knowledge.reports > 0} /></td>
                <td data-label="Status">{statusText(v)}</td>
                <td className="actions" onClick={(e) => e.stopPropagation()}>
                  <span className="action-row">
                    <button className="btn small" onClick={() => onScout(v.id)}>Scout</button>
                    <button className="linkbtn" onClick={() => toggle(v.id)}>Remove</button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cmp.length >= 2 && (
        <Section title="Side by side">
          <div className="compare" style={{ ['--cols' as string]: cmp.length }}>
            <div className="compare-row compare-head"><div />{cmp.map((v) => <div key={v.id}><div className="fighter-name">{v.name}</div><div className="fighter-sub">{v.division}</div></div>)}</div>
            {rows.map(([label, fn]) => <div className="compare-row" key={label}><div>{label}</div>{cmp.map((v) => <div key={v.id}>{fn(v)}</div>)}</div>)}
            {[...cmp[0].traits.physical, ...cmp[0].traits.technical, ...cmp[0].traits.mental].map((t, i) => (
              <div className="compare-row" key={t.key}><div>{t.name}</div>
                {cmp.map((v) => { const tt = [...v.traits.physical, ...v.traits.technical, ...v.traits.mental][i]; return <div key={v.id}><RangeText r={tt} scouted={tt.scouted} /> <small className="dim">{tt.scouted ? tt.label : ''}</small></div> })}
              </div>
            ))}
          </div>
          <p className="dim" style={{ fontSize: 13, marginTop: 8 }}>Wide or “~” figures mean you do not really know yet — commission reports before spending big.</p>
        </Section>
      )}
      {cmp.length === 1 && <div style={{ marginTop: 18 }}>{cmp[0].traits.physical.map((t) => <TraitRow key={t.key} t={t} />)}</div>}
    </>
  )
}

function OpsTab() {
  const game = useGame((s) => s.game)!
  const orderSearch = useGame((s) => s.orderSearch)
  const scouts = scoutViews(game)
  const ops = opViews(game)
  const [nation, setNation] = useState('')
  const [division, setDivision] = useState('')
  const [level, setLevel] = useState<'regional' | 'wide'>('regional')
  const q = quoteSearch(level)
  const scout = scouts[0]
  const busy = !scout || scout.active >= scout.capacity
  return (
    <div className="grid-2">
      <div>
        <Section title="Talent search">
          <p className="dim" style={{ marginBottom: 12 }}>Send your scout out to find fighters you have never heard of — gyms, small shows, amateur circuits. A better scout finds better names.</p>
          <div className="form-grid">
            <div className="field"><label htmlFor="sn">Where</label>
              <select id="sn" className="select" value={nation} onChange={(e) => setNation(e.target.value)}>
                <option value="">Anywhere</option>{NATIONS.map((n) => <option key={n.key} value={n.key}>{n.name}</option>)}
              </select></div>
            <div className="field"><label htmlFor="sd">Division</label>
              <select id="sd" className="select" value={division} onChange={(e) => setDivision(e.target.value)}>
                <option value="">All divisions</option>{WEIGHT_CLASSES.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select></div>
            <div className="field"><label>Scale</label>
              {(['regional', 'wide'] as const).map((l) => { const x = quoteSearch(l); return (
                <button key={l} type="button" className={`depth-opt${level === l ? ' on' : ''}`} onClick={() => setLevel(l)} aria-pressed={level === l}>
                  <span className="n">{l === 'regional' ? 'Local trawl' : 'Wide search'} <span className="dim" style={{ fontSize: 13 }}>· {x.weeks} weeks · ~{x.found} names</span></span>
                  <span className="p">{money(x.cost, false)}</span>
                </button>) })}
            </div>
            <button className="btn primary" disabled={busy || game.promotions[game.playerPromotionId].cash < q.cost}
              onClick={() => orderSearch({ nation: nation || null, weightClass: (division || null) as WeightClassId | null, level }, scout.id)}>
              {busy ? 'Scout is busy' : `Start search · ${money(q.cost, false)}`}
            </button>
          </div>
        </Section>
        <Section title="Your scouts">
          {scouts.map((s) => (
            <div key={s.id} className="kv-list">
              <div className="fighter-name">{s.name}</div>
              <div className="dim" style={{ fontSize: 13.5 }}>{s.qualityLabel} · {s.experienceLabel} · {s.reportsDone} reports filed · knows {s.regions.join(', ')} · {money(s.weeklyWage, false)}/wk · {s.active}/{s.capacity} assignments</div>
            </div>
          ))}
          <p className="dim" style={{ fontSize: 13, marginTop: 10 }}>Scouts get sharper with experience. Hiring more scouts and specialists arrives with staff management in a later phase.</p>
        </Section>
      </div>
      <Section title="Assignments">
        {ops.length === 0 ? <p className="empty">Nothing commissioned yet. Pick a fighter in The Market and press Scout.</p> : ops.map((o) => (
          <div key={o.id} className="op">
            <div><div className="fighter-name">{o.title}</div><div className="dim" style={{ fontSize: 13 }}>{o.scoutName} · {money(o.cost, false)}</div></div>
            <div className="caps" style={{ alignSelf: 'center' }}>{o.status === 'done' ? 'Done' : `${o.weeksLeft} wk left`}</div>
            {o.status === 'active' ? <div className="progress" style={{ gridColumn: '1 / -1' }}><i style={{ width: `${Math.round(((o.totalWeeks - o.weeksLeft) / Math.max(1, o.totalWeeks)) * 100)}%` }} /></div>
              : <div className="dim" style={{ gridColumn: '1 / -1', fontSize: 13.5 }}>{o.summary}</div>}
          </div>
        ))}
      </Section>
    </div>
  )
}
