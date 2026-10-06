import { DAYS_PER_WEEK } from './calendar'
import { stateIds } from './ids'
import { Rng } from './rng'
import { processContracts } from './systems/contracts'
import { birthdayMessages, developFighter, updateCondition } from './systems/development'
import { processWeeklyFinance } from './systems/finance'
import { aiRosterManagement, processRetirements, talentIntake } from './systems/world'
import type { GameState } from './types'
import { postMessage } from './messages'
import { fighterName } from './fighters'
import { playerRoster } from './selectors'

export interface TickResult {
  state: GameState
  weeksAdvanced: number
  /** True if the run stopped early because something urgent needs attention. */
  interrupted: boolean
}

/** Advance the world by exactly one week. Pure: returns a new state, never mutates the input. */
export function advanceOneWeek(input: GameState): GameState {
  const state = structuredClone(input)
  const rng = new Rng(state.rngState)
  const ids = stateIds(state)

  state.today += DAYS_PER_WEEK

  // 1. Fighters develop and recover.
  for (const f of Object.values(state.fighters)) {
    if (f.status !== 'active') continue
    developFighter(f, state.today, rng)
    updateCondition(f, state.today)
  }
  for (const f of playerRoster(state)) {
    birthdayMessages(state, f)
    if (f.morale < 35) {
      postMessage(state, {
        from: 'Gym', category: 'fighter', priority: 'important', key: `morale-${f.id}`, cooldownWeeks: 10,
        subject: `${fighterName(f)} is struggling`,
        body: `${f.firstName} has been low on morale. A spell on Rest & Recovery training can help.`,
        link: { kind: 'fighter', id: f.id },
      })
    }
  }

  // 2. Contracts, retirements, new talent and rival promotions.
  processContracts(state)
  processRetirements(state, rng)
  talentIntake(state, rng, ids)
  aiRosterManagement(state, rng, ids)

  // 3. Money.
  processWeeklyFinance(state)

  state.rngState = rng.state
  return state
}

/**
 * Advance up to `weeks` weeks, stopping early if a new urgent message arrives
 * so the player never sleeps through a crisis.
 */
export function advanceWeeks(input: GameState, weeks: number): TickResult {
  let state = input
  let advanced = 0
  let interrupted = false
  for (let i = 0; i < weeks; i++) {
    const urgentBefore = state.inbox.filter((m) => !m.read && m.priority === 'urgent').length
    state = advanceOneWeek(state)
    advanced++
    const urgentAfter = state.inbox.filter((m) => !m.read && m.priority === 'urgent').length
    if (urgentAfter > urgentBefore && i < weeks - 1) {
      interrupted = true
      break
    }
  }
  return { state, weeksAdvanced: advanced, interrupted }
}
