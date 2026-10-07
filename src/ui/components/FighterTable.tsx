import type { ReactNode } from 'react'
import type { FighterView } from '../../engine/view'
import { useGame } from '../../store/gameStore'
import { money, standingLabel } from '../format'
import { Avatar, Flag, Meter } from './Bits'
import { fighterFallback } from '../../assets/registry'
import { KnowledgePips, RangeText } from './Estimates'

export type ColKey =
  | 'identity' | 'recordBig' | 'style' | 'rank' | 'fighter' | 'division' | 'age' | 'record' | 'stage' | 'rep' | 'pop' | 'grade' | 'ceiling' | 'know' | 'club' | 'ask' | 'tags' | 'actions'

export type SortKey = 'name' | 'age' | 'record' | 'rep' | 'pop' | 'grade' | 'ceiling' | 'ask' | 'division'

const HEAD: Record<ColKey, { label: string; sort?: SortKey; right?: boolean }> = {
  identity: { label: 'Fighter', sort: 'name' }, recordBig: { label: 'Record', sort: 'record' }, style: { label: 'Style' }, rank: { label: 'Rank' },
  fighter: { label: 'Fighter', sort: 'name' }, division: { label: 'Division', sort: 'division' }, age: { label: 'Age', sort: 'age', right: true },
  record: { label: 'Record', sort: 'record' }, stage: { label: 'Stage' }, rep: { label: 'Reputation', sort: 'rep' }, pop: { label: 'Popularity', sort: 'pop' },
  grade: { label: 'Scout grade', sort: 'grade' }, ceiling: { label: 'Ceiling', sort: 'ceiling' }, know: { label: 'Intel' },
  club: { label: 'Status' }, ask: { label: 'Typical ask', sort: 'ask' }, tags: { label: 'Market' }, actions: { label: '' },
}

export function FighterCell({ v }: { v: FighterView }) {
  return (
    <div className="fighter-cell">
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
    <div className="fx-id">
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
    case 'rep': return <div style={{ minWidth: 70 }}><Meter value={v.reputation} tone="gold" label="Reputation" /></div>
    case 'pop': return <div style={{ minWidth: 70 }}><Meter value={v.popularity} tone="gold" label="Popularity" /></div>
    case 'grade': return <span className="num grade-cell"><RangeText r={v.grade} scouted={v.knowledge.reports > 0 || v.own !== null} /></span>
    case 'ceiling': return <span className="num grade-cell"><RangeText r={v.ceiling} scouted={v.knowledge.reports > 0 || v.own !== null} /></span>
    case 'know': return <span className="fx-know"><KnowledgePips level={v.knowledge.level} /><small>{KNOW_TEXT[v.knowledge.level] ?? v.knowledge.level}</small></span>
    case 'club': return <span className={v.contract.kind === 'none' ? 'gold' : 'dim'}>{statusText(v)}</span>
    case 'ask': return <span className="num ask-cell">{money(v.market.askBand.retainerLo, false)}–{money(v.market.askBand.retainerHi, false)}<small className="dim"> /wk</small></span>
    case 'tags': return <span className="dim">{v.market.tags.join(' · ')}</span>
    case 'actions': return actions?.(v)
  }
}

export function FighterTable({ rows, cols, sort, dir, onSort, actions, onOpen, emptyText }: {
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
  if (rows.length === 0) return <p className="empty">{emptyText ?? 'No fighters match.'}</p>
  const open = onOpen ?? ((v: FighterView) => navigate('fighter', v.id))
  return (
    <div className="table-wrap">
      <table className="table stack">
        <thead>
          <tr>
            {cols.map((c) => {
              const h = HEAD[c]
              return (
                <th key={c} className={`${h.sort && onSort ? 'sortable' : ''}${h.right ? ' r' : ''}`} onClick={() => h.sort && onSort?.(h.sort)}
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
  )
}
