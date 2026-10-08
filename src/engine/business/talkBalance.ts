import { BALANCE } from '../balance'
/** The engine’s own conversation thresholds, re-exported so the talk modules share one source. */
export const B_ = { counterRatio: BALANCE.negotiation.counterRatio, counterMargin: BALANCE.negotiation.counterMargin, acceptRatio: BALANCE.negotiation.acceptRatio }
