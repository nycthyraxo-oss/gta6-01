// config.js — every tuning number, colour and layout fact for Costa Fuego.
// The city grid, districts, landmarks, junctions, races and jobs below are
// the fixed geography of the game; the builders in city.js place geometry
// from these tables and nothing else invents positions.

export const cfg = {
  world: {
    minX: -150, maxX: 210, minZ: -150, maxZ: 150,
    islandX: 247, islandZ: 100, islandR: 46,
    seaX: 196, // water plane starts east of the beachfront
    roadHalf: 10, // half width of every avenue and street
    groundY: 0,
  },
  camera: {
    lookSpeed: 0.005, // radians of yaw per pixel of mouse drag
    pitchSpeed: 0.0035,
    distFoot: 7.5,
    distCar: 11,
    heightFoot: 2.6,
    heightCar: 3.4,
    fov: 62,
  },
  player: {
    walkSpeed: 7,
    runSpeed: 12,
    jumpVel: 6.4,
    gravity: 18,
    radius: 0.55,
    maxHealth: 100,
    startCash: 150,
    respawnCost: 200,
    spawn: { x: -112, z: 60 },
  },
  car: {
    accel: 16,
    boostAccel: 26,
    maxSpeed: 34,
    boostSpeed: 46,
    reverseSpeed: 12,
    brakeDecel: 30,
    drag: 0.6,
    turnRate: 1.9,
    radius: 1.4,
  },
  traffic: {
    count: 26,
    cruiseSpeed: 11,
    slowSpeed: 6,
    laneOffset: 4.2,
    stopGap: 7,
  },
  crowd: {
    count: 46,
    walkSpeed: 1.7,
    fleeSpeed: 4.6,
  },
  police: {
    graceSeconds: 4, // first star does not bite for this long
    heatPerStar: 25,
    carjackHeat: 15,
    witnessSeconds: 6,
    decayPerSecond: 3,
    heliStars: 4,
    roadblockStars: 3,
    ramStars: 3,
    maxCars: 6,
  },
  time: {
    dayLength: 480, // seconds of game time per full day
    startHour: 9.5,
  },
  save: {
    key: 'costa-fuego.save.v3',
  },
};

// --- City grid -------------------------------------------------------------
export const AVENUES = [
  { x: -140, name: 'Harbor Ave' },
  { x: -84, name: 'Liberty Ave' },
  { x: -28, name: 'Jasmine Ave' },
  { x: 28, name: 'Fuego Ave' },
  { x: 84, name: 'Rose Ave' },
  { x: 140, name: 'Beach Ave' },
];

export const STREETS = [
  { z: -140, name: 'Garuda St' },
  { z: -84, name: 'Melati St' },
  { z: -28, name: 'Coral St' },
  { z: 28, name: 'Orchid St' },
  { z: 84, name: 'Sudirman St' },
  { z: 140, name: 'Seaside St' },
];

// --- Districts ---------------------------------------------------------------
export const DISTRICTS = [
  { name: 'FUEGO BEACHFRONT', x0: 148, x1: 210, z0: -150, z1: 150, style: 'deco' },
  { name: 'OLD HARBOR', x0: 84, x1: 148, z0: 28, z1: 150, style: 'brick' },
  { name: 'MARINA', x0: 84, x1: 148, z0: -150, z1: 28, style: 'marina' },
  { name: 'PALM GARDENS', x0: -150, x1: -84, z0: -150, z1: -84, style: 'park' },
  { name: 'MERCADO', x0: 28, x1: 84, z0: -150, z1: -84, style: 'mercado' },
  { name: 'NORTH END', x0: -84, x1: 28, z0: -150, z1: -84, style: 'residential' },
  { name: 'TOWER PLAZA', x0: -70, x1: 70, z0: -70, z1: 70, style: 'glass' },
  { name: 'WESTSIDE', x0: -150, x1: -56, z0: -84, z1: 84, style: 'stucco' },
  { name: 'DOWNTOWN', x0: -150, x1: 210, z0: -150, z1: 150, style: 'commercial' },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d;
  }
  return DISTRICTS[DISTRICTS.length - 1];
}

export function streetLabelAt(x, z) {
  let bestAve = AVENUES[0], bestD = 1e9;
  for (const a of AVENUES) {
    const d = Math.abs(x - a.x);
    if (d < bestD) { bestD = d; bestAve = a; }
  }
  let bestSt = STREETS[0];
  bestD = 1e9;
  for (const s of STREETS) {
    const d = Math.abs(z - s.z);
    if (d < bestD) { bestD = d; bestSt = s; }
  }
  const aveDist = Math.min(...AVENUES.map(a => Math.abs(x - a.x)));
  const stDist = Math.min(...STREETS.map(s => Math.abs(z - s.z)));
  const district = districtAt(x, z).name;
  // the street name only shows while actually on that road
  if (Math.min(aveDist, stDist) > 10) return district;
  const road = aveDist <= stDist ? bestAve.name : bestSt.name;
  return road + ' · ' + district;
}

