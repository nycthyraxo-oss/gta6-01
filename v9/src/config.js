// Costa Fuego — every tuning number lives here and nowhere else.
// One file, one job: if a number changes the feel of the game, it lives here.
//
// v6 adds the district table (nine named districts, each with its own
// architecture style), the traffic-light cycle, the hidden-package hunt,
// armour and reputation, and the helicopter spotlight — all as plain data,
// so the systems that read them stay small.
export const CONFIG = {
  seed: 20261117,
  world: {
    blockSize: 36,
    roadWidth: 20,
    blocks: 5,
    beachX: 150,
    seaX: 178,
    groundSize: 420,
    buildingMinH: 9,
    buildingMaxH: 46,
    towerH: 92,
  },
  player: {
    walkSpeed: 7,
    runSpeed: 12,
    radius: 0.55,
    height: 1.8,
    // Jump (v9 iteration 3): deterministic — one upward velocity, one
    // gravity, land exactly on y = 0. No double-jump, no randomness.
    jumpSpeed: 7.5,
    jumpGravity: 24,
    maxHealth: 100,
    maxArmour: 100,
    armourOnJob: 20,
    repPerJob: 10,
    repPerPackage: 2,
    repPerRace: 5,
    repPerStunt: 1,
    repPerDelivery: 3,
    shootRange: 55,
    shootDamage: 34,
    shootCooldown: 0.22,
    enterCarRange: 4.5,
    respawnCost: 200,
    // Pistol ammo (v9 iteration 4): the pistol is no longer infinite.
    // 24 rounds on the belt, 60 max; Ammu-Nation sells 12 for $25.
    pistolAmmo: 24,
    pistolAmmoMax: 60,
  },
  // Weapons (v9 iteration 3): slot 1 pistol (infinite, as before), slot 2
  // knife (melee, infinite), slot 3 bazooka (limited rockets). All damage
  // flat and deterministic — no randomness anywhere in a weapon.
  // v9 iteration 4: the pistol is limited ammo now, and the Ammu-Nation
  // shop sells three more slots — SMG (REP 20), Shotgun (REP 40), Rifle
  // (REP 60) — each with its own ammo pool, all bought, never infinite.
  weapons: {
    pistol: { ammoPrice: 25, ammoPack: 12 },
    knife: { range: 2.4, damage: 50, cooldown: 0.35 },
    bazooka: { rockets: 8, rocketSpeed: 42, blastRadius: 6, blastDamage: 60, cooldown: 0.9, range: 60, rocketPrice: 60, rocketPack: 4 },
    smg: { rep: 20, price: 400, damage: 22, cooldown: 0.09, range: 45, ammo: 90, maxAmmo: 180, ammoPrice: 30, ammoPack: 30, perp: 1.2 },
    shotgun: { rep: 40, price: 800, damage: 60, cooldown: 0.7, range: 18, ammo: 24, maxAmmo: 48, ammoPrice: 30, ammoPack: 8, perp: 2.2 },
    rifle: { rep: 60, price: 1200, damage: 55, cooldown: 0.16, range: 70, ammo: 40, maxAmmo: 120, ammoPrice: 30, ammoPack: 20, perp: 1.2 },
  },
  car: {
    accel: 22,
    brake: 34,
    reverseAccel: 12,
    maxSpeed: 38,
    maxReverse: 10,
    steer: 1.9,
    grip: 6.5,
    handbrakeGrip: 2.2,
    length: 4.4,
    width: 2.0,
    trafficSpeed: 9,
    trafficSpeedJitter: 3,
    policeSpeed: 30,
    conditionMinSpeed: 0.75,
  },
  traffic: { count: 22, minGap: 9 },
  pedestrians: { count: 34, walkSpeed: 1.6, fleeSpeed: 4.2, fleeRadius: 18 },
  police: {
    sightRange: 55,
    respawnMin: 85,
    respawnMax: 115,
    arrestRange: 3.0,
    arrestTime: 2.0,
    ramDamage: 6,
    // v9 iteration 3: a short grace window after the first heat — the
    // police spawn immediately but hold their reaction, so one accidental
    // shot is never an instant death. patrolSpeed is the 1-star cruise.
    graceSeconds: 4,
    patrolSpeed: 8,
    maxCars: 4,
    maxOfficers: 3,
    heatPerStar: 100,
    decayPerSecond: 9,
    stealHeat: 55,
    hitPedHeat: 40,
    hitCarHeat: 12,
    shootHeat: 25,
    // v9 iteration 5 (§4): a witness who finishes their 3 s report.
    witnessHeat: 15,
    roadblockStars: 3,
    heliStars: 4,
    heliHeight: 55,
    heliSpotRadius: 9,
    searchZoneBase: 60,
    searchZonePerStar: 15,
    // v9 iteration 4: 4 stars is heavy tactical — a 5th cruiser (TACTICAL,
    // 1.1× speed) plus a second roadblock pair ahead as a coordinated
    // ambush; 5 stars is MAXIMUM — the heli spotlight tracks the player.
    maxCarsTactical: 5,
    ambushStars: 4,
    spotlightStars: 5,
  },
  economy: {
    resprayCost: 150,
    // v9 iteration 4: money is a progression sink now. V costs $25 a car,
    // a bribe takes 1 star off for $100, a repair is $80, armour $100.
    spawnCarCost: 25,
    bribeCost: 100,
    repairCost: 80,
    armourPrice: 100,
  },
  // v9 iteration 5: the two money sinks. Both on protected blocks, clear
  // of mission lines, spawn, package spots and the docks duel. The gun
  // shop sells weapons and ammo; Pay 'n' Spray repairs, repaints and
  // takes bribes.
  shops: {
    gun: { x: -128, z: 40, name: 'AMMU-NATION COSTA' },
    spray: { x: 96, z: 112, name: "PAY 'N' SPRAY" },
    // v9 iteration 5: the outfit shop — a beachfront boutique on the
    // boardwalk that sells shirt colours (cosmetic player colours).
    outfit: { x: 160, z: -28, name: 'NEON BOUTIQUE' },
  },
  // v9 iteration 5: street names — our own names, one per road line.
  // Avenues run north-south (constant x), streets east-west
  // (constant z). The HUD reads "Fuego Ave · DOWNTOWN".
  // v9 iteration 6: English names — the Indonesian "Jalan ..." set read
  // as the whole game being in Indonesian.
  streetNames: {
    avenues: {
      '-140': 'Harbor Ave', '-84': 'Liberty Ave', '-28': 'Jasmine Ave',
      '28': 'Fuego Ave', '84': 'Rose Ave', '140': 'Beach Ave',
    },
    streets: {
      '-140': 'Garuda St', '-84': 'Melati St', '-28': 'Coral St',
      '28': 'Orchid St', '84': 'Sudirman St', '140': 'Seaside St',
    },
  },
  // v9 iteration 5: REP ranks — named titles, our own. Each rank unlocks
  // jobs + gear (race 2 needs REP 20, race 3 REP 50, The Big Score REP 30).
  // v9 iteration 6: English rank names.
  repRanks: [
    { rep: 0, name: 'NEW KID' },
    { rep: 25, name: 'HUSTLER' },
    { rep: 60, name: 'PLAYER' },
    { rep: 120, name: 'HOTSHOT' },
    { rep: 200, name: 'KING OF THE STREETS' },
    { rep: 350, name: 'COSTA LEGEND' },
  ],
  // v9 iteration 5: six skills, each 0-5, each with a small real effect.
  // Driving +2% top speed/level, Stamina +3% run speed/level, Aim +5%
  // hit tolerance/level, Stealth -5% heat gain/level, Influence -3%
  // shop prices/level, Street Sense shows packages + medals on the map
  // from level 2. XP thresholds per level: 10/25/45/70/100.
  skills: {
    driving: { xpPer: 100, label: 'Driving' },
    stamina: { xpPer: 10, label: 'Stamina' },
    aim: { xpPer: 1, label: 'Aim' },
    stealth: { xpPer: 1, label: 'Stealth' },
    influence: { xpPer: 1, label: 'Influence' },
    street: { xpPer: 1, label: 'Street Sense' },
  },
  skillLevels: [0, 10, 25, 45, 70, 100],
  // v9 iteration 5: 24 Fuego Medals hidden across the map — gold coins
  // on the roads, the pier, the beach, the plaza and the island. $100
  // each, and the full set pays a $5,000 bonus.
  medals: {
    count: 24,
    reward: 100,
    bonus: 5000,
    pickupRadius: 2.6,
  },
  // v9 iteration 5: three street races. Race 1 is the old garage-road
  // sprint; race 2 is the Coral Row dash (REP 20); race 3 is the Pantai
  // grand tour around the whole east side (REP 50).
  races: [
    {
      name: 'Fuego Ave Sprint', repReq: 0, timeLimit: 75, prize: 300, rep: 5,
      start: { x: -28, z: 84 },
      checkpoints: [{ x: 84, z: 84 }, { x: 84, z: -28 }],
      finish: { x: -28, z: -28 },
    },
    {
      name: 'Coral Row Dash', repReq: 20, timeLimit: 75, prize: 500, rep: 8,
      start: { x: -84, z: 28 },
      checkpoints: [{ x: -84, z: -84 }, { x: 28, z: -84 }],
      finish: { x: 28, z: 28 },
    },
    {
      name: 'Beach Grand Tour', repReq: 50, timeLimit: 90, prize: 800, rep: 12,
      start: { x: 84, z: 84 },
      checkpoints: [{ x: 84, z: -140 }, { x: -140, z: -140 }],
      finish: { x: -140, z: 84 },
    },
  ],
  // v9 iteration 5: courier side jobs for Marla's contacts — pick up at
  // the marker, deliver before the clock runs out. REP-gated like the
  // races: job 2 needs REP 10, job 3 needs REP 25.
  deliveries: [
    { name: 'Coffee for Marla', repReq: 0, timeLimit: 90, prize: 200,
      pickup: { x: -84, z: 28 }, drop: { x: 0, z: 112 } },
    { name: 'Mercado Package', repReq: 10, timeLimit: 75, prize: 250,
      pickup: { x: 56, z: -84 }, drop: { x: 56, z: -56 } },
    { name: 'Delivery to the Garage', repReq: 25, timeLimit: 120, prize: 400,
      pickup: { x: 158, z: 0 }, drop: { x: -112, z: 112 } },
  ],
  // v9 iteration 5: the causeway + island district east of Fuego Pier.
  // The gate at the causeway mouth opens as the player approaches.
  island: {
    x0: 222, x1: 272, z0: 72, z1: 128,
    gate: { x: 209, z: 100 },
    name: 'Fuego Island',
  },
  // v9 iteration 5: graphics presets. LOW drops the pixel ratio, bloom
  // and shadows and thins the traffic + crowd; HIGH pushes them up.
  // The pause-menu sliders override the preset's traffic/crowd counts.
  presets: {
    LOW: { pixelRatio: 1, bloom: false, shadows: false, shadowSize: 512, traffic: 10, pedestrians: 12, far: 400, fogMul: 1.3 },
    MED: { pixelRatio: 1.5, bloom: true, shadows: true, shadowSize: 1024, traffic: 22, pedestrians: 34, far: 900, fogMul: 1 },
    HIGH: { pixelRatio: 2, bloom: true, shadows: true, shadowSize: 2048, traffic: 30, pedestrians: 44, far: 1200, fogMul: 0.8 },
  },
  // v9 iteration 4: free-roam side activities. The street race starts on
  // the garage road and runs three intersections for $300 + 5 REP; the
  // three stunt ramps sit on road shoulders, clear of junctions and
  // mission lines — hit one over 15 m/s and the car flies.
  // v9 iteration 5: cfg.race is race 1 of cfg.races (kept as the alias
  // for the HUD + staging); the game runs all three races from cfg.races.
  race: {
    start: { x: -28, z: 84 },
    checkpoints: [{ x: 84, z: 84 }, { x: 84, z: -28 }],
    finish: { x: -28, z: -28 },
    timeLimit: 75,
    prize: 300,
  },
  stunts: {
    // v9 iteration 5: the first landing on a ramp pays firstPrize,
    // every repeat landing pays prize.
    prize: 50,
    firstPrize: 500,
    // v9 iteration 5: six ramps — the old three plus three more on the
    // east-west roads. `axis` is the launch direction ('x' along an
    // east-west road, 'z' along a north-south one).
    ramps: [
      { x: 33, z: 56, axis: 'z' }, { x: -135, z: -56, axis: 'z' }, { x: 56, z: -135, axis: 'x' },
      { x: -100, z: 28, axis: 'x' }, { x: 100, z: -28, axis: 'x' }, { x: -100, z: 84, axis: 'x' },
    ],
  },
  // Neon night: the look the L key switches to. Dusk is the default; night
  // is a dark sky, a moon-cold sun, and the street lamps turned all the way
  // up, so the lit windows read brighter by contrast.
  night: {
    skyTop: 0x05070f,
    skyMid: 0x1a1040,
    skyLow: 0x3a1a5a,
    fog: 0x0a0e24,
    sun: 0x8aa0ff,
    sunIntensity: 0.35,
    hemiIntensity: 0.25,
    ambientIntensity: 0.25,
    streetlight: 18,
  },
  // Spawn-a-car (V): a fast car on demand, with a cooldown and a cap so
  // the city never floods with them. v9 iteration 4: it costs $25 a car
  // now (money as a progression sink) and the cooldown is 20 s.
  spawnCarCooldown: 20,
  spawnCarMax: 4,
  // Wanted evaded: how long after an escape the heat cannot rise again.
  evadeCooldown: 3,
  combat: {
    enemyHealth: 100,
    enemyDamage: 9,
    enemyShootRange: 34,
    enemyShootCooldown: 1.1,
    enemyAccuracy: 0.55,
    tracerLife: 0.09,
  },
  missions: {
    rewards: [300, 650, 500, 900, 1200, 2000],
    deliveryTime: 75,
    getawayTime: 90,
  },
  camera: {
    footDistance: 9,
    footHeight: 4.2,
    carDistance: 12.5,
    carHeight: 5.2,
    lookSpeed: 0.005,
    pitchMin: -0.15,
    pitchMax: 0.9,
  },
  time: {
    // v9 iteration 4: a continuous day cycle, not a binary toggle. The
    // clock runs a slow day (30 min per day) from 18:24, and the light
    // code interpolates keyframes by the hour — night, dawn, day, dusk,
    // night — so the sky dome, sun, hemisphere light and fog density all
    // move with the HUD clock. The dusk plateau (17.5–19.5) holds the old
    // golden-hour look exactly, so staged shots still render the same dusk.
    // L skips time forward 2 h instead of toggling night.
    dayLength: 1800,
    startHour: 18.4,
    duskHour: 18.5,
  },
  // Traffic lights: one city-wide cycle, so every junction changes
  // together and the player can read the rhythm. Green 7 s, yellow 1.5 s,
  // then the other axis. The six junctions are the busiest crossings —
  // every one is a real crossing: both coords sit on road lines
  // (-140, -84, -28, 28, 84, 140). A junction anywhere else puts its
  // poles in a block or on a straight road (v9 iteration 7-fix: the old
  // (0,0), (-56,0), (0,56) and (56,28) were mid-block, not crossings).
  lights: {
    greenSeconds: 7,
    yellowSeconds: 1.5,
    stopDistance: 12,
    junctions: [
      { x: -84, z: 28 },
      { x: 84, z: -84 },
      { x: 28, z: -28 },
      { x: 84, z: 84 },
      { x: -28, z: -84 },
      { x: 28, z: 140 },
    ],
  },
  // Ten hidden packages, $50 each, tucked into alleys, parks, the beach
  // and the docks. They are a free-roam side activity: no mission, no
  // timer, just a gold glint worth walking over to.
  packages: {
    count: 10,
    reward: 50,
    pickupRadius: 2.6,
  },
  // v9 graphics: the rainy neon city. Lit facade windows glow through
  // an emissive map (facadeEmissive scales it); rain falls in a box
  // around the camera (count streaks, fallSpeed m/s down, windSpeed m/s
  // sideways), with splashRings reusable splash rings on the ground.
  // v9 iteration 4: bloom threshold 0.9 — only emissiveIntensity > 1
  // blooms (neon signs, lamp bulbs, headlights, tracers, flashes). The
  // facade windows sit at 0.9 on purpose: they glow, they do not bloom.
  graphics: {
    facadeEmissive: 0.9,
    bloomThreshold: 0.9,
    bloomStrength: 0.45,
    bloomRadius: 0.4,
  },
  rain: {
    count: 600,
    fallSpeed: 38,
    windSpeed: 4,
    boxX: 34,
    boxY: 26,
    boxZ: 34,
    splashRings: 10,
  },
  saveKey: 'costa-fuego.save.v3',
  palette: {
    skyDay: 0xff9a6b,
    skyDusk: 0xc2337f,
    skyTop: 0x2b1157,
    skyMid: 0xc2337f,
    skyLow: 0xff7a3c,
    fog: 0xd96a7a,
    fogNear: 100,
    fogFar: 420,
    sun: 0xffb27a,
    road: 0x33363d,
    roadLine: 0xd8d3a8,
    sidewalk: 0x9a938a,
    sand: 0xe6d3a3,
    sea: 0x1c4a6b,
    grass: 0x5d8a4a,
    tower: 0x7fb3d8,
  },
};

