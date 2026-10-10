/**
 * Title / fight integrity pass: (1) a fight's length is decided in one place, persisted on the Fight and never shorter than its belt
 * requires; (2) the ladder of levels (area < British/Commonwealth < European < world): winning a higher level closes the lower reign with
 * an explicit reason, several belts of the SAME level stay legal (unified, undisputed, British + Commonwealth); (3) current titles come
 * only from the live belts, former titles only from closed reigns; (4) old saves are repaired without rewriting history.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createNewGame } from './worldgen'
import { advanceOneWeek } from './tick'
import { clone } from './media/testing'
import { getList, getReigns } from './media/records'
import { settleTitleFight, touchTitles, titleKey, titlesHeldBy, flagFight, enforceHierarchy, bodiesFor, higherBeltOf } from './media/titles'
import { createFight, scheduleOptions, scheduleFight } from './fights'
import { agreeFight, suggestedFightOffer } from './fightNegotiation'
import { runFightNight } from './commands'
import { settleRounds, fightRoundsProblem, requiredRounds } from './business/fightRounds'
import { TITLE_DEF_BY_ID, TITLE_ROUNDS, ELIMINATOR_ROUNDS, levelOf, levelRank } from './business/titleDefs'
import { fighterBusinessView, beltsHeld, currentTitleLabel, myTitlePaths } from './business/views'
import { normaliseTitles } from './business/titleNormalise'
import { applyDivisionMove, divisionMoveOptions } from './business/divisions'
import { fightView } from './fightViews'
import { viewsOf } from './view'
import { serialiseGame, deserialiseGame } from './save'
import { newLog, playWeek, STRATEGIES } from './sim/strategies'
import { requestTitleFight } from './business/titlePath'
import { championCampResponse } from './business/titleCamp'
import { SANCTIONING } from './media/orgs'
import { GAME_STATE_VERSION, type Fight, type GameState } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const mk = (seed: string) => createNewGame({ seed, promotionName: 'P54', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
const world = (() => { let s: GameState | null = null; return () => (s ??= (() => { let g = mk('p54-integrity'); for (let i = 0; i < 110; i++) g = advanceOneWeek(g); return g })()) })()

/** A champion of `body` and a ranked challenger inside its challenger range, both free to be matched in a scratch copy. */
function contest(s: GameState, pick: (body: string) => boolean, accepted = false) {
  for (const [key, rec] of Object.entries(s.media!.titles)) {
    const [body, wc] = key.split('|')
    if (!rec.c || !pick(body)) continue
    const d = TITLE_DEF_BY_ID[body]
    const e = getList(s.media!, body, wc as never)?.e.find((x) => x.r >= 1 && x.r <= d.challengerLimit && x.f !== rec.c && s.fighters[x.f].status === 'active')
    if (!e) continue
    const ids = bodiesFor(s, e.f, rec.c, wc as never)
    if (ids.includes(body) && (!accepted || championCampResponse(s, rec.c, e.f, wc as never, ids).accept)) return { body, wc, champ: rec.c, challenger: e.f }
  }
  return null
}

function agreedFight(s: GameState, a: string, b: string): Fight {
  s.fighters[a].activeFightId = null; s.fighters[b].activeFightId = null
  const f = createFight(s, a, b, s.playerPromotionId, 'player')
  f.status = 'agreed'
  return f
}

