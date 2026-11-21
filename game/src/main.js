// main.js — boot for Costa Fuego: builds the game, wires every menu
// button, parses the screenshot-scene query (?shot=name&seed=n) and runs
// the animation loop.

import { Game } from './game.js';
import { SHOT_NAMES } from './shots.js';

function boot() {
  const canvas = document.getElementById('game');
  const params = new URLSearchParams(window.location.search);
  const seed = params.get('seed') || 'costa-fuego';
  const game = new Game(canvas, seed);
  window.__gameReady = true;

  const on = (id, fn) => {
    const node = document.getElementById(id);
    if (node) node.addEventListener('click', fn);
  };
  on('btn-new-game', () => game.newGame());
  on('btn-continue', () => game.continueGame());
  on('btn-controls', () => game.setScreen('controls'));
  on('btn-controls-back', () => game.setScreen('title'));
  on('btn-resume', () => game.resume());
  on('btn-quit', () => game.quitToTitle());
  on('btn-save-game', () => game.save());
  on('btn-respawn', () => game.respawn());
  on('btn-restart-mission', () => { game.restartMission(); game.setScreen('play'); game.input.wantLock(true); });
  on('btn-job-ok', () => game.closeJob());
  on('btn-job-continue', () => game.closeJob());

  const preset = document.getElementById('sel-preset');
  if (preset) {
    preset.addEventListener('change', () => {
      if (preset.value !== 'CUSTOM') game.applyPreset(preset.value);
    });
  }
  const slider = (id, fn) => {
    const node = document.getElementById(id);
    if (node) node.addEventListener('input', () => fn(Number(node.value)));
  };
  slider('rng-master', (v) => game.audio.setMasterVolume(v / 100));
  slider('rng-effects', (v) => game.audio.setEffectsVolume(v / 100));
  slider('rng-engine', (v) => game.audio.setEngineVolume(v / 100));
  slider('rng-traffic', (v) => {
    game.traffic.setTrafficCount(v);
    game.settings.traffic = v;
    game.settings.preset = 'CUSTOM';
    if (preset) preset.value = 'CUSTOM';
  });
  slider('rng-crowd', (v) => game.crowd.setWalkerCount(v));

  const shot = params.get('shot');
  if (shot && SHOT_NAMES.includes(shot)) {
    game.startShot(shot);
  } else if (shot) {
    game.startShot('play');
  }

  function loop(nowMs) {
    game.frame(nowMs);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
