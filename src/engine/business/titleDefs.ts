/**
 * TITLE DEFINITIONS — the whole title ladder as DATA. Adding a title means adding one entry here and one identity entry in
 * `data/mediaIdentity.ts`; no engine rule branches on a title name.
 *
 * IMPORTANT (licensing and honesty): titles carry their real-world NAMES, but every rule in this file — who is eligible, how long
 * a champion may go without defending, how many contenders are listed — is a GAME ABSTRACTION. It is not the rulebook of any real
 * organisation, and the game is not affiliated with, endorsed by or licensed from any sanctioning body, governing board or
 * promoter. No logos or organisational branding are used; identity packs keep names and artwork separate from behaviour.
 */
import type { WeightClassId } from '../types'

export type TitleLevel = 'area' | 'domestic' | 'european' | 'world'

/** Who may be ranked for, or challenge for, a title. Evaluated on PUBLIC facts only (nationality, home town). */
export type Eligibility =
  | { kind: 'any' }
  | { kind: 'nations'; nations: string[] }
  | { kind: 'towns'; nations: string[]; towns: string[] }

export interface TitleDef {
  /** Opaque id used by state (`TitleRec` keys, ranking lists). Never shown. */
  id: string
  level: TitleLevel
  eligibility: Eligibility
  /** Contenders listed behind the champion. */
  rankingCount: number
  /** A challenger ranked this high (1 = best) may fight the champion for the belt. */
  challengerLimit: number
  /** Fewest eligible, ranked fighters a division needs for the title to be contested at all. */
  minPool: number
  /** Fewest professional fights to be rated. */
  minFights: number
  /** Smallest win share (wins ÷ bouts) to be rated at all: a fighter on a losing record is not a world title contender. */
  minWinShare: number
  /** Weeks without a defence before the body orders a mandatory challenge / the window to make it / inactivity strip. */
  mandatoryAfterWeeks: number
  mandatoryWindowWeeks: number
  inactiveStripWeeks: number
  /** 0–100: how much a belt of this body is worth in market value and fight appeal (a game weighting). */
  prestige: number
  /**
   * What a fighter must have on their record to be a credible CHALLENGER (being rated is not enough). Public facts only: professional
   * fights, wins, and the share of fights won. A challenger ordered by the body (mandatory, or the winner of an eliminator) is exempt.
   */
  challenger: { fights: number; wins: number; share: number }
}

/** The record a challenger needs, by level. Rising with the level: an area title shot needs a proven prospect, a world title shot a proven contender. */
export const CHALLENGER_REQ: Record<TitleLevel, { fights: number; wins: number; share: number }> = {
  area: { fights: 8, wins: 5, share: 0.58 },
  domestic: { fights: 10, wins: 7, share: 0.6 },
  european: { fights: 12, wins: 8, share: 0.6 },
  world: { fights: 15, wins: 10, share: 0.62 },
}

/** Why a record is not yet enough for this belt (null when it is). */
export function challengerShortfall(def: TitleDef, rec: { wins: number; losses: number; draws: number }): string | null {
  const n = rec.wins + rec.losses + rec.draws
  const q = def.challenger
  const need: string[] = []
  if (n < q.fights) need.push(`${q.fights} professional fights (has ${n})`)
  if (rec.wins < q.wins) need.push(`${q.wins} wins (has ${rec.wins})`)
  if (n >= q.fights && rec.wins >= q.wins && rec.wins / Math.max(1, n) < q.share) need.push(`a better record: ${Math.round(q.share * 100)}% of fights won (has ${Math.round((100 * rec.wins) / Math.max(1, n))}%)`)
  return need.length ? `Needs ${need.join(', ')}.` : null
}

const UK = ['ENG', 'SCO', 'WAL']
const T = (id: string, level: TitleLevel, eligibility: Eligibility, p: Partial<TitleDef> = {}): TitleDef => ({
  id, level, eligibility, rankingCount: 10, challengerLimit: 8, minPool: 4, minFights: 5, minWinShare: 0.3,
  mandatoryAfterWeeks: 40, mandatoryWindowWeeks: 26, inactiveStripWeeks: 78, prestige: 60, challenger: CHALLENGER_REQ[level], ...p,
})

