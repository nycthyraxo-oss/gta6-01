// Missions: six jobs for Marla Quinn, in order. Each mission knows its target
// point, its timer, and what completes it; the game drives the state machine.
//
// v6: missions are a conversation, not a briefing. Each job opens with a
// short dialogue (Marla and Rico trade lines in the dialogue bar), stage
// changes get their own line, and completing a job shows its closing line —
// so the story is told while you play, not in a paragraph on the title
// screen. Stage counts (STAGE n/m) and per-mission elapsed time feed the
// HUD banner and the JOB COMPLETE screen.
import { MISSION_DEFS } from './config.js';

export const MISSION_STATE = {
  IDLE: 'idle',
  ACTIVE: 'active',
  DONE: 'done',
  FAILED: 'failed',
};

// One dialogue line shows for this long before the next one rolls in.
export const DIALOGUE_LINE_SECONDS = 4.5;

export function createMissions(landmarks) {
  const targets = [
    { x: landmarks.garage.x, z: landmarks.garage.z, radius: 9 },
    { x: landmarks.marina.x, z: landmarks.marina.z, radius: 8 },
    { x: landmarks.docks.x, z: landmarks.docks.z, radius: 10 },
    { x: landmarks.garage.x, z: landmarks.garage.z, radius: 9 },
    { x: landmarks.docks.x, z: landmarks.docks.z, radius: 14 },
    { x: landmarks.bank.x, z: landmarks.bank.z, radius: 9 },
  ];
  return {
    index: 0,
    state: MISSION_STATE.IDLE,
    timer: 0,
    stage: 0,
    defs: MISSION_DEFS,
    targets,
    enemiesLeft: 0,
    message: '',
    dialogueQueue: [],
    currentLine: null,
    dialogueTimer: 0,
    elapsed: 0,
    maxStars: 0,
  };
}

export function currentMission(missions) {
  if (missions.index >= missions.defs.length) return null;
  return missions.defs[missions.index];
}

export function currentTarget(missions) {
  if (missions.index >= missions.targets.length) return null;
  // Mission 2 has two stages: steal the coupe, then deliver it.
  // v9 iteration 7: the garage target is the landmark (it moved to
  // (-112,112)) — never a hardcoded point, or the next garage move
  // strands the delivery again.
  if (missions.index === 1 && missions.stage === 1) {
    return missions.targets[3];
  }
  // Mission 6 has two stages: rob the bank, then reach the safehouse.
  if (missions.index === 5 && missions.stage === 1) {
    return { x: -112, z: -112, radius: 9 };
  }
  return missions.targets[missions.index];
}

// "STAGE 1/2" for the HUD banner; single-stage jobs show "STAGE 1/1".
export function stageLabel(missions) {
  const def = currentMission(missions);
  if (!def) return '';
  const total = def.stages || 1;
  return `STAGE ${Math.min(missions.stage + 1, total)}/${total}`;
}

// Next job up, for the HUD banner's "NEXT" line — what the player does
// after this one, so the story always has a forward direction.
export function nextMissionTitle(missions) {
  const next = missions.defs[missions.index + 1];
  return next ? `CH.${next.id} ${next.title.toUpperCase()}` : '';
}

// Progress through the current job, 0–1, for the HUD stage bar: enemies
// down for Payback, time left for the timed jobs, distance closed for the
// rest. A bar that moves is worth more than a bar that sits still.
export function missionProgress(missions, playerPos) {
  const def = currentMission(missions);
  if (!def || missions.state !== 'active') return 0;
  if (missions.index === 4) {
    return 1 - missions.enemiesLeft / 4;
  }
  if (missions.timer > 0) {
    const total = missions.timerTotal || 1;
    return 1 - missions.timer / total;
  }
  const target = currentTarget(missions);
  if (!target || !playerPos) return 0;
  const start = missions.startDist || 1;
  const d = Math.hypot(target.x - playerPos.x, target.z - playerPos.z);
  return Math.max(0, Math.min(1, 1 - d / start));
}

export function queueDialogue(missions, lines) {
  if (!lines || lines.length === 0) return;
  missions.dialogueQueue = [...lines];
  missions.currentLine = missions.dialogueQueue.shift();
  missions.dialogueTimer = DIALOGUE_LINE_SECONDS;
}

export function sayLine(missions, who, text) {
  missions.dialogueQueue.push({ who, text });
  if (!missions.currentLine) {
    missions.currentLine = missions.dialogueQueue.shift();
    missions.dialogueTimer = DIALOGUE_LINE_SECONDS;
  }
}

