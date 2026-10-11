# Phase 8 — Beta readiness & complete-career QA

**Recommendation: READY WITH KNOWN LIMITATIONS.** No critical defect is open. One high-severity defect (a refresh lost every decision made since time last advanced) was found and fixed; the known limitations are economic/usability, not progress-losing.

## Journeys exercised (real UI, no state injection — `scripts/browser/phase8-walkthrough.mjs`, 1280 / 1024 / 390)
Fresh title screen → new career → guided onboarding → finances & roster → scout (report commissioned) → week advance → sign a free agent through the negotiation screen → approach an opponent, negotiate and agree three fights → plan a show (venue, date) → build the card → put on sale → **reload (Continue)** → advance to fight week → ring the bell, run every bout, scorecards, fight page, settle → rival offer arrives → counter → rival agrees → external fight booked on the rival's card → **reload with the booking pending** → advance until it is completed on the rival's card → Rankings / Titles / Finances / News / Inbox → three more show cycles (the third stops because the default-terms promoter is out of cash — see limitations). Run on `groundUp` at all three widths and on `regional` at 1280 and 390: **0 critical/high findings in every run**, no console/page errors.

## Defects found
| # | Sev | Defect | Status |
|---|---|---|---|
| 1 | **High** | A browser refresh restored the save from the last *time advance*: a signing, agreed fights, a booked show and "put on sale" done since were silently lost (autosave only ran when the calendar advanced). | **Fixed** — debounced autosave after any change to the career (1 s), flushed on `pagehide`/tab hide; test fails without the fix |
| 2 | Medium | "Plan a show" preselected a regional venue abroad (Korakuen Hall, Tokyo) for a UK startup: forecast loss £52k before a ticket was sold. | **Fixed** — `suggestedVenue`: smallest open hall in the promotion's own country |
| 3 | Medium | Guide's card step claimed "you have no agreed fight to add" while three agreed fights were already on the card. | **Fixed** + test |
| 4 | Medium | Phone: the planner's six venue filters filled the first screen before any venue; matchmaking listed 60 opponents (a 17,600 px page). | **Fixed** — filters fold on phones (open on wide screens); matchmaking shows 20, "Show more" |
| 5 | Medium | A first-time player was preselected on the *Hard* career: reference bot insolvent in 2 of 8 seeds after 4 years (Regional 0/8, National 0/8, Champion 4/8); a human accepting default fight terms is bankrupt in two shows. | **Mitigated** — title screen preselects Regional Promoter (Normal); every career still one click away. No economy rule changed. |
| 6 | Medium | Guide button on a long phone page (event page is ~7,000 px) navigated to the page but not to the control. | **Fixed** — "Show me the button" scrolls/focuses the marked control |
| 7 | Low | "back in 1 weeks". | **Fixed** |
| 8 | Low (infra) | `fiveyear.test.ts` asserts wall-clock ms/week but ran in the parallel project, so it failed once under suite load (63.6 vs 60). | **Fixed** — moved to the sequential timing project; threshold unchanged |
| — | — | Reload "divergence" reported by the new audit on every seed. | **Not a defect** — my comparison used JSON key order; with order-insensitive equality a reloaded career and the original are identical for a further year on all seeds |

Regression tests: `src/engine/phase8.test.ts` (13 tests: venue default, guide blocker, save→load determinism through a whole show + 10 weeks, settlement not repeated after two reloads, v12→v13 mid-career migration equivalence, external booking survives reloads once, autosave of a decision with no time advance, garbage/truncated/newer/partial saves refused or rebuilt, import of a bad file leaves the career untouched, default-career guard). The venue-default, guide-blocker and autosave tests were verified to fail without their fixes.

## Save / load / migration
v12→v13 (guide off) and a v9 save missing whole later-phase records both load and keep simulating; a mid-career v12 save simulates exactly like the same career saved as v13. Reload during: guided onboarding (progress identical), pending rival offer, an on-sale show, a pending external booking — summary of version, date, cash, ledger length and sum, events, fights, inbox, guide state and open offers identical before/after in the browser. No duplicated fight, settlement, ledger line or championship change after repeated reloads (unit-tested, and checked by the audit: `cash == archive + Σ ledger`).

