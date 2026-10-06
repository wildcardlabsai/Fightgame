# Player experience layer (Phase 4.7)

Added after real playtesting: a player ran a show that lost about £700k and went insolvent. The game let them — that is fine —
but it did not tell them clearly enough, *before* the decision, that it was dangerous. This layer fixes the information, not the rules.

**Nothing here changes RNG, prices, fighter or AI behaviour, event results or any financial rule.** The advisor is read-only
(a test proves identical worlds play out identically with and without advice calls), and nothing it says can block an action.

## Where things live

| Concern | Module | Notes |
|---|---|---|
| Advisor logic | `src/engine/advisor.ts` | Pure functions. Reads the *public* forecast, the player's own books/contracts and the leak-safe `FighterView`. Never `'actual'` demand, never hidden attributes (static-scan tested). |
| Career scenarios | `src/engine/scenarios.ts` | One `CareerScenario` record per career (cash, roster groups, reputation, tier, difficulty, objectives, picker bars). `createNewGame({ scenario })` reads it; the UI reads the same record. Add a career = add one object. |
| First steps | `src/engine/onboarding.ts` | State-derived checklist; ticks itself off. No tutorial text. |
| Preferences | `src/engine/preferences.ts` | Advisor level, audio, hints. Stored per person in browser storage (not in saves), validated on read, safe if storage is blocked. |
| Audio | `src/audio/*` | `AudioManager` (policy) + `synth.ts` (Web Audio, procedural — no asset files) + `bindings.ts` (the only mapping from events to cues). |
| Game events | `src/store/gameEvents.ts` | Tiny typed bus. The store emits meaningful moments; audio listens. Game logic never depends on audio. |

## Advisor

Levels (visual hierarchy, not everything is red): **INFO** (grey) · **TIP** (blue) · **CAUTION** (amber) · **HIGH RISK** (orange, tinted) · **CRITICAL** (red, heavy border).

Event risk (`eventRiskOf`) from the public forecast: cash, projected cost (mid), expected revenue, worst-case revenue (low end of the range), expected and worst-case cash afterwards.
- CRITICAL: worst-case cash would fall below the insolvency line (`events.health.insolventCash`).
- HIGH RISK: worst case below zero, or show costs still to pay exceed cash on hand, or a worst-case loss above 60% of cash.
- CAUTION: expected loss, or a worst-case loss above 25% of cash.
- Also: PPV gamble, venue far too big, "demand supports a bigger venue", marketing as a large share of cash, venue hire + staging versus the bank when booking.

Putting a show on sale with HIGH RISK/CRITICAL advice (that your advisor level lets through) asks **Review Event / Proceed Anyway**.

Contracts compare the offer with the public market band (personality-free) and the player's cash/payroll: tip (>5% over the band), caution (>25%), high risk (adds >40% to annual fighter costs and >15% of cash), critical (signing leaves under 8 weeks of runway). Also tips about long deals for rising young fighters and short deals that risk losing them.

Surfaces: Dashboard "Promoter's desk" (max 4), Event page, Plan-a-show dialog, Negotiation, Fighter profile, Matchmaking notes, Roster notes, Finances ("Promotion financial health": Healthy / Watch spending / High risk / Critical with reasons, e.g. payroll growth vs event-revenue growth).

Settings → Advisor: **Full** (everything) · **Standard** (default: cautions and above plus at most one tip) · **Minimal** (high risk/critical only) · **Off**.

New arrivals are not nagged about inactivity for six weeks (they were idle before they joined).

## Career scenarios

| Career | Engine difficulty | Cash | Roster | Rep | Tier | Objective |
|---|---|---|---|---|---|---|
| From the Ground Up (Hard, default) | standard | £300k | 4 raw prospects | 6 | Startup | £1m promotion valuation |
| Regional Promoter (Normal) | standard | £800k | 11 (4 prospects, 4 established, 3 contenders) | 24 | Regional | 10 profitable regional+ events |
| National Powerhouse (Easy) | forgiving | £4m | 24 (incl. 2 elite) | 52 | National | run an arena/stadium event |
| Build a Champion (Expert) | brutal | £420k | 1 exceptional contender + 4 prospects | 16 | Startup | fighter with 15+ wins and reputation 70+ |

"Hard" for From the Ground Up comes from the start (little cash, no name), not from harsher engine modifiers; "Expert" uses the Brutal profile.
Promotion valuation = cash + £8/fan + 50·reputation² + 3× each rostered fighter's market purse — a yardstick for objectives and future unlocks, not a financial-engine number.
Save version 6 adds the optional `scenario` field (older saves have none and migrate trivially). Classic starts (no scenario) are unchanged.

## Audio

`AudioManager` decides *whether* a cue plays (enabled, muted, per-bus volume, per-cue minimum gap, once-per-key); the backend decides how it sounds.
Buses: UI, Sound effects, Fight, Music (no tracks yet), all under Master. Defaults are quiet (60/40/55/65/70) and nothing plays before the first user gesture.
Components never call audio: elements opt in/out with `data-sfx="<cue>|none"`; one delegated listener handles clicks, tabs, selects, toggles; the store emits game events (`contract.accepted`, `fight.scheduled`, `fight.result`, `event.*`, `advice`, …).
Fight and event sequences (bell, crowd, knockdown, KO, round end, decision, event intro, main-event announcement, result, event complete) are keyed per fight/event so a repeat can never replay them.
Every sound is paired with something visible (toast, banner, panel). In browser tests `window.__audio.log` records the cues the game asked for.

## Known limitations

- The engine does not gate venues or sponsors by scenario; reputation, fanbase and cash do. Scenarios "open" them by starting with more of those. Sponsors are per-event offers (there is no standing sponsor yet).
- **The player's promotion tier is never promoted** (it stays whatever the start set), so the roster cap (`market.rosterCap`) never grows with success. Found while building scenarios; left alone because changing it alters the economy tuned in Phase 4.5/4.6.
- Music has hooks (bus, volume, `crowdAmbience`) but no tracks. Sounds are synthesised placeholders, designed to be swapped for recorded assets without touching game code.
- Advisor thresholds are judgement calls, not tuned against player data.

## Existing tests changed in this phase (no assertion weakened)

| Test | Change | Why |
|---|---|---|
| `leakAudit` › only imports engine truth modules as types | allow-list extended with `advisor`, `scenarios`, `onboarding`, `preferences` | These are new presentation-facing modules. Their counterpart guard is the static scan in `phase47.test.ts` (no hidden-field access, no `'actual'` demand). |
| `engine` › keeps state consistent over three years | explicit 30 s timeout | The 3-year sim exceeds vitest's 5 s default when the whole suite runs in parallel; it passes alone. Assertions unchanged. |

Version expectations use `GAME_STATE_VERSION`, so the bump to 6 needed no test edits.
