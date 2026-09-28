// Generative soundtrack, synthesized live. It builds as you descend:
// intro = pad + heartbeat, markets = kick + hats, systems = arp,
// terminal = muffled underwater, contact = full drop.

const BPM = 100;
const STEP = 60 / BPM / 4; // one 16th note
const PENTATONIC = [0, 3, 5, 7, 10, 12, 15];

// i - VI - III - VII in A minor, as MIDI notes.
const CHORDS = [
  [45, 52, 55, 59, 60], // Am9
  [41, 48, 52, 57, 60], // Fmaj7
  [48, 55, 59, 64, 62], // Cmaj7(9)
  [43, 50, 57, 59, 62]  // G6/9
];
const ARP = [0, 2, 1, 3, 2, 4, 3, 1, 0, 2, 4, 3, 1, 3, 2, 4];

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export class SiteAudio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.section = 0;
    this.kicks = [];
  }

  ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = (this.ctx = new Ctx());

    // Master chain: music → master filter → glue compressor → out.
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.ratio.value = 4;
    this.masterFilter = ctx.createBiquadFilter();
    this.masterFilter.type = "lowpass";
    this.masterFilter.frequency.value = 18000;
    this.masterFilter.Q.value = 0.8;
    this.masterFilter.connect(this.compressor).connect(this.master).connect(ctx.destination);

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.master.connect(this.analyser);
    this.levels = new Uint8Array(this.analyser.frequencyBinCount);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2);
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.5;
    this.reverb.connect(reverbReturn).connect(this.masterFilter);

    this.delay = ctx.createDelay();
    this.delay.delayTime.value = STEP * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const delayTone = ctx.createBiquadFilter();
    delayTone.type = "highpass";
    delayTone.frequency.value = 600;
    this.delay.connect(delayTone).connect(feedback).connect(this.delay);
    delayTone.connect(this.masterFilter);

    // Everything melodic goes through the duck bus, which pumps on every kick.
    this.duck = ctx.createGain();
    this.duck.connect(this.masterFilter);
    this.duck.connect(this.reverb);

    // Pad: five voices, two detuned saws each, gliding between chords.
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = 600;
    this.padFilter.Q.value = 4;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.035;
    this.padFilter.connect(padGain).connect(this.duck);
    this.padVoices = CHORDS[0].map((note) => [-8, 8].map((cents) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = midi(note);
      osc.detune.value = cents;
      osc.connect(this.padFilter);
      osc.start();
      return osc;
    }));
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 250;
    lfo.connect(lfoGain).connect(this.padFilter.frequency);
    lfo.start();

    // Sub bass follows the chord root.
    this.sub = ctx.createOscillator();
    this.sub.type = "sine";
    this.sub.frequency.value = midi(CHORDS[0][0] - 12);
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0;
    this.sub.connect(this.subGain).connect(this.masterFilter);
    this.sub.start();

    this.noise = this.noiseBuffer(2);

    // Scroll wind: looping noise through a band-pass that opens with speed.
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 1.2;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.masterFilter);
    this.windGain.connect(this.reverb);
    wind.start();

    this.step = 0;
    this.nextTime = ctx.currentTime + 0.1;
    this.chordIndex = 0;
    this.scheduler = setInterval(() => this.schedule(), 25);
  }

  impulse(seconds) {
    const ctx = this.ctx;
    const length = ctx.sampleRate * seconds;
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    }
    return buffer;
  }

  noiseBuffer(seconds) {
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  setEnabled(on) {
    if (on) this.ensure();
    if (!this.ctx) return false;
    this.enabled = on;
    if (on) this.ctx.resume();
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, now, on ? 0.6 : 0.15);
    return on;
  }

  /* ---------- Sequencer ---------- */

  schedule() {
    if (!this.enabled) return;
    const ctx = this.ctx;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step++;
    }
  }

  playStep(step, time) {
    const s = this.section;
    const inStep = step % 16;
    const bar = Math.floor(step / 16);

    if (inStep === 0) {
      // New chord every bar, gliding.
      this.chordIndex = bar % CHORDS.length;
      const chord = CHORDS[this.chordIndex];
      this.padVoices.forEach((pair, i) => pair.forEach((osc) => osc.frequency.setTargetAtTime(midi(chord[i]), time, 0.15)));
      this.sub.frequency.setTargetAtTime(midi(chord[0] - 12), time, 0.05);
    }

    const full = s > 3.5;
    const muffled = Math.abs(s - 3) < 0.5;

    // Kick: a heartbeat in the intro, four-on-the-floor from the markets onwards.
    const heartbeat = s < 0.5 && (inStep === 0 || inStep === 3);
    const four = s >= 0.5 && inStep % 4 === 0;
    if (heartbeat) this.kick(time, 0.55);
    if (four) this.kick(time, 1);

    // Sub bass pulses with the kick once the beat is in.
    if (s >= 0.5 && inStep % 4 === 0) {
      this.subGain.gain.setValueAtTime(0.0001, time);
      this.subGain.gain.linearRampToValueAtTime(0.22, time + 0.06);
      this.subGain.gain.setTargetAtTime(0.08, time + 0.1, 0.12);
    } else if (s < 0.5) {
      this.subGain.gain.setTargetAtTime(0, time, 0.3);
    }

    // Hats: offbeat 8ths from markets, rolling 16ths from systems.
    if (s >= 0.8 && inStep % 4 === 2) this.hat(time, 0.12, 0.05);
    else if (s >= 1.8 && !muffled) this.hat(time, inStep % 2 ? 0.035 : 0.06, 0.025);

    // Arp from systems onwards.
    if (s >= 1.5) {
      const chord = CHORDS[this.chordIndex];
      const note = chord[ARP[inStep] % chord.length] + 12 + (full && inStep >= 8 ? 12 : 0);
      this.pluck(midi(note), time, full ? 0.07 : 0.05);
    }

    // Claps on 2 and 4 in the drop.
    if ((s >= 2.5 && !muffled) && (inStep === 4 || inStep === 12)) this.clap(time, full ? 0.35 : 0.2);

    // Pad brightness follows depth.
    const bright = full ? 3200 : 500 + s * 450;
    this.padFilter.frequency.setTargetAtTime(bright, time, 0.4);
    this.masterFilter.frequency.setTargetAtTime(muffled ? 900 : 18000, time, 0.25);
  }

  kick(time, level) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.14);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(0.9 * level, time + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.45);
    osc.connect(env).connect(this.masterFilter);
    osc.start(time);
    osc.stop(time + 0.5);

    // Sidechain pump.
    this.duck.gain.cancelScheduledValues(time);
    this.duck.gain.setValueAtTime(1 - 0.75 * level, time);
    this.duck.gain.linearRampToValueAtTime(1, time + STEP * 3);

    this.kicks.push({ time, level });
    if (this.kicks.length > 16) this.kicks.shift();
  }

  hat(time, level, length) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7500;
    const env = ctx.createGain();
    env.gain.setValueAtTime(level, time);
    env.gain.exponentialRampToValueAtTime(0.0001, time + length);
    src.connect(hp).connect(env).connect(this.duck);
    src.start(time, Math.random() * 1.5, length + 0.02);
  }

  clap(time, level) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1400;
    bp.Q.value = 0.9;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    [0, 0.012, 0.024].forEach((o) => {
      env.gain.setValueAtTime(level, time + o);
      env.gain.exponentialRampToValueAtTime(level * 0.3, time + o + 0.01);
    });
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
    src.connect(bp).connect(env);
    env.connect(this.masterFilter);
    env.connect(this.reverb);
    src.start(time, Math.random(), 0.3);
  }

  pluck(freq, time, level) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(4000, time);
    lp.frequency.exponentialRampToValueAtTime(400, time + 0.18);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(level, time + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
    osc.connect(lp).connect(env).connect(this.duck);
    env.connect(this.delay);
    osc.start(time);
    osc.stop(time + 0.25);
  }

  /* ---------- Hooks for the scene ---------- */

  setSection(s) {
    this.section = s;
  }

  // 0..1 envelope of the most recent kick, for syncing visuals to the beat.
  beat() {
    if (!this.enabled || !this.kicks.length) return 0;
    const now = this.ctx.currentTime;
    let last = null;
    for (const k of this.kicks) if (k.time <= now) last = k;
    if (!last) return 0;
    return Math.exp(-(now - last.time) * 7) * last.level;
  }

  // Overall loudness 0..1 from the analyser.
  level() {
    if (!this.enabled) return 0;
    this.analyser.getByteFrequencyData(this.levels);
    let sum = 0;
    for (let i = 0; i < 24; i++) sum += this.levels[i];
    return sum / (24 * 255);
  }

  // Scroll speed drives the wind rush.
  motion(amount) {
    if (!this.enabled) return;
    const v = clamp(amount);
    const now = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(v * 0.35, now, 0.08);
    this.windFilter.frequency.setTargetAtTime(350 + v * 3200, now, 0.1);
  }

  tone(freq, { type = "sine", duration = 0.6, gain = 0.12, echo = true, when = 0 } = {}) {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gain, now + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(env).connect(this.masterFilter);
    if (echo) {
      env.connect(this.delay);
      env.connect(this.reverb);
    }
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  hover() {
    this.tone(1800 + Math.random() * 400, { duration: 0.06, gain: 0.03, echo: false });
  }

  collect(step) {
    const semis = PENTATONIC[step % PENTATONIC.length];
    this.tone(660 * Math.pow(2, semis / 12), { duration: 0.9 });
    this.tone(1320 * Math.pow(2, semis / 12), { duration: 0.5, gain: 0.05 });
  }

  crack() {
    if (!this.enabled) return;
    this.tone(70, { type: "triangle", duration: 0.8, gain: 0.4, echo: false });
    this.tone(1760, { duration: 0.3, gain: 0.05 });
    this.noiseHit(0.3, 2500, 0.4);
  }

  noiseHit(level, freq, length, when = 0) {
    const ctx = this.ctx;
    const time = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(level, time);
    env.gain.exponentialRampToValueAtTime(0.0001, time + length);
    src.connect(bp).connect(env);
    env.connect(this.masterFilter);
    env.connect(this.reverb);
    src.start(time, 0, length + 0.05);
  }

  // The payoff at the contact section: riser into an impact.
  drop() {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.tone(40, { type: "sine", duration: 1.8, gain: 0.5, echo: false });
    this.noiseHit(0.5, 5000, 2.4);
    this.noiseHit(0.4, 300, 0.6);
    CHORDS[0].forEach((n, i) => this.tone(midi(n + 24), { duration: 2.2, gain: 0.05, when: i * 0.03 }));
    this.masterFilter.frequency.setValueAtTime(18000, now);
  }

  pickup(mult) {
    const semis = PENTATONIC[Math.min(mult, PENTATONIC.length - 1)];
    this.tone(880 * Math.pow(2, semis / 12), { type: "triangle", duration: 0.5, gain: 0.12 });
    this.tone(1760 * Math.pow(2, semis / 12), { duration: 0.3, gain: 0.05 });
  }

  nearMiss() {
    if (!this.enabled) return;
    this.noiseHit(0.18, 3200, 0.25);
  }

  crash() {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 1.2);
    env.gain.setValueAtTime(0.25, now);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
    osc.connect(env).connect(this.masterFilter);
    env.connect(this.reverb);
    osc.start(now);
    osc.stop(now + 1.4);
    this.noiseHit(0.6, 400, 1.2);
    this.tone(45, { duration: 1.2, gain: 0.5, echo: false });
  }

  tick() {
    this.tone(2400 + Math.random() * 600, { duration: 0.04, gain: 0.02, echo: false });
  }

  fanfare() {
    PENTATONIC.forEach((semis, i) => this.tone(440 * Math.pow(2, semis / 12), { duration: 1.2, gain: 0.1, when: i * 0.11 }));
  }
}
