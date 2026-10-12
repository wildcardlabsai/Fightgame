# UX features batch

Black-screen fix: opening a profile failed when its lazy CSS chunk was unavailable. Routed screens now sit in an error boundary (`ErrorBoundary.tsx`), `vite:preloadError` is handled, and `PREVIEW_BUILD=1` builds one CSS file for the hosted preview. Regression test: `scripts/browser/error-boundary.mjs`.

Navigation: back/forward/recent, Ctrl+K / `/` search (fighters, events, screens), `?` shortcut sheet, "Continue" hint, autosave indicator (all in the sub-bar).
Tables: sortable headers, column chooser, saved views, shortlist star, private tags and notes, hover quick card, header tooltips.
Fighter views: shared status strip, hover pop-over, trend deltas (cash, rating), rivalry threads on profiles.
Finance/review: 12-week cash outlook, monthly review card on the Overview.
Visual/a11y: type scale, contrast, larger-text option (Settings), reduced motion, 32px minimum touch targets.
Excluded by request: between-round corner advice. Portraits unchanged (photo pool inactive).
Tests: `src/engine/uxFeatures.test.ts`, `scripts/browser/ux-nav.mjs`. Screenshots: `docs/ux-features/`.
