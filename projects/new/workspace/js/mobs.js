// Passive mobs (sheep + pigs) — Claude.
// Self-contained: draws on the shared #game canvas using window.Renderer.camera,
// so render.js never needs to change. Wire-up in index.html:
//   Mobs.init(game);            // once, after createGame
//   Mobs.update(dt, game);      // each frame, after game.update
//   Mobs.draw(game);            // each frame, after Renderer.render
const Mobs = (function () {
  const TILE = window.Minecraft2D.TILE;
  const B = window.Minecraft2D.BLOCK;
  const solid = (id) => id !== B.AIR && id !== B.LEAVES;
  const mobs = [];
  let ctx = null;

  const KINDS = {
    sheep: { w: 26, h: 20, body: "#e8e6e0", head: "#cfc9bd", legs: "#b5ad9e", speed: 22 },
    pig:   { w: 26, h: 18, body: "#e8a0a8", head: "#dd8f98", legs: "#c47880", speed: 26 },
  };

  function collides(world, x, y, w, h) {
    const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.01) / TILE);
    const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        if (solid(world.get(tx, ty))) return true;
    return false;
  }

  function init(game) {
    ctx = document.getElementById("game").getContext("2d");
    mobs.length = 0;
    const world = game.world;
    // deterministic-ish spread across the map, skipping the spawn area
    for (let i = 0; i < 10; i++) {
      const tx = 25 + Math.floor((i * 37 + 11) % (world.width - 50));
      if (Math.abs(tx - 15) < 8) continue;
      const kind = i % 2 ? "pig" : "sheep";
      mobs.push({
        kind,
        x: tx * TILE,
        y: (world.surface[tx] - 1) * TILE - KINDS[kind].h,
        vx: 0, vy: 0,
        dir: i % 3 === 0 ? -1 : 1,
        state: "walk",          // walk | idle
        timer: 1 + (i % 5),     // seconds until next state change
        grounded: false,
      });
    }
  }

  function update(dt, game) {
    dt = Math.min(dt, 1 / 20);
    const world = game.world;
    for (const m of mobs) {
      const k = KINDS[m.kind];
      m.timer -= dt;
      if (m.timer <= 0) {
        // flip a pseudo-coin: wander or stand around
        m.state = m.state === "walk" ? "idle" : "walk";
        if (m.state === "walk" && Math.sin(m.x * 12.9898 + m.y * 78.233) > 0) m.dir *= -1;
        m.timer = 1.5 + Math.abs(Math.sin(m.x * 0.13)) * 3;
      }

      m.vx = m.state === "walk" ? m.dir * k.speed : 0;
      m.vy = Math.min(m.vy + 1450 * dt, 850);

      // horizontal move; hop up single-tile steps, otherwise turn around
      if (m.vx) {
        const nx = m.x + m.vx * dt;
        if (!collides(world, nx, m.y, k.w, k.h)) {
          m.x = nx;
        } else if (m.grounded && !collides(world, nx, m.y - TILE, k.w, k.h)) {
          m.vy = -320; // hop
        } else {
          m.dir *= -1;
        }
      }

      // vertical move
      const ny = m.y + m.vy * dt;
      m.grounded = false;
      if (!collides(world, m.x, ny, k.w, k.h)) {
        m.y = ny;
      } else {
        if (m.vy > 0) m.grounded = true;
        m.vy = 0;
        m.y = Math.round(m.y / TILE) * TILE + (TILE - (k.h % TILE)) % TILE;
      }

      // safety: fell out of world → respawn on surface
      if (m.y > world.height * TILE + 200) {
        const tx = Math.max(2, Math.min(world.width - 3, Math.floor(m.x / TILE)));
        m.y = (world.surface[tx] - 1) * TILE - k.h;
        m.vy = 0;
      }
    }
  }

  function draw(game) {
    if (!ctx) return;
    const cam = window.Renderer.camera;
    for (const m of mobs) {
      const k = KINDS[m.kind];
      const x = Math.round(m.x - cam.x), y = Math.round(m.y - cam.y);
      if (x < -60 || x > innerWidth + 60 || y < -60 || y > innerHeight + 60) continue;
      ctx.save();
      if (m.dir < 0) { ctx.translate(x + k.w, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
      // legs (offset alternates while walking for a simple gait)
      const step = m.state === "walk" ? Math.round(Math.sin(m.x * 0.25)) * 2 : 0;
      ctx.fillStyle = k.legs;
      ctx.fillRect(x + 3, y + k.h - 6, 4, 6 + step);
      ctx.fillRect(x + k.w - 7, y + k.h - 6, 4, 6 - step);
      // body
      ctx.fillStyle = k.body;
      ctx.fillRect(x, y, k.w, k.h - 5);
      // head
      ctx.fillStyle = k.head;
      ctx.fillRect(x + k.w - 8, y - 5, 10, 10);
      // eye + snout
      ctx.fillStyle = "#2b2b2b";
      ctx.fillRect(x + k.w - 2, y - 2, 2, 2);
      if (m.kind === "pig") { ctx.fillStyle = "#c96f78"; ctx.fillRect(x + k.w + 1, y + 1, 2, 3); }
      ctx.restore();
    }
  }

  return { init, update, draw, mobs };
})();
