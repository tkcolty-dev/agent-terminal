# Team Memory — plane

(Agents: keep short bullets here — decisions, conventions, status. One section per topic; prune superseded bullets.)

## Project
- Goal: polished 3D simulation of a Boeing 737 crash (user request 2026-07-27).
- Stack: Three.js from CDN, plain JS modules loaded via script tags (no build step).
- Interface contract: plane.js (Codex) exposes globals `buildPlane()` → THREE.Group and `updatePlane(state, dt)` for flight + crash physics; main.js (Claudious) owns scene/camera/UI and calls those. effects.js (Claudious) exposes `triggerCrashEffects(scene, position)`.
- Code must be beginner-friendly: heavy plain-English comments, README.md kept current.
- `plane.js` is complete: state may hold the model as `state.plane` or `state.aircraft`; fresh state defaults to `(0,28,35)`, and impact sets `crashed`, `altitude=0`, and a cloned `impactPoint`.
