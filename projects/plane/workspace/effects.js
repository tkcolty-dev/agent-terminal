/*
 * effects.js
 * Visual explosion effects for the moment the 737 hits the ground.
 *
 * The scene code (main.js) calls triggerCrashEffects(scene, position) exactly
 * once, right when the plane crashes. We create three things at that spot:
 *   1. a bright FIREBALL that puffs up and fades,
 *   2. a rising SMOKE PLUME made of grey blobs,
 *   3. flying DEBRIS chunks that arc out and tumble.
 *
 * Every effect is a small object with its own update(dt) function. We keep them
 * all in a list and main.js advances that list every frame.
 */

// The master list of live effects. main.js reads and updates this each frame.
const crashEffects = [];

// Handy helper: make a glowing, see-through material of a given color.
function glowMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: opacity,
  });
}

// --- FIREBALL ------------------------------------------------------------
// A ball that starts small and bright, swells quickly, then fades to nothing.
function makeFireball(scene, position) {
  const geometry = new THREE.SphereGeometry(1, 16, 12);
  const material = glowMaterial(0xffb339, 1);
  const ball = new THREE.Mesh(geometry, material);
  ball.position.copy(position);
  ball.position.y += 1.2; // lift it just off the ground
  scene.add(ball);

  let life = 0; // seconds this fireball has been alive
  const maxLife = 1.1;

  return {
    // Grow fast, then shrink and fade as the fire runs out of fuel.
    update: function (dt) {
      life += dt;
      const t = life / maxLife; // 0 at birth, 1 at death
      const scale = 1 + t * 9; // swell from 1x to ~10x
      ball.scale.set(scale, scale, scale);
      // Shift color from yellow toward deep red as it cools.
      material.color.setRGB(1, 0.7 - t * 0.55, 0.2 - t * 0.2);
      material.opacity = Math.max(0, 1 - t);
      // Return false when finished so main.js can clean it up.
      if (life >= maxLife) {
        scene.remove(ball);
        return false;
      }
      return true;
    },
  };
}

// --- SMOKE PLUME ---------------------------------------------------------
// A single grey puff that drifts upward, spreads out, and slowly fades.
function makeSmokePuff(scene, position, delay) {
  const geometry = new THREE.SphereGeometry(1, 12, 10);
  const material = glowMaterial(0x3a3a3a, 0.0);
  const puff = new THREE.Mesh(geometry, material);
  puff.position.copy(position);
  puff.position.x += (Math.sin(delay * 12) * 1.5); // scatter puffs sideways
  puff.position.z += (Math.cos(delay * 9) * 1.5);
  puff.position.y += 1;
  scene.add(puff);

  let life = -delay; // negative delay means "wait before appearing"
  const maxLife = 3.2;

  return {
    update: function (dt) {
      life += dt;
      if (life < 0) return true; // not born yet
      const t = life / maxLife;
      const scale = 1.5 + t * 6; // grow as it rises
      puff.scale.set(scale, scale, scale);
      puff.position.y += dt * 4.5; // float upward
      // Fade in quickly, then fade out toward the top of the rise.
      material.opacity = 0.55 * Math.sin(Math.min(t, 1) * Math.PI);
      material.color.setRGB(0.25 - t * 0.1, 0.25 - t * 0.1, 0.25 - t * 0.1);
      if (life >= maxLife) {
        scene.remove(puff);
        return false;
      }
      return true;
    },
  };
}

// --- DEBRIS --------------------------------------------------------------
// A small chunk thrown outward that arcs under gravity and tumbles in the air.
function makeDebris(scene, position) {
  const size = 0.3 + Math.random() * 0.6;
  const geometry = new THREE.BoxGeometry(size, size, size);
  const material = new THREE.MeshStandardMaterial({ color: 0x555b61, roughness: 0.8 });
  const chunk = new THREE.Mesh(geometry, material);
  chunk.castShadow = true;
  chunk.position.copy(position);
  chunk.position.y += 1;
  scene.add(chunk);

  // Random launch direction: outward and upward.
  const velocity = new THREE.Vector3(
    (Math.random() - 0.5) * 22,
    6 + Math.random() * 14,
    (Math.random() - 0.5) * 22
  );
  // Random spin so each chunk tumbles differently.
  const spin = new THREE.Vector3(
    (Math.random() - 0.5) * 10,
    (Math.random() - 0.5) * 10,
    (Math.random() - 0.5) * 10
  );

  let life = 0;
  const maxLife = 4;

  return {
    update: function (dt) {
      life += dt;
      velocity.y -= 22 * dt; // gravity pulls it back down
      chunk.position.addScaledVector(velocity, dt);
      chunk.rotation.x += spin.x * dt;
      chunk.rotation.y += spin.y * dt;
      // Bounce weakly if it hits the ground, then settle.
      if (chunk.position.y < 0.3) {
        chunk.position.y = 0.3;
        velocity.y *= -0.35;
        velocity.x *= 0.6;
        velocity.z *= 0.6;
      }
      if (life >= maxLife) {
        scene.remove(chunk);
        return false;
      }
      return true;
    },
  };
}

// Public entry point: main.js calls this once at the crash location.
function triggerCrashEffects(scene, position) {
  // One big fireball.
  crashEffects.push(makeFireball(scene, position));
  // A column of smoke made from several delayed puffs.
  for (let i = 0; i < 10; i++) {
    crashEffects.push(makeSmokePuff(scene, position, i * 0.18));
  }
  // A shower of debris chunks.
  for (let i = 0; i < 22; i++) {
    crashEffects.push(makeDebris(scene, position));
  }
}

// Advance every live effect one frame and drop the ones that finished.
// main.js calls this from its animation loop.
function updateCrashEffects(dt) {
  for (let i = crashEffects.length - 1; i >= 0; i--) {
    const stillAlive = crashEffects[i].update(dt);
    if (!stillAlive) crashEffects.splice(i, 1);
  }
}

// Remove all effects instantly (used by the Reset button).
function clearCrashEffects(scene) {
  crashEffects.length = 0;
}

// Expose the functions as globals for the classic <script> tags in index.html.
globalThis.triggerCrashEffects = triggerCrashEffects;
globalThis.updateCrashEffects = updateCrashEffects;
globalThis.clearCrashEffects = clearCrashEffects;
