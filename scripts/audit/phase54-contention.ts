/*
 * Title contention audit: title activity, vacancy and contender supply by level, organisation and division, over several seeds.
 * Usage: npx tsx scripts/audit/phase54-contention.ts [years=5] [seeds=5] [--detail]
 * Reproducible: seeds are "contend-1".."contend-N", the strategy is the balanced bot. Nothing here changes the game.
 */
import { createNewGame } from '../../src/engine/worldgen'
import { advanceOneWeek } from '../../src/engine/tick'
import { newLog, playWeek, STRATEGIES } from '../../src/engine/sim/strategies'
import { getList, getReigns } from '../../src/engine/media/records'
import { assessChallenger } from '../../src/engine/business/contender'
import { championCampResponse } from '../../src/engine/business/titleCamp'
import { TITLE_DEF_BY_ID, LEVEL_ORDER, levelOf, type TitleLevel } from '../../src/engine/business/titleDefs'
import { WEIGHT_CLASSES } from '../../src/data/weightClasses'
import { fighterName } from '../../src/engine/fighters'
import { fightRoundsProblem } from '../../src/engine/business/fightRounds'

const years = Number(process.argv[2] ?? 5), seeds = Number(process.argv[3] ?? 5), detail = process.argv.includes('--detail')
const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
type Row = { noFloor: number; noCredible: number; busy: number; contestable: number; booked: number; weeks: number; beltWeeks: number; vacantWeeks: number; fights: Record<string, number>; credible: number[]; accept: number; ask: number; vacancyEpisodes: number[] }
const mk = (): Row => ({ noFloor: 0, noCredible: 0, busy: 0, contestable: 0, booked: 0, weeks: 0, beltWeeks: 0, vacantWeeks: 0, fights: { voluntary: 0, mandatory: 0, eliminator: 0, vacant: 0 }, credible: [], accept: 0, ask: 0, vacancyEpisodes: [] })
const byLevel: Record<string, Row> = {}, byOrg: Record<string, Row> = {}, byDiv: Record<string, Row> = {}
const row = (m: Record<string, Row>, k: string): Row => (m[k] ??= mk())
const seedLines: string[] = []
const chRec: Record<string, { n: number[]; w: number[] }> = {}
const examples: Record<string, string[]> = { refused: [], mandatoryOverride: [], toMandatory: [], routes: [], prospectToArea: [] }
const ex = (k: string, t: string) => { if (examples[k].length < 3) examples[k].push(t) }
const ladder = { areaToDomestic: 0, domesticToEuropean: 0, europeanToWorld: 0, areaToWorld: 0, mandatoryOrders: 0, mandatoryDespiteObjection: 0, voluntaryRefusedTopContender: 0, probs: 0 }

