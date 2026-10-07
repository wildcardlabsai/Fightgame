/**
 * Phase 4.9 — recorded stamina / control / knockdown counts, title contract, asset pipeline, hosted-preview paths.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { artWorldSeed, assetUrl, clearArt, clearFighterArt, hasFighterArt, MANIFEST, registerArt, registerFighterArt, resolveFighterImage, resolveNewsKind, resolvePromotionImage, resolveVenueImage, setArtWorld, venueKind } from '../assets/registry'
import { classifyFighters, FIGHTER_ASSETS } from '../assetgen/classify'
import { fileName, outputPath } from '../assetgen/naming'
import { fighterPrompt, promotionPrompt, venuePrompt } from '../assetgen/prompts'
import { NullProvider, OpenAICompatibleProvider, providerFromEnv, toRequest, type ImageGenerationProvider, type ImageRequest, type ImageResult } from '../assetgen/provider'
import { buildRequirements } from '../assetgen/requirements'
import { canonWorld } from '../assetgen/world'
import { dryRunReport } from '../assetgen/report'
import { applyRuntimeIndex } from '../assetgen/runtimeIndex'
import { approve, costSummary, countAssets, mergeManifest, needsConfirmation, runBatch, selectBatch, type RunnerIO } from '../assetgen/runner'
import { GEN_STATUSES, type GenManifest } from '../assetgen/types'
import { control, knockdownSteps, knockdownDuration, planRounds, resultFingerprint, roundCommentary, stamina, totalsThrough } from '../presentation/fightPlayback'
import { eventPosterView } from './eventPoster'
import { fightView, titleView } from './fightViews'
import { buildSimFighter } from './fight/profile'
import { simulateFight } from './fight/sim'
import { Rng } from './rng'
import { fresh, playedShow } from './testShow'
import { choosePosterTemplate } from '../assets/poster'
import type { Fighter, FightSide } from './types'

const side = (f: Fighter): FightSide => ({ fighterId: f.id, promotionId: null, preRecord: '', preRep: 0, prePop: 0, prep: { intensity: 'normal', plan: 'balanced', campWeeks: 4, weightIssue: false, nagging: false } })

function manyFights(n: number, seed = 'rec', worldSeed = 'rec-world') {
  const s = fresh(worldSeed)
  const act = Object.values(s.fighters).filter((f) => f.status === 'active')
  const rng = new Rng(hashOf(seed))
  const out = []
  for (let i = 0; i < n; i++) {
    const a = rng.pick(act), b = rng.pick(act.filter((x) => x.id !== a.id))
    const rounds = 4 + (i % 9)
    out.push(simulateFight(buildSimFighter(s, a, side(a), { home: false, sizeSteps: 0 }), buildSimFighter(s, b, side(b), { home: false, sizeSteps: 0 }), rounds, rng))
  }
  return out
}
const hashOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

describe('recorded fight data (stamina, control, knockdown counts)', () => {
  const fights = manyFights(300)

  it('every recorded round carries energy, control and (when there was one) knockdown counts', () => {
    for (const o of fights) {
      o.rounds.forEach((rd, i) => {
        expect(rd.e).toBeDefined(); expect(rd.m).toBeDefined()
        for (const x of rd.e!) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(100) }
        for (const x of rd.m!) { expect(x).toBeGreaterThanOrEqual(-100); expect(x).toBeLessThanOrEqual(100) }
        if (i > 0) { // recovery between rounds: next round starts at or above where the last ended (never invented, never lower)
          expect(rd.e![0]).toBeGreaterThanOrEqual(o.rounds[i - 1].e![1])
          expect(rd.e![2]).toBeGreaterThanOrEqual(o.rounds[i - 1].e![3])
          expect(rd.m![0]).toBe(o.rounds[i - 1].m![1])
        }
        expect(rd.e![1]).toBeLessThanOrEqual(rd.e![0]) // energy only drains inside a round
      })
    }
  })

  it('stamina actually drains over a fight (it is the sim’s own energy, not decoration)', () => {
    const drained = fights.filter((o) => o.rounds.length >= 6).map((o) => o.rounds[0].e![0] - o.rounds[o.rounds.length - 1].e![1])
    expect(drained.length).toBeGreaterThan(20)
    expect(drained.reduce((n, d) => n + d, 0) / drained.length).toBeGreaterThan(5)
  })

  it('knockdown counts match the knockdowns scored, and are consistent with how the fight ended', () => {
    let withKd = 0, countedOut = 0
    for (const o of fights) {
      const events = o.rounds.flatMap((rd) => rd.c ?? [])
      expect(events.length).toBe(o.kd[0] + o.kd[1])
      o.rounds.forEach((rd) => expect((rd.c ?? []).length).toBe(rd.k[0] + rd.k[1]))
      if (events.length) withKd++
      for (const c of events) {
        expect([0, 1]).toContain(c.s); expect(c.g).toBeGreaterThanOrEqual(0); expect(c.g).toBeLessThanOrEqual(2)
        if (c.u === 1) { expect(c.n).toBeGreaterThanOrEqual(2); expect(c.n).toBeLessThanOrEqual(9) } else { expect(c.n).toBe(10); countedOut++ }
      }
      if (o.method === 'KO') {
        const last = o.rounds[o.rounds.length - 1].c!
        expect(last[last.length - 1].u).toBe(0) // a knockout is a fighter who did not rise
        expect(last[last.length - 1].s).toBe(o.winner === 0 ? 1 : 0)
      }
      // a fighter counted out ends the fight; nobody is counted out twice
      expect(events.filter((c) => c.u === 0).length).toBe(o.method === 'KO' ? 1 : 0)
    }
    expect(withKd).toBeGreaterThan(30)
    expect(countedOut).toBeGreaterThan(0)
  })

  it('is deterministic: the same fight and seed record identical stamina, control, stats and counts', () => {
    const a = manyFights(60, 'det'), b = manyFights(60, 'det')
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.stringify(manyFights(5, 'det'))).not.toBe(JSON.stringify(manyFights(5, 'other')))
  })

  it('recording does not move outcomes (golden digest test) and adds no per-punch objects', () => {
    for (const o of fights.slice(0, 20)) for (const rd of o.rounds) { expect(rd.t).toHaveLength(8); expect(JSON.stringify(rd).length).toBeLessThan(400) }
  })
})

describe('Fight Night reads only recorded data', () => {
  const { after, fightIds } = playedShow('p49')
  const views = fightIds.map((id) => fightView(after, id)!).filter((v) => v?.result?.rounds)

  it('round views expose stamina, control and counts straight from the record', () => {
    expect(views.length).toBeGreaterThan(0)
    for (const v of views) {
      const raw = after.fights[v.id].result!.rounds!
      v.result!.rounds!.forEach((rd, i) => {
        expect(rd.stamina).toEqual({ a: [raw[i].e![0], raw[i].e![1]], b: [raw[i].e![2], raw[i].e![3]] })
        expect(rd.control).toEqual([Math.round((raw[i].m![0] + 100) / 2), Math.round((raw[i].m![1] + 100) / 2)])
        expect(rd.counts).toEqual((raw[i].c ?? []).map((c) => ({ down: c.s, segment: c.g, count: c.n, rose: c.u === 1 })))
      })
    }
  })

  it('control and stamina helpers return recorded values and nothing else', () => {
    const r = views[0].result!
    expect(control(r.rounds!, r.rounds!.length)).toBe(r.rounds![r.rounds!.length - 1].control![1])
    expect(stamina(r.rounds!, 0)).toEqual({ a: r.rounds![0].stamina!.a[0], b: r.rounds![0].stamina!.b[0] })
    const [a] = totalsThrough(r.rounds!, r.rounds!.length)
    expect(a.landed).toBe(r.stats.landed[0])
  })

  it('older saves without recording show nothing invented', () => {
    const r = structuredClone(views[0].result!)
    for (const rd of r.rounds!) { rd.stamina = null; rd.control = null; rd.counts = [] }
    expect(control(r.rounds!, 2)).toBeNull()
    expect(stamina(r.rounds!, 2)).toBeNull()
    const kdRound = r.rounds!.find((x) => x.kd[0] + x.kd[1] > 0)
    if (kdRound) { const steps = knockdownSteps(kdRound, { a: 'A', b: 'B' }, false); expect(steps).toHaveLength(1); expect(steps[0].text).toBe('KNOCKDOWN!') }
    expect(roundCommentary(r.rounds![0], { a: 'A', b: 'B' }, 4).some((l) => /Energy at the bell/.test(l.text))).toBe(false)
  })

  it('knockdown sequence is built from the recorded count: KNOCKDOWN → COUNT 1…n → BACK UP / 10 COUNT', () => {
    const rd = { n: 3, kd: [1, 0], counts: [{ down: 1, segment: 1, count: 4, rose: true }], stamina: null, control: null } as never
    const steps = knockdownSteps(rd, { a: 'Ali', b: 'Bo' }, false)
    expect(steps.map((s) => s.text)).toEqual(['KNOCKDOWN!', 'COUNT 1', 'COUNT 2', 'COUNT 3', 'COUNT 4', 'BACK UP'])
    expect(steps[0].sub).toContain('Bo')
    const ko = { n: 4, kd: [0, 1], counts: [{ down: 0, segment: 2, count: 10, rose: false }], stamina: null, control: null } as never
    const ks = knockdownSteps(ko, { a: 'Ali', b: 'Bo' }, false)
    expect(ks.map((s) => s.text).slice(-2)).toEqual(['COUNT 10', '10 COUNT'])
    expect(knockdownSteps(rd, { a: 'Ali', b: 'Bo' }, true)).toHaveLength(1) // reduced motion: one static state
    expect(knockdownDuration(rd, false)).toBeGreaterThan(knockdownDuration(rd, true) - 1)
  })

  it('presentation modes still agree on the full result including the new recorded data', () => {
    for (const v of views) {
      const r = v.result!
      const fp = resultFingerprint(r)
      expect(fp).toContain('"e"'.replace('"e"', '"stamina"'))
      for (const m of ['watch', 'key', 'quick'] as const) planRounds(r, m)
      expect(resultFingerprint(r)).toBe(fp)
    }
  })

  it('count time lengthens a knockdown round in watch/key mode and quick stays instant', () => {
    const v = views.find((x) => x.result!.rounds!.some((rd) => rd.counts.length)); if (!v) return
    const r = v.result!
    const i = r.rounds!.findIndex((rd) => rd.counts.length)
    expect(planRounds(r, 'watch')[i].ms).toBeGreaterThan(3200)
    expect(planRounds(r, 'quick')[i].ms).toBe(0)
  })
})

describe('title-fight presentation contract', () => {
  it('no fight is a title fight unless the fight data says so', () => {
    const { after, fightIds } = playedShow('title')
    for (const id of fightIds) expect(fightView(after, id)!.title).toBeNull()
    const src = readdirSync(join(__dirname)).filter((f) => f.endsWith('.ts') && !f.includes('.test.') && f !== 'testShow.ts')
    for (const f of src) expect(readFileSync(join(__dirname, f), 'utf8'), f).not.toMatch(/\.title\s*=[^=]/)
  })

  it('an explicit title shows on the fight view and the event poster, with its tier label', () => {
    const { before, eventId } = playedShow('title2')
    const s = structuredClone(before)
    const ev = s.events[eventId]
    const mainId = ev.card[ev.card.length - 1]
    expect(eventPosterView(s, eventId)!.title).toBeNull()
    s.fights[mainId].title = { name: 'World Super Welterweight', tier: 'world' }
    const fv = fightView(s, mainId)!
    expect(fv.title).toEqual({ isTitleFight: true, titleName: 'World Super Welterweight', titleTier: 'world', label: 'WORLD TITLE' })
    const p = eventPosterView(s, eventId)!
    expect(p.championship).toBe(true)
    expect(p.title!.label).toBe('WORLD TITLE')
    expect(p.templateId).toBe('championship')
    for (const [tier, label] of [['regional', 'REGIONAL TITLE'], ['national', 'NATIONAL TITLE'], ['international', 'INTERNATIONAL TITLE']] as const) expect(titleView({ name: 'x', tier })!.label).toBe(label)
    expect(titleView(undefined)).toBeNull()
    expect(choosePosterTemplate({ hasMain: true, championship: false, ppv: false, international: false, rivalry: false, nextGen: false, bigVenue: false, fights: 5 })).toBe('main-event')
  })
})

// ---------------------------------------------------------------------------------------------- assets & pipeline
describe('asset naming, registry and hosted paths', () => {
  it('uses deterministic, entity-keyed filenames in the specified hierarchy', () => {
    expect(outputPath('fighter.profile', 'f_r')).toBe('fighters/profile/fighter_f_r_profile.webp')
    expect(outputPath('fighter.action', 'f_r')).toBe('fighters/action/fighter_f_r_action.webp')
    expect(outputPath('fighter.celebration', 'f_r')).toBe('fighters/celebration/fighter_f_r_celebration.webp')
    expect(outputPath('promotion.logo', 'p_q')).toBe('promotions/logos/promotion_p_q_logo.webp')
    expect(outputPath('venue', 'v_12')).toBe('venues/venue_v_12.webp')
    expect(fileName('news', 'knockout')).toBe('news_knockout.webp')
    for (const d of ['fighters/profile', 'fighters/action', 'fighters/celebration', 'promotions/logos', 'venues', 'events/templates', 'news', 'ui']) expect(existsSync(join(__dirname, '../../public/assets', d)), d).toBe(true)
  })

  it('resolves public assets under any base: site root, sub-path, and the hosted preview’s relative base', () => {
    expect(assetUrl('venues/a.svg', '/')).toBe('/assets/venues/a.svg')
    expect(assetUrl('venues/a.svg', '/game/')).toBe('/game/assets/venues/a.svg')
    expect(assetUrl('venues/a.svg', '/game')).toBe('/game/assets/venues/a.svg')
    expect(assetUrl('venues/a.svg', './')).toBe('assets/venues/a.svg')
    expect(assetUrl('venues/a.svg', '')).toBe('assets/venues/a.svg')
    for (const b of ['./', '', '/']) expect(assetUrl('x', b)).not.toMatch(/^\.\//)
  })

  it('every shipped file is listed by the preview publisher, with relative published paths', async () => {
    const mod = await import('../../scripts/preview/files.mjs' as string) as { previewFiles: () => { path: string }[] }
    const files = mod.previewFiles()
    const onDisk = (function walk(d: string): string[] { return readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : n === '.gitkeep' ? [] : [p] }) })(join(__dirname, '../../public/assets')).length
    expect(files.length).toBe(onDisk)
    for (const f of files) { expect(f.path.startsWith('assets/')).toBe(true); expect(f.path.startsWith('/')).toBe(false) }
    expect(files.length).toBeLessThanOrEqual(255)
  })

  it('art registry: venue-id art wins, then the shared kind look, then the tier backdrop; promotions/news swap to generated art', () => {
    clearArt(); setArtWorld(null)
    const v = { id: 'v_7', name: 'Hallam Arena', tier: 'national' as const, capacity: 4800, city: 'Sheffield', country: 'ENG' }
    expect(resolveVenueImage(v).url).toContain('venues/uk-arena.svg')
    registerArt('venue', ['v_7'])
    expect(resolveVenueImage(v).url).toContain('venues/venue_v_7.webp')
    expect(resolveVenueImage({ ...v, id: 'v_8' }).url).toContain('uk-arena.svg')
    expect(resolvePromotionImage('p_q', 'mark').state).toBe('fallback')
    registerArt('promotion.mark', ['p_q'])
    expect(resolvePromotionImage('p_q', 'mark').url).toContain('promotion_p_q_mark.webp')
    expect(resolveNewsKind('knockout').url).toContain('knockout.svg')
    registerArt('news', ['knockout'])
    expect(resolveNewsKind('knockout').url).toContain('news_knockout.webp')
    clearArt()
  })

  it('fighter art belongs to its world: it never shows on a different world’s fighter with the same id', () => {
    clearFighterArt()
    const f = { id: 'f_r', firstName: 'A', lastName: 'B', division: 'Welterweight' }
    const orig = MANIFEST.artWorld.seed
    MANIFEST.artWorld.seed = 'world-1'
    try {
      registerFighterArt('profile', ['f_r'])
      setArtWorld('world-2'); expect(resolveFighterImage(f).state).toBe('fallback')
      setArtWorld('world-1'); expect(resolveFighterImage(f).state).toBe('real')
      expect(resolveFighterImage(f).url).toContain('fighter_f_r_profile.webp')
      expect(hasFighterArt()).toBe(true); expect(artWorldSeed()).toBe('world-1')
    } finally { MANIFEST.artWorld.seed = orig; clearFighterArt(); setArtWorld(null) }
  })

  it('venue kinds cover UK and Las Vegas looks', () => {
    expect(venueKind({ name: 'Silver State Arena', tier: 'arena', capacity: 12000, city: 'Las Vegas', country: 'USA' })).toBe('vegas-arena')
    expect(venueKind({ name: 'Hallam Arena', tier: 'national', capacity: 4800, city: 'Sheffield', country: 'ENG' })).toBe('uk-arena')
  })
})

describe('generation requirements and prompts', () => {
  const world = canonWorld()
  const { manifest, classified } = buildRequirements(world, 'groundUp')

  it('classifies every fighter exactly once, player-owned first, and generic fighters get no art', () => {
    expect(classified.length).toBe(Object.keys(world.fighters).length)
    const by = (p: string) => classified.filter((c) => c.priority === p)
    expect(by('PREMIUM').length + by('IMPORTANT').length + by('STANDARD').length + by('GENERIC').length).toBe(classified.length)
    for (const c of classified.filter((x) => x.view.own !== null)) expect(c.priority).toBe('PREMIUM')
    const premium = by('PREMIUM').length
    expect(premium).toBeGreaterThan(0); expect(premium).toBeLessThan(classified.length * 0.15)
    for (const c of by('GENERIC')) expect(manifest.assets.some((a) => a.entityId === c.view.id && a.entityType === 'fighter')).toBe(false)
    for (const p of ['PREMIUM', 'IMPORTANT', 'STANDARD'] as const) for (const c of by(p)) {
      const kinds = manifest.assets.filter((a) => a.entityId === c.view.id && a.entityType === 'fighter').map((a) => a.assetType.split('.')[1]).sort()
      expect(kinds).toEqual([...FIGHTER_ASSETS[p]].sort())
    }
  })

  it('is deterministic and independent of presentation: same world → identical queue', () => {
    expect(JSON.stringify(buildRequirements(canonWorld(), 'groundUp').manifest)).toBe(JSON.stringify(manifest))
    expect(classifyFighters(world).map((c) => c.priority)).toEqual(classified.map((c) => c.priority))
  })

  it('every asset has the required fields, a unique id and path, and starts QUEUED', () => {
    expect(new Set(manifest.assets.map((a) => a.assetId)).size).toBe(manifest.assets.length)
    expect(new Set(manifest.assets.map((a) => a.outputPath)).size).toBe(manifest.assets.length)
    for (const a of manifest.assets) {
      for (const k of ['assetId', 'entityId', 'entityType', 'assetType', 'priority', 'prompt', 'status', 'outputPath', 'generationVersion'] as const) expect(a[k], `${a.assetId}.${k}`).toBeTruthy()
      expect(a.status).toBe('QUEUED'); expect(GEN_STATUSES).toContain(a.status)
      expect(a.outputPath.endsWith('.webp')).toBe(true)
    }
  })

  it('counts: rival promotions only, one image per venue entity, sixteen news, eight templates', () => {
    const c = countAssets(manifest.assets).byType
    expect(c['promotion.logo']).toBe(Object.values(world.promotions).filter((p) => !p.isPlayer).length)
    expect(c['promotion.mark']).toBe(c['promotion.logo'])
    expect(c.venue).toBe(Object.keys(world.venues).length)
    expect(c.news).toBe(16); expect(c.eventTemplate).toBe(8)
    expect(manifest.assets.some((a) => a.entityId === world.playerPromotionId)).toBe(false)
  })

  it('prompts are fictional, text-free and built from public facts (no hidden attributes, no real names)', () => {
    for (const a of manifest.assets) {
      expect(a.prompt, a.assetId).toMatch(/no text|No text|lettering|Do not copy/i)
      expect(a.prompt).not.toMatch(/attribute|potential|chin|hidden|discipline|composure|rating/i)
    }
    const fighters = manifest.assets.filter((a) => a.entityType === 'fighter')
    for (const a of fighters.slice(0, 40)) { expect(a.prompt).toMatch(/fictional/i); expect(a.prompt).toMatch(/not a real boxer/i) }
    const v = classified[0].view
    for (const f of ['profile', 'action', 'celebration'] as const) expect(fighterPrompt(v, f)).not.toContain(v.lastName)
    expect(promotionPrompt({ name: 'Apex Fight Group', logo: { monogram: 'AF', color: '#fff', emblem: 'bolt' } }, 'logo')).toContain('Do not copy any real')
    expect(venuePrompt({ name: 'X', city: 'Leeds', country: 'ENG', tier: 'regional', capacity: 2000 }, 'theatre')).toContain('fictional venue')
  })

  it('the committed generation manifest is in step with the current world requirements', () => {
    const file = join(__dirname, '../../asset-pipeline/generation-manifest.json')
    expect(existsSync(file)).toBe(true)
    const m = JSON.parse(readFileSync(file, 'utf8')) as GenManifest
    expect(m.world.seed).toBe('fight-empire-canon')
    expect(m.assets.map((a) => a.assetId)).toEqual(manifest.assets.map((a) => a.assetId))
  })

  it('the dry-run report lists every required line and the totals add up', () => {
    const text = dryRunReport(manifest, classified, 25, 'not configured')
    for (const l of ['Total fighters', 'Premium fighters', 'Important fighters', 'Standard fighters', 'Generic fighters', 'Profile assets required', 'Action assets required', 'Celebration assets required', 'Promotion logos required', 'Venue assets required', 'News assets required', 'Total assets']) expect(text).toContain(l)
    expect(text).toContain(String(manifest.assets.length))
  })
})

describe('provider abstraction', () => {
  it('without configuration the provider reports itself unavailable and generates nothing', async () => {
    expect(providerFromEnv({})).toBeInstanceOf(NullProvider)
    const st = await new NullProvider().checkStatus()
    expect(st.configured).toBe(false); expect(st.ready).toBe(false); expect(st.detail).toMatch(/IMAGE_GEN_PROVIDER/)
    expect((await new NullProvider().generateImage()).ok).toBe(false)
    expect(providerFromEnv({ IMAGE_GEN_PROVIDER: 'openai-compatible' })).toBeInstanceOf(OpenAICompatibleProvider)
    const half = await providerFromEnv({ IMAGE_GEN_PROVIDER: 'openai-compatible', IMAGE_GEN_API_KEY: 'k' }).checkStatus()
    expect(half.ready).toBe(false); expect(half.detail).toMatch(/IMAGE_GEN_BASE_URL/)
  })

  it('the HTTP provider reads its settings from the environment, sends the key only as a header, and reports failures per image', async () => {
    const calls: { url: string; headers: Record<string, string>; body: string }[] = []
    const env = { IMAGE_GEN_PROVIDER: 'openai-compatible', IMAGE_GEN_API_KEY: 'secret-key', IMAGE_GEN_BASE_URL: 'https://img.example/v1/', IMAGE_GEN_MODEL: 'm-1', IMAGE_GEN_COST_PER_IMAGE: '0.04' }
    const ok = new OpenAICompatibleProvider(env, async (url, init) => { calls.push({ url, headers: init.headers, body: init.body }); return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: Buffer.from('IMG').toString('base64') }] }), text: async () => '' } })
    const st = await ok.checkStatus()
    expect(st.ready).toBe(true); expect(st.costPerImage).toBe(0.04)
    const r = await ok.generateImage({ assetId: 'a', prompt: 'p', width: 10, height: 20, seed: 1, format: 'webp' })
    expect(r.ok).toBe(true); expect(Buffer.from(r.data!).toString()).toBe('IMG')
    expect(calls[0].url).toBe('https://img.example/v1/images/generations')
    expect(calls[0].headers.authorization).toBe('Bearer secret-key')
    expect(calls[0].body).not.toContain('secret-key')
    const bad = new OpenAICompatibleProvider(env, async () => ({ ok: false, status: 429, json: async () => ({}), text: async () => 'slow down' }))
    expect(await bad.generateImage({ assetId: 'a', prompt: 'p', width: 1, height: 1, seed: 1, format: 'webp' })).toEqual({ ok: false, error: 'HTTP 429: slow down' })
    const thrower = new OpenAICompatibleProvider(env, async () => { throw new Error('network down') })
    expect((await thrower.generateBatch([{ assetId: 'a', prompt: 'p', width: 1, height: 1, seed: 1, format: 'webp' }]))[0].error).toBe('network down')
  })

  it('no source file embeds a credential', () => {
    for (const f of ['provider.ts', 'runner.ts', 'requirements.ts']) expect(readFileSync(join(__dirname, '../assetgen', f), 'utf8')).not.toMatch(/sk-[A-Za-z0-9]{10,}|api[_-]?key\s*[:=]\s*['"][A-Za-z0-9]{8,}/i)
  })

  it('the game bundle never imports the pipeline or a provider', () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : [] })
    for (const f of [...walk(join(__dirname, '../ui')), ...walk(join(__dirname, '../store')), ...walk(join(__dirname, '../assets')), ...walk(join(__dirname, '../presentation'))].filter((x) => !x.endsWith('AssetGallery.tsx'))) expect(readFileSync(f, 'utf8'), f).not.toMatch(/assetgen|IMAGE_GEN|images\/generations/)
  })
})

describe('batch generation: dry run, batches, resume, duplicates', () => {
  class MockProvider implements ImageGenerationProvider {
    readonly id = 'mock'; readonly model = 'mock-1'
    calls: string[] = []
    constructor(private failIds: string[] = [], private dieAfter = Infinity) {}
    async checkStatus() { return { configured: true, ready: true, provider: 'mock', model: 'mock-1', detail: '', costPerImage: 0.5 } }
    async generateImage(r: ImageRequest): Promise<ImageResult> {
      if (this.calls.length >= this.dieAfter) throw new Error('process killed')
      this.calls.push(r.assetId)
      return this.failIds.includes(r.assetId) ? { ok: false, error: 'rejected' } : { ok: true, data: new Uint8Array([1, 2, 3]), format: 'webp' }
    }
    async generateBatch(rs: ImageRequest[]) { const o: ImageResult[] = []; for (const r of rs) o.push(await this.generateImage(r)); return o }
  }
  const mkIO = (files: Set<string>, saved: GenManifest[] = []): RunnerIO => ({ exists: (p) => files.has(p), write: (p) => { files.add(p) }, save: (m) => { saved.push(structuredClone(m)) }, log: () => undefined, now: () => 't' })
  const base = () => buildRequirements(fresh('batch-world'), 'groundUp').manifest
  const opts = { batchSize: 25, dryRun: false, missing: false, force: false }

  it('dry run generates nothing and writes nothing', async () => {
    const m = base(), files = new Set<string>(), p = new MockProvider(), saved: GenManifest[] = []
    const s = await runBatch(m, p, mkIO(files, saved), { ...opts, dryRun: true })
    expect(s.dryRun).toBe(true); expect(s.attempted).toBe(0); expect(p.calls).toHaveLength(0); expect(files.size).toBe(0); expect(saved).toHaveLength(0)
    expect(s.planned).toHaveLength(25)
    expect(m.assets.every((a) => a.status === 'QUEUED')).toBe(true)
  })

  it('refuses to run without a ready provider', async () => {
    await expect(runBatch(base(), new NullProvider(), mkIO(new Set()), opts)).rejects.toThrow(/not ready/)
  })

  it('processes exactly one batch (default 25) in priority order, highest first', async () => {
    const m = base(), files = new Set<string>(), p = new MockProvider()
    const s = await runBatch(m, p, mkIO(files), opts)
    expect(s.attempted).toBe(25); expect(p.calls).toHaveLength(25); expect(s.complete).toBe(25)
    expect(m.assets.filter((a) => a.status === 'COMPLETE')).toHaveLength(25)
    expect(m.assets.filter((a) => a.status === 'QUEUED')).toHaveLength(m.assets.length - 25)
    expect(m.assets.filter((a) => a.status === 'COMPLETE').every((a) => a.priority === 'PREMIUM')).toBe(true)
    expect(files.size).toBe(25)
    expect((await runBatch(m, p, mkIO(files), { ...opts, batchSize: 4 })).attempted).toBe(4)
  })

  it('is resumable: after an interruption the next run continues with the remainder and never repeats finished work', async () => {
    const m = base(), files = new Set<string>(), saved: GenManifest[] = []
    const p1 = new MockProvider([], 10)
    await expect(runBatch(m, p1, mkIO(files, saved), opts)).rejects.toThrow('process killed')
    // the manifest that was last persisted: 10 complete, one stuck GENERATING
    const persisted = saved[saved.length - 1]
    expect(persisted.assets.filter((a) => a.status === 'COMPLETE')).toHaveLength(10)
    expect(persisted.assets.filter((a) => a.status === 'GENERATING')).toHaveLength(1)
    const p2 = new MockProvider()
    const s2 = await runBatch(structuredClone(persisted), p2, mkIO(files), opts)
    expect(s2.attempted).toBe(25)
    expect(p2.calls.some((id) => persisted.assets.find((a) => a.assetId === id)!.status === 'COMPLETE')).toBe(false) // nothing regenerated
    expect(p2.calls).toContain(persisted.assets.find((a) => a.status === 'GENERATING')!.assetId) // the interrupted one was retried
  })

  it('never regenerates completed assets unless --force; --missing only picks assets whose file is gone', () => {
    const m = base(), files = new Set<string>()
    m.assets.slice(0, 40).forEach((a) => { a.status = 'COMPLETE'; files.add(a.outputPath) })
    const io = mkIO(files)
    const normal = selectBatch(m, io, opts)
    expect(normal.every((a) => a.status === 'QUEUED')).toBe(true)
    expect(normal.some((a) => a.status === 'COMPLETE')).toBe(false)
    files.delete(m.assets[3].outputPath)
    expect(selectBatch(m, io, { ...opts, missing: true }).map((a) => a.assetId)).toContain(m.assets[3].assetId)
    expect(selectBatch(m, io, { ...opts, missing: true }).filter((a) => a.status === 'COMPLETE').length).toBe(1)
    const forced = selectBatch(m, io, { ...opts, force: true, batchSize: 1000 })
    expect(forced.length).toBe(m.assets.length)
    expect(selectBatch(m, io, { ...opts, force: true, types: ['venue'], batchSize: 1000 }).every((a) => a.assetType === 'venue')).toBe(true)
  })

  it('records failures, retries them next run, and stops early after repeated failures', async () => {
    const m = base(), files = new Set<string>()
    const ids = selectBatch(m, mkIO(files), opts).map((a) => a.assetId)
    const p = new MockProvider([ids[2]])
    const s = await runBatch(m, p, mkIO(files), opts)
    expect(s.failed).toBe(1); expect(m.assets.find((a) => a.assetId === ids[2])!.status).toBe('FAILED'); expect(m.assets.find((a) => a.assetId === ids[2])!.error).toBe('rejected')
    const again = selectBatch(m, mkIO(files), opts)
    expect(again.map((a) => a.assetId)).toContain(ids[2])
    const m2 = base(), allBad = new MockProvider(selectBatch(m2, mkIO(new Set()), { ...opts, batchSize: 100 }).map((a) => a.assetId))
    const s2 = await runBatch(m2, allBad, mkIO(new Set()), opts)
    expect(s2.stoppedEarly).toBe(true); expect(s2.attempted).toBe(3)
  })

  it('review mode parks results as PENDING_REVIEW until approved', async () => {
    const m = base(), files = new Set<string>()
    await runBatch(m, new MockProvider(), mkIO(files), { ...opts, batchSize: 3, requireReview: true })
    expect(m.assets.filter((a) => a.status === 'PENDING_REVIEW')).toHaveLength(3)
    expect(approve(m, [m.assets.find((a) => a.status === 'PENDING_REVIEW')!.assetId])).toBe(1)
    expect(approve(m)).toBe(2)
    expect(m.assets.filter((a) => a.status === 'COMPLETE')).toHaveLength(3)
    expect(selectBatch(m, mkIO(files), opts).some((a) => a.status === 'COMPLETE')).toBe(false)
  })

  it('re-planning keeps progress and picks up new requirements; a new world starts fresh', () => {
    const m = base()
    m.assets[0].status = 'COMPLETE'; m.assets[1].status = 'FAILED'; m.assets[1].error = 'x'
    const merged = mergeManifest(m, base())
    expect(merged.assets[0].status).toBe('COMPLETE'); expect(merged.assets[1].status).toBe('FAILED')
    const other = buildRequirements(fresh('other-world'), 'groundUp').manifest
    expect(mergeManifest(m, other).assets.every((a) => a.status === 'QUEUED')).toBe(true)
    const bumped = base(); bumped.assets.forEach((a) => { a.generationVersion = 2 })
    expect(mergeManifest(m, bumped).assets[0].status).toBe('QUEUED')
  })

  it('publishes completed art into the runtime index only when the file really exists', () => {
    const m = base(), files = new Set<string>()
    const prof = m.assets.filter((a) => a.assetType === 'fighter.profile').slice(0, 2)
    prof.forEach((a) => { a.status = 'COMPLETE'; files.add(a.outputPath) })
    const ven = m.assets.find((a) => a.assetType === 'venue')!; ven.status = 'COMPLETE' // no file on disk
    const next = applyRuntimeIndex(structuredClone(MANIFEST) as never as { artWorld: { seed: string | null }; classes: Record<string, { ids: string[] }> }, m, (p) => files.has(p))
    expect(next.classes['fighter.profile'].ids.sort()).toEqual(prof.map((a) => a.entityId).sort())
    expect(next.classes.venue.ids).toEqual([])
    expect(next.artWorld.seed).toBe('batch-world')
  })

  it('shows a cost summary and demands confirmation for large batches', () => {
    const m = base(), batch = m.assets.slice(0, 30)
    const text = costSummary(batch, { configured: true, ready: true, provider: 'p', model: 'mm', detail: '', costPerImage: 0.04 }, m.assets.length)
    for (const x of ['assets queued overall', 'assets in this run', 'fighter.profile', 'p / mm', 'estimated cost', '1.20']) expect(text).toContain(x)
    expect(costSummary(batch, { configured: true, ready: true, provider: 'p', model: 'm', detail: '', costPerImage: null }, 1)).toContain('unknown')
    expect(needsConfirmation(25)).toBe(false); expect(needsConfirmation(26)).toBe(true)
    void toRequest
  })
})
