// Cars: the mesh factory every car in Costa Fuego is built from, the traffic
// that cruises the road grid (and now turns at junctions and stops at red
// lights), and the skid marks hard driving leaves behind.
//
// v9 iteration 5: the factory is rebuilt on the profile-extrusion
// technique — each class is a 2D side-profile polygon (length forward,
// height up) with a corner radius per point, rounded with quadratic
// corner blends and extruded across the width with a small bevel. The
// body is TWO extrusions: a centre slab (hood, cabin floor, deck) plus
// two fender slabs at the sides whose profile swells over each wheel and
// is cut by the wheel arches, so the fenders stand proud of the hood like
// a real car. The glasshouse is a third, narrower extrusion (tumblehome)
// in tinted glass with a painted roof skin and A/B/C pillars, and a dark
// cabin sits behind the glass. Every class gets its own silhouette —
// proportions, grille, lights, spoiler and rims all differ per class —
// so the traffic reads as nine different cars, not one box in nine
// colours. All numbers are our own, derived from our road width and our
// existing speeds; no other game's constants are used.
import * as THREE from 'three';
import { lightFor } from './trafficlights.js';

// One spec per paint colour. kind drives the body shape and the handling;
// extras are per-model flags. wheelR is the wheel radius, rideH the body
// ride height. Handling multipliers are relative to the base car tuning
// in config (sports fastest + grippiest, muscle strong but loose, van
// slow + heavy, bike fastest off the line and nimblest).
export const SPECS = [
  { color: 0xc23b2e, name: 'Banteng GT', kind: 'muscle', length: 4.7, width: 2.0, bodyH: 0.62, wheelR: 0.48, wheelbase: 3.0, scoop: true, chromeBumpers: true, roundLights: true, tailBar: true, accelMul: 1.15, topMul: 1.05, steerMul: 0.95, gripMul: 0.85, cabin: 'closed' },
  { color: 0x2e6fc2, name: 'Kancil Hatch', kind: 'hatch', length: 3.8, width: 1.85, bodyH: 0.68, wheelR: 0.42, wheelbase: 2.5, roofRails: true, cabin: 'closed', accelMul: 1.0, topMul: 0.95, steerMul: 1.0, gripMul: 1.0 },
  { color: 0xe8c832, name: 'Solano Cabrio', kind: 'cabrio', length: 4.2, width: 1.9, bodyH: 0.55, wheelR: 0.45, wheelbase: 2.7, cabin: 'open', stripes: 0x22262c, accelMul: 1.0, topMul: 1.02, steerMul: 1.05, gripMul: 1.0 },
  { color: 0x3aa655, name: 'Garuda Sedan', kind: 'sedan', length: 4.5, width: 1.95, bodyH: 0.6, wheelR: 0.45, wheelbase: 2.9, cabin: 'closed', accelMul: 1.0, topMul: 1.0, steerMul: 1.0, gripMul: 1.0 },
  { color: 0x8a5fc2, name: 'Furia Sport', kind: 'sport', length: 4.2, width: 2.0, bodyH: 0.5, wheelR: 0.46, wheelbase: 2.9, wing: true, stripes: 0xe8e8e8, sideSkirts: true, slopedLights: true, tailBar: true, dualExhaust: true, cabin: 'closed', accelMul: 1.0, topMul: 1.12, steerMul: 1.1, gripMul: 1.15 },
  { color: 0xd8d8d8, name: 'Lobo Van', kind: 'van', length: 4.8, width: 2.1, bodyH: 0.95, wheelR: 0.46, wheelbase: 3.1, checker: true, roofSign: true, cabin: 'closed', accelMul: 0.8, topMul: 0.82, steerMul: 0.85, gripMul: 0.9 },
  { color: 0x22262c, name: 'Bruto 4x4', kind: 'suv', length: 4.5, width: 2.05, bodyH: 0.78, wheelR: 0.52, wheelbase: 2.8, roofRack: true, cabin: 'closed', accelMul: 0.95, topMul: 0.95, steerMul: 0.95, gripMul: 0.95 },
  { color: 0xe07828, name: 'Vela Coupe', kind: 'coupe', length: 4.3, width: 1.95, bodyH: 0.54, wheelR: 0.46, wheelbase: 2.8, stripes: 0x1a1a22, cabin: 'closed', accelMul: 1.05, topMul: 1.08, steerMul: 1.05, gripMul: 1.05 },
  { color: 0xd84a4a, name: 'Elang 600', kind: 'bike', length: 2.1, width: 0.55, bodyH: 0.5, wheelR: 0.42, wheelbase: 1.4, cabin: 'bike', accelMul: 1.45, topMul: 1.1, steerMul: 1.35, gripMul: 1.2 },
];

