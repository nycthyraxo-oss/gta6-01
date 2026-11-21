// vehicles.js — cars for Costa Fuego: body factory, parked cars, traffic
// driving the avenue/street grid, and the simple arcade driving model the
// player uses. Traffic cars carry a visible driver; stealing one ejects
// that driver as a fleeing pedestrian (handled by game.js).

import * as THREE from 'three';
import { cfg, AVENUES, STREETS, CAR_CLASSES } from './config.js';

const CAR_COLORS = [0xd23b2e, 0x2e6fd2, 0xf2c14c, 0x39c2a5, 0xf2f2f2, 0x2b2b30, 0xe87ab0, 0x7a4fd0, 0x4fc24f, 0xf28a3d];

export function carClassByName(name) {
  return CAR_CLASSES.find(c => c.name === name) || CAR_CLASSES[2];
}

export function carSilhouettes() {
  const out = {};
  for (const c of CAR_CLASSES) out[c.name] = { len: c.len, w: c.w, h: c.h };
  return out;
}

// Builds a car mesh for a class. Every geometry/material created here is
// tagged as owned by the mesh so disposeCarMesh can free exactly them.
export function makeCarMesh(color, kind = 'car', className = 'Garuda Sedan') {
  const cls = carClassByName(className);
  const g = new THREE.Group();
  const owned = [];
  const own = (res) => { owned.push(res); return res; };
  const bodyMat = own(new THREE.MeshLambertMaterial({ color }));
  const bodyH = Math.max(0.4, cls.h * 0.45);
  const body = new THREE.Mesh(own(new THREE.BoxGeometry(cls.w, bodyH, cls.len)), bodyMat);
  body.position.y = 0.34 + bodyH / 2;
  body.userData.kind = kind;
  g.add(body);
  const cabinH = Math.max(0.3, cls.h - bodyH - 0.3);
  const cabin = new THREE.Mesh(own(new THREE.BoxGeometry(cls.w * 0.88, cabinH, cls.len * 0.48)),
    own(new THREE.MeshLambertMaterial({ color: 0x1c2733 })));
  cabin.position.set(0, 0.34 + bodyH + cabinH / 2, -cls.len * 0.05);
  cabin.userData.kind = kind;
  g.add(cabin);
  const wheelGeo = own(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10));
  const wheelMat = own(new THREE.MeshLambertMaterial({ color: 0x15171a }));
  const wheels = [];
  const wx = cls.w / 2 - 0.1, wz = cls.len / 2 - 0.7;
  for (const [x, z] of [[-wx, wz], [wx, wz], [-wx, -wz], [wx, -wz]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.34, z);
    w.userData.kind = 'wheel';
    g.add(w);
    wheels.push(w);
  }
  const lightMat = own(new THREE.MeshBasicMaterial({ color: 0xfff6c8 }));
  for (const x of [-cls.w * 0.3, cls.w * 0.3]) {
    const l = new THREE.Mesh(own(new THREE.BoxGeometry(0.32, 0.16, 0.06)), lightMat);
    l.position.set(x, 0.62, cls.len / 2 + 0.01);
    l.userData.kind = kind;
    g.add(l);
  }
  g.userData.wheels = wheels;
  g.userData.bodyMat = bodyMat;
  g.userData.owned = owned;
  g.userData.className = cls.name;
  g.userData.dims = { len: cls.len, w: cls.w, h: cls.h };
  return g;
}

export function disposeCarMesh(mesh) {
  const owned = mesh.userData.owned || [];
  let freed = 0;
  for (const res of owned) {
    if (res && typeof res.dispose === 'function') { res.dispose(); freed++; }
  }
  mesh.userData.owned = [];
  return freed;
}

export function ownedCount(mesh) {
  return (mesh.userData.owned || []).length;
}

export function makeDriverMesh(color) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.3),
    new THREE.MeshLambertMaterial({ color }));
  torso.position.y = 0.35;
  torso.userData.kind = 'driver';
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xe8b88a }));
  head.position.y = 0.82;
  head.userData.kind = 'driver';
  g.add(head);
  return g;
}

let carSeq = 0;

