/**
 * Tiny in-memory trail for the feedback report: the last screens visited and the last error the game caught. Route names only; never persisted,
 * never sent anywhere.
 */
import { safeScreen } from '../engine/feedback'
import { useGame } from './gameStore'

const trail: string[] = []
let lastError = ''

export const diagnostics = {
  trail: (): string[] => [...trail],
  lastError: (): string => lastError,
}

export function recordScreen(screen: string): void {
  const s = safeScreen(screen)
  if (trail[trail.length - 1] === s) return
  trail.push(s)
  if (trail.length > 12) trail.shift()
}

export function recordError(message: unknown): void {
  lastError = String(message ?? '').slice(0, 200)
}

let installed = false
export function installDiagnostics(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  recordScreen(useGame.getState().game ? useGame.getState().route.screen : 'title')
  useGame.subscribe((s, prev) => {
    if (s.route.screen !== prev.route.screen || !!s.game !== !!prev.game) recordScreen(s.game ? s.route.screen : 'title')
  })
  window.addEventListener('error', (e) => recordError(e.message))
  window.addEventListener('unhandledrejection', (e) => recordError((e.reason as Error | undefined)?.message ?? e.reason))
}
