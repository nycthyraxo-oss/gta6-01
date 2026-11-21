// police.js — the wanted system and police response for Costa Fuego.
// Heat builds from witnessed crimes; stars 1-2 only observe and follow,
// ramming and roadblocks start at star 3, and the helicopter joins at
// star 4 with a spotlight. Heat decays while the player stays hidden.

import * as THREE from 'three';
import { cfg } from './config.js';
import { makeCarMesh, Car } from './vehicles.js';

export class Wanted {
  constructor() {
    this.heat = 0;
    this.stars = 0;
    this.graceTimer = 0;   // seconds left of first-star grace
    this.witnessTimer = 0; // pending witnessed-crime timer
    this.pendingHeat = 0;
    this.witnessPed = null;
    this.heliActive = false;
    this.searchZone = null;
    this.policeCars = [];
    this.roadblocks = [];
    this.lastCrimeAt = -99;
    this.time = 0;
  }

  addHeat(amount) {
    if (this.stars === 0 && this.heat === 0) this.graceTimer = cfg.police.graceSeconds;
    this.heat = Math.min(150, this.heat + amount);
    this.lastCrimeAt = this.time;
    this.recompute();
  }

  // A crime a pedestrian saw: heat lands after the witness timer runs
  // out — unless that witness dies first, in which case nobody talks.
  witnessedCrime(amount, ped = null) {
    this.pendingHeat += amount;
    this.witnessTimer = cfg.police.witnessSeconds;
    if (ped) this.witnessPed = ped;
  }

  witnessState() {
    if (this.witnessTimer <= 0 || !this.witnessPed) return null;
    return { ped: { x: this.witnessPed.x, z: this.witnessPed.z }, timer: this.witnessTimer, heat: this.pendingHeat };
  }

  recompute() {
    this.stars = Math.min(5, Math.floor(this.heat / cfg.police.heatPerStar));
  }

  clear() {
    this.heat = 0; this.stars = 0; this.pendingHeat = 0; this.witnessTimer = 0; this.graceTimer = 0;
    this.witnessPed = null;
    this.searchZone = null;
  }

  update(dt, hidden, rateMul = 1) {
    this.time += dt;
    if (this.graceTimer > 0) this.graceTimer -= dt;
    if (this.witnessPed && !this.witnessPed.alive) {
      // the witness died before calling it in
      this.witnessTimer = 0;
      this.pendingHeat = 0;
      this.witnessPed = null;
    }
    if (this.witnessTimer > 0) {
      this.witnessTimer -= dt;
      if (this.witnessTimer <= 0 && this.pendingHeat > 0) {
        this.addHeat(this.pendingHeat);
        this.pendingHeat = 0;
        this.witnessPed = null;
      }
    }
    if (hidden && this.heat > 0) {
      this.heat = Math.max(0, this.heat - cfg.police.decayPerSecond * rateMul * dt);
      this.recompute();
    }
  }

  get aggressive() { return this.stars >= cfg.police.ramStars && this.graceTimer <= 0; }
}

export function makePoliceMesh() {
  const mesh = makeCarMesh(0xf2f2f2, 'police');
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.3, 4.14),
    new THREE.MeshLambertMaterial({ color: 0x1c3a6e }));
  stripe.position.y = 0.62;
  stripe.userData.kind = 'police';
  mesh.add(stripe);
  const barMat = new THREE.MeshBasicMaterial({ color: 0xdd3333 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.5), barMat);
  bar.position.set(0, 1.45, -0.2);
  bar.userData.kind = 'police';
  mesh.add(bar);
  mesh.userData.lightBar = barMat;
  return mesh;
}

export function makeHeliMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 4.2),
    new THREE.MeshLambertMaterial({ color: 0x2b3a55 }));
  body.userData.kind = 'heli';
  g.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 3.4),
    new THREE.MeshLambertMaterial({ color: 0x2b3a55 }));
  tail.position.set(0, 0.2, -3.6);
  tail.userData.kind = 'heli';
  g.add(tail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(7, 0.06, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x22262c }));
  rotor.position.y = 1.0;
  rotor.userData.kind = 'heli';
  g.add(rotor);
  g.userData.rotor = rotor;
  const spot = new THREE.SpotLight(0xfff2b8, 0, 90, 0.35, 0.5);
  spot.position.set(0, -0.5, 1);
  g.add(spot);
  g.add(spot.target);
  g.userData.spot = spot;
  // visible light cone
  const cone = new THREE.Mesh(new THREE.ConeGeometry(6, 26, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b8, transparent: true, opacity: 0.12, depthWrite: false }));
  cone.position.y = -13;
  cone.rotation.x = Math.PI;
  cone.userData.kind = 'spotlight';
  g.add(cone);
  g.userData.cone = cone;
  return g;
}

export class Police {
  constructor(scene, streams) {
    this.scene = scene;
    this.rng = streams.traffic;
    this.cars = [];
    this.roadblocks = [];
    this.heli = null;
    this.heliAngle = 0;
    this.flashTimer = 0;
  }

  desiredCars(stars) {
    if (stars <= 0) return 0;
    return Math.min(cfg.police.maxCars, stars + 1);
  }

