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
    /** Per-fight base purse = max(min, a·e^(b·value/100)). Exponential: journeymen earn hundreds, headliners earn a real slice of the gate (docs/ECONOMY.md). */
    purse: { min: 1_500, a: 290, b: 10 },
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
    maxPurse: { Startup: 12_000, Regional: 40_000, National: 150_000, Major: 600_000, Global: 3_000_000 } as Record<PromotionTier, number>,
    renewChance: 0.7,
    releaseChance: 0.04,
    targetRating: { Startup: 35, Regional: 44, National: 54, Major: 64, Global: 72 } as Record<PromotionTier, number>,
    rosterTarget: { Startup: 8, Regional: 18, National: 24, Major: 28, Global: 30 } as Record<PromotionTier, number>,
  },

  /** Difficulty is about the world, not just money: who pays what, how well you can see, how good the rivals are. */
  difficulty: {
    forgiving: { sponsor: 1.15, venueCost: 0.9, fighterAsk: 0.92, forecastError: 0.85, demandNoise: 0.85 },
    standard: { sponsor: 1, venueCost: 1, fighterAsk: 1, forecastError: 1, demandNoise: 1 },
    brutal: { sponsor: 0.85, venueCost: 1.15, fighterAsk: 1.1, forecastError: 1.25, demandNoise: 1.2 },
  } as Record<'forgiving' | 'standard' | 'brutal', { sponsor: number; venueCost: number; fighterAsk: number; forecastError: number; demandNoise: number }>,

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
    ai: { perPromoPerWeek: 0.6, rosterPerAttempt: 8, maxOpenShare: 0.4, minWeeksNotice: 6, maxWeeksNotice: 14, journeymanPurseFactor: 0.5, freeAgentChance: 0.22,
      /** Independent (uncontracted) fighters may take at most this share of an AI card as principals, plus whatever is needed to reach the three-fight minimum of a show. */
      /** Master switch for independents taking places on AI cards (the audit turns it off to reproduce the old world). */
      freeAgentFill: true,
      /** Whether independents may also rescue a card that would otherwise fall short of three fights (more shows: they compete for the same Saturdays and crowds as the player's). */
      freeAgentRescue: false,
      freeAgentCardShare: 0.3,
      /** How many independents a promoter weighs up when filling a card. */
      freeAgentKnown: 10,
      /** Opponents weighed for an independent's bout (a plain card slot weighs 60). */
      freeAgentSample: 20,
      /** Opponents a matchmaker weighs for an ordinary card slot. */
      opponentSample: 40 },
    recentListSize: 12,
    /** Bouts kept for fighters the player has no relationship with. */
    untrackedRecent: 6,
    /** Years after retirement at which an unwatched retiree's bout detail shrinks to 3 bouts and then to none. */
    retiredFadeYears: [1, 3] as [number, number],
    /** Retired fighters nobody refers to are dropped after this many years. */
    retiredPruneYears: 4,
    /** Fame is hard to win and easy to lose; without this multiplier the whole world slowly cools as stars retire and prospects start at the bottom. */
    popularityGainK: 1.2,
    /**
     * Cooling of fame that outruns what the results justify. Wins add fame far faster than losses remove it (that asymmetry is
     * deliberate: it offsets the intake of unknown prospects), so without a counterweight every fighter who stays active ratchets
     * upward whatever their record. Fame above `slope × reputation + base` fades by `rate` of the excess each week (≈ 27% a year);
     * it never pulls a fighter below that line, and never below the old floor of 0.4 × reputation.
     */
    popularityCool: { slope: 0.95, base: 4, rate: 0.006 },
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
    demandScale: 65,
    demandExp: 2.3,
    priceShape: 3,
    priceRefBase: 20,
    priceRefPerInterest: 0.48,
    premiumMult: 2.4,
    vipMult: 7,
    premiumShare: 0.22,
    vipShare: 0.06,
    /** Weights for event interest (0–100). */
    interestWeights: { main: 0.55, coMain: 0.15, depth: 0.12, promo: 0.12, importance: 0.06 },
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
    /** Live-gate demand lost to people watching at home, by broadcast option. */
    cannibal: { none: 1, localTv: 0.99, nationalTv: 0.97, streaming: 0.95, ppv: 0.9 } as Record<string, number>,
    /** PPV buys ∝ national reach × (main-event appeal / ref)^exp × campaign: a real star sells enormously more than a good fighter. Price ref = priceBase + priceInterest·interest. */
    ppv: { scale: 0.34, campaignFloor: 0.35, campaignScale: 25_000, campaignPerFan: 0.015, exp: 4.0, ref: 55, priceBase: 14, priceInterest: 0.5, priceShape: 2.5, promoterShare: 0.55, min: 0 },
    tv: {
      local: { base: 1_500, perInterest: 160, minRep: 0, minQuality: 0, production: 3_000 },
      national: { base: 8_000, perInterest: 900, minRep: 30, minQuality: 42, production: 18_000 },
      streaming: { perViewer: 2.2, production: 8_000, minRep: 10 },
      /** PPV is a full television production: a base plus a bill that grows with the size of the show. */
      ppvProduction: { base: 40_000, perInterestSq: 45 },
    },
    sponsor: { baseFactor: 0.045, maxOffers: 3 },
    costs: {
      /** Production by venue capability 1–5, plus a per-seat staging element. */
      productionByLevel: [600, 2_500, 15_000, 70_000, 200_000], productionPerSeat: 0.8,
      sanctionShare: 0.1, officialsBase: 1_200, officialsPerFight: 650, securityPerHead: 1.1, medicalPerFight: 300,
    },
    /** Forecast uncertainty shown to the player (± share). Narrows with experience. */
    forecastError: { start: 0.42, floor: 0.24, perEvent: 0.012 },
    /** Hidden actual-demand noise (sd of the log-factor), by source. All keyed, so reproducible per game seed. */
    noise: { priceSens: 0.1, event: 0.16, local: 0.09, marketing: 0.22, economy: 0.07, weather: { local: 0.02, regional: 0.03, national: 0.04, arena: 0.05, stadium: 0.09 } as Record<string, number>, ppv: 0.65, competitionMax: 0.22 },
    /** Seasonal demand by month (Jan..Dec): holidays and summer are soft, autumn/winter strong. */
    season: [1.0, 1.0, 1.01, 1.02, 1.0, 0.97, 0.94, 0.95, 1.0, 1.04, 1.06, 0.98],
    maxCancelledKept: 20,
    archiveAfterWeeks: 26,
    ai: {
      cadenceWeeks: { Startup: 6, Regional: 4, National: 4, Major: 3, Global: 3 } as Record<PromotionTier, number>,
      /** Stretches every promotion's planning interval. Planning attempts that could not be filled used to throttle shows by accident; now that cards fill, this sets the pace on purpose. */
      cadenceScale: 1,
      leadWeeks: [8, 14] as [number, number],
      marketingShare: { traditional: 0.04, prospectFactory: 0.02, money: 0.07, regional: 0.03 } as Record<string, number>,
      overheadPerWeek: { Startup: 0, Regional: 2_000, National: 8_000, Major: 35_000, Global: 90_000 } as Record<PromotionTier, number>,
      /** Competence: how well a promoter reads demand (forecast sd, optimism bias), prices, and controls marketing spend. */
      competence: {
        poor: { sd: 0.38, bias: 0.2, priceSkill: 0, mktRange: [0.3, 2.4], overreach: 0.3, appraisal: 1.4 },
        average: { sd: 0.24, bias: 0.06, priceSkill: 0.6, mktRange: [0.6, 1.5], overreach: 0.1, appraisal: 1 },
        strong: { sd: 0.15, bias: 0, priceSkill: 0.9, mktRange: [0.8, 1.25], overreach: 0.03, appraisal: 0.8 },
        elite: { sd: 0.09, bias: -0.02, priceSkill: 1, mktRange: [0.9, 1.1], overreach: 0, appraisal: 0.6 },
      } as Record<string, { sd: number; bias: number; priceSkill: number; mktRange: [number, number]; overreach: number; appraisal: number }>,
      /** Life-cycle behaviour by financial state: how much of its normal ambition a promotion keeps. */
      behaviour: {
        growing: { cadence: 0.85, tierDrop: 0, marketing: 1.15, signing: true, release: 0 },
        healthy: { cadence: 1, tierDrop: 0, marketing: 1, signing: true, release: 0 },
        established: { cadence: 1, tierDrop: 0, marketing: 1, signing: true, release: 0 },
        struggling: { cadence: 1.4, tierDrop: 1, marketing: 0.6, signing: false, release: 1 },
        critical: { cadence: 2.2, tierDrop: 2, marketing: 0.25, signing: false, release: 2 },
        insolvent: { cadence: 99, tierDrop: 3, marketing: 0, signing: false, release: 3 },
      } as Record<string, { cadence: number; tierDrop: number; marketing: number; signing: boolean; release: number }>,
      /** Cash above which owners take a distribution (half the excess, quarterly). */
      distributionCeiling: { Startup: 400_000, Regional: 2_500_000, National: 10_000_000, Major: 40_000_000, Global: 120_000_000 } as Record<PromotionTier, number>,
      /** Owner rescue: limited, costly, and not available forever. */
      rescue: { maxPer5Years: 2, repHit: 8, shedShare: 0.4, collapseReleaseShare: 0.15 },
      /** Size of an owner rescue (halved; plus whatever clears the debt). Rare, costly in reputation and talent — see `rescue`. */
      bailoutAmount: { Startup: 0, Regional: 400_000, National: 2_000_000, Major: 8_000_000, Global: 30_000_000 } as Record<PromotionTier, number>,
    },
    health: { concernWeeks: 26, criticalWeeks: 8, insolventCash: -75_000 },
    slotExposure: { main: 1.6, coMain: 1.3, mid: 1.0, opener: 0.75 },
    broadcastExposure: { none: 1, localTv: 1.05, nationalTv: 1.25, streaming: 1.1, ppv: 1.3 },
  },
}