const POLICE_SPEC = { color: 0x1a1a22, name: 'Interceptor', kind: 'sedan', length: 4.5, width: 2.0, bodyH: 0.6, wheelR: 0.45, wheelbase: 2.9, cabin: 'closed', twoTone: true, accelMul: 1.1, topMul: 1.1, steerMul: 1.1, gripMul: 1.1 };

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
const CHROME_MAT = new THREE.MeshStandardMaterial({ color: 0xd8dce2, roughness: 0.2, metalness: 0.95 });
const ARCH_MAT = new THREE.MeshStandardMaterial({ color: 0x0e0f11, roughness: 0.9 });

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo(`box-${w}-${h}-${d}`, () => new THREE.BoxGeometry(w, h, d)), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// --- Profile extrusion (v9 iteration 5) -------------------------------------
// A side profile is a list of [u, v, r]: u along the car's length
// (+u = front), v up, r the corner radius at that point. The polygon is
// rounded with quadratic corner blends: each edge runs to r before the
// vertex, the corner is a quadratic bezier with the vertex as its control
// point, and the next edge starts r after it. The profile is then
// extruded across the car's width with a small bevel — smooth normals on
// the bevels and curves, crisp edges at the sharp creases.
function roundedProfile(points) {
  const shape = new THREE.Shape();
  const n = points.length;
  const pt = (i) => points[((i % n) + n) % n];
  // Start on the first edge, r after the first vertex.
  const [x0, y0, r0] = pt(0);
  const [x1, y1] = pt(1);
  const d01 = Math.hypot(x1 - x0, y1 - y0) || 1;
  shape.moveTo(x0 + ((x1 - x0) / d01) * r0, y0 + ((y1 - y0) / d01) * r0);
  for (let i = 1; i <= n; i += 1) {
    const [cx, cy, cr] = pt(i);
    const [nx, ny] = pt(i + 1);
    const [px, py] = pt(i - 1);
    const dIn = Math.hypot(cx - px, cy - py) || 1;
    const dOut = Math.hypot(nx - cx, ny - cy) || 1;
    const inX = cx - ((cx - px) / dIn) * cr;
    const inY = cy - ((cy - py) / dIn) * cr;
    const outX = cx + ((nx - cx) / dOut) * cr;
    const outY = cy + ((ny - cy) / dOut) * cr;
    shape.lineTo(inX, inY);
    shape.quadraticCurveTo(cx, cy, outX, outY);
  }
  shape.closePath();
  return shape;
}

// Extrude a profile across `width` with a bevel, then orient it: shape-x
// (length) becomes world +z (front), shape-y stays up, the extrusion
// becomes world x (width), centred. The geometry is fresh per call — the
// caller owns it (see disposeCarMesh).
function extrudeProfile(points, width, bevel, own) {
  const shape = roundedProfile(points);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width, steps: 1, bevelEnabled: true,
    bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2,
  });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(-Math.PI / 2);
  own(geo);
  return geo;
}

function profileMesh(points, width, bevel, material, own) {
  const m = new THREE.Mesh(extrudeProfile(points, width, bevel, own), material);
  m.castShadow = true;
  return m;
}

// One wheel. Outer group carries the axle rotation (rotation.z = PI/2
// turns the local Y axle onto world X); the inner spinner holds the tire,
// hub and spokes and rotates around local Y, which is the axle.
// Returns the outer group; the spinner lives on group.userData.spinner so
// the drive code can spin it without touching the axle orientation.
// Rim style is per class: 'sport' 5 slim spokes, 'muscle' 5 wide chrome
// spokes, 'steel' a solid steel disc, 'disc' a plain hub disc, 'bike' 6
// thin spokes on a narrow tire.
function makeWheel(r, style = 'sport') {
  const outer = new THREE.Group();
  outer.rotation.z = Math.PI / 2;
  const spinner = new THREE.Group();
  outer.add(spinner);
  const tireW = style === 'bike' ? 0.16 : 0.3;
  const tire = new THREE.Mesh(geo(`tire-${r}-${style}`, () => new THREE.CylinderGeometry(r, r, tireW, 16)), TIRE_MAT);
  tire.castShadow = true;
  spinner.add(tire);
  const hub = new THREE.Mesh(geo(`hub-${r}-${style}`, () => new THREE.CylinderGeometry(r * 0.42, r * 0.42, tireW + 0.04, 12)), style === 'muscle' ? CHROME_MAT : RIM_MAT);
  spinner.add(hub);
  if (style === 'sport' || style === 'muscle') {
    const spokeGeo = geo(`spoke-${r}-${style}`, () => new THREE.BoxGeometry(style === 'muscle' ? 0.2 : 0.13, 0.06, r * 1.75));
    for (let k = 0; k < 5; k += 1) {
      const spoke = new THREE.Mesh(spokeGeo, style === 'muscle' ? CHROME_MAT : RIM_MAT);
      spoke.rotation.y = (k / 5) * Math.PI * 2;
      spinner.add(spoke);
    }
  } else if (style === 'bike') {
    const spokeGeo = geo(`spoke-${r}-bike`, () => new THREE.BoxGeometry(0.05, 0.05, r * 1.8));
    for (let k = 0; k < 6; k += 1) {
      const spoke = new THREE.Mesh(spokeGeo, RIM_MAT);
      spoke.rotation.y = (k / 6) * Math.PI * 2;
      spinner.add(spoke);
    }
  }
  outer.userData.spinner = spinner;
  return outer;
}

// A seated driver: torso + head, small enough to read through the glass.
// v10 (user fix 2): drivers must READ as people behind the wheel. The
// old figure wore a near-black shirt (0x2a2e38) against a dark cabin
// through tinted glass at dusk — invisible, so the frozen jam read as
// "cars with nobody driving them". The shirt now comes from a bright
// palette hashed off the car's own colour (zero rng draws, so the
// seeded city is untouched), and a cap + slightly larger head make
// the silhouette unmistakable through the glass.
const DRIVER_SHIRTS = [0xd84a4a, 0x2e6fc2, 0xe8c832, 0x3aa655, 0xe07828, 0x8a5fc2, 0xd8d8d8, 0x3ac2c2];
function shirtFor(color) {
  let h = (color ^ (color >> 8) ^ (color >> 16)) >>> 0;
  h = (h * 2654435761) >>> 0;
  return DRIVER_SHIRTS[h % DRIVER_SHIRTS.length];
}