// Nine named districts. Checked in order, first match wins; DOWNTOWN is
// the fallback, so every point in the city has a name. The rectangles are
// chosen so the play-test's two pinned readings still hold: the spawn
// (-112, 60) is WESTSIDE and the hospital (0, 112) is DOWNTOWN.
export const DISTRICTS = [
  { id: 'beachfront', name: 'FUEGO BEACHFRONT', x0: 148, x1: 210, z0: -150, z1: 150, style: 'deco' },
  { id: 'harbor', name: 'OLD HARBOR', x0: 84, x1: 148, z0: 28, z1: 150, style: 'brick' },
  { id: 'marina', name: 'MARINA', x0: 84, x1: 148, z0: -150, z1: 28, style: 'marina' },
  { id: 'palm', name: 'PALM GARDENS', x0: -150, x1: -84, z0: -150, z1: -84, style: 'park' },
  { id: 'mercado', name: 'MERCADO', x0: 28, x1: 84, z0: -150, z1: -84, style: 'mercado' },
  { id: 'north', name: 'NORTH END', x0: -84, x1: 28, z0: -150, z1: -84, style: 'residential' },
  { id: 'plaza', name: 'TOWER PLAZA', x0: -70, x1: 70, z0: -70, z1: 70, style: 'glass' },
  { id: 'westside', name: 'WESTSIDE', x0: -150, x1: -56, z0: -84, z1: 84, style: 'stucco' },
  { id: 'downtown', name: 'DOWNTOWN', x0: -150, x1: 210, z0: -150, z1: 150, style: 'commercial' },
];

