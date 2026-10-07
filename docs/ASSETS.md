# Visual assets & presentation (Phase 4.8 / 4.9)

## Principles
- **Presentation never changes the simulation.** The engine decides a fight before the first bell; the live screen only replays the recorded `ResultView`. Watch / Key moments / Quick sim differ only in dwell time (`src/presentation/fightPlayback.ts`, pure functions, no RNG, no writes). Tested in `src/engine/phase48.test.ts` (state + results byte-identical across modes) and `scripts/browser/phase48.mjs` (same final stats/history/result in every mode).
- **The UI never knows filenames.** It asks `src/assets/registry.ts` for "the portrait of fighter X", "the image for this venue", "the poster template for this show", "the image for this news item".
- **Never a broken image.** Every lookup resolves to a real file or a described fallback (silhouette + initials + division colour; tier-specific venue backdrop; generated promotion monogram; category gradient for news). The UI only requests files the manifest declares, so missing art costs zero requests.
- **Hidden attributes cannot reach imagery:** fallbacks use only name, division and id; posters/cards are built from the same leak-safe views (`FighterView`, `eventPosterView`).

## Layout (`public/assets`, served as static files, not bundled in JS)
```
fighters/profile|action|celebration/{id}.webp   (+ {id}@thumb.webp for profile)   none shipped
venues/{kind}.svg                                9 shipped
promotions/logos/{id}.svg, banners/{id}.webp     none shipped (monogram fallback)
events/templates/{template}.svg                  8 shipped (poster backgrounds)
news/{kind}.svg                                  16 shipped
ui/ring-ropes.svg                                1 shipped
manifest.json                                    generated: id, type, entity, path, dimensions, format, status
```
`node scripts/assets/generate.mjs` regenerates the placeholder SVG art and the manifest (≈74 KB total). To add real art, drop a file at the manifest path; for fighters/promotions add the entity id to the class's `ids` list (or call `registerFighterArt` / `registerPromotionArt` at start-up).

| Class | Expected size | Format | Notes |
|---|---|---|---|
| fighter.profile | 480×600 (thumb 96×120) | WebP | lists use thumbs, profiles use full size |
| fighter.action / celebration | 960×540 | WebP | optional; partial sets fine |
| promotion.logo / banner | 256×256 / 1200×300 | SVG / WebP | |
| venue | 800×450 | SVG/WebP | nine looks: local hall, sports centre, theatre, regional arena, national arena, major arena, stadium, outdoor stadium, international |
| event template | 800×1000 | SVG/WebP | Fight Night, Championship, Rivalry, Main Event, PPV, International, Next Generation, Big Event |
| news | 640×360 | SVG/WebP | 16 categories |

## Event posters
Assembled, never per-event art: template background + both main-event portraits + promotion mark + venue image + title/date/location + badges (PPV, sold out, title fight slot reserved for the rankings phase). Template choice is `choosePosterTemplate` (priority: championship → PPV → international → rivalry → next generation → big venue → main event → fight night).

## Dev gallery
`#/assets` (development builds only; compiled out of production): every class with entity, id, file, declared/measured size and loaded/missing/fallback state.

## Motion, audio, accessibility
- Motion is restrained and all of it stops under `prefers-reduced-motion` (global rule + no shake class + counters jump).
- Audio reuses the existing `AudioManager`: new game events `fight.round / fight.knockdown / fight.finish` map to existing cues; the earlier `fight.result` event is marked `presented` so cues are not doubled. Nothing is conveyed by sound alone.
- Live fight screen: keyboard-operable buttons/tabs with roles and labels; at ≤860px stats/rounds/commentary become tabs.

## Known limits
No real portrait/logo artwork ships (silhouettes everywhere); stamina is not recorded by the simulation so it is not shown; "round control" is the latest round's landed-punch share (display only); no standing-count animation because the engine does not record counts.


---
# Phase 4.9 additions

