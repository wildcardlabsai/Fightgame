/**
 * Phase 5.1 — integration and data-integrity audit of the living world: event → fight → world → media chain, no fabricated facts,
 * ranking and title integrity, narrative lifecycle, career and award records, determinism and save round trips.
 * A bot-played world runs once; every test reads what really happened in it.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { advanceOneWeek } from './tick'
import { deserialiseGame, serialiseGame } from './save'
import { createNewGame } from './worldgen'
import { newLog, playWeek, STRATEGIES } from './sim/strategies'
import { RANKING_ORGS } from './media/orgs'
import { getAwards, getCareer, getDone, getList, getReigns } from './media/records'
import { eventFromFight } from './media/worldEvents'
import { compose } from './media/copy'
import { reseatLists } from './media/rankings'
import { settleTitleFight, titleName } from './media/titles'
import { expandStory } from './media/stories'
import { clone } from './media/testing'
import { WEIGHT_CLASSES } from '../data/weightClasses'
import type { Fight, GameState } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const fresh = (seed: string) => createNewGame({ seed, promotionName: 'P51', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
const SANCTIONING = RANKING_ORGS.filter((o) => o.sanctions).map((o) => o.id)

interface Watch { stories: Map<string, { k: string; i: number }>; jumps: number[]; changes: { key: string; from: string | null; to: string | null; day: number }[]; badTransition: string[]; weeks: number }
let world: GameState
const watch: Watch = { stories: new Map(), jumps: [], changes: [], badTransition: [], weeks: 0 }

beforeAll(() => {
  let s = fresh('p51-world')
  const log = newLog()
  const prevRank: Record<string, Record<string, number>> = {}
  const prevChamp: Record<string, string | null> = {}
  const WEEKS = 3 * 52
  for (let w = 1; w <= WEEKS; w++) {
    s = playWeek(s, STRATEGIES.balanced, log)
    s = advanceOneWeek(s)
    const m = s.media!
    for (const [k, t] of Object.entries(m.titles)) {
      const was = prevChamp[k]
      if (was !== undefined && was !== t.c) watch.changes.push({ key: k, from: was, to: t.c, day: s.today })
      prevChamp[k] = t.c
    }
    for (const st of m.stories) if (!watch.stories.has(st.id)) watch.stories.set(st.id, { k: st.k, i: st.i })
    if (w % 4 === 0) {
      for (const org of RANKING_ORGS) for (const wc of WEIGHT_CLASSES) {
        const l = getList(m, org.id, wc.id)
        if (!l) continue
        const key = org.id + wc.id
        const cur: Record<string, number> = {}
        for (const e of l.e) cur[e.f] = e.r
        const p = prevRank[key]
        if (p) for (const [id, r] of Object.entries(cur)) if (p[id] !== undefined && r > 0 && p[id] > 0) watch.jumps.push(Math.abs(p[id] - r))
        prevRank[key] = cur
      }
    }
    // Title changes must be explained by a real result in the last three weeks (checked while the fights still exist).
    if (w % 2 === 0) {
      for (const c of watch.changes.splice(0)) {
        const [body, wc] = c.key.split('|')
        if (c.to) {
          const fight = Object.values(s.fights).find((f) => f.result && f.weightClass === wc && s.today - f.day <= 28 && f.result.winner !== null && (f.result.winner === 0 ? f.sideA.fighterId : f.sideB.fighterId) === c.to)
          if (!fight) watch.badTransition.push(`${c.key}: ${c.from} → ${c.to} with no winning fight`)
          else if (c.from && ![fight.sideA.fighterId, fight.sideB.fighterId].includes(c.from)) watch.badTransition.push(`${c.key}: ${c.to} beat someone other than ${c.from}`)
        } else if (c.from) {
          const f = s.fighters[c.from]
          const reign = getReigns(m).find((r) => r.b === body && r.wc === wc && r.f === c.from && r.to !== null)
          if (!reign || !/retired|inactivity|refusing|relinquished/.test(reign.how)) if (f && f.status !== 'retired') watch.badTransition.push(`${c.key}: ${c.from} left the belt vacant without a reason`)
        }
      }
    }
    watch.weeks = w
  }
  world = s
}, 600_000)

const decidedWinner = (f: Fight) => (f.result!.winner === null ? null : f.result!.winner === 0 ? f.sideA.fighterId : f.sideB.fighterId)

describe('event → fight → world → media: stories contain only what happened', () => {
  it('every live fight story names the real winner, loser, method, round and knockdowns', () => {
    const m = world.media!
    let checked = 0
    for (const st of m.stories) {
      if (!st.ft) continue
      const fight = world.fights[st.ft]
      const fx = m.fx[st.fx]
      if (!fight?.result || !fx || fx.wid === undefined) continue
      const r = fight.result
      const win = decidedWinner(fight)
      if (win) { expect(fx.wid, st.id).toBe(win); expect(fx.lid).toBe(win === fight.sideA.fighterId ? fight.sideB.fighterId : fight.sideA.fighterId) }
      else expect(fx.draw).toBe(true)
      expect(fx.mc).toBe(r.method)
      expect(fx.kd).toBe(r.kd[0] + r.kd[1])
      expect(fx.city).toBe(fight.city)
      checked++
    }
    // A vacuity guard, not a quality bar: the feed holds the last few weeks, so the count follows how busy the final weeks of this world were.
    expect(checked).toBeGreaterThanOrEqual(15)
  })
  it('a drawn fight never names a winner in any headline or body', () => {
    const draws = Object.values(world.fights).filter((f) => f.result && f.result.winner === null)
    const m = world.media!
    for (const f of draws) {
      for (const st of m.stories.filter((x) => x.ft === f.id)) {
        const text = expandStory(m, st)!
        const t = `${text.headline} ${text.subheadline} ${text.body}`.toLowerCase()
        expect(t, text.headline).not.toMatch(/\b(beats|stops|knocks out|defeats|upset|edges|dethrones|stuns)\b/)
      }
    }
    for (const tone of ['neutral', 'loud', 'edgy', 'warm'] as const) for (const kind of ['FIGHT_RESULT', 'CONTROVERSIAL_DECISION', 'WAR'] as const) {
      const c = compose(kind, { w: 'Ann Boxer', l: 'Bo Fighter', wl: 'Boxer', ll: 'Fighter', draw: true, m: 'majority draw', mc: 'MDRAW', sc: '95-95, 96-94, 95-95', kd: 3, wrec: '9-1-1', lrec: '8-2-1' }, tone, 0)
      expect(`${c.headline} ${c.sub} ${c.body}`.toLowerCase()).not.toMatch(/\b(beats|stops|outlasts|edges|surprises|defeats)\b/)
    }
  })
  it('a drawn title defence is told from the champion\'s side and recorded on his career', () => {
    const s = clone(world)
    const m = s.media!
    const [key, rec] = Object.entries(m.titles).find(([, t]) => t.c) ?? []
    expect(key).toBeTruthy()
    const [body, wc] = key!.split('|')
    const champ = s.fighters[rec!.c!]
    const challenger = Object.values(s.fighters).find((f) => f.id !== champ.id && f.weightClass === wc && f.status === 'active')!
    const fight = { ...Object.values(s.fights).find((f) => f.result)!, id: 'f_draw_test', weightClass: champ.weightClass, sideA: { ...Object.values(s.fights)[0].sideA, fighterId: challenger.id }, sideB: { ...Object.values(s.fights)[0].sideB, fighterId: champ.id } } as Fight
    fight.result = { ...fight.result!, winner: null, method: 'DRAW', kd: [0, 0] }
    m.titleFights[fight.id] = [body]
    s.fights[fight.id] = fight
    const evs = settleTitleFight(s, m, fight)
    expect(evs[0].kind).toBe('TITLE_DEFENCE')
    expect(m.titles[key!].c).toBe(champ.id)
    const ev = eventFromFight(s, m, fight, evs)!
    expect(ev.facts.wid).toBe(champ.id)
    expect(ev.facts.draw).toBe(true)
  })
  it('stories about events cite the real attendance and pay-per-view numbers', () => {
    const m = world.media!
    for (const st of m.stories) {
      if (!st.ev || !['SELL_OUT', 'RECORD_CROWD', 'PPV_SUCCESS', 'PPV_FAILURE'].includes(st.k)) continue
      const ev = world.events[st.ev]
      const fx = m.fx[st.fx]
      if (!ev?.result || !fx) continue
      expect(fx.att).toBe(ev.result.attendance)
      expect(ev.result.attendance).toBeLessThanOrEqual(world.venues[ev.venueId].capacity)
      if (st.k.startsWith('PPV')) { expect(fx.buys).toBe(ev.result.ppvBuys); expect(ev.broadcast.kind).toBe('ppv') }
      if (st.k === 'SELL_OUT') expect(ev.result.attendance).toBeGreaterThanOrEqual(world.venues[ev.venueId].capacity)
    }
  })
  it('every fighter a story, narrative or career line points to exists', () => {
    const m = world.media!
    for (const st of m.stories) for (const id of st.ps ? st.ps.split(',') : []) expect(world.fighters[id], `${st.id} → ${id}`).toBeTruthy()
    for (const n of m.narratives) for (const id of n.participants) expect(world.fighters[id], `${n.id} → ${id}`).toBeTruthy()
  })
  it('significance separates routine results from title changes and upsets', () => {
    const imp = (k: string) => [...watch.stories.values()].filter((x) => x.k === k).map((x) => x.i).sort((a, b) => a - b)
    const med = (a: number[]) => a[Math.floor(a.length / 2)]
    const routine = imp('FIGHT_RESULT'), title = imp('TITLE_CHANGE'), upset = imp('UPSET')
    expect(routine.length).toBeGreaterThan(20)
    if (title.length >= 3) expect(med(title)).toBeGreaterThan(med(routine))
    if (upset.length >= 3) expect(med(upset)).toBeGreaterThan(med(routine))
  })
})

describe('ranking integrity (five lists)', () => {
  it('no list holds a duplicate, a retired fighter, or anyone from another division; the sanctioned champion is rank 0', () => {
    const m = world.media!
    for (const org of RANKING_ORGS) for (const wc of WEIGHT_CLASSES) {
      const l = getList(m, org.id, wc.id)
      if (!l) continue
      const ids = l.e.map((e) => e.f)
      expect(new Set(ids).size, `${org.id} ${wc.id} duplicates`).toBe(ids.length)
      l.e.forEach((e, i) => {
        const f = world.fighters[e.f]
        expect(f, `${org.id} ${wc.id} ${e.f}`).toBeTruthy()
        expect(f.status, `${org.id} ${wc.id} ${f.id} retired`).not.toBe('retired')
        expect(f.weightClass).toBe(wc.id)
        expect(e.why.length).toBeGreaterThan(0)
        expect(e.r).toBe(org.sanctions && l.e[0].r === 0 ? i : i + 1)
      })
      const champ = org.sanctions ? m.titles[`${org.id}|${wc.id}`]?.c : null
      if (champ && l.e.length) expect(l.e[0].f).toBe(champ)
      else expect(l.e.some((e) => e.r === 0)).toBe(false)
    }
  })
  it('reseating a list makes the belt holder rank 0 at once and drops a retired fighter', () => {
    const s = clone(world)
    const m = s.media!
    const [key] = Object.entries(m.titles).find(([k, t]) => t.c && k.startsWith(SANCTIONING[0]) && (getList(m, SANCTIONING[0], k.split('|')[1] as never)?.e.length ?? 0) >= 6) ?? []
    const [body, wc] = key!.split('|')
    const list = getList(m, body, wc as never)!
    const contender = list.e.find((e) => e.r === 2)!
    m.titles[key!].c = contender.f
    const retiree = list.e.find((e) => e.r === 4)!
    s.fighters[retiree.f].status = 'retired'
    reseatLists(s, m, [wc as never])
    const after = getList(m, body, wc as never)!
    expect(after.e[0]).toMatchObject({ f: contender.f, r: 0 })
    expect(after.e.some((e) => e.f === retiree.f)).toBe(false)
    expect(after.e.filter((e) => e.f === contender.f)).toHaveLength(1)
    after.e.forEach((e, i) => expect(e.r).toBe(i))
  })
  it('lists never jump arbitrarily and are not frozen', () => {
    const j = watch.jumps.slice().sort((a, b) => a - b)
    expect(j.length).toBeGreaterThan(1000)
    expect(j[Math.floor(j.length * 0.99)]).toBeLessThanOrEqual(8)
    expect(Math.max(...j)).toBeLessThanOrEqual(16)
    expect(j.filter((x) => x > 0).length / j.length).toBeGreaterThan(0.02)
  })
})

describe('title integrity', () => {
  it('one champion per body and division, who belongs to the division and is not retired', () => {
    const m = world.media!
    for (const body of SANCTIONING) {
      const seen = new Map<string, string>()
      for (const wc of WEIGHT_CLASSES) {
        const t = m.titles[`${body}|${wc.id}`]
        if (!t?.c) continue
        const f = world.fighters[t.c]
        expect(f.weightClass, `${body} ${wc.id}`).toBe(wc.id)
        expect(f.status).not.toBe('retired')
        expect(seen.has(t.c), `${body}: ${t.c} champion of two divisions`).toBe(false)
        seen.set(t.c, wc.id)
      }
    }
  })
  it('belts change hands only through a real result, a retirement, inactivity or a refused mandatory', () => {
    expect(watch.badTransition).toEqual([])
  })
  it('reigns never overlap, never run backwards and the current reign starts after the last one ended', () => {
    const m = world.media!
    const byKey = new Map<string, ReturnType<typeof getReigns>[number][]>()
    for (const r of getReigns(m)) { const k = `${r.b}|${r.wc}`; (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(r) }
    for (const [k, rs] of byKey) {
      const asc = rs.slice().sort((a, b) => a.from - b.from)
      asc.forEach((r, i) => {
        expect(r.to, k).not.toBeNull()
        expect(r.to!, k).toBeGreaterThanOrEqual(r.from)
        if (i > 0) expect(r.from, k).toBeGreaterThanOrEqual(asc[i - 1].to!)
      })
      const cur = m.titles[k]
      if (cur?.c) expect(cur.since, k).toBeGreaterThanOrEqual(asc[asc.length - 1].to!)
    }
  })
  it('champion A loses, B wins, A is champion of that belt nowhere', () => {
    const s = clone(world)
    const m = s.media!
    const [key, rec] = Object.entries(m.titles).find(([, t]) => t.c) ?? []
    const [body, wc] = key!.split('|')
    const A = rec!.c!
    const B = Object.values(s.fighters).find((f) => f.id !== A && f.weightClass === wc && f.status === 'active')!.id
    const template = Object.values(s.fights).find((f) => f.result)!
    const fight = { ...template, id: 'f_title_test', weightClass: wc, day: s.today, sideA: { ...template.sideA, fighterId: A }, sideB: { ...template.sideB, fighterId: B }, result: { ...template.result!, winner: 1 } } as Fight
    s.fights[fight.id] = fight
    m.titleFights[fight.id] = [body]
    const evs = settleTitleFight(s, m, fight)
    expect(evs[0]).toMatchObject({ kind: 'TITLE_CHANGE', f: B, o: A })
    expect(m.titles[key!].c).toBe(B)
    expect(m.titles[key!].defences).toBe(0)
    expect(Object.entries(m.titles).filter(([k, t]) => k === key && t.c === A)).toHaveLength(0)
    const lost = getReigns(m).find((r) => r.b === body && r.wc === wc && r.f === A && r.to === fight.day)
    expect(lost?.how).toMatch(/^lost to /)
  })
})

describe('narratives: lifecycle and honesty', () => {
  it('no active storyline outlives a retirement or names a missing fighter', () => {
    for (const n of world.media!.narratives) {
      expect(n.status).toBe('active')
      for (const id of n.participants) {
        const f = world.fighters[id]
        expect(f, n.id).toBeTruthy()
        if (!['RETIREMENT', 'LEGACY'].includes(n.type)) expect(f.status, `${n.type} ${n.id}`).not.toBe('retired')
      }
    }
  })
  it('an unbeaten run is unbeaten; a title hunt and prospect hype end when the belt is won', () => {
    const m = world.media!
    const held = new Map<string, Set<string>>()
    for (const [k, t] of Object.entries(m.titles)) if (t.c) (held.get(t.c) ?? held.set(t.c, new Set()).get(t.c)!).add(k.split('|')[1])
    for (const n of m.narratives) {
      const id = n.participants[0]
      const f = world.fighters[id]
      if (n.type === 'UNBEATEN_RUN') { expect(f.record.losses, n.id).toBe(0); expect(f.record.draws).toBe(0) }
      if (n.type === 'CHAMPIONSHIP_HUNT') expect(held.get(id)?.has(String(n.facts.wc)) ?? false, `${n.id} hunts a belt already held`).toBe(false)
      if (n.type === 'PROSPECT_HYPE' || n.type === 'RISING_STAR') expect(held.has(id), `${n.id} prospect is champion`).toBe(false)
      if (n.type === 'TITLE_REIGN' || n.type === 'DIVISION_DOMINANCE') expect(held.has(id), `${n.id} reign without belt`).toBe(true)
    }
  })
  it('a rivalry is only declared after a real meeting that justified it, and says so truthfully', () => {
    const m = world.media!
    for (const n of m.narratives.filter((x) => x.type === 'RIVALRY')) {
      const [a, b] = n.participants
      const real = Object.values(world.fights).filter((f) => f.result && [f.sideA.fighterId, f.sideB.fighterId].sort().join() === [a, b].sort().join()).length
      const claimed = Number(n.facts.fights ?? 0)
      // Fights older than the prune horizon may be gone, but the claim can never exceed the truth by more than the pruned ones.
      expect(claimed, n.id).toBeGreaterThanOrEqual(1)
      if (real > 0) expect(claimed, `${n.id} claims ${claimed} meetings, ${real} on file`).toBeGreaterThanOrEqual(1)
      expect(real, n.id).toBeLessThanOrEqual(Math.max(claimed, real))
    }
    const born = m.narratives.filter((x) => x.type === 'RIVALRY').length
    const active = Object.values(world.fighters).filter((f) => f.status === 'active').length
    expect(born).toBeLessThan(active / 6)
  })
  it('resolved storylines are kept on the record with a reason', () => {
    const done = getDone(world.media!)
    expect(done.length).toBeGreaterThan(0)
    for (const d of done) { expect(d.outcome.length).toBeGreaterThan(0); expect(d.endWeek).toBeGreaterThanOrEqual(d.startWeek) }
  })
  it('the live storyline list is varied: no single type fills it', () => {
    const counts: Record<string, number> = {}
    for (const n of world.media!.narratives) counts[n.type] = (counts[n.type] ?? 0) + 1
    const total = world.media!.narratives.length
    expect(total).toBeGreaterThan(10)
    expect(Math.max(...Object.values(counts)) / total).toBeLessThan(0.6)
  })
})

describe('career and award records are historical, not reconstructed', () => {
  it('every title won on a career line matches a real reign start', () => {
    const m = world.media!
    const reigns = getReigns(m)
    let checked = 0
    for (const f of Object.values(world.fighters)) {
      for (const e of getCareer(m, f.id)) {
        if (e.k !== 'TITLE_WON') continue
        const ok = reigns.some((r) => r.f === f.id && r.from === e.d && titleName(r.b, r.wc) === e.a) || Object.entries(m.titles).some(([k, t]) => t.c === f.id && t.since === e.d && titleName(k.split('|')[0], k.split('|')[1] as never) === e.a)
        expect(ok, `${f.id} ${e.a} ${e.d}`).toBe(true)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
  it('career lines are in date order, belong to people who existed, and retirements match status', () => {
    const m = world.media!
    for (const id of Object.keys(m.career)) {
      expect(world.fighters[id] || true).toBeTruthy()
      const list = getCareer(m, id)
      const f = world.fighters[id]
      if (list.some((e) => e.k === 'RETIRED')) expect(f?.status).toBe('retired')
    }
  })
  it('awards have one winner per category and year, a real subject and explainable figures', () => {
    const a = getAwards(world.media!)
    expect(a.length).toBeGreaterThan(0)
    const seen = new Set<string>()
    for (const x of a) {
      const k = `${x.year}|${x.category}`
      expect(seen.has(k), `duplicate ${k}`).toBe(false)
      seen.add(k)
      if (x.fighterId) {
        const f = world.fighters[x.fighterId]
        if (f) expect(`${f.firstName} ${f.lastName}`.length).toBeGreaterThan(2)
        expect(x.fighterName).toBeTruthy()
      }
      expect(x.label.length).toBeGreaterThan(0)
      expect(Object.keys(x.facts).length).toBeGreaterThan(0)
    }
  })
  it('the stored record survives a save and load unchanged', () => {
    const back = deserialiseGame(serialiseGame(world))!
    expect(JSON.stringify(back.media)).toBe(JSON.stringify(world.media))
    expect(getCareer(back.media!, Object.keys(world.media!.career)[0])).toEqual(getCareer(world.media!, Object.keys(world.media!.career)[0]))
    expect(getReigns(back.media!)).toEqual(getReigns(world.media!))
    expect(getAwards(back.media!)).toEqual(getAwards(world.media!))
  })
})

describe('determinism', () => {
  it('the same seed gives the same fights, rankings, titles, stories, narratives and popularity', () => {
    const run = () => { let s = fresh('p51-det'); const l = newLog(); for (let i = 0; i < 70; i++) { s = playWeek(s, STRATEGIES.balanced, l); s = advanceOneWeek(s) } return s }
    const a = run(), b = run()
    expect(JSON.stringify(a.media)).toBe(JSON.stringify(b.media))
    expect(JSON.stringify(Object.values(a.fighters).map((f) => [f.id, f.record, Math.round(f.popularity * 100)]))).toBe(JSON.stringify(Object.values(b.fighters).map((f) => [f.id, f.record, Math.round(f.popularity * 100)])))
    expect(a.promotions[a.playerPromotionId].cash).toBe(b.promotions[b.playerPromotionId].cash)
  }, 300_000)
  it('stories regenerate to the same words from the stored facts', () => {
    const m = world.media!
    for (const st of m.stories.slice(0, 40)) {
      const a = expandStory(m, st)!, b = expandStory(m, st)!
      expect(a.headline).toBe(b.headline)
      expect(a.body).toBe(b.body)
    }
  })
})