function makeDriver(color = 0x2a2e38) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(
    geo('driver-torso', () => new THREE.CapsuleGeometry(0.18, 0.3, 4, 8)),
    mat(shirtFor(color), 0.9),
  );
  torso.position.y = 0.25;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(geo('driver-head', () => new THREE.SphereGeometry(0.14, 10, 8)), mat(0xc89878, 0.7));
  head.position.y = 0.62;
  head.castShadow = true;
  g.add(head);
  const cap = new THREE.Mesh(
    geo('driver-cap', () => new THREE.SphereGeometry(0.155, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
    mat(0x22262c, 0.85),
  );
  cap.position.y = 0.645;
  g.add(cap);
  const brim = new THREE.Mesh(geo('driver-brim', () => new THREE.BoxGeometry(0.2, 0.03, 0.16)), mat(0x22262c, 0.85));
  brim.position.set(0, 0.655, 0.17);
  g.add(brim);
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
    // Sports wing: a wide blade on two stalks with end plates, set low
    // over the fastback deck.
    group.add(box(W * 0.94, 0.05, 0.4, mat(0x14161a, 0.5, 0.5), 0, bodyY + spec.bodyH / 2 + 0.46, -L / 2 + 0.32));
    for (const sx of [-W * 0.3, W * 0.3]) {
      group.add(box(0.08, 0.42, 0.08, mat(0x14161a, 0.5, 0.5), sx, bodyY + spec.bodyH / 2 + 0.24, -L / 2 + 0.32));
    }
    for (const sx of [-W * 0.47, W * 0.47]) {
      group.add(box(0.04, 0.3, 0.4, mat(0x14161a, 0.5, 0.5), sx, bodyY + spec.bodyH / 2 + 0.46, -L / 2 + 0.32));
    }
  }
  if (spec.scoop) {
    // Muscle hood scoop: a raised intake on the long hood.
    group.add(box(0.7, 0.16, 0.9, mat(0x14161a, 0.5, 0.5), 0, bodyY + spec.bodyH / 2 + 0.08, L * 0.22));
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
  // v9 iteration 6 — chrome waist belt on EVERY class, not just the
  // Garuda: a bright line around the waist is what breaks the slab
  // into a body at 20-40 m. Without it the car reads as one flat box
  // of paint; with it the eye gets a waistline, a glasshouse above and
  // a lower body below. The belt is 5 cm tall, 1% wider than the body
  // so it stands proud of the paint on all four sides.
  group.add(box(W * 1.01, 0.05, L * 0.9, CHROME_MAT, 0, bodyY + 0.02, 0));
  if (spec.chromeBumpers) {
    // Muscle chrome bumpers, front + rear.
    group.add(box(W * 0.98, 0.14, 0.14, CHROME_MAT, 0, bodyY - 0.08, L / 2 + 0.06));
    group.add(box(W * 0.98, 0.14, 0.14, CHROME_MAT, 0, bodyY - 0.08, -L / 2 - 0.06));
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
  if (spec.dualExhaust) {
    for (const sx of [-0.5, 0.5]) {
      const pipe = new THREE.Mesh(geo('exhaust', () => new THREE.CylinderGeometry(0.07, 0.07, 0.22, 8)), CHROME_MAT);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(sx, bodyY - 0.12, -L / 2 - 0.08);
      group.add(pipe);
    }
  }
}

// The fender profile: a slab that swells over each wheel and is cut by the
// wheel arches. Points walk from the rear-bottom to the front-bottom along
// the ground line, arc OVER each wheel (absarc, clockwise, through the
// top), then return along the top edge with a gentle swell above each
// wheel. The arch liner (a dark half-torus) and the wheel sit in the cut.
function fenderProfile(L, topV, bottomV, wheelZ, wheelV, archR, swell) {
  const shape = new THREE.Shape();
  const rearU = -L / 2;
  const frontU = L / 2;
  shape.moveTo(rearU, bottomV);
  shape.lineTo(-wheelZ - archR, bottomV);
  shape.absarc(-wheelZ, wheelV, archR, Math.PI, 0, true);
  shape.lineTo(-wheelZ + archR, bottomV);
  shape.lineTo(wheelZ - archR, bottomV);
  shape.absarc(wheelZ, wheelV, archR, Math.PI, 0, true);
  shape.lineTo(wheelZ + archR, bottomV);
  shape.lineTo(frontU, bottomV);
  shape.lineTo(frontU, topV);
  shape.lineTo(wheelZ + archR, topV);
  shape.quadraticCurveTo(wheelZ, topV + swell, wheelZ - archR, topV);
  shape.lineTo(-wheelZ + archR, topV);
  shape.quadraticCurveTo(-wheelZ, topV + swell, -wheelZ - archR, topV);
  shape.lineTo(rearU, topV);
  shape.closePath();
  return shape;
}

function fenderMesh(L, topV, bottomV, wheelZ, wheelV, archR, swell, width, material, own) {
  const shape = fenderProfile(L, topV, bottomV, wheelZ, wheelV, archR, swell);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width, steps: 1, bevelEnabled: true,
    bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1,
  });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(-Math.PI / 2);
  own(geo);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  return m;
}

