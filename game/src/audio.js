// Ridgeline Courier — synthesised sound.
// One clear job: every sound the game makes, built from oscillators and
// filtered noise in WebAudio — engine hum, wind, ring chimes, crash and
// landing fanfare. No audio files, nothing fetched.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineSub = null;
    this.engineGain = null;
    this.windGain = null;
    this.windFilter = null;
    this.muted = false;
    this.started = false;
  }

  // Must be called from a user gesture (the start button or a key).
  start() {
    if (this.started) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);

    // Engine: a sawtooth plus a sub sine, through a lowpass.
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.connect(this.master);
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 68;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineGain);
    this.engineGain.connect(filter);
    this.engineSub = this.ctx.createOscillator();
    this.engineSub.type = 'sine';
    this.engineSub.frequency.value = 34;
    const subGain = this.ctx.createGain();
    subGain.gain.value = 0.5;
    this.engineSub.connect(subGain);
    subGain.connect(filter);
    this.engineOsc.start();
    this.engineSub.start();

    // Wind: looped noise through a bandpass, gain follows airspeed.
    const noiseLen = this.ctx.sampleRate * 2;
    const noiseBuf = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 700;
    this.windFilter.Q.value = 0.6;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    noise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    noise.start();

    this.started = true;
  }

  // Continuous update from the flight state, called every frame.
  update({ throttle, speed, rpm, flying, onGround }) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const engineOn = flying && !onGround ? 1 : onGround && throttle > 0.05 ? 0.7 : 0;
    const targetEngine = engineOn * (0.05 + throttle * 0.11);
    this.engineGain.gain.setTargetAtTime(targetEngine, t, 0.08);
    const freq = 52 + rpm * 0.055;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.1);
    this.engineSub.frequency.setTargetAtTime(freq / 2, t, 0.1);
    const wind = flying && !onGround ? Math.min(0.16, speed * 0.0016) : 0;
    this.windGain.gain.setTargetAtTime(wind, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(500 + speed * 9, t, 0.2);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
    }
  }

  // Short melodic events, all scheduled on the same clock.
  chime() {
    if (!this.started) return;
    const t0 = this.ctx.currentTime;
    this.tone(880, t0, 0.5, 0.22, 'sine');
    this.tone(1318.5, t0 + 0.09, 0.6, 0.2, 'sine');
    this.tone(1760, t0 + 0.18, 0.7, 0.16, 'sine');
  }

  fanfare() {
    if (!this.started) return;
    const t0 = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone(f, t0 + i * 0.13, 0.55, 0.2, 'triangle'));
  }

  crash() {
    if (!this.started) return;
    const t0 = this.ctx.currentTime;
    // Low thud.
    this.tone(55, t0, 0.9, 0.5, 'sine');
    this.tone(38, t0 + 0.05, 1.0, 0.4, 'sine');
    // Noise burst, lowpassed down fast.
    const len = this.ctx.sampleRate * 0.7;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, t0);
    filter.frequency.exponentialRampToValueAtTime(120, t0 + 0.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.6, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  click() {
    if (!this.started) return;
    this.tone(660, this.ctx.currentTime, 0.08, 0.12, 'square');
  }

  tone(freq, when, dur, vol, type) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }
}
