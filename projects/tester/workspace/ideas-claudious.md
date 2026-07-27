# Claudious audit: where the tokens actually go, and the cheapest fixes

Codex's audit (`ideas-codex.md`) is correct on structure — session rotation and
inbox filtering are the big two. I'm not repeating those. This file adds the
piece that actually explains the "millions of tokens" bill and gives the
cheapest possible patches, ranked by **dollars saved per line of code changed**.

## The real hog: prompt-cache misses, not history length

`--resume` re-sends the whole private session each turn — but Claude/Codex both
**prompt-cache** that history, so a re-read normally costs ~10% of full price.
The catch: the cache lives only ~5 minutes. In this room agents wake
**sporadically** (a worker sits idle for minutes between assignments), so by the
time it wakes the cache has expired and the entire grown history is billed as
**fresh `cache_creation` input** — full price. That's the quadratic blow-up the
Boss saw. Two independent levers:

1. **Bound how big the history can get** → session rotation (Codex #1). This caps
   the worst-case cache-miss cost.
2. **Miss the cache less often** → don't wake agents for things that don't need
   them, so when they do wake it's soon after the last turn (cache still warm).

So rotation and wake-gating aren't two features — they're the two halves of the
same caching fix. Ship both or neither pays off fully.

The token meter hides this: `tokTotal()` (server.js:356) counts cached input at
**full weight**, so the UI can't tell a cheap warm re-read from an expensive cold
one. Fix the meter first (below) or you can't measure any other change.

## Ranked by $ saved per line changed

| Rank | Change | Lines | Savings | Why it's cheap |
|---|---|---:|---:|---|
| 1 | Split fresh vs cached in the cost meter | ~15 | enables all measurement | one function |
| 2 | Drop `--max-turns 40` → 12 (worker) | 1 | high | one number |
| 3 | `MAX_AUTO_TURNS` 8 → 3 | 1 | high | one number, kills agent-to-agent spirals |
| 4 | Filter `fresh` in buildPrompt to wakers+last-user | ~4 | high | tiny, no new state |
| 5 | Keep lead on Fable/Haiku, never Opus | config | high | router doesn't need a big brain |
| 6 | Session rotation w/ counters | ~25 | very high | Codex #1 — the structural win |

Items 2–4 are ~6 edited lines total and capture most of the win before any
refactor. Do them first; do rotation (6) as the durable fix.

## Concrete patches

### A. Make the meter tell the truth (server.js:355-356, 654-658)
Track effective cost, not raw token count:
```js
// cached input bills at ~10% of fresh; weight it so the meter reflects dollars
function effTokens(t) { return (t.in||0) + (t.out||0) + (t.cached||0)*0.1; }
```
Show fresh / cached / output as three separate numbers in `roomUsage()`. Until
this lands, every other optimization is flying blind — we literally can't prove
a fix worked.

### B. One-number wins
- server.js:237 — `'--max-turns', '40'` → `'12'`. A single assigned task almost
  never needs 40 tool-loops; 40 just lets a confused turn burn tokens for 15 min.
- server.js:18 — `MAX_AUTO_TURNS = 8` → `3`. This caps agent↔agent chatter after
  a user message. 8 rounds of Claude+Codex replying to each other is the most
  common silent token sink; 3 is plenty to hand off and confirm.

### C. Don't feed a woken agent the whole backlog (server.js:135-156)
`buildPrompt()` sends every message since `seenUpTo` — including chatter aimed at
other agents and system notices. Minimal filter, no new state:
```js
const wakers = fresh.filter(m => this.room.wakes(m, this));
const lastUser = [...fresh].reverse().find(m => m.from === 'user');
const relevant = [...new Set([...(lastUser?[lastUser]:[]), ...wakers])]
  .sort((a,b) => a.n - b.n);
```
Feed `relevant` instead of all `fresh`. The agent still gets what it needs to act;
it stops paying to read six unrelated lines every wake.

### D. Router doesn't need a genius (agents.json)
The lead's job is route + assign + report — pattern-matching, not reasoning. Keep
it on Fable/Haiku (it already defaults to Fable 5). **Never** put Opus on the lead
seat; reserve the expensive model for the one worker doing hard implementation.
Optionally let the lead pass a `complexity: low|high` hint so simple edits go to
the cheap worker and only real builds wake the expensive one.

## One thing to NOT do
Don't strip the briefing to save tokens (Codex #4). With prompt caching the
briefing is sent **once** then cached — it's nearly free on resume, and it's the
same static prefix that keeps the cache key stable. Rewriting it *breaks* the
cache and costs more short-term. Slim it only when you rotate sessions anyway
(the rewrite is already being paid for then). Behavior rules > token count here.

## How to prove any of this
Fixed 20-message benchmark, measured with the corrected meter (patch A):
run it before/after each change and compare **fresh input + output + weighted
cached**, not raw tokens. Expected: patches B+C alone roughly halve fresh input
on a busy room; rotation flattens the growth curve on a long one.
