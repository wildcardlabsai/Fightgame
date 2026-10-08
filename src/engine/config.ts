/**
 * Feature flags tied to the development roadmap. Systems that depend on
 * not-yet-built features are switched off here rather than faked.
 */
export const FEATURES = {
  /** Phase 3: once fights exist, fighter inactivity should hurt morale and popularity. */
  fightsImplemented: true,
  /** Phase 5.4: titles exist, so title-shot promises are enforced (see roster.processObligations and business/commitments). */
  titlesImplemented: true,
}

export const WEEKLY_COSTS = {
  office: 1_200,
  staff: 1_500,
  gym: 700,
  insurance: 350,
}

export const MAX_LEDGER = 600
export const MAX_FINANCE_HISTORY = 156
export const MAX_INBOX = 300
export const MAX_NEWS = 150
