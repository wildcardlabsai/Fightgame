/**
 * LONG-TERM STRATEGY. The player chooses what kind of promotion to build (a focus) and how to run it (a stance). Both are tendencies,
 * not classes: they can be changed (a change is felt for a few weeks while the business turns), and none is best everywhere. Each
 * choice moves real numbers elsewhere in the game - growth, demand, costs, what rivals bring to the table - and each pays for its
 * advantage with a disadvantage somewhere else. Nothing here creates money.
 *
 *   focus   prospects   fighters up to 24 develop 6% faster; cards full of prospects draw a little more, cards built on one big name a little less
 *           regional    home-country shows in small and mid-size rooms draw 4% more; arenas and stadiums draw 3% less
 *           contender   cards with a title or ranked headline fight draw 3% more; cards without one 1% less; title opportunities reach you more often
 *           headline    cards led by a genuine draw (popularity 45+) draw 4% more; cards led by a minor name 4% less
 *
 *   stance  growth      marketing works 8% harder; the office costs 6% more to run
 *           stability   the office costs 4% less and venues 2% less; marketing works 5% less hard
 *           prestige    a title win lifts the promotion's standing 30% more; the office costs 3% more; cards without a title or ranked bout draw 2% less
 */
import { fighterAge } from '../fighters'
import { rankIn } from '../media/rankings'
import type { BoxingEvent, Fight, Fighter, GameState } from '../types'
import { officeOf } from './state'
import type { Strategy, StrategyFocus, StrategyStance } from './types'

export const FOCUS_INFO: Record<StrategyFocus, { label: string; blurb: string; gain: string; cost: string }> = {
  prospects: { label: 'Prospect developer', blurb: 'Sign affordable talent, build fighters gradually and sell the long game.', gain: 'Fighters up to 24 develop 6% faster; prospect-heavy cards draw a little more; development bouts come your way.', cost: 'Cards built around one big name draw 3% less.' },
  regional: { label: 'Regional powerhouse', blurb: 'Regular, affordable shows for local audiences with local talent.', gain: 'Home-country shows in small and mid-size rooms draw 4% more.', cost: 'Arenas and stadiums draw 3% less: the brand is not national.' },
  contender: { label: 'Championship contender', blurb: 'Stronger fighters, real title pathways and the sporting milestones that go with them.', gain: 'Cards with a title or ranked headline fight draw 3% more; title and eliminator opportunities reach you more often.', cost: 'Cards without a title or ranked bout draw 1% less.' },
  headline: { label: 'Commercial headline promotion', blurb: 'Marketable fighters, big nights and the broadcast market, at higher risk.', gain: 'Cards led by a genuine draw (popularity 45+) draw 4% more; commercial matchups come your way.', cost: 'Cards led by a minor name draw 4% less.' },
}
export const STANCE_INFO: Record<StrategyStance, { label: string; blurb: string; gain: string; cost: string }> = {
  growth: { label: 'Growth', blurb: 'Spend to get bigger, faster.', gain: 'Marketing works 8% harder.', cost: 'The office costs 6% more to run.' },
  stability: { label: 'Stability', blurb: 'Keep the business lean and the reserves intact.', gain: 'The office costs 4% less and venues 2% less.', cost: 'Marketing works 5% less hard.' },
  prestige: { label: 'Prestige', blurb: 'Build a name for championship boxing.', gain: 'A title win lifts the promotion\'s standing 30% more.', cost: 'The office costs 3% more; cards without a title or ranked bout draw 2% less.' },
}
export const FOCUS_ORDER: StrategyFocus[] = ['prospects', 'regional', 'contender', 'headline']
export const STANCE_ORDER: StrategyStance[] = ['growth', 'stability', 'prestige']

const cardFights = (state: GameState, ev: BoxingEvent): Fight[] => ev.card.map((id) => state.fights[id]).filter((f): f is Fight => !!f && f.status !== 'cancelled')
const TRANSITION_WEEKS = 8
export const strategyOf = (state: GameState): Strategy => state.office?.strategy ?? { focus: null, stance: null, since: state.startDay, changes: 0 }

/** How fully the current strategy applies: half-strength for the weeks after a change (the business is still turning). */
export function strategyWeight(state: GameState): number {
  const s = strategyOf(state)
  if (s.changes === 0) return 1
  const weeks = Math.max(0, Math.floor((state.today - s.since) / 7))
  return weeks >= TRANSITION_WEEKS ? 1 : 0.5
}

/** Change direction. Free to do, but a change is only half-effective for eight weeks. A focus or stance left as it is changes nothing. */
export function setStrategy(state: GameState, focus: StrategyFocus | null, stance: StrategyStance | null): boolean {
  const o = officeOf(state)
  if (o.strategy.focus === focus && o.strategy.stance === stance) return false
  o.strategy = { focus, stance, since: state.today, changes: o.strategy.changes + 1 }
  return true
}

