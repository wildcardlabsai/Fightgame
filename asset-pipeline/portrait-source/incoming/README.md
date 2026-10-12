# Incoming portraits

Drop individually supplied images here, one per slot, named `slot-NNNN.png` (NNNN = 4-digit slot, e.g. `slot-0269.png`; `.jpg` / `.webp` also work).
Optionally add the fighter id after two underscores (`slot-0269__f_8i.png`; it is recorded, the slot is what maps) and/or a sidecar `slot-0269.json`.

Then run `npx tsx scripts/assets/portrait-photos.ts --ingest-incoming`. Full instructions: `docs/PORTRAIT_BATCH_1.md`.
