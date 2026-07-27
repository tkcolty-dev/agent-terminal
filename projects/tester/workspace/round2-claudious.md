# Round 2 — cache TTL reality + cheap-model routing (Claudious)

## (a) The 1-hour cache TTL — verdict: NOT reachable from the claude CLI

I researched this expecting to just flip a flag. We can't. Findings:

- Anthropic **does** support a 1-hour cache: beta header
  `anthropic-beta: extended-cache-ttl-2025-04-11` + `cache_control:{type:"ephemeral","ttl":"1h"}`
  on the API. **But that's an API-level knob** — you set it per request when you
  own the HTTP call.
- On **~March 6, 2026 Anthropic silently dropped the default TTL from 1h to 5m.**
  That regression is exactly the cold-wake cost the Boss measured.
- Crucially: **the `claude` CLI does not expose the TTL.** claude-code issue
  [#46829](https://github.com/anthropics/claude-code/issues/46829) asked for a flag
  or env var to restore 1h — closed **"not planned"**, no `ANTHROPIC_*`/`CLAUDE_*`
  setting exists. Codex CLI is the same — no TTL control.

**Conclusion for us:** we spawn the vendor CLIs (`server.js:198` `spawn(cmd,args)`),
we don't make raw API calls, so we **cannot** set `ttl:"1h"`. The extended-cache
beta is a dead end *unless* we ever move to calling the Anthropic SDK directly
(big rewrite — not worth it now). That means the panel's "keep-warm heartbeat" is
not a nice-to-have — **it is the only lever we have against the 5-min TTL.**

### Concrete: keep-warm heartbeat (the real fix)
Cache lives 5 min from the last turn. During an active build, ping any idle
session with a near-empty turn just under the window so its history stays at the
~10% cache-read price instead of re-billing the full 6k+ floor cold.

```js
// server.js — refresh a warm session cheaply, ~30s before the 5-min TTL expires
const CACHE_TTL_MS = 5 * 60 * 1000;
const KEEPWARM_MS   = CACHE_TTL_MS - 30 * 1000; // 4m30s

scheduleKeepWarm(agent) {
  clearTimeout(agent._warmTimer);
  if (!agent.sessionId) return;                 // nothing cached yet
  agent._warmTimer = setTimeout(() => {
    if (agent.busy || !this.running) return;    // never fight a real turn
    if (!this.anyWorkPending()) return;          // room gone quiet → let it go cold, don't burn money
    agent.pingSession('(cache keep-warm — no action needed, reply [SKIP])');
  }, KEEPWARM_MS);
}
```
`pingSession` resumes the session with that one line; the model replies `[SKIP]`
(server already drops [SKIP], `server.js:170`). Cost per ping = one cache-read
(~10% of floor) + a few output tokens, vs. a full cold re-bill on the next real
wake. **Guardrail:** only keep-warm while there is pending/assigned work
(`anyWorkPending()` = an open TASKBOARD row or a turn queued). Once the room is
idle, STOP pinging — otherwise the heartbeat itself becomes the token leak. Net
win only in active bursts; that's exactly when cold misses hurt most (est.
10–40% on idle-heavy-but-active rooms).

### Prefix-stability (stacks with the above, near-zero effort)
Keep-warm only helps if the cache *key* is stable. The cached prefix must be
byte-identical each turn. `buildPrompt()` currently prepends a `LIVE RIGHT NOW`
block and a timestamped transcript **before** the static briefing is re-sent only
on rotation — fine — but make sure **nothing volatile (timestamps, token
counters, "current, not cached") sits ahead of the briefing** in a resumed turn.
Order every prompt: [stable briefing/rules] → [volatile transcript last]. One
changing byte early invalidates the whole suffix.

## (b) Cheap-model routing — the biggest single win (panel consensus: 30–50%)

Most wakes are cheap decisions ("who does this?", "ack the report", "trivial
1-line edit"). Paying Opus/GPT-5 for those is the core waste. Two layers:

### Layer 1 — lead is already cheap, keep it that way
Lead defaults to Fable 5 (`agents.json`). Good. **Never** promote the lead to
Opus. Routing is pattern-matching, not reasoning.

### Layer 2 — complexity hint picks the worker model
Let the lead tag each assignment, and route trivial work to a cheap model
instead of waking the expensive worker. Concrete, minimal:

```js
// server.js — map a lead-supplied hint to a model for THIS turn
const CHEAP = 'claude-haiku-4-5-20251001';       // trivial edits, acks, renames
const STD   = this.modelFlag || 'claude-sonnet-5'; // normal implementation
// hint parsed from the assignment text the lead wrote
turnModel(prompt) {
  if (/\[trivial\]|\bone-line\b|\brename\b|\btypo\b|\back\b/i.test(prompt)) return CHEAP;
  return STD;                                     // reserve Opus for explicit [hard] only
}
```
Assignment convention (add to briefing's lead section, ~1 line):
> Tag each assignment `[trivial]`, `[normal]`, or `[hard]`. `[trivial]` → Haiku,
> `[hard]` → the big model. Default `[normal]`.

Haiku 4.5 is ~1/15th the price of Opus per token and handles renames, one-liners,
status edits, and acks with identical results. **Quality guardrail:** the hint
only *lowers* cost on work the lead judged trivial; anything real stays on the
standard/big model, and a worker that finds a `[trivial]` task is actually hard
reports once so the lead re-issues it `[hard]`.

### Even cheaper: don't wake a model for pure acks at all
The panel's pre-wake gate + Codex's point: the bench "reply done" tasks spent a
full model wake on nothing. A regex in `scheduleTurns()` that recognizes an
assignment as ack-only (`create X / reply done`) could let the **server** do the
file write and post a canned "done", spending **zero** model tokens. Highest ROI
of all for coordination rounds.

## Stacking estimate (rough, needs the corrected meter to confirm)
- Codex lean-MCP/strict tools: **~72% off the cold floor** (measured).
- Cheap-model routing: **30–50%** of remaining spend on mixed workloads.
- Keep-warm + prefix-stability: **10–40%** during active bursts.
These are partly multiplicative (lean floor × cheaper model × fewer cold misses),
so a realistic combined target on a busy room is **~60–80% fewer dollars** vs.
today, with no loss of output quality because every cut is gated on a capability
or complexity label the lead controls.

## What NOT to chase
The extended-cache-ttl beta header — unreachable while we shell out to the CLIs.
Revisit only if we ever move to direct SDK calls.

Sources:
- [Claude Platform Docs — Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [claude-code #46829 — TTL 1h→5m regression, closed "not planned"](https://github.com/anthropics/claude-code/issues/46829)
- [DEV — Claude's cache TTL dropped 1h→5m, what to do](https://dev.to/whoffagents/claudes-prompt-cache-ttl-silently-dropped-from-1-hour-to-5-minutes-heres-what-to-do-13co)
