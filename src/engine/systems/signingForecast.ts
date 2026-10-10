/**
 * WHAT THIS CONTRACT DOES TO THE BOOKS. A derived, non-persisted forecast for the moment a signing or renewal is about to be agreed. It uses the
 * Finances panel's own inputs (`breakEven`: weekly running costs from the live contracts, completed shows of the last 12 months from the event
 * results) and the actual terms of the offer on the table. Recurring costs (the retainer, every week of the contract) and the immediate payment
 * (the signing bonus, paid today) are kept apart. Nothing here blocks a signing, changes a rule or is stored; it is recomputed from the state each time.
 */
import { weeksBetween } from '../calendar'
import { fighterName } from '../fighters'
import { player, playerRoster, weeklyBurn } from '../selectors'
import type { GameState, Id, NegotiationKind, Offer } from '../types'
import { breakEven, CONFIDENCE_LABEL, type Confidence } from './breakEven'

export interface SigningWarning { id: 'capacity' | 'workingCash' | 'overdrawn' | 'loan'; text: string }
export interface SigningForecast {
  kind: NegotiationKind
  fighter: string
  confidence: Confidence
  confidenceLabel: string
  cash: number
  /** Immediate, one-off: paid today. */
  upfront: number
  cashAfter: number
  weeksOfCostsAfter: number | null
  /** Recurring, per year. */
  runningBefore: number
  retainerOld: number
  retainerNew: number
  runningAfter: number
  debtService: number
  /** Per fight, paid from each show's takings (inside show profit, not inside running costs). */
  purseNote: string
  /** Basis of the show estimate. */
  shows: number
  avgProfit: number | null
  showProfit12m: number
  coveredBefore: boolean | null
  coveredAfter: boolean | null
  neededBefore: number | null
  neededAfter: number | null
  rosterBefore: number
  rosterAfter: number
  summary: string
  assumptions: string[]
  warnings: SigningWarning[]
}

const money = (n: number) => `£${Math.round(Math.abs(n)).toLocaleString('en-GB')}`

