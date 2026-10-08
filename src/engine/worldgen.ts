import { initMediaWorld } from './media/process'
import { buildWorldVenues } from './business/venues'
import { dayFromIso } from './calendar'
import { generateFighter, publicFacts, visibility } from './fighters'
import { BALANCE as B } from './balance'
import { applyReport, discover } from './knowledge'
import { baseMoney, marketValue } from './market'
import { createStartingScout } from './scouting'
import { pushHistory } from './roster'
import { freshTierProgress } from './tierProgress'
import { freshSponsorBook } from './sponsors'
import { scenarioById, type ScenarioId } from './scenarios'
import { IdGen, type IdSource } from './ids'
import { postMessage } from './messages'
import { monogramFor } from './promotions'
import { keyedFloat, Rng } from './rng'
import type {
  AiCompetence, AiStrategy, Contract, Day, Difficulty, Fighter, GameState, Id, Promotion, PromoFinance, PromotionTier, Venue,
} from './types'
import { GAME_STATE_VERSION } from './types'

export const START_DATE = '2026-10-05' // a Monday

export interface NewGameOptions {
  seed: string
  promotionName: string
  promoterName: string
  homeCountry: 'ENG' | 'USA'
  difficulty: Difficulty
  logo: Promotion['logo']
  /** Phase 4.7: start from a career scenario. Omitted = the classic start (kept so older tests and sims are unchanged). */
  scenario?: ScenarioId
}

const STARTING_CASH: Record<Difficulty, number> = { forgiving: 750_000, standard: 500_000, brutal: 300_000 }

interface AiPromotionSeed {
  name: string
  promoter: string
  country: string
  tier: PromotionTier
  rosterSize: number
  /** Average quality (0–1) of fighters signed. */
  quality: number
  cash: number
  reputation: number
  fanbase: number
  color: string
  emblem: Promotion['logo']['emblem']
  strategy: AiStrategy
}

const AI_PROMOTIONS: AiPromotionSeed[] = [
  { name: 'Apex Fight Group', promoter: 'Walter Kessler', country: 'USA', tier: 'Global', rosterSize: 30, quality: 0.78, cash: 220_000_000, reputation: 92, fanbase: 9_500_000, color: '#2f7de1', emblem: 'shield', strategy: 'money' },
  { name: 'Redline Promotions', promoter: 'Barry Holloway', country: 'ENG', tier: 'Major', rosterSize: 28, quality: 0.68, cash: 85_000_000, reputation: 80, fanbase: 3_200_000, color: '#e11d2a', emblem: 'bolt' , strategy: 'traditional' },
  { name: 'Golden State Prizefights', promoter: 'Delia Ortega', country: 'USA', tier: 'National', rosterSize: 24, quality: 0.55, cash: 22_000_000, reputation: 62, fanbase: 900_000, color: '#d4a24c', emblem: 'star' , strategy: 'prospectFactory' },
  { name: 'Steel City Boxing', promoter: 'Frank Dunmore', country: 'ENG', tier: 'Regional', rosterSize: 20, quality: 0.40, cash: 3_500_000, reputation: 38, fanbase: 120_000, color: '#26a269', emblem: 'glove' , strategy: 'regional' },
  { name: 'Lone Star Fight Night', promoter: 'Ray Castellano', country: 'USA', tier: 'Regional', rosterSize: 18, quality: 0.38, cash: 2_800_000, reputation: 34, fanbase: 95_000, color: '#9b5de5', emblem: 'crown' , strategy: 'regional' },
  { name: 'Northern Lights Boxing', promoter: 'Moira Gilchrist', country: 'SCO', tier: 'Regional', rosterSize: 14, quality: 0.34, cash: 1_600_000, reputation: 28, fanbase: 60_000, color: '#f2f2f2', emblem: 'bolt' , strategy: 'prospectFactory' },
]

