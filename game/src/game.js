// Costa Fuego — the game itself: the renderer, the player on foot and by car,
// stealing, shooting, the wanted chase, missions, the camera, the save and
// the day cycle. One class, one loop, fixed 1/60 s steps.
//
// v6: the same game, with the new systems wired in — hidden packages worth
// $50 each, armour that soaks damage and recharges a little per job, a
// reputation count that grows with jobs and packages, vehicle condition
// that makes a battered car slower, a day counter on the clock, a
// helicopter spotlight with a pool of light on the ground, traffic lights
// that cycle over the junctions, mercado vendors at their stalls, and a
// title screen with New Game / Continue (with your progress on it) /
// Controls. The NPC AI — traffic and pedestrians — is v5, unchanged.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG, MISSION_DEFS, STORY_INTRO } from './config.js';
import { createRandom } from './random.js';
import { buildCity, districtAt } from './city.js';
import { createCar, spawnTrafficCar, updateTrafficCar, createSkids, randomCarColor, makeCarMesh, spinWheels, steerWheels, SPECS } from './vehicles.js';
import { makePersonMesh, spawnPedestrian, spawnVendor, updatePedestrian, spawnEnemy, updateEnemy } from './people.js';
import { createWanted, addHeat, setStars, ensurePolice, updatePolice, clearPolice, pursuers } from './police.js';
import { createMissions, startMission, updateMission, completeMission, failMission, currentMission, currentTarget, missionObjectiveText, stageLabel, missionProgress, nextMissionTitle, advanceDialogue, DIALOGUE_LINE_SECONDS } from './missions.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createInput, ACTION_ENTER, ACTION_SHOOT, ACTION_PAUSE, ACTION_MUTE, ACTION_RESTART, ACTION_CONFIRM, ACTION_MAP, ACTION_RADIO, ACTION_NIGHT, ACTION_SPAWN_CAR } from './input.js';
import { createPackages } from './packages.js';
import { updateLights, lightFor } from './trafficlights.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
// Neutral pitch of the follow camera (see state.camPitch init): the drag
// pitches around this value, so the default view is unchanged.
const CAM_PITCH_NEUTRAL = 0.32;

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_MAP = 'map';
export const SCREEN_JOB = 'job';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function createGame(canvas, seed) {
  const cfg = CONFIG;
  const rng = createRandom(seed);
  // preserveDrawingBuffer stays on only for ?shot= screenshot staging (the
  // capture reads the canvas buffer); normal play runs without it, which is
  // cheaper on the compositor.
  const shotMode = new URLSearchParams(window.location.search).has('shot');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: shotMode });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // v8 graphics: ACES tone mapping for a filmic dusk roll-off (the OutputPass
  // at the end of the composer applies it; the renderer itself does not
  // tone-map when rendering into the composer's targets).
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(cfg.palette.skyDusk);
  scene.fog = new THREE.Fog(cfg.palette.fog, cfg.palette.fogNear, cfg.palette.fogFar);
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

  // v8 graphics: post-processing chain — scene -> neon bloom -> ACES/sRGB
  // output. Bloom is deliberately modest (strength 0.35, threshold 0.85)
  // so only the bright neon, lamps and flashes glow; the dusk sky and the
  // HUD (DOM, untouched by the canvas chain) stay clean. The bloom pass
  // runs at half resolution to keep SwiftShader frame cost down.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2)),
    0.45, // strength
    0.4,  // radius
    0.85, // threshold
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  function renderFrame() { composer.render(); }

  // Sunset sky dome: a big inverted sphere shaded by height — violet top,
  // pink band, orange horizon. It never fogs, so the gradient stays clean
  // while the city itself fades into warm haze.
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(760, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(cfg.palette.skyTop) },
        mid: { value: new THREE.Color(cfg.palette.skyMid) },
        low: { value: new THREE.Color(cfg.palette.skyLow) },
      },
      vertexShader: 'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'varying vec3 vPos;',
        'uniform vec3 top; uniform vec3 mid; uniform vec3 low;',
        'void main() {',
        '  float h = clamp(vPos.y / 760.0, -0.08, 1.0);',
        '  vec3 c = h < 0.18 ? mix(low, mid, smoothstep(0.0, 0.18, h)) : mix(mid, top, smoothstep(0.18, 0.75, h));',
        '  gl_FragColor = vec4(c, 1.0);',
        '}',
      ].join('\n'),
    }),
  );
  scene.add(skyDome);

  // Low warm sun for long shadows, warm bounce, cool ground bounce.
  const sun = new THREE.DirectionalLight(cfg.palette.sun, 1.6);
  sun.position.set(60, 45, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); // 1024 px is enough for the dusk look and halves the shadow cost.
  sun.shadow.camera.left = -220;
  sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220;
  sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 600;
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0xffd9b0, 0.5);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xffb36b, 0x2e3550, 0.6);
  scene.add(hemi);

  const city = buildCity(scene, rng, cfg);
  const skids = createSkids(scene);
  const packages = createPackages(scene, rng);

  // The police searchlight: a spotlight that rides under the helicopter and
  // a translucent cone that shows the beam, plus a pool of light on the
  // ground where the beam lands. All three are dark until the heat hits
  // 4 stars and the heli comes for you — then the beam pins you, the pool
  // follows you, and the HUD says SPOTLIGHT ON YOU.
  const heliSpot = new THREE.SpotLight(0xfff6c8, 0, 220, 0.32, 0.5, 1.2);
  const heliTarget = new THREE.Object3D();
  scene.add(heliTarget);
  heliSpot.target = heliTarget;
  scene.add(heliSpot);
  const heliCone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 9, 55, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  heliCone.visible = false;
  scene.add(heliCone);
  const heliPool = new THREE.Mesh(
    new THREE.CircleGeometry(cfg.police.heliSpotRadius, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  heliPool.rotation.x = -Math.PI / 2;
  heliPool.position.y = 0.12;
  heliPool.visible = false;
  scene.add(heliPool);
  const audio = createAudio();
  const hud = createHud();
  const input = createInput(canvas);
  const wanted = createWanted(cfg);
  const missions = createMissions(city.landmarks);

  // The player: Rico Vane, teal jacket, dark jeans.
  const playerMesh = makePersonMesh(0x2a7a8c, 0x22262e, 0xc89878);
  scene.add(playerMesh);
  const player = {
    mesh: playerMesh,
    heading: 0,
    health: cfg.player.maxHealth,
    armour: 0,
    cash: 150,
    speed: 0,
    inCar: false,
    car: null,
    shootCooldown: 0,
    bob: 0,
    dead: false,
  };
  playerMesh.position.set(-112, 0, 60);

  // Mission beacon: a tall glowing pillar over the current target.
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  beacon.position.set(city.landmarks.garage.x, 30, city.landmarks.garage.z);
  scene.add(beacon);
  const beaconRing = new THREE.Mesh(
    new THREE.RingGeometry(3, 5, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
  );
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.position.set(city.landmarks.garage.x, 0.1, city.landmarks.garage.z);
  scene.add(beaconRing);

  // Traffic, parked cars and the orange coupe for mission 2.
  const traffic = [];
  for (let i = 0; i < cfg.traffic.count; i += 1) {
    traffic.push(spawnTrafficCar(scene, rng, cfg, city.roadLines, city.half));
  }
  const parked = [];
  function parkCar(x, z, heading, color) {
    const car = createCar(scene, x, z, heading, color, false, 0);
    car.parked = true;
    parked.push(car);
    return car;
  }
  parkCar(-100, 76, Math.PI / 2, 0xc23b2e);
  parkCar(28, -100, 0, 0x2e6fc2);
  parkCar(84, 44, Math.PI / 2, 0xe8c832);
  parkCar(-28, -84, Math.PI, 0x3aa655);
  parkCar(112, -28, Math.PI / 2, 0xd8d8d8);
  parkCar(-56, 112, 0, 0x22262c);
  parkCar(56, 100, Math.PI, 0x8a5fc2);
  const coupe = parkCar(city.landmarks.marina.x - 6, city.landmarks.marina.z, Math.PI / 2, 0xe07828);
  coupe.isTarget = true;

  // Pedestrians on the sidewalks, plus a vendor behind every mercado stall.
  const pedestrians = [];
  for (let i = 0; i < cfg.pedestrians.count; i += 1) {
    pedestrians.push(spawnPedestrian(scene, rng, cfg, city.blockCenters));
  }
  for (const stall of city.stallSpots) {
    pedestrians.push(spawnVendor(scene, rng, stall.vx, stall.vz, stall.vFacing));
  }

  const enemies = [];
  function spawnMissionEnemies() {
    const spots = [
      [132, 104], [144, 118], [126, 120], [140, 100],
    ];
    for (const [x, z] of spots) enemies.push(spawnEnemy(scene, x, z, rng));
    missions.enemiesLeft = enemies.length;
  }

  // Tracer bolts: thin glowing boxes, not 1 px lines — a 1 px line is
  // invisible in a screenshot, a bolt reads as a gunshot from any angle.
  // Pooled so shooting never allocates.
  const tracers = [];
  for (let i = 0; i < 8; i += 1) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.14, 1),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }),
    );
    m.visible = false;
    scene.add(m);
    tracers.push({ mesh: m, life: 0 });
  }
  let tracerNext = 0;
  const muzzle = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }),
  );
  muzzle.visible = false;
  scene.add(muzzle);
  // Impact burst: a hot glow held on the enemy the staged shot hits, so
  // the combat frame shows where the bolt lands instead of a bare line end.
  const impactGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffc23e }),
  );
  impactGlow.visible = false;
  scene.add(impactGlow);
  const particles = [];
  for (let i = 0; i < 40; i += 1) {
    const p = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.18, 0.18),
      new THREE.MeshBasicMaterial({ color: 0xffc860 }),
    );
    p.visible = false;
    scene.add(p);
    particles.push({ mesh: p, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  let particleNext = 0;

  // Tire smoke: grey puffs at the rear wheels on handbrake or on a hard
  // steer at speed (a drift). Visual juice only — they spawn at the
  // wheels and only move in step(), so a staged shot never sees them.
  const smoke = [];
  for (let i = 0; i < 24; i += 1) {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xbbbbbb, transparent: true, opacity: 0 }),
    );
    s.visible = false;
    scene.add(s);
    smoke.push({ mesh: s, life: 0 });
  }
  let smokeNext = 0;
  function puffSmoke(x, y, z) {
    const s = smoke[smokeNext];
    smokeNext = (smokeNext + 1) % smoke.length;
    s.mesh.position.set(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5);
    s.mesh.visible = true;
    s.mesh.scale.setScalar(0.7);
    s.mesh.material.opacity = 0.55;
    s.life = 0.7;
  }

  const state = {
    screen: SCREEN_TITLE,
    clockHour: cfg.time.startHour,
    day: 1,
    camYaw: 0,
    camPitch: CAM_PITCH_NEUTRAL,
    camFocus: null,
    shake: 0,
    autosaveTimer: 0,
    overReason: '',
    muted: false,
    time: 0,
    shotMode: false,
    resprayCooldown: 0,
    // Neon night (L): dusk is the default look; night is a toggle, never
    // a clock state, so staged shots always render the same dusk.
    nightMode: false,
    spawnCarCooldown: 0,
  };

  // Wanted stars on the previous step, for the evaded toast: the toast
  // fires only when the stars actually fall to zero from a pursuit.
  let prevStars = 0;
  // Cars the V key spawned (capped, oldest removed first).
  const spawnedCars = [];

  // One-shot presses are collected once per frame here and consumed by the
  // first fixed step, so pause/mute work even while the game is paused
  // (the step loop does not run then, and must never own the pause key).
  let pendingActions = 0;
  function takePendingActions() {
    const taken = pendingActions;
    pendingActions = 0;
    return taken;
  }

  function startFromTitle() {
    const save = loadSave();
    document.getElementById('screen-title').style.display = 'none';
    document.getElementById('screen-controls').style.display = 'none';
    startGame(!!save);
  }

  function handleFrameActions() {
    pendingActions |= input.takeActions();
    // Enter on the title screen starts the game: Continue when a save
    // exists, New Game when it does not. Keyboard-only players never need
    // the mouse to get into Costa Fuego.
    if (state.screen === SCREEN_TITLE) {
      if (pendingActions & ACTION_CONFIRM) {
        pendingActions &= ~ACTION_CONFIRM;
        startFromTitle();
      }
      pendingActions = 0;
      return;
    }
    // The city map (M) freezes the game while it is open, like a pause
    // screen with a map on it. M or Esc closes it; pause does nothing here.
    if (state.screen === SCREEN_MAP) {
      if (pendingActions & (ACTION_MAP | ACTION_PAUSE)) {
        pendingActions &= ~(ACTION_MAP | ACTION_PAUSE);
        document.getElementById('screen-map').style.display = 'none';
        document.getElementById('hud').style.display = 'block';
        state.screen = SCREEN_PLAY;
      }
      pendingActions = 0;
      return;
    }
    // The JOB COMPLETE screen is dismissed by its button only.
    if (state.screen === SCREEN_JOB) {
      pendingActions = 0;
      return;
    }
    if (pendingActions & ACTION_MAP) {
      pendingActions &= ~ACTION_MAP;
      if (state.screen === SCREEN_PLAY) {
        state.screen = SCREEN_MAP;
        const def = currentMission(missions);
        document.getElementById('map-job').textContent = def
          ? `${def.title.toUpperCase()} — ${missionObjectiveText(missions)}`
          : 'All jobs done — Costa Fuego is yours.';
        document.getElementById('screen-map').style.display = 'flex';
        // The map is the whole screen: the HUD behind it would ghost
        // through the translucent overlay, so it hides while the map is up.
        document.getElementById('hud').style.display = 'none';
        hud.drawBigMap(mapWorld());
      }
    }
    if (pendingActions & ACTION_RADIO) {
      pendingActions &= ~ACTION_RADIO;
      if (state.screen === SCREEN_PLAY) {
        const name = audio.nextStation();
        hud.showMessage(`♪ ${name}`, 2);
      }
    }
    // L: neon night. A toggle, not a clock state — dusk is the default,
    // night is the player's choice, and the staged shots always render
    // the same dusk because the toggle starts off.
    if (pendingActions & ACTION_NIGHT) {
      pendingActions &= ~ACTION_NIGHT;
      if (state.screen === SCREEN_PLAY) {
        state.nightMode = !state.nightMode;
        updateDaylight();
        hud.showMessage(state.nightMode ? 'Neon night — the city lights up' : 'Golden hour — dusk returns', 3);
      }
    }
    if (pendingActions & ACTION_PAUSE) {
      pendingActions &= ~ACTION_PAUSE;
      if (state.screen === SCREEN_PLAY) {
        state.screen = SCREEN_PAUSED;
        document.getElementById('screen-pause').style.display = 'flex';
      } else if (state.screen === SCREEN_PAUSED) {
        state.screen = SCREEN_PLAY;
        document.getElementById('screen-pause').style.display = 'none';
      }
    }
    if (pendingActions & ACTION_MUTE) {
      pendingActions &= ~ACTION_MUTE;
      state.muted = audio.toggleMute();
      hud.showMessage(state.muted ? 'Sound muted (N to unmute)' : 'Sound on', 2);
    }
  }

  function burst(x, y, z, n) {
    for (let i = 0; i < n; i += 1) {
      const p = particles[particleNext];
      particleNext = (particleNext + 1) % particles.length;
      p.mesh.position.set(x, y, z);
      p.mesh.visible = true;
      p.life = 0.5 + Math.random() * 0.4;
      p.vx = (Math.random() - 0.5) * 6;
      p.vy = Math.random() * 5 + 2;
      p.vz = (Math.random() - 0.5) * 6;
    }
  }

  function fireTracer(from, to) {
    // Staged shot: NO tracer beam at all. The user judged even the short
    // 2 m muzzle trail a Kamehameha beam, so the staged frame shows no
    // beam — the muzzle flash + 0.3 impact glow carry the gunfire.
    // Live play is untouched: full-length thin bolt as before.
    if (state.shotMode) return;
    const t = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % tracers.length;
    const len = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    t.mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    t.mesh.scale.set(1, 1, Math.max(0.1, len));
    t.mesh.lookAt(to.x, to.y, to.z);
    t.mesh.material.opacity = 0.95;
    t.mesh.visible = true;
    t.life = cfg.combat.tracerLife;
  }

  // In a staged shot the tracer must survive until the screenshot: the
  // render happens after staging, so a 0.09 s life would be long gone.
  // Holding the bolt open is a staging choice, not a gameplay change.
  function holdTracers() {
    for (const t of tracers) {
      if (t.mesh.visible) t.life = 30;
    }
  }

  function playerPos() {
    if (player.inCar && player.car) {
      return { x: player.car.group.position.x, z: player.car.group.position.z };
    }
    return { x: playerMesh.position.x, z: playerMesh.position.z };
  }

  function isOnRoad(x, z) {
    const half = cfg.world.roadWidth / 2 + 1.2;
    for (const c of city.roadLines) {
      if (Math.abs(x - c) < half || Math.abs(z - c) < half) return true;
    }
    return false;
  }

  function allCars() {
    const list = [...traffic, ...parked, ...wanted.policeCars, ...wanted.roadblocks];
    if (player.car) list.push(player.car);
    return list;
  }

  // The GPS route: from the player to the mission target along the road
  // grid — to the nearest road, along it, across on the next road, then to
  // the target. Every leg sits on a road line, so the gold line on the map
  // never cuts through a block.
  function computeGpsRoute(from, to) {
    if (!to) return null;
    const lines = city.roadLines;
    const near = (v) => lines.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
    const rx = near(from.x);
    const tz = near(to.z);
    const tx = near(to.x);
    const pts = [
      { x: from.x, z: from.z },
      { x: rx, z: from.z },
      { x: rx, z: tz },
      { x: tx, z: tz },
      { x: to.x, z: to.z },
    ];
    // Drop consecutive duplicates (straight road, no turn needed).
    return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.z !== pts[i - 1].z);
  }

  // Everything the minimap and the full city map need, in one place.
  function mapWorld() {
    const target = currentTarget(missions);
    const pp = playerPos();
    return {
      half: city.half,
      roadLines: city.roadLines,
      landmarks: city.landmarks,
      missionTarget: missions.state === 'active' ? target : null,
      gpsRoute: missions.state === 'active' ? computeGpsRoute(pp, target) : null,
      searchZone: wanted.searchZone,
      enemies,
      policeCars: wanted.policeCars,
      roadblocks: wanted.roadblocks,
      playerX: pp.x,
      playerZ: pp.z,
      playerHeading: player.inCar && player.car ? player.car.heading : player.heading,
      time: state.time,
    };
  }

  // Reputation: jobs done and packages found. It is a count of what Rico
  // has actually done in the city, not a bar to grind.
  function repPoints() {
    return missions.index * cfg.player.repPerJob + packages.count() * cfg.player.repPerPackage;
  }

  // Respray at Taller Marla: drive into the garage while wanted and the
  // car comes out a new colour with the heat gone. Cash pays, no questions.
  // A respray also fixes the car up: condition back to 100.
  function resprayCar(car) {
    const choices = SPECS.filter((s) => s.color !== car.color);
    const spec = choices[Math.floor(rng.next() * choices.length)];
    scene.remove(car.group);
    const mesh = makeCarMesh(spec.color, false);
    mesh.group.position.copy(car.group.position);
    mesh.group.rotation.y = car.heading;
    scene.add(mesh.group);
    car.group = mesh.group;
    car.wheels = mesh.wheels;
    car.driver = mesh.driver;
    car.lightBar = mesh.lightBar;
    car.driver.visible = true;
    car.color = spec.color;
    car.name = spec.name;
    car.wheelSpin = 0;
    car.condition = 100;
  }

  // A battered car is slower: condition 100 runs full speed, condition 0
  // runs at the floor (75%). The number on the HUD is honest about it.
  function carTopSpeed(car) {
    const c = clamp(car.condition ?? 100, 0, 100) / 100;
    return cfg.car.maxSpeed * (cfg.car.conditionMinSpeed + (1 - cfg.car.conditionMinSpeed) * c);
  }

  function damageCar(car, amount) {
    car.condition = Math.max(0, (car.condition ?? 100) - amount);
  }

  function nearestCar(maxDist) {
    const p = playerPos();
    let best = null;
    let bestD = maxDist;
    for (const car of allCars()) {
      if (car.isPolice) continue;
      const d = Math.hypot(car.group.position.x - p.x, car.group.position.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar(car) {
    const idx = traffic.indexOf(car);
    if (idx >= 0) traffic.splice(idx, 1);
    const pidx = parked.indexOf(car);
    if (pidx >= 0) parked.splice(pidx, 1);
    car.route = null;
    car.parked = false;
    car.isPlayer = true;
    car.speed = 0;
    car.driver.visible = true;
    player.inCar = true;
    player.car = car;
    playerMesh.visible = false;
    if (car.isTarget) addHeat(wanted, cfg.police.stealHeat);
    else addHeat(wanted, cfg.police.stealHeat * 0.6);
    audio.pickup();
    ensurePolice(wanted, scene, playerPos(), rng, { heading: car.heading, roadLines: city.roadLines });
  }

  function exitCar() {
    const car = player.car;
    if (!car) return;
    car.isPlayer = false;
    car.speed = 0;
    car.parked = true;
    car.driver.visible = false;
    parked.push(car);
    const side = car.group.position.clone();
    side.x += Math.cos(car.heading) * 2.5;
    side.z -= Math.sin(car.heading) * 2.5;
    playerMesh.position.set(side.x, 0, side.z);
    playerMesh.visible = true;
    player.heading = car.heading;
    player.inCar = false;
    player.car = null;
  }

  // V: spawn a fast car on the nearest road, a few metres ahead of the
  // player, facing along the road. A sandbox toy, demo-friendly: no heat,
  // no cost, just a car when you want one. Cooldown + cap so the city
  // never floods with them; the oldest spawned car is removed first.
  // The spot is walked along the road until it is clear of every
  // landmark building — the garage fronts onto Coral Row, so the first
  // candidate next to it would land inside the garage.
  function spawnPlayerCar() {
    if (player.inCar) {
      hud.showMessage('You are already driving.', 2);
      return;
    }
    if (state.spawnCarCooldown > 0) return;
    state.spawnCarCooldown = cfg.spawnCarCooldown;
    const pp = playerPos();
    let bestLine = city.roadLines[0];
    let bestAxis = 'x';
    let bestD = Infinity;
    for (const c of city.roadLines) {
      const dx = Math.abs(pp.x - c);
      const dz = Math.abs(pp.z - c);
      if (dx < bestD) { bestD = dx; bestLine = c; bestAxis = 'x'; }
      if (dz < bestD) { bestD = dz; bestLine = c; bestAxis = 'z'; }
    }
    const landmarks = Object.values(city.landmarks);
    const clearOfLandmarks = (x, z) => landmarks.every(
      (lm) => Math.hypot(lm.x - x, lm.z - z) > 16,
    );
    let spot = null;
    for (const off of [8, -8, 16, -16, 24, -24, 32, -32]) {
      const x = bestAxis === 'x' ? bestLine : clamp(pp.x + off, -145, 160);
      const z = bestAxis === 'x' ? clamp(pp.z + off, -145, 145) : bestLine;
      if (clearOfLandmarks(x, z)) {
        spot = { x, z, heading: bestAxis === 'x' ? 0 : Math.PI / 2 };
        break;
      }
    }
    if (!spot) {
      hud.showMessage('No clear road here — move a little and try again. (V)', 3);
      return;
    }
    if (spawnedCars.length >= cfg.spawnCarMax) {
      const old = spawnedCars.shift();
      const pidx = parked.indexOf(old);
      if (pidx >= 0) parked.splice(pidx, 1);
      scene.remove(old.group);
    }
    const specIdx = SPECS.findIndex((s) => s.name === 'Furia Sport');
    const spec = SPECS[specIdx >= 0 ? specIdx : 0];
    const car = createCar(scene, spot.x, spot.z, spot.heading, spec.color, false, specIdx >= 0 ? specIdx : 0);
    car.parked = true;
    car.driver.visible = false;
    parked.push(car);
    spawnedCars.push(car);
    hud.showMessage(`A ${spec.name} pulls up — yours for the taking. (E)`, 4);
    audio.pickup();
  }

  // One enemy hurt, by bullet or by barrel blast. Shared so a barrel
  // that finishes a Reef King counts exactly like a bullet that does.
  function hurtEnemy(e, dmg) {
    if (!e.alive) return;
    e.health -= dmg;
    if (e.health <= 0) {
      e.alive = false;
      e.group.visible = false;
      burst(e.group.position.x, 1.2, e.group.position.z, 12);
    }
  }

  // A red barrel going up: fireball, shake, a crash, and 50 damage to
  // every enemy within 6 m — 25 to Rico if he stands within 5 m. The
  // barrel is gone afterwards, so it cannot go off twice.
  function explodeBarrel(b) {
    b.alive = false;
    b.mesh.visible = false;
    burst(b.x, 1.2, b.z, 25);
    audio.crash();
    state.shake = Math.max(state.shake, 0.8);
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.group.position.x - b.x, e.group.position.z - b.z);
      if (d < 6) hurtEnemy(e, 50);
    }
    const pp = playerPos();
    if (Math.hypot(pp.x - b.x, pp.z - b.z) < 5) damagePlayer(25, 'blast');
  }

  function shoot() {
    if (player.shootCooldown > 0) return;
    player.shootCooldown = cfg.player.shootCooldown;
    const origin = player.inCar && player.car
      ? player.car.group.position.clone().setY(1.4)
      : playerMesh.position.clone().setY(1.5);
    const dir = { x: Math.sin(state.camYaw), z: Math.cos(state.camYaw) };
    const end = { x: origin.x + dir.x * cfg.player.shootRange, y: 1.2, z: origin.z + dir.z * cfg.player.shootRange };
    let hit = null;
    let hitDist = cfg.player.shootRange;
    // Enemies first.
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.group.position.x - origin.x;
      const dz = e.group.position.z - origin.z;
      const along = dx * dir.x + dz * dir.z;
      if (along < 0 || along > hitDist) continue;
      const perp = Math.abs(dx * dir.z - dz * dir.x);
      if (perp < 1.2) {
        hit = { kind: 'enemy', obj: e, dist: along };
        hitDist = along;
      }
    }
    // Then explosive barrels: a shot that reaches one sets it off. The
    // barrel blocks the shot like any solid object (hitDist), so a
    // pedestrian standing behind one is safe from the bullet — not from
    // the blast.
    if (!hit) {
      for (const b of city.barrels) {
        if (!b.alive) continue;
        const dx = b.x - origin.x;
        const dz = b.z - origin.z;
        const along = dx * dir.x + dz * dir.z;
        if (along < 0 || along > hitDist) continue;
        const perp = Math.abs(dx * dir.z - dz * dir.x);
        if (perp < 1.2) {
          hit = { kind: 'barrel', obj: b, dist: along };
          hitDist = along;
        }
      }
    }
    // Then pedestrians (shooting one is a crime, and they flee).
    if (!hit) {
      for (const p of pedestrians) {
        const dx = p.group.position.x - origin.x;
        const dz = p.group.position.z - origin.z;
        const along = dx * dir.x + dz * dir.z;
        if (along < 0 || along > hitDist) continue;
        const perp = Math.abs(dx * dir.z - dz * dir.x);
        if (perp < 1.2) {
          hit = { kind: 'ped', obj: p, dist: along };
          hitDist = along;
        }
      }
    }
    if (hit) {
      end.x = origin.x + dir.x * hit.dist;
      end.z = origin.z + dir.z * hit.dist;
      end.y = 1.2;
      burst(end.x, 1.2, end.z, 8);
      if (hit.kind === 'enemy') {
        hurtEnemy(hit.obj, cfg.player.shootDamage);
      } else if (hit.kind === 'barrel') {
        explodeBarrel(hit.obj);
      } else {
        const idx = pedestrians.indexOf(hit.obj);
        if (idx >= 0) {
          scene.remove(hit.obj.group);
          pedestrians.splice(idx, 1);
        }
        addHeat(wanted, cfg.police.hitPedHeat);
      }
    } else {
      burst(end.x, 1.2, end.z, 3);
    }
    fireTracer(origin, end);
    muzzle.position.set(origin.x + dir.x * 1.2, 1.5, origin.z + dir.z * 1.2);
    // A staged flash is blown up so it registers at frame distance; live
    // play keeps the small flash (the scale is set here on every shot).
    muzzle.scale.setScalar(state.shotMode ? 0.8 : 1);
    muzzle.visible = true;
    // In a staged shot the flash must still be lit at render time; in live
    // play it blinks out after 60 ms as before.
    if (!state.shotMode) setTimeout(() => { muzzle.visible = false; }, 60);
    audio.gunshot();
    addHeat(wanted, cfg.police.shootHeat);
    for (const p of pedestrians) {
      updatePedestrian(p, 0, cfg, { x: origin.x, z: origin.z });
    }
    ensurePolice(wanted, scene, playerPos(), rng, { heading: state.camYaw, roadLines: city.roadLines });
  }

  function showJobComplete(def, reward, elapsed, maxStars) {
    const mm = Math.floor(elapsed / 60);
    const ss = Math.floor(elapsed % 60);
    document.getElementById('job-title').textContent = `JOB COMPLETE — ${def.title.toUpperCase()}`;
    document.getElementById('job-payout').textContent = `+$${reward.toLocaleString('en-US')}`;
    document.getElementById('job-stats').textContent =
      `Time ${mm}:${String(ss).padStart(2, '0')}  ·  Peak heat ${'★'.repeat(maxStars)}${'☆'.repeat(5 - maxStars)}  ·  Cash $${Math.round(player.cash).toLocaleString('en-US')}`;
    const chapters = MISSION_DEFS.map((d, i) => {
      const cls = i < missions.index ? 'done' : i === missions.index ? 'now' : 'locked';
      const mark = i < missions.index ? '✓' : i === missions.index ? '▶' : '·';
      return `<div class="${cls}">${mark} CH.${d.id} ${d.title} — $${d.reward}</div>`;
    }).join('');
    document.getElementById('job-chapters').innerHTML = chapters;
    document.getElementById('screen-job').style.display = 'flex';
    state.screen = SCREEN_JOB;
    // The closing line plays in the dialogue bar when play resumes.
    if (def.complete) {
      missions.currentLine = { who: def.giver, text: def.complete.replace(/^Marla Quinn: /, '') };
      missions.dialogueTimer = DIALOGUE_LINE_SECONDS;
      missions.dialogueQueue = [];
    }
  }

  function continueAfterJob() {
    document.getElementById('screen-job').style.display = 'none';
    state.screen = SCREEN_PLAY;
    if (missions.index < MISSION_DEFS.length) {
      startMission(missions, missions.index, cfg);
      if (missions.index === 3) setStars(wanted, 3);
      if (missions.index === 4) spawnMissionEnemies();
      hud.showMessage(missions.message, 7);
    } else {
      hud.showMessage('The Big Score is done. Costa Fuego is yours, Rico.', 7);
    }
  }

  function showOver() {
    document.getElementById('over-title').textContent = state.overReason.includes('BUSTED') ? 'BUSTED' : 'WASTED';
    document.getElementById('over-text').textContent = state.overReason;
    document.getElementById('screen-over').style.display = 'flex';
  }

  // Armour soaks 60% of every hit while it lasts; the rest goes to health.
  // A job done well earns a little armour back — Marla looks after her own.
  function damagePlayer(amount, cause) {
    if (player.dead) return;
    let rest = amount;
    if (player.armour > 0) {
      const soaked = Math.min(player.armour, amount * 0.6);
      player.armour -= soaked;
      rest = amount - soaked;
    }
    player.health -= rest;
    state.shake = Math.min(1, state.shake + 0.5);
    if (player.health <= 0) {
      player.health = 0;
      player.dead = true;
      state.overReason = cause === 'arrest' ? 'BUSTED — the Costa PD took you in.' : 'WASTED — Rico went down in Costa Fuego.';
      state.screen = SCREEN_OVER;
      audio.fail();
      showOver();
      saveGame();
    }
  }

  function respawn() {
    player.health = cfg.player.maxHealth;
    player.dead = false;
    player.cash = Math.max(0, player.cash - cfg.player.respawnCost);
    clearPolice(wanted, scene);
    prevStars = 0; // no "evaded" toast for waking up at the hospital.
    if (player.inCar) {
      const car = player.car;
      car.isPlayer = false;
      car.parked = true;
      parked.push(car);
      player.car = null;
      player.inCar = false;
    }
    playerMesh.visible = true;
    playerMesh.position.set(city.landmarks.hospital.x, 0, city.landmarks.hospital.z + 12);
    player.heading = Math.PI;
    state.camYaw = Math.PI;
    state.camFocus = null; // snap the camera to the hospital on the next frame.
    missions.state = 'idle';
    missions.stage = 0;
    missions.timer = 0;
    if (missions.index < MISSION_DEFS.length) {
      startMission(missions, missions.index, cfg);
      if (missions.index === 3) setStars(wanted, 3);
      if (missions.index === 4) spawnMissionEnemies();
    }
    state.screen = SCREEN_PLAY;
    hud.showMessage('You woke up at Costa General. -$200. Marla is waiting.', 6);
    saveGame();
  }

  function saveGame() {
    try {
      const p = playerPos();
      const data = {
        cash: Math.round(player.cash),
        missionIndex: missions.index,
        x: p.x,
        z: p.z,
        heading: player.heading,
        clockHour: state.clockHour,
        day: state.day,
        health: Math.round(player.health),
        armour: Math.round(player.armour),
        packages: packages.takenIndices(),
      };
      window.localStorage.setItem(cfg.saveKey, JSON.stringify(data));
    } catch {
      // Storage can be off: the save then lasts this visit only.
    }
  }

  function loadSave() {
    try {
      const raw = window.localStorage.getItem(cfg.saveKey);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function applySave(data) {
    player.cash = data.cash ?? 150;
    player.health = data.health ?? cfg.player.maxHealth;
    player.armour = data.armour ?? 0;
    state.clockHour = data.clockHour ?? cfg.time.startHour;
    state.day = data.day ?? 1;
    playerMesh.position.set(data.x ?? -112, 0, data.z ?? 60);
    player.heading = data.heading ?? 0;
    state.camYaw = player.heading;
    missions.index = Math.min(data.missionIndex ?? 0, MISSION_DEFS.length - 1);
    if (Array.isArray(data.packages)) packages.restore(data.packages);
  }

  // One line of save summary for the title screen's Continue button, so
  // the player sees where they left off before they press anything.
  function saveSummary(data) {
    if (!data) return '';
    const def = MISSION_DEFS[Math.min(data.missionIndex ?? 0, MISSION_DEFS.length - 1)];
    const rep = (data.missionIndex ?? 0) * cfg.player.repPerJob
      + (Array.isArray(data.packages) ? data.packages.length : 0) * cfg.player.repPerPackage;
    return `CH.${def.id} ${def.title.toUpperCase()} · $${Math.round(data.cash ?? 150)} · REP ${rep} · DAY ${data.day ?? 1}`;
  }

  function startGame(fromSave) {
    const save = fromSave ? loadSave() : null;
    prevStars = 0;
    if (save) applySave(save);
    else {
      player.cash = 150;
      player.health = cfg.player.maxHealth;
      player.armour = 0;
      state.clockHour = cfg.time.startHour;
      state.day = 1;
      playerMesh.position.set(-112, 0, 60);
      player.heading = 0;
      state.camYaw = 0;
      missions.index = 0;
      packages.restore([]);
    }
    missions.state = 'idle';
    missions.stage = 0;
    missions.timer = 0;
    player.dead = false;
    state.screen = SCREEN_PLAY;
    audio.unlock();
    startMission(missions, missions.index, cfg);
    if (missions.index === 3) setStars(wanted, 3);
    if (missions.index === 4) spawnMissionEnemies();
    hud.showMessage(missions.message, 7);
    saveGame();
  }

  function updateDaylight() {
    const night = cfg.night;
    if (state.nightMode) {
      // Neon night: a dark sky, a moon-cold sun, the lamps all the way up.
      // The lit windows read brighter by contrast; the beacon, the heli
      // spot and the fountain keep their own glow.
      scene.background = new THREE.Color(night.fog);
      scene.fog.color.setHex(night.fog);
      skyDome.material.uniforms.top.value.setHex(night.skyTop);
      skyDome.material.uniforms.mid.value.setHex(night.skyMid);
      skyDome.material.uniforms.low.value.setHex(night.skyLow);
      sun.intensity = night.sunIntensity;
      sun.color.setHex(night.sun);
      sun.position.set(60, 120, 60);
      hemi.intensity = night.hemiIntensity;
      ambient.intensity = night.ambientIntensity;
      for (const l of city.streetlights) l.intensity = night.streetlight;
      return;
    }
    const h = state.clockHour;
    // Golden hour is the whole look: the dusk factor never drops below
    // 0.75, so the sun stays low, the shadows stay long, and the street
    // lamps stay lit no matter how long the session runs.
    const dusk = Math.max(0.75, clamp((h - 16) / 3, 0, 1));
    const day = new THREE.Color(cfg.palette.skyDay);
    const duskCol = new THREE.Color(cfg.palette.skyDusk);
    day.lerp(duskCol, dusk * 0.85);
    scene.background = day;
    scene.fog.color.setHex(cfg.palette.fog);
    skyDome.material.uniforms.top.value.setHex(cfg.palette.skyTop);
    skyDome.material.uniforms.mid.value.setHex(cfg.palette.skyMid);
    skyDome.material.uniforms.low.value.setHex(cfg.palette.skyLow);
    sun.intensity = 2.2 - dusk * 0.7;
    sun.position.set(120 - dusk * 60, 180 - dusk * 135, 60);
    sun.color.setHex(0xffb27a);
    hemi.intensity = 0.6 - dusk * 0.15;
    ambient.intensity = 0.5;
    // The beachfront lamps glow with the dusk.
    for (const l of city.streetlights) l.intensity = 4 + dusk * 10;
  }

  // The police heli: skyline decoration at low heat, a real pursuit system
  // at 4 stars. Then it leaves its wide circle, comes to hover over the
  // player and pins them in its searchlight — and while the beam is on you
  // the heat does not cool (wanted.heliOverhead). The pool of light on the
  // ground shows exactly where the beam lands.
  function updateHeli(dt) {
    const pp = playerPos();
    city.heli.userData.rotor.rotation.y += dt * 18;
    if (wanted.heliActive) {
      const a = state.time * 0.12;
      const tx = pp.x + Math.cos(a) * 22;
      const tz = pp.z + Math.sin(a) * 22;
      const ty = cfg.police.heliHeight;
      const hx = city.heli.position.x + (tx - city.heli.position.x) * Math.min(1, dt * 1.2);
      const hz = city.heli.position.z + (tz - city.heli.position.z) * Math.min(1, dt * 1.2);
      const hy = city.heli.position.y + (ty - city.heli.position.y) * Math.min(1, dt * 1.2);
      city.heli.position.set(hx, hy, hz);
      city.heli.rotation.y = Math.atan2(pp.x - hx, pp.z - hz);
      heliSpot.position.set(hx, hy - 1, hz);
      heliTarget.position.set(pp.x, 0, pp.z);
      heliSpot.intensity = 1200;
      heliCone.visible = true;
      heliCone.position.set(hx, hy - 27.5, hz);
      const flat = Math.hypot(pp.x - hx, pp.z - hz);
      wanted.heliOverhead = flat < 45;
      heliPool.visible = wanted.heliOverhead;
      if (wanted.heliOverhead) {
        heliPool.position.set(pp.x, 0.12, pp.z);
      }
    } else {
      const a = state.time * 0.05;
      city.heli.position.set(Math.cos(a) * 120, 64, Math.sin(a) * 120);
      city.heli.rotation.y = -a;
      heliSpot.intensity = 0;
      heliCone.visible = false;
      heliPool.visible = false;
      wanted.heliOverhead = false;
    }
  }

  // Traffic-light lamps: one colour change per junction per axis. Bright
  // means lit, dim means dark. The cycle is game time, so a staged shot
  // always shows the same lamps.
  function updateLightHeads() {
    const ns = lightFor('z');
    const ew = lightFor('x');
    const on = { red: 0xff2222, yellow: 0xffd23e, green: 0x22ff44 };
    const off = { red: 0x661111, yellow: 0x554411, green: 0x114422 };
    for (const head of city.lightHeads) {
      head.mats.ns.red.color.setHex(ns === 'red' ? on.red : off.red);
      head.mats.ns.yellow.color.setHex(ns === 'yellow' ? on.yellow : off.yellow);
      head.mats.ns.green.color.setHex(ns === 'green' ? on.green : off.green);
      head.mats.ew.red.color.setHex(ew === 'red' ? on.red : off.red);
      head.mats.ew.yellow.color.setHex(ew === 'yellow' ? on.yellow : off.yellow);
      head.mats.ew.green.color.setHex(ew === 'green' ? on.green : off.green);
    }
  }

  // Everything the HUD needs, in one place, so the live loop and the
  // screenshot staging can never drift apart.
  function hudPayload() {
    const def = currentMission(missions);
    const target = currentTarget(missions);
    const pp = playerPos();
    let objective = missionObjectiveText(missions);
    if (missions.timer > 0) objective += `  ⏱ ${Math.ceil(missions.timer)}s`;
    if (!def) objective = 'All jobs done — Costa Fuego is yours.';
    // The dialogue bar shows the live conversation line, not the briefing:
    // Marla and Rico trade lines while the mission runs.
    const line = missions.currentLine;
    return {
      health: player.health,
      armour: player.armour,
      rep: repPoints(),
      cash: player.cash,
      stars: wanted.stars,
      speed: player.inCar && player.car ? Math.abs(player.car.speed) : 0,
      inCar: player.inCar,
      objective,
      clockHour: state.clockHour,
      day: state.day,
      chapter: def ? `CH.${def.id} ${def.title.toUpperCase()}` : 'ALL DONE',
      stage: def ? stageLabel(missions) : '',
      progress: missionProgress(missions, pp),
      nextMission: nextMissionTitle(missions),
      targetDist: target && missions.state === 'active' ? Math.hypot(target.x - pp.x, target.z - pp.z) : null,
      carName: player.inCar && player.car ? (player.car.name || 'Cometa GT') : '',
      gear: player.inCar && player.car ? `D${1 + Math.min(5, Math.floor((Math.abs(player.car.speed) / cfg.car.maxSpeed) * 6))}` : '',
      condition: player.inCar && player.car ? player.car.condition : null,
      district: districtAt(pp.x, pp.z).name,
      dialogueSpeaker: line ? line.who.toUpperCase() : '',
      dialogueText: line ? line.text : '',
      radio: audio.stationName(),
      crosshair: !player.inCar && state.screen === SCREEN_PLAY,
      pursuers: wanted.stars > 0 ? pursuers(wanted, pp) : [],
      spotlight: wanted.heliOverhead,
      packages: packages.count(),
      packagesTotal: cfg.packages.count,
    };
  }

  // Stable follow camera. The old version ran once per physics step (up to
  // 3x per rendered frame) and lerped the camera position toward the player
  // while lookAt aimed at the RAW player position: position lagged, aim did
  // not, so the view swung and vibrated with every WASD step and the camera
  // kept gliding after the player stopped — it felt like the camera itself
  // was walking. Now the camera runs once per rendered frame (from frame(),
  // not step()) and both position and aim derive from one damped focus
  // point, so they move together and the view stays steady; only the
  // character moves. Camera yaw never follows the player heading on foot —
  // only the drag turns it — and in a car it trails the car heading very
  // slowly (see step()).
  function updateCamera(dt, snap) {
    const target = playerPos();
    if (!state.camFocus || snap) {
      state.camFocus = { x: target.x, z: target.z };
    }
    // Frame-rate independent damping: ~0.1 s time constant, fast enough to
    // track a sprint, slow enough to swallow step-to-step jitter.
    const k = snap ? 1 : 1 - Math.exp(-dt * 6);
    state.camFocus.x += (target.x - state.camFocus.x) * k;
    state.camFocus.z += (target.z - state.camFocus.z) * k;
    const fx = state.camFocus.x;
    const fz = state.camFocus.z;
    const dist = player.inCar ? cfg.camera.carDistance : cfg.camera.footDistance;
    const height = player.inCar ? cfg.camera.carHeight : cfg.camera.footHeight;
    // Pitch drag was stored but never applied: it raises/lowers the camera
    // around the neutral pitch, so the default view is unchanged.
    const ty = height + Math.sin(state.camPitch - CAM_PITCH_NEUTRAL) * dist * 0.6;
    const tx = fx - Math.sin(state.camYaw) * dist;
    const tz = fz - Math.cos(state.camYaw) * dist;
    camera.position.set(tx, ty, tz);
    // Impact shake only (crashes, rams): random per frame, never while
    // walking — there is no bob or shake on the camera in normal play.
    if (state.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * state.shake * 0.5;
      camera.position.y += (Math.random() - 0.5) * state.shake * 0.3;
      state.shake = Math.max(0, state.shake - dt * 2.5);
    }
    camera.lookAt(fx + Math.sin(state.camYaw) * 3, 1.4, fz + Math.cos(state.camYaw) * 3);
  }

  function step(dt) {
    state.time += dt;
    state.clockHour += (dt / cfg.time.dayLength) * 24;
    if (state.clockHour >= 24) {
      state.clockHour -= 24;
      state.day += 1;
    }
    player.shootCooldown = Math.max(0, player.shootCooldown - dt);
    state.resprayCooldown = Math.max(0, state.resprayCooldown - dt);
    state.spawnCarCooldown = Math.max(0, state.spawnCarCooldown - dt);
    updateLights(dt);

    // Camera drag.
    const drag = input.takeDrag();
    state.camYaw -= drag.x * cfg.camera.lookSpeed;
    state.camPitch = clamp(state.camPitch + drag.y * 0.002, cfg.camera.pitchMin, cfg.camera.pitchMax);

    const actions = takePendingActions();
    if (actions & ACTION_RESTART) {
      if (missions.state !== 'idle' || missions.index < MISSION_DEFS.length) {
        failMission(missions);
        startMission(missions, missions.index, cfg);
        hud.showMessage(`Restarted: ${currentMission(missions).title}`, 4);
      }
    }
    if (state.screen !== SCREEN_PLAY) return;

    if (actions & ACTION_CONFIRM) audio.unlock();
    if (actions & ACTION_ENTER) {
      if (player.inCar) exitCar();
      else {
        const car = nearestCar(cfg.player.enterCarRange);
        if (car) enterCar(car);
      }
    }
    if (actions & ACTION_SHOOT) shoot();
    if (actions & ACTION_SPAWN_CAR) spawnPlayerCar();

    const p = playerPos();
    if (player.inCar && player.car) {
      const car = player.car;
      const top = carTopSpeed(car);
      const fwd = input.forward() ? 1 : input.back() ? -1 : 0;
      const steer = (input.left() ? 1 : 0) - (input.right() ? 1 : 0);
      if (fwd > 0) car.speed += cfg.car.accel * dt * (input.run() ? 1.35 : 1);
      else if (fwd < 0) {
        if (car.speed > 0.5) car.speed -= cfg.car.brake * dt;
        else car.speed -= cfg.car.reverseAccel * dt;
      } else {
        car.speed -= Math.sign(car.speed) * cfg.car.grip * dt * 0.6;
        if (Math.abs(car.speed) < 0.3) car.speed = 0;
      }
      if (input.brake()) {
        car.speed -= Math.sign(car.speed) * cfg.car.brake * dt;
        if (Math.abs(car.speed) < 0.5) car.speed = 0;
      }
      car.speed = clamp(car.speed, -cfg.car.maxReverse, top);
      if (!Number.isFinite(car.speed)) car.speed = 0;
      const prevX = car.group.position.x;
      const prevZ = car.group.position.z;
      car.heading += steer * cfg.car.steer * dt * clamp(Math.abs(car.speed) / 8, 0, 1) * Math.sign(car.speed || 1);
      car.group.rotation.y = car.heading;
      car.group.position.x += Math.sin(car.heading) * car.speed * dt;
      car.group.position.z += Math.cos(car.heading) * car.speed * dt;
      if (!isOnRoad(car.group.position.x, car.group.position.z)) {
        car.group.position.x = prevX;
        car.group.position.z = prevZ;
        car.speed *= 0.4;
      }
      car.wheelSpin += car.speed * dt * 2;
      spinWheels(car);
      steerWheels(car, steer * 0.35);
      // Very slow trail: the camera holds its angle while the car turns
      // instead of swinging around with every steering input.
      state.camYaw = lerpAngle(state.camYaw, car.heading, Math.min(1, dt * 0.5));
      if (input.brake() && Math.abs(car.speed) > 6) {
        skids.add(car.group.position.x - Math.sin(car.heading) * 1.5, car.group.position.z - Math.cos(car.heading) * 1.5, car.heading);
      }
      // Tire smoke on handbrake, or on a hard steer at speed (a drift):
      // one puff per rear wheel per step, rising and fading.
      const drifting = Math.abs(steer) > 0 && Math.abs(car.speed) > 20;
      if ((input.brake() && Math.abs(car.speed) > 6) || drifting) {
        const bx = car.group.position.x - Math.sin(car.heading) * 1.5;
        const bz = car.group.position.z - Math.cos(car.heading) * 1.5;
        const rx = Math.cos(car.heading);
        const rz = -Math.sin(car.heading);
        puffSmoke(bx + rx * 0.8, 0.4, bz + rz * 0.8);
        puffSmoke(bx - rx * 0.8, 0.4, bz - rz * 0.8);
      }
      // Running over pedestrians and ramming traffic.
      for (let i = pedestrians.length - 1; i >= 0; i -= 1) {
        const ped = pedestrians[i];
        const d = Math.hypot(ped.group.position.x - car.group.position.x, ped.group.position.z - car.group.position.z);
        if (d < 2.2 && Math.abs(car.speed) > 3) {
          scene.remove(ped.group);
          pedestrians.splice(i, 1);
          addHeat(wanted, cfg.police.hitPedHeat);
          audio.crash();
          state.shake = 0.6;
          car.speed *= 0.7;
        }
      }
      for (const other of [...traffic, ...parked, ...wanted.roadblocks]) {
        const d = Math.hypot(other.group.position.x - car.group.position.x, other.group.position.z - car.group.position.z);
        if (d < 3.4 && Math.abs(car.speed) > 4) {
          addHeat(wanted, cfg.police.hitCarHeat);
          audio.crash();
          state.shake = 0.5;
          car.speed *= 0.5;
          other.speed = 0;
          damageCar(car, 8);
        }
      }
      audio.setEngine(Math.abs(car.speed) / cfg.car.maxSpeed, true);
      // Respray at Taller Marla: drive into the garage while wanted and
      // the car comes out a new colour with the heat gone — $150.
      const garage = city.landmarks.garage;
      const gd = Math.hypot(car.group.position.x - garage.x, car.group.position.z - garage.z);
      if (gd < 13 && wanted.stars > 0 && player.cash >= cfg.economy.resprayCost && state.resprayCooldown <= 0) {
        state.resprayCooldown = 5;
        player.cash -= cfg.economy.resprayCost;
        resprayCar(car);
        clearPolice(wanted, scene);
        audio.missionDone();
        hud.showMessage(`Respray at Taller Marla — $${cfg.economy.resprayCost}. New paint, no heat.`, 5);
      }
    } else {
      // On foot.
      const run = input.run();
      const speed = run ? cfg.player.runSpeed : cfg.player.walkSpeed;
      let mx = 0;
      let mz = 0;
      if (input.forward()) { mx += Math.sin(state.camYaw); mz += Math.cos(state.camYaw); }
      if (input.back()) { mx -= Math.sin(state.camYaw); mz -= Math.cos(state.camYaw); }
      if (input.left()) { mx -= Math.cos(state.camYaw); mz += Math.sin(state.camYaw); }
      if (input.right()) { mx += Math.cos(state.camYaw); mz -= Math.sin(state.camYaw); }
      const len = Math.hypot(mx, mz);
      if (len > 0) {
        mx /= len;
        mz /= len;
        playerMesh.position.x += mx * speed * dt;
        playerMesh.position.z += mz * speed * dt;
        player.heading = Math.atan2(mx, mz);
        playerMesh.rotation.y = player.heading;
        player.bob += dt * (run ? 14 : 9);
        playerMesh.position.y = Math.abs(Math.sin(player.bob)) * 0.07;
      } else {
        playerMesh.position.y = 0;
      }
      playerMesh.position.x = clamp(playerMesh.position.x, -150, 165);
      playerMesh.position.z = clamp(playerMesh.position.z, -150, 150);
      audio.setEngine(0, false);
    }

    // Hidden packages: walk over one and it pays on the spot.
    const pp0 = playerPos();
    const found = packages.collect(pp0.x, pp0.z);
    if (found > 0) {
      player.cash += found;
      audio.packageFound();
      hud.showMessage(`Hidden package found — +$${found}! (${packages.count()}/${cfg.packages.count})`, 4);
      saveGame();
    }

    // Traffic, pedestrians, enemies.
    for (const car of traffic) updateTrafficCar(car, dt, allCars(), cfg, pedestrians);
    // Gunfire and a speeding car both scatter the crowd; pedestrians stay
    // on the sidewalks unless they are fleeing.
    const gunshot = player.shootCooldown > cfg.player.shootCooldown - 0.1 ? playerPos() : null;
    const threat = gunshot
      || (player.inCar && player.car && Math.abs(player.car.speed) > 8 ? playerPos() : null);
    for (const ped of pedestrians) updatePedestrian(ped, dt, cfg, threat, isOnRoad);
    const pp = playerPos();
    for (const e of enemies) {
      updateEnemy(e, dt, cfg, pp, (enemy) => {
        const from = enemy.group.position.clone().setY(1.4);
        const to = { x: pp.x, y: 1.3, z: pp.z };
        fireTracer(from, to);
        damagePlayer(cfg.combat.enemyDamage, 'shot');
      });
    }

    // Wanted + police.
    advanceDialogue(missions, dt);
    missions.maxStars = Math.max(missions.maxStars, wanted.stars);
    ensurePolice(wanted, scene, pp, rng, {
      heading: player.inCar && player.car ? player.car.heading : player.heading,
      roadLines: city.roadLines,
    });
    updatePolice(wanted, dt, scene, pp, player.inCar, (car) => {
      if (player.inCar && player.car) {
        player.car.speed *= 0.6;
        damageCar(player.car, 6);
        audio.crash();
        state.shake = 0.5;
      } else {
        damagePlayer(cfg.police.ramDamage, 'ram');
      }
    }, () => damagePlayer(999, 'arrest'), rng);
    // Escaped: the stars fell to zero from a real pursuit. Say so, and
    // give the player a short cooldown before the heat can rise again.
    if (prevStars > 0 && wanted.stars === 0) {
      hud.showMessage('★ Wanted Level Evaded! ★', 4);
      wanted.cooldown = cfg.evadeCooldown;
      audio.missionDone();
    }
    prevStars = wanted.stars;
    audio.setSiren(wanted.sirenOn, state.time);
    audio.music(dt);

    // Missions.
    const aliveEnemies = enemies.filter((e) => e.alive).length;
    const inTargetCar = !!(player.inCar && player.car && player.car.isTarget);
    const result = updateMission(missions, dt, pp, player.inCar, inTargetCar, aliveEnemies);
    if (result === 'stage') {
      hud.showMessage(missions.message, 5);
      audio.pickup();
    } else if (result === 'complete') {
      const finishedDef = currentMission(missions);
      const finishedElapsed = missions.elapsed;
      const finishedStars = missions.maxStars;
      const reward = completeMission(missions);
      player.cash += reward;
      player.armour = Math.min(cfg.player.maxArmour, player.armour + cfg.player.armourOnJob);
      audio.missionDone();
      saveGame();
      showJobComplete(finishedDef, reward, finishedElapsed, finishedStars);
    } else if (result === 'fail') {
      hud.showMessage(missions.message, 5);
      audio.fail();
      failMission(missions);
    }

    // Beacon follows the current target.
    const target = currentTarget(missions);
    if (target && missions.state === 'active') {
      beacon.position.set(target.x, 30, target.z);
      beaconRing.position.set(target.x, 0.1, target.z);
      beacon.visible = true;
      beaconRing.visible = true;
      beaconRing.scale.setScalar(1 + 0.25 * Math.sin(state.time * 3));
    } else {
      beacon.visible = false;
      beaconRing.visible = false;
    }

    // Tracers and particles fade.
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.mesh.material.opacity = Math.max(0, t.life / cfg.combat.tracerLife);
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    for (const pt of particles) {
      if (pt.life > 0) {
        pt.life -= dt;
        pt.mesh.position.x += pt.vx * dt;
        pt.mesh.position.y += pt.vy * dt;
        pt.mesh.position.z += pt.vz * dt;
        pt.vy -= 12 * dt;
        if (pt.life <= 0 || pt.mesh.position.y < 0) pt.mesh.visible = false;
      }
    }
    for (const s of smoke) {
      if (s.life > 0) {
        s.life -= dt;
        s.mesh.position.y += dt * 1.2;
        s.mesh.scale.multiplyScalar(1 + dt * 2);
        s.mesh.material.opacity = Math.max(0, (s.life / 0.7) * 0.55);
        if (s.life <= 0) s.mesh.visible = false;
      }
    }

    updateDaylight();
    updateHeli(dt);
    updateLightHeads();
    // The camera is NOT updated here any more: it runs once per rendered
    // frame in frame(), after the steps (see updateCamera).

    // HUD is drawn once per rendered frame in frame(), not per physics
    // step: redrawing the DOM HUD + minimap canvas on every step (up to
    // 15x per frame) was the spiral of death that froze the game once
    // play started.

    state.autosaveTimer += dt;
    if (state.autosaveTimer > 10) {
      state.autosaveTimer = 0;
      saveGame();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleFrameActions();
    if (state.screen === SCREEN_PLAY) {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 3) {
        step(STEP);
        acc -= STEP;
        steps += 1;
      }
      // Spiral-of-death guard: never run more than 3 physics steps per
      // rendered frame; drop the excess time instead of catching up.
      if (acc >= STEP) acc = 0;
      // Camera once per rendered frame, after the steps (see updateCamera):
      // updating it per physics step made the view swing with every step.
      updateCamera(dt, false);
      // HUD once per rendered frame (was per physics step in step()).
      hud.update({ ...hudPayload(), dt, visible: state.screen === SCREEN_PLAY });
      hud.drawMinimap(mapWorld());
    } else if (state.screen === SCREEN_MAP) {
      // Frozen game behind the map; the map itself redraws (the search
      // zone pulse and the GPS route stay live).
      hud.drawBigMap(mapWorld());
    } else if (state.screen === SCREEN_JOB) {
      updateCamera(dt, false);
    } else if (state.screen === SCREEN_TITLE) {
      state.time += dt;
      state.clockHour += (dt / cfg.time.dayLength) * 24;
      updateDaylight();
      updateLights(dt);
      updateLightHeads();
      // Slow orbit around the tower behind the title screen.
      const a = state.time * 0.05;
      camera.position.set(Math.sin(a) * 90, 42, Math.cos(a) * 90);
      camera.lookAt(0, 20, 0);
      updateHeli(dt);
      for (const car of traffic) updateTrafficCar(car, dt, allCars(), cfg, pedestrians);
    } else if (state.screen === SCREEN_OVER) {
      updateCamera(dt, false);
    }
    renderFrame();
  }
  let last = performance.now();
  // Physics accumulator, carried across frames (see frame()).
  let acc = 0;

  function stageShot(name) {
    state.shotMode = true;
    state.screen = SCREEN_PLAY;
    document.getElementById('screen-title').style.display = 'none';
    document.getElementById('screen-pause').style.display = 'none';
    document.getElementById('screen-over').style.display = 'none';
    document.getElementById('screen-map').style.display = 'none';
    document.getElementById('screen-job').style.display = 'none';
    startMission(missions, name === 'combat' ? 4 : 0, cfg);
    if (name === 'chase') {
      // Busiest shot: driving a stolen car through traffic, wanted 3, police
      // closing in head-on ahead, a roadblock across the road, and a traffic
      // car in the same lane. Shot from a three-quarter rear angle, so the
      // wheels, the glass and the driver read instead of a flat rear view.
      const car = parked[0];
      enterCar(car);
      car.group.position.set(-28, 0, -40);
      car.heading = 0;
      car.group.rotation.y = 0;
      car.speed = 26;
      state.camYaw = 0;
      state.clockHour = 18.5;
      setStars(wanted, 3);
      ensurePolice(wanted, scene, playerPos(), rng, { heading: 0, roadLines: city.roadLines });
      const policeSpots = [
        { x: -33, z: -8, heading: Math.PI },
        { x: -23, z: -2, heading: Math.PI },
        { x: -42, z: -26, heading: 0 },
      ];
      wanted.policeCars.forEach((pc, i) => {
        const s = policeSpots[i % policeSpots.length];
        pc.group.position.set(s.x, 0, s.z);
        pc.heading = s.heading;
        pc.group.rotation.y = s.heading;
      });
      const lead = traffic[0];
      if (lead) {
        lead.group.position.set(-28, 0, -14);
        lead.heading = 0;
        lead.group.rotation.y = 0;
        lead.route = { axis: 'z', line: -28, dir: 1 };
        lead.speed = 8;
      }
      hud.showMessage('Marla Quinn: Lose them, Rico. Get to the garage.', 30);
    } else if (name === 'combat') {
      // Payback at the East Docks, frozen mid-fire: the player has closed
      // to about 7 m of the nearest King and is shooting — a fat bolt, a
      // big muzzle flash and a hot impact glow, all held open for the
      // frame — while a second King fires back from a flank, so a second
      // bolt cuts the frame on a different angle. Crates, containers and
      // barrels dress the docks behind them.
      spawnMissionEnemies();
      const target = enemies[0];
      // V8 re-stage (reviewer fix 1), final geometry after a probe sweep
      // of 12 candidates: the duel sits south-east of the docks, player
      // (125,133) to King (130,138), side camera south-west looking
      // north-east. Iterations 1-5 proved every west-of-duel camera on
      // the block-(112,112) edge fails: the cluster is four seeded
      // buildings, x 103..123, z 96..128, and their north faces fill a
      // third of the frame from any east-facing camera near z 88..96
      // (iter 5: the (117,104) face covered 35%). Shifting the duel
      // south-east clears them all (probe: no building over 1% of the
      // frame); pushing the King 3 m north again (kz 135/136) brings
      // them back on the left, so 138 is the spot. The (128,128) crate
      // stack reads left-centre, the (152,108)/(148,124) containers,
      // piers and sea edge fill the horizon behind the King, and three
      // living Kings stay in frame. The dead King is invisible
      // (hurtEnemy hides him), so the small flash + burst read against
      // that busy backdrop, not empty dirt. Player closes to ~7 m,
      // south-west of the King.
      if (target) target.group.position.set(130, 0, 138);
      const second = enemies[2];
      if (second && second.alive) second.group.position.set(140, 0, 134);
      const third = enemies[3];
      if (third && third.alive) third.group.position.set(142, 0, 138);
      playerMesh.position.set(125, 0, 133);
      if (target) {
        player.heading = Math.atan2(
          target.group.position.x - playerMesh.position.x,
          target.group.position.z - playerMesh.position.z,
        );
      }
      state.camYaw = player.heading;
      playerMesh.rotation.y = player.heading;
      state.clockHour = 18.7;
      for (let i = 0; i < 3; i += 1) {
        player.shootCooldown = 0;
        shoot();
      }
      // Impact glow on the King the player is hitting, held for the frame.
      // V8: shrunk from 0.5 to 0.3 (reviewer fix 1) so it reads as a hit
      // flash on the King's chest, not a floating yellow ball.
      if (target) {
        impactGlow.position.set(target.group.position.x, 1.4, target.group.position.z);
        impactGlow.scale.setScalar(0.3);
        impactGlow.visible = true;
      }
      // Return fire from a flank: the second King steps out to the side
      // of the firing line, so his bolt cuts across the frame at a clear
      // angle to the player's instead of lying on top of it. V8: moved
      // from (142,106) to (148,126) with the re-staged duel — he fires
      // from the docks' east edge north-east of the duel, so his bolt
      // slashes diagonally from right-centre toward the player. Verify
      // by looking.
      const flanker = enemies[1];
      if (flanker && flanker.alive) {
        flanker.group.position.set(148, 0, 126);
        const from = flanker.group.position.clone().setY(1.4);
        fireTracer(from, { x: playerMesh.position.x, y: 1.3, z: playerMesh.position.z });
      }
      holdTracers();
      muzzle.visible = true;
      missions.enemiesLeft = enemies.filter((e) => e.alive).length;
      hud.showMessage('Payback: Take down all 4 Reef Kings at the docks.', 30);
    } else if (name === 'map') {
      // The full city map over a live chase: wanted 3, search zone on the
      // radar, GPS route to the garage, districts and venues labelled.
      const car = parked[0];
      enterCar(car);
      car.group.position.set(-28, 0, -40);
      car.heading = 0;
      car.group.rotation.y = 0;
      car.speed = 20;
      state.camYaw = 0;
      state.clockHour = 18.5;
      setStars(wanted, 3);
      ensurePolice(wanted, scene, playerPos(), rng, { heading: 0, roadLines: city.roadLines });
      // Put the cops on the radar and freeze the search zone on the player.
      wanted.searchZone = {
        x: playerPos().x,
        z: playerPos().z,
        r: cfg.police.searchZoneBase + cfg.police.searchZonePerStar * 3,
      };
      state.screen = SCREEN_MAP;
      document.getElementById('map-job').textContent = 'CH.1 HOMECOMING — Reach Marla\u2019s Garage on Coral Row';
      document.getElementById('screen-map').style.display = 'flex';
      hud.drawBigMap(mapWorld());
    } else if (name === 'dialogue') {
      // Homecoming briefing at the spawn: Marla's opening line in the
      // dialogue bar with her portrait, the garage beacon ahead, and the
      // spawn clear of buildings (the spawn-wall fix). Staged tighter and
      // lower than before, so the frame holds the garage front (with its
      // TALLER MARLA board), the street, a parked car, pedestrians and the
      // new spawn props — not a flat wall and not an empty lot.
      playerMesh.position.set(-104, 0, 52);
      player.heading = Math.atan2(-112 - -104, 84 - 52);
      state.camYaw = player.heading;
      state.clockHour = 18.4;
      for (let i = 0; i < 3; i += 1) {
        const ped = pedestrians[i];
        ped.group.position.set(-100 + i * 6, 0, 56 + i * 4);
      }
      hud.showMessage('Marla Quinn: Get to my garage, Coral Row — we talk work.', 30);
    }
    // Settle the world a few frames, then snap the camera and render.
    for (let i = 0; i < 30; i += 1) {
      updateLights(STEP);
      for (const car of traffic) updateTrafficCar(car, STEP, allCars(), cfg, pedestrians);
    }
    updateDaylight();
    updateLightHeads();
    updateCamera(1, true);
    // Shots in a car use a closer camera so the car and the action fill the frame.
    if (player.inCar && player.car) {
      const cp = playerPos();
      const fwd = { x: Math.sin(state.camYaw), z: Math.cos(state.camYaw) };
      // Three-quarter rear: back 8.5, across 4.5 to the side, low — the
      // wheels, the glass and the driver all read from this angle.
      const right = { x: Math.cos(state.camYaw), z: -Math.sin(state.camYaw) };
      camera.position.set(cp.x - fwd.x * 8.5 + right.x * 4.5, 3.4, cp.z - fwd.z * 8.5 + right.z * 4.5);
      camera.lookAt(cp.x + fwd.x * 12, 1.4, cp.z + fwd.z * 12);
    }
    // The combat shot stands to the side of the duel: the camera sits on
    // the flank of the player–King midpoint, low, so both figures fill
    // the frame and the bolts cross it sideways instead of pointing at
    // the lens. Computed from the staged positions, not fixed numbers.
    if (name === 'combat') {
      const pp = playerPos();
      const tp = enemies[0]
        ? { x: enemies[0].group.position.x, z: enemies[0].group.position.z }
        : { x: pp.x, z: pp.z };
      const mid = { x: (pp.x + tp.x) / 2, z: (pp.z + tp.z) / 2 };
      const along = { x: tp.x - pp.x, z: tp.z - pp.z };
      const span = Math.hypot(along.x, along.z) || 1;
      const side = { x: -along.z / span, z: along.x / span };
      const flank = 6.5;
      camera.position.set(mid.x + side.x * flank, 2.1, mid.z + side.z * flank);
      camera.lookAt(mid.x, 1.35, mid.z);
    }
    // The dialogue shot stands close behind the player and low, so the
    // dressed garage front fills the frame under the message bar instead
    // of shrinking behind a wide empty lot.
    if (name === 'dialogue') {
      const pp = playerPos();
      const fwd = { x: Math.sin(state.camYaw), z: Math.cos(state.camYaw) };
      camera.position.set(pp.x - fwd.x * 7, 3.6, pp.z - fwd.z * 7);
      camera.lookAt(pp.x + fwd.x * 14, 2.6, pp.z + fwd.z * 14);
    }
    hud.update({ ...hudPayload(), dt: 0, visible: name !== 'map' });
    hud.drawMinimap(mapWorld());
    if (name === 'map') hud.drawBigMap(mapWorld());
    renderFrame();
    window.__shotReady = true;
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);

  return {
    state,
    player,
    missions,
    wanted,
    city,
    startGame,
    respawn,
    saveGame,
    loadSave,
    stageShot,
    run() {
      document.getElementById('btn-start').addEventListener('click', () => {
        document.getElementById('screen-title').style.display = 'none';
        document.getElementById('screen-controls').style.display = 'none';
        startGame(false);
      });
      document.getElementById('btn-continue').addEventListener('click', () => {
        document.getElementById('screen-title').style.display = 'none';
        document.getElementById('screen-controls').style.display = 'none';
        startGame(true);
      });
      document.getElementById('btn-controls').addEventListener('click', () => {
        const panel = document.getElementById('screen-controls');
        const showing = panel.style.display === 'block';
        panel.style.display = showing ? 'none' : 'block';
        audio.click();
      });
      document.getElementById('btn-resume').addEventListener('click', () => {
        state.screen = SCREEN_PLAY;
        document.getElementById('screen-pause').style.display = 'none';
      });
      document.getElementById('btn-restart-mission').addEventListener('click', () => {
        document.getElementById('screen-pause').style.display = 'none';
        failMission(missions);
        startMission(missions, missions.index, cfg);
        state.screen = SCREEN_PLAY;
      });
      document.getElementById('btn-quit').addEventListener('click', () => {
        document.getElementById('screen-pause').style.display = 'none';
        document.getElementById('screen-title').style.display = 'flex';
        state.screen = SCREEN_TITLE;
      });
      document.getElementById('btn-respawn').addEventListener('click', () => {
        document.getElementById('screen-over').style.display = 'none';
        respawn();
      });
      document.getElementById('btn-job-continue').addEventListener('click', () => {
        continueAfterJob();
      });
      const save = loadSave();
      const contBtn = document.getElementById('btn-continue');
      contBtn.style.display = save ? 'inline-block' : 'none';
      const summary = document.getElementById('save-summary');
      if (summary) summary.textContent = save ? saveSummary(save) : '';
      document.getElementById('story-intro').textContent = STORY_INTRO;
      requestAnimationFrame(frame);
    },
    showGameOver(reason) {
      document.getElementById('over-title').textContent = reason.includes('BUSTED') ? 'BUSTED' : 'WASTED';
      document.getElementById('over-text').textContent = reason;
      document.getElementById('screen-over').style.display = 'flex';
    },
  };
}
