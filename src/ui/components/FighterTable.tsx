import { useMemo, type ReactNode } from 'react'
import { useTableViews } from '../../store/tableViews'
import { Delta } from './Delta'
import { useDelta } from '../../store/trends'
import { StatusStrip } from './StatusStrip'
import type { FighterView } from '../../engine/view'
import { useGame } from '../../store/gameStore'
import { money, standingLabel } from '../format'
import { Avatar, Flag, Meter } from './Bits'
import { fighterFallback } from '../../assets/registry'
import { KnowledgePips, RangeText } from './Estimates'
import { FormDots } from './FightBits'
import { STAGE_LABEL } from '../../engine/systems/contracts'

export type ColKey =
  | 'identity' | 'recordBig' | 'style' | 'rank' | 'fighter' | 'division' | 'age' | 'record' | 'stage' | 'rep' | 'pop' | 'grade' | 'ceiling' | 'know' | 'club' | 'ask' | 'tags' | 'condition' | 'form' | 'star' | 'mytags' | 'status' | 'actions'

export type SortKey = 'name' | 'age' | 'record' | 'rep' | 'pop' | 'grade' | 'ceiling' | 'ask' | 'division' | 'rank'

const HEAD: Record<ColKey, { label: string; sort?: SortKey; right?: boolean }> = {
  identity: { label: 'Fighter', sort: 'name' }, recordBig: { label: 'Record', sort: 'record' }, style: { label: 'Style' }, rank: { label: 'Rank', sort: 'rank' }, star: { label: '★' }, mytags: { label: 'My tags' }, status: { label: 'Status' },
  fighter: { label: 'Fighter', sort: 'name' }, division: { label: 'Division', sort: 'division' }, age: { label: 'Age', sort: 'age', right: true },
  record: { label: 'Record', sort: 'record' }, stage: { label: 'Stage' }, rep: { label: 'Reputation', sort: 'rep' }, pop: { label: 'Popularity', sort: 'pop' },
  grade: { label: 'Scout grade', sort: 'grade' }, ceiling: { label: 'Ceiling', sort: 'ceiling' }, know: { label: 'Intel' },
  club: { label: 'Status' }, condition: { label: 'Condition' }, form: { label: 'Form' }, ask: { label: 'Typical ask', sort: 'ask' }, tags: { label: 'Market' }, actions: { label: '' },
}

/** Plain-language meaning of the column heads that carry jargon (shown on hover or focus). */
const TIP: Partial<Record<ColKey, string>> = {
  grade: 'Your scouts’ estimate of how good the fighter is now. A range, because scouting is never certain; “~” means a guess from public information.',
  ceiling: 'Your scouts’ estimate of how good the fighter could become. Younger fighters have more room to grow.',
  know: 'How well you know this fighter, from rumours up to a full file. Scouting raises it and narrows the ranges.',
  rank: 'Their place on a published ranking where one exists. Rankings come from the sanctioning bodies and media, not from your scouts.',
  form: 'Their last results, oldest to newest.', condition: 'Whether they can fight now, and any contract that needs attention.',
  ask: 'What fighters of this standing usually want per week. The real number depends on the individual.', rep: 'How respected they are in the sport.', pop: 'How well known they are with fans.',
  status: 'Condition, form, contract (yours) and title standing at a glance.', club: 'Who holds their contract, or that they are a free agent.', stage: 'Where they are in their career, from public facts.',
}

export function FighterCell({ v }: { v: FighterView }) {
  return (
    <div className="fighter-cell" data-fighter-id={v.id}>
      <Avatar f={v} />
      <div>
        <div className="fighter-name">{v.name} <Flag code={v.nationKey} /></div>
        <div className="fighter-sub">{v.nickname ? `“${v.nickname}” · ` : ''}{v.stage} · {v.style}</div>
      </div>
    </div>
  )
}

/** Database-style identity cell: strong name, nickname and nationality under it. */
export function FighterIdentity({ v }: { v: FighterView }) {
  return (
    <div className="fx-id" data-fighter-id={v.id}>
      <Avatar f={v} />
      <div className="fx-text">
        <div className="fx-name">{v.firstName} <b>{v.lastName}</b></div>
        <div className="fx-sub">{v.nickname ? <span className="fx-nick">“{v.nickname}”</span> : null}<Flag code={v.nationKey} /><span>{v.nationName}</span></div>
      </div>
    </div>
  )
}

const KNOW_TEXT: Record<string, string> = { Unknown: 'Unknown', Rumour: 'Rumours', Basic: 'Basic file', Detailed: 'Detailed', Comprehensive: 'Full file' }