export const TITLE_DEFS: TitleDef[] = [
  // WORLD (the four major world titles) — open to everyone.
  T('atlas', 'world', { kind: 'any' }, { minWinShare: 0.4, prestige: 100, rankingCount: 10, challengerLimit: 5, minPool: 6, minFights: 10 }),
  T('pioneer', 'world', { kind: 'any' }, { minWinShare: 0.4, prestige: 96, rankingCount: 10, challengerLimit: 4, minPool: 7, minFights: 10 }),
  T('crown', 'world', { kind: 'any' }, { minWinShare: 0.4, prestige: 94, rankingCount: 10, challengerLimit: 5, minPool: 8, minFights: 10 }),
  T('apex', 'world', { kind: 'any' }, { minWinShare: 0.4, prestige: 92, rankingCount: 10, challengerLimit: 4, minPool: 10, minFights: 10 }),
  // EUROPEAN
  T('european', 'european', { kind: 'nations', nations: [...UK, 'IRL', 'UKR', 'POL', 'GER'] }, { minWinShare: 0.3, prestige: 70, rankingCount: 8, challengerLimit: 4, mandatoryAfterWeeks: 44, minPool: 5, minFights: 8 }),
  // DOMESTIC
  T('british', 'domestic', { kind: 'nations', nations: UK }, { minWinShare: 0.3, prestige: 62, rankingCount: 8, challengerLimit: 4, mandatoryAfterWeeks: 40, minPool: 5, minFights: 6 }),
  T('commonwealth', 'domestic', { kind: 'nations', nations: [...UK, 'AUS', 'NGA', 'GHA'] }, { minWinShare: 0.3, prestige: 58, rankingCount: 8, challengerLimit: 4, mandatoryAfterWeeks: 48, minPool: 5, minFights: 6 }),
  // AREA (home-town based; a game abstraction of regional boxing)
  T('area_wal', 'area', { kind: 'nations', nations: ['WAL'] }, { prestige: 36, rankingCount: 5, challengerLimit: 3, mandatoryAfterWeeks: 52, minPool: 4, minFights: 4, inactiveStripWeeks: 104 }),
  T('area_eng', 'area', { kind: 'nations', nations: ['ENG'] }, { prestige: 38, rankingCount: 6, challengerLimit: 3, mandatoryAfterWeeks: 52, minPool: 4, minFights: 4, inactiveStripWeeks: 104 }),
  T('area_nor', 'area', { kind: 'towns', nations: ['ENG'], towns: ['Manchester', 'Liverpool', 'Newcastle'] }, { prestige: 34, rankingCount: 5, challengerLimit: 3, mandatoryAfterWeeks: 52, minPool: 4, minFights: 4, inactiveStripWeeks: 104 }),
  T('area_cen', 'area', { kind: 'towns', nations: ['ENG'], towns: ['Sheffield', 'Leeds'] }, { prestige: 34, rankingCount: 5, challengerLimit: 3, mandatoryAfterWeeks: 52, minPool: 4, minFights: 4, inactiveStripWeeks: 104 }),
  T('area_mid', 'area', { kind: 'towns', nations: ['ENG'], towns: ['Birmingham'] }, { prestige: 33, rankingCount: 5, challengerLimit: 3, mandatoryAfterWeeks: 52, minPool: 4, minFights: 4, inactiveStripWeeks: 104 }),
  T('area_sou', 'area', { kind: 'towns', nations: ['ENG'], towns: ['London', 'Bristol'] }, { prestige: 35, rankingCount: 5, challengerLimit: 3, mandatoryAfterWeeks: 52, minPool: 4, minFights: 4, inactiveStripWeeks: 104 }),
]

export const TITLE_DEF_BY_ID: Record<string, TitleDef> = Object.fromEntries(TITLE_DEFS.map((d) => [d.id, d]))
export const TITLE_IDS = TITLE_DEFS.map((d) => d.id)
export const LEVEL_ORDER: TitleLevel[] = ['area', 'domestic', 'european', 'world']
export const LEVEL_LABEL: Record<TitleLevel, string> = { area: 'Area', domestic: 'Domestic', european: 'European', world: 'World' }
export const levelOf = (bodyId: string): TitleLevel => TITLE_DEF_BY_ID[bodyId]?.level ?? 'world'
export const levelRank = (l: TitleLevel): number => LEVEL_ORDER.indexOf(l)

/** Game abstraction: how much a belt of each level adds to a fighter's standing and a fight's pull. */
export const LEVEL_STAKES: Record<TitleLevel, { value: number; appeal: number; purse: number }> = {
  area: { value: 40, appeal: 2.5, purse: 1.15 },
  domestic: { value: 62, appeal: 5, purse: 1.3 },
  european: { value: 75, appeal: 7, purse: 1.45 },
  world: { value: 100, appeal: 11, purse: 1.8 },
}

/** Does a fighter satisfy a body's eligibility rule? Public facts only. */
export function isEligibleFor(def: TitleDef, f: { nationality: string; hometown: string }): boolean {
  const e = def.eligibility
  if (e.kind === 'any') return true
  if (e.kind === 'nations') return e.nations.includes(f.nationality)
  return e.nations.includes(f.nationality) && e.towns.includes(f.hometown)
}

export function eligibilityReason(def: TitleDef, f: { nationality: string; hometown: string }, nationName: string): string {
  if (isEligibleFor(def, f)) return def.eligibility.kind === 'any' ? 'Open to every division fighter.' : `Eligible: ${f.hometown}, ${nationName}.`
  const e = def.eligibility
  if (e.kind === 'nations') return `Not eligible: ${nationName} is outside this title’s territory.`
  return `Not eligible: ${f.hometown} is outside this area.`
}

export type { WeightClassId }

/**
 * Championship DISTANCE, as data: the scheduled rounds of a fight with a belt on the line, by the highest level at stake. World,
 * European, British and Commonwealth titles are twelve rounds; an area title has its own configured distance. An eliminator is a
 * championship-class bout and carries the distance configured here. `business/fightRounds.ts` is the only place these are applied.
 */
export const TITLE_ROUNDS: Record<TitleLevel, number> = { world: 12, european: 12, domestic: 12, area: 10 }
export const ELIMINATOR_ROUNDS: Record<TitleLevel, number> = { world: 12, european: 12, domestic: 10, area: 8 }
