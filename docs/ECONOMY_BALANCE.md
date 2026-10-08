# Economy balance — Phase 4.6 completion (promotion tiers, standing sponsors, calibration)

Everything here is backed by the repeatable calibration suite (`scripts/audit/`, see "How to reproduce").
Before = the code at commit `d61416f` (end of Phase 4.7) run with the Phase 4.5 scripted promoters. After = this phase.
Bot changes are listed separately from engine changes so the two effects are not confused.

## 1. Why Balanced and Aggressive went bankrupt (investigation)

Method: cash-flow decomposition by ledger category (`diagnose.mjs`), per-event results by venue size, and per-year traces of individual failing worlds.

### P1 — Success trap: fighter pay grows faster than the building can pay for it
- **Evidence.** In failing Balanced worlds (10-year, 4 seeds) cash was healthy to year 5 (£1.3m), then purses went £1.6m → £2.3m a year while ticket income stayed ~£3m, because a regional-size building (≤ ~5,000 seats) caps the gate. A typical show: revenue £450k, purses £300–390k (70% of revenue), before venue, officials (10% levy), production. The promotion was *developing* fighters well; the fighters were worth more than any show it was allowed to stage could pay.
- **Root cause.** Purses follow `290·e^(0.10·value)` (public market value) with no reference to what a promotion can sell. Revenue per show is capped by venue capacity; nothing tied what a promotion could *book* to what it could *afford*. Stars could be signed and renewed at any size.
- **Changes.** (a) Promotion tier now limits the biggest venue bookable (§3). (b) Scripted promoters price tickets against the public forecast and refuse purses above ~£11 per seat of their biggest allowed building (these are decisions a human has as well; the advisor flags both).
- **Expected effect.** A promotion cannot be bankrupted by *success it cannot monetise*; signing or renewing a star above its means is a visible, deliberate mistake.

### P2 — Death spiral: a cash dip stopped the promoter from running shows
- **Evidence.** In Balanced/Aggressive failures `shows` fell to 0 while retainers (£150–250k/yr) and overhead (£195k/yr) kept running; `why` counters showed every venue rejected by the cash floor / forecast-loss filter. Cash 855k → −294k in one year with 3 shows.
- **Root cause.** The audit promoters (and, by design, insolvency) blocked all booking once cash fell under a floor; nothing downshifted to cheap shows to recover.
- **Change.** Promoters now downshift to conservative play (cheap opponents, small halls) after a failed planning attempt or a cash scare and return to their style once cash has recovered. This is the "recovery path": a competent player who loses £150k on one show can run cheap local shows to rebuild; three bad shows in a row still create real pressure.

### P3 — Aggressive/superstar bets paid stars where they could not earn
- **Evidence (Before).** `groundUp/aggressive` 100% bankrupt at 10 years, `regional/aggressive` 100%. Per-show purses jumped from £25k to £170–290k the week cash passed the £1m "stake", with gates capped by 4,800-seat venues.
- **Root cause.** The bet fired on cash alone.
- **Change.** The bet now also requires the promotion tier that can use a star (Aggressive: Regional, Superstar: National).

### P4 — Starting contenders at market price (Build a Champion)
- **Evidence.** The starting star's contract was £71k per fight and £1.4k a week at a Local promotion whose biggest gate is ~£120k. Champion/aggressive 100% bankrupt in the first two years.
- **Change.** `RosterGroup.contractDiscount` (data): the exceptional contender was signed before their breakout, at 45% of today's rate. Renewal at the market rate is the first real test of the career.

### P5 — Fixed costs did not scale with the size of the operation
- **Evidence.** National-scenario Balanced: office+staff+gym+insurance £190k of £13m revenue (1.5%); cash £16–19m after 5 years.
- **Change.** `TierDef.overheadMult`: Local ×1, Regional ×1.25, National ×2, International ×4.5, Global ×10. Higher tiers need more money — and earn much more. (First version was ×1.6/×3.5/×8/×18. The 10-year suite showed that was too punishing: tier-ups are automatic, and a conservative promoter who earned National status but kept running seven regional-size shows a year was squeezed to insolvency by overhead alone — 0/3 survived from the Regional start. The softer table fixes that without removing the scaling; see §6.)

### P6 — Local halls cannot carry a multi-fight card (kept as designed)
- **Evidence (Before, all strategies, n=9,326 player shows).** Local venues (<1,500 seats): median profit £7k, **44% lose money**, purses 91% of revenue. Regional venues (1,500–5,000): median profit £114k, 8% loss, almost always sold out. National (5–14k): median £367k, 15% loss. Arena: median £249k, **37% lose money**, 81% fill.
- **Reading.** Local shows build reputation, fans and modest capital but cannot be the long-term money-maker (as intended); regional venues were the engine but were open from day one — a ground-up promotion booked a 4,800-seat hall in week 8. That skipped the "small local shows" stage entirely and made later tiers meaningless. Arenas are the genuinely risky step.

