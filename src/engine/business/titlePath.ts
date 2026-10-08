/**
 * TITLE PATH, READ-ONLY, plus the one command behind "Request a title fight". For each of the player's fighters: which belts they
 * could fight for right now (and against whom), and for the rest, the shortest honest list of what they still need. The request itself
 * is not a new mechanic: it opens the same fight negotiation as approaching any opponent, aimed at the person the title rules name
 * (the champion, the other eliminator, or the leading rival for a vacant belt). Nothing here shows reservation prices or hidden traits.
 */
import { weightClassLabel } from '../../data/weightClasses'
import { bodyIdentity } from '../../data/mediaIdentity'
import { fighterName } from '../fighters'
import { validateMatch } from '../fights'
import { approachOpponent, type FightOutcome } from '../fightNegotiation'
import { rosterOf } from '../media/requests'
import type { Fighter, GameState, Id } from '../types'
import { STATUS_LABEL, contenderStatus, nextMilestone, titleEligibility, titleOpportunities, type Eligibility, type Opportunity } from './titleEco'
import { LEVEL_LABEL, TITLE_DEF_BY_ID, levelRank, type TitleLevel } from './titleDefs'
import { SANCTIONING } from '../media/orgs'

export type TargetState = 'ready' | 'blocked' | 'building'
export interface TitleTarget {
  body: string
  shortName: string
  title: string
  level: TitleLevel
  levelLabel: string
  state: TargetState
  rank: number | null
  limit: number
  /** One short line: what this belt means for the fighter right now. */
  headline: string
  /** Short, concrete things still needed (empty when ready). */
  needs: string[]
  /** The fight the request would open. */
  request: { opponentId: Id; opponentName: string; label: string } | null
  /** Why a ready belt cannot be requested at this moment (injury, booked, talks collapsed...). */
  blocked: string | null
}

export interface TitlePathView {
  id: Id
  name: string
  division: string
  record: string
  statusLabel: string
  next: string
  /** The single most useful target: the highest belt that can be requested, else the closest one. */
  best: TitleTarget | null
  targets: TitleTarget[]
  readyCount: number
  openFightId: Id | null
}

const REQUEST_KINDS: Record<string, string> = { CHALLENGE: 'Challenge for the title', MANDATORY_SHOT: 'Take the mandatory shot', VACANT: 'Fight for the vacant title', ELIMINATOR: 'Book the eliminator', DEFENCE_OPEN: 'Offer a defence', DEFENCE_DUE: 'Book the mandatory defence' }

const needsFor = (e: Eligibility, short: string, f: Fighter): string[] => {
  const d = TITLE_DEF_BY_ID[e.body]
  const n = f.record.wins + f.record.losses + f.record.draws
  if (e.status === 'ranked') return [`Reach the top ${e.limit} of the ${short} list (now #${e.rank}).`, 'Win against ranked fighters and keep fighting to climb.']
  if (e.status === 'unranked') {
    if (d && n < d.minFights) return [`Needs ${d.minFights} professional fights to be rated (has ${n}).`]
    return [`Get into the ${short} top ${d?.rankingCount ?? 10}.`, 'Win against rated opponents and stay active.']
  }
  if (e.status === 'eliminator') return ['Win the ordered eliminator first.']
  return e.reasons.slice(-1)
}

function targetFor(state: GameState, f: Fighter, e: Eligibility, opps: Opportunity[], hardBlock: string | null): TitleTarget | null {
  if (e.status === 'dormant' || e.status === 'ineligible') return null
  const short = bodyIdentity(e.body).shortName
  const base = { body: e.body, shortName: short, title: e.title, level: e.level, levelLabel: LEVEL_LABEL[e.level], rank: e.rank, limit: e.limit }
  const o = opps.find((x) => x.body === e.body && x.opponentId && state.fighters[x.opponentId])
  if (o && o.opponentId) {
    const oppName = fighterName(state.fighters[o.opponentId])
    const check = validateMatch(state, f.id, o.opponentId)
    const blocked = hardBlock ?? (check.ok ? null : check.reason)
    const verb = REQUEST_KINDS[o.kind] ?? 'Request the fight'
    return { ...base, state: blocked ? 'blocked' : 'ready', headline: e.status === 'champion' ? `Holds the ${short} belt` : `${verb} against ${oppName}`, needs: [], request: { opponentId: o.opponentId, opponentName: oppName, label: verb }, blocked }
  }
  if (e.status === 'champion') return null
  return { ...base, state: 'building', headline: e.status === 'ranked' ? `#${e.rank} with the ${short}, top ${e.limit} can challenge` : e.status === 'eliminator' ? 'Eliminator ordered' : `Not yet rated by ${short}`, needs: needsFor(e, short, f), request: null, blocked: null }
}

/** Every belt a fighter could realistically be aiming at, with the request that is open to them and what is missing for the rest. */
export function titlePathFor(state: GameState, f: Fighter): TitlePathView {
  const opps = titleOpportunities(state, f)
  const open = f.activeFightId && state.fights[f.activeFightId] && !state.fights[f.activeFightId].result ? f.activeFightId : null
  const hardBlock = open ? 'Already has a fight in the works.' : null
  const targets: TitleTarget[] = []
  for (const o of SANCTIONING) {
    const t = targetFor(state, f, titleEligibility(state, f, o.id), opps, hardBlock)
    if (t) targets.push(t)
  }
  const rank = (t: TitleTarget) => (t.state === 'ready' ? 0 : t.state === 'blocked' ? 1 : 2)
  const gap = (t: TitleTarget) => (t.rank === null ? 99 : Math.max(0, t.rank - t.limit))
  targets.sort((a, b) => rank(a) - rank(b) || (a.state === 'building' ? gap(a) - gap(b) : 0) || levelRank(b.level) - levelRank(a.level))
  const next = nextMilestone(state, f)
  return {
    id: f.id, name: fighterName(f), division: weightClassLabel(f.weightClass), record: `${f.record.wins}-${f.record.losses}-${f.record.draws}`, statusLabel: STATUS_LABEL[contenderStatus(state, f)], next: next.text,
    best: targets[0] ?? null, targets, readyCount: targets.filter((t) => t.state === 'ready').length, openFightId: open,
  }
}

/** One card per fighter on the player's roster, fighters who can request a title fight first. */
export function myTitlePaths(state: GameState): TitlePathView[] {
  return rosterOf(state).filter((f) => f.status === 'active').map((f) => titlePathFor(state, f))
    .sort((a, b) => b.readyCount - a.readyCount || (a.best?.state === 'building' ? 1 : 0) - (b.best?.state === 'building' ? 1 : 0) || a.name.localeCompare(b.name))
}

/** Where the fighter's request would lead: the fight, still to be negotiated. Refuses unless the title rules allow it today. */
export function requestTitleFight(input: GameState, fighterId: Id, body: string): FightOutcome {
  const f = input.fighters[fighterId]
  if (!f) return { ok: false, error: 'Unknown fighter.', state: input }
  const target = titlePathFor(input, f).targets.find((t) => t.body === body)
  if (!target || !target.request) return { ok: false, error: 'They are not in a position to ask for that title fight yet.', state: input }
  if (target.state === 'blocked') return { ok: false, error: target.blocked ?? 'That fight cannot be requested right now.', state: input }
  return approachOpponent(input, fighterId, target.request.opponentId)
}
