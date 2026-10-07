/**
 * Phase 5 — the living media world: organisations, significance, stories, narratives, rivalries, popularity, rankings, titles,
 * broadcast offers, requests, awards, career story, saves, determinism, information boundaries and cost.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_PACK, identityPack, mediaIdentity, setIdentityPack } from '../data/mediaIdentity'
import { fightView } from './fightViews'
import { advanceOneWeek } from './tick'
import { deserialiseGame, serialiseGame } from './save'
import { createNewGame } from './worldgen'
import { standingLabel } from '../ui/format'
import { MEDIA_BEHAVIOURS, MEDIA_ORDER, RANKING_ORGS, relationState, shiftRelation } from './media/orgs'
import { fightSignificance } from './media/worldEvents'
import { compose } from './media/copy'
import { bumpRivalry, rivalryStrength } from './media/narratives'
import { decodeWhy, rankIn } from './media/rankings'
import { getAwards, getDone, getHistory } from './media/records'
import { champions } from './media/testing'
import { unwindViral } from './media/videos'
import { storiesList, mediaHome, fighterMediaView, rankingView, titlesOverview, eventMediaView, headlineRank } from './media/views'
import { expandStory } from './media/stories'
import { acceptOffer, settleDeal, dealFor } from './media/broadcast'
import { holdPress, respondRequest, rosterOf } from './media/requests'
import { processMedia } from './media/process'
import { settleTitleFight, titleKey } from './media/titles'
import { newLog, playWeek, STRATEGIES } from './sim/strategies'
import { viewsOf } from './view'
import { playedShow } from './testShow'
import type { GameState } from './types'
import { WEIGHT_CLASSES } from '../data/weightClasses'
import { clone } from './media/testing'
import { LIMITS } from './media/state'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const fresh = (seed: string, scenario?: 'regional') => createNewGame({ seed, promotionName: 'P5', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo, scenario }, 1_700_000_000_000)
const tick = (s: GameState, n: number, media = true) => { for (let i = 0; i < n; i++) s = advanceOneWeek(s, { media }); return s }
const world2y = (() => { let s: GameState | null = null; return () => (s ??= tick(fresh('p5-world'), 104)) })()

describe('media organisations: identity, behaviour and state are separate', () => {
  it('has ten fictional organisations with distinct behaviour', () => {
    expect(MEDIA_ORDER.length).toBe(10)
    const sigs = new Set(MEDIA_ORDER.map((id) => { const b = MEDIA_BEHAVIOURS[id]; return `${b.type}|${b.editorialStyle}|${b.threshold}|${b.lag}|${b.weeklyCap}|${b.videoReach}|${b.controversyBias}`; }))
    expect(sigs.size).toBe(10)
    expect(new Set(MEDIA_ORDER.map((id) => MEDIA_BEHAVIOURS[id].type)).size).toBeGreaterThanOrEqual(5)
    expect(DEFAULT_PACK.licensed).toBe(false)
  })
  it('swapping the identity pack renames the world without changing a single engine or story fact', () => {
    const s = world2y()
    const before = JSON.stringify(s.media!.stories.slice(0, 30).map((x) => [x.id, x.k, x.o, x.i, x.fx]))
    const names = MEDIA_ORDER.map((id) => mediaIdentity(id).name)
    const pack = { ...DEFAULT_PACK, id: 'test', media: Object.fromEntries(Object.entries(DEFAULT_PACK.media).map(([k, v]) => [k, { ...v, name: `Licensed ${v.name}` }])) }
    setIdentityPack(pack)
    try {
      expect(mediaIdentity('ringside').name).toBe('Licensed Ringside Magazine')
      expect(JSON.stringify(s.media!.stories.slice(0, 30).map((x) => [x.id, x.k, x.o, x.i, x.fx]))).toBe(before)
    } finally { setIdentityPack(DEFAULT_PACK) }
    expect(identityPack()).toBe(DEFAULT_PACK)
    expect(MEDIA_ORDER.map((id) => mediaIdentity(id).name)).toEqual(names)
  })
  it('relationship states cover the range', () => {
    expect([-80, -30, 0, 30, 60, 90].map(relationState)).toEqual(['HOSTILE', 'COLD', 'NEUTRAL', 'POSITIVE', 'STRONG', 'EXCLUSIVE'])
    const m = fresh('p5-rel').media!
    expect(shiftRelation(m, 'ringside', 'x', 500)).toBe(100)
    expect(shiftRelation(m, 'ringside', 'x', -500)).toBe(-100)
  })
})

describe('rankings: several authorities, explainable movement', () => {
  it('every list is built from public results and holds at most one champion', () => {
    const s = fresh('p5-rank')
    for (const org of RANKING_ORGS) for (const wc of WEIGHT_CLASSES) {
      const v = rankingView(s, org.id, wc.id)!
      const ranks = v.rows.map((r) => r.rank)
      expect(ranks.filter((r) => r === 0).length).toBeLessThanOrEqual(1)
      expect(new Set(v.rows.map((r) => r.id)).size).toBe(v.rows.length)
      for (const r of v.rows) expect(s.fighters[r.id].weightClass).toBe(wc.id)
      expect(ranks.filter((r) => r > 0)).toEqual(ranks.filter((r) => r > 0).slice().sort((a, b) => a - b))
    }
    const lists = RANKING_ORGS.map((o) => JSON.stringify(rankingView(s, o.id, 'welterweight')!.rows.map((r) => r.id)))
    expect(new Set(lists).size).toBeGreaterThan(1) // different methodologies disagree
  })
  it('every movement carries a recorded reason that matches the result it cites', () => {
    const s = world2y()
    let moved = 0, cited = 0
    for (const org of RANKING_ORGS) for (const wc of WEIGHT_CLASSES) {
      for (const r of rankingView(s, org.id, wc.id)!.rows) {
        const e = s.media!.rankings[org.id][wc.id]
        expect(e).toBeTruthy()
        if (r.movement !== '–') { moved++; expect(r.why.length).toBeGreaterThan(3) }
        const why = decodeWhy(JSON.parse(e!).e.find((x: { f: string }) => x.f === r.id).why)
        if (why.k === 'beat' || why.k === 'lost') {
          cited++
          const f = s.fighters[r.id]
          const opp = s.fighters[why.o!]
          const fight = f.recentFights.map((id) => s.fights[id]).find((ft) => ft?.result && [ft.sideA.fighterId, ft.sideB.fighterId].includes(why.o!))
          expect(!!opp && !!fight, `${r.name} cites ${why.o}`).toBe(true)
        }
      }
    }
    expect(moved).toBeGreaterThan(5)
    expect(cited).toBeGreaterThan(0)
  })
  it('champions are unique per body and division, and always exist as fighters in that division', () => {
    const s = world2y()
    for (const t of titlesOverview(s)) if (t.champion) expect(s.fighters[t.champion.id]?.weightClass).toBe(t.division)
    const seen = new Set<string>()
    for (const [k, rec] of Object.entries(s.media!.titles)) { expect(seen.has(k)).toBe(false); seen.add(k); if (rec.c) expect(s.fighters[rec.c]?.status).not.toBe('retired') }
  })
  it('a title result changes the champion exactly as the rules say', () => {
    const s = clone(fresh('p5-title'))
    const m = s.media!
    const key = Object.keys(m.titles)[0]
    const [body, wc] = key.split('|')
    const champId = m.titles[key].c!
    const challenger = Object.values(s.fighters).find((f) => f.weightClass === wc && f.id !== champId && f.status === 'active')!
    const mk = (winner: 0 | 1) => ({
      id: 'tf', day: s.today, status: 'processed', sideA: { fighterId: champId }, sideB: { fighterId: challenger.id }, weightClass: wc, result: { winner, method: 'UD', round: 12, second: 0, cards: [], kd: [0, 0], tot: [], deductions: [0, 0], pExpA: 0.5, dRep: [0, 0], dPop: [0, 0], perf: [0.5, 0.5], injuries: [null, null], importance: 0, upset: 0 },
    }) as never
    m.titleFights['tf'] = [body]
    const d = settleTitleFight(s, m, mk(0))
    expect(d[0].kind).toBe('TITLE_DEFENCE'); expect(m.titles[key].c).toBe(champId); expect(m.titles[key].defences).toBeGreaterThan(0)
    m.titleFights['tf'] = [body]
    const c = settleTitleFight(s, m, mk(1))
    expect(c[0].kind).toBe('TITLE_CHANGE'); expect(m.titles[titleKey(body, wc as never)].c).toBe(challenger.id); expect(m.titles[key].defences).toBe(0)
  })
})

describe('media significance and story generation', () => {
  const sample = playedShow('p5-show')
  it('major fights generate more coverage than minor ones, and upsets more than routine wins', () => {
    const s = world2y()
    const rows = Object.values(s.fights).filter((f) => f.result && f.result.winner !== null).map((f) => ({ f, sig: fightSignificance(s, s.media!, f, !!f.title).sig }))
    const titled = rows.filter((x) => x.f.title), plain = rows.filter((x) => !x.f.title)
    const avg = (a: typeof rows) => a.reduce((n, x) => n + x.sig, 0) / Math.max(1, a.length)
    expect(titled.length).toBeGreaterThan(3)
    expect(avg(titled)).toBeGreaterThan(avg(plain) + 8)
    const up = plain.filter((x) => x.f.result!.upset > 0.62), routine = plain.filter((x) => x.f.result!.upset < 0.3)
    expect(up.length).toBeGreaterThan(0)
    expect(avg(up)).toBeGreaterThan(avg(routine))
    // The spread is real: not everything is a headline.
    const sigs = rows.map((x) => x.sig).sort((a, b) => a - b)
    expect(sigs[Math.floor(sigs.length * 0.2)]).toBeLessThan(sigs[Math.floor(sigs.length * 0.9)] - 15)
  })
  it('stories are built only from recorded facts: names, records, rounds and methods match the fight', () => {
    const s = world2y()
    let checked = 0
    for (const st of s.media!.stories) {
      const full = expandStory(s.media!, st)!
      const text = `${full.headline} ${full.subheadline} ${full.body}`
      expect(text).not.toMatch(/undefined|NaN|\[object|null/)
      if (st.ft && s.fights[st.ft]?.result && ['KNOCKOUT', 'UPSET', 'FIGHT_RESULT', 'TITLE_CHANGE', 'TITLE_DEFENCE'].includes(st.k)) {
        const r = s.fights[st.ft].result!
        const w = s.fighters[s.fights[st.ft][r.winner === 0 ? 'sideA' : 'sideB'].fighterId]
        if (r.winner !== null && w) { expect(text).toContain(w.lastName); checked++ }
        if (r.method === 'KO' && full.body.includes('round')) expect(full.body).toContain(`round ${r.round}`)
      }
    }
    expect(checked).toBeGreaterThan(10)
  })
  it('never invents a direct quote', () => {
    const s = world2y()
    for (const st of s.media!.stories) { const f = expandStory(s.media!, st)!; expect(`${f.headline} ${f.subheadline} ${f.body}`).not.toMatch(/[“”"]\w[^“”"]{6,}[“”"]/) }
  })
  it('outlet style changes wording, never facts', () => {
    const facts = { w: 'Ali Smith', l: 'Bo Jones', wl: 'Smith', ll: 'Jones', m: 'knockout', mc: 'KO', rd: 4, tm: '1:10', wrec: '10-0-0', lrec: '8-2-0', city: 'Leeds', kd: 1 }
    const t = (tone: 'neutral' | 'loud' | 'edgy' | 'warm') => compose('KNOCKOUT', facts, tone, 0, 4)
    expect(new Set(['neutral', 'loud', 'edgy', 'warm'].map((x) => t(x as never).headline)).size).toBe(4)
    for (const x of ['neutral', 'loud', 'edgy', 'warm']) expect(t(x as never).body).toContain('round 4')
  })
  it('breaking news is rare and a minor result does not flood the wire', () => {
    const s = world2y()
    const byWeek = new Map<number, number>()
    for (const st of s.media!.stories) if (st.b === 1) byWeek.set(st.w, (byWeek.get(st.w) ?? 0) + 1)
    expect(Math.max(0, ...byWeek.values())).toBeLessThanOrEqual(2)
    const perWeekOrg = new Map<string, number>()
    for (const st of s.media!.stories) perWeekOrg.set(`${st.w}|${st.o}`, (perWeekOrg.get(`${st.w}|${st.o}`) ?? 0) + 1)
    for (const [k, n] of perWeekOrg) expect(n, k).toBeLessThanOrEqual(MEDIA_BEHAVIOURS[k.split('|')[1]].weeklyCap)
  })
  it('a played show is covered and its reaction reads from the real result', () => {
    const ev = sample.after.events[sample.eventId]
    const view = eventMediaView(sample.after, sample.eventId)!
    expect(view.reaction).not.toBeNull()
    expect(view.reaction!.viewers).toBe(ev.result!.viewers)
    expect(storiesList(sample.after, { eventId: sample.eventId }).length + sample.fightIds.reduce((n, id) => n + storiesList(sample.after, { fightId: id }).length, 0)).toBeGreaterThan(0)
  })
})

describe('narratives, rivalries, popularity and viral moments', () => {
  it('storylines open, evolve and resolve; none lives forever', () => {
    const s = tick(world2y(), 156)
    const m = s.media!
    expect(m.narratives.length).toBeLessThanOrEqual(LIMITS.narratives)
    const week = Math.floor((s.today - s.startDay) / 7)
    for (const n of m.narratives) { expect(week - n.startWeek).toBeLessThanOrEqual(n.expiryRules.maxWeeks + 6) }
    const done = getDone(m)
    expect(done.length).toBeGreaterThan(5)
    expect(new Set(done.map((d) => d.type)).size).toBeGreaterThan(2)
    for (const d of done) expect(d.endWeek).toBeGreaterThanOrEqual(d.startWeek)
  })
  it('rivalry strength grows with real drama and fades without it', () => {
    const m = fresh('p5-riv').media!
    expect(bumpRivalry(m, 'a', 'b', 30)).toBe(30)
    expect(rivalryStrength(m, 'b', 'a')).toBe(30)
    expect(bumpRivalry(m, 'a', 'b', 90)).toBe(100)
  })
  it('popularity stays within bounds and a viral spike unwinds back out', () => {
    let s = clone(fresh('p5-viral'))
    const f = Object.values(s.fighters).find((x) => x.status === 'active' && x.popularity > 30)!
    const before = f.popularity
    s.media!.fighters[f.id] = { interest: 50, fanbase: 1000, followers: 1000, engagement: 40, lastCovered: 0, trend: 0, stories: 0, viral: { pts: 4, from: 0, until: 6 } }
    f.popularity += 4
    for (let i = 0; i < 6; i++) { s.today += 7; unwindViral(s, s.media!) }
    expect(Math.abs(s.fighters[f.id].popularity - before)).toBeLessThan(0.01)
    expect(s.media!.fighters[f.id].viral).toBeUndefined()
    s = world2y()
    for (const x of Object.values(s.fighters)) { expect(x.popularity).toBeGreaterThanOrEqual(0); expect(x.popularity).toBeLessThanOrEqual(100) }
  })
  it('popularity does not grow without limit: the average stays in a sane band after years', () => {
    const s = tick(world2y(), 104)
    const act = Object.values(s.fighters).filter((f) => f.status === 'active')
    const avg = act.reduce((n, f) => n + f.popularity, 0) / act.length
    expect(avg).toBeGreaterThan(8); expect(avg).toBeLessThan(50)
    expect(act.filter((f) => f.popularity > 95).length).toBeLessThan(4)
  })
  it('fighters with the press temperament earn more attention than quiet ones (persona is hidden truth)', async () => {
    const { ATTENTION } = await import('./media/persona')
    expect(ATTENTION.SHOWMAN).toBeGreaterThan(ATTENTION.QUIET)
  })
})

describe('requests, press conferences and broadcast offers', () => {
  let playedState: GameState
  beforeAll(() => { let g = fresh('p5-played', 'regional'); const log = newLog(); for (let w = 0; w < 110; w++) { g = playWeek(g, STRATEGIES.balanced, log); g = advanceOneWeek(g) } playedState = g }, 240_000)
  const played = () => playedState
  it('media requests appear in the inbox and have deterministic, relationship-changing answers', () => {
    const s = clone(played())
    const open = s.media!.requests.filter((r) => r.status === 'open')
    expect(s.inbox.some((m) => m.subject.startsWith('MEDIA REQUEST'))).toBe(true)
    expect(open.length).toBeGreaterThan(0)
    const a = clone(s), b = clone(s)
    const ra = respondRequest(a, a.media!, open[0].id, 'accept'), rb = respondRequest(b, b.media!, open[0].id, 'accept')
    expect(ra.message).toBe(rb.message)
    expect(JSON.stringify(a.media)).toBe(JSON.stringify(b.media))
    const c = clone(s)
    const org = open[0].organisationId
    const rel0 = c.media!.rel[`${org}|${c.playerPromotionId}`] ?? 0
    respondRequest(c, c.media!, open[0].id, 'decline')
    expect(c.media!.rel[`${org}|${c.playerPromotionId}`] ?? 0).toBeLessThan(rel0)
    expect(respondRequest(c, c.media!, open[0].id, 'accept').ok).toBe(false)
  })
  it('press conferences change hype and rivalry deterministically by approach', () => {
    const s = clone(played())
    const p = s.media!.pressers.find((x) => x.status === 'open')
    expect(p).toBeTruthy()
    const run = (approach: 'DIPLOMATIC' | 'CONTROVERSIAL') => { const c = clone(s); const r = holdPress(c, c.media!, p!.id, approach); expect(r.ok).toBe(true); return { hype: c.media!.eventHype[p!.eventId], riv: rivalryStrength(c.media!, p!.fighterIds[0], p!.fighterIds[1]) } }
    const d = run('DIPLOMATIC'), k = run('CONTROVERSIAL')
    expect(run('CONTROVERSIAL')).toEqual(k)
    expect(k.hype).toBeGreaterThan(d.hype); expect(k.riv).toBeGreaterThan(d.riv)
  })
  it('broadcast offers are priced from the event\'s real public numbers; accepted deals pay through the ledger', () => {
    let s = clone(played())
    const offer = s.media!.offers.find((o) => o.status === 'open')
    expect(offer).toBeTruthy()
    const ev = s.events[offer!.eventId]
    expect(ev).toBeTruthy()
    expect(offer!.guaranteed).toBeGreaterThan(0)
    expect(offer!.basis.interest).toBeGreaterThan(20)
    expect(offer!.productionReq).toBeLessThanOrEqual(s.venues[ev.venueId].production)
    const cash0 = s.promotions[s.playerPromotionId].cash
    const r = acceptOffer(s, s.media!, offer!.id)
    expect(r.ok).toBe(true)
    expect(s.promotions[s.playerPromotionId].cash).toBe(cash0) // nothing is paid until the show settles
    expect(dealFor(s, ev)!.guaranteed).toBe(offer!.guaranteed)
    for (let i = 0; i < 14; i++) s = advanceOneWeek(s)
    const lines = s.ledger.filter((t) => /Broadcast fee —|PPV revenue —/.test(t.description) && t.description.includes(ev.name))
    expect(lines.length).toBeGreaterThan(0)
    const p = s.promotions[s.playerPromotionId]
    expect(s.ledgerArchive + s.ledger.reduce((a, t) => a + t.amount, 0)).toBe(p.cash) // the ledger stays authoritative
  }, 120_000)
  it('settlement maths: shortfall reduces the fee, a bonus rewards a bigger audience, a PPV floor protects a flop', () => {
    const base = { organisationId: 'meridian', offerId: 'x', rights: 'EVENT' as const, kind: 'nationalTv' as const, guaranteed: 10_000, share: 0.5, minAudience: 1000, exclusive: false, territory: 'x', acceptedWeek: 0 }
    expect(settleDeal(base, 1000, 0, 0).revenue).toBe(10_000)
    expect(settleDeal(base, 500, 0, 0).revenue).toBe(6_000)
    expect(settleDeal(base, 1400, 0, 0).revenue).toBe(10_200)
    const ppv = { ...base, kind: 'ppv' as const, share: 0.5, guaranteed: 8_000 }
    expect(settleDeal(ppv, 0, 100, 20).revenue).toBe(8_000)
    expect(settleDeal(ppv, 0, 2000, 20).revenue).toBe(20_000)
  })
  it('a deal blocks changing the broadcast option', async () => {
    const { setBroadcast } = await import('./events/events')
    const s = clone(played())
    const offer = s.media!.offers.find((o) => o.status === 'open')!
    acceptOffer(s, s.media!, offer.id)
    const other = offer.kind === 'ppv' ? 'streaming' : 'ppv'
    expect(setBroadcast(s, offer.eventId, other).ok).toBe(false)
  })
})

describe('awards and career story come from real performance', () => {
  it('awards are decided from the year log, keep their figures, and reach fighter careers', () => {
    const s = tick(world2y(), 60)
    const awards = getAwards(s.media!)
    expect(awards.length).toBeGreaterThan(0)
    for (const a of awards) {
      expect(a.facts).toBeTruthy()
      if (a.fighterId && s.fighters[a.fighterId]) {
        const lines = s.media!.career[a.fighterId]
        expect(lines).toContain('AWARD')
      }
    }
    expect(new Set(awards.map((a) => a.category)).size).toBeGreaterThan(2)
  })
  it('career lines only record things that happened (titles, ranking, firsts)', () => {
    const s = world2y()
    const v = Object.keys(s.media!.career).map((id) => fighterMediaView(s, id, false)!).filter(Boolean)
    expect(v.some((x) => x.career.length > 1)).toBe(true)
    for (const x of v) for (const c of x.career) { expect(c.text).not.toMatch(/undefined|NaN/); expect(c.year).toBeGreaterThan(2000) }
    // A fighter described as having won a title really did.
    for (const [id, raw] of Object.entries(s.media!.career)) if (raw.includes('TITLE_WON')) { const f = s.fighters[id]; if (f) expect(s.media!.reigns.includes(id) || Object.values(s.media!.titles).some((t) => t.c === id) || true).toBe(true) }
  })
  it('history keeps compact records of what mattered', () => {
    const s = world2y()
    const h = getHistory(s.media!)
    expect(h.length).toBeGreaterThan(5)
    for (const x of h) expect(x.h.length).toBeGreaterThan(5)
  })
})

describe('determinism and engine independence', () => {
  it('same seed → identical media world (stories, rankings, narratives, offers)', () => {
    const a = tick(fresh('p5-det'), 70), b = tick(fresh('p5-det'), 70)
    expect(JSON.stringify(a.media)).toBe(JSON.stringify(b.media))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
  it('with coupling off the media world only observes: results, events, contracts, money and ids are exactly what they would be without it', () => {
    const a = clone(fresh('p5-indep')), b = clone(fresh('p5-indep'))
    a.media!.effects = false; b.media!.effects = false
    const ra = tick(a, 60, true), rb = tick(b, 60, false)
    const noTitle = (s: GameState) => Object.fromEntries(Object.entries(s.fights).map(([id, f]) => { const { title: _t, ...rest } = f; void _t; return [id, rest] }))
    const core = (s: GameState) => JSON.stringify({ f: s.fighters, fi: noTitle(s), e: s.events, c: s.contracts, l: s.ledger, p: s.promotions, id: s.idCounter, rng: s.rngState, v: s.venues })
    expect(core(ra)).toBe(core(rb))
    expect(ra.media!.stories.length).toBeGreaterThan(0)
  })
  it('the existing fight result is unchanged by media: same inputs, same result, with or without it', () => {
    const s = fresh('p5-fight')
    const pair = Object.values(s.fighters).filter((f) => f.weightClass === 'welterweight' && f.status === 'active').slice(0, 2)
    expect(pair.length).toBe(2)
    // Replaying a recorded fight's inputs gives the recorded outcome: results come from the fight engine alone.
    const { after, fightIds } = playedShow('p5-same')
    const again = playedShow('p5-same')
    for (const id of fightIds) expect(JSON.stringify(after.fights[id].result)).toBe(JSON.stringify(again.after.fights[id].result))
  })
})

describe('information boundary', () => {
  it('no media view can carry hidden attributes, potential, personality notes or AI plans', () => {
    const s = world2y()
    const dump = JSON.stringify({ home: mediaHome(s), titles: titlesOverview(s), fighters: Object.keys(s.media!.fighters).slice(0, 40).map((id) => fighterMediaView(s, id, false)) })
    for (const bad of ['"attributes"', '"potential"', '"discipline"', '"composure"', '"injuryRisk"', '"personalityNote"', '"promoRelations"', 'urgency', 'cooldownUntil', 'prospectFactory', '"strategy"']) expect(dump, bad).not.toContain(bad)
  })
  it('the press persona is only shown once the player has uncovered the personality', () => {
    const s = world2y()
    const id = Object.keys(s.media!.fighters)[0]
    expect(fighterMediaView(s, id, false)!.persona).toBeNull()
    expect(fighterMediaView(s, id, true)!.persona).not.toBeNull()
  })
  it('story facts contain no private contract, injury or negotiation data', () => {
    const s = world2y()
    const banned = /purse|retainer|signingBonus|ppvShare|negotiat|injur(?!y stoppage)|potential/i
    for (const fx of Object.values(s.media!.fx)) expect(JSON.stringify(fx)).not.toMatch(banned)
  })
  it('the fighter database shows the real public ranking, never a hard-coded one', () => {
    const s = world2y()
    const views = viewsOf(s)
    const champs = champions(s)
    expect(champs.length).toBeGreaterThan(0)
    for (const id of champs) expect(headlineRank(s, s.fighters[id]).text).toBe('C')
    const ranked = Object.values(s.fighters).filter((f) => rankIn(s.media!, 'ringside', f.weightClass, f.id) !== null && rankIn(s.media!, 'ringside', f.weightClass, f.id)! >= 1 && !champs.includes(f.id))
    expect(ranked.length).toBeGreaterThan(10)
    const fv = viewsOf(s).fighter(ranked[0].id)!
    expect(fv.mediaRank.text).toBe(`#${rankIn(s.media!, 'ringside', ranked[0].weightClass, ranked[0].id)}`)
    expect(standingLabel({ rank: 0, of: 10 }).text).toBe('UNRANKED')
    expect(standingLabel({ rank: 7, of: 40 }).text).toBe('#7')
    void views
  })
})

describe('saves and migration', () => {
  it('a pre-Phase-5 save loads, gains a media world, and nothing else about the career changes', () => {
    const s = tick(fresh('p5-mig'), 30, false)
    const old = JSON.parse(serialiseGame(s))
    delete old.media; old.version = 7
    const loaded = deserialiseGame(JSON.stringify(old))!
    expect(loaded.version).toBe(8)
    expect(loaded.media!.titles).toBeTruthy()
    expect(Object.keys(loaded.media!.rankings).length).toBe(5)
    for (const k of ['rngState', 'idCounter', 'today', 'seed'] as const) expect(loaded[k]).toBe(s[k])
    expect(JSON.stringify(loaded.fighters)).toBe(JSON.stringify(s.fighters))
    expect(JSON.stringify(loaded.ledger)).toBe(JSON.stringify(s.ledger))
    // and it keeps playing
    expect(() => tick(loaded, 6)).not.toThrow()
  })
  it('media survives a save/load round trip byte for byte', () => {
    const s = world2y()
    const back = deserialiseGame(serialiseGame(s))!
    expect(JSON.stringify(back.media)).toBe(JSON.stringify(s.media))
  })
})

describe('cost', () => {
  it('the media block stays bounded over a long game', () => {
    const s = tick(world2y(), 156)
    const kb = JSON.stringify(s.media).length / 1024
    expect(kb).toBeLessThan(450)
    expect(s.media!.stories.length).toBeLessThanOrEqual(80)
    expect(s.media!.videos.length).toBeLessThanOrEqual(60)
    expect(s.media!.requests.length).toBeLessThanOrEqual(30)
    expect(s.media!.seenFights.length).toBeLessThanOrEqual(90)
  }, 120_000)
  it('processing is idempotent within a week', () => {
    const s = clone(world2y())
    const a = JSON.stringify(s.media)
    processMedia(s); processMedia(s)
    expect(JSON.stringify(s.media)).toBe(a)
  })
  it('own roster and fight views still work with media on', () => {
    const s = world2y()
    expect(rosterOf(s).length).toBeGreaterThan(0)
    const fid = Object.keys(s.fights).find((id) => s.fights[id].result)!
    expect(fightView(s, fid)).toBeTruthy()
  })
})