## 2. What was NOT changed
Purse curve, retainers, demand model, forecast noise, PPV/broadcast economics and AI behaviour are unchanged. The simulation evidence did not show them to be the bottleneck once promotion size limits what can be booked; no unexplained changes were made.

## 3. Promotion tiers

| Tier (id) | Roster cap | Biggest venue | Standing sponsors | Overhead × | Entry requirements |
|---|---|---|---|---|---|
| Local (`Startup`) | 10 | 3,500 seats | 1 | ×1 | — |
| Regional | 18 | 6,000 | 2 | ×1.25 | rep 14 · 6k fans · 5 events · £100k revenue · not in financial trouble |
| National | 28 | 20,000 (arenas) | 3 | ×2 | rep 42 · 120k fans · 30 events · £3.5m revenue · 4,000 crowd · 3 fighters rated 42+ · not in financial trouble |
| International (`Major`) | 40 | 20,000 | 4 | ×4.5 | rep 58 · 450k fans · 50 events · £14m revenue · 8,000 crowd · 4 fighters 55+ · healthy · £1.5m cash |
| Global | 60 | stadiums | 5 | ×10 | rep 78 · 2m fans · 90 events · £55m revenue · 18,000 crowd · 7 fighters 65+ · healthy · £8m cash |

Rules: qualify four weeks in a row to be promoted; demotion needs a full year below 70% of the tier's reputation and 50% of its fanbase. PPV opens at National; national TV/streaming at Regional. Cash alone never promotes (tested). Old saves are placed on the tier they already earned, quietly.
Earlier iterations and why they were changed: venue gating by venue *tier* (Local could book 4,800-seat halls → no local stage) → by *capacity*; Local cap 2,500 → 3,500 (only four venues were profitable and AI shows booked them: conservative players stalled, 67% survival); reputations for Regional/National lowered (16→14, 36→30) so a Balanced promoter reaches Regional in ~3–5 years and National in ~8–9.

## 4. Standing sponsors

Data-driven catalog (`sponsorCatalog.ts`): 14 companies, 5 sponsor tiers. Examples: Ironside Gym Supplies £20k/yr + £1.5k/show (Local); Knockout Energy £70k + £5k/show, +5% marketing (Regional); Apex Financial £250k + £20k (National); Meridian Motors £800k + £60k (International); Global Sport £3m + £150k (Global). Quarterly instalments + per-qualifying-show fees + sell-out bonus; terms fixed for 1/2/3 years (+0/5/10% on the annual value for longer deals); one partner per industry; slots by tier; minimum qualifying shows per year with venue-size and audience floors; relationship score (50 start, +2 a show, +10/−20 a contract year); two missed years end the deal; good years earn a renewal offer scaled by relationship. Offers use keyed randomness (never the world RNG) and every payment is a ledger line (`standingSponsor`).
Observed share of income: ~2.5% (Local) → ~6% (Regional) → ~11% (National) of revenue.

## 5. Scenario starting positions
| Scenario | Tier | Cash | Roster | Cap | Overhead/wk |
|---|---|---|---|---|---|
| From the Ground Up (Hard) | Local | £300k | 4 | 10 | £5.5k total burn |
| Regional Promoter (Normal) | Regional | £800k | 11 | 18 | |
| National Powerhouse (Easy) | National | £4m | 24 | 28 | |
| Build a Champion (Expert) | Local | £420k | 5 | 10 | |


## 6. Simulation results

"Survive" = never insolvent at a year-end within the horizon and cash ≥ 0 at the end. Worlds are deterministic (seeds `s01…`). Before = Phase 4.7 code with the Phase 4.5 promoters (12 seeds at 5 years, 6 at 10); After = this phase with the updated promoters (25 seeds per core configuration at 3 and 5 years — the 3-year figures are the first three years of the same 5-year worlds — 4 seeds at 10 years, 1 at 20; the extra strategies 8 seeds).

