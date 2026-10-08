/**
 * DIVISION MOVES. A fighter can move up or down a weight class — the player decides for their own roster (the camp must agree),
 * and rivals' fighters move on their own ambition. A move is a real event:
 *
 *  - belts held in the old division are RELINQUISHED, with the reason on the record (reigns, career line, story);
 *  - ranked places in the old division simply lapse (lists are rebuilt from results and the fighter appears in the new division
 *    wherever their record entitles them — no one is handed a ranking);
 *  - the body changes a little: moving up adds power and chin at some cost in speed and stamina, moving down the reverse plus the strain
 *    of the cut;
 *  - a booked bout has to be finished first, and a fighter moves at most once every 52 weeks.
 */
import { WEIGHT_CLASSES, weightClassLabel } from '../../data/weightClasses'
import { clamp, fighterAge, fighterName } from '../fighters'
import { keyedFloat } from '../rng'
import { titlesHeldBy, vacateTitle } from '../media/titles'
import { postMessage } from '../messages'
import type { Fighter, GameState, Id, WeightClassId } from '../types'
import { ambitionOf } from './manager'
import { biz } from './talkCore'

const WEEKS = 7
const COOLDOWN_WEEKS = 52

export interface DivisionOption { dir: 'up' | 'down'; to: WeightClassId; label: string; blocked: string | null }

const idx = (wc: WeightClassId): number => WEIGHT_CLASSES.findIndex((w) => w.id === wc)

export function divisionMoveOptions(state: GameState, f: Fighter): DivisionOption[] {
  const i = idx(f.weightClass)
  const last = state.business?.moved?.[f.id]
  let blocked: string | null = null
  if (f.status !== 'active') blocked = 'Retired'
  else if (f.activeFightId) blocked = 'Has a fight booked'
  else if (last !== undefined && state.today - last < COOLDOWN_WEEKS * WEEKS) blocked = 'Moved division within the last year'
  const out: DivisionOption[] = []
  if (i < WEIGHT_CLASSES.length - 1) out.push({ dir: 'up', to: WEIGHT_CLASSES[i + 1].id, label: WEIGHT_CLASSES[i + 1].name, blocked })
  if (i > 0) out.push({ dir: 'down', to: WEIGHT_CLASSES[i - 1].id, label: WEIGHT_CLASSES[i - 1].name, blocked })
  return out
}

/** Would the fighter’s camp agree? Public reasons only. */
export function campAgrees(state: GameState, f: Fighter): string | null {
  const rel = f.promoRelations[state.playerPromotionId] ?? 0
  if (rel <= -20) return `${f.firstName}’s camp does not trust you enough to discuss a change of division.`
  if (f.morale < 25) return `${f.firstName} is in no state to make a change of division right now.`
  return null
}

function reshape(f: Fighter, dir: 'up' | 'down'): void {
  const a = f.attributes
  if (dir === 'up') { a.power = clamp(a.power + 2.5); a.chin = clamp(a.chin + 1); a.speed = clamp(a.speed - 2); a.stamina = clamp(a.stamina - 1.5) }
  else { a.speed = clamp(a.speed + 1.5); a.stamina = clamp(a.stamina + 1); a.power = clamp(a.power - 1.5); f.fitness = clamp(f.fitness - 10, 20, 100) }
}

/** Perform the move on `state` (the caller clones). Returns an error string if it cannot be done. */
export function applyDivisionMove(state: GameState, fighterId: Id, to: WeightClassId): string | null {
  const f = state.fighters[fighterId]
  if (!f) return 'Unknown fighter.'
  const opt = divisionMoveOptions(state, f).find((o) => o.to === to)
  if (!opt) return 'That is not the next division.'
  if (opt.blocked) return opt.blocked
  const from = f.weightClass
  const media = state.media
  const events = []
  if (media) {
    for (const t of titlesHeldBy(media, f.id).filter((x) => x.wc === from)) events.push(...vacateTitle(state, media, t.body, from, `relinquished — moving ${opt.dir} to ${opt.label}`))
    // Pending orders involving this fighter in the old division lapse with the move.
    for (const rec of Object.values(media.titles)) {
      if (rec.mand?.challenger === f.id) rec.mand = undefined
      if (rec.elim && (rec.elim.a === f.id || rec.elim.b === f.id) && !rec.elim.fightId) rec.elim = undefined
    }
    ;(media.queue ??= []).push(...events, { kind: 'DIVISION_MOVE', body: 'atlas', wc: to, f: f.id, how: `${weightClassLabel(from)} to ${opt.label}` })
  }
  f.weightClass = to
  reshape(f, opt.dir)
  const b = biz(state)
  ;(b.moved ??= {})[f.id] = state.today
  if (f.contractId && state.contracts[f.contractId]?.promotionId === state.playerPromotionId) {
    postMessage(state, {
      from: 'Agent', category: 'fighter', priority: 'normal', subject: `${fighterName(f)} moves to ${opt.label}`,
      body: `${f.firstName} will now campaign at ${opt.label}${events.length ? ' and has given up the belts held at the old weight' : ''}. They start unranked wherever their record does not yet earn a place.`,
      link: { kind: 'fighter', id: f.id },
    })
  }
  return null
}

/**
 * Rivals’ fighters whose ambition is to move up do so now and then. Deterministic (keyed on seed, fighter, week), never touches the
 * main random stream, and only runs while the media world feeds the economy (champions’ belts come from it).
 */
export function aiDivisionMoves(state: GameState): void {
  if (!state.media?.effects) return
  const week = Math.floor((state.today - state.startDay) / 7)
  if (week % 4 !== 0) return
  for (const f of Object.values(state.fighters)) {
    if (f.status !== 'active' || f.activeFightId || fighterAge(f, state.today) > 29) continue
    const c = f.contractId ? state.contracts[f.contractId] : null
    if (c?.promotionId === state.playerPromotionId) continue
    if (keyedFloat(state.seed, 'divmove', f.id, week) > 0.03) continue
    if (ambitionOf(state, f).kind !== 'MOVE_UP_DIVISION') continue
    const up = divisionMoveOptions(state, f).find((o) => o.dir === 'up' && !o.blocked)
    if (up) applyDivisionMove(state, f.id, up.to)
  }
}
