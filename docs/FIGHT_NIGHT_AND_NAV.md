# Navigation, Fight Night and audio (Phase 4.9B)

## Navigation
Desktop: a top bar with seven primary destinations — Home, Inbox, Roster, Events, World, Finances, More — each opening a dropdown;
under the bar a section strip lists the current section's screens. Phones: a pinned five-item bottom bar (Home, Inbox, Fighters, Events,
More) with a More panel for everything else. Detail routes (a fighter, an event, a fight, a negotiation) highlight the section that opened them.
Structure lives in `src/ui/nav.ts`; Rankings/Titles are present but locked under World as the Phase 5 slot.
| Group | Screens |
|---|---|
| Home | Dashboard |
| Inbox | Inbox |
| Roster | Fighters, Free Agents, Scouting, Contracts |
| Events | Calendar, Events, Fights, Matchmaking, Venues |
| World | Promotions, News, Boxing World (world results), Rankings/Titles (locked) |
| Finances | Finances, Sponsors, Payroll & contracts |
| More | Advisor, Settings, Save / Load |

## Fight Night
Entering a fight just run (or pressing Replay/View) opens a full-screen broadcast layout over the game: navigation is hidden, with a clear
"Return to event" button. All modes walk ONE deterministic timeline built from the recorded result (`src/presentation/timeline.ts`); the
engine ran once, earlier, and nothing in the UI calls it again.
- **Watch fight** — everything: round, clock, crowd, stamina, control, live stats, round table, commentary, bell cards, knockdown + referee count, result.
- **Key events** — a highlight reel of recorded moments only (knockdown, hurt, momentum shift, stoppage, decision, title announcement; a "round of the fight" if there is little drama). No statistics dashboard. Play/pause, previous, replay event, next, skip.
- **Quick sim** — straight to the result card (winner, loser, method, round/time, scorecards, knockdowns, headline stats, key moments) with View full fight / View key events / Return.
- **Skip** — completes the current presentation to the final result. **Replay** — restarts the presentation from the recording.
- **Speed** — 0.5× 1× 2× 4× 8× and Pause. Speed scales only the presentation clock (`advance(timeline, state, dt, speed)`); changing it while paused does not advance anything.

## Audio — what was wrong and what changed
Measured with an analyser on the real output in a browser (not just the cue log): the synthesised cues WERE produced after the first click, but at
−28 dBFS for UI sounds and −26…−27 dBFS for crowd cues — effectively inaudible on normal speakers — and the "crowd ambience" was a single 3-second
one-shot, not a loop. The cue log also claimed a cue had "played" when the audio device was still locked. Fixes: per-cue make-up gain (UI ≈ −17 dBFS,
bell/KO ≈ −7 dBFS), higher defaults, a true looping synthesised crowd bed (fight bus, follows mute/volume, stops on leaving), cues requested while the context is
resuming now play once it runs, `delivered` in the log, a visible "Tap to enable sound" indicator until the first interaction, and a settings readout of the
device state. The Music slider is disabled and labelled: there is no music. New cues: fight intro, punch, referee count tick, getting up, stoppage,
title announcement, major result, revenue.
