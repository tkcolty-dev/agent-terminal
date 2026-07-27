/*
 * plane.js
 * Builds a stylized Boeing 737 and advances its simple crash-flight physics.
 *
 * This file deliberately uses global functions. index.html loads Three.js first,
 * then this file, so the scene code can call buildPlane() and updatePlane().
 */

// Make a material once and reuse it on several parts of the aircraft.
function planeMaterial(color, roughness = 0.55, metalness = 0.15) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

// Add one mesh to the aircraft and return it so its transform can be adjusted.
function addPlanePart(aircraft, geometry, material, position, rotation = {}) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(position.x || 0, position.y || 0, position.z || 0);
  part.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
  part.castShadow = true;
  part.receiveShadow = true;
  aircraft.add(part);
  return part;
}

// Build a recognizable, lightweight 737 from ordinary Three.js shapes.
function buildPlane() {
  const aircraft = new THREE.Group();
  aircraft.name = "Boeing 737";

  const white = planeMaterial(0xf4f6f8, 0.42, 0.18);
  const blue = planeMaterial(0x075a9c, 0.5, 0.12);
  const dark = planeMaterial(0x17212b, 0.3, 0.6);
  const glass = planeMaterial(0x16374d, 0.2, 0.45);
  const red = planeMaterial(0xc9282d, 0.5, 0.1);

  // The model points toward negative Z. This matches the usual Three.js camera.
  const body = addPlanePart(
    aircraft,
    new THREE.CylinderGeometry(1.05, 0.9, 12.8, 24),
    white,
    { y: 0, z: 0 },
    { x: Math.PI / 2 }
  );
  body.scale.set(1, 1, 1);

  // Rounded nose and rear cone make the cylinder read as an airliner fuselage.
  addPlanePart(aircraft, new THREE.SphereGeometry(1.04, 20, 12), white, { z: -6.35 });
  const tailCone = addPlanePart(
    aircraft,
    new THREE.ConeGeometry(0.92, 3.1, 20),
    white,
    { z: 7.25 },
    { x: -Math.PI / 2 }
  );
  tailCone.scale.y = 1.15;

  // A blue belly cylinder sits slightly below the white body to form the stripe.
  const belly = addPlanePart(
    aircraft,
    new THREE.CylinderGeometry(1.065, 0.91, 11.2, 24, 1, false, Math.PI, Math.PI),
    blue,
    { y: -0.03, z: 0.15 },
    { x: Math.PI / 2 }
  );
  belly.scale.y = 1.01;

  // Dark cockpit windows are flattened spheres on both sides of the nose.
  [-1, 1].forEach((side) => {
    const window = addPlanePart(
      aircraft,
      new THREE.SphereGeometry(0.28, 10, 6),
      glass,
      { x: side * 0.72, y: 0.42, z: -6.17 }
    );
    window.scale.set(0.55, 0.5, 0.18);
  });

  // Swept wings use a custom flat outline, wide at the body and narrow at the tip.
  function makeWing(side) {
    const shape = new THREE.Shape();
    shape.moveTo(0, -2.3);
    shape.lineTo(side * 7.6, 2.25);
    shape.lineTo(side * 7.15, 3.15);
    shape.lineTo(0, 1.45);
    shape.closePath();
    const wing = addPlanePart(
      aircraft,
      new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false }),
      white,
      { y: -0.28, z: 0 },
      { x: Math.PI / 2 }
    );
    return wing;
  }
  makeWing(-1);
  makeWing(1);

  // Each engine has a blue nacelle, a dark intake, and a silver center spinner.
  [-1, 1].forEach((side) => {
    const engine = addPlanePart(
      aircraft,
      new THREE.CylinderGeometry(0.62, 0.72, 2.3, 18),
      blue,
      { x: side * 3.25, y: -1.05, z: -0.75 },
      { x: Math.PI / 2 }
    );
    engine.scale.y = 1.05;
    addPlanePart(
      aircraft,
      new THREE.CylinderGeometry(0.49, 0.49, 0.08, 18),
      dark,
      { x: side * 3.25, y: -1.05, z: -1.94 },
      { x: Math.PI / 2 }
    );
    addPlanePart(
      aircraft,
      new THREE.ConeGeometry(0.16, 0.35, 12),
      white,
      { x: side * 3.25, y: -1.05, z: -2.15 },
      { x: -Math.PI / 2 }
    );
  });

  // Horizontal stabilizers are smaller swept wings near the rear.
  [-1, 1].forEach((side) => {
    const stabilizerShape = new THREE.Shape();
    stabilizerShape.moveTo(0, -0.6);
    stabilizerShape.lineTo(side * 3.15, 1.15);
    stabilizerShape.lineTo(side * 2.8, 1.65);
    stabilizerShape.lineTo(0, 0.8);
    stabilizerShape.closePath();
    addPlanePart(
      aircraft,
      new THREE.ExtrudeGeometry(stabilizerShape, { depth: 0.12, bevelEnabled: false }),
      white,
      { y: 0.35, z: 4.95 },
      { x: Math.PI / 2 }
    );
  });

  // The tall swept vertical fin is the clearest airliner silhouette cue.
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(0, 3.65);
  finShape.lineTo(0, 3.65);
  finShape.lineTo(2.25, 0);
  finShape.closePath();
  const fin = addPlanePart(
    aircraft,
    new THREE.ExtrudeGeometry(finShape, { depth: 0.16, bevelEnabled: false }),
    blue,
    { x: -0.08, y: 0.65, z: 4.25 },
    { y: Math.PI / 2 }
  );
  fin.name = "Vertical tail";

  // Small red/green navigation lights help the broad wings show up at dusk.
  addPlanePart(aircraft, new THREE.SphereGeometry(0.13, 8, 6), red, { x: -7.45, y: -0.12, z: 2.32 });
  addPlanePart(
    aircraft,
    new THREE.SphereGeometry(0.13, 8, 6),
    planeMaterial(0x21d475, 0.35, 0.1),
    { x: 7.45, y: -0.12, z: 2.32 }
  );

  return aircraft;
}

