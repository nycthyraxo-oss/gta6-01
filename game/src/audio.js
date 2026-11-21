// audio.js — procedural WebAudio sound for Costa Fuego.
// No audio files: engine hum, police siren, shots, pickups and the radio
// stations are all synthesized. Every looping voice is registered so the
// game can silence all of them on death, pause and quit-to-title.

import { RADIO_STATIONS } from './config.js';

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.loops = new Map();
    this.radioIndex = -1;
    this.radioTimer = null;
    this.radioStep = 0;
    this.sirenOn = false;
    this.engineOn = false;
    this.masterVol = 0.8;
    this.effectsVol = 0.8;
    this.engineVol = 0.8;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.masterVol * 0.6;
    this.master.connect(this.ctx.destination);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.masterVol * 0.6;
  }

  setMasterVolume(v) {
    this.masterVol = Math.max(0, Math.min(1, v));
    if (this.master && !this.muted) this.master.gain.value = this.masterVol * 0.6;
  }

  setEffectsVolume(v) { this.effectsVol = Math.max(0, Math.min(1, v)); }
  setEngineVolume(v) { this.engineVol = Math.max(0, Math.min(1, v)); }

  volumes() {
    return { master: this.masterVol, effects: this.effectsVol, engine: this.engineVol };
  }

  loopsState() {
    return {
      positionalSiren: this.sirenOn,
      globalSiren: this.sirenOn,
      engine: this.engineOn,
    };
  }

  blip(freq, dur, type = 'square', vol = 0.15, slide = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  noise(dur, vol = 0.2, freq = 1200) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t);
  }

  shot() { this.noise(0.12, 0.35, 2600); this.blip(180, 0.08, 'square', 0.2, -120); }
  hit() { this.blip(120, 0.1, 'sawtooth', 0.18, -60); }
  pickup() { this.blip(880, 0.09, 'sine', 0.16); setTimeout(() => this.blip(1320, 0.12, 'sine', 0.16), 70); }
  cash() { this.blip(1560, 0.07, 'triangle', 0.18); setTimeout(() => this.blip(2090, 0.1, 'triangle', 0.14), 60); }
  crash() { this.noise(0.25, 0.3, 700); }
  door() { this.blip(240, 0.07, 'square', 0.12, -80); }
  horn() { this.blip(370, 0.25, 'square', 0.12); }
  fail() { this.blip(220, 0.3, 'sawtooth', 0.15, -110); }
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.16), i * 90)); }

  startLoop(name, make) {
    this.ensure();
    if (!this.ctx || this.loops.has(name)) return;
    const voice = make(this.ctx, this.master);
    if (voice) this.loops.set(name, voice);
  }

  stopLoop(name) {
    const v = this.loops.get(name);
    if (!v) return;
    try { v.stop(); } catch (_) { /* already stopped */ }
    this.loops.delete(name);
  }

  stopAllLoops() {
    for (const name of [...this.loops.keys()]) this.stopLoop(name);
    this.sirenOn = false;
    this.engineOn = false;
    this.stopRadio();
  }

  engine(on, speedNorm = 0) {
    this.engineOn = !!on;
    if (!on) { this.stopLoop('engine'); return; }
    this.startLoop('engine', (ctx, out) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 55;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 420;
      const g = ctx.createGain(); g.gain.value = 0.05;
      osc.connect(filter); filter.connect(g); g.connect(out);
      osc.start();
      return {
        setSpeed: (s) => { osc.frequency.value = 55 + s * 140; filter.frequency.value = 420 + s * 700; },
        stop: () => { try { osc.stop(); } catch (_) {} g.disconnect(); },
      };
    });
    const v = this.loops.get('engine');
    if (v && v.setSpeed) v.setSpeed(Math.min(1, Math.abs(speedNorm)));
  }

  siren(on) {
    if (!on) { this.stopLoop('siren'); this.sirenOn = false; return; }
    this.sirenOn = true;
    this.startLoop('siren', (ctx, out) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const g = ctx.createGain(); g.gain.value = 0.045;
      const lfo = ctx.createOscillator();
      lfo.type = 'square'; lfo.frequency.value = 0.7;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = 160;
      osc.frequency.value = 760;
      lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
      osc.connect(g); g.connect(out);
      osc.start(); lfo.start();
      return { stop: () => { try { osc.stop(); lfo.stop(); } catch (_) {} g.disconnect(); } };
    });
  }

  // Radio: a tiny step sequencer per station. -1 = off.
  setRadio(index) {
    this.stopRadio();
    this.radioIndex = index;
    if (index < 0 || !RADIO_STATIONS[index]) return null;
    this.ensure();
    if (!this.ctx) return RADIO_STATIONS[index];
    const st = RADIO_STATIONS[index];
    const stepMs = (60 / st.tempo) * 500;
    this.radioStep = 0;
    const root = 110;
    this.radioTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const s = this.radioStep++;
      const note = st.bass[s % st.bass.length];
      const freq = root * Math.pow(2, note / 12);
      this.blip(freq, 0.16, st.wave, 0.07);
      if (s % 2 === 0) this.blip(freq * 2, 0.1, 'sine', 0.03);
      if (s % 4 === 2) this.noise(0.04, 0.02, 6000);
    }, stepMs);
    return st;
  }

  stopRadio() {
    if (this.radioTimer) { clearInterval(this.radioTimer); this.radioTimer = null; }
    this.radioIndex = -1;
  }

  cycleRadio() {
    const next = this.radioIndex + 1 >= RADIO_STATIONS.length ? -1 : this.radioIndex + 1;
    return this.setRadio(next);
  }

  radioName() {
    if (this.radioIndex < 0) return 'RADIO OFF';
    const st = RADIO_STATIONS[this.radioIndex];
    return st.freq + ' ' + st.name;
  }
}
