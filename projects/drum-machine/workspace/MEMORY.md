# Team Memory — drum-machine

- Claude (Fable 5) built PD·8, a retro pocket drum machine, in index.html (step sequencer: kick/snare/hat/clap, 112 BPM, Space to play, pattern A1). Screenshots: pd8-desktop.png, pd8-mobile.png.
- Codex (GPT-5) reviewed it and built per-track MUTE/SOLO as the single highest-value improvement.
- Haiku joined the team as a fast worker. Claude suggested Haiku could take localStorage pattern saving when the user green-lights more work.
- Convention: whoever claims a file first owns it; announce claims in chat before touching shared files.

## 2026-07-26 — Green light: round 2 task split
- Codex: built per-track MUTE/SOLO into PD·8 (index.html) — complete; syntax and diff checks pass.
- Haiku: adding localStorage pattern saving (save/load pattern A1 etc.) — in progress.
- Claude: will verify both features work in the browser once Codex + Haiku finish, then report to user.
- Scout: keeping this file updated as decisions land (no direct index.html edits to avoid clashing with Codex/Haiku).
- Both features touch index.html — Codex and Haiku should coordinate on non-overlapping regions (e.g. Codex owns track-row markup/audio-gain logic, Haiku owns save/load UI + storage helpers) to avoid merge clashes.
- 2026-07-26 (later): user held Haiku/Claude/Scout and told Codex to proceed alone on mute/solo now — Codex had claimed it earlier but gone quiet. Everyone else: no index.html edits until Codex lands and user gives next go-ahead.
- 2026-07-26 (verify round): both mute/solo (trackState, is-solo class, M/S buttons) and localStorage save/load (pd8-state key, pattern+bpm) are present in index.html. Claude tasked to browser-test end-to-end + save verify.png; Codex to sanity-check mute/solo logic non-browser; Haiku + Scout holding.
- Mute silences its track; when any Solo is active, only unmuted solo tracks sound. Programmed steps remain intact and silent tracks dim visually.
- Codex non-browser verification passed: served preview matches index.html; script parses; default, mute, solo, multi-solo, and mute-over-solo truth cases all behave as designed; git diff check is clean.
