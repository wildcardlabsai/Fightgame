# Desktop management shell (Phase "Desktop UX")

Presentation only: no engine, store, simulation, ledger or save-format file was changed (`git diff --stat` below lists every file). Routes, `ScreenId`s, testids and the phone layout (bottom bar, More sheet, ≤ 860 px) are unchanged.

## Layout (≥ 861 px)
```
┌────────┬──────────────────────────────────────────────────────────────┐
│ logo   │ top bar: promotion · date · week · cash · runway · finances · inbox 🔔 · sound · +4 weeks · ADVANCE WEEK │
│ OVERVIEW├──────────────────────────────────────────────────────────────┤
│ INBOX  │ tab strip: the screens inside the current section            │
│ ROSTER ├──────────────────────────────────────────────────────────────┤
│ EVENTS │ page header (title, one line of context, primary action)     │
│ WORLD  │ content                                                      │
│ FINANCES│                                                              │
│ MORE   │                                                              │
└────────┴──────────────────────────────────────────────────────────────┘
```
* **Sidebar** (`SideNav`, Navigation.tsx): 184 px at 1280, a 64 px icon rail ≤ 1100 px (labels stay in the accessibility tree). One entry per primary destination; choosing one opens its first screen. It is hidden during Fight Night, which keeps its dedicated full-screen presentation.
* **Top bar** (`.hud` + `TopActions`): replaces the former three stacked bars (58 + 42 + 54 px) with one 52 px bar. Advance Week lives here once (the Overview no longer repeats it on desktop).
* **Tab strip** (`SectionBar`, unchanged component, now sticky under the top bar): every screen in the section, so no screen is more than two clicks from anywhere. There are no dropdown menus.
* **Page header**: `.page-head` is 30–40 px (was 44–76 px), one line of context.

## Where every screen lives (nav.ts is unchanged except the Home label → Overview)
| Sidebar | Tab strip |
|---|---|
| Overview | Overview |
| Inbox | Inbox |
| Roster | Fighters · Free Agents · Scouting · Contracts |
| Events | Calendar · Events · Fights · Matchmaking · Venues |
| World | Media · News · Rankings · Titles · Promotions · Boxing World |
| Finances | Finances · Sponsors · Payroll & contracts |
| More | Advisor · Settings · Save / Load · Promoter's Office · Report a problem (· Assets, dev builds only) |

Detail routes (`fighter/:id`, `event/:id`, `fight/:id`, `deal/:id`, `negotiation/:id`) stay under their parent section, as before.

## Screens
* **Overview**: two columns. Left: Needs you → next event with readiness/forecast → inbox and "what next". Right rail: promotion, roster, next fight, ringside report. Boxing news, market watch, cash chart, tier and sponsors sit below as a secondary grid. On phones the original single-column order is restored with CSS `order`.
* **Roster**: roster notes are one-line rows, tabs fit one line, search + division + nation are always visible and the other filters fold behind "Filters", the column header row sticks under the tab strip, rows are ~35 % shorter. Names still open the profile.
* **Events**: the poster gallery is a single scrolling row above the table. In the event page the long left column is three tabs (Fight card · Tickets & promotion · Broadcast & sponsors) beside the always-visible forecast/sales/finance column; build-step buttons and guide "Go" buttons open the right tab first (`fe:reveal`).
* **Finances**: KPIs stay above four tabs (Summary · Costs & break-even · Sponsorship · Ledger). Bridge financing (distress only) stays on the first tab.
* **Fighter profile**: compact dossier, then tabs (Overview · Media · Career & titles · Fights · Contract · Scouting). The old jump-links are now the tabs. Hidden-attribute protection is unchanged: the same components render the same public/knowledge-layer data.
* **Venues / News**: browse venues as two-column rows, news as two columns.

Tabbed panes are desktop-only: `.ptab[data-on="0"]` is hidden by a rule inside `@media (min-width: 861px)`, so phones still get every section in one column.

Files: `src/styles/desktop.css` (new), `src/ui/Navigation.tsx`, `Shell.tsx`, `nav.ts` (label), `screens/{Dashboard,FightersScreen,ScoutingScreen,EventPage,FinancesScreen,FighterProfile}.tsx`, `components/{Advice,FighterTable,Guide}.tsx`, `styles/global.css` (filter wrappers, fight-night rule).

