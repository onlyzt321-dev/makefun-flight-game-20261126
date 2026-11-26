// Ridgeline Courier — mission, score and phase.
// One clear job: the sortie's structure (ring run, then land), the
// score math, and the phase text the HUD shows.

import { SCORING, RING_COURSE } from './config.js';

export const PHASE = {
  RING_RUN: 'ring-run',
  LAND: 'land',
  DONE: 'done',
};

export class Mission {
  constructor() {
    this.reset();
  }

  reset() {
    this.score = 0;
    this.ringsPassed = 0;
    this.phase = PHASE.RING_RUN;
    this.elapsed = 0;
    this.started = false;
    this.landingBonus = 0;
    this.timeBonus = 0;
    this.roughLanding = false;
  }

  start() {
    this.reset();
    this.started = true;
  }

  tick(dt) {
    if (this.started && this.phase !== PHASE.DONE) this.elapsed += dt;
  }

  ringPassed(fuelBonus) {
    this.ringsPassed++;
    this.score += SCORING.ringPoints;
    if (this.ringsPassed >= RING_COURSE.length) {
      this.phase = PHASE.LAND;
    }
    return fuelBonus;
  }

  finishLanding(landingQuality, rough) {
    this.phase = PHASE.DONE;
    this.roughLanding = rough;
    this.landingBonus = rough
      ? 100
      : Math.round(SCORING.landingBase + SCORING.landingSmoothMax * landingQuality);
    this.timeBonus =
      this.elapsed < SCORING.timeParSeconds
        ? Math.round(
            SCORING.timeBonusMax * (1 - this.elapsed / SCORING.timeParSeconds),
          )
        : 0;
    this.score += this.landingBonus + this.timeBonus;
    return this.score;
  }

  finishCrash() {
    this.phase = PHASE.DONE;
    return this.score;
  }

  phaseText() {
    if (this.phase === PHASE.RING_RUN) {
      return `LEG 1 — RING RUN  ${this.ringsPassed}/${RING_COURSE.length}`;
    }
    if (this.phase === PHASE.LAND) {
      return 'LEG 2 — LAND AT NORTH FIELD';
    }
    return 'SORTIE COMPLETE';
  }

  objectiveText() {
    if (this.phase === PHASE.RING_RUN) {
      return 'Fly through the orange gates in order, then land north.';
    }
    if (this.phase === PHASE.LAND) {
      return 'All gates cleared — bring her down on the north strip.';
    }
    return '';
  }

  formatTime() {
    const total = Math.floor(this.elapsed);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
}
