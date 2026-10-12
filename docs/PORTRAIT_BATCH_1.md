# Portrait batch 1 — preparation (no portraits generated, nothing approved, photo pool inactive)

## 0. One thing to understand first: slots belong to a career, not to a fighter

A portrait **slot** (0–359) is a face in a shared pool. Which fighter shows it is `assignPortraitSlots(world seed, fighter ids)`: it is different in every career, and the same fighter id (`f_8i`) is a different person in another seed. So an image named `slot-0269.png` is "Tommy Hobbs" only in the reference world below. Two ways to use this batch:

* **A. Target a real career (exact).** Send me the seed (the "Report a problem" text shows `Seed: …`) or an exported save, and I run `--priority --save export.json` to list *that* career's fighters and slots. Casting then matches your game.
* **B. Build a general library (recommended long-term).** Make the images demographically varied and tag them with age/heritage/build in the sidecar; assignment stays hash-based (any fighter may get any face). A later, separate, presentation-only change could match approved faces to fighters by public traits (age, heritage group from the name pool, weight class); it is **not** done and would need your approval.

The game has no appearance data (no skin tone, hair or build fields), so "visual characteristics" below are casting guidance from public facts: age, division/height, and the heritage group of the name pool the fictional name came from (guidance only, not a fact; avoid stereotype and keep faces varied across the batch).

## 1. First 12 priority fighters — reference world

World: `--world promoter-ref --weeks 104` (a new ENG career advanced two years; 4 contracted fighters then the strongest champions; contenders and main-event fighters follow from rank 13). Reproduce with `npx tsx scripts/assets/portrait-photos.ts --priority --world promoter-ref --weeks 104 --count 12`; the raw list is `asset-pipeline/portrait-source/plans/priority-promoter-ref-104w.json`.

| # | Fighter ID | Name | Why | Slot (file name) | Age | Build | Heritage cue |
|---|---|---|---|---|---|---|---|
| 1 | `f_8i` | Tommy Hobbs “The Hammer” | contracted: contracted to you | **0269** — empty | early 20s (21) | Bantamweight, 163 cm — lean / light frame | British |
| 2 | `f_8g` | Tyler Kendrick “The Prince” | contracted: contracted to you | **0037** — empty | late 20s (27) | Super Bantamweight, 175 cm — lean / light frame | British |
| 3 | `f_8c` | Harvey Hartley | contracted: contracted to you | **0151** — empty | mid 20s (24) | Middleweight, 179 cm — athletic mid-weight build | British |
| 4 | `f_8e` | Jermaine Marshall | contracted: contracted to you | **0077** — empty | mid 20s (26) | Middleweight, 180 cm — athletic mid-weight build | Black British / Caribbean or African heritage given name, British surname |
| 5 | `f_2m` | Oliver Entwistle | champion: champion: WBA / IBF / WBO Super Welterweight | **0055** — empty | early 30s (31) | Super Welterweight, 178 cm — athletic mid-weight build | British |
| 6 | `f_2b` | Dalton Dalton “Sugar” | champion: champion: WBA / WBO Super Lightweight | **0291** — empty | late 20s (29) | Super Lightweight, 175 cm — athletic mid-weight build | Anglo American |
| 7 | `f_t` | Barry Boyle | champion: champion: WBA / WBO Lightweight | **0196** — empty | early 30s (33) | Lightweight, 172 cm — athletic mid-weight build | Irish |
| 8 | `f_1f` | Caleb Quigley “Lights Out” | champion: champion: WBA / IBF Middleweight | **0112** — empty | late 20s (27) | Middleweight, 175 cm — athletic mid-weight build | Anglo American |
| 9 | `f_3k` | Declan Stokes “Lights Out” | champion: champion: WBA / WBO Welterweight | **0022** — pilot photo (pilot, low-res) | early 30s (31) | Welterweight, 178 cm — athletic mid-weight build | British |
| 10 | `f_3e` | Ricky Fairclough | champion: champion: WBA / IBF Light Heavyweight | **0031** — empty | mid-to-late 30s (35) | Light Heavyweight, 190 cm — broad, heavier frame | British |
| 11 | `f_25` | Marcus Cannon “Iron” | champion: champion: WBC / WBA Super Featherweight | **0251** — empty | late 20s (27) | Super Featherweight, 177 cm — athletic mid-weight build | African American |
| 12 | `f_v` | Quincy Yarbrough “Gravedigger” | champion: champion: WBC / IBF Super Flyweight | **0067** — empty | late 20s (30) | Super Flyweight, 167 cm — lean / light frame | African American |

Batch rules: spread skin tones, hair and facial hair across the 12 (do not cast all ten British-named fighters alike); ages as shown; no two similar faces; no belts, gloves, text, logos, robes with lettering; no recognisable real boxer.

## 2. Pilot slots to replace (originals are never deleted)

All 23 pilot images are **low resolution** (≈188 px wide, upscaled 2.5×), so every one is a replacement candidate, and `--approve` now refuses them unless you pass `--allow-lowres`. Replace in this order:

