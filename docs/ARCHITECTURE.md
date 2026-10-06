# Fight Empire — Architecture

## Stack
Vite · React 19 · TypeScript (strict) · Zustand · Vitest. No backend; saves are local (localStorage + JSON export).
Chosen because the repo was empty, the game is UI-heavy and turn-based, and a pure-TypeScript engine keeps all
simulation testable in Node without a browser.

## Layers
```
UI (src/ui)            React components. Render state, dispatch store actions. No game rules.
  ↓
Store (src/store)      Zustand. Holds { game, route, saves, notices }. Calls engine commands/ticks, handles persistence.
  ↓
Engine (src/engine)    Pure TypeScript. No React, no DOM, no Date.now (except save timestamps).
  ├─ types.ts          Every data model; GameState is plain JSON.
  ├─ worldgen.ts       Seeded world + new-game factory.
  ├─ tick.ts           advanceOneWeek / advanceWeeks — the game loop.
  ├─ systems/          One file per simulation system (development, contracts, world, finance).
  ├─ commands.ts       Player actions; validate + return new state.
  ├─ selectors.ts      Derived read-only views (roster, runway, attention items).
  ├─ save.ts           SaveStorage interface, slots, versioned migrations.
  └─ rng.ts            Seeded mulberry32; state is a single int stored in GameState.
  ↓
Data (src/data)        Static content: weight classes, nations/names, venues.
```

## Rules of the road
* **GameState is the single source of truth** and is JSON-serialisable: ids + records, no classes/functions/Dates.
  Relationships are by id (`fighter.contractId` ↔ `contract.fighterId`); invariants are enforced by tests.
* **Engine functions are pure**: `advanceOneWeek(state) → newState` (structuredClone, then mutate the clone).
* **All randomness goes through `Rng`**, whose state lives in `GameState.rngState`. Same seed ⇒ same world; a loaded
  game continues the exact same random sequence (tested).
* **All ids come from `state.idCounter`** (`stateIds`) so they are deterministic and collision-free.
* **UI never mutates state.** It calls store actions → engine commands.
* **Unbuilt features are flagged, not faked**: `engine/config.ts` `FEATURES`, and disabled "Coming soon" nav items.
* **Saves are versioned** (`GAME_STATE_VERSION`); add a migration step in `save.ts#migrate` whenever the shape changes.

## Adding a system
1. Add types to `types.ts` (and bump `GAME_STATE_VERSION` + migration if the saved shape changes).
2. Write `systems/<name>.ts` exporting `(state, rng, ids) => void` and call it from `tick.ts`.
3. Add selectors for the UI, commands for player actions, tests in `engine/*.test.ts`.
4. Add a screen under `ui/screens` and register it in `Shell.tsx` + `gameStore.ts`.

## Core data model (summary)
`GameState { promotions, fighters, contracts, venues, ledger, financeHistory, inbox, news, settings, today, rngState, idCounter }`

* `Fighter` — identity, physical, 10 attributes (1–100), hidden `potential`, condition (fitness/conditioning/confidence/morale),
  standing (popularity/reputation), record, style, personality, bio, training focus, contract link.
* `Contract` — retainer, minimum purse, fights remaining, term, one-shot expiry warnings.
* `Promotion` — tier, logo, cash, reputation, fanbase, regional/global popularity (player + AI share one type).
* Planned (later phases): `Fight`, `BoxingEvent`, `Title`, `Ranking`, `Sponsor`, `Injury`, `Rivalry`, `Trainer`.
