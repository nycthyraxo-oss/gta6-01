// Costa Fuego itself: the ground, the 5x5 road grid, the buildings, the
// beach and sea, the palms, the lamps and the Fuego Tower. Everything is
// placed from the seeded random source, so one seed always builds the same
// city — and the same screenshots.
//
// v6: the city finally has neighbourhoods. Nine districts, each with its
// own architecture — pastel art-deco hotels on the beachfront, blue glass
// towers around the plaza, low loud mercado blocks with market stalls,
// brick warehouses at the harbor, mid-rise balconies up north — plus two
// parks, a boardwalk with a lifeguard tower, working traffic lights at the
// busiest junctions, crosswalks, and street props (crates, bins, benches,
// hydrants) so the ground near the spawn and the docks stops reading as
// an empty lot.
import * as THREE from 'three';
import { DISTRICTS, DISTRICT_STYLES } from './config.js';

const PALM_TRUNK = 0x8a6a42;
const PALM_LEAF = 0x3f8a4a;

// Lit shop signs: canvas textures drawn once, shared by every sign.
// All names are original to Costa Fuego. Every shop has its own name — no
// anonymous storefronts. The minimarket's name is the player's easter egg,
// written exactly as asked: "Lemen Sayang Nycthyra".
const SHOP_SIGNS = [
  { text: 'CAFÉ LUNA', bg: '#3a2a4a', fg: '#ffd23e' },
  { text: 'PIZZA FUOCO', bg: '#7a2a1a', fg: '#ffe9a8' },
  { text: 'BAR NEÓN', bg: '#123a4a', fg: '#7dffd8' },
  { text: 'TALLER MARLA', bg: '#4a2a12', fg: '#ffd23e' },
  { text: 'Lemen Sayang Nycthyra', bg: '#2a4a22', fg: '#eaf4ff' },
  { text: 'CINE SOL', bg: '#5a1a3a', fg: '#ffb27a' },
  { text: 'HOTEL BRISA', bg: '#1a3a5a', fg: '#ffe9a8' },
  { text: 'FARMACIA', bg: '#2a5a3a', fg: '#ffffff' },
  { text: 'BURGER FUEGO', bg: '#5a2a1a', fg: '#ffd23e' },
  { text: 'SURF & SOL', bg: '#1a4a5a', fg: '#7dffd8' },
];

function signTexture(text, bg, fg, canvasW = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvasW, 64);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, canvasW - 8, 56);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Long names shrink to fit instead of overflowing the board — the
  // minimarket's full name still reads on one line.
  let fontSize = 30;
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  while (fontSize > 14 && ctx.measureText(text).width > canvasW - 24) {
    fontSize -= 2;
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  }
  ctx.fillText(text, canvasW / 2, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Facade textures: one 256x256 window grid per (style, colour), drawn once
// and cached. The style is what makes districts read differently at a
// glance — deco gets vertical stripes and round portholes, glass gets a
// blue reflective grid, brick gets offset brick courses and small windows,
// color gets big ground-floor shop glass, balcony gets drawn balcony slabs
// under every window, plain gets the straight window grid.
//
// v9: every facade is drawn as a PAIR — the map and an emissive map with
// only the lit windows on black. The lit/dark decision is the same hash
// in both canvases, so exactly the windows that read lit in the map are
// the ones that glow at dusk (and bloom). Before v9 the windows were
// paint: under the dusk sun they read as a dark checkerboard and the
// towers looked empty.
function hash01(a, b, c) {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
// One decision per window, shared by both canvases: the map colour and
// the glow colour (null = dark window, no glow). Lit windows are a
// MINORITY with varied brightness — a tower where every window glows at
// full brightness reads as a white wall, not a city. Bright warm, dim
// warm and dim cool, the rest dark.
function windowColors(style, h) {
  if (style === 'glass') {
    if (h < 0.35) return { map: '#bfe4ff', glow: '#d5ecff' };
    if (h < 0.5) return { map: '#7fb3d8', glow: '#5a7a96' };
    return { map: '#1c2a38', glow: null };
  }
  if (style === 'brick') {
    if (h < 0.3) return { map: '#ffe9a8', glow: '#ffe9a8' };
    return { map: '#241a16', glow: null };
  }
  if (h < 0.28) {
    const c = h < 0.15 ? '#ffe9a8' : '#ffb27a';
    return { map: c, glow: c };
  }
  if (h < 0.42) return { map: '#8a7a68', glow: '#7a6a4e' };
  if (h < 0.52) return { map: '#9fd8ff', glow: '#5a7a96' };
  return { map: '#20262f', glow: null };
}
const FACADE_CACHE = new Map();
function facadePair(style, color) {
  const key = `${style}|${color}`;
  if (FACADE_CACHE.has(key)) return FACADE_CACHE.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const ecanvas = document.createElement('canvas');
  ecanvas.width = 256;
  ecanvas.height = 256;
  const ectx = ecanvas.getContext('2d');
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 256, 256);
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, 256, 256);
  const cols = 5;
  const rows = 8;
  const cellW = 256 / cols;
  const cellH = 256 / rows;
  if (style === 'brick') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let r = 0; r < 16; r += 1) {
      ctx.fillRect(0, r * 16, 256, 2);
      const off = (r % 2) * 16;
      for (let x = -16 + off; x < 256; x += 32) ctx.fillRect(x, r * 16, 2, 16);
    }
  }
  if (style === 'deco') {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    for (let c = 0; c < cols; c += 1) ctx.fillRect(c * cellW + cellW / 2 - 3, 0, 6, 256);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(0, 0, 256, 10);
    ctx.fillRect(0, 246, 256, 10);
  }
  if (style === 'glass') {
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    for (let r = 0; r < rows; r += 1) ctx.fillRect(0, r * cellH + cellH - 3, 256, 3);
  }
  // Faint floor lines so the grid reads as storeys.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let r = 0; r < 8; r += 1) ctx.fillRect(0, r * 32 + 30, 256, 2);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const h = hash01(color % 997, c, r);
      const x = c * cellW + 9;
      const y = r * cellH + 6;
      const w = cellW - 18;
      const hh = cellH - 12;
      if (style === 'deco' && r === 0) {
        // Porthole windows on the top floor, like a cruise-ship hotel.
        const lit = h < 0.35;
        ctx.fillStyle = lit ? '#ffe9a8' : '#20262f';
        ctx.beginPath();
        ctx.arc(x + w / 2, y + hh / 2, Math.min(w, hh) / 2, 0, Math.PI * 2);
        ctx.fill();
        if (lit) {
          ectx.fillStyle = '#ffe9a8';
          ectx.beginPath();
          ectx.arc(x + w / 2, y + hh / 2, Math.min(w, hh) / 2, 0, Math.PI * 2);
          ectx.fill();
        }
        continue;
      }
      const wc = windowColors(style, h);
      ctx.fillStyle = wc.map;
      ctx.fillRect(x, y, w, hh);
      if (wc.glow) {
        ectx.fillStyle = wc.glow;
        ectx.fillRect(x, y, w, hh);
      }
      if (style === 'balcony') {
        // A balcony slab under the window, with a rail line.
        ctx.fillStyle = 'rgba(20,20,24,0.85)';
        ctx.fillRect(x - 3, y + hh + 1, w + 6, 5);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(x - 3, y + hh + 1, w + 6, 1);
      }
      if (style === 'color' && r === rows - 1) {
        // Ground floor: one big lit shop window instead of a flat pane.
        const gc = h < 0.7 ? '#ffca7a' : '#ffe9a8';
        ctx.fillStyle = gc;
        ctx.fillRect(x, y, w, hh);
        ectx.fillStyle = gc;
        ectx.fillRect(x, y, w, hh);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  const etex = new THREE.CanvasTexture(ecanvas);
  etex.colorSpace = THREE.SRGBColorSpace;
  etex.wrapS = THREE.RepeatWrapping;
  etex.wrapT = THREE.RepeatWrapping;
  const pair = { map: tex, emissive: etex };
  FACADE_CACHE.set(key, pair);
  return pair;
}
function facadeTexture(style, color) {
  return facadePair(style, color).map;
}
function facadeEmissiveTexture(style, color) {
  return facadePair(style, color).emissive;
}

// Striped awning textures (red/white, teal/white, yellow/white), shared.
const AWNING_TEXTURES = ['#c23b2e', '#2a7a8c', '#e8c832'].map((stripe) => {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 8; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? stripe : '#f2ead8';
    ctx.fillRect(i * 16, 0, 16, 32);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
});

// Boardwalk planks: a long wooden strip, drawn once.
function boardwalkTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8a6a42';
  ctx.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 256; y += 16) {
    ctx.fillStyle = y % 32 === 0 ? '#7a5c38' : '#96683e';
    ctx.fillRect(0, y, 128, 14);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, y + 14, 128, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 18);
  return tex;
}

const CITY_MAT = new Map();
function cityMat(color, roughness, metalness = 0) {
  const key = `${color}|${roughness}|${metalness}`;
  if (!CITY_MAT.has(key)) {
    CITY_MAT.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  }
  return CITY_MAT.get(key);
}

// Named districts, for the HUD label and the big map. Pure function of
// position: the table in config.js is checked in order, first match wins.
export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) {
      return { name: d.name, tag: d.id.toUpperCase(), style: d.style };
    }
  }
  return { name: 'DOWNTOWN', tag: 'DOWNTOWN', style: 'commercial' };
}

function box(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.05 }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function flat(w, d, color, x, z, y) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  return mesh;
}

// v9 wet surfaces: shared materials so the rain reads on the ground.
// Roads go dark and glossy, sidewalks and the open ground get a sheen
// instead of flat paint — the big tan emptiness in the v8 frames was the
// ground reading as dry dirt. Puddles (below) sit on top of these.
const wetRoadMat = new THREE.MeshStandardMaterial({ color: 0x2b2e35, roughness: 0.35, metalness: 0.25 });
// The open ground gets a blotch texture (drawn once, hash-placed, no rng)
// so the big lots stop reading as one flat tan plane. Parameterised by
// base colour so the sidewalk gets its own tan version.
function groundNoiseTexture(base, dark, light, repeat) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 600; i += 1) {
    const x = hash01(i, 1, 2) * 256;
    const y = hash01(i, 3, 4) * 256;
    const r = 4 + hash01(i, 5, 6) * 26;
    const isDark = hash01(i, 7, 8) < 0.55;
    ctx.fillStyle = isDark ? dark : light;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  return tex;
}
const wetGroundMat = new THREE.MeshStandardMaterial({
  map: groundNoiseTexture('#4a5440', 'rgba(28,34,24,0.12)', 'rgba(140,150,110,0.10)', 12),
  roughness: 0.45, metalness: 0.05,
});
const wetWalkMat = new THREE.MeshStandardMaterial({
  map: groundNoiseTexture('#847c6e', 'rgba(40,34,26,0.12)', 'rgba(190,180,150,0.10)', 2),
  roughness: 0.55, metalness: 0.05,
});
const wetApronMat = new THREE.MeshStandardMaterial({ color: 0x6a6a66, roughness: 0.5, metalness: 0.05 });
function wetFlat(w, d, mat, x, z, y) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  return mesh;
}

