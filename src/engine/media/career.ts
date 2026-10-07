/** CAREER STORY. A short, permanent timeline per fighter built only from things that really happened to them in this game. */
import type { Day, GameState, Id } from '../types'
import { getCareer, pushCareer } from './records'
import type { CareerEntry, MediaState } from './types'

export function addCareer(media: MediaState, id: Id, e: CareerEntry): void {
  const cur = getCareer(media, id)
  if (cur.some((x) => x.k === e.k && x.d === e.d && x.a === e.a && x.n === e.n)) return
  if ((e.k === 'RANKED' || e.k === 'TOP5' || e.k === 'NO1') && cur.some((x) => x.k === e.k && x.a === e.a)) return
  pushCareer(media, id, e)
}

export const careerOf = (media: MediaState, id: Id): readonly CareerEntry[] => getCareer(media, id)

/** Entries for the fighters still on the books at the start of the game: where they stood, not an invented past. */
export function seedCareers(state: GameState, media: MediaState): void {
  for (const f of Object.values(state.fighters)) {
    if (f.status !== 'active') continue
    const total = f.record.wins + f.record.losses + f.record.draws
    if (total === 0) continue
    if (f.popularity >= 35 || f.reputation >= 40 || state.contracts[f.contractId ?? '']?.promotionId === state.playerPromotionId) {
      addCareer(media, f.id, { d: state.today as Day, k: 'START', a: `${f.record.wins}-${f.record.losses}-${f.record.draws}`, n: total })
    }
  }
}