  spawnCarNear(playerPos) {
    const a = this.rng.range(0, Math.PI * 2);
    const dist = 55;
    const x = Math.max(-145, Math.min(195, playerPos.x + Math.cos(a) * dist));
    const z = Math.max(-145, Math.min(145, playerPos.z + Math.sin(a) * dist));
    const mesh = makePoliceMesh();
    this.scene.add(mesh);
    const car = new Car(mesh, x, z, Math.atan2(playerPos.x - x, playerPos.z - z), { kind: 'police', driver: true, driverColor: 0x1c3a6e });
    this.cars.push(car);
    return car;
  }

  makeRoadblock(playerPos, heading) {
    // two police cars parked across the road ahead of the player
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const cx = playerPos.x + fx * 40, cz = playerPos.z + fz * 40;
    for (const off of [-3, 3]) {
      const mesh = makePoliceMesh();
      this.scene.add(mesh);
      const car = new Car(mesh, cx + fz * off, cz - fx * off, heading + Math.PI / 2, { kind: 'police' });
      car.roadblock = true;
      this.roadblocks.push(car);
    }
  }

  clearRoadblocks() {
    for (const c of this.roadblocks) this.scene.remove(c.mesh);
    // mutate in place: wanted.roadblocks aliases this array
    this.roadblocks.length = 0;
  }

  update(dt, wanted, playerPos, playerCar, onRam) {
    this.flashTimer += dt * 6;
    const want = this.desiredCars(wanted.stars);
    while (this.cars.length < want) this.spawnCarNear(playerPos);
    while (this.cars.length > want) {
      const c = this.cars.pop();
      this.scene.remove(c.mesh);
    }
    if (wanted.stars >= cfg.police.roadblockStars && this.roadblocks.length === 0) {
      this.makeRoadblock(playerPos, playerCar ? playerCar.heading : (playerPos.heading || 0));
    }
    if (wanted.stars < cfg.police.roadblockStars) this.clearRoadblocks();

    // past the island gate the cruisers hold at x=209 and never cross
    const tx = playerPos.x > 209 ? 209 : playerPos.x;
    for (const car of this.cars) {
      if (car.stopped) { car.speed = 0; car.syncMesh(); continue; }
      const dx = tx - car.x, dz = playerPos.z - car.z;
      const dist = Math.hypot(dx, dz);
      const targetHeading = Math.atan2(dx, dz);
      let dh = targetHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, dh));
      let speed;
      if (wanted.aggressive) {
        speed = dist > 6 ? 30 : 16; // ram: drive straight at the player
      } else {
        // observe: follow at a respectful distance, never ram
        speed = dist > 16 ? 22 : dist > 10 ? 8 : 0;
      }
      car.speed += (speed - car.speed) * Math.min(1, dt * 2);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      if (playerPos.x > 209 && car.x > 209) { car.x = 209; car.speed = Math.min(car.speed, 0); }
      car.syncMesh();
      const bar = car.mesh.userData.lightBar;
      if (bar) bar.color.set(Math.sin(this.flashTimer) > 0 ? 0xdd3333 : 0x3366dd);
      // ram contact is measured against the real player position
      // (not the gate-clamped target), with a per-car cooldown
      car.ramCooldown = Math.max(0, (car.ramCooldown || 0) - dt);
      const playerDist = Math.hypot(playerPos.x - car.x, playerPos.z - car.z);
      if (wanted.aggressive && playerDist < 3.4 && car.ramCooldown <= 0 && onRam) {
        car.ramCooldown = 0.8;
        onRam(car);
      }
    }

    // helicopter
    if (wanted.stars >= cfg.police.heliStars) {
      if (!this.heli) {
        const mesh = makeHeliMesh();
        this.scene.add(mesh);
        this.heli = { mesh, x: playerPos.x, z: playerPos.z, y: 26 };
      }
      this.heliAngle += dt * 0.35;
      const hx = playerPos.x + Math.cos(this.heliAngle) * 18;
      const hz = playerPos.z + Math.sin(this.heliAngle) * 18;
      this.heli.x += (hx - this.heli.x) * Math.min(1, dt * 1.2);
      this.heli.z += (hz - this.heli.z) * Math.min(1, dt * 1.2);
      this.heli.mesh.position.set(this.heli.x, this.heli.y, this.heli.z);
      this.heli.mesh.rotation.y = Math.atan2(playerPos.x - this.heli.x, playerPos.z - this.heli.z);
      this.heli.mesh.userData.rotor.rotation.y += dt * 28;
      const spot = this.heli.mesh.userData.spot;
      spot.intensity = 2.2;
      spot.target.position.set(playerPos.x - this.heli.x, -this.heli.y, playerPos.z - this.heli.z);
    } else if (this.heli) {
      this.scene.remove(this.heli.mesh);
      this.heli = null;
    }
    wanted.heliActive = !!this.heli;
  }

  inVisionCone(playerPos) {
    for (const car of this.cars) {
      const dx = playerPos.x - car.x, dz = playerPos.z - car.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 45 || dist < 0.01) continue;
      const ang = Math.atan2(dx, dz);
      let dh = ang - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      if (Math.abs(dh) < 0.65) return true;
    }
    return false;
  }

  anyNear(playerPos, radius) {
    return this.cars.some(c => Math.hypot(c.x - playerPos.x, c.z - playerPos.z) <= radius);
  }

  snapshot() {
    return {
      cars: this.cars.map(c => ({ x: c.x, z: c.z, speed: c.speed, heading: c.heading })),
      roadblocks: this.roadblocks.length,
      heli: !!this.heli,
    };
  }
}
