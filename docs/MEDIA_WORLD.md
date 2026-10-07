# Fight Empire — The Living Media World (Phase 5)

The media world turns what the engine already does into things the sport talks about. It is a **consequence layer**:

```
Engine truth (fights, events, contracts, ledger)
      ↓  world event (structured facts)
Media: significance → coverage → stories / video / viral
      ↓
Narratives, rivalries, rankings, titles
      ↓
Popularity · media interest · fanbase · reputation
      ↓
Commercial consequences (demand, broadcast offers) → future gameplay
```

Nothing here decides a fight, an event result, a contract or a pound. The UI never writes to media state: every player decision goes
through `engine/media/commands.ts` and every screen reads `engine/media/views.ts`.

## Where things live

| Concern | Location |
|---|---|
| Identity (names, colours, logo keys) | `src/data/mediaIdentity.ts` |
| Behaviour (style, thresholds, reach, ranking methodology) | `src/engine/media/orgs.ts` |
| Dynamic state (audience, credibility, relationships, stories…) | `GameState.media` (`engine/media/types.ts`) |
| Pipeline | `engine/media/process.ts` (`processMedia`) |
| Significance + world events | `worldEvents.ts` |
| Story text | `copy.ts` (templates), `stories.ts` (coverage, retention) |
| Storylines + rivalries | `narratives.ts` |
| Popularity / interest / fanbase | `popularity.ts`, `persona.ts` |
| Rankings, sanctioning bodies, titles | `rankings.ts`, `titles.ts` |
| Video + viral | `videos.ts` |
| Requests + press conferences | `requests.ts` |
| Broadcast market | `broadcast.ts` |
| Awards + career story | `awards.ts`, `career.ts` |
| The only way back into the economy | `effects.ts` |
| UI gateway | `views.ts` (read), `commands.ts` (write) |

## MEDIA_IDENTITY / MEDIA_BEHAVIOUR / MEDIA_ASSET

An organisation is three separate things:

* **Identity** — `name`, `shortName`, `tagline`, brand `colour`/`accent`, `handle`. Held in an **identity pack** (`IdentityPack`).
* **Behaviour** — type (magazine, news site, video channel, podcast, journalist, influencer, broadcaster, ranking organisation), editorial style, influence, credibility, video reach, ranking authority, controversy bias, regional reach, coverage threshold, weekly cap, appetite for access, favoured story kinds. Held in `MEDIA_BEHAVIOURS` keyed by an **opaque id** (`ringside`, `fightwire`…). The engine never branches on a name.
* **Asset** — `logoAsset` is a key into the existing asset registry (or `null` → the generated monogram fallback). No new asset pipeline was added and nothing was generated.

Stories store ids, numbers and a shared fact record; headline/body are rebuilt from the facts at display time, so a pack swap changes
every name instantly and cannot change a single fact (tested).

### The default (fictional) ecosystem

| Id | Default name | Type | Character |
|---|---|---|---|
| `ringside` | Ringside Magazine | Magazine | Very credible, slow and serious; high ranking authority; favours titles, rankings, awards |
| `fightwire` | FightWire | News site | Breaking, fast, wide; first to publish |
| `fightwiretv` | FightWire TV | Video | Hype-led, huge video reach, viral potential |
| `fightroom` | The Fight Room | Video / debate | Controversy-seeking, strong engagement |
| `insideropes` | Inside the Ropes | Features | Interviews and documentaries; strong fighter relationships |
| `boxingdaily` | Boxing Daily | News site | Broad audience, covers a lot |
| `boxingpodcast` | The Boxing Podcast | Podcast | Long-form analysis |
| `worlddesk` | World Boxing Desk | News site | International (outside the UK/Ireland and the Americas) |
| `clipcorner` | Clip Corner | Influencer | Short clips, knockouts and viral moments |
| `boxingindex` | The Boxing Index | Ranking organisation | Numbers-driven independent ratings |

Broadcasters (`meridian`, `worldfight`, `ringpass`, `unionsports`, `globeintl`), sanctioning bodies (`atlas`, `pioneer`, `crown`)
and ranking lists follow the same split. **All are fictional.** None is, represents, or is endorsed by a real company; no real
logo, trademark, website or journalist name is used.

## What the engine does

