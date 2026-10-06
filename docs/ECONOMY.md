# Fight Empire — Economic Model (Phase 4.5)

One page that says how money moves, why, and what the intended relationships are. All numbers live in
`src/engine/balance.ts` (`market`, `events`, `difficulty`); nothing here is hidden in code. The audit that produced the
measured ranges is reproducible: `scripts/audit/run.sh` + `scripts/audit/summarize.mjs`, and `src/engine/sim/audit.test.ts`.

## 1. The chain

```
 card quality ─► event interest ─► demand ─► attendance ─► gate ─┐
 (public facts)   (+ promotion,      (price, marketing,  (capped    │
                    venue prestige)   venue, city, noise) by seats)  ├─► revenue ─► profit
                                                 PPV / TV / sponsors ┘        ▲
                                         purses, venue, production, marketing, officials, levy
```

1. **Card quality** (public information only): every fight has an *appeal* = 0.68·star power + 0.32·reputation, where star power is
   0.7·(more popular fighter) + 0.3·(other). It is modulated by how competitive the fight looks (±15%), unbeaten records,
   momentum (form), rivalry history and division importance. The card scores 0.58 main + 0.20 co-main + 0.22 depth.
2. **Interest** (0–100) = 0.55 main + 0.15 co-main + 0.12 depth + 0.12 promotion strength + 0.06 venue prestige.
3. **Demand** at the reference price = 65·(interest/10)^2.3, × promotion factor (0.8–1.5 from reputation), × marketing
   (1 + up to 0.85 × awareness, awareness scaled to the venue), × the venue's city market, local ties of the fighters
   (hometown/nation/region), foreign/home adjustments, × a broadcast cannibalisation factor (PPV costs 10% of the live gate).
   Price elasticity is logistic around the *reference price* `20 + 0.48·interest` (premium ×2.4, VIP ×7; seats 78/17/5%).
4. **Attendance** = demand clipped by seats per tier. **Gate** = Σ tickets × price, booked weekly (refunded on cancellation).
5. **Other income** — sponsors (≈4.5% of expected gate × promotion standing × card quality, per-event, ~4–8% of revenue),
   broadcast (local TV, national TV need reputation/quality; streaming pays per viewer), PPV (promoter keeps 55% of buys × price).
6. **Costs** — venue hire, production (by venue capability + per seat, PPV/TV add a broadcast crew), marketing (weekly slices),
   purses and win bonuses (paid per fight), officials/medical, security (£1.1/head), a 10% sanctioning levy on the gate,
   and PPV shares owed to headliners whose contracts carry one.

## 2. What is public, what is hidden

| Public (forecasts, AI decisions) | Hidden (actual outcomes only) |
|---|---|
| records, reputation, popularity, form, rivalry, prices, venue facts, promotion standing | headliners' true marketability, event-level noise (σ 0.16), city enthusiasm (σ 0.09), marketing luck (σ 0.22), national economy by year (σ 0.07), weather by venue tier (σ 0.02–0.09), rival shows the same night (up to −22%), season by month (−6%…+6%), city price-sensitivity (σ 0.10), PPV hype (σ 0.65) |

Net effect: actual/forecast demand is unbiased with σ ≈ 0.28 in log terms. The player's forecast band starts at ±42% and
narrows with experience to a floor of ±24% (×0.85 on Forgiving, ×1.25 on Brutal): *never* ±1%. Rivals use the same model
through their own noisy perception (§5).

## 3. The purse model

`purse(value) = max(£1,500, 290·e^(10·value/100))` per fight, where *value* is the fighter's public market value (0–100:
reputation, popularity, record, age, hype). It is exponential on purpose:

| Market value | Typical fighter | Base purse |
|---|---|---|
| 10–20 | club journeyman | £1.5k–2k |
| 30 | median professional | £5.8k |
| 45 | regional contender | £26k |
| 55 | national name | £71k |
| 65 | arena headliner | £190k |
| 75 | star | £520k |
| 80 | world-level (best in a typical world) | £860k |

*Why exponential?* Gate and PPV revenue are super-linear in star power (interest^2.3 × PPV appeal^4), so the price of a fighter
must be too, or money becomes irrelevant. Phase 4 had *lowered* the whole curve to make the starting economy viable — that hid
the problem. Phase 4.5 restores a steep top end and instead fixes the **low** end: the first shows are viable because journeymen
are cheap, and the player faces the real question — "can I afford this fighter?" — as soon as they chase value ≥ 50.
Targets (checked by `phase45.test.ts` and the audit): purses ≈ 40–60% of the gate at local/regional shows, 25–40% of revenue at
arena level, a single star costing more than the whole starting roster ×3.