// Give missing state fields safe starting values so Reset can use a fresh object.
function initializeFlightState(state) {
  if (!state.position) state.position = new THREE.Vector3(0, 28, 35);
  if (!state.velocity) state.velocity = new THREE.Vector3(0, -3.2, -19);
  if (!Number.isFinite(state.pitch)) state.pitch = -0.12;
  if (!Number.isFinite(state.roll)) state.roll = 0.025;
  if (!Number.isFinite(state.speed)) state.speed = state.velocity.length();
  if (typeof state.crashed !== "boolean") state.crashed = false;
}

// Advance a shallow dive, then freeze the aircraft exactly at ground impact.
function updatePlane(state, dt) {
  initializeFlightState(state);
  const safeDt = Math.min(Math.max(dt || 0, 0), 0.05);

  // Accept either state.plane or state.aircraft to make scene integration simple.
  const aircraft = state.plane || state.aircraft;
  if (state.crashed) {
    if (aircraft) aircraft.position.copy(state.position);
    return state;
  }

  // Gravity and a gradually steepening nose-down attitude create a heavy descent.
  state.velocity.y -= 2.8 * safeDt;
  state.velocity.z -= 0.55 * safeDt;
  state.pitch = Math.max(-0.48, state.pitch - 0.035 * safeDt);
  state.roll = Math.sin((state.elapsed || 0) * 0.65) * 0.035;
  state.elapsed = (state.elapsed || 0) + safeDt;
  state.position.addScaledVector(state.velocity, safeDt);
  state.speed = state.velocity.length();
  state.altitude = Math.max(0, state.position.y);

  // Crossing y=0 is the one-time crash event consumed by the effects code.
  if (state.position.y <= 0) {
    state.position.y = 0;
    state.altitude = 0;
    state.crashed = true;
    state.impactPoint = state.position.clone();
  }

  if (aircraft) {
    aircraft.position.copy(state.position);
    aircraft.rotation.set(state.pitch, 0, state.roll);
  }
  return state;
}

// Explicit globals keep these functions available from classic script tags.
globalThis.buildPlane = buildPlane;
globalThis.updatePlane = updatePlane;
