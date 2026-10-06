import { NATIONS, NICKNAMES, nation } from '../data/nations'
import { WEIGHT_CLASSES, weightClass } from '../data/weightClasses'
import { ageOn } from './calendar'
import type { IdSource } from './ids'
import type { Rng } from './rng'
import type {
  AttributeKey, CareerStage, Day, Fighter, FighterAttributes, FightingStyle, Personality,
  Stance, WeightClassId,
} from './types'

export const ATTRIBUTE_KEYS: AttributeKey[] = [
  'aggression', 'power', 'speed', 'defence', 'stamina', 'chin', 'ringIQ', 'heart', 'adaptability', 'marketability',
]

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  aggression: 'Aggression', power: 'Power', speed: 'Speed', defence: 'Defence', stamina: 'Stamina',
  chin: 'Chin', ringIQ: 'Ring IQ', heart: 'Heart', adaptability: 'Adaptability', marketability: 'Marketability',
}

/** Weights for the overall in-ring rating. Marketability is a business trait and excluded. */
const RATING_WEIGHTS: Partial<Record<AttributeKey, number>> = {
  power: 0.15, speed: 0.12, defence: 0.14, stamina: 0.11, chin: 0.13,
  ringIQ: 0.13, heart: 0.09, aggression: 0.05, adaptability: 0.08,
}

export function clamp(v: number, min = 1, max = 100): number {
  return Math.min(max, Math.max(min, v))
}

/** Overall in-ring rating (1–100), derived from attributes and current form. */
export function fighterRating(f: Pick<Fighter, 'attributes'>): number {
  let sum = 0
  for (const [k, w] of Object.entries(RATING_WEIGHTS)) sum += f.attributes[k as AttributeKey] * (w as number)
  return Math.round(sum)
}

export function fighterName(f: Pick<Fighter, 'firstName' | 'lastName'>): string {
  return `${f.firstName} ${f.lastName}`
}

export function fighterAge(f: Pick<Fighter, 'birthDay'>, today: Day): number {
  return ageOn(f.birthDay, today)
}

export function recordLabel(f: Pick<Fighter, 'record'>): string {
  const r = f.record
  return `${r.wins}-${r.losses}-${r.draws}`
}

export function totalFights(f: Pick<Fighter, 'record'>): number {
  return f.record.wins + f.record.losses + f.record.draws
}

export function koRate(f: Pick<Fighter, 'record'>): number {
  return f.record.wins ? Math.round((f.record.koWins / f.record.wins) * 100) : 0
}

export function careerStage(f: Fighter, today: Day): CareerStage {
  if (f.status === 'retired') return 'Retired'
  const age = fighterAge(f, today)
  const fights = totalFights(f)
  const rating = fighterRating(f)
  const winPct = fights ? f.record.wins / fights : 0.5
  if (age >= 36 || (age >= 33 && rating < f.potential - 12)) return 'Declining'
  if (fights >= 18 && winPct < 0.45 && rating < 58) return 'Journeyman'
  if (age >= 33) return 'Veteran'
  if (fights <= 8 && age <= 24) return 'Prospect'
  if (rating >= 74 && winPct >= 0.8 && fights >= 14) return 'Contender'
  if (age <= 27 && rating < f.potential - 3) return 'Rising'
  if (age >= 28 && rating >= 60) return 'Prime'
  return age <= 27 ? 'Rising' : 'Prime'
}

/** Description of the star rating shown to the player (potential is hidden until scouted). */
export function potentialBand(potential: number): string {
  if (potential >= 90) return 'Generational'
  if (potential >= 80) return 'World class'
  if (potential >= 70) return 'Contender'
  if (potential >= 60) return 'Domestic level'
  if (potential >= 50) return 'Journeyman'
  return 'Limited'
}

// ------------------------------------------------------------- Generation

