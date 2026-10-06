import type { PublicStage } from '../engine/fighters'
import type { FighterView } from '../engine/view'
import type { SortKey } from './components/FighterTable'

export interface FighterFilter {
  q: string
  division: string
  nation: string
  stage: PublicStage | ''
  minRep: number
  minPop: number
  minAge: number
  maxAge: number
  /** '' | 'unbeaten' | 'winning' | '10plus' */
  record: '' | 'unbeaten' | 'winning' | 'veteran'
  contract: '' | 'free' | 'own' | 'rival'
}

export const EMPTY_FILTER: FighterFilter = {
  q: '', division: '', nation: '', stage: '', minRep: 0, minPop: 0, minAge: 16, maxAge: 45, record: '', contract: '',
}

export function applyFilter(rows: FighterView[], f: FighterFilter): FighterView[] {
  const q = f.q.trim().toLowerCase()
  return rows.filter((v) =>
    (!q || v.name.toLowerCase().includes(q) || (v.nickname ?? '').toLowerCase().includes(q) || v.hometown.toLowerCase().includes(q)) &&
    (!f.division || v.weightClass === f.division) && (!f.nation || v.nationKey === f.nation) &&
    (!f.stage || v.stage === f.stage) && v.reputation >= f.minRep && v.popularity >= f.minPop &&
    v.age >= f.minAge && v.age <= f.maxAge &&
    (f.record === '' || (f.record === 'unbeaten' ? v.record.losses === 0 && v.fights > 0 : f.record === 'winning' ? v.record.wins > v.record.losses : v.fights >= 15)) &&
    (f.contract === '' || (f.contract === 'free' ? v.contract.kind === 'none' : v.contract.kind === f.contract)))
}

const askMid = (v: FighterView) => (v.market.askBand.retainerLo + v.market.askBand.retainerHi) / 2

/** Sorts use only the player-visible fields (estimate midpoints, public stats) — never hidden values. */
export function sortRows(rows: FighterView[], key: SortKey, dir: 1 | -1): FighterView[] {
  const val = (v: FighterView): number | string => {
    switch (key) {
      case 'name': return v.lastName
      case 'age': return v.age
      case 'record': return v.record.wins - v.record.losses
      case 'rep': return v.reputation
      case 'pop': return v.popularity
      case 'grade': return v.grade.mid
      case 'ceiling': return v.ceiling.mid
      case 'ask': return askMid(v)
      case 'division': return v.division
    }
  }
  return rows.slice().sort((a, b) => {
    const x = val(a), y = val(b)
    const c = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)
    return c * dir || b.reputation - a.reputation
  })
}
