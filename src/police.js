// The wanted system: heat builds from crimes, stars show it, police cars
// chase and ram, officers close in and arrest. Heat cools only when the
// player is out of sight and far away — and police that rejoin a chase always
// arrive OUTSIDE the sight range, so a chase can actually be lost.
//
// v9 iteration 3 (refined after a real playtest death — one accidental
// shot, instant ram, dead): the escalation LADDER. One shot is 1 star,
// and 1 star is NOT a death sentence. A 4-second grace window after the
// first heat means a misfire never means instant death — the police
// spawn immediately (you see them coming) but hold their reaction.
//   1★ OBSERVE    — patrol the roads, no chase, no ram, no arrest, no officers
//   2★ FOLLOW     — chase at 0.6×, hold a 12-unit standoff, no ram, no arrest, 1 officer (holds at 6)
//   3★ PURSUE     — chase 0.85×, ramming ON, roadblocks, 2 officers, arrest 2.5 s
//   4★ AGGRESSIVE — chase 1.0×, ramming ON, heli, 3 officers, arrest 2.0 s
//   5★ MAXIMUM    — chase 1.15×, ramming ON, heli, roadblocks, 3 officers, arrest 1.5 s
import { createCar, disposeCarMesh, updateTrafficCar } from './vehicles.js';
import { makePersonMesh } from './people.js';

// Per-star behaviour. chase=false means the car patrols the road grid
// like any traffic car (updateTrafficCar) instead of hunting the player.
// v9 iteration 4 (user decision 18 Nov 19:16 WIB — the OLD ladder stands,
// the brief's "PIT at 2★" is CANCELLED): 1-2 stars never ram or shoot.
// 4★ is heavy tactical (a 5th TACTICAL cruiser at 1.1× + a coordinated
// ambush roadblock pair ahead); 5★ is MAXIMUM (heli spotlight tracks).
const LADDER = {
  1: { chase: false, speed: 0, ram: false, arrest: false, officers: 0, arrestDelay: 0, turnRate: 2.2 },
  2: { chase: true, speed: 0.6, ram: false, arrest: false, officers: 1, arrestDelay: 0, standoff: 12, officerHold: 6, turnRate: 2.2 },
  3: { chase: true, speed: 0.85, ram: true, arrest: true, officers: 2, arrestDelay: 2.5, turnRate: 2.2 },
  4: { chase: true, speed: 1.0, ram: true, arrest: true, officers: 3, arrestDelay: 2.0, turnRate: 2.6, tactical: true, ambush: true },
  5: { chase: true, speed: 1.15, ram: true, arrest: true, officers: 3, arrestDelay: 1.5, turnRate: 2.6, tactical: true, ambush: true, spotlight: true },
};
//   - Search zone: when the cops last saw you, a circle is drawn on the
//     radar around that spot. Heat only cools once you leave the circle
//     (and stay out of sight) — losing the cops is a place you drive to,
//     not a timer you wait out.
//   - Roadblocks at 3 stars: two Interceptors park across the road ahead
//     of you. They are solid obstacles until the heat drops.
//   - Officers on foot: uniformed officers step out and close in when you
//     are on foot; if one reaches you, you are BUSTED.
//   - The helicopter (game.js) becomes a real system at 4 stars: it pins
//     you in its searchlight and the heat does not cool while it has eyes
//     on you (wanted.heliOverhead, set by the game).
//   - Light bars flash red/blue on every police car.
//   - The pursuer panel: the HUD can ask who is chasing you — the three
//     nearest pursuers with their distance and status — so a chase reads
//     as names coming for you, not just stars.

export function createWanted(cfg) {
  return {
    heat: 0,
    stars: 0,
    arrestTimer: 0,
    policeCars: [],
    officers: [],
    roadblocks: [],
    // v9 iteration 4: the 4-star coordinated ambush — a second roadblock
    // pair further ahead on the player's road. Kept separate from
    // roadblocks so the 3-star check (2 cars) still reads exactly 2.
    ambush: [],
    searchZone: null,
    heliActive: false,
    heliOverhead: false,
    flash: 0,
    sirenOn: false,
    // After an escape, a short cooldown during which the heat cannot rise
    // again — the player gets a clean breath before the next chase.
    cooldown: 0,
    // v9 iteration 3: seconds left of the grace window after the first
    // heat. While it runs, police hold their reaction (see updatePolice).
    graceTimer: 0,
    cfg,
  };
}

