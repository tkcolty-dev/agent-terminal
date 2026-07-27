# 737 Survival Flight

A small browser game about keeping a Boeing 737-style jet airborne for as long
as possible. Open `index.html` through the local preview server; no build step is
needed.

## How the files fit together

- `index.html` loads Three.js and the game scripts, then provides the HUD.
- `main.js` builds the world, reads the keyboard, follows the aircraft with the
  camera, and calls the physics once per frame.
- `plane.js` builds the low-poly 737-800 and handles pitch, roll, yaw, throttle,
  lift, drag, gravity, stalls, and ground impact.
- `effects.js` creates the one-time fire, smoke, and debris crash effect.

`main.js` writes four normalized inputs to `state.controls`: `pitch`, `roll`,
`yaw`, and `throttle`. `plane.js` reads those values without creating temporary
objects every frame. Shared geometry and materials keep the detailed aircraft
inexpensive to render.

## Running it

Visit <http://localhost:4600/preview/plane/>. The controls and survival time are
shown in the game HUD.
