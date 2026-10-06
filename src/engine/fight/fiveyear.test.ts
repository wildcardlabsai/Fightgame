import { describe, expect, it } from 'vitest'
import { fighterAge } from '../fighters'
import { freeAgents, rosterOf } from '../selectors'
import { advanceOneWeek } from '../tick'
import { createNewGame } from '../worldgen'

describe('five-year world simulation (player passive)', () => {
  it('produces believable boxing', () => {
    let s = createNewGame({ seed: 'five', promotionName: 'F', promoterName: 'T', homeCountry: 'ENG', difficulty: 'forgiving', logo: { monogram: 'F', color: '#fff', emblem: 'bolt' } })
    const t0 = performance.now()
    const startAges = new Map(Object.values(s.fighters).map((f) => [f.id, { sp: f.attributes.speed, st: f.attributes.stamina, iq: f.attributes.ringIQ, ch: f.attributes.chin, pw: f.attributes.power, age: fighterAge(f, s.today) }]))
    let maxSave = 0
    for (let w = 1; w <= 52 * 5; w++) { s = advanceOneWeek(s); if (w % 52 === 0) maxSave = Math.max(maxSave, JSON.stringify(s).length) }
    const ms = (performance.now() - t0) / (52 * 5)

    const all = Object.values(s.fights).filter((f) => f.status === 'postFight' && f.result)
    const methods: Record<string, number> = {}
    for (const f of all) methods[f.result!.method] = (methods[f.result!.method] ?? 0) + 1
    const n = all.length
    const stop = (methods.KO ?? 0) + (methods.TKO ?? 0) + (methods.RTD ?? 0) + (methods.INJ ?? 0)
    const draws = (methods.DRAW ?? 0) + (methods.MDRAW ?? 0) + (methods.SDRAW ?? 0)
    const r1 = all.filter((f) => f.result!.round === 1 && f.result!.method !== 'UD').length
    const kdFights = all.filter((f) => f.result!.kd[0] + f.result!.kd[1] > 0).length
    const injFights = all.filter((f) => f.result!.injuries.some(Boolean)).length
    // Favourites by PUBLIC expectation
    const fav = all.filter((f) => f.result!.winner !== null && Math.abs(f.result!.pExpA - 0.5) >= 0.15)
    const favWins = fav.filter((f) => (f.result!.pExpA > 0.5 ? 0 : 1) === f.result!.winner).length
    const strongFav = all.filter((f) => f.result!.winner !== null && Math.abs(f.result!.pExpA - 0.5) >= 0.35)
    const strongWins = strongFav.filter((f) => (f.result!.pExpA > 0.5 ? 0 : 1) === f.result!.winner).length
    const upsets = all.filter((f) => f.result!.upset > 0.6).length

    const active = Object.values(s.fighters).filter((f) => f.status === 'active')
    const retired = Object.values(s.fighters).filter((f) => f.status === 'retired').length
    const perFighterYear = (n * 2) / (new Set(all.flatMap((f) => [f.sideA.fighterId, f.sideB.fighterId])).size || 1) / 5
    const perContracted = (all.reduce((c, f) => c + [f.sideA, f.sideB].filter((x) => x.promotionId !== null).length, 0)) / Math.max(1, Object.values(s.contracts).length) / 5
    const maxPerYear = Math.max(...active.map((f) => f.recentFights.map((id) => s.fights[id]).filter((x) => x && x.day > s.today - 365).length))
    // fighters who fought nobody in 3 years while contracted
    const idle = active.filter((f) => f.contractId && (f.lastFightDay === null || s.today - f.lastFightDay > 3 * 365)).length
    const old = active.filter((f) => startAges.has(f.id) && startAges.get(f.id)!.age >= 34)
    const dSpeed = old.reduce((a, f) => a + f.attributes.speed - startAges.get(f.id)!.sp, 0) / Math.max(1, old.length)
    const dIq = old.reduce((a, f) => a + f.attributes.ringIQ - startAges.get(f.id)!.iq, 0) / Math.max(1, old.length)
    const young = active.filter((f) => startAges.has(f.id) && startAges.get(f.id)!.age <= 22)
    const dYoung = young.reduce((a, f) => a + (f.attributes.ringIQ + f.attributes.defence) / 2 - (startAges.get(f.id)!.iq + 0) , 0) / Math.max(1, young.length)
    console.log([
      `FIGHTS ${n} (${(n / 5).toFixed(0)}/yr) | per active fighter/yr ${perFighterYear.toFixed(2)} | per contract/yr ${perContracted.toFixed(2)} | max in last 12m ${maxPerYear}`,
      `METHODS ${JSON.stringify(methods)}`,
      `stoppage ${(stop / n * 100).toFixed(1)}% | KO ${((methods.KO ?? 0) / n * 100).toFixed(1)}% | draws ${(draws / n * 100).toFixed(1)}% | round-1 stops ${(r1 / n * 100).toFixed(1)}% | fights with a knockdown ${(kdFights / n * 100).toFixed(1)}%`,
      `favourites (public, ≥15pt gap) won ${(favWins / fav.length * 100).toFixed(1)}% of ${fav.length} | strong favourites ${(strongWins / Math.max(1, strongFav.length) * 100).toFixed(1)}% of ${strongFav.length} | big upsets ${upsets} (${(upsets / n * 100).toFixed(1)}%)`,
      `injury rate ${(injFights / n * 100).toFixed(1)}% of fights | retired ${retired} of ${Object.keys(s.fighters).length} fighters | idle >3y while contracted ${idle}`,
      `development: veterans(34+) speed Δ${dSpeed.toFixed(1)} ringIQ Δ${dIq.toFixed(1)} | young ringIQ/def Δ${dYoung.toFixed(1)}`,
      `market: free agents ${freeAgents(s).length} | rival rosters [${Object.values(s.promotions).filter((p) => !p.isPlayer).map((p) => rosterOf(s, p.id).length).join(',')}] | news ${s.news.length}`,
      `perf ${ms.toFixed(1)} ms/week | max save ${(maxSave / 1024).toFixed(0)} kB | fights stored ${Object.keys(s.fights).length}`,
    ].join('\n'))

    expect(n).toBeGreaterThan(500)
    expect(perFighterYear).toBeGreaterThan(1.0)
    expect(perFighterYear).toBeLessThan(4)
    expect(maxPerYear).toBeLessThanOrEqual(5) // nobody fights fifteen times a year
    expect(stop / n).toBeGreaterThan(0.3); expect(stop / n).toBeLessThan(0.65)
    expect(draws / n).toBeGreaterThan(0.005); expect(draws / n).toBeLessThan(0.07)
    expect(r1 / n).toBeLessThan(0.06)
    expect(kdFights / n).toBeGreaterThan(0.15); expect(kdFights / n).toBeLessThan(0.55)
    expect(favWins / fav.length).toBeGreaterThan(0.58); expect(favWins / fav.length).toBeLessThan(0.9) // favourites win more often, not always
    expect(upsets).toBeGreaterThan(5)
    expect(injFights / n).toBeGreaterThan(0.03); expect(injFights / n).toBeLessThan(0.4)
    expect(idle).toBeLessThan(active.filter((f) => f.contractId).length * 0.15)
    expect(dSpeed).toBeLessThan(-1) // veterans slow down…
    expect(dIq).toBeGreaterThan(dSpeed) // …but ring craft holds up better
    expect(ms).toBeLessThan(60)
    expect(maxSave).toBeLessThan(4_000_000)
    expect(freeAgents(s).length).toBeGreaterThan(40)
  }, 240_000)
})
