// Costa Fuego itself: the ground, the 5x5 road grid, the buildings, the beach
// and sea, the palms, the lamps and the Fuego Tower. Everything is placed
// from the seeded random source, so one seed always builds the same city.
import * as THREE from 'three';

const BUILDING_COLORS = [0xd8c9b0, 0xb8c4cc, 0xc9a689, 0xa8b8a0, 0xd0b8c8, 0x9fb4c7, 0xe0d0a8, 0xc98a6a, 0x8a9ab0, 0xd8b8a0, 0xb0907a];
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

function makeSignTexture(text, bg, fg, canvasW = 256) {
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

// Facade textures: one 256x256 window grid per building colour, drawn once
// and shared. Lit windows (warm, some brighter than others) mix with dark
// ones, so no two facades glow the same and no building reads as a flat
// colour block. The texture repeats across the box faces, so the grid stays
// in proportion no matter how tall the building is.
function hash01(a, b, c) {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
const FACADE_TEXTURES = BUILDING_COLORS.map((color, ci) => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 256, 256);
  // Faint floor lines so the grid reads as storeys.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let r = 0; r < 8; r += 1) ctx.fillRect(0, r * 32 + 30, 256, 2);
  const cols = 5;
  const rows = 8;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const h = hash01(ci, c, r);
      const x = c * (256 / cols) + 9;
      const y = r * (256 / rows) + 6;
      if (h < 0.52) {
        ctx.fillStyle = h < 0.3 ? '#ffe9a8' : '#ffb27a';
      } else if (h < 0.62) {
        ctx.fillStyle = '#9fd8ff';
      } else {
        ctx.fillStyle = '#20262f';
      }
      ctx.fillRect(x, y, 256 / cols - 18, 256 / rows - 12);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
});