// The centre-slab side profile per kind: [u, v, r] with +u = front.
// Each class has its own silhouette — the sports car is low with a long
// hood flowing into a fastback deck, the muscle car is long with a tall
// nose, the hatch is short with a tall cabin base, the sedan is a
// classic three-box, the van is a tall box.
function slabProfile(spec, L, bodyY) {
  const top = bodyY + spec.bodyH / 2;
  const bot = bodyY - spec.bodyH / 2;
  const f = L / 2;
  const r = 0.18;
  switch (spec.kind) {
    case 'sport':
      // Low nose, long hood, fastback deck falling to a short tail.
      return [
        [f, top - 0.22, 0.1], [f * 0.55, top - 0.06, 0.22], [f * 0.1, top, 0.25],
        [-f * 0.55, top - 0.1, 0.2], [-f, top - 0.3, 0.12],
        [-f, bot + 0.08, 0.1], [f, bot + 0.08, 0.1],
      ];
    case 'muscle':
      // Long hood, tall nose, flat deck, squared tail.
      return [
        [f, top - 0.08, 0.08], [f * 0.3, top, 0.2], [-f * 0.4, top, 0.2],
        [-f, top - 0.06, 0.1], [-f, bot + 0.08, 0.1], [f, bot + 0.08, 0.1],
      ];
    case 'hatch':
      // Short body, tall flat roof line, upright tail.
      return [
        [f, top - 0.14, 0.12], [f * 0.4, top, 0.2], [-f * 0.5, top, 0.2],
        [-f, top - 0.1, 0.1], [-f, bot + 0.08, 0.1], [f, bot + 0.08, 0.1],
      ];
    case 'van':
    case 'suv':
      // Tall box: flat nose, flat roof, flat tail.
      return [
        [f, top - 0.06, 0.08], [f * 0.5, top, 0.15], [-f * 0.5, top, 0.15],
        [-f, top - 0.06, 0.08], [-f, bot + 0.08, 0.08], [f, bot + 0.08, 0.08],
      ];
    case 'sedan':
    case 'coupe':
    default:
      // Classic three-box: hood, cabin floor, boot.
      return [
        [f, top - 0.16, 0.1], [f * 0.45, top - 0.02, 0.2], [-f * 0.35, top, 0.2],
        [-f, top - 0.12, 0.12], [-f, bot + 0.08, 0.1], [f, bot + 0.08, 0.1],
      ];
  }
}

// The glasshouse profile: a narrower extrusion (tumblehome) with the roof
// line of the class — cab-forward for the sports car, tall for the hatch
// and van, three-box for the sedan.
function glassProfile(spec, cabLen, cabH, cabZ) {
  const f = cabLen / 2;
  const top = cabH;
  const r = 0.12;
  if (spec.kind === 'sport') {
    return [
      [f, 0.08, 0.08], [f * 0.3, top - 0.05, 0.2], [-f * 0.4, top, 0.2],
      [-f, top - 0.28, 0.12], [-f, 0.08, 0.08],
    ];
  }
  if (spec.kind === 'hatch' || spec.kind === 'van' || spec.kind === 'suv') {
    return [
      [f, 0.08, 0.1], [f * 0.5, top, 0.18], [-f * 0.5, top, 0.18],
      [-f, top - 0.06, 0.1], [-f, 0.08, 0.08],
    ];
  }
  return [
    [f, 0.08, 0.1], [f * 0.4, top - 0.02, 0.18], [-f * 0.4, top, 0.18],
    [-f, top - 0.14, 0.12], [-f, 0.08, 0.08],
  ];
}

