/**
 * Phase 10 (external beta preparation): release identity, the tester report (what it may and may not contain), and save safety — importing,
 * continuing and recovering never delete, reset or replace an existing career.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createNewGame } from './worldgen'
import { IMPORT_FAILURE_TEXT, inspectSave, serialiseGame } from './save'
import { buildReport, coarseBrowser, FEEDBACK_KINDS, MAX_DESCRIPTION, safeScreen, snapshotGame } from './feedback'
import { BUILD_COMMIT, buildLabel, KNOWN_LIMITATIONS, RELEASE_CHANNEL, VERSION } from './release'
import { useGame } from '../store/gameStore'
import { recordScreen, diagnostics } from '../store/diagnostics'
import type { GameState } from './types'

const PROMOTION = 'Zanzibar Quartz Boxing'
const PROMOTER = 'Philomena Wrenfield'
const fresh = (seed = 'p10'): GameState =>
  createNewGame({ seed, promotionName: PROMOTION, promoterName: PROMOTER, homeCountry: 'ENG', difficulty: 'standard', logo: { emblem: 'glove', color: '#e11d2a', monogram: 'ZQ' }, scenario: 'groundUp' }, 1)
const settle = async (ms = 60) => { await new Promise((r) => setTimeout(r, ms)); await useGame.getState().refreshSaves() }
const input = (g: GameState | null, over: object = {}) => ({ kind: 'bug' as const, description: 'The button did nothing', screen: 'finances', game: g, ...over })

describe('release identity', () => {
  it('names a beta, matches package.json, and the build label carries the version and commit', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
    expect(VERSION).toBe(pkg.version)
    expect(VERSION).toMatch(/beta/)
    expect(RELEASE_CHANNEL).toBe('beta')
    expect(buildLabel()).toContain(VERSION)
    expect(buildLabel()).toContain(BUILD_COMMIT)
  })
  it('lists real, non-empty known limitations with unique ids', () => {
    expect(KNOWN_LIMITATIONS.length).toBeGreaterThan(2)
    expect(new Set(KNOWN_LIMITATIONS.map((l) => l.id)).size).toBe(KNOWN_LIMITATIONS.length)
    for (const l of KNOWN_LIMITATIONS) expect(l.text.length).toBeGreaterThan(20)
  })
})

describe('the tester report', () => {
  const g = fresh('p10-report')
  const report = buildReport(input(g, { trail: ['dashboard', 'event/evt_123', 'finances'], lastError: 'Boom' }))

  it('carries the useful diagnostics: build, type, screen, game date, career, seed, save version', () => {
    const snap = snapshotGame(g)
    expect(report).toContain(buildLabel())
    expect(report).toContain('Type: Something is broken')
    expect(report).toContain('Screen: finances')
    expect(report).toContain(`Game date: ${snap.date}`)
    expect(report).toContain('groundUp')
    expect(report).toContain(`save v${g.version}`)
    expect(report).toContain('The button did nothing')
    expect(report).toContain('Last error: Boom')
  })
  it('never contains the promotion or promoter name, any fighter name, or any hidden attribute value', () => {
    expect(report).not.toContain(PROMOTION)
    expect(report).not.toContain(PROMOTER)
    expect(report).not.toMatch(/Zanzibar|Wrenfield/)
    for (const f of Object.values(g.fighters)) {
      expect(report.includes(`${f.firstName} ${f.lastName}`)).toBe(false)
      if (f.nickname) expect(report.includes(f.nickname)).toBe(false)
      expect(report.includes(f.id)).toBe(false)
    }
    expect(report).not.toMatch(/discipline|composure|chin|potential|hidden|loyalty|\bageing\b/i)
  })
  it('is not the save: far smaller, and not JSON', () => {
    expect(report.length).toBeLessThan(2500)
    expect(report.length).toBeLessThan(serialiseGame(g).length / 100)
    expect(() => JSON.parse(report)).toThrow()
    expect(report).not.toContain('"fighters"')
  })
  it('every line is either a known label or the tester’s own text — nothing is copied from state generically', () => {
    const labels = /^(The Promoter — tester report|Build:|Type:|Screen:|Recent screens:|Game date:|Career:|Seed:|Cash:|Guide:|Browser:|Last error:|Game:|What happened:|— Not included:|The button did nothing|)/
    for (const line of report.split('\n')) expect(line).toMatch(labels)
  })
  it('route parameters (ids) never appear in the screen trail; unknown names become "unknown"', () => {
    expect(report).toContain('Recent screens: dashboard > unknown > finances')
    expect(report).not.toContain('evt_123')
    expect(safeScreen('fighter/fgt_9')).toBe('unknown')
    expect(safeScreen('settings')).toBe('settings')
  })
  it('works with no career open (title screen)', () => {
    const r = buildReport(input(null, { screen: 'title' }))
    expect(r).toContain('Game: no career open')
    expect(r).toContain('Screen: title')
  })
  it('caps the description and strips control characters', () => {
    const r = buildReport(input(null, { description: `a\u0007b${'x'.repeat(MAX_DESCRIPTION + 500)}` }))
    expect(r).not.toContain('\u0007')
    expect(r.length).toBeLessThan(MAX_DESCRIPTION + 800)
  })
  it('reports the browser coarsely, not the full user-agent', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.61 Safari/537.36'
    expect(coarseBrowser(ua)).toBe('Chrome 126')
    expect(coarseBrowser('curl/8')).toBe('unknown')
    const r = buildReport(input(null, { env: { browser: coarseBrowser(ua), viewport: '390x844', storage: 'indexeddb' } }))
    expect(r).not.toContain('Windows')
    expect(r).toContain('viewport 390x844')
  })
  it('offers the four kinds of feedback the brief asks for', () => {
    expect(FEEDBACK_KINDS.map((k) => k.id).sort()).toEqual(['balance', 'bug', 'confusing', 'suggestion'])
  })
  it('the diagnostics trail records route names only and is bounded', () => {
    for (let i = 0; i < 30; i++) recordScreen(i % 2 ? 'fighters' : 'fighter/fgt_77')
    expect(diagnostics.trail().length).toBeLessThanOrEqual(12)
    expect(diagnostics.trail().join(' ')).not.toContain('fgt_77')
  })
})

describe('refusing files that are not usable saves', () => {
  it('says why, never throws, and never returns a state', () => {
    expect(inspectSave('')).toEqual({ ok: false, reason: 'empty' })
    expect(inspectSave('not json at all')).toEqual({ ok: false, reason: 'notJson' })
    expect(inspectSave('{"hello":1}')).toEqual({ ok: false, reason: 'notSave' })
    expect(inspectSave('null')).toEqual({ ok: false, reason: 'notSave' })
    const newer = JSON.parse(serialiseGame(fresh('p10-new'))); newer.version = 999
    expect(inspectSave(JSON.stringify(newer))).toEqual({ ok: false, reason: 'newer' })
    for (const t of Object.values(IMPORT_FAILURE_TEXT)) expect(t).toMatch(/unchanged/)
    expect(IMPORT_FAILURE_TEXT.newer).toMatch(/newer version/)
  })
  it('accepts a good save', () => {
    const r = inspectSave(serialiseGame(fresh('p10-ok')))
    expect(r.ok).toBe(true)
  })
})

describe('save safety through the app', () => {
  const opts = (seed: string) => ({ seed, promotionName: 'Safety Test', promoterName: 'Sam Reid', homeCountry: 'ENG' as const, difficulty: 'standard' as const, logo: { emblem: 'glove' as const, color: '#e11d2a', monogram: 'ST' }, scenario: 'groundUp' as const })

  it('importing a file whose career already exists adds a new slot and leaves the original slot byte-identical', async () => {
    useGame.getState().startNewGame(opts('p10-keep'))
    await settle()
    const original = useGame.getState().game!
    const slotsBefore = useGame.getState().saves.filter((m) => m.gameId === original.saveId)
    expect(slotsBefore.length).toBe(1)
    const backup = (await useGame.getState().exportSave(original.saveId))!
    expect(backup).toBe(serialiseGame(original))
    // Play on (the file now differs from the stored career), then import the older file.
    expect(useGame.getState().importGame(backup)).toBe(true)
    await settle()
    const after = useGame.getState()
    expect(after.game!.saveId).not.toBe(original.saveId)
    const stored = await after.exportSave(original.saveId)
    expect(stored).toBe(backup) // the original slot is untouched
    expect(after.saves.some((m) => m.id === after.game!.saveId && /imported/.test(m.name))).toBe(true)
    expect(after.saves.length).toBeGreaterThanOrEqual(2)
  })
  it('importing a career the browser has never seen keeps its identity and adds a slot', async () => {
    const foreign = fresh('p10-foreign')
    const before = useGame.getState().saves.length
    expect(useGame.getState().importGame(serialiseGame(foreign))).toBe(true)
    await settle()
    expect(useGame.getState().game!.saveId).toBe(foreign.saveId)
    expect(useGame.getState().saves.length).toBe(before + 1)
  })
  it('a refused import leaves the open career and every slot as they were', async () => {
    const open = useGame.getState().game
    const slots = useGame.getState().saves.map((m) => `${m.id}:${m.savedAt}`)
    expect(useGame.getState().importGame('garbage')).toBe(false)
    const newer = JSON.parse(serialiseGame(fresh('p10-n2'))); newer.version = 500
    expect(useGame.getState().importGame(JSON.stringify(newer))).toBe(false)
    await settle()
    expect(useGame.getState().game).toBe(open)
    expect(useGame.getState().saves.map((m) => `${m.id}:${m.savedAt}`)).toEqual(slots)
    expect(useGame.getState().notices.some((n) => /newer version/.test(n.text) || /not a save|not a valid/.test(n.text))).toBe(true)
  })
  it('starting a new career never replaces a stored one', async () => {
    const ids = useGame.getState().saves.map((m) => m.id)
    useGame.getState().startNewGame(opts('p10-new-career'))
    await settle()
    const now = useGame.getState().saves.map((m) => m.id)
    for (const id of ids) expect(now).toContain(id)
    expect(now.length).toBe(ids.length + 1)
  })
  it('loading a slot that does not exist explains itself and changes nothing', async () => {
    const open = useGame.getState().game
    expect(await useGame.getState().loadSaved('nope')).toBe(false)
    expect(useGame.getState().game).toBe(open)
    expect(useGame.getState().notices.some((n) => /has not been changed or deleted/.test(n.text))).toBe(true)
  })
  it('continue opens the newest readable save', async () => {
    useGame.setState({ game: null })
    expect(await useGame.getState().continueLatest()).toBe(true)
    expect(useGame.getState().game).not.toBeNull()
  })
})