// v9 lamp light pools: one radial-gradient texture, shared by every pool.
// A warm additive glow on the pavement under a lamp, so the lamps read as
// light sources instead of bare poles. One texture, one material.
function lightPoolTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, rng, cfg) {
  const W = cfg.world;
  const pitch = W.blockSize + W.roadWidth;
  const half = (W.blocks * W.blockSize + (W.blocks + 1) * W.roadWidth) / 2;
  const roadLines = [];
  for (let i = 0; i <= W.blocks; i += 1) roadLines.push(-half + W.roadWidth / 2 + i * pitch);
  const blockCenters = [];
  for (let i = 0; i < W.blocks; i += 1) blockCenters.push(-half + W.roadWidth + W.blockSize / 2 + i * pitch);

  const group = new THREE.Group();
  group.name = 'CostaFuego';
  scene.add(group);

  // Instanced thin boxes (road paint, curbs): one draw call per list.
  // Each entry is { x, z, w, l } — w along x, l along z, centred at y,
  // h tall. Deterministic: no rng, no hash, just the grid.
  function instancedBoxes(list, color, y, h) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.05 });
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    list.forEach((m, i) => {
      v.set(m.x, y, m.z);
      sc.set(m.w, h, m.l);
      m4.compose(v, q, sc);
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // Base ground, then the sand strip and the sea to the east.
  // v9: the open ground is wet (sheen, not dry dirt).
  group.add(wetFlat(W.groundSize, W.groundSize, wetGroundMat, 0, 0, -0.05));
  group.add(flat(40, W.groundSize, cfg.palette.sand, W.beachX + 12, 0, 0.0));
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(120, W.groundSize),
    new THREE.MeshStandardMaterial({ color: cfg.palette.sea, roughness: 0.35, metalness: 0.1 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(W.seaX + 55, 0.15, 0);
  sea.receiveShadow = true;
  group.add(sea);

  // Roads: dark wet strips along every grid line.
  for (const c of roadLines) {
    group.add(wetFlat(W.roadWidth, half * 2, wetRoadMat, c, 0, 0.02));
    group.add(wetFlat(half * 2, W.roadWidth, wetRoadMat, 0, c, 0.02));
  }

  // Road markings (v9 iteration 3): proper big-city paint, two
  // InstancedMeshes instead of hundreds of individual dash meshes —
  // double-yellow centre lines, dashed white lane dividers at ±3.5,
  // solid white edge lines at ±6.5, and crosswalks at ALL 36
  // intersections. The paint breaks at every intersection (the crosswalk
  // zone), exactly like a real street. No rng: pure grid arithmetic.
  {
    const yellow = [];
    const white = [];
    const segs = [];
    for (let i = 0; i < roadLines.length - 1; i += 1) {
      segs.push([roadLines[i] + 9.5, roadLines[i + 1] - 9.5]);
    }
    for (const c of roadLines) {
      for (const [a, b] of segs) {
        const len = b - a;
        const mid = (a + b) / 2;
        // Vertical road (runs along z at x = c).
        yellow.push({ x: c - 0.4, z: mid, w: 0.25, l: len });
        yellow.push({ x: c + 0.4, z: mid, w: 0.25, l: len });
        white.push({ x: c - 6.5, z: mid, w: 0.25, l: len });
        white.push({ x: c + 6.5, z: mid, w: 0.25, l: len });
        // Horizontal road (runs along x at z = c).
        yellow.push({ x: mid, z: c - 0.4, w: len, l: 0.25 });
        yellow.push({ x: mid, z: c + 0.4, w: len, l: 0.25 });
        white.push({ x: mid, z: c - 6.5, w: len, l: 0.25 });
        white.push({ x: mid, z: c + 6.5, w: len, l: 0.25 });
      }
      // Dashed lane dividers, kept clear of the crosswalk zone (±12).
      for (let t = -half + 12; t < half - 8; t += 10) {
        let near = false;
        for (const l of roadLines) if (Math.abs(t - l) < 12) { near = true; break; }
        if (near) continue;
        white.push({ x: c - 3.5, z: t, w: 0.3, l: 3 });
        white.push({ x: c + 3.5, z: t, w: 0.3, l: 3 });
        white.push({ x: t, z: c - 3.5, w: 3, l: 0.3 });
        white.push({ x: t, z: c + 3.5, w: 3, l: 0.3 });
      }
    }
    // Crosswalks at every intersection (the old per-junction boxes are gone).
    for (const rx of roadLines) {
      for (const rz of roadLines) {
        for (let s = -2; s <= 2; s += 1) {
          white.push({ x: rx + s * 2.2, z: rz - 9.5, w: 0.9, l: 3.2 });
          white.push({ x: rx + s * 2.2, z: rz + 9.5, w: 0.9, l: 3.2 });
          white.push({ x: rx - 9.5, z: rz + s * 2.2, w: 3.2, l: 0.9 });
          white.push({ x: rx + 9.5, z: rz + s * 2.2, w: 3.2, l: 0.9 });
        }
      }
    }
    group.add(instancedBoxes(yellow, 0xe8c832, 0.05, 0.05));
    group.add(instancedBoxes(white, 0xf2f2f2, 0.05, 0.05));
  }

  // Sidewalk slabs around each block, with a raised curb edge on the road
  // side so the pavement reads as a pavement, not a paint colour.
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      group.add(wetFlat(W.blockSize + 6, W.blockSize + 6, wetWalkMat, bx, bz, 0.03));
    }
  }

  // Real curbs (v9 iteration 3): thin raised concrete edges along each
  // block's sidewalk, at the road's edge (21 from the block centre), one
  // InstancedMesh. No collision — the player steps over them, as in v8.
  {
    const curbs = [];
    for (const bx of blockCenters) {
      for (const bz of blockCenters) {
        curbs.push({ x: bx - 21, z: bz, w: 0.3, l: 42 });
        curbs.push({ x: bx + 21, z: bz, w: 0.3, l: 42 });
        curbs.push({ x: bx, z: bz - 21, w: 42, l: 0.3 });
        curbs.push({ x: bx, z: bz + 21, w: 42, l: 0.3 });
      }
    }
    group.add(instancedBoxes(curbs, 0x8a8578, 0.075, 0.15));
  }

  const landmarks = {
    garage: { x: -112, z: 84, name: "Marla's Garage" },
    bank: { x: 56, z: -56, name: 'Fuego Bank' },
    docks: { x: 138, z: 112, name: 'East Docks' },
    safehouse: { x: -112, z: -112, name: 'Safehouse' },
    hospital: { x: 0, z: 112, name: 'Costa General' },
    marina: { x: 140, z: -28, name: 'Marina' },
    tower: { x: 0, z: 0, name: 'Fuego Tower' },
    plaza: { x: 56, z: 0, name: 'Neon Plaza' },
    boardwalk: { x: 158, z: 0, name: 'Boardwalk' },
  };

  // Blocks that never get a random building: the landmark blocks (computed
  // from the landmark positions, so the spawn block stays clear of the
  // garage rule), the two park blocks, and the three beachfront-hotel
  // blocks, which get one hand-placed deco hotel each instead.
  const protectedLandmarks = [landmarks.garage, landmarks.bank, landmarks.safehouse, landmarks.hospital, landmarks.tower];
  const skipBlocks = new Set();
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      for (const lm of protectedLandmarks) {
        if (Math.max(Math.abs(bx - lm.x), Math.abs(bz - lm.z)) <= 30) {
          skipBlocks.add(`${bx},${bz}`);
        }
      }
    }
  }
  const parkBlocks = new Set(['-112,-112', '56,112']);
  const hotelBlocks = new Set(['112,-56', '112,0', '112,56']);
  for (const k of parkBlocks) skipBlocks.add(k);
  for (const k of hotelBlocks) skipBlocks.add(k);
  // The plaza block gets a hand-built plaza instead of random buildings.
  skipBlocks.add('56,0');

  const signTextures = SHOP_SIGNS.map((s) => signTexture(s.text, s.bg, s.fg));
  let signNext = 0;
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });

  // Every raised building is recorded for the v9 rooftop-clutter pass
  // (below the building loop): the pass reads these records, it never
  // re-rolls the rng, so the city layout stays byte-identical to v8.
  const buildingRecords = [];

  function raiseBuilding(ox, oz, w, d, h, style, colorIdx) {
    const styleDef = DISTRICT_STYLES[style];
    const color = styleDef.palette[colorIdx % styleDef.palette.length];
    const ftex = facadeTexture(style, color).clone();
    ftex.needsUpdate = true;
    ftex.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 9)));
    // v9: the same repeat on the emissive map, so lit windows glow.
    const etex = facadeEmissiveTexture(style, color).clone();
    etex.needsUpdate = true;
    etex.repeat.copy(ftex.repeat);
    const frontMat = new THREE.MeshStandardMaterial({
      map: ftex, emissiveMap: etex, emissive: 0xffffff,
      emissiveIntensity: cfg.graphics.facadeEmissive, roughness: 0.9,
    });
    const roofMat = cityMat(0x555a60, 0.9);
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      [frontMat, frontMat, roofMat, roofMat, frontMat, frontMat],
    );
    b.position.set(ox, h / 2, oz);
    b.castShadow = true;
    b.receiveShadow = true;
    group.add(b);
    // Roof rim, in the district's trim colour.
    const rim = box(w + 0.6, 0.5, d + 0.6, styleDef.trim, ox, h + 0.25, oz);
    rim.castShadow = false;
    group.add(rim);
    // Roof crown by style: deco gets a neon-edged crown, glass an
    // antenna, residential a water tower, commercial a setback box.
    if (styleDef.roof === 'crown') {
      const crown = box(w * 0.7, 1.2, d * 0.7, color, ox, h + 1.1, oz);
      crown.castShadow = false;
      group.add(crown);
      const neon = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.72, 0.18, d * 0.72),
        new THREE.MeshBasicMaterial({ color: 0xffd23e }),
      );
      neon.position.set(ox, h + 1.75, oz);
      group.add(neon);
    } else if (styleDef.roof === 'antenna') {
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.09, 4.5, 6),
        cityMat(0x3a3f45, 0.6, 0.5),
      );
      mast.position.set(ox, h + 2.75, oz);
      group.add(mast);
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xff4444 }),
      );
      tip.position.set(ox, h + 5, oz);
      group.add(tip);
    } else if (styleDef.roof === 'water') {
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(1.1, 1.1, 2.2, 10),
        cityMat(0x7a5c38, 0.9),
      );
      tank.position.set(ox, h + 1.6, oz);
      tank.castShadow = true;
      group.add(tank);
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(1.4, 1.1, 10),
        cityMat(0x5a4630, 0.9),
      );
      cone.position.set(ox, h + 3.25, oz);
      group.add(cone);
    } else if (styleDef.roof === 'setback') {
      const top = box(w * 0.6, h * 0.18, d * 0.6, 0x555a60, ox, h + h * 0.09 + 0.25, oz);
      top.castShadow = false;
      group.add(top);
    } else {
      const ac = box(1.4, 0.9, 1.4, 0x8a9096, ox + rng.range(-w / 4, w / 4), h + 0.95, oz + rng.range(-d / 4, d / 4));
      ac.castShadow = false;
      group.add(ac);
    }
    // A glowing strip or two on the side face, for the dusk skyline.
    const strips = rng.int(1, 2);
    for (let s = 0; s < strips; s += 1) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 1.1, w * rng.range(0.4, 0.6)),
        glowMat,
      );
      strip.position.set(ox + w / 2 + 0.1, h * rng.range(0.3, 0.85), oz + rng.range(-d * 0.2, d * 0.2));
      group.add(strip);
    }
    // Ground-floor shopfront: dark glass, lit display windows, awning.
    if (rng.chance(styleDef.awning)) {
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.72, 2.6, 0.5),
        cityMat(0x1a2a33, 0.15, 0.6),
      );
      glass.position.set(ox, 1.3, oz + d / 2 + 0.25);
      group.add(glass);
      for (const dx of [-w * 0.17, w * 0.17]) {
        const display = new THREE.Mesh(
          new THREE.PlaneGeometry(w * 0.26, 1.6),
          new THREE.MeshBasicMaterial({ color: rng.chance(0.5) ? 0xffca7a : 0xffe9a8 }),
        );
        display.position.set(ox + dx, 1.4, oz + d / 2 + 0.52);
        group.add(display);
      }
      const awnTex = AWNING_TEXTURES[Math.floor(rng.next() * AWNING_TEXTURES.length)].clone();
      awnTex.needsUpdate = true;
      awnTex.repeat.set(3, 1);
      const awning = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.78, 1.5),
        new THREE.MeshStandardMaterial({ map: awnTex, side: THREE.DoubleSide, roughness: 0.9 }),
      );
      awning.rotation.x = -0.55;
      awning.position.set(ox, 3.15, oz + d / 2 + 0.85);
      awning.castShadow = true;
      group.add(awning);
    }
    // Lit shop sign on the street-facing side of some buildings.
    if (rng.chance(styleDef.sign)) {
      const tex = signTextures[signNext % signTextures.length];
      signNext += 1;
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.62, 1.9),
        new THREE.MeshBasicMaterial({ map: tex }),
      );
      sign.position.set(ox, Math.min(h * 0.55, 9), oz + d / 2 + 0.2);
      group.add(sign);
    }
    buildingRecords.push({ x: ox, z: oz, w, d, h, style });
    return b;
  }

  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      if (skipBlocks.has(`${bx},${bz}`)) continue;
      const style = districtAt(bx, bz).style;
      const styleDef = DISTRICT_STYLES[style];
      const count = style === 'glass' || style === 'commercial' ? rng.int(1, 2) : rng.int(2, 4);
      for (let i = 0; i < count; i += 1) {
        const w = rng.range(10, 18);
        const d = rng.range(10, 18);
        const h = rng.range(styleDef.heights[0], styleDef.heights[1]);
        const ox = bx + rng.range(-10, 10);
        const oz = bz + rng.range(-10, 10);
        raiseBuilding(ox, oz, w, d, h, style, Math.floor(rng.next() * styleDef.palette.length));
      }
    }
  }

  // Name board for a landmark: a lit text plane on its street-facing side,
  // so every named building reads its name in 3D — the same name the
  // missions and messages use (TALLER MARLA = Marla's Garage, FUEGO BANK =
  // the Costa Bank job, COSTA GENERAL = the respawn hospital).
  function nameBoard(text, bg, fg, w, h, x, y, z) {
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg, 512) }),
    );
    board.position.set(x, y, z);
    group.add(board);
    return board;
  }

  // Fuego Tower: the one tall landmark, dead centre, in the same blue-glass
  // facade as the plaza towers around it.
  const towerTex = facadeTexture('glass', 0x5a8ab0).clone();
  towerTex.needsUpdate = true;
  towerTex.repeat.set(4, 10);
  const towerEmissive = facadeEmissiveTexture('glass', 0x5a8ab0).clone();
  towerEmissive.needsUpdate = true;
  towerEmissive.repeat.copy(towerTex.repeat);
  const towerMat = new THREE.MeshStandardMaterial({
    map: towerTex, emissiveMap: towerEmissive, emissive: 0xffffff,
    emissiveIntensity: cfg.graphics.facadeEmissive, roughness: 0.9,
  });
  const towerRoofMat = cityMat(0x555a60, 0.9);
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(22, W.towerH, 22),
    [towerMat, towerMat, towerRoofMat, towerRoofMat, towerMat, towerMat],
  );
  tower.position.set(0, W.towerH / 2, 0);
  tower.castShadow = true;
  tower.receiveShadow = true;
  group.add(tower);
  nameBoard('FUEGO TOWER', '#1a3a5a', '#ffe9a8', 16, 2.4, 0, 8, 11.3);
  const towerTop = box(24, 3, 24, 0x2e4a5e, 0, W.towerH + 1.5, 0);
  towerTop.castShadow = false;
  group.add(towerTop);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(1.4, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xff4444 }),
  );
  beacon.position.set(0, W.towerH + 4, 0);
  group.add(beacon);

  // Marla's garage: low brick building with a big sign slab.
  const garage = box(24, 7, 14, 0xb05a3a, landmarks.garage.x, 3.5, landmarks.garage.z);
  group.add(garage);
  const sign = box(20, 2.4, 0.6, 0xffe9a8, landmarks.garage.x, 8, landmarks.garage.z + 7.2);
  sign.castShadow = false;
  group.add(sign);
  nameBoard('TALLER MARLA', '#4a2a12', '#ffd23e', 18, 2.2, landmarks.garage.x, 8, landmarks.garage.z + 7.55);
  // The approach face (the side the player walks in from, -z): the old
  // garage showed a blank brick wall to everyone arriving for mission 1.
  // It gets a shopfront — dark glass, lit display windows, a striped
  // awning — and its own TALLER MARLA board facing the street, so the
  // first thing a new player sees is a place, not a wall.
  const gGlass = new THREE.Mesh(
    new THREE.BoxGeometry(14, 2.6, 0.5),
    cityMat(0x1a2a33, 0.15, 0.6),
  );
  gGlass.position.set(landmarks.garage.x, 1.3, landmarks.garage.z - 7.25);
  group.add(gGlass);
  for (const dx of [-3.5, 3.5]) {
    const display = new THREE.Mesh(
      new THREE.PlaneGeometry(4.5, 1.6),
      new THREE.MeshBasicMaterial({ color: 0xffca7a }),
    );
    display.position.set(landmarks.garage.x + dx, 1.4, landmarks.garage.z - 7.55);
    display.rotation.y = Math.PI;
    group.add(display);
  }
  const gAwnTex = AWNING_TEXTURES[0].clone();
  gAwnTex.needsUpdate = true;
  gAwnTex.repeat.set(4, 1);
  const gAwning = new THREE.Mesh(
    new THREE.BoxGeometry(15, 0.18, 1.8),
    new THREE.MeshStandardMaterial({ map: gAwnTex, roughness: 0.9 }),
  );
  gAwning.position.set(landmarks.garage.x, 3.1, landmarks.garage.z - 7.9);
  gAwning.castShadow = true;
  group.add(gAwning);
  const gSign = nameBoard('TALLER MARLA', '#4a2a12', '#ffd23e', 18, 2.2, landmarks.garage.x, 8, landmarks.garage.z - 7.55);
  gSign.rotation.y = Math.PI;

  // Shopfront doors and window dressing: the approach face gets two
  // framed doors with handles at its ends, cross-barred display windows
  // that read as windows instead of blank slabs, and a paved forecourt
  // with parking bays, oil stains and work props — so the garage reads
  // as a workshop from the street, not a box on a lot. All fixed
  // positions, off the mission-1 walk line (x -104..-112).
  for (const dx of [-10, 10]) {
    const doorX = landmarks.garage.x + dx;
    group.add(box(2.2, 3, 0.3, 0x2a2018, doorX, 1.5, landmarks.garage.z - 7.15));
    group.add(box(1.7, 2.6, 0.34, 0x3a3f46, doorX, 1.3, landmarks.garage.z - 7.17));
    group.add(box(0.18, 0.5, 0.1, 0xffd23e, doorX + (dx < 0 ? 0.55 : -0.55), 1.3, landmarks.garage.z - 7.38));
  }
  for (const dx of [-3.5, 3.5]) {
    const winX = landmarks.garage.x + dx;
    group.add(box(0.18, 1.6, 0.1, 0x2a2018, winX, 1.4, landmarks.garage.z - 7.6));
    group.add(box(4.5, 0.18, 0.1, 0x2a2018, winX, 1.4, landmarks.garage.z - 7.6));
  }
  // Paved forecourt apron in front of the shopfront, with parking bays.
  // V8 (reviewer fix 2): paved grey 0x6a6a66, not dirt-brown, so the
  // forecourt reads as paving at a glance against the ground plane.
  // v9: wet paving, same grey, so the rain reads here too.
  group.add(wetFlat(20, 12, wetApronMat, landmarks.garage.x, 70, 0.05));
  for (const bx of [-118, -112, -106]) {
    group.add(flat(0.5, 4, 0xffffff, bx, 68, 0.07));
  }
  // Oil stains on the apron: dark flat discs, slightly above the paving.
  const stainMat = new THREE.MeshStandardMaterial({ color: 0x241d18, roughness: 0.4, metalness: 0.2 });
  for (const [sx, sz, sr] of [[-116, 72, 1.1], [-106, 66, 0.8]]) {
    const stain = new THREE.Mesh(new THREE.CircleGeometry(sr, 12), stainMat);
    stain.rotation.x = -Math.PI / 2;
    stain.position.set(sx, 0.07, sz);
    stain.receiveShadow = true;
    group.add(stain);
  }
  // Work props flanking the forecourt: a crate stack west, two barrels
  // east, a tire stack by the east door.
  const crateMat2 = cityMat(0x8a6a42, 0.95);
  const crateStack = new THREE.Group();
  const cc1 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), crateMat2);
  cc1.position.y = 0.8;
  cc1.castShadow = true;
  crateStack.add(cc1);
  const cc2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), crateMat2);
  cc2.position.set(0.3, 2.2, 0.2);
  cc2.rotation.y = 0.4;
  cc2.castShadow = true;
  crateStack.add(cc2);
  crateStack.position.set(-124.5, 0, 71);
  group.add(crateStack);
  const barrelMat2 = cityMat(0xc22a22, 0.6, 0.3);
  for (const [bx2, bz2] of [[-99.5, 71], [-99.5, 73.5]]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 10), barrelMat2);
    b.position.set(bx2, 0.65, bz2);
    b.castShadow = true;
    group.add(b);
  }
  const tireMat = cityMat(0x1a1a1a, 0.95);
  for (let i = 0; i < 3; i += 1) {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.24, 12), tireMat);
    tire.position.set(-101, 0.12 + i * 0.24, 74);
    tire.castShadow = true;
    group.add(tire);
  }
  // v9: rooftop clutter on the garage — an AC box, a vent pipe and a
  // small antenna mast, so the garage roof is not a bare slab from the
  // street or the map. Fixed positions, above the dialogue sightline.
  group.add(box(1.4, 0.9, 1.4, 0x8a9096, -118, 7.45, 82));
  const gVent = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.32, 1.6, 8),
    cityMat(0x3a3f45, 0.6, 0.5),
  );
  gVent.position.set(-106, 7.8, 86);
  group.add(gVent);
  const gMast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.09, 4, 6),
    cityMat(0x3a3f45, 0.6, 0.5),
  );
  gMast.position.set(-108, 9, 80);
  group.add(gMast);
  const gTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff4444 }),
  );
  gTip.position.set(-108, 11, 80);
  group.add(gTip);

  // Fuego Bank: pale stone block with columns.
  const bank = box(22, 12, 16, 0xe8e0cc, landmarks.bank.x, 6, landmarks.bank.z);
  group.add(bank);
  nameBoard('FUEGO BANK', '#2a3a4a', '#ffe9a8', 16, 2, landmarks.bank.x, 13, landmarks.bank.z + 8.2);
  for (let i = -2; i <= 2; i += 1) {
    group.add(box(1.4, 10, 1.4, 0xcfc4a8, landmarks.bank.x + i * 4, 5, landmarks.bank.z + 8.4));
  }

  // Hospital: white block with a red cross slab.
  const hosp = box(24, 14, 16, 0xf0f0ea, landmarks.hospital.x, 7, landmarks.hospital.z);
  group.add(hosp);
  nameBoard('COSTA GENERAL', '#ffffff', '#d83a2e', 16, 2, landmarks.hospital.x, 12, landmarks.hospital.z + 8.2);
  group.add(box(8, 2, 0.6, 0xd83a2e, landmarks.hospital.x, 15.5, landmarks.hospital.z + 8.2));

  // Beachfront hotels: three pastel art-deco slabs facing the boardwalk,
  // one per hotel block, with neon crown trim. The beach is a place now,
  // not a label on the map.
  [-56, 0, 56].forEach((bz, i) => {
    const h = 18 + i * 4;
    raiseBuilding(112, bz, 20, 15, h, 'deco', i);
  });

  // v9 iteration 2 — fixed infill buildings for the empty lots the user
  // called out (docks foreground, chase far horizon, dialogue flanks).
  // Same look as raiseBuilding (lit-window facade pair, roof crown, glow
  // strips, shopfront, sign) but every sub-choice is a pure hash of the
  // building's own coordinates — ZERO rng consumed, so the seeded city,
  // traffic, pedestrians and packages stay byte-identical to v9
  // iteration 1. Fixed positions, verified by hand against the staged
  // shots: clear of the combat firing lanes (player (125,133) to King
  // (130,138), flanker (148,126) to player), the mission-1 walk line
  // (x -104..-112), the spawn (-112,60), the docks piers/containers/
  // crates/barrels, and the roads. Entries go into buildingRecords, so
  // the rooftop-clutter pass below dresses these roofs too.
  function raiseFixedBuilding(ox, oz, w, d, h, style, colorIdx) {
    const styleDef = DISTRICT_STYLES[style];
    const color = styleDef.palette[colorIdx % styleDef.palette.length];
    const ftex = facadeTexture(style, color).clone();
    ftex.needsUpdate = true;
    ftex.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 9)));
    const etex = facadeEmissiveTexture(style, color).clone();
    etex.needsUpdate = true;
    etex.repeat.copy(ftex.repeat);
    const frontMat = new THREE.MeshStandardMaterial({
      map: ftex, emissiveMap: etex, emissive: 0xffffff,
      emissiveIntensity: cfg.graphics.facadeEmissive, roughness: 0.9,
    });
    const roofMat = cityMat(0x555a60, 0.9);
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      [frontMat, frontMat, roofMat, roofMat, frontMat, frontMat],
    );
    b.position.set(ox, h / 2, oz);
    b.castShadow = true;
    b.receiveShadow = true;
    group.add(b);
    const rim = box(w + 0.6, 0.5, d + 0.6, styleDef.trim, ox, h + 0.25, oz);
    rim.castShadow = false;
    group.add(rim);
    if (styleDef.roof === 'crown') {
      const crown = box(w * 0.7, 1.2, d * 0.7, color, ox, h + 1.1, oz);
      crown.castShadow = false;
      group.add(crown);
      const neon = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.72, 0.18, d * 0.72),
        new THREE.MeshBasicMaterial({ color: 0xffd23e }),
      );
      neon.position.set(ox, h + 1.75, oz);
      group.add(neon);
    } else if (styleDef.roof === 'antenna') {
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.09, 4.5, 6),
        cityMat(0x3a3f45, 0.6, 0.5),
      );
      mast.position.set(ox, h + 2.75, oz);
      group.add(mast);
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xff4444 }),
      );
      tip.position.set(ox, h + 5, oz);
      group.add(tip);
    } else if (styleDef.roof === 'water') {
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(1.1, 1.1, 2.2, 10),
        cityMat(0x7a5c38, 0.9),
      );
      tank.position.set(ox, h + 1.6, oz);
      tank.castShadow = true;
      group.add(tank);
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(1.4, 1.1, 10),
        cityMat(0x5a4630, 0.9),
      );
      cone.position.set(ox, h + 3.25, oz);
      group.add(cone);
    } else if (styleDef.roof === 'setback') {
      const top = box(w * 0.6, h * 0.18, d * 0.6, 0x555a60, ox, h + h * 0.09 + 0.25, oz);
      top.castShadow = false;
      group.add(top);
    } else {
      const ac = box(1.4, 0.9, 1.4, 0x8a9096, ox + (hash01(ox, oz, 41) - 0.5) * w / 2, h + 0.95, oz + (hash01(ox, oz, 42) - 0.5) * d / 2);
      ac.castShadow = false;
      group.add(ac);
    }
    const strips = hash01(ox, oz, 43) < 0.5 ? 1 : 2;
    for (let s = 0; s < strips; s += 1) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 1.1, w * (0.4 + hash01(ox, oz, 44 + s) * 0.2)),
        glowMat,
      );
      strip.position.set(ox + w / 2 + 0.1, h * (0.3 + hash01(ox, oz, 46 + s) * 0.55), oz + (hash01(ox, oz, 48 + s) - 0.5) * d * 0.4);
      group.add(strip);
    }
    if (hash01(ox, oz, 50) < styleDef.awning) {
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.72, 2.6, 0.5),
        cityMat(0x1a2a33, 0.15, 0.6),
      );
      glass.position.set(ox, 1.3, oz + d / 2 + 0.25);
      group.add(glass);
      for (const dx of [-w * 0.17, w * 0.17]) {
        const display = new THREE.Mesh(
          new THREE.PlaneGeometry(w * 0.26, 1.6),
          new THREE.MeshBasicMaterial({ color: hash01(ox, oz, 51) < 0.5 ? 0xffca7a : 0xffe9a8 }),
        );
        display.position.set(ox + dx, 1.4, oz + d / 2 + 0.52);
        group.add(display);
      }
      const awnTex = AWNING_TEXTURES[Math.floor(hash01(ox, oz, 52) * AWNING_TEXTURES.length)].clone();
      awnTex.needsUpdate = true;
      awnTex.repeat.set(3, 1);
      const awning = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.78, 1.5),
        new THREE.MeshStandardMaterial({ map: awnTex, side: THREE.DoubleSide, roughness: 0.9 }),
      );
      awning.rotation.x = -0.55;
      awning.position.set(ox, 3.15, oz + d / 2 + 0.85);
      awning.castShadow = true;
      group.add(awning);
    }
    if (hash01(ox, oz, 53) < styleDef.sign) {
      const tex = signTextures[Math.floor(hash01(ox, oz, 54) * signTextures.length)];
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.62, 1.9),
        new THREE.MeshBasicMaterial({ map: tex }),
      );
      sign.position.set(ox, Math.min(h * 0.55, 9), oz + d / 2 + 0.2);
      group.add(sign);
    }
    buildingRecords.push({ x: ox, z: oz, w, d, h, style });
    return b;
  }
  // USER REFINEMENT (v9 iteration 2): four height tiers, mixed — low,
  // medium, high, extra-high landmark towers — placed like a REAL city
  // (Shenzhen / Jakarta), NOT an even grid: tall tower clusters near the
  // commercial core (Fuego Tower / plaza / bank), mid-rise filling
  // around them, low-rise toward the edges; irregular depths and
  // footprints, tight clusters next to open gaps (plaza, beachfront).
  // No even rows, no symmetric patterns.
  // Tier 4 — extra-high landmark towers (28-34 m), clustered near the
  // commercial core and anchoring the south skyline terminus.
  raiseFixedBuilding(20, 17, 12, 12, 34, 'glass', 0);
  raiseFixedBuilding(0, 172, 16, 14, 28, 'glass', 1);
  // Tier 3 — high (20-22 m), stepping down from the landmarks at
  // irregular depths so the skyline reads organic, not a wall.
  raiseFixedBuilding(-48, 160, 14, 12, 20, 'commercial', 2);
  raiseFixedBuilding(52, 178, 14, 12, 22, 'commercial', 0);
  // Tier 2 — medium (12-13 m): dialogue west flank and the hospital
  // block corner, filling the mid-ring around the core.
  raiseFixedBuilding(-128, 62, 12, 12, 12, 'residential', 0);
  raiseFixedBuilding(-19, 128, 12, 10, 13, 'residential', 2);
  // Tier 1 — low (8-10 m): docks warehouses (the duel still owns the
  // combat frame), the dialogue east shop, and a far south low-rise that
  // steps the skyline down to the edge.
  raiseFixedBuilding(160, 135, 14, 10, 10, 'brick', 1);
  raiseFixedBuilding(134, 98, 14, 12, 8, 'brick', 0);
  raiseFixedBuilding(-73, 70, 8, 10, 9, 'stucco', 1);
  raiseFixedBuilding(-20, 185, 12, 10, 9, 'brick', 2);

  // USER REFINEMENT (v9 iteration 3): the empty brown ring beyond the
  // grid — the lots the user saw from the park, big and bare — gets its
  // own skyline. Sixteen fixed buildings on the north, west and south
  // outer ring (|coord| 166-168, past the outer road at 140, past the
  // player clamp, so they are skyline, not gameplay). Same four tiers
  // as iteration 2, same zero-rng rule, same organic placement: tall
  // toward the centre axis, low toward the corners, irregular depths,
  // no rows. East ring skipped on purpose — that is beach and sea.
  // Clear of everything: the iteration-2 south ring (0,172 / 52,178 /
  // -20,185), the docks piers (x 143-169, z 95-129), the beach sand
  // (x 142+), the parks, the spawn, and all 10 package spots.
  // Tier 3-4 — north ring: the skyline behind the park, tallest near
  // the Fuego Tower axis, stepping down to the corners.
  raiseFixedBuilding(-140, -168, 12, 12, 12, 'residential', 0);
  raiseFixedBuilding(-84, -168, 14, 12, 16, 'residential', 1);
  raiseFixedBuilding(-28, -168, 14, 14, 26, 'commercial', 2);
  raiseFixedBuilding(28, -168, 14, 12, 22, 'glass', 0);
  raiseFixedBuilding(84, -168, 12, 12, 18, 'commercial', 1);
  raiseFixedBuilding(132, -168, 12, 12, 14, 'residential', 2);
  // Tier 2-3 — west ring: the skyline past the garage and safehouse.
  raiseFixedBuilding(-168, -84, 12, 12, 14, 'residential', 1);
  raiseFixedBuilding(-168, -28, 14, 12, 20, 'commercial', 0);
  raiseFixedBuilding(-168, 28, 12, 12, 16, 'residential', 2);
  raiseFixedBuilding(-168, 84, 14, 12, 12, 'commercial', 1);
  // Tier 2-3 — south ring: the skyline past the hospital and docks,
  // filling the gaps between the iteration-2 south buildings.
  raiseFixedBuilding(-140, 166, 12, 12, 13, 'residential', 0);
  raiseFixedBuilding(-84, 166, 14, 12, 17, 'commercial', 2);
  raiseFixedBuilding(-28, 166, 12, 12, 12, 'residential', 1);
  raiseFixedBuilding(28, 166, 14, 12, 21, 'glass', 1);
  raiseFixedBuilding(84, 166, 12, 12, 15, 'commercial', 0);
  raiseFixedBuilding(132, 166, 12, 12, 11, 'brick', 2);

  // v9 rooftop clutter: AC boxes, vent pipes, satellite dishes and neon
  // roof strips, so the skyline stops reading as flat slabs. Instanced —
  // one draw call per type for the whole city. Placement is a pure hash
  // of each building's own coordinates, so the main rng stream is never
  // touched and the city layout stays byte-identical to v8. Every item
  // sits on a roof (roof top = h + 0.5, the rim's top edge), above play.
  // Runs after the hotels, so they get clutter too.
  {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const acMats = [];
    const ventMats = [];
    const dishMats = [];
    const stripMats = [];
    for (const b of buildingRecords) {
      const roofY = b.h + 0.5;
      const nAc = hash01(b.x, b.z, 11) < 0.75 ? 1 + Math.floor(hash01(b.x, b.z, 12) * 2) : 0;
      for (let i = 0; i < nAc; i += 1) {
        const ax = b.x + (hash01(b.x, b.z, 20 + i) - 0.5) * Math.max(2, b.w - 3);
        const az = b.z + (hash01(b.x, b.z, 30 + i) - 0.5) * Math.max(2, b.d - 3);
        e.set(0, hash01(b.x, b.z, 40 + i) < 0.5 ? 0 : Math.PI / 2, 0);
        q.setFromEuler(e);
        p.set(ax, roofY + 0.45, az);
        s.set(1, 1, 1);
        m4.compose(p, q, s);
        acMats.push(m4.clone());
      }
      const nVent = hash01(b.x, b.z, 13) < 0.6 ? 1 + Math.floor(hash01(b.x, b.z, 14) * 2) : 0;
      for (let i = 0; i < nVent; i += 1) {
        const vx = b.x + (hash01(b.x, b.z, 50 + i) - 0.5) * Math.max(2, b.w - 2);
        const vz = b.z + (hash01(b.x, b.z, 60 + i) - 0.5) * Math.max(2, b.d - 2);
        e.set(0, 0, 0);
        q.setFromEuler(e);
        p.set(vx, roofY + 0.8, vz);
        s.set(1, 1, 1);
        m4.compose(p, q, s);
        ventMats.push(m4.clone());
      }
      if (hash01(b.x, b.z, 15) < 0.4) {
        const dx = b.x + (hash01(b.x, b.z, 70) - 0.5) * Math.max(2, b.w - 3);
        const dz = b.z + (hash01(b.x, b.z, 71) - 0.5) * Math.max(2, b.d - 3);
        e.set(0.7, hash01(b.x, b.z, 72) * Math.PI * 2, 0);
        q.setFromEuler(e);
        p.set(dx, roofY + 0.35, dz);
        s.set(1, 1, 1);
        m4.compose(p, q, s);
        dishMats.push(m4.clone());
      }
      // A thin neon strip along the front roof edge on the tall lit
      // districts — the skyline's own neon, not a sign.
      if ((b.style === 'glass' || b.style === 'commercial' || b.style === 'deco') && hash01(b.x, b.z, 16) < 0.45) {
        e.set(0, 0, 0);
        q.setFromEuler(e);
        p.set(b.x, roofY + 0.1, b.z + b.d / 2 - 0.2);
        s.set(b.w * 0.6, 0.18, 0.3);
        m4.compose(p, q, s);
        stripMats.push(m4.clone());
      }
    }
    function instanced(geo, mat, mats) {
      if (mats.length === 0) return;
      const im = new THREE.InstancedMesh(geo, mat, mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true;
      group.add(im);
    }
    instanced(new THREE.BoxGeometry(1.4, 0.9, 1.4), cityMat(0x8a9096, 0.9), acMats);
    instanced(new THREE.CylinderGeometry(0.25, 0.32, 1.6, 8), cityMat(0x3a3f45, 0.6, 0.5), ventMats);
    instanced(new THREE.ConeGeometry(0.75, 0.3, 10), cityMat(0xd8d8d8, 0.5, 0.4), dishMats);
    instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffd23e }), stripMats);
  }

  // Docks: wooden piers reaching toward the sea, plus the working clutter
  // of a harbor — containers, crate stacks and barrels — so the Payback
  // fight happens in a place, not on an empty lot.
  for (let i = 0; i < 3; i += 1) {
    group.add(box(6, 1, 22, 0x7a5c38, landmarks.docks.x + 8 + i * 10, 0.6, landmarks.docks.z - 6 + i * 6));
  }
  const containerColors = [0x8a4a38, 0x2a7a8c, 0x6a6a5a];
  [[152, 96], [152, 108], [148, 124]].forEach(([cx, cz], i) => {
    group.add(box(6, 2.6, 2.6, containerColors[i % 3], cx, 1.3, cz));
  });
  const crateMat = cityMat(0x8a6a42, 0.95);
  [[128, 128], [120, 112], [124, 100]].forEach(([cx, cz]) => {
    const stack = new THREE.Group();
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), crateMat);
    c1.position.y = 0.8;
    c1.castShadow = true;
    stack.add(c1);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), crateMat);
    c2.position.set(0.3, 2.2, 0.2);
    c2.rotation.y = 0.4;
    c2.castShadow = true;
    stack.add(c2);
    stack.position.set(cx, 0, cz);
    group.add(stack);
  });
  // Explosive red barrels: four at the docks, two on the garage forecourt,
  // two at the plaza edge. They are props until shot — then they go up
  // (see explodeBarrel in game.js). The list is returned with the city so
  // the game can test shots against them. All eight sit in clear ground
  // the builder controls: the docks, the garage forecourt north of the
  // building, and the plaza block (no random buildings there).
  const barrelMat = cityMat(0xc22a22, 0.6, 0.3);
  const barrels = [];
  [[136, 124], [132, 126], [118, 96], [128, 118], [-98, 97], [-126, 97], [36, -8], [76, 8]].forEach(([bx2, bz2]) => {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 10), barrelMat);
    barrel.position.set(bx2, 0.65, bz2);
    barrel.castShadow = true;
    group.add(barrel);
    barrels.push({ mesh: barrel, x: bx2, z: bz2, alive: true });
  });

  // Parks: two green blocks with no buildings — grass, leafy trees,
  // benches and crossing paths. Palm Gardens in the north-west (the
  // safehouse sits on its edge) and Coral Park by the hospital.
  function buildPark(cx, cz) {
    group.add(flat(W.blockSize + 4, W.blockSize + 4, cfg.palette.grass, cx, cz, 0.04));
    // Crossing paths, pale gravel.
    group.add(flat(4, W.blockSize + 4, 0xd8d3a8, cx, cz, 0.06));
    group.add(flat(W.blockSize + 4, 4, 0xd8d3a8, cx, cz, 0.06));
    const treeTrunk = cityMat(0x5a4630, 1);
    const treeLeaf = cityMat(0x4a7a3a, 1);
    for (let i = 0; i < 7; i += 1) {
      const tx = cx + rng.range(-18, 18);
      const tz = cz + rng.range(-18, 18);
      if (Math.abs(tx - cx) < 3 && Math.abs(tz - cz) < 3) continue;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 2.6, 6), treeTrunk);
      trunk.position.y = 1.3;
      trunk.castShadow = true;
      tree.add(trunk);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.9, 10, 8), treeLeaf);
      crown.position.y = 3.6;
      crown.castShadow = true;
      tree.add(crown);
      const crown2 = new THREE.Mesh(new THREE.SphereGeometry(1.3, 8, 6), treeLeaf);
      crown2.position.set(0.9, 2.8, 0.5);
      tree.add(crown2);
      tree.position.set(tx, 0, tz);
      group.add(tree);
    }
    // Benches (v9 iteration 3): aligned to the crossing paths, never
    // random. Three fixed spots per park — east of the north-south path
    // facing it, west of it facing it, north of the east-west path
    // facing it — so no bench sits sideways or overlaps a path edge.
    // The same rng draws are still consumed, as a ±0.4 jitter on the
    // fixed spot, so the seeded city downstream stays byte-identical.
    const benchSpots = [
      { dx: 3.2, dz: -8, rot: -Math.PI / 2 },
      { dx: -3.2, dz: 8, rot: Math.PI / 2 },
      { dx: -8, dz: -3.2, rot: 0 },
    ];
    const benchMat = cityMat(0x6a4a2a, 0.9);
    for (let i = 0; i < 3; i += 1) {
      const bench = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.6), benchMat);
      seat.position.y = 0.5;
      seat.castShadow = true;
      bench.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.1), benchMat);
      back.position.set(0, 0.85, -0.28);
      bench.add(back);
      for (const lx of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.5), benchMat);
        leg.position.set(lx, 0.25, 0);
        bench.add(leg);
      }
      const jx = rng.range(-14, 14);
      const jz = rng.range(-14, 14);
      rng.range(0, Math.PI);
      bench.position.set(cx + benchSpots[i].dx + jx * 0.03, 0, cz + benchSpots[i].dz + jz * 0.03);
      bench.rotation.y = benchSpots[i].rot;
      group.add(bench);
    }
  }
  buildPark(-112, -112);
  buildPark(56, 112);

  // The boardwalk: a plank strip along the sand edge, with lamps and a
  // lifeguard tower, so the coast reads as a place people go.
  const boardwalk = new THREE.Mesh(
    new THREE.PlaneGeometry(8, half * 2),
    new THREE.MeshStandardMaterial({ map: boardwalkTexture(), roughness: 0.9 }),
  );
  boardwalk.rotation.x = -Math.PI / 2;
  boardwalk.position.set(145, 0.06, 0);
  boardwalk.receiveShadow = true;
  group.add(boardwalk);
  const tower2 = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.4, 2.2), cityMat(0xf2ead8, 0.9));
  legs.position.y = 1.7;
  legs.castShadow = true;
  tower2.add(legs);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.6, 2.8), cityMat(0xd84a4a, 0.8));
  cabin.position.y = 4.2;
  cabin.castShadow = true;
  tower2.add(cabin);
  const roof2 = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.2, 4), cityMat(0x2a7a8c, 0.8));
  roof2.position.y = 5.6;
  roof2.rotation.y = Math.PI / 4;
  tower2.add(roof2);
  tower2.position.set(158, 0, 60);
  group.add(tower2);
  // Lifeguard dressing (v9 iteration 3): the tower above reads as a plain
  // red box on a beige pillar. Red-white bands, a life-ring, a ladder,
  // a watch chair on a sea-side platform, and a red flag on the roof make
  // it read as a lifeguard spot from the beach. All fixed geometry.
  {
    const bandMat = cityMat(0xd84a4a, 0.8);
    for (const by of [1.1, 2.3]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.28, 2.3), bandMat);
      band.position.set(158, by, 60);
      group.add(band);
    }
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.13, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.7 }),
    );
    ring.rotation.y = Math.PI / 2;
    ring.position.set(159.15, 2.0, 60);
    group.add(ring);
    // Ladder on the sea-facing side of the legs.
    const railMat = cityMat(0x3a3f45, 0.6);
    for (const lz of [59.6, 60.4]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 6), railMat);
      rail.position.set(159.15, 1.7, lz);
      group.add(rail);
    }
    for (let ly = 0.5; ly <= 3.2; ly += 0.55) {
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6), railMat);
      rung.rotation.x = Math.PI / 2;
      rung.position.set(159.15, ly, 60);
      group.add(rung);
    }
    // Watch chair: a small platform off the cabin's sea side, seat and
    // backrest facing the water.
    const plat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 2.0), cityMat(0x7a5c38, 0.9));
    plat.position.set(160.1, 3.55, 60);
    plat.castShadow = true;
    group.add(plat);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 1.0), cityMat(0xf2f2f2, 0.8));
    seat.position.set(160.3, 3.95, 60);
    group.add(seat);
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 1.0), cityMat(0xd84a4a, 0.8));
    seatBack.position.set(159.8, 4.4, 60);
    group.add(seatBack);
    // Red flag on the roof apex.
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), railMat);
    flagPole.position.set(158, 7.2, 60);
    group.add(flagPole);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.55),
      new THREE.MeshStandardMaterial({ color: 0xd84a4a, side: THREE.DoubleSide, roughness: 0.8 }),
    );
    flag.position.set(158.5, 8.05, 60);
    group.add(flag);
  }
  // Fuego Pier (v9 iteration 3): a wooden pier from the sand into the sea
  // at z = 100 — clear of the umbrellas (z 80 / 120), the palms (z 84 /
  // 112), the lifeguard tower (z 60) and the docks (z 95-129, x 143-169).
  // Deck + posts + rails + a wider end platform with a lamp. Fixed
  // geometry, no rng. The player clamp stops at x 165, so the pier is
  // skyline/polish, not a walkable path — no gameplay change.
  {
    const pierWood = cityMat(0x7a5c38, 0.9);
    const pierDark = cityMat(0x5a4630, 0.9);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(33, 0.3, 4), pierWood);
    deck.position.set(184.5, 1.0, 100);
    deck.castShadow = true;
    deck.receiveShadow = true;
    group.add(deck);
    const deckTop = new THREE.Mesh(
      new THREE.PlaneGeometry(33, 4),
      new THREE.MeshStandardMaterial({ map: boardwalkTexture(), roughness: 0.9 }),
    );
    deckTop.rotation.x = -Math.PI / 2;
    deckTop.position.set(184.5, 1.16, 100);
    group.add(deckTop);
    for (let px = 170; px <= 204; px += 6) {
      for (const pz of [98.4, 101.6]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 2.2, 6), pierDark);
        post.position.set(px, 0.1, pz);
        post.castShadow = true;
        group.add(post);
      }
    }
    for (const rz of [98.2, 101.8]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(33, 0.12, 0.12), pierDark);
      rail.position.set(184.5, 1.75, rz);
      group.add(rail);
    }
    for (let px = 170; px <= 198; px += 6) {
      for (const rz of [98.2, 101.8]) {
        const railPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6), pierDark);
        railPost.position.set(px, 1.4, rz);
        group.add(railPost);
      }
    }
    const platform = new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, 8), pierWood);
    platform.position.set(205, 1.0, 100);
    platform.castShadow = true;
    group.add(platform);
    const platTop = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.MeshStandardMaterial({ map: boardwalkTexture(), roughness: 0.9 }),
    );
    platTop.rotation.x = -Math.PI / 2;
    platTop.position.set(205, 1.16, 100);
    group.add(platTop);
    const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.2, 6), cityMat(0x2a2d33, 0.6));
    lampPole.position.set(207.5, 2.75, 97.5);
    group.add(lampPole);
    const lampBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
    );
    lampBulb.position.set(207.5, 4.45, 97.5);
    group.add(lampBulb);
  }

  // Mercado market stalls: six colorful stalls with striped awnings and
  // fruit crates along the mercado block's street edges. Vendors stand at
  // them (see people.js); the stall spots are returned for the spawner.
  const stallSpots = [];
  const stallDefs = [
    { x: 42, z: -88, awn: 0 }, { x: 56, z: -88, awn: 1 }, { x: 70, z: -88, awn: 2 },
    { x: 80, z: -98, awn: 1 }, { x: 80, z: -112, awn: 0 }, { x: 80, z: -126, awn: 2 },
  ];
  const fruitColors = [0xe07828, 0xd84a4a, 0xe8c832, 0x3aa655];
  for (const def of stallDefs) {
    const stall = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1, 1.6), cityMat(0x6a4a2a, 0.9));
    counter.position.y = 0.5;
    counter.castShadow = true;
    stall.add(counter);
    for (const px of [-1.4, 1.4]) {
      for (const pz of [-0.6, 0.6]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), cityMat(0x3a3f45, 0.6));
        pole.position.set(px, 1.2, pz);
        stall.add(pole);
      }
    }
    const awnTex = AWNING_TEXTURES[def.awn].clone();
    awnTex.needsUpdate = true;
    awnTex.repeat.set(2, 1);
    const awning = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 2.2),
      new THREE.MeshStandardMaterial({ map: awnTex, side: THREE.DoubleSide, roughness: 0.9 }),
    );
    awning.rotation.x = -Math.PI / 2 + 0.25;
    awning.position.y = 2.5;
    awning.castShadow = true;
    stall.add(awning);
    for (let f = 0; f < 4; f += 1) {
      const fruit = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 8, 6),
        new THREE.MeshStandardMaterial({ color: fruitColors[(f + def.awn) % 4], roughness: 0.7 }),
      );
      fruit.position.set(-1.1 + f * 0.75, 1.15, rng.range(-0.4, 0.4));
      stall.add(fruit);
    }
    stall.position.set(def.x, 0, def.z);
    stall.rotation.y = def.x > 76 ? Math.PI / 2 : 0;
    group.add(stall);
    // The vendor stands behind the stall (block side) and faces the street.
    stallSpots.push(def.x > 76
      ? { x: def.x, z: def.z, facing: Math.PI / 2, vx: def.x - 1.4, vz: def.z, vFacing: Math.PI / 2 }
      : { x: def.x, z: def.z, facing: 0, vx: def.x, vz: def.z - 1.4, vFacing: 0 });
  }

  // Palms along the beach and a few on the avenues, denser than before —
  // the coast is palm-lined now, and the avenues get trees too.
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.4, 7, 6),
      new THREE.MeshStandardMaterial({ color: PALM_TRUNK, roughness: 1 }),
    );
    trunk.position.y = 3.5;
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 5; i += 1) {
      const leaf = new THREE.Mesh(
        new THREE.ConeGeometry(0.9, 4.5, 4),
        new THREE.MeshStandardMaterial({ color: PALM_LEAF, roughness: 1 }),
      );
      const a = (i / 5) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.6, 7.2, Math.sin(a) * 1.6);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    return g;
  }
  for (let z = -140; z <= 140; z += 28) {
    group.add(palm(W.beachX + 4 + rng.range(-2, 2), z + rng.range(-4, 4)));
    group.add(palm(W.beachX - 6 + rng.range(-2, 2), z + 14 + rng.range(-4, 4)));
    if (rng.chance(0.5)) group.add(palm(-140 + rng.range(-2, 2), z));
  }
  // Leafy avenue trees, one or two per block edge, seeded.
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      if (skipBlocks.has(`${bx},${bz}`)) continue;
      if (!rng.chance(0.45)) continue;
      const tx = bx + rng.range(-20, 20);
      const tz = bz + rng.range(-20, 20);
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2.4, 6), cityMat(0x5a4630, 1));
      trunk.position.y = 1.2;
      trunk.castShadow = true;
      tree.add(trunk);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.7, 10, 8), cityMat(0x4a7a3a, 1));
      crown.position.y = 3.3;
      crown.castShadow = true;
      tree.add(crown);
      tree.position.set(tx, 0, tz);
      group.add(tree);
    }
  }

  // Street props: red hydrants and benches along the sidewalks, bins by
  // the shops, and beach umbrellas on the sand, so the streets stop
  // reading empty. A few props are placed by hand near the spawn, so the
  // first frame a new player sees already has a bench, a hydrant and a
  // bin in it.
  const hydrantMat = new THREE.MeshStandardMaterial({ color: 0xc22a22, roughness: 0.7 });
  function hydrant(x, z) {
    const h = new THREE.Group();
    const bodyH = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.7, 8), hydrantMat);
    bodyH.position.y = 0.35;
    bodyH.castShadow = true;
    h.add(bodyH);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), hydrantMat);
    cap.position.y = 0.75;
    h.add(cap);
    h.position.set(x, 0, z);
    return h;
  }
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 });
  function bench(x, z, rot) {
    const b = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.6), benchMat);
    seat.position.y = 0.5;
    seat.castShadow = true;
    b.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.1), benchMat);
    back.position.set(0, 0.85, -0.28);
    b.add(back);
    for (const lx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.5), benchMat);
      leg.position.set(lx, 0.25, 0);
      b.add(leg);
    }
    b.position.set(x, 0, z);
    b.rotation.y = rot;
    return b;
  }
  function bin(x, z) {
    const b = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.4, 1.1, 10),
      cityMat(0x2a4a3a, 0.8, 0.3),
    );
    b.position.set(x, 0.55, z);
    b.castShadow = true;
    return b;
  }

  // Neon Plaza: the central plaza landmark, one block east of the tower —
  // a paved circle, a fountain with a glowing water disc and neon rings
  // around its column, benches and palms at the edge. One strong landmark
  // beats scattered props, and the map names it. Built here, after the
  // bench/palm helpers and their materials exist — building it earlier
  // (by the tower) hit the benchMat temporal dead zone.
  const plazaDisc = new THREE.Mesh(
    new THREE.CircleGeometry(20, 32),
    new THREE.MeshLambertMaterial({ color: 0x9a8f7a }),
  );
  plazaDisc.rotation.x = -Math.PI / 2;
  plazaDisc.position.set(56, 0.05, 0);
  plazaDisc.receiveShadow = true;
  group.add(plazaDisc);
  function plazaCyl(rt, rb, h, color, x, y, z) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(rt, rb, h, 16),
      new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
    );
    m.position.set(x, y, z);
    m.castShadow = true;
    group.add(m);
    return m;
  }
  plazaCyl(6, 6, 0.9, 0x6a7a8a, 56, 0.45, 0);
  const plazaWater = new THREE.Mesh(
    new THREE.CircleGeometry(5, 24),
    new THREE.MeshBasicMaterial({ color: 0x35e0e6 }),
  );
  plazaWater.rotation.x = -Math.PI / 2;
  plazaWater.position.set(56, 0.92, 0);
  group.add(plazaWater);
  plazaCyl(0.8, 0.8, 4, 0x2a2f38, 56, 2.9, 0);
  for (const [ry, color] of [[2.6, 0xff2fb3], [3.6, 0x35e0e6]]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.3, 0.12, 8, 24),
      new THREE.MeshBasicMaterial({ color }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(56, ry, 0);
    group.add(ring);
  }
  group.add(bench(56, -14, 0));
  group.add(bench(56, 14, Math.PI));
  group.add(bench(42, 0, Math.PI / 2));
  group.add(bench(70, 0, -Math.PI / 2));
  group.add(palm(40, -16));
  group.add(palm(72, -16));
  group.add(palm(40, 16));
  group.add(palm(72, 16));

  group.add(hydrant(-104, 52));
  // Spawn benches (v9 iteration 3): aligned to the nearest road instead
  // of tilted at 0.6 / -0.4 rad — the east one faces the Coral Row road,
  // the north one faces the road by the garage.
  group.add(bench(-100, 50, Math.PI / 2));
  group.add(bin(-106, 68));
  group.add(bench(-118, 72, 0));
  for (let i = 0; i < 18; i += 1) {
    const hx = blockCenters[Math.floor(rng.next() * blockCenters.length)] + rng.range(-24, 24);
    const hz = blockCenters[Math.floor(rng.next() * blockCenters.length)] + rng.range(-24, 24);
    group.add(hydrant(hx, hz));
  }
  // Roadside benches (v9 iteration 3): the same rng draws, but the bench
  // is snapped to the nearest sidewalk edge — 8.5 from the road line, on
  // the sidewalk, facing the road — instead of landing at a random angle
  // in the middle of a block. Never within 3.5 of a hidden-package spot
  // (coordinates mirror packages.js SPOTS); if it would be, it slides 4
  // along the road.
  const packSpots = [[-98, 96], [-98, -92], [160, 40], [128, 118], [146, -20], [20, 20], [62, -68], [-14, 118], [-40, -108], [70, 70]];
  for (let i = 0; i < 12; i += 1) {
    const bx2 = blockCenters[Math.floor(rng.next() * blockCenters.length)] + rng.range(-22, 22);
    const bz2 = blockCenters[Math.floor(rng.next() * blockCenters.length)] + rng.range(-22, 22);
    rng.range(0, Math.PI);
    let rx = roadLines[0];
    for (const c of roadLines) if (Math.abs(bx2 - c) < Math.abs(bx2 - rx)) rx = c;
    let rz = roadLines[0];
    for (const c of roadLines) if (Math.abs(bz2 - c) < Math.abs(bz2 - rz)) rz = c;
    let sx;
    let sz;
    let rot;
    if (Math.abs(bx2 - rx) <= Math.abs(bz2 - rz)) {
      sx = rx + (bx2 >= rx ? 8.5 : -8.5);
      sz = bz2;
      // Keep off the crossing road in the other axis.
      if (Math.abs(sz - rz) < 9) sz = rz + (sz >= rz ? 9 : -9);
      rot = bx2 >= rx ? -Math.PI / 2 : Math.PI / 2;
    } else {
      sz = rz + (bz2 >= rz ? 8.5 : -8.5);
      sx = bx2;
      if (Math.abs(sx - rx) < 9) sx = rx + (sx >= rx ? 9 : -9);
      rot = bz2 >= rz ? Math.PI : 0;
    }
    for (const [px, pz] of packSpots) {
      if (Math.hypot(sx - px, sz - pz) < 3.5) {
        if (Math.abs(bx2 - rx) <= Math.abs(bz2 - rz)) sz += 4;
        else sx += 4;
      }
    }
    group.add(bench(sx, sz, rot));
  }
  for (let i = 0; i < 10; i += 1) {
    const bx3 = blockCenters[Math.floor(rng.next() * blockCenters.length)] + rng.range(-22, 22);
    const bz3 = blockCenters[Math.floor(rng.next() * blockCenters.length)] + rng.range(-22, 22);
    group.add(bin(bx3, bz3));
  }
  for (let z = -120; z <= 120; z += 40) {
    const umb = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), benchMat);
    pole.position.y = 1.1;
    umb.add(pole);
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(1.8, 0.9, 8),
      new THREE.MeshStandardMaterial({ color: [0xd84a4a, 0x4a7ad8, 0xe8c832][Math.floor(z / 40 + 3) % 3], roughness: 0.9 }),
    );
    canopy.position.y = 2.5;
    canopy.castShadow = true;
    umb.add(canopy);
    umb.position.set(W.beachX + 8 + rng.range(-2, 2), 0, z + rng.range(-6, 6));
    group.add(umb);
  }

  // Traffic lights at the busiest junctions: a pole on each corner, a
  // head with red / yellow / green lamps. The lamps are MeshBasicMaterials
  // shared per junction and axis, so the game can switch them with one
  // color change each (see game.js updateLightHeads).
  const lightHeads = [];
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.6 });
  for (const j of cfg.lights.junctions) {
    const mats = {
      ns: {
        red: new THREE.MeshBasicMaterial({ color: 0x661111 }),
        yellow: new THREE.MeshBasicMaterial({ color: 0x554411 }),
        green: new THREE.MeshBasicMaterial({ color: 0x11aa33 }),
      },
      ew: {
        red: new THREE.MeshBasicMaterial({ color: 0xff2222 }),
        yellow: new THREE.MeshBasicMaterial({ color: 0x554411 }),
        green: new THREE.MeshBasicMaterial({ color: 0x114422 }),
      },
    };
    lightHeads.push({ x: j.x, z: j.z, mats });
    for (const [cx, cz] of [
      [j.x - 8, j.z - 8], [j.x + 8, j.z - 8], [j.x - 8, j.z + 8], [j.x + 8, j.z + 8],
    ]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.5, 6), poleMat);
      pole.position.set(cx, 2.75, cz);
      pole.castShadow = true;
      group.add(pole);
      // One head per pole, facing the junction: three lamps in a column.
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 0.5), poleMat);
      head.position.set(cx, 5.6, cz);
      group.add(head);
      const lampGeo = new THREE.SphereGeometry(0.16, 8, 6);
      const lampY = [6.05, 5.6, 5.15];
      for (let li = 0; li < 3; li += 1) {
        const lampNs = new THREE.Mesh(lampGeo, [mats.ns.red, mats.ns.yellow, mats.ns.green][li]);
        lampNs.position.set(cx - 0.28, lampY[li], cz);
        group.add(lampNs);
        const lampEw = new THREE.Mesh(lampGeo, [mats.ew.red, mats.ew.yellow, mats.ew.green][li]);
        lampEw.position.set(cx + 0.28, lampY[li], cz);
        group.add(lampEw);
      }
    }
  }

  // Street-name signs at eight non-light intersections (v9 iteration 3):
  // a pole on the sidewalk corner and a green blade naming the cross
  // street, readable from both sides. Clear of mission lines, package
  // spots, the duel area and the beach. No rng.
  const STREET_SIGNS = [
    { x: -84, z: -28, name: 'SUNSET DR' },
    { x: -28, z: 28, name: 'PLAZA WAY' },
    { x: 28, z: 84, name: 'DOCKS RD' },
    { x: 84, z: -28, name: 'SUNSET DR' },
    { x: -84, z: 84, name: 'DOCKS RD' },
    { x: 84, z: 56, name: 'BOARDWALK AVE' },
    { x: -28, z: -56, name: 'CINE ST' },
    { x: 56, z: -84, name: 'BAYVIEW LN' },
  ];
  for (const s of STREET_SIGNS) {
    const px = s.x + 8.5;
    const pz = s.z + 8.5;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.2, 6), poleMat);
    pole.position.set(px, 1.63, pz);
    pole.castShadow = true;
    group.add(pole);
    const tex = signTexture(s.name, '#1a5a2a', '#ffffff');
    const bladeMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
    const theta = Math.atan2(s.x - px, s.z - pz);
    for (const side of [0, Math.PI]) {
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), bladeMat);
      blade.position.set(px, 2.9, pz);
      blade.rotation.y = theta + side;
      blade.translateZ(0.02);
      group.add(blade);
    }
  }

  // Street lamps along the avenues.
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.6 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lampSpots = [];
  for (const c of roadLines) {
    for (let t = -half + 20; t < half - 10; t += 56) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), lampMat);
      pole.position.set(c + W.roadWidth / 2 + 1, 3, t);
      pole.castShadow = true;
      group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), bulbMat);
      bulb.position.set(c + W.roadWidth / 2 + 1, 6.2, t);
      group.add(bulb);
      lampSpots.push({ x: c + W.roadWidth / 2 + 1, z: t });
    }
  }

  // v9 wet ground, part two: puddles and lamp light pools.
  //
  // Puddles are flat low-roughness discs that catch the sun, the lamps
  // and the pink sky — the wet-street read. One InstancedMesh, one draw
  // call, per-instance colour variation (slate, pink sky, warm lamp).
  // All flat on the ground: no collision, no gameplay change. Placement
  // is a pure hash of road/block coordinates — no rng consumed.
  // NOTE: tints are LIGHTER and pinker than the ground, and the material
  // carries a faint pink emissive — a puddle at dusk reflects the bright
  // pink sky, so it must read lighter than the dirt around it. Dark tints
  // with no environment map render as black holes, not water (v9 iter 1).
  // v9 iteration 3 (seasons): the puddle and pool meshes are captured
  // here so setSeason() can hide them in the dry season.
  let puddleMesh = null;
  let poolMesh = null;
  {
    const geo = new THREE.CircleGeometry(1, 20);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.18, metalness: 0.1,
      emissive: 0x2a1820, emissiveIntensity: 0.5,
    });
    const spots = [];
    const tints = [0x7a5a68, 0x6a5a72, 0x8a6a5e];
    function addPuddle(x, z, y, r, tintH) {
      spots.push({ x, z, y, r, tint: tints[Math.floor(tintH * 3) % 3] });
    }
    for (const c of roadLines) {
      for (let t = -half + 16; t < half - 8; t += 24) {
        if (hash01(c, t, 7) < 0.4) {
          addPuddle(c + (hash01(c, t, 8) - 0.5) * 8, t, 0.045, 1.0 + hash01(c, t, 9) * 1.6, hash01(c, t, 10));
        }
        if (hash01(t, c, 7) < 0.4) {
          addPuddle(t, c + (hash01(t, c, 8) - 0.5) * 8, 0.045, 1.0 + hash01(t, c, 9) * 1.6, hash01(t, c, 10));
        }
      }
    }
    for (const bx of blockCenters) {
      for (const bz of blockCenters) {
        if (skipBlocks.has(`${bx},${bz}`)) continue;
        if (hash01(bx, bz, 17) < 0.5) {
          addPuddle(
            bx + (hash01(bx, bz, 18) - 0.5) * 30, bz + (hash01(bx, bz, 19) - 0.5) * 30,
            -0.025, 1.2 + hash01(bx, bz, 21) * 1.2, hash01(bx, bz, 22),
          );
        }
      }
    }
    // Docks ground, garage apron, and the dialogue foreground street.
    for (const [px, pz] of [[136, 108], [144, 120], [128, 104], [150, 132], [132, 116], [140, 100], [146, 128]]) {
      addPuddle(px + (hash01(px, pz, 23) - 0.5) * 4, pz + (hash01(px, pz, 24) - 0.5) * 4, -0.025, 1.3 + hash01(px, pz, 25) * 1.2, hash01(px, pz, 26));
    }
    addPuddle(-118, 67, 0.075, 1.2, 0.1);
    addPuddle(-105, 73, 0.075, 1.5, 0.6);
    addPuddle(-108, 62, 0.055, 1.8, 0.3);
    addPuddle(-116, 58, 0.055, 1.4, 0.8);
    const im = new THREE.InstancedMesh(geo, mat, spots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    spots.forEach((sp, i) => {
      e.set(-Math.PI / 2, 0, hash01(sp.x, sp.z, 27) * Math.PI * 2);
      q.setFromEuler(e);
      p.set(sp.x, sp.y, sp.z);
      s.set(sp.r * (0.8 + hash01(sp.x, sp.z, 28) * 0.7), sp.r * (0.6 + hash01(sp.x, sp.z, 29) * 0.6), 1);
      m4.compose(p, q, s);
      im.setMatrixAt(i, m4);
      col.setHex(sp.tint);
      im.setColorAt(i, col);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.receiveShadow = true;
    group.add(im);
    puddleMesh = im;
  }

  // v9 lamp light pools: a warm additive glow on the pavement under every
  // street lamp, so the lamps read as light sources instead of bare poles.
  // One InstancedMesh, one draw call, one shared gradient texture.
  {
    const geo = new THREE.CircleGeometry(1, 24);
    const mat = new THREE.MeshBasicMaterial({
      map: lightPoolTexture(), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, color: 0xffb27a, opacity: 0.65,
    });
    const im = new THREE.InstancedMesh(geo, mat, lampSpots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    lampSpots.forEach((lp, i) => {
      e.set(-Math.PI / 2, 0, 0);
      q.setFromEuler(e);
      p.set(lp.x, 0.06, lp.z);
      const r = 3.5 + hash01(lp.x, lp.z, 3) * 1.5;
      s.set(r, r, 1);
      m4.compose(p, q, s);
      im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
    group.add(im);
    poolMesh = im;
  }

  // Warm light pools along the beachfront boulevard: a handful of real
  // PointLights (cheap count, intensity follows the dusk in game.js), so
  // the boulevard glows instead of going flat at sunset.
  const streetlights = [];
  for (let t = -112; t <= 112; t += 56) {
    const light = new THREE.PointLight(0xffb27a, 0, 80, 1.8);
    light.position.set(140, 6.5, t);
    group.add(light);
    streetlights.push(light);
  }

  // Ambient police helicopter: decoration only, a slow circle high over
  // the city. It never chases, never shoots — it is skyline, not a system.
  const heli = new THREE.Group();
  const heliBody = new THREE.Mesh(
    new THREE.CapsuleGeometry(1.1, 3.2, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x22303a, roughness: 0.5, metalness: 0.4 }),
  );
  heliBody.rotation.x = Math.PI / 2;
  heliBody.castShadow = true;
  heli.add(heliBody);
  const heliTail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.4, 3.4, 6),
    new THREE.MeshStandardMaterial({ color: 0x22303a, roughness: 0.5, metalness: 0.4 }),
  );
  heliTail.rotation.x = Math.PI / 2;
  heliTail.position.set(0, 0.2, -3.2);
  heli.add(heliTail);
  const rotor = new THREE.Group();
  rotor.position.y = 1.3;
  const bladeGeo = new THREE.BoxGeometry(7.5, 0.08, 0.4);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.6 });
  for (const rz of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.rotation.y = rz;
    rotor.add(blade);
  }
  heli.add(rotor);
  const spot = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff6c8 }),
  );
  spot.position.set(0, -0.9, 1.2);
  heli.add(spot);
  heli.position.set(0, 64, 0);
  scene.add(heli);
  heli.userData.rotor = rotor;

  // Two seasons (v9 iteration 3): MUSIM HUJAN (odd days) keeps the rain,
  // puddles, lamp pools and wet-street shine; MUSIM KEMARAU (even days)
  // hides all of them and dries the streets out (roughness up, shine
  // gone), so the pink dusk stands clear. Pure function of the day —
  // deterministic, no rng.
  function setSeason(rainy) {
    if (puddleMesh) puddleMesh.visible = rainy;
    if (poolMesh) poolMesh.visible = rainy;
    wetRoadMat.roughness = rainy ? 0.35 : 0.92;
    wetRoadMat.metalness = rainy ? 0.25 : 0.02;
    wetGroundMat.roughness = rainy ? 0.45 : 0.95;
    wetWalkMat.roughness = rainy ? 0.55 : 0.95;
    wetApronMat.roughness = rainy ? 0.5 : 0.9;
  }

  return { group, roadLines, blockCenters, landmarks, half, pitch, streetlights, heli, lightHeads, stallSpots, barrels, buildingCount: buildingRecords.length, setSeason };
}