export function makeCarMesh(color, isPolice) {
  const spec = specFor(color, isPolice);
  const group = new THREE.Group();
  // Per-instance GPU resources this mesh owns (v9 iteration 3, item 12:
  // memory-leak guard). The factory records every geometry/material it
  // creates fresh on group.userData.owned. Everything else — the geo() /
  // mat() caches, GLASS, DARK_GLASS, TIRE_MAT, RIM_MAT, CHROME_MAT,
  // ARCH_MAT, and the checker texture — is shared by every car in the
  // city and must NEVER be disposed: freeing one would break all the
  // others. disposeCarMesh below frees exactly this list, nothing else.
  group.userData.owned = [];
  const own = (r) => { group.userData.owned.push(r); return r; };
  const paint = mat(spec.color, 0.32, 0.55);
  const L = spec.length;
  const W = spec.width;
  const r = spec.wheelR;
  const bodyY = r + spec.bodyH / 2 - 0.04;
  const wheelZ = spec.wheelbase / 2;

  // --- Bikes are built differently: a narrow two-wheeler, not a car. ---
  if (spec.kind === 'bike') {
    return makeBikeMesh(group, own, spec, bodyY);
  }

  // --- Centre slab: the extruded side profile, full width minus fenders. ---
  const slab = profileMesh(slabProfile(spec, L, bodyY), W - 0.24, 0.05, paint, own);
  slab.position.y = 0;
  group.add(slab);

  // --- Two-tone police: a white upper band over the dark slab. ---
  if (spec.twoTone) {
    const belt = bodyY + 0.02;
    const top = bodyY + spec.bodyH / 2;
    const bandProfile = [
      [L / 2 - 0.05, belt, 0.08], [L / 2 - 0.05, top - 0.1, 0.08],
      [-L / 2 + 0.05, top - 0.1, 0.08], [-L / 2 + 0.05, belt, 0.08],
    ];
    const band = profileMesh(bandProfile, W - 0.2, 0.04, mat(0xf2f2f2, 0.4, 0.3), own);
    group.add(band);
  }

  // --- Fender slabs: swell over each wheel, cut by the arches. ---
  const fenderTop = bodyY + spec.bodyH / 2 - 0.06;
  const fenderBot = r * 0.32;
  const archR = r + 0.1;
  const swell = spec.kind === 'muscle' ? 0.12 : spec.kind === 'sport' ? 0.1 : 0.06;
  for (const side of [-1, 1]) {
    const fender = fenderMesh(L - 0.1, fenderTop, fenderBot, wheelZ, r, archR, swell, 0.12, paint, own);
    fender.position.x = side * (W / 2 - 0.06);
    group.add(fender);
  }

  // Bumpers and grille — per class: the muscle car gets a tall chrome
  // grille with vertical bars, the sports car a wide low grille, the
  // others a slim dark grille.
  if (spec.chromeBumpers) {
    // (chrome bumpers are added by addExtras below)
  } else {
    group.add(box(W * 0.98, 0.16, 0.22, mat(0x1c1e22, 0.5, 0.6), 0, r + 0.12, L / 2 + 0.02));
    group.add(box(W * 0.98, 0.16, 0.22, mat(0x1c1e22, 0.5, 0.6), 0, r + 0.12, -L / 2 - 0.02));
    // v9 iteration 6: a thin chrome strip on top of each dark bumper,
    // front and rear — the bumper's bright edge is what reads as a
    // bumper at distance; the dark slab alone vanished into the body.
    group.add(box(W * 0.98, 0.05, 0.24, CHROME_MAT, 0, r + 0.22, L / 2 + 0.02));
    group.add(box(W * 0.98, 0.05, 0.24, CHROME_MAT, 0, r + 0.22, -L / 2 - 0.02));
  }
  if (spec.roundLights) {
    // Muscle round headlights: chrome rings with a warm lens.
    for (const hx of [-W * 0.3, W * 0.3]) {
      const ring = new THREE.Mesh(geo('headring', () => new THREE.TorusGeometry(0.17, 0.035, 8, 16)), CHROME_MAT);
      ring.position.set(hx, bodyY + 0.1, L / 2 + 0.06);
      group.add(ring);
    }
    group.add(box(W * 0.5, 0.14, 0.06, mat(0x0e0f11, 0.6, 0.4), 0, bodyY + 0.02, L / 2 + 0.06));
  } else {
    group.add(box(W * 0.5, 0.16, 0.08, mat(0x0e0f11, 0.6, 0.4), 0, bodyY + 0.02, L / 2 + 0.06));
  }

  // Cabin: tinted glasshouse (narrower than the body — tumblehome) with a
  // painted roof skin, A/B/C pillars, and a dark cabin behind the glass.
  // Open cabins (the cabrio) get a windshield and no roof.
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
    const glass = profileMesh(glassProfile(spec, cabLen, cabH, cabZ), W * 0.78, 0.04, GLASS, own);
    glass.position.set(0, cabY - cabH / 2, cabZ);
    group.add(glass);
    // Roof skin: a thin painted extrusion over the glasshouse top.
    const roofProfile = [
      [cabLen / 2, cabH - 0.1, 0.1], [cabLen / 2 - 0.1, cabH + 0.06, 0.1],
      [-cabLen / 2 + 0.1, cabH + 0.06, 0.1], [-cabLen / 2, cabH - 0.1, 0.1],
    ];
    const roof = profileMesh(roofProfile, W * 0.8, 0.03, paint, own);
    roof.position.set(0, cabY - cabH / 2, cabZ);
    group.add(roof);
    // Pillars: A (front), B (middle, splits the windows), C (rear).
    for (const pz of [cabZ + cabLen / 2 - 0.06, cabZ, cabZ - cabLen / 2 + 0.06]) {
      for (const px of [-W * 0.38, W * 0.38]) {
        group.add(box(0.09, cabH * 0.9, 0.09, DARK_GLASS, px, cabY, pz));
      }
    }
    // Dark cabin behind the glass: dash + seats + driver shadow.
    // v10 (user fix 2): lowered + thinned — the old slab (top at body
    // top +0.23) swallowed the driver's torso whole, so only a dark
    // head showed. The driver's shoulders now clear it.
    group.add(box(W * 0.7, 0.18, cabLen * 0.8, mat(0x14161a, 0.9), 0, bodyY + spec.bodyH / 2 - 0.02, cabZ));
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
  const driver = makeDriver(color);
  // Seated so the head sits in the glass band with its top just under
  // the roofline (v10, user fix 2: the old fixed seat height put a
  // sedan driver's head through the roof skin and hid the torso in
  // the cabin slab). Bikes keep the rider on top of the machine.
  const seatY = spec.kind === 'bike'
    ? bodyY + spec.bodyH / 2 - 0.04
    : bodyY + spec.bodyH / 2 + cabH - 0.85;
  driver.position.set(-W * 0.2, seatY, cabZ - 0.05);
  group.add(driver);

  // Wheels: arch lips over them, per-class rims inside, steering on the
  // fronts. The rim style differs per class — sports 5 slim spokes,
  // muscle 5 wide chrome spokes, hatch/sedan/van steel discs.
  const wheels = [];
  const wheelX = W / 2 - 0.06;
  const archGeo = geo(`arch-${r}`, () => new THREE.TorusGeometry(r + 0.07, 0.08, 6, 12, Math.PI));
  const rimStyle = spec.kind === 'sport' || spec.kind === 'coupe' ? 'sport'
    : spec.kind === 'muscle' ? 'muscle' : 'steel';
  for (const [wx, wz] of [[-wheelX, wheelZ], [wheelX, wheelZ], [-wheelX, -wheelZ], [wheelX, -wheelZ]]) {
    const arch = new THREE.Mesh(archGeo, ARCH_MAT);
    arch.position.set(wx, r, wz);
    arch.rotation.y = Math.PI / 2;
    group.add(arch);
    // Arch liner: a dark well behind the wheel so the arch reads as a cut.
    const liner = new THREE.Mesh(geo(`liner-${r}`, () => new THREE.CylinderGeometry(r + 0.05, r + 0.05, 0.1, 12, 1, true)), ARCH_MAT);
    liner.rotation.z = Math.PI / 2;
    liner.position.set(wx, r, wz);
    group.add(liner);
    const w = makeWheel(r, rimStyle);
    w.position.set(wx, r, wz);
    group.add(w);
    wheels.push(w);
  }

  // Headlights that glow, taillights that read red at dusk.
  // Per-car materials (owned — see makeCarMesh) so one car's lights can
  // be disposed without touching any other car.
  // v9 iteration 4: HDR colours (> 1) so only the lights bloom — the
  // bloom threshold is 0.9 and a plain 0xfff6c8 would not clear it.
  const headMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.4) }));
  if (spec.slopedLights) {
    // Sports sloped headlights: angled into the hood line.
    for (const hx of [-W * 0.32, W * 0.32]) {
      const lamp = box(0.36, 0.14, 0.08, headMat, hx, bodyY + 0.12, L / 2 + 0.08);
      lamp.rotation.x = -0.25;
      group.add(lamp);
    }
  } else if (spec.roundLights) {
    for (const hx of [-W * 0.3, W * 0.3]) {
      const lens = new THREE.Mesh(geo('headlens-round', () => new THREE.CylinderGeometry(0.14, 0.14, 0.06, 12)), headMat);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(hx, bodyY + 0.1, L / 2 + 0.08);
      group.add(lens);
    }
  } else {
    for (const hx of [-W * 0.32, W * 0.32]) {
      group.add(box(0.34, 0.16, 0.08, headMat, hx, bodyY + 0.08, L / 2 + 0.1));
    }
  }
  const tailMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.25, 0.2) }));
  if (spec.tailBar) {
    // Full-width red tail bar (sports + muscle).
    group.add(box(W * 0.86, 0.14, 0.08, tailMat, 0, bodyY + 0.1, -L / 2 - 0.08));
  } else if (spec.kind === 'van') {
    // Tall vertical taillights on the van's tail.
    for (const tx of [-W * 0.42, W * 0.42]) {
      group.add(box(0.16, 0.5, 0.08, tailMat, tx, bodyY + 0.15, -L / 2 - 0.08));
    }
  } else {
    for (const tx of [-W * 0.32, W * 0.32]) {
      group.add(box(0.34, 0.16, 0.08, tailMat, tx, bodyY + 0.08, -L / 2 - 0.1));
    }
  }

  // v9 iteration 6 — side marker lights: amber at the front fenders,
  // red at the rear, on both flanks. A car seen from the side at dusk
  // is a dark slab with a glasshouse; the four markers (HDR, so they
  // bloom like the headlights) are what say "car" from the side, and
  // they are what keeps a dark parked car readable after dark.
  const markerAmber = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.2, 0.25) }));
  const markerRed = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.25, 0.2) }));
  for (const side of [-1, 1]) {
    group.add(box(0.04, 0.1, 0.22, markerAmber, side * (W / 2 + 0.02), bodyY + 0.05, L / 2 - 0.55));
    group.add(box(0.04, 0.1, 0.22, markerRed, side * (W / 2 + 0.02), bodyY + 0.05, -L / 2 + 0.55));
  }

  // Door seams + handles + mirrors + plates: the details that make the
  // slab read as a car from the side.
  for (const side of [-1, 1]) {
    group.add(box(0.03, spec.bodyH * 0.7, 0.03, mat(0x0e0f11, 0.7), side * (W / 2 + 0.01), bodyY, 0.1));
    group.add(box(0.03, 0.05, 0.28, CHROME_MAT, side * (W / 2 + 0.02), bodyY + 0.14, 0.25));
    const mirror = box(0.12, 0.1, 0.06, paint, side * (W / 2 + 0.1), cabY - 0.1, cabZ + cabLen / 2 - 0.15);
    group.add(mirror);
  }
  group.add(box(0.5, 0.14, 0.03, mat(0xf2f2f2, 0.5), 0, bodyY - 0.08, L / 2 + 0.1));
  group.add(box(0.5, 0.14, 0.03, mat(0xf2f2f2, 0.5), 0, bodyY - 0.08, -L / 2 - 0.1));

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

  return { group, wheels, driver, lightBar, headMat, tailMat };
}