### Before → after, 5 years
| scenario | strategy | n before→after | survive before→after | cash med before→after | rev/yr med | tier after | roster after |
|---|---|---|---|---|---|---|---|
| champion | aggressive | 12→25 | 25%→72% | -874k→802k | 1.6m→3.8m | National | 10 |
| champion | balanced | 12→25 | 33%→80% | -487k→3.2m | 1.9m→3.4m | National | 8 |
| champion | conservative | 12→25 | 58%→92% | 1.9m→3.3m | 1.7m→2.1m | Regional | 5 |
| champion | prospects | 12→8 | 83%→88% | 3.8m→4.7m | 3.5m→3.9m | National | 9 |
| champion | superstar | 12→8 | 17%→88% | -937k→3.1m | 1.0m→2.0m | Regional | 5 |
| groundUp | aggressive | 12→25 | 17%→96% | -809k→1.6m | 1.7m→1.8m | Regional | 10 |
| groundUp | balanced | 18→25 | 89%→88% | 1.2m→1.4m | 2.5m→2.3m | Regional | 8 |
| groundUp | conservative | 25→25 | 100%→100% | 1.8m→2.0m | 1.6m→1.4m | Regional | 5 |
| groundUp | prospects | 12→8 | 100%→100% | 4.5m→4.8m | 3.2m→3.4m | National | 9 |
| groundUp | superstar | 12→8 | 33%→88% | -113k→2.6m | 1.4m→1.4m | Regional | 5 |
| national | aggressive | 12→25 | 100%→92% | 11.7m→32.4m | 23.2m→28.0m | Intl | 16 |
| national | balanced | 12→25 | 100%→100% | 16.9m→35.6m | 12.1m→16.5m | Intl | 15 |
| national | conservative | 12→25 | 100%→100% | 2.4m→4.7m | 2.4m→3.1m | National | 16 |
| national | prospects | 12→8 | 100%→100% | 2.1m→4.0m | 3.7m→5.1m | National | 15 |
| national | superstar | 12→8 | 0%→0% | -2.1m→-800k | 462k→1.1m | National | 0 |
| regional | aggressive | 12→25 | 0%→84% | -1.4m→3.3m | 1.1m→6.6m | National | 10 |
| regional | balanced | 12→25 | 100%→96% | 3.9m→9.8m | 6.1m→6.5m | National | 8 |
| regional | conservative | 12→25 | 92%→100% | 1.0m→2.3m | 2.0m→2.4m | National | 8 |
| regional | prospects | 12→8 | 100%→100% | 1.2m→2.1m | 3.1m→3.6m | National | 9 |
| regional | superstar | 12→8 | 25%→13% | -1.1m→-603k | 1.0m→2.0m | National | 6.5 |

### Before → after, 10 years (Balanced and Aggressive were the ones that collapsed)
| scenario | strategy | n before→after | survive before→after | cash med before→after | rev/yr med | tier after | roster after |
|---|---|---|---|---|---|---|---|
| champion | aggressive | 6→4 | 17%→75% | -2.1m→17.6m | 808k→9.3m | National | 10 |
| champion | balanced | 6→4 | 33%→75% | -2.0m→7.1m | 599k→5.1m | National | 8 |
| champion | conservative | –→4 | –→100% | –→4.6m | –→1.8m | National | 5 |
| groundUp | aggressive | 6→4 | 0%→75% | -1.9m→1.3m | 986k→1.8m | Regional | 7 |
| groundUp | balanced | 6→4 | 83%→100% | 3.0m→5.4m | 3.8m→3.8m | National | 8 |
| groundUp | conservative | –→4 | –→100% | –→4.3m | –→1.5m | Regional | 5 |
| national | aggressive | 6→4 | 100%→100% | 23.6m→68.0m | 22.0m→27.0m | Intl | 10 |
| national | balanced | 6→4 | 100%→100% | 9.3m→59.5m | 10.2m→16.6m | Intl | 8 |
| national | conservative | –→4 | –→100% | –→4.9m | –→2.9m | National | 5 |
| regional | aggressive | 6→4 | 0%→25% | -2.5m→-2.1m | 627k→1.5m | National | 0 |
| regional | balanced | 6→4 | 100%→100% | 4.3m→20.2m | 5.8m→7.5m | National | 8 |
| regional | conservative | –→4 | –→100% | –→1.2m | –→1.7m | National | 5 |

