// Cars: the mesh factory every car in Costa Fuego is built from, the traffic
// that cruises the road grid (and now turns at junctions and stops at red
// lights), and the skid marks hard driving leaves behind.
//
// v6: real car models, not boxes with wheels. Every model has a swept body
// with wheel arches, five-spoke wheels that spin AND steer, see-through
// glass with seats, a steering wheel and a driver inside, and per-model
// extras — wings and stripes on the muscle cars, a checker band and roof
// sign on the cab van, a livery, push bar and flashing light bar on the
// police Interceptor. All geometry is shared and cached, so 26 cars cost a
// handful of draw programs, not one per spoke.
import * as THREE from 'three';
import { lightFor } from './trafficlights.js';

// One spec per paint colour. kind drives the body shape; extras are
// per-model flags. wheelR is the wheel radius, rideH the body ride height.
export const SPECS = [
  { color: 0xc23b2e, name: 'Cometa GT', kind: 'muscle', length: 4.6, width: 2.0, bodyH: 0.6, wheelR: 0.48, wing: true, stripes: 0xffe9a8, cabin: 'closed' },
  { color: 0x2e6fc2, name: 'Brisa Hatch', kind: 'hatch', length: 4.0, width: 1.9, bodyH: 0.66, wheelR: 0.44, roofRails: true, cabin: 'closed' },
  { color: 0xe8c832, name: 'Solano Cabrio', kind: 'cabrio', length: 4.3, width: 1.95, bodyH: 0.58, wheelR: 0.46, cabin: 'open', stripes: 0x22262c },
  { color: 0x3aa655, name: 'Toro Sedan', kind: 'sedan', length: 4.5, width: 1.95, bodyH: 0.62, wheelR: 0.45, chrome: true, cabin: 'closed' },
  { color: 0x8a5fc2, name: 'Furia Sport', kind: 'sport', length: 4.4, width: 2.05, bodyH: 0.52, wheelR: 0.47, wing: true, stripes: 0xe8e8e8, sideSkirts: true, cabin: 'closed' },
  { color: 0xd8d8d8, name: 'Lobo Van', kind: 'van', length: 4.8, width: 2.1, bodyH: 0.95, wheelR: 0.46, checker: true, roofSign: true, cabin: 'closed' },
  { color: 0x22262c, name: 'Bruto 4x4', kind: 'suv', length: 4.5, width: 2.05, bodyH: 0.78, wheelR: 0.52, roofRack: true, cabin: 'closed' },
  { color: 0xe07828, name: 'Vela Coupe', kind: 'coupe', length: 4.4, width: 1.95, bodyH: 0.56, wheelR: 0.46, stripes: 0x1a1a22, cabin: 'closed' },
];

const POLICE_SPEC = { color: 0x1a1a22, name: 'Interceptor', kind: 'sedan', length: 4.5, width: 2.0, bodyH: 0.62, wheelR: 0.46, cabin: 'closed' };

export function specFor(color, isPolice) {
  if (isPolice) return POLICE_SPEC;
  return SPECS.find((s) => s.color === color) || SPECS[0];
}

export function carNameFor(color) {
  return specFor(color, false).name;
}

// Shared geometries and materials, keyed so every car reuses them.
const GEO = {};
function geo(key, make) {
  if (!GEO[key]) GEO[key] = make();
  return GEO[key];
}
const MAT = new Map();
function mat(color, roughness, metalness = 0, extra = {}) {
  const key = `${color}|${roughness}|${metalness}|${extra.transparent ? 1 : 0}|${extra.opacity ?? ''}`;
  if (!MAT.has(key)) {
    MAT.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }));
  }
  return MAT.get(key);
}
const GLASS = new THREE.MeshStandardMaterial({
  color: 0x9fd8ff, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.42,
});
const DARK_GLASS = new THREE.MeshStandardMaterial({
  color: 0x18222c, roughness: 0.15, metalness: 0.7,
});
const TIRE_MAT = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95 });
const RIM_MAT = new THREE.MeshStandardMaterial({ color: 0xb8bec8, roughness: 0.35, metalness: 0.8 });
const ARCH_MAT = new THREE.MeshStandardMaterial({ color: 0x0e0f11, roughness: 0.9 });

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo(`box-${w}-${h}-${d}`, () => new THREE.BoxGeometry(w, h, d)), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// One five-spoke wheel. Outer group carries the axle rotation (rotation.z =
// PI/2 turns the local Y axle onto world X); the inner spinner holds the
// tire, hub and spokes and rotates around local Y, which is the axle.
// Returns the outer group; the spinner lives on group.userData.spinner so
// the drive code can spin it without touching the axle orientation.
function makeWheel(r) {
  const outer = new THREE.Group();
  outer.rotation.z = Math.PI / 2;
  const spinner = new THREE.Group();
  outer.add(spinner);
  const tire = new THREE.Mesh(geo(`tire-${r}`, () => new THREE.CylinderGeometry(r, r, 0.3, 16)), TIRE_MAT);
  tire.castShadow = true;
  spinner.add(tire);
  const hub = new THREE.Mesh(geo(`hub-${r}`, () => new THREE.CylinderGeometry(r * 0.42, r * 0.42, 0.34, 12)), RIM_MAT);
  spinner.add(hub);
  const spokeGeo = geo(`spoke-${r}`, () => new THREE.BoxGeometry(0.13, 0.06, r * 1.75));
  for (let k = 0; k < 5; k += 1) {
    const spoke = new THREE.Mesh(spokeGeo, RIM_MAT);
    spoke.rotation.y = (k / 5) * Math.PI * 2;
    spinner.add(spoke);
  }
  outer.userData.spinner = spinner;
  return outer;
}

