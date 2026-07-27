# Harness feedback — from Codex CLI, 2026-07-27

Honest notes from the worker seat, focused on wake behavior, task routing,
token cost, and the tools available to a Codex CLI agent.

## What works well (keep it)

- The lead/worker split is effective. A direct assignment with an owner and
  named output file removes most ambiguity and prevents duplicate work.
- Shared files are a strong coordination layer. TASKBOARD.md, MEMORY.md, and
  per-agent notes let me recover useful state without asking the lead to repeat
  context.
- The explicit `[SKIP]` and `[IDLE]` outcomes make silence meaningful and keep
  low-value acknowledgements out of the room.
- A real shell plus shared workspace is enough for reliable implementation and
  nonvisual verification. Syntax checks, tests, and HTTP checks are quick and
  leave inspectable evidence.
- The instruction to claim files before editing is especially valuable because
  every agent sees changes immediately and there is no merge boundary to catch
  collisions later.

## Pain points / what to change

1. **The wake payload is much larger than the assigned task.** A worker asked
   to write one short file receives the full room constitution, project state,
   plugin catalog, tool schemas, and chat history. Give workers a compact
   stable profile plus the assignment, relevant file locks, and only the chat
   delta since their last wake. Make the full history available on demand.

2. **The source of truth is duplicated.** Prompt history, LIVE RIGHT NOW,
   TASKBOARD.md, MEMORY.md, and private notes can disagree. The harness should
   generate live status and ownership from one machine-readable state store;
   keep MEMORY.md for durable decisions, not transient status.

3. **Tags are advisory rather than an enforceable budget.** `[trivial]`,
   `[normal]`, and `[hard]` should map to visible limits: selected model,
   reasoning level, maximum output, tool-call allowance, and expected cost.
   Let the lead override those defaults explicitly when a small-looking task
   needs deeper work.

4. **Codex lacks first-class visual verification in this room.** I can test
   markup and JavaScript through shell commands, but the rules require asking a
   Claude teammate for browser interaction and screenshots. Give Codex an
   authenticated browser/Playwright lane, or expose a shared browser-test job
   that any worker can enqueue without waking another expensive model.

5. **There is no atomic file-claim mechanism.** Editing a Markdown table is
   cooperative but race-prone: two workers can read “unclaimed” and both write.
   Add an atomic lease with owner, files/globs, acquired time, expiry, and
   renewal. Reject or warn on overlapping leases before a tool writes.

6. **Wake/resume semantics are not visible enough.** I cannot tell whether a
   wake started a fresh CLI process, resumed an old context, hit prompt cache,
   or fell back after a resume failure. Add a compact diagnostic record per
   turn with session mode, model, cache hit/miss, input/output/cached tokens,
   elapsed time, and termination reason.

7. **The room protocol consumes output tokens for control signals.** Exact
   tokens such as `[SKIP]` and `[IDLE]` are useful, but they should be structured
   response fields interpreted by the harness rather than natural-language
   output. The same applies to status, claimed files, and “done.”

8. **Tool availability is advertised too broadly.** Large catalogs of absent or
   irrelevant plugins and deferred tools inflate context and can imply
   capabilities that still require discovery or installation. Send only tools
   enabled for that worker/task, with a cheap lookup path for the rest.

9. **No automatic verification contract is attached to assignments.** The room
   says to test, but the lead must remember which checks fit each task. Allow an
   assignment to include acceptance checks (for example `node --check`,
   `npm test`, preview HTTP 200, screenshot), then report them as structured
   pass/fail evidence before the task can become done.

10. **A user message can wake more compute than its intent warrants.** Add a
    deterministic preflight that detects whether the message is a command,
    follow-up, thanks, or chat. Only commands and relevant follow-ups should
    wake the lead; only explicit assignments should wake workers. Show the
    routing decision in the UI so the user can correct it.

## What I am missing most

The highest-value additions from my seat are: compact delta wakes, transparent
per-turn cost/cache telemetry, atomic file leases, and a browser-test path that
does not require waking a second model. Those would reduce both spend and
coordination failures without changing the room's successful lead/worker model.
