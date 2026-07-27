// PONG — core loop, physics, input, scoring. (Claude)
// Optional teammate hooks: window.SFX = {hit,wall,score,win}, window.FX = {hit,score,update,draw}
(() => {
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const WIN_SCORE = 7;
const PADDLE_W = 14, PADDLE_H = 96, PADDLE_MARGIN = 30;
const BALL_R = 8;
const BASE_BALL_SPEED = 420, MAX_BALL_SPEED = 980, SPEEDUP = 1.045;
const PADDLE_SPEED = 560;
const AI_SPEEDS = { easy: 300, normal: 420, hard: 560 };
const AI_ERROR = { easy: 60, normal: 28, hard: 8 };

const sfx = (n, ...a) => { try { window.SFX?.[n]?.(...a); } catch (e) {} };
const fx  = (n, ...a) => { try { window.FX?.[n]?.(...a); } catch (e) {} };

const state = {
  mode: 'menu',        // menu | serve | play | pause | gameover
  players: 1,
  difficulty: 'normal',
  score: [0, 0],
  serveTimer: 0,
  serveDir: 1,
  shake: 0,
  flash: 0,
};

const p1 = { x: PADDLE_MARGIN, y: H / 2 - PADDLE_H / 2, vy: 0 };
const p2 = { x: W - PADDLE_MARGIN - PADDLE_W, y: H / 2 - PADDLE_H / 2, vy: 0 };
const ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, trail: [] };
let aiTargetOffset = 0;

// ---------- input ----------
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') {
    if (state.mode === 'play' || state.mode === 'serve') setMode('pause');
    else if (state.mode === 'pause') setMode('play');
    e.preventDefault();
  }
  if (e.code === 'Escape' && (state.mode === 'pause' || state.mode === 'gameover')) toMenu();
});
addEventListener('keyup', e => keys[e.code] = false);

let mouseY = null;
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouseY = (e.clientY - r.top) / r.height * H;
});
canvas.addEventListener('touchmove', e => {
  const r = canvas.getBoundingClientRect();
  mouseY = (e.touches[0].clientY - r.top) / r.height * H;
  e.preventDefault();
}, { passive: false });

// ---------- ui ----------
const $ = id => document.getElementById(id);
$('menu').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.diff) {
    state.difficulty = b.dataset.diff;
    document.querySelectorAll('#difficulty-row .btn').forEach(x => x.classList.toggle('sel', x === b));
  }
  if (b.dataset.mode) startGame(b.dataset.mode === '2p' ? 2 : 1);
});
$('rematch').addEventListener('click', () => startGame(state.players));
$('tomenu').addEventListener('click', toMenu);

function showPanel(id) {
  ['menu', 'pause', 'gameover'].forEach(p => $(p).classList.toggle('hidden', p !== id));
}

function setMode(m) {
  state.mode = m;
  showPanel(m === 'menu' ? 'menu' : m === 'pause' ? 'pause' : m === 'gameover' ? 'gameover' : null);
}

function toMenu() { state.score = [0, 0]; setMode('menu'); }

function startGame(players) {
  state.players = players;
  state.score = [0, 0];
  p1.y = p2.y = H / 2 - PADDLE_H / 2;
  serve(Math.random() < 0.5 ? 1 : -1);
}

function serve(dir) {
  state.serveDir = dir;
  state.serveTimer = 0.9;
  ball.x = W / 2; ball.y = H / 2;
  ball.vx = 0; ball.vy = 0;
  ball.trail.length = 0;
  aiTargetOffset = (Math.random() * 2 - 1) * AI_ERROR[state.difficulty];
  setMode('serve');
}

function launchBall() {
  const ang = (Math.random() * 0.5 - 0.25) * Math.PI;
  ball.vx = Math.cos(ang) * BASE_BALL_SPEED * state.serveDir;
  ball.vy = Math.sin(ang) * BASE_BALL_SPEED;
  setMode('play');
}

// ---------- update ----------
function movePaddle(p, dt, up, down, useMouse) {
  let target = null;
  if (useMouse && mouseY !== null) target = mouseY - PADDLE_H / 2;
  if (up) p.vy = -PADDLE_SPEED;
  else if (down) p.vy = PADDLE_SPEED;
  else p.vy = 0;
  if (p.vy !== 0) { p.y += p.vy * dt; mouseY = null; }
  else if (target !== null) {
    const dy = target - p.y;
    p.vy = dy / dt;
    p.y = Math.abs(dy) < 4 ? target : p.y + Math.sign(dy) * Math.min(Math.abs(dy), PADDLE_SPEED * 1.4 * dt);
  }
  p.y = Math.max(0, Math.min(H - PADDLE_H, p.y));
}

function aiMove(dt) {
  const speed = AI_SPEEDS[state.difficulty];
  let target = H / 2 - PADDLE_H / 2;
  if (ball.vx > 0) target = ball.y - PADDLE_H / 2 + aiTargetOffset;
  const dy = target - p2.y;
  p2.y += Math.sign(dy) * Math.min(Math.abs(dy), speed * dt);
  p2.y = Math.max(0, Math.min(H - PADDLE_H, p2.y));
}