### Full after-tables (all requested columns, 3 and 5 years)
```

### Horizon 3 years
scenario | strategy | n | survive | bankrupt | tier | cash med | rev/yr med | evt profit med | evt loss med | worst | best | roster | payroll/yr | shows/yr | fill | att | bcast/yr | spons evt/yr | spons stand/yr | ppv/yr
champion | aggressive | 25 | 92% | 8% | Regional | 1.29m | 3.13m | 99k | -43k | -278k | 527k | 10 | 1.59m | 8.0 | 100% | 3500 | 128k | 138k | 56k | 0k
champion | balanced | 25 | 84% | 16% | Regional | 1.79m | 2.82m | 79k | -24k | -164k | 502k | 8 | 1.45m | 8.7 | 88% | 1907 | 127k | 123k | 57k | 0k
champion | conservative | 25 | 92% | 8% | Regional | 2.64m | 2.22m | 171k | -8k | -63k | 277k | 5 | 569k | 7.3 | 100% | 4200 | 55k | 97k | 58k | 0k
champion | prospects | 8 | 88% | 13% | National | 4.35m | 3.69m | 136k | -24k | -68k | 264k | 9 | 941k | 14.0 | 100% | 4192 | 97k | 166k | 105k | 0k
champion | superstar | 8 | 88% | 13% | Regional | 2.86m | 2.28m | 177k | – | 0k | 279k | 5 | 497k | 7.3 | 100% | 3883 | 59k | 103k | 56k | 0k
groundUp | aggressive | 25 | 100% | 0% | Local(max Regional) | 1.54m | 1.28m | 83k | -12k | -22k | 201k | 5 | 323k | 7.0 | 90% | 2404 | 43k | 54k | 30k | 0k
groundUp | balanced | 25 | 92% | 8% | Local(max Regional) | 989k | 1.70m | 57k | -13k | -67k | 285k | 8 | 852k | 7.7 | 79% | 1400 | 55k | 73k | 29k | 0k
groundUp | conservative | 25 | 100% | 0% | Local(max Regional) | 1.58m | 1.33m | 97k | -11k | -21k | 242k | 5 | 323k | 7.3 | 93% | 2571 | 44k | 57k | 32k | 0k
groundUp | prospects | 8 | 100% | 0% | Regional | 3.37m | 2.68m | 72k | -4k | -32k | 273k | 9 | 669k | 13.8 | 100% | 2500 | 83k | 123k | 51k | 0k
groundUp | superstar | 8 | 100% | 0% | Local(max Regional) | 1.47m | 1.21m | 83k | -5k | -8k | 208k | 5 | 292k | 6.8 | 98% | 2316 | 43k | 54k | 26k | 0k
national | aggressive | 25 | 96% | 4% | National | 14.80m | 26.06m | 307k | -228k | -2.37m | 4.50m | 20 | 11.08m | 11.0 | 79% | 14854 | 0k | 1.80m | 1.05m | 6.01m
national | balanced | 25 | 100% | 0% | Intl | 20.02m | 14.28m | 463k | -240k | -749k | 1.28m | 20 | 5.42m | 12.0 | 84% | 9442 | 653k | 1.14m | 1.09m | 0k
national | conservative | 25 | 100% | 0% | National | 5.35m | 3.08m | 228k | -102k | -230k | 310k | 21 | 1.58m | 7.3 | 100% | 4800 | 53k | 203k | 572k | 0k
national | prospects | 8 | 100% | 0% | National | 6.58m | 5.13m | 172k | -80k | -246k | 284k | 19.5 | 2.60m | 14.0 | 100% | 4800 | 102k | 372k | 598k | 0k
national | superstar | 8 | 0% | 100% | National | -1.10m | 1.44m | -295k | -422k | -1.22m | 298k | 8 | 1.82m | 2.0 | 43% | 6372 | 0k | 72k | 499k | 79k
regional | aggressive | 25 | 96% | 4% | National | 1.63m | 4.36m | 80k | -79k | -568k | 1.76m | 10 | 2.18m | 8.7 | 86% | 3840 | 61k | 220k | 227k | 349k
regional | balanced | 25 | 96% | 4% | National | 6.23m | 5.96m | 150k | -38k | -288k | 1.10m | 10 | 2.46m | 11.7 | 80% | 3118 | 298k | 315k | 256k | 0k
regional | conservative | 25 | 100% | 0% | National | 2.53m | 2.19m | 149k | -38k | -83k | 287k | 10 | 783k | 7.3 | 90% | 3975 | 48k | 108k | 234k | 0k
regional | prospects | 8 | 100% | 0% | National | 3.68m | 4.25m | 123k | -26k | -159k | 254k | 9.5 | 1.74m | 14.2 | 100% | 4660 | 97k | 225k | 366k | 0k
regional | superstar | 8 | 100% | 0% | National | 1.68m | 2.20m | 143k | -412k | -659k | 279k | 9.5 | 800k | 6.8 | 88% | 4096 | 36k | 111k | 227k | 1k

### Horizon 5 years
scenario | strategy | n | survive | bankrupt | tier | cash med | rev/yr med | evt profit med | evt loss med | worst | best | roster | payroll/yr | shows/yr | fill | att | bcast/yr | spons evt/yr | spons stand/yr | ppv/yr
champion | aggressive | 25 | 72% | 28% | National | 802k | 3.77m | 97k | -70k | -583k | 2.87m | 10 | 2.12m | 8.2 | 99% | 3500 | 103k | 181k | 84k | 167k
champion | balanced | 25 | 80% | 20% | National | 3.24m | 3.39m | 80k | -28k | -293k | 885k | 8 | 1.75m | 9.0 | 91% | 1906 | 152k | 151k | 75k | 0k
champion | conservative | 25 | 92% | 8% | Regional(max National) | 3.26m | 2.08m | 146k | -10k | -70k | 277k | 5 | 594k | 7.2 | 100% | 4123 | 53k | 93k | 68k | 0k
champion | prospects | 8 | 88% | 13% | National | 4.68m | 3.92m | 115k | -46k | -182k | 264k | 9 | 1.46m | 14.2 | 100% | 4200 | 100k | 186k | 179k | 0k
champion | superstar | 8 | 88% | 13% | Regional(max National) | 3.12m | 1.99m | 141k | -16k | -31k | 279k | 5 | 462k | 6.9 | 100% | 3508 | 49k | 91k | 66k | 0k
groundUp | aggressive | 25 | 96% | 4% | Regional | 1.60m | 1.79m | 72k | -27k | -235k | 383k | 10 | 782k | 7.2 | 91% | 2568 | 62k | 84k | 39k | 0k
groundUp | balanced | 25 | 88% | 12% | Regional | 1.45m | 2.26m | 62k | -22k | -141k | 449k | 8 | 1.19m | 8.8 | 82% | 1400 | 68k | 101k | 42k | 0k
groundUp | conservative | 25 | 100% | 0% | Regional | 1.97m | 1.39m | 89k | -12k | -39k | 242k | 5 | 395k | 7.2 | 93% | 2661 | 44k | 60k | 40k | 0k
groundUp | prospects | 8 | 100% | 0% | National(max National) | 4.80m | 3.41m | 102k | -22k | -78k | 273k | 9 | 1.07m | 14.0 | 100% | 3499 | 92k | 173k | 77k | 0k
groundUp | superstar | 8 | 88% | 13% | Regional | 2.62m | 1.39m | 89k | -2k | -8k | 253k | 5 | 367k | 6.9 | 100% | 2563 | 44k | 64k | 37k | 0k
national | aggressive | 25 | 92% | 8% | Intl | 32.38m | 27.98m | 454k | -236k | -2.96m | 5.87m | 16 | 11.37m | 11.0 | 84% | 14990 | 0k | 2.10m | 1.77m | 6.78m
national | balanced | 25 | 100% | 0% | Intl | 35.63m | 16.48m | 523k | -196k | -1.33m | 1.59m | 15 | 6.32m | 12.2 | 90% | 9695 | 735k | 1.43m | 1.62m | 0k
national | conservative | 25 | 100% | 0% | National | 4.70m | 3.11m | 178k | -51k | -230k | 310k | 16 | 1.91m | 7.2 | 100% | 4800 | 55k | 217k | 558k | 0k
national | prospects | 8 | 100% | 0% | National | 3.98m | 5.06m | 121k | -75k | -246k | 284k | 15 | 3.45m | 13.1 | 100% | 4800 | 106k | 405k | 582k | 0k
national | superstar | 8 | 0% | 100% | National | -800k | 1.05m | -295k | -422k | -1.22m | 298k | 0 | 1.09m | 1.2 | 43% | 6372 | 0k | 43k | 487k | 47k
regional | aggressive | 25 | 84% | 16% | National | 3.29m | 6.63m | 88k | -103k | -1.09m | 2.89m | 10 | 2.61m | 8.0 | 88% | 4200 | 36k | 334k | 260k | 1.24m
regional | balanced | 25 | 96% | 4% | National | 9.79m | 6.50m | 158k | -53k | -850k | 1.20m | 8 | 2.87m | 11.0 | 86% | 3160 | 403k | 388k | 294k | 0k
regional | conservative | 25 | 100% | 0% | National | 2.27m | 2.39m | 122k | -30k | -86k | 287k | 8 | 1.12m | 7.4 | 100% | 4200 | 49k | 120k | 272k | 0k
regional | prospects | 8 | 100% | 0% | National | 2.06m | 3.56m | 87k | -41k | -159k | 254k | 9 | 2.13m | 11.0 | 100% | 4800 | 82k | 201k | 370k | 0k
regional | superstar | 8 | 13% | 88% | National | -603k | 1.97m | 116k | -233k | -739k | 279k | 6.5 | 950k | 5.2 | 84% | 4187 | 22k | 100k | 236k | 61k
```
(`evt profit/loss med` = median profitable / loss-making show; `worst`/`best` = largest single loss/profit; `spons stand/yr` = standing sponsors, `spons evt/yr` = per-event sponsors.)

