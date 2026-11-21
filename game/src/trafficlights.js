// trafficlights.js — signal cycles for the six signalled junctions.
// Each junction alternates green between the avenue flow and the street
// flow with a short amber; traffic reads the phase to decide to stop.

import { JUNCTIONS } from './config.js';

const GREEN = 7;
const AMBER = 1.6;
const CYCLE = (GREEN + AMBER) * 2;

export class TrafficLights {
  constructor() {
    this.junctions = JUNCTIONS.map((j, i) => ({
      x: j.x, z: j.z,
      offset: (i * 3.7) % CYCLE,
      phase: 'avenue',
      lampA: 'green',
      lampS: 'red',
      timer: 0,
    }));
    this.time = 0;
  }

  update(dt) {
    this.time += dt;
    for (const j of this.junctions) {
      const t = (this.time + j.offset) % CYCLE;
      if (t < GREEN) { j.phase = 'avenue'; j.lampA = 'green'; j.lampS = 'red'; }
      else if (t < GREEN + AMBER) { j.phase = 'avenue-amber'; j.lampA = 'amber'; j.lampS = 'red'; }
      else if (t < GREEN * 2 + AMBER) { j.phase = 'street'; j.lampA = 'red'; j.lampS = 'green'; }
      else { j.phase = 'street-amber'; j.lampA = 'red'; j.lampS = 'amber'; }
      j.timer = t;
    }
  }

  // Is the given flow allowed through junction j right now?
  allows(j, flow) {
    if (flow === 'avenue') return j.lampA === 'green';
    return j.lampS === 'green';
  }

  nearest(x, z) {
    let best = null, bestD = 1e9;
    for (const j of this.junctions) {
      const d = (j.x - x) * (j.x - x) + (j.z - z) * (j.z - z);
      if (d < bestD) { bestD = d; best = j; }
    }
    return best;
  }

  snapshot() {
    return this.junctions.map(j => ({ x: j.x, z: j.z, phase: j.phase, lampA: j.lampA, lampS: j.lampS }));
  }
}
