// Traffic lights: one city-wide cycle, so every junction changes together
// and the player can read the rhythm. The cycle is driven by game time
// (fixed steps), never by the wall clock, so a staged screenshot always
// sees the same lights.
//
// v9 iteration 3: the traffic AI reads the lights (see vehicles.js) —
// red means stop at the stop line, yellow means stop if there is room.
//
// Phase (seconds into the cycle): NS green, then NS yellow, then EW green,
// then EW yellow, then it repeats.
import { CONFIG } from './config.js';

const L = CONFIG.lights;
const CYCLE = (L.greenSeconds + L.yellowSeconds) * 2;

let clock = 0;

export function updateLights(dt) {
  clock += dt;
}

export function resetLights() {
  clock = 0;
}

// 'green' | 'yellow' | 'red' for traffic travelling along an axis:
// 'x' cars move east-west, 'z' cars move north-south.
export function lightFor(axis) {
  const t = clock % CYCLE;
  const nsGreen = t < L.greenSeconds;
  const nsYellow = t >= L.greenSeconds && t < L.greenSeconds + L.yellowSeconds;
  const ewGreen = t >= L.greenSeconds + L.yellowSeconds
    && t < L.greenSeconds + L.yellowSeconds + L.greenSeconds;
  if (axis === 'z') {
    if (nsGreen) return 'green';
    if (nsYellow) return 'yellow';
    return 'red';
  }
  if (ewGreen) return 'green';
  if (nsGreen || nsYellow) return 'red';
  return 'yellow';
}

export function lightPhase() {
  return lightFor('z');
}
