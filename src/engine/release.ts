/**
 * RELEASE IDENTITY. One place that says what this build is, that it is a beta, where problems go, and what is known to be limited.
 * The version comes from package.json and the build id from git (see vite.config.ts), so a tester can always tell which build they are on.
 * Public-safe: nothing here reads game state.
 */
declare const __APP_VERSION__: string | undefined
declare const __BUILD_COMMIT__: string | undefined
declare const __BUILD_DATE__: string | undefined

export const GAME_NAME = 'The Promoter'
export const RELEASE_CHANNEL = 'beta' as const

const read = (v: string | undefined, fallback: string): string => (typeof v === 'string' && v ? v : fallback)

export const VERSION = read(typeof __APP_VERSION__ === 'undefined' ? undefined : __APP_VERSION__, '0.0.0-dev')
export const BUILD_COMMIT = read(typeof __BUILD_COMMIT__ === 'undefined' ? undefined : __BUILD_COMMIT__, 'dev')
export const BUILD_DATE = read(typeof __BUILD_DATE__ === 'undefined' ? undefined : __BUILD_DATE__, 'unknown')

/** "0.10.0-beta.1 (a1b2c3d, 2026-10-11)" — the string a tester quotes in a report. */
export const buildLabel = (): string => `${VERSION} (${BUILD_COMMIT}, ${BUILD_DATE})`

/**
 * Where a tester sends a report. There is no feedback server: reports are copied or downloaded and sent by hand. Set VITE_FEEDBACK_CONTACT at build
 * time (an email address) to add a ready-addressed mail link; left empty, testers are told to send it to whoever invited them.
 */
export const FEEDBACK_CONTACT: string = (() => {
  try { return String((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_FEEDBACK_CONTACT ?? '').trim() } catch { return '' }
})()

export interface KnownLimitation { id: string; text: string }

/** Honest, player-facing limitations of this beta. Keep each one true and short; remove it when it is fixed. */
export const KNOWN_LIMITATIONS: KnownLimitation[] = [
  { id: 'browser-saves', text: 'Saves live only in this browser on this device. Clearing site data, or using a private window, erases them — use "Export save" to keep a backup file.' },
  { id: 'one-device', text: 'There is no cloud save and no account. To move a career to another device, export it and import the file there.' },
  { id: 'boxing-only', text: 'Boxing only. Other combat sports are not in this build.' },
  { id: 'balance', text: 'Balance is still being tuned. Some careers are harder than others, and a poor decision can lose a career — that is intended, but tell us if it feels unfair rather than hard.' },
  { id: 'audio', text: 'Sound starts after your first click or key press (browser rule) and can be muted in Settings.' },
  { id: 'late-game', text: 'Very long careers (many years) may slow down on older phones. Report it if you notice.' },
]

export function releaseSummary(): string {
  return `${GAME_NAME} ${VERSION} ${RELEASE_CHANNEL} — build ${BUILD_COMMIT}, ${BUILD_DATE}`
}
