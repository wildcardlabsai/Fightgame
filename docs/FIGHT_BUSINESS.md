# Fight Empire — The Fight Business (Phase 5.4)

Phase 5.4 turns the sport's business into something the player *talks through* instead of clicks through. A fighter's price comes from
what they have done; a camp answers in its own voice with its own priorities; belts are earned up a real ladder with real obligations;
shows are staged in real venues with real geography. Everything is deterministic, bounded, and built from public facts — the hidden
parts (a manager's weights, a fighter's ambition, a camp's reservation price) are used by the engine and **never returned to the UI**.

```
Public facts (record, opposition, ranking, belts, form, activity, age, fame)
        ↓
Market value  → expected terms (RANGES + confidence)      ← what the player may see
        ↓
Conversation (hidden manager + ambition + stage + memory) ← what the camp does with it
        ↓
Agreements: contract · fight · pathway promise · development plan
        ↓
Consequences, week by week: promises kept/broken · plan fit · title duties · relationships
```

## Where things live

| Concern | Location |
|---|---|
| Market value, purse guardrails, commercial appeal | `engine/business/marketValue.ts` |
| Expected terms + confidence | `engine/business/terms.ts` |
| Managers (9 archetypes), fighter ambitions (14) — hidden, derived on demand | `engine/business/manager.ts` |
| Negotiating stage (prospect … veteran) | `engine/business/stage.ts` |
| Contract conversations | `engine/business/contractTalks.ts` |
| Fight conversations | `engine/business/fightTalks.ts` |
| Voice (what a camp says) | `engine/business/talkCore.ts` |
| Pathway promises | `engine/business/commitments.ts` |
| Development plans | `engine/business/plans.ts` |
| Title ladder as data | `engine/business/titleDefs.ts` |
| Title ecosystem (eligibility, opportunities, duties, status ladder, appeal) | `engine/business/titleEco.ts`, `engine/media/titles.ts` |
| Division moves | `engine/business/divisions.ts` |
| Real venues → game venues, hire curve, travel | `engine/business/venues.ts`; data `src/data/realVenues/`, `src/data/geo.ts` |
| Venue imagery provenance | `src/assets/venueAssets.ts` |
| What the UI may see | `engine/business/talkViews.ts`, `engine/business/views.ts`, `engine/eventViews.ts` |
| Structural invariants | `engine/business/audit.ts` |
| State | `GameState.business` (`engine/business/types.ts`), `GameState.media` (titles, lists, reigns) |

The UI reads views and calls store actions (`openContractTalk`, `contractMove`, `openFightTalk`, `fightMove`, `choosePlan`,
`changeDivision`). It imports no engine-truth module (enforced by `leakAudit.test.ts`).

## 1. Market value

`careerValue` (0–100) is built from **public facts only**: reputation, fame, quality of opposition, record, current ranking, belts
(and a smaller memory of belts held), form, activity, age. Hidden potential no longer leaks in (the old “buzz” peeked at it). The raw score
is calibrated (`CAL`) so the world's distribution matches the pre-5.4 market within ~2 points at the median — the economy was tuned in 5.3
and is not re-opened. Several world belts at once (unified/undisputed) add to the titles input.

- **Career value vs commercial appeal.** What a career is worth and what a *name* sells are separate numbers (the profile shows both).
- **Fight value** adds context: opponent, stakes (standard / eliminator / title / unification), billing, broadcast, venue.
- **Guardrails.** A purse cannot exceed what the show can carry (ceiling ≈ 1.35× the affordable share), and a headliner has a floor.
  Venue/economics limits are reported to the player (“the show cannot carry a purse that high”).

## 2. Expected terms

Before any offer the player sees **ranges** with a **LOW / MODERATE / HIGH** confidence badge, built from public market value and nudged
toward the camp's real position by at most 45% of the gap in proportion to how well the player knows the camp (scouting reports, a good
relationship, earlier talks, experience, what the camp has said). The nudge carries its own noise and the position of the truth inside the
range is not fixed (tested: the true ask never sits on an edge and its relative position varies). Repeating the query reveals nothing
(deterministic per quarter). The draft offer is judged against the ranges: Generous / Reasonable / Light / Lowball.

## 3. Conversations

A conversation is a state machine over a `Talk` (kept in `GameState.business.talks`, bounded to 16).

| Move | Effect |
|---|---|
| Ask what the camp is looking for | Reveals priorities one at a time, in the manager's words (a cold camp is evasive). Costs a little patience (aggressive managers resent it). |
| Ask what the fighter wants from the sport | Reveals the **ambition** — but only once trust exists (relationship, earlier talks, two priorities told, or a talkative manager type). |
| Propose terms | Money, length, fights, minimum fights, a **real pathway**, a **development plan**. |
| Accept their counter | Closes the deal at the counter. |
| Ask for time | Costs patience depending on the manager (cautious/loyal: free; aggressive: expensive). |
| Walk away | Withdraws; a small relationship cost if an offer was on the table. |

