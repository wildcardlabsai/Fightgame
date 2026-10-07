/**
 * Phase 4.8 — presentation, visual assets and the live fight experience.
 * The CRITICAL property: presentation never changes what happened. Same fight → same result whether it is watched,
 * skimmed, quick-simmed or never looked at.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearFighterArt, clearPromotionArt, fighterFallback, galleryEntries, MANIFEST, newsKind, NEWS_KINDS, POSTER_TEMPLATES, registerFighterArt, registerPromotionArt, resolveEventTemplate, resolveFighterImage, resolveNewsImage,
  resolveNewsKind, resolvePromotionImage, resolveVenueImage, resolveVenueKind, venueKind, VENUE_KINDS,
} from '../assets/registry'
import { choosePosterTemplate } from '../assets/poster'
import { control, finishCard, hasKnockdown, planDuration, planRounds, resultFingerprint, roundCommentary, roundsWon, totalsThrough, PLAY_MODES, type PlayMode } from '../presentation/fightPlayback'
import { addFightToEvent, approach, createEvent, offerFight, runEventToEnd, runNextEventFight } from './commands'
import { eventPosterView } from './eventPoster'
import { fightView } from './fightViews'
import { opponentCandidates } from './matchmaking'
import { playerRoster } from './selectors'
import { advanceOneWeek } from './tick'
import { suggestedFightOffer } from './fightNegotiation'
import { createNewGame } from './worldgen'
import { defaultPreferences, parsePreferences } from './preferences'
import { cuesFor } from '../audio/bindings'
import { CUES } from '../audio/cues'
import type { FightOffer, GameState, Id } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const fresh = (seed: string) => createNewGame({ seed, promotionName: 'P48', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
const SAT = 5
const satIn = (s: GameState, weeks: number) => s.today + SAT + 7 * (weeks - 1)

function agree(s: GameState, myId: Id, taken: Set<Id>): { state: GameState; fightId: Id } | null {
  for (const c of opponentCandidates(s, myId, {}).filter((x) => x.canApproach && !taken.has(x.view.id) && x.view.reputation < 50).slice(0, 8)) {
    const ap = approach(s, myId, c.view.id)
    if (!ap.ok) continue
    let st = ap.state
    for (let i = 0; i < 6; i++) {
      const base = suggestedFightOffer(st, c.view.id)
      const out = offerFight(st, ap.fightId!, { ...base, purseB: base.purseB * (1.2 + i * 0.4), winBonusB: base.winBonusB * 1.5 } as FightOffer)
      if (!out.ok) break
      st = out.state
      if (st.fights[ap.fightId!].status === 'agreed') { taken.add(c.view.id); return { state: st, fightId: ap.fightId! } }
      if (st.fights[ap.fightId!].status === 'cancelled') break
    }
  }
  return null
}

/** A finished show with recorded round-by-round data. */
function playedShow(seed: string): { before: GameState; after: GameState; eventId: Id; fightIds: Id[] } {
  let s = fresh(seed)
  const venue = Object.values(s.venues).find((v) => v.name === 'Ironworks Social Club')!
  const r = createEvent(s, { name: 'Presentation Night', day: satIn(s, 8), venueId: venue.id })
  expect(r.ok, r.error).toBe(true)
  s = r.state
  const eventId = r.eventId!
  const taken = new Set<Id>()
  for (const f of playerRoster(s).slice(0, 3)) {
    const a = agree(s, f.id, taken)
    if (!a) continue
    const add = addFightToEvent(a.state, eventId, a.fightId)
    expect(add.ok, add.error).toBe(true)
    s = add.state
  }
  for (let i = 0; i < 20 && s.events[eventId].status !== 'fightWeek'; i++) s = advanceOneWeek(s)
  const before = s
  const run = runNextEventFight(s, eventId)
  expect(run.ok, run.error).toBe(true)
  const done = runEventToEnd(run.state, eventId)
  expect(done.ok, done.error).toBe(true)
  return { before, after: done.state, eventId, fightIds: s.events[eventId].card }
}

