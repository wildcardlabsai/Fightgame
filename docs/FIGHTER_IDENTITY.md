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

## 7. Photographic portraits (status: pipeline ready, pilot NOT generated)

**Requirement:** replace the cartoon-style procedural illustrations with photorealistic portraits of fictional boxers.

**Blocker (verified, not assumed).** This environment has no image-generation capability: no `IMAGE_GEN_*` or other provider credentials, no GPU (4 CPU cores, 15 GB RAM), and outbound access is limited to package registries — `huggingface.co`, `civitai.com`, `api.openai.com` and `download.pytorch.org` all fail to connect, and no photoreal face model is installable from PyPI. I therefore generated **no** photographs and shipped none. The cartoon pool remains the active art and is *not* a solution to this requirement; the build is unchanged for players.

**What was built so the pilot can be produced the moment a provider exists** (nothing here draws images itself):

* `scripts/assets/portrait-photos.ts` — offline, resumable pipeline using the existing provider contract (`IMAGE_GEN_PROVIDER=openai-compatible`, `IMAGE_GEN_API_KEY`, `IMAGE_GEN_BASE_URL`, `IMAGE_GEN_MODEL`). Commands: `--plan [--world SEED --weeks N]` (priority order + prompts, no provider needed), `--pilot` (slots 0–24), `--generate --limit N`, `--slots`, `--redo` (the only way a finished file is overwritten), `--approve` / `--reject`, `--activate`, `--contact-sheet out.png`, `--check`.
* **Format:** `public/assets/portraits-photo/pNNNN.webp` 480×600 (4:5, q80) and `pNNNN_t.webp` 96×120 thumbnails (q72), ≈25–40 KB + 4 KB each (360 ≈ 10–14 MB; `--check` enforces a 12 MB budget). Record: `photos.json` (hash, prompt hash, provider/model, status `pilot|approved|rejected`); summary in `manifest.json → portraitPhotos` (`approved` slot list, `active` flag). The record is written after every image; failures are recorded and retried, completed slots are skipped.
* **Prompt:** one per slot, deterministic from the slot's trait spec plus an age 20–38: media-day studio portrait, 85 mm, soft key + rim light, charcoal background, natural skin texture, no text/watermark/logos/belts/gloves, "not resembling any real person".
* **Priority order** (`--world`): the player's contracted fighters, champions, ranked/mandatory/eliminator contenders, main-event or high-reputation fighters, prospects, everyone else — mapped to slots with the same function the game uses.
* **Registry:** dormant until `portraitPhotos.active`. When active, an approved slot shows its photograph (thumbnail in lists); a slot with no approved photograph shows the **silhouette**, never a cartoon, so styles are never mixed. Missing/failed files still fall back to the silhouette.
* **Distinct portraits per career:** `assignPortraitSlots` (used by the game via `setPortraitRoster`) gives every fighter in a world a different slot while the pool is large enough (316 fighters, 360 slots → zero repeats); fighters are processed in creation order, so existing fighters never change slot when newcomers arrive; if a world outgrows the pool, every slot is used once before any is used twice. Presentation only: no saves, ids or simulation are touched. (Browser check: one screen never shows the same face twice.)
* **Tests:** `src/engine/portraitPhotos.test.ts` uses a test double (tiny PNG into a temp folder, never shipped) to prove resumability, failure retry, no overwrite, approval gating, manifest sync, tamper detection, dormant/active registry behaviour and slot distinctness.

**Recommended route to finish.** (1) Either give the environment a provider (an OpenAI-compatible image endpoint set via the four env variables, plus Network access to that host), or run the pipeline on a machine that has one — the repo is the same; commit the output. (2) `--pilot`, then `--contact-sheet pilot.png --only pilot`, review for realism/artefacts (ears, teeth, eyes, uniform lighting), `--reject` the bad ones and `--generate` again. (3) `--approve 0-24`, `--check`, screenshot the app, then scale in priority order with `--generate --world <seed> --weeks 104 --limit 60`. (4) `--activate` only once most of the visible roster is covered; remaining uncovered slots show silhouettes. (5) Publish: ~400 files exceed the hosted preview's 255-per-publish limit (`scripts/preview/files.mjs` batches), and 10+ MB should be checked against the host's budget. Open risks: provider output consistency across 360 prompts and face-artefact rate (budget a reject/redo rate), and licensing terms of the chosen model for commercial game assets.