// Striped awning textures (red/white, teal/white), shared by shopfronts.
const AWNING_TEXTURES = ['#c23b2e', '#2a7a8c'].map((stripe) => {
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

// Shared materials for the city, keyed by colour, so the skyline does not
// allocate a new program per building.
const CITY_MAT = new Map();
function cityMat(color, roughness, metalness = 0) {
  const key = `${color}|${roughness}|${metalness}`;
  if (!CITY_MAT.has(key)) {
    CITY_MAT.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  }
  return CITY_MAT.get(key);
}

// Named districts, for the HUD label. Pure function of position.
export function districtAt(x, z) {
  if (x >= 130) return { name: 'FUEGO BEACHFRONT', tag: 'BEACHFRONT' };
  if (x >= 90 && z >= 60) return { name: 'OLD HARBOR', tag: 'DOCKS' };
  if (z <= -90) return { name: 'NORTH END', tag: 'UPTOWN' };
  if (Math.abs(x) < 70 && Math.abs(z) < 70) return { name: 'TOWER PLAZA', tag: 'DOWNTOWN' };
  if (x < -90) return { name: 'WESTSIDE', tag: 'OLD TOWN' };
  return { name: 'DOWNTOWN', tag: 'COSTA FUEGO' };
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

  // Sidewalk slabs around each block.
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
    boardwalk: { x: 158, z: 0, name: 'Boardwalk' },
  };

  // Buildings on every block except the tower block and the landmark blocks.
  // Each one gets a roof rim, glowing window strips (unlit, so they read
  // warm at dusk) and, on some, a lit canvas shop sign of its own.
  const skipBlocks = new Set(['0,0', '-112,84', '56,-56', '138,112', '-112,-112', '0,112']);
  const signTextures = SHOP_SIGNS.map((s) => makeSignTexture(s.text, s.bg, s.fg));
  let signNext = 0;
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      if (skipBlocks.has(`${bx},${bz}`)) continue;
      const count = rng.int(2, 4);
      for (let i = 0; i < count; i += 1) {
        const w = rng.range(10, 18);
        const d = rng.range(10, 18);
        const h = rng.range(W.buildingMinH, W.buildingMaxH);
        const ox = bx + rng.range(-10, 10);
        const oz = bz + rng.range(-10, 10);
        // The facade texture rides on the box itself (front + back faces),
        // so windows cost zero extra draw calls; sides stay flat colour.
        const colorIdx = Math.floor(rng.next() * BUILDING_COLORS.length);
        const color = BUILDING_COLORS[colorIdx];
        const ftex = FACADE_TEXTURES[colorIdx].clone();
        ftex.needsUpdate = true;
        ftex.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 9)));
        const frontMat = new THREE.MeshStandardMaterial({ map: ftex, roughness: 0.9 });
        const roofMat = cityMat(0x555a60, 0.9);
        // The window grid wraps all four vertical faces, so a building never
        // reads as a flat colour block from any angle.
        const b = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          [frontMat, frontMat, roofMat, roofMat, frontMat, frontMat],
        );
        b.position.set(ox, h / 2, oz);
        b.castShadow = true;
        b.receiveShadow = true;
        group.add(b);
        // Roof rim.
        const rim = box(w + 0.6, 0.5, d + 0.6, 0x555a60, ox, h + 0.25, oz);
        rim.castShadow = false;
        group.add(rim);
        // Roof clutter: an AC unit, an antenna, or a water tower.
        const clutter = rng.int(0, 2);
        if (clutter === 0) {
          const ac = box(1.4, 0.9, 1.4, 0x8a9096, ox + rng.range(-w / 4, w / 4), h + 0.95, oz + rng.range(-d / 4, d / 4));
          ac.castShadow = false;
          group.add(ac);
        } else if (clutter === 1) {
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
        } else {
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
        if (rng.chance(0.55)) {
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
        if (rng.chance(0.4)) {
          const tex = signTextures[signNext % signTextures.length];
          signNext += 1;
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(w * 0.62, 1.9),
            new THREE.MeshBasicMaterial({ map: tex }),
          );
          sign.position.set(ox, Math.min(h * 0.55, 9), oz + d / 2 + 0.2);
          group.add(sign);
        }
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
      new THREE.MeshBasicMaterial({ map: makeSignTexture(text, bg, fg, 512) }),
    );
    board.position.set(x, y, z);
    group.add(board);
    return board;
  }

  // Fuego Tower: the one tall landmark, dead centre.
  const tower = box(22, W.towerH, 22, cfg.palette.tower, 0, W.towerH / 2, 0);
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

  // Docks: wooden piers reaching toward the sea.
  for (let i = 0; i < 3; i += 1) {
    group.add(box(6, 1, 22, 0x7a5c38, landmarks.docks.x + 8 + i * 10, 0.6, landmarks.docks.z - 6 + i * 6));
  }

  // Palms along the beach and a few on the avenues.
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
    if (rng.chance(0.5)) group.add(palm(-140 + rng.range(-2, 2), z));
  }

  // Street props: red hydrants and benches along the sidewalks, and beach
  // umbrellas on the sand, so the streets stop reading empty.
  const hydrantMat = new THREE.MeshStandardMaterial({ color: 0xc22a22, roughness: 0.7 });
  for (let i = 0; i < 18; i += 1) {
    const hx = blockCenters[Math.floor(rng.next() * blockCenters.length)] + rng.range(-24, 24);
    const hz = blockCenters[Math.floor(rng.next() * blockCenters.length)] + rng.range(-24, 24);
    const hydrant = new THREE.Group();
    const bodyH = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.7, 8), hydrantMat);
    bodyH.position.y = 0.35;
    bodyH.castShadow = true;
    hydrant.add(bodyH);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), hydrantMat);
    cap.position.y = 0.75;
    hydrant.add(cap);
    hydrant.position.set(hx, 0, hz);
    group.add(hydrant);
  }
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 });
  for (let i = 0; i < 12; i += 1) {
    const bx2 = blockCenters[Math.floor(rng.next() * blockCenters.length)] + rng.range(-22, 22);
    const bz2 = blockCenters[Math.floor(rng.next() * blockCenters.length)] + rng.range(-22, 22);
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
    bench.position.set(bx2, 0, bz2);
    bench.rotation.y = rng.range(0, Math.PI);
    group.add(bench);
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

  return { group, roadLines, blockCenters, landmarks, half, pitch, streetlights, heli };
}
