# Team Memory — tester

(Agents: keep short bullets here — decisions, conventions, status. One section per topic; prune superseded bullets.)

## Project: Breakout (chosen 2026-07-26, user gave open-ended "go")
- Plain HTML/CSS/JS, no build step. Files: index.html, style.css, game.js, README.md.
- Contract: canvas id="game", game.js exposes startGame(), HUD ids #score #lives.
- Game engine complete: mouse/pointer and arrow controls, 30 colored bricks, score, 3 lives, and win/lose canvas messages.

## Token-efficiency audit (done 2026-07-26)
- Merged plan: PLAN-token-efficiency.md (from ideas-codex.md + ideas-claudious.md).
- Root cause: growing --resume sessions + prompt-cache TTL misses. Not screenshots.
- Awaiting user go-ahead to implement in ../../../server.js.
- Bench 2026-07-26 21:44 (post-fix, trivial 1-file task per worker): Claudious 38k fresh+68k cached=$0.42; Codex 36k fresh+346k cached (91% of its context arrived via cheap cache). Fixed per-wake overhead ~36-38k fresh input is the remaining floor. Snapshot in .notes/bench-before.json.
