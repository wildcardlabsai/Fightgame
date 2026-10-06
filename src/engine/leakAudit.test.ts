/**
 * HIDDEN-INFORMATION LEAK AUDIT
 * The engine knows every fighter's true attributes; the player must not. These tests fail if the
 * presentation layer (src/ui, src/store) ever reaches around the view/knowledge boundary.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { commissionReport } from './commands'
import { PERSONALITY_LINES } from './fighters'
import { negotiationInfo, quoteReports } from './quotes'
import { advanceOneWeek } from './tick'
import { playerRoster } from './selectors'
import { viewsOf } from './view'
import type { GameState } from './types'
import { createNewGame } from './worldgen'
import { fighterAge } from './fighters'

const ROOT = join(__dirname, '..')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : []
  })
}
const presentation = [...walk(join(ROOT, 'ui')), ...walk(join(ROOT, 'store'))].map((p) => ({ path: p.replace(ROOT + '/', ''), src: readFileSync(p, 'utf8') }))

const fresh = (seed = 'leak') => createNewGame({ seed, promotionName: 'Leak', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'L', color: '#fff', emblem: 'bolt' } }, 1_700_000_000_000)

describe('static scan of the presentation layer', () => {
  it('finds the presentation files', () => {
    expect(presentation.length).toBeGreaterThan(20)
  })

  const FORBIDDEN: [string, RegExp][] = [
    ['true rating function', /\bfighterRating\b/],
    ['raw attributes', /\.attributes\b/],
    ['raw potential', /\.potential\b/],
    ['hidden traits', /\.(discipline|composure|injuryRisk|personalityNote|promoRelations)\b/],
    ['raw fighters table', /\.fighters\b/],
    ['raw knowledge table', /\b(game|state|g|s)\.knowledge\b/],
    ['balance sheet (holds negotiation thresholds)', /\bBALANCE\b/],
    ['console output', /\bconsole\./],
    ['raw html injection', /dangerouslySetInnerHTML/],
    ['direct storage access', /\blocalStorage\b|\bsessionStorage\b/],
    ['global debug handles', /\bwindow\.[A-Za-z_]+\s*=(?!=)|\(window as/],
    ['true career stage (uses hidden potential)', /\bcareerStage\b/],
    ['engine truth selectors', /(?<!views\.)\b(playerRoster|freeAgents|rosterOf|rosterByRating|contractOf|promotionOf)\b/],
    ['internal ask/appraisal', /\b(askTerms|appraise|evaluateOffer|valueOf|trueValue|beliefOf|scoreOffer|aiFit)\b/],
  ]
  for (const [name, re] of FORBIDDEN) {
    it(`no presentation code uses: ${name}`, () => {
      const hits = presentation.filter((f) => re.test(f.src)).map((f) => f.path)
      expect(hits, `${name} found in ${hits.join(', ')}`).toEqual([])
    })
  }

  it('only imports engine truth modules as types', () => {
    const bad: string[] = []
    const re = /import\s+(type\s+)?(\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+'([^']+)'/g
    // value imports the UI legitimately needs (labels and public constants only)
    const allowedValues: Record<string, string[]> = {
      'systems/development': ['FOCUS_LABELS', 'FOCUS_BLURBS'], 'systems/contracts': ['STAGE_LABEL'], promotions: ['TIER_ORDER', 'LOGO_COLORS', 'LOGO_EMBLEMS', 'monogramFor'],
    }
    for (const f of presentation) {
      let m: RegExpExecArray | null
      while ((m = re.exec(f.src))) {
        const [, isType, names, mod] = m
        const engine = mod.match(/engine\/(.+)$/)?.[1]
        if (!engine) continue
        const ok = ['view', 'quotes', 'selectors', 'calendar', 'types', 'save', 'worldgen', 'config', 'tick', 'commands', 'scouting']
        if (['knowledge', 'market', 'negotiation', 'roster', 'rng', 'balance', 'ledger', 'systems/aiMarket', 'systems/world', 'ids', 'messages'].includes(engine)) bad.push(`${f.path} imports ${engine}`)
        if (!isType && !ok.includes(engine)) {
          const allowed = allowedValues[engine] ?? []
          const used = names.replace(/[{}]/g, '').split(',').map((x) => x.trim()).filter(Boolean)
          if (engine === 'fighters' || !allowed.length || used.some((u) => !allowed.includes(u))) bad.push(`${f.path} value-imports ${engine}: ${names}`)
        }
        if (/\bFighter\b|\bFighterAttributes\b|\bFighterKnowledge\b/.test(names) && engine === 'types') bad.push(`${f.path} imports raw Fighter type`)
        if (engine === 'scouting' && !isType) bad.push(`${f.path} value-imports scouting`)
        if (engine === 'worldgen' && !isType && !f.path.startsWith('store/')) bad.push(`${f.path} value-imports worldgen`)
        if (engine === 'save' && !f.path.startsWith('store/')) bad.push(`${f.path} imports save outside the store`)
        if (engine === 'commands' && !f.path.startsWith('store/')) bad.push(`${f.path} imports commands outside the store`)
        if (engine === 'tick' && !f.path.startsWith('store/')) bad.push(`${f.path} imports tick outside the store`)
      }
    }
    expect(bad).toEqual([])
  })

  it('the save export is the only place the full state is serialised', () => {
    const hits = presentation.filter((f) => /serialiseGame|JSON\.stringify/.test(f.src)).map((f) => f.path)
    expect(hits).toEqual(['store/gameStore.ts'])
  })

  it('only the settings screen offers the export', () => {
    const hits = presentation.filter((f) => /exportGame/.test(f.src)).map((f) => f.path).sort()
    expect(hits).toEqual(['store/gameStore.ts', 'ui/screens/SettingsScreen.tsx'])
  })

  it('contract history is only ever read through the player-filtered selector', () => {
    expect(presentation.filter((f) => /\.contractHistory\b|\bstate\.contracts\b|\bgame\.contracts\b/.test(f.src)).map((f) => f.path)).toEqual([])
  })
})

describe('runtime: what a FighterView can contain', () => {
  const DENY_KEYS = ['attributes', 'potential', 'discipline', 'composure', 'injuryRisk', 'personalityNote', 'promoRelations', 'aiReviewed', 'est', 'insight', 'sd', 'mean']

  function keysOf(x: unknown, out = new Set<string>()): Set<string> {
    if (Array.isArray(x)) x.forEach((i) => keysOf(i, out))
    else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { out.add(k); keysOf(v, out) }
    return out
  }

  let s = fresh()
  const f0 = Object.keys(s.knowledge).map((id) => s.fighters[id]).filter((f) => f.status === 'active' && !f.contractId)[0]
  for (let r = 0; r < 2; r++) {
    s = commissionReport(s, f0.id, 'deep', s.scouts[0].id).state
    for (let i = 0; i < 4; i++) s = advanceOneWeek(s)
  }

  it('no view carries a hidden-value key', () => {
    const all = Object.keys(s.fighters).map((id) => viewsOf(s).fighter(id)!)
    const keys = keysOf(all)
    for (const k of DENY_KEYS) expect(keys.has(k), `view exposes key "${k}"`).toBe(false)
  })

  it('personality stays hidden until the player has insight, and never leaks via the bio', () => {
    const lines = Object.values(PERSONALITY_LINES)
    const views = Object.keys(s.fighters).map((id) => viewsOf(s).fighter(id)!)
    for (const v of views) {
      for (const line of lines) expect(v.bio.includes(line)).toBe(false)
      if (v.personality.reveal !== 'revealed') { expect(v.personality.trait).toBeNull(); expect(v.personality.note).toBeNull() }
    }
    const unrevealed = views.filter((v) => v.personality.reveal === 'unknown')
    expect(unrevealed.length).toBeGreaterThan(100)
    expect(views.find((v) => v.id === f0.id)!.personality.reveal).toBe('revealed') // two deep reports
  })

  it('own-roster condition is banded, rival contracts expose no terms', () => {
    const v = viewsOf(s)
    for (const m of v.mine()) {
      for (const b of [m.own!.fitness, m.own!.morale, m.own!.confidence, m.own!.conditioning]) expect(b.value % 10).toBe(0)
    }
    for (const r of v.contractedElsewhere()) {
      expect(r.contract.kind).toBe('rival')
      expect(Object.keys(r.contract).sort()).toEqual(['approxMonthsLeft', 'kind', 'promotionId', 'promotionName'])
    }
  })

  it('an UNSCOUTED fighter\'s view is independent of every hidden attribute (only public facts matter)', () => {
    const base = fresh('indep')
    const target = Object.keys(base.knowledge).map((id) => base.fighters[id]).find((f) => f.status === 'active' && !f.contractId && fighterAge(f, base.today) > 27 && !base.knowledge[f.id].reports.length)!
    const before = JSON.stringify(viewsOf(base).fighter(target.id))
    const altered: GameState = structuredClone(base)
    const t = altered.fighters[target.id]
    for (const k of Object.keys(t.attributes) as (keyof typeof t.attributes)[]) t.attributes[k] = k === 'marketability' ? t.attributes[k] : Math.min(99, 100 - t.attributes[k])
    t.potential = 100 - t.potential
    t.discipline = 100 - t.discipline
    t.composure = 100 - t.composure
    t.injuryRisk = 100 - t.injuryRisk
    t.personality = t.personality === 'Greedy' ? 'Humble' : 'Greedy'
    expect(JSON.stringify(viewsOf(altered).fighter(target.id))).toBe(before)
  })

  it('…but a SCOUTED fighter\'s view does respond to the truth (reports carry real information)', () => {
    const base = fresh('indep2')
    const target = Object.keys(base.knowledge).map((id) => base.fighters[id]).find((f) => f.status === 'active' && !f.contractId)!
    const a = structuredClone(base), b = structuredClone(base)
    b.fighters[target.id].attributes.power = Math.max(5, 100 - base.fighters[target.id].attributes.power)
    let x = commissionReport(a, target.id, 'deep', a.scouts[0].id).state
    let y = commissionReport(b, target.id, 'deep', b.scouts[0].id).state
    for (let i = 0; i < 4; i++) { x = advanceOneWeek(x); y = advanceOneWeek(y) }
    expect(viewsOf(x).fighter(target.id)!.traits.physical[0].mid).not.toBe(viewsOf(y).fighter(target.id)!.traits.physical[0].mid)
  })

  it('quotes and suggested offers are independent of hidden attributes', () => {
    const base = fresh('quote')
    const target = Object.keys(base.knowledge).map((id) => base.fighters[id]).find((f) => f.status === 'active' && !f.contractId && fighterAge(f, base.today) > 27)!
    const altered = structuredClone(base)
    const t = altered.fighters[target.id]
    t.personality = t.personality === 'Greedy' ? 'Humble' : 'Greedy'
    t.attributes.power = 100 - t.attributes.power
    t.potential = 100 - t.potential
    t.promoRelations[altered.playerPromotionId] = -50
    const sig = (st: GameState) => JSON.stringify([negotiationInfo(st, target.id, 'signing')?.suggested, quoteReports(st, target.id, st.scouts[0].id)])
    expect(sig(altered)).toBe(sig(base))
  })

  it('every rating shown for roster fighters is a range, never a bare number', () => {
    for (const m of viewsOf(s).mine()) expect(m.grade.hi).toBeGreaterThan(m.grade.lo)
  })

  it('views for the starting roster are not centred on the truth for all traits', () => {
    const own = playerRoster(s)
    let exact = 0, n = 0
    for (const f of own) {
      const v = viewsOf(s).fighter(f.id)!
      for (const [t, k] of [['power', 'power'], ['speed', 'speed'], ['chin', 'chin'], ['defence', 'defence']] as const) {
        const tv = [...v.traits.physical].find((x) => x.key === t)!
        n++
        if (tv.mid === Math.round(f.attributes[k])) exact++
      }
    }
    expect(exact / n).toBeLessThan(0.5)
  })
})