// The bike (Elang 600): a narrow two-wheeler — a slim tank extrusion,
// a front fork with a handlebar, a seat, two thin-spoked wheels in line,
// and a rider leaning forward. It shares the car's interface (wheels,
// driver, head/tail mats) so the game drives it like any other car.
function makeBikeMesh(group, own, spec, bodyY) {
  const paint = mat(spec.color, 0.32, 0.55);
  const L = spec.length;
  const r = spec.wheelR;
  const wheelZ = spec.wheelbase / 2;
  // Slim tank + tail profile, extruded narrow.
  const tankProfile = [
    [L / 2, 0.55, 0.08], [L * 0.2, 0.78, 0.15], [-L * 0.25, 0.72, 0.15],
    [-L / 2, 0.5, 0.08], [-L / 2, 0.3, 0.05], [L / 2, 0.3, 0.05],
  ];
  const tank = profileMesh(tankProfile, 0.42, 0.03, paint, own);
  tank.position.y = bodyY - 0.1;
  group.add(tank);
  // Seat.
  group.add(box(0.34, 0.1, 0.7, mat(0x14161a, 0.9), 0, bodyY + 0.62, -L * 0.28));
  // Front fork: two angled tubes from the steering head to the front axle.
  for (const sx of [-0.14, 0.14]) {
    const fork = new THREE.Mesh(geo('fork', () => new THREE.CylinderGeometry(0.035, 0.035, 0.95, 6)), CHROME_MAT);
    fork.position.set(sx, 0.75, wheelZ - 0.15);
    fork.rotation.x = 0.5;
    group.add(fork);
  }
  // Handlebar.
  const bar = new THREE.Mesh(geo('handlebar', () => new THREE.CylinderGeometry(0.03, 0.03, 0.62, 6)), mat(0x14161a, 0.5, 0.6));
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 1.18, wheelZ - 0.32);
  group.add(bar);
  // Rider: the driver figure, leaning forward over the tank.
  const driver = makeDriver();
  driver.position.set(0, bodyY + 0.45, -L * 0.18);
  driver.rotation.x = 0.35;
  group.add(driver);
  // Two wheels in line, thin-spoked.
  const wheels = [];
  for (const wz of [wheelZ, -wheelZ]) {
    const w = makeWheel(r, 'bike');
    w.position.set(0, r, wz);
    group.add(w);
    wheels.push(w);
  }
  // Round headlight + small tail.
  const headMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.4) }));
  const lens = new THREE.Mesh(geo('bikelens', () => new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12)), headMat);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 1.0, L / 2 + 0.05);
  group.add(lens);
  const tailMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.25, 0.2) }));
  group.add(box(0.16, 0.1, 0.06, tailMat, 0, 0.85, -L / 2 - 0.05));
  return { group, wheels, driver, lightBar: null, headMat, tailMat };
}

