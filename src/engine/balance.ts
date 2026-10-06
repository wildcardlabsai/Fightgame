import type { PromotionTier, ScoutDepth } from './types'

/**
 * Central balance sheet. Every tunable number for Phase 2 systems lives here —
 * UI and engine code must reference these rather than hard-coding values.
 */
export const BALANCE = {
  scouting: {
    /** Base report price in £ before fighter-level and scout-rate multipliers. */
    reportBase: { basic: 400, standard: 1_200, deep: 3_000 } as Record<ScoutDepth, number>,
    reportWeeks: { basic: 1, standard: 2, deep: 4 } as Record<ScoutDepth, number>,
    /** Observation noise (sd, rating points) per depth, before multipliers. */
    obsSd: { basic: 11, standard: 7.5, deep: 4.5 } as Record<ScoutDepth, number>,
    /** Insight into personality gained per report. */
    insightGain: { basic: 10, standard: 30, deep: 60 } as Record<ScoutDepth, number>,
    /** Which depth first covers each trait group. */
    physicalTraits: ['power', 'speed', 'stamina', 'chin', 'defence', 'aggression'] as const,
    technicalTraits: ['ringIQ', 'adaptability', 'heart', 'marketability'] as const,
    mentalTraits: ['discipline', 'composure'] as const,
    /** Potential is deliberately harder to read at every depth. */
    potentialSdMult: { basic: 3.2, standard: 2.1, deep: 1.5 } as Record<ScoutDepth, number>,
    traitSdMult: { physical: 0.9, technical: 1.0, mental: 1.25 },
    /** Report price multiplier by fighter public level (reputation 0–100): low → high. */
    levelPriceMin: 0.7,
    levelPriceMax: 2.3,
    /** Price multiplier for an expensive (high-quality) scout. */
    scoutRatePriceMin: 0.8,
    scoutRatePriceMax: 1.4,
    maxActivePerScout: 2,
    /** Priors: how unsure the player is about a fighter before any scouting. */
    priorSd: 17,
    priorSdPotential: 20,
    minSd: 1.6,
    /** Per-week growth of uncertainty (stale information fades). */
    weeklyDrift: 0.35,
    /** Weekly passive observation of players' own fighters (training-camp watching). */
    rosterObsSd: 16,
    rosterObsPotentialSd: 30,
    /** Displayed range = mean ± this many sd, min total width. */
    rangeZ: 1.5,
    minRangeWidth: 4,
    search: {
      regional: { cost: 2_500, weeks: 2, found: 3 },
      wide: { cost: 6_500, weeks: 3, found: 6 },
    },
    /** Weekly chance a notable undiscovered fighter comes to your attention for free. */
    passiveDiscoveryChance: 0.1,
    /** Starting scout. */
    startingScout: { quality: 46, experience: 4, weeklyWage: 450 },
  },

  market: {
    /** Visibility (max of reputation/popularity) at/above which a fighter is "known" at game start. */
    publicVisibility: 26,
    homeRegionVisibility: 12,
    /** Weekly ask for a fighter of market value 0–100: min + (mv/100)^exp * span. */
    retainer: { min: 70, span: 4_800, exp: 2.2 },
    purse: { min: 1_500, span: 135_000, exp: 3.0 },
    signingBonusOfPurse: 0.3,
    winBonusOfPurse: 0.1,
    /** Width of the public "expectation band" shown while browsing. */
    askBandLow: 0.78,
    askBandHigh: 1.3,
    /** Maximum roster size by promotion tier. */
    rosterCap: { Startup: 10, Regional: 22, National: 28, Major: 32, Global: 36 } as Record<PromotionTier, number>,
    /** Ageing: market value multiplier from this age. */
    ageDiscount: [
      { age: 33, mult: 0.9 }, { age: 35, mult: 0.78 }, { age: 37, mult: 0.62 },
    ],
    recentWeeks: 12,
  },

  negotiation: {
    acceptRatio: 1.0,
    counterRatio: 0.82,
    counterMargin: 1.02,
    startingPatience: {
      Professional: 4, Humble: 4, Loyal: 4, Quiet: 3, Ambitious: 3, Showman: 3, Greedy: 3, Fragile: 3, Arrogant: 2, Volatile: 2,
    } as Record<string, number>,
    /** Required value ratio (offer ÷ ask) per personality. */
    threshold: {
      Professional: 0.98, Humble: 0.95, Loyal: 0.93, Quiet: 0.98, Ambitious: 1.0, Showman: 1.0,
      Greedy: 1.07, Fragile: 0.97, Arrogant: 1.05, Volatile: 1.0,
    } as Record<string, number>,
    /** Ask multipliers per personality (money-focused fighters ask more, etc.). */
    askMult: {
      Professional: 1, Humble: 0.95, Loyal: 1, Quiet: 0.98, Ambitious: 1.03, Showman: 1.05,
      Greedy: 1.18, Fragile: 0.98, Arrogant: 1.1, Volatile: 1,
    } as Record<string, number>,
    lockWeeks: 12,
    /** Fighters of this reputation or more refuse promotions below the floor outright. */
    eliteReputation: 72,
    eliteMinPromotionRep: 28,
    /** Premium (fraction of ask per rep point) when the promotion is smaller than the fighter. */
    prestigePremiumPerPoint: 0.006,
    prestigeDiscountPerPoint: 0.002,
    /** How much a title promise is worth as a fraction of ask value (halved until titles exist). */
    titlePromiseValue: { Ambitious: 0.12, Arrogant: 0.08, Showman: 0.05, default: 0.04 } as Record<string, number>,
    titlePromiseDiscount: 0.5,
    relationValuePerPoint: 0.001,
    maxYears: 5,
    maxFights: 14,
  },

  release: {
    /** Standard release fee as a fraction of remaining guaranteed purses. */
    purseFraction: 0.5,
    /** …plus this many weeks of retainer. */
    retainerWeeks: 8,
    repPenalty: 0.4,
    repPenaltyPopular: 1.0,
    popularThreshold: 50,
    relationHit: -30,
    rosterMoraleHit: 2,
    rosterMoraleHitSensitive: 5,
  },

  contracts: {
    /** Renewal stage boundaries in weeks remaining. */
    approachingWeeks: 26,
    windowWeeks: 16,
    expiringWeeks: 8,
  },

  ai: {
    /** Abstract weekly income by tier (AI finances are not modelled until Phase 6). */
    weeklyIncome: { Startup: 0, Regional: 25_000, National: 120_000, Major: 480_000, Global: 1_600_000 } as Record<PromotionTier, number>,
    /** Appraisal noise (sd) by tier — better promotions scout better. */
    appraisalSd: { Startup: 14, Regional: 12, National: 9, Major: 6, Global: 4 } as Record<PromotionTier, number>,
    signChance: 0.55,
    urgentSignChance: 0.9,
    /** Max weekly purse a promotion of this tier will agree to. */
    maxPurse: { Startup: 15_000, Regional: 25_000, National: 70_000, Major: 160_000, Global: 400_000 } as Record<PromotionTier, number>,
    renewChance: 0.7,
    releaseChance: 0.04,
    targetRating: { Startup: 35, Regional: 44, National: 54, Major: 64, Global: 72 } as Record<PromotionTier, number>,
    rosterTarget: { Startup: 8, Regional: 18, National: 24, Major: 28, Global: 30 } as Record<PromotionTier, number>,
  },

  condition: {
    /** Display bands for own-roster condition (0–100). */
    bands: [
      { max: 30, label: 'Poor' }, { max: 50, label: 'Low' }, { max: 70, label: 'Fair' }, { max: 85, label: 'Good' }, { max: 101, label: 'Excellent' },
    ],
  },

  /**
   * FIGHT SIMULATION (Phase 3). All values here are tuning assumptions — see docs/BALANCE.md.
   * Scales: attributes are normalised to 0–1 before use; "damage" is in abstract units where a fighter's
   * chin capacity is roughly 120–290.
   */
  sim: {
    segments: 3,
    /** Punches thrown per one-minute segment by an average fighter. */
    baseThrow: 21,
    nightFormSd: 0.095,
    landBase: 0.27,
    landSpread: 0.34,
    powerLandMult: 0.82,
    jabLandMult: 1.12,
    jabDamage: 0.3,
    powerDamageBase: 0.6,
    powerDamageScale: 1.45,
    bigFracBase: 0.04,
    bigFracScale: 0.12,
    kd: { intercept: -4.95, dmg: 3.6, power: 2.8, fatigue: 1.1, hurt: 1.3, momentum: 0.5 },
    kdDamageOfCapacity: 0.16,
    chinBase: 135,
    chinScale: 190,
    damageDecayPerRound: 0.09,
    drainPerSegment: 0.021,
    recoverPerRound: 0.03,
    momentumInertia: 0.55,
    judgeNoise: 2.5,
    judgeVolumeBias: 0.18,
    evenRoundThreshold: 0.9,
    foulPerRound: 0.012,
    injuryStoppagePerRound: 0.0016,
    homeLandBonus: 0.012,
    homeJudgeBias: 0.55,
    /** Rounds scheduled by experience / profile. */
    adaptRate: 0.07,
  },

  fights: {
    minNoticeWeeks: 4,
    maxAheadWeeks: 40,
    campWeeks: 4,
    /** Minimum weeks of rest after a bout (plus damage-dependent extra). */
    restWeeks: 6,
    negotiationLockWeeks: 8,
    maxTwoFightGapWeeks: 26,
    /** Medical suspension (weeks) after stoppages. */
    suspension: { KO: 8, TKO: 5, RTD: 4, INJ: 4 } as Record<string, number>,
    injury: {
      base: 0.03, perDamage: 0.09, perKnockdown: 0.04, perAgeOver30: 0.0025, riskMult: 0.8,
      severity: { minor: 0.62, moderate: 0.28, serious: 0.1 },
      weeks: { minor: [1, 3], moderate: [4, 12], serious: [13, 52] } as Record<string, [number, number]>,
      campWeekly: 0.0035,
    },
    keepRoundsForAi: false,
    /** AI fights older than this (years) are pruned from state if not on any recent list. */
    pruneYears: 3,
    ai: { perPromoPerWeek: 0.6, rosterPerAttempt: 8, maxOpenShare: 0.4, minWeeksNotice: 6, maxWeeksNotice: 14, journeymanPurseFactor: 0.5, freeAgentChance: 0.22 },
    recentListSize: 12,
    reputationK: 1.0,
  },

  /** EVENTS (Phase 4). Tuning assumptions — see docs/BALANCE.md. */
  events: {
    minLeadWeeks: 6,
    maxLeadWeeks: 52,
    /** Weeks before the show the event can go on sale (and typical default). */
    onSaleWeeks: 12,
    promotingWeeks: 6,
    /** Fraction of venue rental refunded on cancellation, by weeks to go. */
    cancelRefund: { early: 0.5, late: 0 },
    cancelEarlyWeeks: 8,
    seatSplit: { ga: 0.78, premium: 0.17, vip: 0.05 },
    /** Demand: attendance at reference price = demandScale * (interest/10)^demandExp (before multipliers). */
    demandScale: 90,
    demandExp: 2.1,
    priceShape: 3,
    priceRefBase: 20,
    priceRefPerInterest: 0.48,
    premiumMult: 2.4,
    vipMult: 7,
    premiumShare: 0.22,
    vipShare: 0.06,
    /** Weights for event interest (0–100). */
    interestWeights: { main: 0.5, coMain: 0.16, depth: 0.14, promo: 0.12, importance: 0.08 },
    marketing: {
      /** Default budgets (£). */
      budgets: { none: 0, low: 500, standard: 2_000, heavy: 5_000, major: 10_000 },
      strategies: {
        local: { cost: 0.6, reach: 0.7, local: 1.5, star: 0 },
        standard: { cost: 1, reach: 1, local: 1, star: 0 },
        aggressive: { cost: 1.6, reach: 1.25, local: 1, star: 0.1 },
        superstar: { cost: 2.5, reach: 1.15, local: 1, star: 0.6 },
      },
      /** Spend is measured against event scale: effect = 1 − exp(−spend·reach / (scaleBase + scalePerSeat·capacity)). */
      scaleBase: 2_500,
      scalePerSeat: 1.6,
      maxDemandBoost: 0.85,
    },
    ppv: { scale: 0.8, exp: 2.5, ref: 55, priceRef: 17, priceShape: 2.5, promoterShare: 0.55, min: 0 },
    tv: {
      local: { base: 1_500, perInterest: 160, minRep: 0, minQuality: 0, production: 3_000 },
      national: { base: 8_000, perInterest: 900, minRep: 30, minQuality: 42, production: 18_000 },
      streaming: { perViewer: 2.2, production: 8_000, minRep: 10 },
      ppvProduction: 25_000,
    },
    sponsor: { baseFactor: 0.045, maxOffers: 3 },
    costs: {
      /** Production by venue capability 1–5, plus a per-seat staging element. */
      productionByLevel: [600, 2_500, 15_000, 70_000, 200_000], productionPerSeat: 0.8,
      sanctionShare: 0.1, officialsBase: 1_200, officialsPerFight: 650, securityPerHead: 1.1, medicalPerFight: 300,
    },
    /** Forecast uncertainty shown to the player (± share). Narrows with experience. */
    forecastError: { start: 0.3, floor: 0.14, perEvent: 0.012 },
    /** Hidden actual-demand noise (sd of the log-factor). */
    actualNoise: 0.2,
    maxCancelledKept: 20,
    archiveAfterWeeks: 26,
    ai: {
      cadenceWeeks: { Startup: 6, Regional: 4, National: 4, Major: 3, Global: 3 } as Record<PromotionTier, number>,
      leadWeeks: [8, 14] as [number, number],
      marketingShare: { traditional: 0.04, prospectFactory: 0.02, money: 0.07, regional: 0.03 } as Record<string, number>,
      overheadPerWeek: { Startup: 0, Regional: 3_000, National: 18_000, Major: 70_000, Global: 220_000 } as Record<PromotionTier, number>,
      /** Owner top-up when an AI promotion runs dry (keeps the world alive; counted in reports). */
      bailoutFloor: { Startup: 0, Regional: 150_000, National: 700_000, Major: 3_000_000, Global: 12_000_000 } as Record<PromotionTier, number>,
      bailoutAmount: { Startup: 0, Regional: 400_000, National: 2_000_000, Major: 8_000_000, Global: 30_000_000 } as Record<PromotionTier, number>,
    },
    health: { concernWeeks: 26, criticalWeeks: 8, insolventCash: -75_000 },
    slotExposure: { main: 1.6, coMain: 1.3, mid: 1.0, opener: 0.75 },
    broadcastExposure: { none: 1, localTv: 1.05, nationalTv: 1.25, streaming: 1.1, ppv: 1.3 },
  },
}
