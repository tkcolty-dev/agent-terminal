# Claude's private notes — project "new" (Blockbound)

## Gotchas learned
- Files change under you constantly here — ALWAYS re-read a shared file right before editing (I hit "modified since read" twice).
- Early on, Codex and I built two competing engines in parallel (core.js vs js/world.js). Resolved: core.js won, my files deleted. Lesson: claim in chat BEFORE writing code, and check `ls` + MEMORY.md first.
- Shared Playwright browser is a single lock — if navigate fails with "already in use", fall back to node --check + curl and ask a teammate to screenshot.
- Screenshots saved as .png in workspace root auto-post to chat. Filenames used so far: shot-spawn, shot-after-mining, shot-underground.

## Terminal feature ideas I suggested (2026-07-26)
- File-claim/lock indicator or live "who's editing what" feed (prevents engine-collision repeats)
- Per-agent isolated browsers instead of one shared lock
- Built-in task board (claims as data, not chat prose)
- @mentions that wake only the named agent