describe('one authoritative fight length', () => {
  const cases: [string, (b: string) => boolean, number][] = [
    ['world', (b) => levelOf(b) === 'world', 12],
    ['european', (b) => levelOf(b) === 'european', 12],
    ['british', (b) => b === 'british', 12],
    ['commonwealth', (b) => b === 'commonwealth', 12],
    ['area', (b) => levelOf(b) === 'area', TITLE_ROUNDS.area],
  ]
  for (const [name, pick, want] of cases) {
    it(`a ${name} title fight is ${want} rounds from the moment it is scheduled, never a generic default`, () => {
      const s = clone(world())
      const c = contest(s, pick)
      if (!c) { console.warn(`no ${name} contest in the test world`); return }
      const f = agreedFight(s, c.challenger, c.champ)
      expect(f.scheduledRounds).toBeLessThanOrEqual(12) // whatever the career rules chose at creation
      flagFight(s, f)
      expect(f.title, 'flagged as a title fight at scheduling').toBeTruthy()
      expect(settleRounds(s, f)).toBe(want)
      expect(f.scheduledRounds).toBe(want)
      expect(f.scheduledRounds).not.toBe(3)
      expect(fightRoundsProblem(s, f)).toBeNull()
      expect(fightView(s, f.id)!.rounds).toBe(want)
    })
  }

  it('an eliminator carries its configured distance; a fight with nothing at stake keeps the career rules (prospects stay short)', () => {
    const s = clone(world())
    const [key, rec] = Object.entries(s.media!.titles).find(([k, r]) => r.c && levelOf(k.split('|')[0]) === 'world')!
    const [body, wc] = key.split('|')
    const list = getList(s.media!, body, wc as never)!.e.filter((e) => e.r >= 1 && e.f !== rec.c && s.fighters[e.f].status === 'active' && !titlesHeldBy(s.media!, e.f).length)
    // two contenders whose meeting is not itself a title fight for some other (vacant) belt in the division
    const pair = list.flatMap((x, i) => list.slice(i + 1).map((y) => [x, y])).find(([x, y]) => bodiesFor(s, x.f, y.f, wc as never).length === 0)!
    rec.elim = { a: pair[0].f, b: pair[1].f, ordered: s.today, due: s.today + 180 }
    const f = agreedFight(s, pair[0].f, pair[1].f)
    flagFight(s, f)
    expect(f.title?.kind).toBe('eliminator')
    expect(settleRounds(s, f)).toBe(ELIMINATOR_ROUNDS.world)

    const rookies = Object.values(s.fighters).filter((x) => x.status === 'active' && x.record.wins + x.record.losses + x.record.draws < 4 && !titlesHeldBy(s.media!, x.id).length)
    expect(rookies.length).toBeGreaterThan(2)
    const g = agreedFight(s, rookies[0].id, rookies[1].id)
    g.weightClass = rookies[0].weightClass
    expect(requiredRounds({ kind: 'standard', level: null })).toBeNull()
    expect(settleRounds(s, g)).toBe(g.scheduledRounds)
    expect(g.scheduledRounds).toBeLessThanOrEqual(8)
    expect(g.title).toBeUndefined()
  })

  it('a negotiated length can never shorten a championship fight', () => {
    const s = clone(world())
    const c = contest(s, (b) => levelOf(b) === 'world')!
    const f = agreedFight(s, c.challenger, c.champ)
    f.status = 'negotiating'
    agreeFight(s, f, { ...suggestedFightOffer(s, c.champ), rounds: 4 })
    expect(f.scheduledRounds).toBe(12)
  })

  it('the same 12 rounds survive the whole lifecycle: request → talks → scheduling → fight night → result → history', () => {
    let s = clone(world())
    const c = contest(s, (b) => levelOf(b) === 'world', true)!
    // Make the challenger the player's fighter and clear anything that would stop the booking.
    const own = Object.values(s.contracts).find((x) => x.promotionId === s.playerPromotionId && x.status === 'active' && x.fighterId !== c.challenger)!
    s.fighters[own.fighterId].contractId = null
    own.fighterId = c.challenger
    s.fighters[c.challenger].contractId = own.id
    for (const id of [c.challenger, c.champ]) { s.fighters[id].activeFightId = null; s.fighters[id].injury = null; s.fighters[id].suspendedUntil = null; s.fighters[id].lastFightDay = null }
    const req = requestTitleFight(s, c.challenger, c.body)
    expect(req.ok, req.error).toBe(true)
    s = req.state
    const id = req.fightId!
    expect(s.fights[id].status).toBe('negotiating')
    expect(s.fights[id].scheduledRounds).toBe(12)               // matchmaking
    agreeFight(s, s.fights[id], suggestedFightOffer(s, c.champ))
    expect(s.fights[id].scheduledRounds).toBe(12)               // talks
    const day = scheduleOptions(s, id)[0].day
    const sched = scheduleFight(s, id, day)
    expect(sched.ok, sched.error).toBe(true)
    s = sched.state
    expect(s.fights[id].title?.bodies).toContain(c.body)
    expect(s.fights[id].scheduledRounds).toBe(12)               // scheduling
    expect(fightView(s, id)!.rounds).toBe(12)
    let guard = 0
    while (!s.fights[id].result && guard++ < 40) {
      if (s.fights[id].status === 'fightNight') { const r = runFightNight(s, id); expect(r.ok, r.error).toBe(true); s = r.state; break }
      s = advanceOneWeek(s)
      expect(s.fights[id].scheduledRounds, `week ${guard}`).toBe(12)  // every week until the bell
      expect(fightRoundsProblem(s, s.fights[id])).toBeNull()
    }
    const f = s.fights[id]
    expect(f.result, 'the fight was fought').toBeTruthy()
    expect(f.scheduledRounds).toBe(12)                          // simulation
    const fought = f.result!.rounds?.length ?? 0
    if (f.result!.method === 'UD' || f.result!.method === 'SD' || f.result!.method === 'MD' || f.result!.method === 'DRAW') expect(fought === 0 || fought === 12).toBe(true)
    expect(fought).toBeLessThanOrEqual(12)
    expect(fightView(s, id)!.rounds).toBe(12)                   // Fight Night / result page
    const hist = viewsOf(s).fighter(c.challenger)!.fightHistory.find((h) => h.fightId === id)
    if (hist) expect(hist.rounds).toBe(12)                      // career history
  })
})

