import type { GameState, Id } from '../types'
import { fighterAge } from '../fighters'

/** Average public reputation of a promotion's best five fighters and how many young winning fighters it has. */
export function rosterAvg(state: GameState, promoId: Id): { rep: number; youngWinners: number } {
  const fs = Object.values(state.contracts).filter((c) => c.promotionId === promoId && c.status === 'active').map((c) => state.fighters[c.fighterId]).filter((f) => f && f.status === 'active')
  const top = fs.slice().sort((a, b) => b.reputation - a.reputation).slice(0, 5)
  const rep = top.length ? top.reduce((n, f) => n + f.reputation, 0) / top.length : 30
  const youngWinners = fs.filter((f) => fighterAge(f, state.today) <= 24 && f.record.wins >= 4 && f.record.wins > f.record.losses * 3).length
  return { rep, youngWinners }
}
