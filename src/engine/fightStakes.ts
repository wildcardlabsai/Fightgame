/**
 * Presentation read-models for the Fight Night screens (Phase 6.4). Nothing here decides anything: the title at stake is what the fight carries
 * (`fight.title`), who holds it is what the belt record says before the bell, and what the result meant is what the career record logged for
 * each fighter on the day of the fight. If the engine logged nothing, nothing is said.
 */
import { fighterName } from './fighters'
import { titleName } from './media/titles'
import { careerStory } from './media/views'
import type { Fight, GameState, Id } from './types'

export interface TitleStakeView {
  /** "WORLD TITLE", "REGIONAL TITLE"... */
  label: string
  /** The belt, as the rankings and the title table name it. */
  name: string
  kind: 'title' | 'unification' | 'eliminator'
  kindLabel: string
  /** Who was champion going in (side 0 = A, 1 = B). Null for a vacant belt, an eliminator, or where the record does not say. */
  champion: { side: 0 | 1; name: string; defences: number | null } | null
  challenger: { side: 0 | 1; name: string } | null
  vacant: boolean
  /** One plain sentence for the pre-fight header. */
  line: string
  /** After the bell: exactly what was logged for the belts (empty if nothing changed hands and nothing was defended). */
  outcome: string[]
}

export interface ConsequenceView { side: 0 | 1; text: string; tone: 'title' | 'good' | 'bad' | 'note' }

const TITLE_CODES = new Set(['TITLE_WON', 'TITLE_DEFENCE', 'TITLE_LOST', 'UNIFIED', 'UNDISPUTED', 'STRIPPED', 'VACATED'])
const SHOWN = new Set([...TITLE_CODES, 'UPSET', 'FIRST_LOSS', 'SLUMP', 'UNBEATEN', 'ELIM_WON', 'MANDATORY', 'NO1', 'TOP5', 'RANKED', 'KO_STREAK'])
const BAD = new Set(['TITLE_LOST', 'FIRST_LOSS', 'SLUMP', 'STRIPPED'])

/** What the career record logged for each fighter on the day of this fight (empty before the fight is settled). */
export function fightConsequences(state: GameState, fight: Fight): ConsequenceView[] {
  if (!fight.result || !state.media) return []
  const out: ConsequenceView[] = []
  ;([fight.sideA.fighterId, fight.sideB.fighterId] as Id[]).forEach((id, i) => {
    const f = state.fighters[id]
    if (!f) return
    const who = fighterName(f)
    for (const e of careerStory(state, id)) {
      if (e.day !== fight.day || !SHOWN.has(e.kind)) continue
      out.push({ side: i as 0 | 1, text: `${who}: ${e.text}`, tone: TITLE_CODES.has(e.kind) ? 'title' : BAD.has(e.kind) ? 'bad' : 'good' })
    }
  })
  // title lines first
  return out.sort((a, b) => Number(b.tone === 'title') - Number(a.tone === 'title'))
}

/** The title at stake, from the fight's own title flag. Null for an ordinary bout. */
export function titleStakeOf(state: GameState, fight: Fight): TitleStakeView | null {
  const t = fight.title
  if (!t) return null
  const A = state.fighters[fight.sideA.fighterId], B = state.fighters[fight.sideB.fighterId]
  if (!A || !B) return null
  const nm = (i: 0 | 1) => fighterName(i === 0 ? A : B)
  const kind = t.kind ?? 'title'
  const label = ({ regional: 'REGIONAL TITLE', national: 'NATIONAL TITLE', international: 'INTERNATIONAL TITLE', world: 'WORLD TITLE' } as const)[t.tier]
  const kindLabel = kind === 'eliminator' ? 'Title eliminator' : kind === 'unification' ? 'Unification bout' : 'Championship'
  const base = { label, name: t.name, kind, kindLabel } as const
  const bodies = t.bodies ?? []
  if (fight.result) {
    // After the bell the belt record has moved on: read who was champion from what was logged for the day.
    const day = fight.day
    const logged = (id: Id, k: string) => careerStory(state, id).some((e) => e.day === day && e.kind === k)
    const sides: (0 | 1)[] = [0, 1]
    const champSide = sides.find((s) => { const id = s === 0 ? A.id : B.id; return logged(id, 'TITLE_DEFENCE') || logged(id, 'TITLE_LOST') }) ?? null
    const outcome = fightConsequences(state, fight).filter((c) => c.tone === 'title').map((c) => c.text)
    return {
      ...base, champion: champSide === null ? null : { side: champSide, name: nm(champSide), defences: null },
      challenger: champSide === null ? null : { side: (1 - champSide) as 0 | 1, name: nm((1 - champSide) as 0 | 1) },
      vacant: champSide === null && kind !== 'eliminator', line: '', outcome,
    }
  }
  if (kind === 'eliminator') return { ...base, champion: null, challenger: null, vacant: false, line: `A title eliminator: ${nm(0)} v ${nm(1)} for the right to challenge for the ${t.name}.`, outcome: [] }
  const holders = bodies.map((b) => state.media?.titles[`${b}|${fight.weightClass}`]).filter((r): r is NonNullable<typeof r> => !!r)
  const side = (id: Id | null | undefined): 0 | 1 | null => (id === A.id ? 0 : id === B.id ? 1 : null)
  const champs = [...new Set(holders.map((r) => side(r.c)).filter((s): s is 0 | 1 => s !== null))]
  if (kind === 'unification' && champs.length === 2) {
    const names = bodies.map((b) => titleName(b, fight.weightClass))
    return { ...base, champion: null, challenger: null, vacant: false, line: `A unification bout: ${nm(0)} and ${nm(1)} each hold a belt (${names.join(' and ')}).`, outcome: [] }
  }
  if (champs.length >= 1) {
    const c = champs[0], ch = (1 - c) as 0 | 1
    const rec = holders.find((r) => side(r.c) === c)
    const d = rec?.defences ?? null
    return {
      ...base, champion: { side: c, name: nm(c), defences: d }, challenger: { side: ch, name: nm(ch) }, vacant: false,
      line: `${nm(c)} defends the ${t.name}${d ? ` (defence ${d + 1} of this reign)` : ''} against ${nm(ch)}.`, outcome: [],
    }
  }
  return { ...base, champion: null, challenger: null, vacant: true, line: `The vacant ${t.name} is on the line between ${nm(0)} and ${nm(1)}.`, outcome: [] }
}
