// Ridgeline Courier — keyboard and mouse input.
// One clear job: read the pilot's hands and turn them into the numbers
// the flight model eats — pitch, roll, throttle, flaps, brake — plus the
// one-shot keys (pause, mute, restart).

export class PilotInput {
  constructor() {
    this.keys = new Set();
    this.mouse = { x: 0.5, y: 0.5, active: false, lastMove: 0 };
    this.flapsToggle = false;
    this.mutePressed = false;
    this.pausePressed = false;
    this.startPressed = false;
    this.restartPressed = false;

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

    let throttleDelta = 0;
    if (k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyT')) throttleDelta += 0.55;
    if (k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyG')) throttleDelta -= 0.55;

    return {
      pitch: Math.max(-1, Math.min(1, pitch)),
      roll: Math.max(-1, Math.min(1, roll)),
      throttleDelta,
      flaps: this.flapsToggle,
      brake: k.has('KeyB') || k.has('Space'),
    };
  }
}
