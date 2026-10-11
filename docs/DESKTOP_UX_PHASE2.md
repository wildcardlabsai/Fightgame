# Desktop UX phase 2 — workflow and information hierarchy

Presentation only. No engine, store, persistence or economy code was changed (`git diff HEAD~3 --stat -- src/engine src/store` is empty). Screenshots: `docs/ux-phase2/before-*` and `after-*` (1280, 1024, 390; same careers: `p54-played` for Overview/Matchmaking/Scouting, `p7-ready` for the three event tabs).

## What changed and why
**Event workspace** (`EventPage.tsx`, `desktop.css`). A sticky event bar under the section tabs holds the event name, status, date and venue, risk and profit forecast, a one-line "Next" instruction and the primary action for the stage (Add a fight → Put on sale → Prices & marketing) plus Cancel. The three workspace tabs are sticky under it and show the card count; the selected tab is remembered per event (leave for Matchmaking and return to the same tab). The forecast column shows Attendance, Revenue, Costs and Profit/loss first; the short reason for a forecast loss stays visible; the rest of the explanation and the levers sit behind "Show the rest, and what you can change", and the cost table, break-even and cash behind "Breakdown". Nothing was removed and no number is computed differently; the sale confirmation still shows the full numbers. The forecast column stays in view while editing (it un-sticks when a breakdown is opened, so it can never be taller than a scrollable window). The hero no longer repeats the name, venue, status or stats that are in the bar; media and advisor notes moved below the workspace; Broadcast & sponsors opens with a summary of what each deal is forecast to bring. Phones keep the original order, actions and single column.
**Matchmaking** (`MatchmakingScreen.tsx`). The eleven-card fighter picker is now a compact two-line list (name, status, division/record), so the opponents table starts at the top of the page. In the table, unavailable opponents are dimmed and say why, the best fit is marked, comparing marks the row, and the action column stays at the right edge while wide tables scroll (previously "Approach" was off-screen). Existing eligibility, assessment and booking logic are untouched.
**Scouting** (`ScoutingScreen.tsx`, `FighterTable.tsx`). Free agents / Under contract / Everyone is a visible control with a one-line legend for Intel, "~" and estimates; the reputation meter column was dropped from the market table; identity lines stay on one line; Scout/Offer stay at the right edge. Knowledge-layer rendering is unchanged.
**Overview** (`Dashboard.tsx` CSS only). The Cash and Roster tiles (already in the top bar and rail) are hidden on desktop; the next fight leads the right rail; "Manage event" sits at the top of the next-event panel; inbox and "what next" sit side by side.
**Icon rail at 1024.** Each item has an accessible name, a tooltip on hover and keyboard focus, a stronger active state and `aria-current`.

## Vertical scrolling (page height in viewports)
| screen | 1280 before → after | 1024 before → after | 390 before → after |
|---|---|---|---|
| overview | 3.95 → 3.78 | 3.69 → 3.85 | 7.4 → 7.4 |
| matchmaking | 3.97 → 2.87 | 3.98 → 2.89 | 10.2 → 10.22 |
| scouting | 5.06 → 3.9 | 5.07 → 3.9 | 15.65 → 14.38 |
| event-top | 5.34 → 2.48 | 5.53 → 2.52 | 11.37 → 8.39 |
| event-card | 5.34 → 2.48 | 5.53 → 2.52 | – → – |
| event-tickets | 5.34 → 2.97 | 6.04 → 3.45 | – → – |
| event-broadcast | 5.34 → 2.16 | 5.11 → 2.25 | – → – |

## Verification actually run
* `npx tsc --noEmit` clean; `npx vitest run`: 55 files passed, 2 skipped; 827 tests passed, 5 skipped, 0 failed.
* New `scripts/browser/ux2-checks.mjs`: 75 passed, 0 failed (1280 and 1024: event bar, Put on sale visible and reachable after scrolling, forecast numbers first, loss reason / levers / breakdown disclosure, tab memory, sale confirmation and "Review Event", matchmaking picker, best fit, unavailable reasons, compare, Approach opens a deal, scouting scope and "~", no hidden attribute names, overview Manage event/Needs you in the first viewport, rail names/tooltips/aria-current/keyboard focus; 390: bar hidden, Put on sale reachable, no overflow, bottom bar present).
* Existing browser suites re-run on this build: phase7-ui 150, phase9-ui 89, phase10-ui 100, phase60-a11y 174, phase510-ui 82, phase410 30, phase59-ui 28, phase60-ui 37, phase63-ui 45, phase64-ui 71, phase5 47, phase47 71, phase46c 57, phase48 all, phase54-business 221, phase54-championship 173, phase54-negotiation 113, phase54-venues 116, phase54-walkthrough 82, phase54b 43, phase54c 69, phase54d 27, phase56 33, phase58 69 — all with 0 failures; phase8 walkthrough (regional) completes at 1280 and 390.
* Scripts updated for deliberate changes (not weakened): phase9-ui opens the new disclosure controls and uses the visible Put on sale; phase60-ui expects three desktop tiles; phase8 uses the visible Put on sale. `phase49b.mjs` still times out at its replay-speed step; it does the same on the commit before the redesign.

## Remaining usability problems
Overview is still ~3.8 screens (the lower sections remain a long list); the editable event page is ~2.5–3.5 screens at 1280/1024; Scouting is still 3.9 screens (a 100-row market); the Fight card rows are cramped in the left column at 1024; Matchmaking and Scouting tables still scroll sideways at 1280/1024 (actions are pinned, secondary columns are not); the 1024 Scouting table hides Intel/Status/Ask until scrolled; the hero's "Tale of the tape" block is still large on event pages.
