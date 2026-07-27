# Round-2 harness feedback — merged summary (Boss, Codex, Claudious) — 2026-07-27

One consolidated view of the three round-2 per-agent files
(FEEDBACK2-boss.md, FEEDBACK2-codex.md, FEEDBACK2-claudious.md).
Round-2 rule: every item here is NEW — none of it repeats FEEDBACK-SUMMARY.md.
Grouped by theme; tags show who raised each point.

## A. Turn lifecycle & control [Boss, Codex]
- **Auto-report crashed turns** [Boss]: a turn that dies mid-task (timeout, API
  error) should post an automatic "⚠ X's turn failed" line and release that
  worker's file locks, instead of the room going silently stuck.
- **Real Stop button** [Codex]: the user/lead needs a way to cancel a turn that's
  no longer wanted — kill the turn and any commands it started, mark the task
  cancelled, and show what had already changed so the lead can keep or undo it.
- **Task dependencies** [Boss]: let an assignment declare "start after task #4
  is done" so the harness fires the hand-off itself, instead of costing a full
  lead turn just to say "your turn now."
- **"Waiting for user" task state** [Codex]: when an agent needs a choice only
  the user can make, it should ask one question, save its place, release its
  resources, and sleep — then resume from that exact point once answered,
  instead of guessing or staying active idle.

## B. Visibility & audit trail [Boss, Codex]
- **Status page** [Boss]: a harness-maintained status page (current task/state
  per agent, last finish line, blockers, running cost) so the user isn't stuck
  reading the chat scroll to answer "where are we?"
- **Task receipt** [Codex]: when a task finishes, bundle the original
  assignment, agent/model used, files changed, commands run, check results,
  screenshots, and final message into one downloadable record — so "who
  changed this and what proved it worked?" doesn't require reconstructing a
  long chat.
- **Review step before merging changes** [Codex]: record each task's edits as
  its own change set (added/removed/changed lines) and show a before/after
  review before it becomes part of the shared result, so one worker can't
  silently overwrite or corrupt a teammate's work.
- **Contradiction detection** [Codex]: let each task publish its key decisions
  in a structured field, and flag opposite statements across active tasks
  (e.g. one agent removing a feature another depends on) before both sides
  have already spent the work.

## C. Safety & isolation [Boss, Codex]
- **Tag-scoped permissions** [Boss]: tie file/shell access to the task tag —
  [trivial] can only touch the files named in the assignment, [normal] is
  workspace-only, [hard] gets full powers — so a small task can't cause big
  damage.
- **Sandbox copy for risky edits** [Boss]: a one-command scratch copy of the
  workspace (git worktree) to test risky changes — especially self-edits to
  server.js — before a one-command "promote" applies them for real.
- **Secret redaction** [Codex]: scan tool output and chat messages for
  password/token/key patterns before they're shown, replacing them with
  `[hidden]` so a diagnostic command can't turn a local secret into a
  permanently logged one.
- **Per-task resource limits** [Codex]: cap run time, memory, disk growth, and
  process count per task, with a warning near the limit and a safe stop plus
  reason if it's exceeded — so one runaway command can't slow down everyone
  sharing the machine.

## D. Communication efficiency [Boss]
- **Cheap quick-question lane**: let a worker ask one teammate a short
  question and get a short answer on a cheap model without waking the lead —
  today a one-word answer costs three expensive turns.
- **User can address a worker directly**: let @mentions from the user wake
  that worker directly (lead just CC'd in the log) for questions/pokes;
  work-assigning commands still route through the lead.

## E. Memory hygiene [Boss]
- **Scheduled memory janitor**: a cheap-model pass every N turns to merge
  duplicate bullets, delete superseded ones, and archive finished-project info
  out of the auto-loaded MEMORY.md — today it only ever grows, so every wake
  pays to read stale facts.

## F. Browser/testing seat [Claudious]
- **Auto-capture console + network errors** on every [browser] turn, handed
  over with the screenshot — stops a page that "looks fine" from hiding real
  JS/network errors from verification.
- **Screenshots shouldn't re-bill every future turn**: show an image in full
  once, then replace it in later turns with a lightweight text reference
  ("screenshot: x.png (seen)") — testing is the most image-heavy job in the
  room and today it taxes every teammate's later wakes.
- **One-pass multi-viewport snapshots**: snap phone/tablet/desktop sizes in a
  single turn instead of one expensive turn per size.
- **Preview should serve any file, not just index.html**: needed to actually
  test multi-page work and our own tooling (e.g. the status page/task receipt
  ideas above).
- **Automatic page-quality/a11y lint**: one-command scan for broken links,
  missing alt text, and low-contrast text — mechanical checks a screenshot
  glance misses.
- **Wait-for-ready browser tests**: script actions against "wait until element
  appears / network quiet / text shows" instead of fixed-time pauses, so
  screenshots are always of a settled page and results aren't flaky.

## Priority shortlist for round 2 (team consensus)
1. **Auto-report crashed turns + release locks** (A) — cheapest, fixes the
   scariest silent-failure case.
2. **Auto-capture console/network errors on browser turns** (F) — closes a
   real "looked fine, was actually broken" gap we could hit today.
3. **Task dependencies** (A) — removes lead turns spent purely relaying
   hand-offs.
4. **Status page** (B) — gives the user a snapshot instead of a scroll.
5. **Tag-scoped permissions** (C) — bounds the blast radius of small tasks.
6. **Screenshot-once billing** (F) — testing shouldn't inflate every future
   turn's cost.

All three per-agent round-2 files plus this summary are considered final for
this round. Total: 8 (Boss) + 7 (Codex) + 6 (Claudious) = 21 new topics, zero
overlap with round 1 (FEEDBACK-SUMMARY.md) confirmed by each author.