## Why the hosted preview fell back to generated art (audit result)
The 4.8 registry built correct relative URLs (`assets/venues/x.svg`) for the preview, but the preview was published as a single HTML
file: **no asset files were published next to it**, so every request 404'd and `Img` correctly fell back. Fix: the preview is now
published with its static files (`scripts/preview/files.mjs` lists them; published paths are `assets/...`, the same path the registry
resolves under the preview's relative base). `assetUrl(path, base)` handles `/`, `/sub/`, `./` and `''`. Verified by serving the
assembled preview with its files from a plain static server (20/24 venue images loaded on first paint, remainder lazy, 0 fallbacks) and by
listing/reading the files back from the hosted artifact. No base64 inlining of art.

## Naming and hierarchy (single source: `src/assetgen/naming.ts`)
```
fighters/profile/fighter_{id}_profile.webp   fighters/action/fighter_{id}_action.webp   fighters/celebration/fighter_{id}_celebration.webp
promotions/logos/promotion_{id}_logo.webp    promotions/logos/promotion_{id}_mark.webp
venues/venue_{id}.webp   news/news_{kind}.webp   events/templates/poster_{template}.webp   ui/
```
Resolution order: generated file for the entity → shared shipped SVG look for the venue/news kind → generated gradient/silhouette/monogram.
**Worlds:** fighter ids are not unique across worlds (the same id is a different person in a different seed), so fighter art is bound to
the world it was generated for (`manifest.artWorld.seed`). It only shows in a game created with that seed; the title screen offers an
"Illustrated world" button once any fighter art exists. Venue and rival-promotion ids ARE stable across seeds, so their art works everywhere.
The player's own promotion keeps the logo they design at the title screen (it is their identity), so it is not generated.

## Generation pipeline (offline; the game and `npm run dev/build` never call a provider)
```
npm run generate-assets -- --dry-run          # report only: writes nothing, generates nothing
npm run generate-assets -- --plan             # (re)write asset-pipeline/generation-manifest.json, preserving statuses
npm run generate-assets -- [--batch-size 25] [--missing] [--force] [--yes] [--require-review] [--type fighter.profile,venue]
npm run generate-assets -- --approve [assetId …]   # PENDING_REVIEW → COMPLETE
npm run generate-assets -- --sync             # publish COMPLETE assets to public/assets/manifest.json
```
Provider (env only, no keys in the repo): `IMAGE_GEN_PROVIDER=openai-compatible`, `IMAGE_GEN_API_KEY`, `IMAGE_GEN_BASE_URL`,
`IMAGE_GEN_MODEL`, optional `IMAGE_GEN_COST_PER_IMAGE`. Without them the CLI refuses to generate (exit 2) and the game is unaffected.
Interface: `ImageGenerationProvider { checkStatus(), generateImage(), generateBatch() }` in `src/assetgen/provider.ts`.
Safety: batches default to 25; anything larger needs `--yes` (or typing "yes"); a cost summary prints first; three consecutive failures stop a run.
Resume: the manifest is saved after every image; an interrupted run restarts with the remainder (stuck `GENERATING` → retried); completed
assets are never selected again unless `--force`.
Priority classification uses public data only (`src/assetgen/classify.ts`): PREMIUM = player-owned, main-event fighters, top reputation,
repeat rivals (champions once title data exists) → profile+action+celebration; IMPORTANT = strong contenders/unbeaten prospects → profile+action;
STANDARD → profile; GENERIC (journeymen, retired, background) → silhouette fallback, no art.
Prompts describe fictional people/places only and forbid text, logos and watermarks.
Optional post-processing (thumbnails via `sharp`) is not bundled; without it lists use the full image lazily.

## Recorded fight data (deterministic, no extra RNG draws)
`RoundRec.e` energy 0–100 `[A start, A end, B start, B end]`, `.m` momentum `[start,end]` (−100…100), `.c` knockdowns `{s, g, n, u}`
(fighter down, segment, referee count reached, got up). Counts are derived from the sim's own recovery probability, never drawn, so the
random stream and every outcome are unchanged (`src/engine/fight/golden.test.ts` pins a digest captured before the change). Older saves simply
lack these fields: the screen shows "not recorded" and a plain KNOCKDOWN banner — nothing is invented.

## Title contract
`Fight.title?: { name, tier }` (regional | national | international | world) is the only source of title status. `FightView.title`,
`EventPosterView.title/championship` and the Fight Night bar read it; nothing sets it before the rankings phase.