// A seated driver: torso + head, small enough to read through the glass.
function makeDriver() {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(
    geo('driver-torso', () => new THREE.CapsuleGeometry(0.17, 0.3, 4, 8)),
    mat(0x2a2e38, 0.9),
  );
  torso.position.y = 0.25;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(geo('driver-head', () => new THREE.SphereGeometry(0.13, 10, 8)), mat(0xc89878, 0.7));
  head.position.y = 0.62;
  head.castShadow = true;
  g.add(head);
  g.visible = false;
  return g;
}

function checkerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 16; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? '#111111' : '#f2f2f2';
    ctx.fillRect(i * 8, 0, 8, 16);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}
let checkerTex = null;

// Per-model extras, table-driven: each flag adds its meshes to the group.
// Keeping them in one place is what lets a new model stay a one-line spec.
function addExtras(group, spec, bodyY, cabY, cabH, cabZ, W, L, own) {
  if (spec.wing) {
    group.add(box(W * 0.92, 0.06, 0.42, mat(0x14161a, 0.5, 0.5), 0, bodyY + spec.bodyH / 2 + 0.42, -L / 2 + 0.35));
    for (const sx of [-W * 0.3, W * 0.3]) {
      group.add(box(0.08, 0.4, 0.08, mat(0x14161a, 0.5, 0.5), sx, bodyY + spec.bodyH / 2 + 0.22, -L / 2 + 0.35));
    }
  }
  if (spec.stripes) {
    const stripeMat = mat(spec.stripes, 0.4, 0.4);
    for (const sx of [-0.22, 0.22]) {
      group.add(box(0.3, 0.03, L * 0.92, stripeMat, sx, bodyY + spec.bodyH / 2 + 0.015, 0));
    }
  }
  if (spec.roofRails) {
    for (const sx of [-W * 0.32, W * 0.32]) {
      group.add(box(0.07, 0.07, L * 0.4, mat(0x1c1e22, 0.5, 0.6), sx, cabY + cabH / 2 + 0.08, cabZ));
    }
  }
  if (spec.roofRack) {
    group.add(box(W * 0.7, 0.06, L * 0.36, mat(0x1c1e22, 0.5, 0.6), 0, cabY + cabH / 2 + 0.1, cabZ));
  }
  if (spec.sideSkirts) {
    for (const sx of [-W / 2 - 0.02, W / 2 + 0.02]) {
      group.add(box(0.08, 0.16, L * 0.7, mat(0x14161a, 0.5, 0.5), sx, 0.54, 0));
    }
  }
  if (spec.chrome) {
    group.add(box(W * 1.01, 0.05, L * 0.9, mat(0xd8dce2, 0.25, 0.9), 0, bodyY + 0.02, 0));
  }
  if (spec.checker) {
    if (!checkerTex) checkerTex = checkerTexture();
    // bandMat is owned (per-van), but its map is the SHARED checkerTex —
    // material.dispose() never frees a map, so the texture survives.
    const bandMat = own(new THREE.MeshBasicMaterial({ map: checkerTex }));
    for (const side of [-1, 1]) {
      const band = new THREE.Mesh(own(new THREE.PlaneGeometry(L * 0.9, 0.28)), bandMat);
      band.position.set((side * W) / 2 + side * 0.02, bodyY + 0.12, 0);
      band.rotation.y = side < 0 ? -Math.PI / 2 : Math.PI / 2;
      group.add(band);
    }
  }
  if (spec.roofSign) {
    group.add(box(0.9, 0.22, 0.3, own(new THREE.MeshBasicMaterial({ color: 0xffd23e })), 0, cabY + cabH / 2 + 0.18, cabZ));
  }
}

