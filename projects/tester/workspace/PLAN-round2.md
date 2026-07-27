# Round 2 Plan: even more efficient, same quality
Merged from: round2-codex.md (measured), round2-claudious.md (researched),
round2-panel.md (Haiku 4.5 / Sonnet 5 / Opus 5 external panel). 2026-07-26.

## Where the remaining money goes
Every cold wake pays a ~21.6k-token CLI startup surface (MCP schemas, skills,
plugins) before any work, the prompt cache dies after 5 idle minutes (no CLI flag
can extend it — API-only beta, confirmed), and a $0.40 frontier-model wake is used
even for "reply done" acks.

## The plan (rank = savings ÷ risk, all quality-gated)
1. **Capability profiles per turn** (Codex #1-3): workers spawn lean by default —
   `--strict-mcp-config`, no plugins/skills, core tools only; full toolset only when
   the lead tags a task `[browser]`/`[web]`. Measured: 21,633 → 6,145 tokens (-71.6%)
   per cold start.
2. **Cheap-model routing** (all sources, unanimous): lead tags tasks
   `[trivial|normal|hard]`; trivial → Haiku (~1/15 Opus price), hard → frontier.
   Server-side ack-gate answers pure "done" confirmations with ZERO model tokens.
3. **Keep-warm heartbeat** (panel + Claudious): while work is pending, ping idle
   agents' sessions just under the 5-min TTL so context stays at 10% cache-read
   price. Gated: no pending work → no heartbeat (else it leaks).
4. **Prefix-stability audit** (Opus panel): nothing volatile (timestamps, token
   meters) before cached prompt sections; one changed byte re-bills everything after.
5. **Output discipline** (Opus panel + Codex #6): terse replies enforced; no file
   dumps in chat (they re-bill on every resumed turn until rotation). Output costs
   5× input.
6. **Rotate on size, not only turns** (Codex #5): keep hot sessions while cheap,
   rotate when resumed context crosses a token threshold.

## Expected combined effect
On top of round 1 (~70-80% cut): realistic **additional 60-80% off dollars** on a
busy room — cold-start floor -72%, trivial wakes ~15× cheaper or free, cache misses
mostly eliminated. Quality guardrails: 12-turn worker budget, MEMORY/TASKBOARD
carry-over, and frontier models for anything tagged non-trivial all stay.

## Rollout order
1 (lean profiles) → 2 (routing + ack-gate) → 3 (heartbeat) → 4-6 (polish). Codex's
file has exact server.js patches for 1; Claudious's has heartbeat + routing code.
