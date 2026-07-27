/*
 * main.js
 * The "director" of the simulation. It owns the Three.js scene and does the jobs
 * that are NOT the plane or the explosion:
 *   - builds the world (sky, fog, sunlight, ground terrain, runway markings),
 *   - sets up a chase camera that trails the falling 737,
 *   - runs the animation loop (advance physics -> move camera -> draw),
 *   - wires the Start and Reset buttons and updates the HUD numbers,
 *   - calls triggerCrashEffects() the instant the plane hits the ground.
 *
 * It relies on three globals from the other files:
 *   buildPlane(), updatePlane(state, dt)   -> plane.js
 *   triggerCrashEffects / updateCrashEffects / clearCrashEffects -> effects.js
 */

// ---- Core Three.js objects, created once ---------------------------------
let scene, camera, renderer, clock;
let plane;              // the 737 model (a THREE.Group)
let flightState;        // plain object holding position/velocity/etc.
let running = false;    // true while the plane is actually flying
let crashHandled = false; // makes sure the explosion only fires once
let smokeTrail = [];    // little puffs that stream off the diving plane

// HUD text elements, grabbed from index.html.
const altEl = () => document.getElementById("alt");
const spdEl = () => document.getElementById("spd");
const statusEl = () => document.getElementById("status");

// Build the whole world. Called once when the page loads.
function initScene() {
  scene = new THREE.Scene();

  // A gentle blue sky color plus matching fog so far terrain melts into the horizon.
  scene.background = new THREE.Color(0x9dc4e8);
  scene.fog = new THREE.Fog(0x9dc4e8, 120, 620);

  // Camera: a wide 60° view. Position is set each frame by the chase logic.
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 40, 70);

  // Renderer draws the scene into the <canvas>. Shadows make the crash feel grounded.
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById("scene").appendChild(renderer.domElement);

  // Lighting: soft ambient fill + a bright "sun" that casts shadows.
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x53694f, 0.85));
  const sun = new THREE.DirectionalLight(0xfff2d6, 1.15);
  sun.position.set(-60, 90, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 400;
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  scene.add(sun);

  buildTerrain();
  clock = new THREE.Clock();

  // Redraw sizing if the window changes.
  window.addEventListener("resize", onResize);

  // Put a fresh plane in the sky, ready to launch.
  resetSimulation();
}

// Build a large green ground plane with a subtle rolling hilly surface, plus a runway.
function buildTerrain() {
  const size = 1400;
  const segments = 80;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2); // lay it flat (was standing up)

  // Nudge each vertex up/down a little to make gentle hills. Keep a flat strip
  // down the middle (small x) so the plane has clear ground to crash onto.
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const flatness = Math.min(1, Math.abs(x) / 90); // 0 near center, 1 far out
    const hill = Math.sin(x * 0.02) * Math.cos(z * 0.021) * 9;
    pos.setY(i, hill * flatness);
  }
  geometry.computeVertexNormals();

  const groundMat = new THREE.MeshStandardMaterial({ color: 0x5f8a4a, roughness: 1 });
  const ground = new THREE.Mesh(geometry, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  // A dark asphalt runway strip down the middle for scale and realism.
  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 500),
    new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.9 })
  );
  runway.rotation.x = -Math.PI / 2;
  runway.position.y = 0.05; // just above the grass to avoid flicker
  runway.receiveShadow = true;
  scene.add(runway);

  // White dashed centerline on the runway.
  for (let z = -220; z <= 220; z += 40) {
    const dash = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 14),
      new THREE.MeshBasicMaterial({ color: 0xf2f2f2 })
    );
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.06, z);
    scene.add(dash);
  }
}

