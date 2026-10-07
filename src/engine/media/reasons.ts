import { rankingIdentity } from '../../data/mediaIdentity'
import type { RankReason } from './types'

/** Plain-language reason for a ranking movement, built only from the recorded reason code. */
export function reasonText(why: RankReason, from: number | null, to: number | null, nameOf: (id: string) => string | undefined = () => undefined): string {
  const opp = (why.o && nameOf(why.o)) || 'an opponent'
  const ranked = why.or !== undefined && why.or >= 1 ? `#${why.or} ranked ` : why.or === 0 ? 'champion ' : ''
  switch (why.k) {
    case 'beat': return `Defeated ${ranked}${opp}`
    case 'lost': return `Lost to ${ranked}${opp}`
    case 'drew': return `Drew with ${ranked}${opp}`
    case 'inactive': return 'Inactive for too long'
    case 'new': return 'Entered the rankings'
    case 'rose': return 'Moved up as fighters above lost, retired or went inactive'
    case 'fell': return 'Moved down as others passed them'
    case 'title': return 'Reigning champion'
    case 'stripped': return 'Stripped of the title'
    case 'vacated': return 'Left the rankings'
    case 'same': return from === to ? 'Unchanged' : 'Unchanged'
  }
}

export const rankLabel = (r: number | null): string => (r === null ? 'unranked' : r === 0 ? 'champion' : `#${r}`)
export const listName = (id: string): string => rankingIdentity(id).shortName