const mix = (base: number, w: number) => 1 + (base - 1) * w

export function strategyGrowth(state: GameState, f: Fighter): number {
  const s = strategyOf(state)
  return s.focus === 'prospects' && fighterAge(f, state.today) <= 24 ? mix(1.06, strategyWeight(state)) : 1
}

const rankedBout = (state: GameState, fid: string, wc: string): boolean => {
  const media = state.media
  if (!media) return false
  for (const body of ['atlas', 'pioneer', 'crown', 'apex']) { const r = rankIn(media, body, wc as never, fid); if (r !== null && r <= 10) return true }
  return false
}

/** What kind of night the card is, from public facts: a title/eliminator in the top two, a ranked bout, the headliners' draw, prospect share. */
export function cardProfile(state: GameState, ev: BoxingEvent): { titleMain: boolean; rankedMain: boolean; headlinerPop: number; prospectShare: number; mainStar: boolean } {
  const fights = cardFights(state, ev)
  const top = fights.slice(-2)
  const titleMain = top.some((f) => !!f.title)
  const rankedMain = top.some((f) => rankedBout(state, f.sideA.fighterId, f.weightClass) && rankedBout(state, f.sideB.fighterId, f.weightClass))
  const main = fights[fights.length - 1]
  const headlinerPop = main ? Math.max(state.fighters[main.sideA.fighterId].popularity, state.fighters[main.sideB.fighterId].popularity) : 0
  let young = 0, n = 0
  for (const f of fights) for (const s of [f.sideA, f.sideB]) { const x = state.fighters[s.fighterId]; n++; if (fighterAge(x, state.today) <= 24) young++ }
  return { titleMain, rankedMain, headlinerPop, prospectShare: n ? young / n : 0, mainStar: headlinerPop >= 45 }
}

/** The public demand multiplier the player's strategy puts on one of their shows (1 for rivals' shows). Used for forecast and actual alike. */
export function strategyDemand(state: GameState, ev: BoxingEvent): number {
  if (ev.promotionId !== state.playerPromotionId) return 1
  const s = strategyOf(state)
  const w = strategyWeight(state)
  const v = state.venues[ev.venueId]
  const p = cardProfile(state, ev)
  let m = 1
  switch (s.focus) {
    case 'prospects': m *= p.prospectShare >= 0.5 ? mix(1.02, w) : p.mainStar && p.prospectShare < 0.25 ? mix(0.97, w) : 1; break
    case 'regional': m *= v && ['local', 'regional'].includes(v.tier) && v.country === state.promotions[ev.promotionId].homeCountry ? mix(1.04, w) : v && ['arena', 'stadium'].includes(v.tier) ? mix(0.97, w) : 1; break
    case 'contender': m *= p.titleMain || p.rankedMain ? mix(1.03, w) : mix(0.99, w); break
    case 'headline': m *= p.headlinerPop >= 45 ? mix(1.04, w) : p.headlinerPop < 25 ? mix(0.96, w) : 1; break
  }
  if (s.stance === 'prestige' && !(p.titleMain || p.rankedMain)) m *= mix(0.98, w)
  return m
}

export function strategyMarketing(state: GameState): number {
  const s = strategyOf(state).stance
  return s === 'growth' ? mix(1.08, strategyWeight(state)) : s === 'stability' ? mix(0.95, strategyWeight(state)) : 1
}
export function strategyOverhead(state: GameState): number {
  const s = strategyOf(state).stance
  return s === 'growth' ? mix(1.06, strategyWeight(state)) : s === 'stability' ? mix(0.96, strategyWeight(state)) : s === 'prestige' ? mix(1.03, strategyWeight(state)) : 1
}
export function strategyVenue(state: GameState): number { return strategyOf(state).stance === 'stability' ? mix(0.98, strategyWeight(state)) : 1 }
export function strategyStanding(state: GameState): number { return strategyOf(state).stance === 'prestige' ? mix(1.3, strategyWeight(state)) : 1 }

/** Public one-line summary of how the card fits the current direction (for the event page). */
export function strategyNote(state: GameState, ev: BoxingEvent): string | null {
  const m = strategyDemand(state, ev)
  if (Math.abs(m - 1) < 0.005) return null
  const pct = Math.round((m - 1) * 100)
  const f = strategyOf(state).focus
  return `${f ? FOCUS_INFO[f].label : 'Your'} direction: this card ${pct > 0 ? `draws about ${pct}% more` : `draws about ${-pct}% less`} than it otherwise would.`
}