// Heat rises instantly (a crime is a crime), but never during the
// post-escape cooldown. setStars bypasses this on purpose: scripted heat
// (a mission that starts hot) is not a new crime.
export function addHeat(wanted, amount) {
  if (wanted.cooldown > 0) return;
  const before = wanted.stars;
  wanted.heat = Math.min(wanted.cfg.police.heatPerStar * 5, wanted.heat + amount);
  wanted.stars = Math.min(5, Math.floor(wanted.heat / wanted.cfg.police.heatPerStar));
  if (wanted.heat > 0 && wanted.stars === 0) wanted.stars = 1;
  // v9 iteration 3: the grace window starts when heat first appears —
  // the police spawn immediately but hold their reaction for a few
  // seconds, so one accidental shot is a warning, not a death sentence.
  if (before === 0 && wanted.stars > 0) wanted.graceTimer = wanted.cfg.police.graceSeconds;
}

export function setStars(wanted, stars) {
  wanted.stars = Math.max(0, Math.min(5, stars));
  wanted.heat = wanted.stars * wanted.cfg.police.heatPerStar;
  if (stars === 0) wanted.heat = 0;
}

function spawnPointNear(wanted, playerPos, rng) {
  // Always outside the sight range, so the player can break away.
  const angle = rng.next() * Math.PI * 2;
  const dist = rng.range(wanted.cfg.police.respawnMin, wanted.cfg.police.respawnMax);
  const x = playerPos.x + Math.cos(angle) * dist;
  const z = playerPos.z + Math.sin(angle) * dist;
  return {
    x: Math.max(-140, Math.min(140, x)),
    z: Math.max(-140, Math.min(140, z)),
  };
}

function nearestLine(lines, v) {
  let best = lines[0];
  for (const l of lines) if (Math.abs(l - v) < Math.abs(best - v)) best = l;
  return best;
}

// Two Interceptors parked across the road ahead of the player, blocking it.
// `distance` is how far ahead they sit (42 for the 3-star roadblock, 70
// for the 4-star coordinated ambush); `key` is which list they go on.
function spawnRoadblock(wanted, scene, playerPos, heading, roadLines, rng, distance = 42, key = 'roadblocks') {
  const alongZ = Math.abs(Math.cos(heading)) >= Math.abs(Math.sin(heading));
  const cars = [];
  if (alongZ) {
    const roadX = nearestLine(roadLines, playerPos.x);
    const ahead = playerPos.z + Math.cos(heading) * distance;
    const z = Math.max(-140, Math.min(140, ahead));
    for (const dx of [-2.6, 2.6]) {
      const car = createCar(scene, roadX + dx, z, Math.PI / 2, 0x1a1a22, true, 0);
      car.speed = 0;
      car.roadblock = true;
      cars.push(car);
    }
  } else {
    const roadZ = nearestLine(roadLines, playerPos.z);
    const ahead = playerPos.x + Math.sin(heading) * distance;
    const x = Math.max(-140, Math.min(140, ahead));
    for (const dz of [-2.6, 2.6]) {
      const car = createCar(scene, x, roadZ + dz, 0, 0x1a1a22, true, 0);
      car.speed = 0;
      car.roadblock = true;
      cars.push(car);
    }
  }
  wanted[key] = cars;
  return cars;
}

function clearRoadblocks(wanted, scene) {
  // Memory-leak guard (item 12): roadblock cars are Interceptors with
  // per-instance resources (light bar, livery doors, light materials) —
  // free them before the group leaves the scene.
  for (const car of wanted.roadblocks) { disposeCarMesh(car.group); scene.remove(car.group); }
  wanted.roadblocks = [];
}

function clearAmbush(wanted, scene) {
  for (const car of wanted.ambush) { disposeCarMesh(car.group); scene.remove(car.group); }
  wanted.ambush = [];
}

// Give a police car a patrol route on the road grid (1 star OBSERVE):
// the nearest road line, a seeded direction, and a slow cruise. The car
// snaps onto the lane — it spawns far outside the sight range, so the
// player never sees the snap. Returns false when there is no road data.
function assignPatrolRoute(wanted, car, rng) {
  const lines = wanted.roadLines;
  if (!lines || !lines.length) return false;
  const pos = car.group.position;
  const lx = nearestLine(lines, pos.x);
  const lz = nearestLine(lines, pos.z);
  const useVertical = Math.abs(pos.x - lx) <= Math.abs(pos.z - lz);
  const axis = useVertical ? 'z' : 'x';
  const line = useVertical ? lx : lz;
  const next = rng && rng.next ? () => rng.next() : () => 0.5;
  const dir = next() < 0.5 ? 1 : -1;
  car.route = { axis, line, dir };
  car.roadLines = lines;
  car.cruiseSpeed = wanted.cfg.police.patrolSpeed;
  car.speed = wanted.cfg.police.patrolSpeed;
  car.turnChance = 0.2 + next() * 0.25;
  car.turnDir = next() < 0.5 ? 1 : -1;
  car.turnSeed = 1 + Math.floor(next() * 100000);
  car.turnLock = 0;
  if (axis === 'z') pos.x = line;
  else pos.z = line;
  car.heading = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI;
  car.group.rotation.y = car.heading;
  return true;
}

