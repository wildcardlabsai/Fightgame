# Fight Empire — Architecture

## Stack
Vite · React 19 · TypeScript (strict) · Zustand · Vitest. No backend; saves are local (localStorage + JSON export).
A pure-TypeScript engine keeps all simulation testable in Node without a browser.

## Layers
```
UI (src/ui)            React components. Render views; dispatch store actions. No game rules, no hidden data.
  ↓
Store (src/store)      Zustand: { game, route, saves, notices }. Calls engine commands/ticks; persistence.
  ↓
Engine (src/engine)    Pure TypeScript. No React/DOM.
  ├─ types.ts          Every data model; GameState is plain JSON.
  ├─ worldgen.ts       Seeded world + new-game factory.
  ├─ tick.ts           advanceOneWeek / advanceWeeks — the game loop.
  ├─ systems/          development, contracts (stages/expiry), world (retire/intake), aiMarket, finance.
  ├─ commands.ts       Player actions → new state.
  ├─ negotiation.ts    Offer evaluation, counters, patience, signing.
  ├─ roster.ts         Contract building/archiving, free-agent transitions, release.
  ├─ scouting.ts       Scouts, report/search orders, completion, discovery.
  ├─ market.ts         Market value, asking terms, availability, AI appraisal.
  ├─ knowledge.ts      ★ Engine truth → player beliefs (priors, Bayesian updates, ranges).
  ├─ view.ts           ★ The ONLY gateway to the UI: FighterView / ContractView.
  ├─ quotes.ts         Read-only UI helpers (prices, negotiation status, own-contract summaries).
  ├─ ledger.ts         The only way player cash changes.
  ├─ balance.ts        Central tuning sheet. save.ts: slots + versioned migrations. rng.ts: seeded + keyed noise.
  ↓
Data (src/data)        Static content: divisions, nations/names/regions, venues.
```

## Engine Truth vs Player Knowledge (Phase 2)
The engine knows every fighter's real attributes, potential, discipline, composure, injury risk and personality.
The player knows only:

| Source | What it gives |
|---|---|
| **Public facts** (`PublicFacts`) | age, record, KO rate, reputation, popularity, style, stance, reach, nationality |
| **Prior** (`knowledge.priorFor`) | a *belief* per trait computed **only** from public facts (wide, e.g. sd ≈ 17) |
| **Scouting reports** | noisy measurements `truth + N(0, sd)`; sd depends on scout accuracy/experience, depth, fighter visibility, regional familiarity, and is larger for potential and mental traits |
| **Daily contact** | your own roster is observed weekly (training camp) |
| **Fights** (Phase 3) | `observeFight()` hook already provided |
| **Negotiation** | reveals personality (insight) |

Beliefs are stored as `{mean, sd}` in `GameState.knowledge` and combined by precision weighting. Uncertainty grows
each week (`weeklyDrift`) so old reports fade. What the UI sees is `toRange(belief)` — a range at least 4 points wide —
never the posterior mean as a bare number and never the true value. Noise is **keyed** (`keyedNormal(seed, …)`), so
reports are reproducible and cannot be re-rolled by save-scumming.

**The boundary is enforced, not just conventional.** `src/engine/leakAudit.test.ts` statically scans `src/ui` and
`src/store` (no `.attributes`, `.potential`, `.fighters`, `BALANCE`, `fighterRating`, raw engine modules, etc.) and
proves at runtime that an unscouted fighter's view is *identical* whatever their hidden attributes/personality are.

Intentional, bounded information channels: **industry buzz** (young prospects' market value is partly informed by a
noisy read of their potential — "word on the street"), and the negotiation itself (counters/reasons hint at personality).

Not protected against: a determined player reading localStorage / the exported save / browser dev tools. Saves are
plaintext JSON containing engine truth; this is a single-player game and no obfuscation is attempted.