// How each district builds. palette is the facade base colours, heights
// the storey range, facade the window-grid style, roof the crown type,
// and the chances drive awnings, balconies and shop signs per building.
// No two districts share a look: the beachfront is pastel art-deco, the
// plaza is blue glass, the mercado is low and loud, the harbor is brick.
export const DISTRICT_STYLES = {
  deco: {
    palette: [0xf2c9d8, 0xa8e0d0, 0xf2e3c9, 0xd8a8c8, 0x9fd8d0],
    heights: [8, 22], facade: 'deco', roof: 'crown',
    awning: 0.7, balcony: 0.25, sign: 0.6, trim: 0xffd23e,
  },
  brick: {
    palette: [0x8a4a38, 0x7a3a2e, 0x9a5a40, 0x6a3a30],
    heights: [7, 16], facade: 'brick', roof: 'flat',
    awning: 0.3, balcony: 0, sign: 0.3, trim: 0x555a60,
  },
  marina: {
    palette: [0xf0f0ea, 0xd8e8f0, 0xe8f0e0, 0xffffff],
    heights: [6, 14], facade: 'plain', roof: 'flat',
    awning: 0.5, balcony: 0.4, sign: 0.4, trim: 0x2a7a8c,
  },
  park: {
    palette: [0xd8c9b0, 0xa8b8a0, 0xc9a689],
    heights: [6, 12], facade: 'plain', roof: 'flat',
    awning: 0.2, balcony: 0.3, sign: 0.2, trim: 0x5d8a4a,
  },
  mercado: {
    palette: [0xe07828, 0x2a7a8c, 0xd8c832, 0xc23b2e, 0x3aa655],
    heights: [5, 11], facade: 'color', roof: 'flat',
    awning: 0.9, balcony: 0.1, sign: 0.7, trim: 0xffd23e,
  },
  residential: {
    palette: [0xd8c9b0, 0xb8c4cc, 0xc9a689, 0xa8b8a0, 0xd0b8c8],
    heights: [9, 26], facade: 'balcony', roof: 'water',
    awning: 0.4, balcony: 0.8, sign: 0.3, trim: 0x8a9096,
  },
  glass: {
    palette: [0x5a8ab0, 0x4a7aa0, 0x6a9ac0, 0x3a6a90],
    heights: [20, 46], facade: 'glass', roof: 'antenna',
    awning: 0.3, balcony: 0, sign: 0.5, trim: 0x9fd8ff,
  },
  stucco: {
    palette: [0xe0d0a8, 0xd8b8a0, 0xc98a6a, 0xe8e0cc],
    heights: [6, 14], facade: 'plain', roof: 'flat',
    awning: 0.5, balcony: 0.35, sign: 0.45, trim: 0xb05a3a,
  },
  commercial: {
    palette: [0x9fb4c7, 0xb8c4cc, 0x8a9ab0, 0xd8c9b0, 0xa8b8c8],
    heights: [12, 38], facade: 'glass', roof: 'setback',
    awning: 0.4, balcony: 0, sign: 0.55, trim: 0x2a3a4a,
  },
};

