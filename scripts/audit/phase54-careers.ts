// Career walkthroughs for Phase 5.4: follows every fighter through a long world and reports real exemplars of each career shape,
// plus a side-by-side of two managers' conversations.   Usage: npx tsx scripts/audit/phase54-careers.ts [years] [seed]
import { advanceOneWeek } from '../../src/engine/tick'
import { createNewGame } from '../../src/engine/worldgen'
import { contenderStatus, STATUS_LABEL, type ContenderStatus } from '../../src/engine/business/titleEco'
import { getCareer } from '../../src/engine/media/records'
import { fighterName } from '../../src/engine/fighters'
import { managerOf } from '../../src/engine/business/manager'
import { openingOffer } from '../../src/engine/business/contractTalks'
import { contractMove, startContractTalk } from '../../src/engine/commands'
import { negStage } from '../../src/engine/business/stage'
import type { GameState, Id } from '../../src/engine/types'

const years = Number(process.argv[2] ?? 14)
const seed = process.argv[3] ?? 'p54-careers'
const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
let s: GameState = createNewGame({ seed, promotionName: 'Careers', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)

interface Track { first: Partial<Record<ContenderStatus, number>>; seq: ContenderStatus[]; peakPop: number }
const tracks = new Map<Id, Track>()
const yr = (day: number) => (1 + (day - s.startDay) / 365).toFixed(1)
const weeks = years * 52
for (let w = 1; w <= weeks; w++) {
  s = advanceOneWeek(s)
  if (w % 4 !== 0) continue
  for (const f of Object.values(s.fighters)) {
    if (f.status !== 'active') continue
    const st = contenderStatus(s, f)
    const t = tracks.get(f.id) ?? { first: {}, seq: [], peakPop: 0 }
    if (t.first[st] === undefined) t.first[st] = s.today
    if (t.seq[t.seq.length - 1] !== st) t.seq.push(st)
    t.peakPop = Math.max(t.peakPop, f.popularity)
    tracks.set(f.id, t)
  }
}
const line = (id: Id): string => {
  const f = s.fighters[id], t = tracks.get(id)!
  const kinds = getCareer(s.media!, id).filter((c) => ['TITLE_WON', 'TITLE_DEFENCE', 'UNIFIED', 'UNDISPUTED', 'ELIM_WON', 'MANDATORY', 'VACATED', 'STRIPPED', 'DIVISION_MOVE', 'RETIRED'].includes(c.k)).map((c) => `${c.k}${c.a ? `(${c.a.slice(0, 22)})` : ''}`).slice(0, 8).join(' ')
  return `${fighterName(f)} ${f.record.wins}-${f.record.losses}-${f.record.draws} [${f.status}] path: ${t.seq.map((x) => STATUS_LABEL[x]).join(' → ')}\n      ${kinds}`
}
// Retired fighters are pruned from the world after a while; only those still on file can be described.
const all = [...tracks.entries()].filter(([id]) => !!s.fighters[id])
const pick = (label: string, test: (id: Id, t: Track) => boolean, n = 2) => {
  const hits = all.filter(([id, t]) => test(id, t)).slice(0, n)
  console.log(`\n## ${label}  (${hits.length ? hits.length : 'none'} shown)`)
  for (const [id] of hits) console.log('  ' + line(id))
}
const has = (t: Track, st: ContenderStatus) => t.first[st] !== undefined
const ordered = (t: Track, a: ContenderStatus, b: ContenderStatus) => has(t, a) && has(t, b) && t.first[a]! < t.first[b]!
console.log(`World ${seed}, ${years} years, ${tracks.size} fighters followed`)
pick('Full ladder: prospect → … → European contender → … → world champion', (_, t) => ordered(t, 'PROSPECT', 'EUROPEAN_CONTENDER') && ordered(t, 'EUROPEAN_CONTENDER', 'CHAMPION'), 2)
pick('Mandatory challenger who then won a world title', (id, t) => has(t, 'MANDATORY_CHALLENGER') && has(t, 'CHAMPION') && getCareer(s.media!, id).some((c) => c.k === 'TITLE_WON'), 2)
pick('Unified champion', (_, t) => has(t, 'UNIFIED_CHAMPION'), 2)
pick('Undisputed champion', (_, t) => has(t, 'UNDISPUTED_CHAMPION'), 2)
pick('Champion who defended repeatedly', (id) => getCareer(s.media!, id).filter((c) => c.k === 'TITLE_DEFENCE').some((c) => (c.n ?? 0) >= 3), 2)
pick('Champion who lost the belt and retired', (id, t) => has(t, 'CHAMPION') && s.fighters[id].status === 'retired' && getCareer(s.media!, id).some((c) => c.k === 'TITLE_LOST'), 2)
pick('Never a title: a long career as a journeyman or domestic name', (id, t) => (s.fighters[id].record.wins + s.fighters[id].record.losses) >= 25 && !has(t, 'CHAMPION') && !getCareer(s.media!, id).some((c) => c.k === 'TITLE_WON'), 2)
pick('A losing career: more defeats than wins over 20+ fights', (id) => { const r = s.fighters[id].record; return r.wins + r.losses >= 20 && r.losses > r.wins }, 2)
pick('Changed division', (id) => getCareer(s.media!, id).some((c) => c.k === 'DIVISION_MOVE'), 3)
pick('Gave up a belt on moving division', (id) => getCareer(s.media!, id).some((c) => c.k === 'VACATED'), 2)
const star = all.sort((a, b) => b[1].peakPop - a[1].peakPop)[0]
console.log(`\n## Superstar (peak popularity ${star[1].peakPop.toFixed(0)})\n  ${line(star[0])}`)

// Two managers, same market: how the same opening offer is answered by a money-minded and a title-minded camp.
console.log('\n## Managers compared (first answer to the engine-suggested opening offer)')
const seen = new Set<string>()
for (const f of Object.values(s.fighters).filter((x) => x.status === 'active' && !x.contractId && !x.injury)) {
  const m = managerOf(s, f)
  const key = `${m.archetype}|${negStage(s, f)}`
  if (!['MONEY_FOCUSED', 'TITLE_FOCUSED', 'DEVELOPMENT_FOCUSED', 'AGGRESSIVE'].includes(m.archetype) || seen.has(m.archetype)) continue
  const r = startContractTalk(s, f.id, 'signing'); if (!r.ok) continue
  const tid = r.talkId!
  const ask = contractMove(r.state, tid, { kind: 'ask', topic: 'priorities' })
  const prop = contractMove(ask.state, tid, { kind: 'propose', offer: openingOffer(ask.state, f, 'signing') })
  const t = prop.state.business!.talks[tid]
  seen.add(m.archetype)
  console.log(`  [${negStage(s, f)}] ${fighterName(f)}`)
  for (const l of t.log.slice(1)) console.log(`     ${l.who === 'you' ? 'YOU ' : l.who === 'mgr' ? 'CAMP' : 'NOTE'}: ${l.text}`)
  if (t.counter) console.log(`     counter asks for: ${[t.counter.pathway ? `a pathway (${t.counter.pathway.kind})` : '', t.counter.plan ? `plan ${t.counter.plan}` : '', t.counter.minFightsPerYear !== t.offer!.minFightsPerYear ? `${t.counter.minFightsPerYear} fights a year` : '', t.counter.basePurse > t.offer!.basePurse ? 'more money' : ''].filter(Boolean).join(', ') || 'small changes'}`)
}
void yr
