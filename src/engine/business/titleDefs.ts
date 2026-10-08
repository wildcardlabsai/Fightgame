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
  /** Weeks without a defence before the body orders a mandatory challenge / the window to make it / inactivity strip. */
  mandatoryAfterWeeks: number
  mandatoryWindowWeeks: number
  inactiveStripWeeks: number
  /** 0–100: how much a belt of this body is worth in market value and fight appeal (a game weighting). */
  prestige: number
}

const UK = ['ENG', 'SCO', 'WAL']
const T = (id: string, level: TitleLevel, eligibility: Eligibility, p: Partial<TitleDef> = {}): TitleDef => ({
  id, level, eligibility, rankingCount: 10, challengerLimit: 8, minPool: 4, minFights: 5,
  mandatoryAfterWeeks: 40, mandatoryWindowWeeks: 26, inactiveStripWeeks: 78, prestige: 60, ...p,
})

export const TITLE_DEFS: TitleDef[] = [
  // WORLD (the four major world titles) — open to everyone.
  T('atlas', 'world', { kind: 'any' }, { prestige: 100, rankingCount: 10, challengerLimit: 5, minPool: 5, minFights: 10 }),
  T('pioneer', 'world', { kind: 'any' }, { prestige: 96, rankingCount: 10, challengerLimit: 4, minPool: 5, minFights: 10 }),
  T('crown', 'world', { kind: 'any' }, { prestige: 94, rankingCount: 10, challengerLimit: 5, minPool: 5, minFights: 10 }),
  T('apex', 'world', { kind: 'any' }, { prestige: 92, rankingCount: 10, challengerLimit: 4, minPool: 5, minFights: 10 }),
  // EUROPEAN
  T('european', 'european', { kind: 'nations', nations: [...UK, 'IRL', 'UKR', 'POL', 'GER'] }, { prestige: 70, rankingCount: 8, challengerLimit: 4, mandatoryAfterWeeks: 44, minPool: 4, minFights: 8 }),
  // DOMESTIC
  T('british', 'domestic', { kind: 'nations', nations: UK }, { prestige: 62, rankingCount: 8, challengerLimit: 4, mandatoryAfterWeeks: 40, minPool: 4, minFights: 6 }),
  T('commonwealth', 'domestic', { kind: 'nations', nations: [...UK, 'AUS', 'NGA', 'GHA'] }, { prestige: 58, rankingCount: 8, challengerLimit: 4, mandatoryAfterWeeks: 48, minPool: 4, minFights: 6 }),
  // AREA (home-town based; a game abstraction of regional boxing)
  T('area_wal', 'area', { kind: 'nations', nations: ['WAL'] }, { prestige: 36, rankingCount: 5, challengerLimit: 3, mandatoryAfterWeeks: 52, minPool: 3, minFights: 3, inactiveStripWeeks: 104 }),
  T('area_eng', 'area', { kind: 'nations', nations: ['ENG'] }, { prestige: 38, rankingCount: 6, challengerLimit: 3, mandatoryAfterWeeks: 52, minPool: 3, minFights: 3, inactiveStripWeeks: 104 }),
  T('area_nor', 'area', { kind: 'towns', nations: ['ENG'], towns: ['Manchester', 'Liverpool', 'Newcastle'] }, { prestige: 34, rankingCount: 5, challengerLimit: 3, mandatoryAfterWeeks: 52, minPool: 3, minFights: 3, inactiveStripWeeks: 104 }),
  T('area_cen', 'area', { kind: 'towns', nations: ['ENG'], towns: ['Sheffield', 'Leeds'] }, { prestige: 34, rankingCount: 5, challengerLimit: 3, mandatoryAfterWeeks: 52, minPool: 3, minFights: 3, inactiveStripWeeks: 104 }),
  T('area_mid', 'area', { kind: 'towns', nations: ['ENG'], towns: ['Birmingham'] }, { prestige: 33, rankingCount: 5, challengerLimit: 3, mandatoryAfterWeeks: 52, minPool: 3, minFights: 3, inactiveStripWeeks: 104 }),
  T('area_sou', 'area', { kind: 'towns', nations: ['ENG'], towns: ['London', 'Bristol'] }, { prestige: 35, rankingCount: 5, challengerLimit: 3, mandatoryAfterWeeks: 52, minPool: 3, minFights: 3, inactiveStripWeeks: 104 }),
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
