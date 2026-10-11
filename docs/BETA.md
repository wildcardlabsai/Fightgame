# The Promoter — external beta guide (Phase 10)

**Build:** `0.10.0-beta.1` (package.json `version`). The build id shown in the game is `version (git short sha, commit date)`, e.g. `0.10.0-beta.1 (a1b2c3d, 2026-10-11)`; a `+local` suffix means it was built from a tree with uncommitted changes. Both come from git, never the clock, so one commit always builds the same bundle.

## Building a beta
```
npm ci
npm run build                      # tsc --noEmit + vite build -> dist/
npx vite build --base /play/       # when hosting under a sub-path
```
Optional: `VITE_FEEDBACK_CONTACT=you@example.com npm run build` adds a ready-addressed "Open in email" link to the report screen. Left unset, testers are told to send reports to whoever invited them.

## For testers
1. **Start.** First launch opens the "Found your promotion" form. Starting career defaults to *Regional Promoter* (Normal). Turn on nothing else; a short guide appears on the desk for a new career and can be hidden in Settings.
2. **Continue / new / restore.** With saves present the title screen offers **Continue** (newest readable save), **Start a new career** (always a separate save) and **Restore from a backup file** (always added as its own slot). Nothing on that screen replaces, resets or silently deletes a career. Delete asks for confirmation and points to Export.
3. **Back up.** Title screen → Export on a saved row, or Save & Settings → Export save file. Saves live only in this browser; clearing site data or a private window erases them.
4. **Report a problem.** More → *Report a problem* (in game), or *Report a problem* on the title screen. Pick a type, describe what happened, then **Copy report** or **Save as file** and send it to the person who invited you. **Nothing is sent automatically — there is no feedback server.** The preview is exactly what is copied.
   - Included: build, report type, current screen and the last few screen names, game date, career type/difficulty/tier, world seed, save version, cash, roster size, guide step, coarse browser + viewport + storage type, the last caught error message (≤200 chars), and your own words.
   - Never included: promotion or promoter name, any fighter name or id or attribute, hidden ratings, route ids, or the save file. If asked for the save, use Export and share it only with the beta organisers.

## Save safety
- Import/restore never overwrites: if the file's career id already exists in this browser it gets a fresh id and "(imported)" name; otherwise it keeps its id and is added. The original slot is not rewritten.
- A file that is empty, not JSON, not a save, damaged, or made by a newer version is refused with a specific message that says saves are unchanged.
- Continue skips an unreadable newest slot, opens the next readable one and says so. A slot that cannot be opened is never deleted; Load explains it was left untouched and the title screen can still list it.
- If the browser refuses to store a new or imported career, a warning says so and points to Export.
- Saves from older builds migrate on load (see ONBOARDING/PHASE notes); a newer-version save is refused, not downgraded.

## Known limitations
Shown in-game under *About this beta* (source: `KNOWN_LIMITATIONS` in `src/engine/release.ts`): browser-only saves, no cloud/accounts, boxing only, balance still being tuned, audio starts after first interaction, very long careers may slow older phones.

## Developer-only surfaces
The asset gallery (`#/assets`, "Assets (dev)" nav item) is compiled out of production builds (`import.meta.env.DEV`). The `?e2e` URL flag exposes `window.__fe.useGame` for browser tests; it only works if the visitor adds it to the URL, is not linked anywhere in the UI, and is documented here rather than hidden. Do not hand testers URLs containing it.

## Verifying a build
`npx vitest run` · `npx tsc --noEmit` · `npm run build` · static-serve `dist/` and run `node scripts/browser/phase10-ui.mjs <baseUrl> <shotsDir>` (plus the phase7/9/60 suites). Screenshots from this phase: `docs/phase10-shots/`.

## Verification record (build 0.10.0-beta.1, commit 4d19542)
- `npx vitest run`: 54 files passed, 2 skipped; 822 tests passed, 5 skipped, 0 failed (includes `phase10.test.ts`, 20 tests; leak audits extended to `release` and `feedback`).
- `npx tsc --noEmit`: clean. `npm run build`: succeeds; a clean `git clone` builds a byte-identical `dist/` (same sha256 over all files).
- Browser (static production build, 1280/1024/390): `phase10-ui.mjs` 100/0, `phase7-ui.mjs` 150/0, `phase9-ui.mjs` 83/0, `phase60-a11y.mjs` 174/0; `phase8-walkthrough.mjs` regional at 1280 and 390 completes the full loop incl. an external booking, no console errors (one known medium finding: after a large loss the player may lack cash for another show — unchanged by design).
- Not changed in this phase: simulation, finances and persistence formats (save version still 13), so the multi-seed audits were not re-run.