### Tier progression before 4.6.1 (Balanced promoter, median years to reach; superseded by §10.1)
| Scenario | Local→Regional | Regional→National | National→International |
|---|---|---|---|
| From the Ground Up | 3.3 | 7.8 | 16.1 (20-year world) |
| Regional Promoter | start | 1.7 | 7.7 (1 of 4 within 10 years) |
| Build a Champion | 0.8 | 4.4 | 12.3 (20-year world) |
| National Powerhouse | – | start | 2.9 |
Global was not reached within 20 years in any world (intended: it is the end game).

### 20-year worlds (Balanced, 1 seed per scenario)
Ground Up: International at year 16, £21.5m cash. Regional: National, £49.8m. Champion: International at year 12, £16.1m. National Powerhouse: International in year 3, £127m. No world went insolvent; none collapsed or stalled.

## 7. Reading the results against the goals
- **Conservative is the safest.** 92–100% survival at 5 years, 100% at 10 years in every scenario — but it also grows slowest (ends at Regional/National with £1–5m).
- **Balanced is viable.** 80–100% at 5 years and 75–100% at 10; reaches National in 4–8 years from a local start.
- **Aggressive is viable but riskier**: 72–96% at 5 years, 25–100% at 10 (Regional start 25%): higher ceilings (£17–68m at 10 years) and the biggest single losses (down to −£3m).
- **Bad decisions still bite.** Superstar-betting from a Regional or National start is 13–0% survival; every strategy still sees losing shows (median loss £10–250k, worst −£3m).
- **Bankruptcy is caused by sustained decisions**, not scaling: failures are star bets before the tier can use them, staying small while paying a developed roster, or failing to recover after a dip.
- **Money is not created**: `economy46c.test.ts` replays two years of a balanced promoter with sponsors and checks `cash = archive + Σ ledger` every 26 weeks; sponsor income equals its ledger lines.