export function statusText(v: FighterView): string {
  if (v.status === 'retired') return 'Retired'
  if (v.contract.kind === 'own') return 'Your roster'
  if (v.contract.kind === 'rival') return v.contract.promotionName
  return v.market.tags[0] ?? 'Free agent'
}

function cell(v: FighterView, c: ColKey, actions?: (v: FighterView) => ReactNode): ReactNode {
  switch (c) {
    case 'identity': return <FighterIdentity v={v} />
    case 'recordBig': return <div className="fx-rec"><span className="num">{v.recordText}</span><small>{v.record.koWins} KO{v.record.koWins === 1 ? '' : 's'}{v.fights ? ` · ${v.koRate}%` : ''}</small></div>
    case 'style': return <span className="fx-style">{v.style}</span>
    case 'rank': {
      if (v.mediaRank.rank !== null) return <span className={`fx-rank num${v.mediaRank.rank === 0 ? ' champ' : ''}`} title={v.mediaRank.title}>{v.mediaRank.text}</span>
      const st = standingLabel(v.standing)
      return <span className={`fx-rank${v.standing.rank > 0 ? ' num dim' : ' dim'}`} title={st.title}>{v.standing.rank > 0 ? `~${st.text}` : st.text}</span>
    }
    case 'division': return <span className="fx-div" style={{ ['--hue' as string]: fighterFallback(v).hue }}>{v.division}</span>
    case 'fighter': return <FighterCell v={v} />
    case 'age': return <span className="num">{v.age}</span>
    case 'record': return <span className="num">{v.recordText}</span>
    case 'stage': return v.stage
    case 'rep': return <div style={{ minWidth: 70 }}><Meter value={v.reputation} tone="gold" label="Reputation" />{v.own !== null && <FighterDelta id={v.id} i={0} now={v.reputation} />}</div>
    case 'pop': return <div style={{ minWidth: 70 }}><Meter value={v.popularity} tone="gold" label="Popularity" />{v.own !== null && <FighterDelta id={v.id} i={1} now={v.popularity} />}</div>
    case 'grade': return <span className="num grade-cell"><RangeText r={v.grade} scouted={v.knowledge.reports > 0 || v.own !== null} /></span>
    case 'ceiling': return <span className="num grade-cell"><RangeText r={v.ceiling} scouted={v.knowledge.reports > 0 || v.own !== null} /></span>
    case 'know': return <span className="fx-know"><KnowledgePips level={v.knowledge.level} /><small>{KNOW_TEXT[v.knowledge.level] ?? v.knowledge.level}</small></span>
    case 'club': return <span className={v.contract.kind === 'none' ? 'gold' : 'dim'}>{statusText(v)}</span>
    case 'ask': return <span className="num ask-cell">{money(v.market.askBand.retainerLo, false)}–{money(v.market.askBand.retainerHi, false)}<small className="dim"> /wk</small></span>
    case 'condition': {
      // Public facts only: availability and the contract's stage, both already shown on the fighter's profile.
      const av = v.availability
      const bad = av.status !== 'available'
      const c = v.contract.kind === 'own' ? v.contract : null
      return <span className="fx-cond"><b className={bad ? 'warn' : 'good'}>{av.label}{av.weeks ? ` · ${av.weeks}w` : ''}</b>{c && c.stage !== 'healthy' && <small className={`fx-contract ${c.stage}`}>{STAGE_LABEL[c.stage]} · {c.weeksLeft}w</small>}{c && c.stage === 'healthy' && <small className="dim">{c.weeksLeft} wk contract</small>}</span>
    }
    case 'form': return <FormDots form={v.form} />
    case 'star': return <StarButton v={v} />
    case 'mytags': return <span className="my-tags">{v.myTags.map((t) => <span key={t} className="chip tag-chip">{t}</span>)}{v.myNote && <span className="note-dot" title={v.myNote}>✎</span>}</span>
    case 'status': return <StatusStrip v={v} compact />
    case 'tags': return <span className="dim">{v.market.tags.join(' · ')}</span>
    case 'actions': return actions?.(v)
  }
}

function FighterDelta({ id, i, now }: { id: string; i: 0 | 1; now: number }) {
  const d = useDelta((s) => s.roster[id]?.[i], Math.round(now))
  return <Delta d={d} />
}

function StarButton({ v }: { v: FighterView }) {
  const toggle = useGame((s) => s.toggleShortlist)
  return <button type="button" className={`star-btn${v.shortlisted ? ' on' : ''}`} aria-pressed={v.shortlisted} aria-label={`${v.shortlisted ? 'Remove' : 'Add'} ${v.name} ${v.shortlisted ? 'from' : 'to'} the shortlist`} title={v.shortlisted ? 'On your shortlist' : 'Add to shortlist'} onClick={(e) => { e.stopPropagation(); toggle(v.id) }}>{v.shortlisted ? '★' : '☆'}</button>
}

