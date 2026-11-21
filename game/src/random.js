// random.js — deterministic seeded random streams for Costa Fuego.
// Every random decision in the game draws from one of these streams so a
// given seed always produces the same city, traffic and crowd.

function hashSeed(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class RandomStream {
  constructor(seed) {
    this.state = seed >>> 0;
    this.seed = seed >>> 0;
  }
  next() {
    // mulberry32
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(lo, hi) { return lo + this.next() * (hi - lo); }
  int(lo, hi) { return Math.floor(this.range(lo, hi + 1)); }
  pick(list) { return list[Math.floor(this.next() * list.length)]; }
  chance(p) { return this.next() < p; }
  reset() { this.state = this.seed; }
}

export function makeStreams(seed) {
  const base = typeof seed === 'string' ? hashSeed(seed) : (seed >>> 0);
  return {
    master: new RandomStream(base ^ 0x9e3779b9),
    traffic: new RandomStream(base ^ 0x85ebca6b),
    crowd: new RandomStream(base ^ 0xc2b2ae35),
    effects: new RandomStream(base ^ 0x27d4eb2f),
    engine: new RandomStream(base ^ 0x165667b1),
  };
}

// Shared stream for purely visual variation (ped gait phases, boat
// bobbing) so staged renders stay byte-identical between runs.
export const visualRng = new RandomStream(0xc05fa60);

export function streamStates(streams) {
  return {
    master: streams.master.state,
    traffic: streams.traffic.state,
    crowd: streams.crowd.state,
    effects: streams.effects.state,
    engine: streams.engine.state,
  };
}
