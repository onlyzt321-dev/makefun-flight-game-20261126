// Ridgeline Courier — the flight model.
// One clear job: turn stick, throttle, flaps and brake into motion —
// lift, drag, thrust, gravity, coordinated turns, stall, and the
// ground/water/runway contact checks. No rendering here, only numbers.

import * as THREE from '../vendor/three.min.js';
import { PLANE, RUNWAYS, WORLD, clamp, angleDelta } from './config.js';
import { terrainHeightAt } from './terrain.js';

export const FLIGHT = {
  FLYING: 'flying',
  CRASHED: 'crashed',
  LANDED: 'landed',
};

export class FlightState {
  constructor() {
    this.reset();
  }

  reset() {
    const r = RUNWAYS.south;
    this.position = new THREE.Vector3(r.x, r.elevation + 1.4, r.z + r.length / 2 - 8);
    this.heading = 0; // 0 = north (-Z), clockwise
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.throttle = 0;
    this.flaps = false;
    this.brake = false;
    this.fuel = PLANE.startFuel;
    this.engineOut = false;
    this.verticalSpeed = 0;
    this.groundSpeed = 0;
    this.mode = FLIGHT.FLYING;
    this.crashReason = '';
    this.onGround = true;
    this.landingQuality = 0; // 0..1, set when the wheels touch the runway
    this.airborne = false;
    this.peakClearance = 0; // highest ground clearance since liftoff
  }

