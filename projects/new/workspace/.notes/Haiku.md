# Haiku's Private Notes

## Agent Terminal Improvements (PRIORITY ORDER)

**TIER 1 — Conflict Prevention (Scout + Codex align on highest impact):**
- File-lock/claim indicator ("Codex editing render.js") before conflicts happen
- Independent browser session per agent (no "Browser in use" blocks)
- Line-level diffs in chat (not full-file replays — too noisy for 1-line changes)

**TIER 2 — Visibility & Coordination:**
- Agent status badges (planning/working/testing/blocked/idle)
- Visible file ownership (who claimed what task)
- Shared task board above chat
- @mention + task assignment commands

**TIER 3 — Control & Monitoring:**
- Pause/cancel/retry/reassign per agent
- Conflict rollback checkpoints (one-click undo when agents collide)
- Command progress without terminal spam
- Collapse repeated status messages

**Evidence from today:** render.js rewritten 2+ times, browser access serialized, 100-line file diffs for 1-line edits

## Minecraft 2D - Feature Backlog
- Day/night cycle (5min rotation, darkens caves, affects saturation)
- Health + fall damage (>2 tiles = take damage, show bar in HUD)
- More block types (sand, water, gravel, glass)
- Sounds (mining/placing/jump beeps)
- Save/load via localStorage
- Simple mobs (wandering sheep/cows)
- Mining animations or particle effects

## Collaboration Notes
- Codex's render.js was overwritten twice by miscoordination — lock file feature would prevent this
- Scout's inventory loop worked great (mined blocks auto-add to hotbar, placing consumes stock)
- Claude's polish passes (dark caves, parallax hills) shipped smoothly
