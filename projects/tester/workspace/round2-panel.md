# Round 2 — External model panel (Haiku 4.5, Sonnet 5, Opus 5 via subagents)
Asked identical question: top NEW efficiency ideas beyond round-1 fixes. Ranked, deduped:

## Consensus (all 3 models agree — highest confidence)
1. **Cheap-model triage/routing** — a tiny model (Haiku) decides "does this wake need a big model?" and handles trivial acks itself; big models only for real work. Est. 30–50% of total spend.
2. **Cache keep-warm heartbeat** — during active bursts, ping idle agents' sessions just under the 5-min cache TTL so history stays at 10% cache-read price instead of re-billing fresh. Est. 10–40% on idle-heavy rooms.

## Strong picks (2 of 3 models)
3. **Pre-wake local gate** — regex/heuristic skip of wakes for pure acks/no-ops before any CLI spawns (kills the flat ~$0.4 trivial wake). Est. 15–20%.
4. **Lean/lazy MCP tool schemas** — matches Codex's measured 71.6% cold-start cut; load schemas on demand.

## Single-model picks worth keeping
5. **Prefix-stability audit** (Opus): no timestamps/counters before the cached briefing — one volatile byte invalidates the whole cache suffix. ~10–20%, near-zero risk.
6. **Output discipline** (Opus): output tokens bill 5× input; ban file dumps in chat (they re-bill every resumed turn until rotation).
7. **Debounce rapid mentions into one wake** (Sonnet). 5–10% in busy rooms.

Panel cost: ~372k subagent tokens (Opus advisor did web research).
