# Desktop UX phase 3 — visual refinement

Presentation only (CSS, JSX layout and one new view-only column type); no engine, store, persistence, economy or simulation file changed. References: the two sets of attached mock-ups (used as direction, not copied: no placeholder data, no features that do not exist). Screenshots: `docs/ux-phase3/before-*` (the end of phase 2) and `after-*` (1280, 1024, 390; same careers as before).

## What changed and why
**Event workspace.** Fight-card rows are rebuilt as a clear hierarchy: a left label column (slot + status), one-line fighter names with portraits at each side and a red "vs" between them, the record/division/rounds line centred under them, and the order controls (up, down, Make main, Make co-main, Remove) on their own aligned row so they can never collide with fighter information. The main event is larger, co-main next, undercard smaller. At 1024 the label column narrows and names step down a size instead of wrapping. The profit/loss tile no longer breaks mid-range at 1024. The sticky bar, tab strip, forecast column and disclosure controls from phase 2 are unchanged.
**Matchmaking.** Age moved under the record and KO risk under the win chance, so the opponents table (10 columns instead of 12) fits at 1280 with the actions visible and no horizontal scroll; the fighter picker, search, filters, best-fit and unavailable explanations are kept. Rows are about 8 px taller because of the extra line, which is why the page is longer than at the end of phase 2: the trade was sideways scrolling for a little vertical height.
**Scouting.** Division chips and action buttons are tighter and the market table now fits at 1280 (its Status and Typical ask columns were previously off-screen). The Free agents / Under contract / Everyone control and the Intel/"~" legend are unchanged.
**Overview.** A Recent results panel (the last three results from the existing fights view) joins the right rail; the roster panel is counts only (the top-fighter card is hidden on desktop); the Needs-you action buttons have a minimum width so decisions read as buttons. Phones are unchanged (the results panel is desktop-only).
**Roster.** New view-only columns: Form (last results as in the profile) and Condition (availability, with the contract's stage or weeks left); Reputation (also on the profile) and the always-"Your roster" Status column were dropped from the roster tabs. At 1024 the Style column is hidden so Rank is no longer pushed off-screen. All filters, tabs and actions remain.
**Fighter profile.** At ≤ 1100 px the header actions stay on one row and the four headline facts sit in one band instead of two stacked pairs.
**Inbox.** With nothing selected the right pane is now a decision desk: how many decisions are waiting and the first four, each with an Open button (opening reads the message exactly as selecting it does). Decision rows are tinted and carry a bordered "decision needed" tag; the topic row is styled as a filter row rather than a second set of tabs; the "still waiting" notice in a message is a bordered callout. Phones keep the plain "Select a message" hint.
**Fight Night.** Reviewed at 1280/1024/390; no change was needed (the large "Round N of M" text seen in one screenshot is the transient round-start card, not a layout fault).

## Scrolling (page height in viewports, phase 2 end → now)
| screen | 1280 | 1024 | 390 |
|---|---|---|---|
| overview | 3.78 → 3.78 | 3.85 → 3.85 | 7.4 → 7.4 |
| roster | 1.58 → 1.6 | 1.57 → 1.58 | 3.72 → 3.78 |
| fighter | 2.5 → 2.5 | 2.9 → 2.76 | 14.41 → 14.41 |
| inbox | 1.09 → 1.07 | 1.02 → 1.29 | 1.23 → 1.23 |
| matchmaking | 2.87 → 3.29 | 2.89 → 3.33 | 10.49 → 10.07 |
| scouting | 3.9 → 3.64 | 3.9 → 3.65 | 15.65 → 14.93 |
| event-card | 2.48 → 2.36 | 2.52 → 2.49 | 8.39 → 8.27 |

## Verification actually run
* `npx tsc --noEmit` clean; `npx vitest run`: 55 files passed, 2 skipped; 827 tests passed, 5 skipped, 0 failed.
* `scripts/browser/ux2-checks.mjs`: 75 passed, 0 failed (event bar and actions, forecast disclosure, tab memory, matchmaking picker/best fit/unavailable reasons/compare/Approach, scouting scope and "~", overview first viewport, icon-rail tooltips, 390 regressions).
* Existing browser suites on this build, all 0 failures: phase7-ui 150, phase9-ui 89, phase10-ui 100, phase60-a11y 174, phase510-ui 82, phase410 30, phase59-ui 28, phase60-ui 37, phase63-ui 45, phase64-ui 71, phase5 47, phase47 71, phase46c 57, phase48, phase54-business 221, -championship 173, -negotiation 113, -venues 116, -walkthrough 82, phase54b 43, phase54c 69, phase54d 27, phase56 33, phase58 69; the regional walkthrough completes at 1280 and 390. `phase49b.mjs` is not in this list: it is the documented baseline timeout at its replay-speed step and was not re-run.
* Screens inspected by eye at 1280, 1024 and 390 after the final build (Overview, Roster, Fighter, Inbox, Matchmaking, Scouting, all three event tabs, Fight Night).

## Remaining limitations
Overview is still ~3.8 screens; Matchmaking rows are taller than before; at 1024 the roster hides Style and the market/matchmaking tables still scroll sideways (actions stay pinned); the event hero's tale-of-the-tape block is large; the fighter-profile Overview tab still opens with text sections (the mock-up's attribute bars are deliberately not reproduced: they would expose hidden attributes); no new imagery (arena photos, richer portraits) was added because the game has no such assets.