### Significance
`fightSignificance` adds named, explainable parts — fame of the two fighters, where they are rated, title at stake, billing and
platform, venue size, rivalry, current media attention, unbeaten records, and (after the fight) upset size, stoppage, knockdowns,
closeness, an unbeaten record falling — then saturates smoothly to 0–100. Significance decides how many outlets cover it; each
outlet's threshold, favoured kinds, region, weekly cap and relationship with the people involved decide which. A routine win is
covered by one or two outlets; a title upset by up to six, and one may run it as **BREAKING** (at most two a week across the sport).

### Stories
`MediaStory` carries `facts`; **every sentence in a story is guarded by the fact it needs**. No quotes are ever invented, no injuries
are reported unless they were part of a public result (an injury stoppage), no private contract figure appears. Style picks the tone
(`neutral / loud / edgy / warm`) and how many sentences the outlet runs; a warm relationship can soften an outlet, a hostile one sharpen it.
Priority: `BREAKING / MAJOR / FEATURE / NEWS` (`RUMOUR` exists in the type but nothing produces it — see *Deferred*).

### Narratives and rivalries
Seventeen storyline types exist (rivalry, rising star, falling star, comeback, unbeaten run, championship hunt, mandatory challenge,
avoidance, call-out, controversy, prospect hype, title reign, legacy, retirement, upset story, KO artist, division dominance). Each is
opened by a real event, strengthened or weakened by later real events, fades each week, and **resolves or expires** (quiet-weeks and
max-weeks rules). Rivalry strength (0–100) comes from previous meetings, close or controversial results, knockdowns, call-outs, title
stakes and press conferences; it feeds back into fight appeal (≤ +6) and is shown wherever the fight appears.

### Popularity — five separate things
Public popularity (engine, drives demand) · media interest (fast to rise and fade) · fanbase · commercial value · sporting credibility.
A fighter can be elite and unknown, or famous and ordinary. Media interest decays toward a baseline with a ~8-week half-life (slower
for champions); viral spikes unwind linearly over six weeks; fanbase drifts slowly. Popularity cannot grow without limit (tested).

### Relationships
`−100…+100` per outlet and subject (a promotion or fighter): HOSTILE · COLD · NEUTRAL · POSITIVE · STRONG · EXCLUSIVE. They move with
request answers and press conferences, cool 1% a week, and change coverage likelihood and tone.

### Requests and press conferences
Outlets ask for interviews, podcasts, camp features, documentary access, promo videos and post-fight words (accept / decline / offer
another fighter). Before a show the player chooses an approach — Respectful, Confident, Aggressive, Controversial, Diplomatic. Effects
(show hype, rivalry, media interest, relationships, a chance of a flare-up) are deterministic, scaled by how well the approach suits the
fighter's **press persona** — read from the existing hidden personality, shown only once the player has uncovered it.

### Rankings, sanctioning bodies, titles
Five lists (`atlas`, `pioneer`, `crown` sanction titles; `ringside` is the headline media list; `index` is independent) rank every division
from public results with different weights (opposition quality, recency, activity, streak, titles, popularity, losses). Every movement
stores a reason code (`beat`/`lost`/`inactive`/`new`/`rose`…) that is rendered as plain language and cites a real fight.
Each sanctioning body recognises one champion per division (inaugural champions are the #1 of the first list; their earlier reign is
dated before the game, nothing about it is invented). A fight is a **title fight** only when the body's rules make it one; defences,
changes, vacancies, mandatory orders (after 40 weeks without a defence, 26-week window) and strippings follow from real results and
dates. AI promotions are nudged (never forced) to book champion v mandatory challenger.

### Broadcast market
Broadcasters price offers from the same public numbers as the player's forecast and shape them by reach, prestige and appetite. An
accepted offer fixes the event's broadcast option; at settlement it is paid **through the event ledger** (`receive`): guaranteed fee,
audience shortfall reduction, audience bonus, or a PPV share with a guarantee floor. `cash === ledgerArchive + Σ ledger` holds (tested).

### Awards and career story
A running year log picks the winners; eight awards, permanent, each with its figures. Career lines are recorded only from things that
happened (signings, ranking milestones, upsets, titles, awards…).

## Determinism and independence
* Keyed randomness only (`keyedRng(seed, …)`); never `Math.random`, never the game's RNG, never the game's id counter (media has its own `n`).
* `media.effects = false` turns the world into a pure observer. With coupling off, fighters, events, contracts, the ledger, ids and RNG
  are **byte-identical** to a run with no media pipeline (test); the only field media writes outside its block is `fight.title`
  (presentation metadata that no result reads).
