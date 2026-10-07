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

## Phase 4.5 — Test changes and why (no test was loosened to hide a regression)
| Test | Change | Reason |
|---|---|---|
| `phase2` migrate v1 | version expectation is now `GAME_STATE_VERSION` (5) | the save format moved on; the test still proves the whole v1→current chain |
| `phase2` expired contract | looks up the contract history by fighter id, and uses the youngest fighter | the history is global; another fighter retiring in the same week made `[0]` ambiguous |
| `phase3` purses once | income lines are allowed only in event categories (tickets/sponsorship/broadcast/ppv) | Phase 4 made every fight a show with a gate; the point of the test (no *invented* income, purses paid once) is kept |
| `phase4` hire / books / v3 migration | hire is the difficulty-adjusted rent; rival cash identity includes distributions; migration test also checks AI traits | new mechanics (difficulty, owner distributions, save v5) |
| `phase4` forecast width | asserts the forecast error band (experience narrows it, floor 24%) | in a sold-out 450-seat hall both ends of the range are pinned at capacity, so attendance width cannot show it |
| `longrun` rivals stocked | the 50%-of-target roster floor and `cash ≥ 0` apply to rivals that are not struggling/critical/insolvent; negative cash is only allowed while distressed | deliberate design change: distressed rivals shed fighters and may go negative (life cycle) |
| `fiveyear` fights/year | counts bouts as they complete instead of from the end-state table; veterans = 31+ at start | the retention policy now prunes old bouts from state (measurement artefact); with 34+ no veteran survives five years |

## Phase 4.5 — Measured results (10 seeds × 20 years world; 5 strategies × 5 seeds × 10 years; final code)
Reproduce: `scripts/audit/run.sh`, `scripts/audit/summarize.mjs`; synthetic audits in `src/engine/sim/audit.test.ts`.

**Rival events (n≈9,200).** Fill histogram 20–40% 4% · 40–60% 16% · 60–80% 25% · 80–95% 17% · ≥95% 38% (sellouts 34%, was 87%). Profit p10/p50/p90:
local −204k/65k/160k (19% lose) · regional 28k/221k/510k (8%) · national 36k/319k/977k (8%) · arena 91k/980k/2.4m (8%) · stadium −1.0m/932k/3.0m (24%).
Actual demand vs the promoter's public estimate: median 0.98, σ(log) 0.29. Rivals' own forecasts contain the outcome only 49% of the time (they are over-optimistic: 33% below range).
PPV: 16% of rival events (Apex 61%, Redline 27%, others ≈1–2%; 82% at stadium level); 28% of PPV shows lose money.
**World.** ≈208 fights/yr, ≈20 retirements and ≈21 new pros per year, ≈325 active fighters, mean age 27.1→27.6, 1.3 fights per active fighter-year, ~52% of prospects (≤23) fight in a given year, top-20 mean age 30–31.5. Mean popularity 30.8→28.2→25.0 (y5/10/20): a slow cooling remains (see concerns). Max repeat pairing 6 (was 16).
**Rivals.** Over 20 years: 2 collapses and several rescues among 60 promotion-runs, all in the weakest regional promotions; big promotions stay healthy and pay out distributions.
**Player strategies (10 y, cash mean [min..max], insolvent runs).** Conservative £3.4m [1.4..5.6] 0/5 · Prospect factory £2.1m [0.9..2.8] 0/5 (y5 £3.2m) · Balanced −£0.3m [−1.6..3.9] 4/5 · Aggressive −£2.2m 5/5 · Superstar −£1.8m 5/5. 20 years (2 seeds): conservative £5.9m, prospects £7.1m (rep 82), balanced £1.8m [−3.9..7.4].
**Difficulty.** Balanced bot, 10 y: Forgiving 3/3 survive (£1.5–4.3m); Brutal 0/3. Brutal with patient play: prospects 3/3, conservative 2/3 survive.
**Speed (isolated, one core).** 5 y 33 ms/week (9 s total) · 10 y 41 ms/week (22 s) · 20 y 49 ms/week (51 s). **Save.** JSON 2.19 / 2.51 / 2.62 MB at 5/10/20 y; gzip (IndexedDB) 306 / 344 / 356 kB; load+migrate 12–17 ms. Growth flat after year 5 (was 4.5 MB and rising at year 20).

## Phase 4.5 — Problems found and what changed
1. Rivals sold out 87% of shows (perfect forecasting, revenue-maximising prices, big-room bias) → perception error by competence, risk-appetite venue choice, comfortable-house pricing.
2. Forecast bands ±12% and biased (capped at capacity) → bands from uncapped demand, ±42%→±24% by experience, six hidden noise sources.
3. Rivals earned from a fixed abstract income and were silently bailed out → they earn from shows only; life cycle; rescues limited to 2 per 5 years and cost reputation and talent; then collapse. Rival overhead rescaled (a regional promoter could not cover retainers on ~3 shows a year; cadence and concurrent shows raised).
4. Purse curve had been flattened to make the start viable → exponential curve, cheap at the bottom, real at the top.
5. PPV was venue-sized and almost risk-free → national campaign, appeal^4, hype noise, production bill, gate cannibalisation; rivals pick PPV only if their own sums favour it.
6. Fight table and retired fighters grew without bound (a retired fighter's own bouts kept him in the save) → retention policy; 4.5 MB → 2.6 MB at year 20, flat.
7. Same pair fought 16 times → meeting penalty and a trilogy cap.
8. Promotion reputation swung ±3–4 per show → momentum (smoothed form), ±2.2/2.6 cap.
9. An event whose only fight was cancelled still entered fight week (found by an existing test on a changed seed) → such events are now cancelled.
10. Main bundle 612 kB → 267 kB (screens lazy-loaded; React vendor 193 kB separate).

## Phase 4.5 — Remaining concerns
* **Expansion barely pays.** In the scripted runs only patient, small-roster play survives; every strategy that signs stars or runs big cards goes bankrupt. Some of that is crude bots (they overspend on retainers before income exists, do not use long contracts to lock in developing fighters, and never cut costs), but it may also mean the step from regional to national is too steep. Needs human play-testing before Phase 5 builds on it.
* Developing a fighter is taxed hard: renewal asks follow the exponential purse curve, so a fighter who becomes a star usually leaves at expiry unless signed long.
* Mean fame still drifts down ~20% over 20 years (retiring stars replaced by low-popularity pros).
* Local shows are ~31% of events but ~0% of profit: a stepping stone, not a business.
* Rich rivals pile up cash until the distribution ceiling; Apex makes ~£4–5m a year of profit.
* Strategy tables for 5/10 years are on final code; the 20-year strategy runs predate the final retention/fame tweaks.
* Brutal is unforgiving for imperfect play.


> Phase 4.6 completion: the balance changes, evidence and before/after simulations are in `docs/ECONOMY_BALANCE.md`.
