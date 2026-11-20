// Synthesized sound: every effect is built with the Web Audio API at run time,
// so the game ships no audio files and makes no network request.
//
// v6: the radio is real. Three synthesized stations (Costa FM, Neon Night,
// Playa Dub) with their own note sets and tempos — Q cycles them, and the
// HUD speedo shows the station actually playing. Picking up a hidden
// package gets its own little chime.
//
// v9 iteration 4: spatial audio. The police siren is a THREE.PositionalAudio
// that rides on the nearest cruiser (it gets louder as the cops close in),
// NPC gunfire and explosions are one-shot positional bursts at their real
// positions, and the engine synth follows speed + Shift boost. The radio
// gains 102.4 REEF BEATS (hip-hop/drill, slow low steps) and a RADIO OFF
// state — Q cycles five states, with a static tuning blip on every switch
// — and the music ducks to 35% while Marla is talking (dialogue ducking).
import * as THREE from 'three';
import { RADIO_STATIONS } from './config.js';

export function createAudio(camera, scene) {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  // v9 iteration 5 (§5): volume sliders — master (the whole mix),
  // music (radio notes), effects (gunfire, crashes, siren, pickups),
  // engine (the driving synth). Each is a 0–1 multiplier set from the
  // pause screen; master also scales the master gain (base 0.5).
  let volumes = { master: 1, music: 1, effects: 1, engine: 1 };
  let musicTimer = 0;
  let musicStep = 0;
  let station = 0;
  let radioOff = false;
  let ducking = false;
  // Positional audio (v9 iteration 4): one listener on the camera, one
  // looping siren that follows the nearest police car, and a pool of
  // three one-shot positional sources for NPC gunfire / explosions.
  let listener = null;
  let sirenPos = null;
  let sirenAnchor = null;
  let sirenBuf = null;
  let shotBuf = null;
  let blastBuf = null;
  const oneShots = [];
  let oneShotNext = 0;
  let positionalCount = 0;

  function stationDef() {
    return RADIO_STATIONS[station % RADIO_STATIONS.length];
  }

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5 * volumes.master;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      return false;
    }
    return true;
  }

  // Synthesized buffers, built once: a 2.5 s siren sweep loop, a 0.14 s
  // gunshot crack and a 0.7 s explosion rumble. Pure math, no assets.
  function buildBuffers() {
    if (sirenBuf) return;
    const sr = ctx.sampleRate;
    const sl = Math.floor(sr * 2.5);
    sirenBuf = ctx.createBuffer(1, sl, sr);
    const sd = sirenBuf.getChannelData(0);
    for (let i = 0; i < sl; i += 1) {
      const t = i / sr;
      const f = 650 + 250 * Math.sin(t * 5);
      sd[i] = Math.sin(2 * Math.PI * f * t) * 0.5;
    }
    const hl = Math.floor(sr * 0.14);
    shotBuf = ctx.createBuffer(1, hl, sr);
    const hd = shotBuf.getChannelData(0);
    for (let i = 0; i < hl; i += 1) hd[i] = (Math.random() * 2 - 1) * (1 - i / hl);
    const bl = Math.floor(sr * 0.7);
    blastBuf = ctx.createBuffer(1, bl, sr);
    const bd = blastBuf.getChannelData(0);
    for (let i = 0; i < bl; i += 1) bd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bl, 2);
  }

  function ensurePositional() {
    if (listener) return true;
    if (!ensure() || !camera || !scene) return false;
    try {
      listener = new THREE.AudioListener();
      camera.add(listener);
      sirenAnchor = new THREE.Object3D();
      scene.add(sirenAnchor);
      sirenPos = new THREE.PositionalAudio(listener);
      buildBuffers();
      sirenPos.setBuffer(sirenBuf);
      sirenPos.setLoop(true);
      sirenPos.setRefDistance(12);
      sirenPos.setMaxDistance(120);
      sirenPos.setRolloffFactor(1.2);
      sirenAnchor.add(sirenPos);
      positionalCount += 1;
      for (let i = 0; i < 3; i += 1) {
        const anchor = new THREE.Object3D();
        scene.add(anchor);
        const src = new THREE.PositionalAudio(listener);
        src.setRefDistance(8);
        src.setMaxDistance(90);
        src.setRolloffFactor(1.4);
        anchor.add(src);
        oneShots.push({ anchor, src });
        positionalCount += 1;
      }
    } catch {
      listener = null;
      return false;
    }
    return true;
  }

  function blip(freq, dur, type, vol, slideTo, duck) {
    if (!ensure() || muted) return;
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      const osc = ctx.createOscillator();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(Math.max(20, freq), ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
      const g = ctx.createGain();
      // Music notes pass duck=true; everything else through blip is an
      // effect (gunfire, pickups, clicks, the tuning blip).
      g.gain.setValueAtTime((vol || 0.2) * (duck ? volumes.music : volumes.effects) * (duck && ducking ? 0.35 : 1), ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(g);
      g.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    } catch {
      // Audio is decoration; a failure never stops the game.
    }
  }

  function noiseBurst(dur, vol) {
    if (!ensure() || muted) return;
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = (vol || 0.3) * volumes.effects;
      src.connect(g);
      g.connect(master);
      src.start();
    } catch {
      // Audio is decoration; a failure never stops the game.
    }
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') void ctx.resume();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5 * volumes.master;
      return muted;
    },
    isMuted() {
      return muted;
    },
    // Pause-screen volume sliders (v9 iteration 5, §5): each value is a
    // 0–1 multiplier. Safe to call before the audio context exists —
    // the multipliers are stored and applied when it is built.
    setVolumes(v) {
      volumes = { ...volumes, ...v };
      if (master && ctx) {
        try {
          master.gain.setTargetAtTime(muted ? 0 : 0.5 * volumes.master, ctx.currentTime, 0.05);
        } catch {
          // Audio is decoration; a failure never stops the game.
        }
      }
    },
    volumes() {
      return { ...volumes };
    },
    gunshot() {
      noiseBurst(0.14, 0.5);
      blip(160, 0.1, 'square', 0.25, 60);
    },
    crash() {
      noiseBurst(0.3, 0.45);
    },
    pickup() {
      blip(660, 0.12, 'sine', 0.25, 990);
    },
    packageFound() {
      blip(784, 0.1, 'sine', 0.25);
      setTimeout(() => blip(1046, 0.18, 'sine', 0.25), 90);
    },
    missionDone() {
      blip(523, 0.14, 'sine', 0.3);
      setTimeout(() => blip(659, 0.14, 'sine', 0.3), 130);
      setTimeout(() => blip(784, 0.22, 'sine', 0.3), 260);
    },
    fail() {
      blip(220, 0.3, 'sawtooth', 0.25, 110);
    },
    click() {
      blip(880, 0.05, 'sine', 0.15);
    },
    // Engine synth (v9 iteration 4): pitch follows speed, and Shift boost
    // adds 45 Hz plus a little more gain — the engine strains audibly.
    setEngine(speed01, driving, boost) {
      if (!ctx || !engineOsc || !engineGain) return;
      const f = 55 + 140 * Math.max(0, Math.min(1, speed01)) + (boost ? 45 : 0);
      const safeF = Number.isFinite(f) ? f : 55;
      try {
        engineOsc.frequency.setTargetAtTime(safeF, ctx.currentTime, 0.05);
        engineGain.gain.setTargetAtTime(
          driving && !muted ? (0.05 + 0.05 * speed01 + (boost ? 0.02 : 0)) * volumes.engine : 0,
          ctx.currentTime, 0.1,
        );
      } catch {
        // Guarded: a bad audio parameter must never kill the frame loop.
      }
    },
    setSiren(on, time) {
      if (!ctx || !sirenOsc || !sirenGain) return;
      try {
        const f = 650 + 250 * Math.sin(time * 5);
        sirenOsc.frequency.setTargetAtTime(Number.isFinite(f) ? f : 650, ctx.currentTime, 0.05);
        sirenGain.gain.setTargetAtTime(on && !muted ? 0.035 * volumes.effects : 0, ctx.currentTime, 0.2);
      } catch {
        // Guarded: a bad audio parameter must never kill the frame loop.
      }
    },
    // Positional siren (v9 iteration 4): the loop rides on the nearest
    // cruiser, so it swells as the cops close in and fades as you lose
    // them. Returns false when positional audio is unavailable — the
    // caller falls back to the global setSiren above.
    setSirenPositional(on, x, y, z) {
      if (!ensurePositional()) return false;
      try {
        if (ctx.state === 'suspended') void ctx.resume();
        sirenAnchor.position.set(x, y, z);
        if (on && !muted) {
          if (!sirenPos.isPlaying) sirenPos.play();
          sirenPos.setVolume(0.6 * volumes.effects);
        } else if (sirenPos.isPlaying) {
          sirenPos.pause();
        }
      } catch {
        return false;
      }
      return true;
    },
    // v9 iteration 7 (§2, defect C + audio-lifecycle gate): silence
    // every continuous loop at once — both siren paths and the engine.
    // The per-frame siren/engine update only runs on SCREEN_PLAY, so a
    // loop left running when the screen leaves PLAY would play forever
    // over the death / pause / job / shop / map / title screen. Every
    // handler that leaves gameplay calls this; callers that END the
    // chase (death, quit) also clear wanted.sirenOn themselves, while
    // pause / job / shop / map leave the flag alone so the siren
    // restarts when play resumes.
    stopLoops() {
      this.setSiren(false, 0);
      this.setSirenPositional(false, 0, 0, 0);
      this.setEngine(0, false, false);
    },
    // v9 iteration 7 (§2): is either siren loop sounding right now?
    // The probe/play-test assert this is false after every exit path.
    // Positional isPlaying flips the moment pause() runs; the global
    // gain ramps down on a 0.2 s time constant, so a small threshold
    // (not exact zero) is the honest read right after the stop.
    isSirenOn() {
      const posOn = !!(sirenPos && sirenPos.isPlaying);
      const globOn = !!(sirenGain && sirenGain.gain.value > 0.005);
      return posOn || globOn;
    },
    // v9 iteration 7 (§3, state contract): the state of EVERY looping
    // sound, per loop, so the play-test can assert no loop survives
    // death. The oscillators themselves are started once and never
    // stopped — the gain / pause is the on/off, so "on" means actually
    // sounding (positional: isPlaying; global siren + engine: gain
    // above the ramp-down threshold). The radio is NOT a loop — its
    // notes are one-shots scheduled per frame, so it decays on its own
    // the moment step() stops and needs no entry here.
    loops() {
      return {
        positionalSiren: !!(sirenPos && sirenPos.isPlaying),
        globalSiren: !!(sirenGain && sirenGain.gain.value > 0.005),
        engine: !!(engineGain && engineGain.gain.value > 0.005),
      };
    },
    // One-shot positional burst at a real position: NPC gunfire ('shot')
    // or an explosion ('blast'). Round-robins a pool of three sources.
    positionalShot(x, y, z, kind) {
      if (!ensurePositional()) return false;
      try {
        if (ctx.state === 'suspended') void ctx.resume();
        const slot = oneShots[oneShotNext];
        oneShotNext = (oneShotNext + 1) % oneShots.length;
        if (slot.src.isPlaying) slot.src.stop();
        slot.src.setBuffer(kind === 'blast' ? blastBuf : shotBuf);
        slot.src.setVolume((kind === 'blast' ? 0.9 : 0.7) * volumes.effects);
        slot.anchor.position.set(x, y, z);
        slot.src.play();
      } catch {
        return false;
      }
      return true;
    },
    positionalCount() {
      return positionalCount;
    },
    // Dialogue ducking (v9 iteration 4): while Marla is talking, the
    // radio drops to 35% so the line is readable.
    setDucking(v) {
      ducking = !!v;
    },
    isDucking() {
      return ducking;
    },
    music(dt) {
      if (!ctx || muted || radioOff) return;
      musicTimer -= dt;
      if (musicTimer > 0) return;
      const def = stationDef();
      musicTimer = def.step;
      const n = def.notes[musicStep % def.notes.length];
      musicStep += 1;
      blip(n, 0.4, 'triangle', 0.06, undefined, true);
      if (musicStep % 4 === 0) blip(n / 2, 0.5, 'sine', 0.08, undefined, true);
    },
    nextStation() {
      // Five states: the four stations, then RADIO OFF, then back.
      station = (station + 1) % (RADIO_STATIONS.length + 1);
      radioOff = station === RADIO_STATIONS.length;
      musicStep = 0;
      musicTimer = 0;
      // Static tuning blip on every switch.
      noiseBurst(0.18, 0.2);
      blip(1200, 0.08, 'square', 0.12, 300);
      return this.stationName();
    },
    stationName() {
      return radioOff ? 'RADIO OFF' : stationDef().name;
    },
    isRadioOff() {
      return radioOff;
    },
  };
}
