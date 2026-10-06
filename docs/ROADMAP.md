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

## Phase 3 — Fights ⬜
Matchmaking, opponent selection + negotiation, round-by-round simulation (styles, stamina, damage, knockdowns,
scorecards, stoppages), records, statistics, post-fight progression. Flip `FEATURES.fightsImplemented`.

## Phase 4 — Events ⬜
Event builder, fight cards, venue booking, ticket pricing, attendance, event finances/results.

## Phase 5 — Business ⬜
Revenue streams, sponsors, PPV/TV, reputation + fanbase growth, bankruptcy/game-over rules.

## Phase 6 — Boxing World ⬜
Rankings, titles/champions, sanctioning, full AI promoters (matchmaking, events, bidding), world simulation.

## Phase 7 — Depth ⬜
Injuries, rivalries, media, random events, scandals, suspensions, career arcs, legends.

## Phase 8 — Polish ⬜
Animation, sound, richer charts, fight/event presentation, tutorial/onboarding, performance, mobile pass.
