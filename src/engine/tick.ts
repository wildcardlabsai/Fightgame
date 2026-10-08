import { cloneState } from './clone'
import { processTier } from './tierProgress'
import { processSponsors } from './sponsors'
import { checkObjectives } from './scenarios'
import { DAYS_PER_WEEK } from './calendar'
import { stateIds } from './ids'
import { driftKnowledge, observeRoster } from './knowledge'
import { fighterName } from './fighters'
import { postMessage } from './messages'
import { processObligations } from './roster'
import { processInjuries } from './fight/injuries'
import { processFights, pruneFights, pruneRetired, resolveFight, fightInvolvesPlayer } from './fights'
import { aiEvents } from './events/ai'
import { processEvents, pruneEvents, runWholeEvent } from './events/events'
import { Rng } from './rng'
import { passiveDiscovery, processScouting } from './scouting'
import { playerRoster } from './selectors'
import { aiReleases, aiRenewals, aiSigning } from './systems/aiMarket'
import { aiFinances } from './systems/aiFinance'
import { processContracts } from './systems/contracts'
import { birthdayMessages, developFighter, updateCondition } from './systems/development'
import { processWeeklyFinance } from './systems/finance'
import { processRetirements, talentIntake } from './systems/world'
import { PASS_EVERY, processMedia } from './media/process'
import { planGrowthMult, processPlans } from './business/plans'
import { processBusiness } from './business/weekly'
import type { GameState } from './types'

export interface TickResult {
  state: GameState
  weeksAdvanced: number
  /** True if the run stopped early because something urgent needs attention. */
  interrupted: boolean
}

/** Advance the world by exactly one week. Pure: returns a new state, never mutates the input. */
export function advanceOneWeek(input: GameState, opts: { media?: boolean } = {}): GameState {
  const state = cloneState(input)
  const rng = new Rng(state.rngState)
  const ids = stateIds(state)

  // A player's fight left unresolved is settled before time moves on (the UI normally stops you first).
  for (const ev of Object.values(state.events)) if (ev.status === 'fightWeek' || ev.status === 'live') runWholeEvent(state, ev)
  for (const fight of Object.values(state.fights)) if (fight.status === 'fightNight') resolveFight(state, fight)

  state.today += DAYS_PER_WEEK

  // 1. Fighters develop and recover.
  for (const f of Object.values(state.fighters)) {
    if (f.status !== 'active') continue
    developFighter(f, state.today, rng, planGrowthMult(state, f))
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
  processInjuries(state)
  processFights(state, rng) // camp, fight week, (AI-run) results
  processEvents(state) // sales, marketing, fight week, AI show nights, settlement
  inactivityNudges(state)
  processRetirements(state, rng)
  talentIntake(state, rng, ids)
  aiEvents(state, rng)
  aiReleases(state, rng)
  aiSigning(state, rng, ids)
  aiFinances(state)
  processObligations(state)
  processPlans(state)
  processBusiness(state)
  processTier(state)
  processSponsors(state)
  for (const o of checkObjectives(state)) {
    postMessage(state, { from: 'Board', category: 'system', priority: 'important', key: `objective-${o.id}`, cooldownWeeks: 9999, subject: 'Objective complete', body: `${o.label}. Well done — the board is impressed. Keep building.`, link: { kind: 'screen', screen: 'dashboard' } })
  }
  if (opts.media !== false && Math.floor((state.today - state.startDay) / 7) % PASS_EVERY === 0) processMedia(state) // the living media world reads this week's results (it never changes them)
  purgeNegotiations(state)
  if (Math.floor((state.today - state.startDay) / 7) % 52 === 51) { pruneFights(state); pruneRetired(state); pruneEvents(state) }

  // 4. Money.
  processWeeklyFinance(state)

  state.rngState = rng.state
  return state
}

/** Fighters on your roster who have been idle too long start to complain (contract: minimum fights per year). */
function inactivityNudges(state: GameState): void {
  for (const c of Object.values(state.contracts)) {
    if (c.promotionId !== state.playerPromotionId) continue
    const f = state.fighters[c.fighterId]
    if (!f || f.activeFightId || f.injury) continue
    const last = f.lastFightDay ?? c.startDay
    const idleWeeks = Math.floor((state.today - last) / 7)
    const allowed = 52 / Math.max(1, c.minFightsPerYear) + 8
    if (idleWeeks > allowed) {
      postMessage(state, {
        from: 'Agent', category: 'fighter', priority: 'important', key: `idle-${f.id}`, cooldownWeeks: 26,
        subject: `${fighterName(f)} wants a fight`,
        body: `${fighterName(f)} has not fought for ${idleWeeks} weeks and the contract promises at least ${c.minFightsPerYear} a year. Their camp is getting restless.`,
        link: { kind: 'fighter', id: f.id },
      })
    }
  }
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
    if (Object.values(state.fights).some((f) => f.status === 'fightNight' && fightInvolvesPlayer(state, f))) { interrupted = true; break }
    const urgentAfter = state.inbox.filter((m) => !m.read && m.priority === 'urgent').length
    if (urgentAfter > urgentBefore && i < weeks - 1) {
      interrupted = true
      break
    }
  }
  return { state, weeksAdvanced: advanced, interrupted }
}