// Dispose the per-instance GPU resources of a car mesh built by
// makeCarMesh, before the group leaves the scene (v9 iteration 3, item 12:
// memory-leak guard). Frees exactly group.userData.owned — the geometries
// and materials the factory created fresh for this car — and nothing else.
// Shared resources (the geo()/mat() caches, GLASS, TIRE_MAT, RIM_MAT,
// CHROME_MAT, ARCH_MAT) are never in that list, so no other car is affected. A
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
  const spec = specFor(color, isPolice);
  const car = {
    group: mesh.group,
    wheels: mesh.wheels,
    driver: mesh.driver,
    lightBar: mesh.lightBar,
    headMat: mesh.headMat,
    tailMat: mesh.tailMat,
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
    // v10 (user fix 2): one seeded turn roll per junction approach
    // (turnRolledAt = the junction line last rolled), plus the stall
    // watchdog's stopped clock. See updateTrafficCar.
    turnRolledAt: null,
    stoppedTime: 0,
    condition: 100,
    // v9 iteration 5: per-class handling — the game multiplies the base
    // car tuning by these. Bikes steer with the front wheel only.
    accelMul: spec.accelMul ?? 1,
    topMul: spec.topMul ?? 1,
    steerMul: spec.steerMul ?? 1,
    gripMul: spec.gripMul ?? 1,
    kind: spec.kind,
    steerIdx: spec.kind === 'bike' ? [0] : [0, 1],
  };
  return car;
}

// Traffic mix (v9 iteration 5): sedans + hatchbacks dominate the streets,
// then vans, muscle and the rest; sports cars and bikes are the rarest
// sight. One rng draw per pick, like before.
const MIX = [
  { name: 'Garuda Sedan', w: 3 }, { name: 'Kancil Hatch', w: 3 },
  { name: 'Lobo Van', w: 2 }, { name: 'Banteng GT', w: 2 },
  { name: 'Furia Sport', w: 1 }, { name: 'Vela Coupe', w: 1 },
  { name: 'Solano Cabrio', w: 1 }, { name: 'Bruto 4x4', w: 1 },
  { name: 'Elang 600', w: 0.5 },
];
const MIX_TOTAL = MIX.reduce((a, m) => a + m.w, 0);
export function randomCarColor(rng) {
  let roll = rng.next() * MIX_TOTAL;
  for (const m of MIX) {
    roll -= m.w;
    if (roll <= 0) {
      const s = SPECS.find((x) => x.name === m.name);
      return s ? s.color : SPECS[0].color;
    }
  }
  return SPECS[0].color;
}

// Right-hand lane offset (v9 iteration 5): traffic drives on the right,
// two lanes each way on the 20 m roads — the inner lane at ±2.5, the
// outer at ±7.5. The offset is on the perpendicular axis: for an
// east-west road it shifts z, for a north-south road it shifts x.
export function laneFor(axis, dir) {
  return axis === 'x' ? dir * 2.5 : -dir * 2.5;
}

// Spin every wheel of a car (spokes turn with the spinner, not the axle).
export function spinWheels(car) {
  for (const w of car.wheels) {
    if (w.userData.spinner) w.userData.spinner.rotation.y = car.wheelSpin;
  }
}

// Steer the front wheels: the whole wheel group yaws a little with the
// steering input (the spinner keeps spinning inside it). Bikes steer the
// front wheel only (steerIdx [0]).
export function steerWheels(car, angle) {
  const idx = car.steerIdx || [0, 1];
  for (const i of idx) {
    if (car.wheels[i]) car.wheels[i].rotation.y = angle;
  }
}

