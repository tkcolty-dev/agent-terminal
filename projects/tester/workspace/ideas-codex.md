# Codex audit: making Agent Terminal token-efficient

The largest cost is long-lived CLI sessions. `server.js` resumes the same Claude/Codex
session forever, so each model keeps an ever-growing private conversation and tool
history. Even though `buildPrompt()` sends only unseen room messages, the resumed
session still makes every later turn pay for old context (cached input may be cheaper,
but the token meter and context size keep growing).

## Ranked fixes

| Rank | Change | Likely savings | Effort |
|---|---|---:|---:|
| 1 | Rotate agent sessions automatically | Very high | Low–medium |
| 2 | Discard irrelevant unseen messages before the next wake | High | Medium |
| 3 | Make workers wake only for actionable assignments | High | Low |
| 4 | Replace the 19-rule briefing with a compact worker/lead prompt | Medium | Low |
| 5 | Lower per-turn tool-loop limits and auto-turn cap | Medium | Very low |
| 6 | Add budgets and telemetry based on *fresh* vs cached tokens | Indirect but important | Medium |

## 1. Rotate sessions instead of resuming forever

Add per-agent counters such as `sessionTurns` and `sessionInputTokens`, persist them,
and clear `sessionId` before a turn after either threshold:

- worker: 6 turns or 80k total input tokens;
- lead: 10 turns or 120k total input tokens;
- always rotate after a completed task (`[IDLE]`) if the session already has 3+ turns;
- rotate immediately when the room is stopped, a project is reopened, or the briefing
  version changes substantially.

On rotation, `MEMORY.md`, `TASKBOARD.md`, and the latest actionable room messages are
the carry-over. The models already read those files, so replaying private tool history
adds little value. Reset `briefedV = 0` with `sessionId = null`, but do **not** reset
`seenUpTo`; otherwise old chat is replayed. A fresh prompt should say:

> Fresh session. Read MEMORY.md, TASKBOARD.md, and your private notes before acting.

Implementation location: a new `shouldRotateSession()` called at the start of
`runTurn()`, before `buildPrompt()`. Increment the counters from Claude `result` usage
and Codex `turn.completed` usage. Save them in `Room.saveState()`.

This bounds context growth, changing the cost curve from roughly quadratic over a
long room to approximately linear.

## 2. Do not deliver every message accumulated while an agent slept

Currently `scheduleTurns()` correctly avoids waking an agent, but `buildPrompt()` later
includes **all** messages since `seenUpTo`, including unrelated user/lead chatter,
system notices, reports to other workers, and `[IDLE]` messages.

Change the model-facing inbox to:

- the message(s) that actually woke this agent;
- at most the last 4 non-system messages for local context;
- optionally one short live-status block;
- never limit warnings, connect/disconnect notices, screenshot announcements, pause
  notices, or messages explicitly `@mention`ing a different agent.

Advance `seenUpTo` when messages are inspected by the scheduler, not only when the
agent eventually wakes. If some context must be retained, store a tiny `pendingInbox`
containing only direct mentions/assignments. A simpler safe first patch is to filter
`fresh` in `buildPrompt()` using `wakes(m, this)` plus the last user message.

Also cap transcript text, for example 8 messages / 6,000 characters, truncating oldest
first. File state is the durable source of truth.

## 3. Tighten wake routing

The lead routing is already a good design. Make it stricter:

- worker wakes only when the lead or user directly mentions it;
- lead wakes for a user message and for a worker report, but ignore bare `[IDLE]`,
  `[SKIP]`, system events, and acknowledgment-only replies;
- coalesce messages arriving during a busy turn into one next wake (already mostly
  happens), with a 300–800 ms debounce before launching;
- do not wake the lead separately for every parallel worker report: wait briefly and
  pass all completed reports in one turn;
- reduce `MAX_AUTO_TURNS` from 8 to 4 by default, configurable per room.

A high-value UI addition is an “Economy / Collaborative” mode. Economy uses one lead
plus only mentioned workers and a 4-turn cap; Collaborative preserves current behavior.

## 4. Slim the briefing

The generated briefing is about 19 verbose rules and is repeated whenever `BRIEF_V`
changes or a session rotates. Replace it with:

- a shared compact core of roughly 350–500 tokens;
- a worker addendum (assignment-only, file ownership, test, short report);
- a lead addendum (route work, batch reports, do not code);
- put detailed room policy in `AGENTS.md` and tell agents to read it only when needed.

Avoid model/version text, teammate prose, repeated examples, and rules that the server
already enforces. Keep only behavioral facts the model must know. Do not bump `BRIEF_V`
for cosmetic wording changes; version worker and lead prompts separately.

## 5. Reduce turn/tool ceilings

Claude is launched with `--max-turns 40`, far above what a small assigned task usually
needs. Use 12 for workers and 8 for the lead, with an explicit one-time extension for
large builds. Keep the 15-minute wall timeout, but add a no-activity timeout.

Use cheaper models for the lead/router and small edits, reserving expensive models for
architecture or difficult implementation. The lead can assign a `complexity` hint that
selects an agent/model rather than waking every connected model.

## 6. Measure the right thing and enforce budgets

The UI total currently adds cached tokens at full weight. Keep the raw count, but also
show:

- fresh input, cache creation, cache read, output, and dollar cost separately;
- tokens per posted message and per completed task;
- current session age/turns and next rotation threshold;
- “wakes avoided” by routing;
- estimated effective cost (cached tokens weighted by provider price).

Add a per-turn input guard: if the projected prompt plus resumed context crosses the
threshold, rotate first. Add room-level token budgets that pause and ask the user
before another expensive agent-to-agent cycle.

## Important audit correction: screenshots are not currently sent to models

The image watcher posts a chat message with `m.img`, but `buildPrompt()` serializes only
`m.text`. Therefore screenshots do **not** currently consume vision/image tokens merely
because they appear in chat. They cost tokens only when an agent explicitly opens them
with a browser/image tool. Keep that behavior; filter the `📸 filename` system message
from worker transcripts and request one final visual verification only.

## Suggested implementation order

1. Ship session rotation plus persisted counters.
2. Filter/cap sleeping-agent inboxes and debounce parallel reports.
3. Cut the briefing and lower `--max-turns` / `MAX_AUTO_TURNS`.
4. Add an Economy-mode toggle and cost-aware telemetry.
5. Compare a fixed 20-message benchmark before/after: total fresh input, cached input,
   output, cost, number of wakes, and task success.