describe('asset registry', () => {
  beforeEach(() => { clearFighterArt(); clearPromotionArt() })

  it('every shipped asset in the manifest exists on disk, with sizes and a status', () => {
    expect(MANIFEST.shipped.length).toBeGreaterThanOrEqual(34)
    for (const e of MANIFEST.shipped) {
      expect(existsSync(join(__dirname, '../../public/assets', e.path)), e.path).toBe(true)
      expect(e.width).toBeGreaterThan(0); expect(e.height).toBeGreaterThan(0)
      expect(['real', 'fallback']).toContain(e.status)
    }
    const total = (function sum(d: string): number { return readdirSync(d).reduce((n, f) => { const p = join(d, f); return n + (statSync(p).isDirectory() ? sum(p) : statSync(p).size) }, 0) })(join(__dirname, '../../public/assets'))
    expect(total).toBeLessThan(400_000) // placeholder art stays tiny: the build never depends on hundreds of images
  })

  it('the asset structure from the spec exists', () => {
    for (const d of ['fighters/profile', 'fighters/action', 'fighters/celebration', 'venues', 'promotions/logos', 'promotions/banners', 'events/templates', 'news', 'ui']) {
      expect(existsSync(join(__dirname, '../../public/assets', d)), d).toBe(true)
    }
  })

  it('has nine venue looks and each tier maps to one', () => {
    expect(VENUE_KINDS).toHaveLength(9)
    expect(venueKind({ name: 'Ironworks Social Club', tier: 'local', capacity: 450 })).toBe('local-hall')
    expect(venueKind({ name: 'Valleys Sports Centre', tier: 'local', capacity: 1100 })).toBe('sports-centre')
    expect(venueKind({ name: 'Silver State Theatre', tier: 'regional', capacity: 2500 })).toBe('theatre')
    expect(venueKind({ name: 'Hallam Arena', tier: 'national', capacity: 4800 })).toBe('national-arena')
    expect(venueKind({ name: 'Big Arena', tier: 'arena', capacity: 20000 })).toBe('major-arena')
    expect(venueKind({ name: 'City Stadium', tier: 'stadium', capacity: 40000 })).toBe('stadium')
    expect(venueKind({ name: 'Megabowl', tier: 'stadium', capacity: 80000 })).toBe('outdoor-stadium')
    expect(venueKind({ name: 'World Arena', tier: 'arena', capacity: 12000 })).toBe('international')
    for (const k of VENUE_KINDS) { const a = resolveVenueKind(k); expect(a.state).toBe('real'); expect(a.url).toContain(`venues/${k}.svg`) }
  })

  it('every venue in a generated world resolves to a real image', () => {
    const s = fresh('assets')
    for (const v of Object.values(s.venues)) expect(resolveVenueImage({ id: v.id, name: v.name, tier: v.tier, capacity: v.capacity }).state, v.name).toBe('real')
  })

  it('fighters without art fall back to a deterministic silhouette (never a broken image); registered art resolves to the right fighter', () => {
    const f = { id: 'f_abc', firstName: 'Tom', lastName: 'Rivers', division: 'Welterweight' }
    const g = { id: 'f_xyz', firstName: 'Ann', lastName: 'Cole', division: 'Heavyweight' }
    const a = resolveFighterImage(f)
    expect(a.state).toBe('fallback'); expect(a.url).toBeNull(); expect(a.thumbUrl).toBeNull()
    expect(fighterFallback(f)).toEqual(fighterFallback({ ...f }))
    expect(fighterFallback(f).initials).toBe('TR')
    expect(fighterFallback(f).hue).not.toBe(fighterFallback(g).hue)
    registerFighterArt('profile', [f.id])
    const real = resolveFighterImage(f), other = resolveFighterImage(g)
    expect(real.state).toBe('real'); expect(real.url).toContain('f_abc'); expect(real.thumbUrl).toContain('f_abc@thumb')
    expect(other.state).toBe('fallback')
    expect(resolveFighterImage(f, 'action').state).toBe('fallback') // partial sets are fine
  })

  it('promotions fall back to the monogram and use real logos when registered', () => {
    expect(resolvePromotionImage('p1').state).toBe('fallback')
    registerPromotionArt('logo', ['p1'])
    expect(resolvePromotionImage('p1').url).toContain('promotions/logos/p1')
    expect(resolvePromotionImage('p2').state).toBe('fallback')
    expect(resolvePromotionImage('p1', 'banner').state).toBe('fallback')
  })

  it('news items map to a category image', () => {
    expect(NEWS_KINDS).toHaveLength(16)
    for (const k of NEWS_KINDS) expect(resolveNewsKind(k).state).toBe('real')
    expect(newsKind({ category: 'signing', headline: 'X signs' })).toBe('signing')
    expect(newsKind({ category: 'result', headline: 'A knocks out B in round 3' })).toBe('knockout')
    expect(newsKind({ category: 'result', headline: 'Major upset: C stuns D' })).toBe('upset')
    expect(newsKind({ category: 'retirement', headline: 'E retires' })).toBe('retirement')
    expect(newsKind({ category: 'event', headline: 'Show sold out' })).toBe('sold-out')
    expect(resolveNewsImage({ category: 'mystery', headline: 'x' }).state).toBe('real')
  })

  it('has at least eight poster templates, each with a background, and the gallery lists everything', () => {
    expect(POSTER_TEMPLATES.length).toBeGreaterThanOrEqual(8)
    for (const t of POSTER_TEMPLATES) expect(resolveEventTemplate(t).state).toBe('real')
    const g = galleryEntries()
    expect(g.filter((e) => e.kind === 'venue')).toHaveLength(9)
    expect(g.filter((e) => e.kind === 'eventTemplate')).toHaveLength(POSTER_TEMPLATES.length)
    expect(g.filter((e) => e.kind === 'news')).toHaveLength(16)
  })

  it('the gallery is a development route only', () => {
    const store = readFileSync(join(__dirname, '../store/gameStore.ts'), 'utf8')
    const shell = readFileSync(join(__dirname, '../ui/Shell.tsx'), 'utf8')
    expect(store).toMatch(/import\.meta\.env\.DEV[^\n]*assets/)
    expect(shell).toMatch(/AssetGallery = import\.meta\.env\.DEV \?/)
  })
})

