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
  { text: "MARLA'S GARAGE", bg: '#4a2a12', fg: '#ffd23e' },
  { text: 'Lemen Sayang Nycthyra', bg: '#2a4a22', fg: '#eaf4ff' },
  { text: 'CINE SOL', bg: '#5a1a3a', fg: '#ffb27a' },
  { text: 'HOTEL BRISA', bg: '#1a3a5a', fg: '#ffe9a8' },
  { text: 'FARMACIA', bg: '#2a5a3a', fg: '#ffffff' },
  { text: 'BURGER FUEGO', bg: '#5a2a1a', fg: '#ffd23e' },
  { text: 'SURF & SOL', bg: '#1a4a5a', fg: '#7dffd8' },
  // v9 iteration 5 (§0): ground-floor commercial for the dense city fill —
  // our own Indonesian shop names, so the street reads Costa Fuego.
  { text: 'JAYA AUTO REPAIR', bg: '#2a2a2a', fg: '#ffd23e' },
  { text: 'MINIMART 24', bg: '#1a5a2a', fg: '#ffffff' },
  { text: 'COFFEE STALL', bg: '#5a3a1a', fg: '#ffe9a8' },
  { text: 'CORNER STORE', bg: '#3a2a5a', fg: '#7dffd8' },
  { text: 'DUSK CAFE', bg: '#5a2a3a', fg: '#ffb27a' },
  { text: 'QUICK LAUNDRY', bg: '#1a3a5a', fg: '#7dd8ff' },
  { text: 'BARBERSHOP', bg: '#2a2a2a', fg: '#eaf4ff' },
  { text: 'TOASTED BREAD', bg: '#7a4a1a', fg: '#ffe9a8' },
  { text: 'BIKE WASH', bg: '#123a4a', fg: '#7dffd8' },
  { text: 'NOODLE BAR', bg: '#7a1a1a', fg: '#ffd23e' },
  { text: 'HARDWARE STORE', bg: '#4a4a1a', fg: '#ffffff' },
  { text: 'WELDING SHOP', bg: '#3a3a3a', fg: '#ffb27a' },
  { text: 'RICE STALL', bg: '#2a5a1a', fg: '#ffe9a8' },
  { text: 'PHONE SHOP', bg: '#1a1a3a', fg: '#7dd8ff' },
  { text: 'HEALTH PHARMACY', bg: '#1a5a3a', fg: '#ffffff' },
  { text: 'TOP-UP KIOSK', bg: '#5a1a5a', fg: '#ffd23e' },
  { text: 'BEACH CAFE', bg: '#1a4a5a', fg: '#ffe9a8' },
  { text: 'FLOWER SHOP', bg: '#5a2a4a', fg: '#ffb27a' },
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
const FACADE_CACHE = new Map();
// v9 iteration 6 — DESIGNED facades, not random checkerboard. The old
// pattern decided every window independently (hash of colour + cell),
// so a tower read as random on/off noise — and because the texture was
// cached per style|colour, every building of one colour wore the SAME
// noise. A facade now reads as a building: each of the 8 rows is a
// floor with one character — AWAKE (most windows lit), QUIET (a few
// lit) or DARK (almost none) — and one vertical core column (the
// stairwell / lift shaft) stays lit top to bottom, so the tower has
// horizontal bands + one lit spine. The lit/dark decision is per floor
// + core; the per-window hash only picks the exact colour within the
// lit or dark family. `seed` (0-5, one per building, from its position
// hash) varies the pattern between buildings of the same colour, so the
// street stops repeating one texture.
function facadeFloorProb(seed, r) {
  const fh = hash01(seed, r, 7);
  if (fh < 0.4) return 0.78; // awake floor
  if (fh < 0.72) return 0.16; // quiet floor
  return 0.05; // dark floor
}
function facadePair(style, color, seed = 0) {
  const key = `${style}|${color}|${seed}`;
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
  // The lit core column (stairwell / lift shaft): one column per facade,
  // lit top to bottom — the vertical spine against the floor bands.
  const coreCol = Math.floor(hash01(seed, 99, 3) * cols);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const h = hash01(seed, c, r);
      const h2 = hash01(seed, r, c);
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
      // Lit or dark is decided by the FLOOR (awake / quiet / dark) and
      // the core column — never per window. The hash only picks the exact
      // colour inside the lit or dark family, so an awake floor glows as
      // a band and a dark floor stays dark.
      const prob = c === coreCol ? 0.85 : facadeFloorProb(seed, r);
      let wc;
      if (h < prob) {
        if (style === 'glass') wc = h2 < 0.7 ? { map: '#bfe4ff', glow: '#d5ecff' } : { map: '#7fb3d8', glow: '#5a7a96' };
        else if (style === 'brick') wc = { map: '#ffe9a8', glow: '#ffe9a8' };
        else wc = h2 < 0.6 ? { map: '#ffe9a8', glow: '#ffe9a8' } : { map: '#ffb27a', glow: '#ffb27a' };
      } else if (style === 'glass') wc = { map: '#1c2a38', glow: null };
      else if (style === 'brick') wc = { map: '#241a16', glow: null };
      else wc = h2 < 0.12 ? { map: '#8a7a68', glow: '#7a6a4e' } : { map: '#20262f', glow: null };
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
function facadeTexture(style, color, seed = 0) {
  return facadePair(style, color, seed).map;
}
function facadeEmissiveTexture(style, color, seed = 0) {
  return facadePair(style, color, seed).emissive;
}
// One facade variant per building: the seed comes from the building's
// position hash (0-5, six variants per style|colour), so two towers of
// the same colour wear different window patterns.
function facadeSeed(x, z) {
  return Math.floor(hash01(x, z, 91) * 6);
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

// Street name at a position (v9 iteration 5, §3): the nearest road line
// within 10.5 m of it — avenue names on the north-south roads, street
// names on the east-west ones, our own Indonesian names. Returns null
// off-road (on a block, the beach, or the island).
export function streetAt(x, z, cfg) {
  const lines = [];
  const W = cfg.world;
  const pitch = W.blockSize + W.roadWidth;
  const half = (W.blocks * W.blockSize + (W.blocks + 1) * W.roadWidth) / 2;
  for (let i = 0; i <= W.blocks; i += 1) lines.push(-half + W.roadWidth / 2 + i * pitch);
  let best = null;
  let bestD = 10.5;
  for (let i = 0; i < lines.length; i += 1) {
    const dx = Math.abs(x - lines[i]);
    if (dx < bestD) { bestD = dx; best = cfg.streetNames.avenues[lines[i]]; }
    const dz = Math.abs(z - lines[i]);
    if (dz < bestD) { bestD = dz; best = cfg.streetNames.streets[lines[i]]; }
  }
  return best;
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
// Asphalt + paved-slab textures (v9 iteration 5, §0): the road used to
// read as one flat dark slab and the sidewalks as bare brown dirt. The
// asphalt canvas is dark grey with speckle, faint patches and hairline
// cracks; the sidewalk canvas is a grid of paving slabs with a darker
// joint every 64 px and a slight per-slab brightness variation. Both are
// drawn with hash01, not rng — deterministic, no stream cost. The
// asphalt texture is made twice with different repeats (one per road
// direction) so the speckle never stretches: a vertical strip tiles 1
// across and 15 along its 300 m length, a horizontal strip the opposite.
function asphaltTexture(rx, ry) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2b2e35';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i += 1) {
    const x = hash01(i, 11, 12) * 256;
    const y = hash01(i, 13, 14) * 256;
    const r = 0.6 + hash01(i, 15, 16) * 2.2;
    ctx.fillStyle = hash01(i, 17, 18) < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 8; i += 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.ellipse(hash01(i, 21, 22) * 256, hash01(i, 23, 24) * 256, 20 + hash01(i, 25, 26) * 40, 12 + hash01(i, 27, 28) * 20, hash01(i, 29, 30) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i += 1) {
    let x = hash01(i, 31, 32) * 256;
    let y = hash01(i, 33, 34) * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 5; s += 1) {
      x += (hash01(i, 35 + s, 36 + s) - 0.5) * 40;
      y += (hash01(i, 45 + s, 46 + s) - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  return tex;
}
function sidewalkTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8a8578';
  ctx.fillRect(0, 0, 256, 256);
  // 4x4 paving slabs: slight per-slab brightness + a dark joint grid.
  for (let sx = 0; sx < 4; sx += 1) {
    for (let sy = 0; sy < 4; sy += 1) {
      const v = hash01(sx, sy, 61);
      ctx.fillStyle = v < 0.5 ? `rgba(255,255,255,${0.02 + v * 0.05})` : `rgba(0,0,0,${0.02 + (v - 0.5) * 0.08})`;
      ctx.fillRect(sx * 64 + 1, sy * 64 + 1, 62, 62);
    }
  }
  ctx.strokeStyle = 'rgba(30,28,24,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i += 1) {
    ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(256, i * 64); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // 36 m slab, 4 repeats -> 16 slabs of 2.25 m each, a real pavement grid.
  tex.repeat.set(4, 4);
  return tex;
}
const roadMatV = new THREE.MeshStandardMaterial({ map: asphaltTexture(1, 15), roughness: 0.35, metalness: 0.25 });
const roadMatH = new THREE.MeshStandardMaterial({ map: asphaltTexture(15, 1), roughness: 0.35, metalness: 0.25 });
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
  map: sidewalkTexture(),
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
  // v9 iteration 4: the sea is a real shader now — two sine waves in the
  // vertex shader, a shallow-to-deep shore gradient in the fragment
  // shader, and a sun/moon specular glint that follows the day cycle.
  // updateSea() (bottom of buildCity) feeds it the clock-driven sun.
  const seaUniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.5, 0.5, 0.4).normalize() },
    uSunColor: { value: new THREE.Color(0xffb27a) },
  };
  const seaMat = new THREE.ShaderMaterial({
    uniforms: seaUniforms,
    vertexShader: [
      'uniform float uTime;',
      'varying vec3 vWorld;',
      'varying vec3 vNormal;',
      'void main() {',
      '  vec3 p = position;',
      '  float w1 = sin(p.x * 0.08 + uTime * 0.9) * 0.35;',
      '  float w2 = sin(p.y * 0.06 + uTime * 0.6 + 1.7) * 0.25;',
      '  p.z += w1 + w2;',
      '  float dx = 0.08 * 0.35 * cos(p.x * 0.08 + uTime * 0.9);',
      '  float dy = 0.06 * 0.25 * cos(p.y * 0.06 + uTime * 0.6 + 1.7);',
      '  vNormal = normalize(mat3(modelMatrix) * vec3(-dx, -dy, 1.0));',
      '  vec4 wp = modelMatrix * vec4(p, 1.0);',
      '  vWorld = wp.xyz;',
      '  gl_Position = projectionMatrix * viewMatrix * wp;',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uSunDir;',
      'uniform vec3 uSunColor;',
      'varying vec3 vWorld;',
      'varying vec3 vNormal;',
      'void main() {',
      '  float t = clamp((vWorld.x - 173.0) / 120.0, 0.0, 1.0);',
      '  vec3 shallow = vec3(0.16, 0.45, 0.48);',
      '  vec3 deep = vec3(0.04, 0.14, 0.26);',
      '  vec3 col = mix(shallow, deep, smoothstep(0.0, 0.75, t));',
      '  vec3 n = normalize(vNormal);',
      '  vec3 viewDir = normalize(cameraPosition - vWorld);',
      '  vec3 refl = reflect(-normalize(uSunDir), n);',
      '  float spec = pow(max(dot(refl, viewDir), 0.0), 90.0);',
      '  col += uSunColor * spec * 1.4;',
      '  float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);',
      '  col += vec3(0.35, 0.25, 0.35) * fres * 0.35;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}',
    ].join('\n'),
  });
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(120, W.groundSize, 24, 60),
    seaMat,
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(W.seaX + 55, 0.15, 0);
  group.add(sea);

  // Roads: dark wet strips along every grid line, now with a real
  // asphalt texture (v9 iteration 5, §0) instead of one flat colour.
  for (const c of roadLines) {
    group.add(wetFlat(W.roadWidth, half * 2, roadMatV, c, 0, 0.02));
    group.add(wetFlat(half * 2, W.roadWidth, roadMatH, 0, c, 0.02));
  }

  // Road markings (v9 iteration 5, §0 — the 20 m roads): proper
  // big-city paint, two InstancedMeshes instead of hundreds of individual
  // dash meshes — double-yellow centre lines at ±0.6, dashed white lane
  // dividers at ±5, solid white edge lines at ±9.5, crosswalks at ALL 36
  // intersections, and stop lines at the six signalled junctions. The
  // paint breaks at every intersection (the crosswalk zone), exactly
  // like a real street. No rng: pure grid arithmetic.
  {
    const yellow = [];
    const white = [];
    const segs = [];
    for (let i = 0; i < roadLines.length - 1; i += 1) {
      segs.push([roadLines[i] + 12, roadLines[i + 1] - 12]);
    }
    for (const c of roadLines) {
      for (const [a, b] of segs) {
        const len = b - a;
        const mid = (a + b) / 2;
        // Vertical road (runs along z at x = c).
        yellow.push({ x: c - 0.6, z: mid, w: 0.25, l: len });
        yellow.push({ x: c + 0.6, z: mid, w: 0.25, l: len });
        white.push({ x: c - 9.5, z: mid, w: 0.25, l: len });
        white.push({ x: c + 9.5, z: mid, w: 0.25, l: len });
        // Horizontal road (runs along x at z = c).
        yellow.push({ x: mid, z: c - 0.6, w: len, l: 0.25 });
        yellow.push({ x: mid, z: c + 0.6, w: len, l: 0.25 });
        white.push({ x: mid, z: c - 9.5, w: len, l: 0.25 });
        white.push({ x: mid, z: c + 9.5, w: len, l: 0.25 });
      }
      // Dashed lane dividers, kept clear of the crosswalk zone (±14).
      for (let t = -half + 14; t < half - 8; t += 10) {
        let near = false;
        for (const l of roadLines) if (Math.abs(t - l) < 14) { near = true; break; }
        if (near) continue;
        white.push({ x: c - 5, z: t, w: 0.3, l: 3 });
        white.push({ x: c + 5, z: t, w: 0.3, l: 3 });
        white.push({ x: t, z: c - 5, w: 3, l: 0.3 });
        white.push({ x: t, z: c + 5, w: 3, l: 0.3 });
      }
    }
    // Crosswalks at every intersection (the old per-junction boxes are gone).
    for (const rx of roadLines) {
      for (const rz of roadLines) {
        for (let s = -2; s <= 2; s += 1) {
          white.push({ x: rx + s * 4.4, z: rz - 12.5, w: 0.9, l: 3.2 });
          white.push({ x: rx + s * 4.4, z: rz + 12.5, w: 0.9, l: 3.2 });
          white.push({ x: rx - 12.5, z: rz + s * 4.4, w: 3.2, l: 0.9 });
          white.push({ x: rx + 12.5, z: rz + s * 4.4, w: 3.2, l: 0.9 });
        }
      }
    }
    // Stop lines at the six signalled junctions: one solid bar across
    // each approach, 2 m before the crosswalk.
    for (const j of cfg.lights.junctions) {
      white.push({ x: j.x, z: j.z - 14.5, w: 19, l: 0.6 });
      white.push({ x: j.x, z: j.z + 14.5, w: 19, l: 0.6 });
      white.push({ x: j.x - 14.5, z: j.z, w: 0.6, l: 19 });
      white.push({ x: j.x + 14.5, z: j.z, w: 0.6, l: 19 });
    }
    group.add(instancedBoxes(yellow, 0xe8c832, 0.05, 0.05));
    group.add(instancedBoxes(white, 0xf2f2f2, 0.05, 0.05));
  }

  // Sidewalk slabs around each block (v9 iteration 5, §0): the slab is
  // exactly the block (36 m), so its edge meets the road at ±18 and the
  // frontage of every building sits flush on it — no bare dirt gap
  // between the road and the buildings. The slab texture is a real
  // paving grid, and the curb below is a raised concrete edge.
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      group.add(wetFlat(W.blockSize, W.blockSize, wetWalkMat, bx, bz, 0.03));
    }
  }

  // Real curbs (v9 iteration 5, §0): thin raised concrete edges along
  // each block's sidewalk, at the road's edge (18 from the block
  // centre), one InstancedMesh. No collision — the player steps over
  // them, as in v8.
  {
    const curbs = [];
    for (const bx of blockCenters) {
      for (const bz of blockCenters) {
        curbs.push({ x: bx - 18, z: bz, w: 0.3, l: 36 });
        curbs.push({ x: bx + 18, z: bz, w: 0.3, l: 36 });
        curbs.push({ x: bx, z: bz - 18, w: 36, l: 0.3 });
        curbs.push({ x: bx, z: bz + 18, w: 36, l: 0.3 });
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
    // v9 iteration 5 (§3): the outfit shop and the island district, both
    // real places the player can walk to — the map markers point here.
    outfit: { x: 160, z: -28, name: 'Butik Neon' },
    island: { x: 247, z: 100, name: 'Fuego Island' },
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
  // v9 iteration 4: the lit lamp is HDR (> 1) so it blooms — the bloom
  // threshold is 0.9 and a plain 0xff2222 / 0x11aa33 would not clear it.
  // The dim lamp of each pair stays dim (it is the "off" lamp).
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.6, 0.9) });

  // Every raised building is recorded for the v9 rooftop-clutter pass
  // (below the building loop): the pass reads these records, it never
  // re-rolls the rng, so the city layout stays byte-identical to v8.
  const buildingRecords = [];
  // v9 iteration 6: every free-standing tree is recorded too (avenue +
  // park), so the placement audit can prove no trunk stands on a road.
  const treeSpots = [];

  function raiseBuilding(ox, oz, w, d, h, style, colorIdx) {
    const styleDef = DISTRICT_STYLES[style];
    const color = styleDef.palette[colorIdx % styleDef.palette.length];
    const seed = facadeSeed(ox, oz);
    const ftex = facadeTexture(style, color, seed).clone();
    ftex.needsUpdate = true;
    ftex.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 9)));
    // v9: the same repeat on the emissive map, so lit windows glow.
    const etex = facadeEmissiveTexture(style, color, seed).clone();
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
        new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.7, 0.4) }),
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
        new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 0.3, 0.3) }),
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
      // v9 iteration 5 (§0): denser — the city was still reading empty
      // between the towers. Glass/commercial blocks now get 2-3 buildings
      // and the rest 3-5, footprints capped at 16 m (the sidewalk edge is
      // 18 from the block centre, so nothing overhangs the pavement) and
      // offsets pulled in to ±8 so buildings sit in a tight organic
      // cluster instead of a sparse ring.
      const count = style === 'glass' || style === 'commercial' ? rng.int(2, 3) : rng.int(3, 5);
      for (let i = 0; i < count; i += 1) {
        const w = rng.range(10, 16);
        const d = rng.range(10, 16);
        const h = rng.range(styleDef.heights[0], styleDef.heights[1]);
        const ox = bx + rng.range(-8, 8);
        const oz = bz + rng.range(-8, 8);
        raiseBuilding(ox, oz, w, d, h, style, Math.floor(rng.next() * styleDef.palette.length));
      }
    }
  }

  // Name board for a landmark: a lit text plane on its street-facing side,
  // so every named building reads its name in 3D — the same name the
  // missions and messages use (MARLA'S GARAGE = Marla's Garage, FUEGO BANK =
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
  // v9 iteration 6: the tower gets its own facade seed (its position),
  // so its window bands differ from the other glass towers.
  const towerTex = facadeTexture('glass', 0x5a8ab0, facadeSeed(0, -28)).clone();
  towerTex.needsUpdate = true;
  towerTex.repeat.set(4, 10);
  const towerEmissive = facadeEmissiveTexture('glass', 0x5a8ab0, facadeSeed(0, -28)).clone();
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
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 0.3, 0.3) }),
  );
  beacon.position.set(0, W.towerH + 4, 0);
  group.add(beacon);

  // Marla's garage: low brick building with a big sign slab.
  const garage = box(24, 7, 14, 0xb05a3a, landmarks.garage.x, 3.5, landmarks.garage.z);
  group.add(garage);
  const sign = box(20, 2.4, 0.6, 0xffe9a8, landmarks.garage.x, 8, landmarks.garage.z + 7.2);
  sign.castShadow = false;
  group.add(sign);
  nameBoard("MARLA'S GARAGE", '#4a2a12', '#ffd23e', 18, 2.2, landmarks.garage.x, 8, landmarks.garage.z + 7.55);
  // The approach face (the side the player walks in from, -z): the old
  // garage showed a blank brick wall to everyone arriving for mission 1.
  // It gets a shopfront — dark glass, lit display windows, a striped
  // awning — and its own MARLA'S GARAGE board facing the street, so the
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
  const gSign = nameBoard("MARLA'S GARAGE", '#4a2a12', '#ffd23e', 18, 2.2, landmarks.garage.x, 8, landmarks.garage.z - 7.55);
  gSign.rotation.y = Math.PI;

  // v9 iteration 6 — the EAST face (x = -100) faced the x=-84 avenue
  // as a blank brick wall: the first thing a driver on the avenue saw
  // of the garage was nothing. It now has its own face: a glass band
  // with two lit display windows, a side door at the north end, and a
  // small SERVICE ENTRANCE board above the door, all facing +x toward
  // the avenue. The east face is 14 m (z 77..91): door z 78.4..80.6,
  // windows z 82.8..85.2 and 86.8..89.2, nothing past the south face.
  const eGlass = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 2.2, 6.4),
    cityMat(0x1a2a33, 0.15, 0.6),
  );
  eGlass.position.set(landmarks.garage.x + 12.25, 1.4, landmarks.garage.z + 2);
  group.add(eGlass);
  for (const dz of [-0.4, 3.6]) {
    const eDisplay = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.4),
      new THREE.MeshBasicMaterial({ color: 0xffca7a }),
    );
    eDisplay.position.set(landmarks.garage.x + 12.55, 1.4, landmarks.garage.z + dz);
    eDisplay.rotation.y = Math.PI / 2;
    group.add(eDisplay);
    group.add(box(0.1, 0.14, 2.4, 0x2a2018, landmarks.garage.x + 12.55, 1.4, landmarks.garage.z + dz));
  }
  group.add(box(0.3, 3, 2.2, 0x2a2018, landmarks.garage.x + 12.15, 1.5, landmarks.garage.z - 4.5));
  group.add(box(0.34, 2.6, 1.7, 0x3a3f46, landmarks.garage.x + 12.17, 1.3, landmarks.garage.z - 4.5));
  group.add(box(0.1, 0.5, 0.18, 0xffd23e, landmarks.garage.x + 12.38, 1.3, landmarks.garage.z - 3.85));
  const eSign = nameBoard('SERVICE ENTRANCE', '#4a2a12', '#ffd23e', 4.5, 0.9, landmarks.garage.x + 12.6, 4, landmarks.garage.z - 4.5);
  eSign.rotation.y = Math.PI / 2;

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
  // v9 iteration 6: the barrels stood at x -99.5 — east of the apron,
  // on the dirt past the garage's corner. They now sit ON the apron,
  // against the shopfront's east end, next to the east door.
  for (const [bx2, bz2] of [[-103, 71], [-103, 73.5]]) {
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
  // v9 iteration 6 — forecourt clutter: the apron's middle was bare
  // paving. A workbench against the shopfront's west end, a red tool
  // cart by the east door, a second crate stack at the west edge, and
  // two cones marking the apron's corners. Everything stays clear of
  // the mission-1 walk line (x -104..-112) and of the parking bays.
  group.add(box(2.4, 0.12, 0.8, 0x6a4a2a, -118.5, 0.95, 76.3));
  group.add(box(0.12, 0.95, 0.8, 0x4a3a28, -119.6, 0.48, 76.3));
  group.add(box(0.12, 0.95, 0.8, 0x4a3a28, -117.4, 0.48, 76.3));
  group.add(box(0.5, 0.25, 0.3, 0x3a3f46, -119, 1.15, 76.3));
  group.add(box(0.3, 0.2, 0.2, 0xc22a22, -118, 1.12, 76.2));
  const cartMat = cityMat(0xc22a22, 0.6, 0.3);
  const cart = new THREE.Group();
  const cartBody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.6), cartMat);
  cartBody.position.y = 0.55;
  cartBody.castShadow = true;
  cart.add(cartBody);
  const cartTop = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 0.65), cityMat(0x2a2a2a, 0.7));
  cartTop.position.y = 0.95;
  cart.add(cartTop);
  const cartHandle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), cityMat(0x3a3f46, 0.6, 0.5));
  cartHandle.position.set(0.48, 0.85, 0);
  cart.add(cartHandle);
  cart.position.set(-103.5, 0, 68.5);
  cart.rotation.y = 0.3;
  group.add(cart);
  const crateStack2 = new THREE.Group();
  const cc3 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), crateMat2);
  cc3.position.y = 0.7;
  cc3.castShadow = true;
  crateStack2.add(cc3);
  const cc4 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), crateMat2);
  cc4.position.set(-0.2, 1.9, 0.1);
  cc4.rotation.y = 0.7;
  cc4.castShadow = true;
  crateStack2.add(cc4);
  crateStack2.position.set(-121, 0, 67);
  group.add(crateStack2);
  const coneMat = cityMat(0xe8641e, 0.7);
  for (const [cx, cz] of [[-121, 64.5], [-103, 64.5]]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 10), coneMat);
    cone.position.set(cx, 0.4, cz);
    cone.castShadow = true;
    group.add(cone);
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
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 0.3, 0.3) }),
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
    const seed = facadeSeed(ox, oz);
    const ftex = facadeTexture(style, color, seed).clone();
    ftex.needsUpdate = true;
    ftex.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 9)));
    const etex = facadeEmissiveTexture(style, color, seed).clone();
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
        new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.7, 0.4) }),
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
        new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 0.3, 0.3) }),
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
          new THREE.MeshBasicMaterial({ color: hash01(ox, oz, 51) < 0.5 ? new THREE.Color(1.6, 1.0, 0.45) : new THREE.Color(1.8, 1.5, 0.85) }),
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
  // v9 iteration 6: was (20,17) — astride the x=28 avenue AND the z=28
  // street, 8 m into the road. Now the north-ring skyline anchor.
  raiseFixedBuilding(-112, -168, 12, 12, 34, 'glass', 0);
  raiseFixedBuilding(0, 172, 16, 14, 28, 'glass', 1);
  // Tier 3 — high (20-22 m), stepping down from the landmarks at
  // irregular depths so the skyline reads organic, not a wall.
  raiseFixedBuilding(-48, 160, 14, 12, 20, 'commercial', 2);
  raiseFixedBuilding(52, 178, 14, 12, 22, 'commercial', 0);
  // Tier 2 — medium (12-13 m): dialogue west flank and the hospital
  // block corner, filling the mid-ring around the core.
  // v9 iteration 6: was (-128,62) — 4 m into the x=-140 avenue.
  // Moved to (-124,62), then to (-124,118): the (-124,62) spot put the
  // building's CENTRE 12 m from the spawn (-112,60), inside the
  // play-test's 14-unit spawn-clearance box. (-124,118) is clear of
  // every building, road and protected rect (verified against all 97
  // records), its west face flush with the x=-140 avenue.
  raiseFixedBuilding(-124, 118, 12, 12, 12, 'residential', 0);
  // v9 iteration 6: was (-19,128) — 7 m into the x=-28 avenue.
  // Now in the hospital block, flush with the z=84 road edge.
  raiseFixedBuilding(-11, 99, 12, 10, 13, 'residential', 2);
  // Tier 1 — low (8-10 m): docks warehouses (the duel still owns the
  // combat frame), the dialogue east shop, and a far south low-rise that
  // steps the skyline down to the edge.
  raiseFixedBuilding(160, 135, 14, 10, 10, 'brick', 1);
  // v9 iteration 6: was (134,98) — 11 m into the x=140 avenue.
  // Now on the south ring, 2 m clear of the (52,178) tower.
  raiseFixedBuilding(56, 164, 14, 12, 8, 'brick', 0);
  // v9 iteration 6: was (-73,70) — 3 m into the x=-84 avenue.
  // Now inside the block, clear of the random glass tower.
  raiseFixedBuilding(-69, 48, 8, 10, 9, 'stucco', 1);
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

  // v9 iteration 5 (§0): DENSE CITY FILL — ground-floor commercial in
  // the gaps the random buildings left. Small shops (8x8, 6-12 m) at the
  // corners and edge-midpoints of every non-skip block, each facing the
  // nearest road (the shopfront — glass, lit displays, awning, lit sign
  // — is on the +z face of its local group, rotated to face the road).
  // Zero rng: every decision is a hash of the shop's own coordinates, so
  // the rng stream — and every layout that depends on it — is untouched.
  // A shop is placed only if it clears every other building (1 m
  // margin), the protected gameplay rects, and the package spots.
  const SHOP_NAMES = [
    'JAYA AUTO REPAIR', 'MINIMART 24', 'COFFEE STALL', 'CORNER STORE',
    'DUSK CAFE', 'QUICK LAUNDRY', 'BARBERSHOP', 'TOASTED BREAD',
    'BIKE WASH', 'NOODLE BAR', 'HARDWARE STORE', 'WELDING SHOP',
    'RICE STALL', 'PHONE SHOP', 'HEALTH PHARMACY', 'TOP-UP KIOSK',
    'BEACH CAFE', 'FLOWER SHOP',
  ];
  const SHOP_BG = ['#2a2a2a', '#1a5a2a', '#5a3a1a', '#3a2a5a', '#5a2a3a', '#1a3a5a'];
  const SHOP_FG = ['#ffd23e', '#ffffff', '#ffe9a8', '#7dffd8', '#ffb27a', '#7dd8ff'];
  const PROTECTED_RECTS = [
    { x0: -118, x1: -106, z0: 55, z1: 90 },   // mission-1 walk corridor
    { x0: 118, x1: 152, z0: 120, z1: 145 },  // docks duel rect
    { x0: -118, x1: -84, z0: 48, z1: 70 },   // dialogue foreground
    { x0: -140, x1: -116, z0: 28, z1: 52 },  // gun shop (12 m clear)
    { x0: 84, x1: 108, z0: 100, z1: 124 },   // Pay 'n' Spray (12 m clear)
  ];
  const PACKAGE_SPOTS = [
    [-98, 96], [-98, -92], [160, 40], [128, 118], [146, -20],
    [20, 20], [62, -68], [-14, 118], [-40, -108], [70, 70],
  ];
  function rectClear(x, z, w, d, margin) {
    for (const b of buildingRecords) {
      if (Math.abs(x - b.x) * 2 < w + b.w + margin * 2 && Math.abs(z - b.z) * 2 < d + b.d + margin * 2) return false;
    }
    for (const r of PROTECTED_RECTS) {
      if (x + w / 2 + margin > r.x0 && x - w / 2 - margin < r.x1 && z + d / 2 + margin > r.z0 && z - d / 2 - margin < r.z1) return false;
    }
    for (const [px, pz] of PACKAGE_SPOTS) {
      if (Math.hypot(x - px, z - pz) < 10) return false;
    }
    return true;
  }
  function raiseShop(ox, oz, w, d, h, style, colorIdx, facing, signText) {
    const styleDef = DISTRICT_STYLES[style];
    const color = styleDef.palette[colorIdx % styleDef.palette.length];
    const g = new THREE.Group();
    g.position.set(ox, 0, oz);
    g.rotation.y = facing;
    const seed = facadeSeed(ox, oz);
    const ftex = facadeTexture(style, color, seed).clone();
    ftex.needsUpdate = true;
    ftex.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 9)));
    const etex = facadeEmissiveTexture(style, color, seed).clone();
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
    b.position.set(0, h / 2, 0);
    b.castShadow = true;
    b.receiveShadow = true;
    g.add(b);
    const rim = box(w + 0.6, 0.5, d + 0.6, styleDef.trim, 0, h + 0.25, 0);
    rim.castShadow = false;
    g.add(rim);
    // Shopfront on the +z face: dark glass, two lit display windows, a
    // striped awning, and the lit shop sign above the door.
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.72, 2.6, 0.5),
      cityMat(0x1a2a33, 0.15, 0.6),
    );
    glass.position.set(0, 1.3, d / 2 + 0.25);
    g.add(glass);
    for (const dx of [-w * 0.17, w * 0.17]) {
      const display = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.26, 1.6),
        new THREE.MeshBasicMaterial({ color: hash01(ox, oz, 81) < 0.5 ? new THREE.Color(1.6, 1.0, 0.45) : new THREE.Color(1.8, 1.5, 0.85) }),
      );
      display.position.set(dx, 1.4, d / 2 + 0.52);
      g.add(display);
    }
    const awnTex = AWNING_TEXTURES[Math.floor(hash01(ox, oz, 82) * AWNING_TEXTURES.length)].clone();
    awnTex.needsUpdate = true;
    awnTex.repeat.set(3, 1);
    const awning = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.78, 1.5),
      new THREE.MeshStandardMaterial({ map: awnTex, side: THREE.DoubleSide, roughness: 0.9 }),
    );
    awning.rotation.x = -0.55;
    awning.position.set(0, 3.15, d / 2 + 0.85);
    awning.castShadow = true;
    g.add(awning);
    const ci = Math.floor(hash01(ox, oz, 83) * SHOP_BG.length);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.85, 1.7),
      new THREE.MeshBasicMaterial({ map: signTexture(signText, SHOP_BG[ci], SHOP_FG[ci]) }),
    );
    sign.position.set(0, Math.min(h * 0.55, 9), d / 2 + 0.2);
    g.add(sign);
    group.add(g);
    buildingRecords.push({ x: ox, z: oz, w, d, h, style });
    return g;
  }
  let shopCount = 0;
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      if (skipBlocks.has(`${bx},${bz}`)) continue;
      const style = districtAt(bx, bz).style;
      // 4 corners (facing one of their two adjacent roads) + 4 edge
      // midpoints (facing the road straight ahead).
      const spots = [
        { dx: -12, dz: -12, face: Math.PI }, { dx: -12, dz: 12, face: -Math.PI / 2 },
        { dx: 12, dz: -12, face: Math.PI / 2 }, { dx: 12, dz: 12, face: 0 },
        { dx: -12, dz: 0, face: -Math.PI / 2 }, { dx: 12, dz: 0, face: Math.PI / 2 },
        { dx: 0, dz: -12, face: Math.PI }, { dx: 0, dz: 12, face: 0 },
      ];
      for (let s = 0; s < spots.length; s += 1) {
        const sp = spots[s];
        const ox = bx + sp.dx;
        const oz = bz + sp.dz;
        if (hash01(bx, bz, 90 + s) >= 0.6) continue;
        if (!rectClear(ox, oz, 8, 8, 1)) continue;
        const h = 6 + Math.floor(hash01(bx, bz, 100 + s) * 7);
        const name = SHOP_NAMES[Math.floor(hash01(bx, bz, 110 + s) * SHOP_NAMES.length)];
        raiseShop(ox, oz, 8, 8, h, style, Math.floor(hash01(bx, bz, 120 + s) * 3), sp.face, name);
        shopCount += 1;
      }
    }
  }

  // v9 iteration 5 (§3): Fuego Island — a small island district across a
  // causeway from Fuego Pier. The island is a raised sand platform (top
  // 1.15, the same height as the pier deck, above the sea's wave crests)
  // with a grass top and three villas; the causeway deck continues the
  // pier at the same height to the island. A gate at the causeway's land
  // end (x 209) has a red-and-white barrier beam that slides up when the
  // player approaches — the game animates islandGate.beam. The player
  // walks/drives the pier deck (z 98-102), the causeway and the island;
  // the game clamps them to that corridor (see game.js groundYAt).
  let islandGate = null;
  {
    const isl = cfg.island;
    // Sand platform: a box, not a plane, so the 1.15 m bluff reads from
    // the beach and the waves wash against its sides.
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(isl.x1 - isl.x0, 1.15, isl.z1 - isl.z0),
      cityMat(cfg.palette.sand, 0.95),
    );
    platform.position.set((isl.x0 + isl.x1) / 2, 0.575, (isl.z0 + isl.z1) / 2);
    platform.receiveShadow = true;
    group.add(platform);
    // Grass top, inset 2 m from the bluff edge.
    group.add(flat(isl.x1 - isl.x0 - 4, isl.z1 - isl.z0 - 4, cfg.palette.grass, (isl.x0 + isl.x1) / 2, (isl.z0 + isl.z1) / 2, 1.16));
    // Three villas on the island. Their bases sit 1.15 into the
    // platform, so they read 1.15 shorter — the ground floor is the bluff.
    raiseFixedBuilding(232, 84, 12, 10, 9, 'residential', 0);
    raiseFixedBuilding(258, 84, 12, 10, 11, 'brick', 1);
    raiseFixedBuilding(245, 116, 14, 10, 8, 'stucco', 2);
    // Causeway deck from the pier's end platform (x 209) to the island
    // (x 222), 4 m wide like the pier deck, top at 1.15.
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(13, 1.15, 4),
      cityMat(0x7a5c38, 0.9),
    );
    deck.position.set(215.5, 0.575, 100);
    deck.castShadow = true;
    deck.receiveShadow = true;
    group.add(deck);
    // Rails along both sides of the causeway, at the pier rail height.
    for (const rz of [98.2, 101.8]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(13, 0.12, 0.12), cityMat(0x5a4630, 0.9));
      rail.position.set(215.5, 1.9, rz);
      group.add(rail);
      for (let px = 210; px <= 221; px += 2.75) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.75, 6), cityMat(0x5a4630, 0.9));
        post.position.set(px, 1.52, rz);
        group.add(post);
      }
    }
    // Two lamps on the causeway.
    for (const lx of [211, 220]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 3, 6), cityMat(0x2a2f38, 0.6, 0.5));
      pole.position.set(lx, 2.65, 98.4);
      group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.35, 0.75) }));
      bulb.position.set(lx, 4.25, 98.4);
      group.add(bulb);
    }
    // The gate at the causeway's land end (x 209): two posts at the deck
    // edges + a red-and-white barrier beam that slides up on approach.
    const gate = new THREE.Group();
    gate.position.set(isl.gate.x, 1.15, isl.gate.z);
    for (const pz of [-1.7, 1.7]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, 0.4), cityMat(0xd8d8d8, 0.7));
      post.position.set(0, 1.3, pz);
      post.castShadow = true;
      gate.add(post);
    }
    const beam = new THREE.Group();
    beam.position.y = 1.0;
    const beamRed = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 3.4), new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.6 }));
    beam.add(beamRed);
    for (let s = -1.5; s <= 1.5; s += 1) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.32, 0.7), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }));
      stripe.position.z = s;
      beam.add(stripe);
    }
    gate.add(beam);
    group.add(gate);
    islandGate = { group: gate, beam, open: 0 };
  }

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
    // v9 iteration 5 (§0): the park grass is exactly the block (36 m),
    // so it no longer spills over the road edges.
    group.add(flat(W.blockSize, W.blockSize, cfg.palette.grass, cx, cz, 0.04));
    // Crossing paths, pale gravel.
    group.add(flat(4, W.blockSize, 0xd8d3a8, cx, cz, 0.06));
    group.add(flat(W.blockSize, 4, 0xd8d3a8, cx, cz, 0.06));
    const treeTrunk = cityMat(0x5a4630, 1);
    const treeLeaf = cityMat(0x4a7a3a, 1);
    for (let i = 0; i < 7; i += 1) {
      // v9 iteration 6: ±18 put trunks on the block edge, crowns
      // overhanging the road. ±15 keeps trunk and crown inside the park.
      const tx = cx + rng.range(-15, 15);
      const tz = cz + rng.range(-15, 15);
      if (Math.abs(tx - cx) < 3 && Math.abs(tz - cz) < 3) continue;
      treeSpots.push({ x: tx, z: tz });
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
  // v9 iteration 6: the old spots stood ON the roads (z=-88 is the
  // z=-84 street, x=80 is the x=84 avenue) — the user photographed them
  // in the middle of the road twice. Every stall now sits just inside
  // the block edge, on the sidewalk: the north row at z=-96 (2 m inside
  // the block's north edge), the east row at x=72.5 (1.5 m inside the
  // east edge); the middle east stall is at z=-106 so it clears the
  // infill shop at (68,-112). The vendor spots move with them (the
  // vendor stands 1.4 m block-side of the stall, see stallSpots below).
  const stallSpots = [];
  const stallDefs = [
    { x: 42, z: -96, awn: 0, side: 'N' }, { x: 56, z: -96, awn: 1, side: 'N' }, { x: 70, z: -96, awn: 2, side: 'N' },
    { x: 72.5, z: -98, awn: 1, side: 'E' }, { x: 72.5, z: -106, awn: 0, side: 'E' }, { x: 72.5, z: -126, awn: 2, side: 'E' },
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
    // The awning front faces the street: north-row stalls face north
    // (rotation 0), east-row stalls face east (rotation PI/2). The side
    // is explicit in the def — the old x > 76 test broke when the east
    // row moved inside the block edge (x 72.5).
    stall.rotation.y = def.side === 'E' ? Math.PI / 2 : 0;
    group.add(stall);
    // The vendor stands behind the stall (block side) and faces the street.
    stallSpots.push(def.side === 'E'
      ? { x: def.x, z: def.z, facing: Math.PI / 2, vx: def.x - 1.4, vz: def.z, vFacing: Math.PI / 2 }
      : { x: def.x, z: def.z, facing: 0, vx: def.x, vz: def.z - 1.4, vFacing: 0 });
  }

  // Palms along the beach and a few on the avenues, denser than before —
  // the coast is palm-lined now, and the avenues get trees too.
  // v9 iteration 4: palms are RECORDED here and instanced below
  // (InstancedMesh: one draw call for all trunks, one for all leaves),
  // so the beach keeps its trees without paying a draw call per palm.
  // The leaf material sways in the wind (onBeforeCompile, updateWind).
  // Call sites keep their exact rng draws — only the add() wrapper
  // changes, so the city layout stays byte-identical.
  const palmSpots = [];
  function palm(x, z) {
    palmSpots.push({ x, z });
  }
  const palmTrunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 7, 6);
  const palmTrunkMat = new THREE.MeshStandardMaterial({ color: PALM_TRUNK, roughness: 1 });
  const palmLeafGeo = new THREE.ConeGeometry(0.9, 4.5, 4);
  const palmLeafMat = new THREE.MeshStandardMaterial({ color: PALM_LEAF, roughness: 1 });
  // Wind sway for the leaves: a vertex-shader bend that scales with the
  // instance's world position, so neighbouring palms sway out of phase.
  // The cache key keeps this compiled program separate from the plain
  // leaf material used anywhere else.
  const windUniform = { value: 0 };
  palmLeafMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniform;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      [
        '#include <begin_vertex>',
        '#ifdef USE_INSTANCING',
        '  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);',
        '  float swayPhase = ip.x * 0.13 + ip.z * 0.11;',
        '  float swayAmt = sin(uTime * 1.4 + swayPhase) * 0.09 * transformed.y;',
        '  transformed.x += swayAmt;',
        '  transformed.z += cos(uTime * 1.1 + swayPhase) * 0.06 * transformed.y;',
        '#endif',
      ].join('\n'),
    );
  };
  palmLeafMat.customProgramCacheKey = () => 'palm-leaf-sway';
  function buildPalmInstances() {
    const n = palmSpots.length;
    const dummy = new THREE.Object3D();
    const trunks = new THREE.InstancedMesh(palmTrunkGeo, palmTrunkMat, n);
    const leaves = new THREE.InstancedMesh(palmLeafGeo, palmLeafMat, n * 5);
    trunks.castShadow = true;
    trunks.receiveShadow = true;
    let li = 0;
    palmSpots.forEach((spot, i) => {
      dummy.position.set(spot.x, 3.5, spot.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      for (let k = 0; k < 5; k += 1) {
        const a = (k / 5) * Math.PI * 2;
        dummy.position.set(
          spot.x + Math.cos(a) * 1.6,
          7.2,
          spot.z + Math.sin(a) * 1.6,
        );
        dummy.rotation.set(-Math.sin(a) * 1.1, 0, Math.cos(a) * 1.1);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        leaves.setMatrixAt(li, dummy.matrix);
        li += 1;
      }
    });
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    group.add(trunks);
    group.add(leaves);
  }
  for (let z = -140; z <= 140; z += 28) {
    palm(W.beachX + 4 + rng.range(-2, 2), z + rng.range(-4, 4));
    // v9 iteration 6: the second beach row stood at beachX - 6 (x 142-146)
    // — on the x=140 avenue, not on the sand. It now lines the sand at
    // beachX + 10 (x 158-162), clear of the road.
    palm(W.beachX + 10 + rng.range(-2, 2), z + 14 + rng.range(-4, 4));
    // v9 iteration 6: the west avenue palms stood ON the x=-140 avenue
    // centreline. They now line the sidewalk of the west blocks (x -128)
    // — and midway BETWEEN the streets (z + 14), because the loop's z
    // values land on the street lines (-140, -84, -28, 28, 84, 140) and
    // a palm at x -128, z -28 stands ON the z=-28 street. The last row
    // wraps back (z - 14) so no palm leaves the map's north edge.
    if (rng.chance(0.5)) palm(-128 + rng.range(-2, 2), (z >= 140 ? z - 14 : z + 14) + rng.range(-3, 3));
  }
  // Leafy avenue trees, one or two per block edge, seeded.
  // v9 iteration 6: the ±20 m jitter put trunks up to 2 m into the
  // roads. ±16 keeps every trunk inside its block (the block edge is
  // 18 m from the centre, the road starts there).
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      if (skipBlocks.has(`${bx},${bz}`)) continue;
      if (!rng.chance(0.45)) continue;
      const tx = bx + rng.range(-16, 16);
      const tz = bz + rng.range(-16, 16);
      treeSpots.push({ x: tx, z: tz });
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
  // v9 iteration 4: hydrants are RECORDED and instanced below (body +
  // cap, two draw calls for all 19). Same rng-neutral rule as the palms.
  const hydrantSpots = [];
  function hydrant(x, z) {
    hydrantSpots.push({ x, z });
  }
  function buildHydrantInstances() {
    const n = hydrantSpots.length;
    const dummy = new THREE.Object3D();
    const bodies = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.22, 0.26, 0.7, 8), hydrantMat, n,
    );
    const caps = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.2, 8, 6), hydrantMat, n,
    );
    bodies.castShadow = true;
    hydrantSpots.forEach((spot, i) => {
      dummy.position.set(spot.x, 0.35, spot.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix);
      dummy.position.set(spot.x, 0.75, spot.z);
      dummy.updateMatrix();
      caps.setMatrixAt(i, dummy.matrix);
    });
    bodies.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    group.add(bodies);
    group.add(caps);
  }
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 });
  // v9 iteration 4: benches are RECORDED and instanced below (seat +
  // back + legs, three draw calls for all 18). Rotation is part of the
  // recorded spot, so the tidy aligned benches stay tidy.
  const benchSpots = [];
  function bench(x, z, rot) {
    benchSpots.push({ x, z, rot });
  }
  function buildBenchInstances() {
    const n = benchSpots.length;
    const dummy = new THREE.Object3D();
    const seats = new THREE.InstancedMesh(
      new THREE.BoxGeometry(2.4, 0.12, 0.6), benchMat, n,
    );
    const backs = new THREE.InstancedMesh(
      new THREE.BoxGeometry(2.4, 0.6, 0.1), benchMat, n,
    );
    const legs = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.1, 0.5, 0.5), benchMat, n * 2,
    );
    seats.castShadow = true;
    benchSpots.forEach((spot, i) => {
      dummy.rotation.set(0, spot.rot, 0);
      dummy.scale.setScalar(1);
      dummy.position.set(spot.x, 0.5, spot.z);
      dummy.updateMatrix();
      seats.setMatrixAt(i, dummy.matrix);
      dummy.position.set(spot.x, 0.85, spot.z - 0.28 * Math.cos(spot.rot));
      dummy.position.x = spot.x - 0.28 * Math.sin(spot.rot);
      dummy.updateMatrix();
      backs.setMatrixAt(i, dummy.matrix);
      for (const [k, lx] of [-1, 1].entries()) {
        dummy.position.set(
          spot.x + lx * Math.cos(spot.rot),
          0.25,
          spot.z - lx * Math.sin(spot.rot),
        );
        dummy.updateMatrix();
        legs.setMatrixAt(i * 2 + k, dummy.matrix);
      }
    });
    seats.instanceMatrix.needsUpdate = true;
    backs.instanceMatrix.needsUpdate = true;
    legs.instanceMatrix.needsUpdate = true;
    group.add(seats);
    group.add(backs);
    group.add(legs);
  }
  // v9 iteration 4: bins are RECORDED and instanced below (one draw call
  // for all 11).
  const binSpots = [];
  function bin(x, z) {
    binSpots.push({ x, z });
  }
  function buildBinInstances() {
    const n = binSpots.length;
    const dummy = new THREE.Object3D();
    const bins = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.45, 0.4, 1.1, 10),
      cityMat(0x2a4a3a, 0.8, 0.3),
      n,
    );
    bins.castShadow = true;
    binSpots.forEach((spot, i) => {
      dummy.position.set(spot.x, 0.55, spot.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      bins.setMatrixAt(i, dummy.matrix);
    });
    bins.instanceMatrix.needsUpdate = true;
    group.add(bins);
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
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.5, 1.5) }),
  );
  plazaWater.rotation.x = -Math.PI / 2;
  plazaWater.position.set(56, 0.92, 0);
  group.add(plazaWater);
  plazaCyl(0.8, 0.8, 4, 0x2a2f38, 56, 2.9, 0);
  for (const [ry, color] of [[2.6, new THREE.Color(2.0, 0.4, 1.4)], [3.6, new THREE.Color(0.4, 2.0, 2.0)]]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.3, 0.12, 8, 24),
      new THREE.MeshBasicMaterial({ color }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(56, ry, 0);
    group.add(ring);
  }
  bench(56, -14, 0);
  bench(56, 14, Math.PI);
  bench(42, 0, Math.PI / 2);
  bench(70, 0, -Math.PI / 2);
  palm(40, -16);
  palm(72, -16);
  palm(40, 16);
  palm(72, 16);

  hydrant(-104, 52);
  // Spawn benches (v9 iteration 3): aligned to the nearest road instead
  // of tilted at 0.6 / -0.4 rad — the east one faces the Coral Row road,
  // the north one faces the road by the garage.
  bench(-100, 50, Math.PI / 2);
  bin(-106, 68);
  bench(-118, 72, 0);
  for (let i = 0; i < 18; i += 1) {
    // v9 iteration 6: ±24 put hydrants up to 6 m into the roads.
    // ±16 keeps them inside their block (block edge 18 m).
    const hx = blockCenters[Math.floor(rng.next() * blockCenters.length)] + rng.range(-16, 16);
    const hz = blockCenters[Math.floor(rng.next() * blockCenters.length)] + rng.range(-16, 16);
    hydrant(hx, hz);
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
    bench(sx, sz, rot);
  }
  for (let i = 0; i < 10; i += 1) {
    // v9 iteration 6: ±22 put bins up to 4 m into the roads; ±16 keeps
    // them inside their block, same as the hydrants.
    const bx3 = blockCenters[Math.floor(rng.next() * blockCenters.length)] + rng.range(-16, 16);
    const bz3 = blockCenters[Math.floor(rng.next() * blockCenters.length)] + rng.range(-16, 16);
    bin(bx3, bz3);
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
        green: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.0, 0.5) }),
      },
      ew: {
        red: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 0.25, 0.25) }),
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
  // v9 iteration 6: each sign's pole + blade geometry is recorded, so
  // the placement audit can prove the pole no longer passes through
  // the middle of the text (the pole must sit at the blade's end).
  const signRecords = [];
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
    // v9 iteration 6: the blade was CENTRED on its pole, so the pole
    // passed through the middle of the text ("DOCKS RD" read "DOC S
    // RD"). The blade now hangs off the pole's end: its centre sits
    // 1.7 m along the blade's long axis from the pole (half the 3.2 m
    // blade + 0.1 clearance), so the pole stands at the blade's end and
    // every letter reads from both approach angles.
    const axisX = Math.cos(theta);
    const axisZ = -Math.sin(theta);
    const bladeX = px + axisX * 1.7;
    const bladeZ = pz + axisZ * 1.7;
    for (const side of [0, Math.PI]) {
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), bladeMat);
      blade.position.set(bladeX, 2.9, bladeZ);
      blade.rotation.y = theta + side;
      blade.translateZ(0.02);
      group.add(blade);
    }
    // The blade's long axis in world space (rotation.y = theta maps
    // local +X to (cos theta, 0, -sin theta)); the audit reads the
    // pole-to-blade-centre distance along this axis (1.7 = the pole at
    // the blade's end, 0 = through the middle of the text).
    signRecords.push({
      name: s.name, x: s.x, z: s.z, px, pz,
      bladeX, bladeZ,
      axisX, axisZ,
      bladeHalf: 1.6,
    });
  }

  // Street lamps along the avenues. v9 iteration 4: the poles and bulbs
  // are recorded here and instanced below (one draw call for all 30
  // poles, one for all 30 bulbs) instead of two meshes per lamp.
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.6 });
  // HDR bulb colour (> 1) so the bulbs bloom — the bloom threshold is
  // 0.9 and the old 0xffe9a8 would not clear it.
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.35, 0.75) });
  const lampSpots = [];
  for (const c of roadLines) {
    for (let t = -half + 20; t < half - 10; t += 56) {
      lampSpots.push({ x: c + W.roadWidth / 2 + 1, z: t });
    }
  }
  function buildLampInstances() {
    const n = lampSpots.length;
    const dummy = new THREE.Object3D();
    const poles = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.12, 0.16, 6, 6), lampMat, n,
    );
    const bulbs = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.35, 8, 6), bulbMat, n,
    );
    poles.castShadow = true;
    lampSpots.forEach((spot, i) => {
      dummy.position.set(spot.x, 3, spot.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(spot.x, 6.2, spot.z);
      dummy.updateMatrix();
      bulbs.setMatrixAt(i, dummy.matrix);
    });
    poles.instanceMatrix.needsUpdate = true;
    bulbs.instanceMatrix.needsUpdate = true;
    group.add(poles);
    group.add(bulbs);
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
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.9, 1.3) }),
  );
  spot.position.set(0, -0.9, 1.2);
  heli.add(spot);
  heli.position.set(0, 64, 0);
  scene.add(heli);
  heli.userData.rotor = rotor;

  // v9 iteration 4 — the money sinks and the beachfront, all fixed
  // geometry (zero rng): the AMMU-NATION gun shop and the PAY 'N' SPRAY
  // garage the player walks into, bus stops, neon billboards on the
  // beachfront, sun loungers and surfboards on the sand, hanging lamps
  // over the pier, bollards along the beach curb, three stunt ramps, and
  // a pool of destructible props. Then the instanced builds for the
  // palms, hydrants, benches, bins and street lamps recorded above.
  const neonMat = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
  function shopBuilding(x, z, w, d, h, wallColor, signText, signColor) {
    const b = box(w, h, d, wallColor, x, h / 2, z);
    group.add(b);
    const roof = box(w + 0.4, 0.3, d + 0.4, 0x2a2f38, x, h + 0.15, z);
    group.add(roof);
    // The sign faces west, toward the road the player walks in from.
    const tex = signTexture(signText, '#0a0a12', '#ffffff');
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.9, 1.6),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    sign.position.set(x - w / 2 - 0.15, h - 0.9, z);
    sign.rotation.y = -Math.PI / 2;
    group.add(sign);
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.14, w * 0.92),
      neonMat(signColor[0], signColor[1], signColor[2]),
    );
    strip.position.set(x - w / 2 - 0.15, h - 1.9, z);
    group.add(strip);
    return b;
  }
  shopBuilding(cfg.shops.gun.x, cfg.shops.gun.z, 10, 8, 5, 0x3a2f2a, 'AMMU-NATION', [2.2, 0.4, 1.6]);
  shopBuilding(cfg.shops.spray.x, cfg.shops.spray.z, 12, 9, 5, 0x2a3a4a, "PAY 'N' SPRAY", [0.4, 2.0, 2.0]);

  function busStop(x, z, face) {
    const g = new THREE.Group();
    const back = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 0.15), cityMat(0x2a4a5a, 0.8));
    back.position.set(0, 1.2, -0.9);
    back.castShadow = true;
    g.add(back);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.15, 2.2), cityMat(0x3a3f45, 0.6, 0.5));
    roof.position.set(0, 2.5, 0);
    g.add(roof);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 0.5), benchMat);
    seat.position.set(0, 0.5, -0.6);
    g.add(seat);
    g.position.set(x, 0, z);
    g.rotation.y = face;
    group.add(g);
  }
  busStop(-131.5, 60, -Math.PI / 2);
  busStop(131.5, -56, Math.PI / 2);

  function billboard(x, z, text, r, g, b) {
    const grp = new THREE.Group();
    for (const px of [-3, 3]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 6), cityMat(0x3a3f45, 0.6, 0.5));
      post.position.set(px, 3.5, 0);
      grp.add(post);
    }
    const tex = signTexture(text, '#0a0a12', '#ffffff', 512);
    // Two faces back to back: the board reads from the road AND the beach.
    for (const side of [0, Math.PI]) {
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(9, 3),
        new THREE.MeshBasicMaterial({ map: tex }),
      );
      board.position.set(0, 8.5, 0);
      board.rotation.y = side;
      board.translateZ(0.03);
      grp.add(board);
    }
    for (const gy of [10.1, 6.9]) {
      const glow = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.16, 0.12), neonMat(r, g, b));
      glow.position.set(0, gy, 0.05);
      grp.add(glow);
    }
    grp.position.set(x, 0, z);
    grp.rotation.y = -Math.PI / 2;
    group.add(grp);
  }
  billboard(152, -70, 'COSTA FUEGO', 2.2, 0.4, 1.6);
  billboard(152, 42, 'FUEGO BANK', 0.4, 2.0, 2.0);

  // Sun loungers on the sand, paired with the umbrellas already there.
  const loungerMat = cityMat(0xe8e0d0, 0.9);
  for (const lz of [-86, -74, -6, 6, 74, 86]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 0.8), loungerMat);
    frame.position.set(158, 0.35, lz);
    frame.castShadow = true;
    group.add(frame);
    const rest = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.8), loungerMat);
    rest.position.set(157.1, 0.55, lz);
    rest.rotation.z = 0.5;
    group.add(rest);
  }
  // Surfboards stuck upright in the sand.
  const surfColors = [0xff5a5a, 0x5a8aff, 0xffd23e, 0x35e0e6];
  [[156.5, 57], [160, 63], [152, -28], [152, 28]].forEach(([sx, sz], i) => {
    const board = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 1.6, 4, 8),
      new THREE.MeshStandardMaterial({ color: surfColors[i], roughness: 0.5 }),
    );
    board.position.set(sx, 1.1, sz);
    board.rotation.z = 0.35;
    board.rotation.y = i * 0.8;
    board.castShadow = true;
    group.add(board);
  });
  // Hanging lamps over the pier entrance: a wire across the deck with
  // five warm bulbs on cords.
  {
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 40, 4), cityMat(0x1a1a1a, 0.9));
    wire.rotation.z = Math.PI / 2;
    wire.position.set(189, 3.2, 100);
    group.add(wire);
    for (let i = 0; i < 5; i += 1) {
      const bx = 172 + i * 8.5;
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 4), cityMat(0x1a1a1a, 0.9));
      cord.position.set(bx, 2.98, 100);
      group.add(cord);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 8, 6),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.5, 0.9) }),
      );
      bulb.position.set(bx, 2.75, 100);
      group.add(bulb);
    }
  }
  // Bollards along the beach curb: one InstancedMesh, 36 posts.
  {
    const spots = [];
    for (let z = -140; z <= 140; z += 8) spots.push({ x: 149, z });
    const im = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.18, 0.22, 0.9, 8),
      cityMat(0xd8d8d8, 0.5, 0.3),
      spots.length,
    );
    const dummy = new THREE.Object3D();
    spots.forEach((sp, i) => {
      dummy.position.set(sp.x, 0.45, sp.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    group.add(im);
  }
  // Stunt ramps: solid wedges on the road shoulders, clear of junctions
  // and mission lines. The axis is the launch direction — 'z' launches
  // along the north-south roads, 'x' along the east-west ones.
  // v9 iteration 6: the old ramps were tilted BOXES (0.35 rad) — the
  // high edge floated ~0.6 m above the road, and at night the slab read
  // as a yellow beam spanning the road. A ramp is now a solid wedge: a
  // triangular prism whose base sits flat on the ground (0 at the low
  // edge, 1.1 m at the high edge, the same launch height as before),
  // with a hazard-chevron slope so it reads as a ramp, not a plank.
  // The footprint (5 x 4), positions and axes are unchanged, so the
  // positional stunt detection (game.js) and the probe stunt test are
  // unaffected. The wedge is built once and shared by all six ramps.
  const rampMeshes = [];
  const wedgeShape = new THREE.Shape();
  wedgeShape.moveTo(-2.5, 0);
  wedgeShape.lineTo(2.5, 0);
  wedgeShape.lineTo(2.5, 1.1);
  wedgeShape.closePath();
  const wedgeGeo = new THREE.ExtrudeGeometry(wedgeShape, { depth: 4, bevelEnabled: false });
  wedgeGeo.translate(0, 0, -2);
  const chevronCanvas = document.createElement('canvas');
  chevronCanvas.width = 128;
  chevronCanvas.height = 128;
  {
    const cctx = chevronCanvas.getContext('2d');
    cctx.fillStyle = '#d8a832';
    cctx.fillRect(0, 0, 128, 128);
    cctx.fillStyle = '#1a1a1a';
    for (let i = -2; i < 4; i += 1) {
      cctx.beginPath();
      cctx.moveTo(i * 64, 128);
      cctx.lineTo(i * 64 + 32, 128);
      cctx.lineTo(i * 64 + 96, 0);
      cctx.lineTo(i * 64 + 64, 0);
      cctx.closePath();
      cctx.fill();
    }
  }
  const chevronTex = new THREE.CanvasTexture(chevronCanvas);
  chevronTex.colorSpace = THREE.SRGBColorSpace;
  chevronTex.wrapS = THREE.RepeatWrapping;
  chevronTex.wrapT = THREE.RepeatWrapping;
  const rampCapMat = new THREE.MeshStandardMaterial({ color: 0xd8a832, roughness: 0.6 });
  const rampWallMat = new THREE.MeshStandardMaterial({ map: chevronTex, roughness: 0.6 });
  const ramps = cfg.stunts.ramps.map((r, i) => {
    const axis = r.axis || 'z';
    const ramp = new THREE.Mesh(wedgeGeo, [rampCapMat, rampWallMat]);
    ramp.position.set(r.x, 0, r.z);
    // The wedge's high edge is at local +x; axis 'z' ramps rotate -90
    // deg about Y so the high edge faces +z (the launch direction).
    if (axis === 'z') ramp.rotation.y = -Math.PI / 2;
    ramp.castShadow = true;
    group.add(ramp);
    rampMeshes.push(ramp);
    return { x: r.x, z: r.z, axis };
  });
  // Destructible props (v9 iteration 4): lamp posts, hydrants, trash
  // cans, wooden fences and cafe tables the player can smash through
  // while driving. Each is a Group pivoted at the ground so the game can
  // tip it over (rotation) and respawn it later. 24 in total.
  const destructibles = [];
  function destructible(kind, x, z, build) {
    const g = new THREE.Group();
    build(g);
    g.position.set(x, 0, z);
    group.add(g);
    destructibles.push({ kind, home: { x, z }, group: g, broken: false, timer: 0, fallT: 0 });
    return g;
  }
  for (const lz of [-84, -28, 28, 84]) {
    destructible('lamp', 144, lz, (g) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), lampMat);
      pole.position.y = 3;
      pole.castShadow = true;
      g.add(pole);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 8, 6),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.35, 0.75) }),
      );
      bulb.position.y = 6.2;
      g.add(bulb);
    });
  }
  for (const hz of [-112, -56, 56, 112]) {
    destructible('hydrant', 146, hz, (g) => {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.7, 8), hydrantMat);
      body.position.y = 0.35;
      body.castShadow = true;
      g.add(body);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), hydrantMat);
      cap.position.y = 0.75;
      g.add(cap);
    });
  }
  for (const cz of [-100, -60, -20, 20, 60, 100]) {
    destructible('can', 144, cz, (g) => {
      const can = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.4, 1.1, 10),
        cityMat(0x2a4a3a, 0.8, 0.3),
      );
      can.position.y = 0.55;
      can.castShadow = true;
      g.add(can);
    });
  }
  for (const fz of [-120, -80, -40, 40, 80, 120]) {
    destructible('fence', 146, fz, (g) => {
      const wood = cityMat(0x8a6a42, 0.9);
      for (const px of [-1.2, 1.2]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 0.15), wood);
        post.position.set(px, 0.6, 0);
        post.castShadow = true;
        g.add(post);
      }
      for (const ry of [0.5, 0.95]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.12, 0.08), wood);
        rail.position.set(0, ry, 0);
        g.add(rail);
      }
    });
  }
  for (const [tx, tz] of [[46, -10], [46, 10], [66, -10], [66, 10]]) {
    destructible('table', tx, tz, (g) => {
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 0.9, 0.08, 12),
        cityMat(0xd8d8d8, 0.5, 0.3),
      );
      top.position.y = 0.75;
      top.castShadow = true;
      g.add(top);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.75, 6), lampMat);
      leg.position.y = 0.38;
      g.add(leg);
    });
  }

  // Instanced builds for the recorded props (v9 iteration 4).
  buildPalmInstances();
  buildHydrantInstances();
  buildBenchInstances();
  buildBinInstances();
  buildLampInstances();

  function updateWind(time) {
    windUniform.value = time;
  }
  function updateSea(time, sunDir, sunColor) {
    seaUniforms.uTime.value = time;
    seaUniforms.uSunDir.value.copy(sunDir);
    seaUniforms.uSunColor.value.copy(sunColor);
  }

  // Two seasons (v9 iteration 3): RAINY SEASON (odd days) keeps the rain,
  // puddles, lamp pools and wet-street shine; DRY SEASON (even days)
  // hides all of them and dries the streets out (roughness up, shine
  // gone), so the pink dusk stands clear. Pure function of the day —
  // deterministic, no rng.
  function setSeason(rainy) {
    if (puddleMesh) puddleMesh.visible = rainy;
    if (poolMesh) poolMesh.visible = rainy;
    // v9 iteration 5: wet asphalt reads 0.28 with the PMREM environment
    // map (the brief's 0.25-0.35 wet band); dry streets stay rough.
    roadMatV.roughness = rainy ? 0.28 : 0.92;
    roadMatV.metalness = rainy ? 0.25 : 0.02;
    roadMatH.roughness = rainy ? 0.28 : 0.92;
    roadMatH.metalness = rainy ? 0.25 : 0.02;
    wetGroundMat.roughness = rainy ? 0.45 : 0.95;
    wetWalkMat.roughness = rainy ? 0.55 : 0.95;
    wetApronMat.roughness = rainy ? 0.5 : 0.9;
  }

  // v9 iteration 6 — placement audit: every prop the user caught
  // standing in a road, plus the sign and ramp geometry, checked against
  // the real road rectangles (each road line ±10 m, ±150 long). Pure
  // geometry over the recorded layout — no rendering, no rng — so the
  // probe can assert hard zeros. A rect touches a road only when the
  // overlap depth exceeds 0.05 m, so a frontage flush to the sidewalk
  // edge still passes; a trunk counts when its centre is on the road.
  function placementAudit() {
    group.updateMatrixWorld(true);
    const roadHalf = W.roadWidth / 2; // 10
    const roads = [];
    for (const c of roadLines) {
      roads.push({ axis: 'x', line: c, x0: c - roadHalf, x1: c + roadHalf, z0: -half, z1: half });
      roads.push({ axis: 'z', line: c, z0: c - roadHalf, z1: c + roadHalf, x0: -half, x1: half });
    }
    const roadLabel = (r) => (r.axis === 'x' ? `x=${r.line}` : `z=${r.line}`);
    const roadHitRect = (x0, x1, z0, z1) => {
      let worst = null;
      for (const r of roads) {
        const ox = Math.min(x1, r.x1) - Math.max(x0, r.x0);
        const oz = Math.min(z1, r.z1) - Math.max(z0, r.z0);
        const d = Math.min(ox, oz);
        if (d > 0.05 && (!worst || d > worst.depth)) {
          worst = { road: roadLabel(r), depth: Math.round(d * 10) / 10 };
        }
      }
      return worst;
    };
    const roadHitPoint = (x, z) => {
      for (const r of roads) {
        if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return roadLabel(r);
      }
      return null;
    };
    const out = {
      buildings: [], palms: [], trees: [], hydrants: [], bins: [],
      stalls: [], signs: [], ramps: [],
      counts: {
        buildings: buildingRecords.length, palms: palmSpots.length,
        trees: treeSpots.length, hydrants: hydrantSpots.length,
        bins: binSpots.length, stalls: stallDefs.length,
        signs: signRecords.length, ramps: rampMeshes.length,
      },
    };
    for (const b of buildingRecords) {
      const hit = roadHitRect(b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2);
      if (hit) out.buildings.push({ x: b.x, z: b.z, w: b.w, d: b.d, h: b.h, style: b.style, ...hit });
    }
    for (const p of palmSpots) {
      const road = roadHitPoint(p.x, p.z);
      if (road) out.palms.push({ x: p.x, z: p.z, road });
    }
    for (const t of treeSpots) {
      const road = roadHitPoint(t.x, t.z);
      if (road) out.trees.push({ x: t.x, z: t.z, road });
    }
    for (const h of hydrantSpots) {
      const road = roadHitPoint(h.x, h.z);
      if (road) out.hydrants.push({ x: h.x, z: h.z, road });
    }
    for (const b of binSpots) {
      const road = roadHitPoint(b.x, b.z);
      if (road) out.bins.push({ x: b.x, z: b.z, road });
    }
    for (const def of stallDefs) {
      // The counter is 3.2 x 1.6; the east stalls are rotated 90 deg.
      const hx = def.side === 'E' ? 0.8 : 1.6;
      const hz = def.side === 'E' ? 1.6 : 0.8;
      const hit = roadHitRect(def.x - hx, def.x + hx, def.z - hz, def.z + hz);
      if (hit) out.stalls.push({ x: def.x, z: def.z, ...hit });
    }
    for (const s of signRecords) {
      // The pole must sit at the blade's end, not through its middle:
      // the pole-to-blade-centre distance along the blade axis must be
      // at least the blade half-length (1.6) minus a 0.3 tolerance.
      const along = Math.abs((s.bladeX - s.px) * s.axisX + (s.bladeZ - s.pz) * s.axisZ);
      const poleOffset = Math.round(along * 100) / 100;
      // A lamp pole within 1 m of the blade segment can hide the text
      // from an approach angle, so that is flagged too.
      let lampNear = null;
      for (const l of lampSpots) {
        const dx = l.x - s.bladeX;
        const dz = l.z - s.bladeZ;
        const a = dx * s.axisX + dz * s.axisZ;
        const perp = Math.abs(dx * (-s.axisZ) + dz * s.axisX);
        if (Math.abs(a) <= s.bladeHalf + 0.5 && perp < 1.0) {
          lampNear = { x: l.x, z: l.z, perp: Math.round(perp * 100) / 100 };
          break;
        }
      }
      if (poleOffset < 1.3 || lampNear) {
        out.signs.push({ name: s.name, x: s.x, z: s.z, poleOffset, lampNear });
      }
    }
    for (let i = 0; i < rampMeshes.length; i += 1) {
      const mesh = rampMeshes[i];
      const pos = mesh.geometry.attributes.position;
      const v = new THREE.Vector3();
      let minY = Infinity;
      const verts = [];
      for (let k = 0; k < pos.count; k += 1) {
        v.fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld);
        if (v.y < minY) minY = v.y;
        verts.push({ x: v.x, y: v.y, z: v.z });
      }
      // Grounded = a vertex at ground level (y < 0.05) near each of the
      // four footprint corners: a solid wedge has its bottom face on
      // the ground; a tilted slab only touches at its low edge and its
      // high corners float ~0.6 m up.
      const bb = new THREE.Box3().setFromObject(mesh);
      const corners = [
        [bb.min.x, bb.min.z], [bb.min.x, bb.max.z],
        [bb.max.x, bb.min.z], [bb.max.x, bb.max.z],
      ];
      const grounded = corners.every(([cx, cz]) => verts.some((p) => p.y < 0.05 && Math.hypot(p.x - cx, p.z - cz) < 0.8));
      const r = ramps[i];
      if (minY < -0.02 || !grounded) {
        out.ramps.push({ x: r.x, z: r.z, axis: r.axis, minY: Math.round(minY * 100) / 100, grounded });
      }
    }
    return out;
  }

  return {
    group, roadLines, blockCenters, landmarks, half, pitch, streetlights, heli,
    lightHeads, stallSpots, barrels, buildingCount: buildingRecords.length, setSeason,
    // v9 iteration 4: destructible props, stunt ramps, instanced counts,
    // and the wind/sea updaters for the day cycle.
    destructibles, ramps, updateWind, updateSea, islandGate,
    // v9 iteration 6: the placement audit + the raw layout records it
    // reads, so the probe asserts against the real built city.
    placementAudit, buildingRecords, palmSpots, treeSpots, hydrantSpots,
    binSpots, stallDefs, signRecords, rampMeshes,
    instancedCounts: {
      palms: palmSpots.length,
      lamps: lampSpots.length,
      hydrants: hydrantSpots.length,
      benches: benchSpots.length,
      bins: binSpots.length,
      bollards: 36,
    },
  };
}
