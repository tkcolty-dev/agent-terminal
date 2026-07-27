/*
 * plane.js
 * Builds a lightweight Boeing 737-800 and advances its player-controlled flight.
 *
 * Boeing lists the real 737-800 at 39.5 m long and 35.8 m wide. This model keeps
 * that slightly-longer-than-wide silhouette, but scales it down for the game.
 */

// Make each finish once, then share it across every matching aircraft part.
function planeMaterial(color, roughness = 0.55, metalness = 0.15) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

// Add one mesh and apply its transform in one easy-to-read place.
function addPlanePart(aircraft, geometry, material, position, rotation = {}) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(position.x || 0, position.y || 0, position.z || 0);
  part.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
  part.castShadow = true;
  part.receiveShadow = true;
  aircraft.add(part);
  return part;
}

// Make a thin wing from a four-point top-view outline.
function makeWingGeometry(side, rootFront, rootBack, tipFront, tipBack, span, thickness) {
  const outline = new THREE.Shape();
  outline.moveTo(0, rootFront);
  outline.lineTo(side * span, tipFront);
  outline.lineTo(side * span, tipBack);
  outline.lineTo(0, rootBack);
  outline.closePath();
  return new THREE.ExtrudeGeometry(outline, {
    depth: thickness,
    bevelEnabled: false
  });
}

