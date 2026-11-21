// missions.js — story missions, street races and delivery jobs.
// The story follows Marla, who runs the garage on the west side, and the
// player's climb from new kid to Costa legend. Races and deliveries are
// repeatable side jobs unlocked by reputation.

import { RACES, DELIVERIES, LANDMARKS } from './config.js';

const lm = (id) => LANDMARKS.find(l => l.id === id);

export const STORY = [
  {
    id: 'meet-marla', chapter: 'CH.1 · HOMECOMING', name: 'Meet Marla',
    objective: "Walk to Marla's Garage and meet Marla",
    target: { x: -112, z: 112 }, radius: 10, reward: 300, rep: 5,
    dialogue: [
      { who: 'MARLA QUINN', line: "You must be the new kid. I'm Marla Quinn — this garage keeps Costa moving, and I could use a driver who doesn't ask questions." },
      { who: 'MARLA QUINN', line: 'First job is simple: get wheels, get known. Come back when you have a car of your own. Take this for the road.' },
    ],
  },
  {
    id: 'first-wheels', chapter: 'CH.1 · HOMECOMING', name: 'Hot Wheels',
    objective: 'Steal the coupe and drive it to Fuego Bank',
    target: { x: 56, z: -56 }, radius: 8, reward: 350, rep: 8, needCar: true,
    dialogue: [
      { who: 'MARLA QUINN', line: 'Nice ride. The bank on Jasmine Ave owes me a favour — park out front so they remember it. Good work.' },
    ],
  },
  {
    id: 'reef-trouble', chapter: 'CH.2 · REEF TROUBLE', name: 'Reef Trouble',
    objective: 'Head to Neon Plaza and deal with the Reef Kings',
    target: { x: 56, z: 0 }, radius: 10, reward: 500, rep: 12,
    dialogue: [
      { who: 'MARLA QUINN', line: 'The Reef Kings are squeezing my drivers at Neon Plaza. Show them Costa has a new name on the street.' },
      { who: 'MARLA QUINN', line: "That's the spirit. They'll think twice before taxing my garage again." },
    ],
  },
  {
    id: 'harbor-run', chapter: 'CH.2 · REEF TROUBLE', name: 'Harbor Run',
    objective: 'Pick up the package at East Docks and bring it to the Safehouse',
    target: { x: -112, z: -112 }, radius: 8, reward: 600, rep: 15, needCar: true,
    dialogue: [
      { who: 'MARLA QUINN', line: 'A crate came in at East Docks with no paperwork. Bring it to the Safehouse, quiet and quick.' },
    ],
  },
  {
    id: 'island-business', chapter: 'CH.3 · ISLAND BUSINESS', name: 'Island Business',
    objective: 'Drive through the Island Gate to Fuego Island',
    target: { x: 247, z: 100 }, radius: 14, reward: 800, rep: 20, needCar: true,
    dialogue: [
      { who: 'MARLA QUINN', line: 'Fuego Island is where the real money sleeps. Cross the causeway and make yourself known at the villa.' },
    ],
  },
  {
    id: 'king-of-streets', chapter: 'CH.3 · ISLAND BUSINESS', name: 'King of the Streets',
    objective: 'Return to the Fuego Tower and claim the city',
    target: { x: 0, z: 0 }, radius: 12, reward: 1200, rep: 30,
    dialogue: [
      { who: 'MARLA QUINN', line: 'From new kid to king of these streets. Costa Fuego is yours now — try not to burn it down.' },
    ],
  },
];

export class MissionRunner {
  constructor() {
    this.storyIndex = 0;
    this.storyDone = false;
    this.active = null; // {type:'race'|'delivery', def, step, timer}
    this.completed = [];
    this.questLog = [];
    this.lastDialogue = null;
    this.raceWins = [false, false, false];
    this.deliveriesDone = [false, false, false];
  }

  get index() { return this.storyIndex; }
  get state() { return this.storyDone ? 'done' : 'active'; }

  currentStory() {
    return this.storyDone ? null : STORY[this.storyIndex];
  }

