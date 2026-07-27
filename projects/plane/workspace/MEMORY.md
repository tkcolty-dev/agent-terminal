# Team Memory — plane

(Agents: keep short bullets here — decisions, conventions, status. One section per topic; prune superseded bullets.)

## Project
- Goal: polished 3D simulation of a Boeing 737 crash (user request 2026-07-27).
- Stack: Three.js from CDN, plain JS modules loaded via script tags (no build step).
- Interface contract: plane.js (Codex) exposes globals `buildPlane()` → THREE.Group and `updatePlane(state, dt)` for flight + crash physics; main.js (Claudious) owns scene/camera/UI and calls those. effects.js (Claudious) exposes `triggerCrashEffects(scene, position)`.
- Code must be beginner-friendly: heavy plain-English comments, README.md kept current.
- `plane.js` now has researched 737-800 proportions, swept wings, blended winglets, detailed CFM56-style nacelles, cabin/cockpit windows, and a blue livery. Physics reads all four controls and models thrust, drag, lift, gravity, banking, stalls, and impact without per-frame object allocation.
- Full-power pitch-up now gains altitude (28m to 52m in the 8s harness); dive/no-throttle still crashes in about 3.6s and impact remains one-shot/frozen.
- Controls contract (2026-07-27): main.js writes `state.controls = { pitch, roll, yaw, throttle }` (each -1..1, throttle 0..1) from the keyboard; `updatePlane()` reads it to steer the plane. User goal: playable "how long can you avoid crashing" test — keep code lean/performant.
