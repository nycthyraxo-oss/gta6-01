// Synthesized sound: every effect is built with the Web Audio API at run time,
// so the game ships no audio files and makes no network request.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let musicTimer = 0;
  let musicStep = 0;

  const NOTES = [220, 261.63, 329.63, 392, 329.63, 261.63, 196, 246.94];

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
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

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      const osc = ctx.createOscillator();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(Math.max(20, freq), ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
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
      g.gain.value = vol || 0.3;
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
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
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
    setEngine(speed01, driving) {
      if (!ctx || !engineOsc || !engineGain) return;
      const f = 55 + 140 * Math.max(0, Math.min(1, speed01));
      const safeF = Number.isFinite(f) ? f : 55;
      try {
        engineOsc.frequency.setTargetAtTime(safeF, ctx.currentTime, 0.05);
        engineGain.gain.setTargetAtTime(driving && !muted ? 0.05 + 0.05 * speed01 : 0, ctx.currentTime, 0.1);
      } catch {
        // Guarded: a bad audio parameter must never kill the frame loop.
      }
    },
    setSiren(on, time) {
      if (!ctx || !sirenOsc || !sirenGain) return;
      try {
        const f = 650 + 250 * Math.sin(time * 5);
        sirenOsc.frequency.setTargetAtTime(Number.isFinite(f) ? f : 650, ctx.currentTime, 0.05);
        sirenGain.gain.setTargetAtTime(on && !muted ? 0.035 : 0, ctx.currentTime, 0.2);
      } catch {
        // Guarded: a bad audio parameter must never kill the frame loop.
      }
    },
    music(dt) {
      if (!ctx || muted) return;
      musicTimer -= dt;
      if (musicTimer > 0) return;
      musicTimer = 0.42;
      const n = NOTES[musicStep % NOTES.length];
      musicStep += 1;
      blip(n, 0.4, 'triangle', 0.06);
      if (musicStep % 4 === 0) blip(n / 2, 0.5, 'sine', 0.08);
    },
  };
}