// Build a recognizable, low-poly 737-800 from ordinary Three.js geometry.
function buildPlane() {
  const aircraft = new THREE.Group();
  aircraft.name = "Boeing 737-800";

  // A restrained blue-and-white house livery stays readable at game distance.
  const white = planeMaterial(0xf4f7fa, 0.38, 0.2);
  const blue = planeMaterial(0x075a9c, 0.48, 0.14);
  const lightBlue = planeMaterial(0x28a9df, 0.46, 0.12);
  const dark = planeMaterial(0x111820, 0.34, 0.5);
  const glass = planeMaterial(0x15384c, 0.18, 0.48);
  const silver = planeMaterial(0xb8c2c9, 0.28, 0.7);
  const red = planeMaterial(0xc9282d, 0.5, 0.1);
  const green = planeMaterial(0x21d475, 0.35, 0.1);

  // The model points toward negative Z. Its 14.2:12.9 ratio echoes the real jet.
  addPlanePart(
    aircraft,
    new THREE.CylinderGeometry(1.04, 0.91, 11.8, 24),
    white,
    { z: 0.15 },
    { x: Math.PI / 2 }
  );
  addPlanePart(aircraft, new THREE.SphereGeometry(1.04, 20, 12), white, { z: -5.75 });
  const tailCone = addPlanePart(
    aircraft,
    new THREE.ConeGeometry(0.9, 2.65, 20),
    white,
    { z: 7.1 },
    { x: -Math.PI / 2 }
  );
  tailCone.scale.y = 1.08;

  // A blue belly and two narrow cheatlines create a complete airline livery.
  addPlanePart(
    aircraft,
    new THREE.CylinderGeometry(1.055, 0.92, 10.9, 24, 1, false, Math.PI, Math.PI),
    blue,
    { y: -0.04, z: 0.45 },
    { x: Math.PI / 2 }
  );
  [-1, 1].forEach((side) => {
    addPlanePart(
      aircraft,
      new THREE.BoxGeometry(0.035, 0.15, 9.8),
      lightBlue,
      { x: side * 0.98, y: 0.03, z: -0.1 }
    );
  });

  // Four angled panes make a more convincing 737 cockpit mask.
  [-1, 1].forEach((side) => {
    [-0.18, 0.2].forEach((offset, index) => {
      const pane = addPlanePart(
        aircraft,
        new THREE.BoxGeometry(0.035, 0.38, 0.42),
        glass,
        { x: side * (index ? 0.8 : 0.62), y: 0.42, z: -5.72 + offset },
        { y: side * (index ? 0.28 : 0.5), z: side * -0.08 }
      );
      pane.scale.set(1, 0.72, 1);
    });
  });

  // Reused window geometry/material keeps the long passenger cabin recognizable.
  const cabinWindowGeometry = new THREE.BoxGeometry(0.035, 0.18, 0.27);
  [-1, 1].forEach((side) => {
    for (let row = 0; row < 16; row += 1) {
      addPlanePart(
        aircraft,
        cabinWindowGeometry,
        glass,
        { x: side * 1.01, y: 0.36, z: -4.65 + row * 0.57 }
      );
    }
  });

  // The leading edge sweeps rearward about 25 degrees, like the 737NG wing.
  [-1, 1].forEach((side) => {
    addPlanePart(
      aircraft,
      makeWingGeometry(side, -2.0, 1.35, 1.4, 2.25, 6.45, 0.18),
      white,
      { y: -0.38, z: -0.15 },
      { x: Math.PI / 2 }
    );

    // Blended winglets rise and sweep aft instead of looking like flat end plates.
    const winglet = addPlanePart(
      aircraft,
      new THREE.BoxGeometry(0.18, 1.45, 0.52),
      blue,
      { x: side * 6.42, y: 0.25, z: 1.65 },
      { x: -0.2, z: side * -0.22 }
    );
    winglet.scale.set(1, 1, 0.72);
  });

  // CFM56-style nacelles include pylons, silver lips, dark fans, and spinners.
  [-1, 1].forEach((side) => {
    addPlanePart(
      aircraft,
      new THREE.BoxGeometry(0.34, 0.55, 1.75),
      silver,
      { x: side * 2.85, y: -0.61, z: -0.62 },
      { x: -0.12 }
    );
    const nacelle = addPlanePart(
      aircraft,
      new THREE.CylinderGeometry(0.58, 0.67, 2.25, 18),
      blue,
      { x: side * 2.85, y: -1.08, z: -0.78 },
      { x: Math.PI / 2 }
    );
    nacelle.scale.x = 1.08; // The CFM56's subtly flattened lower nacelle.
    addPlanePart(
      aircraft,
      new THREE.TorusGeometry(0.59, 0.09, 6, 18),
      silver,
      { x: side * 2.85, y: -1.08, z: -1.93 }
    );
    addPlanePart(
      aircraft,
      new THREE.CylinderGeometry(0.5, 0.5, 0.07, 18),
      dark,
      { x: side * 2.85, y: -1.08, z: -1.99 },
      { x: Math.PI / 2 }
    );
    addPlanePart(
      aircraft,
      new THREE.ConeGeometry(0.14, 0.32, 12),
      silver,
      { x: side * 2.85, y: -1.08, z: -2.18 },
      { x: -Math.PI / 2 }
    );
  });

  // Small swept tailplanes sit high on the narrowing rear fuselage.
  [-1, 1].forEach((side) => {
    addPlanePart(
      aircraft,
      makeWingGeometry(side, -0.55, 0.75, 0.75, 1.25, 2.75, 0.12),
      white,
      { y: 0.35, z: 4.9 },
      { x: Math.PI / 2 }
    );
  });

  // A swept blue fin with a light-blue inset completes the livery from behind.
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(0, 3.5);
  finShape.lineTo(0.62, 3.3);
  finShape.lineTo(2.25, 0);
  finShape.closePath();
  addPlanePart(
    aircraft,
    new THREE.ExtrudeGeometry(finShape, { depth: 0.18, bevelEnabled: false }),
    blue,
    { x: -0.09, y: 0.62, z: 4.15 },
    { y: Math.PI / 2 }
  ).name = "Vertical tail";
  addPlanePart(
    aircraft,
    new THREE.BoxGeometry(0.2, 1.35, 0.42),
    lightBlue,
    { y: 2.12, z: 5.03 },
    { x: -0.5 }
  );

  // Correct aviation colors: red on the left wing, green on the right wing.
  addPlanePart(aircraft, new THREE.SphereGeometry(0.13, 8, 6), red, {
    x: -6.48, y: -0.2, z: 1.82
  });
  addPlanePart(aircraft, new THREE.SphereGeometry(0.13, 8, 6), green, {
    x: 6.48, y: -0.2, z: 1.82
  });

  return aircraft;
}

// Give a fresh Reset state everything the flight loop needs, exactly once.
function initializeFlightState(state) {
  if (!state.position) state.position = new THREE.Vector3(0, 28, 35);
  if (!state.velocity) state.velocity = new THREE.Vector3(0, -0.8, -21);
  if (!state.controls) state.controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.68 };
  if (!Number.isFinite(state.pitch)) state.pitch = -0.035;
  if (!Number.isFinite(state.roll)) state.roll = 0;
  if (!Number.isFinite(state.heading)) state.heading = 0;
  if (!Number.isFinite(state.speed)) state.speed = state.velocity.length();
  if (!Number.isFinite(state.elapsed)) state.elapsed = 0;
  if (typeof state.crashed !== "boolean") state.crashed = false;
}