describe('the playable game always enforces the championship distance', () => {
  it('media coupling is on in every shipped game: new games, loaded saves and migrated old saves; nothing outside tests ever turns it off', () => {
    const fresh = mk('p54-effects')
    expect(fresh.media!.effects).toBe(true)
    const raw = JSON.parse(serialiseGame(clone(world()))); raw.version = 9
    expect(deserialiseGame(JSON.stringify(raw))!.media!.effects).toBe(true)
    const roundTrip = deserialiseGame(serialiseGame(clone(world())))!
    expect(roundTrip.media!.effects).toBe(true)
    // A save from before the media world existed gets one built with coupling on.
    const old = JSON.parse(serialiseGame(clone(world()))); delete old.media; old.version = 4
    expect(deserialiseGame(JSON.stringify(old))?.media?.effects).toBe(true)
    const dirs = ['.', 'business', 'media', 'systems', 'events', 'fight', 'sim']
    for (const d of dirs) for (const f of readdirSync(join(__dirname, d)).filter((x) => x.endsWith('.ts') && !x.includes('.test.'))) {
      expect(readFileSync(join(__dirname, d, f), 'utf8'), `${d}/${f}`).not.toMatch(/effects\s*(=|:)\s*false/)
    }
  })
  it('with coupling on a short fight with a belt on the line is lengthened to the championship distance; only the test-only diagnostic mode (media observes) leaves it alone', () => {
    const s = clone(world())
    expect(s.media!.effects).toBe(true)
    const c = contest(s, (b) => levelOf(b) === 'world')!
    const f = agreedFight(s, c.challenger, c.champ)
    f.scheduledRounds = 6
    expect(settleRounds(s, f)).toBe(12)
    s.media!.effects = false // the test-only diagnostic mode: media observes, titles do not shape the sport
    f.scheduledRounds = 6
    expect(settleRounds(s, f)).toBe(6)
  })
})

