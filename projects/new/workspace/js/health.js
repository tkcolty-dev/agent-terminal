// Health + fall damage, layered on top of core.js without modifying it.
// API: Health.init(spawnX, spawnY), Health.update(game) — call every frame after game.update().

const Health = (function () {
  const MAX_HP = 10;
  const SAFE_FALL_SPEED = 480; // px/s — below this, no damage on landing
  const MAX_FALL_SPEED = 900;  // px/s — at/above this, a full hit

  let hp = MAX_HP;
  let wasGrounded = true;
  let peakFallSpeed = 0;
  let spawn = { x: 0, y: 0 };
  let bar, fill, label;

  function renderBar() {
    fill.style.width = `${Math.max(0, hp / MAX_HP) * 100}%`;
    label.textContent = `${Math.max(0, Math.round(hp))} / ${MAX_HP}`;
  }

  function damage(amount) {
    hp = Math.max(0, hp - amount);
    renderBar();
    bar.classList.add('hit');
    setTimeout(() => bar.classList.remove('hit'), 200);
    if (typeof Sound !== 'undefined') Sound.damage();
  }

  function respawn(game) {
    game.player.x = spawn.x;
    game.player.y = spawn.y;
    game.player.vx = 0;
    game.player.vy = 0;
    hp = MAX_HP;
    renderBar();
  }

  function init(spawnX, spawnY) {
    spawn = { x: spawnX, y: spawnY };
    const el = document.createElement('div');
    el.id = 'healthbar';
    el.innerHTML = `<div class="fill"></div><span class="label"></span>`;
    document.body.appendChild(el);
    bar = el;
    fill = el.querySelector('.fill');
    label = el.querySelector('.label');
    renderBar();
  }

  function update(game) {
    const grounded = game.player.grounded;
    if (!grounded) {
      peakFallSpeed = Math.max(peakFallSpeed, game.player.vy);
    } else if (!wasGrounded) {
      // Just landed — apply damage proportional to how fast we were falling.
      if (peakFallSpeed > SAFE_FALL_SPEED) {
        const t = (peakFallSpeed - SAFE_FALL_SPEED) / (MAX_FALL_SPEED - SAFE_FALL_SPEED);
        damage(Math.ceil(clamp01(t) * MAX_HP));
      }
      peakFallSpeed = 0;
    }
    wasGrounded = grounded;
    if (hp <= 0) respawn(game);
  }

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  function getHp() { return hp; }
  function setHp(v) {
    hp = clamp01(v / MAX_HP) * MAX_HP;
    if (bar) renderBar();
  }

  return { init, update, getHp, setHp };
})();
