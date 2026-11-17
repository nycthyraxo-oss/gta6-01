// Boot: start the title screen and the one render loop, or stage a screenshot
// scene instead. ?seed=N fixes the city; ?shot=chase|street|mission|dusk
// (with &seed=N) stages that scene, paints it and sets window.__shotReady.
import { createGame } from './game.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261117;

const canvas = document.getElementById('game');
const game = createGame(canvas, seed);
window.__game = game;

if (shot) {
  game.stageShot(shot);
} else {
  game.run();
}