describe('the ladder of levels', () => {
  const setup = () => {
    const s = clone(world())
    const wc = 'superFeatherweight' as const
    const x = Object.values(s.fighters).find((f) => f.status === 'active' && f.weightClass === wc && !titlesHeldBy(s.media!, f.id).length)!
    const hold = (body: string, id = x.id) => { s.media!.titles[titleKey(body, wc)] = { c: id, cn: 'X', since: s.today - 400, defences: 2, lastFight: s.today - 30 }; touchTitles(s.media!) }
    return { s, wc, x, hold }
  }

  it('a lower title booked before a fighter moved up is not awarded to them: the fight stands, the belt stays open, no zero-length reign appears', () => {
    const { s, wc, x, hold } = setup()
    hold('atlas')                                                        // x now holds a world belt
    s.media!.titles[titleKey('european', wc)] = { c: null, since: s.today - 200, defences: 0, lastFight: s.today - 200, vacantSince: s.today - 200 }
    touchTitles(s.media!)
    const y = Object.values(s.fighters).find((f) => f.status === 'active' && f.weightClass === wc && f.id !== x.id && !titlesHeldBy(s.media!, f.id).length)!
    const fight = agreedFight(s, x.id, y.id)
    fight.weightClass = wc
    s.media!.titleFights[fight.id] = ['european']                        // flagged as a European fight when it was booked
    ;(fight as { result: unknown }).result = { winner: 0, method: 'UD', round: 12, second: 0, cards: [[1, 0], [1, 0], [1, 0]], kd: [0, 0], tot: [0, 0, 0, 0, 0, 0, 0, 0], deductions: [0, 0], pExpA: 0.5, dRep: [0, 0], dPop: [0, 0], perf: [0, 0], injuries: [null, null], importance: 10, upset: 0 }
    const reignsBefore = getReigns(s.media!).length
    settleTitleFight(s, s.media!, fight)
    expect(s.media!.titles[titleKey('european', wc)].c, 'the European belt is not given to a world champion').toBeNull()
    expect(getReigns(s.media!).length).toBe(reignsBefore)
    expect(titlesHeldBy(s.media!, x.id).map((t) => t.body)).toEqual(['atlas'])
  })

  it('winning a world belt closes every lower reign in the same transition, with an explicit, dated reason; history is kept', () => {
    const { s, wc, x, hold } = setup()
    for (const b of ['european', 'british', 'commonwealth', 'area_eng', 'atlas']) hold(b)
    enforceHierarchy(s, s.media!)
    expect(titlesHeldBy(s.media!, x.id).map((t) => t.body)).toEqual(['atlas'])
    const closed = getReigns(s.media!).filter((r) => r.f === x.id && /moved up/.test(r.how))
    expect(closed.map((r) => r.b).sort()).toEqual(['area_eng', 'british', 'commonwealth', 'european'])
    for (const r of closed) { expect(r.how).toMatch(/^relinquished — moved up to the WBC world title/); expect(r.to).toBe(s.today); expect(r.to!).toBeGreaterThanOrEqual(r.from); expect(r.f).toBe(x.id) }
    for (const b of ['european', 'british', 'commonwealth', 'area_eng']) { const rec = s.media!.titles[titleKey(b, wc)]; expect(rec.c).toBeNull(); expect(rec.vacantSince).toBe(s.today) }
  })

  it('several world belts are legal (unified, undisputed); British + Commonwealth together are legal; European supersedes those and area', () => {
    const { s, x, hold } = setup()
    const worlds = SANCTIONING.filter((o) => levelOf(o.id) === 'world').map((o) => o.id)
    for (const b of worlds) hold(b)
    hold('british'); hold('commonwealth')
    enforceHierarchy(s, s.media!)
    expect(titlesHeldBy(s.media!, x.id).map((t) => t.body).sort()).toEqual([...worlds].sort()) // all world belts kept, domestic ones gone
    expect(currentTitleLabel(s, x.id)).toBe('Undisputed world champion')
    const t = setup()
    t.hold('british'); t.hold('commonwealth'); t.hold('area_eng')
    enforceHierarchy(t.s, t.s.media!)
    expect(titlesHeldBy(t.s.media!, t.x.id).map((q) => q.body).sort()).toEqual(['british', 'commonwealth'])
    expect(currentTitleLabel(t.s, t.x.id)).toBe('Domestic champion')
    const u = setup()
    // "unified" means some world belts of the division are held by others: make sure the other two exist (as open belts) whatever the world has made of this division
    for (const b of worlds.filter((w) => w !== 'atlas' && w !== 'pioneer')) if (!u.s.media!.titles[titleKey(b, u.wc)]) u.s.media!.titles[titleKey(b, u.wc)] = { c: null, since: u.s.today, defences: 0, lastFight: u.s.today, vacantSince: u.s.today }
    u.hold('atlas'); u.hold('pioneer')
    enforceHierarchy(u.s, u.s.media!)
    expect(currentTitleLabel(u.s, u.x.id)).toBe('Unified world champion')
  })

  it('a champion who wins a world title in a real fight gives up the lower belt in that settlement; the lower reign stays in history', () => {
    const { s, wc, x, hold } = setup()
    hold('european')
    const champ = Object.values(s.fighters).find((f) => f.status === 'active' && f.weightClass === wc && f.id !== x.id && !titlesHeldBy(s.media!, f.id).length)!
    s.media!.titles[titleKey('atlas', wc)] = { c: champ.id, cn: 'C', since: s.today - 300, defences: 1, lastFight: s.today - 60 }
    touchTitles(s.media!)
    const fight = agreedFight(s, x.id, champ.id)
    fight.weightClass = wc
    s.media!.titleFights[fight.id] = ['atlas']
    fight.title = { name: 'WBC', tier: 'world', level: 'world', kind: 'title', bodies: ['atlas'] }
    fight.status = 'fightNight'
    fight.day = s.today
    fight.result = { winner: 0, method: 'KO', round: 5, second: 30, cards: [], kd: [1, 0], tot: [], deductions: [0, 0], pExpA: 0.5, dRep: [0, 0], dPop: [0, 0] } as never
    const ev = settleTitleFight(s, s.media!, fight)
    expect(titlesHeldBy(s.media!, x.id).map((t) => t.body)).toEqual(['atlas'])
    expect(ev.some((e) => e.kind === 'TITLE_VACANT' && e.body === 'european' && /moved up/.test(e.how ?? ''))).toBe(true)
    expect(getReigns(s.media!).some((r) => r.f === x.id && r.b === 'european' && /moved up to the WBC/.test(r.how))).toBe(true)
    // …and as far as the views go: current is the world belt only, the European reign is former.
    const v = fighterBusinessView(s, x.id)!
    expect(v.held.map((h) => h.body)).toEqual(['atlas'])
    expect(v.currentLabel).toBe('WBC world champion')
    expect(v.former.map((r) => r.title)).toContain('European Super Featherweight Championship')
    expect(beltsHeld(s, x.id).map((h) => h.short)).toEqual(['WBC'])
  })

  it('a fighter who holds a higher belt is not a challenger for a lower one, and is not listed on the lower lists', () => {
    const { s, wc, x, hold } = setup()
    hold('atlas')
    expect(higherBeltOf(s.media!, x.id, wc, 'european')).toBe('atlas')
    const euroChamp = Object.values(s.fighters).find((f) => f.status === 'active' && f.weightClass === wc && f.id !== x.id)!
    s.media!.titles[titleKey('european', wc)] = { c: euroChamp.id, cn: 'E', since: s.today - 200, defences: 0, lastFight: s.today - 20 }
    touchTitles(s.media!)
    expect(bodiesFor(s, x.id, euroChamp.id, wc)).not.toContain('european')
  })

  it('a division move relinquishes every belt at the old weight with a reason; nothing stays current in the old division', () => {
    const s = clone(world())
    const champ = Object.values(s.fighters).find((f) => f.status === 'active' && !f.activeFightId && (f.lastFightDay === null || s.today - f.lastFightDay > 28) && titlesHeldBy(s.media!, f.id).length > 0 && divisionMoveOptions(s, f).some((o) => !o.blocked))
    if (!champ) { console.warn('no free champion in this world'); return }
    const from = champ.weightClass
    const opt = divisionMoveOptions(s, champ).find((o) => !o.blocked)!
    expect(applyDivisionMove(s, champ.id, opt.to)).toBeNull()
    expect(titlesHeldBy(s.media!, champ.id).filter((t) => t.wc === from)).toEqual([])
    expect(getReigns(s.media!).some((r) => r.f === champ.id && r.wc === from && /^relinquished — moving/.test(r.how))).toBe(true)
    const v = fighterBusinessView(s, champ.id)!
    expect(v.held.every((h) => !h.title.includes(from))).toBe(true)
  })
})

