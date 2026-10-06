import { VENUE_SEEDS } from '../data/venues'
import { dayFromIso } from './calendar'
import { generateFighter } from './fighters'
import { IdGen, type IdSource } from './ids'
import { postMessage } from './messages'
import { monogramFor } from './promotions'
import { Rng } from './rng'
import type {
  Contract, Day, Difficulty, Fighter, GameState, Id, Promotion, PromotionTier, Venue,
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
}

const AI_PROMOTIONS: AiPromotionSeed[] = [
  { name: 'Apex Fight Group', promoter: 'Walter Kessler', country: 'USA', tier: 'Global', rosterSize: 30, quality: 0.78, cash: 220_000_000, reputation: 92, fanbase: 9_500_000, color: '#2f7de1', emblem: 'shield' },
  { name: 'Redline Promotions', promoter: 'Barry Holloway', country: 'ENG', tier: 'Major', rosterSize: 28, quality: 0.68, cash: 85_000_000, reputation: 80, fanbase: 3_200_000, color: '#e11d2a', emblem: 'bolt' },
  { name: 'Golden State Prizefights', promoter: 'Delia Ortega', country: 'USA', tier: 'National', rosterSize: 24, quality: 0.55, cash: 22_000_000, reputation: 62, fanbase: 900_000, color: '#d4a24c', emblem: 'star' },
  { name: 'Steel City Boxing', promoter: 'Frank Dunmore', country: 'ENG', tier: 'Regional', rosterSize: 20, quality: 0.40, cash: 3_500_000, reputation: 38, fanbase: 120_000, color: '#26a269', emblem: 'glove' },
  { name: 'Lone Star Fight Night', promoter: 'Ray Castellano', country: 'USA', tier: 'Regional', rosterSize: 18, quality: 0.38, cash: 2_800_000, reputation: 34, fanbase: 95_000, color: '#9b5de5', emblem: 'crown' },
  { name: 'Northern Lights Boxing', promoter: 'Moira Gilchrist', country: 'SCO', tier: 'Regional', rosterSize: 14, quality: 0.34, cash: 1_600_000, reputation: 28, fanbase: 60_000, color: '#f2f2f2', emblem: 'bolt' },
]

export function createNewGame(opts: NewGameOptions, now = Date.now()): GameState {
  const rng = Rng.fromSeed(opts.seed)
  const ids = new IdGen()
  const today = dayFromIso(START_DATE)

  const promotions: Record<Id, Promotion> = {}
  const fighters: Record<Id, Fighter> = {}
  const contracts: Record<Id, Contract> = {}
  const venues: Record<Id, Venue> = {}

  // Venues
  for (const v of VENUE_SEEDS) {
    const id = ids.next('v')
    venues[id] = { id, ...v }
  }

  // Player promotion
  const playerId = ids.next('p')
  promotions[playerId] = {
    id: playerId,
    name: opts.promotionName,
    promoterName: opts.promoterName,
    isPlayer: true,
    homeCountry: opts.homeCountry,
    tier: 'Startup',
    logo: opts.logo,
    cash: STARTING_CASH[opts.difficulty],
    reputation: 6,
    fanbase: 1_200,
    regionalPopularity: 4,
    globalPopularity: 0,
    foundedDay: today,
  }

  // AI promotions with their rosters
  for (const seed of AI_PROMOTIONS) {
    const id = ids.next('p')
    promotions[id] = {
      id, name: seed.name, promoterName: seed.promoter, isPlayer: false, homeCountry: seed.country,
      tier: seed.tier,
      logo: { monogram: monogramFor(seed.name), color: seed.color, emblem: seed.emblem },
      cash: seed.cash, reputation: seed.reputation, fanbase: seed.fanbase,
      regionalPopularity: Math.min(95, seed.reputation + 5),
      globalPopularity: seed.tier === 'Global' ? 85 : seed.tier === 'Major' ? 55 : seed.tier === 'National' ? 25 : 4,
      foundedDay: today - rng.int(2, 25) * 365,
    }
    for (let i = 0; i < seed.rosterSize; i++) {
      const quality = rng.clampedNormal(seed.quality, 0.14, 0.08, 0.98)
      const f = generateFighter(rng, ids, { quality, today, nationality: biasedNation(rng, seed.country) })
      fighters[f.id] = f
      const c = signContract(rng, ids, f, id, today, quality)
      contracts[c.id] = c
      f.contractId = c.id
    }
  }

  // Player's four starting fighters: raw club-level talent, one with real potential.
  const playerQualities = [0.38, 0.32, 0.28, 0.5]
  playerQualities.forEach((q, i) => {
    const nationality = biasedNation(rng, opts.homeCountry, 0.85)
    const f = generateFighter(rng, ids, {
      quality: q, today, nationality,
      ageMin: i === 3 ? 19 : 21, ageMax: i === 3 ? 21 : 30,
    })
    fighters[f.id] = f
    const c = signContract(rng, ids, f, playerId, today, 0.1)
    c.startDay = today
    c.endDay = today + 3 * 365 // long enough that renewals (Phase 2) arrive well before expiry
    c.fightsTotal = c.fightsRemaining = rng.int(6, 8)
    contracts[c.id] = c
    // Fresh signings arrive hungry and healthy.
    f.morale = rng.int(66, 82)
    f.fitness = Math.max(f.fitness, 78)
    f.contractId = c.id
  })

  // Free-agent pool: the open market the player will scout from (Phase 2).
  for (let i = 0; i < 170; i++) {
    const quality = rng.clampedNormal(0.3, 0.15, 0.05, 0.95)
    const f = generateFighter(rng, ids, { quality, today })
    fighters[f.id] = f
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
    financeHistory: [{ day: today, cash, income: cash, expenses: 0 }],
    inbox: [],
    news: [],
    settings: { difficulty: opts.difficulty, autosave: true },
  }
  state.idCounter = ids.counter
  postWelcomeMessages(state)
  return state
}

function postWelcomeMessages(state: GameState): void {
  const p = state.promotions[state.playerPromotionId]
  postMessage(state, {
    from: 'Board', category: 'system', priority: 'important',
    subject: `Welcome to ${p.name}`,
    body: `${p.promoterName}, the paperwork is signed and the doors are open. You have four fighters, a rented gym and £${Math.round(p.cash / 1000)}k in the bank. Every week the bills land and the rest of boxing moves on without you. Phase 1 gives you the foundations — roster, training, calendar, finances and a living world. Scouting, fights and events arrive in the phases ahead.`,
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

/** Contract terms scale with the fighter's standing. */
export function signContract(rng: Rng, ids: IdSource, f: Fighter, promotionId: Id, today: Day, quality: number): Contract {
  const years = rng.int(1, 3)
  const stature = Math.max(quality, (f.reputation + f.popularity) / 200)
  const weeklyRetainer = Math.round((60 + stature * stature * 4_000) / 10) * 10
  const minPurse = Math.round((1_500 + stature * stature * 150_000) / 100) * 100
  const fights = years * rng.int(2, 3)
  return {
    id: ids.next('c'),
    fighterId: f.id,
    promotionId,
    startDay: today - rng.int(0, 200),
    endDay: today + years * 365 - rng.int(0, 200),
    weeklyRetainer, minPurse,
    fightsTotal: fights, fightsRemaining: fights,
    warned12: false, warned4: false,
  }
}