// Road rectangles used by the placement audit: every avenue and street band.
export function roadRects() {
  const w = cfg.world;
  const rects = [];
  for (const a of AVENUES) rects.push({ x0: a.x - w.roadHalf, x1: a.x + w.roadHalf, z0: w.minZ, z1: w.maxZ, kind: 'avenue' });
  for (const s of STREETS) rects.push({ x0: w.minX, x1: w.maxX, z0: s.z - w.roadHalf, z1: s.z + w.roadHalf, kind: 'street' });
  // causeway to Fuego Island
  rects.push({ x0: 196, x1: 250, z0: 92, z1: 108, kind: 'causeway' });
  return rects;
}

export function pointOnRoad(x, z, pad = 0) {
  for (const r of roadRects()) {
    if (x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad) return true;
  }
  return false;
}

// --- Landmarks ---------------------------------------------------------------
export const LANDMARKS = [
  { id: 'garage', name: "Marla's Garage", x: -112, z: 112, sign: "MARLA'S GARAGE", sign2: 'SERVICE ENTRANCE' },
  { id: 'bank', name: 'Fuego Bank', x: 56, z: -56, sign: 'FUEGO BANK' },
  { id: 'docks', name: 'East Docks', x: 138, z: 112 },
  { id: 'safehouse', name: 'Safehouse', x: -112, z: -112 },
  { id: 'hospital', name: 'Costa General', x: 0, z: 112 },
  { id: 'marina', name: 'Marina', x: 140, z: -28 },
  { id: 'tower', name: 'Fuego Tower', x: 0, z: 0 },
  { id: 'neonplaza', name: 'Neon Plaza', x: 56, z: 0 },
  { id: 'boardwalk', name: 'Boardwalk', x: 158, z: 0 },
  { id: 'butik', name: 'Butik Neon', x: 160, z: -28 },
  { id: 'island', name: 'Fuego Island', x: 247, z: 100 },
  { id: 'islandgate', name: 'Island Gate', x: 209, z: 100 },
];

export const SHOPS = [
  { id: 'gunshop', name: 'AMMU-NATION COSTA', kind: 'guns', x: -64, z: 112 },
  { id: 'spray', name: "PAY 'N' SPRAY", kind: 'spray', x: 104, z: 112 },
  { id: 'outfit', name: 'NEON BOUTIQUE', kind: 'outfit', x: 160, z: -28 },
];

// Blocks that random buildings must never enter.
export const PROTECTED_BLOCKS = [
  { x: -112, z: 112, r: 24 }, // garage
  { x: 56, z: -56, r: 24 },   // bank
  { x: -112, z: -112, r: 24 }, // safehouse
  { x: 0, z: 112, r: 24 },    // hospital
  { x: 0, z: 0, r: 24 },      // tower
  { x: -112, z: 56, r: 26 },  // spawn block + mission-1 walk line
  { x: -64, z: 112, r: 20 },  // gun shop
  { x: 104, z: 112, r: 20 },  // pay 'n' spray
  { x: 56, z: 0, r: 22 },     // neon plaza
  { x: 164, z: 112, r: 22 },  // east docks warehouse
  { x: 160, z: -28, r: 18 },  // butik neon
];

// --- Signalled junctions -------------------------------------------------------
export const JUNCTIONS = [
  { x: -84, z: 28 }, { x: 84, z: -84 }, { x: 28, z: -28 },
  { x: 84, z: 84 }, { x: -28, z: -84 }, { x: 28, z: 140 },
];

// --- Races ---------------------------------------------------------------------
export const RACES = [
  { id: 'sprint', name: 'Fuego Ave Sprint', repNeed: 0, time: 75, prize: 300, rep: 5,
    start: { x: -28, z: 84 }, points: [{ x: 84, z: 84 }, { x: 84, z: -28 }, { x: -28, z: -28 }] },
  { id: 'dash', name: 'Coral Row Dash', repNeed: 20, time: 75, prize: 500, rep: 8,
    start: { x: -84, z: 28 }, points: [{ x: -84, z: -84 }, { x: 28, z: -84 }, { x: 28, z: 28 }] },
  { id: 'tour', name: 'Beach Grand Tour', repNeed: 50, time: 90, prize: 800, rep: 12,
    start: { x: 84, z: 84 }, points: [{ x: 84, z: -140 }, { x: -140, z: -140 }, { x: -140, z: 84 }] },
];

