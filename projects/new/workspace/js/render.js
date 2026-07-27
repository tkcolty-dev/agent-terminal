(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const hud = document.getElementById("hud");
  const TILE = Minecraft2D.TILE;
  const B = Minecraft2D.BLOCK;
  const camera = { x: 0, y: 0 };
  let clock = 0;
  const pointer = { x: -100, y: -100 };

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  const noise = (x, y, i = 0) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + i * 53.3) * 43758.5;
    return n - Math.floor(n);
  };

  // Day/night cycle: `clock` already advances ~1/60 per frame (see render()).
  const DAY_LENGTH = 90; // seconds for a full day+night loop
  const hexToRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const mixHex = (a, b, t) => {
    const c1 = hexToRgb(a), c2 = hexToRgb(b);
    const m = c1.map((v, i) => Math.round(v + (c2[i] - v) * t));
    return `rgb(${m[0]},${m[1]},${m[2]})`;
  };

  function drawSky(night = 0) {
    const grad = ctx.createLinearGradient(0, 0, 0, innerHeight);
    grad.addColorStop(0, mixHex("#4ba1e5", "#0b1230", night));
    grad.addColorStop(.68, mixHex("#bde7ff", "#1c2b4a", night));
    grad.addColorStop(1, mixHex("#effaff", "#2a3652", night));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, innerWidth, innerHeight);

    const sunAlpha = Math.max(0, 1 - night * 1.4);
    if (sunAlpha > .02) {
      ctx.globalAlpha = sunAlpha;
      ctx.fillStyle = "#fff4a0";
      ctx.beginPath(); ctx.arc(innerWidth - 112, 92, 38, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,210,.2)";
      ctx.beginPath(); ctx.arc(innerWidth - 112, 92, 58, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    const moonAlpha = Math.min(1, Math.max(0, (night - .3) * 1.4));
    if (moonAlpha > .02) {
      ctx.globalAlpha = moonAlpha;
      ctx.fillStyle = "#e8ecf5";
      ctx.beginPath(); ctx.arc(innerWidth - 112, 92, 28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(220,225,240,.25)";
      ctx.beginPath(); ctx.arc(innerWidth - 112, 92, 46, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(255,255,255,${moonAlpha * .9})`;
      for (let i = 0; i < 40; i++) {
        ctx.fillRect(noise(i, 11) * innerWidth, noise(i, 22) * innerHeight * .6, 2, 2);
      }
    }

    ctx.fillStyle = `rgba(255,255,255,${.7 - night * .35})`;
    for (let i = 0; i < 7; i++) {
      const x = ((i * 287 - camera.x * .12 + clock * 3) % (innerWidth + 380)) - 170;
      const y = 62 + i % 3 * 58;
      ctx.fillRect(x, y, 122, 24);
      ctx.fillRect(x + 29, y - 18, 65, 20);
      ctx.fillRect(x + 86, y + 8, 62, 16);
    }
    // Layered silhouettes keep the horizon from feeling empty.
    ctx.fillStyle = "rgba(74,135,116,.22)";
    ctx.beginPath();
    ctx.moveTo(0, innerHeight);
    for (let x = 0; x <= innerWidth + 80; x += 80) {
      const worldX = x + camera.x * .18;
      const y = innerHeight * .53 + Math.sin(worldX * .004) * 35 + Math.sin(worldX * .011) * 18;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(innerWidth, innerHeight);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(42,108,87,.25)";
    ctx.beginPath();
    ctx.moveTo(0, innerHeight);
    for (let x = 0; x <= innerWidth + 64; x += 64) {
      const worldX = x + camera.x * .28;
      ctx.lineTo(x, innerHeight * .66 + Math.sin(worldX * .006) * 27);
    }
    ctx.lineTo(innerWidth, innerHeight);
    ctx.closePath();
    ctx.fill();
  }

  function drawTile(id, sx, sy, wx, wy) {
    const palette = {
      [B.GRASS]: ["#85512d", "#72c83e"],
      [B.DIRT]: ["#85512d", "#a16438"],
      [B.STONE]: ["#7b8287", "#9ba1a5"],
      [B.WOOD]: ["#754622", "#a96d35"],
      [B.LEAVES]: ["#2d8736", "#50b348"],
      [B.BEDROCK]: ["#30363a", "#555c60"],
      [B.COAL]: ["#2a2a2a", "#4a4a4a"],
      [B.IRON]: ["#8b9ca6", "#c4a76b"],
    }[id];
    if (!palette) return;
    ctx.fillStyle = palette[0];
    ctx.fillRect(Math.floor(sx), Math.floor(sy), TILE + 1, TILE + 1);
    if (id === B.GRASS) {
      ctx.fillStyle = palette[1]; ctx.fillRect(sx, sy, TILE, 8);
      for (let i = 0; i < 5; i++) ctx.fillRect(sx + noise(wx, wy, i) * 28, sy + 7, 2, 3 + noise(wx, wy, i + 9) * 5);
    } else if (id === B.WOOD) {
      ctx.fillStyle = palette[1]; ctx.fillRect(sx + 5, sy, 4, TILE); ctx.fillRect(sx + 21, sy, 3, TILE);
      ctx.fillStyle = "#513019"; ctx.fillRect(sx + 13, sy + 7, 5, 2); ctx.fillRect(sx + 23, sy + 23, 5, 2);
    } else if (id === B.LEAVES) {
      ctx.fillStyle = palette[1];
      for (let i = 0; i < 7; i++) ctx.fillRect(sx + noise(wx, wy, i) * 25, sy + noise(wx, wy, i + 8) * 25, 7, 7);
    } else if (id === B.COAL) {
      ctx.fillStyle = palette[1];
      for (let i = 0; i < 8; i++) ctx.fillRect(sx + noise(wx, wy, i) * 26, sy + noise(wx, wy, i + 5) * 26, 5, 5);
    } else if (id === B.IRON) {
      ctx.fillStyle = palette[1];
      for (let i = 0; i < 6; i++) {
        ctx.fillRect(sx + 4 + noise(wx, wy, i) * 22, sy + 4 + noise(wx, wy, i + 6) * 22, 6, 6);
      }
    } else {
      ctx.fillStyle = palette[1];
      for (let i = 0; i < 5; i++) ctx.fillRect(sx + 3 + noise(wx, wy, i) * 24, sy + 3 + noise(wx, wy, i + 7) * 24, 4, 4);
    }
    ctx.fillStyle = "rgba(0,0,0,.12)"; ctx.fillRect(sx, sy + TILE - 2, TILE, 2); ctx.fillRect(sx + TILE - 2, sy, 2, TILE);
    ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fillRect(sx, sy, TILE, 2);
  }

  function drawPlayer(p) {
    const x = Math.round(p.x - camera.x), y = Math.round(p.y - camera.y);
    ctx.save();
    if (p.facing < 0) { ctx.translate(x + p.w, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
    ctx.fillStyle = "#263c79"; ctx.fillRect(x + 2, y + 34, 8, 20); ctx.fillRect(x + 13, y + 34, 8, 20);
    ctx.fillStyle = "#1ca5a3"; ctx.fillRect(x, y + 18, 22, 19);
    ctx.fillStyle = "#c88963"; ctx.fillRect(x - 3, y + 20, 4, 18); ctx.fillRect(x + 21, y + 20, 4, 18);
    ctx.fillStyle = "#d8a078"; ctx.fillRect(x + 2, y, 19, 19);
    ctx.fillStyle = "#493222"; ctx.fillRect(x + 2, y, 19, 5); ctx.fillRect(x + 2, y + 4, 4, 5);
    ctx.fillStyle = "#fff"; ctx.fillRect(x + 13, y + 7, 5, 5);
    ctx.fillStyle = "#263e50"; ctx.fillRect(x + 16, y + 8, 2, 3);
    ctx.restore();
  }

  function drawTarget(game) {
    const tx = Math.floor((pointer.x + camera.x) / TILE);
    const ty = Math.floor((pointer.y + camera.y) / TILE);
    const px = (game.player.x + game.player.w / 2) / TILE;
    const py = (game.player.y + game.player.h / 2) / TILE;
    const reachable = Math.hypot(tx + .5 - px, ty + .5 - py) <= 5;
    if (tx < 0 || ty < 0 || tx >= game.world.width || ty >= game.world.height) return;
    const sx = tx * TILE - camera.x, sy = ty * TILE - camera.y;
    ctx.fillStyle = reachable ? "rgba(255,255,255,.16)" : "rgba(255,70,70,.12)";
    ctx.fillRect(sx + 1, sy + 1, TILE - 2, TILE - 2);
    ctx.strokeStyle = reachable ? "rgba(255,255,255,.95)" : "rgba(255,95,95,.75)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(Math.round(sx) + 1, Math.round(sy) + 1, TILE - 2, TILE - 2);
    ctx.setLineDash([]);
  }

  window.Renderer = {
    camera,
    render(game) {
      clock += 1 / 60;
      const tx = game.player.x + game.player.w / 2 - innerWidth / 2;
      const ty = game.player.y + game.player.h / 2 - innerHeight * .56;
      camera.x += (Math.max(0, Math.min(tx, game.world.width * TILE - innerWidth)) - camera.x) * .1;
      camera.y += (Math.max(0, Math.min(ty, game.world.height * TILE - innerHeight)) - camera.y) * .1;
      const phase = (clock % DAY_LENGTH) / DAY_LENGTH;
      const night = (1 - Math.cos(phase * Math.PI * 2)) / 2; // 0 = noon, 1 = midnight
      drawSky(night);
      const x0 = Math.max(0, Math.floor(camera.x / TILE)), y0 = Math.max(0, Math.floor(camera.y / TILE));
      const x1 = Math.min(game.world.width, x0 + Math.ceil(innerWidth / TILE) + 2);
      const y1 = Math.min(game.world.height, y0 + Math.ceil(innerHeight / TILE) + 2);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const id = game.world.get(x, y);
        const sx = x * TILE - camera.x, sy = y * TILE - camera.y;
        if (id === B.AIR && y > game.world.surface[x]) {
          ctx.fillStyle = y > game.world.surface[x] + 8 ? "#16171a" : "#332c27";
          ctx.fillRect(Math.floor(sx), Math.floor(sy), TILE + 1, TILE + 1);
          ctx.fillStyle = "rgba(255,255,255,.025)";
          ctx.fillRect(sx + noise(x, y) * 25, sy + noise(x, y, 2) * 25, 4, 4);
        } else if (id !== B.AIR) {
          drawTile(id, sx, sy, x, y);
        }
      }
      drawPlayer(game.player);
      drawTarget(game);
      const depth = Math.max(0, game.player.y / TILE - game.world.surface[Math.floor(game.player.x / TILE)]);
      if (depth > 3) {
        const alpha = Math.min(.45, (depth - 3) * .035);
        const shade = ctx.createRadialGradient(innerWidth / 2, innerHeight / 2, 80, innerWidth / 2, innerHeight / 2, Math.max(innerWidth, innerHeight) * .7);
        shade.addColorStop(0, "rgba(0,0,0,0)");
        shade.addColorStop(1, `rgba(0,0,0,${alpha})`);
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, innerWidth, innerHeight);
      }
      hud.innerHTML = `<b>BLOCKBOUND</b><br>Move: A/D · Jump: W/Space<br>Mine: left click · Place: right click`;
    },
    resize
  };
  resize();
  addEventListener("resize", resize);
  canvas.addEventListener("mousemove", event => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
  });
  canvas.addEventListener("mouseleave", () => { pointer.x = -100; pointer.y = -100; });
})();