describe('title path and rankings use the live belts', () => {
  it('a world champion\'s path is champion → defend / unify / undisputed, never European → World', () => {
    const s = clone(world())
    const [, rec] = Object.entries(s.media!.titles).find(([k, r]) => r.c && levelOf(k.split('|')[0]) === 'world')!
    const own = Object.values(s.contracts).find((x) => x.promotionId === s.playerPromotionId && x.status === 'active')!
    s.fighters[own.fighterId].contractId = null
    own.fighterId = rec.c!
    s.fighters[rec.c!].contractId = own.id
    const p = myTitlePaths(s).find((x) => x.id === rec.c)!
    expect(p.champion).toBeTruthy()
    expect(p.champion!.road).toMatch(/Defend → (unify|build)/)
    expect(p.champion!.label).toMatch(/world champion/i)
    expect(p.targets.every((t) => levelRank(t.level) >= levelRank('world') || t.state !== 'ready')).toBe(true)
  })
})

describe('saves from before the fix are repaired, not rewritten', () => {
  it('a v9 save with a world + European double holder and a short title fight is normalised: history kept, belts and length corrected', () => {
    const s = clone(world())
    const wc = 'superFeatherweight' as const
    const x = Object.values(s.fighters).find((f) => f.status === 'active' && f.weightClass === wc && !titlesHeldBy(s.media!, f.id).length)!
    s.media!.titles[titleKey('atlas', wc)] = { c: x.id, cn: 'X', since: s.today - 60, defences: 0, lastFight: s.today - 20 }
    s.media!.titles[titleKey('pioneer', wc)] = { c: x.id, cn: 'X', since: s.today - 50, defences: 0, lastFight: s.today - 20 }
    s.media!.titles[titleKey('european', wc)] = { c: x.id, cn: 'X', since: s.today - 300, defences: 3, lastFight: s.today - 60 }
    touchTitles(s.media!)
    const c = contest(s, (b) => levelOf(b) === 'world')!
    const f = agreedFight(s, c.challenger, c.champ)
    flagFight(s, f)
    f.scheduledRounds = 10 // what the old rules produced
    const reignsBefore = getReigns(s.media!).length
    const raw = JSON.parse(serialiseGame(s))
    raw.version = 9
    const back = deserialiseGame(JSON.stringify(raw))!
    expect(back.version).toBe(GAME_STATE_VERSION)
    expect(titlesHeldBy(back.media!, x.id).map((t) => t.body).sort()).toEqual(['atlas', 'pioneer'])    // world belts (two) preserved
    expect(getReigns(back.media!).length).toBeGreaterThan(reignsBefore)                                  // the European reign was closed, not deleted
    expect(getReigns(back.media!).some((r) => r.f === x.id && r.b === 'european' && /relinquished — moved up/.test(r.how))).toBe(true)
    expect(back.fights[f.id].scheduledRounds).toBe(12)
    const again = normaliseTitles(back)
    expect(again).toEqual({ closed: 0, vacated: 0, flagsFixed: 0, roundsFixed: 0 })                      // idempotent
  })
})

