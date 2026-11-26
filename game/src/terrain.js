// Ridgeline Courier — terrain, water, airfields, trees and sky.
// One clear job: build the valley the game flies in, and answer
// terrainHeightAt(x, z) for the flight model and the HUD.

import * as THREE from '../vendor/three.min.js';
import { WORLD, RUNWAYS, valleyCenterX } from './config.js';
import { makeNoise2D, mulberry32 } from './random.js';

const fbm = makeNoise2D(WORLD.seed);
const rand = mulberry32(WORLD.seed + 7);

// Ground height at any (x, z): rolling hills, steep valley walls, a
// carved river channel along the centreline, flat pads at the runways.
export function terrainHeightAt(x, z) {
  const centre = valleyCenterX(z);
  const dCentre = Math.abs(x - centre);

  // Rolling base hills, gentler near the valley floor.
  let h = 10 + fbm(x * 0.004 + 13.7, z * 0.004 + 4.2) * 26;

  // Valley walls rise steeply beyond ~130 m from the centreline.
  const wall = Math.max(0, (dCentre - 130) / 260);
  h += wall * wall * 120 + fbm(x * 0.002, z * 0.002) * wall * 40;

  // River channel carved along the centreline.
  const channel = Math.exp(-((dCentre / 42) * (dCentre / 42)));
  h -= channel * 13;

  // Flat pads under each runway so wheels sit level.
  for (const r of Object.values(RUNWAYS)) {
    const dx = x - r.x;
    const dz = z - r.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 90) {
      const t = Math.max(0, (d - 55) / 35); // 0 on the pad, 1 outside
      const blend = t * t * (3 - 2 * t);
      h = r.elevation + (h - r.elevation) * blend;
    }
  }
  return h;
}

function groundColor(height, slope, out) {
  // Palette by height and slope: meadow, rock, snow, sand by the river.
  if (height < WORLD.waterLevel + 1.5) {
    out.setRGB(0.76, 0.7, 0.52); // sandy riverbank
  } else if (slope > 0.55) {
    out.setRGB(0.42, 0.38, 0.36); // bare rock on steep faces
  } else if (height > 72) {
    out.setRGB(0.93, 0.94, 0.96); // snow caps
  } else if (height > 46) {
    out.setRGB(0.36, 0.42, 0.3); // high scrub
  } else {
    out.setRGB(0.32, 0.5, 0.24); // valley meadow
  }
  // Gentle variation so the ground is not a flat wash of colour.
  const v = 0.92 + 0.16 * fbm(height * 0.31, slope * 7.7);
  out.multiplyScalar(v);
  return out;
}

