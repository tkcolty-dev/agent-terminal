# Harness feedback — merged summary (Boss, Codex, Claudious) — 2026-07-27

One consolidated view of the three per-agent feedback files
(FEEDBACK-harness.md = Boss/lead, FEEDBACK-codex.md, FEEDBACK-claudious.md).
Items are grouped by theme; tags show who raised each point.

## What's working — keep it (unanimous)
- Lead/worker split with @mention-gated wakes, [SKIP]/[IDLE], and
  [trivial/normal/hard] tags: real cost control that shapes behavior correctly.
- Shared-file coordination layer (TASKBOARD.md, MEMORY.md, private .notes):
  state survives restarts and workers recover context without re-asking.
- Preview URL + auto-displayed screenshots: work can be *proven*, not described.
- Real shell + instantly-shared workspace: reliable implementation and
  non-visual verification with inspectable evidence.
- "✅ DONE —" finish line and LIVE RIGHT NOW file locks: unambiguous signals.

## Top cross-cutting problems (raised by 2–3 agents)

### 1. Token waste: full context re-sent every wake  [Boss, Codex, Claudious]
Every wake ships the whole room constitution, tool catalogs, and full chat
history — even for a one-file task or a CSS check.
**Fix:** compact stable worker profile + assignment + file locks + chat *delta*
since last wake; full history on demand. Keep volatile data (timestamps, live
status) out of / below the cached prefix so prompt caching survives.

### 2. No cost/telemetry visibility  [Boss, Codex]
Neither the lead nor workers can see what a turn cost, whether cache hit, or
why a session resumed vs restarted. We had to build manual benches to find out.
**Fix:** per-turn diagnostic record (model, cache hit/miss, tokens in/out/
cached, elapsed, termination reason) — surfaced after cached sections or in a
readable file. Also map [trivial/normal/hard] tags to *enforced* budgets
(model, reasoning level, output cap) instead of advisory hints.

### 3. Verification is unstructured  [Codex, Claudious]
"Test your work" is a rule, not a contract. Screenshots and check results are
narrated, not recorded; small regressions can slip through.
**Fix:** assignments can carry acceptance checks (node --check, npm test,
HTTP 200, "screenshot X, verify Y") reported as structured pass/fail evidence
before a task can be marked done. Add before/after screenshot diffing for
visual regression.

### 4. Browser testing is a bottleneck  [Codex, Claudious]
Codex must wake a Claude agent for any visual check; Claudious's browser
restarts every turn, killing multi-step flows and forcing Playwright
boilerplate re-setup.
**Fix:** (a) persistent/pre-warmed browser context that survives a worker's
turns, (b) a shared browser-test job queue any worker can enqueue without
waking a second expensive model, (c) session-state injection for login flows.

### 5. File claims are race-prone; state is duplicated  [Codex]
TASKBOARD.md claiming is cooperative Markdown editing — two workers can both
read "unclaimed" and write. Prompt history, LIVE RIGHT NOW, TASKBOARD, and
MEMORY can disagree.
**Fix:** one machine-readable state store generating live status/ownership,
with atomic file leases (owner, globs, expiry) checked before writes.
MEMORY.md stays for durable decisions only.

## Single-voice items (still valuable)
- **Garbled user input has no repair loop** [Boss]: voice-to-text mishears can
  misroute the whole team since user commands are law. Show the lead's one-line
  interpretation for a cheap confirm, or let the user edit/redo messages.
- **Lead always runs on the most expensive model** [Boss]: many lead turns are
  pure routing/acks — downgrade them the way [trivial] worker turns are.
- **No timers or event wakes** [Boss]: can't say "wake X when file appears" or
  "ping me in 5 min". Even a simple file-watch trigger would enable pipelines.
- **No mid-turn heartbeat** [Boss]: LIVE RIGHT NOW shows files, not progress;
  a one-line self-reported status would help the lead plan without waking anyone.
- **Control signals cost output tokens** [Codex]: [SKIP]/[IDLE]/status/claims
  should be structured response fields the harness interprets, not prose.
- **Tool catalogs advertised too broadly** [Codex]: send only tools enabled for
  that worker/task, with a cheap lookup path for the rest.
- **Message-intent preflight** [Codex]: classify user messages (command /
  follow-up / thanks / chat) deterministically; only commands wake the lead,
  only assignments wake workers; show the routing decision in the UI.
- **No test-environment isolation** [Claudious]: destructive tests hit the live
  shared workspace; need snapshot/restore or a disposable copy per test.

## Priority shortlist (highest value ÷ effort, team consensus)
1. Delta wakes + cache-safe prompt layout (cuts the biggest recurring cost).
2. Per-turn cost/cache telemetry (makes every other optimization measurable).
3. Enforced tag budgets + lead-turn downgrading (stops paying flagship prices
   for routing).
4. Shared browser-test queue + persistent browser context (unblocks Codex,
   fixes Claudious's multi-step testing).
5. Structured verification contracts with pass/fail evidence.
6. Atomic file leases from a single machine-readable state store.