export const MISSION_DEFS = [
  {
    id: 1,
    title: 'Homecoming',
    giver: 'Marla Quinn',
    brief: 'Rico, you are out. Get to my garage on Coral Row and we will talk work. Drive or walk — just get here.',
    objective: 'Reach Marla\u2019s Garage on Coral Row',
    reward: 300,
    stages: 1,
    dialogue: [
      { who: 'Marla Quinn', text: 'Rico. Three years, and you still walk like you own the street. Get to my garage, Coral Row — we talk work.' },
      { who: 'Rico Vane', text: 'I am out, Marla. The city forgot me. Did you?' },
      { who: 'Marla Quinn', text: 'I never forget a debt, Rico. Or a friend. Move — the Reef Kings watch this block.' },
    ],
    complete: 'Marla Quinn: Good. You still know the way home. First job pays $300 — and it only gets hotter from here.',
  },
  {
    id: 2,
    title: 'Hot Wheels',
    giver: 'Marla Quinn',
    brief: 'A client wants the orange coupe parked by the marina. Take it — any way you like — and bring it to the garage.',
    objective: 'Steal the orange coupe and deliver it to the garage',
    reward: 650,
    stages: 2,
    dialogue: [
      { who: 'Marla Quinn', text: 'A client wants the orange Vela coupe by the marina. Take it — any way you like. Keys are for tourists.' },
      { who: 'Rico Vane', text: 'Steal it in daylight, by the marina? The whole beach will see me.' },
      { who: 'Marla Quinn', text: 'Then be fast, Rico. Fast is invisible.' },
    ],
    stageLine: 'Marla Quinn: That is the one. Now bring her home — easy on the paint, the client pays for pretty.',
    complete: 'Marla Quinn: Clean take, no dents worth crying over. $650. The client sends his regards — and his cash.',
  },
  {
    id: 3,
    title: 'The Drop',
    giver: 'Marla Quinn',
    brief: 'A package for the docks, and the buyer does not wait. Get it there before the clock runs out.',
    objective: 'Deliver the package to the docks before time runs out',
    reward: 500,
    stages: 1,
    dialogue: [
      { who: 'Marla Quinn', text: 'Package for the docks. The buyer does not wait, and neither do I. Seventy-five seconds, Rico.' },
      { who: 'Rico Vane', text: 'What is in it?' },
      { who: 'Marla Quinn', text: 'Your paycheck, if you stop asking questions and start driving.' },
    ],
    complete: 'Marla Quinn: On time. The buyer is happy, which means I am happy, which means you get $500.',
  },
  {
    id: 4,
    title: 'Heat',
    giver: 'Marla Quinn',
    brief: 'The Reef Kings tipped off the cops. Lose the heat — break line of sight and get clear — then come back to me.',
    objective: 'Lose the wanted level, then return to the garage',
    reward: 900,
    stages: 1,
    dialogue: [
      { who: 'Marla Quinn', text: 'The Reef Kings tipped off the cops, Rico. Three stars and climbing. Lose them — break line of sight, get clear.' },
      { who: 'Rico Vane', text: 'And if I cannot shake them?' },
      { who: 'Marla Quinn', text: 'Then my garage resprays anything for $150, no questions. Now drive like you mean it.' },
    ],
    complete: 'Marla Quinn: Clean. The cops are chasing a ghost. $900 — you earned every cent of it.',
  },
  {
    id: 5,
    title: 'Payback',
    giver: 'Marla Quinn',
    brief: 'Four Reef Kings are holding the east docks. Put them down and the docks are ours again.',
    objective: 'Take down all 4 Reef Kings at the docks',
    reward: 1200,
    stages: 1,
    dialogue: [
      { who: 'Marla Quinn', text: 'Four Reef Kings are holding the east docks, and the docks are ours, Rico. Put them down. All four.' },
      { who: 'Rico Vane', text: 'Four guns against my one. Fair odds, by this city\u2019s standards.' },
      { who: 'Marla Quinn', text: 'Use cover. Shoot in bursts. And come back breathing — I need you for the bank.' },
    ],
    complete: 'Marla Quinn: The docks are ours again. $1,200. The Kings will think twice before they come back.',
  },
  {
    id: 6,
    title: 'The Big Score',
    giver: 'Marla Quinn',
    brief: 'The Costa Bank. In, out, and gone before the whole city wakes up. Then vanish to the safehouse.',
    objective: 'Rob the Costa Bank, then escape to the safehouse',
    reward: 2000,
    stages: 2,
    dialogue: [
      { who: 'Marla Quinn', text: 'The Costa Bank, Rico. In, out, and gone before the whole city wakes up. This is the one we retire on.' },
      { who: 'Rico Vane', text: 'Three years inside, Marla. I did not come back to go straight back in.' },
      { who: 'Marla Quinn', text: 'Then do not get caught. Vault, cash, safehouse. See you on the other side of rich.' },
    ],
    stageLine: 'Marla Quinn: The vault is open — grab the cash and run to the safehouse!',
    complete: 'Marla Quinn: The Big Score is done. Costa Fuego is yours, Rico. Every cent of it.',
  },
];