export function ensurePolice(wanted, scene, playerPos, rng, ctx) {
  // v9 iteration 4: at 4+ stars a 5th cruiser joins (heavy tactical).
  const want = Math.min(
    wanted.stars >= wanted.cfg.police.ambushStars ? wanted.cfg.police.maxCarsTactical : wanted.cfg.police.maxCars,
    wanted.stars,
  );
  if (ctx && ctx.roadLines) wanted.roadLines = ctx.roadLines;
  while (wanted.policeCars.length < want) {
    const p = spawnPointNear(wanted, playerPos, rng);
    const heading = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
    const car = createCar(scene, p.x, p.z, heading, 0x1a1a22, true, wanted.cfg.car.policeSpeed);
    car.speed = wanted.cfg.car.policeSpeed * 0.7;
    wanted.policeCars.push(car);
  }
  while (wanted.policeCars.length > want) {
    const car = wanted.policeCars.pop();
    disposeCarMesh(car.group);
    scene.remove(car.group);
  }
  // The 4th and 5th cruisers at 4+ stars are TACTICAL units (1.1× speed).
  wanted.policeCars.forEach((c, i) => {
    c.tactical = wanted.stars >= wanted.cfg.police.ambushStars && i >= 3;
  });
  // Roadblocks at 3+ stars, only when we know the road the player is on.
  if (ctx && ctx.roadLines) {
    if (wanted.stars >= wanted.cfg.police.roadblockStars && wanted.roadblocks.length === 0) {
      spawnRoadblock(wanted, scene, playerPos, ctx.heading ?? 0, ctx.roadLines, rng, 42, 'roadblocks');
    } else if (wanted.stars < wanted.cfg.police.roadblockStars && wanted.roadblocks.length > 0) {
      clearRoadblocks(wanted, scene);
    }
    // Coordinated ambush at 4+ stars: a second pair, further ahead.
    if (wanted.stars >= wanted.cfg.police.ambushStars && wanted.ambush.length === 0) {
      spawnRoadblock(wanted, scene, playerPos, ctx.heading ?? 0, ctx.roadLines, rng, 70, 'ambush');
    } else if (wanted.stars < wanted.cfg.police.ambushStars && wanted.ambush.length > 0) {
      clearAmbush(wanted, scene);
    }
  }
  wanted.heliActive = wanted.stars >= wanted.cfg.police.heliStars;
}

// The three nearest pursuers, for the HUD panel: name, distance in metres,
// and a status word that says what they are doing right now. A cruiser
// about to hit you reads RAMMING; one far off reads SEARCHING; the heli
// reads SPOTLIGHT ON YOU when its beam is on you.
export function pursuers(wanted, playerPos) {
  const list = [];
  for (const car of wanted.policeCars) {
    const d = Math.hypot(car.group.position.x - playerPos.x, car.group.position.z - playerPos.z);
    let status;
    if (wanted.graceTimer > 0) status = 'RESPONDING';
    else if (wanted.stars === 1) status = 'PATROLLING';
    else if (wanted.stars === 2) status = d < 12 ? 'FOLLOWING' : 'CHASING';
    else status = d < 8 ? 'RAMMING' : d < 30 ? 'CHASING' : 'SEARCHING';
    list.push({
      name: car.tactical ? 'TACTICAL UNIT' : 'INTERCEPTOR',
      dist: Math.round(d),
      status,
      kind: 'car',
    });
  }
  for (const o of wanted.officers) {
    const d = Math.hypot(o.group.position.x - playerPos.x, o.group.position.z - playerPos.z);
    list.push({
      name: 'OFFICER',
      dist: Math.round(d),
      status: d < 6 ? (wanted.stars <= 2 ? 'HOLDING' : 'ARRESTING') : 'CLOSING IN',
      kind: 'officer',
    });
  }
  if (wanted.heliActive) {
    list.push({
      name: 'HELI',
      dist: 0,
      status: wanted.heliOverhead ? 'SPOTLIGHT ON YOU' : 'CIRCLING',
      kind: 'heli',
    });
  }
  list.sort((a, b) => {
    const da = a.kind === 'heli' ? 999 : a.dist;
    const db = b.kind === 'heli' ? 999 : b.dist;
    return da - db;
  });
  return list.slice(0, 3);
}