export function createNewGame(opts: NewGameOptions, now = Date.now()): GameState {
  const sc = scenarioById(opts.scenario)
  if (sc) opts = { ...opts, difficulty: sc.difficulty }
  const rng = Rng.fromSeed(opts.seed)
  const ids = new IdGen()
  const today = dayFromIso(START_DATE)

  const promotions: Record<Id, Promotion> = {}
  const fighters: Record<Id, Fighter> = {}
  const contracts: Record<Id, Contract> = {}
  const venues: Record<Id, Venue> = {}

  // Venues: the real-world venues plus a few generic halls (see business/venues.ts).
  Object.assign(venues, buildWorldVenues((p) => ids.next(p)))

  // Player promotion
  const playerId = ids.next('p')
  promotions[playerId] = {
    id: playerId,
    name: opts.promotionName,
    promoterName: opts.promoterName,
    isPlayer: true,
    homeCountry: opts.homeCountry,
    tier: sc?.tier ?? 'Startup',
    logo: opts.logo,
    cash: sc?.startingCash ?? STARTING_CASH[opts.difficulty],
    reputation: sc?.reputation ?? 6,
    fanbase: sc?.fanbase ?? 1_200,
    regionalPopularity: sc?.regionalPopularity ?? 4,
    globalPopularity: sc?.globalPopularity ?? 0,
    foundedDay: today,
    ai: null,
    stats: emptyStats(today), accounting: null,
  }

  // AI promotions with their rosters
  const aiIds: Id[] = []
  for (const seed of AI_PROMOTIONS) {
    const id = ids.next('p')
    aiIds.push(id)
    promotions[id] = {
      id, name: seed.name, promoterName: seed.promoter, isPlayer: false, homeCountry: seed.country,
      tier: seed.tier,
      logo: { monogram: monogramFor(seed.name), color: seed.color, emblem: seed.emblem },
      cash: seed.cash, reputation: seed.reputation, fanbase: seed.fanbase,
      regionalPopularity: Math.min(95, seed.reputation + 5),
      globalPopularity: seed.tier === 'Global' ? 85 : seed.tier === 'Major' ? 55 : seed.tier === 'National' ? 25 : 4,
      foundedDay: today - rng.int(2, 25) * 365,
      ai: { strategy: seed.strategy, urgency: 0, cooldownUntil: today, ...aiTraits(opts.seed, seed.name, seed.tier, seed.strategy, opts.difficulty), fin: freshFinance(today) },
      stats: emptyStats(today - rng.int(20, 60) * 7), accounting: { startCash: seed.cash, revenue: 0, costs: 0, overhead: 0, bailouts: 0, distributions: 0 },
    }
    for (let i = 0; i < seed.rosterSize; i++) {
      const quality = rng.clampedNormal(seed.quality, 0.14, 0.08, 0.98)
      const f = generateFighter(rng, ids, { quality, today, nationality: biasedNation(rng, seed.country) })
      fighters[f.id] = f
      const c = signContract(rng, ids, f, id, today)
      contracts[c.id] = c
      f.contractId = c.id
      f.availableSince = null
      seedHistory(rng, f, c, id, aiIds, today)
    }
  }

  // Player's starting fighters. A scenario describes its roster as data; the classic start is four raw
  // club-level fighters, one with real potential.
  if (sc) {
    for (const g of sc.roster) {
      for (let i = 0; i < g.count; i++) {
        const f = generateFighter(rng, ids, { quality: rng.float(g.quality[0], g.quality[1]), today, nationality: biasedNation(rng, opts.homeCountry, 0.85), ageMin: g.ageMin, ageMax: g.ageMax })
        fighters[f.id] = f
        const c = signContract(rng, ids, f, playerId, today, g.contractDiscount ?? 1)
        c.startDay = today
        c.endDay = today + g.contractYears * 365
        c.fightsTotal = c.fightsRemaining = g.contractYears * c.minFightsPerYear
        contracts[c.id] = c
        f.morale = rng.int(66, 82)
        f.fitness = Math.max(f.fitness, 78)
        f.contractId = c.id
        f.availableSince = null
        pushHistory(f, { day: today, kind: 'signed', promotionId: playerId })
      }
    }
  } else {
    const playerQualities = [0.38, 0.32, 0.28, 0.5]
    playerQualities.forEach((q, i) => {
      const nationality = biasedNation(rng, opts.homeCountry, 0.85)
      const f = generateFighter(rng, ids, {
        quality: q, today, nationality,
        ageMin: i === 3 ? 19 : 21, ageMax: i === 3 ? 21 : 30,
      })
      fighters[f.id] = f
      const c = signContract(rng, ids, f, playerId, today)
      c.startDay = today
      c.endDay = today + 3 * 365 // long enough that renewals (Phase 2) arrive well before expiry
      c.fightsTotal = c.fightsRemaining = rng.int(6, 8)
      contracts[c.id] = c
      // Fresh signings arrive hungry and healthy.
      f.morale = rng.int(66, 82)
      f.fitness = Math.max(f.fitness, 78)
      f.contractId = c.id
      f.availableSince = null
      pushHistory(f, { day: today, kind: 'signed', promotionId: playerId })
    })
  }

  // Free-agent pool: the open market the player will scout from (Phase 2).
  for (let i = 0; i < 170; i++) {
    const quality = rng.clampedNormal(0.3, 0.15, 0.05, 0.95)
    const f = generateFighter(rng, ids, { quality, today })
    fighters[f.id] = f
    const fights = f.record.wins + f.record.losses + f.record.draws
    if (fights === 0) pushHistory(f, { day: today - rng.int(7, 120), kind: 'turnedPro', promotionId: null })
    else if (rng.chance(0.45)) {
      const day = today - rng.int(3, 180)
      pushHistory(f, { day, kind: rng.chance(0.6) ? 'expired' : 'released', promotionId: rng.pick(aiIds) })
      f.availableSince = day
    }
  }
  // A handful of established names on the market: ageing former contenders and a few hot properties.
  for (let i = 0; i < 8; i++) {
    const old = i < 5
    const f = generateFighter(rng, ids, { quality: rng.float(0.62, 0.85), today, ageMin: old ? 33 : 24, ageMax: old ? 37 : 29 })
    fighters[f.id] = f
    const day = today - rng.int(2, 60)
    pushHistory(f, { day, kind: 'expired', promotionId: rng.pick(aiIds) })
    f.availableSince = day
  }

  const cash = promotions[playerId].cash
  const state: GameState = {
    version: GAME_STATE_VERSION,
    saveId: `save_${now.toString(36)}_${Math.floor(rng.next() * 1e6).toString(36)}`,
    createdAt: now,
    seed: opts.seed,
    rngState: rng.state,
    idCounter: ids.counter,
    startDay: today,
    today,
    playerPromotionId: playerId,
    promotions, fighters, contracts, venues,
    ledger: [
      { id: ids.next('t'), day: today, category: 'startingFunds', amount: cash, description: 'Starting capital' },
    ],
    ledgerArchive: 0,
    financeHistory: [{ day: today, cash, income: cash, expenses: 0 }],
    contractHistory: [], negotiations: {}, obligations: [], fights: {}, fightLocks: {}, events: {},
    knowledge: {}, scouts: [], scoutOps: [], shortlist: [],
    inbox: [],
    news: [],
    settings: { difficulty: opts.difficulty, autosave: true },
    ...(sc ? { scenario: { id: sc.id, done: {} } } : {}),
    promotionProgress: freshTierProgress(),
    sponsors: freshSponsorBook(),
  }
  state.idCounter = ids.counter
  state.scouts.push(createStartingScout(state, opts.homeCountry))
  initKnowledge(state)
  postWelcomeMessages(state)
  initMediaWorld(state)
  return state
}

