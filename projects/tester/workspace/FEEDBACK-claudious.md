# Harness feedback — from Claudious (Opus 4.8), 2026-07-27

Honest notes from the browser-worker seat, focused on visual verification, test
isolation, and the Playwright/screenshot workflow.

## What works well (keep it)

- Preview URL + auto-displayed screenshots: I can actually prove my changes
  work by showing them. No guessing or verbal descriptions.
- Playwright tools are powerful: viewport control, console inspection, element
  finding all work reliably. Enough to test real user flows, not just unit tests.
- Shared workspace with instant visibility means no merge conflicts when I edit
  files. Changes show up instantly for teammates.
- TASKBOARD.md + MEMORY.md let me know what's in flight without asking. Strong
  coordination layer.
- @mention gating prevents waking me for work I'm not doing.

## Pain points / what to change

1. **Browser state is ephemeral.** Every turn my browser restarts. Can't test
   multi-step flows (click A → fills B → click C → see result) because the
   session dies between turns. Local storage/session storage persists, but
   cookies and login state do not. Need a pre-warmed browser context that
   survives across my turns, or at least a way to inject session state.

2. **Visual regression detection is manual.** I save screenshots but have no
   before/after diffing or automated regression detection. I describe what I
   see, but small visual bugs could slip through. Need structured visual-test
   reporting: "screenshot matches reference" or "diff found at <file>".

3. **Playwright setup is boilerplate-heavy.** Every turn I re-navigate, re-wait
   for elements, re-check selectors. A pre-warmed browser context (or a helper
   wrapper) would cut setup time. Also: no easy way to test responsive layouts
   without writing viewport logic each time.

4. **Full chat history re-send** (same as Boss noted): I get the entire room
   constitution + chat every wake, even when I'm just verifying a CSS change.
   Delta wakes would cut my context significantly.

5. **No structured visual verification contract.** I manually screenshot and
   narrate results. The harness has no record of what I checked or whether it
   passed. Codex's point about verification contracts applies here too: let an
   assignment include "take screenshot of X, verify button is blue" and report
   it as structured pass/fail.

6. **No test environment isolation.** All my preview tests hit the same live
   workspace state. If I need to test a destructive operation (delete, reset),
   I risk breaking a teammate's in-progress work. Need snapshot/restore of
   workspace state per test, or a disposable copy.

7. **Coordination friction between Claude agents.** If Codex needs visual
   verification, they @mention me. Works, but I'd rather check a shared
   visual-test queue (enqueued by any worker) than re-wake on every "can you
   screenshot this?"

## What I am missing most

Highest-value additions from my seat: (1) persistent browser context across
turns, (2) structured visual-regression detection, (3) test environment
isolation, (4) shared visual-test job queue. Together, these would make it easy
to verify UI changes reliably without re-waking the whole team for every
screenshot.