export class Car {
  constructor(mesh, x, z, heading, opts = {}) {
    this.id = 'car' + (carSeq++);
    this.mesh = mesh;
    this.x = x; this.z = z;
    this.y = 0;
    this.airY = 0;
    this.airTime = 0;
    this.group = mesh;
    this.heading = heading;
    this.speed = 0;
    this.vy = 0;
    this.health = 100;
    this.condition = 100;
    this.className = mesh.userData.className || 'Garuda Sedan';
    this.name = this.className;
    this.wrecked = false;
    this.kind = opts.kind || 'traffic'; // traffic | parked | police | player
    this.hasDriver = !!opts.driver;
    this.driverMesh = null;
    if (opts.driver) {
      this.driverMesh = makeDriverMesh(opts.driverColor || 0x4466aa);
      this.driverMesh.position.set(-0.42, 0.72, -0.2);
      mesh.add(this.driverMesh);
    }
    this.route = opts.route || null; // {axis:'avenue'|'street', line, dir}
    this.stuckTimer = 0;
    this.syncMesh();
  }

  syncMesh() {
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.heading;
    const wheels = this.mesh.userData.wheels || [];
    for (const w of wheels) w.rotation.x += this.speed * 0.02;
  }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  ejectDriver() {
    if (this.driverMesh) {
      this.mesh.remove(this.driverMesh);
      this.driverMesh = null;
    }
    this.hasDriver = false;
  }
}

export class Traffic {
  constructor(scene, streams, lights) {
    this.scene = scene;
    this.rng = streams.traffic;
    this.lights = lights;
    this.cars = [];
    this.parked = [];
    this.spawnAll();
  }

  spawnOne() {
    const rng = this.rng;
    const onAvenue = rng.chance(0.5);
    const line = onAvenue ? rng.pick(AVENUES).x : rng.pick(STREETS).z;
    const dir = rng.chance(0.5) ? 1 : -1;
    const along = rng.range(-130, 130);
    const lane = cfg.traffic.laneOffset * dir;
    const x = onAvenue ? line + lane : along;
    const z = onAvenue ? along : line + lane;
    const heading = onAvenue ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const cls = rng.pick(CAR_CLASSES);
    const mesh = makeCarMesh(rng.pick(CAR_COLORS), 'car', cls.name);
    this.scene.add(mesh);
    const car = new Car(mesh, x, z, heading, {
      kind: 'traffic', driver: true, driverColor: rng.pick(CAR_COLORS),
      route: { axis: onAvenue ? 'avenue' : 'street', line, dir },
    });
    car.speed = cfg.traffic.cruiseSpeed * rng.range(0.7, 1);
    this.cars.push(car);
    return car;
  }

  setTrafficCount(n) {
    while (this.cars.length < n) this.spawnOne();
    while (this.cars.length > n) {
      const car = this.cars.pop();
      this.scene.remove(car.mesh);
      disposeCarMesh(car.mesh);
    }
  }

