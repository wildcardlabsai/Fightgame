/**
 * AUDIO MANAGER — the only way anything in Fight Empire makes a sound.
 *
 * Components never call this directly: they either carry a `data-sfx` attribute (handled by one delegated DOM listener) or the
 * store emits a named game event (see store/gameEvents.ts). `bindings.ts` maps those to cues. That keeps audio out of
 * render paths, so re-rendering can never replay a sound.
 *
 * The manager decides IF a cue plays (enabled / muted / volume / duplicate suppression) and at what gain; a backend decides
 * HOW it sounds. The default backend synthesises everything with Web Audio (no asset files). Tests inject a recording backend.
 */
import { CUES, type Bus, type CueId } from './cues'

export interface AudioSettings {
  /** Master switch: when false the audio system does nothing at all. */
  enabled: boolean
  muted: boolean
  /** 0–100 */
  master: number
  music: number
  ui: number
  sfx: number
  fight: number
}

/** Sensible, quiet defaults. Nothing plays until the player does something, and music has no tracks yet. */
export const DEFAULT_AUDIO: AudioSettings = { enabled: true, muted: false, master: 60, music: 40, ui: 55, sfx: 65, fight: 70 }

export interface AudioBackend {
  /** Called from a user gesture so the browser allows playback. */
  unlock(): void
  readonly ready: boolean
  play(cue: CueId, gain: number): void
  stopAll(): void
}

export interface PlayRecord { cue: CueId; gain: number; t: number }

export interface Clock { now(): number; later(fn: () => void, ms: number): unknown }
const realClock: Clock = { now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), later: (fn, ms) => setTimeout(fn, ms) }

const clamp100 = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? Math.round(n) : 0))

export class AudioManager {
  private settings: AudioSettings = { ...DEFAULT_AUDIO }
  private lastPlayed = new Map<CueId, number>()
  private onceKeys = new Set<string>()
  private backend: AudioBackend | null
  private clock: Clock
  private listeners = new Set<(s: AudioSettings) => void>()
  /** What actually played (capped). Used by tests and the browser checks. */
  readonly log: PlayRecord[] = []
  suppressed = 0

  constructor(backend: AudioBackend | null = null, clock: Clock = realClock) {
    this.backend = backend
    this.clock = clock
  }

  setBackend(b: AudioBackend | null): void { this.backend = b }
  setClock(c: Clock): void { this.clock = c }

  // ---- settings ----
  get(): AudioSettings { return { ...this.settings } }
  configure(patch: Partial<AudioSettings>): AudioSettings {
    const s = { ...this.settings, ...patch }
    s.master = clamp100(s.master); s.music = clamp100(s.music); s.ui = clamp100(s.ui); s.sfx = clamp100(s.sfx); s.fight = clamp100(s.fight)
    s.enabled = !!s.enabled; s.muted = !!s.muted
    this.settings = s
    if (!this.audible()) this.backend?.stopAll()
    for (const l of this.listeners) l(this.get())
    return this.get()
  }
  subscribe(fn: (s: AudioSettings) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn) }
  audible(): boolean { return this.settings.enabled && !this.settings.muted && this.settings.master > 0 }

  /** Effective gain (0–1) for a cue under the current settings. */
  gainFor(cue: CueId): number {
    const def = CUES[cue]
    const bus: Bus = def.bus
    return (this.settings.master / 100) * (this.settings[bus] / 100) * def.gain
  }

  unlock(): void { this.backend?.unlock() }

  // ---- playback ----
  /** Play a cue now. Returns false if it was suppressed (muted, silent bus, or too soon after the same cue). */
  play(cue: CueId): boolean {
    if (!this.audible()) return false
    const gain = this.gainFor(cue)
    if (gain <= 0.001) return false
    const t = this.clock.now()
    const last = this.lastPlayed.get(cue)
    if (last !== undefined && t - last < CUES[cue].gap) { this.suppressed++; return false }
    this.lastPlayed.set(cue, t)
    this.log.push({ cue, gain, t })
    if (this.log.length > 300) this.log.splice(0, this.log.length - 300)
    this.backend?.play(cue, gain)
    return true
  }

  /** Play once per key for the whole session (e.g. one warning per piece of advice, one intro per event). */
  playOnce(key: string, cue: CueId): boolean {
    if (this.onceKeys.has(key)) return false
    const ok = this.play(cue)
    // Remember the key even when muted: un-muting later must not replay old news.
    this.onceKeys.add(key)
    if (this.onceKeys.size > 2000) this.onceKeys.clear()
    return ok
  }

  /** Reserve a once-key without playing (used for timed steps). False if it was already taken. */
  claim(key: string): boolean {
    if (this.onceKeys.has(key)) return false
    this.onceKeys.add(key)
    return true
  }

  /** Cues spaced in time, e.g. bell → crowd → knockdown. */
  sequence(steps: { cue: CueId; atMs: number }[]): void {
    for (const s of steps) {
      if (s.atMs <= 0) this.play(s.cue)
      else this.clock.later(() => { this.play(s.cue) }, s.atMs)
    }
  }

  resetHistory(): void { this.log.length = 0; this.lastPlayed.clear(); this.onceKeys.clear(); this.suppressed = 0 }
}

export const audio = new AudioManager()