**How the camp decides.** `scoreOffer` (the engine's existing hidden valuation: personality, relationship, standing, prestige, soft terms)
is bent — within ±16% — by the camp's priorities (money, title route, activity, exposure, career, loyalty, development, security), which are the
manager's hidden weights multiplied by the fighter's **stage**, and by the camp's **memory** of the player (broken promises −, kept promises +).
A contender or champion whose ambition is a title will not sign a deal with nothing on titles, however well it pays.

**Managers (hidden).** Nine archetypes with different weights, patience, walk-away threshold, lowball tolerance and appetite to counter.
Money-focused camps bargain on cash and walk readily; title-focused camps ask for a route; development camps want a plan and protection;
aggressive camps have little patience and punish lowballs; loyal and cautious camps are patient and want security.

**Stage.** Prospects (protect, security, longer deals), journeymen (money now, activity), contenders (title route), champions (money, stakes,
exposure; walk readily), stars (the stage; walk readily from small promotions), veterans (security, legacy).

**Ambition (hidden).** 14 kinds (area / British / Commonwealth / European / world champion, unify, undisputed, unbeaten record, earnings,
stay active, move up, avenge a loss, settle a rivalry, legacy), derived from the fighter's career stage and public facts. A pathway that
matches the ambition is worth more to the camp; a plan that cuts across it is worth less.

**Counters are built from the state of the talk**: the camp asks first for the highest-weighted thing missing (a pathway for a title camp,
a plan for a development camp, more fights for an activity camp, security for a cautious one), money last and split the way that manager
likes it (cautious → up-front). They concede over the turns — a later counter never asks for more money than the last unless that no longer
clears their bar — and never go below their reserve. Repeating an offer is a “hold” that costs patience; a lowball costs trust and patience;
patience at zero is a **walk-out**: the talk breaks, talks lock for 12 weeks (the legacy lock is honoured by `availabilityFor`), the
relationship falls and the camp remembers.

**Fights.** The same machinery with the opponent's camp. What is at stake (standard / eliminator / title / unification) is **read from the
real title system** (`fightStakes`), never offered by the player. Venue (neutral / their ground / yours), rematch clause, two-fight deal
and rounds are real terms; a development-camp opponent protects a prospect from a mismatch; a title-minded camp wants the stake; an
exposure camp wants the stage. If the bout is off-plan for the player's own fighter (a big step for a protected fighter, a soft touch for
a fast-tracker) their own camp is uneasy: morale and trust fall slightly.

**Relationship effects.** Agreement raises trust (more for a generous deal), lowballs and repeated offers lower it, walk-outs cost 7–10 and are
remembered (`neg.walkouts`, `lowballs`), kept/broken promises are remembered (`kept`, `broken`) and bend later valuations.

## 4. Pathway promises (commitments)

A promise made in a deal — an area / British / European / world title shot, a world-title chance *if ranked top 8*, an eliminator, a headline
slot, or four fights a year — is recorded and settled **from the fights themselves** every week.

- Only pathways that are genuinely available are offered (territory, minimum bouts, belt not dormant, ranking range); an impossible one
  is refused by the engine.
- **Kept** (the bout really happened): morale +8, trust +12, a career line.
- **Broken** (deadline passed; one eight-week extension if injured): morale −14, trust −22, the promotion's reputation −1.2, the rest of the roster
  loses a little morale, a career line, and the camp remembers (harder talks later).
- **Void** (fighter left; or the “if ranked” condition no longer holds): no penalty.

The older “title shot promised” contract clause (`titlePromise`) is now enforced too (`FEATURES.titlesImplemented`).

## 5. Development plans

Protected / Steady / Fast track, agreed in a negotiation or set on the roster. They really change the game:
growth (protected is a little faster for the young), fame from wins (fast track +20%, protected −15%), injury risk, morale after a defeat,
what opposition the camp accepts, and — weekly — the **fit** between plan, career stage and (hidden) ambition nudges morale and trust. The fit
reasons shown to the player are public (age, experience, stage); the ambition-based reason appears only once the camp has told the ambition.

## 6. The title ladder

Thirteen bodies, as data (`titleDefs.ts`): four world bodies, European, British, Commonwealth and six regional **Area** titles
(Welsh, English, Northern, Central, Midlands, Southern). Adding a title is one entry here plus one identity entry in `data/mediaIdentity.ts`.

> **Licensing and honesty.** Titles carry their real-world *names*, but every rule — eligibility, minimum bouts, how many contenders are
> listed, how long a champion may go without defending — is a **game abstraction**. It is not the rulebook of any real organisation, and the
> game is not affiliated with, endorsed by or licensed from any sanctioning body, governing board, broadcaster or promoter. No logos or
> organisational branding are used. World-body ids in state are opaque (`atlas`, `pioneer`, `crown`, `apex`); the displayed names come from
> the identity pack so they can be swapped without touching a rule.

Mechanics (all configurable per body): eligibility by nationality/home town; minimum bouts and minimum win share to be rated; a minimum
**pool** of eligible rated fighters before a belt is contested at all (graded for the world bodies so the smaller divisions carry fewer
belts — “dormant” belts say why); a mandatory challenger after inactivity with a window, **one extension for a valid excuse**, and
**stripping** when refused; **eliminators** (rare, capped, ordered between two real contenders — the winner becomes mandatory challenger);
**vacancies** filled by a fight between the leading contenders; **relinquishment** by a fighter holding three world belts (never within eight
weeks of winning one); **unification** by intent; undisputed status; a fighter who has just won a belt does not retire before a first defence.

Every vacancy has an explicit recorded reason (retired, inactivity, refusing a mandatory defence, relinquished — including on moving
division — or lost in the ring), reign dates are chronological and never overlap, and history is kept (reign history is bounded at 1,200 reigns).

**Effects.** A belt adds pull to a fight in proportion to its level (`LEVEL_STAKES`), more for a unification, a premium when the winner
could become undisputed (only while the media world feeds the economy); a unified/undisputed champion is worth more; career lines record
eliminators, mandatory orders, unification, undisputed status, giving up or being stripped of a belt, division moves, and promises kept or broken
(each kind capped per fighter, so the career stays short). Media stories cover the national-level news and skip housekeeping at area level.

**Career status ladder** (shown on the profile): Prospect → Regional contender → Domestic contender → European contender → World contender →
Mandatory challenger → Title challenger → Champion → Unified → Undisputed, with an always-grounded “what's next” (a real opportunity or the exact
rank the next rung asks for).

**Ratings.** 15 lists (13 bodies + media ratings + an independent index) on their own schedules. Every movement carries a recorded reason.
(A fixed bug: lists whose schedule offset was odd were never refreshed after the first pass; a list is now due when its schedule ticks over
between passes.)

## 7. Division moves

A rostered fighter can move one division up or down (the camp must agree; one move a year; not with a bout booked or within three weeks of a
fight). Belts at the old weight are **relinquished** with the reason on record; pending orders lapse; lists drop the fighter at once; the
body changes a little (up: power and chin, less speed and stamina; down: the reverse and the strain of the cut). Rivals' fighters whose
ambition is to move up do so occasionally (deterministic, keyed, ~3% chance on a four-week check, only while the media coupling is on).

