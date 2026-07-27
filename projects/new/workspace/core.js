// Shared gameplay core for the 2D block sandbox.
// Rendering code can consume `game.world`, `game.player`, and call `game.update`.
(function () {
  "use strict";

  const TILE = 32;
  const WORLD_WIDTH = 220;
  const WORLD_HEIGHT = 72;

  const BLOCK = Object.freeze({
    AIR: 0,
    GRASS: 1,
    DIRT: 2,
    STONE: 3,
    WOOD: 4,
    LEAVES: 5,
    BEDROCK: 6,
    COAL: 7,
    IRON: 8,
  });

  const solid = (id) => id !== BLOCK.AIR && id !== BLOCK.LEAVES;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Tiny deterministic PRNG so terrain is stable across refreshes.
  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeWorld(seed = 1337) {
    const random = mulberry32(seed);
    const tiles = Array.from({ length: WORLD_HEIGHT }, () =>
      new Uint8Array(WORLD_WIDTH)
    );
    const surface = new Int16Array(WORLD_WIDTH);
    let height = 32;

    for (let x = 0; x < WORLD_WIDTH; x++) {
      if (x % 4 === 0) height += Math.floor(random() * 3) - 1;
      height = clamp(height, 24, 40);
      surface[x] = height;
      for (let y = height; y < WORLD_HEIGHT; y++) {
        tiles[y][x] =
          y === WORLD_HEIGHT - 1
            ? BLOCK.BEDROCK
            : y === height
              ? BLOCK.GRASS
              : y < height + 4
                ? BLOCK.DIRT
                : BLOCK.STONE;
      }
    }

    // Shallow caves.
    for (let i = 0; i < 28; i++) {
      const cx = 8 + Math.floor(random() * (WORLD_WIDTH - 16));
      const cy = 40 + Math.floor(random() * 22);
      const rx = 2 + Math.floor(random() * 5);
      const ry = 1 + Math.floor(random() * 3);
      for (let y = cy - ry; y <= cy + ry; y++) {
        for (let x = cx - rx; x <= cx + rx; x++) {
          if (
            y < WORLD_HEIGHT - 1 &&
            ((x - cx) ** 2) / rx ** 2 + ((y - cy) ** 2) / ry ** 2 < 1
          ) {
            tiles[y][x] = BLOCK.AIR;
          }
        }
      }
    }

    // Trees, leaving the spawn area clear.
    for (let x = 6; x < WORLD_WIDTH - 5; x++) {
      if (Math.abs(x - 15) < 6 || random() > 0.075) continue;
      const ground = surface[x];
      const trunk = 3 + Math.floor(random() * 3);
      for (let y = ground - 1; y >= ground - trunk; y--) tiles[y][x] = BLOCK.WOOD;
      for (let yy = ground - trunk - 2; yy <= ground - trunk + 1; yy++) {
        for (let xx = x - 2; xx <= x + 2; xx++) {
          if (Math.abs(xx - x) + Math.abs(yy - (ground - trunk)) < 4) {
            tiles[yy][xx] = BLOCK.LEAVES;
          }
        }
      }
    }

    // Coal ore scattered in stone
    for (let i = 0; i < 60; i++) {
      const cx = Math.floor(random() * WORLD_WIDTH);
      const cy = 45 + Math.floor(random() * 20);
      for (let y = cy - 1; y <= cy + 1; y++) {
        for (let x = cx - 1; x <= cx + 1; x++) {
          if (x >= 0 && x < WORLD_WIDTH && y >= 0 && y < WORLD_HEIGHT - 1 && tiles[y][x] === BLOCK.STONE) {
            if (random() > 0.3) tiles[y][x] = BLOCK.COAL;
          }
        }
      }
    }

    // Iron ore scattered deeper
    for (let i = 0; i < 40; i++) {
      const cx = Math.floor(random() * WORLD_WIDTH);
      const cy = 55 + Math.floor(random() * 12);
      for (let y = cy - 1; y <= cy + 1; y++) {
        for (let x = cx - 1; x <= cx + 1; x++) {
          if (x >= 0 && x < WORLD_WIDTH && y >= 0 && y < WORLD_HEIGHT - 1 && tiles[y][x] === BLOCK.STONE) {
            if (random() > 0.4) tiles[y][x] = BLOCK.IRON;
          }
        }
      }
    }

    return {
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      tiles,
      surface,
      get(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return BLOCK.BEDROCK;
        return this.tiles[y][x];
      },
      set(x, y, id) {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height - 1) {
          this.tiles[y][x] = id;
          return true;
        }
        return false;
      },
    };
  }

  function collides(world, x, y, w, h) {
    const left = Math.floor(x / TILE);
    const right = Math.floor((x + w - 0.01) / TILE);
    const top = Math.floor(y / TILE);
    const bottom = Math.floor((y + h - 0.01) / TILE);
    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) {
        if (solid(world.get(tx, ty))) return true;
      }
    }
    return false;
  }

  function createGame(seed) {
    const world = makeWorld(seed);
    const spawnX = 15;
    const player = {
      x: spawnX * TILE,
      y: (world.surface[spawnX] - 2) * TILE,
      w: 22,
      h: 54,
      vx: 0,
      vy: 0,
      grounded: false,
      facing: 1,
      selected: BLOCK.DIRT,
    };

    function moveAxis(axis, amount) {
      const steps = Math.max(1, Math.ceil(Math.abs(amount) / 4));
      const delta = amount / steps;
      for (let i = 0; i < steps; i++) {
        player[axis] += delta;
        if (collides(world, player.x, player.y, player.w, player.h)) {
          player[axis] -= delta;
          if (axis === "y" && delta > 0) player.grounded = true;
          player[axis === "x" ? "vx" : "vy"] = 0;
          break;
        }
      }
    }

    return {
      world,
      player,
      tileSize: TILE,
      block: BLOCK,
      update(dt, input) {
        dt = Math.min(dt, 1 / 20);
        const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        player.vx += direction * 1600 * dt;
        player.vx *= direction ? 0.88 : 0.72;
        player.vx = clamp(player.vx, -240, 240);
        if (direction) player.facing = direction;
        if (input.jump && player.grounded) {
          player.vy = -520;
          player.grounded = false;
        }
        player.vy = Math.min(player.vy + 1450 * dt, 850);
        player.grounded = false;
        moveAxis("x", player.vx * dt);
        moveAxis("y", player.vy * dt);
      },
      interact(tileX, tileY, place = false) {
        const px = (player.x + player.w / 2) / TILE;
        const py = (player.y + player.h / 2) / TILE;
        if (Math.hypot(tileX + 0.5 - px, tileY + 0.5 - py) > 5) return false;
        if (place) {
          if (world.get(tileX, tileY) !== BLOCK.AIR) return false;
          const old = world.get(tileX, tileY);
          world.set(tileX, tileY, player.selected);
          if (collides(world, player.x, player.y, player.w, player.h)) {
            world.set(tileX, tileY, old);
            return false;
          }
          return true;
        }
        const id = world.get(tileX, tileY);
        if (id === BLOCK.AIR || id === BLOCK.BEDROCK) return false;
        world.set(tileX, tileY, BLOCK.AIR);
        return id; // truthy block id so callers can add it to an inventory
      },
    };
  }

  window.Minecraft2D = { createGame, BLOCK, TILE };
})();