export function makeCarMesh(color, isPolice) {
  const spec = specFor(color, isPolice);
  const group = new THREE.Group();
  // Per-instance GPU resources this mesh owns (v9 iteration 3, item 12:
  // memory-leak guard). The factory records every geometry/material it
  // creates fresh on group.userData.owned. Everything else — the geo() /
  // mat() caches, GLASS, DARK_GLASS, TIRE_MAT, RIM_MAT, ARCH_MAT, and the
  // checker texture — is shared by every car in the city and must NEVER be
  // disposed: freeing one would break all the others. disposeCarMesh below
  // frees exactly this list, nothing else.
  group.userData.owned = [];
  const own = (r) => { group.userData.owned.push(r); return r; };
  const paint = mat(spec.color, 0.32, 0.55);
  const L = spec.length;
  const W = spec.width;
  const r = spec.wheelR;
  const bodyY = r + spec.bodyH / 2 - 0.04;

  // Swept body: main slab, a lower nose and a tapered tail so the car reads
  // as a shape instead of a brick.
  group.add(box(W, spec.bodyH, L, paint, 0, bodyY, 0));
  group.add(box(W * 0.92, spec.bodyH * 0.72, L * 0.2, paint, 0, bodyY - 0.06, L / 2 - L * 0.08));
  group.add(box(W * 0.9, spec.bodyH * 0.8, L * 0.16, paint, 0, bodyY - 0.02, -L / 2 + L * 0.06));
  // Bumpers and grille.
  group.add(box(W * 0.98, 0.16, 0.22, mat(0x1c1e22, 0.5, 0.6), 0, r + 0.12, L / 2 + 0.02));
  group.add(box(W * 0.98, 0.16, 0.22, mat(0x1c1e22, 0.5, 0.6), 0, r + 0.12, -L / 2 - 0.02));
  group.add(box(W * 0.5, 0.16, 0.08, mat(0x0e0f11, 0.6, 0.4), 0, bodyY + 0.02, L / 2 + 0.06));

  // Cabin: see-through glass with pillars, seats, steering wheel and a
  // driver inside. Open cabins (the cabrio) get a windshield and no roof.
  const cabLen = L * (spec.kind === 'van' || spec.kind === 'suv' ? 0.52 : 0.42);
  const cabZ = spec.kind === 'van' || spec.kind === 'suv' ? -L * 0.04 : -L * 0.06;
  const cabH = spec.kind === 'van' || spec.kind === 'suv' ? 0.72 : 0.55;
  const cabY = bodyY + spec.bodyH / 2 + cabH / 2 - 0.04;
  if (spec.cabin === 'open') {
    const shield = new THREE.Mesh(
      own(new THREE.PlaneGeometry(W * 0.8, 0.5)),
      own(new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.5, side: THREE.DoubleSide })),
    );
    shield.position.set(0, cabY + 0.1, cabZ + cabLen / 2 - 0.1);
    shield.rotation.x = -0.35;
    group.add(shield);
  } else {
    const cabin = new THREE.Mesh(geo(`cabin-${W}-${cabH}-${cabLen}`, () => new THREE.BoxGeometry(W * 0.82, cabH, cabLen)), GLASS);
    cabin.position.set(0, cabY, cabZ);
    cabin.castShadow = true;
    group.add(cabin);
    // Pillars at the four cabin corners, so the glass reads as windows.
    for (const px of [-W * 0.38, W * 0.38]) {
      for (const pz of [cabZ - cabLen / 2 + 0.08, cabZ + cabLen / 2 - 0.08]) {
        group.add(box(0.09, cabH, 0.09, DARK_GLASS, px, cabY, pz));
      }
    }
    // Roof panel.
    group.add(box(W * 0.84, 0.07, cabLen + 0.06, paint, 0, cabY + cabH / 2 + 0.02, cabZ));
  }
  // Seats + steering wheel, visible through the glass.
  const seatMat = mat(0x22262c, 0.95);
  for (const sx of [-W * 0.2, W * 0.2]) {
    group.add(box(0.42, 0.5, 0.14, seatMat, sx, bodyY + spec.bodyH / 2 + 0.22, cabZ - 0.12));
    group.add(box(0.42, 0.14, 0.42, seatMat, sx, bodyY + spec.bodyH / 2 + 0.02, cabZ - 0.05));
  }
  const wheel = new THREE.Mesh(geo('steer', () => new THREE.TorusGeometry(0.17, 0.03, 6, 14)), mat(0x14161a, 0.6));
  wheel.position.set(-W * 0.2, bodyY + spec.bodyH / 2 + 0.42, cabZ + 0.28);
  wheel.rotation.x = -0.5;
  group.add(wheel);
  const driver = makeDriver();
  // Seated low enough that the head stays under the roofline in the
  // three-quarter chase shot.
  driver.position.set(-W * 0.2, bodyY + spec.bodyH / 2 - 0.04, cabZ - 0.05);
  group.add(driver);

  // Wheels: arches over them, five spokes inside, steering on the fronts.
  const wheels = [];
  const wheelX = W / 2 - 0.06;
  const wheelZ = L / 2 - 0.85;
  const archGeo = geo(`arch-${r}`, () => new THREE.TorusGeometry(r + 0.07, 0.08, 6, 12, Math.PI));
  for (const [wx, wz] of [[-wheelX, wheelZ], [wheelX, wheelZ], [-wheelX, -wheelZ], [wheelX, -wheelZ]]) {
    const arch = new THREE.Mesh(archGeo, ARCH_MAT);
    arch.position.set(wx, r, wz);
    arch.rotation.y = Math.PI / 2;
    group.add(arch);
    const w = makeWheel(r);
    w.position.set(wx, r, wz);
    group.add(w);
    wheels.push(w);
  }

  // Headlights that glow, taillights that read red at dusk.
  // Per-car materials (owned — see makeCarMesh) so one car's lights can
  // be disposed without touching any other car.
  const headMat = own(new THREE.MeshBasicMaterial({ color: 0xfff6c8 }));
  for (const hx of [-W * 0.32, W * 0.32]) {
    group.add(box(0.34, 0.16, 0.08, headMat, hx, bodyY + 0.08, L / 2 + 0.1));
  }
  const tailMat = own(new THREE.MeshBasicMaterial({ color: 0xff2a22 }));
  for (const tx of [-W * 0.32, W * 0.32]) {
    group.add(box(0.34, 0.16, 0.08, tailMat, tx, bodyY + 0.08, -L / 2 - 0.1));
  }

  addExtras(group, spec, bodyY, cabY, cabH, cabZ, W, L, own);

  let lightBar = null;
  if (isPolice) {
    // Livery: white doors on the dark body.
    for (const sx of [-W / 2 - 0.015, W / 2 + 0.015]) {
      const door = new THREE.Mesh(
        own(new THREE.PlaneGeometry(L * 0.42, spec.bodyH * 0.8)),
        own(new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, metalness: 0.3 })),
      );
      door.position.set(sx, bodyY, 0);
      door.rotation.y = sx < 0 ? -Math.PI / 2 : Math.PI / 2;
      group.add(door);
    }
    // Push bar on the nose.
    group.add(box(W * 0.6, 0.3, 0.1, mat(0x14161a, 0.5, 0.6), 0, bodyY - 0.05, L / 2 + 0.16));
    // Light bar: red and blue halves that flash in the chase (the materials
    // are per-car, so updatePolice can swap their colours).
    const redMat = own(new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    const blueMat = own(new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    const barBase = box(1.1, 0.1, 0.5, mat(0x14161a, 0.5, 0.6), 0, cabY + cabH / 2 + 0.1, cabZ);
    group.add(barBase);
    const segL = new THREE.Mesh(own(new THREE.BoxGeometry(0.5, 0.2, 0.46)), redMat);
    segL.position.set(-0.28, cabY + cabH / 2 + 0.22, cabZ);
    group.add(segL);
    const segR = new THREE.Mesh(own(new THREE.BoxGeometry(0.5, 0.2, 0.46)), blueMat);
    segR.position.set(0.28, cabY + cabH / 2 + 0.22, cabZ);
    group.add(segR);
    lightBar = { left: redMat, right: blueMat };
  }

  return { group, wheels, driver, lightBar };
}