describe('event posters', () => {
  const base = { hasMain: true, championship: false, ppv: false, international: false, rivalry: false, nextGen: false, bigVenue: false, fights: 5 }
  it('picks the most distinctive template, in priority order', () => {
    expect(choosePosterTemplate({ ...base, championship: true, ppv: true })).toBe('championship')
    expect(choosePosterTemplate({ ...base, ppv: true, international: true })).toBe('ppv')
    expect(choosePosterTemplate({ ...base, international: true, rivalry: true })).toBe('international')
    expect(choosePosterTemplate({ ...base, rivalry: true, nextGen: true })).toBe('rivalry')
    expect(choosePosterTemplate({ ...base, nextGen: true, bigVenue: true })).toBe('next-generation')
    expect(choosePosterTemplate({ ...base, bigVenue: true })).toBe('big-event')
    expect(choosePosterTemplate(base)).toBe('main-event')
    expect(choosePosterTemplate({ ...base, fights: 2 })).toBe('fight-night')
  })

  it('assembles a poster from public facts only: fighters, promotion, venue, date, broadcast', () => {
    const { before, eventId } = playedShow('poster')
    const p = eventPosterView(before, eventId)!
    expect(p.main).not.toBeNull()
    expect(p.main!.a.id).not.toBe(p.main!.b.id)
    expect(p.promotion.name).toBe('P48')
    expect(p.venue.name).toBe('Ironworks Social Club')
    expect(p.venue.kind).toBe('local-hall')
    expect(POSTER_TEMPLATES).toContain(p.templateId)
    expect(p.championship).toBe(false)
    expect(p.day).toBe(before.events[eventId].day)
    const keys = JSON.stringify(Object.keys(p.main!.a)) + JSON.stringify(Object.keys(p.venue))
    expect(keys).not.toMatch(/attribute|potential|discipline|composure|injury/i)
  })

  it('building a poster never mutates the game', () => {
    const { before, eventId } = playedShow('poster2')
    const snap = JSON.stringify(before)
    eventPosterView(before, eventId)
    expect(JSON.stringify(before)).toBe(snap)
  })

  it('ppv shows get the ppv template and badge', () => {
    const { before, eventId } = playedShow('poster3')
    const s = structuredClone(before)
    s.events[eventId].broadcast.kind = 'ppv'
    const p = eventPosterView(s, eventId)!
    expect(p.ppv).toBe(true)
    expect(p.templateId).toBe('ppv')
  })
})