export function signingForecast(state: GameState, fighterId: Id, offer: Offer, kind: NegotiationKind): SigningForecast | null {
  const f = state.fighters[fighterId]
  if (!f) return null
  const be = breakEven(state)
  const cash = player(state).cash
  const old = kind === 'renewal' && f.contractId ? state.contracts[f.contractId] : null
  const retainerOld = old && old.promotionId === state.playerPromotionId ? Math.round(old.weeklyRetainer * 52) : 0
  const retainerNew = Math.round(offer.weeklyRetainer * 52)
  const runningBefore = be.annualRunning
  const runningAfter = runningBefore - retainerOld + retainerNew
  const weeklyAfter = runningAfter / 52
  const cashAfter = cash - offer.signingBonus
  const weeksOfCostsAfter = weeklyAfter > 0 ? Math.floor(Math.max(0, cashAfter) / weeklyAfter) : null
  const have = be.confidence !== 'insufficient' // an estimate worth comparing against
  const covered = (annual: number): boolean | null => (have ? be.annualProfit >= annual : null)
  const needed = (annual: number): number | null => (be.avgProfit !== null && be.avgProfit > 0 && have ? annual / be.avgProfit : null)
  const rosterBefore = playerRoster(state).length
  const rosterAfter = kind === 'renewal' ? rosterBefore : rosterBefore + 1

  const warnings: SigningWarning[] = []
  if (cash < offer.signingBonus) {
    warnings.push({ id: 'overdrawn', text: `The ${money(offer.signingBonus)} signing bonus is more than the ${money(cash)} in the bank${cash < 0 ? ' (the account is overdrawn: Finances shows the way back)' : ''}.` })
  } else if (have === false && weeksOfCostsAfter !== null && weeksOfCostsAfter < 12 && offer.signingBonus > 0) {
    warnings.push({ id: 'workingCash', text: `After the ${money(offer.signingBonus)} bonus you would hold ${money(cashAfter)}: about ${weeksOfCostsAfter} weeks of running costs, and no show history yet to say how fast that refills.` })
  } else if (weeksOfCostsAfter !== null && weeksOfCostsAfter < 12 && (offer.signingBonus > 0 || retainerNew > retainerOld)) {
    warnings.push({ id: 'workingCash', text: `After the ${money(offer.signingBonus)} bonus you would hold ${money(cashAfter)}: about ${weeksOfCostsAfter} weeks of running costs.` })
  }
  const added = retainerNew - retainerOld
  if (have && added > 0 && runningAfter > be.annualProfit && (be.annualProfit >= runningBefore || added >= runningBefore * 0.1)) {
    const short = runningAfter - be.annualProfit
    warnings.push({
      id: 'capacity',
      text: be.annualProfit >= runningBefore
        ? `The last ${be.shows} shows earned ${money(be.annualProfit)}, enough for today's ${money(runningBefore)} of running costs. After this contract they are ${money(runningAfter)}: ${money(short)} more than those shows earned.`
        : `Running costs are already ${money(runningBefore - be.annualProfit)} above what the last ${be.shows} shows earned. This contract adds ${money(added)} a year, making it ${money(short)}.`,
    })
  }
  if (be.debtService > 0 && be.debtService >= runningBefore * 0.25 && added > 0) {
    warnings.push({ id: 'loan', text: `Bridge-loan instalments (${money(be.debtService)} a year) already make up ${Math.round((be.debtService / runningBefore) * 100)}% of running costs; this contract adds ${money(added)} more.` })
  }

  const summary =
    !have ? 'No reliable show history yet, so there is no estimate of how many shows this roster needs.'
    : covered(runningAfter) ? `Recent show profit (${money(be.annualProfit)} from ${be.shows} shows) would still cover running costs of ${money(runningAfter)} after this contract.`
    : needed(runningAfter) === null ? 'Recent shows are not making money, so no number of them would cover the running costs.'
    : `At the recent average (${money(be.avgProfit ?? 0)} a show) about ${Math.ceil(needed(runningAfter)!)} shows a year would cover running costs after this contract, against ${be.shows} in the last 12 months.`

  const assumptions = [
    `Running costs are the weekly costs you pay now (overhead, retainers, scouts, coaching and any loan instalment) times 52, with this contract's retainer ${kind === 'renewal' ? 'replacing the current one' : 'added'}.`,
    have ? `Show income is what your last ${be.shows} completed shows earned after their own costs; it is history, not a promise, and a different card or venue earns something different.` : 'Fewer than three completed shows in the last year, or under half a year of history: too little to estimate show income.',
    ...(be.confidence === 'early' ? ['Fewer than six shows is a small sample: treat the estimate as rough.'] : []),
    'The signing bonus is paid from cash today. The retainer is paid every week of the contract whether or not he fights.',
  ]
  void weeksBetween; void weeklyBurn
  return {
    kind, fighter: fighterName(f), confidence: be.confidence, confidenceLabel: CONFIDENCE_LABEL[be.confidence], cash, upfront: offer.signingBonus, cashAfter, weeksOfCostsAfter,
    runningBefore, retainerOld, retainerNew, runningAfter, debtService: be.debtService,
    purseNote: `${money(offer.basePurse)} a fight${offer.winBonus ? ` plus ${money(offer.winBonus)} for a win` : ''}, paid from each show's takings; at least ${offer.minFightsPerYear} fight${offer.minFightsPerYear === 1 ? '' : 's'} a year are promised.`,
    shows: be.shows, avgProfit: be.avgProfit, showProfit12m: be.annualProfit, coveredBefore: covered(runningBefore), coveredAfter: covered(runningAfter), neededBefore: needed(runningBefore), neededAfter: needed(runningAfter),
    rosterBefore, rosterAfter, summary, assumptions, warnings: warnings.slice(0, 3),
  }
}
