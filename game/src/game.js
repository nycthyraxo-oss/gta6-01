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
import { CONFIG, MISSION_DEFS } from './config.js';
import { createRandom } from './random.js';
import { buildCity, districtAt, streetAt } from './city.js';
import { createCar, spawnTrafficCar, updateTrafficCar, createSkids, randomCarColor, makeCarMesh, disposeCarMesh, spinWheels, steerWheels, SPECS } from './vehicles.js';
import { makePersonMesh, spawnPedestrian, spawnVendor, updatePedestrian, spawnEnemy, updateEnemy, markWitness, clearWitness, spawnFleeingPed, nearestBlock } from './people.js';
import { createWanted, addHeat, setStars, ensurePolice, updatePolice, clearPolice, pursuers } from './police.js';
import { createMissions, startMission, updateMission, completeMission, failMission, currentMission, currentTarget, missionObjectiveText, stageLabel, missionProgress, nextMissionTitle, advanceDialogue, DIALOGUE_LINE_SECONDS } from './missions.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createInput, ACTION_ENTER, ACTION_SHOOT, ACTION_PAUSE, ACTION_MUTE, ACTION_RESTART, ACTION_CONFIRM, ACTION_MAP, ACTION_RADIO, ACTION_NIGHT, ACTION_SPAWN_CAR, ACTION_WEAPON_1, ACTION_WEAPON_2, ACTION_WEAPON_3, ACTION_WEAPON_4, ACTION_WEAPON_5, ACTION_WEAPON_6 } from './input.js';
import { createPackages } from './packages.js';
import { createMedals } from './medals.js';
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
export const SCREEN_SHOP = 'shop';

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
  // v9 iteration 4: exponential fog — the density now moves with the
  // day cycle (thicker at night, thinner at noon) instead of a fixed
  // linear range. updateDaylight() owns scene.fog.density.
  scene.fog = new THREE.FogExp2(cfg.palette.fog, 0.0022);
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

  // v8 graphics: post-processing chain — scene -> neon bloom -> ACES/sRGB
  // output. v9 iteration 4: the threshold comes from config (0.9) so
  // only emissiveIntensity > 1 blooms — neon signs, lamp bulbs,
  // headlights, tracers and flashes. The bloom pass runs at half
  // resolution to keep SwiftShader frame cost down.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2)),
    cfg.graphics.bloomStrength, // strength
    cfg.graphics.bloomRadius,  // radius
    cfg.graphics.bloomThreshold, // threshold
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  function renderFrame() { composer.render(); }

  // v9 iteration 4: PMREM environment map for PBR reflections. There is
  // no RoomEnvironment addon in the vendored set, so the environment is
  // a tiny procedural scene — a gradient sky sphere and three neon
  // boxes — baked once through PMREMGenerator. scene.environment gives
  // every MeshStandardMaterial a reflection to work with, which is what
  // makes the wet asphalt (roughness 0.28) read.
  {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(
      new THREE.SphereGeometry(50, 16, 8),
      new THREE.MeshBasicMaterial({
        side: THREE.BackSide,
        vertexColors: true,
      }),
    );
    const envColors = [];
    const envPos = envSky.geometry.attributes.position;
    for (let i = 0; i < envPos.count; i += 1) {
      const y = envPos.getY(i) / 50;
      const c = y > 0.3
        ? [0.25, 0.12, 0.45]
        : y > -0.1
          ? [0.9, 0.45, 0.55]
          : [0.1, 0.08, 0.15];
      envColors.push(c[0], c[1], c[2]);
    }
    envSky.geometry.setAttribute('color', new THREE.Float32BufferAttribute(envColors, 3));
    envScene.add(envSky);
    for (const [ex, ey, ez, er, eg, eb] of [
      [10, 4, -8, 2.2, 0.4, 1.6],
      [-12, 6, 10, 0.4, 2.0, 2.0],
      [0, 8, 14, 2.0, 1.7, 0.4],
    ]) {
      const neonBox = new THREE.Mesh(
        new THREE.BoxGeometry(6, 2, 1),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(er, eg, eb) }),
      );
      neonBox.position.set(ex, ey, ez);
      envScene.add(neonBox);
    }
    const envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
    pmrem.dispose();
  }

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

  // v9 rain: a Points cloud of falling streaks around the camera and a
  // pool of reusable splash rings on the ground. All buffers are
  // pre-allocated and updated in place — no per-frame allocation. The
  // rain rng is a separate seeded stream (seed ^ 0x51ab), so the city
  // rng is untouched and staged shots stay deterministic: the settle
  // loop runs a fixed number of steps, so the same shot always renders
  // the same rain. Rain follows the camera with a toroidal wrap, so it
  // never runs out as the player drives across the city.
  const rainRng = createRandom(seed ^ 0x51ab);
  const RAIN_COUNT = cfg.rain.count;
  const rainPos = new Float32Array(RAIN_COUNT * 3);
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const streakCanvas = document.createElement('canvas');
  streakCanvas.width = 8;
  streakCanvas.height = 48;
  {
    const sctx = streakCanvas.getContext('2d');
    const grad = sctx.createLinearGradient(0, 0, 0, 48);
    grad.addColorStop(0, 'rgba(143,180,255,0)');
    grad.addColorStop(0.5, 'rgba(143,180,255,0.9)');
    grad.addColorStop(1, 'rgba(143,180,255,0)');
    sctx.fillStyle = grad;
    // v9 iteration 2: a 1 px line (was 2 px) — the old 2 px streaks at
    // size 2.2 read as white snow blobs against the pink sky. Thinner,
    // bluer and dimmer now, so it reads as rain, not snowfall.
    sctx.fillRect(4, 0, 1, 48);
  }
  const streakTex = new THREE.CanvasTexture(streakCanvas);
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    size: 1.3, map: streakTex, transparent: true, opacity: 0.42,
    color: 0x8fb4ff, depthWrite: false, sizeAttenuation: true,
  }));
  rain.frustumCulled = false;
  scene.add(rain);
  // Splash rings: one shared geometry, one material per ring (opacity
  // animates per ring), reused forever.
  const splashRings = [];
  const splashGeo = new THREE.RingGeometry(0.3, 0.45, 16);
  for (let i = 0; i < cfg.rain.splashRings; i += 1) {
    const m = new THREE.Mesh(splashGeo, new THREE.MeshBasicMaterial({
      color: 0x9fd8ff, transparent: true, opacity: 0, depthWrite: false,
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.09;
    m.visible = false;
    scene.add(m);
    splashRings.push({ mesh: m, age: rainRng.next() * 0.6, life: 0.6, x: 0, z: 0 });
  }
  // The season flag (v9 iteration 3): true while the current day is a
  // rainy day. applySeason() owns it; scatterRain/updateRain read it
  // instead of state.day, because scatterRain runs once at boot — before
  // `const state` is initialised — and reading state there throws.
  let seasonRainy = true;
  function scatterRain() {
    // (Re)scatter every streak in the box around the camera — used once
    // at boot and once per staged shot, so the frame is full of rain.
    // Dry season: no rain to scatter.
    if (!seasonRainy) return;
    const cx = camera.position.x;
    const cz = camera.position.z;
    for (let i = 0; i < RAIN_COUNT; i += 1) {
      // v9 iteration 5 (§0): keep every streak 6 m from the camera — a
      // streak right on the lens read as a tall pale vertical band (a
      // light beam) in the dialogue shot.
      let rx = (rainRng.next() * 2 - 1) * cfg.rain.boxX;
      let rz = (rainRng.next() * 2 - 1) * cfg.rain.boxZ;
      const rd = Math.hypot(rx, rz);
      if (rd < 6) {
        const s = 6 / (rd || 1);
        rx *= s;
        rz *= s;
      }
      rainPos[i * 3] = cx + rx;
      rainPos[i * 3 + 1] = rainRng.next() * cfg.rain.boxY;
      rainPos[i * 3 + 2] = cz + rz;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  scatterRain();
  // Two seasons (v9 iteration 3): RAINY SEASON on odd days, DRY SEASON
  // on even days. A pure function of state.day — deterministic, no rng,
  // no clock. Rain, puddles, lamp pools and wet shine live only in the
  // rainy season; the dry season keeps the clear pink dusk. Applied
  // whenever the day changes; cheap no-op otherwise.
  let appliedRainy = null;
  function applySeason() {
    const rainy = state.day % 2 === 1;
    if (appliedRainy === rainy) return;
    const wasDry = appliedRainy === false;
    appliedRainy = rainy;
    seasonRainy = rainy;
    rain.visible = rainy;
    for (const ring of splashRings) ring.mesh.visible = false;
    city.setSeason(rainy);
    // Coming back from a dry stretch the streaks are stale around an old
    // camera spot — re-scatter them so the rain is full in one frame.
    if (rainy && wasDry) scatterRain();
  }
  function updateRain(dt) {
    // Dry season: no rain falls, no rings, no rng consumed.
    if (!seasonRainy) return;
    const cx = camera.position.x;
    const cz = camera.position.z;
    const bx = cfg.rain.boxX;
    const by = cfg.rain.boxY;
    const bz = cfg.rain.boxZ;
    const fall = cfg.rain.fallSpeed * dt;
    const wind = cfg.rain.windSpeed * dt;
    for (let i = 0; i < RAIN_COUNT; i += 1) {
      let x = rainPos[i * 3] + wind;
      let y = rainPos[i * 3 + 1] - fall;
      let z = rainPos[i * 3 + 2];
      if (y < 0) {
        y = by;
        // v9 iteration 5 (§0): a respawned streak never lands within
        // 6 m of the camera (see scatterRain — the light-beam band).
        let rx = (rainRng.next() * 2 - 1) * bx;
        let rz = (rainRng.next() * 2 - 1) * bz;
        const rd = Math.hypot(rx, rz);
        if (rd < 6) {
          const s = 6 / (rd || 1);
          rx *= s;
          rz *= s;
        }
        x = cx + rx;
        z = cz + rz;
      }
      if (x > cx + bx) x -= bx * 2;
      else if (x < cx - bx) x += bx * 2;
      if (z > cz + bz) z -= bz * 2;
      else if (z < cz - bz) z += bz * 2;
      // v9 iteration 6: the toroidal wrap could drop a streak inside
      // the 6 m dead zone (the respawn guard above only runs when a
      // streak hits the ground). A wrapped streak inside 6 m is pushed
      // out to exactly 6 m along its own direction, so the wrap never
      // paints a streak across the camera.
      {
        const dx = x - cx;
        const dz = z - cz;
        const rd = Math.hypot(dx, dz);
        if (rd < 6) {
          const s = 6 / (rd || 1);
          x = cx + dx * s;
          z = cz + dz * s;
        }
      }
      rainPos[i * 3] = x;
      rainPos[i * 3 + 1] = y;
      rainPos[i * 3 + 2] = z;
    }
    rainGeo.attributes.position.needsUpdate = true;
    for (const ring of splashRings) {
      ring.age += dt;
      if (ring.age >= ring.life) {
        ring.age = 0;
        ring.x = cx + (rainRng.next() * 2 - 1) * bx * 0.8;
        ring.z = cz + (rainRng.next() * 2 - 1) * bz * 0.8;
        ring.mesh.position.set(ring.x, 0.09, ring.z);
        ring.mesh.visible = true;
      }
      const t = ring.age / ring.life;
      ring.mesh.scale.setScalar(0.6 + t * 2.4);
      ring.mesh.material.opacity = 0.5 * (1 - t);
    }
  }

  const skids = createSkids(scene);
  const packages = createPackages(scene, rng);
  const medals = createMedals(scene);

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

  // Police vision cones (v9 iteration 4): translucent cones projected
  // 20 m ahead of each cruiser while the player is wanted — the player
  // can SEE the police line of sight, and the HUD flashes
  // "SPOTLIGHT ON YOU — BREAK LINE OF SIGHT" while standing in one.
  // Pooled (4, one per cruiser at most); the cone is a flattened
  // cylinder, open-ended, rotated to lie along the car's heading.
  const visionCones = [];
  for (let i = 0; i < 4; i += 1) {
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(6, 0.6, 20, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd23e, transparent: true, opacity: 0.14,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    cone.visible = false;
    scene.add(cone);
    visionCones.push(cone);
  }
  function updateVisionCones() {
    const cars = wanted.policeCars;
    visionCones.forEach((cone, i) => {
      const car = cars[i];
      if (!car || wanted.stars === 0) {
        cone.visible = false;
        return;
      }
      const pos = car.group.position;
      cone.visible = true;
      cone.position.set(
        pos.x + Math.sin(car.heading) * 10,
        1.2,
        pos.z + Math.cos(car.heading) * 10,
      );
      cone.rotation.order = 'YXZ';
      cone.rotation.y = car.heading;
      cone.rotation.x = Math.PI / 2;
    });
  }
  // Is the player standing inside any police vision cone? The cone is
  // 20 long, 6 wide at the far end — a point is inside when it is ahead
  // of the car, within 20, and within the widening half-width.
  function inVisionCone(px, pz) {
    for (const car of wanted.policeCars) {
      const pos = car.group.position;
      const dx = px - pos.x;
      const dz = pz - pos.z;
      const along = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
      if (along < 0 || along > 20) continue;
      const perp = Math.abs(dx * Math.cos(car.heading) - dz * Math.sin(car.heading));
      if (perp < 0.6 + (along / 20) * 5.4) return true;
    }
    return false;
  }

  const audio = createAudio(camera, scene);
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
    // Jump (v9 iteration 3): vertical velocity + grounded flag. The mesh
    // y is 0 while grounded; the jump is one velocity + one gravity, and
    // landing is exactly y = 0 — no hover, no sinking.
    vy: 0,
    grounded: true,
    // Weapons (v9 iteration 3): 0 pistol, 1 knife, 2 bazooka.
    weapon: 0,
    rockets: cfg.weapons.bazooka.rockets,
    swingT: 0,
    prevBrake: false,
    // v9 iteration 4: ammo is limited now — the pistol starts with 24
    // rounds (max 60) and the shop weapons carry their own magazines.
    // Money buys ammo at Ammu-Nation; running dry means a knife fight.
    ammo: cfg.player.pistolAmmo,
    smgAmmo: 0,
    shotgunAmmo: 0,
    rifleAmmo: 0,
    owned: { smg: false, shotgun: false, rifle: false },
    // REP earned outside missions (races +1 stunt, +5 a race) — saved,
    // and it counts toward the mission-6 REP gate.
    repBonus: 0,
    // v9 iteration 5 (§2): six skills, each with XP and a level (0-5,
    // thresholds in cfg.skillLevels). Levels have small real effects —
    // Driving (top speed + accel), Stamina (run speed), Aim (hitscan
    // tolerance), Stealth (heat), Influence (shop prices), Street Sense
    // (map shows packages + medals). XP is earned by doing the thing.
    skills: { driving: 0, stamina: 0, aim: 0, stealth: 0, influence: 0, street: 0 },
    // The outfit shop changes Rico's shirt colour (saved).
    shirtColor: 0x2a7a8c,
    // Ground height under the player (1.15 on the pier deck, the
    // causeway and Fuego Island, 0 everywhere else) — see groundYAt.
    groundY: 0,
    // Distance driven / sprint time since the last skill XP (Driving
    // earns 1 XP per 100 m, Stamina 1 XP per 10 s of sprinting).
    driveDist: 0,
    sprintT: 0,
  };
  playerMesh.position.set(-112, 0, 60);

  // Skills (v9 iteration 5, §2): level from XP via the thresholds in
  // config; XP is earned by doing the thing, and the level is what the
  // effects read.
  function skillLevel(name) {
    const xp = player.skills[name] ?? 0;
    let level = 0;
    for (let i = 0; i < cfg.skillLevels.length; i += 1) {
      if (xp >= cfg.skillLevels[i]) level = i;
    }
    return level;
  }
  function addSkillXp(name, amount) {
    player.skills[name] = (player.skills[name] ?? 0) + amount;
  }
  // v9 iteration 5 (§2): Stealth — every heat source is reduced 5% per
  // Stealth level. All heat in this file goes through this wrapper.
  function addHeatScaled(amount) {
    addHeat(wanted, amount * (1 - 0.05 * skillLevel('stealth')));
  }
  // REP rank (v9 iteration 5, §2): the named rank for a REP total, from
  // cfg.repRanks — the highest rank whose threshold the player meets.
  function repRank(rep) {
    let rank = cfg.repRanks[0];
    for (const r of cfg.repRanks) {
      if (rep >= r.rep) rank = r;
    }
    return rank;
  }

  // Progress to the next REP rank, 0–1 (1 at the top rank).
  function repProgress() {
    const rep = repPoints();
    const ranks = cfg.repRanks;
    let cur = ranks[0];
    let next = null;
    for (const r of ranks) {
      if (rep >= r.rep) cur = r;
      else { next = r; break; }
    }
    if (!next) return 1;
    return Math.min(1, Math.max(0, (rep - cur.rep) / (next.rep - cur.rep)));
  }

  // Weapon view models (v9 iteration 3): procedural, no assets. The knife
  // rides in the right hand (it swings with the arm); the bazooka tube
  // rides on the right shoulder, pointing forward. Only the selected
  // weapon is visible, and both hide with the mesh when the player is
  // in a car.
  const knifeMesh = new THREE.Group();
  {
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.18, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x2a1c10, roughness: 0.9 }),
    );
    handle.position.y = -0.08;
    knifeMesh.add(handle);
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.5, 0.015),
      new THREE.MeshStandardMaterial({ color: 0xc8ccd4, roughness: 0.25, metalness: 0.9 }),
    );
    blade.position.y = 0.26;
    knifeMesh.add(blade);
    knifeMesh.position.set(0, -0.58, 0.06);
    knifeMesh.rotation.x = 0.5;
    knifeMesh.visible = false;
    playerMesh.userData.armR.add(knifeMesh);
  }
  const bazookaMesh = new THREE.Group();
  {
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 1.15, 10),
      new THREE.MeshStandardMaterial({ color: 0x3a4a2e, roughness: 0.6, metalness: 0.4 }),
    );
    tube.rotation.x = Math.PI / 2;
    bazookaMesh.add(tube);
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.11, 0.22, 10),
      new THREE.MeshStandardMaterial({ color: 0x2c3a22, roughness: 0.6, metalness: 0.4 }),
    );
    bell.rotation.x = Math.PI / 2;
    bell.position.z = 0.62;
    bazookaMesh.add(bell);
    const sight = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.09, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.5, metalness: 0.6 }),
    );
    sight.position.set(0, 0.14, 0.1);
    bazookaMesh.add(sight);
    bazookaMesh.position.set(0.34, 1.42, 0.3);
    bazookaMesh.visible = false;
    playerMesh.userData.rig.add(bazookaMesh);
  }
  function updateWeaponModels() {
    knifeMesh.visible = player.weapon === 1 && !player.inCar;
    bazookaMesh.visible = player.weapon === 2 && !player.inCar;
  }

  // Mission beacon: a tall glowing pillar over the current target.
  // v9 iteration 6: the old beacon was a 60 m uniform cylinder — from
  // the dialogue camera it filled the top of the frame as a pale
  // vertical band (raycast-verified: the band IS this beacon, not the
  // rain). The beacon is now a short tapered pillar: 16 m tall, 2.2 m
  // at the base tapering to 0.9 m at the top, with a vertical alpha
  // gradient (solid at the ground, fully transparent at the top), so it
  // marks the target on the ground and never paints the sky. The ground
  // ring is unchanged.
  const beaconCanvas = document.createElement('canvas');
  beaconCanvas.width = 1;
  beaconCanvas.height = 64;
  {
    const bctx = beaconCanvas.getContext('2d');
    const grad = bctx.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,0.55)');
    bctx.fillStyle = grad;
    bctx.fillRect(0, 0, 1, 64);
  }
  const beaconTex = new THREE.CanvasTexture(beaconCanvas);
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 2.2, 16, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, map: beaconTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
  );
  beacon.position.set(city.landmarks.garage.x, 8, city.landmarks.garage.z);
  scene.add(beacon);
  const beaconRing = new THREE.Mesh(
    new THREE.RingGeometry(3, 5, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
  );
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.position.set(city.landmarks.garage.x, 0.1, city.landmarks.garage.z);
  scene.add(beaconRing);

  // Street race rings (v9 iteration 5): flat rings on the road at the
  // start, the two checkpoints and the finish. Dim grey while inactive,
  // gold on the current target, green once passed. Hidden until a race
  // starts. The rings are repositioned per race (setRaceRings) — all
  // three races have the same 4-point shape.
  const raceRings = [];
  for (let i = 0; i < 4; i += 1) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3, 4.5, 24),
      new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cfg.races[0].start.x, 0.1, cfg.races[0].start.z);
    ring.visible = false;
    scene.add(ring);
    raceRings.push(ring);
  }
  function setRaceRings(race) {
    const pts = [race.start, ...race.checkpoints, race.finish];
    raceRings.forEach((r, i) => {
      r.position.set(pts[i].x, 0.1, pts[i].z);
      r.visible = false;
      r.material.color.setHex(0x555555);
    });
  }
  // Delivery markers (v9 iteration 5, §2): a gold ring at each available
  // pickup, one green ring at the active drop. Visibility is updated
  // every step (see step()).
  const deliveryPickupRings = cfg.deliveries.map((d) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.5, 3.5, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(d.pickup.x, 0.1, d.pickup.z);
    ring.visible = false;
    scene.add(ring);
    return ring;
  });
  const deliveryDropRing = new THREE.Mesh(
    new THREE.RingGeometry(3, 4.5, 24),
    new THREE.MeshBasicMaterial({ color: 0x22ff44, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
  );
  deliveryDropRing.rotation.x = -Math.PI / 2;
  deliveryDropRing.visible = false;
  scene.add(deliveryDropRing);

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
  // v9 iteration 6: was 0x22262c (near-black) — in the dusk shot it
  // read as a black box with no edges. Steel blue-grey now, and the
  // side marker lights (vehicles.js) keep it readable after dark.
  parkCar(-56, 112, 0, 0x3a4a5a);
  parkCar(56, 100, Math.PI, 0x8a5fc2);
  const coupe = parkCar(city.landmarks.marina.x - 6, city.landmarks.marina.z, Math.PI / 2, 0xe07828);
  coupe.isTarget = true;

  // Pedestrians on the sidewalks, plus a vendor behind every mercado stall.
  // walkerCount tracks the walking crowd (vendors sit after them in the
  // array) so the crowd slider can add/remove walkers without touching
  // the vendors.
  const pedestrians = [];
  let walkerCount = 0;
  for (let i = 0; i < cfg.pedestrians.count; i += 1) {
    pedestrians.push(spawnPedestrian(scene, rng, cfg, city.blockCenters));
    walkerCount += 1;
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
  // Pooled so shooting never allocates. v9 iteration 4: HDR colour so
  // the bolt blooms (threshold 0.9).
  const tracers = [];
  for (let i = 0; i < 8; i += 1) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.14, 1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.9, 1.0), transparent: true, opacity: 0 }),
    );
    m.visible = false;
    scene.add(m);
    tracers.push({ mesh: m, life: 0 });
  }
  let tracerNext = 0;
  const muzzle = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.8, 0.5) }),
  );
  muzzle.visible = false;
  scene.add(muzzle);

  // Bazooka rockets (v9 iteration 3): pooled, three in flight at most.
  // A rocket flies dead straight along the firing direction at a fixed
  // speed and explodes on impact (enemy, barrel, ped, or max range).
  const rockets = [];
  for (let i = 0; i < 3; i += 1) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.4, metalness: 0.7 }),
    );
    body.rotation.x = Math.PI / 2;
    g.add(body);
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.25, 8),
      new THREE.MeshStandardMaterial({ color: 0xc22a22, roughness: 0.5, metalness: 0.4 }),
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.52;
    g.add(nose);
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.02, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x2c3a22, roughness: 0.6 }),
    );
    fin.position.z = -0.35;
    g.add(fin);
    g.visible = false;
    scene.add(g);
    rockets.push({ mesh: g, active: false, dx: 0, dz: 0, life: 0 });
  }
  // Explosion flash: one expanding orange sphere, reused for every blast.
  // v9 iteration 4: HDR so the blast blooms.
  const blastFlash = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 12, 10),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.2, 0.35), transparent: true, opacity: 0 }),
  );
  blastFlash.visible = false;
  scene.add(blastFlash);
  let blastT = 0;
  // Impact burst: a hot glow held on the enemy the staged shot hits, so
  // the combat frame shows where the bolt lands instead of a bare line end.
  const impactGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.5, 0.5) }),
  );
  impactGlow.visible = false;
  scene.add(impactGlow);
  const particles = [];
  for (let i = 0; i < 40; i += 1) {
    const p = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.18, 0.18),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.2, 0.4) }),
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

  // Water burst: blue spheres for a smashed hydrant (v9 iteration 4).
  // Pooled like the smoke — a hydrant sprays for 2 s, then the pool
  // recycles. No new allocation per smash.
  const water = [];
  for (let i = 0; i < 10; i += 1) {
    const w = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.4, 2.0), transparent: true, opacity: 0 }),
    );
    w.visible = false;
    scene.add(w);
    water.push({ mesh: w, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  let waterNext = 0;
  function burstWater(x, y, z, n) {
    for (let i = 0; i < n; i += 1) {
      const w = water[waterNext];
      waterNext = (waterNext + 1) % water.length;
      w.mesh.position.set(x, y, z);
      w.mesh.visible = true;
      w.mesh.material.opacity = 0.85;
      w.life = 0.8 + Math.random() * 0.5;
      w.vx = (Math.random() - 0.5) * 4;
      w.vy = Math.random() * 6 + 3;
      w.vz = (Math.random() - 0.5) * 4;
    }
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
    // v9 iteration 4: L skips time forward 2 h now — the continuous day
    // cycle replaces the binary night toggle, so nightMode is gone.
    spawnCarCooldown: 0,
    // Wall time of the last gunshot, for ped panic (any weapon scares
    // the crowd — the old code only panicked peds on the pistol's
    // cooldown edge). Updated on every shot, knife swing and blast.
    lastShotAt: -99,
    // Wall time of the last camera input, for the drive-by override:
    // while the player is actively aiming from a car, the camera does
    // not auto-trail back to the car heading.
    lastAimTime: 0,
    // Camera blend 0-1 while entering/exiting a car (smooth lerp
    // between the foot and car camera positions).
    camBlend: 1,
    // Stunt slow-mo: seconds of 0.45× time left after a ramp launch.
    slowmo: 0,
    // Air time while a car is airborne off a stunt ramp (vy of the car).
    carAir: 0,
    // Reef Kings faction aggro: the player entered the docks, or hurt a
    // King. Aggro Kings close in faster, shoot further, hit more often.
    factionAggro: false,
    // Street race state: null when idle, otherwise { cp, timeLeft }.
    // raceArmed gates the start line: a race that just ended (win or
    // timeout) must not re-trigger while the car is still sitting on
    // the start line — the player has to drive out past 8 m first.
    race: null,
    raceArmed: true,
    // Graphics settings (v9 iteration 5, §5): the MED preset's values
    // are the defaults. fogMul scales the fog density in updateDaylight.
    fogMul: 1,
    settings: {
      preset: 'MED',
      traffic: cfg.traffic.count,
      crowd: cfg.pedestrians.count,
      viewDistance: cfg.presets.MED.far,
      mouseSens: 1,
      master: 1,
      music: 1,
      effects: 1,
      engine: 1,
    },
  };

  // Wanted stars on the previous step, for the evaded toast: the toast
  // fires only when the stars actually fall to zero from a pursuit.
  let prevStars = 0;
  let prevGrace = 0;
  // Cars the V key spawned (capped, oldest removed first).
  const spawnedCars = [];
  // Free-roam progress (v9 iteration 5): three races, each winnable
  // once (raceWins[i]), six stunt ramps, each with a first-time prize
  // (landedRamps), and three courier jobs (deliveriesDone[i]). All feed
  // REP and all are saved.
  let racesWon = 0;
  let raceWins = [false, false, false];
  let raceIdx = -1;
  let stunts = 0;
  const landedRamps = new Set();
  let delivery = null;
  let deliveriesDone = [false, false, false];

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
    // The shop screen (v9 iteration 4): number keys buy, E or Esc
    // closes. Digits are drained every frame so a stale key never fires
    // a purchase after the shop closes.
    if (state.screen === SCREEN_SHOP) {
      const digit = input.takeDigit();
      if (digit >= 1 && digit <= 9) buyShop(digit);
      if (pendingActions & (ACTION_ENTER | ACTION_PAUSE)) {
        pendingActions &= ~(ACTION_ENTER | ACTION_PAUSE);
        closeShop();
      }
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
    // L: skip time forward 2 h (v9 iteration 4). The continuous day
    // cycle replaces the binary night toggle — the sun, sky, fog and
    // lamps all move with the clock, and L just jumps the clock ahead.
    if (pendingActions & ACTION_NIGHT) {
      pendingActions &= ~ACTION_NIGHT;
      if (state.screen === SCREEN_PLAY) {
        state.clockHour += 2;
        if (state.clockHour >= 24) {
          state.clockHour -= 24;
          state.day += 1;
        }
        updateDaylight();
        hud.showMessage(`Time skips ahead — ${hud.clockText(state.clockHour, state.day)}`, 3);
      }
    }
    if (pendingActions & ACTION_PAUSE) {
      pendingActions &= ~ACTION_PAUSE;
      if (state.screen === SCREEN_PLAY) {
        state.screen = SCREEN_PAUSED;
        document.getElementById('screen-pause').style.display = 'flex';
        renderPauseSkills();
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
    // v9 iteration 5 (§3): the sand track from the x=140 road to the
    // pier (z 98-102), the pier deck + causeway, and Fuego Island are
    // drivable — the car can actually drive to the island.
    if (x >= 140 && x <= 222 && z >= 98 && z <= 102) return true;
    const isl = cfg.island;
    if (x >= isl.x0 && x <= isl.x1 + 3 && z >= isl.z0 - 2 && z <= isl.z1 + 2) return true;
    return false;
  }

  // Ground height (v9 iteration 5, §3): 1.15 on the pier deck, the
  // causeway and Fuego Island (all at the pier-deck height), 0 everywhere
  // else. The player, their car and the traffic all ride it, so nobody
  // sinks through the deck or floats above the sand.
  function groundYAt(x, z) {
    if ((x >= 168 && x <= 222 && z >= 98 && z <= 102)
      || (x >= 222 && x <= 275 && z >= 70 && z <= 130)) return 1.15;
    return 0;
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
      shops: cfg.shops,
      // v9 iteration 5 (§2/§3): the big map draws the courier pickups,
      // race starts and (once Street Sense is 2+) the medals, so the
      // player can plan a run instead of stumbling on them.
      deliveries: cfg.deliveries.map((d, i) => ({
        pickup: d.pickup, drop: d.drop, done: deliveriesDone[i],
        active: !!delivery && delivery.idx === i, locked: repPoints() < d.repReq,
      })),
      races: cfg.races.map((r, i) => ({
        start: r.start, won: raceWins[i], locked: repPoints() < r.repReq,
      })),
      medals: medals.list.map((m) => ({ x: m.x, z: m.z, taken: m.taken })),
      showMedals: skillLevel('street') >= 2,
      playerX: pp.x,
      playerZ: pp.z,
      playerHeading: player.inCar && player.car ? player.car.heading : player.heading,
      time: state.time,
    };
  }

  // Reputation: jobs done and packages found, plus REP earned outside
  // missions (races and stunts). It is a count of what Rico has
  // actually done in the city, not a bar to grind.
  function repPoints() {
    return missions.index * cfg.player.repPerJob + packages.count() * cfg.player.repPerPackage + player.repBonus;
  }

  // Respray at Taller Marla: drive into the garage while wanted and the
  // car comes out a new colour with the heat gone. Cash pays, no questions.
  // A respray also fixes the car up: condition back to 100.
  function resprayCar(car) {
    const choices = SPECS.filter((s) => s.color !== car.color);
    const spec = choices[Math.floor(rng.next() * choices.length)];
    const oldGroup = car.group;
    scene.remove(oldGroup);
    const mesh = makeCarMesh(spec.color, false);
    mesh.group.position.copy(oldGroup.position);
    mesh.group.rotation.y = car.heading;
    scene.add(mesh.group);
    car.group = mesh.group;
    car.wheels = mesh.wheels;
    car.driver = mesh.driver;
    car.lightBar = mesh.lightBar;
    // v9 iteration 4: the new mesh has new head/tail light materials —
    // keep the references in step or the brake-light brightening would
    // write into a disposed material.
    car.headMat = mesh.headMat;
    car.tailMat = mesh.tailMat;
    car.driver.visible = true;
    car.color = spec.color;
    car.name = spec.name;
    car.wheelSpin = 0;
    car.condition = 100;
    // Memory-leak guard (item 12): the old paint's per-instance resources
    // (head/tail light materials, and for a van/cabrio the checker band /
    // windshield) are freed now that the old mesh is gone. Shared
    // geometries/materials are never in the owned list, so the other cars
    // are untouched.
    disposeCarMesh(oldGroup);
  }

  // The shops (v9 iteration 4): money is a progression sink. Ammu-Nation
  // sells ammo and the three REP-gated weapons; Pay 'n' Spray repairs the
  // car, repaints it (clears the heat), and takes a bribe (one star off).
  // E opens the shop when the player is on foot near the door; the menu
  // is a DOM overlay, 1-9 buys, E/Esc closes.
  let shopKind = null;
  function gunMenuItems() {
    const w = cfg.weapons;
    return [
      { key: 1, label: `Pistol ammo +${w.pistol.ammoPack}`, price: w.pistol.ammoPrice, can: () => player.ammo < cfg.player.pistolAmmoMax, buy: () => { player.ammo = Math.min(cfg.player.pistolAmmoMax, player.ammo + w.pistol.ammoPack); } },
      { key: 2, label: `SMG ammo +${w.smg.ammoPack}`, price: w.smg.ammoPrice, can: () => player.owned.smg && player.smgAmmo < w.smg.maxAmmo, buy: () => { player.smgAmmo = Math.min(w.smg.maxAmmo, player.smgAmmo + w.smg.ammoPack); } },
      { key: 3, label: `Shotgun shells +${w.shotgun.ammoPack}`, price: w.shotgun.ammoPrice, can: () => player.owned.shotgun && player.shotgunAmmo < w.shotgun.maxAmmo, buy: () => { player.shotgunAmmo = Math.min(w.shotgun.maxAmmo, player.shotgunAmmo + w.shotgun.ammoPack); } },
      { key: 4, label: `Rifle ammo +${w.rifle.ammoPack}`, price: w.rifle.ammoPrice, can: () => player.owned.rifle && player.rifleAmmo < w.rifle.maxAmmo, buy: () => { player.rifleAmmo = Math.min(w.rifle.maxAmmo, player.rifleAmmo + w.rifle.ammoPack); } },
      { key: 5, label: `Rockets +${w.bazooka.rocketPack}`, price: w.bazooka.rocketPrice, can: () => player.rockets < w.bazooka.rockets, buy: () => { player.rockets = Math.min(w.bazooka.rockets, player.rockets + w.bazooka.rocketPack); } },
      { key: 6, label: 'Armour +50', price: cfg.economy.armourPrice, can: () => player.armour < cfg.player.maxArmour, buy: () => { player.armour = Math.min(cfg.player.maxArmour, player.armour + 50); } },
      { key: 7, label: `SMG — $${w.smg.price} (REP ${w.smg.rep})`, price: w.smg.price, can: () => !player.owned.smg && repPoints() >= w.smg.rep, buy: () => { player.owned.smg = true; player.smgAmmo = w.smg.ammo; } },
      { key: 8, label: `Shotgun — $${w.shotgun.price} (REP ${w.shotgun.rep})`, price: w.shotgun.price, can: () => !player.owned.shotgun && repPoints() >= w.shotgun.rep, buy: () => { player.owned.shotgun = true; player.shotgunAmmo = w.shotgun.ammo; } },
      { key: 9, label: `Rifle — $${w.rifle.price} (REP ${w.rifle.rep})`, price: w.rifle.price, can: () => !player.owned.rifle && repPoints() >= w.rifle.rep, buy: () => { player.owned.rifle = true; player.rifleAmmo = w.rifle.ammo; } },
    ];
  }
  function sprayMenuItems() {
    return [
      { key: 1, label: 'Repair car (condition 100)', price: cfg.economy.repairCost, can: () => !!player.car && (player.car.condition ?? 100) < 100, buy: () => { player.car.condition = 100; player.car.fireWarned = false; } },
      { key: 2, label: 'Repaint — clears the heat', price: cfg.economy.resprayCost, can: () => !!player.car && wanted.stars > 0, buy: () => { if (player.car) resprayCar(player.car); setStars(wanted, 0); } },
      { key: 3, label: 'Bribe — one star off', price: cfg.economy.bribeCost, can: () => wanted.stars > 0, buy: () => { setStars(wanted, wanted.stars - 1); } },
    ];
  }
  // The outfit shop (v9 iteration 5, §2): five shirts, $50 each. The
  // colour applies to Rico's torso, shoulders and upper arms only — the
  // shared shirt material is never touched, so the crowd keeps its own
  // colours. The previous custom shirt material is disposed.
  let playerShirtMat = null;
  function applyShirtColor(color) {
    player.shirtColor = color;
    if (playerShirtMat) playerShirtMat.dispose();
    playerShirtMat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.1 });
    playerMesh.traverse((o) => { if (o.userData && o.userData.part === 'shirt') o.material = playerShirtMat; });
  }
  function outfitMenuItems() {
    return [
      { key: 1, label: 'Kemeja Merah', price: 50, can: () => player.shirtColor !== 0xc23b2e, buy: () => { applyShirtColor(0xc23b2e); } },
      { key: 2, label: 'Kemeja Biru', price: 50, can: () => player.shirtColor !== 0x2e6fc2, buy: () => { applyShirtColor(0x2e6fc2); } },
      { key: 3, label: 'Kemeja Kuning', price: 50, can: () => player.shirtColor !== 0xe8c832, buy: () => { applyShirtColor(0xe8c832); } },
      { key: 4, label: 'Kemeja Hijau', price: 50, can: () => player.shirtColor !== 0x3aa655, buy: () => { applyShirtColor(0x3aa655); } },
      { key: 5, label: 'Kemeja Ungu', price: 50, can: () => player.shirtColor !== 0x8a5fc2, buy: () => { applyShirtColor(0x8a5fc2); } },
    ];
  }
  // Influence makes the city cheaper: 3% off every shop price per level.
  function shopPrice(price) {
    return Math.max(1, Math.round(price * (1 - 0.03 * skillLevel('influence'))));
  }
  function shopMenuItems() {
    if (shopKind === 'gun') return gunMenuItems();
    if (shopKind === 'outfit') return outfitMenuItems();
    return sprayMenuItems();
  }
  // Which shop (if any) the player is standing at — within 8 m of the
  // door, on foot. The gun shop and the spray are 100+ m apart, so the
  // two checks never both fire. v9 iteration 5 (§2): the outfit shop
  // (Butik Neon) and the safehouse (a real landmark, heal + save).
  function nearShop() {
    const pp = playerPos();
    if (Math.hypot(pp.x - cfg.shops.gun.x, pp.z - cfg.shops.gun.z) < 8) return 'gun';
    if (Math.hypot(pp.x - cfg.shops.spray.x, pp.z - cfg.shops.spray.z) < 8) return 'spray';
    if (Math.hypot(pp.x - cfg.shops.outfit.x, pp.z - cfg.shops.outfit.z) < 8) return 'outfit';
    if (Math.hypot(pp.x - city.landmarks.safehouse.x, pp.z - city.landmarks.safehouse.z) < 10) return 'safehouse';
    return null;
  }
  function openShop(kind) {
    // The safehouse is not a menu: E heals Rico to 100 and saves the
    // game on the spot.
    if (kind === 'safehouse') {
      player.health = 100;
      saveGame();
      hud.showMessage('Safehouse — healed to 100, game saved.', 4);
      audio.pickup();
      return;
    }
    shopKind = kind;
    state.screen = SCREEN_SHOP;
    const shop = cfg.shops[kind] || cfg.shops.spray;
    document.getElementById('shop-title').textContent = shop.name;
    renderShopItems();
    document.getElementById('screen-shop').style.display = 'flex';
    document.getElementById('hud').style.display = 'none';
    audio.click();
  }
  function renderShopItems() {
    const el = document.getElementById('shop-items');
    el.innerHTML = shopMenuItems().map((it) => {
      const ok = it.can();
      const price = shopPrice(it.price);
      const afford = player.cash >= price;
      const cls = ok && afford ? '' : ' class="off"';
      const why = !ok ? ' — not available' : !afford ? ' — not enough cash' : '';
      return `<div${cls}>${it.key} · ${it.label} — $${price}${why}</div>`;
    }).join('');
    document.getElementById('shop-cash').textContent = `CASH $${Math.round(player.cash)}  ·  REP ${repPoints()}`;
  }
  function closeShop() {
    shopKind = null;
    document.getElementById('screen-shop').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    state.screen = SCREEN_PLAY;
  }
  function buyShop(digit) {
    const it = shopMenuItems().find((i) => i.key === digit);
    if (!it) return;
    if (!it.can()) { hud.showMessage('Not available yet.', 2); return; }
    const price = shopPrice(it.price);
    if (player.cash < price) { hud.showMessage('Not enough cash.', 2); return; }
    player.cash -= price;
    it.buy();
    // v9 iteration 5 (§2): every purchase teaches Rico the streets —
    // Influence grows and the next shop visit is cheaper.
    addSkillXp('influence', 1);
    audio.pickup();
    hud.showMessage(`Bought: ${it.label} — $${price}`, 2);
    renderShopItems();
  }

  // Courier jobs (v9 iteration 5, §2): E at a gold pickup ring starts a
  // timed delivery — the green ring marks the drop. Pay on arrival;
  // REP-gated jobs stay locked until the rank is earned.
  function nearDeliveryPickup() {
    if (delivery) return -1;
    const p = playerPos();
    for (let i = 0; i < cfg.deliveries.length; i += 1) {
      if (deliveriesDone[i]) continue;
      const d = cfg.deliveries[i];
      if (repPoints() < d.repReq) continue;
      if (Math.hypot(p.x - d.pickup.x, p.z - d.pickup.z) < 4) return i;
    }
    return -1;
  }
  function startDelivery(i) {
    const d = cfg.deliveries[i];
    delivery = { idx: i, timeLeft: d.timeLimit };
    hud.showMessage(`Delivery: ${d.name} — take it to the green ring in ${d.timeLimit}s!`, 4);
    audio.pickup();
  }

  // A battered car is slower: condition 100 runs full speed, condition 0
  // runs at the floor (75%). The number on the HUD is honest about it.
  // v9 iteration 5 (§1/§2): per-class top speed + the Driving skill.
  function carTopSpeed(car) {
    const c = clamp(car.condition ?? 100, 0, 100) / 100;
    const topMul = (car.topMul ?? 1) * (1 + 0.02 * skillLevel('driving'));
    return cfg.car.maxSpeed * topMul * (cfg.car.conditionMinSpeed + (1 - cfg.car.conditionMinSpeed) * c);
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

  // Witness (v9 iteration 5, §4): the nearest living civilian within
  // 25 m of a crime (a kill or a carjacking) sees it and starts
  // reporting — a gold "!" floats over their head for 3 s. If they are
  // still alive after 3 s, the cops get called (+15 heat — one shot plus
  // a witness is still 1 star, the iter-3 balance is kept). Kill them
  // first and nobody talks.
  let witness = null;
  function startWitness(x, z) {
    if (witness) return;
    let best = null;
    let bestD = 25;
    for (const p of pedestrians) {
      const d = Math.hypot(p.group.position.x - x, p.group.position.z - z);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (!best) return;
    witness = { ped: best, timer: 3 };
    markWitness(best);
    hud.showMessage('A witness saw that! Silence them or the cops get called.', 3);
  }
  function clearWitnessState() {
    if (!witness) return;
    clearWitness(witness.ped);
    witness = null;
  }

  // A stopped police cruiser close enough to steal (v9 iteration 5,
  // §1): speed under 1, within enter range. A moving cruiser cannot be
  // jacked — catch one parked or holding at a light.
  function nearestStoppedPoliceCar() {
    const p = playerPos();
    let best = null;
    let bestD = cfg.player.enterCarRange;
    for (const car of wanted.policeCars) {
      if (Math.abs(car.speed || 0) >= 1) continue;
      const d = Math.hypot(car.group.position.x - p.x, car.group.position.z - p.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function enterCar(car) {
    const idx = traffic.indexOf(car);
    const wasTraffic = idx >= 0;
    if (wasTraffic) traffic.splice(idx, 1);
    const pidx = parked.indexOf(car);
    if (pidx >= 0) parked.splice(pidx, 1);
    // v9 iteration 5 (§1): stealing a police car is a crime — the
    // cruiser leaves the wanted fleet (ensurePolice respawns the count)
    // and the theft costs full heat.
    const widx = wanted.policeCars.indexOf(car);
    const wasPolice = widx >= 0;
    if (wasPolice) wanted.policeCars.splice(widx, 1);
    car.route = null;
    car.parked = false;
    car.isPlayer = true;
    car.speed = 0;
    car.driver.visible = true;
    player.inCar = true;
    player.car = car;
    playerMesh.visible = false;
    // v9 iteration 4: smooth camera lerp on entering the car — the
    // camera blends from the foot distance to the car distance instead
    // of snapping. updateCamera reads state.camBlend (see below).
    state.camBlend = 0;
    if (wasPolice) {
      addHeatScaled(cfg.police.stealHeat);
      hud.showMessage('You stole a police car — the whole force is coming!', 4);
    } else if (car.isTarget) addHeatScaled(cfg.police.stealHeat);
    else addHeatScaled(cfg.police.stealHeat * 0.6);
    // v9 iteration 5 (§1/§4): carjacking a traffic car — the civilian
    // flees on foot, and a nearby civilian may witness it.
    if (wasTraffic) {
      const away = { x: Math.sin(car.heading + Math.PI / 2), z: Math.cos(car.heading + Math.PI / 2) };
      const flee = spawnFleeingPed(scene, car.group.position.x, car.group.position.z, away);
      pedestrians.push(flee);
      startWitness(car.group.position.x, car.group.position.z);
    }
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
    // v9 iteration 5 (§3): the exit spot must be on the same surface as
    // the car — on the 4 m pier deck the side step can land in the sea.
    // Try the other side, then the car's own spot.
    const gy = groundYAt(car.group.position.x, car.group.position.z);
    let side = car.group.position.clone();
    side.x += Math.cos(car.heading) * 2.5;
    side.z -= Math.sin(car.heading) * 2.5;
    if (groundYAt(side.x, side.z) !== gy) {
      side = car.group.position.clone();
      side.x -= Math.cos(car.heading) * 2.5;
      side.z += Math.sin(car.heading) * 2.5;
    }
    if (groundYAt(side.x, side.z) !== gy) side = car.group.position.clone();
    playerMesh.position.set(side.x, gy, side.z);
    player.groundY = gy;
    playerMesh.visible = true;
    player.heading = car.heading;
    player.inCar = false;
    player.car = null;
    // v9 iteration 4: smooth camera lerp on exiting the car.
    state.camBlend = 0;
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
    // v9 iteration 4: V costs $25 a car (money as a progression sink).
    // The check runs BEFORE the cooldown is set, so a broke player can
    // keep trying — the cooldown only starts on a successful spawn.
    if (player.cash < cfg.economy.spawnCarCost) {
      hud.showMessage(`A fast car costs $${cfg.economy.spawnCarCost} — earn more first. (V)`, 3);
      return;
    }
    player.cash -= cfg.economy.spawnCarCost;
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
      // Memory-leak guard (item 12): free the evicted car's per-instance
      // resources (head/tail light materials) before dropping it.
      disposeCarMesh(old.group);
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
  // v9 iteration 4: hurting a King aggros the whole faction.
  function hurtEnemy(e, dmg) {
    if (!e.alive) return;
    state.factionAggro = true;
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

  // Knife (v9 iteration 3): a melee arc in front of the player — anything
  // within range and inside the swing width takes the hit. Flat damage,
  // deterministic, no randomness.
  function knifeSwing() {
    if (player.shootCooldown > 0) return;
    player.shootCooldown = cfg.weapons.knife.cooldown;
    player.swingT = 0.25;
    // A swing is a gunshot as far as the crowd is concerned.
    state.lastShotAt = state.time;
    const origin = playerMesh.position;
    const dir = { x: Math.sin(state.camYaw), z: Math.cos(state.camYaw) };
    let best = null;
    let bestDist = cfg.weapons.knife.range;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.group.position.x - origin.x;
      const dz = e.group.position.z - origin.z;
      const along = dx * dir.x + dz * dir.z;
      if (along < 0 || along > bestDist) continue;
      if (Math.abs(dx * dir.z - dz * dir.x) < 1.1) { best = { kind: 'enemy', obj: e }; bestDist = along; }
    }
    if (!best) {
      for (const b of city.barrels) {
        if (!b.alive) continue;
        const dx = b.x - origin.x;
        const dz = b.z - origin.z;
        const along = dx * dir.x + dz * dir.z;
        if (along < 0 || along > bestDist) continue;
        if (Math.abs(dx * dir.z - dz * dir.x) < 1.1) { best = { kind: 'barrel', obj: b }; bestDist = along; }
      }
    }
    if (!best) {
      for (const p of pedestrians) {
        const dx = p.group.position.x - origin.x;
        const dz = p.group.position.z - origin.z;
        const along = dx * dir.x + dz * dir.z;
        if (along < 0 || along > bestDist) continue;
        if (Math.abs(dx * dir.z - dz * dir.x) < 1.1) { best = { kind: 'ped', obj: p }; bestDist = along; }
      }
    }
    if (best) {
      const hx = origin.x + dir.x * bestDist;
      const hz = origin.z + dir.z * bestDist;
      burst(hx, 1.2, hz, 6);
      if (best.kind === 'enemy') hurtEnemy(best.obj, cfg.weapons.knife.damage);
      else if (best.kind === 'barrel') explodeBarrel(best.obj);
      else {
        const idx = pedestrians.indexOf(best.obj);
        if (idx >= 0) {
          // v9 iteration 5 (§4): a knife kill is a witnessed crime — if
          // the victim was the witness, they cannot report.
          if (witness && witness.ped === best.obj) clearWitnessState();
          scene.remove(best.obj.group);
          pedestrians.splice(idx, 1);
        }
        addHeatScaled(cfg.police.hitPedHeat);
        startWitness(origin.x, origin.z);
      }
    }
    audio.click();
    for (const p of pedestrians) updatePedestrian(p, 0, cfg, { x: origin.x, z: origin.z });
    ensurePolice(wanted, scene, playerPos(), rng, { heading: state.camYaw, roadLines: city.roadLines });
  }

  // Bazooka (v9 iteration 3): one rocket per trigger pull, straight line,
  // limited ammo. The rocket is stepped in updateRockets(); this only
  // launches it.
  function fireRocket() {
    if (player.shootCooldown > 0) return;
    if (player.rockets <= 0) {
      hud.showMessage('Out of rockets — finish a job to restock.', 3);
      audio.click();
      return;
    }
    const slot = rockets.find((r) => !r.active);
    if (!slot) return;
    player.shootCooldown = cfg.weapons.bazooka.cooldown;
    player.rockets -= 1;
    state.lastShotAt = state.time;
    const origin = player.inCar && player.car
      ? player.car.group.position.clone().setY(1.4)
      : playerMesh.position.clone().setY(1.5);
    slot.active = true;
    slot.life = 0;
    slot.dx = Math.sin(state.camYaw);
    slot.dz = Math.cos(state.camYaw);
    slot.mesh.position.set(origin.x, 1.5, origin.z);
    slot.mesh.rotation.y = Math.atan2(slot.dx, slot.dz);
    slot.mesh.visible = true;
    muzzle.position.set(origin.x + slot.dx * 1.2, 1.5, origin.z + slot.dz * 1.2);
    muzzle.scale.setScalar(1.6);
    muzzle.visible = true;
    if (!state.shotMode) setTimeout(() => { muzzle.visible = false; }, 90);
    audio.crash();
    addHeatScaled(cfg.police.shootHeat);
  }

  // Rocket flight + blast. Deterministic damage: every enemy in the blast
  // radius takes the same flat hit; barrels in the radius go up too.
  function updateRockets(dt) {
    for (const r of rockets) {
      if (!r.active) continue;
      r.life += dt;
      const step = cfg.weapons.bazooka.rocketSpeed * dt;
      r.mesh.position.x += r.dx * step;
      r.mesh.position.z += r.dz * step;
      burst(r.mesh.position.x, r.mesh.position.y, r.mesh.position.z, 1);
      let hit = r.life * cfg.weapons.bazooka.rocketSpeed >= cfg.weapons.bazooka.range;
      if (!hit) {
        for (const e of enemies) {
          if (!e.alive) continue;
          if (Math.hypot(e.group.position.x - r.mesh.position.x, e.group.position.z - r.mesh.position.z) < 1.6) { hit = true; break; }
        }
      }
      if (!hit) {
        for (const b of city.barrels) {
          if (!b.alive) continue;
          if (Math.hypot(b.x - r.mesh.position.x, b.z - r.mesh.position.z) < 1.6) { hit = true; break; }
        }
      }
      if (!hit) {
        for (const p of pedestrians) {
          if (Math.hypot(p.group.position.x - r.mesh.position.x, p.group.position.z - r.mesh.position.z) < 1.6) { hit = true; break; }
        }
      }
      if (hit) {
        r.active = false;
        r.mesh.visible = false;
        const ex = r.mesh.position.x;
        const ez = r.mesh.position.z;
        burst(ex, 1.2, ez, 24);
        blastFlash.position.set(ex, 1.4, ez);
        blastFlash.scale.setScalar(1);
        blastFlash.material.opacity = 0.9;
        blastFlash.visible = true;
        blastT = 0.35;
        state.shake = Math.max(state.shake || 0, 0.6);
        audio.crash();
        // v9 iteration 4: the blast is a positional sound at its real
        // position, and it scares the crowd like a gunshot does.
        audio.positionalShot(ex, 1.4, ez, 'blast');
        state.lastShotAt = state.time;
        for (const p of pedestrians) updatePedestrian(p, 0, cfg, { x: ex, z: ez });
        const R = cfg.weapons.bazooka.blastRadius;
        for (const e of enemies) {
          if (!e.alive) continue;
          if (Math.hypot(e.group.position.x - ex, e.group.position.z - ez) < R) hurtEnemy(e, cfg.weapons.bazooka.blastDamage);
        }
        for (const b of city.barrels) {
          if (!b.alive) continue;
          if (Math.hypot(b.x - ex, b.z - ez) < R) explodeBarrel(b);
        }
        let pedHit = false;
        for (let i = pedestrians.length - 1; i >= 0; i -= 1) {
          const p = pedestrians[i];
          if (Math.hypot(p.group.position.x - ex, p.group.position.z - ez) < R) {
            // v9 iteration 5 (§4): a blast kill is a witnessed crime —
            // if a victim was the witness, they cannot report.
            if (witness && witness.ped === p) clearWitnessState();
            scene.remove(p.group);
            pedestrians.splice(i, 1);
            pedHit = true;
          }
        }
        if (pedHit) { addHeatScaled(cfg.police.hitPedHeat); startWitness(ex, ez); }
      }
    }
    if (blastT > 0) {
      blastT -= dt;
      const k = Math.max(0, blastT / 0.35);
      blastFlash.scale.setScalar(1 + (1 - k) * 10);
      blastFlash.material.opacity = 0.9 * k;
      if (blastT <= 0) blastFlash.visible = false;
    }
  }

  // One hitscan path for all four guns (v9 iteration 4): each gun has
  // its own damage, cooldown, range, spread (perp tolerance) and
  // magazine. The pistol is weapon 0, SMG 3, shotgun 4, rifle 5.
  function fireHitscan(damage, range, perp) {
    const origin = player.inCar && player.car
      ? player.car.group.position.clone().setY(1.4)
      : playerMesh.position.clone().setY(1.5);
    const dir = { x: Math.sin(state.camYaw), z: Math.cos(state.camYaw) };
    const end = { x: origin.x + dir.x * range, y: 1.2, z: origin.z + dir.z * range };
    let hit = null;
    let hitDist = range;
    // Enemies first.
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.group.position.x - origin.x;
      const dz = e.group.position.z - origin.z;
      const along = dx * dir.x + dz * dir.z;
      if (along < 0 || along > hitDist) continue;
      const p = Math.abs(dx * dir.z - dz * dir.x);
      if (p < perp) {
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
        const p = Math.abs(dx * dir.z - dz * dir.x);
        if (p < perp) {
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
        const pp = Math.abs(dx * dir.z - dz * dir.x);
        if (pp < perp) {
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
        hurtEnemy(hit.obj, damage);
        // v9 iteration 5 (§2): a hit is +1 Aim XP.
        addSkillXp('aim', 1);
      } else if (hit.kind === 'barrel') {
        explodeBarrel(hit.obj);
      } else {
        const idx = pedestrians.indexOf(hit.obj);
        if (idx >= 0) {
          // v9 iteration 5 (§4): a shot kill is a witnessed crime — if
          // the victim was the witness, they cannot report.
          if (witness && witness.ped === hit.obj) clearWitnessState();
          scene.remove(hit.obj.group);
          pedestrians.splice(idx, 1);
        }
        addHeatScaled(cfg.police.hitPedHeat);
        startWitness(origin.x, origin.z);
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
    addHeatScaled(cfg.police.shootHeat);
    // Any gunshot scares the crowd — the threat is the shot itself, not
    // the weapon that fired it.
    state.lastShotAt = state.time;
    for (const p of pedestrians) {
      updatePedestrian(p, 0, cfg, { x: origin.x, z: origin.z });
    }
    ensurePolice(wanted, scene, playerPos(), rng, { heading: state.camYaw, roadLines: city.roadLines });
  }

  function shoot() {
    // Weapon dispatch: the knife swings in front, the bazooka launches a
    // rocket. In a car the knife falls back to the pistol (no room to
    // swing); the bazooka fires from the car.
    if (!player.inCar && player.weapon === 1) { knifeSwing(); return; }
    if (player.weapon === 2) { fireRocket(); return; }
    // v9 iteration 4: limited ammo. Each gun draws from its own
    // magazine; empty means a trip to Ammu-Nation, not an infinite gun.
    const guns = {
      0: { damage: cfg.player.shootDamage, cooldown: cfg.player.shootCooldown, range: cfg.player.shootRange, perp: 1.2, ammo: () => player.ammo, spend: () => { player.ammo -= 1; } },
      3: { damage: cfg.weapons.smg.damage, cooldown: cfg.weapons.smg.cooldown, range: cfg.weapons.smg.range, perp: cfg.weapons.smg.perp, ammo: () => player.smgAmmo, spend: () => { player.smgAmmo -= 1; } },
      4: { damage: cfg.weapons.shotgun.damage, cooldown: cfg.weapons.shotgun.cooldown, range: cfg.weapons.shotgun.range, perp: cfg.weapons.shotgun.perp, ammo: () => player.shotgunAmmo, spend: () => { player.shotgunAmmo -= 1; } },
      5: { damage: cfg.weapons.rifle.damage, cooldown: cfg.weapons.rifle.cooldown, range: cfg.weapons.rifle.range, perp: cfg.weapons.rifle.perp, ammo: () => player.rifleAmmo, spend: () => { player.rifleAmmo -= 1; } },
    };
    const gun = guns[player.weapon] || guns[0];
    if (player.shootCooldown > 0) return;
    if (gun.ammo() <= 0) {
      hud.showMessage('Out of ammo — buy more at Ammu-Nation', 2);
      audio.click();
      player.shootCooldown = 0.3;
      return;
    }
    gun.spend();
    player.shootCooldown = gun.cooldown;
    // v9 iteration 5 (§2): Aim widens the hitscan tolerance, 5% a level.
    fireHitscan(gun.damage, gun.range, gun.perp * (1 + 0.05 * skillLevel('aim')));
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
      tryStartMission(missions.index);
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
    // Bazooka restock on respawn (v9 iteration 3): waking up at the
    // hospital refills the rockets to the full 8.
    player.rockets = cfg.weapons.bazooka.rockets;
    // v9 iteration 4: the hospital refills the pistol too — a dead man
    // walks out with a full magazine, not an empty gun.
    player.ammo = cfg.player.pistolAmmo;
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
      tryStartMission(missions.index);
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
        // v9 iteration 4: ammo, owned weapons and free-roam REP are part
        // of the save now — a reloaded game keeps its magazines, its
        // SMG, and its race/stunt REP.
        ammo: player.ammo,
        rockets: player.rockets,
        smgAmmo: player.smgAmmo,
        shotgunAmmo: player.shotgunAmmo,
        rifleAmmo: player.rifleAmmo,
        owned: player.owned,
        repBonus: player.repBonus,
        racesWon: racesWon,
        stunts: stunts,
        // v9 iteration 5: medals, per-race wins, landed ramps, courier
        // jobs, skills and the shirt colour are saved too.
        medals: medals.takenIndices(),
        raceWins,
        landedRamps: [...landedRamps],
        deliveriesDone,
        skills: player.skills,
        shirtColor: player.shirtColor,
      };
      window.localStorage.setItem(cfg.saveKey, JSON.stringify(data));
      hud.showAutosave('SAVED');
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
    const sx = data.x ?? -112;
    const sz = data.z ?? 60;
    playerMesh.position.set(sx, groundYAt(sx, sz), sz);
    player.groundY = groundYAt(sx, sz);
    player.heading = data.heading ?? 0;
    state.camYaw = player.heading;
    missions.index = Math.min(data.missionIndex ?? 0, MISSION_DEFS.length - 1);
    if (Array.isArray(data.packages)) packages.restore(data.packages);
    // v9 iteration 4: magazines, owned weapons and free-roam REP. Old
    // saves (before these fields existed) fall back to the defaults.
    player.ammo = data.ammo ?? cfg.player.pistolAmmo;
    player.rockets = data.rockets ?? cfg.weapons.bazooka.rockets;
    player.smgAmmo = data.smgAmmo ?? 0;
    player.shotgunAmmo = data.shotgunAmmo ?? 0;
    player.rifleAmmo = data.rifleAmmo ?? 0;
    player.owned = data.owned ?? { smg: false, shotgun: false, rifle: false };
    player.repBonus = data.repBonus ?? 0;
    racesWon = data.racesWon ?? 0;
    stunts = data.stunts ?? 0;
    // v9 iteration 5: medals, per-race wins, landed ramps, courier
    // jobs, skills and the shirt colour. Old saves fall back to a fresh
    // free-roam state.
    if (Array.isArray(data.medals)) medals.restore(data.medals);
    raceWins = Array.isArray(data.raceWins) && data.raceWins.length === 3 ? data.raceWins : [false, false, false];
    raceIdx = -1;
    landedRamps.clear();
    if (Array.isArray(data.landedRamps)) for (const r of data.landedRamps) landedRamps.add(r);
    deliveriesDone = Array.isArray(data.deliveriesDone) && data.deliveriesDone.length === 3 ? data.deliveriesDone : [false, false, false];
    delivery = null;
    player.skills = data.skills ?? { driving: 0, stamina: 0, aim: 0, stealth: 0, influence: 0, street: 0 };
    player.driveDist = 0;
    player.sprintT = 0;
    if (data.shirtColor && data.shirtColor !== 0x2a7a8c) applyShirtColor(data.shirtColor);
    else if (!data.shirtColor) player.shirtColor = 0x2a7a8c;
  }

  // One line of save summary for the title screen's Continue button, so
  // the player sees where they left off before they press anything.
  function saveSummary(data) {
    if (!data) return '';
    const def = MISSION_DEFS[Math.min(data.missionIndex ?? 0, MISSION_DEFS.length - 1)];
    const rep = (data.missionIndex ?? 0) * cfg.player.repPerJob
      + (Array.isArray(data.packages) ? data.packages.length : 0) * cfg.player.repPerPackage
      + (data.repBonus ?? 0);
    return `CH.${def.id} ${def.title.toUpperCase()} · $${Math.round(data.cash ?? 150)} · REP ${rep} · DAY ${data.day ?? 1}`;
  }

  // v9 iteration 4: mission 6 (The Big Score, index 5) needs REP 30.
  // A gated start leaves the mission idle and sets the repGate flag, so
  // the HUD objective says what is missing; the gate clears itself the
  // moment the REP is earned (checked every step after the mission
  // update).
  function tryStartMission(idx) {
    if (idx === 5 && repPoints() < 30) {
      missions.state = 'idle';
      missions.repGate = true;
      hud.showMessage('The Big Score needs REP 30 — run street races and stunts to earn it.', 5);
      return;
    }
    missions.repGate = false;
    startMission(missions, idx, cfg);
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
      player.groundY = 0;
      player.heading = 0;
      state.camYaw = 0;
      missions.index = 0;
      packages.restore([]);
      // v9 iteration 5: a New Game resets the whole free-roam state —
      // medals, races, stunts, deliveries, skills and the shirt — so a
      // fresh run starts clean instead of inheriting the old one.
      medals.restore([]);
      raceWins = [false, false, false];
      raceIdx = -1;
      racesWon = 0;
      landedRamps.clear();
      stunts = 0;
      deliveriesDone = [false, false, false];
      delivery = null;
      player.skills = { driving: 0, stamina: 0, aim: 0, stealth: 0, influence: 0, street: 0 };
      player.driveDist = 0;
      player.sprintT = 0;
      if (player.shirtColor !== 0x2a7a8c) applyShirtColor(0x2a7a8c);
    }
    missions.state = 'idle';
    missions.stage = 0;
    missions.timer = 0;
    player.dead = false;
    // A held Space from the title screen must not fire a jump on spawn.
    player.prevBrake = input.brake();
    player.vy = 0;
    player.grounded = true;
    playerMesh.position.y = player.groundY;
    state.screen = SCREEN_PLAY;
    audio.unlock();
    tryStartMission(missions.index);
    if (missions.index === 3) setStars(wanted, 3);
    if (missions.index === 4) spawnMissionEnemies();
    hud.showMessage(missions.message, 7);
    saveGame();
  }

  // Continuous day cycle (v9 iteration 4): the light interpolates
  // keyframes by the clock hour — night, dawn, day, dusk, night — so the
  // sky dome, sun, hemisphere light and fog density all move with the
  // HUD clock. The dusk plateau (17.5-19.5) holds the old golden-hour
  // look EXACTLY (sun 1.6, hemi 0.48, ambient 0.5, lamps 12, dusk sky
  // palette), so staged shots still render the same dusk.
  function updateDaylight() {
    const night = cfg.night;
    const h = state.clockHour;
    // Keyframes: [hour, sun, hemi, ambient, lamps, fogDensity, sky set].
    // 'dusk' is the v8 palette; 'day' and 'night' are their own sets.
    const keys = [
      { h: 0, sun: 0.35, hemi: 0.25, amb: 0.25, lamps: 18, fogD: 0.0035, set: 'night' },
      { h: 5, sun: 0.35, hemi: 0.25, amb: 0.25, lamps: 18, fogD: 0.0035, set: 'night' },
      { h: 7, sun: 1.2, hemi: 0.5, amb: 0.45, lamps: 8, fogD: 0.0022, set: 'dusk' },
      { h: 9, sun: 2.4, hemi: 0.75, amb: 0.6, lamps: 2, fogD: 0.0014, set: 'day' },
      { h: 16, sun: 2.4, hemi: 0.75, amb: 0.6, lamps: 2, fogD: 0.0014, set: 'day' },
      { h: 17.5, sun: 1.6, hemi: 0.48, amb: 0.5, lamps: 12, fogD: 0.0022, set: 'dusk' },
      { h: 19.5, sun: 1.6, hemi: 0.48, amb: 0.5, lamps: 12, fogD: 0.0022, set: 'dusk' },
      { h: 21, sun: 0.35, hemi: 0.25, amb: 0.25, lamps: 18, fogD: 0.0035, set: 'night' },
      { h: 24, sun: 0.35, hemi: 0.25, amb: 0.25, lamps: 18, fogD: 0.0035, set: 'night' },
    ];
    let a = keys[0];
    let b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i += 1) {
      if (h >= keys[i].h && h <= keys[i + 1].h) { a = keys[i]; b = keys[i + 1]; break; }
    }
    const span = Math.max(0.0001, b.h - a.h);
    const t = clamp((h - a.h) / span, 0, 1);
    const lerp = (x, y) => x + (y - x) * t;
    const sunI = lerp(a.sun, b.sun);
    const hemiI = lerp(a.hemi, b.hemi);
    const ambI = lerp(a.amb, b.amb);
    const lampI = lerp(a.lamps, b.lamps);
    const fogD = lerp(a.fogD, b.fogD);
    // Sky palette: pick by the nearer keyframe's set (the plateau keys
    // share 'dusk', so the dusk frame is exact, not a blend).
    const set = t < 0.5 ? a.set : b.set;
    if (set === 'night') {
      scene.background = new THREE.Color(night.fog);
      scene.fog.color.setHex(night.fog);
      skyDome.material.uniforms.top.value.setHex(night.skyTop);
      skyDome.material.uniforms.mid.value.setHex(night.skyMid);
      skyDome.material.uniforms.low.value.setHex(night.skyLow);
      sun.color.setHex(night.sun);
      sun.position.set(60, 120, 60);
    } else if (set === 'day') {
      scene.background = new THREE.Color(cfg.palette.skyDay);
      scene.fog.color.setHex(cfg.palette.fog);
      skyDome.material.uniforms.top.value.setHex(0x3a7bd5);
      skyDome.material.uniforms.mid.value.setHex(0x7ab5e8);
      skyDome.material.uniforms.low.value.setHex(0xcfe8f5);
      sun.color.setHex(0xfff2d8);
      sun.position.set(60, 180, 60);
    } else {
      scene.background = new THREE.Color(cfg.palette.skyDusk);
      scene.fog.color.setHex(cfg.palette.fog);
      skyDome.material.uniforms.top.value.setHex(cfg.palette.skyTop);
      skyDome.material.uniforms.mid.value.setHex(cfg.palette.skyMid);
      skyDome.material.uniforms.low.value.setHex(cfg.palette.skyLow);
      sun.color.setHex(0xffb27a);
      sun.position.set(70, 67, 60);
    }
    sun.intensity = sunI;
    hemi.intensity = hemiI;
    ambient.intensity = ambI;
    // v9 iteration 5 (§5): the graphics preset scales the fog — LOW
    // thickens it (fogMul 1.3), HIGH thins it (0.8). The title screen
    // overrides the density afterwards, so this never fights the §6
    // dusk haze.
    scene.fog.density = fogD * (state.fogMul ?? 1);
    // The beachfront lamps glow with the dark.
    for (const l of city.streetlights) l.intensity = lampI;
    // The sea shader follows the sun (glint direction + colour).
    if (city.updateSea) {
      const sunDir = sun.position.clone().normalize();
      city.updateSea(state.time, sunDir, sun.color);
    }
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
      // v9 iteration 4: at 5 stars (MAXIMUM) the heli stops orbiting and
      // hovers directly over the player — the spotlight TRACKS them, and
      // the heat does not cool while the beam is on them. At 4 stars it
      // still orbits at 22 m, as before.
      const tracking = wanted.stars >= cfg.police.spotlightStars;
      const a = state.time * 0.12;
      const tx = tracking ? pp.x : pp.x + Math.cos(a) * 22;
      const tz = tracking ? pp.z : pp.z + Math.sin(a) * 22;
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
    // v9 iteration 4: the lit lamp is HDR (> 1) so it blooms — the bloom
    // threshold is 0.9 and a plain 0xff2222 would not clear it. The off
    // lamp of each pair stays dim.
    const on = { red: [2.0, 0.25, 0.25], yellow: [2.0, 1.7, 0.4], green: [0.3, 2.0, 0.5] };
    const off = { red: [0.4, 0.07, 0.07], yellow: [0.33, 0.27, 0.07], green: [0.07, 0.27, 0.13] };
    const set = (mat, rgb) => mat.color.setRGB(rgb[0], rgb[1], rgb[2]);
    for (const head of city.lightHeads) {
      set(head.mats.ns.red, ns === 'red' ? on.red : off.red);
      set(head.mats.ns.yellow, ns === 'yellow' ? on.yellow : off.yellow);
      set(head.mats.ns.green, ns === 'green' ? on.green : off.green);
      set(head.mats.ew.red, ew === 'red' ? on.red : off.red);
      set(head.mats.ew.yellow, ew === 'yellow' ? on.yellow : off.yellow);
      set(head.mats.ew.green, ew === 'green' ? on.green : off.green);
    }
  }

  // Everything the HUD needs, in one place, so the live loop and the
  // screenshot staging can never drift apart.
  function hudPayload() {
    const def = currentMission(missions);
    const target = currentTarget(missions);
    const pp = playerPos();
    let objective = missionObjectiveText(missions);
    if (state.race) objective = `STREET RACE — ${raceIdx >= 0 ? cfg.races[raceIdx].name : ''} — checkpoint ${state.race.cp}/3 · ${Math.ceil(state.race.timeLeft)}s left`;
    if (delivery) objective = `DELIVERY — ${cfg.deliveries[delivery.idx].name} — ${Math.ceil(delivery.timeLeft)}s left`;
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
      // v9 iteration 4: the crosshair shows on foot as before — and in a
      // car while the player is aiming (drive-by).
      crosshair: state.screen === SCREEN_PLAY && (!player.inCar || input.aiming()),
      pursuers: wanted.stars > 0 ? pursuers(wanted, pp) : [],
      spotlight: wanted.heliOverhead,
      // v9 iteration 4: standing in a police vision cone (the HUD warns
      // "SPOTLIGHT ON YOU — BREAK LINE OF SIGHT").
      inVisionCone: wanted.stars > 0 && inVisionCone(pp.x, pp.z),
      packages: packages.count(),
      packagesTotal: cfg.packages.count,
      weapon: player.weapon,
      rockets: player.rockets,
      // v9 iteration 4: ammo counts + owned shop weapons for the HUD
      // weapon slots (4 SMG, 5 shotgun, 6 rifle show their ammo or the
      // REP lock).
      ammo: player.ammo,
      smgAmmo: player.smgAmmo,
      shotgunAmmo: player.shotgunAmmo,
      rifleAmmo: player.rifleAmmo,
      owned: player.owned,
      racesWon,
      stunts,
      // Two seasons (v9 iteration 3): odd days rain, even days dry.
      season: state.day % 2 === 1 ? 'RAINY SEASON' : 'DRY SEASON',
      // v9 iteration 5 (§2/§3/§5): weekday (day 1 is Friday, like the
      // story's first day), the street underfoot, the REP rank + progress
      // to the next rank, medals, skill levels, the active delivery and
      // the active race name — the HUD renders all of these.
      weekday: ['FRI', 'SAT', 'SUN', 'MON', 'TUE', 'WED', 'THU'][(state.day - 1) % 7],
      street: streetAt(pp.x, pp.z, cfg),
      repRank: repRank(repPoints()).name,
      repProgress: repProgress(),
      medals: medals.count(),
      medalsTotal: cfg.medals.count,
      skills: {
        driving: skillLevel('driving'),
        stamina: skillLevel('stamina'),
        aim: skillLevel('aim'),
        stealth: skillLevel('stealth'),
        influence: skillLevel('influence'),
        street: skillLevel('street'),
      },
      delivery: delivery ? { name: cfg.deliveries[delivery.idx].name, timeLeft: Math.ceil(delivery.timeLeft) } : null,
      raceName: state.race && raceIdx >= 0 ? cfg.races[raceIdx].name : null,
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
    // v9 iteration 4: ADS — right mouse held zooms the camera in (0.55×
    // distance), over-the-shoulder. The drag fallback keeps the same path.
    const aimK = input.aiming() ? 0.55 : 1;
    // Smooth camera lerp on enter/exit (v9 iteration 4): camBlend ramps
    // 0→1 after a transition; while it is below 1 the distance and height
    // interpolate between the foot and car values instead of snapping.
    state.camBlend = Math.min(1, state.camBlend + dt * 2.5);
    const blendK = player.inCar ? state.camBlend : 1 - state.camBlend;
    const dist = (cfg.camera.footDistance + (cfg.camera.carDistance - cfg.camera.footDistance) * blendK) * aimK;
    const height = cfg.camera.footHeight + (cfg.camera.carHeight - cfg.camera.footHeight) * blendK;
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

  // Graphics presets + settings sliders (v9 iteration 5, §5): every
  // control changes the live game. A preset sets all values at once;
  // moving any slider switches the preset to CUSTOM. The probe asserts
  // the real effects (bloom on/off, traffic count, camera far, volumes).
  function applySettings() {
    const s = state.settings;
    const p = cfg.presets[s.preset] || cfg.presets.MED;
    const pr = Math.min(window.devicePixelRatio || 1, p.pixelRatio);
    renderer.setPixelRatio(pr);
    composer.setPixelRatio(pr);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloomPass.enabled = p.bloom;
    // Toggling shadows at runtime needs a material recompile, or the
    // change never shows — force it once, on change only.
    if (renderer.shadowMap.enabled !== p.shadows) {
      renderer.shadowMap.enabled = p.shadows;
      scene.traverse((o) => {
        if (!o.material) return;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) m.needsUpdate = true;
      });
    }
    const size = p.shadowSize;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    camera.far = s.viewDistance;
    camera.updateProjectionMatrix();
    state.fogMul = p.fogMul;
    // Traffic: add or remove live cars to match the slider.
    while (traffic.length < s.traffic) traffic.push(spawnTrafficCar(scene, rng, cfg, city.roadLines, city.half));
    while (traffic.length > s.traffic) {
      const car = traffic.pop();
      scene.remove(car.group);
      disposeCarMesh(car.group);
    }
    // Crowd: add or remove walking peds (vendors are never touched).
    while (walkerCount < s.crowd) {
      pedestrians.splice(walkerCount, 0, spawnPedestrian(scene, rng, cfg, city.blockCenters));
      walkerCount += 1;
    }
    while (walkerCount > s.crowd) {
      const ped = pedestrians[walkerCount - 1];
      if (witness && witness.ped === ped) clearWitnessState();
      scene.remove(ped.group);
      pedestrians.splice(walkerCount - 1, 1);
      walkerCount -= 1;
    }
    audio.setVolumes({ master: s.master, music: s.music, effects: s.effects, engine: s.engine });
  }

  // The pause screen's skill list (v9 iteration 5, §2): level + XP
  // progress for all six skills, refreshed every time the pause opens.
  function renderPauseSkills() {
    const el = document.getElementById('pause-skills');
    if (!el) return;
    const names = { driving: 'Driving', stamina: 'Stamina', aim: 'Aim', stealth: 'Stealth', influence: 'Influence', street: 'Street Sense' };
    el.innerHTML = Object.keys(names).map((k) => {
      const lvl = skillLevel(k);
      const xp = player.skills[k] || 0;
      const maxLvl = cfg.skillLevels.length - 1;
      const cur = cfg.skillLevels[lvl];
      const next = cfg.skillLevels[Math.min(lvl + 1, maxLvl)];
      const pct = lvl >= maxLvl ? 100 : Math.round(((xp - cur) / (next - cur)) * 100);
      return `<div>${names[k]} — LV ${lvl} · ${pct}%</div>`;
    }).join('');
  }

  function step(dt) {
    state.time += dt;
    state.clockHour += (dt / cfg.time.dayLength) * 24;
    if (state.clockHour >= 24) {
      state.clockHour -= 24;
      state.day += 1;
    }
    applySeason();
    player.shootCooldown = Math.max(0, player.shootCooldown - dt);
    state.resprayCooldown = Math.max(0, state.resprayCooldown - dt);
    state.spawnCarCooldown = Math.max(0, state.spawnCarCooldown - dt);
    updateLights(dt);
    updateRain(dt);

    // Camera: Pointer Lock deltas when locked, mouse drag as the
    // fallback. v9 iteration 4: the lock path is the primary one (left
    // click locks); the drag path stays for headless probes and lock
    // failures. Any camera input marks the aim time (drive-by override).
    const locked = input.takePointer();
    const drag = input.takeDrag();
    const look = { x: locked.x + drag.x, y: locked.y + drag.y };
    // v9 iteration 5 (§5): the mouse-sensitivity slider scales both
    // axes of the look input.
    const sens = state.settings?.mouseSens ?? 1;
    state.camYaw -= look.x * cfg.camera.lookSpeed * sens;
    state.camPitch = clamp(state.camPitch + look.y * 0.002 * sens, cfg.camera.pitchMin, cfg.camera.pitchMax);
    if (look.x !== 0 || look.y !== 0) state.lastAimTime = state.time;

    const actions = takePendingActions();
    if (actions & ACTION_RESTART) {
      if (missions.state !== 'idle' || missions.index < MISSION_DEFS.length) {
        failMission(missions);
        tryStartMission(missions.index);
        hud.showMessage(`Restarted: ${currentMission(missions).title}`, 4);
      }
    }
    if (state.screen !== SCREEN_PLAY) return;

    if (actions & ACTION_CONFIRM) audio.unlock();
    if (actions & ACTION_ENTER) {
      if (player.inCar) exitCar();
      else {
        // v9 iteration 4: E opens a shop when on foot near its door —
        // the car check runs second, so a parked car by the shop never
        // blocks the door. v9 iteration 5: a delivery pickup and the
        // safehouse come before the car too; a stopped police cruiser
        // can be stolen like any other car.
        const shop = nearShop();
        if (shop) openShop(shop);
        else {
          const del = nearDeliveryPickup();
          if (del >= 0) startDelivery(del);
          else {
            const car = nearestCar(cfg.player.enterCarRange) || nearestStoppedPoliceCar();
            if (car) enterCar(car);
          }
        }
      }
    }
    if (actions & ACTION_SHOOT) shoot();
    if (actions & ACTION_SPAWN_CAR) spawnPlayerCar();
    // Weapon switch (v9 iteration 3): 1 pistol, 2 knife, 3 bazooka.
    if (actions & ACTION_WEAPON_1) { player.weapon = 0; audio.click(); updateWeaponModels(); }
    if (actions & ACTION_WEAPON_2) { player.weapon = 1; audio.click(); updateWeaponModels(); }
    if (actions & ACTION_WEAPON_3) { player.weapon = 2; audio.click(); updateWeaponModels(); }
    // v9 iteration 4: 4 SMG, 5 shotgun, 6 rifle — shop weapons, and the
    // key does nothing until the weapon is owned (the HUD slot says so).
    if (actions & ACTION_WEAPON_4) {
      if (player.owned.smg) { player.weapon = 3; audio.click(); updateWeaponModels(); }
      else hud.showMessage('SMG locked — buy it at Ammu-Nation (REP 20).', 2);
    }
    if (actions & ACTION_WEAPON_5) {
      if (player.owned.shotgun) { player.weapon = 4; audio.click(); updateWeaponModels(); }
      else hud.showMessage('Shotgun locked — buy it at Ammu-Nation (REP 40).', 2);
    }
    if (actions & ACTION_WEAPON_6) {
      if (player.owned.rifle) { player.weapon = 5; audio.click(); updateWeaponModels(); }
      else hud.showMessage('Rifle locked — buy it at Ammu-Nation (REP 60).', 2);
    }

    const p = playerPos();
    if (player.inCar && player.car) {
      const car = player.car;
      const top = carTopSpeed(car);
      const fwd = input.forward() ? 1 : input.back() ? -1 : 0;
      const steer = (input.left() ? 1 : 0) - (input.right() ? 1 : 0);
      // v9 iteration 5 (§1/§2): per-class handling — acceleration,
      // steering and grip come from the car's spec, and Driving XP
      // raises every class's top speed (see carTopSpeed).
      if (fwd > 0) car.speed += cfg.car.accel * (car.accelMul ?? 1) * dt * (input.run() ? 1.35 : 1);
      else if (fwd < 0) {
        if (car.speed > 0.5) car.speed -= cfg.car.brake * dt;
        else car.speed -= cfg.car.reverseAccel * dt;
      } else {
        car.speed -= Math.sign(car.speed) * cfg.car.grip * (car.gripMul ?? 1) * dt * 0.6;
        if (Math.abs(car.speed) < 0.3) car.speed = 0;
      }
      if (input.brake()) {
        // v9 iteration 4: Space is the handbrake now — half the brake
        // rate, but the car turns harder while it is held (drift): the
        // rear lateral grip drops, the yaw rate rises, and the body rolls
        // further. S still reverses (the fwd < 0 branch above); Space
        // never reverses.
        car.speed -= Math.sign(car.speed) * cfg.car.brake * 0.5 * dt;
        if (Math.abs(car.speed) < 0.5) car.speed = 0;
      }
      car.speed = clamp(car.speed, -cfg.car.maxReverse, top);
      if (!Number.isFinite(car.speed)) car.speed = 0;
      const prevX = car.group.position.x;
      const prevZ = car.group.position.z;
      const drifting = input.brake();
      car.heading += steer * cfg.car.steer * (car.steerMul ?? 1) * dt * clamp(Math.abs(car.speed) / 8, 0, 1) * Math.sign(car.speed || 1) * (drifting ? 1.9 : 1);
      car.group.rotation.y = car.heading;
      // Body roll on cornering (more while drifting) + pitch on
      // accel/brake: the car leans into the turn and squats/dips with
      // the throttle. Eased, so the body settles instead of snapping.
      const rollTarget = -steer * clamp(Math.abs(car.speed) / 20, 0, 1) * 0.07 * (drifting ? 1.8 : 1);
      const pitchTarget = fwd > 0 ? -0.03 : fwd < 0 ? 0.045 : 0;
      car.group.rotation.z += (rollTarget - car.group.rotation.z) * Math.min(1, dt * 8);
      car.group.rotation.x += (pitchTarget - car.group.rotation.x) * Math.min(1, dt * 8);
      car.group.position.x += Math.sin(car.heading) * car.speed * dt;
      car.group.position.z += Math.cos(car.heading) * car.speed * dt;
      if (!isOnRoad(car.group.position.x, car.group.position.z)) {
        car.group.position.x = prevX;
        car.group.position.z = prevZ;
        car.speed *= 0.4;
      }
      // v9 iteration 5 (§2/§3): miles behind the wheel teach Driving —
      // +1 XP per 100 m. And the pier deck, the causeway and the island
      // sit 1.15 m up, so the car rides their surface, not y = 0 (the
      // airborne block below owns y while the car is flying).
      player.driveDist += Math.abs(car.speed) * dt;
      if (player.driveDist >= 100) { player.driveDist -= 100; addSkillXp('driving', 1); }
      if (state.carAir === 0) car.group.position.y = groundYAt(car.group.position.x, car.group.position.z);
      car.wheelSpin += car.speed * dt * 2;
      spinWheels(car);
      steerWheels(car, steer * 0.35);
      // Very slow trail: the camera holds its angle while the car turns
      // instead of swinging around with every steering input. v9
      // iteration 4: while the player is actively aiming (drive-by),
      // the trail pauses — the camera stays where the player aimed it.
      // The trail rate scales with speed, so a fast car recentres the
      // camera sooner.
      const aimingRecently = state.time - state.lastAimTime < 1.5;
      if (!aimingRecently) {
        const trailRate = 0.5 + (Math.abs(car.speed) / cfg.car.maxSpeed) * 1.5;
        state.camYaw = lerpAngle(state.camYaw, car.heading, Math.min(1, dt * trailRate));
      }
      if (input.brake() && Math.abs(car.speed) > 6) {
        skids.add(car.group.position.x - Math.sin(car.heading) * 1.5, car.group.position.z - Math.cos(car.heading) * 1.5, car.heading);
      }
      // Tire smoke on handbrake, or on a hard steer at speed (a drift):
      // one puff per rear wheel per step, rising and fading.
      const hardSteer = Math.abs(steer) > 0 && Math.abs(car.speed) > 20;
      if ((input.brake() && Math.abs(car.speed) > 6) || hardSteer) {
        const bx = car.group.position.x - Math.sin(car.heading) * 1.5;
        const bz = car.group.position.z - Math.cos(car.heading) * 1.5;
        const rx = Math.cos(car.heading);
        const rz = -Math.sin(car.heading);
        puffSmoke(bx + rx * 0.8, 0.4, bz + rz * 0.8);
        puffSmoke(bx - rx * 0.8, 0.4, bz - rz * 0.8);
      }
      // Brake lights: the taillights brighten while braking (HDR, so
      // they bloom) and dim again when the foot comes off.
      if (car.tailMat) {
        const braking = input.brake() || fwd < 0;
        car.tailMat.color.setRGB(braking ? 2.6 : 1.8, braking ? 0.3 : 0.25, braking ? 0.25 : 0.2);
      }
      // Destructible props (v9 iteration 4): drive through a lamp post,
      // a hydrant, a trash can, a fence or a cafe table above 4 m/s and
      // it tips over. A hydrant sprays water for 2 s. Broken props
      // respawn after 6 s — the pool recycles, nothing is allocated.
      for (const d of city.destructibles) {
        if (d.broken) continue;
        const dd = Math.hypot(d.home.x - car.group.position.x, d.home.z - car.group.position.z);
        if (dd < 2.2 && Math.abs(car.speed) > 4) {
          d.broken = true;
          d.timer = 6;
          d.fallT = 0;
          d.sprayT = d.kind === 'hydrant' ? 2 : 0;
          if (d.kind === 'hydrant') burstWater(d.home.x, 1.2, d.home.z, 10);
          audio.crash();
          state.shake = Math.max(state.shake, 0.4);
          car.speed *= 0.85;
        }
      }
      // Stunt ramps (v9 iteration 4): hit one over 15 m/s and the car
      // flies. Air time over 0.6 s on landing pays $100 + 1 REP, with a
      // brief slow-mo while airborne.
      for (let ri = 0; ri < city.ramps.length; ri += 1) {
        const r = city.ramps[ri];
        const rd = Math.hypot(r.x - car.group.position.x, r.z - car.group.position.z);
        if (rd < 3.5 && Math.abs(car.speed) > 15 && state.carAir === 0) {
          state.carAir = 6 + Math.abs(car.speed) * 0.18;
          state.slowmo = 0.6;
          state.airStart = state.time;
          // The ramp INDEX (not the object) — indices survive a save
          // round-trip, object identity does not.
          state.airRamp = ri;
          audio.pickup();
        }
      }
      // Airborne physics: gravity pulls the car back down; landing
      // settles it exactly on the ground underfoot (y = 0 on the roads,
      // 1.15 on the pier deck, the causeway and the island).
      if (state.carAir !== 0) {
        state.carAir -= 18 * dt;
        car.group.position.y += state.carAir * dt;
        const gy = groundYAt(car.group.position.x, car.group.position.z);
        if (car.group.position.y <= gy) {
          car.group.position.y = gy;
          const airtime = state.time - (state.airStart || 0);
          if (airtime > 0.6) {
            // v9 iteration 5 (§2): the first landing on a ramp pays
            // $500, repeats pay $50. Each ramp pays its first prize
            // once — the set is saved.
            const rampIdx = state.airRamp;
            const first = rampIdx != null && !landedRamps.has(rampIdx);
            if (rampIdx != null) landedRamps.add(rampIdx);
            const prize = first ? (cfg.stunts.firstPrize ?? 500) : (cfg.stunts.prize ?? 50);
            stunts += 1;
            player.repBonus += cfg.player.repPerStunt;
            player.cash += prize;
            hud.showMessage(`Stunt jump! +$${prize} · +${cfg.player.repPerStunt} REP`, 4);
            audio.missionDone();
            saveGame();
          }
          state.airRamp = null;
          state.carAir = 0;
        }
      }
      // Running over pedestrians and ramming traffic.
      for (let i = pedestrians.length - 1; i >= 0; i -= 1) {
        const ped = pedestrians[i];
        const d = Math.hypot(ped.group.position.x - car.group.position.x, ped.group.position.z - car.group.position.z);
        if (d < 2.2 && Math.abs(car.speed) > 3) {
          // v9 iteration 5 (§4): a run-over is a witnessed crime — if
          // the victim was the witness, they cannot report; another
          // nearby civilian may.
          if (witness && witness.ped === ped) clearWitnessState();
          scene.remove(ped.group);
          pedestrians.splice(i, 1);
          addHeatScaled(cfg.police.hitPedHeat);
          startWitness(car.group.position.x, car.group.position.z);
          audio.crash();
          state.shake = 0.6;
          car.speed *= 0.7;
        }
      }
      for (const other of [...traffic, ...parked, ...wanted.roadblocks]) {
        const d = Math.hypot(other.group.position.x - car.group.position.x, other.group.position.z - car.group.position.z);
        if (d < 3.4 && Math.abs(car.speed) > 4) {
          addHeatScaled(cfg.police.hitCarHeat);
          audio.crash();
          state.shake = 0.5;
          car.speed *= 0.5;
          other.speed = 0;
          damageCar(car, 8);
        }
      }
      audio.setEngine(Math.abs(car.speed) / cfg.car.maxSpeed, true, input.run());
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
      // Car on fire (v9 iteration 5, §1): condition under 25 smokes
      // and warns once; at 0 the car bursts — Rico takes 50 damage and
      // bails out on the spot. The wreck is removed from the scene (it
      // never joins `parked`), its mesh is disposed, and a repair or a
      // respray resets the warning.
      const cond = car.condition ?? 100;
      if (cond < 25 && cond > 0) {
        if (!car.fireWarned) { car.fireWarned = true; hud.showMessage('Your car is on fire — get to a spray shop!', 4); }
        state.fireT = (state.fireT || 0) - dt;
        if (state.fireT <= 0) { state.fireT = 0.4; puffSmoke(car.group.position.x, 1.2, car.group.position.z); }
      }
      if (cond <= 0) {
        burst(car.group.position.x, 1.2, car.group.position.z, 16);
        audio.positionalShot(car.group.position.x, 1.2, car.group.position.z, 'blast');
        audio.crash();
        const wreck = car;
        const gy = groundYAt(wreck.group.position.x, wreck.group.position.z);
        let side = wreck.group.position.clone();
        side.x += Math.cos(wreck.heading) * 2.5;
        side.z -= Math.sin(wreck.heading) * 2.5;
        if (groundYAt(side.x, side.z) !== gy) {
          side = wreck.group.position.clone();
          side.x -= Math.cos(wreck.heading) * 2.5;
          side.z += Math.sin(wreck.heading) * 2.5;
        }
        if (groundYAt(side.x, side.z) !== gy) side = wreck.group.position.clone();
        wreck.isPlayer = false;
        wreck.speed = 0;
        playerMesh.position.set(side.x, gy, side.z);
        player.groundY = gy;
        playerMesh.visible = true;
        player.heading = wreck.heading;
        player.inCar = false;
        player.car = null;
        state.camBlend = 0;
        scene.remove(wreck.group);
        disposeCarMesh(wreck.group);
        damagePlayer(50, 'fire');
        hud.showMessage('Your car blew up!', 4);
      }
    } else {
      // On foot.
      const run = input.run();
      // v9 iteration 5 (§2): Stamina makes sprinting faster, 3% a level.
      const speed = (run ? cfg.player.runSpeed : cfg.player.walkSpeed) * (run ? 1 + 0.03 * skillLevel('stamina') : 1);
      let mx = 0;
      let mz = 0;
      if (input.forward()) { mx += Math.sin(state.camYaw); mz += Math.cos(state.camYaw); }
      if (input.back()) { mx -= Math.sin(state.camYaw); mz -= Math.cos(state.camYaw); }
      // v9 iteration 3: A/D were inverted. Camera-relative left is
      // (+cos yaw, -sin yaw): at yaw 0 the camera looks along +z and
      // screen-left is +x. The old code had the signs swapped, so A moved
      // the player to screen-right and D to screen-left.
      if (input.left()) { mx += Math.cos(state.camYaw); mz -= Math.sin(state.camYaw); }
      if (input.right()) { mx -= Math.cos(state.camYaw); mz += Math.sin(state.camYaw); }
      const len = Math.hypot(mx, mz);
      const joints = playerMesh.userData;
      if (len > 0) {
        mx /= len;
        mz /= len;
        playerMesh.position.x += mx * speed * dt;
        playerMesh.position.z += mz * speed * dt;
        // v9 iteration 5 (§3): the pier deck, the causeway and the
        // island sit 1.15 m up — Rico walks their surface. Past the
        // beach (x > 172) only the deck corridor (z 98–102) and the
        // island are walkable; stepping off a raised edge is blocked,
        // so Rico can never strand himself in the sea.
        const nx = playerMesh.position.x;
        const nz = playerMesh.position.z;
        const onCorridor = nz >= 98 && nz <= 102 && nx <= 275;
        const onIsland = nx >= 222 && nx <= 275 && nz >= 70 && nz <= 130;
        if (nx > 172 && !onCorridor && !onIsland) {
          playerMesh.position.x -= mx * speed * dt;
          playerMesh.position.z -= mz * speed * dt;
        } else {
          player.groundY = groundYAt(nx, nz);
        }
        player.heading = Math.atan2(mx, mz);
        playerMesh.rotation.y = player.heading;
        player.bob += dt * (run ? 14 : 9);
        // v9 iteration 5 (§2): 10 s of sprinting is +1 Stamina XP.
        if (run) {
          player.sprintT += dt;
          if (player.sprintT >= 10) { player.sprintT -= 10; addSkillXp('stamina', 1); }
        }
        // Walk cycle (v9 iteration 3): legs and arms swing as a pendulum
        // around the hip/shoulder pivots, in step with movement speed.
        // The mesh y NEVER lifts while grounded — feet stay planted; the
        // swinging foot rises naturally at the ends of its arc. The old
        // whole-body bounce (up to 0.07) with frozen legs read as floating.
        const swing = Math.sin(player.bob) * (run ? 0.85 : 0.55);
        if (joints.legL) {
          joints.legL.rotation.x = -swing;
          joints.legR.rotation.x = swing;
          joints.armL.rotation.x = swing;
          joints.armR.rotation.x = -swing;
          joints.rig.rotation.x = 0.03;
        }
      } else if (player.grounded) {
        // Idle: ease the limbs back to neutral instead of snapping.
        if (joints.legL) {
          const k = Math.min(1, dt * 10);
          joints.legL.rotation.x += (0 - joints.legL.rotation.x) * k;
          joints.legR.rotation.x += (0 - joints.legR.rotation.x) * k;
          joints.armL.rotation.x += (0 - joints.armL.rotation.x) * k;
          joints.armR.rotation.x += (0 - joints.armR.rotation.x) * k;
          joints.rig.rotation.x += (0 - joints.rig.rotation.x) * k;
        }
      }
      // v9 iteration 5 (§3): while grounded Rico's feet stay on the
      // surface underfoot — walking off the deck drops him to the beach,
      // walking on lifts him onto the deck.
      if (player.grounded) playerMesh.position.y = player.groundY;
      // Jump (v9 iteration 3): Space on foot only — Space stays the brake
      // in a car. Edge-triggered (a fresh press), so holding Space does
      // not bunny-hop; no double-jump (grounded only). One velocity, one
      // gravity; landing is exactly at the ground underfoot.
      const brake = input.brake();
      if (brake && !player.prevBrake && player.grounded) {
        player.vy = cfg.player.jumpSpeed;
        player.grounded = false;
      }
      player.prevBrake = brake;
      if (!player.grounded) {
        player.vy -= cfg.player.jumpGravity * dt;
        playerMesh.position.y += player.vy * dt;
        if (playerMesh.position.y <= player.groundY) {
          playerMesh.position.y = player.groundY;
          player.vy = 0;
          player.grounded = true;
        }
        // Airborne leg tuck: one leg forward, one back, arms slightly out.
        if (joints.legL) {
          joints.legL.rotation.x = 0.55;
          joints.legR.rotation.x = -0.35;
          joints.armL.rotation.x = -0.3;
          joints.armR.rotation.x = -0.3;
          joints.rig.rotation.x = 0.06;
        }
      } else {
        playerMesh.position.y = player.groundY;
      }
      // v9 iteration 5 (§3): the east clamp reaches the island (x 275) —
      // the sea is kept out by the edge block above, not by this clamp.
      playerMesh.position.x = clamp(playerMesh.position.x, -150, 275);
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

    // Medals (v9 iteration 5, §2): 24 gold coins across the city, the
    // pier and the island — $100 each, $5,000 for the full set. They
    // spin in the world (see step()) and are saved.
    const medal = medals.collect(pp0.x, pp0.z);
    if (medal.gained > 0) {
      player.cash += medal.gained;
      addSkillXp('street', 1);
      audio.packageFound();
      if (medal.bonus > 0) hud.showMessage(`ALL 24 MEDALS! +$${medal.bonus} bonus!`, 5);
      else hud.showMessage(`Medal found — +$${medal.gained}! (${medals.count()}/${cfg.medals.count})`, 4);
      saveGame();
    }

    // Street races (v9 iteration 5, §2): three of them, each with its
    // own route, REP gate, prize and time limit. Drive through the
    // start line and the clock starts — two checkpoints, then the
    // finish. The rings show the way; the HUD objective shows the
    // clock. A race that was already won never re-triggers, and a
    // locked race says so once per approach instead of starting.
    if (player.inCar && player.car) {
      const cp = player.car.group.position;
      const race = raceIdx >= 0 ? cfg.races[raceIdx] : null;
      const targets = race ? [race.start, ...race.checkpoints, race.finish] : null;
      if (!state.race) {
        if (raceIdx < 0) {
          // Pick the nearest unwon, unlocked race whose start line the
          // car is sitting on.
          let started = false;
          for (let i = 0; i < cfg.races.length; i += 1) {
            if (raceWins[i]) continue;
            const r = cfg.races[i];
            if (repPoints() < r.repReq) continue;
            if (Math.hypot(cp.x - r.start.x, cp.z - r.start.z) < 6) { raceIdx = i; started = true; break; }
          }
          if (started) {
            const r = cfg.races[raceIdx];
            setRaceRings(r);
            raceRings.forEach((ring, i) => {
              ring.visible = true;
              ring.material.color.setHex(i === 0 ? 0x22ff44 : i === 1 ? 0xffd23e : 0x555555);
            });
            state.race = { cp: 1, timeLeft: r.timeLimit };
            hud.showMessage(`${r.name}! Hit the gold rings — ${r.timeLimit} s, $${r.prize} + ${r.rep} REP.`, 4);
            audio.pickup();
          } else if (state.raceArmed) {
            const locked = cfg.races.find((r, i) => !raceWins[i] && repPoints() < r.repReq && Math.hypot(cp.x - r.start.x, cp.z - r.start.z) < 6);
            if (locked) {
              hud.showMessage(`${locked.name} needs REP ${locked.repReq} — earn more REP first.`, 3);
              state.raceArmed = false;
            }
          }
          // Re-arm the locked message once the car is clear of every
          // start line.
          const nearAny = cfg.races.some((r) => Math.hypot(cp.x - r.start.x, cp.z - r.start.z) < 8);
          if (!nearAny) state.raceArmed = true;
        } else {
          // A race just ended on this start line — re-arm once the car
          // has driven clear of it, so it cannot re-trigger in place.
          const r = cfg.races[raceIdx];
          if (Math.hypot(cp.x - r.start.x, cp.z - r.start.z) > 8) raceIdx = -1;
        }
      } else {
        state.race.timeLeft -= dt;
        const tgt = targets[state.race.cp];
        if (tgt && Math.hypot(cp.x - tgt.x, cp.z - tgt.z) < 6) {
          state.race.cp += 1;
          raceRings.forEach((r, i) => {
            r.material.color.setHex(i === state.race.cp ? 0xffd23e : i < state.race.cp ? 0x22ff44 : 0x555555);
          });
          if (state.race.cp >= targets.length) {
            const r = cfg.races[raceIdx];
            raceWins[raceIdx] = true;
            racesWon += 1;
            player.repBonus += r.rep;
            player.cash += r.prize;
            hud.showMessage(`Race won! +$${r.prize} · +${r.rep} REP`, 5);
            audio.missionDone();
            saveGame();
            state.race = null;
            raceRings.forEach((ring) => { ring.visible = false; });
          } else {
            audio.pickup();
          }
        }
        if (state.race && state.race.timeLeft <= 0) {
          hud.showMessage('Race failed — out of time.', 3);
          audio.fail();
          state.race = null;
          raceRings.forEach((r) => { r.visible = false; });
        }
      }
    }

    // Courier delivery (v9 iteration 5, §2): the timer runs down while
    // the green ring marks the drop. Arrive in time for the pay + REP;
    // run out of time and the job is gone (it can be picked up again).
    if (delivery) {
      const d = cfg.deliveries[delivery.idx];
      delivery.timeLeft -= dt;
      deliveryDropRing.position.set(d.drop.x, 0.1, d.drop.z);
      deliveryDropRing.visible = true;
      const p = playerPos();
      if (Math.hypot(p.x - d.drop.x, p.z - d.drop.z) < 5) {
        deliveriesDone[delivery.idx] = true;
        player.cash += d.prize;
        player.repBonus += cfg.player.repPerDelivery;
        addSkillXp('street', 1);
        hud.showMessage(`Delivery done! +$${d.prize} · +${cfg.player.repPerDelivery} REP`, 4);
        audio.missionDone();
        saveGame();
        delivery = null;
        deliveryDropRing.visible = false;
      } else if (delivery.timeLeft <= 0) {
        hud.showMessage('Delivery failed — out of time.', 3);
        audio.fail();
        delivery = null;
        deliveryDropRing.visible = false;
      }
    }
    // Delivery pickup rings: gold while the job is available (unwon and
    // REP-unlocked), hidden once done, locked, or while another delivery
    // is running.
    deliveryPickupRings.forEach((ring, i) => {
      ring.visible = !delivery && !deliveriesDone[i] && repPoints() >= cfg.deliveries[i].repReq;
    });

    // Traffic, pedestrians, enemies.
    for (const car of traffic) updateTrafficCar(car, dt, allCars(), cfg, pedestrians);
    // Gunfire scatters the crowd; pedestrians stay on the sidewalks
    // unless they are fleeing. v9 iteration 4: the threat is any gunshot
    // in the last half second (any weapon — the old check only caught the
    // pistol's cooldown edge). A speeding car does NOT panic the crowd —
    // it makes the peds in its path DODGE (people.js). Panicking on a
    // fast car made the dodge dead code: any car fast enough to dodge
    // (>4 m/s) was also fast enough to panic (>8 m/s) inside the 18 m
    // threat radius, so a ped never dodged — it always panicked first.
    const threat = state.time - state.lastShotAt < 0.5 ? playerPos() : null;
    for (const ped of pedestrians) updatePedestrian(ped, dt, cfg, threat, isOnRoad, allCars());
    const pp = playerPos();
    // v9 iteration 4: the Reef Kings faction. Entering the docks rect,
    // or hurting a King, makes the whole faction aggro — faster,
    // further, more accurate. NPC gunfire is a positional sound at the
    // shooter's position.
    if (pp.x > 120 && pp.z > 90) state.factionAggro = true;
    for (const e of enemies) {
      updateEnemy(e, dt, cfg, pp, (enemy) => {
        const from = enemy.group.position.clone().setY(1.4);
        const to = { x: pp.x, y: 1.3, z: pp.z };
        fireTracer(from, to);
        audio.positionalShot(from.x, from.y, from.z, 'shot');
        damagePlayer(cfg.combat.enemyDamage, 'shot');
      }, state.factionAggro);
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
    }, () => damagePlayer(999, 'arrest'), rng, { cars: allCars(), pedestrians, inVisionCone: inVisionCone(pp.x, pp.z) });
    // v9 iteration 3: say it once when the grace window opens — the
    // player just fired their first shot and the police are on their way.
    if (wanted.graceTimer > 0 && prevGrace <= 0) {
      hud.showMessage('Police alerted — one slip and they come for you. Lay low!', 4);
    }
    prevGrace = wanted.graceTimer;
    // Escaped: the stars fell to zero from a real pursuit. Say so, and
    // give the player a short cooldown before the heat can rise again.
    if (prevStars > 0 && wanted.stars === 0) {
      hud.showMessage('★ Wanted Level Evaded! ★', 4);
      wanted.cooldown = cfg.evadeCooldown;
      audio.missionDone();
      // v9 iteration 5 (§2): losing the cops is +1 Stealth XP.
      addSkillXp('stealth', 1);
    }
    prevStars = wanted.stars;
    // v9 iteration 5 (§4): the witness reports after 3 s — unless they
    // were silenced first (clearWitnessState, called at every kill).
    if (witness) {
      witness.timer -= dt;
      if (witness.timer <= 0) {
        clearWitnessState();
        addHeatScaled(cfg.police.witnessHeat);
        hud.showMessage('A witness called the cops!', 4);
      }
    }
    // v9 iteration 5 (§3): the island gate opens as Rico approaches.
    if (city.islandGate) {
      const gd = Math.hypot(pp.x - 209, pp.z - 100);
      const target = gd < 12 ? 1 : 0;
      city.islandGate.open += (target - city.islandGate.open) * Math.min(1, dt * 3);
      city.islandGate.beam.position.y = 1.0 + city.islandGate.open * 2.2;
    }
    // v9 iteration 5 (§2/§3): medals spin, and every car in the world
    // rides the ground under it (the pier deck, the causeway and the
    // island sit 1.15 m up).
    medals.spin(state.time);
    for (const car of allCars()) {
      if (car.isPlayer) continue;
      car.group.position.y = groundYAt(car.group.position.x, car.group.position.z);
    }
    // v9 iteration 4: the siren rides on the nearest cruiser (positional
    // audio — it swells as the cops close in); the global siren is the
    // fallback when positional audio is unavailable or no cruiser exists.
    if (wanted.policeCars.length > 0) {
      const nearest = wanted.policeCars.reduce((a, b) => {
        const da = Math.hypot(a.group.position.x - pp.x, a.group.position.z - pp.z);
        const db = Math.hypot(b.group.position.x - pp.x, b.group.position.z - pp.z);
        return da <= db ? a : b;
      });
      const np = nearest.group.position;
      if (!audio.setSirenPositional(wanted.sirenOn, np.x, 2, np.z)) audio.setSiren(wanted.sirenOn, state.time);
    } else {
      audio.setSiren(wanted.sirenOn, state.time);
    }
    audio.music(dt);
    // v9 iteration 4: the radio ducks while Marla is talking, and the
    // police vision cones show the line of sight.
    audio.setDucking(!!missions.currentLine);
    updateVisionCones();

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
      // Bazooka restock on job completion (v9 iteration 3): Marla's crew
      // refills the rockets to the full 8 after every finished job.
      player.rockets = cfg.weapons.bazooka.rockets;
      audio.missionDone();
      saveGame();
      showJobComplete(finishedDef, reward, finishedElapsed, finishedStars);
    } else if (result === 'fail') {
      hud.showMessage(missions.message, 5);
      audio.fail();
      failMission(missions);
    }

    // The REP gate clears itself the moment the REP is earned (races,
    // stunts, packages): the Big Score auto-starts when the player
    // crosses 30.
    if (missions.repGate && repPoints() >= 30) {
      tryStartMission(missions.index);
      hud.showMessage('REP 30 reached — The Big Score is open. Marla is waiting.', 5);
    }

    // Beacon follows the current target.
    const target = currentTarget(missions);
    if (target && missions.state === 'active') {
      beacon.position.set(target.x, 8, target.z);
      beaconRing.position.set(target.x, 0.1, target.z);
      beacon.visible = true;
      beaconRing.visible = true;
      beaconRing.scale.setScalar(1 + 0.25 * Math.sin(state.time * 3));
    } else {
      beacon.visible = false;
      beaconRing.visible = false;
    }

    // Tracers and particles fade.
    updateRockets(dt);
    // Knife swing animation (v9 iteration 3): the blade sweeps once over
    // 0.25 s and the right arm follows it; the walk cycle owns the arm
    // again the moment the swing ends.
    if (player.swingT > 0) {
      player.swingT -= dt;
      const prog = 1 - Math.max(0, player.swingT) / 0.25;
      const sweep = -1.2 * Math.sin(prog * Math.PI);
      knifeMesh.rotation.x = 0.5 + sweep;
      if (playerMesh.userData.armR) playerMesh.userData.armR.rotation.x = -0.8 * Math.sin(prog * Math.PI);
      if (player.swingT <= 0) knifeMesh.rotation.x = 0.5;
    }
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
    // Destructible props: tip over, spray, respawn (v9 iteration 4).
    for (const d of city.destructibles) {
      if (!d.broken) continue;
      if (d.fallT < 1) {
        d.fallT = Math.min(1, d.fallT + dt / 0.3);
        d.group.rotation.x = -Math.PI / 2 * d.fallT;
      }
      if (d.sprayT > 0) {
        d.sprayT -= dt;
        burstWater(d.home.x, 1.2, d.home.z, 1);
      }
      d.timer -= dt;
      if (d.timer <= 0) {
        d.broken = false;
        d.fallT = 0;
        d.group.rotation.x = 0;
      }
    }
    // Hydrant water: arcs up, falls, fades.
    for (const w of water) {
      if (w.life > 0) {
        w.life -= dt;
        w.mesh.position.x += w.vx * dt;
        w.mesh.position.y += w.vy * dt;
        w.mesh.position.z += w.vz * dt;
        w.vy -= 12 * dt;
        w.mesh.material.opacity = Math.max(0, (w.life / 1.3) * 0.85);
        if (w.life <= 0 || w.mesh.position.y < 0) w.mesh.visible = false;
      }
    }

    updateDaylight();
    updateHeli(dt);
    updateLightHeads();
    // The palm leaves sway with the clock (v9 iteration 4).
    if (city.updateWind) city.updateWind(state.time);
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
      // Stunt slow-mo (v9 iteration 4): while slowmo runs, physics
      // advances at 0.45× real time — the jump hangs in the air.
      let effDt = dt;
      if (state.slowmo > 0) {
        state.slowmo -= dt;
        effDt = dt * 0.45;
      }
      acc += effDt;
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
      // v9 iteration 5 (§6, user title template): the title holds the
      // dusk band (17:30–19:30) so the panorama always matches the
      // template's dusk skyline — the clock drifts slowly inside the
      // band instead of running into the night. The fog override runs
      // AFTER updateDaylight (which owns the fog) so the title keeps its
      // dusk haze; entering play resets the fog via updateDaylight in
      // step().
      state.clockHour = 17.5 + ((state.time * 0.05) % 2);
      updateDaylight();
      updateLights(dt);
      updateRain(dt);
      updateLightHeads();
      scene.fog.color.setHex(0x3a1c38);
      scene.fog.density = 0.0045;
      // Slow orbit around the dense skyline — radius 115, height ~38,
      // the look target shifted left of centre so the left panel has
      // room. At radius 115 the camera clears the tallest building on
      // the orbit (~22 m) by 16 m, and the view crosses the skyline
      // toward Fuego Tower — never a flat rooftop slab.
      const angle = state.time * 0.06 + 0.65;
      camera.position.set(Math.cos(angle) * 115, 38 + Math.sin(state.time * 0.25) * 3, Math.sin(angle) * 115);
      camera.lookAt(-14, 24, 0);
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
      // MARLA'S GARAGE board), the street, a parked car, pedestrians and the
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
    applySeason();
    for (let i = 0; i < 30; i += 1) {
      updateLights(STEP);
      updateRain(STEP);
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
    // The settle loop rained around the origin; re-scatter the streaks
    // around the shot camera so the frame is full of rain.
    scatterRain();
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
    // Test hooks (v9 iteration 3): the headless probe drives the game
    // through these — camera-relative movement, jump, walk cycle, and the
    // weapon checks all read real state, never source code. No gameplay
    // code reads them.
    debug: {
      playerPos: () => ({ x: playerMesh.position.x, y: playerMesh.position.y, z: playerMesh.position.z }),
      // v9 iteration 6: raycast from a screen pixel into the scene —
      // identifies exactly which mesh a visual artefact is, so a fix
      // targets the real object instead of a guess. Meshes only (rain
      // Points and sprites are skipped); the 3 nearest hits carry
      // material + size, so a distant tower and a near prop are told
      // apart by distance. The sky dome (ShaderMaterial, no colour) is
      // the tell for "the ray hit nothing but sky".
      raycastScreen: (sx, sy) => {
        const ray = new THREE.Raycaster();
        const ndc = new THREE.Vector2(
          (sx / window.innerWidth) * 2 - 1,
          -((sy / window.innerHeight) * 2 - 1),
        );
        ray.setFromCamera(ndc, camera);
        const hits = ray.intersectObjects(scene.children, true)
          .filter((h) => h.object.isMesh && h.object.visible)
          .slice(0, 3)
          .map((h) => {
            const o = h.object;
            const mats = [].concat(o.material || []);
            const m0 = mats[0] || {};
            const bb = new THREE.Box3().setFromObject(o);
            const size = new THREE.Vector3();
            bb.getSize(size);
            return {
              dist: Math.round(h.distance * 10) / 10,
              type: o.geometry ? o.geometry.type : o.type,
              pos: { x: Math.round(o.position.x * 10) / 10, y: Math.round(o.position.y * 10) / 10, z: Math.round(o.position.z * 10) / 10 },
              size: { x: Math.round(size.x * 10) / 10, y: Math.round(size.y * 10) / 10, z: Math.round(size.z * 10) / 10 },
              color: m0.color ? `#${m0.color.getHexString()}` : null,
              emissive: m0.emissive ? `#${m0.emissive.getHexString()}` : null,
              emissiveIntensity: m0.emissiveIntensity ?? null,
              hasMap: !!(m0.map),
            };
          });
        return {
          cam: { x: Math.round(camera.position.x * 10) / 10, y: Math.round(camera.position.y * 10) / 10, z: Math.round(camera.position.z * 10) / 10 },
          hits,
        };
      },
      // v9 iteration 6: the city placement audit — road overlaps for
      // buildings / palms / trees / hydrants / bins / stalls, sign-pole
      // occlusion and ramp ground contact, all from the real layout.
      placementAudit: () => city.placementAudit(),
      camYaw: () => state.camYaw,
      setCamYaw: (v) => { state.camYaw = v; },
      playerState: () => ({
        vy: player.vy, grounded: player.grounded, weapon: player.weapon,
        rockets: player.rockets, inCar: player.inCar, heading: player.heading,
        carHeading: player.car ? player.car.heading : null,
        carSpeed: player.car ? player.car.speed : null,
        cooldown: player.shootCooldown,
      }),
      playerJoints: () => {
        const u = playerMesh.userData;
        return {
          legL: u.legL ? u.legL.rotation.x : 0,
          legR: u.legR ? u.legR.rotation.x : 0,
          armL: u.armL ? u.armL.rotation.x : 0,
          armR: u.armR ? u.armR.rotation.x : 0,
        };
      },
      teleport: (x, z) => {
        playerMesh.position.set(x, 0, z);
        player.vy = 0;
        player.grounded = true;
        state.camFocus = null;
      },
      spawnEnemyAt: (x, z) => {
        const e = spawnEnemy(scene, x, z, null);
        enemies.push(e);
        return enemies.length;
      },
      enemies: () => enemies.map((e) => ({ x: e.group.position.x, z: e.group.position.z, health: e.health, alive: e.alive, aggro: e.aggro })),
      rockets: () => rockets.filter((r) => r.active).map((r) => ({ x: r.mesh.position.x, y: r.mesh.position.y, z: r.mesh.position.z })),
      nearestParkedCar: () => {
        const pp = playerPos();
        let best = null;
        let bestD = Infinity;
        // Parked cars only — traffic cars move, a walk-to target must not.
        for (const car of parked) {
          if (car === player.car) continue;
          const d = Math.hypot(car.group.position.x - pp.x, car.group.position.z - pp.z);
          if (d < bestD) { bestD = d; best = car; }
        }
        return best ? { x: best.group.position.x, z: best.group.position.z, dist: bestD } : null;
      },
      trafficCount: () => traffic.length,
      // Item 12 (memory-leak guard): build one mesh of each car kind,
      // report how many per-instance resources the factory owns for it,
      // dispose them, and confirm the list is empty afterwards. A count
      // of 0 for a kind would mean its fresh resources were never tagged.
      // Counts are MEASURED here (the v9 iteration 5 factory builds a
      // different set per class) — the probe asserts ownedBefore > 0 and
      // ownedAfter === 0 for every class, never a stale number.
      disposeCheck: () => {
        const out = {};
        const list = [...SPECS, { name: 'Interceptor', color: 0x1a1a22 }];
        for (const s of list) {
          const m = makeCarMesh(s.color, s.name === 'Interceptor');
          const before = (m.group.userData.owned || []).length;
          disposeCarMesh(m.group);
          out[s.name] = { ownedBefore: before, ownedAfter: (m.group.userData.owned || []).length };
        }
        return out;
      },
      clearEnemies: () => {
        // No dispose call here on purpose (item 12 audit): enemy meshes
        // are people, and every geometry/material in makePersonMesh comes
        // from its shared caches — scene.remove is the complete cleanup.
        for (const e of enemies) scene.remove(e.group);
        enemies.length = 0;
        return 0;
      },
      buildingCount: () => city.buildingCount,
      season: () => (state.day % 2 === 1 ? 'RAINY SEASON' : 'DRY SEASON'),
      rainVisible: () => rain.visible,
      // v9 iteration 4 hooks: Pointer Lock + ADS, ammo/shops, day cycle,
      // bloom, instancing, pooling, peds/faction, vision cones, traffic,
      // radio, destructibles, race, saves. All read live state.
      pointerLock: () => ({ locked: input.isLocked(), aiming: input.aiming() }),
      ammo: () => ({
        pistol: player.ammo, smg: player.smgAmmo, shotgun: player.shotgunAmmo,
        rifle: player.rifleAmmo, rockets: player.rockets, cash: Math.round(player.cash),
        owned: { ...player.owned }, rep: repPoints(),
      }),
      carVisual: () => {
        const car = player.car;
        if (!car) return null;
        return {
          roll: car.group.rotation.z, pitch: car.group.rotation.x,
          tail: car.tailMat ? [car.tailMat.color.r, car.tailMat.color.g, car.tailMat.color.b] : null,
          y: car.group.position.y, air: state.carAir,
        };
      },
      dayCycle: () => ({
        hour: state.clockHour, day: state.day,
        sun: sun.intensity, hemi: hemi.intensity, amb: ambient.intensity,
        fogD: scene.fog.density, lamps: city.streetlights[0] ? city.streetlights[0].intensity : 0,
        skyTop: `#${skyDome.material.uniforms.top.value.getHexString()}`,
      }),
      bloom: () => ({ threshold: bloomPass.threshold, strength: bloomPass.strength }),
      emissiveHot: () => {
        // Count scene meshes whose material colour exceeds 1 in any
        // channel (HDR): those are the things that clear the 0.9 bloom
        // threshold by design — neon signs, lamp bulbs, headlights,
        // tracers, flashes. Plain bright paint (≤ 1) does not bloom.
        let n = 0;
        scene.traverse((o) => {
          if (o.isMesh && o.material && o.material.color) {
            const c = o.material.color;
            if (c.r > 1 || c.g > 1 || c.b > 1) n += 1;
          }
        });
        return n;
      },
      instancedCounts: () => city.instancedCounts,
      poolStats: () => ({
        tracers: tracers.filter((t) => t.mesh.visible).length,
        rockets: rockets.filter((r) => r.active).length,
        particles: particles.filter((p) => p.life > 0).length,
        smoke: smoke.filter((s) => s.life > 0).length,
        skids: skids.count(),
        water: water.filter((w) => w.life > 0).length,
      }),
      peds: () => pedestrians.map((p) => ({
        x: Math.round(p.group.position.x), z: Math.round(p.group.position.z), state: p.state,
      })),
      traffic: () => traffic.map((c) => ({
        x: Math.round(c.group.position.x), z: Math.round(c.group.position.z),
        speed: Math.round(c.speed * 100) / 100, heading: Math.round(c.heading * 100) / 100,
      })),
      playerCar: () => {
        const car = player.car;
        if (!car) return null;
        return {
          x: car.group.position.x, z: car.group.position.z,
          speed: car.speed, heading: car.heading,
        };
      },
      placeTrafficBehind: () => {
        // Put a traffic car 6 m behind the player car, same lane, same
        // heading, at speed — the probe then watches it stop instead of
        // rear-ending the player.
        const car = player.car;
        if (!car) return null;
        const t = traffic[0];
        if (!t) return null;
        t.group.position.set(
          car.group.position.x - Math.sin(car.heading) * 6,
          0,
          car.group.position.z - Math.cos(car.heading) * 6,
        );
        t.heading = car.heading;
        t.group.rotation.y = car.heading;
        t.route = { axis: Math.abs(Math.sin(car.heading)) > 0.5 ? 'x' : 'z', line: Math.abs(Math.sin(car.heading)) > 0.5 ? car.group.position.z : car.group.position.x, dir: 1 };
        t.speed = 8;
        return { x: t.group.position.x, z: t.group.position.z, speed: t.speed };
      },
      visionCones: () => visionCones.filter((c) => c.visible).length,
      inVisionCone: () => {
        const pp = playerPos();
        return inVisionCone(pp.x, pp.z);
      },
      radio: () => ({ station: audio.stationName(), off: audio.isRadioOff(), ducking: audio.isDucking(), positional: audio.positionalCount() }),
      shop: () => ({ kind: shopKind, screen: state.screen, near: nearShop() }),
      destructibles: () => city.destructibles.map((d) => ({
        kind: d.kind, x: d.home.x, z: d.home.z, broken: d.broken, timer: Math.round(d.timer * 10) / 10,
      })),
      factionAggro: () => state.factionAggro,
      race: () => (state.race ? { cp: state.race.cp, timeLeft: Math.round(state.race.timeLeft * 10) / 10 } : null),
      saveRoundTrip: (cash) => {
        player.cash = cash;
        saveGame();
        const raw = window.localStorage.getItem(cfg.saveKey);
        const data = raw ? JSON.parse(raw) : null;
        return data ? {
          cash: data.cash, ammo: data.ammo, owned: data.owned, repBonus: data.repBonus,
          medals: data.medals, raceWins: data.raceWins, landedRamps: data.landedRamps,
          deliveriesDone: data.deliveriesDone, skills: data.skills, shirtColor: data.shirtColor,
        } : null;
      },
      meshCount: () => {
        let meshes = 0;
        let instanced = 0;
        scene.traverse((o) => {
          if (o.isInstancedMesh) instanced += 1;
          else if (o.isMesh) meshes += 1;
        });
        return { meshes, instanced };
      },
      drawCalls: () => renderer.info.render.calls,
      camDist: () => {
        const fx = state.camFocus ? state.camFocus.x : playerPos().x;
        const fz = state.camFocus ? state.camFocus.z : playerPos().z;
        return Math.hypot(camera.position.x - fx, camera.position.z - fz);
      },
      setCash: (v) => { player.cash = v; return Math.round(player.cash); },
      setRepBonus: (v) => { player.repBonus = v; return repPoints(); },
      setClockHour: (h) => { state.clockHour = h; updateDaylight(); return state.clockHour; },
      setStars: (n) => { setStars(wanted, n); return wanted.stars; },
      movePed: (i, x, z) => {
        const p = pedestrians[i];
        if (!p) return null;
        p.group.position.set(x, 0, z);
        return { x: p.group.position.x, z: p.group.position.z, state: p.state };
      },
      setCarSpeed: (v) => {
        if (!player.car) return null;
        player.car.speed = v;
        return player.car.speed;
      },
      placeCar: (x, z, heading) => {
        if (!player.car) return null;
        player.car.group.position.set(x, 0, z);
        player.car.heading = heading;
        player.car.group.rotation.y = heading;
        player.car.speed = 0;
        state.camFocus = null;
        return { x, z, heading };
      },
      setRaceTime: (v) => {
        if (!state.race) return null;
        state.race.timeLeft = v;
        return state.race.timeLeft;
      },
      enterNearestCar: () => {
        const car = nearestCar(cfg.player.enterCarRange);
        if (!car) return null;
        enterCar(car);
        return { inCar: player.inCar, name: car.name };
      },
      setCamYawDirect: (v) => { state.camYaw = v; return state.camYaw; },
      // v9 iteration 5 hooks: §0 city/roads, §1 cars, §2 progression,
      // §3 world, §4 witness/evasion, §5 save + presets. All read live
      // state, never source code.
      medals: () => ({ count: medals.count(), total: cfg.medals.count, taken: medals.takenIndices(), spots: medals.list.map((m) => ({ x: m.x, z: m.z, taken: m.taken })) }),
      races: () => ({ wins: [...raceWins], won: racesWon, idx: raceIdx, list: cfg.races.map((r) => ({ name: r.name, rep: r.rep, prize: r.prize })) }),
      stunts: () => ({ landed: [...landedRamps], count: stunts, total: cfg.stunts.ramps.length, ramps: cfg.stunts.ramps.map((r) => ({ x: r.x, z: r.z, axis: r.axis })) }),
      deliveries: () => ({ done: [...deliveriesDone], active: delivery ? { idx: delivery.idx, timeLeft: Math.round(delivery.timeLeft * 10) / 10 } : null }),
      skills: () => ({
        xp: { ...player.skills },
        levels: {
          driving: skillLevel('driving'), stamina: skillLevel('stamina'), aim: skillLevel('aim'),
          stealth: skillLevel('stealth'), influence: skillLevel('influence'), street: skillLevel('street'),
        },
      }),
      setSkillXp: (name, v) => { player.skills[name] = v; return skillLevel(name); },
      streetAt: (x, z) => streetAt(x, z, cfg),
      witness: () => (witness ? { timer: Math.round(witness.timer * 10) / 10, ped: { x: witness.ped.group.position.x, z: witness.ped.group.position.z } } : null),
      heat: () => ({ heat: Math.round(wanted.heat), stars: wanted.stars }),
      gate: () => (city.islandGate ? { open: Math.round(city.islandGate.open * 100) / 100, beamY: Math.round(city.islandGate.beam.position.y * 100) / 100 } : null),
      carSilhouettes: () => {
        const out = {};
        const list = [...SPECS, { name: 'Interceptor', color: 0x1a1a22 }];
        for (const s of list) {
          const m = makeCarMesh(s.color, s.name === 'Interceptor');
          const box = new THREE.Box3().setFromObject(m.group);
          const size = new THREE.Vector3();
          box.getSize(size);
          // The car faces +z, so z is the length, x the width, y the height.
          out[s.name] = { len: Math.round(size.z * 100) / 100, h: Math.round(size.y * 100) / 100, w: Math.round(size.x * 100) / 100 };
          disposeCarMesh(m.group);
        }
        return out;
      },
      pedsOnSidewalk: () => {
        // A ped counts as "on the sidewalk" when it stands in the
        // sidewalk band of its nearest block (offset 13–18 from the
        // block centre) rather than on a road or inside a block.
        let on = 0;
        for (const p of pedestrians) {
          const b = nearestBlock(p.group.position.x, p.group.position.z, cfg);
          const off = Math.max(Math.abs(p.group.position.x - b.bx), Math.abs(p.group.position.z - b.bz));
          if (off >= 13 && off <= 18) on += 1;
        }
        return { on, total: pedestrians.length };
      },
      placePlayer: (x, z) => {
        playerMesh.position.set(x, groundYAt(x, z), z);
        player.groundY = groundYAt(x, z);
        player.vy = 0;
        player.grounded = true;
        state.camFocus = null;
        return { x, y: playerMesh.position.y, z };
      },
      settings: () => ({ ...state.settings, bloom: bloomPass.enabled, far: camera.far, fogMul: state.fogMul, traffic: traffic.length, crowd: walkerCount }),
      applyPreset: (name) => {
        const p = cfg.presets[name];
        if (!p) return null;
        state.settings.preset = name;
        state.settings.traffic = p.traffic;
        state.settings.crowd = p.pedestrians;
        state.settings.viewDistance = p.far;
        applySettings();
        return { ...state.settings, bloom: bloomPass.enabled, far: camera.far };
      },
      shirtColor: () => player.shirtColor,
      groundYAt: (x, z) => groundYAt(x, z),
      volumes: () => audio.volumes(),
      // Probe assists (v9 iteration 5): road width, police positions,
      // car damage, the title camera, and a stopped cruiser to steal.
      // Each reads or nudges live state; none plays the game.
      roadCheck: () => ({
        width: cfg.world.roadWidth,
        samples: [[-28, 0], [-18.5, 0], [-16, 0], [0, -28], [0, -18.5], [0, -16]].map(([x, z]) => ({ x, z, on: isOnRoad(x, z) })),
      }),
      police: () => wanted.policeCars.map((c) => ({
        x: Math.round(c.group.position.x), z: Math.round(c.group.position.z),
        speed: Math.round((c.speed || 0) * 100) / 100, heading: Math.round((c.heading || 0) * 100) / 100,
      })),
      damageCar: (v) => {
        if (!player.car) return null;
        player.car.condition = Math.max(0, Math.min(100, v));
        return player.car.condition;
      },
      titleCam: () => ({
        x: Math.round(camera.position.x), y: Math.round(camera.position.y), z: Math.round(camera.position.z),
        r: Math.round(Math.hypot(camera.position.x, camera.position.z)), fog: scene.fog.density,
      }),
      // Probe hook (iteration 5, §4): drop a police cruiser on a spot
      // and stop it — the clamp test parks one just short of the island
      // gate and watches it hold at x 209 instead of crossing.
      // Iteration 6: an optional heading — the clamp test parks the
      // cruiser facing east (toward Rico on the island). Without it the
      // cruiser's heading is whatever it was patrolling with, and at
      // SwiftShader speed (~0.02-0.04x real time) the 40 s window is
      // ~1-2 game-seconds: a cruiser that first has to turn ~180 deg
      // (1.43 game-s at turnRate 2.2) never moves east inside the
      // window, so the test failed 3 of 4 runs while the game itself
      // was correct (diagnostic diag-gate-clamp: the cruiser drives
      // 207 -> 209 and holds there). The heading is not what the test
      // measures — the hold at 209 is — so it is set, not left to luck.
      placePoliceCar: (idx, x, z, heading) => {
        const c = wanted.policeCars[idx];
        if (!c) return null;
        c.group.position.set(x, 0, z);
        c.speed = 0;
        if (typeof heading === 'number') {
          c.heading = heading;
          c.group.rotation.y = heading;
        }
        return { x, z };
      },
      stopPoliceCar: () => {
        const car = wanted.policeCars.find((c) => Math.abs(c.speed || 0) < 5) || wanted.policeCars[0];
        if (!car) return null;
        car.speed = 0;
        playerMesh.position.set(car.group.position.x + 3, 0, car.group.position.z);
        player.vy = 0;
        player.grounded = true;
        state.camFocus = null;
        return { x: car.group.position.x, z: car.group.position.z };
      },
    },
    run() {
      // The title screen's save pill + Continue state, refreshed at
      // startup and every time the player quits to the title (v9
      // iteration 5, §6): Continue stays visible but greyed out with
      // no save, and the pill shows the save summary or the fresh-start
      // default.
      const refreshTitleSave = () => {
        const sv = loadSave();
        const cb = document.getElementById('btn-continue');
        if (cb) cb.disabled = !sv;
        const pt = document.getElementById('save-status-text');
        if (pt) pt.textContent = sv ? saveSummary(sv) : 'CH.1 HOMECOMING · $0 · REP 0 · DAY 1';
      };
      document.getElementById('btn-new-game').addEventListener('click', () => {
        document.getElementById('screen-title').style.display = 'none';
        document.getElementById('screen-controls').style.display = 'none';
        startGame(false);
      });
      document.getElementById('btn-continue').addEventListener('click', () => {
        if (!loadSave()) return;
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
      document.getElementById('btn-save-game').addEventListener('click', () => {
        saveGame();
        hud.showMessage('Game saved.', 2);
        audio.pickup();
      });
      document.getElementById('btn-restart-mission').addEventListener('click', () => {
        document.getElementById('screen-pause').style.display = 'none';
        failMission(missions);
        tryStartMission(missions.index);
        state.screen = SCREEN_PLAY;
      });
      document.getElementById('btn-quit').addEventListener('click', () => {
        document.getElementById('screen-pause').style.display = 'none';
        document.getElementById('screen-title').style.display = 'flex';
        state.screen = SCREEN_TITLE;
        refreshTitleSave();
      });
      document.getElementById('btn-respawn').addEventListener('click', () => {
        document.getElementById('screen-over').style.display = 'none';
        respawn();
      });
      document.getElementById('btn-job-continue').addEventListener('click', () => {
        continueAfterJob();
      });
      // Settings controls (v9 iteration 5, §5): the preset select and
      // every slider apply immediately. A preset fills the sliders;
      // moving a slider switches the preset to CUSTOM.
      const syncSettingsUI = () => {
        const s = state.settings;
        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setVal('sel-preset', s.preset);
        setVal('rng-traffic', s.traffic); setText('val-traffic', s.traffic);
        setVal('rng-crowd', s.crowd); setText('val-crowd', s.crowd);
        setVal('rng-view', s.viewDistance); setText('val-view', s.viewDistance);
        setVal('rng-mouse', s.mouseSens); setText('val-mouse', `${s.mouseSens.toFixed(1)}×`);
        setVal('rng-master', Math.round(s.master * 100)); setText('val-master', Math.round(s.master * 100));
        setVal('rng-music', Math.round(s.music * 100)); setText('val-music', Math.round(s.music * 100));
        setVal('rng-effects', Math.round(s.effects * 100)); setText('val-effects', Math.round(s.effects * 100));
        setVal('rng-engine', Math.round(s.engine * 100)); setText('val-engine', Math.round(s.engine * 100));
      };
      document.getElementById('sel-preset').addEventListener('change', (e) => {
        const p = cfg.presets[e.target.value];
        if (!p) return;
        state.settings.preset = e.target.value;
        state.settings.traffic = p.traffic;
        state.settings.crowd = p.pedestrians;
        state.settings.viewDistance = p.far;
        applySettings();
        syncSettingsUI();
      });
      const bindSlider = (id, valId, parse, apply, format) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => {
          const v = parse(el.value);
          apply(v);
          state.settings.preset = 'CUSTOM';
          applySettings();
          const label = document.getElementById(valId);
          if (label) label.textContent = format(v);
          const sel = document.getElementById('sel-preset');
          if (sel) sel.value = 'CUSTOM';
        });
      };
      bindSlider('rng-traffic', 'val-traffic', (v) => parseInt(v, 10), (v) => { state.settings.traffic = v; }, (v) => String(v));
      bindSlider('rng-crowd', 'val-crowd', (v) => parseInt(v, 10), (v) => { state.settings.crowd = v; }, (v) => String(v));
      bindSlider('rng-view', 'val-view', (v) => parseInt(v, 10), (v) => { state.settings.viewDistance = v; }, (v) => String(v));
      bindSlider('rng-mouse', 'val-mouse', (v) => parseFloat(v), (v) => { state.settings.mouseSens = v; }, (v) => `${v.toFixed(1)}×`);
      bindSlider('rng-master', 'val-master', (v) => parseInt(v, 10) / 100, (v) => { state.settings.master = v; }, (v) => String(Math.round(v * 100)));
      bindSlider('rng-music', 'val-music', (v) => parseInt(v, 10) / 100, (v) => { state.settings.music = v; }, (v) => String(Math.round(v * 100)));
      bindSlider('rng-effects', 'val-effects', (v) => parseInt(v, 10) / 100, (v) => { state.settings.effects = v; }, (v) => String(Math.round(v * 100)));
      bindSlider('rng-engine', 'val-engine', (v) => parseInt(v, 10) / 100, (v) => { state.settings.engine = v; }, (v) => String(Math.round(v * 100)));
      refreshTitleSave();
      syncSettingsUI();
      requestAnimationFrame(frame);
    },
    showGameOver(reason) {
      document.getElementById('over-title').textContent = reason.includes('BUSTED') ? 'BUSTED' : 'WASTED';
      document.getElementById('over-text').textContent = reason;
      document.getElementById('screen-over').style.display = 'flex';
    },
  };
}
