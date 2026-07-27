# Merged Plan: Make Agent Terminal Token-Efficient
(sources: ideas-codex.md + ideas-claudious.md, merged by Boss 2026-07-26)

## Why it burns millions of tokens
Every wake `--resume`s a forever-growing CLI session. When an agent sits idle past
the ~5-minute prompt-cache TTL, that whole history re-bills at FULL price on the
next wake. Growth + cache misses compound — that's the hog.

## Do in this order
1. **Fix the token meter first** (measure before optimizing): show fresh input,
   cache-read, cache-write, output, and $ separately. Today cached input counts at
   full weight, so we're flying blind.
2. **Three one-number edits** (minutes of work, most of the win):
   - `--max-turns` 40 → 12 (workers) in the claude `command()`
   - `MAX_AUTO_TURNS` 8 → 3
   - filter `buildPrompt()` inbox: only the waking message + last ~4 relevant
     messages, cap ~6k chars; drop [IDLE]/system chatter and other agents' mentions
3. **Session rotation**: clear `sessionId` after ~6 worker turns / ~10 lead turns or
   a token threshold; fresh session re-reads MEMORY.md + TASKBOARD.md as carry-over.
   Bounds cost from quadratic to linear. (`shouldRotateSession()` at top of `runTurn()`.)
4. **Wake-gating + batching**: workers wake only on direct @mention; coalesce
   parallel worker reports into ONE lead wake (small debounce).

## Deliberately NOT doing
- Slimming the 19-rule briefing: prompt caching makes it nearly free, and rewriting
  it invalidates the cache. Keep briefing text stable; don't bump BRIEF_V cosmetically.
- Screenshot "optimization": images are never sent to models (chat only carries text).
