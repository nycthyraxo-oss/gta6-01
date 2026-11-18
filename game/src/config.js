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
    blockSize: 42,
    roadWidth: 14,
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
    maxHealth: 100,
    maxArmour: 100,
    armourOnJob: 20,
    repPerJob: 10,
    repPerPackage: 2,
    shootRange: 55,
    shootDamage: 34,
    shootCooldown: 0.22,
    enterCarRange: 4.5,
    respawnCost: 200,
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
  traffic: { count: 14, minGap: 9 },
  pedestrians: { count: 26, walkSpeed: 1.6, fleeSpeed: 4.2, fleeRadius: 18 },
  police: {
    sightRange: 55,
    respawnMin: 85,
    respawnMax: 115,
    arrestRange: 3.0,
    arrestTime: 2.0,
    ramDamage: 6,
    maxCars: 4,
    maxOfficers: 3,
    heatPerStar: 100,
    decayPerSecond: 9,
    stealHeat: 55,
    hitPedHeat: 40,
    hitCarHeat: 12,
    shootHeat: 25,
    roadblockStars: 3,
    heliStars: 4,
    heliHeight: 55,
    heliSpotRadius: 9,
    searchZoneBase: 60,
    searchZonePerStar: 15,
  },
  economy: {
    resprayCost: 150,
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
  // the city never floods with them.
  spawnCarCooldown: 3,
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
    // The game lives at golden hour: a slow day (30 min per day) that
    // starts at dusk, and the light code floors the dusk factor so the
    // sunset never slides back into noon mid-session.
    dayLength: 1800,
    startHour: 18.4,
    duskHour: 18.5,
  },
  // Traffic lights: one city-wide cycle, so every junction changes
  // together and the player can read the rhythm. Green 7 s, yellow 1.5 s,
  // then the other axis. The six junctions are the busiest crossings.
  lights: {
    greenSeconds: 7,
    yellowSeconds: 1.5,
    stopDistance: 12,
    junctions: [
      { x: 0, z: 0 },
      { x: -56, z: 0 },
      { x: 28, z: -28 },
      { x: 0, z: 56 },
      { x: -28, z: -84 },
      { x: 56, z: 28 },
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
  saveKey: 'costa-fuego.save.v3',
  palette: {
    skyDay: 0xff9a6b,
    skyDusk: 0xc2337f,
    skyTop: 0x2b1157,
    skyMid: 0xc2337f,
    skyLow: 0xff7a3c,
    fog: 0xd96a7a,
    fogNear: 120,
    fogFar: 480,
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

// Radio stations: three synthesized stations the player can cycle with Q.
// Each has its own note set and step length, so the music actually changes.
export const RADIO_STATIONS = [
  { name: '88.5 COSTA FM', notes: [220, 261.63, 329.63, 392, 329.63, 261.63, 196, 246.94], step: 0.42, bass: true },
  { name: '92.1 NEON NIGHT', notes: [174.61, 220, 261.63, 220, 196, 174.61, 146.83, 196], step: 0.34, bass: true },
  { name: '97.3 PLAYA DUB', notes: [130.81, 164.81, 196, 164.81, 130.81, 98, 116.54, 146.83], step: 0.55, bass: true },
];

export const STORY_INTRO =
  'Three years inside. Costa Fuego forgot Rico Vane — but Marla Quinn did not. ' +
  'Her garage on Coral Row is the only door still open to him. Six jobs stand between ' +
  'Rico and a clean slate. The city is his again. The Reef Kings, the cops, and the bank ' +
  'are just in the way.';
