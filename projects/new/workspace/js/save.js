// Save/load world + player + inventory to localStorage. Uses only core.js's
// public game.world/game.player API so it works regardless of engine internals.
// API: SaveGame.save(game), SaveGame.load(game) -> boolean (true if a save was applied)

const SaveGame = (function () {
  const KEY = 'blockbound-save-v1';

  function save(game) {
    const w = game.world;
    const tiles = [];
    for (let y = 0; y < w.height; y++) {
      for (let x = 0; x < w.width; x++) tiles.push(w.get(x, y));
    }
    const data = {
      width: w.width,
      height: w.height,
      tiles,
      player: { x: game.player.x, y: game.player.y },
      inventory: typeof Inventory !== 'undefined' ? Inventory.getCounts() : null,
      hp: typeof Health !== 'undefined' ? Health.getHp() : null,
    };
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function load(game) {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return false;
    }
    const w = game.world;
    if (data.width !== w.width || data.height !== w.height) return false; // stale/incompatible save
    let i = 0;
    for (let y = 0; y < w.height; y++) {
      for (let x = 0; x < w.width; x++) w.set(x, y, data.tiles[i++]);
    }
    game.player.x = data.player.x;
    game.player.y = data.player.y;
    game.player.vx = 0;
    game.player.vy = 0;
    if (typeof Inventory !== 'undefined' && data.inventory) Inventory.setCounts(data.inventory);
    if (typeof Health !== 'undefined' && typeof data.hp === 'number') Health.setHp(data.hp);
    return true;
  }

  function clear() {
    localStorage.removeItem(KEY);
  }

  return { save, load, clear };
})();