## 8. Real venues

`src/data/realVenues/` holds **111 researched real venues** (21 countries; 268 sources; 85 `verified`, 26 `approximate`; 20 boxing
capacities `published`, 91 `estimated`). A renamed building is one entry (old names in `aliases`); there are no duplicates. Researched facts
(name, location, coordinates, published capacity, boxing capacity, indoor/roof, history) are kept apart from **game abstractions**
(prestige, production, audience pools, suitability). Nothing here claims any venue's endorsement.

- **Capacity in the game is the boxing capacity.** The UI says so, and says whether it is published or estimated.
- **Hire cost is the game's own abstraction**, not a published price: the per-seat curve the economy was tuned on, scaled by prestige (±22%).
- **Generic halls.** Boxing is staged in many unnamed rooms, so a few clearly flagged *generic* halls (`generic: true`, “a game placeholder, not a real
  building”) remain for the smallest shows. They are the only venues sent to the image generator.
- **Geography.** Fighters' hometowns and venues have coordinates (`data/geo.ts`, approximate). Travel for each visiting camp (fighter + trainer)
  is free within ~120 km, then road, then air; it is part of the forecast and of settlement (“Travel & accommodation”). A fighter who lives
  near the venue brings a home crowd (more of the card's draw counts as local).
- **Event builder.** Every venue shows boxing capacity, booking cost, expected attendance, break-even attendance, travel bill, risk, home-crowd note,
  whether it is free on the date, and (real venues) region, number of sources and verification status. Locked venues show why.
- **AI.** Rivals choose the largest room their card can fill, evaluated lazily; they never use legacy venues.

### Venue photography — provenance and licensing

`src/assets/venueAssets.ts` is the only door for a real-venue picture. A `VenueAssetRecord` carries `venueId`, `assetType`, `source`,
`sourceUrl`, `licence`, `attribution`, `approved`, `localAssetPath`, `hash`, `version`. A record can only be approved with an allowed licence,
a source URL, attribution, a local file under `public/assets/venues/` and a SHA-256 hash; generated art can never be approved as a
photograph. The UI shows an approved image lazily and responsively with its credit, otherwise the game's own venue illustration labelled
“Illustration — no licensed photograph”. **As shipped there are zero licensed venue photographs (0 of 111), nothing was scraped, and no
permission from any venue, operator, photographer or rights holder is claimed.** Real venues are never sent to the image generator
(`assetgen/requirements.ts`), so a generated picture can never pose as a real building.

*Adding a photograph:* clear the rights first; put the file under `public/assets/venues/<venueId>/`; add a record with the licence, source URL,
attribution and hash; set `approved: true` only after review; the tests (`validateRecords`) will refuse an incomplete approval.

## 9. Persistence and migration (save v9)

`GAME_STATE_VERSION = 9`. `migrateV8toV9` adds the real venues (the old fictional ladder stays so past events still point somewhere: small ones
become generic halls, large ones are marked `legacy` and are never offered again), an empty `business` record, `media.queue`, and tops up older
title records. Existing stories, careers, awards, rivalries and reigns are untouched, the RNG and id counter are untouched, and the migration
is idempotent. The new title bodies and lists appear as the weekly passes reach them; **no champion is crowned without a fight**. Tested on a
synthetic older save and on a real v8 save written by the Phase 5.3 code (played 120 weeks, loaded, played three more years: audit clean).

Storage: rating lists are compact tuples, retired and low-profile careers shrink to a short legacy line, defences of one belt are one career line,
the venue record in state holds only the real venue's id (facts are read from the static data), and `business` is bounded (16 talks,
60 promises, 26 log lines per talk).

## 10. Determinism, information boundary, tests

- No `Math.random` anywhere in the engine (a test scans the source); business modules use only seed-keyed generators and never touch the main
  RNG stream or the id counter. Same start + same moves ⇒ same game; saving and loading mid-conversation changes nothing.
- The conversation views, the profile view, the title boards and the advisor are scanned for hidden keys, manager archetypes and ambition kinds;
  the camp never speaks a number; the ambition is told only after the player asks and earns the answer, and then it is the true one.
- Tests added for 5.4: `phase54.test.ts` (market value, guardrails, terms, managers, title integrity under the full ladder),
  `phase54talks.test.ts` (conversations, personalities, stages, walk-away, commitments, plans, fights, information boundary),
  `phase54titles.test.ts` (appeal, division moves, advisor), `phase54venues.test.ts` (data integrity, economics, migration, provenance, AI venue
  choices), `phase54audit.test.ts` (hidden-information and determinism audits). Browser: `scripts/browser/phase54-{negotiation,business,venues}.mjs`
  (435 checks at 1280/1024/390).
- Timing-sensitive tests (`perf`, `longrun`, `bench`) run after the rest and one at a time (a separate vitest project) so they measure the engine,
  not contention; their thresholds are unchanged.

## 11. Long-run results and performance

`npx tsx scripts/audit/phase54-longrun.ts <years> <seed> bot|passive` plays a world and, every four weeks, runs `auditWorld` (no duplicate or
two-division champions, no retired champions, no mandatory order on a vacant belt or naming one challenger for two belts of a body, no title
without a valid division, ratings unique/ordered/in the right division, reigns chronological and closed with a reason, no attendance above
capacity, no impossible hire/capacity) and watches rating jumps. `bot` = the scripted balanced promoter plays; `passive` = the player does nothing.

