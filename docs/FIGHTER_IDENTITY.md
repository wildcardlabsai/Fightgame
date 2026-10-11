# Fighter identity, portraits and championship visibility

Scope: names, portraits, and title information in matchmaking. No change to attributes, records, contracts, titles, histories, ids, saves, the title-fight rules or the simulation stream of any existing seed.

## 1. Audit summary (what already existed)

| Area | Finding |
|---|---|
| Name generation | `generateFighter` drew `rng.pick` from 8–16 first/last names per nation (19 nations). 400 fighters gave ~140 distinct surnames and ~50 duplicate full names per world. |
| World size | 316 fighters at career start (134 AI-roster, 4 own, 170 free agents, 8 established names), plus the demand-driven intake. |
| Ids | `f_<counter>` from the per-state `IdGen`; unique inside a world, **not** across worlds. |
| Portraits | `FighterPortrait` → `registry.resolveFighterImage` → world-bound generated art (`artWorld.seed`) → silhouette. The manifest held **zero** fighter art; every fighter was a silhouette. |
| Titles | Authoritative records are `media.titles[body|division]` (`c` champion, `mand`, `elim`), ranking lists (`getList`), closed reigns (`getReigns`). `bodiesFor` is the single rule the scheduler uses to flag a title bout. Fight cards already carried `stake`; matchmaking carried none. |

## 2. Names (new careers only)

* `src/data/namePools.ts`: heritage groups per nation (a nationality is where someone boxes from, not one ethnicity), 25–70 given names and 40–100 surnames per group; the old names stay at the head of each pool.
* Selection draws the **same two uniforms** the legacy generator drew, so the simulation stream — and every attribute — is identical to before. Rank-tapered selection (head about 3× the tail). 7 % cross-group surname for multi-group nations.
* Duplicates: a per-world `takenNames` set; a collision re-derives the surname (then the given name) from a hash of the same two uniforms — deterministic, no extra RNG. Surnames may still be shared. A block-list skips famous real champions.
* Flag: `GameState.widePools` (optional) is set on new careers. Older saves have no flag and keep drawing newcomers from the legacy pools; nobody is renamed; no migration.

Measured (20 seeds, mean per world):

| Fighters | Pools | Unique full | Unique surnames | Unique given | Duplicate full names | Max shared surname |
|---|---|---|---|---|---|---|
| 400 | legacy | 347 | 140 | 138 | 52.6 | 14 |
| 400 | wide | 400 | 301 | 273 | 0 | 6 |
| 600 | legacy | 487 | 156 | 152 | 113 | 19 |
| 600 | wide | 600 | 400 | 355 | 0 | 9 |
| 1000 | legacy | 717 | 165 | 162 | 283 | 27 |
| 1000 | wide | 1000 | 541 | 466 | 0 | 14 |

`npx tsx scripts/audit/identity-names.ts` reproduces this.

## 3. World size

Benchmarks (one seed, 104 weeks; free-agent pool size is the only change): 

| Free agents | Fighters at start | ms/week | Save size |
|---|---|---|---|
| 170 | 316 | 27.5 | 1.98 MB |
| 300 | 446 | 31.6 | 2.19 MB |
| 450 | 596 | 37.0 | 2.46 MB |
| 600 | 746 | 40.8 | 2.65 MB |

Proposal: **+130 free agents (446 total, +41 %)** for about +15 % per-week cost and +10 % save size. I implemented it (own RNG stream, drawn after everything else, so the original 316 fighters, ids and `rngState` are bit-identical; `marketDepth` option) and ran the whole suite. **It is shipped OFF (`marketDepth` default 0)**, because even from a separate stream the extra fighters feed the AI market and moved ten simulation-dependent tests: the pre-4.9 golden digest, phase3 save/replay, phase54 title integrity (a "moved up" reign closing without a higher belt), phase54b ×2, phase54titles, phase65 ×2 (eliminator/vacant-belt staging), phase9 forecast, and longrun's state-size budget (3.61 MB vs 3.5 MB). Those look like world drift plus one possible latent title-integrity edge, and they need their own investigation and approval rather than a silent re-baseline. To trial it: `createNewGame({ …, marketDepth: 130 })`.

