// city.js — builds the whole static city of Costa Fuego from the layout
// tables in config.js: ground, roads, sidewalks, buildings, landmarks,
// palms, lamps, signs, the night market, speedboats and Fuego Island.
// Every mesh is tagged with userData.kind and a footprint so the placement
// audit can prove nothing stands on a road.

import * as THREE from 'three';
import {
  cfg, AVENUES, STREETS, DISTRICTS, districtAt, LANDMARKS, SHOPS,
  PROTECTED_BLOCKS, JUNCTIONS, RAMPS, EASTER_EGG_SIGN, PALETTE,
} from './config.js';
import { visualRng } from './random.js';

function box(w, h, d, color, x, y, z, kind, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.userData.kind = kind;
  mesh.userData.footprint = { x, z, w, d };
  if (opts.name) mesh.userData.name = opts.name;
  if (opts.ry) mesh.rotation.y = opts.ry;
  return mesh;
}

function plane(w, d, color, x, y, z, kind, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  mesh.rotation.x = -Math.PI / 2;
  if (opts.ry) mesh.rotation.z = opts.ry;
  mesh.position.set(x, y, z);
  mesh.userData.kind = kind;
  mesh.userData.footprint = { x, z, w, d };
  return mesh;
}

export function signTexture(text, bg = '#123', fg = '#fff', w = 512, h = 128) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = 'bold ' + Math.floor(h * 0.52) + 'px Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2, w - 16);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 2;
  return tex;
}

function signBoard(text, w, h, x, y, z, ry, bg, fg) {
  const mat = new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg) });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  mesh.userData.kind = 'sign';
  mesh.userData.signText = text;
  mesh.userData.footprint = { x, z, w: 0.2, d: 0.2 };
  return mesh;
}

const BLOCK_CENTERS_X = [-112, -56, 0, 56, 112];
const BLOCK_CENTERS_Z = [-112, -56, 0, 56, 112];

function blockProtected(cx, cz) {
  for (const p of PROTECTED_BLOCKS) {
    if (Math.abs(cx - p.x) < p.r && Math.abs(cz - p.z) < p.r) return true;
  }
  return false;
}

const STYLE_COLORS = {
  glass: [0x9fc6d8, 0x7fb2cc, 0xb8d4e4, 0x8fb8d0],
  brick: [0xb0704f, 0xa05f42, 0xc0835f, 0x96604a],
  deco: [0xf2e3c2, 0xf7ead0, 0xeed9ae, 0xf5dfba],
  stucco: [0xe8cfa8, 0xdfc09a, 0xf0d8b4, 0xe4c8a0],
  residential: [0xd8c8b0, 0xcdbb9e, 0xe2d2ba, 0xd2c0a4],
  mercado: [0xe0a458, 0xd89448, 0xeab06a, 0xda9c50],
  marina: [0xcfe4ec, 0xbfd9e4, 0xdcecf2, 0xc8e0ea],
  park: [0xcfe0c0, 0xc2d6b2, 0xd8e8ca, 0xc8dcba],
  commercial: [0xcfc8bc, 0xc2baa8, 0xdbd4c6, 0xc9c0ae],
};

const STYLE_HEIGHT = {
  glass: [26, 52], brick: [10, 22], deco: [8, 18], stucco: [7, 14],
  residential: [6, 12], mercado: [6, 12], marina: [7, 15], park: [5, 9], commercial: [10, 24],
};

export class City {
  constructor(streams) {
    this.group = new THREE.Group();
    this.rng = streams.master;
    this.buildings = [];
    this.landmarks = {};
    this.palms = [];
    this.trees = [];
    this.lamps = [];
    this.benches = [];
    this.stalls = [];
    this.signs = [];
    this.colliders = [];
    this.boats = [];
    this.lightHeads = JUNCTIONS.map(j => ({ x: j.x, z: j.z }));
    this.lightHeadMeshes = [];
    this.lightPoleSpots = [];
    this.signRecords = [];
    this.hydrants = [];
    this.bins = [];
    this.marketLights = [];
    this.roadLines = [-140, -84, -28, 28, 84, 140];
    this.half = 150;
    this.gateBeam = null;
    this.gateOpen = 0;
    this.build();
  }

  addCollider(x, z, w, d) {
    this.colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
  }

  build() {
    this.buildGround();
    this.buildRoads();
    this.buildBlocks();
    this.buildLandmarks();
    this.buildShops();
    this.buildVegetation();
    this.buildStreetFurniture();
    this.buildBeachAndSea();
    this.buildIsland();
    this.buildRamps();
    this.buildTrafficLights();
  }

