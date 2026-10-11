/**
 * TESTER FEEDBACK REPORT (Phase 10).
 *
 * There is no feedback server, so a report is plain text the tester copies or downloads and sends by hand. The report is built from an explicit
 * ALLOWLIST of facts, never by serialising anything: it never contains the promotion or promoter name, any fighter's name or hidden attribute,
 * route ids, or the save itself. The only free text in it is what the tester typed (and a short, truncated error message if the game crashed).
 * Public-safe: reads only fields that are already on screen for the player.
 */
import { formatDay } from './calendar'
import { guideView } from './guide'
import { playerRoster, player } from './selectors'
import { tierLabel } from './tiers'
import { buildLabel, GAME_NAME, RELEASE_CHANNEL } from './release'
import type { GameState } from './types'

export type FeedbackKind = 'bug' | 'confusing' | 'balance' | 'suggestion'
export const FEEDBACK_KINDS: { id: FeedbackKind; label: string; hint: string }[] = [
  { id: 'bug', label: 'Something is broken', hint: 'A crash, a wrong number, a button that does nothing, a lost save.' },
  { id: 'confusing', label: 'Something confused or frustrated me', hint: 'You could not tell what to do next, or what something meant or cost.' },
  { id: 'balance', label: 'Money or difficulty feels off', hint: 'Too easy, too punishing, or a result that seemed unfair.' },
  { id: 'suggestion', label: 'An idea', hint: 'Something you would like the game to do.' },
]

/** Screens we are willing to name in a report (route names only, never route parameters such as fighter or event ids). */
const SCREEN_NAMES = new Set(['dashboard', 'fighters', 'fighter', 'calendar', 'inbox', 'finances', 'promotions', 'venues', 'settings', 'scouting', 'contracts', 'negotiation', 'matchmaking', 'fights', 'fight', 'deal', 'events', 'event', 'sponsors', 'news', 'advisor', 'media', 'rankings', 'titles', 'office', 'feedback', 'title'])
export const safeScreen = (s: string | undefined): string => (s && SCREEN_NAMES.has(s) ? s : 'unknown')

export const MAX_DESCRIPTION = 2000

export interface ReportEnvironment {
  viewport?: string
  storage?: string
  /** Coarse browser family only, e.g. "Chrome 126" — not the full user-agent string. */
  browser?: string
}

export interface ReportInput {
  kind: FeedbackKind
  description: string
  /** Current screen (route name) or 'title'. */
  screen: string
  /** Recent screens visited, oldest first (route names only). */
  trail?: string[]
  /** Short message of the last error the game caught, if any. */
  lastError?: string
  env?: ReportEnvironment
  /** The career being played, if any. Only an allowlist of its facts is read. */
  game?: GameState | null
}

export interface GameSnapshot {
  date: string
  scenario: string
  difficulty: string
  tier: string
  seed: string
  saveVersion: number
  cash: number
  rosterSize: number
  guide: string
}

/** The only place a GameState is read for a report. Add a field here deliberately; there is no generic copy. */
export function snapshotGame(g: GameState): GameSnapshot {
  const view = g.guide?.active ? guideView(g) : null
  return {
    date: formatDay(g.today),
    scenario: g.scenario?.id ?? 'none',
    difficulty: g.settings.difficulty,
    tier: tierLabel(player(g).tier),
    seed: g.seed,
    saveVersion: g.version,
    cash: Math.round(player(g).cash),
    rosterSize: playerRoster(g).length,
    guide: view ? (view.current ? `step ${view.progress.done + 1} of ${view.progress.total}: ${view.current.id}` : 'all steps done') : g.guide?.finished ? 'finished' : 'off',
  }
}

const clean = (s: string, max: number): string => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max)

export function buildReport(input: ReportInput): string {
  const kind = FEEDBACK_KINDS.find((k) => k.id === input.kind)
  const snap = input.game ? snapshotGame(input.game) : null
  const lines = [
    `${GAME_NAME} — tester report`,
    `Build: ${buildLabel()} (${RELEASE_CHANNEL})`,
    `Type: ${kind?.label ?? input.kind}`,
    `Screen: ${safeScreen(input.screen)}`,
    ...(input.trail && input.trail.length ? [`Recent screens: ${input.trail.map(safeScreen).slice(-8).join(' > ')}`] : []),
    ...(snap
      ? [
          `Game date: ${snap.date}`,
          `Career: ${snap.scenario} · ${snap.difficulty} · ${snap.tier}`,
          `Seed: ${snap.seed} · save v${snap.saveVersion}`,
          `Cash: £${snap.cash.toLocaleString('en-GB')} · roster ${snap.rosterSize}`,
          `Guide: ${snap.guide}`,
        ]
      : ['Game: no career open']),
    ...(input.env ? [`Browser: ${input.env.browser ?? 'unknown'} · viewport ${input.env.viewport ?? 'unknown'} · storage ${input.env.storage ?? 'unknown'}`] : []),
    ...(input.lastError ? [`Last error: ${clean(input.lastError, 200)}`] : []),
    '',
    'What happened:',
    clean(input.description, MAX_DESCRIPTION) || '(no description written)',
    '',
    '— Not included: names, fighter attributes, or the save file. Nothing was sent automatically.',
  ]
  return lines.join('\n')
}

/** "Chrome 126" from a user-agent string, or "unknown". Pure so it can be tested. */
export function coarseBrowser(ua: string): string {
  const m = /(Edg|OPR|Firefox|Chrome|CriOS|FxiOS|Version)\/(\d+)/.exec(ua)
  if (!m) return 'unknown'
  const name = m[1] === 'Edg' ? 'Edge' : m[1] === 'OPR' ? 'Opera' : m[1] === 'CriOS' ? 'Chrome (iOS)' : m[1] === 'FxiOS' ? 'Firefox (iOS)' : m[1] === 'Version' ? 'Safari' : m[1]
  return `${name} ${m[2]}`
}

export const reportFileName = (): string => `promoter-report-${buildLabel().split(' ')[0]}.txt`
