# Phase 7 — Onboarding & the first career

## What a new player used to meet (audit)
- The desk opened with the whole game at once; the old "First steps" card sat below the fold (y≈1000 at 1280, further down on phones), was a *browser* preference (not part of the career), and had five steps that skipped venue/card/results/next goal and started with "scout a fighter" even though every career starts with a roster.
- Nothing explained records, scouting ranges, contracts, credible matchups, event money, forecasts, titles, offers or Fight Night at the point of use; the explanations that existed were sub-lines on a few screens.
- Nothing connected the screens: the player had to know that a show needs agreed fights first, a venue second, and a card minimum before "Put on sale".

## What exists now
- `engine/guide.ts` — the guided first career. Milestones: Read your position → Agree a credible fight → Book a venue → Build the card → Check the forecast, then sell tickets → Run the show → Read the result → Choose your next objective. *Scout* and *Sign a fighter* are optional extras (the starting roster is enough). Order is not enforced for the work itself (venue-first is fine); the "current" step is the first required one not done.
- **Detection is from authoritative state**: an agreed/scheduled fight involving your fighters; a non-cancelled event of yours; a card at or above the venue minimum (or an event past card-building); `onSaleDay` set; an event with a settled `result`; a roster fighter who was not on the roster when the guide began; a scouting report or operation. Three milestones are explicit acknowledgements (position, result, next objective) because nothing in the world can prove they were read; they cannot be given ahead of the work.
- **Persistence**: `state.guide` in the save (version 13). `syncGuide` records completions as they happen (sticky: a later cancellation does not un-complete a lesson). A finished or hidden guide never returns by itself.
- **Existing saves**: the v12→v13 migration adds the guide *switched off*. Established careers see nothing new; Settings → "Guided first career" (or the desk's "Show the first-career guide" link after hiding) starts it on request, showing what has already happened as done. Starting it changes nothing in the career (tested).
- **No benefits**: the guide reads state and grants no money, fighters or reputation, and the simulation never reads it (tested: a guided and an unguided world are identical week after week).
- **UI**: `GuidePanel` on the desk (above the fold), `GuideBar` — one slim line on other screens, hidden on the desk, on fight pages and while Fight Night is running; "Go" navigates to the screen, and the real control is outlined (`data-guide` + `body[data-guide-target]`, calm under reduced motion). Skip, Hide, and "Why?" are on every step; blockers (no fit fighter, overdrawn bank, no agreed fight yet) are stated instead of sending the player to a dead end.
- **Contextual help**: `engine/glossary.ts` (static, public-only text) rendered by `<Explain topic>` as collapsed native `<details>` notes — what it is / why it matters / what you can do — on Fighters, Scouting, Contracts, Negotiation, Matchmaking, Fight deal, Fights (offers & outside bookings), Events, event Forecast & money, Fight Night panel, Rankings, Titles and fighter profiles (records).

## Tests
`src/engine/phase7.test.ts` (24 tests), `scripts/browser/phase7-ui.mjs` (150 checks, 1280/1024/390), fixtures by `scripts/browser/make-phase7-fixtures.ts`. Screenshots: `docs/phase7-shots/`.
