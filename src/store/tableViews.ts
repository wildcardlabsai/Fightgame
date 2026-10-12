/** Remembers, per table, which columns the player chose and the named views they saved (filter + sort + columns). Per device; never part of a career save. */
import { create } from 'zustand'
import { loadJson, saveJson } from '../engine/uiStorage'
import type { FighterFilter } from '../ui/fighterFilters'

export interface SavedView { name: string; cols: string[]; sort: string; dir: 1 | -1; filter: FighterFilter }
interface Persisted { cols: Record<string, string[]>; views: Record<string, SavedView[]> }
const KEY = 'promoter.tableviews.v1'

interface TV extends Persisted {
  setCols: (table: string, cols: string[] | null) => void
  saveView: (table: string, v: SavedView) => void
  deleteView: (table: string, name: string) => void
}
const init = loadJson<Persisted>(KEY, { cols: {}, views: {} })
export const useTableViews = create<TV>((set, get) => {
  const persist = () => { const { cols, views } = get(); saveJson(KEY, { cols, views }) }
  return {
    cols: init.cols ?? {}, views: init.views ?? {},
    setCols: (t, cols) => { const next = { ...get().cols }; if (cols) next[t] = cols; else delete next[t]; set({ cols: next }); persist() },
    saveView: (t, v) => { const list = (get().views[t] ?? []).filter((x) => x.name !== v.name).concat(v).slice(-12); set({ views: { ...get().views, [t]: list } }); persist() },
    deleteView: (t, name) => { set({ views: { ...get().views, [t]: (get().views[t] ?? []).filter((x) => x.name !== name) } }); persist() },
  }
})