// Dispose the per-instance GPU resources of a car mesh built by
// makeCarMesh, before the group leaves the scene (v9 iteration 3, item 12:
// memory-leak guard). Frees exactly group.userData.owned — the geometries
// and materials the factory created fresh for this car — and nothing else.
// Shared resources (the geo()/mat() caches, GLASS, TIRE_MAT, RIM_MAT,
// ARCH_MAT) are never in that list, so no other car is affected. A
// material's .dispose() never frees its map, so the shared checker texture
// survives a van's disposal. Safe to call twice (the list is cleared).
// Callers: spawnPlayerCar eviction (V), resprayCar, and the police
// removals in police.js (clearRoadblocks / ensurePolice shrink /
// clearPolice). People meshes need no such call — every geometry and
// material in makePersonMesh comes from its shared caches.
export function disposeCarMesh(group) {
  const owned = group && group.userData ? group.userData.owned : null;
  if (!owned || !owned.length) return;
  const seen = new Set();
  for (const r of owned) {
    if (!r || seen.has(r)) continue;
    seen.add(r);
    r.dispose();
  }
  group.userData.owned = [];
}

export function createCar(scene, x, z, heading, color, isPolice, cruiseSpeed) {
  const mesh = makeCarMesh(color, isPolice);
  mesh.group.position.set(x, 0, z);
  mesh.group.rotation.y = heading;
  scene.add(mesh.group);
  const speed = Number.isFinite(cruiseSpeed) ? cruiseSpeed : 9;
  const car = {
    group: mesh.group,
    wheels: mesh.wheels,
    driver: mesh.driver,
    lightBar: mesh.lightBar,
    heading,
    speed: 0,
    cruiseSpeed: speed,
    color,
    name: isPolice ? 'Interceptor' : carNameFor(color),
    isPolice: !!isPolice,
    isPlayer: false,
    parked: false,
    wheelSpin: 0,
    route: null,
    roadLines: null,
    turnChance: 0.3,
    turnDir: 1,
    turnSeed: 1,
    turnLock: 0,
    condition: 100,
  };
  return car;
}

