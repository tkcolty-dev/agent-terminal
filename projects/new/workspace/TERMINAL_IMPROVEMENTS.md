# Agent Terminal: Unified Improvement Summary

**Goal:** Fix real friction points from multi-agent collaboration (2D Minecraft build, 2026-07-26).

---

## CRITICAL ISSUES (caused actual work loss today)

### 1. File Conflicts — No Lock Indicator
**Problem:** `render.js` was rewritten by two different agents back-to-back; team had to enforce a "final decision" to stop thrashing.
**Solution:** Show visible "Agent editing this file" badge before conflicts happen. Soft lock, not hard — warn but allow override.
**Impact:** Prevents duplicate/contradictory work.

### 2. Blind Simultaneous Claims
**Problem:** Codex and Claude started work on competing engines in parallel (core.js vs js/world.js) without seeing each other's intent.
**Solution:** Show in-flight claims before an agent starts; add @mention syntax for directed asks (not broadcast to all).
**Impact:** Prevents architectural collision.

### 3. Serialized Browser Testing
**Problem:** Scout hit "Browser in use" multiple times; one agent blocks others from visual verification.
**Solution:** Per-agent browser sessions (or visible queue with estimated wait).
**Impact:** Unblocks parallel testing.

---

## PROCESS IMPROVEMENTS (prevent future collisions)

### 4. Smart Message Routing
- Don't broadcast every message to all agents
- Use @mention to route to specific agents
- Respect [IDLE] — don't wake idle agents for off-topic messages
- **Impact:** Reduces noise, focuses effort.

### 5. Ordered, Timestamped Updates
**Problem:** Scout warned about a conflict already resolved (stale batch).
**Solution:** Deliver messages in order with timestamps; agents see live state, not cached.
**Impact:** Decisions are current.

### 6. Structured Shared Memory
**Problem:** MEMORY.md got contradictory bullets from concurrent appends.
**Solution:** Per-section or per-agent zones; auto-prune superseded entries.
**Impact:** MEMORY stays authoritative.

---

## QUALITY-OF-LIFE IMPROVEMENTS

### 7. Concise Diffs
**Problem:** 1-line changes replayed entire ~100-line file as context.
**Solution:** Line-by-line diffs only (added/removed/modified).
**Impact:** Easier to review changes in chat.

### 8. Shared Task Board
**Problem:** Claims scattered in chat; unclear who owns what.
**Solution:** Pinned task board showing task owner, status (planning/working/testing/blocked/idle), and claimed files.
**Impact:** Prevents duplicate work.

### 9. Recovery Checkpoints
**Problem:** When agents collided on architecture, only manual "final decision" fixed it.
**Solution:** Shared checkpoints with one-click rollback to last stable state.
**Impact:** Faster recovery from mistakes.

---

## PRIORITY ORDER

**Tier 1 (Fix now — caused real issues):**
1. Real-time file-edit visibility + soft locks
2. Smart message routing (@mentions, respect [IDLE])
3. Ordered, timestamped message delivery

**Tier 2 (Unblock workflow):**
4. Per-agent browser sessions
5. Concise inline diffs
6. Structured MEMORY.md

**Tier 3 (Nice-to-have):**
7. Shared task board
8. Checkpoint + rollback
9. Collapse repeated status messages
10. Preview health panel (HTTP/console errors)

---

## Evidence
- render.js rewritten twice (file-lock failure)
- Two competing engines built in parallel (claim visibility failure)
- Scout blocked on browser access (serialization issue)
- MEMORY.md contradictory entries (concurrent append issue)
- Full-file diffs for 1-line changes (noise issue)

---

## Success Metrics
- Zero architectural collisions on next multi-agent build
- Browser testing happens in parallel (no waits)
- Shared memory stays authoritative (no pruning needed)
- Chat stays focused (no off-topic broadcasts)
