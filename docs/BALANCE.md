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

## Phase 4 — Event economics (10-year run, `events/balance10.test.ts`)
A scripted promoter (`events/bot.ts`: agrees fights, picks the venue with the best public forecast, prices at the reference,
sensible marketing, best broadcast deal, best sponsor, runs the night, re-signs and tops up the roster) plays ten years.

| Metric (seed `balance10`) | Result |
|---|---|
| Shows | 64 (≈6.4/yr), 0 cancelled |
| Cash £500k start → | £0.5m / 0.4m / 0.6m / 0.6m / 0.6m / 1.1m / 1.1m / 1.1m / 1.1m / 1.8m (end of each year) |
| Regional shows (4–6k seats) | 40, avg profit ≈ £104k, 90% full, 1 loss |
| National shows | 20, avg profit ≈ £205k, 73% full, 0 losses |
| Local halls | 4, avg ≈ −£15k (too small for the purses) |
| Rival promotions | ≈170 shows in 10 years, ≈4% make a loss, mean fill ≈ 98%, owner top-ups £0.8m total |
| Engine speed | ≈ 57 ms per simulated week (includes ~170 rival shows) |
| Save size at year 10 | ≈ 3.8 MB JSON (≈ 0.5–0.8 MB gzipped in IndexedDB) |

What shapes the numbers (all in `balance.ts → events`): reference ticket price `20 + 0.48·interest`, premium ×2.4, VIP ×7;
demand `90·(interest/10)^2.1`; a 10% sanctioning levy on the gate; production by venue capability; purse curve exponent 3.0
(Phase 4 lowered the cost of low-level fighters, otherwise no small hall could pay for itself).

Design properties verified by tests: price elasticity has an interior optimum; marketing has diminishing returns scaled to venue
size; hidden demand noise (σ = 0.2) plus forecast error (±30% → ±14% with experience) mean forecasts can miss; empty big venues lose
heavily (forecast shows "too big"); a card needs the venue's minimum number of fights.

**Open balance concerns.** (1) The bot is a better forecaster than most players, so expect fewer wins in real play; (2) local halls
cannot cover purses — they are a stepping stone, not a business; (3) rich rivals accumulate cash (no dividends yet) and rival
shows fill ≈98% because rivals pick buildings from the same forecast the player sees; (4) PPV is never chosen by the bot —
it needs a genuine star (popularity ≈ 60+) that the starting roster cannot produce within ten years of sensible play.