| Order | Slot | Pilot tile | Reason |
|---|---|---|---|
| 1 | 2 | r0c3 | possible resemblance to a real professional boxer (red hair, freckles) — do not approve |
| 2 | 1, 12, 19 | r0c2, r1c5, r2c4 | beard/goatee clipped at the bottom edge |
| 3 | 22 | r2c7 | in the reference world slot 22 is champion Declan Stokes (priority #9) |
| 4 | the other 19 | — | low resolution only |

Replacement keeps the slot number and **supersedes** the old files: they are moved to `asset-pipeline/portrait-source/superseded/` (outside `public/`), the new entry records `supersedes: <old sha>`, and its status resets to unapproved. The original contact sheet and tiles stay where they are.

## 3. Exact ingestion workflow (individually supplied images)

1. **Name** each file `slot-NNNN.png` — four-digit slot, e.g. `slot-0269.png`. Also accepted: `.jpg`, `.jpeg`, `.webp`, and `slot-0269__f_8i.png` (fighter id after two underscores; recorded, never used for mapping).
2. **Drop** them in `asset-pipeline/portrait-source/incoming/`. Optional sidecar `slot-0269.json`: `{"fighter":"f_8i","world":"promoter-ref","tags":{"age":"early 20s","heritage":"British","build":"lean"},"crop":{"y":0.06}}` (`crop.y` = top of the 4:5 window as a fraction of the image height; leave it out and the window follows the top of the head).
3. **Ingest:** `npx tsx scripts/assets/portrait-photos.ts --ingest-incoming` (add `--min-width 960` to refuse small sources; `--replace` to supersede an occupied slot). Per file it: moves the original **unchanged** to `originals/slot-NNNN.<sha8>.<ext>`; cuts an exact 4:5 crop at native resolution (`crops/slot-NNNN.png`); writes `public/assets/portraits-photo/pNNNN.webp` (480×600, q80) and `pNNNN_t.webp` (96×120, q72); records both hashes, the crop hash, the original's hash, resolution class and flags in `photos.json`; and syncs the manifest. New entries are **`pilot` (unapproved)**; the manifest's `approved` list and `active` flag are untouched.
4. **Review:** `npx tsx scripts/assets/portrait-photos.ts --contact-sheet review.png --only pilot`, then in the app only after approval.
5. **Approve / reject:** `--approve 269,37,151,77` (refuses low-resolution sources unless `--allow-lowres`), `--reject N`. `--check` after every batch (files, both hashes, originals, 12 MB budget, manifest match; exit 1 on any problem).
6. **Activate** (only when you decide): `--activate`. Until then the game shows its existing artwork; after it, a slot without an approved photograph shows the silhouette.
7. **Tests:** `src/engine/portraitIngest.test.ts` covers naming, crop, resolution classes, no upscaling, supersede, approval gating, hash checks.

Slots are never reused for a different image without `--replace`; the lowest-free-slot logic belongs only to contact-sheet ingestion.

## 4. Image requirements

| | Requirement |
|---|---|
| Orientation | portrait. Best: **1024×1280 (4:5)**; also fine: **1024×1536 (2:3)** (the 4:5 window uses the top 1280 rows, so keep the head in the upper ~70% and shoulders below) |
| Minimum | **crop width ≥ 960 px** for "high" (2× the 480 px target). 640–959 = "medium" (acceptable, downscaled). Below 640 = "low": recorded as low and **cannot be approved without `--allow-lowres`**. Nothing is ever upscaled and relabelled |
| Not wanted | square or landscape images (the sides are cropped off and flagged), contact sheets for final art, anything smaller than ~800 px |
| Format | PNG (best) or high-quality JPG/WebP; no transparency; sRGB |
| Framing | one head-and-shoulders subject, head fully inside the frame with ~8% headroom, chin at least ~12% above the bottom of the 4:5 window (beards must not touch the bottom edge), both ears visible, eyes level, neutral dark charcoal background |
| Content | fictional adult male boxer; no text, watermark, logo, belt or gloves; not resembling a real boxer; one distinct face per slot |
| Output | 480×600 WebP ≈ 20–40 KB + 96×120 thumb ≈ 3 KB; 360 slots ≈ 8–15 MB, so the **12 MB budget** (enforced by `--check` and the test suite) fits about 300 portraits at typical size — send detail that survives compression rather than grain |

## 5. Small issue found while listing fighters (not changed)

The wide name pools allow a given name that is also a surname in the same group, producing "Dalton Dalton" (also possible: Cameron, Rhys, Gethin, Morgan, Lamar, Nolan, Ibrahim, Mitchell). One line in `drawName` (re-draw when first == last) would prevent it for new careers; I did not change it because it is outside this step.

## 6. State after this preparation

No portraits generated or approved; `portraitPhotos` still absent from the manifest (inactive); gameplay, saves, fighter ids and the simulation untouched. Added: `--priority`, `--ingest-incoming`, resolution classes with approval gating, thumbnail hashes, supersede handling, `incoming/` inbox, tests.
