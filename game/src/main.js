// Ridgeline Courier — bootstrap, game loop and screens.
// One clear job: own the scene, the state machine (menu / flying /
// crashed / landed / paused), the chase camera, and the wiring between
// the flight model, the rings, the HUD and the sound.

import * as THREE from '../vendor/three.min.js';
import { WORLD, RUNWAYS, CAMERA, PLANE, clamp, lerp } from './config.js';
import { buildTerrain, terrainHeightAt } from './terrain.js';
import { buildAircraft, animateAircraft } from './aircraft.js';
import { FlightState, FLIGHT } from './physics.js';
import { RingCourse } from './rings.js';
import { Mission, PHASE } from './missions.js';
import { Hud } from './hud.js';
import { SoundEngine } from './audio.js';
import { PilotInput } from './input.js';

const STATES = {
  MENU: 'menu',
  FLYING: 'flying',
  PAUSED: 'paused',
  CRASHED: 'crashed',
  LANDED: 'landed',
};

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot'); // menu | fly | approach | done (screenshot hooks)

class Game {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fovBase, 2, 0.5, 2600);

    this.terrain = buildTerrain(this.scene);
    this.plane = buildAircraft();
    this.plane.rotation.order = 'YXZ'; // yaw, then pitch, then roll
    this.scene.add(this.plane);
    this.rings = new RingCourse(this.scene);

    this.flight = new FlightState();
    this.mission = new Mission();
    this.hud = new Hud(document.getElementById('hud'));
    this.sound = new SoundEngine();
    this.input = new PilotInput();

    this.state = STATES.MENU;
    this.time = 0;
    this.lastNow = performance.now();
    this.cameraPos = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();
    this.prevPlanePos = this.flight.position.clone();
    this.menuOrbit = 0;
    this.crashFlash = 0;

    this.screens = {
      menu: document.getElementById('screen-menu'),
      crashed: document.getElementById('screen-crashed'),
      landed: document.getElementById('screen-landed'),
      paused: document.getElementById('screen-paused'),
    };
    this.endStats = {
      crashed: document.getElementById('crash-stats'),
      crashedReason: document.getElementById('crash-reason'),
      landed: document.getElementById('landed-stats'),
    };

    this.bindButtons();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.applyShotHook();
    if (!SHOT) this.showScreen('menu');
    this.renderer.setAnimationLoop(() => this.frame());
  }

  bindButtons() {
    document.getElementById('btn-fly').addEventListener('click', () => this.startSortie());
    document.getElementById('btn-retry').addEventListener('click', () => this.startSortie());
    document.getElementById('btn-again').addEventListener('click', () => this.startSortie());
    document.getElementById('btn-resume').addEventListener('click', () => this.resume());
    document.getElementById('btn-mute').addEventListener('click', () => this.toggleMute());
    document.getElementById('btn-menu').addEventListener('click', () => this.toMenu());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Deterministic setups for the maker's screenshots: real renders of the
  // game, framed by the same code the player sees.
  applyShotHook() {
    if (SHOT === 'fly') {
      this.startSortie(true);
      this.flight.position.set(-8, 66, 300);
      this.flight.heading = 0.12;
      this.flight.pitch = -0.02;
      this.flight.roll = 0.06;
      this.flight.speed = 62;
      this.flight.throttle = 0.72;
      this.flight.onGround = false;
      this.flight.airborne = true;
      this.mission.ringsPassed = 1;
      this.mission.score = 100;
      this.mission.elapsed = 47; // mid-sortie clock for the staged shot
      this.snapCameraBehindPlane();
    } else if (SHOT === 'approach') {
      this.startSortie(true);
      this.rings.markAllPassed();
      this.flight.position.set(-30, 38, -350);
      this.flight.heading = -0.03;
      this.flight.pitch = -0.09;
      this.flight.roll = 0;
      this.flight.speed = 44;
      this.flight.throttle = 0.42;
      this.flight.flaps = true;
      this.flight.onGround = false;
      this.flight.airborne = true;
      this.mission.ringsPassed = 8;
      this.mission.score = 800;
      this.mission.elapsed = 95; // mid-sortie clock for the staged shot
      this.mission.phase = PHASE.LAND;
      this.snapCameraBehindPlane();
    } else if (SHOT === 'done') {
      this.startSortie(true);
      this.rings.markAllPassed();
      const r = RUNWAYS.north;
      this.flight.position.set(r.x, r.elevation + 1.4, r.z);
      this.flight.heading = 0;
      this.flight.speed = 0;
      this.flight.throttle = 0;
      this.flight.onGround = true;
      this.flight.mode = FLIGHT.LANDED;
      this.flight.landingQuality = 0.9;
      this.mission.ringsPassed = 8;
      this.mission.score = 800;
      this.mission.elapsed = 118; // 1:58 on the clock for the staged shot
      this.mission.finishLanding(0.9, false);
      this.state = STATES.LANDED;
      this.showScreen('landed');
      this.fillLandedStats();
      this.snapCameraBehindPlane();
    }
  }

  snapCameraBehindPlane() {
    const fwd = this.flight.forwardVector(new THREE.Vector3());
    this.cameraPos
      .copy(this.flight.position)
      .addScaledVector(fwd, -CAMERA.chaseDistance)
      .add(new THREE.Vector3(0, CAMERA.chaseHeight, 0));
    this.camera.position.copy(this.cameraPos);
    this.cameraTarget.copy(this.flight.position).addScaledVector(fwd, CAMERA.lookAhead);
    this.camera.lookAt(this.cameraTarget);
  }

  showScreen(name) {
    for (const [key, el] of Object.entries(this.screens)) {
      el.classList.toggle('hidden', key !== name);
    }
    const hideHud =
      this.state === STATES.MENU || this.state === STATES.CRASHED || this.state === STATES.LANDED;
    document.getElementById('hud').classList.toggle('hidden', hideHud);
  }

  startSortie(fromHook = false) {
    this.sound.start();
    this.sound.click();
    this.flight.reset();
    this.rings.reset();
    this.mission.start();
    this.state = STATES.FLYING;
    this.showScreen(null);
    this.snapCameraBehindPlane();
    if (!fromHook) {
      document.getElementById('btn-fly').blur();
    }
  }

  toMenu() {
    this.flight.reset();
    this.rings.reset();
    this.mission.reset();
    this.state = STATES.MENU;
    this.showScreen('menu');
  }

  resume() {
    this.state = STATES.FLYING;
    this.showScreen(null);
    this.lastNow = performance.now();
  }

  toggleMute() {
    this.sound.start();
    this.sound.setMuted(!this.sound.muted);
    document.getElementById('btn-mute').textContent = this.sound.muted
      ? '🔇 Sound off'
      : '🔊 Sound on';
  }

  frame() {
    const now = performance.now();
    let dt = Math.min(0.05, (now - this.lastNow) / 1000);
    this.lastNow = now;
    this.time += dt;

    const oneShot = this.input.consume();
    if (oneShot.mute) this.toggleMute();
    if (oneShot.start && (this.state === STATES.MENU || this.state === STATES.CRASHED || this.state === STATES.LANDED)) {
      this.startSortie();
    }
    if (oneShot.restart && (this.state === STATES.CRASHED || this.state === STATES.LANDED)) {
      this.startSortie();
    }
    if (oneShot.pause) {
      if (this.state === STATES.FLYING) {
        this.state = STATES.PAUSED;
        this.showScreen('paused');
      } else if (this.state === STATES.PAUSED) {
        this.resume();
      }
    }

    // Clouds always drift, even on the menu.
    const clouds = this.terrain.userData.clouds;
    for (const cloud of clouds.children) {
      cloud.position.x += cloud.userData.drift * dt;
      if (cloud.position.x > WORLD.size / 2 + 80) cloud.position.x = -WORLD.size / 2 - 80;
    }

    if (this.state === STATES.FLYING) {
      this.updateFlying(dt, now);
    } else if (this.state === STATES.MENU) {
      this.updateMenu(dt);
    } else if (this.state === STATES.CRASHED) {
      this.crashFlash = Math.max(0, this.crashFlash - dt * 2);
    }

    this.syncPlane();
    this.updateCamera(dt);
    animateAircraft(this.plane, dt, {
      rpm: this.flight.readouts().rpm,
      rollInput: this.flight.roll / 1.15,
      pitchInput: this.flight.pitch / 0.55,
      time: this.time,
    });
    this.rings.animate(this.time);
    this.renderer.render(this.scene, this.camera);
  }

  // Copy the flight model's numbers onto the 3D plane: heading 0 is
  // north (-Z), clockwise; a positive roll banks right.
  syncPlane() {
    this.plane.position.copy(this.flight.position);
    this.plane.rotation.set(this.flight.pitch, -this.flight.heading, -this.flight.roll);
  }

  updateFlying(dt, now) {
    this.prevPlanePos.copy(this.flight.position);
    const controls = this.input.read(now);
    const event = this.flight.step(dt, controls);
    this.mission.tick(dt);

    // Ring pass.
    const ring = this.rings.update(this.flight.position, this.prevPlanePos);
    if (ring) {
      this.mission.ringPassed(PLANE.fuelRingBonus);
      this.flight.fuel = Math.min(PLANE.fuelCapacity, this.flight.fuel + PLANE.fuelRingBonus);
      this.sound.chime();
      this.hud.flashScore();
    }

    // Warnings: stall, low fuel, terrain, leaving the valley.
    let warning = '';
    if (this.flight.speed < PLANE.stallSpeed && !this.flight.onGround) warning = '⚠ STALL — NOSE DOWN, ADD POWER';
    else if (this.flight.engineOut) warning = '⚠ FUEL EMPTY — GLIDE TO A FIELD';
    else if (this.flight.fuel < 25) warning = '⚠ LOW FUEL';
    else if (!this.flight.onGround) {
      const agl = this.flight.position.y - 1.4 - terrainHeightAt(this.flight.position.x, this.flight.position.z);
      if (agl < 25 && this.flight.verticalSpeed < -3) warning = '⚠ PULL UP — TERRAIN';
    }
    if (!warning && !this.flight.onGround) {
      if (Math.abs(this.flight.position.x) > 620 || Math.abs(this.flight.position.z) > 620) {
        warning = '⚠ LEAVING THE VALLEY — TURN BACK';
      } else if (this.flight.position.y > 320) {
        warning = '⚠ TOO HIGH — DESCEND TO THE VALLEY';
      }
    }
    this.hud.warn(warning);

    this.sound.update({
      throttle: this.flight.throttle,
      speed: this.flight.speed,
      rpm: this.flight.readouts().rpm,
      flying: true,
      onGround: this.flight.onGround,
    });
    this.hud.update(this.flight, this.mission, this.time, this.rings);

    if (event === 'landed' || event === 'landed-rough') {
      this.mission.finishLanding(this.flight.landingQuality, event === 'landed-rough');
      this.state = STATES.LANDED;
      this.sound.fanfare();
      this.fillLandedStats();
      this.showScreen('landed');
    } else if (event === 'crashed') {
      this.mission.finishCrash();
      this.state = STATES.CRASHED;
      this.crashFlash = 1;
      this.sound.crash();
      this.endStats.crashedReason.textContent = this.flight.crashReason;
      this.endStats.crashed.innerHTML =
        `Rings cleared: <b>${this.mission.ringsPassed} / 8</b> &nbsp;·&nbsp; ` +
        `Score: <b>${this.mission.score}</b> &nbsp;·&nbsp; Time: <b>${this.mission.formatTime()}</b>`;
      this.showScreen('crashed');
    }
  }

  updateMenu(dt) {
    // Slow orbit around the parked plane on the south runway.
    this.menuOrbit += dt * 0.12;
    const r = RUNWAYS.south;
    const cx = r.x + Math.sin(this.menuOrbit) * 26;
    const cz = r.z + 18 + Math.cos(this.menuOrbit) * 26;
    this.cameraPos.set(cx, r.elevation + 9, cz);
    this.camera.position.copy(this.cameraPos);
    this.camera.lookAt(r.x, r.elevation + 2, r.z);
    this.plane.position.set(r.x, r.elevation + 1.4, r.z + r.length / 2 - 8);
    this.plane.rotation.set(0, 0, 0);
    this.sound.update({ throttle: 0, speed: 0, rpm: 0, flying: false, onGround: true });
  }

  updateCamera(dt) {
    if (this.state === STATES.MENU) return; // menu sets the camera itself
    const fwd = this.flight.forwardVector(new THREE.Vector3());
    const desired = this.flight.position
      .clone()
      .addScaledVector(fwd, -CAMERA.chaseDistance)
      .add(new THREE.Vector3(0, CAMERA.chaseHeight, 0));
    // Keep the camera out of the hillside when the plane hugs terrain.
    const minY = terrainHeightAt(desired.x, desired.z) + 3;
    if (desired.y < minY) desired.y = minY;
    const k = 1 - Math.exp(-CAMERA.smoothing * dt);
    this.cameraPos.lerp(desired, k);
    this.camera.position.copy(this.cameraPos);
    this.cameraTarget.lerp(
      this.flight.position.clone().addScaledVector(fwd, CAMERA.lookAhead),
      1 - Math.exp(-8 * dt),
    );
    this.camera.lookAt(this.cameraTarget);
    this.camera.rotateZ(-this.flight.roll * CAMERA.bankFactor);
    const targetFov = CAMERA.fovBase + (this.flight.speed / PLANE.maxSpeed) * CAMERA.fovSpeed;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 2);
      this.camera.updateProjectionMatrix();
    }
  }

  fillLandedStats() {
    const m = this.mission;
    const rows = [
      ['Rings cleared', `${m.ringsPassed} / 8 — ${m.ringsPassed * 100} pts`],
      ['Landing', m.roughLanding ? 'Rough field landing — 100 pts' : `Smooth touchdown — ${m.landingBonus} pts`],
      ['Time', `${m.formatTime()} — bonus ${m.timeBonus} pts`],
      ['Fuel left', `${Math.round(this.flight.fuel)}%`],
    ];
    this.endStats.landed.innerHTML =
      rows.map(([k, v]) => `<div class="stat-row"><span>${k}</span><b>${v}</b></div>`).join('') +
      `<div class="stat-total"><span>TOTAL SCORE</span><b>${m.score}</b></div>`;
  }
}

// Exposed for play-testing and debugging in the browser console.
window.__game = new Game();