## Results
Page height in viewports (800 px tall), same career, `scripts/browser/ux-shots.mjs`; screenshots in `docs/ux-shots/` (`before-*`, `after-*`; `after-event-*` shows an editable event with its tabs). No page overflows horizontally at 1280 or 1024.

| screen | 1280 before → after | 1024 before → after |
|---|---|---|
| dashboard | 4.9 → 3.95 | 7.08 → 3.69 |
| fighters | 2.09 → 1.58 | 2.51 → 1.57 |
| fighter | 7.1 → 2.33 | 10.9 → 2.72 |
| events | 1.4 → 1.2 | 1.34 → 1.19 |
| finances | 5.87 → 1.58 | 6.38 → 2.04 |
| inbox | 1.29 → 1.09 | 1.22 → 1.02 |
| calendar | 1.89 → 1.68 | 1.87 → 1.72 |
| rankings | 1.74 → 1.53 | 2.01 → 1.81 |
| titles | 2.22 → 2.63 | 2.82 → 2.62 |
| contracts | 2.46 → 2.02 | 2.44 → 2.01 |
| scouting | 5.61 → 5.06 | 5.72 → 5.07 |
| promotions | 2.13 → 1.94 | 2.5 → 2.2 |
| venues | 10.21 → 7.48 | 14.93 → 8.52 |
| sponsors | 2.23 → 1.75 | 2.21 → 1.76 |
| news | 16.58 → 8.44 | 17.06 → 13.51 |
| media | 3.41 → 2.5 | 5.36 → 4.68 |
| office | 3.32 → 3.01 | 3.4 → 3.22 |
| settings | 3.33 → 3.08 | 3.44 → 3.04 |

Not improved (honest list): Matchmaking (4.0, a card board by design), Scouting (5.1, a long market table), the editable Event page (~5.3: the forecast/sales/finance column plus a tab is still long; the hero is now compact and the three build tabs remove ~2 screens of stacked controls), Venues and News (catalogues, shortened but still long by nature), Settings and Office (≈3).

## Verification
* `npx vitest run`: 821 passed, 5 skipped, 1 failed → the failure was `phase49b.test.ts` expecting the label "Home"; the label is now "Overview" (intentional, test updated). New `desktopNav.test.ts` (5 tests: every screen has a section, labels unique, phone bar covers every group, deep links land in the right section). Re-run of both files: 42 passed.
* Browser (production build, 1280/1024/390): phase10-ui 100/0, phase7-ui 150/0, phase9-ui 83/0, phase60-a11y 174/0, phase510-ui 82/0, phase54b-world 43/0, phase54-business 221/0, phase54-championship 173/0, phase54-walkthrough 82/0, phase54c 69/0, phase54d 27/0, phase56 33/0, phase410 30/0, phase60-ui 39/0, phase59-ui 28/0, phase63-ui 45/0, phase64-ui 71/0, phase5 47/0, phase47 71/0, phase46c 57/0, phase48 all passed, phase54-negotiation 113/0, phase54-venues 116/0, phase58-signing 69/0, phase8-walkthrough regional 1280 and 390 completes the full loop (one known medium finding, unchanged).
* Scripts changed to follow the new UI (not weakened): sidebar/tab-strip instead of dropdown menus (phase49b, phase510 logo selector), tabbed panes opened before asserting their content (phase54-business/-walkthrough/-championship/-c/-d), visible Advance button on desktop (phase8/9).
* Known, pre-existing: `phase49b.mjs` times out waiting for the replay speed control after its fight-night checks — it does the same on the pre-redesign build (verified on a build of the previous commit), so it is not caused by this work.

## Bugs found and fixed during the redesign
Fight Night kept the sidebar (now hidden like the old top nav); full-bleed hero margins assumed the old page padding; the sticky-header clip cut the Scouting table's last column (now roster tabs only); the venue "no licensed photograph" caption had been hidden; Bridge financing was in a hidden tab (now on the first tab).

## Not changed
No file under `src/engine/`, `src/store/`, persistence or save versioning; `git diff 38d0f91 --stat -- src/engine src/store` is limited to tests (`desktopNav.test.ts`, one label in `phase49b.test.ts`).