export function randomCarColor(rng) {
  return SPECS[Math.floor(rng.next() * SPECS.length)].color;
}

// Spin every wheel of a car (spokes turn with the spinner, not the axle).
export function spinWheels(car) {
  for (const w of car.wheels) {
    if (w.userData.spinner) w.userData.spinner.rotation.y = car.wheelSpin;
  }
}

// Steer the front wheels: the whole wheel group yaws a little with the
// steering input (the spinner keeps spinning inside it).
export function steerWheels(car, angle) {
  if (car.wheels.length >= 2) {
    car.wheels[0].rotation.y = angle;
    car.wheels[1].rotation.y = angle;
  }
}

// A traffic car cruises one road line back and forth, turning at junctions
// (a seeded per-car coin flip, so the same seed always turns the same way)
// and slowing for anything ahead on its line.
export function spawnTrafficCar(scene, rng, cfg, roadLines, half) {
  const axis = rng.chance(0.5) ? 'x' : 'z';
  const line = roadLines[Math.floor(rng.next() * roadLines.length)];
  const dir = rng.chance(0.5) ? 1 : -1;
  const along = rng.range(-half + 20, half - 20);
  const x = axis === 'x' ? along : line;
  const z = axis === 'x' ? line : along;
  const heading = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI;
  const cruise = cfg.car.trafficSpeed + rng.range(-cfg.car.trafficSpeedJitter, cfg.car.trafficSpeedJitter);
  const car = createCar(scene, x, z, heading, randomCarColor(rng), false, cruise);
  car.route = { axis, line, dir };
  car.speed = car.cruiseSpeed;
  car.roadLines = roadLines;
  car.turnChance = 0.2 + rng.next() * 0.25;
  car.turnDir = rng.chance(0.5) ? 1 : -1;
  car.turnSeed = 1 + Math.floor(rng.next() * 100000);
  car.driver.visible = true;
  return car;
}

