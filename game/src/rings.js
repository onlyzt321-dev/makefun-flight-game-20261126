// Ridgeline Courier — the ring course.
// One clear job: build the glowing gates, track which one is next,
// and tell the game when the plane flies through one.

import * as THREE from '../vendor/three.min.js';
import { RING_COURSE } from './config.js';

export const RING_RADIUS = 14;

export class RingCourse {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'ring-course';
    this.rings = [];
    this.nextIndex = 0;
    this.passed = 0;

    const ringGeo = new THREE.TorusGeometry(RING_RADIUS, 1.1, 12, 42);
    const beaconGeo = new THREE.CylinderGeometry(1.6, 1.6, 220, 10, 1, true);

    RING_COURSE.forEach((spot, i) => {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x301a08,
        emissive: 0xff7a1a,
        emissiveIntensity: 1.4,
        roughness: 0.4,
      });
      const ring = new THREE.Mesh(ringGeo, mat);
      ring.position.set(spot.x, spot.y, spot.z);
      ring.castShadow = false;
      ring.userData.index = i;
      this.group.add(ring);

      // A soft light pillar so the next gate is visible from far away.
      const beaconMat = new THREE.MeshBasicMaterial({
        color: 0xff9a3c,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(spot.x, spot.y + 110, spot.z);
      beacon.userData.index = i;
      this.group.add(beacon);

      this.rings.push({ mesh: ring, beacon, spot, passed: false });
    });

    scene.add(this.group);
    this.highlightNext();
  }

  reset() {
    this.nextIndex = 0;
    this.passed = 0;
    for (const r of this.rings) {
      r.passed = false;
      r.mesh.material.emissive.setHex(0xff7a1a);
      r.mesh.material.emissiveIntensity = 1.4;
    }
    this.highlightNext();
  }

  // Mark the whole course flown (used by the staged end-of-mission shots).
  markAllPassed() {
    for (const r of this.rings) {
      r.passed = true;
      r.mesh.material.emissive.setHex(0x39d353);
      r.mesh.material.emissiveIntensity = 1.4;
    }
    this.passed = this.rings.length;
    this.nextIndex = this.rings.length;
    this.highlightNext();
  }

  highlightNext() {
    this.rings.forEach((r, i) => {
      const isNext = i === this.nextIndex && !r.passed;
      r.beacon.material.opacity = isNext ? 0.16 : 0;
      if (!r.passed) {
        r.mesh.material.emissiveIntensity = isNext ? 2.4 : 1.0;
      }
    });
  }

  // Returns the ring just flown through, or null. A pass counts when the
  // plane crosses the ring's plane within its radius.
  update(position, prevPosition) {
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      if (r.passed) continue;
      // Only the next gate counts — fly the course in order.
      if (i !== this.nextIndex) continue;
      const z0 = prevPosition.z - r.spot.z;
      const z1 = position.z - r.spot.z;
      if (z0 === 0 || z0 * z1 > 0) continue; // no crossing of the ring plane
      const t = z0 / (z0 - z1);
      const cx = prevPosition.x + (position.x - prevPosition.x) * t;
      const cy = prevPosition.y + (position.y - prevPosition.y) * t;
      const dx = cx - r.spot.x;
      const dy = cy - r.spot.y;
      if (Math.hypot(dx, dy) < RING_RADIUS - 1) {
        r.passed = true;
        r.mesh.material.emissive.setHex(0x39d353);
        r.mesh.material.emissiveIntensity = 1.4;
        this.passed++;
        this.nextIndex++;
        this.highlightNext();
        return r;
      }
    }
    return null;
  }

  // Gentle pulse on the next gate so it reads from a distance.
  animate(time) {
    const next = this.rings[this.nextIndex];
    if (next && !next.passed) {
      const s = 1 + Math.sin(time * 3.2) * 0.035;
      next.mesh.scale.set(s, s, s);
    }
    for (const r of this.rings) {
      if (r.passed) {
        r.mesh.rotation.z += 0.15 * 0.016;
      }
    }
  }

  nextSpot() {
    return this.nextIndex < this.rings.length ? this.rings[this.nextIndex].spot : null;
  }
}