## Long-career integrity (`scripts/audit/phase8-beta.ts`, balanced reference bot, 8 years)
15 careers: groundUp ×6, regional ×3, national ×3 (+ integrity audit 3 seeds × 6 y, bot and passive). **0 problems.** Checked every 13 weeks: ledger == cash and no id reuse, finite amounts, no fighter in two live fights, no fight on two cards, no stale `activeFightId`, no stuck injury, no mandatory order > 150 days overdue, no retired champion, no overlapping reigns, every rival with a roster still stages shows, population 303–340 (start ≈ 320), plus save→load at year 3 and a further year on both copies. Guided and unguided worlds are identical (unit test). Results in `scripts/audit/results/phase8-*.txt`.

Findings: three of the six groundUp bot careers end insolvent for years (see limitations); bot peak idle 98–210 weeks for the longest-idle signed fighter (bot behaviour, not a lock).

## Performance
Tick, no player activity: 37→63 ms/week over 8 years (×1.2–3.7); state grows ≈ 0.4 MB/year (fights/events are kept: 222→1,868 fights in 8 years; save 1.2→4.6 MB JSON). Relative gate (week tick ÷ clone of the starting world, limit 10×): interleaved on this host, the Phase 6.5 commit read 9.1–10.8× (mean 9.7) and the current tree 8.5–10.8× (mean 10.05) — no regression (Phase 7/8 touch no simulation code), but the host is noisier than during Phase 6.5 (7.5–8.5×) and the gate now fails intermittently *on both*. Profile is flat (clone 15 %, GC 9.5 %).

## Tests
Unit: **773 passed, 5 skipped, 0 failed (778)**, `tsc` clean, production build OK. Browser (all against the final build): phase7-ui 150, phase60-ui 39, phase60-a11y 174, phase59-ui 28, phase58-signing 69, phase56-bridge 33, phase54d 27, phase54c-office 69, phase54b-world 43, phase510-ui 82, phase63-ui 45, phase64-ui 71, phase54-walkthrough 82, phase54-negotiation 113, phase54-venues 116, phase5 47, phase410 30, phase47 71 checks, phase46c 57 checks, phase54-business 221, phase54-championship 173 — 0 failures. Assertions touched (fixture/behaviour drift, not weakened): `phase47.mjs` default career is now Regional; `phase54-venues.mjs` opens the folded filters on a phone first (and now asserts they are reachable).

## Screenshots inspected
`docs/phase8-shots/`: desk with guide (1280), plan-a-show modal showing the suggested hall (390), booked show (1024), fight week with "Show me the button" (390), result + scorecards (390 and 1280), offer card (390), titles screen (1280), finances in insolvency with the bridge-loan way back (1280). Also viewed: negotiation, fight deal, matchmaking, offers, event page at 390; titles/finances/desk late-game.

## Known limitations (for testers)
1. **First-show economics:** accepting the default fight terms (mid-range purses, the "best fit" opponent) loses money even in a sold-out small hall (e.g. sold out 450/450: £16.8k gate vs £61k costs). Warnings exist (advice at "Put on sale", forecast, guide text updated), skilled play is profitable (reference bot). Consider guided purse targets in a later phase.
2. **Insolvency** never ends the game; recovery is a bridge loan (once per two years) or cutting costs — a bot career can sit overdrawn for years.
3. Several toasts stack over the page on a phone; inbox grows quickly (58 unread by week 10).
4. Fight/event history is never pruned: saves and ticks grow linearly (see Performance).
5. The perf gate has little headroom on this host.
6. Not covered end to end in the browser (covered by the engine audits/tests): eliminators and championship fights played through the UI in one session.

## Phase 9 update
Limitations 1 (first-show economics: now explained before commitment, rules unchanged), 3 (inbox/toasts), 4 (save growth: audited, stored compressed in the fallback, finished history shared in memory) and 5 (perf gate: repetition-based decision, ~13–29 % faster ticks) are addressed — see `docs/PHASE9.md`. Remaining: insolvency recovery is unchanged; championship flows are still verified by the engine audits and the championship browser suite rather than one UI session.
