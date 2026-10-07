/**
 * Wires the audio manager to the game. Two sources only:
 *  1. ONE delegated DOM listener set (clicks, selects, toggles, tabs). Elements opt in/out with `data-sfx="<cue>|none"`.
 *  2. Game events from the store (see store/gameEvents.ts), mapped to cues here and nowhere else.
 */
import { onGameEvent, type GameEvent } from '../store/gameEvents'
import { audio, type AudioManager } from './audioManager'
import { isCue, type CueId } from './cues'

const KO_METHODS = new Set(['KO', 'TKO', 'RTD', 'INJ'])

/** The cue(s) a game event produces. Pure — exported for tests. */
export function cuesFor(e: GameEvent): { cue: CueId; atMs: number; once?: string }[] {
  switch (e.type) {
    case 'notice': return [{ cue: e.tone === 'good' ? 'success' : e.tone === 'bad' ? 'error' : 'notification', atMs: 0 }]
    case 'save': return [{ cue: 'save', atMs: 0 }]
    case 'contract.accepted': return [{ cue: 'contractAccepted', atMs: 0 }]
    case 'contract.rejected': return [{ cue: 'contractRejected', atMs: 0 }]
    case 'fight.scheduled': return [{ cue: 'fightScheduled', atMs: 0 }]
    case 'event.intro': return [{ cue: 'eventIntro', atMs: 0, once: `intro:${e.eventId}` }]
    case 'event.started': return [{ cue: 'eventStarted', atMs: 0, once: `start:${e.eventId}` }, { cue: 'crowdAmbience', atMs: 600 }]
    case 'event.mainEvent': return [{ cue: 'mainEvent', atMs: 0, once: `main:${e.eventId}` }]
    case 'event.completed': return [{ cue: 'eventCompleted', atMs: 0, once: `done:${e.eventId}` }]
    case 'fight.round': return e.round === 1 ? [{ cue: 'bell', atMs: 0, once: `lf:${e.fightId}:r1` }, { cue: 'crowd', atMs: 400, once: `lf:${e.fightId}:crowd` }] : [{ cue: 'bell', atMs: 0, once: `lf:${e.fightId}:r${e.round}` }]
    case 'fight.knockdown': return [{ cue: 'knockdown', atMs: 0, once: `lf:${e.fightId}:kd${e.round}` }]
    case 'fight.finish': {
      // The final bell always rings first, then how it ended, then the announcement.
      const main: CueId = e.ko ? 'ko' : e.stoppage ? 'stoppage' : 'decision'
      const fin: { cue: CueId; atMs: number; once: string }[] = [
        { cue: 'finalBell', atMs: 0, once: `lf:${e.fightId}:final` },
        { cue: main, atMs: 1700, once: `lf:${e.fightId}:fin` },
        { cue: 'resultAnnounce', atMs: 2900, once: `lf:${e.fightId}:ann` },
      ]
      if (e.upset) fin.push({ cue: 'majorResult', atMs: 3800, once: `lf:${e.fightId}:upset` })
      return fin
    }
    case 'fight.intro': return [{ cue: 'fightIntro', atMs: 0, once: `lf:${e.fightId}:intro` }, ...(e.title ? [{ cue: 'titleAnnounce' as CueId, atMs: 1500, once: `lf:${e.fightId}:title` }] : [])]
    case 'fight.action': return [{ cue: 'punch', atMs: 0, once: `lf:${e.fightId}:act${e.round}` }]
    case 'fight.count': return [{ cue: 'count', atMs: 0, once: `lf:${e.fightId}:cnt${e.round}:${e.n}` }]
    case 'fight.getup': return [{ cue: 'getUp', atMs: 0, once: `lf:${e.fightId}:up${e.round}` }]
    case 'fightnight.enter': case 'fightnight.leave': return []
    case 'event.profit': return e.profit > 0 ? [{ cue: 'revenue', atMs: 900, once: `rev:${e.eventId}` }] : []
    case 'fight.result': {
      if (e.presented) return []
      const ko = KO_METHODS.has(e.method)
      const steps: { cue: CueId; atMs: number }[] = [{ cue: 'bell', atMs: 0 }, { cue: 'crowd', atMs: 450 }]
      if (e.knockdowns > 0) steps.push({ cue: 'knockdown', atMs: 1000 })
      if (ko) steps.push({ cue: 'ko', atMs: 1800 })
      else steps.push({ cue: 'roundEnd', atMs: 1000 }, { cue: 'decision', atMs: 1900 })
      steps.push({ cue: 'resultAnnounce', atMs: 2800 })
      // Every step is keyed to this fight: emitting the same result twice can never replay it.
      return steps.map((s) => ({ ...s, once: `fight:${e.fightId}:${s.cue}` }))
    }
    case 'modal.open': return [{ cue: 'modalOpen', atMs: 0 }]
    case 'modal.close': return [{ cue: 'modalClose', atMs: 0 }]
    case 'advice': return e.level === 'highRisk' || e.level === 'critical' ? [{ cue: 'warning', atMs: 0, once: `advice:${e.id}` }] : []
  }
}