// Start (or restart) the flight from a fresh, high, gently-diving state.
function resetSimulation() {
  // Remove the old plane model and any leftover smoke from the scene.
  if (plane) scene.remove(plane);
  smokeTrail.forEach((p) => scene.remove(p.mesh));
  smokeTrail = [];
  clearCrashEffects(scene);

  // Build a new 737 and a brand-new physics state (plane.js fills in defaults).
  plane = buildPlane();
  plane.castShadow = true;
  scene.add(plane);

  flightState = { plane: plane }; // updatePlane looks for state.plane
  running = false;
  crashHandled = false;

  // Show the plane at its starting spot immediately (one physics step of dt=0).
  updatePlane(flightState, 0);
  setStatus("Ready for takeoff… press Start");
  updateHud();
}

// Kick off the dive.
function startFlight() {
  if (running) return;
  if (flightState.crashed) resetSimulation(); // let Start replay after a crash
  running = true;
  setStatus("In flight — losing altitude!");
}

// Chase camera: sit behind and above the plane, looking at it.
function updateCamera() {
  if (!plane) return;
  const p = plane.position;
  // Desired camera spot: behind (+z) the plane's travel and up high.
  const target = new THREE.Vector3(p.x * 0.4, p.y + 12, p.z + 42);
  // Ease toward the target so the camera glides instead of snapping.
  camera.position.lerp(target, 0.06);
  // Never let the camera dip below the ground.
  if (camera.position.y < 6) camera.position.y = 6;
  camera.lookAt(p.x, p.y + 2, p.z - 6);
}

// Drop a faint smoke puff behind the plane while it dives (engine trouble!).
function emitTrail(dt) {
  if (!running || flightState.crashed) return;
  // Add a puff every few frames based on a simple timer.
  emitTrail.timer = (emitTrail.timer || 0) + dt;
  if (emitTrail.timer < 0.06) return;
  emitTrail.timer = 0;

  const geo = new THREE.SphereGeometry(0.6, 8, 6);
  const mat = new THREE.MeshBasicMaterial({ color: 0x4a4a4a, transparent: true, opacity: 0.5 });
  const puff = new THREE.Mesh(geo, mat);
  puff.position.copy(plane.position);
  puff.position.z += 6; // emit from the tail
  puff.position.y += 0.5;
  scene.add(puff);
  smokeTrail.push({ mesh: puff, mat: mat, life: 0 });
}

// Fade and grow the trail puffs, removing old ones.
function updateTrail(dt) {
  for (let i = smokeTrail.length - 1; i >= 0; i--) {
    const p = smokeTrail[i];
    p.life += dt;
    const s = 1 + p.life * 2.5;
    p.mesh.scale.set(s, s, s);
    p.mesh.position.y += dt * 1.5;
    p.mat.opacity = Math.max(0, 0.5 - p.life * 0.4);
    if (p.life > 1.3) {
      scene.remove(p.mesh);
      smokeTrail.splice(i, 1);
    }
  }
}

// Refresh the altitude/speed readouts in the corner.
function updateHud() {
  if (!flightState) return;
  const alt = Math.round(flightState.altitude || 0);
  // Convert the toy speed number into a believable-looking knots value.
  const knots = Math.round((flightState.speed || 0) * 14);
  altEl().textContent = alt + " ft";
  spdEl().textContent = knots + " kts";
}

function setStatus(text) {
  statusEl().textContent = text;
}

// The animation loop: runs ~60 times per second.
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  if (running && !flightState.crashed) {
    updatePlane(flightState, dt); // advance the dive (moves the model too)
    emitTrail(dt);
  }

  // The frame the plane first reports crashed, fire the big explosion once.
  if (flightState.crashed && !crashHandled) {
    crashHandled = true;
    running = false;
    const spot = flightState.impactPoint || plane.position;
    triggerCrashEffects(scene, spot);
    setStatus("💥 Impact! Press Reset to try again.");
  }

  updateTrail(dt);
  updateCrashEffects(dt); // advance fireball / smoke / debris
  updateCamera();
  updateHud();
  renderer.render(scene, camera);
}

// Keep the picture correct when the browser window resizes.
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Wire the buttons once the page is ready, then build the world and start drawing.
window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("startBtn").addEventListener("click", startFlight);
  document.getElementById("resetBtn").addEventListener("click", resetSimulation);
  initScene();
  animate();
});
