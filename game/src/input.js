// Ridgeline Courier — keyboard, mouse and touch input.
// One clear job: read the pilot's hands and turn them into the numbers
// the flight model eats — pitch, roll, throttle, flaps, brake — plus the
// one-shot keys (pause, mute, restart).
//
// Touch: on a touch-capable device a stick (bottom left), a throttle
// slider (right edge) and FLAPS / BRAKE / pause / mute buttons appear.
// The desktop keyboard + mouse path is untouched — the stick only
// steers while it is held, and touch drags never feed mouse steering.

export class PilotInput {
  constructor() {
    this.keys = new Set();
    this.mouse = { x: 0.5, y: 0.5, active: false, lastMove: 0 };
    this.flapsToggle = false;
    this.mutePressed = false;
    this.pausePressed = false;
    this.startPressed = false;
    this.restartPressed = false;

    // Touch state. throttle null = the slider has not been touched yet.
    this.touch = { stickX: 0, stickY: 0, stickActive: false, throttle: null, brake: false };
    this._throttleEst = 0; // shadow of the flight model's throttle
    this._lastReadNow = 0;
    this._lastFlapsShown = false;
    this._lastBrakeShown = false;

    this.isTouch =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    if (this.isTouch) {
      document.body.classList.add('touch');
      this.bindTouch();
    }

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyF') this.flapsToggle = !this.flapsToggle;
      if (e.code === 'KeyM') this.mutePressed = true;
      if (e.code === 'KeyP' || e.code === 'Escape') this.pausePressed = true;
      if (e.code === 'Enter' || e.code === 'Space') this.startPressed = true;
      if (e.code === 'KeyR') this.restartPressed = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    window.addEventListener('pointermove', (e) => {
      // A touch drag steers the stick, never the mouse.
      if (e.pointerType === 'touch') return;
      this.mouse.x = e.clientX / window.innerWidth;
      this.mouse.y = e.clientY / window.innerHeight;
      this.mouse.active = true;
      this.mouse.lastMove = performance.now();
    });
    window.addEventListener('pointerdown', (e) => {
      // A click anywhere counts as "start" on the menu screens.
      if (e.target.closest('button')) return;
      this.startPressed = true;
    });
  }

  // Reset the throttle shadow when a sortie starts: the flight model's
  // throttle is 0 then, so the estimate must be 0 too.
  reset() {
    this._throttleEst = 0;
    this._lastReadNow = 0;
    this.touch.stickX = 0;
    this.touch.stickY = 0;
    this.touch.stickActive = false;
    this.touch.throttle = null;
    this.touch.brake = false;
    const els = this._touchEls;
    if (els) {
      els.knob.style.transform = 'translate(0px, 0px)';
      els.fill.style.height = '0%';
      els.thumb.style.bottom = '0%';
      els.flapsBtn.classList.toggle('on', this.flapsToggle);
      els.brakeBtn.classList.remove('on');
    }
  }