  // Returns 'complete' when the player reaches the current story target.
  checkStory(player, inCar) {
    const m = this.currentStory();
    if (!m) return null;
    const d = Math.hypot(player.x - m.target.x, player.z - m.target.z);
    if (d <= m.radius && (!m.needCar || inCar)) {
      this.completed.push(m.id);
      this.lastDialogue = m.dialogue;
      for (const line of m.dialogue) this.questLog.push(line.who + ': ' + line.line);
      this.storyIndex++;
      if (this.storyIndex >= STORY.length) this.storyDone = true;
      return m;
    }
    return null;
  }

  availableRaces(rep) { return RACES.filter(r => rep >= r.repNeed); }
  availableDeliveries(rep) { return DELIVERIES.filter(d => rep >= d.repNeed); }

  startRace(def) {
    this.active = { type: 'race', def, step: 0, timer: def.time, started: false };
    return this.active;
  }

  startDelivery(def) {
    // the E press at the pickup IS the pickup: head straight for the drop
    this.active = { type: 'delivery', def, step: 1, timer: def.time, started: true };
    return this.active;
  }

  activeTarget() {
    if (!this.active) return null;
    const a = this.active;
    if (a.type === 'race') {
      if (!a.started) return a.def.start;
      return a.def.points[a.step] || null;
    }
    return a.step === 0 ? a.def.pickup : a.def.drop;
  }

  // Advance the active side job. Returns 'checkpoint' | 'done' | 'failed' | null.
  updateActive(dt, player) {
    if (!this.active) return null;
    const a = this.active;
    const target = this.activeTarget();
    if (a.started) {
      a.timer -= dt;
      if (a.timer <= 0) { this.active = null; return 'failed'; }
    }
    if (!target) return null;
    const d = Math.hypot(player.x - target.x, player.z - target.z);
    const reach = a.type === 'delivery' ? 12 : 7;
    if (d <= reach) {
      if (!a.started) { a.started = true; return 'checkpoint'; }
      if (a.type === 'race') {
        a.step++;
        if (a.step >= a.def.points.length) {
          this.lastDone = { type: 'race', def: a.def };
          const idx = RACES.indexOf(a.def);
          if (idx >= 0) this.raceWins[idx] = true;
          this.active = null; return 'done';
        }
        return 'checkpoint';
      }
      if (a.step === 0) { a.step = 1; return 'checkpoint'; }
      this.lastDone = { type: 'delivery', def: a.def };
      const didx = DELIVERIES.indexOf(a.def);
      if (didx >= 0) this.deliveriesDone[didx] = true;
      this.active = null;
      return 'done';
    }
    return null;
  }

  cancelActive() { this.active = null; }

  objectiveText() {
    if (this.active) {
      const a = this.active;
      if (a.type === 'race') return a.started ? 'Race: hit the next checkpoint' : 'Race: reach the start line';
      return a.step === 0 ? 'Delivery: pick up the package' : 'Delivery: drop it off';
    }
    const m = this.currentStory();
    return m ? m.objective : 'Free roam — races, deliveries and mayhem await';
  }

  chapterText() {
    const m = this.currentStory();
    return m ? m.chapter : 'COSTA LEGEND · FREE ROAM';
  }

  nextChapterText() {
    const current = this.currentStory();
    if (!current) return 'STORY COMPLETE';
    for (let i = this.storyIndex + 1; i < STORY.length; i++) {
      if (STORY[i].chapter !== current.chapter) {
        return 'NEXT: ' + STORY[i].chapter + ' · ' + STORY[i].name;
      }
    }
    return 'NEXT: ' + current.chapter + ' FINALE';
  }

  raceState() {
    if (!this.active || this.active.type !== 'race' || !this.active.started) return null;
    return { cp: this.active.step + 1, timeLeft: this.active.timer };
  }

  deliveryState() {
    const a = this.active && this.active.type === 'delivery' ? this.active : null;
    return {
      active: a ? { idx: DELIVERIES.indexOf(a.def), timeLeft: a.timer } : null,
      done: [...this.deliveriesDone],
    };
  }

  targetPos() {
    const t = this.activeTarget();
    if (t) return t;
    const m = this.currentStory();
    return m ? m.target : null;
  }
}

export { lm as landmarkById };