for (let k = 1; k <= seeds; k++) {
  let s = createNewGame({ seed: `contend-${k}`, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
  const log = newLog()
  const seen = new Set<string>()
  const vacantSince: Record<string, number> = {}
  let titleFights = 0, shortRounds = 0
  for (let w = 1; w <= years * 52; w++) {
    s = playWeek(s, STRATEGIES.balanced, log); s = advanceOneWeek(s)
    const m = s.media!
    for (const [key, rec] of Object.entries(m.titles)) {
      const [body, wc] = key.split('|'); const lvl = levelOf(body)
      for (const r of [row(byLevel, lvl), row(byOrg, body), row(byDiv, wc)]) { r.beltWeeks++; if (!rec.c) r.vacantWeeks++ }
      if (!rec.c) {
        vacantSince[key] ??= w
        // Is there a plausible route? Two credible contenders who are free to be matched.
        const cred = (getList(m, body, wc as never)?.e ?? []).filter((e) => e.r >= 1 && assessChallenger(s, body, e.f).tier === 'contender')
        const free = cred.filter((e) => { const f = s.fighters[e.f]; return f.status === 'active' && !f.activeFightId && !f.injury && (f.suspendedUntil ?? 0) <= s.today })
        const live = cred.filter((e) => s.fighters[e.f].activeFightId && s.fights[s.fighters[e.f].activeFightId!]?.title)
        const floorOk = (getList(m, body, wc as never)?.e ?? []).filter((e) => e.r >= 1 && assessChallenger(s, body, e.f).tier !== 'notEligible')
        for (const r of [row(byLevel, lvl), row(byOrg, body)]) { if (free.length >= 2) r.contestable++; else if (cred.length >= 2) r.busy++; else if (floorOk.length >= 2) r.noCredible++; else r.noFloor++; if (live.length >= 1) r.booked++ }
      }
      else if (vacantSince[key] !== undefined) { const d = w - vacantSince[key]; for (const r of [row(byLevel, lvl), row(byOrg, body)]) r.vacancyEpisodes.push(d); delete vacantSince[key] }
    }
    for (const f of Object.values(s.fights)) {
      if (!f.title || seen.has(f.id) || f.status === 'negotiating') continue
      seen.add(f.id); titleFights++
      if (f.scheduledRounds <= 4) shortRounds++
      if (fightRoundsProblem(s, f)) ladder.probs++
      const ids = [f.sideA.fighterId, f.sideB.fighterId]
      for (const b of f.title.bodies ?? []) {
        const rec = m.titles[`${b}|${f.weightClass}`]
        const kind = f.title.kind === 'eliminator' ? 'eliminator' : !rec?.c ? 'vacant' : ids.includes(rec.mand?.challenger ?? '') ? 'mandatory' : 'voluntary'
        for (const r of [row(byLevel, levelOf(b)), row(byOrg, b), row(byDiv, f.weightClass)]) r.fights[kind]++
        if (kind !== 'vacant' && kind !== 'eliminator') { const ch = s.fighters[ids.find((i) => i !== rec!.c) ?? ids[0]]; const e = (chRec[levelOf(b)] ??= { n: [], w: [] }); e.n.push(ch.record.wins + ch.record.losses + ch.record.draws); e.w.push(ch.record.wins) }
        if (kind === 'mandatory') {
          ladder.mandatoryOrders++
          const ch = ids.find((i) => i !== rec!.c)!
          const keep = rec!.mand; rec!.mand = undefined
          const objection = championCampResponse(s, rec!.c!, ch, f.weightClass, [b])
          if (!objection.accept) { ladder.mandatoryDespiteObjection++; ex('mandatoryOverride', `week ${w}: ${fighterName(s.fighters[ch])} v ${fighterName(s.fighters[rec!.c!])} for the ${b} belt went ahead as a mandatory defence although, as a voluntary fight, the champion's camp would have refused (${objection.reason?.split('—')[1]?.trim() ?? 'not interested'})`) }
          rec!.mand = keep
        }
      }
    }
    if (w % 13 === 0) {
      for (const [key, rec] of Object.entries(m.titles)) {
        const [body, wc] = key.split('|'); const d = TITLE_DEF_BY_ID[body]
        const list = getList(m, body, wc as never)?.e.filter((e) => e.r >= 1) ?? []
        const cred = list.filter((e) => e.f !== rec.c && assessChallenger(s, body, e.f).tier === 'contender')
        for (const r of [row(byLevel, levelOf(body)), row(byOrg, body), row(byDiv, wc)]) r.credible.push(cred.length)
        if (rec.c) for (const e of cred.filter((x) => x.r <= d.challengerLimit)) {
          const resp = championCampResponse(s, rec.c, e.f, wc as never, [body])
          for (const r of [row(byLevel, levelOf(body)), row(byOrg, body)]) { r.ask++; if (resp.accept) r.accept++ }
          if (!resp.accept && e.r <= 2 && !resp.ordered) { ladder.voluntaryRefusedTopContender++; ex('refused', `week ${w}: #${e.r} ${body} contender ${fighterName(s.fighters[e.f])} (${s.fighters[e.f].record.wins}-${s.fighters[e.f].record.losses}) turned down by champion ${fighterName(s.fighters[rec.c])} — ${resp.reason?.split('—')[1]?.trim()}`) }
        }
      }
    }
  }
  // Ranked contender -> mandatory: from the reigns of fighters who held a belt after being named mandatory (approximated by mandatory fights above).
  for (const e of m_mandatoryNames(s)) ex('toMandatory', e)
  // Career routes, from the reign records: a belt at one level followed by a belt at a higher level.
  const reigns = [...getReigns(s.media!)].reverse()
  const bestSoFar = new Map<string, number>()
  for (const r of reigns) {
    const lv = LEVEL_ORDER.indexOf(levelOf(r.b)), was = bestSoFar.get(r.f) ?? -1
    if (lv > was) { if (was === -1 && lv === 0) ex('prospectToArea', `${r.fn}: first belt ${r.b} (${s.fighters[r.f] ? s.fighters[r.f].record.wins + '-' + s.fighters[r.f].record.losses : ''} now)`); if (was >= 0) ex('routes', `${r.fn}: ${LEVEL_ORDER[was]} champion → ${r.b} (${LEVEL_ORDER[lv]}) champion`)
       if (was === 0 && lv === 1) ladder.areaToDomestic++; if (was === 1 && lv === 2) ladder.domesticToEuropean++; if (was === 2 && lv === 3) ladder.europeanToWorld++; if (was === 0 && lv === 3) ladder.areaToWorld++; bestSoFar.set(r.f, lv) }
  }
  seedLines.push(`seed contend-${k}: title fights ${titleFights}, short(<=4) ${shortRounds}`)
}

const pct = (a: number, b: number) => (b ? (100 * a / b).toFixed(1) + '%' : '–')
const avg = (a: number[]) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '–')
const n = seeds
function table(title: string, m: Record<string, Row>, keys: string[]) {
  console.log(`\n${title}`)
  console.log('key'.padEnd(16) + 'belts(avg)'.padStart(11) + 'vacant'.padStart(9) + 'vac wks'.padStart(9) + 'contestable'.padStart(13) + 'busy'.padStart(7) + 'noCred'.padStart(8) + 'noFloor'.padStart(9) + 'in-fight'.padStart(10) + 'credible/belt'.padStart(15) + 'fights/yr'.padStart(11) + 'vol'.padStart(6) + 'mand'.padStart(6) + 'elim'.padStart(6) + 'vac'.padStart(6) + 'accepted'.padStart(10))
  for (const k of keys) {
    const r = m[k]; if (!r) continue
    const weeks = years * 52 * n
    const tot = r.fights.voluntary + r.fights.mandatory + r.fights.eliminator + r.fights.vacant
    console.log(k.padEnd(16) + (r.beltWeeks / weeks).toFixed(1).padStart(11) + pct(r.vacantWeeks, r.beltWeeks).padStart(9) + avg(r.vacancyEpisodes).padStart(9) + pct(r.contestable, r.vacantWeeks).padStart(13) + pct(r.busy, r.vacantWeeks).padStart(7) + pct(r.noCredible, r.vacantWeeks).padStart(8) + pct(r.noFloor, r.vacantWeeks).padStart(9) + pct(r.booked, r.vacantWeeks).padStart(10) + avg(r.credible).padStart(15) + (tot / years / n).toFixed(1).padStart(11) + String(r.fights.voluntary).padStart(6) + String(r.fights.mandatory).padStart(6) + String(r.fights.eliminator).padStart(6) + String(r.fights.vacant).padStart(6) + pct(r.accept, r.ask).padStart(10))
  }
}
console.log(`Title contention, ${seeds} seeds x ${years} years (counts are totals over all seeds; fights/yr and belts are per seed)`)
console.log(seedLines.join('\n'))
table('BY LEVEL', byLevel, ['area', 'domestic', 'european', 'world'])
table('BY ORGANISATION', byOrg, Object.keys(byOrg).sort((a, b) => LEVEL_ORDER.indexOf(levelOf(b)) - LEVEL_ORDER.indexOf(levelOf(a))))
if (detail) table('BY DIVISION', byDiv, WEIGHT_CLASSES.map((w) => w.id))
const all = Object.values(byLevel).reduce((t, r) => ({ b: t.b + r.beltWeeks, v: t.v + r.vacantWeeks, f: t.f + r.fights.voluntary + r.fights.mandatory + r.fights.eliminator + r.fights.vacant }), { b: 0, v: 0, f: 0 })
console.log(`\nALL: vacant ${pct(all.v, all.b)}, title-fight bodies per seed-year ${(all.f / years / n).toFixed(1)}`)
for (const lv of LEVEL_ORDER) { const e = chRec[lv]; if (e) { const srt = (a: number[]) => a.slice().sort((x, y) => x - y); const q = (a: number[], p: number) => srt(a)[Math.floor(p * (a.length - 1))]; console.log(`${lv} challengers (voluntary+mandatory, n=${e.n.length}) fights min/p10/median ${Math.min(...e.n)}/${q(e.n, .1)}/${q(e.n, .5)}  wins min/p10/median ${Math.min(...e.w)}/${q(e.w, .1)}/${q(e.w, .5)}`) } }
console.log('\nExamples:'); for (const [k, v] of Object.entries(examples)) for (const t of v) console.log(`  [${k}] ${t}`)
console.log('Routes (reign records, all seeds):', JSON.stringify(ladder))
process.exit(ladder.probs ? 1 : 0)

function m_mandatoryNames(s: ReturnType<typeof createNewGame>): string[] {
  const out: string[] = []
  for (const [key, rec] of Object.entries(s.media!.titles)) if (rec.mand && rec.c) { const ch = s.fighters[rec.mand.challenger]; out.push(`${fighterName(ch)} (${ch.record.wins}-${ch.record.losses}) named mandatory challenger for ${key.split('|')[0]} champion ${fighterName(s.fighters[rec.c])}, after ranking and assessment as a credible contender`) }
  return out.slice(0, 3)
}
