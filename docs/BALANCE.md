# Fight Empire — Balance notes (Phase 3)

All tunables live in `src/engine/balance.ts` (`BALANCE.sim`, `BALANCE.fights`, `BALANCE.negotiation`, …). Nothing below is
tuned to make a test pass: the plausibility tests assert *wide* bands taken from how professional boxing looks, and
`src/engine/fight/fiveyear.test.ts` prints the real distributions for inspection.

## Simulation assumptions
* A round = 3 one-minute segments. Punch counts are binomial samples; there is no per-punch object.
* **Attributes are normalised 0–1**; the engine is the only code that reads true values. Fight-state (damage, energy,
  momentum, confidence, hurt, warnings) lives only inside `simulateFight`. A fight never edits permanent attributes.
* **Night form:** each fighter gets a random performance swing (sd 0.095) so ratings are strong but not destiny.
* **Knockdowns** are a hazard per "big shot": `sigmoid(−4.95 + 3.6·damageRatio + 2.8·(power−chin) + 1.1·fatigue + 1.3·hurt + 0.5·momentum)`.
* **Stoppages** need context: referee stops require high damage ratio (>0.6 + hurt, or >0.85), three knockdowns in a round, corner
  retirements need heavy damage *and* a lead against, injury stoppages are rare and scale with injury proneness.
* **Judges** score each round from effective punching (jabs ×1, power ×2.3, damage, knockdowns, ring control) with
  per-judge noise and a volume bias, so close rounds split.
* **Age:** persistent physical decline is applied by weekly development (speed from 29, stamina 30, chin 31, power 33; capped
  rate); in the ring older fighters recover slower and get injured more; ring IQ/heart keep improving slightly into the
  early thirties and experience boosts effective ring IQ.

## Observed distributions (5-year run, seed `five`)
| Metric | Observed | Reference intent |
|---|---|---|
| Fights per contracted fighter / year | 2.6 | 2–3 |
| Fights per active fighter / year (incl. idle free agents) | 1.3 | ≥1 |
| Stoppages | ~50% | 40–60% |
| Knockouts (count-outs) | ~22% | — |
| Draws | ~2% | 1–4% |
| Round-1 stoppages | ~1% | <5% |
| Fights with a knockdown | ~41% | 25–45% |
| Public favourites (≥15pt gap) win | ~79% | 65–85% |
| Fights producing an injury | ~18% | 10–25% |
| Max fights by one fighter in 12 months | 4–5 | ≤5 |

## Known balance concerns / open questions
* **Knockdown rate is on the high side** (≈0.5 per fight). Stoppage mix may need a further pass once real play data exists.
* **"Big upset" frequency (17%)** is measured against a *public-standing* expectation, which is a noisy proxy for true ability.
* **Veteran decline** is gentle (≈−12 speed over five years for 34+); recovery and injury risk carry more of the age effect.
* **Save size** grows ≈300 kB/year (fights ≈1 kB each, 3-year retention; fighters, inbox). Fine for a decade, but
  Phase 8 should move saves to IndexedDB and archive old results compactly.
* **AI purses** use contract terms and an abstract AI income (Phase 6 replaces this).
* **Fight negotiation** asks are derived from a camp-side appraisal of your fighter (noisy by promotion tier); unproven
  promoters pay a premium. These coefficients are first guesses.