// Roll the dialogue forward; call once per physics step.
export function advanceDialogue(missions, dt) {
  if (!missions.currentLine) return;
  missions.dialogueTimer -= dt;
  if (missions.dialogueTimer > 0) return;
  missions.currentLine = missions.dialogueQueue.length > 0 ? missions.dialogueQueue.shift() : null;
  missions.dialogueTimer = DIALOGUE_LINE_SECONDS;
}

export function startMission(missions, index, cfg) {
  missions.index = index;
  missions.state = MISSION_STATE.ACTIVE;
  missions.stage = 0;
  missions.timer = 0;
  missions.elapsed = 0;
  missions.maxStars = 0;
  const def = missions.defs[index];
  if (index === 2) missions.timer = cfg.missions.deliveryTime;
  if (index === 3) missions.timer = cfg.missions.getawayTime;
  missions.timerTotal = missions.timer;
  missions.message = `${def.giver}: ${def.brief}`;
  queueDialogue(missions, def.dialogue);
  return def;
}

export function missionObjectiveText(missions) {
  const def = currentMission(missions);
  if (!def) return 'All jobs done — Costa Fuego is yours.';
  // v9 iteration 4: the REP gate. Mission 6 (The Big Score) needs REP
  // 30 — while the gate holds, the objective says so instead of the
  // bank robbery brief.
  if (missions.repGate) return 'The Big Score needs REP 30 — run street races and stunts to earn it';
  if (missions.index === 1 && missions.stage === 1) return 'Deliver the orange coupe to the garage';
  if (missions.index === 5 && missions.stage === 1) return 'Escape to the safehouse';
  if (missions.index === 4) return `Take down the Reef Kings (${missions.enemiesLeft} left)`;
  return def.objective;
}

// Advance the mission clock and report what happened this frame.
// Returns 'complete' | 'fail' | 'stage' | null.
export function updateMission(missions, dt, playerPos, playerInCar, inTargetCar, enemiesLeft) {
  if (missions.state !== MISSION_STATE.ACTIVE) return null;
  const def = currentMission(missions);
  if (!def) return null;
  missions.elapsed += dt;
  if (missions.timer > 0) {
    missions.timer -= dt;
    if (missions.timer <= 0) {
      missions.state = MISSION_STATE.FAILED;
      missions.message = 'Too slow — the job fell through. Press R to try again.';
      return 'fail';
    }
  }
  const target = currentTarget(missions);
  const dx = playerPos.x - target.x;
  const dz = playerPos.z - target.z;
  const dist = Math.hypot(dx, dz);
  if (missions.startDist === undefined) missions.startDist = Math.max(1, dist);
  if (missions.stage === 0) missions.startDist = Math.max(missions.startDist, dist);

  // Mission 2, stage 0: the player must be IN the orange coupe at the marina.
  if (missions.index === 1 && missions.stage === 0) {
    if (inTargetCar) {
      missions.stage = 1;
      missions.message = 'Got it. Now bring the coupe to the garage.';
      sayLine(missions, 'Marla Quinn', def.stageLine.replace(/^Marla Quinn: /, ''));
      missions.startDist = undefined;
      return 'stage';
    }
    return null;
  }
  // Mission 5: all four enemies must be down.
  if (missions.index === 4) {
    missions.enemiesLeft = enemiesLeft;
    if (enemiesLeft <= 0) {
      missions.state = MISSION_STATE.DONE;
      return 'complete';
    }
    return null;
  }
  // Mission 6, stage 0: reach the bank and hold still a moment (the robbery).
  if (missions.index === 5 && missions.stage === 0) {
    if (dist < target.radius) {
      missions.stage = 1;
      missions.message = 'The vault is open — grab the cash and run to the safehouse!';
      sayLine(missions, 'Marla Quinn', def.stageLine.replace(/^Marla Quinn: /, ''));
      missions.startDist = undefined;
      return 'stage';
    }
    return null;
  }
  if (dist < target.radius) {
    missions.state = MISSION_STATE.DONE;
    return 'complete';
  }
  return null;
}

export function completeMission(missions) {
  const def = currentMission(missions);
  missions.index += 1;
  missions.state = MISSION_STATE.IDLE;
  missions.stage = 0;
  missions.timer = 0;
  missions.startDist = undefined;
  if (missions.index < missions.defs.length) {
    missions.message = `Job done — $${def.reward} paid. Next: ${missions.defs[missions.index].title}.`;
  } else {
    missions.message = 'The Big Score is done. Costa Fuego is yours, Rico.';
  }
  return def ? def.reward : 0;
}

export function failMission(missions) {
  missions.state = MISSION_STATE.IDLE;
  missions.stage = 0;
  missions.timer = 0;
  missions.startDist = undefined;
  missions.message = 'Job failed. Press R to try again.';
}
