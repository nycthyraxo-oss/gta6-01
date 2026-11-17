// Costa Fuego — the game itself: the renderer, the player on foot and by car,
// stealing, shooting, the wanted chase, missions, the camera, the save and
// the day cycle. One class, one loop, fixed 1/60 s steps.
import * as THREE from 'three';
import { CONFIG, MISSION_DEFS, STORY_INTRO } from './config.js';
import { createRandom } from './random.js';
import { buildCity, districtAt } from './city.js';
import { createCar, spawnTrafficCar, updateTrafficCar, createSkids, randomCarColor } from './vehicles.js';
import { makePersonMesh, spawnPedestrian, updatePedestrian, spawnEnemy, updateEnemy } from './people.js';
import { createWanted, addHeat, setStars, ensurePolice, updatePolice, clearPolice } from './police.js';
import { createMissions, startMission, updateMission, completeMission, failMission, currentMission, currentTarget, missionObjectiveText } from './missions.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createInput, ACTION_ENTER, ACTION_SHOOT, ACTION_PAUSE, ACTION_MUTE, ACTION_RESTART, ACTION_CONFIRM } from './input.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

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
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(cfg.palette.skyDusk);
  scene.fog = new THREE.Fog(cfg.palette.fog, cfg.palette.fogNear, cfg.palette.fogFar);
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

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
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -220;
  sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220;
  sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 600;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffd9b0, 0.5));
  const hemi = new THREE.HemisphereLight(0xffb36b, 0x2e3550, 0.6);
  scene.add(hemi);

  const city = buildCity(scene, rng, cfg);
  const skids = createSkids(scene);
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

  // Pedestrians on the sidewalks.
  const pedestrians = [];
  for (let i = 0; i < cfg.pedestrians.count; i += 1) {
    pedestrians.push(spawnPedestrian(scene, rng, cfg, city.blockCenters));
  }

  const enemies = [];
  function spawnMissionEnemies() {
    const spots = [
      [132, 104], [144, 118], [126, 120], [140, 100],
    ];
    for (const [x, z] of spots) enemies.push(spawnEnemy(scene, x, z, rng));
    missions.enemiesLeft = enemies.length;
  }

  // Tracer + muzzle flash + impact particles, pooled so shooting never allocates.
  const tracers = [];
  for (let i = 0; i < 8; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerNext = 0;
  const muzzle = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }),
  );
  muzzle.visible = false;
  scene.add(muzzle);
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

  const state = {
    screen: SCREEN_TITLE,
    clockHour: cfg.time.startHour,
    camYaw: Math.PI,
    camPitch: 0.32,
    shake: 0,
    autosaveTimer: 0,
    overReason: '',
    muted: false,
    time: 0,
    shotMode: false,
  };

  // One-shot presses are collected once per frame here and consumed by the
  // first fixed step, so pause/mute work even while the game is paused
  // (the step loop does not run then, and must never own the pause key).
  let pendingActions = 0;
  function takePendingActions() {
    const taken = pendingActions;
    pendingActions = 0;
    return taken;
  }

  function handleFrameActions() {
    pendingActions |= input.takeActions();
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
      hud.showMessage(state.muted ? 'Sound muted (M to unmute)' : 'Sound on', 2);
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
    const t = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % tracers.length;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.material.opacity = 0.95;
    t.life = cfg.combat.tracerLife;
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
    const list = [...traffic, ...parked, ...wanted.policeCars];
    if (player.car) list.push(player.car);
    return list;
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
    player.inCar = true;
    player.car = car;
    playerMesh.visible = false;
    if (car.isTarget) addHeat(wanted, cfg.police.stealHeat);
    else addHeat(wanted, cfg.police.stealHeat * 0.6);
    audio.pickup();
    ensurePolice(wanted, scene, playerPos(), rng);
  }

  function exitCar() {
    const car = player.car;
    if (!car) return;
    car.isPlayer = false;
    car.speed = 0;
    car.parked = true;
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
        hit.obj.health -= cfg.player.shootDamage;
        if (hit.obj.health <= 0) {
          hit.obj.alive = false;
          hit.obj.group.visible = false;
          burst(hit.obj.group.position.x, 1.2, hit.obj.group.position.z, 12);
        }
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
    muzzle.visible = true;
    setTimeout(() => { muzzle.visible = false; }, 60);
    audio.gunshot();
    addHeat(wanted, cfg.police.shootHeat);
    for (const p of pedestrians) {
      updatePedestrian(p, 0, cfg, { x: origin.x, z: origin.z });
    }
    ensurePolice(wanted, scene, playerPos(), rng);
  }

  function showOver() {
    document.getElementById('over-title').textContent = state.overReason.includes('BUSTED') ? 'BUSTED' : 'WASTED';
    document.getElementById('over-text').textContent = state.overReason;
    document.getElementById('screen-over').style.display = 'flex';
  }

  function damagePlayer(amount, cause) {
    if (player.dead) return;
    player.health -= amount;
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
        health: Math.round(player.health),
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
    state.clockHour = data.clockHour ?? cfg.time.startHour;
    playerMesh.position.set(data.x ?? -112, 0, data.z ?? 60);
    player.heading = data.heading ?? 0;
    state.camYaw = player.heading;
    missions.index = Math.min(data.missionIndex ?? 0, MISSION_DEFS.length - 1);
  }

  function startGame(fromSave) {
    const save = fromSave ? loadSave() : null;
    if (save) applySave(save);
    else {
      player.cash = 150;
      player.health = cfg.player.maxHealth;
      state.clockHour = cfg.time.startHour;
      playerMesh.position.set(-112, 0, 60);
      player.heading = 0;
      state.camYaw = Math.PI;
      missions.index = 0;
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
    const h = state.clockHour;
    // Golden hour is the whole look: the dusk factor never drops below
    // 0.75, so the sun stays low, the shadows stay long, and the street
    // lamps stay lit no matter how long the session runs.
    const dusk = Math.max(0.75, clamp((h - 16) / 3, 0, 1));
    const day = new THREE.Color(cfg.palette.skyDay);
    const duskCol = new THREE.Color(cfg.palette.skyDusk);
    day.lerp(duskCol, dusk * 0.85);
    scene.background = day;
    sun.intensity = 2.2 - dusk * 0.7;
    sun.position.set(120 - dusk * 60, 180 - dusk * 135, 60);
    sun.color.setHex(0xffb27a);
    hemi.intensity = 0.6 - dusk * 0.15;
    // The beachfront lamps glow with the dusk.
    for (const l of city.streetlights) l.intensity = 4 + dusk * 10;
  }

  // The police heli circles the city, slow and high — skyline, not a system.
  function updateHeli(dt) {
    const a = state.time * 0.05;
    city.heli.position.set(Math.cos(a) * 120, 64, Math.sin(a) * 120);
    city.heli.rotation.y = -a;
    city.heli.userData.rotor.rotation.y += dt * 18;
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
    let dlg = missions.message || '';
    const prefix = def ? `${def.giver}: ` : '';
    if (dlg.startsWith(prefix)) dlg = dlg.slice(prefix.length);
    return {
      health: player.health,
      cash: player.cash,
      stars: wanted.stars,
      speed: player.inCar && player.car ? Math.abs(player.car.speed) : 0,
      inCar: player.inCar,
      objective,
      clockHour: state.clockHour,
      chapter: def ? `CH.${def.id} ${def.title.toUpperCase()}` : 'ALL DONE',
      targetDist: target && missions.state === 'active' ? Math.hypot(target.x - pp.x, target.z - pp.z) : null,
      carName: player.inCar && player.car ? (player.car.name || 'Cometa GT') : '',
      gear: player.inCar && player.car ? `D${1 + Math.min(5, Math.floor((Math.abs(player.car.speed) / cfg.car.maxSpeed) * 6))}` : '',
      district: districtAt(pp.x, pp.z).name,
      dialogueSpeaker: def ? def.giver.toUpperCase() : 'MARLA QUINN',
      dialogueText: dlg,
    };
  }

  function updateCamera(dt, snap) {
    const target = playerPos();
    const dist = player.inCar ? cfg.camera.carDistance : cfg.camera.footDistance;
    const height = player.inCar ? cfg.camera.carHeight : cfg.camera.footHeight;
    const tx = target.x - Math.sin(state.camYaw) * dist;
    const tz = target.z - Math.cos(state.camYaw) * dist;
    const ty = height;
    if (snap) {
      camera.position.set(tx, ty, tz);
    } else {
      const k = Math.min(1, dt * 5);
      camera.position.x += (tx - camera.position.x) * k;
      camera.position.y += (ty - camera.position.y) * k;
      camera.position.z += (tz - camera.position.z) * k;
    }
    if (state.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * state.shake * 0.5;
      camera.position.y += (Math.random() - 0.5) * state.shake * 0.3;
      state.shake = Math.max(0, state.shake - dt * 2.5);
    }
    camera.lookAt(target.x + Math.sin(state.camYaw) * 3, 1.4, target.z + Math.cos(state.camYaw) * 3);
  }

  function step(dt) {
    state.time += dt;
    state.clockHour += (dt / cfg.time.dayLength) * 24;
    if (state.clockHour >= 24) state.clockHour -= 24;
    player.shootCooldown = Math.max(0, player.shootCooldown - dt);

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

    const p = playerPos();
    if (player.inCar && player.car) {
      const car = player.car;
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
      car.speed = clamp(car.speed, -cfg.car.maxReverse, cfg.car.maxSpeed);
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
      for (const w of car.wheels) w.rotation.x = car.wheelSpin;
      state.camYaw = lerpAngle(state.camYaw, car.heading, Math.min(1, dt * 1.2));
      if (input.brake() && Math.abs(car.speed) > 6) {
        skids.add(car.group.position.x - Math.sin(car.heading) * 1.5, car.group.position.z - Math.cos(car.heading) * 1.5, car.heading);
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
      for (const other of [...traffic, ...parked]) {
        const d = Math.hypot(other.group.position.x - car.group.position.x, other.group.position.z - car.group.position.z);
        if (d < 3.4 && Math.abs(car.speed) > 4) {
          addHeat(wanted, cfg.police.hitCarHeat);
          audio.crash();
          state.shake = 0.5;
          car.speed *= 0.5;
          other.speed = 0;
        }
      }
      audio.setEngine(Math.abs(car.speed) / cfg.car.maxSpeed, true);
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

    // Traffic, pedestrians, enemies.
    for (const car of traffic) updateTrafficCar(car, dt, [...traffic, ...parked], cfg);
    const gunshot = player.shootCooldown > cfg.player.shootCooldown - 0.1 ? playerPos() : null;
    for (const ped of pedestrians) updatePedestrian(ped, dt, cfg, gunshot);
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
    ensurePolice(wanted, scene, pp, rng);
    updatePolice(wanted, dt, scene, pp, player.inCar, (car) => {
      if (player.inCar && player.car) {
        player.car.speed *= 0.6;
        audio.crash();
        state.shake = 0.5;
      } else {
        damagePlayer(cfg.police.ramDamage, 'ram');
      }
    }, () => damagePlayer(999, 'arrest'));
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
      const reward = completeMission(missions);
      player.cash += reward;
      audio.missionDone();
      hud.showMessage(missions.message, 6);
      saveGame();
      if (missions.index < MISSION_DEFS.length) {
        startMission(missions, missions.index, cfg);
        if (missions.index === 3) setStars(wanted, 3);
        if (missions.index === 4) spawnMissionEnemies();
        hud.showMessage(missions.message, 7);
      }
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
        t.line.material.opacity = Math.max(0, t.life / cfg.combat.tracerLife);
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

    updateDaylight();
    updateHeli(dt);
    updateCamera(dt, false);

    // HUD.
    hud.update({ ...hudPayload(), dt, visible: state.screen === SCREEN_PLAY });
    hud.drawMinimap({
      half: city.half,
      roadLines: city.roadLines,
      landmarks: city.landmarks,
      missionTarget: missions.state === 'active' ? target : null,
      enemies,
      policeCars: wanted.policeCars,
      playerX: pp.x,
      playerZ: pp.z,
      playerHeading: player.inCar && player.car ? player.car.heading : player.heading,
      time: state.time,
    });

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
      let acc = dt;
      while (acc >= STEP) {
        step(STEP);
        acc -= STEP;
      }
    } else if (state.screen === SCREEN_TITLE) {
      state.time += dt;
      state.clockHour += (dt / cfg.time.dayLength) * 24;
      updateDaylight();
      // Slow orbit around the tower behind the title screen.
      const a = state.time * 0.05;
      camera.position.set(Math.sin(a) * 90, 42, Math.cos(a) * 90);
      camera.lookAt(0, 20, 0);
      updateHeli(dt);
      for (const car of traffic) updateTrafficCar(car, dt, [...traffic, ...parked], cfg);
    } else if (state.screen === SCREEN_OVER) {
      updateCamera(dt, false);
    }
    if (state.screen !== SCREEN_TITLE || state.shotMode) renderer.render(scene, camera);
    else renderer.render(scene, camera);
  }
  let last = performance.now();

  function stageShot(name) {
    state.shotMode = true;
    state.screen = SCREEN_PLAY;
    document.getElementById('screen-title').style.display = 'none';
    document.getElementById('screen-pause').style.display = 'none';
    document.getElementById('screen-over').style.display = 'none';
    startMission(missions, name === 'mission' ? 4 : 0, cfg);
    if (name === 'chase') {
      // Busiest shot: driving a stolen car through traffic, wanted 3, police
      // closing in head-on ahead and a traffic car in the same lane.
      const car = parked[0];
      enterCar(car);
      car.group.position.set(-28, 0, -40);
      car.heading = 0;
      car.group.rotation.y = 0;
      car.speed = 26;
      state.camYaw = 0;
      state.clockHour = 18.5;
      setStars(wanted, 3);
      ensurePolice(wanted, scene, playerPos(), rng);
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
    } else if (name === 'street') {
      playerMesh.position.set(28, 0, 28);
      player.heading = Math.PI * 0.75;
      state.camYaw = Math.PI * 0.75;
      state.clockHour = 18.2;
      missions.state = 'idle';
      for (let i = 0; i < 4; i += 1) {
        const ped = pedestrians[i];
        ped.group.position.set(24 + i * 3, 0, 34 - i * 2);
      }
    } else if (name === 'mission') {
      spawnMissionEnemies();
      // Stage from the coast road (x = 140) so no building blocks the docks.
      playerMesh.position.set(140, 0, 96);
      player.heading = Math.atan2(138 - 140, 112 - 96);
      state.camYaw = player.heading;
      state.clockHour = 18.7;
      hud.showMessage('Payback: Take down all 4 Reef Kings at the docks.', 30);
    } else if (name === 'dusk') {
      const car = parked[2];
      enterCar(car);
      car.group.position.set(112, 0, 28);
      car.heading = Math.PI / 2;
      car.group.rotation.y = Math.PI / 2;
      car.speed = 20;
      state.camYaw = Math.PI / 2;
      state.clockHour = 18.6;
      setStars(wanted, 0);
      missions.state = 'idle';
      hud.showMessage('Costa Fuego at dusk — the boardwalk never sleeps.', 30);
    }
    // Settle the world a few frames, then snap the camera and render.
    for (let i = 0; i < 30; i += 1) {
      for (const car of traffic) updateTrafficCar(car, STEP, [...traffic, ...parked], cfg);
    }
    updateDaylight();
    updateCamera(1, true);
    // Shots in a car use a closer camera so the car and the action fill the frame.
    if (player.inCar && player.car) {
      const cp = playerPos();
      const fwd = { x: Math.sin(state.camYaw), z: Math.cos(state.camYaw) };
      camera.position.set(cp.x - fwd.x * 8.5, 3.6, cp.z - fwd.z * 8.5);
      camera.lookAt(cp.x + fwd.x * 12, 1.4, cp.z + fwd.z * 12);
    }
    // The mission shot uses a higher camera so no building blocks the docks.
    if (name === 'mission') {
      const pp = playerPos();
      const fwd = { x: Math.sin(state.camYaw), z: Math.cos(state.camYaw) };
      camera.position.set(pp.x - fwd.x * 11, 7, pp.z - fwd.z * 11);
      camera.lookAt(pp.x + fwd.x * 8, 1.2, pp.z + fwd.z * 8);
    }
    hud.update({ ...hudPayload(), dt: 0, visible: true });
    const target = currentTarget(missions);
    hud.drawMinimap({
      half: city.half,
      roadLines: city.roadLines,
      landmarks: city.landmarks,
      missionTarget: missions.state === 'active' ? target : null,
      enemies,
      policeCars: wanted.policeCars,
      playerX: playerPos().x,
      playerZ: playerPos().z,
      playerHeading: player.inCar && player.car ? player.car.heading : player.heading,
      time: state.time,
    });
    renderer.render(scene, camera);
    window.__shotReady = true;
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
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
        startGame(false);
      });
      document.getElementById('btn-continue').addEventListener('click', () => {
        document.getElementById('screen-title').style.display = 'none';
        startGame(true);
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
      const save = loadSave();
      document.getElementById('btn-continue').style.display = save ? 'inline-block' : 'none';
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
