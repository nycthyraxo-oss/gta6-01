// The wanted system: heat builds from crimes, stars show it, police cars
// chase and ram, officers close in and arrest. Heat cools only when the
// player is out of sight and far away — and police that rejoin a chase always
// arrive OUTSIDE the sight range, so a chase can actually be lost.
import { createCar } from './vehicles.js';

export function createWanted(cfg) {
  return {
    heat: 0,
    stars: 0,
    arrestTimer: 0,
    policeCars: [],
    officers: [],
    sirenOn: false,
    cfg,
  };
}

export function addHeat(wanted, amount) {
  wanted.heat = Math.min(wanted.cfg.police.heatPerStar * 5, wanted.heat + amount);
  wanted.stars = Math.min(5, Math.floor(wanted.heat / wanted.cfg.police.heatPerStar) + (wanted.heat > 0 ? 0 : 0));
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

export function ensurePolice(wanted, scene, playerPos, rng) {
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
}

export function updatePolice(wanted, dt, scene, playerPos, playerInCar, onRam, onArrest) {
  const cfg = wanted.cfg;
  // Heat cools only when no police car is close enough to see the player.
  let nearest = Infinity;
  for (const car of wanted.policeCars) {
    const d = Math.hypot(car.group.position.x - playerPos.x, car.group.position.z - playerPos.z);
    if (d < nearest) nearest = d;
  }
  if (wanted.stars > 0 && nearest > cfg.police.sightRange) {
    wanted.heat = Math.max(0, wanted.heat - cfg.police.decayPerSecond * dt);
    const s = wanted.heat <= 0 ? 0 : Math.max(1, Math.ceil(wanted.heat / cfg.police.heatPerStar));
    wanted.stars = s;
  }
  wanted.sirenOn = wanted.stars > 0;
  if (wanted.stars === 0) return;

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
    for (const w of car.wheels) w.rotation.x = car.wheelSpin;
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
}

export function clearPolice(wanted, scene) {
  for (const car of wanted.policeCars) scene.remove(car.group);
  wanted.policeCars = [];
  wanted.officers = [];
  wanted.heat = 0;
  wanted.stars = 0;
  wanted.arrestTimer = 0;
  wanted.sirenOn = false;
}
