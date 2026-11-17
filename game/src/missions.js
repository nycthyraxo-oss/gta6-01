// Missions: six jobs for Marla Quinn, in order. Each mission knows its target
// point, its timer, and what completes it; the game drives the state machine.
import { MISSION_DEFS } from './config.js';

export const MISSION_STATE = {
  IDLE: 'idle',
  ACTIVE: 'active',
  DONE: 'done',
  FAILED: 'failed',
};

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
  };
}

export function currentMission(missions) {
  if (missions.index >= missions.defs.length) return null;
  return missions.defs[missions.index];
}

export function currentTarget(missions) {
  if (missions.index >= missions.targets.length) return null;
  // Mission 2 has two stages: steal the coupe, then deliver it.
  if (missions.index === 1 && missions.stage === 1) {
    return { x: -112, z: 84, radius: 9 };
  }
  // Mission 6 has two stages: rob the bank, then reach the safehouse.
  if (missions.index === 5 && missions.stage === 1) {
    return { x: -112, z: -112, radius: 9 };
  }
  return missions.targets[missions.index];
}

export function startMission(missions, index, cfg) {
  missions.index = index;
  missions.state = MISSION_STATE.ACTIVE;
  missions.stage = 0;
  missions.timer = 0;
  const def = missions.defs[index];
  if (index === 2) missions.timer = cfg.missions.deliveryTime;
  if (index === 3) missions.timer = cfg.missions.getawayTime;
  missions.message = `${def.giver}: ${def.brief}`;
  return def;
}

export function missionObjectiveText(missions) {
  const def = currentMission(missions);
  if (!def) return 'All jobs done — Costa Fuego is yours.';
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

  // Mission 2, stage 0: the player must be IN the orange coupe at the marina.
  if (missions.index === 1 && missions.stage === 0) {
    if (inTargetCar) {
      missions.stage = 1;
      missions.message = 'Got it. Now bring the coupe to the garage.';
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
  missions.message = 'Job failed. Press R to try again.';
}