describe('migration touches only what is inconsistent', () => {
  it('completed fights, careers, awards, stories, ratings and healthy belts are byte-identical after v9 → v10; only the double holder, its booked fight and the version change', () => {
    const s = clone(world())
    const wc = 'superFeatherweight' as const
    const x = Object.values(s.fighters).find((f) => f.status === 'active' && f.weightClass === wc && !titlesHeldBy(s.media!, f.id).length)!
    s.media!.titles[titleKey('atlas', wc)] = { c: x.id, cn: 'X', since: s.today - 60, defences: 0, lastFight: s.today - 20 }
    s.media!.titles[titleKey('european', wc)] = { c: x.id, cn: 'X', since: s.today - 300, defences: 3, lastFight: s.today - 60 }
    touchTitles(s.media!)
    // An old completed title fight fought over 10 rounds stays exactly as it was (it is history).
    const done = Object.values(s.fights).filter((f) => f.result && f.title)
    expect(done.length).toBeGreaterThan(5)
    const shortHistoric = done.find((f) => f.scheduledRounds < 12)
    const c = contest(s, (b) => levelOf(b) === 'world')!
    const booked = agreedFight(s, c.challenger, c.champ); flagFight(s, booked); booked.scheduledRounds = 10
    const snapshot = JSON.parse(JSON.stringify(s))
    const raw = JSON.parse(serialiseGame(s)); raw.version = 9
    const back = JSON.parse(JSON.stringify(deserialiseGame(JSON.stringify(raw))!))
    // Completed fights: identical, including the distance they were fought over.
    for (const f of Object.values(snapshot.fights) as Fight[]) if (f.result) expect(back.fights[f.id], f.id).toEqual(f)
    if (shortHistoric) expect(back.fights[shortHistoric.id].scheduledRounds).toBe(shortHistoric.scheduledRounds)
    // Everything that is not title state or a booked title fight is untouched.
    for (const key of ['fighters', 'contracts', 'promotions', 'events', 'ledger', 'venues', 'knowledge', 'idCounter', 'rngState']) expect(back[key], key).toEqual(snapshot[key])
    expect(back.media.stories).toEqual(snapshot.media.stories)
    expect(back.media.rankings).toEqual(snapshot.media.rankings)
    expect(back.media.awards).toEqual(snapshot.media.awards)
    expect(back.media.career).toEqual(snapshot.media.career)
    // Healthy belts are untouched; the only belt records that changed are the double holder's lower belt.
    const changed = Object.keys(snapshot.media.titles).filter((k) => JSON.stringify(back.media.titles[k]) !== JSON.stringify(snapshot.media.titles[k]))
    expect(changed).toEqual([titleKey('european', wc)])
    // Old reigns are all still there, in order, untouched (the newest reign comes first, so the new one is added at the front).
    const oldReigns = getReigns(snapshot.media as never), newReigns = getReigns(back.media as never)
    expect(newReigns.length).toBe(oldReigns.length + 1)
    expect(newReigns.slice(1).map((r) => JSON.stringify(r))).toEqual(oldReigns.map((r) => JSON.stringify(r)))
    expect(newReigns[0]).toMatchObject({ f: x.id, b: 'european', wc })
    // The booked fight is the only unfought fight that changed, and only in its length.
    for (const f of Object.values(snapshot.fights) as Fight[]) if (!f.result && f.id !== booked.id) expect(back.fights[f.id], f.id).toEqual(f)
    expect(back.fights[booked.id].scheduledRounds).toBe(12)
    expect({ ...back.fights[booked.id], scheduledRounds: 10 }).toEqual(snapshot.fights[booked.id])
  })
})