const STYLE_BIAS: Record<FightingStyle, Partial<Record<AttributeKey, number>>> = {
  Boxer: { ringIQ: 6, defence: 3, speed: 2, power: -3 },
  'Out-Boxer': { speed: 8, defence: 5, ringIQ: 3, power: -6, aggression: -6 },
  Slugger: { power: 9, aggression: 6, chin: 4, speed: -6, defence: -6 },
  Swarmer: { aggression: 9, stamina: 8, heart: 4, defence: -4, power: -3 },
  'Counter-Puncher': { ringIQ: 8, defence: 6, adaptability: 3, aggression: -8 },
  'Boxer-Puncher': { power: 6, ringIQ: 3, speed: 2 },
}

const PERSONALITY_ODDS: { p: Personality; w: number }[] = [
  { p: 'Professional', w: 4 }, { p: 'Ambitious', w: 3 }, { p: 'Loyal', w: 2.5 }, { p: 'Volatile', w: 2 },
  { p: 'Greedy', w: 2 }, { p: 'Showman', w: 2 }, { p: 'Quiet', w: 2 }, { p: 'Arrogant', w: 1.5 },
  { p: 'Humble', w: 2.5 }, { p: 'Fragile', w: 1.2 },
]

export interface FighterGenOptions {
  /** 0 (club journeyman) … 1 (all-time great). Drives current rating and potential. */
  quality: number
  weightClass?: WeightClassId
  ageMin?: number
  ageMax?: number
  nationality?: string
  today: Day
}

export function generateFighter(rng: Rng, ids: IdSource, o: FighterGenOptions): Fighter {
  const nat = o.nationality ? nation(o.nationality) : rng.weighted(NATIONS, (n) => n.weight)
  const wc = o.weightClass ? weightClass(o.weightClass) : rng.weighted(WEIGHT_CLASSES, (w) => w.weight)
  const age =
    o.ageMax === undefined && rng.chance(0.07) ? rng.int(36, 40) : rng.int(o.ageMin ?? 19, o.ageMax ?? 35)
  const birthDay = o.today - age * 365 - rng.int(0, 364)

  const style = rng.pick<FightingStyle>(['Boxer', 'Out-Boxer', 'Slugger', 'Swarmer', 'Counter-Puncher', 'Boxer-Puncher'])
  const personality = rng.weighted(PERSONALITY_ODDS, (x) => x.w).p
  const stance: Stance = rng.weighted<Stance>(['Orthodox', 'Southpaw', 'Switch'], (s) => (s === 'Orthodox' ? 70 : s === 'Southpaw' ? 25 : 5))

  // Where the fighter sits on his own career curve: young fighters are below their ceiling.
  const peakAge = 27
  const youthGap = age < peakAge ? (peakAge - age) * rng.float(1.2, 2.4) : 0
  const agePenalty = age > 32 ? (age - 32) * rng.float(1.0, 2.0) : 0

  // Potential: the ceiling. Quality drives it; a little luck gives breakout talents.
  const potential = clamp(Math.round(38 + o.quality * 55 + rng.normal(0, 4.5)), 35, 98)
  const baseRating = clamp(potential - youthGap - agePenalty + rng.normal(0, 2), 28, potential)

  const attrs = {} as FighterAttributes
  for (const k of ATTRIBUTE_KEYS) {
    const bias = STYLE_BIAS[style][k] ?? 0
    attrs[k] = clamp(Math.round(baseRating + bias + rng.normal(0, 6)), 12, 97)
  }
  attrs.marketability = clamp(
    Math.round(30 + o.quality * 30 + (personality === 'Showman' ? 14 : 0) + (personality === 'Quiet' ? -10 : 0) + rng.normal(0, 14)),
    5, 98,
  )

  // Career record: pros fight from ~20; quality fighters win more.
  const proYears = Math.max(0, age - rng.int(19, 22))
  const fights = proYears === 0 ? rng.int(0, 3) : Math.min(60, Math.round(proYears * rng.float(1.8, 3.6)))
  const winRate = clamp(0.38 + o.quality * 0.5 + rng.normal(0, 0.08), 0.2, 0.99, ) as number
  const drawRate = rng.float(0, 0.05)
  let wins = Math.round(fights * Math.min(0.99, winRate))
  let draws = Math.min(fights - wins, Math.round(fights * drawRate))
  let losses = fights - wins - draws
  if (losses < 0) { wins += losses; losses = 0 }
  if (draws < 0) draws = 0
  const koShare = clamp((attrs.power - 30) / 90 + rng.normal(0, 0.1), 0.05, 0.95, ) as number
  const koWins = Math.round(wins * koShare)
  const koLosses = Math.round(losses * clamp((70 - attrs.chin) / 100 + rng.normal(0.25, 0.1), 0, 0.9, ))

  const heightCm = Math.round(rng.normal(wc.heightMean, wc.heightSd))
  const reachCm = Math.round(heightCm + rng.normal(3, 4))
  const hometown = rng.pick(nat.towns)
  const firstName = rng.pick(nat.firstNames)
  const lastName = rng.pick(nat.lastNames)
  const nickname = rng.chance(0.35) ? rng.pick(NICKNAMES) : null

  const popularity = clamp(Math.round(5 + o.quality * 55 + (attrs.marketability - 50) * 0.3 + Math.min(fights, 30) * 0.3 + rng.normal(0, 5)), 1, 99)
  const reputation = clamp(Math.round(5 + o.quality * 60 + Math.min(fights, 30) * 0.3 + rng.normal(0, 5)), 1, 99)

  const fighter: Fighter = {
    id: ids.next('f'),
    firstName, lastName, nickname,
    nationality: nat.key, hometown, birthDay,
    weightClass: wc.id, heightCm, reachCm, stance, style, personality,
    bio: '', personalityNote: PERSONALITY_LINES[personality],
    attributes: attrs, potential,
    discipline: clamp(Math.round(hiddenBase(personality, 'discipline', baseRating) + rng.normal(0, 8)), 5, 98),
    composure: clamp(Math.round(hiddenBase(personality, 'composure', baseRating) + rng.normal(0, 8)), 5, 98),
    injuryRisk: clamp(Math.round(40 + (age - 27) * 1.2 - (attrs.chin - 50) * 0.3 + rng.normal(0, 12)), 3, 95),
    fitness: Math.round(rng.clampedNormal(82, 8, 50, 100)),
    conditioning: Math.round(rng.clampedNormal(70, 10, 35, 98)),
    confidence: Math.round(rng.clampedNormal(55 + (wins - losses) * 0.4, 12, 15, 95)),
    morale: Math.round(rng.clampedNormal(68, 12, 25, 98)),
    popularity, reputation,
    record: { wins, losses, draws, koWins, koLosses },
    status: 'active',
    trainingFocus: 'balanced',
    lastFightDay: fights > 0 ? o.today - rng.int(21, 300) : null,
    contractId: null,
    retiredDay: null,
    availableSince: o.today - rng.int(0, 60),
    promoRelations: {},
    history: [],
  }
  fighter.bio = generateBio(rng, fighter, age)
  return fighter
}