Net effect shipped: names, portraits and title visibility change **no** simulation behaviour (verified: with only the wide name pools the full suite had one failure, a file-size budget for assets, which is a fixture matter).

## 4. Portraits

**Honest status:** the environment has no image-generation model. The shipped portraits are **original procedural vector illustrations** (stylised, not photographic, not AI-image output), generated offline by `scripts/assets/portraits.ts` from a seeded spec: skin tone (10), face width/jaw/chin, 12 hair styles, 11 hair colours, 7 facial-hair types, eyes, brows, 6 expressions, scars/marks, kit. Skin tone is independent of nationality and every game attribute. No likeness of a real person; no third-party code or images; ~3.7 KB each.

* **Pool:** 360 distinct faces, `public/assets/portraits/pNNNN.svg` (1.9 MB raw), described by `portraits/pool.json` (per-file hash) and `manifest.json → portraitPool`.
* **Mapping:** `portraitSlot(fighterId, worldSeed) = hash(seed|id) % count` — nothing that changes in a career (age, division, rank, contract) is an input, so the face is identical on roster, profile, matchmaking, event cards, Fight Night, rankings, news, across weeks and reloads. Ids repeat across worlds, so the seed is part of the key.
* **Resolution chain** (`registry.resolveFighterImage`): world-bound generated art (existing pipeline, takes precedence) → pool portrait → silhouette. `Img` falls back to the silhouette if a file fails to load, so a missing asset never blocks a screen.
* **Offline, resumable workflow:** `npx tsx scripts/assets/portraits.ts [--count N] [--batch N] [--check] [--force]` — skips files whose hash matches, writes at most `--batch` per run, re-run to continue, `--check` detects missing/orphan/mismatched files and manifest drift.
* **Dev / production / preview:** files live under `public/assets`, resolved with `assetUrl` (honours `BASE_URL`, `./`, `/play/`). Verified on the real `vite build --base /play/` output. The hosted preview publishes `public/assets/**` automatically; with ~400 asset files it needs more than one publish (limit 255 files per publish).
* **Priorities:** because every fighter resolves through the shared pool there is no per-fighter backlog. Bespoke per-fighter art (champions, contracted fighters, rivals, prospects, in that order) remains the existing `assetgen` pipeline, which wins in the chain when a provider is configured.
* **Remaining:** repeats are possible (316 fighters / 360 faces; measured max 6 fighters share a face, ≥55 % of the pool is used). Grow the pool with `--count 600`. These are stylised illustrations; photographic-quality portraits need an external generator via `assetgen`.

## 5. Championship visibility

`src/engine/business/titleStanding.ts` (read-only, public facts only):

* `standingIndex(state)(id)` → role `champion | mandatory | eliminator | contender | former | unranked` from live title records, stored orders, sanctioning-body ranking lists and closed reigns. Never from reputation or fame. Multi-belt holders list every belt.
* `boutTitleView(state, a, b)` → whether the bout *could* be for a belt, using `bodiesFor` (the scheduler's own rule) and the ordered-eliminator rule; belts, level, vacancy, mandatory flag; and, when a champion is involved and it is not for the belt, the factual reason (not ranked / outside the challenge range / not yet a credible challenger). A test books 50+ real fights and checks the view equals what `flagFight` does.

Shown in: matchmaking rows (standing chip + belt note), "Title bouts only" filter, comparison table ("Title picture" row), your fighter's chip, negotiation header (both fighters), fight-card slots (unfought bouts; the stake chip already existed), fighter profile header. Rules deciding a title fight are unchanged.

## 6. Verification

See the completion report in the session summary and `docs/identity/*.png` (matchmaking, compare, roster, profile, event card at 1280 and 390; new-career scouting; portraits-blocked fallback). Browser: `node scripts/browser/identity-shots.mjs` (17 checks). Tests: `src/engine/identity.test.ts` (24).
