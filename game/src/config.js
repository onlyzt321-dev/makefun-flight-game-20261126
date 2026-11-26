// Ridgeline Courier — central tuning and course definition.
// One clear job: every number the game balances on lives here, so a
// tweak never means hunting through the flight model or the renderer.

export const WORLD = {
  size: 1200, // terrain spans x,z in [-600, 600]
  waterLevel: 6, // river and lake surface height
  seed: 20261126, // fixed seed: the valley is the same every run
};

export const RUNWAYS = {
  south: { x: 52, z: 520, elevation: 12, length: 96, width: 15, heading: 0 },
  north: { x: -52, z: -520, elevation: 12, length: 96, width: 15, heading: 0 },
};

// Ring course: eight gates weaving down the valley, then the north field.
export const RING_COURSE = [
  { x: 30, z: 380, y: 62 },
  { x: -45, z: 250, y: 78 },
  { x: 55, z: 120, y: 58 },
  { x: -20, z: -10, y: 84 },
  { x: 48, z: -140, y: 66 },
  { x: -58, z: -260, y: 80 },
  { x: 10, z: -360, y: 60 },
  { x: -40, z: -440, y: 48 },
];

export const PLANE = {
  cruiseSpeed: 58, // m/s at 70% throttle, level
  maxSpeed: 96,
  stallSpeed: 27, // below this the wing stops flying
  minSpeed: 18,
  throttleAccel: 26, // m/s^2 at full throttle
  dragBase: 0.055, // quadratic drag coefficient
  dragFlaps: 0.035, // extra drag with flaps out
  dragBrake: 0.22, // extra drag with the airbrake held
  pitchRate: 0.85, // rad/s at full elevator
  rollRate: 1.9, // rad/s at full aileron
  maxBank: 1.15, // rad, about 66 degrees
  maxPitchUp: 0.55,
  maxPitchDown: -0.5,
  climbPenalty: 9.81, // gravity component along the flight path
  fuelCapacity: 100,
  fuelIdleDrain: 0.12, // per second
  fuelThrottleDrain: 0.42, // per second at full throttle
  fuelRingBonus: 8, // fuel topped up by each ring
  startFuel: 100,
};

export const SCORING = {
  ringPoints: 100,
  landingBase: 500,
  landingSmoothMax: 300, // bonus for a gentle touchdown
  timeParSeconds: 150, // beat par for a time bonus
  timeBonusMax: 200,
};

export const CAMERA = {
  chaseDistance: 13,
  chaseHeight: 3.8,
  lookAhead: 26,
  smoothing: 4.5, // lerp rate per second
  bankFactor: 0.35, // how much the camera rolls with the plane
  fovBase: 62,
  fovSpeed: 14, // extra fov at max speed
};

// Valley centreline: the river (and the course) follows this gentle S.
export function valleyCenterX(z) {
  return 60 * Math.sin(z * 0.004);
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest signed angle difference, in (-PI, PI].
export function angleDelta(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