// A traffic car cruises one road line back and forth, turning at junctions
// (a seeded per-car coin flip, so the same seed always turns the same way)
// and slowing for anything ahead on its line. It drives in its right-hand
// lane (line + lane offset), not on the centre line.
export function spawnTrafficCar(scene, rng, cfg, roadLines, half) {
  const axis = rng.chance(0.5) ? 'x' : 'z';
  const line = roadLines[Math.floor(rng.next() * roadLines.length)];
  const dir = rng.chance(0.5) ? 1 : -1;
  const along = rng.range(-half + 20, half - 20);
  const lane = laneFor(axis, dir);
  const x = axis === 'x' ? along : line + lane;
  const z = axis === 'x' ? line + lane : along;
  const heading = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI;
  const cruise = cfg.car.trafficSpeed + rng.range(-cfg.car.trafficSpeedJitter, cfg.car.trafficSpeedJitter);
  const car = createCar(scene, x, z, heading, randomCarColor(rng), false, cruise);
  car.route = { axis, line, dir, lane };
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
  // Routes built before the lane offset existed (police patrols, staged
  // shots, probes) get their lane from the axis + direction.
  if (r.lane === undefined) r.lane = laneFor(r.axis, r.dir);
  let target = car.cruiseSpeed;
  // Brake for the car ahead in YOUR lane and pedestrians crossing it.
  // Lanes are 5 m apart, so a car in the opposite lane never triggers
  // the brake — only the car ahead in your lane does.
  // v10 (user fix 2 — the permanent jam): the brake used to fire for
  // ANY car near your lane corridor ahead of you, including one on the
  // PERPENDICULAR road crossing a junction box. Two cars in a junction
  // box each sat "ahead" of the other along its own axis, braked for
  // each other forever, and the whole fleet queued into the corner —
  // a total gridlock within ~90 seconds (reproduced in a standalone
  // sim of this exact logic, every seed). Now a routed car only
  // brakes for a true leader: same axis, same direction. Non-routed
  // cars (parked, the player's car, roadblocks, chasing police) are
  // physical obstacles and still stop traffic. Cross traffic is the
  // lights' job, not the brake's.
  const perpOf = (o) => (r.axis === 'x' ? Math.abs(o.group.position.z - (r.line + r.lane)) : Math.abs(o.group.position.x - (r.line + r.lane)));
  const aheadOf = (o) => {
    const a = r.axis === 'x' ? car.group.position.x : car.group.position.z;
    const b = r.axis === 'x' ? o.group.position.x : o.group.position.z;
    return (b - a) * r.dir;
  };
  let blocker = null;
  for (const other of cars) {
    if (other === car) continue;
    if (other.route && (other.route.axis !== r.axis || other.route.dir !== r.dir)) continue;
    if (perpOf(other) > 3.4) continue;
    const ahead = aheadOf(other);
    if (ahead > 0 && ahead < cfg.traffic.minGap) {
      target = 0;
      blocker = other;
      break;
    }
  }
  if (target > 0 && pedestrians) {
    for (const p of pedestrians) {
      // v9 (user fix 1): brake only for a ped actually in this car's
      // lane corridor — the old 11.5 m perpendicular window reached
      // the sidewalks, so cars stopped for people who were never in
      // the road. A ped crossing the lane still stops the car.
      if (perpOf(p) > 4.5) continue;
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
  // v10 (user fix 2): stall watchdog — insurance against any residual
  // deadlock the same-direction brake cannot see (police patrols,
  // staged shots). A car stopped for 15 s behind another ROUTED car
  // that is itself stopped, with its light green, creeps forward at
  // 2 m/s until it moves again. Waiting at a red light, for a
  // pedestrian, or behind a parked / player car is correct behaviour
  // and never creeps. In the standalone sim the same-direction brake
  // alone kept every seed flowing for 600 s (longest stop 6.4 s, a
  // red-light queue), so this should never fire in normal play.
  if (car.speed < 0.5) car.stoppedTime = (car.stoppedTime || 0) + dt;
  else car.stoppedTime = 0;
  if (target === 0 && blocker && blocker.route && blocker.speed < 0.5
    && car.stoppedTime > 15 && lightFor(r.axis) === 'green') {
    target = 2;
  }
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
    r.lane = laneFor(r.axis, r.dir);
    // Flip to the other lane (the right-hand lane for the new direction).
    if (r.axis === 'x') car.group.position.z = r.line + r.lane;
    else car.group.position.x = r.line + r.lane;
    car.heading = headingFor(r.axis, r.dir);
    car.group.rotation.y = car.heading;
    if (r.axis === 'x') car.group.position.x = Math.max(-half, Math.min(half, car.group.position.x));
    else car.group.position.z = Math.max(-half, Math.min(half, car.group.position.z));
    car.turnLock = 12;
  } else if (car.roadLines && car.turnLock <= 0) {
    // Junction turn: the car is crossing a perpendicular road line. A
    // seeded per-car flip decides, so the same seed always turns the same
    // way at the same junction.
    // v10 (user fix 2): ONE roll per junction approach. The old code
    // re-rolled on every step inside the 2.5 m window, compounding a
    // 20-45% turn chance into ~97-100% — cars turned at nearly every
    // junction, constantly snapping into perpendicular lanes inside
    // junction boxes, which fed the gridlock the brake fix above
    // removes. The roll is armed again once the car is between
    // junctions, so the same line value approached later rolls fresh.
    const lines = car.roadLines;
    let nearestJ = null;
    let nearestAhead = Infinity;
    for (const j of lines) {
      const ahead = (j - pos) * r.dir;
      if (ahead > 0 && ahead < nearestAhead) { nearestAhead = ahead; nearestJ = j; }
    }
    if (nearestJ === null || nearestAhead > 2.5) {
      car.turnRolledAt = null;
    } else if (car.turnRolledAt !== nearestJ) {
      car.turnRolledAt = nearestJ;
      car.turnSeed = (car.turnSeed * 1103515245 + 12345) % 2147483648;
      if ((car.turnSeed % 100) / 100 < car.turnChance) {
        // v9 (user fix 1): the turn DIRECTION is re-rolled at every
        // junction from the same seeded stream — a fixed per-car turn
        // direction made cars circle the same block forever. Going
        // straight stays the default (turnChance), so routes wander the
        // grid instead of looping one spot.
        car.turnDir = car.turnSeed % 2 === 0 ? 1 : -1;
        const newAxis = r.axis === 'x' ? 'z' : 'x';
        const newDir = car.turnDir;
        const newLane = laneFor(newAxis, newDir);
        if (newAxis === 'z') {
          car.group.position.x = nearestJ + newLane;
          r.axis = 'z';
          r.line = nearestJ;
          r.dir = newDir;
          r.lane = newLane;
        } else {
          car.group.position.z = nearestJ + newLane;
          r.axis = 'x';
          r.line = nearestJ;
          r.dir = newDir;
          r.lane = newLane;
        }
        car.heading = headingFor(r.axis, r.dir);
        car.group.rotation.y = car.heading;
        car.turnLock = 14;
        car.turnRolledAt = null;
      }
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
  let added = 0;
  return {
    add(x, z, heading) {
      const m = marks[next];
      next = (next + 1) % marks.length;
      added += 1;
      m.position.set(x, 0.06, z);
      m.rotation.z = -heading;
      m.visible = true;
    },
    // How many marks have ever been laid (capped at the pool size) — the
    // probe reads this to prove handbrake drifting actually leaves marks.
    count() {
      return Math.min(added, marks.length);
    },
  };
}