## Rules of the road
* **GameState is the single source of truth**, JSON-serialisable, relationships by id; invariants are tested.
* **Engine functions are pure**: `advanceOneWeek(state) → newState`.
* **All randomness goes through `Rng`** (state in `GameState.rngState`) or keyed noise for reproducible lookups.
* **All ids come from `state.idCounter`**.
* **Every pound goes through `ledger.post`**; `cash === ledgerArchive + Σ ledger` is a tested invariant.
* **UI never mutates state and never reads fighters/knowledge directly** — it uses `useViews()` and `quotes`.
* **Unbuilt features are flagged, not faked** (`FEATURES`, disabled nav).
* **Saves are versioned** (`GAME_STATE_VERSION = 2`); `migrate()` upgrades v1 saves.

## Adding a system
1. Types in `types.ts` (bump `GAME_STATE_VERSION` + migration if the saved shape changes).
2. `systems/<name>.ts` exporting `(state, rng, ids) => void`, called from `tick.ts`.
3. Selectors/quotes/views for the UI (never raw truth), commands for player actions, tests.
4. Screen under `ui/screens`, registered in `Shell.tsx` + `gameStore.ts`.

## AI promotions
`Promotion.ai = { strategy, urgency, cooldownUntil }`. Strategies: **traditional**, **prospectFactory**, **money**,
**regional** (`systems/aiMarket.ts#aiFit`). Rivals appraise fighters with noise that shrinks with tier, decide renewals
~8 weeks out, release surplus/declining fighters, and bid weekly; contested fighters go to the most attractive suitor,
losers become more urgent. Rival finances are abstract (`balance.ai.weeklyIncome`) until Phase 6.

## Fights (Phase 3)
```
Matchmaking (player)                         AI matchmaking (weekly tick)
  opponentCandidates → assess(beliefs)         systems/aiFights.ts (strategy-aware, appraisal noise)
        │                                              │
        ▼                                              ▼
  fightNegotiation.ts  ──────────────►  Fight entity (state.fights, lifecycle.ts)
  (ask, counter, patience, lock)        negotiating → agreed → scheduled → training → fightNight
                                          → completed → processed → postFight   (+ cancelled)
                                                 │
                              fights.ts#resolveFight  (keyed RNG: seed + fight id)
                                                 │
        fight/profile.ts  ──►  fight/sim.ts (pure)  ──►  result (compact)
        (truth → SimFighter:        3 segments/round, damage/energy/momentum,
         age, camp, plan, size)      knockdowns, stoppages, 3 judges)
                                                 │
        processResult: records · rep/pop · morale/confidence · momentum · injuries · suspension ·
        development · purses via ledger.post (guarded by fight.paid) · news · knowledge (observeFightPerformance)
```
* **Fight is its own entity.** Fighters hold only `activeFightId`, `recentFights` (≤12 ids), `injury`, `suspendedUntil`,
  `momentum`, `roundsFought`. Full history lives in `state.fights`.
* **Compact storage.** Totals + cards + a few numbers per fight; round records are kept only for fights you are involved in;
  AI fights are pruned after 3 years unless on someone's recent list; long-retired unreferenced fighters are pruned.
* **Determinism.** `resolveFight` uses `keyedRng(seed, 'fight', id)`, so the same fight on the same state gives the same
  result whenever the bell rings (tested across save/reload). Everything else uses the saved RNG state.
* **Player fights pause at fight night** (`advanceWeeks` stops; the store blocks advancing; the tick will auto-resolve a fight
  left pending so state can never get stuck). AI fights resolve inside the tick.
* **Information boundary unchanged:** matchmaking assessments use `FighterView` beliefs; `FightView` exposes outcomes
  (stats, cards, round story, injuries, consequences) — never causes. `leakAudit.test.ts` covers the new surfaces.
* **Extension points for Phase 4+:** `Fight.venueId/city/country` (events), `FightTerms` (PPV/purse splits),
  `FightResult.importance` (media), `Fight.kind`/`organiserId` (promotion-run cards), `observeFightPerformance` (broadcast).