| Run | Result | Champions (share of active fighters) | Title-fight share | Median purse vs year 1 | Rivals insolvent | Max rating jump | Save / media |
|---|---|---|---|---|---|---|---|
| 5 years, bot (p54-long3) | **clean** | 14.5% → 11.4% | 25% → 23% | ×0.87 | 0 / 6 | 8 | 3.4 MB / 399 kB |
| 10 years, bot (p54-long2) | **clean** | 15.0% → 13.2% | 27% → 23% | ×1.17 | 0 / 6 | 8 | 4.7 MB / 548 kB |
| 10 years, passive (p54-long4) | **clean** | 12% → 9.8% | 28% → 20% | ×1.16 | 1 / 6 (from year 9) | 8 | 3.2 MB / 480 kB |
| 20 years, passive (p54-long) | **clean** | 12.7% → 5.6% | 28% → 15% | ×0.96 (peak ×1.44) | 1–2 / 6 late | 9 | 3.7 MB / 617 kB |

No retired champions, no duplicate titles, no impossible rank jumps, purses do not inflate, rivals' cash stays flat (~£28–31 M average). The
share of fighters holding a belt falls in very long worlds because the rated pool thins (see limitations); titles go *dormant* with a stated reason
rather than being awarded to nobody.

**Performance against Phase 5.3** (passive worlds, three seeds, ms per simulated week; same machine, same script):

| Year | Phase 5.3 | Phase 5.4 |
|---|---|---|
| 2 | 19–24 ms | 27–28 ms |
| 4 | 30–32 ms | 36–40 ms |
| 8 | 36–40 ms | 44–50 ms |
| Save size at year 8 | 2.8 MB | 3.0 MB (+6%) |

About +20–25% per week. Explained, not hidden: thirteen title bodies and fifteen rating lists instead of five, obligation-first AI booking, a
larger state to clone each week (+6%), 111 more venues to consider. Optimisations already in: a once-per-change index of who holds which belt
(it cut a week from ~45 to ~25 ms when first added), compact rating lists, lazy venue forecasting for rivals, cached hometown distances.
The `perf` test (a week tick relative to a clone of the starting world) reads ≈7.2–8.0× against a limit of 10 (Phase 5.3: ≈6.9–7.3×).

**Career shapes** (from `scripts/audit/phase54-careers.ts`, a 14-year world): a prospect who climbs Prospect → Regional → Domestic → European contender →
World contender → Mandatory challenger → Title challenger → Champion → Unified → Undisputed; a unified champion who defended repeatedly and was stripped
of a belt for refusing a mandatory; a champion who lost the belt and retired; journeymen and losing careers that never touch a title; fighters who changed
division and gave up belts on the way; a superstar who reached peak popularity. The same script prints how a money-minded and a title-minded camp answer the same
opening offer.

## 12. Known limitations

- **Thin areas.** At ~300–400 fighters spread over 17 divisions, regional Area titles (Welsh, Midlands, Southern, Central) are often *dormant*
  (not enough eligible rated fighters); the Titles screen says so. Raising the world's size would wake them.
- **World scale.** Even with graded pools the share of fighters holding a belt (~7–12%) is higher than in the real sport; world belts per division
  fall over a 20-year run as the rated pool thins.
- **Venue facts.** 91 of 111 boxing capacities are estimates and 26 venues are `approximate`; every figure is labelled in the UI. Hire costs are an
  abstraction. Coordinates and distances are approximate.
- **Event page.** A booked show's venue cannot be changed (there is no engine command for it); the venue picker works when planning a show.
- **AI.** Rivals do not hold pathway promises or run development plans; they use the same title obligations, ratings, venues and economics.
- **No licensed photographs** (see above).
- The scouting section of the profile still shows ceiling/traits from paid scouting reports (pre-existing, player-earned information).

## 13. Candidates for Phase 6

Rivals' managers and plans; a venue-change command for booked shows; multi-fighter packages in a negotiation; sponsor and broadcaster
pathways as promises; a licensed-photo workflow with a review tool; a larger world so Area titles are alive everywhere.

## Title and fight integrity pass (save version 10)

**Fight length has one source of truth.** `Fight.scheduledRounds` is resolved by `business/fightRounds.ts` (`settleRounds`) when a fight is
created, agreed, scheduled (and put on a card), and again every week until fight night. The championship distance is data in
`titleDefs.ts`: world, European, British and Commonwealth titles are 12 rounds, an area title is 10, an eliminator is 12 (world/European),
10 (British/Commonwealth) or 8 (area). A negotiated length applies only where nothing is at stake. Simulation, scorecards, Fight Night,
the tale of the tape, event cards, history and media stories all read the persisted number. The invariant is `fightRoundsProblem`.
Root cause of the old bug: length was chosen once at creation from reputation and experience (`roundsFor`), before and independent of the
title system, and the weekly title flag never touched it, so a champion could be booked for 4, 6, 8 or 10 rounds. With media coupling
off (`media.effects = false`, a test-only mode) titles do not shape the sport, so lengths stay on the career rules.

**Current titles come only from the live belts** (`media.titles[...].c`). Former titles come only from closed reigns. The profile shows
CURRENT TITLES (with "WBC world champion", "Unified world champion" or "Undisputed world champion") and a separate, collapsed FORMER
TITLES list; belt cards say CURRENT CHAMPION / VACANT / NOT CONTESTED with MANDATORY and ELIMINATOR chips, and the reign history sits
behind "View reign history".

**Ladder of levels** (area < British/Commonwealth < European < world). A fighter holds at most one level of belt per division. Winning a
higher level closes the lower reign in the same settlement (`enforceHierarchy`): reason "relinquished — moved up to the WBC world title",
dated, the reign kept in history, the belt left vacant, news and lists updated. Several belts of the same level stay legal: unified and
undisputed world champions, British and Commonwealth together. A fighter holding a higher belt is not a challenger for, nor rated on the
lists of, a lower belt. A bout is for the highest level of belt on the line, so no zero-length reign is ever created. A weekly pass repairs
any state that escaped (belt held by a retired fighter or one who left the division). Division moves relinquish every belt at the old
weight, as before.

**Saves.** v9 → v10 (`normaliseTitles`): closes lower reigns held beneath a higher belt, vacates belts held by retired or departed
champions, drops flags the ladder no longer allows from booked title fights and gives booked fights their championship distance. Fights
already fought are history and are not touched. Idempotent.

