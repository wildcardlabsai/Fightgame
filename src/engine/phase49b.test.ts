/**
 * Phase 4.9B — navigation structure, the fight presentation timeline (modes, speed, pause, skip, replay), and audio.
 * The headline property: presentation never changes the fight. Every mode and speed walks the same timeline built from
 * the one recorded result.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AudioManager, DEFAULT_AUDIO, type AudioBackend, type Clock } from '../audio/audioManager'
import { cuesFor, handleGameEvent } from '../audio/bindings'
import { CUES, CUE_IDS } from '../audio/cues'
import { advance, buildTimeline, clockNow, finish, keyEvents, nextEvent, previousEvent, restartEvent, shownRounds, SPEEDS, startPlayback, stepAt, type TlEvent } from '../presentation/timeline'
import { resultFingerprint } from '../presentation/fightPlayback'
import { activeGroup, activeItem, BOTTOM, bottomActive, itemActive, NAV } from '../ui/nav'
import { fightView, type ResultView, type RoundView } from './fightViews'
import { playedShow } from './testShow'

const names = { a: 'Ali', b: 'Bo' }
const { after, fightIds } = playedShow('p49b')
const views = fightIds.map((id) => fightView(after, id)!).filter((v) => v?.result?.rounds)
const sample = views[0]
const tlOf = (r: ResultView, reduced = false) => buildTimeline({ fightId: 'f', result: r, names, reduced })

const round = (n: number, o: Partial<RoundView> = {}): RoundView => ({
  n, line: `line ${n}`, a: { thrown: 40, landed: 12, power: 3 }, b: { thrown: 40, landed: 10, power: 2 }, kd: [0, 0], cards: ['10-9', '10-9', '10-9'], winner: 0, punish: ['Barely marked', 'Barely marked'],
  stamina: { a: [100, 90], b: [100, 92] }, control: [50, 55], counts: [], ...o,
})
const result = (rounds: RoundView[], o: Partial<ResultView> = {}): ResultView => ({
  headline: 'Ali beats Bo by unanimous decision', summary: '', winner: 0, method: 'UD', methodLabel: 'Unanimous decision', round: rounds.length, seconds: 180, stoppage: false, cards: [{ a: 30, b: 27 }, { a: 30, b: 27 }, { a: 29, b: 28 }],
  kd: [0, 0], stats: { thrown: [0, 0], landed: [0, 0], power: [0, 0], powerThrown: [0, 0], acc: [0, 0], powerAcc: [0, 0] }, deductions: [0, 0], rounds, assessment: ['', ''], upsetLabel: null, after: ['1-0-0', '0-1-0'], dRep: [0, 0], dPop: [0, 0], injuries: [null, null], money: [], ...o,
})

describe('fight timeline built from the recorded result', () => {
  it('has a real fight to work with', () => { expect(views.length).toBeGreaterThan(0) })

  it('is ordered: intro → (roundStart … roundEnd)× → finish → result, with unique ids and positive durations', () => {
    for (const v of views) {
      const tl = tlOf(v.result!)
      expect(tl[0].type).toBe('intro'); expect(tl[tl.length - 1].type).toBe('result')
      expect(['stoppage', 'decision']).toContain(tl[tl.length - 2].type)
      expect(new Set(tl.map((e) => e.id)).size).toBe(tl.length)
      for (const e of tl) { expect(e.ms).toBeGreaterThan(0); expect(e.reveal).toBeGreaterThanOrEqual(e.during) }
      const rounds = v.result!.rounds!
      for (const rd of rounds) {
        const i = tl.findIndex((e) => e.type === 'roundStart' && e.round === rd.n), j = tl.findIndex((e) => e.type === 'roundEnd' && e.round === rd.n)
        expect(i).toBeGreaterThan(0); expect(j).toBeGreaterThan(i)
        expect(tl[j].reveal).toBe(rd.n)
      }
      // reveal never goes backwards
      let last = 0
      for (const e of tl) { expect(e.reveal).toBeGreaterThanOrEqual(0); last = Math.max(last, e.reveal) }
      expect(last).toBe(rounds.length)
    }
  })

  it('is deterministic: the same recorded fight always gives the same timeline', () => {
    for (const v of views) expect(JSON.stringify(tlOf(v.result!))).toBe(JSON.stringify(tlOf(v.result!)))
  })

  it('knockdown events come straight from the recorded referee counts', () => {
    const v = views.find((x) => x.result!.rounds!.some((rd) => rd.counts.length))
    if (!v) return
    const tl = tlOf(v.result!)
    for (const rd of v.result!.rounds!.filter((x) => x.counts.length)) {
      const e = tl.find((x) => x.type === 'knockdown' && x.round === rd.n)!
      expect(e.key).toBe(true)
      const counts = e.steps!.filter((s) => /^COUNT \d+$/.test(s.text)).length
      expect(counts).toBe(rd.counts.reduce((n, c) => n + c.count, 0))
      expect(e.steps![e.steps!.length - 1].text).toMatch(/BACK UP|10 COUNT|OUT/)
    }
    expect(tl.filter((e) => e.type === 'knockdown').length).toBe(v.result!.rounds!.filter((rd) => rd.kd[0] + rd.kd[1] > 0).length)
  })

  it('reduced motion collapses each count to one static state, with the same events', () => {
    const v = views.find((x) => x.result!.rounds!.some((rd) => rd.counts.length)); if (!v) return
    const full = tlOf(v.result!), red = tlOf(v.result!, true)
    expect(red.map((e) => e.type)).toEqual(full.map((e) => e.type))
    for (const e of red.filter((x) => x.type === 'knockdown')) expect(e.steps!.length).toBe(v.result!.rounds!.find((rd) => rd.n === e.round)!.counts.length)
  })

  it('builds key events only from what was recorded: knockdown, hurt, momentum shift, stoppage', () => {
    const rounds = [
      round(1, { control: [50, 70] }), round(2, { control: [70, 30], winner: 1 }), // flips: Bo takes control
      round(3, { punish: ['Heavy punishment', 'Barely marked'], control: [30, 28], winner: 1 }),
      round(4, { kd: [0, 1], counts: [{ down: 0, segment: 1, count: 10, rose: false }], control: [28, 80] }),
    ]
    const tl = tlOf(result(rounds, { method: 'KO', methodLabel: 'Knockout', stoppage: true, round: 4, seconds: 102, cards: [] }))
    const types = keyEvents(tl).map((e) => e.type)
    expect(types).toEqual(expect.arrayContaining(['momentum', 'hurt', 'knockdown', 'stoppage', 'result']))
    const shift = tl.find((e) => e.type === 'momentum')!
    expect(shift.round).toBe(2); expect(shift.detail).toContain('Bo begins controlling the fight')
    expect(tl.find((e) => e.type === 'hurt')!.detail).toBe('Ali is badly hurt in round 3.')
    expect(tl.find((e) => e.type === 'knockdown')!.detail).toContain('Bo drops Ali in round 4')
    const stop = tl.find((e) => e.type === 'stoppage')!
    expect(stop.title).toBe('KNOCKOUT'); expect(stop.detail).toContain('Round 4, 1:42')
    expect(tl.some((e) => e.type === 'roundStart' && e.key)).toBe(false)
  })

  it('does not invent momentum shifts or knockdowns when none were recorded', () => {
    const rounds = [1, 2, 3].map((n) => round(n, { control: [50, 52] }))
    const tl = tlOf(result(rounds))
    expect(tl.some((e) => e.type === 'momentum' || e.type === 'knockdown' || e.type === 'hurt')).toBe(false)
    // …but the highlight reel is never empty: standout round + decision + result
    expect(keyEvents(tl).map((e) => e.type)).toEqual(expect.arrayContaining(['standout', 'decision', 'result']))
    const old = rounds.map((r) => ({ ...r, control: null, stamina: null }))
    expect(tlOf(result(old)).some((e) => e.type === 'momentum')).toBe(false)
  })

  it('stoppage wording follows the recorded method', () => {
    const rounds = [round(1), round(2)]
    for (const [m, label, title] of [['TKO', 'TKO', 'STOPPAGE'], ['RTD', 'Corner retirement', 'CORNER RETIREMENT'], ['INJ', 'Injury stoppage', 'INJURY STOPPAGE']] as const) {
      const tl = tlOf(result(rounds, { method: m, methodLabel: label, stoppage: true, round: 2, seconds: 61, cards: [] }))
      expect(tl.find((e) => e.type === 'stoppage')!.title).toBe(title)
    }
  })

  it('a decision reads each recorded scorecard, then the verdict', () => {
    const tl = tlOf(result([round(1), round(2), round(3)]))
    const d = tl.find((e) => e.type === 'decision')!
    expect(d.steps!.map((s) => s.text)).toEqual(['JUDGE 1', 'JUDGE 2', 'JUDGE 3', 'ALI WINS'])
    expect(d.steps!.slice(0, 3).map((s) => s.sub)).toEqual(['30 – 27', '30 – 27', '29 – 28'])
  })

  it('the round clock runs to 3:00, or to the recorded stoppage time', () => {
    const tl = tlOf(result([round(1), round(2)], { method: 'TKO', methodLabel: 'TKO', stoppage: true, round: 2, seconds: 75, cards: [] }))
    expect(tl.find((e) => e.type === 'roundEnd' && e.round === 1)!.clock[1]).toBe(180)
    expect(tl.find((e) => e.type === 'roundEnd' && e.round === 2)!.clock[1]).toBe(75)
    const e = tl.find((x) => x.type === 'roundEnd' && x.round === 1)!
    expect(clockNow(e, e.ms)).toBe(180)
  })

  it('statistics reveal at the end of a round, not before', () => {
    const tl = tlOf(result([round(1), round(2)]))
    const e = tl.find((x) => x.type === 'roundEnd' && x.round === 1)!
    expect(shownRounds(e, 0, 2)).toBe(0)
    expect(shownRounds(e, e.ms * 0.5, 2)).toBe(1)
    expect(shownRounds(undefined, 0, 2)).toBe(2)
  })
})

describe('playback clock: speed, pause, skip, replay', () => {
  const tl = tlOf(sample.result!)
  const total = tl.reduce((n, e) => n + e.ms, 0)
  const run = (speed: number, dt = 80) => {
    let s = startPlayback(tl); const seen: number[] = []; let real = 0
    while (!s.done && real < 10 * total) { if (!seen.includes(s.pos)) seen.push(s.pos); s = advance(tl, s, dt, speed); real += dt }
    return { seen, real }
  }

  it('every speed visits exactly the same events in the same order', () => {
    const base = run(1).seen
    expect(base).toEqual(tl.map((_, i) => i))
    for (const sp of SPEEDS) expect(run(sp).seen, `${sp}×`).toEqual(base)
  })

  it('speed only scales how long it takes', () => {
    const t1 = run(1).real
    for (const sp of [0.5, 2, 4, 8]) { const t = run(sp).real; expect(Math.abs(t * sp - t1)).toBeLessThan(t1 * 0.08 + 200) }
    expect(run(8).real).toBeLessThan(run(1).real / 6)
  })

  it('position depends only on elapsed presentation time (speed changes mid-way never skip or repeat)', () => {
    let a = startPlayback(tl)
    for (let i = 0; i < 40; i++) a = advance(tl, a, 80, 1)
    for (let i = 0; i < 20; i++) a = advance(tl, a, 80, 4)
    let b = startPlayback(tl)
    b = advance(tl, b, 40 * 80 * 1 + 20 * 80 * 4, 1)
    expect(b.pos).toBe(a.pos); expect(Math.round(b.acc)).toBe(Math.round(a.acc))
  })

  it('pause is simply not advancing; advancing by zero (or at any speed) with no time changes nothing', () => {
    const s = advance(tl, startPlayback(tl), 5000, 1)
    for (const sp of SPEEDS) expect(advance(tl, s, 0, sp)).toEqual(s)
  })

  it('skip, next, previous and restart behave', () => {
    const s0 = startPlayback(tl)
    expect(finish(tl)).toEqual({ pos: tl.length, acc: 0, done: true })
    expect(advance(tl, finish(tl), 1000, 8).done).toBe(true)
    expect(nextEvent(tl, s0).pos).toBe(1)
    expect(nextEvent(tl, { pos: tl.length - 1, acc: 10, done: false }).done).toBe(true)
    expect(previousEvent({ pos: 3, acc: 100, done: false }).pos).toBe(2)
    expect(previousEvent({ pos: 3, acc: 2000, done: false }).pos).toBe(3)
    expect(restartEvent({ pos: 4, acc: 900, done: false })).toEqual({ pos: 4, acc: 0, done: false })
    expect(startPlayback([]).done).toBe(true)
  })

  it('knockdown and decision steps advance with the clock', () => {
    const e: TlEvent = { ...tl[0], steps: [{ text: 'A', sub: '', ms: 100 }, { text: 'B', sub: '', ms: 100 }], ms: 200 }
    expect(stepAt(e, 0).step!.text).toBe('A'); expect(stepAt(e, 99).step!.text).toBe('A'); expect(stepAt(e, 100).step!.text).toBe('B'); expect(stepAt(e, 5000).index).toBe(1)
    expect(stepAt(tl[1], 0)).toEqual({ index: -1, step: null })
  })

  it('INVARIANT: building and walking the timeline in every mode and speed changes neither the result nor the game', () => {
    const snap = JSON.stringify(after)
    const fps = views.map((v) => resultFingerprint(v.result!))
    for (const v of views) {
      const full = tlOf(v.result!), key = keyEvents(full)
      for (const t of [full, key]) for (const sp of SPEEDS) { let s = startPlayback(t); while (!s.done) s = advance(t, s, 100, sp) }
    }
    expect(JSON.stringify(after)).toBe(snap)
    expect(views.map((v) => resultFingerprint(fightView(after, v.id)!.result!))).toEqual(fps)
  })

  it('the key-event reel is a strict subset of the full timeline and always ends on the result', () => {
    for (const v of views) {
      const full = tlOf(v.result!), key = keyEvents(full)
      expect(key.length).toBeGreaterThan(0); expect(key.length).toBeLessThan(full.length)
      expect(key.every((k) => full.some((f) => f.id === k.id))).toBe(true)
      expect(key[key.length - 1].type).toBe('result')
    }
  })
})

describe('navigation structure', () => {
  it('has seven primary destinations in the specified order', () => {
    expect(NAV.map((g) => g.label)).toEqual(['Home', 'Inbox', 'Roster', 'Events', 'World', 'Finances', 'More'])
  })

  it('groups the existing screens as specified, keeping every screen reachable', () => {
    const items = (id: string) => NAV.find((g) => g.id === id)!.items.map((i) => i.label)
    expect(items('roster')).toEqual(['Fighters', 'Free Agents', 'Scouting', 'Contracts'])
    expect(items('events')).toEqual(['Calendar', 'Events', 'Fights', 'Matchmaking', 'Venues'])
    expect(items('world').slice(0, 3)).toEqual(['Promotions', 'News', 'Boxing World'])
    expect(items('finances')).toEqual(['Finances', 'Sponsors', 'Payroll & contracts'])
    expect(items('more').slice(0, 3)).toEqual(['Advisor', 'Settings', 'Save / Load'])
    const reachable = new Set(NAV.flatMap((g) => g.items.filter((i) => !i.locked).map((i) => i.screen)))
    for (const s of ['dashboard', 'inbox', 'fighters', 'scouting', 'contracts', 'calendar', 'events', 'fights', 'matchmaking', 'venues', 'promotions', 'news', 'finances', 'sponsors', 'advisor', 'settings'] as const) expect(reachable.has(s), s).toBe(true)
  })

  it('Phase 5 slots (rankings, titles) are present but locked, not implemented', () => {
    const w = NAV.find((g) => g.id === 'world')!.items
    for (const id of ['rankings', 'titles']) expect(w.find((i) => i.id === id)!.locked).toBeTruthy()
  })

  it('detail routes highlight the section that opened them', () => {
    expect(activeGroup({ screen: 'fighter', param: 'f_1' }).id).toBe('roster')
    expect(activeGroup({ screen: 'negotiation', param: 'f_1' }).id).toBe('roster')
    expect(activeGroup({ screen: 'event', param: 'ev_1' }).id).toBe('events')
    expect(activeGroup({ screen: 'fight', param: 'ft_1' }).id).toBe('events')
    expect(activeGroup({ screen: 'deal', param: 'ft_1' }).id).toBe('events')
    expect(activeGroup({ screen: 'fights', param: 'world' }).id).toBe('world')
    expect(activeGroup({ screen: 'contracts', param: 'payroll' }).id).toBe('finances')
    expect(activeGroup({ screen: 'contracts' }).id).toBe('roster')
    expect(activeGroup({ screen: 'settings', param: 'saves' }).id).toBe('more')
    expect(activeGroup({ screen: 'news' }).id).toBe('world')
  })

  it('tab-specific entries select exactly one item', () => {
    const roster = NAV.find((g) => g.id === 'roster')!
    const active = (route: { screen: never; param?: string }) => roster.items.filter((i) => itemActive(roster, i, route)).map((i) => i.id)
    expect(active({ screen: 'fighters' as never })).toEqual(['fighters'])
    expect(active({ screen: 'fighters' as never, param: 'free' })).toEqual(['free'])
    expect(active({ screen: 'fighter' as never, param: 'f_9' })).toEqual(['fighters'])
    expect(activeItem({ screen: 'fights', param: 'world' }).item!.id).toBe('boxing-world')
    expect(activeItem({ screen: 'fights' }).item!.id).toBe('fights')
  })

  it('phones get a five-item bottom bar with More covering everything else', () => {
    expect(BOTTOM.map((b) => b.id)).toEqual(['home', 'inbox', 'fighters', 'events', 'more'])
    expect(bottomActive({ screen: 'dashboard' })).toBe('home')
    expect(bottomActive({ screen: 'fighter', param: 'f_1' })).toBe('fighters')
    expect(bottomActive({ screen: 'calendar' })).toBe('events')
    for (const s of ['finances', 'sponsors', 'settings', 'news', 'promotions', 'advisor'] as const) expect(bottomActive({ screen: s }), s).toBe('more')
    expect(new Set(BOTTOM.flatMap((b) => b.groups))).toEqual(new Set(NAV.map((g) => g.id)))
  })

  it('safe areas and the pinned bottom bar are in the stylesheet and the viewport meta', () => {
    const css = readFileSync(join(__dirname, '../styles/global.css'), 'utf8')
    expect(css).toMatch(/\.bottomnav\s*\{[^}]*position: fixed[^}]*env\(safe-area-inset-bottom\)/)
    expect(css).toMatch(/\.page \{ padding-bottom: calc\(86px \+ env\(safe-area-inset-bottom\)\)/)
    expect(css).toMatch(/body\.fight-night \.bottomnav/)
    expect(readFileSync(join(__dirname, '../../index.html'), 'utf8')).toContain('viewport-fit=cover')
  })
})

describe('audio: initialisation, mute, volume, fight cues, crowd ambience', () => {
  class Rec implements AudioBackend {
    ready = false
    state = 'suspended'
    unlocked = 0
    played: { cue: string; gain: number }[] = []
    amb: number[] = []
    ambStops = 0
    ambienceRunning = false
    cb: (() => void) | null = null
    unlock() { this.unlocked++; this.ready = true; this.state = 'running'; this.cb?.() }
    play(cue: string, gain: number) { this.played.push({ cue, gain }) }
    stopAll() { /* */ }
    startAmbience(g: number) { this.amb.push(g); this.ambienceRunning = true }
    stopAmbience() { this.ambStops++; this.ambienceRunning = false }
    onState(cb: () => void) { this.cb = cb }
  }
  class Clk implements Clock { t = 1000; now() { return this.t } later(fn: () => void) { fn(); return 0 } }
  const make = () => { const rec = new Rec(), mgr = new AudioManager(null, new Clk()); mgr.setBackend(rec); return { rec, mgr } }

  it('stays locked (and says so) until a user gesture unlocks it; nothing autoplays', () => {
    const { rec, mgr } = make()
    expect(mgr.status()).toBe('locked'); expect(rec.played).toHaveLength(0)
    let changes = 0; mgr.subscribeStatus(() => changes++)
    mgr.unlock()
    expect(mgr.status()).toBe('ready'); expect(changes).toBeGreaterThan(0)
    expect(mgr.diagnostics().state).toBe('running')
  })

  it('a cue requested while the device is locked is logged as NOT delivered (no false "played")', () => {
    const { mgr } = make()
    mgr.play('click')
    expect(mgr.log[0].delivered).toBe(false)
    mgr.unlock(); mgr['clock'] = new Clk(); (mgr as unknown as { lastPlayed: Map<string, number> }).lastPlayed.clear()
    mgr.play('click')
    expect(mgr.log[1].delivered).toBe(true)
  })

  it('disabled or muted audio reports "off" and plays nothing; unmuting restores', () => {
    const { rec, mgr } = make(); mgr.unlock()
    mgr.configure({ muted: true }); expect(mgr.status()).toBe('off'); expect(mgr.play('bell')).toBe(false)
    mgr.configure({ muted: false }); expect(mgr.status()).toBe('ready'); expect(mgr.play('bell')).toBe(true)
    mgr.configure({ enabled: false }); expect(mgr.status()).toBe('off')
    expect(rec.played.filter((p) => p.cue === 'bell')).toHaveLength(1)
  })

  it('master and bus volumes scale the gain; zero silences that bus only', () => {
    const { mgr } = make(); mgr.unlock()
    mgr.configure({ master: 100, ui: 100, fight: 100 }); const full = mgr.gainFor('click')
    mgr.configure({ master: 50 }); expect(mgr.gainFor('click')).toBeCloseTo(full / 2, 5)
    mgr.configure({ master: 100, ui: 0 }); expect(mgr.play('click')).toBe(false); expect(mgr.gainFor('bell')).toBeGreaterThan(0)
    mgr.configure({ ui: 100, fight: 0 }); expect(mgr.gainFor('bell')).toBe(0); expect(mgr.gainFor('click')).toBeGreaterThan(0)
    mgr.configure({ master: 0, fight: 100 }); expect(mgr.audible()).toBe(false)
  })

  it('has sensible, quiet-but-audible defaults', () => {
    expect(DEFAULT_AUDIO.master).toBeGreaterThanOrEqual(60); expect(DEFAULT_AUDIO.master).toBeLessThanOrEqual(80)
  })

  it('maps every required cue: UI, fight night and event cues all exist', () => {
    for (const c of ['click', 'navigate', 'tab', 'notification', 'success', 'warning', 'fightIntro', 'bell', 'roundEnd', 'punch', 'knockdown', 'count', 'getUp', 'stoppage', 'ko', 'decision', 'resultAnnounce', 'titleAnnounce', 'eventStarted', 'eventCompleted', 'majorResult', 'revenue']) expect(CUE_IDS, c).toContain(c)
    for (const id of CUE_IDS) { expect(CUES[id].gain).toBeLessThanOrEqual(1); expect(CUES[id].gap).toBeGreaterThanOrEqual(0) }
  })

  it('Fight Night events map to the right sounds', () => {
    const names = (e: Parameters<typeof cuesFor>[0]) => cuesFor(e).map((c) => c.cue)
    expect(names({ type: 'fight.intro', fightId: 'f' })).toEqual(['fightIntro'])
    expect(names({ type: 'fight.intro', fightId: 'f', title: true })).toEqual(['fightIntro', 'titleAnnounce'])
    expect(names({ type: 'fight.round', fightId: 'f', round: 3 })).toEqual(['bell'])
    expect(names({ type: 'fight.action', fightId: 'f', round: 3 })).toEqual(['punch'])
    expect(names({ type: 'fight.knockdown', fightId: 'f', round: 3 })).toEqual(['knockdown'])
    expect(names({ type: 'fight.count', fightId: 'f', round: 3, n: 4 })).toEqual(['count'])
    expect(names({ type: 'fight.getup', fightId: 'f', round: 3 })).toEqual(['getUp'])
    expect(names({ type: 'fight.finish', fightId: 'f', ko: true })).toEqual(['ko', 'resultAnnounce'])
    expect(names({ type: 'fight.finish', fightId: 'f', ko: false, stoppage: true })).toEqual(['stoppage', 'resultAnnounce'])
    expect(names({ type: 'fight.finish', fightId: 'f', ko: false })).toEqual(['decision', 'resultAnnounce'])
    expect(names({ type: 'fight.finish', fightId: 'f', ko: false, upset: true })).toContain('majorResult')
    expect(names({ type: 'event.profit', eventId: 'e', profit: 5000 })).toEqual(['revenue'])
    expect(names({ type: 'event.profit', eventId: 'e', profit: -5 })).toEqual([])
  })

  it('count ticks are keyed per count, so replays and re-renders never double them', () => {
    const k = (n: number) => cuesFor({ type: 'fight.count', fightId: 'f', round: 2, n })[0].once
    expect(k(1)).not.toBe(k(2)); expect(k(3)).toBe(k(3))
  })

  it('crowd ambience starts on entering Fight Night and stops on leaving', () => {
    const { rec, mgr } = make(); mgr.unlock()
    handleGameEvent({ type: 'fightnight.enter' }, mgr)
    expect(rec.ambienceRunning).toBe(true); expect(mgr.ambienceOn).toBe(true); expect(rec.amb.length).toBe(1)
    handleGameEvent({ type: 'fightnight.leave' }, mgr)
    expect(rec.ambienceRunning).toBe(false); expect(mgr.ambienceOn).toBe(false)
  })

  it('ambience follows mute, volume and the fight bus, and returns when unmuted', () => {
    const { rec, mgr } = make(); mgr.unlock(); mgr.configure({ master: 80, fight: 80 })
    mgr.startAmbience()
    const g1 = rec.amb[rec.amb.length - 1]
    mgr.configure({ master: 40 }); expect(rec.amb[rec.amb.length - 1]).toBeLessThan(g1)
    mgr.configure({ muted: true }); expect(rec.ambienceRunning).toBe(false)
    mgr.configure({ muted: false }); expect(rec.ambienceRunning).toBe(true)
    mgr.configure({ fight: 0 }); expect(rec.ambienceRunning).toBe(false)
    mgr.stopAmbience(); mgr.configure({ fight: 80 }); expect(rec.ambienceRunning).toBe(false)
  })

  it('ambience is kept well under the effects', () => {
    const { rec, mgr } = make(); mgr.unlock(); mgr.configure({ master: 100, fight: 100 }); mgr.startAmbience()
    expect(rec.amb[0]).toBeLessThan(mgr.gainFor('bell'))
  })
})