* With coupling on, media pushes back through exactly three narrow, bounded channels: `fightAppeal` (+ buzz/rivalry), `eventInterest`
  (+ press-conference hype ≤ 7) and small popularity moves (≤ 1.5 per result, ≤ 4 viral, all unwinding).

## Cost
* The full pass runs every second game week; results are still read the moment they are on the books (commands call `processMedia`).
* Bulk records (rankings, careers, history, reigns, awards, finished storylines) are packed JSON strings, so the weekly state copy sees a
  handful of strings instead of thousands of objects. Live lists are capped (80 stories, 60 videos, 50 storylines…); minor stories expire.
* The weekly state copy now uses `cloneState` (a hand-written copy of plain data, ~3× faster than `structuredClone`), which more than pays for the media pass.

## Information boundary
The UI sees only `engine/media/views.ts`. No view carries attributes, potential, personality notes, private contracts or AI strategy
(tests scan the serialised views). The Promotions screen no longer shows a rival's internal strategy; it shows reputation tags earned from
counted behaviour.

## Licensed Media Integration (future — not implemented, not claimed)
Real organisations can be introduced **only after formal permission**. The architecture is ready; nothing below is enabled:

1. **Identity** — ship an `IdentityPack` with `licensed: true` and call `setIdentityPack(pack)`; names, shortNames, taglines, brand colours and handles change everywhere.
2. **Logos** — set `logoAsset` to registered asset keys; the asset registry resolves them with its normal fallbacks. Do not add logos without licence terms.
3. **Brand colours / editorial rules** — adjust the matching `MEDIA_BEHAVIOURS` entry (the id stays the same); style, thresholds and focus are data.
4. **Ranking authority** — a licensed ranking list replaces a `RankingOrg` entry (same id, new methodology/authority) and is labelled as such; its rules must then be implemented honestly, not approximated.
5. **Broadcast rights** — `BroadcastBehaviour` entries (reach, prestige, budget, carriage) map onto licensed broadcasters; deals still settle through the ledger.
6. **Sanctioning bodies** — real bodies imply real rules (purse bids, eliminators, interim belts, fees). None of these exist; adding a real name without them would be misleading.
7. Real journalist or personality names need separate permission and are never generated.

## Deferred (deliberately, and not faked)
Social feeds as a feature (followers/engagement are numbers on the profile; no feed UI), RUMOUR stories, SCANDAL / PROMOTER_RIVALRY /
INJURY_COMEBACK storylines, return from retirement, contract-dispute and weigh-in *negotiation* stories, merchandise, sanctioning fees,
purse bids, interim and unification mandates, eliminators, media-driven fatigue/time cost for interviews, and licensed content.

## Phase 5.1 — integration and integrity audit
An audit of the whole chain (fight → world event → story → ranking → title → narrative → career → award) with long simulations
(1–20 years, five strategies, several seeds, media on and off). Fixed:

* **Lists stay truthful between updates.** A belt that changed hands or fell vacant, and any retirement, now reseats every affected list at
  once (`reseatLists`): the sanctioned champion is rank 0, retired fighters drop out. Before, the old champion stayed "C" for up to 8 weeks.
* **Rivalries count real meetings.** A fight used to count as its own "previous meeting", so single fights opened rivalries and said "N fights".
* **Draws never name a winner**, and a drawn title defence is told from the champion's side and recorded on his career.
* **Invented reactions removed** ("fans left fuming", "a champion at last", "no defence from either man"); weigh-in headlines no longer speak of a fight that is over.
* **Storyline lifecycle.** One title hunt per division, never for a fighter who already holds a belt there; prospect storylines end on a title or after 18 fights; the storyline cap is 90 and the weakest storyline (not the oldest) is retired, with its outcome on the record.
* **Fight of the Year** belongs to both fighters. List movements are covered by one outlet (two for a title race) and do not lead the newsroom.

Observed, not tuned (media on versus off with the same seed): fighter popularity drifts down in the median (≈30 → 17 over 10 years, P90 ≈ 78, a few at 100)
with media off as well, so it is the engine, not the media layer. Media coupling does not change economic outcomes systematically
(8-year paired runs: better on two seeds, worse on one, level on one). Tick cost with media on is about +25–35% over a long run
(+80% in the first year while lists and storylines are built); save size +14%.

Known limits: career lines are a capped milestone timeline (28 per fighter, low-importance lines evicted first), not a bout-by-bout ledger;
the engine itself prunes old fights after the retention horizon. `tests: src/engine/phase51.test.ts`.
