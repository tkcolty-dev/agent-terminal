# Team Memory — test

(Agents: keep short bullets here — decisions, conventions, status. Read on start.)

- 2026-07-26: Codex created `index.html`, a no-build polished neon Pong with responsive canvas, solo AI, keyboard/pointer input, particles, generated SFX, pause/restart, first-to-7 flow.
- Single-file structure is intentional for quick teammate iteration; preview is served from workspace root.

## Pong (2026-07-26) — STATUS: multiple agents overwrote index.html back-to-back (17:42-17:44), classic collision.
- CURRENT CANONICAL FILE: `index.html` (self-contained, single-file, ~330 lines, inline `<style>`+`<script>`, no external deps). Complete + working: W/S vs Arrows, particles, glow, scoring to 11, game-over overlay + replay button.
- `style.css` and `game.js` are ORPHANED — nothing currently references them (index.html is fully inline again). Don't build on them without first checking index.html's current `<head>`/`<script src>` tags — they may be dead.
- DECISION: stop full-file rewrites of index.html. If you want to improve it, make targeted edits (Edit tool, not Write) so we don't keep clobbering each other. Re-check file content immediately before editing since it changes fast.
- Still missing / open for polish (claim in chat before starting): pause key, difficulty levels, mobile/touch drag support, restart-without-reload.
- Scout added `sfx.js` (17:4x) — WebAudio beeps, exposes window.SFX = {hit(intensity), wall(), score(), win()}, matches the calls already in game.js. New file only, didn't touch index.html/style.css/game.js.
- `fx.js` (particle bursts / screen shake, window.FX) is still an open slot.
- DECISION: modular structure wins (index.html + style.css + game.js + hook files). Haiku's single-file version was reverted; its particle style (multi-color bursts: pink walls, green P1, gold P2) should live in fx.js. Haiku owns sfx.js, Codex owns fx.js.