## 8. Remaining economic concerns (honest)
1. **National Powerhouse runs away.** Balanced is £36m at 5 years, £60–127m at 10–20 years with no money sink (revenue £15–28m a year against 20–25% margins). It is the "Easy" career, and decisions still matter (Conservative ends at £5m), but past National the game needs sinks (staff, facilities, titles, taxes) — a Phase 5+ job. Tier overhead scaling slows but does not stop it.
2. **Regional Promoter reaches National in under two years.** Its starting reputation (24) is already close to the National bar (30). Probably fine for "Normal", but the Regional→National step is short in that career.
3. **Aggressive from a Regional start is a coin-flip over 10 years (25%).** Intended to be risky; worth watching in human playtests.
4. **Audit promoters are scripted.** They now use forecast-driven pricing, purse affordability, tier-aware bets and a cash-scare downshift; they do not release surplus fighters or negotiate. Humans can do better (and worse). All Before numbers used the older promoters, so part of the improvement is the promoters getting smarter; the engine changes account for tier gating, overhead scaling, the champion's contract and sponsors.
5. **Seeds are limited at long horizons** (4 at 10 years, 1 at 20), because a 10-year world takes minutes. Treat the 10- and 20-year columns as indicative.
6. **Tier requirements are judgement calls** calibrated from these runs, not from human play.

## 9. How to reproduce
```
scripts/audit/runmatrix.sh <repo> <outdir> <years> "<scenarios>" "<strategies>" "<seeds>" <parallel>
node scripts/audit/matrix.mjs <outdir> 3,5,10      # survival, cash, revenue, event profit/loss, tier, roster, payroll, sponsors…
node scripts/audit/diagnose.mjs <outdir> 5         # cash-flow decomposition
node scripts/audit/compare.mjs <before> <after> 5  # side-by-side
```


## 10. Phase 4.6.1 — final cleanup