/** Columns the player may switch on and off (the first column and the action column are fixed). */
function ColumnMenu({ tableId, current, available, defaults }: { tableId: string; current: ColKey[]; available: ColKey[]; defaults: ColKey[] }) {
  const set = useTableViews((s) => s.setCols)
  const fixed = (c: ColKey) => c === 'identity' || c === 'fighter' || c === 'actions'
  const toggle = (c: ColKey) => {
    const next = current.includes(c) ? current.filter((x) => x !== c) : available.filter((x) => current.includes(x) || x === c)
    set(tableId, next)
  }
  return (
    <details className="col-menu">
      <summary className="btn small ghost" data-testid="column-menu">Columns</summary>
      <div className="col-menu-pop" role="group" aria-label="Choose columns">
        {available.filter((c) => !fixed(c)).map((c) => <label key={c}><input type="checkbox" checked={current.includes(c)} onChange={() => toggle(c)} /> {HEAD[c].label || (c === 'star' ? 'Shortlist star' : c)}</label>)}
        <button type="button" className="btn small ghost" onClick={() => set(tableId, null)} disabled={current.join('|') === defaults.join('|')}>Reset to default</button>
      </div>
    </details>
  )
}

export function FighterTable({ rows, cols: defaultCols, sort, dir, onSort, actions, onOpen, emptyText, stickyHead, tableId, available, toolbar }: {
  /** Lets the player choose columns (remembered per device) and save views. Needs `available`. */
  tableId?: string
  available?: ColKey[]
  /** Extra controls shown beside the column chooser (the saved-views menu). */
  toolbar?: ReactNode
  /** Keep the column headers under the page header while scrolling (desktop). Only for column sets that fit the page width: it stops the table scrolling sideways. */
  stickyHead?: boolean
  rows: FighterView[]
  cols: ColKey[]
  sort?: SortKey
  dir?: 1 | -1
  onSort?: (k: SortKey) => void
  actions?: (v: FighterView) => ReactNode
  onOpen?: (v: FighterView) => void
  emptyText?: string
}) {
  const navigate = useGame((s) => s.navigate)
  const chosen = useTableViews((s) => (tableId ? s.cols[tableId] : undefined))
  const cols = useMemo(() => {
    if (!tableId || !available || !chosen) return defaultCols
    const valid = chosen.filter((c): c is ColKey => (available as string[]).includes(c))
    const first: ColKey[] = defaultCols.filter((c) => c === 'identity' || c === 'fighter'), last: ColKey[] = defaultCols.filter((c) => c === 'actions')
    return [...first, ...available.filter((c) => valid.includes(c) && !first.includes(c) && c !== 'actions'), ...last]
  }, [tableId, available, chosen, defaultCols])
  if (rows.length === 0) return <p className="empty">{emptyText ?? 'No fighters match.'}</p>
  const open = onOpen ?? ((v: FighterView) => navigate('fighter', v.id))
  return (
    <>
    {tableId && available && <div className="table-tools">{toolbar}<ColumnMenu tableId={tableId} current={cols} available={available} defaults={defaultCols} /></div>}
    <div className={`table-wrap${stickyHead ? ' sticky-head' : ''}${cols.includes('actions') ? ' sticky-actions' : ''}`}>
      <table className="table stack">
        <thead>
          <tr>
            {cols.map((c) => {
              const h = HEAD[c]
              return (
                <th key={c} title={TIP[c]} data-tip={TIP[c] ? '1' : undefined} className={`${h.sort && onSort ? 'sortable' : ''}${h.right ? ' r' : ''}`} onClick={() => h.sort && onSort?.(h.sort)}
                  aria-sort={h.sort && sort === h.sort ? (dir === 1 ? 'ascending' : 'descending') : undefined}>
                  {h.label}{h.sort && sort === h.sort ? (dir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id} className={`row${v.own ? ' mine' : ''}`} tabIndex={0} onClick={() => open(v)}
              onKeyDown={(e) => { if (e.key === 'Enter') open(v) }}>
              {cols.map((c) => (
                <td key={c} data-label={HEAD[c].label} className={`${c === 'fighter' ? 'primary' : ''}${c === 'actions' ? ' actions' : ''}${HEAD[c].right ? ' r' : ''}`}
                  onClick={c === 'actions' ? (e) => e.stopPropagation() : undefined}>
                  {cell(v, c, actions)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  )
}