// Keep malformed or keyboard-overlap control values inside a safe range.
function clampControl(value, minimum, maximum, fallback) {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

// Advance player-controlled lift, thrust, drag, gravity, stalls, and ground impact.
function updatePlane(state, dt) {
  initializeFlightState(state);
  const safeDt = Math.min(Math.max(dt || 0, 0), 0.05);
  const aircraft = state.plane || state.aircraft;

  if (state.crashed) {
    if (aircraft) aircraft.position.copy(state.position);
    return state;
  }

  const controls = state.controls;
  const pitchInput = clampControl(controls.pitch, -1, 1, 0);
  const rollInput = clampControl(controls.roll, -1, 1, 0);
  const yawInput = clampControl(controls.yaw, -1, 1, 0);
  const throttle = clampControl(controls.throttle, 0, 1, 0.68);

  // Low airspeed weakens the controls and lift, then lets the nose drop in a stall.
  const currentSpeed = Math.max(0.01, state.velocity.length());
  const liftRatio = Math.min(1, Math.max(0, (currentSpeed - 8) / 8));
  const controlAuthority = 0.25 + liftRatio * 0.75;
  const pitchRate = pitchInput * 0.72 * controlAuthority;
  const rollRate = rollInput * 1.15 * controlAuthority;
  state.pitch += pitchRate * safeDt;
  state.roll += rollRate * safeDt;

  // Centered controls gently stabilize the aircraft instead of snapping it level.
  if (Math.abs(pitchInput) < 0.05) state.pitch *= 1 - 0.12 * safeDt;
  if (Math.abs(rollInput) < 0.05) state.roll *= 1 - 0.42 * safeDt;
  if (liftRatio < 0.45) state.pitch -= (0.45 - liftRatio) * 0.52 * safeDt;
  state.pitch = Math.min(0.52, Math.max(-0.65, state.pitch));
  state.roll = Math.min(1.15, Math.max(-1.15, state.roll));

  // Rudder yaws directly; banking also bends the flight path into a natural turn.
  state.heading += (
    yawInput * 0.48 * controlAuthority -
    Math.sin(state.roll) * 0.34 * liftRatio
  ) * safeDt;

  // Forward is derived with scalar math, so the hot loop creates no temporary objects.
  const cosPitch = Math.cos(state.pitch);
  const forwardX = -Math.sin(state.heading) * cosPitch;
  const forwardY = Math.sin(state.pitch);
  const forwardZ = -Math.cos(state.heading) * cosPitch;
  const dragAcceleration = 0.0115 * currentSpeed * currentSpeed;
  // Full throttle gives enough excess thrust to turn a sustained pitch-up into
  // a real climb; lower throttle settings still demand careful energy control.
  const thrustAcceleration = 1.5 + throttle * 8.5;
  const forwardAcceleration = thrustAcceleration - dragAcceleration;

  // Lift grows with airspeed, fades in a stall, and tilts sideways while banking.
  // The cap prevents a steep dive from turning extra speed into impossible lift.
  const liftAcceleration = Math.min(
    10.8,
    0.0235 * currentSpeed * currentSpeed * liftRatio
  );
  const uprightLift = liftAcceleration * Math.cos(state.roll);
  const sidewaysLift = liftAcceleration * Math.sin(state.roll);
  const rightX = Math.cos(state.heading);
  const rightZ = -Math.sin(state.heading);

  state.velocity.x += (
    forwardX * forwardAcceleration + rightX * sidewaysLift
  ) * safeDt;
  state.velocity.y += (
    forwardY * forwardAcceleration + uprightLift * cosPitch - 9.81
  ) * safeDt;
  state.velocity.z += (
    forwardZ * forwardAcceleration + rightZ * sidewaysLift
  ) * safeDt;

  // Aerodynamic stability slowly aligns sideways motion with the nose direction.
  const alongNose = state.velocity.x * forwardX + state.velocity.z * forwardZ;
  const alignment = Math.min(1, safeDt * (0.5 + liftRatio * 0.7));
  state.velocity.x += (forwardX * alongNose - state.velocity.x) * alignment;
  state.velocity.z += (forwardZ * alongNose - state.velocity.z) * alignment;

  state.position.addScaledVector(state.velocity, safeDt);
  state.elapsed += safeDt;
  state.speed = state.velocity.length();
  state.altitude = Math.max(0, state.position.y);
  state.stalled = liftRatio < 0.45;

  // Crossing the ground is the one-time crash event consumed by effects.js.
  if (state.position.y <= 0) {
    state.position.y = 0;
    state.altitude = 0;
    state.crashed = true;
    state.impactPoint = state.position.clone();
  }

  if (aircraft) {
    aircraft.position.copy(state.position);
    aircraft.rotation.set(state.pitch, state.heading, state.roll);
  }
  return state;
}

// Explicit globals keep these functions available from classic script tags.
globalThis.buildPlane = buildPlane;
globalThis.updatePlane = updatePlane;