// Radio stations: synthesized stations the player can cycle with Q.
// v9 iteration 4: 88.5 COSTA FM (synthwave/latin) and 102.4 REEF BEATS
// (hip-hop/drill, slow low steps) join the old two, plus a RADIO OFF
// state — Q cycles five states. Each has its own note set and step
// length, so the music actually changes.
export const RADIO_STATIONS = [
  { name: '88.5 COSTA FM', notes: [220, 261.63, 329.63, 392, 311.13, 261.63, 196, 246.94], step: 0.42, bass: true },
  { name: '102.4 REEF BEATS', notes: [110, 110, 130.81, 98, 110, 164.81, 98, 110], step: 0.62, bass: true },
  { name: '92.1 NEON NIGHT', notes: [174.61, 220, 261.63, 220, 196, 174.61, 146.83, 196], step: 0.34, bass: true },
  { name: '97.3 PLAYA DUB', notes: [130.81, 164.81, 196, 164.81, 130.81, 98, 116.54, 146.83], step: 0.55, bass: true },
];

export const STORY_INTRO =
  'Three years inside. Costa Fuego forgot Rico Vane — but Marla Quinn did not. ' +
  'Her garage on Coral Row is the only door still open to him. Six jobs stand between ' +
  'Rico and a clean slate. The city is his again. The Reef Kings, the cops, and the bank ' +
  'are just in the way.';
