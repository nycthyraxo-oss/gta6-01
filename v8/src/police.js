// The wanted system: heat builds from crimes, stars show it, police cars
// chase and ram, officers close in and arrest. Heat cools only when the
// player is out of sight and far away — and police that rejoin a chase always
// arrive OUTSIDE the sight range, so a chase can actually be lost.
//
// v6: a real pursuit system, not just a chase.
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
import { createCar } from './vehicles.js';
import { makePersonMesh } from './people.js';

export function createWanted(cfg) {
  return {
    heat: 0,
    stars: 0,
    arrestTimer: 0,
    policeCars: [],
    officers: [],
    roadblocks: [],
    searchZone: null,
    heliActive: false,
    heliOverhead: false,
    flash: 0,
    sirenOn: false,
    // After an escape, a short cooldown during which the heat cannot rise
    // again — the player gets a clean breath before the next chase.
    cooldown: 0,
    cfg,
  };
}

// Heat rises instantly (a crime is a crime), but never during the
// post-escape cooldown. setStars bypasses this on purpose: scripted heat
// (a mission that starts hot) is not a new crime.
export function addHeat(wanted, amount) {
  if (wanted.cooldown > 0) return;
  wanted.heat = Math.min(wanted.cfg.police.heatPerStar * 5, wanted.heat + amount);
  wanted.stars = Math.min(5, Math.floor(wanted.heat / wanted.cfg.police.heatPerStar));
  if (wanted.heat > 0 && wanted.stars === 0) wanted.stars = 1;
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
function spawnRoadblock(wanted, scene, playerPos, heading, roadLines, rng) {
  const alongZ = Math.abs(Math.cos(heading)) >= Math.abs(Math.sin(heading));
  const cars = [];
  if (alongZ) {
    const roadX = nearestLine(roadLines, playerPos.x);
    const ahead = playerPos.z + Math.cos(heading) * 42;
    const z = Math.max(-140, Math.min(140, ahead));
    for (const dx of [-2.6, 2.6]) {
      const car = createCar(scene, roadX + dx, z, Math.PI / 2, 0x1a1a22, true, 0);
      car.speed = 0;
      car.roadblock = true;
      cars.push(car);
    }
  } else {
    const roadZ = nearestLine(roadLines, playerPos.z);
    const ahead = playerPos.x + Math.sin(heading) * 42;
    const x = Math.max(-140, Math.min(140, ahead));
    for (const dz of [-2.6, 2.6]) {
      const car = createCar(scene, x, roadZ + dz, 0, 0x1a1a22, true, 0);
      car.speed = 0;
      car.roadblock = true;
      cars.push(car);
    }
  }
  wanted.roadblocks = cars;
  return cars;
}

function clearRoadblocks(wanted, scene) {
  for (const car of wanted.roadblocks) scene.remove(car.group);
  wanted.roadblocks = [];
}

export function ensurePolice(wanted, scene, playerPos, rng, ctx) {
  const want = Math.min(wanted.cfg.police.maxCars, wanted.stars);
  while (wanted.policeCars.length < want) {
    const p = spawnPointNear(wanted, playerPos, rng);
    const heading = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
    const car = createCar(scene, p.x, p.z, heading, 0x1a1a22, true, wanted.cfg.car.policeSpeed);
    car.speed = wanted.cfg.car.policeSpeed * 0.7;
    wanted.policeCars.push(car);
  }
  while (wanted.policeCars.length > want) {
    const car = wanted.policeCars.pop();
    scene.remove(car.group);
  }
  // Roadblocks at 3+ stars, only when we know the road the player is on.
  if (ctx && ctx.roadLines) {
    if (wanted.stars >= wanted.cfg.police.roadblockStars && wanted.roadblocks.length === 0) {
      spawnRoadblock(wanted, scene, playerPos, ctx.heading ?? 0, ctx.roadLines, rng);
    } else if (wanted.stars < wanted.cfg.police.roadblockStars && wanted.roadblocks.length > 0) {
      clearRoadblocks(wanted, scene);
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
    list.push({
      name: 'INTERCEPTOR',
      dist: Math.round(d),
      status: d < 8 ? 'RAMMING' : d < 30 ? 'CHASING' : 'SEARCHING',
      kind: 'car',
    });
  }
  for (const o of wanted.officers) {
    const d = Math.hypot(o.group.position.x - playerPos.x, o.group.position.z - playerPos.z);
    list.push({
      name: 'OFFICER',
      dist: Math.round(d),
      status: d < 6 ? 'ARRESTING' : 'CLOSING IN',
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

export function updatePolice(wanted, dt, scene, playerPos, playerInCar, onRam, onArrest, rng) {
  if (wanted.cooldown > 0) wanted.cooldown -= dt;
  const cfg = wanted.cfg;
  wanted.flash += dt;
  // Flash the light bars: red and blue alternate, twice a second.
  const phase = Math.floor(wanted.flash * 3) % 2 === 0;
  for (const car of [...wanted.policeCars, ...wanted.roadblocks]) {
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
    // No heat: officers stand down.
    for (const o of wanted.officers) scene.remove(o.group);
    wanted.officers = [];
    return;
  }

  for (const car of wanted.policeCars) {
    const pos = car.group.position;
    const dx = playerPos.x - pos.x;
    const dz = playerPos.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const targetHeading = Math.atan2(dx, dz);
    let dh = targetHeading - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    car.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, dh));
    car.group.rotation.y = car.heading;
    const speed = dist > 30 ? cfg.car.policeSpeed : cfg.car.policeSpeed * 0.75;
    car.speed += (speed - car.speed) * Math.min(1, dt * 1.5);
    pos.x += Math.sin(car.heading) * car.speed * dt;
    pos.z += Math.cos(car.heading) * car.speed * dt;
    car.wheelSpin += car.speed * dt * 2;
    spinWheelsOf(car);
    if (dist < 3.2) {
      onRam(car, dist);
      // Bounce the police car off so it does not stick inside the player.
      pos.x -= Math.sin(car.heading) * 2.5;
      pos.z -= Math.cos(car.heading) * 2.5;
      car.speed = 4;
    }
    // Arrest: an officer on foot closes in when the player is on foot.
    if (!playerInCar && dist < cfg.police.arrestRange + 6) {
      wanted.arrestTimer += dt;
      if (wanted.arrestTimer > cfg.police.arrestTime) {
        wanted.arrestTimer = 0;
        onArrest();
      }
    }
  }
  if (nearest > cfg.police.arrestRange + 6) wanted.arrestTimer = Math.max(0, wanted.arrestTimer - dt);

  // Officers on foot: they step out when the player is on foot and walk
  // the player down. They are the arrest — the timer above is their reach.
  if (!playerInCar) {
    const wantOfficers = Math.min(cfg.police.maxOfficers, wanted.stars);
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
  for (const car of wanted.policeCars) scene.remove(car.group);
  wanted.policeCars = [];
  for (const o of wanted.officers) scene.remove(o.group);
  wanted.officers = [];
  clearRoadblocks(wanted, scene);
  wanted.heat = 0;
  wanted.stars = 0;
  wanted.arrestTimer = 0;
  wanted.sirenOn = false;
  wanted.searchZone = null;
  wanted.heliActive = false;
  wanted.heliOverhead = false;
}