Retainers (weekly) use a gentler curve (£70 + £4,800·value^2.2) and are the main fixed cost of holding a roster.

## 4. Starting position and running costs (player)

| Item | Value |
|---|---|
| Starting cash | £300k Brutal / £500k Standard / £750k Forgiving |
| Weekly overhead | £3,750 (office 1,200, staff 1,500, gym 700, insurance 350), ×0.85 / ×1.2 by difficulty |
| Four starting fighters | retainers ≈ £1.6k/week, purses £5–11k |
| Break-even | ≈ one profitable regional show per 6–8 weeks, or two local ones |

Difficulty changes the *world* (`BALANCE.difficulty`): venue hire ×0.9/1/1.15, sponsor offers ×1.15/1/0.85, fighter asks
×0.92/1/1.10, forecast band ×0.85/1/1.25, demand noise ×0.85/1/1.2, and the rivals are drawn one competence notch better on
Brutal (worse on Forgiving). Starting cash is only one of seven levers.

## 5. Rival promotions under the same rules

* **Money**: rivals earn only from their own shows (same event engine, same ledger rules, `accounting` reconciles to the penny:
  `cash = start + revenue − costs − overhead + bailouts − distributions`).
* **Competence** (poor / average / strong / elite): shifts how wrong they are about demand (σ 0.38 / 0.24 / 0.15 / 0.09 and an
  optimism bias +20% / +6% / 0 / −2%), whether they price by calculation or rule of thumb, how disciplined their marketing
  budget is, whether they overreach to a bigger room, and how noisy their fighter appraisals are. Nobody is perfect.
* **Personality** changes decisions: *Big Money* accepts lower expected fill (risk 0.75), books arenas/stadiums, heavy
  marketing, bigger cards, PPV; *Prospect Factory* never leaves regional rooms, runs more (and smaller) shows, cheap tickets;
  *Traditional* is moderate; *Regional* only books home-country venues with local marketing.
* **Life cycle** (`systems/aiFinance.ts`): growing → healthy → established → struggling → critical → insolvent, derived from
  trailing quarterly net vs fixed costs and runway. Struggling: slower cadence, one room smaller, 60% marketing, no signings,
  releases the most expensive fighter every 8 weeks. Critical: one show at a time, two rooms smaller, 25% marketing, cuts
  2 fighters a month, reputation bleeds. Insolvent: an owner **rescue** (at most twice in five years) injects cash but costs
  8 reputation and 40% of the roster; after that the owners stop — the promotion *collapses* (no new shows, 15% of fighters
  leave every two months, reputation and fanbase drain). It is not removed from the world yet (Phase 6).
* **Distributions**: cash above a tier ceiling is paid out to owners (so rich rivals do not hoard indefinitely).

## 6. Event size is a decision

Same medium card (`audit.test.ts`, 200 draws): regional hall — safe, capped upside; national — best median with a real downside;
arena — higher variance, ~25% loss; stadium — near-certain disaster. A larger venue raises hire, production, security and
marketing needs *and* needs demand the card cannot create.

## 7. Broadcast and PPV (audit)

| Card | Best option | Why |
|---|---|---|
| weak | local TV or nothing | national needs rep/quality; PPV loses money ~99% of the time |
| medium | national TV | fixed fee, low risk; PPV is a coin-flip with a −£130k p10 |
| high | streaming / national; PPV can win | PPV median is better but variance is wide |
| superstar | PPV | ticketed-only shows lose money at superstar purses; PPV pays but p10 is still deeply negative |

PPV is *not* mandatory below star level and never a sure thing: buys depend on a **national** campaign (sized to the
promotion's fanbase, not the building), the headliner's appeal^4, price and a hidden hype factor (σ 0.65); the production bill
grows with interest (£40k + £45·interest²).

## 8. Where to look when something feels wrong

`scripts/audit/run.sh <dir> <years> "<strategies>" "<seeds>" [difficulty]` then `node scripts/audit/summarize.mjs <dir>`.
Sections: `players`, `events`, `demand`, `ai`, `world`, `sizes`.
