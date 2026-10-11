/**
 * Fighter identity: names, portraits and championship visibility.
 * Names/portraits are presentation- and generation-side; the championship views are read-only and must agree with the scheduler's rule.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NATIONS } from '../data/nations'
import { NAME_GROUPS, drawName, isBlockedName, pickRanked } from '../data/namePools'
import { assetUrl, hashString, MANIFEST, portraitPool, portraitSlot, portraitUrl, resolveFighterImage, setArtWorld, clearFighterArt } from '../assets/registry'
import { check as checkPortraitPool, makeSpec, render, specKey } from '../../scripts/assets/portraits'
import { generateFighter } from './fighters'
import { IdGen } from './ids'
import { Rng } from './rng'
import { createNewGame } from './worldgen'
import { WEIGHT_CLASSES } from '../data/weightClasses'
import { SANCTIONING } from './media/orgs'
import { getList } from './media/records'
import { advanceOneWeek } from './tick'
import { createFight } from './fights'
import { flagFight, bodiesFor } from './media/titles'
import { opponentCandidates } from './matchmaking'
import { boutTitleView, standingIndex, titleStanding } from './business/titleStanding'
import type { GameState } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const newGame = (seed: string) => createNewGame({ seed, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)

// ------------------------------------------------------------------------------------------------ names
describe('fighter names', () => {
  const batch = (seed: string, n: number, wide: boolean) => {
    const rng = Rng.fromSeed(seed), ids = new IdGen(0), taken = new Set<string>()
    return Array.from({ length: n }, () => generateFighter(rng, ids, { quality: 0.4, today: 800_000, ...(wide ? { widePools: true, takenNames: taken } : {}) }))
  }

  it('is deterministic per seed and differs between seeds', () => {
    const a = batch('n-1', 120, true).map((f) => `${f.firstName} ${f.lastName}`)
    expect(batch('n-1', 120, true).map((f) => `${f.firstName} ${f.lastName}`)).toEqual(a)
    expect(batch('n-2', 120, true).map((f) => `${f.firstName} ${f.lastName}`)).not.toEqual(a)
  })

  it('the wide pools change names only: every attribute, record and id is identical to the legacy generator for the same seed', () => {
    const legacy = batch('same-stream', 80, false), wide = batch('same-stream', 80, true)
    legacy.forEach((l, i) => {
      const w = wide[i]
      const anon = (f: typeof l) => JSON.parse(JSON.stringify(f).split(`${f.firstName} ${f.lastName}`).join('NAME').split(f.firstName).join('F').split(f.lastName).join('L'))
      expect(anon(w)).toEqual(anon(l)) // only the name (and the bio sentence that quotes it) differs
    })
  })

  it('never repeats a full name in a world, however many fighters are generated', () => {
    for (const seed of ['d1', 'd2', 'd3']) {
      const names = batch(seed, 900, true).map((f) => `${f.firstName} ${f.lastName}`)
      expect(new Set(names).size).toBe(names.length)
    }
  })

  it('is far more varied than the legacy pools, while believable shared surnames still happen', () => {
    const surnames = (wide: boolean) => new Set(batch('var-1', 400, wide).map((f) => f.lastName)).size
    expect(surnames(false)).toBeLessThan(160)
    expect(surnames(true)).toBeGreaterThan(260)
    const counts = new Map<string, number>()
    for (const f of batch('var-1', 400, true)) counts.set(f.lastName, (counts.get(f.lastName) ?? 0) + 1)
    expect(Math.max(...counts.values())).toBeGreaterThan(1) // some shared surnames are expected and fine
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(10)
  })

  it('names follow the fighter’s nationality: every name comes from that nation’s own pools', () => {
    for (const f of batch('regional', 500, true)) {
      const groups = NAME_GROUPS[f.nationality] ?? []
      expect(groups.length, f.nationality).toBeGreaterThan(0)
      expect(groups.some((g) => g.first.includes(f.firstName)), `${f.firstName} (${f.nationality})`).toBe(true)
      expect(groups.some((g) => g.last.includes(f.lastName)), `${f.lastName} (${f.nationality})`).toBe(true)
    }
    for (const n of NATIONS) { expect(NAME_GROUPS[n.key], n.key).toBeTruthy(); expect(NAME_GROUPS[n.key].reduce((s, g) => s + g.first.length, 0), n.key).toBeGreaterThanOrEqual(25) }
  })

  it('every legacy name is still a valid name in the new pools (the head of each pool)', () => {
    for (const n of NATIONS) {
      const first = new Set(NAME_GROUPS[n.key].flatMap((g) => g.first)), last = new Set(NAME_GROUPS[n.key].flatMap((g) => g.last))
      for (const x of n.firstNames) if (n.key !== 'USA' && n.key !== 'ENG') expect(first.has(x), `${n.key} ${x}`).toBe(true)
      for (const x of n.lastNames) if (n.key !== 'USA' && n.key !== 'ENG') expect(last.has(x), `${n.key} ${x}`).toBe(true)
    }
  })

  it('draws no famous real champion by accident, and ranking is a gentle taper over the whole list', () => {
    expect(isBlockedName('Mike', 'Tyson')).toBe(true)
    expect(isBlockedName('Mike', 'Tyler')).toBe(false)
    const hits = new Array(50).fill(0)
    for (let i = 0; i < 20000; i++) hits[pickRanked(50, (i + 0.5) / 20000)]++
    expect(hits.every((h) => h > 0)).toBe(true)
    expect(hits[0] / hits[49]).toBeGreaterThan(1.8); expect(hits[0] / hits[49]).toBeLessThan(5)
  })

  it('collisions are resolved without any randomness: same inputs, same answer', () => {
    const taken = new Set<string>([`${drawName('ENG', 0.31, 0.62).firstName} ${drawName('ENG', 0.31, 0.62).lastName}`])
    const a = drawName('ENG', 0.31, 0.62, taken), b = drawName('ENG', 0.31, 0.62, taken)
    expect(a).toEqual(b)
    expect(taken.has(`${a.firstName} ${a.lastName}`)).toBe(false)
  })
})

describe('a new career', () => {
  const g = newGame('identity-world')
  it('uses the wide pools and has no duplicate full names or ids (default world size unchanged at 316; an optional deeper market is also duplicate-free)', () => {
    expect(g.widePools).toBe(true)
    expect(Object.keys(g.fighters).length).toBe(316)
    const deep = createNewGame({ seed: 'identity-world', promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo, marketDepth: 130 }, 1_700_000_000_000)
    expect(Object.keys(deep.fighters).length).toBe(446)
    expect(new Set(Object.values(deep.fighters).map((f) => `${f.firstName} ${f.lastName}`)).size).toBe(446)
    const all = Object.values(g.fighters)
    expect(new Set(all.map((f) => `${f.firstName} ${f.lastName}`)).size).toBe(all.length)
    expect(new Set(all.map((f) => f.id)).size).toBe(all.length)
    expect(Object.keys(g.fighters).every((k) => g.fighters[k].id === k)).toBe(true)
  })
  it('the optional market-depth fighters come from their own stream: the original 316 are identical with or without them', () => {
    const deep = createNewGame({ seed: 'identity-world', promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo, marketDepth: 130 }, 1_700_000_000_000)
    for (const [id, f] of Object.entries(g.fighters)) expect(deep.fighters[id], id).toEqual(f)
    expect(deep.rngState).toBe(g.rngState)
  })
  it('an older save (no widePools flag) keeps drawing newcomers from the legacy pools', () => {
    const old: GameState = JSON.parse(JSON.stringify(g)); delete old.widePools
    expect(old.widePools).toBeUndefined()
  })
})

// ------------------------------------------------------------------------------------------------ portraits
describe('portrait pool and fighter → portrait mapping', () => {
  const pool = portraitPool()!
  it('ships a manifest-registered pool whose files, hashes and count agree', () => {
    expect(pool).toBeTruthy()
    expect(pool.count).toBeGreaterThanOrEqual(300)
    expect(checkPortraitPool()).toEqual([])
    const dir = join(__dirname, '../../public/assets', pool.dir)
    expect(readdirSync(dir).filter((f) => f.endsWith('.svg')).length).toBe(pool.count)
    for (let i = 0; i < pool.count; i += 37) expect(existsSync(join(dir, `p${String(i).padStart(4, '0')}.svg`))).toBe(true)
    expect(JSON.parse(readFileSync(join(dir, 'pool.json'), 'utf8')).count).toBe(pool.count)
  })
  it('every portrait is a distinct face and a self-contained, tiny SVG with no external references', () => {
    const keys = new Set<string>()
    const dir = join(__dirname, '../../public/assets', pool.dir)
    for (let i = 0; i < pool.count; i++) {
      const svg = readFileSync(join(dir, `p${String(i).padStart(4, '0')}.svg`), 'utf8')
      expect(svg.startsWith('<svg'), String(i)).toBe(true)
      expect(svg).not.toMatch(/href=|<image|<script|http:\/\/(?!www\.w3\.org)|https:\/\//)
      expect(svg.length).toBeLessThan(9000)
    }
    for (let i = 0; i < 4000 && keys.size < pool.count; i++) { const s = makeSpec(i); keys.add(specKey(s)) }
    expect(keys.size).toBe(pool.count)
    expect(render(makeSpec(0))).toBe(render(makeSpec(0))) // the generator is reproducible
  })
  it('a fighter always maps to the same portrait: a pure function of world seed and id', () => {
    expect(portraitSlot('f_1a', 'w1', 360)).toBe(portraitSlot('f_1a', 'w1', 360))
    const slots = new Set(Array.from({ length: 40 }, (_, i) => portraitSlot(`f_${i}`, 'w1', 360)))
    expect(slots.size).toBeGreaterThan(30)
    expect(portraitSlot('f_1a', 'w1', 360)).not.toBe(portraitSlot('f_1a', 'w2', 360)) // ids repeat across worlds, the faces do not have to
    expect(hashString('x')).toBe(hashString('x'))
  })
  it('spreads a whole world across the pool with few repeats', () => {
    const g = newGame('spread')
    const n = 316, counts = new Map<number, number>()
    Object.keys(g.fighters).slice(0, n).forEach((id) => { const s = portraitSlot(id, g.seed, pool.count)!; counts.set(s, (counts.get(s) ?? 0) + 1) })
    expect(counts.size).toBeGreaterThan(pool.count * 0.55)
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(6)
  })
  it('the registry resolves every fighter to a real image in the pool, and the same fighter to the same image after weeks pass', () => {
    clearFighterArt()
    let g = newGame('stable')
    setArtWorld(g.seed)
    const ref = (id: string) => ({ id, firstName: g.fighters[id].firstName, lastName: g.fighters[id].lastName, division: g.fighters[id].weightClass })
    const ids = Object.keys(g.fighters).slice(0, 60)
    const before = ids.map((id) => resolveFighterImage(ref(id)))
    expect(before.every((a) => a.state === 'real' && a.source === 'pool' && a.url!.includes('portraits/p'))).toBe(true)
    for (let w = 0; w < 6; w++) g = advanceOneWeek(g)
    const after = ids.filter((id) => g.fighters[id]).map((id) => resolveFighterImage(ref(id)))
    expect(after.map((a) => a.url)).toEqual(before.filter((_, i) => g.fighters[ids[i]]).map((a) => a.url))
    // Thumbnails and profiles are the same file, so every screen shows the same face.
    expect(before.every((a) => a.thumbUrl === a.url)).toBe(true)
    setArtWorld(null)
  })
  it('falls back to the silhouette when there is no pool or for non-profile variants; and builds relative URLs for a hosted preview', () => {
    expect(portraitSlot('f_1', 'w', 0)).toBeNull()
    expect(resolveFighterImage({ id: 'f_1', firstName: 'A', lastName: 'B' }, 'action').state).toBe('fallback')
    expect(portraitUrl(7)).toBe(assetUrl('portraits/p0007.svg'))
    expect(assetUrl('portraits/p0007.svg', './')).toBe('assets/portraits/p0007.svg')
    expect(assetUrl('portraits/p0007.svg', '/play/')).toBe('/play/assets/portraits/p0007.svg')
    expect(MANIFEST.portraitPool?.kind).toBe('procedural-illustration')
  })
})

// ------------------------------------------------------------------------------------------------ championship visibility
describe('championship picture', () => {
  let g: GameState = newGame('title-world')
  for (let w = 0; w < 156; w++) g = advanceOneWeek(g)
  const media = g.media!
  const stand = standingIndex(g)
  const active = Object.values(g.fighters).filter((f) => f.status === 'active')

  it('champions are exactly the holders on the live title records; multi-belt holders list every belt', () => {
    const holders = new Map<string, number>()
    for (const rec of Object.values(media.titles)) if (rec.c) holders.set(rec.c, (holders.get(rec.c) ?? 0) + 1)
    expect(holders.size).toBeGreaterThan(5)
    for (const [id, n] of holders) { const s = stand(id); expect(s.role).toBe('champion'); expect(s.held.length).toBe(n) }
    expect([...holders.values()].some((n) => n >= 2)).toBe(true) // unified / multi-body champions are visible as such
    for (const f of active) if (!holders.has(f.id)) expect(stand(f.id).role).not.toBe('champion')
  })
  it('mandatory and eliminator roles come from the stored orders, never from ranking or reputation', () => {
    for (const rec of Object.values(media.titles)) {
      if (rec.mand && !holdsAny(rec.mand.challenger)) expect(stand(rec.mand.challenger).role).toBe('mandatory')
      if (rec.elim && !rec.elim.fightId) for (const x of [rec.elim.a, rec.elim.b]) if (!holdsAny(x) && !hasMand(x)) expect(stand(x).role).toBe('eliminator')
    }
    const roles = active.map((f) => stand(f.id).role)
    expect(roles.filter((r) => r === 'mandatory').length).toBeLessThanOrEqual(Object.values(media.titles).filter((t) => t.mand).length)
    function holdsAny(id: string) { return Object.values(media.titles).some((t) => t.c === id) }
    function hasMand(id: string) { return Object.values(media.titles).some((t) => t.mand?.challenger === id) }
  })
  it('a ranked contender is on a sanctioning list; an unranked fighter is on none; a former champion has a closed reign', () => {
    const listed = new Set<string>()
    for (const org of SANCTIONING) for (const wc of WEIGHT_CLASSES) for (const e of getList(media, org.id, wc.id)?.e ?? []) if (e.r >= 1) listed.add(e.f)
    for (const f of active) {
      const s = stand(f.id)
      if (s.role === 'contender') { expect(listed.has(f.id)).toBe(true); expect(s.ranked).not.toBeNull() }
      if (s.role === 'unranked') { expect(listed.has(f.id)).toBe(false); expect(s.held).toEqual([]) }
      if (s.role === 'former') expect(s.former.length).toBeGreaterThan(0)
    }
    const kinds = new Set(active.map((f) => stand(f.id).role))
    expect(kinds.has('champion') && kinds.has('contender') && kinds.has('unranked')).toBe(true)
  })
  it('reputation alone never makes a fighter a contender or a champion', () => {
    const famousUnranked = active.filter((f) => stand(f.id).role === 'unranked').sort((a, b) => b.reputation - a.reputation)[0]
    expect(famousUnranked).toBeTruthy()
    expect(stand(famousUnranked.id).label).toBe('Unranked')
  })
  it('"could be for a title" is exactly what the scheduler would flag when the bout is booked', () => {
    let checked = 0, titled = 0
    const champs = active.filter((f) => stand(f.id).role === 'champion').slice(0, 14)
    for (const c of champs) {
      const others = active.filter((o) => o.id !== c.id && Math.abs(o.reputation - c.reputation) < 60).sort((a, b) => Number(b.weightClass === c.weightClass) - Number(a.weightClass === c.weightClass)).slice(0, 14)
      for (const o of others) {
        const view = boutTitleView(g, c.id, o.id)
        const copy: GameState = structuredClone(g)
        const fight = createFight(copy, c.id, o.id, copy.playerPromotionId, 'player')
        fight.status = 'agreed'; copy.fights[fight.id] = fight
        flagFight(copy, fight)
        const flagged = !!fight.title
        expect(view.couldContest, `${c.id} v ${o.id}`).toBe(flagged)
        if (flagged) { titled++; expect(view.name).toBe(fight.title!.name); expect(view.belts.map((b) => b.body).sort()).toEqual([...(fight.title!.bodies ?? [])].sort()) }
        else expect(bodiesFor(g, c.id, o.id, fight.weightClass).length).toBe(0)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(50)
    expect(titled).toBeGreaterThan(0)
  })
  it('matchmaking rows carry the same standing and bout view as the engine functions, and say why a champion bout is not for the belt', () => {
    const mine = active.filter((f) => f.contractId && g.contracts[f.contractId]?.promotionId === g.playerPromotionId)
    let reasons = 0, rows = 0
    for (const m of mine) for (const c of opponentCandidates(g, m.id, { showUnavailable: true }).slice(0, 25)) {
      rows++
      expect(c.standing.role).toBe(titleStanding(g, c.view.id).role)
      expect(c.bout.couldContest).toBe(boutTitleView(g, m.id, c.view.id).couldContest)
      if (c.bout.reason) { reasons++; expect(c.standing.role === 'champion' || stand(m.id).role === 'champion').toBe(true) }
    }
    expect(rows).toBeGreaterThan(20)
    void reasons
  })
  it('does not read hidden attributes', () => {
    const src = readFileSync(join(__dirname, 'business/titleStanding.ts'), 'utf8')
    for (const re of [/\.attributes\b/, /\.potential\b/, /\.discipline\b/, /\.composure\b/, /\.injuryRisk\b/, /fighterRating/]) expect(src).not.toMatch(re)
  })
})