describe('live fight presentation', () => {
  const { before, after, fightIds } = playedShow('present')
  const played = fightIds.map((id) => ({ id, fv: fightView(after, id)! })).filter((x) => x.fv?.result?.rounds)

  it('the show produced round-by-round data to present', () => { expect(played.length).toBeGreaterThan(0) })

  it('round totals built from the rounds equal the recorded fight statistics', () => {
    for (const { fv } of played) {
      const r = fv.result!
      const [a, b] = totalsThrough(r.rounds!, r.rounds!.length)
      expect([a.landed, b.landed]).toEqual(r.stats.landed)
      expect([a.thrown, b.thrown]).toEqual(r.stats.thrown)
      expect([a.power, b.power]).toEqual(r.stats.power)
      expect([a.knockdowns, b.knockdowns]).toEqual(r.kd)
      expect([a.accuracy, b.accuracy]).toEqual(r.stats.acc)
    }
  })

  it('totals only ever grow as rounds are revealed, and start at zero', () => {
    const r = played[0].fv.result!
    let last = -1
    expect(totalsThrough(r.rounds!, 0)[0].landed).toBe(0)
    for (let i = 0; i <= r.rounds!.length; i++) { const t = totalsThrough(r.rounds!, i)[0].landed; expect(t).toBeGreaterThanOrEqual(last); last = t }
  })

  it('control, rounds-won and the round history are read straight from the recorded rounds', () => {
    const r = played[0].fv.result!
    expect(control(r.rounds!, 0)).toBe(50)
    for (let i = 1; i <= r.rounds!.length; i++) expect(control(r.rounds!, i)).toBeGreaterThanOrEqual(0)
    const w = roundsWon(r.rounds!, r.rounds!.length)
    expect(w[0] + w[1] + w[2]).toBe(r.rounds!.length)
    expect(w[0]).toBe(r.rounds!.filter((x) => x.winner === 0).length)
  })

  it('every mode shows the same recorded result; only the dwell time differs', () => {
    for (const { fv } of played) {
      const r = fv.result!
      const fp = resultFingerprint(r)
      const plans = (PLAY_MODES.map((m) => m.id) as PlayMode[]).map((m) => ({ m, plan: planRounds(r, m), ms: planDuration(r, m) }))
      for (const p of plans) expect(p.plan).toHaveLength(r.rounds!.length) // every round is still accounted for
      expect(resultFingerprint(r)).toBe(fp)
      const ms = Object.fromEntries(plans.map((p) => [p.m, p.ms]))
      expect(ms.quick).toBe(0)
      expect(ms.key).toBeLessThanOrEqual(ms.watch)
      expect(ms.key).toBeGreaterThan(0)
    }
  })

  it('INVARIANT: presenting a fight in any mode (or not at all) leaves the game state and the result byte-identical', () => {
    const snap = JSON.stringify(after)
    const fp0 = played.map((p) => resultFingerprint(p.fv.result!))
    for (const mode of ['watch', 'key', 'quick'] as PlayMode[]) {
      for (const { fv } of played) {
        const r = fv.result!
        planRounds(r, mode); planDuration(r, mode)
        r.rounds!.forEach((rd, i) => { roundCommentary(rd, { a: 'A', b: 'B' }, r.rounds!.length); totalsThrough(r.rounds!, i + 1); control(r.rounds!, i + 1) })
        finishCard(r, { a: 'A', b: 'B' })
      }
    }
    expect(JSON.stringify(after)).toBe(snap)
    expect(played.map((p) => resultFingerprint(fightView(after, p.id)!.result!))).toEqual(fp0)
  })

  it('INVARIANT: the same show replayed from the same state gives the same results, whatever the presentation does in between', () => {
    const play = (watch: boolean) => {
      let s = structuredClone(before)
      const id = s.events[Object.keys(s.events).find((k) => s.events[k].name === 'Presentation Night')!].id
      const first = runNextEventFight(s, id)
      if (watch) { const fid = first.fightId!; const v = fightView(first.state, fid); if (v?.result?.rounds) for (const m of ['watch', 'key', 'quick'] as PlayMode[]) planRounds(v.result, m) }
      s = runEventToEnd(first.state, id).state
      return JSON.stringify(s)
    }
    expect(play(true)).toBe(play(false))
  })

  it('commentary uses only recorded facts: knockdown lines appear exactly for rounds with knockdowns', () => {
    for (const { fv } of played) {
      const r = fv.result!
      for (const rd of r.rounds!) {
        const lines = roundCommentary(rd, { a: fv.a.fighter.lastName, b: fv.b.fighter.lastName }, r.rounds!.length)
        const big = lines.filter((l) => l.tone === 'big')
        expect(big.length > 0).toBe(hasKnockdown(rd))
        expect(lines[0].text).toBe(rd.line)
        expect(lines.some((l) => l.text.includes(`${rd.a.landed} of ${rd.a.thrown}`))).toBe(true)
        expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length)
      }
    }
  })

  it('the finish card matches the recorded method, round and winner', () => {
    for (const { fv } of played) {
      const r = fv.result!
      const c = finishCard(r, { a: fv.a.fighter.lastName, b: fv.b.fighter.lastName })
      if (r.winner === null) expect(c.kind).toBe('draw')
      else if (r.stoppage) { expect(c.kind).toBe('ko'); expect(c.title).toContain(`ROUND ${r.round}`); expect(c.title).toMatch(/\d:\d\d/); expect(c.subtitle).toContain('WINS BY') }
      else { expect(c.kind).toBe('decision'); expect(c.method).toBe(r.methodLabel) }
      if (r.winner !== null) expect(c.winnerName).toBe(r.winner === 0 ? fv.a.fighter.lastName : fv.b.fighter.lastName)
    }
  })

  it('scorecards in a decision are the engine’s own cards (judges stay authoritative)', () => {
    const dec = played.find((p) => !p.fv.result!.stoppage && p.fv.result!.cards.length === 3)
    if (!dec) return
    const r = dec.fv.result!
    expect(r.cards).toEqual(after.fights[dec.id].result!.cards.map((c) => ({ a: c[0], b: c[1] })))
  })
})

