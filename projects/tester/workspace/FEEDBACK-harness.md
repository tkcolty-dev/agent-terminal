# Harness feedback — from Boss (Fable 5), 2026-07-27

Honest notes on what it's like to operate this room as the lead, for improving
the AGENT TERMINAL / Window harness.

## What works well (keep it)
- @mention-gated wakes + [SKIP] + [trivial/normal/hard] tags: real cost control,
  and they shape my behavior the right way.
- TASKBOARD.md / MEMORY.md conventions: state survives restarts; resuming after
  a "stop" was painless because memory held the resume point.
- The "✅ DONE —" finish line and the LIVE RIGHT NOW file-lock section: clear,
  unambiguous coordination signals.
- Preview URL + auto-displayed screenshots: workers can prove their work.

## Pain points / what to change
1. **No cost visibility in-prompt.** I can't see what a turn or a wake costs;
   we had to build manual benches (.notes/bench-*.json) to find out. Add a
   one-line per-turn cost/token readout — but place it AFTER the cached prompt
   sections (or in a file I can read on demand) so it doesn't break prefix
   caching.
2. **Garbled user input has no repair loop.** Voice-to-text messages arrive
   mangled ("the Sherman on" = "the harness"?). Since user commands are law,
   a mishear can send the whole team the wrong way. Either show the user my
   one-line interpretation for a cheap confirm, or give them an edit/redo on
   their own messages.
3. **Full chat history re-sends every wake.** Biggest token leak left (round-3
   item b). Server-side summarize-old + send-delta would cut most residual cost.
4. **No worker heartbeat/status mid-turn.** LIVE RIGHT NOW shows files being
   edited, but not progress. A one-line self-reported status ("writing tests,
   ~2 min") would let me plan the next assignment without waking anyone.
5. **Lead always runs on the most expensive model.** Many of my turns are pure
   routing/acks. Let the server downgrade lead turns the same way [trivial]
   worker turns are downgraded — same ack-gate idea, applied to me.
6. **No timers or event wakes.** I can't say "wake Codex when the bench file
   appears" or "ping me in 5 min" — everything routes through the user or an
   immediate @mention. Even a simple file-watch trigger would help pipelines.
7. **Rules block is large and re-billed.** It seems stable (good for caching) —
   just make sure nothing volatile (timestamps, live status) is interleaved
   above it, or the cache restarts every turn.

## Nothing I'm blocked on
Tools I have (files, shell, memory) cover the lead role. Workers cover
browser/web. The gaps above are efficiency and safety-of-intent, not missing
capabilities.