**Tests / audits.** `phase54integrity.test.ts` (lengths for each level and the full lifecycle, the ladder, unified/undisputed, division
moves, current vs former, migration, a 3-year audit) and `scripts/audit/phase54-integrity.ts` (multi-seed, 5 and 10 years).

**Why the distance rule sits behind `media.effects`.** Titles live in the media world, so a title fight cannot exist without it. The flag
`media.effects` is `true` in every game the player can start, load or migrate (new games, saves, pre-media saves), and nothing outside
tests sets it to `false` (a test scans the engine sources). It exists only for one diagnostic mode in which the media world is switched
to "observe only", to prove the rest of the engine does not depend on it. The playable game therefore always enforces the championship
distance; the Fight Night counter and every "of N" label read `Fight.scheduledRounds`, not the number of rounds that were fought.

**Browser proof.** `scripts/browser/phase54-championship.mjs` drives a new world title fight through the real screens (Titles →
Request title fight → negotiation → schedule → advance weeks → Fight Night → result → history) and repeats until it has seen both a full
12-round decision and an early KO.

## Title contender calibration (Phase 5.4A, save version 10)

**Challenger assessment** (`business/contender.ts`, tuned in `CONTENDER_CONFIG` / `CONTENDER_WEIGHTS` in `titleDefs.ts`). Being rated is not
enough, and a good record alone is not enough. Each fighter is assessed per level (area < domestic < European < world) from public facts only:
a hard experience floor (fights and wins), a minimum win share, and a weighted score over experience, record, quality of opposition (the
standing of the last eight opponents), wins over credible opponents, recent form, ranking and movement, recent activity and career stage.
To be a CONTENDER a fighter must clear the level's bar AND, for European and world belts, hold at least one recent win over a credible
opponent - so an unbeaten run against weak opposition does not outrank a fighter who has beaten credible contenders. World is stricter than
European, which is stricter than domestic, which is stricter than area. Lower-level pathways are legitimate, never compulsory. The score is
never shown; the UI shows only a tier and the next step: NOT ELIGIBLE (insufficient professional experience), BUILDING (needs stronger
opposition / a win over a credible contender / a stronger recent run / more activity / a better record), CONTENDER, ELIMINATOR, MANDATORY.
A 5-2 fighter is eligible for nothing. A fighter named by the board (mandatory, or the winner of an eliminator) is exempt from the
assessment, and mandatory challengers are drawn only from credible contenders - never from ranking alone.

**Champion's camp** (`titleCamp.ts`). Owed obligations first (a mandatory defence owed, an eliminator pending: the camp declines). An ordered
challenger is always accepted, whatever the commercial picture. Otherwise a deterministic quarterly roll against a probability built from
public value, commercial appeal, credibility, rank and how long the champion has been idle. The decline is remembered
(`business.declines`) until the quarter ends, so asking again gets the same answer; the player sees an outlook (strong / fair / weak) and a
reason ("TITLE REQUEST DECLINED"). Commercial appeal can never override a mandatory.

**Vacant belts** are filled only from credible contenders within the vacancy limit, a belt opens only with 3 (world: 4) credible
contenders, and an obligation to fight for a vacant belt is paired once.

**Measured** (`scripts/audit/phase54-contention.ts 5 5 --detail`, seeds contend-1..5, 5 bot-played years each): title fights per seed
227 / 184 / 213 / 201 / 219 (before calibration ~165; before any restriction ~388); vacant belts 27.7% (30% before calibration, 19% originally).
By level: area 40.7% vacant, domestic 26.1%, European 37.2%, world 24.9%. The lowest challengers seen: world 14 fights / 9 wins, European 11 / 8,
domestic 9 / 6, area 9 / 6. 19 area-to-domestic, 10 domestic-to-European and 22 European-to-world routes; 398 mandatory orders, 61 of which went
ahead although the champion's camp would have refused them as voluntary fights. Round-count and hierarchy invariants: 0 problems.

**Trade-offs.** Vacancy is mostly supply-limited (few credible, unbooked contenders at a division at once), so the remaining 28% is not
tuned away further without inventing challengers. Area and domestic belts in thin divisions sit vacant longer. Acceptance runs about 50-60%.

## The living boxing world (Phase 5.4B, save version 11)

**What already existed and was reused** (not rebuilt): rival promotions with a strategy, competence and risk appetite (`systems/aiMarket.ts`),
a financial life cycle from healthy to insolvent with rare owner rescues (`systems/aiFinance.ts`), rival event planning, venues, pricing and
settlement through the same event engine as the player (`events/ai.ts`), rival matchmaking against real opponents, contract renewals and
releases, retirement, and the title system. Rival fights and shows are real entities in the normal game state; they update records,
rankings, reputations and title histories through the same code paths as the player's.

**What 5.4B adds** (`src/engine/world/`):

- **Contested signings** (`pursuit.ts`, `systems/aiMarket.ts`). A rival that picks a free agent who matters (a name, or anyone the player
  is following) now makes an *offer* and the fighter answers in one to three weeks, instead of signing instantly. In that window the
  player can still sign them; if the player does, the offer lapses. At the deadline the rival must still afford the deal and have room, or
  nothing happens. One pending offer per fighter and per promotion, and nobody shops a fighter with an offer out. While an offer is out the
  camp costs the player slightly more and says so ("has another offer on the table"). The player hears of an offer only for fighters they
  know about: the profile, a market tab ("Offers Pending"), the conversation header, and an inbox message for shortlisted fighters.
- **A prospect pipeline that follows need** (`intake.ts`). Each division has a head-count target from the weight-class mix. Weekly intake
  follows the total shortfall, divisions are drawn from the shortfalls, a yearly cap applies, and newcomers are amateur graduates (most),
  late arrivals or experienced overseas professionals, with a share drawn from the promotions' home countries and a small gifted tail that
  keeps the top of the sport supplied over decades. Potential stays hidden; nobody is deleted.
