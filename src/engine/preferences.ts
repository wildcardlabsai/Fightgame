/**
 * Player preferences that belong to the PERSON, not the save (advisor level, audio, dismissed hints).
 * Persisted in browser storage; every access is guarded because private windows and blocked storage must never break the game.
 * The presentation layer reads/writes through here and never touches storage itself.
 */
import { ADVISOR_MODES, DEFAULT_ADVISOR_MODE, type AdvisorMode } from './advisor'

export interface AudioPrefs { enabled: boolean; muted: boolean; master: number; music: number; ui: number; sfx: number; fight: number }
export interface Preferences { advisor: AdvisorMode; audio: AudioPrefs; firstStepsHidden: boolean }

export const DEFAULT_AUDIO_PREFS: AudioPrefs = { enabled: true, muted: false, master: 60, music: 40, ui: 55, sfx: 65, fight: 70 }
export const PREFS_KEY = 'fight-empire:prefs:v1'

export interface PrefStorage { getItem(k: string): string | null; setItem(k: string, v: string): void }

const browser = (): PrefStorage | null => {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

export function defaultPreferences(): Preferences {
  return { advisor: DEFAULT_ADVISOR_MODE, audio: { ...DEFAULT_AUDIO_PREFS }, firstStepsHidden: false }
}

/** Parse untrusted stored text into valid preferences; anything unusable falls back to the default for that field. */
export function parsePreferences(raw: string | null): Preferences {
  const out = defaultPreferences()
  if (!raw) return out
  try {
    const j = JSON.parse(raw) as { advisor?: unknown; audio?: Record<string, unknown>; firstStepsHidden?: unknown }
    if (ADVISOR_MODES.includes(j.advisor as AdvisorMode)) out.advisor = j.advisor as AdvisorMode
    for (const k of ['master', 'music', 'ui', 'sfx', 'fight'] as const) { const v = j.audio?.[k]; if (typeof v === 'number' && Number.isFinite(v)) out.audio[k] = Math.max(0, Math.min(100, Math.round(v))) }
    if (typeof j.audio?.enabled === 'boolean') out.audio.enabled = j.audio.enabled
    if (typeof j.audio?.muted === 'boolean') out.audio.muted = j.audio.muted
    out.firstStepsHidden = j.firstStepsHidden === true
  } catch { /* corrupt → defaults */ }
  return out
}

export function loadPreferences(store: PrefStorage | null = browser()): Preferences {
  try { return parsePreferences(store?.getItem(PREFS_KEY) ?? null) } catch { return defaultPreferences() }
}

export function savePreferences(p: Preferences, store: PrefStorage | null = browser()): void {
  try { store?.setItem(PREFS_KEY, JSON.stringify(p)) } catch { /* ignore */ }
}