## 8. Replicate provider (FLUX.2 [pro]) — wired, NOT yet connected or run

**Status:** `src/assetgen/replicate.ts` is implemented and unit-tested against a scripted HTTP double. It has **never** been run against the real service: this sandbox cannot reach `api.replicate.com`, and no token exists here. The request/response details below come from Replicate's published API pages and model schema as summarised by a web search (the pages themselves were not reachable from here), so run `--provider-check` once before spending anything.

| | |
|---|---|
| Provider switch | `IMAGE_GEN_PROVIDER=replicate` |
| Required env | `REPLICATE_API_TOKEN` (your Replicate API token; read from the environment only) |
| Optional env | `REPLICATE_MODEL` (default `black-forest-labs/flux-2-pro`), `REPLICATE_COST_PER_IMAGE` (USD, overrides the estimate) |
| Model | `black-forest-labs/flux-2-pro` (FLUX.2 [pro], official model: no version id needed) |
| Request | `POST https://api.replicate.com/v1/models/black-forest-labs/flux-2-pro/predictions`, `Authorization: Bearer …`, `Prefer: wait=60`, body `{"input": {prompt, aspect_ratio:"custom", width:832, height:1040, seed, output_format:"png", safety_tolerance:2}}` |
| Response | prediction `{id,status,output,error,urls.get}`; non-terminal → polled on `urls.get` (api.replicate.com only) every 2 s up to 5 min; `429` → waits `retry_after` (≤30 s), up to 4 tries |
| Output | per the model schema a single string (URI) — the adapter also accepts a list, `{url}` or a data: URI; the https file is downloaded **without** the token, immediately (delivery URLs expire), re-encoded to 480×600 / 96×120 WebP by the existing pipeline |
| Live schema guard | before the first paid call the adapter reads the model's input schema (free GET) and drops any input it does not declare |
| Secrets | the token is never logged, written or included in errors (`scrub`); `.env`/`.env.*` are git-ignored |

**Cost estimate, 25-image pilot.** Replicate's published FLUX.2 [pro] price is a base of $0.015 plus about $0.015 per output megapixel; third-party trackers quote $0.03–$0.055 per 1 MP image. A 832×1040 portrait is 0.87 MP, so **about $0.75–$1.40 for the pilot** (the script prints `up to $1.38` using $0.055 as the conservative figure). Redos of rejected images cost the same each. Confirm the current price on the model page first; Replicate bills the account behind the token.

**Run it.**

```bash
export IMAGE_GEN_PROVIDER=replicate
export REPLICATE_API_TOKEN=…                       # do not paste it into files or chat
npx tsx scripts/assets/portrait-photos.ts --provider-check     # free: token accepted, live schema as expected
npx tsx scripts/assets/portrait-photos.ts --plan --show 3      # read the prompts
npx tsx scripts/assets/portrait-photos.ts --pilot              # prints the cost estimate and stops
npx tsx scripts/assets/portrait-photos.ts --pilot --yes        # generates slots 0–24 (resumable; re-run to continue)
npx tsx scripts/assets/portrait-photos.ts --contact-sheet pilot.png --only pilot
```

Nothing is activated: the pilot files are recorded with status `pilot`, only `--approve` marks a slot approved, and `--activate` is a separate explicit step. Until then the game keeps its existing artwork. Resumability, per-image record/manifest updates, retries (3 per slot with back-off), `--redo`, `--approve/--reject`, the contact sheet and the 12 MB budget are unchanged.

## 9. Pilot photographic portraits from a supplied contact sheet (status: ingested, NOT approved, NOT active)

Artwork source: one 1586×992 contact sheet of 24 fictional boxer portraits generated in ChatGPT and supplied as an image file (no provider, API or credentials involved). It is kept **unchanged** at `asset-pipeline/portrait-source/pilot-sheet-1.png` (sha-256 in `pilot-sheet-1.source.json`; outside `public/`, so it is not shipped). Provenance of the generator beyond "supplied artwork" is not recorded and the images carry no usage-rights information: confirm the terms that apply to using them in a commercial game.