function headingFor(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

export function updateTrafficCar(car, dt, cars, cfg, pedestrians) {
  if (!car.route) return;
  const r = car.route;
  let target = car.cruiseSpeed;
  // Brake for anything ahead on the same line: other cars (routed or not)
  // and pedestrians crossing the lane.
  const perpOf = (o) => (r.axis === 'x' ? Math.abs(o.group.position.z - r.line) : Math.abs(o.group.position.x - r.line));
  const aheadOf = (o) => {
    const a = r.axis === 'x' ? car.group.position.x : car.group.position.z;
    const b = r.axis === 'x' ? o.group.position.x : o.group.position.z;
    return (b - a) * r.dir;
  };
  for (const other of cars) {
    if (other === car) continue;
    if (perpOf(other) > 3.4) continue;
    const ahead = aheadOf(other);
    if (ahead > 0 && ahead < cfg.traffic.minGap) {
      target = 0;
      break;
    }
  }
  if (target > 0 && pedestrians) {
    for (const p of pedestrians) {
      if (perpOf(p) > cfg.world.roadWidth / 2 + 1.5) continue;
      const ahead = aheadOf(p);
      if (ahead > 0 && ahead < 9) {
        target = 0;
        break;
      }
    }
  }
  // v9 iteration 3: the drivers read the lights. A red light ahead (or a
  // yellow one far enough out to stop) brings the car to a halt at the
  // stop line; a car already inside the intersection keeps going, and a
  // yellow too close to stop for is driven through. The light clock is
  // game time, so the behaviour is deterministic.
  if (target > 0) {
    const light = lightFor(r.axis);
    if (light !== 'green') {
      const pos = r.axis === 'x' ? car.group.position.x : car.group.position.z;
      let nearestAhead = Infinity;
      for (const j of cfg.lights.junctions) {
        const onLine = r.axis === 'x' ? j.z === r.line : j.x === r.line;
        if (!onLine) continue;
        const ahead = ((r.axis === 'x' ? j.x : j.z) - pos) * r.dir;
        if (ahead > 0 && ahead < nearestAhead) nearestAhead = ahead;
      }
      const stopDist = cfg.lights.stopDistance;
      if (nearestAhead <= stopDist && nearestAhead > 3) {
        if (light === 'red' || nearestAhead > 6) target = 0;
      }
    }
  }
  // Traffic AI: cruise, brake for what is ahead, turn at junctions on a
  // seeded coin flip, and now stop at red lights. The same seed always
  // turns the same way at the same junction.
  car.speed += (target - car.speed) * Math.min(1, dt * 2);
  if (!Number.isFinite(car.speed)) car.speed = 0;
  const step = car.speed * r.dir * dt;
  if (r.axis === 'x') car.group.position.x += step;
  else car.group.position.z += step;
  car.turnLock = Math.max(0, car.turnLock - Math.abs(step));
  const pos = r.axis === 'x' ? car.group.position.x : car.group.position.z;
  const half = cfg.world.groundSize / 2 - 30;
  if (pos > half || pos < -half) {
    r.dir *= -1;
    car.heading = headingFor(r.axis, r.dir);
    car.group.rotation.y = car.heading;
    if (r.axis === 'x') car.group.position.x = Math.max(-half, Math.min(half, car.group.position.x));
    else car.group.position.z = Math.max(-half, Math.min(half, car.group.position.z));
    car.turnLock = 12;
  } else if (car.roadLines && car.turnLock <= 0) {
    // Junction turn: the car is crossing a perpendicular road line. A
    // seeded per-car flip decides, so the same seed always turns the same
    // way at the same junction.
    const lines = car.roadLines;
    for (const j of lines) {
      const ahead = (j - pos) * r.dir;
      if (ahead <= 0 || ahead > 2.5) continue;
      car.turnSeed = (car.turnSeed * 1103515245 + 12345) % 2147483648;
      if ((car.turnSeed % 100) / 100 >= car.turnChance) break;
      const newAxis = r.axis === 'x' ? 'z' : 'x';
      const newDir = car.turnDir;
      if (newAxis === 'z') {
        car.group.position.x = j;
        r.axis = 'z';
        r.line = j;
        r.dir = newDir;
      } else {
        car.group.position.z = j;
        r.axis = 'x';
        r.line = j;
        r.dir = newDir;
      }
      car.heading = headingFor(r.axis, r.dir);
      car.group.rotation.y = car.heading;
      car.turnLock = 14;
      break;
    }
  }
  car.wheelSpin += car.speed * dt * 2;
  spinWheels(car);
}

// Skid marks: a small pool of dark strips laid down while handbraking.
export function createSkids(scene) {
  const marks = [];
  const geo = new THREE.PlaneGeometry(0.5, 1.6);
  const mat = new THREE.MeshBasicMaterial({ color: 0x111214, transparent: true, opacity: 0.55 });
  for (let i = 0; i < 120; i += 1) {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    scene.add(m);
    marks.push(m);
  }
  let next = 0;
  return {
    add(x, z, heading) {
      const m = marks[next];
      next = (next + 1) % marks.length;
      m.position.set(x, 0.06, z);
      m.rotation.z = -heading;
      m.visible = true;
    },
  };
}