describe('presentation preferences and audio', () => {
  it('the fight presentation mode is a valid, persisted preference', () => {
    expect(defaultPreferences().fightMode).toBe('watch')
    expect(parsePreferences(JSON.stringify({ fightMode: 'key' })).fightMode).toBe('key')
    expect(parsePreferences(JSON.stringify({ fightMode: 'nonsense' })).fightMode).toBe('watch')
  })

  it('live fight events map to the existing fight cues; the earlier result event stays silent when the screen presents the fight', () => {
    const names = (e: Parameters<typeof cuesFor>[0]) => cuesFor(e).map((c) => c.cue)
    expect(names({ type: 'fight.round', fightId: 'f', round: 1 })).toEqual(['bell', 'crowd'])
    expect(names({ type: 'fight.round', fightId: 'f', round: 4 })).toEqual(['bell'])
    expect(names({ type: 'fight.knockdown', fightId: 'f', round: 4 })).toEqual(['knockdown'])
    expect(names({ type: 'fight.finish', fightId: 'f', ko: true })).toEqual(['ko', 'resultAnnounce'])
    expect(names({ type: 'fight.finish', fightId: 'f', ko: false })).toEqual(['decision', 'resultAnnounce'])
    expect(cuesFor({ type: 'fight.result', fightId: 'f', method: 'KO', knockdowns: 1, presented: true })).toEqual([])
    expect(cuesFor({ type: 'fight.result', fightId: 'f', method: 'KO', knockdowns: 1 }).length).toBeGreaterThan(0)
    for (const e of [{ type: 'fight.round', fightId: 'f', round: 2 }, { type: 'fight.finish', fightId: 'f', ko: false }] as const) for (const c of cuesFor(e)) expect(CUES).toHaveProperty(c.cue)
  })
})

// Browser-test fixtures (only when E2E_FIXTURES=<dir>): a show in fight week whose FIRST fight is a knockout with knockdowns,
// and another whose first fight goes to the scorecards.
import { mkdirSync, writeFileSync } from 'node:fs'
import { serialiseGame } from './save'
describe.skipIf(!process.env.E2E_FIXTURES)('e2e fixtures (4.8)', () => {
  it('writes night fixtures', () => {
    const dir = process.env.E2E_FIXTURES!
    mkdirSync(dir, { recursive: true })
    const meta: Record<string, unknown> = {}
    for (let i = 0; i < 60 && !(meta.ko && meta.dec); i++) {
      const seed = `e2e-night-${i}`
      const { before, eventId } = playedShow(seed)
      const ev = before.events[eventId]
      const pending = ev.card.map((id) => before.fights[id]).filter((f) => f.status === 'fightNight')
      if (pending.length < 2) continue
      const run = runNextEventFight(before, eventId)
      const fid = run.fightId!
      const r = run.state.fights[fid].result
      if (!r?.rounds) continue
      const kd = r.kd[0] + r.kd[1]
      if (!meta.ko && r.method === 'KO' || !meta.ko && r.method === 'TKO') { if (kd > 0) { writeFileSync(`${dir}/night-ko.json`, serialiseGame(before)); meta.ko = { seed, eventId, fightId: fid, rounds: r.rounds.length, round: r.round, kd, method: r.method } } }
      else if (!meta.dec && ['UD', 'MD', 'SD'].includes(r.method)) { writeFileSync(`${dir}/night-dec.json`, serialiseGame(before)); meta.dec = { seed, eventId, fightId: fid, rounds: r.rounds.length, kd, method: r.method } }
    }
    writeFileSync(`${dir}/night-meta.json`, JSON.stringify(meta, null, 1))
    expect(meta.ko && meta.dec).toBeTruthy()
  })
})
