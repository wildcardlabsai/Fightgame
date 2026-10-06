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
- **Change.** `TierDef.overheadMult`: Local ×1, Regional ×1.6, National ×3.5, International ×8, Global ×18. Higher tiers need much more money — and earn much more.

### P6 — Local halls cannot carry a multi-fight card (kept as designed)
- **Evidence (Before, all strategies, n=9,326 player shows).** Local venues (<1,500 seats): median profit £7k, **44% lose money**, purses 91% of revenue. Regional venues (1,500–5,000): median profit £114k, 8% loss, almost always sold out. National (5–14k): median £367k, 15% loss. Arena: median £249k, **37% lose money**, 81% fill.
- **Reading.** Local shows build reputation, fans and modest capital but cannot be the long-term money-maker (as intended); regional venues were the engine but were open from day one — a ground-up promotion booked a 4,800-seat hall in week 8. That skipped the "small local shows" stage entirely and made later tiers meaningless. Arenas are the genuinely risky step.

## 2. What was NOT changed
Purse curve, retainers, demand model, forecast noise, PPV/broadcast economics and AI behaviour are unchanged. The simulation evidence did not show them to be the bottleneck once promotion size limits what can be booked; no unexplained changes were made.

## 3. Promotion tiers

| Tier (id) | Roster cap | Biggest venue | Standing sponsors | Overhead × | Entry requirements |
|---|---|---|---|---|---|
| Local (`Startup`) | 10 | 3,500 seats | 1 | 1 | — |
| Regional | 18 | 6,000 | 2 | 1.6 | rep 14 · 6k fans · 5 events · £100k revenue · not in financial trouble |
| National | 28 | 20,000 (arenas) | 3 | 3.5 | rep 30 · 40k fans · 14 events · £1.0m revenue · 2,000 crowd · 2 fighters rated 38+ |
| International (`Major`) | 40 | 20,000 | 4 | 8 | rep 52 · 350k fans · 35 events · £9m revenue · 8,000 crowd · 4 fighters 52+ · healthy · £1.5m cash |
| Global | 60 | stadiums | 5 | 18 | rep 72 · 1.5m fans · 70 events · £45m revenue · 18,000 crowd · 7 fighters 62+ · healthy · £8m cash |

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

