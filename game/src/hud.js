// Ridgeline Courier — the HUD.
// One clear job: every instrument the pilot reads — speed, altitude,
// heading, throttle, fuel, score, the artificial horizon and warnings —
// drawn as lit glass dials over the 3D view.

import { RING_COURSE, RUNWAYS, angleDelta } from './config.js';

const HEADINGS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export class Hud {
  constructor(root) {
    this.root = root;
    this.el = {};
    for (const id of [
      'speed',
      'alt',
      'altMsl',
      'vspeed',
      'heading',
      'compass',
      'throttle',
      'throttleBar',
      'fuel',
      'fuelBar',
      'score',
      'rings',
      'timer',
      'phase',
      'objective',
      'warning',
      'flaps',
      'brake',
      'nextgate',
    ]) {
      this.el[id] = root.querySelector(`#hud-${id}`);
    }
    this.horizon = root.querySelector('#hud-horizon');
    this.horizonCtx = this.horizon.getContext('2d');
    this.lastUpdate = 0;
    this.buildCompass();
  }

  // The compass strip holds two full 360° scales so any heading can be
  // centred: tick for heading h sits at (h + 360) * 2.4 px from the start.
  buildCompass() {
    const strip = this.el.compass;
    for (let deg = 0; deg <= 720; deg += 15) {
      const tick = document.createElement('div');
      tick.className = 'tick';
      const h = deg % 360;
      if (h % 45 === 0) {
        tick.classList.add('major');
        tick.textContent = HEADINGS[h / 45];
      } else {
        tick.textContent = h / 15 % 2 === 0 ? String(h) : '';
      }
      strip.appendChild(tick);
    }
  }

  // Called every frame; cheap DOM writes are throttled to 10 Hz, the
  // attitude indicator redraws every frame because it moves constantly.
  update(state, mission, time, rings) {
    const r = state.readouts();
    this.drawHorizon(state.pitch, state.roll, state.verticalSpeed);

    if (time - this.lastUpdate < 0.1) return;
    this.lastUpdate = time;

    this.el.speed.textContent = r.speedKnots;
    this.el.alt.textContent = r.altitudeFt.toLocaleString();
    this.el.altMsl.textContent = `MSL ${r.altitudeMslFt.toLocaleString()} FT`;
    const vs = r.verticalSpeedFpm;
    this.el.vspeed.textContent = `${vs >= 0 ? '+' : ''}${vs} FPM`;
    this.el.vspeed.classList.toggle('climb', vs > 100);
    this.el.vspeed.classList.toggle('sink', vs < -300);

    const hdg = r.headingDeg;
    const card = HEADINGS[Math.round(hdg / 45) % 8];
    this.el.heading.textContent = `${String(hdg).padStart(3, '0')}° ${card}`;
    this.el.compass.style.transform = `translateX(${120 - (hdg + 360) * 2.4}px)`;

    this.el.throttle.textContent = `${r.throttlePct}%`;
    this.el.throttleBar.style.width = `${r.throttlePct}%`;
    this.el.fuel.textContent = `${r.fuelPct}%`;
    this.el.fuelBar.style.width = `${r.fuelPct}%`;
    this.el.fuelBar.classList.toggle('low', r.fuelPct < 25);
    this.el.score.textContent = mission.score;
    this.el.rings.textContent = `${mission.ringsPassed}/${RING_COURSE.length}`;
    this.el.timer.textContent = mission.formatTime();
    this.el.phase.textContent = mission.phaseText();
    this.el.objective.textContent = mission.objectiveText();
    this.el.flaps.classList.toggle('on', state.flaps);
    this.el.brake.classList.toggle('on', state.brake);
    this.el.nextgate.textContent = this.nextGateText(state, rings);
  }

  // Bearing and distance to the next objective, as the pilot would read it.
  nextGateText(state, rings) {
    let target;
    let label;
    if (rings) {
      const spot = rings.nextSpot();
      if (spot) {
        target = spot;
        label = 'NEXT GATE';
      }
    }
    if (!target) {
      target = RUNWAYS.north;
      label = 'NORTH FIELD';
    }
    const dx = target.x - state.position.x;
    const dy = (target.y ?? target.elevation) - state.position.y;
    const dz = target.z - state.position.z;
    const dist = Math.round(Math.hypot(dx, dy, dz));
    const bearing = Math.atan2(dx, -dz);
    const rel = angleDelta(bearing, state.heading);
    const arrow = Math.abs(rel) < 0.35 ? '▲ AHEAD' : rel > 0 ? '▶ RIGHT' : '◀ LEFT';
    return `${label}  ${dist}m  ${arrow}`;
  }

  warn(text) {
    const el = this.el.warning;
    if (text) {
      el.textContent = text;
      el.classList.add('show');
    } else {
      el.classList.remove('show');
    }
  }

  flashScore() {
    const el = this.el.score;
    el.classList.remove('pop');
    void el.offsetWidth; // restart the pop animation
    el.classList.add('pop');
  }

  drawHorizon(pitch, roll, verticalSpeed) {
    const ctx = this.horizonCtx;
    const w = this.horizon.width;
    const h = this.horizon.height;
    const cx = w / 2;
    const cy = h / 2;
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 62, 0, Math.PI * 2);
    ctx.clip();

    // Sky and ground, rolled with the plane and shifted by pitch.
    ctx.translate(cx, cy);
    ctx.rotate(-roll);
    const pitchPx = Math.max(-50, Math.min(50, pitch * 120));
    ctx.translate(0, pitchPx);
    ctx.fillStyle = '#3f8fd2';
    ctx.fillRect(-70, -130, 140, 130);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-70, 0, 140, 130);
    ctx.strokeStyle = '#f5f5f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-70, 0);
    ctx.lineTo(70, 0);
    ctx.stroke();
    // Pitch ladder lines.
    ctx.lineWidth = 1;
    for (const deg of [-20, -10, 10, 20]) {
      const y = -deg * 1.4;
      ctx.beginPath();
      ctx.moveTo(-22, y);
      ctx.lineTo(22, y);
      ctx.stroke();
    }
    ctx.restore();

    // Fixed aircraft symbol and bank pointer.
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 26, cy);
    ctx.lineTo(cx - 8, cy);
    ctx.moveTo(cx + 8, cy);
    ctx.lineTo(cx + 26, cy);
    ctx.moveTo(cx, cy - 4);
    ctx.lineTo(cx, cy + 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 62, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Bank pointer.
    const bx = cx + Math.sin(roll) * 56;
    const by = cy - Math.cos(roll) * 56;
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(bx, by, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