**Workflow** (no generation, no inpainting, plain crops only):
1. `python3 -I scripts/assets/portrait_ingest.py extract asset-pipeline/portrait-source/pilot-sheet-1.png` — grid in `pilot-sheet-1.grid.json` (divider bands found by variance analysis, then checked against an overlay: columns 197–202, 394–400, 591–596, 791–795, 988–993, 1186–1191, 1385–1390; rows 327–331, 646–650), 2 px inset so no divider or neighbour can bleed in. Writes native-resolution `tiles/` and exact-4:5 `crops/` (full tile width, window positioned from the top of the head) plus `pilot-sheet-1.tiles.json` with automatic flags (head touches top, edge bleed, near-duplicates).
2. `npx tsx scripts/assets/portrait-photos.ts --ingest-sheet pilot-sheet-1.png` — decisions come from `pilot-sheet-1.review.json`; accepted crops take the lowest free slots, are encoded to `pNNNN.webp` 480×600 (q80) and `pNNNN_t.webp` 96×120 (q72) and recorded in `photos.json` as `pilot` with their source tile and crop hash; rejected crops get no slot and no file. An existing slot is never overwritten. Re-running is a no-op.
3. Review `docs/identity/photo-pilot-contact-sheet.png`, then approve: `--approve 0-22` (or a chosen subset), `--check`, and only then `--activate`.

**Result:** 24 tiles cut, **23 usable, 1 rejected**. Rejected: `r0c0` (the face fills the tile width so the left ear is clipped and the beard runs off the bottom). Library size **466 KB** for 23 portraits plus thumbnails (budget 12 MB). Zero automatic flags (no edge bleed, no near-duplicates).

| Slot | Source tile | Note |
|---|---|---|
| 0 | r0c1 |  |
| 1 | r0c2 | borderline: the goatee tip touches the bottom edge |
| 2 | r0c3 | likeness check needed: red hair, freckled fair skin and stern pose may read as a real professional boxer; recommend NOT approving unless you are satisfied it is fictional |
| 3 | r0c4 |  |
| 4 | r0c5 |  |
| 5 | r0c6 |  |
| 6 | r0c7 |  |
| 7 | r1c0 |  |
| 8 | r1c1 |  |
| 9 | r1c2 |  |
| 10 | r1c3 |  |
| 11 | r1c4 |  |
| 12 | r1c5 | borderline: the beard is slightly clipped at the bottom edge |
| 13 | r1c6 |  |
| 14 | r1c7 |  |
| 15 | r2c0 |  |
| 16 | r2c1 |  |
| 17 | r2c2 |  |
| 18 | r2c3 |  |
| 19 | r2c4 | borderline: the beard is slightly clipped at the bottom edge |
| 20 | r2c5 |  |
| 21 | r2c6 |  |
| 22 | r2c7 |  |

**Honest limitations**
* **Resolution.** Each portrait is only ~188×235 px in the sheet. The 480×600 files are upscaled about 2.5× (Lanczos, no sharpening or AI upscaling), so they are visibly soft at the 240×300 profile size and on high-DPI screens. They are fine in lists and cards. Final-quality assets should be generated individually at ≥1024 px; the same `--ingest` route takes them (one image per tile of a 1×1 grid, or a `--sheet` of any grid).
* **Framing.** The sheet's 0.59 aspect holds head and shoulders; the game's 4:5 window keeps the whole head and ears but little shoulder. Three borderline crops lose a little beard at the bottom edge (r0c2, r1c5, r2c4; recorded in the review file).
* **Likeness.** Tile r0c3 (red hair, freckled fair skin, stern pose) may read as a real professional boxer. Recommended: do not approve it unless you are satisfied it is fictional. No other tile was flagged, but this is a visual judgement, not a check.
* **Coverage.** The pool has 360 slots and the pilot fills 23, so once activated a fighter whose slot has no approved photograph shows the silhouette (never a cartoon). Until activation the game is unchanged.

**Verification (production build, base `/play/`, pilot temporarily approved + active with the pool size set to 23 so every fighter maps to a photograph; the committed manifest was restored afterwards):** `scripts/browser/photo-shots.mjs` 18/18 — photographs load (naturalWidth > 0) in roster, profile, matchmaking, event card and the fight page at 1280 and 390 (thumbnails in lists, full file on the profile), same file on every screen, silhouettes when every photograph is blocked, no failed asset requests. Screenshots: `docs/identity/photo-pilot/`. Tests: `src/engine/portraitPilot.test.ts` (provenance, slots, 480×600 / 96×120, budget, nothing approved/active).

## 10. Next batch (individual high-resolution images)

See `docs/PORTRAIT_BATCH_1.md`: priority list, slot caveat, pilot replacements, `slot-NNNN.png` naming, `--ingest-incoming` workflow, dimensions and the resolution/approval rules.
