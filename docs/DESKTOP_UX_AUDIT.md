# Desktop UX audit (before the redesign)

Measured on a played career (fixture `p54-played`) at 1280×800 and 1024×800 with `scripts/browser/ux-shots.mjs`; "screens" = page height ÷ viewport height. Baseline screenshots: `docs/ux-shots/before-*`.

## Findings, by priority

**P1 — three stacked bars before any content (Shell.tsx, Navigation.tsx).** `TopNav` (58 px, dropdown menus) + `SectionBar` (42 px tab row) + `.hud` (54 px promotion/date/cash row) = ~155 px of chrome, and `TopNav` repeated "Advance Week" while the Dashboard (`desk-head`) and the HUD repeated it again. Group contents were hidden inside hover/click dropdowns (`.tn-menu`), so a new player had to open each menu to learn where anything lives, and the sub-row then listed the same screens a second time.

**P1 — page headers are huge and inconsistent (global.css `.page-head h1` clamp 44–76 px, `.desk-head h1` up to 92 px).** Every screen spent 130–200 px on a title and a two-line subtitle before its first control. Fighters: the table starts at y≈770 of 800.

**P1 — long, flat, single-column pages.** Fighter profile 7.1 screens (`FighterProfile.tsx`: fifteen sections stacked), Finances 5.9 (`FinancesScreen.tsx`: nine sections plus ledger), Dashboard 4.9 (7.1 at 1024), Venues 10.2 / 14.9 at 1024 (`VenuesScreen.tsx`: 40 tall picture cards), News 16.6, Scouting 5.6, Event page 3.2–4.1 (`EventPage.tsx` stacks card, tickets, marketing, broadcast, sponsors in one column).

**P2 — duplicated information.** Cash appears in the HUD, the Dashboard command strip, the "Your promotion" column and the Finances KPI; Advance Week three times; two stacked "What does this mean?" boxes on Matchmaking; Events shows poster cards *and* the same shows again in a table.

**P2 — Dashboard hierarchy (`Dashboard.tsx`).** The next event and "Needs you" were pushed below a command strip and a full-width promotion/roster/fight trio; inbox, news, market watch, cash chart, tier and sponsors followed in one column.

**P2 — controls take two rows of space.** `FilterBar` (ScoutingScreen.tsx) showed seven selects at once on desktop (it already collapsed on phones); `.tabs` wrapped to two lines on the roster (7 tabs).

**P3 — roster table density (`FighterTable.tsx`).** Rows ~85 px (record and status wrapping), headers scroll away.

**P3 — inconsistent section spacing/headings.** `.section` margin 38 px, `h2` 28 px everywhere, regardless of density.

## What already worked (kept)
Hash routes and `ScreenId` list, the NAV data model (`nav.ts`), the phone bottom bar + More sheet, Fight Night's full-screen layout, `Explain`/guide target outlines, table column sets, all component testids.

## Responsive behaviour found
861 px is the desktop/phone switch. At 1024 the old top nav compressed (icons hidden) but the pages kept their 1280 grids; Dashboard and Venues grew by 40–50 % (hero stats wrapped, venue cards one-per-row-and-a-half).
