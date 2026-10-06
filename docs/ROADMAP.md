# Fight Empire — Roadmap

Status key: ✅ built and tested · 🟡 partial · ⬜ not started

## Phase 1 — Foundation ✅
Architecture, typed GameState, seeded RNG, weekly calendar, seeded world (≈340 fighters, 6 rival promotions, 14 venues),
fighter model + generator, weekly tick (development, condition, ageing, retirement, talent intake, contract expiry,
rival roster management, finances), inbox/news, dashboard, fighters database + profiles, training focus, calendar,
finances, promotions, venues, multi-slot save/load/import/export.

**Known Phase 1 limits (by design):** no income yet, no way to sign/renew fighters, no fights — the promotion can only
run costs and develop its starting four fighters. Starting contracts are 3 years so nobody is stranded before Phase 2.

## Phase 2 — Scouting & Fighters ✅
Player-knowledge layer (priors → Bayesian scouting → ranges), scouts + costed reports (basic/standard/deep) and talent
searches, discovery, shortlist & compare, free-agent market with tags, personality-driven negotiation (accept / counter /
reject, patience, lockouts), rich contracts (retainer, purse, win/title bonus, PPV share, min fights, title promise
obligations), renewal stages, release with consequences, AI strategies and competitive bidding, market dynamics,
deeper fighter profiles, responsive tables, hidden-information leak audit, v1→v2 save migration.

**Known Phase 2 limits:** no fights, so purses/win bonuses/min-fight clauses and title promises are *recorded but not
yet enforced*; no income yet; one scout (staff management later); no buyouts of contracted fighters; rival finances are
abstract; fighters' public reputation/popularity only changes once fights exist (Phase 3).

## Phase 3 — Fights ✅
Matchmaking with belief-based risk/reward, fight negotiation (purse, win bonus, venue, rematch, 1–2 fights), Fight entity
+ strict lifecycle, camp/preparation, a round-by-round simulation (8 styles, damage, momentum, stamina, knockdowns,
KO/TKO/corner/injury stoppages, 3 judges, all decision types and draws), injuries & suspensions, records, reputation and
popularity, development and ring wear, knowledge from watching fights, purses through the ledger (no revenue stub),
news, AI promotions arranging and simulating fights, fight history on profiles, fight-night presentation.

**Known Phase 3 limits:** no events/cards/venue booking (a fight is one bout with a default venue), no gate/TV/PPV income
(every fight is a cost), no titles or official rankings (only public form/standing), no inbound fight offers from rivals,
no trainers/camp staff, rematch clauses are recorded but only influence price, two-fight deals are booked one at a time.

## Phase 4 — Events, Venues & Promotion Economics ✅
BoxingEvent entity with a strict lifecycle (planning → venue booked → card building → on sale → promoting → fight week →
live → completed → settled → archived, or cancelled); event builder (date, venue, card order, main/co-main, prices, marketing,
broadcast, sponsors, put on sale, cancel); 24 venues in five tiers; public-information demand model with ranged forecasts and a
SAFE / WATCH / HIGH RISK indicator; weekly ticket sales with a sales curve; four marketing levels × four strategies; basic
sponsors; none/local TV/national TV/streaming/PPV with PPV risk; one-time settlement through the ledger; event reputation,
atmosphere, popularity exposure by billing; show-night flow (run, quick-sim undercard, skip) with an EVENT COMPLETE summary;
AI promotions plan and run their own shows; financial health states; IndexedDB saves (gzip, slots, autosave, migration).

**Known Phase 4 limits:** no titles/rankings; sponsors are per-event offers (no relationships); broadcast is a single choice
with fixed terms (no negotiation); one venue per show, no touring; ticket prices are three tiers; rival promotions do not poach
your dates deliberately; AI owners top up rivals that run dry (counted in `accounting.bailouts`) and rich rivals accumulate cash.

## Phase 4.5 — Balance, AI behaviour & simulation integrity ✅
Dedicated audit of Phases 1–4 (no new player-facing systems). Scripted promoters (five strategies) and a multi-seed, 5/10/20-year
world runner (`src/engine/sim`, `scripts/audit`); multi-source hidden demand uncertainty and calibrated forecasts; rival promoters
with competence (poor→elite) and personality that change decisions; a rival financial life cycle (growing → … → insolvent →
rescue-or-collapse) with real consequences; an exponential purse curve; PPV/sponsor/broadcast/pricing/venue-size audits; difficulty
that changes the world; momentum in promotion reputation; retention policy for fight history; lazy-loaded screens.
See `docs/ECONOMY.md` and the Phase 4.5 section of `docs/BALANCE.md`.

## Phase 5 — Business ⬜
Sponsor relationships and contracts, TV/streaming deals, merchandise, staff and facilities, promotion tiers, bankruptcy rules.

## Phase 6 — Boxing World ⬜
Rankings, titles/champions, sanctioning, full AI promoters (matchmaking, events, bidding), world simulation.

## Phase 7 — Depth ⬜
Injuries, rivalries, media, random events, scandals, suspensions, career arcs, legends.

## Phase 8 — Polish ⬜
Animation, sound, richer charts, fight/event presentation, tutorial/onboarding, performance, mobile pass.
