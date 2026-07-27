# Copy-paste prompt for the maker (Fable) session

Copy everything below the line into the Claude Code session that maintains the
Window repo (/Users/colton/claude/Window).

---

Implement "round 2" of the Agent Terminal token-efficiency plan in server.js.
Round 1 (commit db10fe8: session rotation, inbox filter, turn caps) is done and
verified at ~70-80% savings. The full round-2 analysis was written by the agents
themselves in projects/tester/workspace/ — read these first:

- PLAN-round2.md        (the merged plan — implement in this order)
- round2-codex.md       (measured cold-start data + exact server.js patches)
- round2-claudious.md   (keep-warm heartbeat code + model-routing config)
- round2-panel.md       (cross-check from Haiku/Sonnet/Opus panel)

Build these, in order, keeping every quality guardrail listed in PLAN-round2.md
(12-turn worker budget, MEMORY/TASKBOARD carry-over, frontier models for
non-trivial tasks):

1. LEAN CAPABILITY PROFILES (biggest win, measured -71.6% cold start):
   workers spawn with --strict-mcp-config, no plugins/skills, core tools only.
   The lead can tag a task [browser] or [web] to grant the full toolset for that
   turn only. Use the patches in round2-codex.md sections 1-3.

2. CHEAP-MODEL ROUTING + ACK-GATE: the lead tags tasks [trivial|normal|hard].
   trivial → cheap model (Haiku), hard → frontier model. Add a server-side
   ack-gate: pure "done/ok" confirmation replies are answered by the server with
   zero model tokens. Config format is in round2-claudious.md.

3. KEEP-WARM HEARTBEAT: while any task is pending, ping idle agents' resumed
   sessions just under the 5-minute prompt-cache TTL (cache-read price) so their
   context never re-bills fresh. MUST be gated: no pending work = no heartbeat.
   Code sketch is in round2-claudious.md. (Do NOT try a 1h cache TTL — it is
   API-only; the CLIs cannot set it. Already researched, confirmed dead end.)

4. POLISH: (a) prefix stability — no timestamps/counters/token-meter text may
   appear before cached prompt sections; (b) rotate sessions on resumed-context
   SIZE crossing a token threshold, not only on turn count; (c) keep briefing
   text byte-stable so the cache stays warm.

Verify like round 1: snapshot per-agent token counters from projects/*/state.json,
run one trivial task per worker, diff, and report fresh/cached/cost per wake
against tonight's baseline (Claudious 38k fresh/$0.42, Codex 36k fresh + 346k
cached). Target: a trivial wake under 10k fresh tokens and under $0.05.
