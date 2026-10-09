/**
 * MATCHMAKING — what the PLAYER can see when choosing an opponent.
 * Every number here comes from beliefs (FighterView ranges built from scouting) and public facts. The player's own
 * fighter is judged on the player's belief too. The simulation will use the TRUE attributes, so assessments can be wrong
 * — that gap is the game.
 */
import { opponentFit, type OpponentFit } from './office/goals'
import { weeksBetween } from './calendar'
import { baseMoney, valueOf } from './market'
import { weightCompatible } from './fight/profile'
import { matchupNote } from './fight/styles'
import { fightAvailability, lockKey, validateMatch } from './fights'
import { weightClassLabel } from '../data/weightClasses'
import type { FightingStyle, GameState, Id, WeightClassId } from './types'
import { viewsOf, type FighterView } from './view'

export interface Assessment {
  /** Estimated chance our fighter wins (a range — our knowledge is imperfect). */
  winLo: number
  winHi: number
  winLabel: 'Heavy favourite' | 'Favourite' | 'Slight favourite' | 'Even' | 'Slight underdog' | 'Underdog' | 'Heavy underdog'
  difficulty: number
  reward: number
  koRisk: 'Low' | 'Moderate' | 'High'
  confidence: 'Low' | 'Medium' | 'High'
  styleNote: string
  notes: string[]
  /** One-line verdict: Low risk / Competitive / High risk. */
  verdict: 'Low risk' | 'Competitive' | 'High risk'
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))
const sdOf = (r: { lo: number; hi: number }) => (r.hi - r.lo) / 2 / 1.5

function winLabel(p: number): Assessment['winLabel'] {
  return p >= 0.82 ? 'Heavy favourite' : p >= 0.68 ? 'Favourite' : p >= 0.56 ? 'Slight favourite' : p > 0.44 ? 'Even' : p > 0.32 ? 'Slight underdog' : p > 0.18 ? 'Underdog' : 'Heavy underdog'
}

export function assess(me: FighterView, opp: FighterView): Assessment {
  const diff = me.grade.mid - opp.grade.mid
  const sd = Math.sqrt(sdOf(me.grade) ** 2 + sdOf(opp.grade) ** 2)
  const pMid = sigmoid(diff / 9)
  const pLo = sigmoid((diff - sd) / 9)
  const pHi = sigmoid((diff + sd) / 9)
  const difficulty = Math.max(1, Math.min(5, Math.round(6 * (1 - pMid))))
  const oppScore = 0.55 * opp.reputation + 0.45 * opp.popularity
  const myScore = 0.55 * me.reputation + 0.45 * me.popularity
  let reward = Math.round(1 + oppScore / 22)
  if (opp.reputation > me.reputation + 10) reward += 1
  if (opp.reputation < me.reputation - 20) reward -= 1
  reward = Math.max(1, Math.min(5, reward))
  const chin = me.traits.physical.find((t) => t.key === 'chin')!
  const koScore = (opp.koRate / 100) * 0.6 + ((60 - chin.mid) / 100) * 0.6 + (opp.record.koWins >= 8 ? 0.05 : 0)
  const koRisk: Assessment['koRisk'] = koScore > 0.42 ? 'High' : koScore > 0.28 ? 'Moderate' : 'Low'
  const conf = [me.knowledge.confidence, opp.knowledge.confidence]
  const confidence: Assessment['confidence'] = conf.includes('Low') ? 'Low' : conf.includes('Medium') ? 'Medium' : 'High'
  const notes: string[] = []
  if (opp.knowledge.reports === 0) notes.push('You have no scouting on this opponent — the picture is a rough guess.')
  if (opp.stage === 'Journeyman') notes.push('A journeyman: durable and awkward, rarely a threat — but wins here barely move the needle.')
  if (opp.record.losses === 0 && opp.fights >= 8) notes.push('Unbeaten — a win would be noticed.')
  if (opp.age >= 35) notes.push('Veteran with miles on the clock.')
  if (myScore > 0 && oppScore < myScore - 25) notes.push('Beating someone this far down the ladder brings little reward.')
  const verdict: Assessment['verdict'] = pMid >= 0.7 ? 'Low risk' : pMid >= 0.42 ? 'Competitive' : 'High risk'
  return { winLo: Math.round(pLo * 100), winHi: Math.round(pHi * 100), winLabel: winLabel(pMid), difficulty, reward, koRisk, confidence, styleNote: matchupNote(me.style as FightingStyle, opp.style as FightingStyle), notes, verdict }
}