/** Who the player already knows about on day one, and the coach's read of the starting roster. */
export function freshFinance(day: number): PromoFinance {
  return { state: 'established', since: day, recent: [], bailoutDays: [], collapsing: false, distressWeeks: 0, snap: 0, quarters: [] }
}

const COMPETENCE_ORDER: AiCompetence[] = ['poor', 'average', 'strong', 'elite']
const RISK_BASE: Record<AiStrategy, number> = { money: 0.75, traditional: 0.45, regional: 0.35, prospectFactory: 0.25 }

/** Deterministic (keyed) competence and risk appetite: bigger promotions skew better; harder difficulties skew rivals better. */
export function aiTraits(seed: string, name: string, tier: PromotionTier, strategy: AiStrategy, difficulty: Difficulty): { competence: AiCompetence; risk: number } {
  const u = keyedFloat(seed, 'aicomp', name)
  const tierBonus = { Startup: -0.1, Regional: 0, National: 0.08, Major: 0.12, Global: 0.15 }[tier]
  const diff = difficulty === 'brutal' ? 0.1 : difficulty === 'forgiving' ? -0.1 : 0
  const x = u + tierBonus + diff
  const competence = COMPETENCE_ORDER[x < 0.3 ? 0 : x < 0.62 ? 1 : x < 0.88 ? 2 : 3]
  const risk = Math.max(0.05, Math.min(0.95, RISK_BASE[strategy] + (keyedFloat(seed, 'airisk', name) - 0.5) * 0.3))
  return { competence, risk }
}

export function emptyStats(day: number): Promotion['stats'] {
  return { events: 0, attendance: 0, bestAttendance: 0, profit: 0, lastEventDay: day, bestGate: 0, form: 50, revenue: 0 }
}