// --- Delivery jobs ---------------------------------------------------------------
export const DELIVERIES = [
  { id: 'coffee', name: 'Coffee for Marla', repNeed: 0, time: 90, pay: 200,
    pickup: { x: -84, z: 28 }, drop: { x: 0, z: 112 } },
  { id: 'package', name: 'Mercado Package', repNeed: 10, time: 75, pay: 250,
    pickup: { x: 56, z: -84 }, drop: { x: 56, z: -56 } },
  { id: 'garagejob', name: 'Delivery to the Garage', repNeed: 25, time: 120, pay: 400,
    pickup: { x: 158, z: 0 }, drop: { x: -112, z: 112 } },
];

// --- Stunt ramps -------------------------------------------------------------------
export const RAMPS = [
  { x: 33, z: 56, axis: 'z' }, { x: -135, z: -56, axis: 'z' }, { x: 56, z: -135, axis: 'x' },
  { x: -100, z: 28, axis: 'x' }, { x: 100, z: -28, axis: 'x' }, { x: -100, z: 84, axis: 'x' },
];

// --- Progression ---------------------------------------------------------------------
export const REP_RANKS = [
  { rep: 0, name: 'NEW KID' }, { rep: 25, name: 'HUSTLER' }, { rep: 60, name: 'PLAYER' },
  { rep: 120, name: 'HOTSHOT' }, { rep: 200, name: 'KING OF THE STREETS' }, { rep: 350, name: 'COSTA LEGEND' },
];

export function repRank(rep) {
  let rank = REP_RANKS[0];
  for (const r of REP_RANKS) if (rep >= r.rep) rank = r;
  return rank;
}

export const RADIO_STATIONS = [
  { freq: '88.5', name: 'COSTA FM', tempo: 112, wave: 'triangle', bass: [0, 0, 7, 5] },
  { freq: '102.4', name: 'REEF BEATS', tempo: 124, wave: 'square', bass: [0, 3, 5, 7] },
  { freq: '92.1', name: 'NEON NIGHT', tempo: 96, wave: 'sawtooth', bass: [0, 0, 10, 7] },
  { freq: '97.3', name: 'PLAYA DUB', tempo: 84, wave: 'sine', bass: [0, 5, 0, 7] },
];

export const WEAPONS = [
  { id: 'pistol', name: 'Pistol', damage: 26, range: 60, rate: 0.28, price: 0, repNeed: 0 },
  { id: 'smg', name: 'SMG', damage: 16, range: 50, rate: 0.09, price: 600, repNeed: 10 },
  { id: 'shotgun', name: 'Shotgun', damage: 55, range: 22, rate: 0.8, price: 450, repNeed: 15 },
  { id: 'carbine', name: 'Carbine', damage: 34, range: 80, rate: 0.16, price: 900, repNeed: 20 },
];

// Ten car classes with distinct silhouettes (length/width/height in metres).
export const CAR_CLASSES = [
  { name: 'Elang 600', len: 2.1, w: 0.8, h: 1.1, kind: 'bike' },
  { name: 'Kancil Hatch', len: 3.4, w: 1.7, h: 1.45, kind: 'hatch' },
  { name: 'Garuda Sedan', len: 4.1, w: 1.9, h: 1.5, kind: 'sedan' },
  { name: 'Banteng GT', len: 4.5, w: 2.0, h: 1.3, kind: 'gt' },
  { name: 'Lobo Van', len: 5.2, w: 2.1, h: 2.2, kind: 'van' },
  { name: 'Furia Sport', len: 4.3, w: 1.95, h: 1.15, kind: 'sport' },
  { name: 'Cakra Pickup', len: 4.8, w: 2.0, h: 1.8, kind: 'pickup' },
  { name: 'Sinta Coupe', len: 3.9, w: 1.8, h: 1.25, kind: 'coupe' },
  { name: 'Rimba SUV', len: 4.6, w: 2.05, h: 1.9, kind: 'suv' },
  { name: 'Taksi Kota', len: 4.2, w: 1.85, h: 1.55, kind: 'taxi' },
];

export const WEEKDAYS = ['FRI', 'SAT', 'SUN', 'MON', 'TUE', 'WED', 'THU'];

export function weekdayOf(day) {
  return WEEKDAYS[(day - 1) % 7];
}

export const EASTER_EGG_SIGN = 'Lemen Sayang Nycthyra';

export const PALETTE = {
  sky: 0x87c5e8,
  sun: 0xfff2d8,
  sea: 0x1f7fa8,
  sand: 0xe8d29a,
  asphalt: 0x3a3f46,
  sidewalk: 0xb8b2a4,
  grass: 0x5da24e,
  plaza: 0xcbbfa5,
};
