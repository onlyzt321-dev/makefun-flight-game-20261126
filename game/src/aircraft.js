// Ridgeline Courier — the courier aircraft.
// One clear job: build the plane out of primitives (fuselage, wings, tail,
// propeller, gear, lights) and animate the parts that move.

import * as THREE from '../vendor/three.min.js';

const CREAM = 0xf3ead8;
const TEAL = 0x1f6f6b;
const ORANGE = 0xe8590c;
const DARK = 0x2b2f33;
const GLASS = 0x9fd4e8;

export function buildAircraft() {
  const plane = new THREE.Group();
  plane.name = 'courier-plane';
  // Model space: nose points -Z, wings span X, up is +Y.

  const cream = new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.45, metalness: 0.25 });
  const teal = new THREE.MeshStandardMaterial({ color: TEAL, roughness: 0.45, metalness: 0.25 });
  const orange = new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.5, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.6, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({
    color: GLASS,
    roughness: 0.08,
    metalness: 0.6,
    transparent: true,
    opacity: 0.85,
  });

  function add(mesh, x, y, z, parent = plane) {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // Fuselage: a tapered tube, nose at -Z.
  const fuselage = add(
    new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.42, 4.6, 14), cream),
    0, 0, 0,
  );
  fuselage.rotation.x = Math.PI / 2;
  // Nose cone.
  const nose = add(new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.1, 14), teal), 0, 0, -2.8);
  nose.rotation.x = -Math.PI / 2;
  // Tail cone.
  const tailCone = add(new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.2, 12), teal), 0, 0.1, 2.85);
  tailCone.rotation.x = Math.PI / 2;

  // Orange cheatline stripe along the fuselage.
  const stripe = add(new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.16, 4.4), orange), 0, -0.08, 0);
  stripe.scale.x = 0.62;

  // Cockpit canopy: a glass bubble ahead of the wing.
  const canopy = add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), glass), 0, 0.52, -0.9);
  canopy.scale.set(0.85, 0.75, 1.5);

  // Main wing (low wing) with teal tips.
  const wing = add(new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.14, 1.5), cream), 0, -0.28, -0.35);
  const wingTipL = add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 1.5), teal), -3.8, -0.28, -0.35);
  const wingTipR = add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 1.5), teal), 3.8, -0.28, -0.35);
  // Wing struts.
  for (const side of [-1, 1]) {
    const strut = add(
      new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), dark),
      side * 1.7, 0.28, -0.35,
    );
    strut.rotation.z = side * 0.5;
  }

  // Tail: horizontal stabiliser and vertical fin.
  add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.9), cream), 0, 0.18, 3.1);
  const fin = add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 1.1), teal), 0, 0.72, 3.15);
  fin.rotation.x = 0.15;
  add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 1.0), orange), 0, 1.28, 3.2);

  // Propeller: spinner + two blades, spins around Z.
  const prop = new THREE.Group();
  prop.position.set(0, 0, -3.35);
  plane.add(prop);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 12), orange);
  spinner.rotation.x = -Math.PI / 2;
  spinner.castShadow = true;
  prop.add(spinner);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.4, metalness: 0.5 });
  for (const angle of [0, Math.PI]) {
    // Each holder carries one blade half a length out, so the pair reads as one prop.
    const holder = new THREE.Group();
    holder.rotation.z = angle;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.05, 0.07), bladeMat);
    b.position.y = 0.55;
    b.castShadow = true;
    holder.add(b);
    prop.add(holder);
  }

  // Fixed landing gear: two mains + tail wheel.
  for (const side of [-1, 1]) {
    const leg = add(
      new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 8), dark),
      side * 0.85, -0.75, -0.5,
    );
    leg.rotation.z = side * 0.25;
    const wheel = add(
      new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 12), dark),
      side * 1.0, -1.12, -0.5,
    );
    wheel.rotation.z = Math.PI / 2;
  }
  const tailWheel = add(
    new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 10), dark),
    0, -0.62, 2.9,
  );
  tailWheel.rotation.z = Math.PI / 2;

  // Navigation lights: red left, green right, white tail strobe.
  const navL = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 2 }),
  );
  navL.position.set(-3.85, -0.28, -0.35);
  plane.add(navL);
  const navR = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x003300, emissive: 0x22ff66, emissiveIntensity: 2 }),
  );
  navR.position.set(3.85, -0.28, -0.35);
  plane.add(navR);
  const strobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffffff, emissiveIntensity: 3 }),
  );
  strobe.position.set(0, 0.35, 3.45);
  plane.add(strobe);

  // Ailerons / elevator / rudder are separate meshes so they can deflect.
  const aileronL = add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.45), teal), -2.6, -0.28, 0.45);
  const aileronR = add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.45), teal), 2.6, -0.28, 0.45);
  const elevator = add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.4), teal), 0, 0.18, 3.6);
  const rudder = add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.55), orange), 0, 0.72, 3.75);

  plane.userData.parts = {
    prop,
    strobe,
    aileronL,
    aileronR,
    elevator,
    rudder,
    wing,
    wingTipL,
    wingTipR,
  };
  return plane;
}

// Spin the prop by rpm, blink the strobe, deflect the control surfaces.
export function animateAircraft(plane, dt, { rpm, rollInput, pitchInput, time }) {
  const p = plane.userData.parts;
  p.prop.rotation.z -= rpm * dt * 0.9;
  p.strobe.material.emissiveIntensity = time % 1.2 < 0.12 ? 4 : 0.15;
  p.aileronL.rotation.x = rollInput * 0.35;
  p.aileronR.rotation.x = -rollInput * 0.35;
  p.elevator.rotation.x = pitchInput * 0.3;
  p.rudder.rotation.y = -rollInput * 0.25;
}