export function updatePolice(wanted, dt, scene, playerPos, playerInCar, onRam, onArrest, rng, policeCtx) {
  if (wanted.cooldown > 0) wanted.cooldown -= dt;
  const cfg = wanted.cfg;
  wanted.flash += dt;
  // Flash the light bars: red and blue alternate, twice a second.
  const phase = Math.floor(wanted.flash * 3) % 2 === 0;
  for (const car of [...wanted.policeCars, ...wanted.roadblocks, ...wanted.ambush]) {
    if (car.lightBar) {
      car.lightBar.left.color.setHex(phase ? 0xff2222 : 0x5a0f0f);
      car.lightBar.right.color.setHex(phase ? 0x1a1a66 : 0x2244ff);
    }
  }

  // The search zone: the circle on the radar around the last place the
  // cops saw you. It follows you while you are seen, and freezes when you
  // break away — heat only cools outside it.
  let nearest = Infinity;
  for (const car of wanted.policeCars) {
    const d = Math.hypot(car.group.position.x - playerPos.x, car.group.position.z - playerPos.z);
    if (d < nearest) nearest = d;
  }
  if (wanted.stars > 0) {
    const r = cfg.police.searchZoneBase + cfg.police.searchZonePerStar * wanted.stars;
    if (nearest <= cfg.police.sightRange) {
      wanted.searchZone = { x: playerPos.x, z: playerPos.z, r };
    } else if (!wanted.searchZone) {
      wanted.searchZone = { x: playerPos.x, z: playerPos.z, r };
    }
    const inZone = wanted.searchZone
      && Math.hypot(playerPos.x - wanted.searchZone.x, playerPos.z - wanted.searchZone.z) < wanted.searchZone.r;
    if (nearest > cfg.police.sightRange && !inZone && !wanted.heliOverhead) {
      wanted.heat = Math.max(0, wanted.heat - cfg.police.decayPerSecond * dt);
      const s = wanted.heat <= 0 ? 0 : Math.max(1, Math.ceil(wanted.heat / cfg.police.heatPerStar));
      wanted.stars = s;
      if (wanted.stars === 0) wanted.searchZone = null;
    }
  } else {
    wanted.searchZone = null;
  }
  wanted.sirenOn = wanted.stars > 0;
  if (wanted.stars === 0) {
    // No heat: officers stand down. People meshes are fully shared, so
    // scene.remove is the complete cleanup (item 12 audit — no dispose).
    for (const o of wanted.officers) scene.remove(o.group);
    wanted.officers = [];
    return;
  }

  // v9 iteration 3: the ladder. Grace first (hold, no engagement), then
  // 1 star patrols, 2+ stars chase at the ladder's speed and rules.
  const ladder = LADDER[wanted.stars] || LADDER[1];
  const grace = wanted.graceTimer > 0;
  if (grace) wanted.graceTimer -= dt;
  for (const car of wanted.policeCars) {
    const pos = car.group.position;
    const dx = playerPos.x - pos.x;
    const dz = playerPos.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (grace) {
      // Hold position: sirens and light bars on, but no chase, no ram,
      // no arrest. The player sees the response coming and gets a few
      // seconds to stop shooting.
      car.speed = Math.max(0, car.speed - 20 * dt);
      car.wheelSpin += car.speed * dt * 2;
      spinWheelsOf(car);
      continue;
    }
    if (!ladder.chase) {
      // 1 star OBSERVE: patrol the roads like any traffic car — cruise,
      // brake for cars and peds, turn at junctions, stop at red lights.
      if (!car.route) assignPatrolRoute(wanted, car, rng);
      if (car.route) {
        updateTrafficCar(car, dt, policeCtx ? policeCtx.cars : [car], cfg, policeCtx ? policeCtx.pedestrians : null);
        continue;
      }
      car.speed = 0;
      continue;
    }
    // 2+ stars: chase. A car coming off patrol drops its route.
    if (car.route) {
      car.route = null;
      car.cruiseSpeed = cfg.car.policeSpeed;
    }
    const targetHeading = Math.atan2(dx, dz);
    let dh = targetHeading - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    car.heading += Math.max(-ladder.turnRate * dt, Math.min(ladder.turnRate * dt, dh));
    car.group.rotation.y = car.heading;
    const base = dist > 30 ? cfg.car.policeSpeed : cfg.car.policeSpeed * 0.75;
    // TACTICAL units (4th/5th cruiser at 4+ stars) run 1.1×.
    const chaseSpeed = base * ladder.speed * (car.tactical ? 1.1 : 1);
    if (ladder.standoff && dist < ladder.standoff) {
      // 2 stars FOLLOW: hold the standoff, do not close in.
      car.speed += (0 - car.speed) * Math.min(1, dt * 1.5);
    } else {
      car.speed += (chaseSpeed - car.speed) * Math.min(1, dt * 1.5);
    }
    pos.x += Math.sin(car.heading) * car.speed * dt;
    pos.z += Math.cos(car.heading) * car.speed * dt;
    car.wheelSpin += car.speed * dt * 2;
    spinWheelsOf(car);
    if (ladder.ram && dist < 3.2) {
      onRam(car, dist);
      // Bounce the police car off so it does not stick inside the player.
      pos.x -= Math.sin(car.heading) * 2.5;
      pos.z -= Math.cos(car.heading) * 2.5;
      car.speed = 4;
    }
    // Arrest: only from 3 stars up, with the ladder's delay.
    if (ladder.arrest && !playerInCar && dist < cfg.police.arrestRange + 6) {
      wanted.arrestTimer += dt;
      if (wanted.arrestTimer > ladder.arrestDelay) {
        wanted.arrestTimer = 0;
        onArrest();
      }
    }
  }
  if (nearest > cfg.police.arrestRange + 6) wanted.arrestTimer = Math.max(0, wanted.arrestTimer - dt);

  // Officers on foot: they step out when the player is on foot and walk
  // the player down. They are the arrest — the timer above is their reach.
  // v9 iteration 3: the count and the hold distance come from the ladder
  // (1 star: none; 2 stars: one officer who holds at 6 units).
  if (!playerInCar) {
    const wantOfficers = Math.min(cfg.police.maxOfficers, ladder.officers);
    while (wanted.officers.length < wantOfficers) {
      // Seeded spawn, like the cars: the same seed puts officers in the
      // same places. (rng is the game's seeded source, passed in by game.js.)
      const p = spawnPointNear(wanted, playerPos, rng || { next: () => Math.random(), range: (a, b) => a + Math.random() * (b - a) });
      const mesh = makePersonMesh(0x1a3a5a, 0x1a1a22, 0xc89878, { height: 1.0, hair: 0x1a1a1a });
      mesh.position.set(p.x, 0, p.z);
      scene.add(mesh);
      wanted.officers.push({ group: mesh, heading: 0, speed: 3.6 });
    }
    while (wanted.officers.length > wantOfficers) {
      const o = wanted.officers.pop();
      scene.remove(o.group);
    }
    for (const o of wanted.officers) {
      const pos = o.group.position;
      const dx = playerPos.x - pos.x;
      const dz = playerPos.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.5) {
        o.heading = Math.atan2(dx, dz);
        o.group.rotation.y = o.heading;
        // 2 stars FOLLOW: the officer walks to 6 units and holds there.
        if (ladder.officerHold && dist <= ladder.officerHold) continue;
        pos.x += (dx / dist) * o.speed * dt;
        pos.z += (dz / dist) * o.speed * dt;
      }
    }
  } else {
    for (const o of wanted.officers) scene.remove(o.group);
    wanted.officers = [];
  }
}

function spinWheelsOf(car) {
  for (const w of car.wheels) {
    if (w.userData.spinner) w.userData.spinner.rotation.y = car.wheelSpin;
  }
}

export function clearPolice(wanted, scene) {
  // Memory-leak guard (item 12): free each cruiser's per-instance
  // resources before removal. Officers are people (fully shared caches),
  // so scene.remove is their complete cleanup — no dispose call.
  for (const car of wanted.policeCars) { disposeCarMesh(car.group); scene.remove(car.group); }
  wanted.policeCars = [];
  for (const o of wanted.officers) scene.remove(o.group);
  wanted.officers = [];
  clearRoadblocks(wanted, scene);
  clearAmbush(wanted, scene);
  wanted.heat = 0;
  wanted.stars = 0;
  wanted.arrestTimer = 0;
  wanted.graceTimer = 0;
  wanted.sirenOn = false;
  wanted.searchZone = null;
  wanted.heliActive = false;
  wanted.heliOverhead = false;
}
