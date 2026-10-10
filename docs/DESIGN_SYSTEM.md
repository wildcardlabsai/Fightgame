# The Promoter — design system (as built, Phase 6.0 audit)

This records what the application already does, so later work extends it instead of replacing it. Source of truth: `src/styles/global.css` (tokens and shared components) plus four feature sheets (`business54.css`, `negotiation54.css`, `office54c.css`, `world54b.css`, `venues54.css`).

## Tokens
| Role | Token | Value |
|---|---|---|
| Ground | `--bg`, `--bg-2`, `--bg-3` | #07070a, #0d0d12, #14141b (near-black, cool) |
| Lines | `--line`, `--line-strong` | 9% and 18% white |
| Text | `--text`, `--dim`, `--faint` | #ece8e1, #8d8b95, #5a5964 |
| Principal accent | `--red`, `--red-hot`, `--red-deep` | #e11d2a, #ff3a46, #6e0d14 |
| Prestige | `--gold` | #d4a24c (champions, belts, objectives) |
| Semantic | `--good`, `--warn`, `--blue` | #35c97f, #f0a23a, #3b82f6 |

Meaning rules in force: **gold = champion / title / prestige**, **blue = your own fighter** (always with the words YOUR FIGHTER), **red = principal action and danger**, green and amber = state.

## Type
Display: Barlow Condensed 600–800 italic uppercase (`.display`, `.caps`, `.num`, buttons). Body: Barlow 400–600, 15px. Fonts are self-hosted (`public/fonts`). Numbers use tabular figures through `.num`.

## Layout
Fixed top navigation with grouped tabs and a second sub-nav row (desktop), bottom bar on mobile. Page container: 1480px max, 32px gutters. Breakpoints used: 1100, 1024, 860, 760, 640. Most screens are two-column grids that collapse to one column at 1024 or 860.

## Components in use
- **Buttons** `.btn` (+ `.primary`, `.ghost`, `.small`, `.big`) with a cut corner; 44px minimum height on touch.
- **Badges**: `.chip` (neutral, `.gold`, `.red`, `.good`, `.mine`), `.pill` (contract stage), `.catpill` (inbox kind), `.hp` (financial health), `.o54-chip` (office), `.ds-status` (availability).
- **Panels**: `.section` with `.section-head`; `.n54-panel` (negotiation side panels); `.bz-card` (belts); `.dt-col` (dashboard columns); `.attn` (attention row with a severity edge).
- **Tabs**: `.tabs` (top level), `.subnav`, `.bz-seg` (segmented controls).
- **Rows and tables**: `.table` in `.table-wrap` (scrolls sideways), `.kv` label/value rows, `.mailrow`, `.rk-row`, `.bz-crow`.
- **Feedback**: `.toasts`, `.empty` empty states, `.advice` panels, inline `role="status"` notes.
- **Motion**: short fades and count-ups; one `prefers-reduced-motion` rule switches animation off globally.

## Findings
1. The visual direction in the brief is already what the application is. This phase refines hierarchy and clarity; it does not replace the look.
2. Five badge patterns overlap. They are visually compatible, so they were left in place; new work uses `.chip` only.
3. The focus ring was gold, which collided with the rule that gold means prestige. It is now white with a red under-edge.
4. Gold was also used for "your roster" in places; that now reads blue, with text.
5. The dashboard buried urgent items below the event hero and three summary columns.
6. The fighter profile is about 5,800px tall at 1280 with no way to jump around it.
7. Sideways overflow is hidden at the page level (`overflow-x: clip`), so a plain scroll-width check cannot catch clipped content; the browser checks look at element edges.
