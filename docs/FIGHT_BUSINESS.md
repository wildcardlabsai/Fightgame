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

See the table at the end of this file (filled from `scripts/audit/phase54-longrun.ts` and `scripts/audit/phase54-careers.ts`).

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