- **Promotion life cycle** (`lifecycle.ts`). A promotion with no fighters, no shows and no money (or whose backers withdrew) is *defunct*
  (derived, never stored, history kept) and no longer counts as a competitor. In a world short of rivals, or with idle talent, a new Startup
  promotion may be founded: after the first year, at most one per half year, with a fixed £650k opening capital recorded as its `startCash`,
  and no further help. Some succeed and some fail on their own competence.
- **Standing** (`standing.ts`). A title change lifts the champion's promotion and costs the beaten champion's promotion a little reputation
  (symmetric, bounded, off when the media world only observes).
- **Public views** (`views.ts`). Each rival's standing (Expanding / Active / Cutting back / Quiet / Folding / Folded / New) is derived only
  from things anyone could see: shows held and announced, signings and departures, collapse news. Rival shows near a date are shown in the show
  planner (the demand model already splits the audience between shows in the same country within two days). Cash, appraisals and plans are never exposed.

**Persistent state**: `GameState.world = { v, pursuits, intake }` and nothing else. v10 -> v11 only adds it (empty pursuits, the pipeline window
starting on the save's own date); every other field is untouched and the career carries on through further ticks (tested).

**Measured** (`scripts/audit/phase54b-world.ts [years] [seeds] [--react] [--rich]`, seeds `world-1..N`, balanced bot; before = the 5.4A code):

| 12 years, 2-3 seeds | before | after |
|---|---|---|
| active fighters | 287-314 | 309-321 |
| smallest division as a share of its target | 0.40-0.61 | 0.71-0.94 |
| active fighters rated 65+ (year 1 -> year 12) | 74 -> 39 | 79-91 -> 76-79 |
| rivals still competing (year 12) | 5 (one zombie, negative cash for 4 years) | 8-9 |
| rival shows / year | 41-48 | 47-51 |
| rival signings / year | 33-50 | 55-65 |
| new professionals / retirements per year | 21 / 20 | 21 / 20 |

Contested signings: about 25 offers a year per world, 97% on fighters the player knows; a player who answers each affordable, signable
offer wins about 20-34 fighters in eight years (never beaten when affordable; the rest go to the rival because the player's roster was full
or the price out of reach). Rival books: no rival's cash ever exceeds start + revenue + bailouts. Title audit after the changes (5 seeds x 5 years):
191-244 title fights per seed, 30% of belts vacant, 0 round-count problems (5.4A: 184-227, 28%).

## The Promoter's Office (Phase 5.4C, save version 12)

**Gap report (baseline audit of the 5.4B code).** Rivals never proposed fights: every bout was started by the player. Career direction was a
three-way development plan (protected/normal/accelerated) with nothing tying it to matchmaking. Pressers and rivalries existed in the media
engine but could not be chosen as a promotional angle for a show. Relationships existed only inside media (`media.rel`) and negotiation memory.
There was no business strategy. And the promoter could set training focus, camp intensity and the fight plan for every fighter, which
is the trainer's job, not a promoter's.

**Reused, not rebuilt**: fight negotiation and agreement (`fightNegotiation`, `fights`), the event engine and rival shows, `DevPlan`,
`Commitment` promises, media pressers/rivalries/narratives, event demand and marketing, hiring, title rules (`titleObligation`, `assessChallenger`),
the 5.4B world and pursuits. **New** (`src/engine/office/`): `offers` (incoming proposals), `goals` (career objectives), `promotion` (angles),
`press` (conferences), `relations` + `politics` (one relationship book), `strategy`, `trainer` (coaching staff + trainer-owned preparation),
`weekly` (the once-a-week pass), `views`/`commands` (the only things the UI may import).

**Incoming offers.** Each week every active rival has a small keyed chance to write. A proposal is only made if it could really be staged: both
fighters free, in one division, rested, contracted past the date, not under a title obligation, affordable to whoever pays, and the pair not
used within half a year. Two shapes: the rival hosts (a real fight is attached to their open show; they pay the player's promotion a fee that
posts to the ledger as `loanFee` income against the fighter's purse cost) or the player hosts (a normal fight; the player pays the rival fighter's
purse through the usual agreement path). Offers carry both fighters' records, the terms, the date, the reason and an expiry. Actions: accept, reject,
counter (at most twice), withdraw a counter. The rival answers a counter a week later from how far it is from what they asked, their finances,
their strategy and the relationship, plus keyed noise. Offers expire, or are withdrawn with a stated reason if a fighter is injured or booked. An accepted
offer becomes an ordinary agreed fight (no special path). The Fights screen's *Offers* tab (counts from real state) has Incoming / Active / Sent /
Agreed / Rejected-expired.

**Career pathways.** A fighter can carry one objective (prospect, regional, domestic, European, world, rebuild, return, headline, veteran). Milestones are
read from authoritative state (record, rank, belts); an objective never grants eligibility. It sets the default development plan and changes real
matchmaking (`opponentFit`: risk appetite). Protecting a prospect against a harder fight is possible but the camp objects and the promoter must
override, at a morale cost applied once. Profile shows objective, next milestone, progress, decisions made, promises and obstacles.

**Angles and press.** Six angles per show (traditional, prestige, rivalry, showcase, local, headline), each with a *fit* rating from public facts; a
poor fit points the wrong way. Cost is charged through the marketing ledger once. Press conferences only for fights with something to sell, cost money, can
backfire (bounded), and feed persistent rivalries from real history.

**Relationships.** One book (`office.rel`) for promoters, managers, broadcasters, venues and sanctioning bodies' media outlets. Every change has a recorded reason
and a once-key, is bounded, and eases toward neutral. It tilts offer frequency, counter replies and venue hire (±5%) but never overrides contracts,
finances or title rules.

**Strategy.** Focus (prospects / regional / contender / headline) and stance (growth / stability / prestige): each moves demand, growth, costs or standing by
a few percent, with a stated downside; a change is half-strength for 8 weeks; no ledger entries are created. `null` is neutral, so old saves and new games
play as before.

**Roles corrected.** Removed from the promoter: training focus, camp intensity and the fight plan (`setTraining`, `setPrep`, the focus grid). Trainers set
them each week (recovery when injured, plan from style, light camps for veterans) and report in words. The promoter owns the coaching staff level (a hire
posts six weeks' cost to the ledger as `coaching`; bounded growth/injury effects), budgets, objectives, and proceed-or-pull-out on the trainer's report.

**Save migration v11 -> v12**: adds optional `office` (created lazily by writes, never by reads); nothing else changes. Tested (a v11 save loads, ticks and keeps its trajectory).

**Measured** (5 seeds x 5 years, balanced bot, `scripts/audit/phase54c-office.ts`): offers made 1.5/seed-year when the bot answers (28 agreed, 8 withdrawn
before an answer, 1 rejected; 9 rival-hosted, 28 player-hosted), 2.9/seed-year when ignored (13 expired, 60 withdrawn by the rival as fighters got booked). Passive
career: 2.1/seed-year, 50 of 53 accepted. Title integrity unchanged (`phase54-contention.ts 5 5`: problems 0). 5.4B world metrics unchanged (about 320 active
fighters, 8 rivals alive, no negative-cash rivals, pursuits as before). Save size about 15.8 MB for five busy years (state JSON). Tick time: per-week
wall 30-38 ms vs 34-43 ms at 5.4B in the same loaded conditions; the ratio test is noisy under load (see the final report).

**Known limitations**: offer volume is limited by free fighters for a busy promoter; sanctioning-body relationships beyond the media outlets are not modelled; manager
relationships are derived from negotiation memory; a rival-hosted fight pays through a fee line rather than a shared-revenue split.

## Fight night, career consequences and long-term play (Phase 5.4D, no schema version change)

**Baseline report (from the code and `scripts/audit/phase54d-consequences.ts`, 6 seeds x 10 years passive and 4 seeds x 8 years with the balanced bot).**

| Stage of the lifecycle | Finding | Evidence |
|---|---|---|
| Records, reputation, popularity, morale, confidence, momentum, injuries, suspension, development | **Worked.** All scale with the public pre-fight expectation, so an upset moves far more than an expected win | `fights.ts` `processResult`; audit: winner's reputation gain 1.6 (expected) / 2.7 (even) / 3.9 (upset) |
| Same result for different fighters | **Incomplete.** Prospect, prime and veteran got near-identical effects | audit: an upset win paid +4.0 / +3.9 / +3.9 reputation; a shock defeat -3.5 / -3.8 / -3.9 |
| Streaks | **Disconnected.** Nothing read a run of results | no reader of the win/loss run in `fights.ts`, `offers.ts`, `goals.ts` |
| Rankings, titles, media stories, career lines | **Worked** (5.4A, 5.1-5.3): upset, first loss, KO streak, unbeaten, comeback, title changes | `media/process.ts`, `media/narratives.ts`. Missing only: a slump and being stopped |
| Offers and rival behaviour after a result | **Disconnected.** Offers ignored form | audit: offered fighters' momentum -4.5 vs -1.9 roster average |
| Camp, manager and rival-promoter reactions | **Disconnected.** Relationships changed only for shows, cancellations and contested signings | `office/politics.ts` had no result hook |
| Post-fight player decisions | **Missing.** Only a "Result" message; the objective's Rebuilding goal was *suggested* but nothing prompted it | `office/goals.ts` |
| Retirement | **Age-only.** Nobody retired before 33 whatever their record; 9% of retirees had lost their last four | `systems/world.ts`; audit: 108 of 1,234 |

**Reused**: `processResult`, the media world's career entries and stories, `DevPlan`, career objectives and `opponentFit`, the fight negotiation (`approachOpponent`), the 5.4C offer generator, the relationship book, `promoRelations`, the weekly retirement draw, the office weekly pass and `once` guards. No second event processor, no new source of truth.

**Implemented**

- **Career context** (`fight/context.ts`). Small bounded multipliers (0.7-1.35) on the reputation, popularity, morale and confidence effects already computed, plus an additive momentum term, each with a plain reason: a prospect beating a stronger name; a veteran beating the odds (credited in standing) or winning as expected (little gain); an unbeaten fighter's first defeat; a heavy favourite beaten by a lesser name; a young fighter losing to a better one (softened); a veteran's defeat (morale softer, a famous name's fall costs standing); three wins or three defeats in a row. The reasons are stored on the result for the player's fights and shown on the fight page ("In context").
- **Offers follow form.** A player fighter on a strong run (momentum 50+) who fought in the last 14 weeks can draw an *Opportunity after a big win* proposal; any such fighter lifts rivals' chance of writing by 20%. A fighter on a bad run makes development-style step-up proposals more attractive to rivals. Both are tilts on the existing keyed roll, never guarantees.
- **Matchmaking after a setback.** A fighter with momentum -35 or worse has his camp object to a much bigger step up whatever his plan (unless on the accelerated plan); overriding it costs morale and trust as before.
- **Camp and rival reactions** (`office/politics.ts` `afterFightResult`, once per fight). A win in a real test warms the fighter's camp; a defeat in an obvious mismatch cools it. A rival promotion cools slightly when its favourite is beaten and warms to a close, well-matched fight; the reason is on the relationship.
- **Post-fight decisions** (`office/reviews.ts`, `ReviewsPanel`). Three kinds, only when their conditions hold: *breakout* (young fighter beat a clear favourite: fast-track or keep building), *setback* (heavy favourite lost, stopped, or a third defeat in a row: rebuild or back him), *rematch* (draw, split or majority decision: opens the ordinary fight negotiation or lets it go). At most one per fighter, six live, six-week expiry without penalty, recorded in the fighter's decisions. They act through the development plan, the Rebuilding objective, `approachOpponent`, morale and the camp relationship. They appear in the Office, on the fighter's profile and as one inbox message.
- **Careers that stop working** (`wornDownChance`). From 30, with 8+ fights and a rating under 55, four or more defeats in a row (or two years without a contract and without a fight) add a small weekly chance of retiring, inside the existing draw. Rated 55+ and champions are untouched; records, history, reigns and fights are kept as before.
- **Stories.** New career lines *Slump* (a third and fifth defeat in a row) and *Stopped by X* (a stoppage loss that mattered), derived from the record and the result.

**Save/migration**: no version change (still 12). `office.reviews` and `FightResult.notes` are optional and absent in older saves, read as empty, and created only by writes (tested: a v12 save without them loads and plays on).

**Measured** (before = 5.4C commit ed178cc; after = this phase; same seeds):

| | before | after |
|---|---|---|
| Passive worlds, 6 seeds x 10 years: retirements | 1,234 | 1,278 |
| ...mean retirement age (youngest) | 35.8 (33) | 35.4 (30) |
| ...retired aged under 35 and rated 60+ | 111 | 97 |
| ...retired after losing their last four | 108 | 135 |
| ...mean rating of the retired | 57.3 | 56.6 |
| Upset win, reputation / popularity gained (prospect, prime, veteran) | 4.0/5.8, 3.9/6.1, 3.9/6.2 | 4.3/6.6, 3.9/6.3, 4.3/6.4 |
| Shock defeat, reputation lost (prospect, prime, veteran) | 3.5, 3.8, 3.9 | 4.1, 4.4, 4.7 |
| Rated pool and activity (world audit, 5 seeds x 12 years) | 320 active, 8 rivals, 22 retire/yr | 319 active, 8 rivals, 23 retire/yr |
| Title audit (`phase54-contention.ts 5 5`) | problems 0 | problems 0 |
| Title and 12-round fights that go the distance (3 seeds x 6 years) | 152 of 830 | 142 of 818 |
| Offers per seed-year, balanced bot answering | 1.5 | 3.3 (the world also differs: 18% more rival-weeks traded and more rolls; the form tilt is capped at +20%) |
| Weekly tick (unit benchmark, limit 10x) | 8.5-9.4x | 8.5-9.7x (four idle runs; wall 22-39 ms per week) |

Honest reading: the stage-aware effects are deliberately modest (about 10-20% either way) because the underlying expectation-based model was already
sound. The retirement change moves the careers of modest, beaten fighters, not the top of the sport. Title fights going the distance only 17-18% of the
time is a property of the existing sim (unchanged by this phase), which is why the championship browser suite's "at least one fight went 12 rounds" check
can fail on a fixture whose few distinct pairings are all stopped (it did, on both fixture worlds tried, with 300/301 and 155/156 other checks passing).

## Career-loop audit and mandatory-challenge integrity (Phase 5.5, no schema change)

**Defect found and fixed: mandatory orders the rules could not let the pair fulfil.** `maintainTitles` named a mandatory challenger from the top qualified entry of a
ranking list and left the order standing until its deadline, but `bodiesFor` (which decides whether a bout between two fighters is a title fight for a given belt)
also requires the challenger to be inside the body's challenger limit, not to hold a higher belt, and not to be better contested for a higher belt (a bout is for the
highest level on the line). Reproduced by `scripts/audit/phase55-mandatory.ts` (6 seeds x 6 years, passive): **161 orders (about 4.5 a year) became unreachable, 2,257
of 23,289 order-weeks (10%), and 40 of the 152 that ended did so by the champion being stripped for "refusing a mandatory defence"** that no booking could have
satisfied. Causes: 99 the pair would now contest a higher belt (usually a vacant world belt), 41 the challenger had slid beyond the limit, 21 the challenger now held a higher
belt. On the player's side this showed as an "Ordered by the board" request that opened an ordinary 10-round fight.

Fix (deterministic, `media/titles.ts`): a new order is only named for a challenger who can meet the champion for that belt; an eliminator winner likewise. A standing order
that can no longer be staged for that belt, with no title-flagged fight already booked between the pair, is withdrawn with a plain reason (`MANDATORY_VOID`: news, inbox
message for the player's side, narrative resolved) and the champion is not penalised; a booked fight is always left to run, and an order that *can* still be staged is
untouched, so a champion who really refuses is still stripped. The title path only calls a challenger "mandatory" when the order is reachable.
After the fix: 14 transient orders in the same sample (all inside the two-week media cadence), none ending in a strip, none outstanding at the end.

**Championship browser coverage.** The failing check ("at least one championship fight went the full 12 rounds") asserted a simulation outcome: only about 17% of title
fights go the distance and an attempt replays the same pairing and fight number, so a run can legitimately see only stoppages. It now asserts per fight that the
outcome is consistent (stoppage inside 12 or a 12-round decision), reports the distance count as information, and the distance path is covered deterministically by
`phase55.test.ts` (120 fixed seeds, both endings required). The simulation is unchanged. The venue suite's skipped editable-event check was missing coverage (the fixture
had no show still being built); the fixture now guarantees one and the 3 checks run.

**Long-career audit** (`scripts/audit/phase55-career-loop.ts`, 4 passive seeds x 12 years; 3 bot seeds x 10 years): see the final report for numbers. Findings: world
coherence audit clean; fighters idle over a year among those under contract 1.7-1.9% for rivals; rivals defunct 6-8% of rival-samples with 0.3-1.1% in negative cash; vacant
belts 30% (as accepted in 5.4A); 39-40% of young low-fight debutants reach contender level within eleven years and 35-36% world level; 18% never get a contract (free agents,
they retire by age); retired fighters keep their record and reigns. Bot promotions: the balanced bot goes bankrupt in roughly half of worlds in every version back to 5.3
(roster attrition then fixed overheads; see the report), so this is not a regression of this phase.

**Phase 5.5 verification.** Unit/integration 647 passed, 5 skipped (env-gated e2e/careers/bench suites), 0 failed; browser suites all green (championship 158/0 with the distance path reported as
not exercised by that run; venues 113/0 with the previously skipped check now running; business 221/0). Weekly tick 8.3-9.0x (limit 10x). Balanced-bot viability at year 8 (8 seeds each):
5.3 6/8 solvent, 5.4A 2/8, now 3/8 - a bimodal outcome (roster attrition, then fixed overheads of about 217k a year) that pre-dates this phase and is a candidate for the next one.