  forwardVector(out) {
    out.set(
      Math.sin(this.heading) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.heading) * Math.cos(this.pitch),
    );
    return out;
  }

  // One fixed step of the flight model. inputs: {pitch, roll, throttleDelta,
  // flaps, brake} with pitch/roll in [-1, 1]. Returns an event string or ''.
  step(dt, inputs) {
    if (this.mode !== FLIGHT.FLYING) return '';

    // --- Throttle and fuel ------------------------------------------
    this.throttle = clamp(this.throttle + inputs.throttleDelta * dt, 0, 1);
    this.flaps = inputs.flaps;
    this.brake = inputs.brake;
    if (!this.engineOut) {
      this.fuel -= (PLANE.fuelIdleDrain + PLANE.fuelThrottleDrain * this.throttle) * dt;
      if (this.fuel <= 0) {
        this.fuel = 0;
        this.engineOut = true;
      }
    }

    const stalled = this.speed < PLANE.stallSpeed && !this.onGround;
    const authority = stalled ? 0.25 : 1; // a stalled wing barely answers

    // --- Attitude -----------------------------------------------------
    const targetRoll = clamp(inputs.roll * PLANE.maxBank, -PLANE.maxBank, PLANE.maxBank);
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 5);
    const targetPitch = clamp(inputs.pitch * PLANE.maxPitchUp, PLANE.maxPitchDown, PLANE.maxPitchUp);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 3.2);
    if (stalled) this.pitch += (-0.35 - this.pitch) * Math.min(1, dt * 1.2); // nose drops

    // Coordinated turn: bank turns the heading, faster when slow.
    const turnRate = (9.81 * Math.tan(this.roll)) / Math.max(this.speed, 12);
    this.heading += turnRate * dt * authority;

    // --- Speed ---------------------------------------------------------
    const thrust = this.engineOut ? 0 : this.throttle * PLANE.throttleAccel;
    const dragCoeff =
      PLANE.dragBase +
      (this.flaps ? PLANE.dragFlaps : 0) +
      (this.brake ? PLANE.dragBrake : 0);
    const drag = dragCoeff * this.speed * this.speed * 0.09;
    const gravityAlongPath = -Math.sin(this.pitch) * PLANE.climbPenalty;
    const accel = thrust - drag + gravityAlongPath;
    this.speed = Math.max(0, this.speed + accel * dt);
    if (this.onGround && this.throttle < 0.15 && this.brake) {
      this.speed = Math.max(0, this.speed - 22 * dt); // wheel brakes
    }

    // --- Position -------------------------------------------------------
    const fwd = this.forwardVector(new THREE.Vector3());
    const groundY = terrainHeightAt(this.position.x, this.position.z);
    if (this.onGround) {
      // Rolling on the ground: stay on the surface, steer with the rudder.
      this.position.y = groundY + 1.4;
      this.position.x += Math.sin(this.heading) * this.speed * dt;
      this.position.z += -Math.cos(this.heading) * this.speed * dt;
      this.verticalSpeed = 0;
      const liftSpeed = PLANE.stallSpeed + (this.flaps ? -6 : 0);
      if (this.speed > liftSpeed && this.pitch > 0.06) {
        this.onGround = false;
        this.airborne = true;
        this.justLifted = true; // this step is a takeoff, not a touchdown
      }
    } else {
      this.position.addScaledVector(fwd, this.speed * dt);
      // Sink a little extra when slow: the wing is not making enough lift.
      const liftFactor = clamp(this.speed / (PLANE.stallSpeed + 12), 0, 1);
      this.position.y -= (1 - liftFactor) * 6 * dt;
      this.verticalSpeed = fwd.y * this.speed - (1 - liftFactor) * 6;
      this.groundSpeed = Math.hypot(fwd.x, fwd.z) * this.speed;
      // Remember how high above the ground this sortie has been: a
      // touchdown only counts as a landing once the plane really flew.
      this.peakClearance = Math.max(
        this.peakClearance,
        this.position.y - 1.4 - terrainHeightAt(this.position.x, this.position.z),
      );
    }

    // --- Contact ---------------------------------------------------------
    return this.checkContact(groundY);
  }

  checkContact(groundY) {
    const y = this.position.y;
    const groundClearance = y - 1.4 - groundY;
    // A touchdown only counts while the plane is actually coming down.
    const descending = this.verticalSpeed < 1.0;
    // A landing only counts once the plane has really flown: without this,
    // the mushy climb-out right after liftoff — still centimetres above
    // the strip — reads as a landing the instant the wheels leave.
    const reallyFlew = this.peakClearance > 3;
    // The liftoff step itself leaves the wheels at ground level while the
    // nose is already climbing: it is a takeoff, never a touchdown.
    const justLifted = this.justLifted;
    this.justLifted = false;

    if (!this.onGround) {
      // Water: the river and lake sit below the valley floor.
      if (groundY < WORLD.waterLevel + 0.4 && y <= WORLD.waterLevel + 0.6) {
        return this.crash('DITCHED IN THE RIVER');
      }
      // Terrain strike — but only while the plane is actually coming down.
      if (!justLifted && groundClearance <= 0 && this.verticalSpeed < 0.5) {
        if (this.onRunway() && !reallyFlew) {
          // Bounced straight back onto the strip after liftoff: roll on.
          this.onGround = true;
          this.position.y = groundY + 1.4;
          return '';
        }
        if (descending && this.onRunway() && this.isGentleTouchdown()) {
          return this.land();
        }
        if (this.onRunway()) {
          return this.crash('HARD LANDING — TOUCHED DOWN TOO FAST');
        }
        // A flat meadow at low speed and low sink is a survivable rough field.
        if (descending && Math.abs(this.verticalSpeed) < 3 && this.speed < 34 && groundY > WORLD.waterLevel + 1) {
          return this.roughFieldLanding();
        }
        return this.crash('TERRAIN IMPACT');
      }
      // Runway wheels: a gentle touchdown while still over the strip.
      if (!justLifted && reallyFlew && descending && this.onRunway() && groundClearance <= 0.4 && this.isGentleTouchdown()) {
        return this.land();
      }
    }
    return '';
  }

  onRunway() {
    for (const r of Object.values(RUNWAYS)) {
      if (
        Math.abs(this.position.x - r.x) < r.width / 2 + 1.5 &&
        Math.abs(this.position.z - r.z) < r.length / 2 + 2
      ) {
        return true;
      }
    }
    return false;
  }

  isGentleTouchdown() {
    return (
      Math.abs(this.verticalSpeed) < 4.5 &&
      this.speed < 58 &&
      Math.abs(this.pitch) < 0.3 &&
      Math.abs(this.roll) < 0.35
    );
  }

  land() {
    this.mode = FLIGHT.LANDED;
    this.onGround = true;
    this.landingQuality = clamp(1 - Math.abs(this.verticalSpeed) / 4.5, 0.25, 1);
    return 'landed';
  }

  roughFieldLanding() {
    this.mode = FLIGHT.LANDED;
    this.onGround = true;
    this.landingQuality = 0.3;
    return 'landed-rough';
  }

  crash(reason) {
    this.mode = FLIGHT.CRASHED;
    this.crashReason = reason;
    return 'crashed';
  }

  // Readouts for the HUD, in pilot units.
  readouts() {
    const agl = Math.max(0, this.position.y - 1.4 - terrainHeightAt(this.position.x, this.position.z));
    const msl = Math.max(0, this.position.y - 1.4);
    return {
      speedKnots: Math.round(this.speed * 1.944),
      altitudeFt: Math.round(agl * 3.281),
      altitudeMslFt: Math.round(msl * 3.281),
      verticalSpeedFpm: Math.round(this.verticalSpeed * 196.85),
      headingDeg: Math.round(((this.heading * 180) / Math.PI % 360) + 360) % 360,
      throttlePct: Math.round(this.throttle * 100),
      fuelPct: Math.round(this.fuel),
      rpm: Math.round(400 + this.throttle * 2100 + (this.engineOut ? -400 : 0)),
    };
  }
}