// ------------------------------------------------------------ Backstories

const ORIGINS = [
  'took up boxing at {town} gym to stay out of trouble',
  'followed an older brother into the ring at a {town} youth club',
  'was a promising footballer in {town} before a knee injury pushed him towards boxing',
  'spent his teens working on a family market stall in {town}, training every night after close',
  'came through the amateur ranks in {town} with a decorated schoolboy record',
  'moved from a quiet town to {town} chasing a boxing career against his family’s wishes',
  'fell into boxing after a street fight convinced a {town} coach he had something special',
  'turned professional late after years on the {town} small-hall circuit',
]

export const PERSONALITY_LINES: Record<Personality, string> = {
  Professional: 'Coaches call him the easiest fighter in the gym — always on weight, always on time.',
  Ambitious: 'He talks openly about world titles and expects the right opportunities to follow.',
  Loyal: 'He sticks with the people who back him and rarely shops himself around.',
  Volatile: 'Brilliant on his day, but his temper and mood swings have cost him in the past.',
  Greedy: 'Every negotiation is a battle; his camp watches the money as closely as the footwork.',
  Showman: 'He sells tickets with his mouth as much as his fists and loves a big stage.',
  Quiet: 'He lets his hands do the talking and shuns the press whenever he can.',
  Arrogant: 'He believes he is already a star and can sour on anyone who disagrees.',
  Humble: 'Respected by rivals and fans alike, he credits his team for every win.',
  Fragile: 'Talented, but his confidence rises and falls with the results.',
}