export interface OpponentFilters {
  q?: string
  contract?: '' | 'free' | 'rival'
  minRep?: number
  maxRep?: number
  minAge?: number
  maxAge?: number
  style?: string
  division?: WeightClassId | ''
  showUnavailable?: boolean
}

export interface OpponentCandidate {
  view: FighterView
  compat: 'same' | 'catchweight'
  assessment: Assessment
  purseLo: number
  purseHi: number
  canApproach: boolean
  blockedReason: string | null
  earliestWeeks: number
  previousMeetings: number
  rematch: boolean
  rivalry: number
  recentOpponent: boolean
  /** Public geography hint. */
  home: 'Their home turf' | 'Neutral' | 'Your region'
  /** How the opponent sits against the fighter's risk appetite (the promoter's plan for him). */
  fit: OpponentFit
}

export function opponentCandidates(state: GameState, myId: Id, f: OpponentFilters = {}): OpponentCandidate[] {
  const views = viewsOf(state)
  const me = views.fighter(myId)
  const mine = state.fighters[myId]
  if (!me || !mine) return []
  const q = (f.q ?? '').trim().toLowerCase()
  const out: OpponentCandidate[] = []
  const history = mine.recentFights.map((id) => state.fights[id]).filter(Boolean)
  for (const v of views.known()) {
    if (v.id === myId || v.status !== 'active' || v.contract.kind === 'own') continue
    const raw = state.fighters[v.id]
    const compat = weightCompatible(mine.weightClass, raw.weightClass)
    if (compat === 'no') continue
    if (f.division && raw.weightClass !== f.division) continue
    if (q && !v.name.toLowerCase().includes(q) && !(v.nickname ?? '').toLowerCase().includes(q)) continue
    if (f.contract === 'free' && v.contract.kind !== 'none') continue
    if (f.contract === 'rival' && v.contract.kind !== 'rival') continue
    if (f.minRep !== undefined && v.reputation < f.minRep) continue
    if (f.maxRep !== undefined && v.reputation > f.maxRep) continue
    if (f.minAge !== undefined && v.age < f.minAge) continue
    if (f.maxAge !== undefined && v.age > f.maxAge) continue
    if (f.style && v.style !== f.style) continue
    const check = validateMatch(state, myId, v.id)
    if (!check.ok && !f.showUnavailable) continue
    const av = fightAvailability(state, raw)
    const prev = history.filter((h) => h.sideA.fighterId === v.id || h.sideB.fighterId === v.id)
    const lastPrev = prev[prev.length - 1]
    const base = baseMoney(valueOf(state, raw)).purse
    // rivalry: previous meetings that were close or stoppages generate heat
    const heat = prev.reduce((n, h) => n + (h.result ? (['SD', 'MD', 'SDRAW', 'MDRAW', 'DRAW'].includes(h.result.method) ? 2 : ['KO', 'TKO'].includes(h.result.method) ? 2 : 1) : 0), 0)
    out.push({
      view: v, compat: compat === 'same' ? 'same' : 'catchweight', assessment: assess(me, v),
      purseLo: Math.round(base * 0.85 * 0.8 / 100) * 100, purseHi: Math.round(base * 0.85 * 1.35 / 100) * 100,
      canApproach: check.ok, blockedReason: check.reason, earliestWeeks: Math.max(1, weeksBetween(state.today, av.earliestDay)),
      previousMeetings: prev.length, rematch: prev.length > 0, rivalry: Math.min(5, heat), recentOpponent: !!lastPrev && state.today - lastPrev.day < 365,
      home: raw.nationality === mine.nationality ? 'Your region' : 'Neutral', fit: opponentFit(state, mine, raw),
    })
  }
  return out
}

export { lockKey, weightClassLabel }
