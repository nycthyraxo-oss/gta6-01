// Cars: the mesh factory every car in Costa Fuego is built from, the traffic
// that cruises the road grid, and the skid marks hard driving leaves behind.
import * as THREE from 'three';

const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xe8c832, 0x3aa655, 0x8a5fc2, 0xd8d8d8, 0x22262c, 0xe07828];

// Original model names, one per paint colour, shown in the HUD speedo.
const CAR_NAMES = ['Cometa GT', 'Brisa Hatch', 'Solano Cabrio', 'Toro Sedan', 'Furia Sport', 'Lobo Van', 'Bruto 4x4', 'Vela Coupe'];

export function carNameFor(color) {
  const idx = CAR_COLORS.indexOf(color);
  return idx >= 0 ? CAR_NAMES[idx] : 'Cometa GT';
}

export function makeCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x18222c, roughness: 0.15, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.65, 4.4), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), glass);
  cabin.position.set(0, 1.15, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95 });
  const wheelPos = [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]];
  const wheels = [];
  for (const [wx, wz] of wheelPos) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    w.castShadow = true;
    group.add(w);
    wheels.push(w);
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const hx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), headMat);
    h.position.set(hx, 0.6, 2.22);
    group.add(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
  for (const tx of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), tailMat);
    t.position.set(tx, 0.6, -2.22);
    group.add(t);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar.position.set(0, 1.55, -0.2);
    group.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar2.position.set(0.3, 1.55, -0.2);
    group.add(bar2);
  }
  return { group, wheels };
}

export function createCar(scene, x, z, heading, color, isPolice, cruiseSpeed) {
  const mesh = makeCarMesh(color, isPolice);
  mesh.group.position.set(x, 0, z);
  mesh.group.rotation.y = heading;
  scene.add(mesh.group);
  const speed = Number.isFinite(cruiseSpeed) ? cruiseSpeed : 9;
  return {
    group: mesh.group,
    wheels: mesh.wheels,
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
  };
}

export function randomCarColor(rng) {
  return CAR_COLORS[Math.floor(rng.next() * CAR_COLORS.length)];
}

// A traffic car cruises one road line back and forth, turning around at the
// city edge, and slows when the car ahead on its line is too close.
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
  return car;
}

export function updateTrafficCar(car, dt, cars, cfg) {
  if (!car.route) return;
  const r = car.route;
  let target = car.cruiseSpeed;
  // Slow down for a car ahead on the same line.
  for (const other of cars) {
    if (other === car || !other.route || other.route.axis !== r.axis || other.route.line !== r.line) continue;
    const a = r.axis === 'x' ? car.group.position.x : car.group.position.z;
    const b = r.axis === 'x' ? other.group.position.x : other.group.position.z;
    const ahead = (b - a) * r.dir;
    if (ahead > 0 && ahead < cfg.traffic.minGap) {
      target = 0;
      break;
    }
  }
  car.speed += (target - car.speed) * Math.min(1, dt * 2);
  if (!Number.isFinite(car.speed)) car.speed = 0;
  const step = car.speed * r.dir * dt;
  if (r.axis === 'x') car.group.position.x += step;
  else car.group.position.z += step;
  const pos = r.axis === 'x' ? car.group.position.x : car.group.position.z;
  const half = cfg.world.groundSize / 2 - 30;
  if (pos > half || pos < -half) {
    r.dir *= -1;
    car.heading = r.axis === 'x' ? (r.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : r.dir > 0 ? 0 : Math.PI;
    car.group.rotation.y = car.heading;
    if (r.axis === 'x') car.group.position.x = Math.max(-half, Math.min(half, car.group.position.x));
    else car.group.position.z = Math.max(-half, Math.min(half, car.group.position.z));
  }
  car.wheelSpin += car.speed * dt * 2;
  for (const w of car.wheels) w.rotation.x = car.wheelSpin;
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
