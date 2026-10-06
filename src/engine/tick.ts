import { DAYS_PER_WEEK } from './calendar'
import { stateIds } from './ids'
import { driftKnowledge, observeRoster } from './knowledge'
import { fighterName } from './fighters'
import { postMessage } from './messages'
import { processObligations } from './roster'
import { Rng } from './rng'
import { passiveDiscovery, processScouting } from './scouting'
import { playerRoster } from './selectors'
import { aiFinances, aiReleases, aiRenewals, aiSigning } from './systems/aiMarket'
import { processContracts } from './systems/contracts'
import { birthdayMessages, developFighter, updateCondition } from './systems/development'
import { processWeeklyFinance } from './systems/finance'
import { processRetirements, talentIntake } from './systems/world'
import type { GameState } from './types'

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
    observeRoster(state, f) // the gym learns about its own fighters
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
  driftKnowledge(state) // old information goes stale

  // 2. Scouting finishes; word reaches you.
  processScouting(state, rng)
  passiveDiscovery(state, rng)

  // 3. The market moves: rivals decide on renewals first, then contracts close, people retire, new talent arrives,
  //    rivals release and then bid on whoever is free.
  aiRenewals(state, rng, ids)
  processContracts(state)
  processRetirements(state, rng)
  talentIntake(state, rng, ids)
  aiReleases(state, rng)
  aiSigning(state, rng, ids)
  aiFinances(state)
  processObligations(state)
  purgeNegotiations(state)

  // 4. Money.
  processWeeklyFinance(state)

  state.rngState = rng.state
  return state
}

/** Drop stale negotiations (talks that went quiet, or lockouts that have ended). */
function purgeNegotiations(state: GameState): void {
  for (const [fid, n] of Object.entries(state.negotiations)) {
    const f = state.fighters[fid]
    const stale = state.today - (n.rounds[n.rounds.length - 1]?.day ?? n.openedDay) > 42
    if (!f || f.status !== 'active' || (n.status === 'open' && stale)) delete state.negotiations[fid]
    else if (n.status === 'broken' && (n.lockedUntil ?? 0) <= state.today) delete state.negotiations[fid]
    else if (n.kind === 'signing' && f.contractId) delete state.negotiations[fid]
  }
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