export function buildTerrain(scene) {
  const group = new THREE.Group();
  group.name = 'valley';

  // --- Ground mesh -------------------------------------------------
  const size = WORLD.size;
  const segments = 150;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrainHeightAt(x, z));
  }
  geo.computeVertexNormals();
  const norm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = pos.getY(i);
    n.fromBufferAttribute(norm, i);
    const slope = 1 - n.dot(up);
    groundColor(y, slope, c);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
  );
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);

  // --- River and lake ----------------------------------------------
  const waterGeo = new THREE.PlaneGeometry(size, size, 1, 1);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(
    waterGeo,
    new THREE.MeshStandardMaterial({
      color: 0x2e6f8e,
      roughness: 0.12,
      metalness: 0.25,
      transparent: true,
      opacity: 0.82,
    }),
  );
  water.position.y = WORLD.waterLevel;
  water.name = 'river';
  group.add(water);

  // --- Runways, markings, windsocks, hangar ------------------------
  for (const [name, r] of Object.entries(RUNWAYS)) {
    const pad = new THREE.Group();
    pad.position.set(r.x, r.elevation + 0.15, r.z);
    pad.name = `runway-${name}`;

    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(r.width, r.length),
      new THREE.MeshStandardMaterial({ color: 0x33373c, roughness: 0.9 }),
    );
    strip.rotation.x = -Math.PI / 2;
    strip.receiveShadow = true;
    pad.add(strip);

    // Centre dashes.
    const dashMat = new THREE.MeshStandardMaterial({ color: 0xf2f2e8, roughness: 0.7 });
    for (let dz = -r.length / 2 + 8; dz < r.length / 2 - 4; dz += 12) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 5), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.05, dz);
      pad.add(dash);
    }
    // Threshold bars at both ends.
    for (const end of [-1, 1]) {
      for (let k = -2; k <= 2; k++) {
        const bar = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 4), dashMat);
        bar.rotation.x = -Math.PI / 2;
        bar.position.set(k * 2.4, 0.05, end * (r.length / 2 - 4));
        pad.add(bar);
      }
    }
    // Windsock: striped cone on a pole.
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 7, 8),
      new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.6 }),
    );
    pole.position.set(r.width / 2 + 6, 3.5, -r.length / 2 + 10);
    pad.add(pole);
    const sock = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 3.4, 10, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xe8590c, roughness: 0.8, side: THREE.DoubleSide }),
    );
    sock.rotation.z = Math.PI / 2;
    sock.position.set(r.width / 2 + 8.2, 6.6, -r.length / 2 + 10);
    pad.add(sock);

    group.add(pad);
  }

  // Hangar beside the north field.
  const hangar = new THREE.Group();
  hangar.position.set(RUNWAYS.north.x - 26, RUNWAYS.north.elevation, RUNWAYS.north.z + 18);
  const hangarBody = new THREE.Mesh(
    new THREE.BoxGeometry(22, 7, 14),
    new THREE.MeshStandardMaterial({ color: 0x9aa5ad, roughness: 0.7, metalness: 0.3 }),
  );
  hangarBody.position.y = 3.5;
  hangarBody.castShadow = true;
  hangar.add(hangarBody);
  const hangarRoof = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 7, 22, 16, 1, false, 0, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x5b6770, roughness: 0.6, metalness: 0.4 }),
  );
  hangarRoof.rotation.z = Math.PI / 2;
  hangarRoof.rotation.y = Math.PI / 2;
  hangarRoof.position.y = 7;
  hangarRoof.castShadow = true;
  hangar.add(hangarRoof);
  group.add(hangar);

  // --- Trees ---------------------------------------------------------
  const treeCount = 520;
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 3.2, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4630, roughness: 1 });
  const crownGeo = new THREE.ConeGeometry(2.4, 7.5, 8);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2c5a2e, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, treeCount);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  let placed = 0;
  let guard = 0;
  while (placed < treeCount && guard < treeCount * 40) {
    guard++;
    const x = (rand() * 2 - 1) * (WORLD.size / 2 - 30);
    const z = (rand() * 2 - 1) * (WORLD.size / 2 - 30);
    const h = terrainHeightAt(x, z);
    if (h < WORLD.waterLevel + 2 || h > 58) continue;
    // Keep the runways and the river channel clear.
    let clear = true;
    for (const r of Object.values(RUNWAYS)) {
      if (Math.abs(x - r.x) < 24 && Math.abs(z - r.z) < r.length / 2 + 18) clear = false;
    }
    if (Math.abs(x - valleyCenterX(z)) < 26) clear = false;
    if (!clear) continue;
    const scale = 0.8 + rand() * 0.9;
    p.set(x, h + 1.4 * scale, z);
    s.set(scale, scale, scale);
    q.setFromAxisAngle(up, rand() * Math.PI * 2);
    m.compose(p, q, s);
    trunks.setMatrixAt(placed, m);
    p.y = h + (1.4 + 3.4) * scale;
    m.compose(p, q, s);
    crowns.setMatrixAt(placed, m);
    placed++;
  }
  trunks.count = placed;
  crowns.count = placed;
  trunks.castShadow = true;
  crowns.castShadow = true;
  group.add(trunks);
  group.add(crowns);

  // --- Clouds --------------------------------------------------------
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x8fa3b8,
    emissiveIntensity: 0.55,
    roughness: 1,
    transparent: true,
    opacity: 0.88,
  });
  const clouds = new THREE.Group();
  clouds.name = 'clouds';
  for (let i = 0; i < 16; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < puffs; k++) {
      const r = 9 + rand() * 14;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), cloudMat);
      puff.position.set((rand() - 0.5) * 34, (rand() - 0.5) * 5, (rand() - 0.5) * 18);
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(
      (rand() * 2 - 1) * 520,
      150 + rand() * 90,
      (rand() * 2 - 1) * 520,
    );
    cloud.userData.drift = 1.5 + rand() * 2.5;
    clouds.add(cloud);
  }
  group.add(clouds);
  group.userData.clouds = clouds;

  // --- Sky, sun, fog -------------------------------------------------
  scene.background = new THREE.Color(0x9ec8e8);
  scene.fog = new THREE.Fog(0xa8c6dd, 260, 1500);
  const hemi = new THREE.HemisphereLight(0xbfd9ee, 0x5d6b4a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.1);
  sun.position.set(320, 420, 180);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -320;
  sun.shadow.camera.right = 320;
  sun.shadow.camera.top = 320;
  sun.shadow.camera.bottom = -320;
  sun.shadow.camera.far = 1200;
  scene.add(sun);
  scene.add(sun.target);

  scene.add(group);
  return group;
}
