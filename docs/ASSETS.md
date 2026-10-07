# Visual assets & presentation (Phase 4.8)

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
