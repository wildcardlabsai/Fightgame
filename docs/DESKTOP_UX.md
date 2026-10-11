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