  spawnAll() {
    const rng = this.rng;
    for (let i = 0; i < cfg.traffic.count; i++) this.spawnOne();
    // parked cars along curbs and at landmarks
    const spots = [
      [-100, 100], [-124, 100], [-96, -100], [-124, -124], [44, -44], [68, -68],
      [12, 100], [-12, 124], [-52, 100], [92, 100], [116, 124], [148, -16],
      [-100, 76], [-124, 68], [100, -100], [-40, -100], [40, 44], [-40, 12],
    ];
    for (const [x, z] of spots) {
      const cls = this.rng.pick(CAR_CLASSES);
      const mesh = makeCarMesh(this.rng.pick(CAR_COLORS), 'car', cls.name);
      this.scene.add(mesh);
      const car = new Car(mesh, x, z, this.rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), { kind: 'parked' });
      this.parked.push(car);
    }
  }

  allCars() { return this.cars.concat(this.parked); }

  update(dt, playerPos) {
    const w = cfg.world;
    for (const car of this.cars) {
      const r = car.route;
      if (!r) continue;
      // desired speed: slow near junctions with red light, near player, near car ahead
      let want = cfg.traffic.cruiseSpeed;
      const ahead = this.carAhead(car);
      if (ahead && ahead.dist < cfg.traffic.stopGap) want = 0;
      if (playerPos) {
        const dx = playerPos.x - car.x, dz = playerPos.z - car.z;
        const f = car.forward();
        const along = dx * f.x + dz * f.z;
        const side = Math.abs(-dx * f.z + dz * f.x);
        if (along > 0 && along < 9 && side < 2.4) want = 0;
      }
      // traffic light: stop before the stop line of a red junction
      const j = this.lights.nearest(car.x, car.z);
      if (j) {
        const dx = j.x - car.x, dz = j.z - car.z;
        const f = car.forward();
        const along = dx * f.x + dz * f.z;
        if (along > 2 && along < 15 && !this.lights.allows(j, r.axis)) want = 0;
      }
      car.speed += (want - car.speed) * Math.min(1, dt * 2.2);
      if (car.speed < 0.05 && want === 0) car.speed = 0;
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      // turn at junctions sometimes; wrap at world edges
      const atJunction = r.axis === 'avenue'
        ? STREETS.some(s => Math.abs(car.z - s.z) < 1.5)
        : AVENUES.some(a => Math.abs(car.x - a.x) < 1.5);
      if (atJunction && this.rng.chance(dt * 0.4)) this.turn(car);
      if (car.x < w.minX + 2 || car.x > 150 || car.z < w.minZ + 2 || car.z > w.maxZ - 2) this.respawn(car);
      car.syncMesh();
    }
  }

  turn(car) {
    const r = car.route;
    const dirs = [1, -1];
    if (r.axis === 'avenue') {
      const st = STREETS.reduce((b, s) => Math.abs(s.z - car.z) < Math.abs(b.z - car.z) ? s : b, STREETS[0]);
      r.axis = 'street'; r.line = st.z; r.dir = this.rng.pick(dirs);
      car.z = st.z + cfg.traffic.laneOffset * r.dir;
      car.heading = r.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      const av = AVENUES.reduce((b, a) => Math.abs(a.x - car.x) < Math.abs(b.x - car.x) ? a : b, AVENUES[0]);
      r.axis = 'avenue'; r.line = av.x; r.dir = this.rng.pick(dirs);
      car.x = av.x + cfg.traffic.laneOffset * r.dir;
      car.heading = r.dir > 0 ? 0 : Math.PI;
    }
  }

  respawn(car) {
    const rng = this.rng;
    const onAvenue = rng.chance(0.5);
    const line = onAvenue ? rng.pick(AVENUES).x : rng.pick(STREETS).z;
    const dir = rng.chance(0.5) ? 1 : -1;
    const along = dir > 0 ? -135 : 135;
    const lane = cfg.traffic.laneOffset * dir;
    car.x = onAvenue ? line + lane : along;
    car.z = onAvenue ? along : line + lane;
    car.heading = onAvenue ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    car.route = { axis: onAvenue ? 'avenue' : 'street', line, dir };
    car.speed = cfg.traffic.cruiseSpeed;
  }

  carAhead(car) {
    let best = null;
    for (const other of this.allCars()) {
      if (other === car) continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      const f = car.forward();
      const along = dx * f.x + dz * f.z;
      const side = Math.abs(-dx * f.z + dz * f.x);
      if (along > 0 && along < 12 && side < 2.2) {
        if (!best || along < best.dist) best = { car: other, dist: along };
      }
    }
    return best;
  }
}

// Arcade driving for the player's car. Returns true when a crash happened.
export function drivePlayerCar(car, input, dt) {
  const c = cfg.car;
  const fwd = input.held('w') || input.held('arrowup');
  const back = input.held('s') || input.held('arrowdown');
  const left = input.held('a') || input.held('arrowleft');
  const right = input.held('d') || input.held('arrowright');
  const boost = input.held('shift');
  const brake = input.held(' ');
  if (fwd) car.speed += (boost ? c.boostAccel : c.accel) * dt;
  else if (back) car.speed -= c.accel * 0.8 * dt;
  else car.speed -= car.speed * c.drag * dt;
  if (brake) {
    const dec = c.brakeDecel * dt;
    car.speed = Math.abs(car.speed) <= dec ? 0 : car.speed - Math.sign(car.speed) * dec;
  }
  const cap = boost ? c.boostSpeed : c.maxSpeed;
  car.speed = Math.max(-c.reverseSpeed, Math.min(cap, car.speed));
  const steer = (left ? 1 : 0) - (right ? 1 : 0);
  if (steer !== 0 && Math.abs(car.speed) > 0.4) {
    const grip = brake ? 1.5 : 1;
    car.heading += steer * c.turnRate * grip * dt * Math.sign(car.speed) * Math.min(1, Math.abs(car.speed) / 8);
  }
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  car.syncMesh();
  return false;
}
