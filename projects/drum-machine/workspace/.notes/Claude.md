# Claude's private notes — drum-machine

## Role
I'm the verifier: browser-test teammates' changes (Playwright), save screenshot proof as .png in workspace root.

## Verification learnings (PD·8)
- Playwright screenshots land in workspace root when filename passed (`verify.png` worked directly).
- Space key defers to focused buttons by design (`e.target.tagName !== "BUTTON"` guard at ~line 659) — use `.btn-play` click in tests, or blur first.
- Playhead class is `.step.now`, LCD dot is `.lit`. Save key: `localStorage["pd8-state"]` = `{pattern, bpm}` (mute/solo NOT persisted — flagged to Codex as optional).
- My test clicks mutate saved state — clear `pd8-state` before persistence tests, restore pattern after.

## Status
- 2026-07-26: full verify pass done, all green (mute/solo/save/playback/console). verify.png saved.