const STYLE_LINES: Record<FightingStyle, string> = {
  Boxer: 'A disciplined, fundamentals-first boxer.',
  'Out-Boxer': 'Slick and mobile, he prefers to pick opponents apart from range.',
  Slugger: 'A heavy-handed brawler who looks to end things early.',
  Swarmer: 'A relentless pressure fighter who smothers opponents with volume.',
  'Counter-Puncher': 'A patient counter-puncher who makes opponents pay for mistakes.',
  'Boxer-Puncher': 'A well-rounded boxer who carries genuine knockout power.',
}

function generateBio(rng: Rng, f: Fighter, age: number): string {
  const origin = rng.pick(ORIGINS).replace('{town}', f.hometown)
  const fights = totalFights(f)
  const career =
    fights === 0 ? 'He is yet to make his professional debut.'
    : fights <= 6 ? `Now ${age}, he is just ${fights === 1 ? 'one fight' : `${fights} fights`} into his professional career.`
    : f.record.losses === 0 ? `Now ${age}, he arrives unbeaten after ${fights} fights.`
    : `Now ${age}, he carries a ${f.record.wins}-${f.record.losses}-${f.record.draws} record.`
  return `${f.firstName} ${f.lastName} ${origin}. ${career} ${STYLE_LINES[f.style]}`
}

/** Personality nudges the hidden mental traits (so personality is not cosmetic). */
export function hiddenBase(p: Personality, trait: 'discipline' | 'composure', base: number): number {
  const d: Record<Personality, [number, number]> = {
    Professional: [14, 6], Ambitious: [6, 2], Loyal: [6, 4], Volatile: [-14, -14], Greedy: [-2, 0],
    Showman: [-8, 4], Quiet: [4, 8], Arrogant: [-6, 0], Humble: [8, 6], Fragile: [-2, -16],
  }
  return base + d[p][trait === 'discipline' ? 0 : 1]
}

// ------------------------------------------------------ Public information

/**
 * Everything about a fighter that is public knowledge — what anyone can look up in a record book
 * or see on TV. This is the ONLY fighter input the player-knowledge priors are allowed to use.
 */
export interface PublicFacts {
  age: number
  weightClass: WeightClassId
  nationality: string
  heightCm: number
  reachCm: number
  stance: Stance
  style: FightingStyle
  record: Fighter['record']
  reputation: number
  popularity: number
  retired: boolean
}

export function publicFacts(f: Fighter, today: Day): PublicFacts {
  return {
    age: fighterAge(f, today), weightClass: f.weightClass, nationality: f.nationality,
    heightCm: f.heightCm, reachCm: f.reachCm, stance: f.stance, style: f.style,
    record: f.record, reputation: f.reputation, popularity: f.popularity, retired: f.status === 'retired',
  }
}

export type PublicStage = 'Debutant' | 'Prospect' | 'Rising' | 'Contender' | 'Prime' | 'Veteran' | 'Declining' | 'Journeyman' | 'Retired'

/** Career stage inferred from public information only (no hidden rating/potential). */
export function publicStage(p: PublicFacts): PublicStage {
  if (p.retired) return 'Retired'
  const fights = p.record.wins + p.record.losses + p.record.draws
  const winPct = fights ? p.record.wins / fights : 0.5
  if (fights === 0) return 'Debutant'
  if (p.age >= 36) return 'Declining'
  if (fights >= 18 && winPct < 0.5 && p.reputation < 40) return 'Journeyman'
  if (p.age >= 33) return 'Veteran'
  if (fights <= 8 && p.age <= 25) return 'Prospect'
  if (p.reputation >= 55 && winPct >= 0.75 && fights >= 12) return 'Contender'
  if (p.age <= 27 && winPct >= 0.65) return 'Rising'
  return p.age >= 28 ? 'Prime' : 'Rising'
}

export function visibility(p: Pick<PublicFacts, 'reputation' | 'popularity'>): number {
  return Math.max(p.reputation, p.popularity * 0.9)
}