### 10.1 Regional → National was too fast — retimed
**Problem.** The Regional Promoter reached National in ~1.7 years. **Evidence.** It starts at reputation 24 and gains ~5 a year; the old National bar (rep 30, 14 events, £1.0m revenue) was met in year 2 (`tiercal`, 4 worlds: median 2.0 years). Reputation was the only slow dimension.
**Change.** National now asks for more of what a promotion *builds* rather than cash: reputation 30→**42**, fanbase 40k→**120k**, completed events 14→**30**, lifetime revenue £1.0m→**£3.5m**, biggest crowd 2,000→**4,000** (quality and scale of shows), established fighters 2 rated 38+→**3 rated 42+**; financial health still "not in trouble", no cash requirement. To keep the ladder coherent International (rep 52→58, 350k→450k fans, 35→50 events, £9m→£14m, 4 fighters 52+→55+) and Global (rep 72→78, 1.5m→2m fans, 70→90 events, £45m→£55m, 7 fighters 62+→65+) were raised in step; every dimension still rises with every step.
**Result (25 worlds each).**

| Scenario | Strategy | Worlds | Horizon | Survive | Years to National (median, reached) | Years to International | Median cash | Median revenue/yr | Shows/yr | Median tier |
|---|---|---|---|---|---|---|---|---|---|---|
| groundUp | aggressive | 25 | 8y | 92% | — | — | 1.8m | 2.6m | 7.9 | Regional |
| groundUp | balanced | 25 | 8y | 88% | — | — | 2.9m | 2.9m | 9.1 | Regional |
| regional | aggressive | 25 | 8y | 100% | 4.8 (25/25) | — | 11.5m | 8.1m | 8.6 | National |
| regional | balanced | 25 | 8y | 92% | 4.4 (21/25) | — | 16.2m | 5.8m | 10.4 | National |
| national | aggressive | 25 | 6y | 92% | start | 4.5 (15/25) | 40.0m | 28.9m | 11.0 | International |
| national | balanced | 25 | 6y | 100% | start | 4.1 (19/25) | 44.2m | 17.6m | 12.3 | International |

- **Regional Promoter → National: median 4.4 (Balanced, 21/25 reached within 8 years) and 4.8 years (Aggressive, 25/25)** — inside the 3–5+ (strong) / 4–8 (average) target; weaker worlds take longer or have not arrived by year 8.
- **From the Ground Up:** Regional at ~3.6 years (as before); National not reached within 8 years in any world — roughly 3.6 + ~4.5 ≈ 8–9 years in total for a good run. Slow, not grindy: every year a promotion is Regional it still grows (Balanced 88%/Aggressive 92% survive, £1.8–2.9m cash).
- **National Powerhouse is not penalised:** it still starts National with the same cash/roster/venues, survives 92–100%, and keeps its £40–44m six-year cash. Only its *next* step moved: International now takes ~4.1–4.5 years (was 2.9).
- Regional-start survival: Balanced 92%, Aggressive 100% at 8 years (they were 96%/84% at 5 years with the old bar — the later step does not hurt solvency).

### 10.2 National Powerhouse money — checked for bugs, documented as a design opportunity
The very large balances (£40m+ after 6 years) are **not** caused by duplicated or invisible money. `moneyIntegrity.test.ts` runs two years of a busy National Powerhouse (balanced promoter, arenas, broadcast, per-event and standing sponsors) and proves: cash = starting funds + every ledger line ever posted; ledger ids are never reused or re-posted; each show's ledger revenue equals the revenue the show reports; each sponsor pays each show once and each quarter once, and the sponsor book's "earned" equals its ledger lines. (Building the test, one apparent mismatch of exactly the £18k broadcast production bill turned out to be a cost line filed under the broadcast category — the test now separates costs from revenue.)
It is simply a profitable business with few sinks: 12 arena-scale shows a year at a median £460–520k profit, 20–25% margins, and nothing yet to spend on. **Known future design opportunity** (not tuned here, deliberately): elite-fighter contracts, staff, facilities, international expansion, major marketing, broadcast relationships, larger productions, sanctioning costs, stadium events and other high-tier expenses should absorb it. Conservative play from the same start ends near £5m, so decisions still matter.