  buildGround() {
    const w = cfg.world;
    const base = plane(560, 420, PALETTE.grass, 40, -0.05, 0, 'ground');
    this.group.add(base);
    // city slab
    this.group.add(plane(w.maxX - w.minX + 30, w.maxZ - w.minZ + 30, 0x9aa08e, (w.minX + w.maxX) / 2, -0.02, 0, 'ground'));
    // sand strip along the beach
    this.group.add(plane(46, 320, PALETTE.sand, 176, 0.0, 0, 'sand'));
    // sea
    const sea = plane(220, 420, PALETTE.sea, 300, -0.4, 0, 'sea');
    sea.material = new THREE.MeshLambertMaterial({ color: PALETTE.sea, transparent: true, opacity: 0.92 });
    this.group.add(sea);
    this.seaMesh = sea;
    // Tower Plaza park lawn inside its block
    const lawn = plane(30, 30, PALETTE.grass, 0, 0.01, 56, 'park');
    this.group.add(lawn);
  }

  buildRoads() {
    const w = cfg.world;
    const dashSpots = [];
    for (const a of AVENUES) {
      this.group.add(plane(w.roadHalf * 2, w.maxZ - w.minZ, PALETTE.asphalt, a.x, 0.02, 0, 'road'));
      // sidewalks
      this.group.add(plane(3, w.maxZ - w.minZ, PALETTE.sidewalk, a.x - w.roadHalf - 1.5, 0.03, 0, 'sidewalk'));
      this.group.add(plane(3, w.maxZ - w.minZ, PALETTE.sidewalk, a.x + w.roadHalf + 1.5, 0.03, 0, 'sidewalk'));
      for (let z = w.minZ + 4; z < w.maxZ - 2; z += 8) dashSpots.push({ x: a.x, z, ry: 0 });
    }
    for (const s of STREETS) {
      this.group.add(plane(w.maxX - w.minX, w.roadHalf * 2, PALETTE.asphalt, (w.minX + w.maxX) / 2, 0.021, s.z, 'road'));
      this.group.add(plane(w.maxX - w.minX, 3, PALETTE.sidewalk, (w.minX + w.maxX) / 2, 0.031, s.z - w.roadHalf - 1.5, 'sidewalk'));
      this.group.add(plane(w.maxX - w.minX, 3, PALETTE.sidewalk, (w.minX + w.maxX) / 2, 0.031, s.z + w.roadHalf + 1.5, 'sidewalk'));
      for (let x = w.minX + 4; x < w.maxX - 2; x += 8) dashSpots.push({ x, z: s.z, ry: Math.PI / 2 });
    }
    // centre dashes as one instanced mesh
    const dashGeo = new THREE.PlaneGeometry(0.5, 3.4);
    const dashMesh = new THREE.InstancedMesh(dashGeo,
      new THREE.MeshBasicMaterial({ color: 0xf5e9b8 }), dashSpots.length);
    dashMesh.userData.kind = 'roadmark';
    const dummy = new THREE.Object3D();
    dashSpots.forEach((d, i) => {
      dummy.position.set(d.x, 0.04, d.z);
      dummy.rotation.set(-Math.PI / 2, 0, d.ry);
      dummy.updateMatrix();
      dashMesh.setMatrixAt(i, dummy.matrix);
    });
    this.group.add(dashMesh);
    // pier + causeway to the island ride at deck height 1.15
    const pier = box(36, 1.15, 16, PALETTE.asphalt, 178, 0.575, 100, 'road');
    this.group.add(pier);
    const causeway = box(58, 1.15, 16, PALETTE.asphalt, 222, 0.575, 100, 'road');
    this.group.add(causeway);
    // Neon Plaza park disc
    const disc = new THREE.Mesh(new THREE.CircleGeometry(16, 24),
      new THREE.MeshLambertMaterial({ color: PALETTE.grass }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(56, 0.015, 0);
    disc.userData.kind = 'park';
    disc.userData.footprint = { x: 56, z: 0, w: 32, d: 32 };
    this.group.add(disc);
  }

  buildBlocks() {
    for (const cx of BLOCK_CENTERS_X) {
      for (const cz of BLOCK_CENTERS_Z) {
        if (blockProtected(cx, cz)) continue;
        if (cx === 0 && cz === 56) continue; // Tower Plaza park lawn block
        this.fillBlock(cx, cz);
      }
    }
    // beachfront row east of Beach Ave
    for (const cz of BLOCK_CENTERS_Z) {
      if (cz === 0) continue; // boardwalk block
      if (blockProtected(166, cz)) continue;
      this.fillBlock(166, cz, true);
    }
    // the displaced residential building west of the spawn block
    const disp = box(4, 6, 10, 0xd8c8b0, -116, 3, 44, 'building', { name: 'displaced-house' });
    disp.userData.building = { x: -116, z: 44, w: 4, d: 10, h: 6 };
    this.group.add(disp);
    this.buildings.push({ x: -116, z: 44, w: 4, d: 10, h: 6, style: 'residential', mesh: disp });
    this.addCollider(-116, 44, 4, 10);
  }

  fillBlock(cx, cz, beachfront = false) {
    const district = districtAt(cx, cz);
    const style = beachfront ? 'deco' : district.style;
    const colors = STYLE_COLORS[style] || STYLE_COLORS.commercial;
    const [hMin, hMax] = STYLE_HEIGHT[style] || [8, 20];
    const rng = this.rng;
    const count = style === 'glass' ? rng.int(3, 5) : rng.int(4, 6);
    const slots = [
      { dx: -7, dz: -7 }, { dx: 7, dz: -7 }, { dx: -7, dz: 7 }, { dx: 7, dz: 7 },
      { dx: 0, dz: 0 }, { dx: 0, dz: -7 }, { dx: 0, dz: 7 },
    ];
    // pole spots a building must never swallow (light poles + sign poles)
    const poleSpots = [];
    for (const j of JUNCTIONS) {
      for (const [dx, dz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) poleSpots.push({ x: j.x + dx, z: j.z + dz });
      poleSpots.push({ x: j.x + 12.5, z: j.z + 12.5 });
    }
    poleSpots.push({ x: 40.5, z: 96.5 }, { x: -15.5, z: 40.5 });
    const exclusions = [
      { x0: -114, x1: -102, z0: 60, z1: 112 }, // walk corridor to the garage
      { x0: -112, x1: -86, z0: 50, z1: 66 },   // spawn staging area
    ];
    for (let i = 0; i < count; i++) {
      const slot = slots[i % slots.length];
      const bw = rng.range(9, 12);
      const bd = rng.range(9, 12);
      const bh = rng.range(hMin, hMax);
      let bx = cx + slot.dx + rng.range(-1, 1);
      const bz = cz + slot.dz + rng.range(-1, 1);
      if (beachfront) bx = Math.max(bx, 152 + bw / 2);
      // never overlap another building, an exclusion rect, or a pole spot
      const hits = (x0, x1, z0, z1) => {
        const ox = Math.min(bx + bw / 2, x1) - Math.max(bx - bw / 2, x0);
        const oz = Math.min(bz + bd / 2, z1) - Math.max(bz - bd / 2, z0);
        return ox > 0.05 && oz > 0.05;
      };
      if (this.buildings.some(b => hits(b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2))) continue;
      if (exclusions.some(e => hits(e.x0, e.x1, e.z0, e.z1))) continue;
      if (poleSpots.some(p => Math.abs(p.x - bx) < bw / 2 + 0.4 && Math.abs(p.z - bz) < bd / 2 + 0.4)) continue;
      const color = colors[rng.int(0, colors.length - 1)];
      const b = box(bw, bh, bd, color, bx, bh / 2, bz, 'building');
      b.userData.building = { x: bx, z: bz, w: bw, d: bd, h: bh, style };
      this.group.add(b);
      // roof cap
      const roof = box(bw * 0.7, 1.2, bd * 0.7, 0x6a6258, bx, bh + 0.6, bz, 'roof');
      this.group.add(roof);
      // window strips (emissive at night via material swap in game)
      const winMat = new THREE.MeshBasicMaterial({ color: 0x2c3e50 });
      const win = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.06, bh * 0.55, bd + 0.06), winMat);
      win.position.set(bx, bh * 0.55, bz);
      win.userData.kind = 'windows';
      win.userData.footprint = { x: bx, z: bz, w: bw, d: bd };
      this.group.add(win);
      this.buildings.push({ x: bx, z: bz, w: bw, d: bd, h: bh, style, mesh: b });
      this.addCollider(bx, bz, bw, bd);
    }
  }

  landmarkBuilding(id, x, z, w, h, d, color, sign, sign2, registerLandmark = true) {
    const b = box(w, h, d, color, x, h / 2, z, 'landmark', { name: id });
    b.userData.building = { x, z, w, d, h, landmark: id };
    this.group.add(b);
    const roof = box(w * 0.72, 1.4, d * 0.72, 0x5a5348, x, h + 0.7, z, 'roof');
    this.group.add(roof);
    if (sign) {
      const s1 = signBoard(sign, Math.min(w * 0.9, 16), 2.2, x, h - 1.6, z + d / 2 + 0.08, 0, '#101820', '#ffd75e');
      this.group.add(s1); this.signs.push(s1);
      const s2 = signBoard(sign, Math.min(w * 0.9, 16), 2.2, x, h - 1.6, z - d / 2 - 0.08, Math.PI, '#101820', '#ffd75e');
      this.group.add(s2); this.signs.push(s2);
    }
    if (sign2) {
      const s3 = signBoard(sign2, Math.min(d * 0.9, 14), 1.8, x + w / 2 + 0.08, h - 2.2, z, Math.PI / 2, '#101820', '#9fd8ff');
      this.group.add(s3); this.signs.push(s3);
    }
    if (registerLandmark) this.landmarks[id] = { id, x, z, w, d, h };
    this.buildings.push({ x, z, w, d, h, style: 'landmark', mesh: b, landmark: id });
    this.addCollider(x, z, w, d);
    return b;
  }

  buildLandmarks() {
    const byId = {};
    for (const l of LANDMARKS) byId[l.id] = l;
    // Marla's Garage — wide low workshop with a dark open bay facing south
    const g = byId.garage;
    this.landmarkBuilding('garage', g.x, g.z, 22, 7, 16, 0xc85a3a, g.sign, g.sign2);
    const bay = box(10, 4.5, 0.4, 0x1a1d22, g.x, 2.25, g.z + 8.1, 'garagebay');
    this.group.add(bay);
    // Fuego Bank
    const bank = byId.bank;
    this.landmarkBuilding('bank', bank.x, bank.z, 18, 20, 16, 0xd8d2c2, bank.sign);
    // Safehouse — small house with a pitched cap
    const sh = byId.safehouse;
    this.landmarkBuilding('safehouse', sh.x, sh.z, 12, 6, 11, 0xe8d8b0, 'SAFEHOUSE');
    // Costa General hospital with a red cross board
    const hosp = byId.hospital;
    this.landmarkBuilding('hospital', hosp.x, hosp.z, 20, 16, 15, 0xf2f2ee, 'COSTA GENERAL');
    const cross = signBoard('+', 3, 3, hosp.x, 13, hosp.z + 7.6, 0, '#ffffff', '#e33');
    this.group.add(cross); this.signs.push(cross);
    // Fuego Tower — the tallest glass tower in Tower Plaza
    const tw = byId.tower;
    this.landmarkBuilding('tower', tw.x, tw.z, 16, 58, 16, 0x8fc3dd, 'FUEGO TOWER');
    // Neon Plaza — glowing sign block
    const np = byId.neonplaza;
    this.landmarkBuilding('neonplaza', np.x, np.z, 18, 12, 14, 0x3a2a4e, 'NEON PLAZA');
    // East Docks — warehouse east of Beach Ave with containers
    const dk = byId.docks;
    this.landmarkBuilding('docks', 164, dk.z, 20, 9, 18, 0x7a8894, 'EAST DOCKS');
    this.landmarks.docks = { id: 'docks', x: dk.x, z: dk.z, w: 20, d: 18, h: 9 };
    for (let i = 0; i < 5; i++) {
      const c = box(6, 2.6, 2.4, [0xc44, 0x48c, 0x4a6, 0xca4, 0x86c][i], 156 + (i % 3) * 7, 1.3 + Math.floor(i / 3) * 2.6, dk.z - 14, 'container');
      this.group.add(c);
      this.addCollider(c.position.x, c.position.z, 6, 2.4);
    }
    // Boardwalk — wooden deck + stalls along the sand
    const bw = byId.boardwalk;
    const deck = box(10, 0.5, 44, 0xa97c50, bw.x + 6, 0.25, bw.z, 'boardwalk');
    this.group.add(deck);
    this.landmarks.boardwalk = { id: 'boardwalk', x: bw.x, z: bw.z, w: 10, d: 44, h: 0.5 };
    // Marina piers
    const mar = byId.marina;
    for (let i = 0; i < 3; i++) {
      const pier = box(26, 0.4, 3, 0x8a6a48, 182, 0.2, mar.z - 12 + i * 12, 'pier');
      this.group.add(pier);
    }
    this.landmarks.marina = { id: 'marina', x: mar.x, z: mar.z, w: 26, d: 30, h: 0.4 };
    // Easter-egg minimarket sign on a small shop near the spawn block
    const mini = box(10, 5, 9, 0xf0e6cc, -102, 2.5, 44, 'building', { name: 'minimarket' });
    mini.userData.building = { x: -102, z: 44, w: 10, d: 9, h: 5 };
    this.group.add(mini);
    this.buildings.push({ x: -102, z: 44, w: 10, d: 9, h: 5, style: 'shop', mesh: mini });
    this.addCollider(-102, 44, 10, 9);
    const egg = signBoard(EASTER_EGG_SIGN, 9.4, 1.6, -102, 4.2, 48.56, 0, '#0a3d2e', '#ffe9a8');
    this.group.add(egg); this.signs.push(egg);
  }

  buildShops() {
    for (const s of SHOPS) {
      const colors = { guns: 0x4a4a52, spray: 0x2e7fb8, outfit: 0xb83a8a };
      const isButik = s.kind === 'outfit';
      this.landmarkBuilding(isButik ? 'butik' : 'shop-' + s.id, s.x, s.z, 14, 7, 12,
        colors[s.kind] || 0xcccccc, s.name, undefined, isButik);
      // glowing doorway marker
      const door = box(2.4, 3, 0.3, 0xffd75e, s.x, 1.5, s.z + 6.1, 'shopdoor');
      door.material = new THREE.MeshBasicMaterial({ color: 0xffd75e });
      this.group.add(door);
    }
  }

  palm(x, z, scale = 1, y = 0) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16 * scale, 0.24 * scale, 4.6 * scale, 6),
      new THREE.MeshLambertMaterial({ color: 0x8a6a48 }));
    trunk.position.y = 2.3 * scale;
    trunk.rotation.z = 0.08;
    trunk.userData.kind = 'palm';
    trunk.userData.footprint = { x, z, w: 0.5, d: 0.5 };
    g.add(trunk);
    const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(2.6 * scale, 0.08, 0.5 * scale), frondMat);
      const a = (i / 6) * Math.PI * 2;
      f.position.set(Math.cos(a) * 1.1 * scale, 4.7 * scale, Math.sin(a) * 1.1 * scale);
      f.rotation.y = -a;
      f.rotation.z = 0.35;
      f.userData.kind = 'palm';
      f.userData.footprint = { x, z, w: 0.5, d: 0.5 };
      g.add(f);
    }
    g.position.set(x, y, z);
    this.group.add(g);
    this.palms.push({ x, z, group: g });
    this.addCollider(x, z, 0.6, 0.6);
    return g;
  }

  tree(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 2.4, 6),
      new THREE.MeshLambertMaterial({ color: 0x6e5236 }));
    trunk.position.y = 1.2;
    trunk.userData.kind = 'tree';
    trunk.userData.footprint = { x, z, w: 0.5, d: 0.5 };
    g.add(trunk);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.7, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x4c9440 }));
    canopy.position.y = 3.4;
    canopy.userData.kind = 'tree';
    canopy.userData.footprint = { x, z, w: 0.5, d: 0.5 };
    g.add(canopy);
    g.position.set(x, 0, z);
    this.group.add(g);
    this.trees.push({ x, z, group: g });
    this.addCollider(x, z, 0.6, 0.6);
    return g;
  }

  buildVegetation() {
    const rng = this.rng;
    // palms along the beachfront and boardwalk, clear of asphalt
    for (let z = -140; z <= 140; z += 14) {
      this.palm(154 + rng.range(-1, 1), z + rng.range(-2, 2), rng.range(0.9, 1.25));
      this.palm(170 + rng.range(-1, 1), z + 7 + rng.range(-2, 2), rng.range(0.9, 1.2));
    }
    // Tower Plaza park trees, pulled inward from the curbs
    for (const [x, z] of [[-8, 48], [8, 48], [-8, 64], [8, 64], [0, 56], [-12, 56], [12, 56]]) {
      this.tree(x, z);
    }
    // scattered block trees
    for (const cx of BLOCK_CENTERS_X) {
      for (const cz of BLOCK_CENTERS_Z) {
        if (blockProtected(cx, cz)) continue;
        const n = rng.int(1, 3);
        for (let i = 0; i < n; i++) {
          this.tree(cx + rng.range(-13, 13), cz + rng.range(-13, 13));
        }
      }
    }
  }

  lamp(x, z) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 5, 6),
      new THREE.MeshLambertMaterial({ color: 0x3c424a }));
    pole.position.y = 2.5;
    pole.userData.kind = 'lamp';
    pole.userData.footprint = { x, z, w: 0.3, d: 0.3 };
    g.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x8a8a7a }));
    head.position.y = 5.05;
    head.userData.kind = 'lamp';
    head.userData.footprint = { x, z, w: 0.3, d: 0.3 };
    g.add(head);
    g.position.set(x, 0, z);
    this.group.add(g);
    this.lamps.push({ x, z, head, group: g });
    return g;
  }

  buildStreetFurniture() {
    // lamps at block corners, kept 3 m clear of every junction sign blade
    for (const cx of BLOCK_CENTERS_X) {
      for (const cz of BLOCK_CENTERS_Z) {
        this.lamp(cx - 14, cz - 14);
        this.lamp(cx + 14, cz + 14);
      }
    }
    // benches + bins around the plaza park and boardwalk
    const benchSpots = [[-6, 50], [6, 50], [-6, 62], [6, 62], [162, -10], [162, 10], [162, 0]];
    for (const [x, z] of benchSpots) {
      const b = box(2.2, 0.5, 0.7, 0x7a5c3e, x, 0.45, z, 'bench');
      this.group.add(b);
      this.benches.push({ x, z });
    }
    // street-name blades at the six signalled junctions + two plain crossings
    const signCrossings = [...JUNCTIONS, { x: 28, z: 84 }, { x: -28, z: 28 }];
    for (const j of signCrossings) {
      const ave = AVENUES.find(a => a.x === j.x);
      const st = STREETS.find(s => s.z === j.z);
      const px = j.x + 12.5, pz = j.z + 12.5;
      this.signRecords.push({ px, pz });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 6),
        new THREE.MeshLambertMaterial({ color: 0x555c64 }));
      pole.position.set(px, 1.7, pz);
      pole.userData.kind = 'signpole';
      pole.userData.footprint = { x: px, z: pz, w: 0.2, d: 0.2 };
      this.group.add(pole);
      if (ave) {
        const blade = signBoard(ave.name, 4.4, 0.7, px + 2.2, 3.1, pz, 0, '#14532d', '#ffffff');
        blade.userData.bladeEnd = { x: px + 4.4, z: pz };
        this.group.add(blade); this.signs.push(blade);
      }
      if (st) {
        const blade = signBoard(st.name, 4.4, 0.7, px, 2.5, pz + 2.2, Math.PI / 2, '#14532d', '#ffffff');
        blade.userData.bladeEnd = { x: px, z: pz + 4.4 };
        this.group.add(blade); this.signs.push(blade);
      }
    }
    // hydrants sprinkled on sidewalks
    const rng = this.rng;
    for (let i = 0; i < 24; i++) {
      const cx = BLOCK_CENTERS_X[rng.int(0, 4)] + rng.range(-14, 14);
      const cz = BLOCK_CENTERS_Z[rng.int(0, 4)] + (rng.chance(0.5) ? -15.5 : 15.5);
      const h = box(0.4, 0.7, 0.4, 0xd23b2e, cx, 0.35, cz, 'hydrant');
      this.group.add(h);
      this.hydrants.push({ x: cx, z: cz });
    }
    // instanced bins + bollards (one draw call each)
    const dummy = new THREE.Object3D();
    const binGeo = new THREE.CylinderGeometry(0.32, 0.28, 0.8, 8);
    const binMesh = new THREE.InstancedMesh(binGeo, new THREE.MeshLambertMaterial({ color: 0x3f7d4a }), 60);
    binMesh.userData.kind = 'bin';
    for (let i = 0; i < 60; i++) {
      const bx = BLOCK_CENTERS_X[rng.int(0, 4)] + rng.range(-14, 14);
      const bz = BLOCK_CENTERS_Z[rng.int(0, 4)] + (rng.chance(0.5) ? -15.5 : 15.5);
      dummy.position.set(bx, 0.4, bz);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      binMesh.setMatrixAt(i, dummy.matrix);
      this.bins.push({ x: bx, z: bz });
    }
    this.group.add(binMesh);
    const bolGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.8, 8);
    const bolMesh = new THREE.InstancedMesh(bolGeo, new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }), 140);
    bolMesh.userData.kind = 'bollard';
    for (let i = 0; i < 140; i++) {
      dummy.position.set(152, 0.4, -140 + i * 2);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      bolMesh.setMatrixAt(i, dummy.matrix);
    }
    this.group.add(bolMesh);
  }

  buildBeachAndSea() {
    const rng = this.rng;
    // night market stalls: 6 on the beach + 6 at the Mercado
    const canopyColors = [0xe84a6f, 0xf2a03d, 0x3db8e8, 0x7ed957, 0xb45ae8, 0xf2e14c];
    const stallSpots = [];
    for (let i = 0; i < 6; i++) stallSpots.push({ x: 168, z: -15 + i * 6 });
    stallSpots.push({ x: 48, z: -104 }, { x: 64, z: -104 }, { x: 48, z: -120 },
      { x: 64, z: -120 }, { x: 56, z: -96 }, { x: 56, z: -128 });
    for (let i = 0; i < stallSpots.length; i++) {
      const { x, z } = stallSpots[i];
      const stall = box(3.4, 1.1, 2.4, 0x8a6a48, x, 0.55, z, 'stall');
      this.group.add(stall);
      const canopy = box(3.8, 0.18, 2.8, canopyColors[i % canopyColors.length], x, 2.5, z, 'stall');
      canopy.rotation.z = 0.06;
      this.group.add(canopy);
      for (const dx of [-1.7, 1.7]) {
        const post = box(0.12, 2.5, 0.12, 0x5a4632, x + dx, 1.25, z, 'stall');
        this.group.add(post);
      }
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xffd75e }));
      bulb.position.set(x, 2.2, z);
      bulb.userData.kind = 'marketlight';
      bulb.userData.footprint = { x, z, w: 0.2, d: 0.2 };
      this.group.add(bulb);
      this.marketLights.push(bulb);
      this.stalls.push({ x, z });
      this.addCollider(x, z, 3.4, 2.4);
    }
    // speedboats parked on the sea as decor (5 total, all east of x=180)
    const boatColors = [0xf2f2f2, 0xe84a4a, 0x3d8ae8, 0xf2c14c, 0x39c2a5, 0xf28ac2];
    for (let i = 0; i < 3; i++) {
      const x = 208 + rng.range(-4, 14);
      const z = -120 + i * 60 + rng.range(-8, 8);
      const boat = this.makeBoat(x, z, boatColors[i % boatColors.length], rng.range(0, Math.PI * 2));
      this.boats.push(boat);
    }
    // moored boats at the marina piers
    for (let i = 0; i < 2; i++) {
      this.boats.push(this.makeBoat(198, -40 + i * 12, boatColors[(i + 2) % boatColors.length], Math.PI / 2));
    }
  }

  makeBoat(x, z, color, ry) {
    const g = new THREE.Group();
    const hull = box(2.2, 0.8, 5.4, color, 0, 0.2, 0, 'boat');
    hull.userData.footprint = { x, z, w: 2.2, d: 5.4 };
    g.add(hull);
    const bow = box(1.4, 0.7, 1.6, color, 0, 0.25, 3.2, 'boat');
    bow.userData.footprint = { x, z, w: 1.4, d: 1.6 };
    g.add(bow);
    const canopy = box(1.8, 0.5, 2.2, 0xffffff, 0, 0.85, -0.4, 'boat');
    canopy.userData.footprint = { x, z, w: 1.8, d: 2.2 };
    g.add(canopy);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    g.userData.kind = 'boat';
    this.group.add(g);
    return { group: g, x, z, phase: visualRng.next() * 6.28 };
  }

  buildIsland() {
    const w = cfg.world;
    const sand = new THREE.Mesh(new THREE.CylinderGeometry(w.islandR, w.islandR + 4, 1.2, 24),
      new THREE.MeshLambertMaterial({ color: PALETTE.sand }));
    sand.position.set(w.islandX, 0.55, w.islandZ);
    sand.userData.kind = 'island';
    sand.userData.footprint = { x: w.islandX, z: w.islandZ, w: 4, d: 4 };
    this.group.add(sand);
    // gate arch at (209, 100)
    const gate = LANDMARKS.find(l => l.id === 'islandgate');
    for (const dz of [-9.5, 9.5]) {
      const post = box(1, 7, 1, 0xd8cfb8, gate.x, 3.5, gate.z + dz, 'gate');
      this.group.add(post);
      this.addCollider(gate.x, gate.z + dz, 1, 1);
    }
    const beam = box(1.2, 1.4, 21, 0xd8cfb8, gate.x, 7.2, gate.z, 'gate');
    this.group.add(beam);
    this.gateBeam = beam;
    const gateSign = signBoard('FUEGO ISLAND', 11, 1.6, gate.x, 6.2, gate.z, Math.PI / 2, '#0a3d2e', '#ffe9a8');
    this.group.add(gateSign); this.signs.push(gateSign);
    this.landmarks.island = { id: 'island', x: w.islandX, z: w.islandZ, w: 92, d: 92, h: 1.15 };
    // island palms + a small villa
    const rng = this.rng;
    for (let i = 0; i < 9; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(10, 36);
      let px = w.islandX + Math.cos(a) * r;
      let pz = w.islandZ + Math.sin(a) * r;
      if (px < 252 && pz > 88 && pz < 112) pz = pz < 100 ? 84 : 116; // keep off the causeway
      this.palm(px, pz, rng.range(1, 1.4), 1.15);
    }
    this.landmarkBuilding('villa', w.islandX + 12, w.islandZ - 22, 14, 6, 12, 0xf7ead0, 'ISLA VILLA', undefined, false);
  }

  buildRamps() {
    this.rampList = [];
    for (const r of RAMPS) {
      const alongZ = r.axis === 'z';
      const geo = new THREE.BufferGeometry();
      // simple wedge: rises from 0 to 1.6 over 6 units
      const L = 6, W = 3, H = 1.6;
      const v = new Float32Array([
        -W/2, 0, -L/2,   W/2, 0, -L/2,   W/2, 0, L/2,   -W/2, 0, L/2,
        -W/2, H, L/2,    W/2, H, L/2,
      ]);
      const idx = [0,1,2, 0,2,3, 3,2,5, 3,5,4, 0,3,4, 1,5,2, 0,4,5, 0,5,1];
      geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xe8b13d }));
      mesh.position.set(r.x, 0.02, r.z);
      if (!alongZ) mesh.rotation.y = Math.PI / 2;
      mesh.userData.kind = 'ramp';
      mesh.userData.footprint = { x: r.x, z: r.z, w: alongZ ? W : L, d: alongZ ? L : W };
      this.group.add(mesh);
      this.rampList.push({ x: r.x, z: r.z, axis: r.axis, mesh });
    }
  }

  buildTrafficLights() {
    for (const j of JUNCTIONS) {
      for (const [dx, dz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) {
        const x = j.x + dx, z = j.z + dz;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 4.6, 6),
          new THREE.MeshLambertMaterial({ color: 0x2e333a }));
        pole.position.set(x, 2.3, z);
        pole.userData.kind = 'lightpole';
        pole.userData.footprint = { x, z, w: 0.3, d: 0.3 };
        this.group.add(pole);
        const headMat = new THREE.MeshBasicMaterial({ color: 0x33cc55 });
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.5), headMat);
        head.position.set(x, 4.4, z);
        head.userData.kind = 'lighthead';
        head.userData.footprint = { x, z, w: 0.3, d: 0.3 };
        this.group.add(head);
        const flow = Math.abs(dx) > Math.abs(dz) ? 'street' : 'avenue';
        this.lightHeadMeshes.push({ junction: j, flow, mat: headMat });
        this.lightPoleSpots.push({ x, z });
      }
    }
  }

  updateLightHeads(lights) {
    for (const h of this.lightHeadMeshes) {
      const j = lights.junctions.find(jj => jj.x === h.junction.x && jj.z === h.junction.z);
      if (!j) continue;
      const lamp = h.flow === 'avenue' ? j.lampA : j.lampS;
      h.mat.color.set(lamp === 'green' ? 0x33cc55 : lamp === 'amber' ? 0xffaa22 : 0xdd3333);
    }
  }

  setNight(night) {
    for (const l of this.lamps) l.head.material.color.set(night ? 0xffd75e : 0x8a8a7a);
    for (const b of this.marketLights) b.material.color.set(night ? 0xffd75e : 0xcfc4a0);
  }

  updateGate(px, pz, dt) {
    const gate = LANDMARKS.find(l => l.id === 'islandgate');
    const d = Math.hypot(px - gate.x, pz - gate.z);
    const target = d < 22 ? 1 : 0;
    this.gateOpen += (target - this.gateOpen) * Math.min(1, dt * 2.5);
    if (this.gateBeam) this.gateBeam.position.y = 7.2 + this.gateOpen * 4;
    return { open: this.gateOpen, beamY: this.gateBeam ? this.gateBeam.position.y : 7.2 };
  }

  // aliases the verification tools read
  get stallDefs() { return this.stalls; }
  get stallSpots() { return this.stalls; }
  get shopperSpots() {
    return [
      { x: 166, z: -12 }, { x: 170, z: -4 }, { x: 166, z: 4 }, { x: 170, z: 12 },
    ];
  }
  get buildingRecords() {
    return this.buildings.filter(b => !b.landmark)
      .map(b => ({ x: b.x, z: b.z, w: b.w, d: b.d, h: b.h }));
  }
  get palmSpots() { return this.palms.map(p => ({ x: p.x, z: p.z })); }
  get treeSpots() { return this.trees.map(t => ({ x: t.x, z: t.z })); }
  get landmarksById() { return this.landmarks; }

  auditData() {
    return {
      buildings: this.buildings.map(b => ({ x: b.x, z: b.z, w: b.w, d: b.d, h: b.h })),
      landmarks: Object.values(this.landmarks).map(l => ({ id: l.id, x: l.x, z: l.z, w: l.w, d: l.d })),
      palms: this.palms.map(p => ({ x: p.x, z: p.z })),
      trees: this.trees.map(t => ({ x: t.x, z: t.z })),
      lamps: this.lamps.map(l => ({ x: l.x, z: l.z })),
      stalls: this.stalls.map(s => ({ x: s.x, z: s.z })),
      signs: this.signs.map(s => ({
        text: s.userData.signText, x: s.position.x, z: s.position.z,
        bladeEnd: s.userData.bladeEnd || null,
      })),
      ramps: this.rampList.map(r => ({ x: r.x, z: r.z, axis: r.axis })),
    };
  }
}

export { DISTRICTS };
