import { useState } from 'react'
import { useTableViews, type SavedView } from '../../store/tableViews'
import type { FighterFilter } from '../fighterFilters'

const NONE: SavedView[] = []

/** Named views of a table: the filter, the sort and the columns together ("contenders at 154 lb"). Saved on this device. */
export function ViewsMenu({ tableId, defaultCols, sort, dir, filter, onApply }: { tableId: string; defaultCols: string[]; sort: string; dir: 1 | -1; filter: FighterFilter; onApply: (v: SavedView) => void }) {
  const views = useTableViews((s) => s.views[tableId] ?? NONE)
  const cols = useTableViews((s) => s.cols[tableId]) ?? defaultCols
  const save = useTableViews((s) => s.saveView)
  const del = useTableViews((s) => s.deleteView)
  const setCols = useTableViews((s) => s.setCols)
  const [name, setName] = useState('')
  return (
    <details className="col-menu views-menu">
      <summary className="btn small ghost" data-testid="views-menu">Views{views.length ? ` (${views.length})` : ''}</summary>
      <div className="col-menu-pop" role="group" aria-label="Saved views">
        {views.length === 0 && <p className="dim" style={{ margin: 0, fontSize: 13 }}>No saved views yet. Set up filters, sort and columns, then name the view below.</p>}
        {views.map((v) => (
          <div key={v.name} className="view-row">
            <button type="button" className="linkbtn" onClick={() => { setCols(tableId, v.cols); onApply(v) }}>{v.name}</button>
            <button type="button" className="view-del" aria-label={`Delete view ${v.name}`} onClick={() => del(tableId, v.name)}>×</button>
          </div>
        ))}
        <form className="view-save" onSubmit={(e) => { e.preventDefault(); const n = name.trim(); if (!n) return; save(tableId, { name: n.slice(0, 32), cols, sort, dir, filter }); setName('') }}>
          <input className="input compact" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this view" aria-label="View name" maxLength={32} />
          <button type="submit" className="btn small" disabled={!name.trim()} data-testid="save-view">Save</button>
        </form>
      </div>
    </details>
  )
}