### 10.3 Final tier sanity check (all five tiers)
Tests added (`phase46c.test.ts › tier ladder sanity`): every requirement dimension rises with every step; the biggest crowd each tier asks for fits a venue the previous tier may already book (no circular dependency); a single monster night (20,000 crowd, £50m revenue) cannot promote a promotion that lacks events or reputation; the Regional Promoter starts short of National on events, revenue, crowd and reputation; National Powerhouse stays National for 60 weeks with no tier change; promotion needs four consecutive qualifying weeks; demotion needs a full year below the retention floor (70% of the tier's reputation and 50% of its fans); tier and progress survive save/load and old saves migrate. Each tier unlocks something real: Local (≤3,500 seats), Regional (≤6,000 seats, national TV and streaming, 18 fighters, 2 sponsors), National (arenas to 20,000, PPV, 28 fighters, 3 sponsors), International (40 fighters, 4 sponsors, elite fighters), Global (stadiums, 60 fighters, 5 sponsors).

### 10.4 Performance guard
**Problem.** `longrun` asserted ≤ 60 ms/week wall time and `perf` ≤ 40 ms; both failed intermittently when the whole suite ran in parallel (62 ms), and would also fail on a slower machine without any regression.
**Fix.** The guards now measure *relative* cost: each timed segment (a quarter for `perf`, a year for `longrun`) is divided by the cost of a fixed reference workload (cloning a fixed world) measured immediately before and after it on the same host, and the median over segments is compared with a limit (`benchTime.ts`). Limits sit ~40% above what the code does today (week tick ≈ 6.9–7.2× the reference, limit 10; eight-year world ≈ 12.3–12.7×, limit 17.5), so a genuine slowdown of that size fails while host load does not. The full suite passed twice in a row under default parallelism. (Not "a bigger threshold": the old limits were wall-clock numbers; these are ratios.)
**Observation (unchanged from before this phase).** A week tick costs ~27 ms in year 1 and ~55–75 ms by year 8 on this host (state grows with history) — identical to the Phase 4.7 commit (26/36/51/62 vs 27/34/46/61 ms by year). Worth a look before Phase 5 adds more per-week work.


## 11. Phase 5.3 — economy after popularity cooling (decision: healthy, no changes)
Phase 5.2 removed a popularity ratchet (fame above `0.95 × reputation + 4` cools). This audit asked whether the leaner world is still a
working economy. Method: matched seeds, code before (`10ea37a`) versus after (`0050897`), same bots (`scripts/audit`, `runWorld`).

**Dependency chain.** Popularity → `fightAppeal` (0.68 × (0.7 hi + 0.3 lo) + 0.32 × reputation) → `cardQuality` → `eventInterest` →
ticket demand `65 × (interest/10)^2.3` (and the reference ticket price, TV fee, viewers `(interest/40)^1.1`, PPV buys, per-event sponsor eligibility).
The 2.3 exponent is why a ~20% lower headliner popularity is a ~⅓ revenue fall on star-heavy shows. The same popularity also prices the fighter
(purse), so cost falls with revenue.

**AI promotions (6 seeds × 7 scenario/strategy worlds, 10 years; 3 idle 20-year worlds each).**
Shows per year unchanged (≈ 40–48), cancellations 0 in both, empty shows (< 40% full) 2–6% in both, median attendance 3,342 → 3,324 (year 10),
median ticket revenue −11%, median cost −16%, **median profit £121k → £122k**, loss-making shows 21% → 21%, AI cash median £3.4m → £3.4m,
insolvent AI promotions 3 → 5 of 252 promotion-years at year 10 (critical 9 → 8). The large fall is star pay-per-view (arena average £1.19m → £0.51m), which is also where
the inflated fame paid most. Divisions: the smallest division holds 1–8 fighters in both versions (unchanged).

**Player (16 worlds each for Ground Up balanced/aggressive and Build a Champion; 6 each for Regional and National; 8–10 years).**
Survival within one world of the old figure everywhere (Ground Up balanced 81% → 75%, aggressive 88% → 81%, Champion 81% → 75%; 100% → 100% for Regional and National), median
event profit −2% to −8% for the small promotions and unchanged for the rest, revenue −5% to −15% at the lowest tiers. 20-year worlds (2 seeds × 3 scenarios): survival 100% both,
final cash Ground Up £14.6m → £16.4m, Regional £21.9m → £29.8m, National £98m → £109m. The 6-seed dip seen first (Ground Up balanced 67% → 50%) did not persist once the sample grew.

**Star economy (fixed popularity/reputation inputs, so identical before and after).** Superstar (pop 92 / rep 84) stadium card: 82% full, £4.2m gate; its £3.8m main-event
purses make it loss-making at the median unless it goes pay-per-view (median −£0.6m, 90th percentile +£1.9m) — the designed high-risk bet. Champion (72/68) at arena level: ≈ break-even
(−£49k TV, +£128k PPV median), 100% full. Contender (50/50) at national level: +£260–300k and 78–100% full. The old inflated fame made a champion *less* profitable (pop 88: −£435k), because the purse rose faster than demand.

**Not changed, and why.** Nothing in the economy: lower numbers than before reflect the removal of inflated fame, not a malfunction. Known and unchanged: a National Powerhouse career ends with £100m+ and few sinks (§8.1),
and superstar-vs-superstar cards need pay-per-view to pay.