export function initKnowledge(state: GameState): void {
  const home = state.promotions[state.playerPromotionId].homeCountry
  const own = new Set(Object.values(state.contracts).filter((c) => c.promotionId === state.playerPromotionId).map((c) => c.fighterId))
  for (const f of Object.values(state.fighters)) {
    const vis = visibility(publicFacts(f, state.today))
    const known = own.has(f.id) || vis >= B.market.publicVisibility || (f.nationality === home && vis >= B.market.homeRegionVisibility)
    if (known) discover(state, f.id, own.has(f.id) ? 'roster' : 'public')
  }
  for (const id of own) {
    const f = state.fighters[id]
    const coach = { id: 'coach', name: 'Head Coach', quality: 58, experience: 20, regionKnowledge: [f.nationality], divisions: [f.weightClass], weeklyWage: 0, reputation: 0, reportsDone: 0 }
    const entry = applyReport(state, f, 'standard', coach, 'Head Coach')
    entry.insight = 40
  }
}

/** Give contracted fighters a believable past: this deal, and sometimes earlier stints elsewhere. */
function seedHistory(rng: Rng, f: Fighter, c: Contract, currentPromo: Id, aiIds: Id[], today: Day): void {
  const fights = f.record.wins + f.record.losses + f.record.draws
  if (fights > 8 && f.birthDay < today - 25 * 365 && rng.chance(0.45)) {
    const others = aiIds.filter((x) => x !== currentPromo)
    const n = rng.int(1, 2)
    for (let i = 0; i < n; i++) {
      pushHistory(f, { day: c.startDay - (i + 1) * rng.int(250, 900), kind: 'expired', promotionId: rng.pick(others) })
    }
    f.history.sort((a, b) => a.day - b.day)
  }
  pushHistory(f, { day: c.startDay, kind: 'signed', promotionId: currentPromo })
}

function postWelcomeMessages(state: GameState): void {
  const p = state.promotions[state.playerPromotionId]
  const sc = scenarioById(state.scenario?.id)
  const n = Object.values(state.contracts).filter((c) => c.promotionId === p.id).length
  const goal = sc ? ` Your objective: ${sc.objectives[0].label.replace(/^./, (c) => c.toLowerCase())}.` : ''
  postMessage(state, {
    from: 'Board', category: 'system', priority: 'important',
    subject: `Welcome to ${p.name}`,
    body: `${p.promoterName}, the paperwork is signed and the doors are open. You have ${n === 1 ? 'one fighter' : `${n} fighters`}, a gym and £${Math.round(p.cash / 1000)}k in the bank. Every week the bills land and the rest of boxing moves on without you. Scout the market, book a show, and watch the forecast before you commit.${goal}`,
    link: { kind: 'screen', screen: 'dashboard' },
  })
  const roster = Object.values(state.contracts)
    .filter((c) => c.promotionId === p.id)
    .map((c) => state.fighters[c.fighterId])
  postMessage(state, {
    from: 'Gym', category: 'fighter', priority: 'normal',
    subject: 'Meet your first fighters',
    body: `Your gym is home to ${roster.map((f) => `${f.firstName} ${f.lastName}`).join(', ')}. Set each fighter's training focus from their profile — it changes how they develop every week.`,
    link: { kind: 'screen', screen: 'fighters' },
  })
}

function biasedNation(rng: Rng, home: string, p = 0.6): string | undefined {
  return rng.chance(p) ? home : undefined
}

/** Contract terms for a pre-existing deal, scaled to the fighter's public standing. */
export function signContract(rng: Rng, ids: IdSource, f: Fighter, promotionId: Id, today: Day, discount = 1): Contract {
  const years = rng.int(1, 3)
  const mv = marketValue(publicFacts(f, today), f.reputation)
  const base = baseMoney(mv)
  const fpy = rng.int(2, 3)
  const purse = Math.round((base.purse * discount) / 100) * 100
  return {
    id: ids.next('c'), fighterId: f.id, promotionId,
    startDay: today - rng.int(0, 200), endDay: today + years * 365 - rng.int(0, 200),
    weeklyRetainer: Math.round((base.retainer * discount) / 10) * 10, basePurse: purse,
    winBonus: Math.round((purse * B.market.winBonusOfPurse) / 100) * 100, titleBonus: f.reputation >= 45 ? Math.round((purse * 0.15) / 100) * 100 : 0,
    ppvShare: 0, signingBonus: 0,
    fightsTotal: years * fpy, fightsRemaining: years * fpy, minFightsPerYear: fpy,
    releaseFee: null, titlePromise: false, status: 'active',
    notices: { approaching: false, window: false, expiring: false }, aiReviewed: false,
  }
}