function paddleBounce(p, dir) {
  const rel = (ball.y - (p.y + PADDLE_H / 2)) / (PADDLE_H / 2); // -1..1
  const ang = rel * 0.75; // max ~43°
  const speed = Math.min(Math.hypot(ball.vx, ball.vy) * SPEEDUP, MAX_BALL_SPEED);
  ball.vx = Math.cos(ang) * speed * dir;
  ball.vy = Math.sin(ang) * speed + p.vy * 0.15;
  state.shake = Math.min(10, speed / 90);
  sfx('hit', speed / MAX_BALL_SPEED);
  fx('hit', ball.x, ball.y, dir);
}

function update(dt) {
  if (state.mode === 'menu' || state.mode === 'pause' || state.mode === 'gameover') return;

  movePaddle(p1, dt, keys.KeyW, keys.KeyS, true);
  if (state.players === 2) movePaddle(p2, dt, keys.ArrowUp, keys.ArrowDown, false);
  else aiMove(dt);

  if (state.mode === 'serve') {
    state.serveTimer -= dt;
    if (state.serveTimer <= 0) launchBall();
    return;
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.trail.push({ x: ball.x, y: ball.y });
  if (ball.trail.length > 14) ball.trail.shift();

  // walls
  if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy); sfx('wall'); }
  if (ball.y > H - BALL_R) { ball.y = H - BALL_R; ball.vy = -Math.abs(ball.vy); sfx('wall'); }

  // paddles
  if (ball.vx < 0 && ball.x - BALL_R < p1.x + PADDLE_W && ball.x > p1.x &&
      ball.y > p1.y - BALL_R && ball.y < p1.y + PADDLE_H + BALL_R) {
    ball.x = p1.x + PADDLE_W + BALL_R;
    paddleBounce(p1, 1);
  }
  if (ball.vx > 0 && ball.x + BALL_R > p2.x && ball.x < p2.x + PADDLE_W &&
      ball.y > p2.y - BALL_R && ball.y < p2.y + PADDLE_H + BALL_R) {
    ball.x = p2.x - BALL_R;
    paddleBounce(p2, -1);
  }

  // score
  if (ball.x < -BALL_R * 2 || ball.x > W + BALL_R * 2) {
    const scorer = ball.x < 0 ? 1 : 0;
    state.score[scorer]++;
    state.flash = 1;
    state.shake = 12;
    sfx('score');
    fx('score', ball.x < 0 ? 0 : W, ball.y);
    if (state.score[scorer] >= WIN_SCORE) {
      $('winner').textContent = (scorer === 0 ? 'P1' : (state.players === 1 ? 'CPU' : 'P2')) + ' WINS';
      sfx('win');
      setMode('gameover');
    } else {
      serve(scorer === 0 ? -1 : 1);
    }
  }

  fx('update', dt);
}

// ---------- render ----------
function draw(t) {
  ctx.save();
  if (state.shake > 0.1) {
    ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    state.shake *= 0.88;
  }

  ctx.fillStyle = '#0a0e18';
  ctx.fillRect(-20, -20, W + 40, H + 40);

  // center line
  ctx.strokeStyle = 'rgba(120, 210, 255, 0.18)';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 14]);
  ctx.beginPath(); ctx.moveTo(W / 2, 20); ctx.lineTo(W / 2, H - 20); ctx.stroke();
  ctx.setLineDash([]);

  // score
  ctx.fillStyle = 'rgba(207, 234, 255, 0.85)';
  ctx.font = '64px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(120, 210, 255, 0.6)';
  ctx.shadowBlur = 18;
  ctx.fillText(state.score[0], W / 2 - 90, 80);
  ctx.fillText(state.score[1], W / 2 + 90, 80);
  ctx.shadowBlur = 0;

  // trail
  for (let i = 0; i < ball.trail.length; i++) {
    const p = ball.trail[i], a = i / ball.trail.length;
    ctx.fillStyle = `rgba(120, 210, 255, ${a * 0.25})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, BALL_R * a, 0, Math.PI * 2); ctx.fill();
  }

  // paddles + ball
  ctx.shadowColor = 'rgba(120, 210, 255, 0.9)';
  ctx.shadowBlur = 16;
  ctx.fillStyle = '#cfeaff';
  roundRect(p1.x, p1.y, PADDLE_W, PADDLE_H, 7);
  roundRect(p2.x, p2.y, PADDLE_W, PADDLE_H, 7);
  if (state.mode === 'play' || state.mode === 'pause') {
    ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = 0;

  // serve countdown pulse
  if (state.mode === 'serve') {
    const pulse = 0.5 + 0.5 * Math.sin(t / 120);
    ctx.fillStyle = `rgba(120, 210, 255, ${0.3 + pulse * 0.5})`;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, BALL_R + pulse * 5, 0, Math.PI * 2); ctx.fill();
  }

  fx('draw', ctx);

  // score flash
  if (state.flash > 0.02) {
    ctx.fillStyle = `rgba(180, 230, 255, ${state.flash * 0.18})`;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    state.flash *= 0.9;
  }

  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

// ---------- loop ----------
let last = performance.now();
function frame(t) {
  const dt = Math.min((t - last) / 1000, 0.033);
  last = t;
  update(dt);
  draw(t);
  requestAnimationFrame(frame);
}
setMode('menu');
requestAnimationFrame(frame);
})();