  // Wire the touch controls (only called when this.isTouch).
  bindTouch() {
    const stick = document.getElementById('touch-stick');
    const knob = document.getElementById('touch-knob');
    const throttle = document.getElementById('touch-throttle');
    const fill = throttle.querySelector('.fill');
    const thumb = throttle.querySelector('.thumb');
    const flapsBtn = document.getElementById('touch-flaps');
    const brakeBtn = document.getElementById('touch-brake');
    this._touchEls = { stick, knob, throttle, fill, thumb, flapsBtn, brakeBtn };
    let stickId = null;
    let throttleId = null;

    const stickMove = (e) => {
      const r = stick.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const rad = r.width / 2;
      let dx = (e.clientX - cx) / rad;
      let dy = (e.clientY - cy) / rad;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      this.touch.stickX = dx;
      this.touch.stickY = dy;
      knob.style.transform = `translate(${(dx * 36).toFixed(1)}px, ${(dy * 36).toFixed(1)}px)`;
    };
    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      stickId = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      this.touch.stickActive = true;
      stickMove(e);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === stickId) stickMove(e);
    });
    const stickEnd = (e) => {
      if (e.pointerId !== stickId) return;
      stickId = null;
      this.touch.stickActive = false;
      this.touch.stickX = 0;
      this.touch.stickY = 0;
      knob.style.transform = 'translate(0px, 0px)';
    };
    stick.addEventListener('pointerup', stickEnd);
    stick.addEventListener('pointercancel', stickEnd);

    const throttleMove = (e) => {
      const r = throttle.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
      this.touch.throttle = t;
      fill.style.height = `${(t * 100).toFixed(1)}%`;
      thumb.style.bottom = `${(t * 100).toFixed(1)}%`;
    };
    throttle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      throttleId = e.pointerId;
      throttle.setPointerCapture(e.pointerId);
      throttleMove(e);
    });
    throttle.addEventListener('pointermove', (e) => {
      if (e.pointerId === throttleId) throttleMove(e);
    });
    const throttleEnd = (e) => {
      if (e.pointerId === throttleId) throttleId = null;
    };
    throttle.addEventListener('pointerup', throttleEnd);
    throttle.addEventListener('pointercancel', throttleEnd);

    flapsBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.flapsToggle = !this.flapsToggle;
      flapsBtn.classList.toggle('on', this.flapsToggle);
    });
    const brakeOff = () => {
      this.touch.brake = false;
      brakeBtn.classList.remove('on');
    };
    brakeBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      brakeBtn.setPointerCapture(e.pointerId);
      this.touch.brake = true;
      brakeBtn.classList.add('on');
    });
    brakeBtn.addEventListener('pointerup', brakeOff);
    brakeBtn.addEventListener('pointercancel', brakeOff);

    document.getElementById('touch-mute').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.mutePressed = true;
    });
    document.getElementById('touch-pause').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.pausePressed = true;
    });
  }

  // Consume the one-shot flags after the game reads them.
  consume() {
    const out = {
      mute: this.mutePressed,
      pause: this.pausePressed,
      start: this.startPressed,
      restart: this.restartPressed,
    };
    this.mutePressed = false;
    this.pausePressed = false;
    this.startPressed = false;
    this.restartPressed = false;
    return out;
  }

  // Continuous control state, in the flight model's units.
  read(now) {
    // The flight model clamps its step at 0.05 s, so the shadow below
    // uses the same clamp and stays exactly in step with it.
    const dt = this._lastReadNow
      ? Math.max(0, Math.min(0.05, (now - this._lastReadNow) / 1000))
      : 0;
    this._lastReadNow = now;

    const k = this.keys;
    let pitch = 0;
    let roll = 0;
    if (k.has('ArrowUp') || k.has('KeyW')) pitch += 1;
    if (k.has('ArrowDown') || k.has('KeyS')) pitch -= 1;
    if (k.has('ArrowLeft') || k.has('KeyA')) roll -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) roll += 1;

    // Mouse steering: the pointer's offset from screen centre is the
    // stick. It only steers for a couple of seconds after the last move,
    // so a parked mouse never fights the keyboard.
    if (this.mouse.active && now - this.mouse.lastMove < 2500) {
      const mx = (this.mouse.x - 0.5) * 2;
      const my = (this.mouse.y - 0.5) * 2;
      if (Math.abs(mx) > 0.12) roll = Math.max(-1, Math.min(1, mx * 1.4));
      if (Math.abs(my) > 0.12) pitch = Math.max(-1, Math.min(1, my * 1.2));
    }

    // The touch stick replaces keyboard/mouse steering while it is held:
    // push up to climb, left/right to bank.
    if (this.touch.stickActive) {
      pitch = -this.touch.stickY;
      roll = this.touch.stickX;
    }

    let throttleDelta = 0;
    if (this.touch.throttle !== null) {
      // Absolute slider: drive the throttle toward the slider's mark.
      throttleDelta = Math.max(-0.9, Math.min(0.9, (this.touch.throttle - this._throttleEst) * 5));
      if (Math.abs(this.touch.throttle - this._throttleEst) < 0.01) throttleDelta = 0;
    } else {
      if (k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyT')) throttleDelta += 0.55;
      if (k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyG')) throttleDelta -= 0.55;
    }
    this._throttleEst = Math.max(0, Math.min(1, this._throttleEst + throttleDelta * dt));

    // Keep the touch FLAPS / BRAKE buttons showing the live state.
    if (this._touchEls) {
      if (this.flapsToggle !== this._lastFlapsShown) {
        this._lastFlapsShown = this.flapsToggle;
        this._touchEls.flapsBtn.classList.toggle('on', this.flapsToggle);
      }
      const brake = k.has('KeyB') || k.has('Space') || this.touch.brake;
      if (brake !== this._lastBrakeShown) {
        this._lastBrakeShown = brake;
        this._touchEls.brakeBtn.classList.toggle('on', brake);
      }
    }

    return {
      pitch: Math.max(-1, Math.min(1, pitch)),
      roll: Math.max(-1, Math.min(1, roll)),
      throttleDelta,
      flaps: this.flapsToggle,
      brake: k.has('KeyB') || k.has('Space') || this.touch.brake,
    };
  }
}
