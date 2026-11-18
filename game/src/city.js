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
function hash01(a, b, c) {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
const FACADE_CACHE = new Map();
function facadeTexture(style, color) {
  const key = `${style}|${color}`;
  if (FACADE_CACHE.has(key)) return FACADE_CACHE.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 256, 256);
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
        ctx.fillStyle = h < 0.6 ? '#ffe9a8' : '#20262f';
        ctx.beginPath();
        ctx.arc(x + w / 2, y + hh / 2, Math.min(w, hh) / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (style === 'glass') {
        ctx.fillStyle = h < 0.55 ? '#bfe4ff' : h < 0.7 ? '#7fb3d8' : '#1c2a38';
      } else if (style === 'brick') {
        ctx.fillStyle = h < 0.4 ? '#ffe9a8' : '#241a16';
      } else if (h < 0.52) {
        ctx.fillStyle = h < 0.3 ? '#ffe9a8' : '#ffb27a';
      } else if (h < 0.62) {
        ctx.fillStyle = '#9fd8ff';
      } else {
        ctx.fillStyle = '#20262f';
      }
      ctx.fillRect(x, y, w, hh);
      if (style === 'balcony') {
        // A balcony slab under the window, with a rail line.
        ctx.fillStyle = 'rgba(20,20,24,0.85)';
        ctx.fillRect(x - 3, y + hh + 1, w + 6, 5);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(x - 3, y + hh + 1, w + 6, 1);
      }
      if (style === 'color' && r === rows - 1) {
        // Ground floor: one big lit shop window instead of a flat pane.
        ctx.fillStyle = h < 0.7 ? '#ffca7a' : '#ffe9a8';
        ctx.fillRect(x, y, w, hh);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  FACADE_CACHE.set(key, tex);
  return tex;
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

  // Base ground, then the sand strip and the sea to the east.
  group.add(flat(W.groundSize, W.groundSize, 0x6a7a5a, 0, 0, -0.05));
  group.add(flat(40, W.groundSize, cfg.palette.sand, W.beachX + 12, 0, 0.0));
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(120, W.groundSize),
    new THREE.MeshStandardMaterial({ color: cfg.palette.sea, roughness: 0.35, metalness: 0.1 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(W.seaX + 55, 0.15, 0);
  sea.receiveShadow = true;
  group.add(sea);

  // Roads: dark strips along every grid line, with pale centre dashes.
  for (const c of roadLines) {
    group.add(flat(W.roadWidth, half * 2, cfg.palette.road, c, 0, 0.02));
    group.add(flat(half * 2, W.roadWidth, cfg.palette.road, 0, c, 0.02));
    for (let t = -half + 8; t < half - 4; t += 12) {
      group.add(box(0.5, 0.06, 4, cfg.palette.roadLine, c, 0.05, t));
      group.add(box(4, 0.06, 0.5, cfg.palette.roadLine, t, 0.05, c));
    }
  }

  // Sidewalk slabs around each block, with a raised curb edge on the road
  // side so the pavement reads as a pavement, not a paint colour.
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      group.add(flat(W.blockSize + 6, W.blockSize + 6, cfg.palette.sidewalk, bx, bz, 0.03));
    }
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

  function raiseBuilding(ox, oz, w, d, h, style, colorIdx) {
    const styleDef = DISTRICT_STYLES[style];
    const color = styleDef.palette[colorIdx % styleDef.palette.length];
    const ftex = facadeTexture(style, color).clone();
    ftex.needsUpdate = true;
    ftex.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 9)));
    const frontMat = new THREE.MeshStandardMaterial({ map: ftex, roughness: 0.9 });
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
  const towerMat = new THREE.MeshStandardMaterial({ map: towerTex, roughness: 0.9 });
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
  group.add(flat(20, 12, 0x6a6a66, landmarks.garage.x, 70, 0.05));
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
      bench.position.set(cx + rng.range(-14, 14), 0, cz + rng.range(-14, 14));
      bench.rotation.y = rng.range(0, Math.PI);
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
  group.add(bench(-100, 50, 0.6));
  group.add(bin(-106, 68));
  group.add(bench(-118, 72, -0.4));
  for (let i = 0; i < 18; i += 1) {
    const hx = blockCenters[Math.floor(rng.next() * blockCenters.length)] + rng.range(-24, 24);
    const hz = blockCenters[Math.floor(rng.next() * blockCenters.length)] + rng.range(-24, 24);
    group.add(hydrant(hx, hz));
  }
  for (let i = 0; i < 12; i += 1) {
    const bx2 = blockCenters[Math.floor(rng.next() * blockCenters.length)] + rng.range(-22, 22);
    const bz2 = blockCenters[Math.floor(rng.next() * blockCenters.length)] + rng.range(-22, 22);
    group.add(bench(bx2, bz2, rng.range(0, Math.PI)));
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
    // Crosswalk stripes across both roads at the junction.
    for (let s = -2; s <= 2; s += 1) {
      group.add(box(0.9, 0.05, 3.2, 0xf2f2f2, j.x + s * 2.2, 0.05, j.z - 9.5));
      group.add(box(0.9, 0.05, 3.2, 0xf2f2f2, j.x + s * 2.2, 0.05, j.z + 9.5));
      group.add(box(3.2, 0.05, 0.9, 0xf2f2f2, j.x - 9.5, 0.05, j.z + s * 2.2));
      group.add(box(3.2, 0.05, 0.9, 0xf2f2f2, j.x + 9.5, 0.05, j.z + s * 2.2));
    }
  }

  // Street lamps along the avenues.
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.6 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const c of roadLines) {
    for (let t = -half + 20; t < half - 10; t += 56) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), lampMat);
      pole.position.set(c + W.roadWidth / 2 + 1, 3, t);
      pole.castShadow = true;
      group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), bulbMat);
      bulb.position.set(c + W.roadWidth / 2 + 1, 6.2, t);
      group.add(bulb);
    }
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

  return { group, roadLines, blockCenters, landmarks, half, pitch, streetlights, heli, lightHeads, stallSpots, barrels };
}