export function handleGameEvent(e: GameEvent, mgr: AudioManager = audio): void {
  if (e.type === 'fightnight.enter') { mgr.startAmbience(); return }
  if (e.type === 'fightnight.leave') { mgr.stopAmbience(); return }
  const steps = cuesFor(e)
  // `once` steps are keyed per fight/event so a re-render or a repeated emit can never replay them.
  const timed = steps.filter((s) => s.atMs > 0)
  for (const s of steps.filter((x) => x.atMs <= 0)) { if (s.once) mgr.playOnce(s.once, s.cue); else mgr.play(s.cue) }
  for (const s of timed) {
    if (s.once && !mgr.claim(s.once)) continue
    mgr.sequence([{ cue: s.cue, atMs: s.atMs }])
  }
}

const CLICKABLE = 'button, a[href], summary, [role="button"], [role="tab"], [data-sfx]'

/** Which cue (if any) a DOM interaction should play. Pure over an element — exported for tests. */
export function cueForClick(el: Element | null): CueId | null {
  const target = el?.closest?.(CLICKABLE) as HTMLElement | null
  if (!target) return null
  if ((target as HTMLButtonElement).disabled || target.getAttribute('aria-disabled') === 'true') return null
  const tag = target.closest('[data-sfx]')?.getAttribute('data-sfx')
  if (tag !== null && tag !== undefined) return tag === 'none' ? null : isCue(tag) ? tag : null
  if (target.getAttribute('role') === 'tab') return 'tab'
  return 'click'
}

export function cueForChange(el: Element | null): CueId | null {
  if (!el) return null
  const tag = el.closest?.('[data-sfx]')?.getAttribute('data-sfx')
  if (tag === 'none') return null
  const tagName = (el.tagName ?? '').toLowerCase()
  if (tagName === 'select') return 'dropdown'
  const type = (el as HTMLInputElement).type
  if (tagName === 'input' && (type === 'checkbox' || type === 'radio')) return 'toggle'
  return null
}

let started = false
/** Start listening. Idempotent (React StrictMode and hot reload may call it twice). Returns a stop function. */
export function initAudio(doc: Document = document, mgr: AudioManager = audio): () => void {
  if (started) return () => undefined
  started = true
  const unlock = () => mgr.unlock()
  const onClick = (e: Event) => { const cue = cueForClick(e.target as Element); if (cue) mgr.play(cue) }
  const onChange = (e: Event) => { const cue = cueForChange(e.target as Element); if (cue) mgr.play(cue) }
  doc.addEventListener('pointerdown', unlock, { capture: true })
  doc.addEventListener('keydown', unlock, { capture: true })
  doc.addEventListener('click', onClick, { capture: true })
  doc.addEventListener('change', onChange, { capture: true })
  const off = onGameEvent((e) => handleGameEvent(e, mgr))
  return () => {
    doc.removeEventListener('pointerdown', unlock, { capture: true })
    doc.removeEventListener('keydown', unlock, { capture: true })
    doc.removeEventListener('click', onClick, { capture: true })
    doc.removeEventListener('change', onChange, { capture: true })
    off()
    started = false
  }
}