describe('long-run audit (3 years, bot-played)', () => {
  it('no fighter is World + lower champion, no retired or departed champion, every title fight has its distance', () => {
    let s = mk('p54-integrity-long')
    const log = newLog()
    const problems: string[] = []
    let checkedFights = 0, unified = 0
    for (let w = 1; w <= 156; w++) {
      s = playWeek(s, STRATEGIES.balanced, log)
      s = advanceOneWeek(s)
      const m = s.media!
      const byFighter = new Map<string, Map<string, number[]>>()
      for (const [k, rec] of Object.entries(m.titles)) {
        if (!rec.c) continue
        const [body, wc] = k.split('|')
        const f = s.fighters[rec.c]
        // A fighter who retires this week gives the belt up in the weekly title pass that follows: one week of grace, no more.
        if (f.status === 'retired' && (f.retiredDay === null || s.today - f.retiredDay > 7)) problems.push(`w${w} ${k}: retired champion`)
        else if (f.status !== 'retired' && f.weightClass !== wc) problems.push(`w${w} ${k}: champion fights at ${f.weightClass}`)
        const per = byFighter.get(rec.c) ?? new Map<string, number[]>()
        per.set(wc, [...(per.get(wc) ?? []), levelRank(levelOf(body))])
        byFighter.set(rec.c, per)
      }
      for (const [id, per] of byFighter) for (const [wc, levels] of per) {
        if (new Set(levels).size > 1) problems.push(`w${w} ${id}@${wc}: holds belts of different levels ${levels.join(',')}`)
        if (levels.filter((l) => l === levelRank('world')).length >= 2) unified++
      }
      for (const fight of Object.values(s.fights)) {
        if (fight.title) { const p = fightRoundsProblem(s, fight); checkedFights++; if (p) problems.push(`w${w} ${fight.id}: ${p}`) }
        if (fight.title && fight.scheduledRounds === 3) problems.push(`${fight.id}: a 3-round title fight`)
      }
      if (problems.length > 12) break
    }
    expect(problems).toEqual([])
    expect(checkedFights).toBeGreaterThan(50)
    void unified
  }, 600_000)
})
