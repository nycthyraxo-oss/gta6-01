// game.js — the core of Costa Fuego: renderer, player, camera, combat,
// wanted flow, day/night, saving and the screen state machine. The city,
// traffic, crowd, police, missions and HUD live in their own modules;
// this file wires them into one playable open world.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { cfg, districtAt, streetLabelAt, WEAPONS, SHOPS, repRank, LANDMARKS, RACES, DELIVERIES, RAMPS } from './config.js';
import { makeStreams, streamStates } from './random.js';
import { Input } from './input.js';
import { GameAudio } from './audio.js';
import { City } from './city.js';
import { Traffic, Car, makeCarMesh, drivePlayerCar, carSilhouettes, disposeCarMesh, ownedCount } from './vehicles.js';
import { Crowd, makePedMesh } from './people.js';
import { Wanted, Police } from './police.js';
import { TrafficLights } from './trafficlights.js';
import { MissionRunner } from './missions.js';
import { MedalTracker, MEDAL_VALUE, MEDAL_SET_BONUS } from './medals.js';
import { Packages } from './packages.js';
import { Hud } from './hud.js';

const FIXED_DT = 1 / 60;
const MAX_STEPS = 3;

export class Game {
  constructor(canvas, seed) {
    this.canvas = canvas;
    this.seed = seed;
    this.streams = makeStreams(seed);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87c5e8);
    this.baseFogDensity = 0.0045;
    this.scene.fog = new THREE.FogExp2(0x87c5e8, this.baseFogDensity);
    this.camera = new THREE.PerspectiveCamera(cfg.camera.fov, 1, 0.1, 1200);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1280, 800), 0.35, 0.6, 0.85);
    this.composer.addPass(this.bloomPass);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
    this.scene.add(this.sun);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    this.hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 0.5);
    this.scene.add(this.hemi);

    this.input = new Input(canvas);
    this.audio = new GameAudio();
    this.city = new City(this.streams);
    this.scene.add(this.city.group);
    this.lights = new TrafficLights();
    this.traffic = new Traffic(this.scene, this.streams, this.lights);
    this.crowd = new Crowd(this.scene, this.streams);
    this.wanted = new Wanted();
    this.police = new Police(this.scene, this.streams);
    this.wanted.policeCars = this.police.cars;
    this.wanted.roadblocks = this.police.roadblocks;
    this.wanted.searchZone = null;
    this.missions = new MissionRunner();
    this.medals = new MedalTracker(this.scene);
    this.packages = new Packages(this.scene);
    this.hud = new Hud();
    this.settings = { preset: 'HIGH', bloom: true, traffic: 30, far: 1200, fogMul: 0.8 };
    this.shirtColor = 0xff8c3d;
    this.stuntsLanded = new Set();
    this.lastRampIndex = -1;
    this.autosaveTimer = 0;
    this.lockedToastAt = -99;
    this.smokePool = [];
    this.smokeTimer = 0;
    this.initSmokePool();

    this.player = {
      x: cfg.player.spawn.x, z: cfg.player.spawn.z, y: 0, vy: 0,
      heading: 0, health: cfg.player.maxHealth, cash: cfg.player.startCash,
      airborne: false, dead: false, mesh: null,
    };
    this.playerMesh = makePedMesh(0xff8c3d, 0x2b3a55);
    this.playerMesh.userData.kind = 'player';
    this.scene.add(this.playerMesh);
    this.player.mesh = this.playerMesh;

    this.camYaw = 0;
    this.camPitch = 0.32;
    this.inCar = null;
    this.screen = 'title';
    this.hour = cfg.time.startHour;
    this.day = 1;
    this.time = 0;
    this.accumulator = 0;
    this.weaponIndex = 0;
    this.ownedWeapons = ['pistol'];
    this.rep = 0;
    this.skillXp = { driving: 0, street: 0 };
    this.shootCooldown = 0;
    this.driftTime = 0;
    this.airTime = 0;
    this.wasWanted3 = false;
    this.shotMode = null;
    this.shotFrames = 0;
    // glowing objective marker that follows the current target
    this.targetMarker = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 6, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: 0.35, depthWrite: false }));
    this.targetMarker.userData.kind = 'marker';
    this.scene.add(this.targetMarker);
    this.nearShop = null;
    this.jobInfo = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.hud.showScreen('screen-title');
    this.refreshTitleButtons();
    this.applyPreset('HIGH');
    this.exposeDebug();
  }

  initSmokePool() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(60,60,60,0.55)');
    grad.addColorStop(1, 'rgba(60,60,60,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    for (let i = 0; i < 36; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      s.visible = false;
      s.userData.kind = 'smoke';
      this.scene.add(s);
      this.smokePool.push({ sprite: s, life: 0, vx: 0, vy: 0, vz: 0 });
    }
  }

  groundYAt(x, z) {
    if (x >= 160 && x <= 251 && z >= 92 && z <= 108) return 1.15;
    if (Math.hypot(x - cfg.world.islandX, z - cfg.world.islandZ) <= cfg.world.islandR) return 1.15;
    return 0;
  }

  skillLevel(xp) {
    const thresholds = [0, 10, 25, 50, 100, 200];
    let lv = 0;
    for (let i = 0; i < thresholds.length; i++) if (xp >= thresholds[i]) lv = i;
    return lv;
  }

  skillLevels() {
    return { driving: this.skillLevel(this.skillXp.driving), street: this.skillLevel(this.skillXp.street) };
  }

  applyPreset(name) {
    const presets = {
      LOW: { bloom: false, traffic: 10, far: 400, fogMul: 1.3 },
      MED: { bloom: true, traffic: 20, far: 800, fogMul: 1.0 },
      HIGH: { bloom: true, traffic: 30, far: 1200, fogMul: 0.8 },
    };
    const p = presets[name];
    if (!p) return this.settings;
    this.settings = { preset: name, ...p };
    this.traffic.setTrafficCount(p.traffic);
    this.camera.far = p.far;
    this.camera.updateProjectionMatrix();
    this.scene.fog.density = this.baseFogDensity * p.fogMul;
    this.bloomPass.enabled = p.bloom;
    const sel = document.getElementById('sel-preset');
    if (sel) sel.value = name;
    const rng = document.getElementById('rng-traffic');
    if (rng) rng.value = String(p.traffic);
    return this.settings;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.composer) this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  weapon() { return WEAPONS[this.weaponIndex]; }

  refreshTitleButtons() {
    const cont = document.getElementById('btn-continue');
    const has = this.hasSave();
    if (cont) cont.disabled = !has;
    if (has) {
      try {
        const data = JSON.parse(localStorage.getItem(cfg.save.key));
        const story = data && data.missionIndex !== undefined ? data.missionIndex : 0;
        const chapters = ['CH.1 HOMECOMING', 'CH.1 HOMECOMING', 'CH.2 REEF TROUBLE', 'CH.2 REEF TROUBLE', 'CH.3 ISLAND BUSINESS', 'CH.3 ISLAND BUSINESS'];
        const ch = chapters[Math.min(story, chapters.length - 1)] || 'CH.1 HOMECOMING';
        this.hud.setSaveStatus(ch + ' · $' + Math.floor(data.cash || 0) + ' · REP ' + (data.rep || 0) + ' · DAY ' + (data.day || 1));
      } catch (_) { /* keep default pill */ }
    } else {
      this.hud.setSaveStatus('CH.1 HOMECOMING · $0 · REP 0 · DAY 1');
    }
  }

  hasSave() {
    try { return !!localStorage.getItem(cfg.save.key); } catch (_) { return false; }
  }

  save() {
    const data = {
      cash: this.player.cash, health: this.player.health, rep: this.rep,
      x: this.player.x, z: this.player.z, heading: this.player.heading,
      missionIndex: this.missions.storyIndex, storyDone: this.missions.storyDone,
      completed: this.missions.completed, questLog: this.missions.questLog,
      ownedWeapons: this.ownedWeapons, weaponIndex: this.weaponIndex,
      packages: this.packages.takenIndexes(),
      medals: this.medals.takenFlags(),
      raceWins: [...this.missions.raceWins],
      deliveriesDone: [...this.missions.deliveriesDone],
      skills: { driving: this.skillXp.driving, street: this.skillXp.street },
      shirtColor: this.shirtColor,
      hour: this.hour, day: this.day,
      streams: streamStates(this.streams),
    };
    try {
      localStorage.setItem(cfg.save.key, JSON.stringify(data));
      this.hud.setSaveStatus('Saved ✓');
      return true;
    } catch (_) {
      this.hud.setSaveStatus('Save failed');
      return false;
    }
  }

  load() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(cfg.save.key)); } catch (_) {}
    if (!data) return false;
    this.player.cash = data.cash; this.player.health = data.health;
    this.player.x = data.x; this.player.z = data.z; this.player.heading = data.heading || 0;
    this.rep = data.rep || 0;
    this.missions.storyIndex = data.missionIndex || 0;
    this.missions.storyDone = !!data.storyDone;
    this.missions.completed = data.completed || [];
    this.missions.questLog = data.questLog || [];
    this.missions.raceWins = data.raceWins || [false, false, false];
    this.missions.deliveriesDone = data.deliveriesDone || [false, false, false];
    this.ownedWeapons = data.ownedWeapons || ['pistol'];
    this.weaponIndex = data.weaponIndex || 0;
    this.packages.restore(data.packages || []);
    this.medals.restore(data.medals || []);
    if (data.skills) this.skillXp = { driving: data.skills.driving || 0, street: data.skills.street || 0 };
    if (data.shirtColor !== undefined) this.setShirtColor(data.shirtColor);
    this.hour = data.hour !== undefined ? data.hour : cfg.time.startHour;
    this.day = data.day || 1;
    if (data.streams) {
      for (const k of Object.keys(this.streams)) {
        if (data.streams[k] !== undefined) this.streams[k].state = data.streams[k] >>> 0;
      }
    }
    return true;
  }

  setShirtColor(color) {
    this.shirtColor = color;
    const torso = this.playerMesh.children[0];
    if (torso) torso.material = new THREE.MeshLambertMaterial({ color });
  }

  newGame() {
    this.player.x = cfg.player.spawn.x; this.player.z = cfg.player.spawn.z;
    this.player.y = 0; this.player.vy = 0; this.player.heading = 0;
    this.player.health = cfg.player.maxHealth;
    this.player.cash = cfg.player.startCash;
    this.player.dead = false;
    this.rep = 0;
    this.wanted.clear();
    this.wanted.searchZone = null;
    this.missions = new MissionRunner();
    this.ownedWeapons = ['pistol'];
    this.weaponIndex = 0;
    this.skillXp = { driving: 0, street: 0 };
    this.hour = cfg.time.startHour;
    this.day = 1;
    if (this.inCar) { this.inCar = null; }
    this.playerMesh.visible = true;
    this.startPlay();
    const intro = this.missions.currentStory();
    if (intro && intro.dialogue.length) this.hud.showDialogue([intro.dialogue[0]]);
    this.hud.toast('Welcome to Costa Fuego. Meet Marla at her garage.', 5);
  }

  continueGame() {
    if (this.load()) {
      this.startPlay();
      this.hud.toast('Welcome back to Costa Fuego.', 4);
    } else {
      this.newGame();
    }
  }

  startPlay() {
    this.screen = 'play';
    this.hud.hideScreens();
    this.audio.ensure();
    this.input.wantLock(true);
  }

  setScreen(screen) {
    this.screen = screen;
    this.hud.mapOpen = screen === 'map';
    if (screen === 'title') this.hud.showScreen('screen-title');
    else if (screen === 'pause') this.hud.showScreen('screen-pause');
    else if (screen === 'job') this.hud.showScreen('screen-job');
    else if (screen === 'over') this.hud.showScreen('screen-over');
    else if (screen === 'controls') this.hud.showScreen('screen-controls');
    else if (screen === 'shop') this.hud.showScreen('screen-shop');
    else if (screen === 'map') this.hud.showScreen('screen-map');
    else this.hud.hideScreens();
    if (screen !== 'play') {
      this.input.releaseLock();
      this.audio.stopAllLoops();
    }
    const focusId = { job: 'btn-job-continue', pause: 'btn-resume', over: 'btn-respawn' }[screen];
    if (focusId) {
      const btn = document.getElementById(focusId);
      if (btn) btn.focus();
    }
    if (screen === 'pause') this.save();
  }

  die() {
    this.player.dead = true;
    this.player.health = 0;
    this.audio.stopAllLoops();
    this.setScreen('over');
  }

  damagePlayer(amount) {
    if (this.player.dead) return;
    this.player.health -= amount;
    if (this.player.health <= 0) this.die();
  }

  respawn() {
    this.player.cash = Math.max(0, this.player.cash - cfg.player.respawnCost);
    this.player.health = cfg.player.maxHealth;
    this.player.dead = false;
    const hosp = LANDMARKS.find(l => l.id === 'hospital');
    this.player.x = hosp.x; this.player.z = hosp.z + 12;
    this.player.y = 0; this.player.vy = 0;
    this.wanted.clear();
    this.wanted.searchZone = null;
    if (this.inCar) this.inCar = null;
    this.playerMesh.visible = true;
    this.setScreen('play');
    this.input.wantLock(true);
    this.hud.toast('Patched up at Costa General. -$' + cfg.player.respawnCost, 4);
    this.save();
  }

  quitToTitle() {
    this.audio.stopAllLoops();
    this.setScreen('title');
    this.refreshTitleButtons();
  }

  exposeDebug() {
    const game = this;
    window.__game = {
      game,
      cfg,
      player: this.player,
      wanted: this.wanted,
      police: this.police,
      missions: this.missions,
      traffic: this.traffic,
      crowd: this.crowd,
      city: this.city,
      lights: this.lights,
      medals: this.medals,
      packages: this.packages,
      audio: this.audio,
      hud: this.hud,
      input: this.input,
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      get screen() { return game.screen; },
      get inCar() { return game.inCar; },
      get cars() { return game.traffic.allCars().concat(game.police.cars); },
      get peds() { return game.crowd.peds; },
      get rep() { return game.rep; },
      get hour() { return game.hour; },
      get day() { return game.day; },
      get cash() { return game.player.cash; },
      get health() { return game.player.health; },
      get weapon() { return game.weapon(); },
      get camYaw() { return game.camYaw; },
      set camYaw(v) { game.camYaw = v; },
      districtAt,
      streetLabelAt,
      state: {
        get screen() { return game.screen; },
        get camYaw() { return game.camYaw; },
        set camYaw(v) { game.camYaw = v; },
        get camFocus() {
          if (!game.camFocusOverride) game.camFocusOverride = { x: game.player.x, z: game.player.z };
          return game.camFocusOverride;
        },
        set camFocus(v) { game.camFocusOverride = v; },
        get clockHour() { return game.hour; },
        set clockHour(v) { game.hour = v; },
        get day() { return game.day; },
        set day(v) { game.day = v; },
      },
      debug: {
        placementAudit: () => game.placementAudit(),
        sceneAudit: () => game.sceneAudit(),
        peds: () => game.crowd.peds.map(p => ({ x: p.x, z: p.z, kind: p.kind, alive: p.alive, health: p.health })),
        traffic: () => game.traffic.cars.filter(c => c.kind === 'traffic').map(c => ({ x: c.x, z: c.z, speed: c.speed, driver: c.hasDriver, heading: c.heading })),
        cars: () => game.traffic.allCars().map(c => ({ x: c.x, z: c.z, speed: c.speed, kind: c.kind, driver: c.hasDriver })),
        state: () => ({
          screen: game.screen, cash: game.player.cash, health: game.player.health,
          stars: game.wanted.stars, heat: game.wanted.heat, rep: game.rep,
          hour: game.hour, day: game.day, inCar: !!game.inCar,
          player: { x: game.player.x, z: game.player.z },
        }),
        playerPos: () => ({ x: game.player.x, z: game.player.z }),
        pos: () => ({ x: game.player.x, z: game.player.z }),
        camYaw: () => game.camYaw,
        setCamYaw: (v) => { game.camYaw = v; },
        setYaw: (v) => { game.camYaw = v; game.player.heading = v; },
        playerState: () => ({
          inCar: !!game.inCar, carSpeed: game.inCar ? game.inCar.speed : 0,
          health: game.player.health, dead: game.player.dead,
        }),
        ammo: () => ({ cash: game.player.cash, rep: game.rep, weapon: game.weapon().id }),
        carVisual: () => game.inCar ? { y: game.inCar.y, air: game.inCar.airY || 0, speed: game.inCar.speed } : null,
        poolStats: () => ({ smoke: game.smokePool.filter(s => s.life > 0).length }),
        playerCar: () => game.inCar ? { x: game.inCar.x, z: game.inCar.z, y: game.inCar.y, speed: game.inCar.speed, heading: game.inCar.heading } : null,
        placeCar: (x, z, h) => {
          if (!game.inCar) return null;
          game.inCar.x = x; game.inCar.z = z; game.inCar.heading = h;
          game.inCar.y = game.groundYAt(x, z); game.inCar.airY = 0; game.inCar.vy = 0;
          game.inCar.syncMesh();
          game.player.x = x; game.player.z = z;
          return { x, z };
        },
        setCarSpeed: (v) => { if (game.inCar) game.inCar.speed = v; },
        movePed: (i, x, z) => {
          const ped = game.crowd.peds[i];
          if (!ped) return null;
          ped.x = x; ped.z = z; ped.syncMesh();
          return { x, z };
        },
        enterNearestCar: () => {
          let best = null, bestD = 30;
          for (const car of game.traffic.allCars()) {
            const d = Math.hypot(game.player.x - car.x, game.player.z - car.z);
            if (d < bestD) { bestD = d; best = car; }
          }
          if (!best) return { inCar: false, name: null };
          game.enterCar(best, false);
          return { inCar: !!game.inCar, name: best.name };
        },
        nearestParkedCar: () => {
          let best = null, bestD = Infinity;
          for (const car of game.traffic.parked) {
            const d = Math.hypot(game.player.x - car.x, game.player.z - car.z);
            if (d < bestD) { bestD = d; best = car; }
          }
          return best ? { x: best.x, z: best.z, dist: bestD } : null;
        },
        saveRoundTrip: (cash) => {
          game.player.cash = cash;
          game.save();
          try {
            const data = JSON.parse(localStorage.getItem(cfg.save.key));
            return {
              cash: data.cash, medals: data.medals, raceWins: data.raceWins,
              deliveriesDone: data.deliveriesDone, skills: data.skills, shirtColor: data.shirtColor,
            };
          } catch (_) { return null; }
        },
        setCash: (v) => { game.player.cash = v; },
        setRepBonus: (v) => { game.rep = v; },
        setClockHour: (h) => { game.hour = h; },
        setStars: (n) => {
          game.wanted.stars = n;
          game.wanted.heat = n === 0 ? 0 : n * cfg.police.heatPerStar + 12;
          game.wanted.lastCrimeAt = game.wanted.time;
        },
        race: () => game.missions.raceState(),
        setRaceTime: (v) => { if (game.missions.active) game.missions.active.timer = v; },
        shop: () => game.nearShop ? { kind: game.nearShop.kind, screen: game.screen } : { kind: null, screen: game.screen },
        buildingCount: () => game.city.buildings.length,
        teleport: (x, z) => { game.placePlayerAt(x, z); },
        placePlayer: (x, z) => { game.placePlayerAt(x, z); },
        inVisionCone: () => game.police.inVisionCone(game.player),
        medals: () => ({ total: game.medals.total(), count: game.medals.count(), spots: game.medals.spots() }),
        races: () => ({ list: RACES.map(r => ({ name: r.name, repNeed: r.repNeed })) }),
        stunts: () => ({
          total: RAMPS.length,
          ramps: RAMPS.map(r => ({ x: r.x, z: r.z, axis: r.axis })),
          count: game.stuntsLanded.size,
          landed: [...game.stuntsLanded],
        }),
        deliveries: () => game.missions.deliveryState(),
        skills: () => ({ levels: game.skillLevels(), xp: { ...game.skillXp } }),
        setSkillXp: (name, v) => { game.skillXp[name] = v; return game.skillLevel(v); },
        streetAt: (x, z) => {
          const aves = [[-140, 'Harbor Ave'], [-84, 'Liberty Ave'], [-28, 'Jasmine Ave'], [28, 'Fuego Ave'], [84, 'Rose Ave'], [140, 'Beach Ave']];
          const sts = [[-140, 'Garuda St'], [-84, 'Melati St'], [-28, 'Coral St'], [28, 'Orchid St'], [84, 'Sudirman St'], [140, 'Seaside St']];
          for (const [lx, name] of aves) if (Math.abs(x - lx) <= 10) return name;
          for (const [lz, name] of sts) if (Math.abs(z - lz) <= 10) return name;
          return null;
        },
        witness: () => game.wanted.witnessState(),
        heat: () => ({ heat: game.wanted.heat, stars: game.wanted.stars }),
        gate: () => ({ open: game.city.gateOpen, beamY: game.city.gateBeam ? game.city.gateBeam.position.y : 7.2 }),
        carSilhouettes: () => carSilhouettes(),
        pedsOnSidewalk: () => {
          const lines = [-140, -84, -28, 28, 84, 140];
          let on = 0;
          const walkers = game.crowd.peds.filter(p => p.kind === 'walker' && p.alive);
          for (const p of walkers) {
            const dAve = Math.min(...lines.map(l => Math.abs(p.x - l)));
            const dSt = Math.min(...lines.map(l => Math.abs(p.z - l)));
            // on a sidewalk = beside some road at sidewalk distance
            if ((dAve >= 13 && dAve <= 18) || (dSt >= 13 && dSt <= 18)) on++;
          }
          return { total: walkers.length, on };
        },
        settings: () => ({ ...game.settings, traffic: game.traffic.cars.length }),
        applyPreset: (name) => game.applyPreset(name),
        shirtColor: () => game.shirtColor,
        groundYAt: (x, z) => game.groundYAt(x, z),
        disposeCheck: () => {
          const out = {};
          for (const name of Object.keys(carSilhouettes())) {
            const mesh = makeCarMesh(0xffffff, 'car', name);
            const ownedBefore = ownedCount(mesh);
            disposeCarMesh(mesh);
            out[name] = { ownedBefore, ownedAfter: ownedCount(mesh) };
          }
          return out;
        },
        colliders: () => game.city.colliders.map(c => ({ ...c })),
        roadCheck: () => ({
          width: 20,
          samples: [[-28, 0], [-18.5, 0], [-16, 0], [0, -28], [0, -18.5], [0, -16]]
            .map(([x, z]) => ({ x, z, on: game.pointOnRoad(x, z) })),
        }),
        police: () => game.police.cars.map(c => ({ x: c.x, z: c.z, speed: c.speed, heading: c.heading })),
        damageCar: (v) => { if (game.inCar) { game.inCar.condition = v; game.inCar.health = v; } },
        titleCam: () => ({ r: 115, y: 38, fog: game.baseFogDensity }),
        stopPoliceCar: () => {
          const car = game.police.cars[0];
          if (!car) return null;
          car.speed = 0;
          car.stopped = true;
          game.placePlayerAt(car.x - 1.5, car.z);
          return { x: car.x, z: car.z };
        },
        placePoliceCar: (i, x, z, h) => {
          const car = game.police.cars[i];
          if (!car) return null;
          car.x = x; car.z = z; car.heading = h; car.speed = 0; car.syncMesh();
          return { x, z };
        },
        volumes: () => game.audio.volumes(),
        bigmapPixel: (x, y) => {
          if (!game.hud.bigctx) return null;
          const d = game.hud.bigctx.getImageData(x, y, 1, 1).data;
          return [d[0], d[1], d[2]];
        },
        pointerLock: () => ({ locked: game.input.locked }),
        sirenOn: () => game.audio.sirenOn,
        audioLoops: () => game.audio.loopsState(),
        kill: () => game.damagePlayer(10000),
      },
      audit: () => game.city.auditData(),
      landmarks: LANDMARKS,
      shops: SHOPS,
      save: () => game.save(),
      load: () => game.load(),
      newGame: () => game.newGame(),
      respawn: () => game.respawn(),
      addHeat: (n) => game.wanted.addHeat(n),
      startShot: (name) => game.startShot(name),
    };
  }

  placePlayerAt(x, z) {
    if (this.inCar) this.exitCar();
    this.player.x = x; this.player.z = z;
    this.player.y = this.groundYAt(x, z);
    this.player.vy = 0;
    this.playerMesh.position.set(x, this.player.y, z);
  }

  pointOnRoad(x, z) {
    const lines = [-140, -84, -28, 28, 84, 140];
    return lines.some(l => Math.abs(x - l) <= 10) || lines.some(l => Math.abs(z - l) <= 10);
  }

  startShot(name) {
    this.shotMode = name;
    this.shotFrames = 0;
    this.newGame();
    if (name !== 'dialogue') {
      this.hud.dialogueQueue = [];
      this.hud.dialogueOpen = false;
      this.hud.paintDialogue();
    }
    if (name === 'chase') {
      const car = this.traffic.parked[0];
      this.enterCar(car, true);
      car.x = 28; car.z = -30; car.heading = 0; car.speed = 18;
      car.syncMesh();
      this.player.x = car.x; this.player.z = car.z;
      this.camYaw = 0;
      this.wanted.heat = 80; this.wanted.recompute();
      this.hour = 17.5;
    } else if (name === 'combat') {
      this.player.x = 54; this.player.z = -19; this.player.heading = 0;
      this.camYaw = 0;
      this.missions.storyIndex = 2;
      const gang = this.crowd.peds.filter(p => p.kind === 'gang');
      if (gang[0]) gang[0].hurt(1000);
      if (gang[1]) gang[1].hurt(1000);
      // stage the survivors facing Rico across the plaza green
      const spots = [[50, -9], [54, -11], [58, -9]];
      gang.slice(2).forEach((ped, i) => {
        if (spots[i]) { ped.x = spots[i][0]; ped.z = spots[i][1]; ped.heading = Math.PI; ped.syncMesh(); }
      });
      this.wanted.heat = 30; this.wanted.recompute();
      this.hour = 19;
    } else if (name === 'map') {
      this.player.x = 0; this.player.z = 20;
    } else if (name === 'dialogue') {
      this.player.x = -112; this.player.z = 92;
      this.player.heading = 0;
      this.hud.showDialogue(this.missions.currentStory().dialogue);
    } else if (name === 'play') {
      this.player.x = 30; this.player.z = 30;
    } else if (name === 'end') {
      this.player.x = 247; this.player.z = 100;
    }
    this.setScreen(name === 'map' ? 'map' : 'play');
    this.updateHud(0);
  }

  frame(nowMs) {
    const dtReal = Math.min(0.1, (nowMs - (this.lastMs || nowMs)) / 1000);
    this.lastMs = nowMs;
    if (this.shotMode) {
      // staged shots step exactly once per frame so renders are
      // byte-identical between runs
      this.step(FIXED_DT);
      this.accumulator = 0;
    } else {
      this.accumulator += dtReal;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < MAX_STEPS) {
        this.step(FIXED_DT);
        this.accumulator -= FIXED_DT;
        steps++;
      }
      if (steps === MAX_STEPS) this.accumulator = 0;
    }
    this.render();
    if (this.shotMode) {
      this.shotFrames++;
      if (this.shotFrames > 30) window.__shotReady = true;
    }
  }

  step(dt) {
    this.time += dt;
    if (this.screen === 'title' || this.screen === 'controls') {
      this.titleStep(dt);
      this.input.clearFrame();
      return;
    }
    if (this.screen === 'pause') {
      if (this.input.take('p') || this.input.take('escape') || this.input.take('enter')) this.resume();
      this.input.clearFrame();
      return;
    }
    if (this.screen === 'job') {
      if (this.input.take('enter') || this.input.takeClick()) this.closeJob();
      this.input.clearFrame();
      return;
    }
    if (this.screen === 'over') {
      if (this.input.take('enter') || this.input.take(' ')) this.respawn();
      this.input.clearFrame();
      return;
    }
    if (this.screen === 'map') {
      if (this.input.take('m') || this.input.take('enter') || this.input.take('escape')) {
        this.setScreen('play');
        this.input.wantLock(true);
      }
      this.updateHud(dt);
      this.input.clearFrame();
      return;
    }
    if (this.screen === 'shop') {
      if (this.input.take('escape') || this.input.take('e') || this.input.take('enter')) this.closeShop();
      else {
        for (let i = 1; i <= 4; i++) {
          if (this.input.take(String(i)) && this.shopItems && this.shopItems[i - 1]) {
            this.shopItems[i - 1].act();
            this.paintShop();
          }
        }
      }
      this.input.clearFrame();
      return;
    }
    // Q (quest panel) works even while dialogue is open
    if (this.input.take('q')) this.hud.toggleQuest();
    // dialogue eats any other keypress first
    if (this.hud.dialogueOpen) {
      if (this.input.takeAnyKey()) this.hud.advanceDialogue();
      this.updateWorld(dt, true);
      this.input.clearFrame();
      return;
    }
    this.updateWorld(dt, false);
    this.input.clearFrame();
  }

  titleStep(dt) {
    // slow orbit over the city behind the poster
    this.camYaw += dt * 0.05;
    const r = 115;
    this.camera.position.set(Math.cos(this.camYaw) * r, 38, Math.sin(this.camYaw) * r);
    this.camera.lookAt(0, 4, 0);
    this.lights.update(dt);
    this.city.updateLightHeads(this.lights);
    this.updateDayNight(dt);
    if (this.input.take('enter')) {
      if (this.hasSave()) this.continueGame(); else this.newGame();
    }
  }

  resume() {
    this.setScreen('play');
    this.input.wantLock(true);
  }

  closeJob() {
    this.setScreen('play');
    this.input.wantLock(true);
    if (this.jobInfo && this.jobInfo.dialogue) this.hud.showDialogue(this.jobInfo.dialogue);
    this.jobInfo = null;
  }

  openShop(shop) {
    this.nearShop = shop;
    this.setScreen('shop');
    this.paintShop();
  }

  closeShop() {
    this.nearShop = null;
    this.setScreen('play');
    this.input.wantLock(true);
  }

  paintShop() {
    const title = document.getElementById('shop-title');
    const rows = document.getElementById('shop-items');
    const shop = this.nearShop;
    if (!title || !rows || !shop) return;
    title.textContent = shop.name;
    const items = [];
    if (shop.kind === 'guns') {
      for (const w of WEAPONS) {
        if (w.price > 0 && !this.ownedWeapons.includes(w.id)) {
          items.push({ label: 'Buy ' + w.name + ' — $' + w.price, act: () => this.buyWeapon(w) });
        }
      }
      items.push({ label: 'Buy armor vest — $150 (heal to full)', act: () => this.buyHeal(150) });
    } else if (shop.kind === 'spray') {
      items.push({ label: "Respray + repair — $100 (clears wanted)", act: () => this.buySpray() });
    } else if (shop.kind === 'outfit') {
      items.push({ label: 'Red shirt — $50', act: () => this.buyShirt(0xc23b2e, 50) });
      items.push({ label: 'Teal shirt — $50', act: () => this.buyShirt(0x3dc2b8, 50) });
      items.push({ label: 'Gold jacket — $120', act: () => this.buyShirt(0xf2c14c, 120) });
    }
    items.push({ label: 'Leave [E]', act: () => this.closeShop() });
    this.shopItems = items;
    rows.innerHTML = '';
    items.forEach((item, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shop-row';
      btn.dataset.key = String(i + 1);
      btn.textContent = (i + 1) + '. ' + item.label;
      btn.addEventListener('click', () => { item.act(); this.paintShop(); });
      rows.appendChild(btn);
    });
  }

  buyShirt(color, price) {
    if (this.player.cash < price) { this.hud.toast('Not enough cash.'); return; }
    this.player.cash -= price;
    this.setShirtColor(color);
    this.audio.cash();
    this.hud.toast('New shirt. Looking sharp.');
  }

  buyWeapon(w) {
    if (this.player.cash < w.price) { this.hud.toast('Not enough cash.'); return; }
    this.player.cash -= w.price;
    this.ownedWeapons.push(w.id);
    this.weaponIndex = WEAPONS.indexOf(w);
    this.audio.cash();
    this.hud.toast(w.name + ' bought.');
  }

  buyHeal(cost) {
    if (this.player.cash < cost) { this.hud.toast('Not enough cash.'); return; }
    this.player.cash -= cost;
    this.player.health = cfg.player.maxHealth;
    this.audio.cash();
  }

  buySpray() {
    if (this.player.cash < 100) { this.hud.toast('Not enough cash.'); return; }
    this.player.cash -= 100;
    this.wanted.clear();
    if (this.inCar) this.inCar.health = 100;
    this.audio.cash();
    this.hud.toast('Resprayed. The heat is off.');
  }

  buyOutfit() {
    if (this.player.cash < 50) { this.hud.toast('Not enough cash.'); return; }
    this.player.cash -= 50;
    const colors = [0xff8c3d, 0x3dc2b8, 0xe84a6f, 0x7ed957, 0xf2c14c, 0xb45ae8];
    const torso = this.playerMesh.children[0];
    if (torso) torso.material = new THREE.MeshLambertMaterial({ color: colors[this.streams.effects.int(0, colors.length - 1)] });
    this.audio.cash();
  }

  updateWorld(dt, frozen) {
    this.lights.update(dt);
    this.city.updateLightHeads(this.lights);
    this.updateDayNight(dt);
    if (!frozen) {
      this.handleKeys(dt);
      this.updatePlayer(dt);
      this.updateCombat(dt);
    }
    this.traffic.update(dt, this.player);
    this.crowd.update(dt, this.player);
    for (const ped of this.crowd.peds) {
      if (ped.alive) this.collideCircle(ped, 0.4);
    }
    // heat decay: hidden when out of the vision cone (or past the gate),
    // three times faster when far from every cruiser
    const pastGate = this.player.x > 209;
    const inCone = this.police.inVisionCone(this.player);
    const nearestCop = this.police.cars.length
      ? Math.min(...this.police.cars.map(c => Math.hypot(c.x - this.player.x, c.z - this.player.z)))
      : Infinity;
    const hidden = pastGate || !inCone;
    const rateMul = (pastGate || nearestCop > 50) ? 5 : 1;
    this.wanted.update(dt, hidden, rateMul);
    if (this.wanted.heat <= 0) this.wanted.searchZone = null;
    this.police.update(dt, this.wanted, this.player, this.inCar, (cop) => this.onPoliceRam(cop));
    if (this.police.heli) this.city.heli = this.police.heli.mesh;
    this.city.updateGate(this.player.x, this.player.z, dt);
    this.updateSmoke(dt);
    this.audio.siren(this.wanted.stars > 0 && this.screen === 'play');
    this.audio.engine(!!this.inCar && this.screen === 'play', this.inCar ? this.inCar.speed / cfg.car.maxSpeed : 0);
    // autosave while playing
    this.autosaveTimer += dt;
    if (this.autosaveTimer > 15) { this.autosaveTimer = 0; this.save(); }
    // boats bob
    for (const b of this.city.boats) {
      b.group.position.y = Math.sin(this.time * 0.9 + b.phase) * 0.12;
      b.group.rotation.z = Math.sin(this.time * 0.7 + b.phase) * 0.03;
    }
    // missions
    if (!frozen) {
      this.checkJobStarts();
      const done = this.missions.checkStory(this.player, !!this.inCar);
      if (done) this.completeStory(done);
      const side = this.missions.updateActive(dt, this.player);
      if (side === 'done') this.completeSideJob();
      else if (side === 'failed') { this.hud.banner('JOB FAILED'); this.audio.fail(); }
      else if (side === 'checkpoint') { this.audio.pickup(); this.hud.toast('Checkpoint!'); }
    }
    const found = this.packages.update(dt, this.player);
    if (found) {
      this.player.cash += 50;
      this.rep += 2;
      this.audio.cash();
      this.hud.toast('Hidden package ' + this.packages.foundCount() + '/' + this.packages.total() + ' — $50');
    }
    // medals
    const medal = this.medals.update(dt, this.player);
    if (medal) {
      this.player.cash += MEDAL_VALUE;
      const n = this.medals.count();
      if (n >= this.medals.total()) {
        this.player.cash += MEDAL_SET_BONUS;
        this.hud.banner('FULL MEDAL SET — $' + MEDAL_SET_BONUS + ' BONUS!');
      } else {
        this.hud.toast('Medal ' + n + '/' + this.medals.total() + ' — $' + MEDAL_VALUE);
      }
      this.audio.cash();
    }
    this.updateHud(dt);
  }

  completeStory(m) {
    this.player.cash += m.reward;
    this.rep += m.rep;
    this.jobInfo = { dialogue: m.dialogue };
    const title = document.getElementById('job-title');
    const body = document.getElementById('job-body');
    if (title) title.textContent = 'JOB COMPLETE';
    if (body) body.textContent = m.name + ' — $' + m.reward + ' · +' + m.rep + ' REP';
    this.audio.win();
    this.save();
    this.setScreen('job');
  }

  completeSideJob() {
    const last = this.missions.lastDone;
    if (last) {
      const pay = last.type === 'race' ? last.def.prize : last.def.pay;
      const repGain = last.type === 'race' ? last.def.rep : 3;
      this.player.cash += pay;
      this.rep += repGain;
      this.hud.banner('JOB COMPLETE — $' + pay);
    } else {
      this.hud.banner('JOB COMPLETE');
    }
    this.audio.win();
  }

  checkJobStarts() {
    if (this.missions.active) return;
    const p = this.player;
    for (const race of RACES) {
      if (Math.hypot(p.x - race.start.x, p.z - race.start.z) < 6) {
        if (this.rep < race.repNeed) {
          if (this.time - this.lockedToastAt > 4) {
            this.lockedToastAt = this.time;
            this.hud.toast('LOCKED — REP ' + race.repNeed + ' required for ' + race.name);
          }
          return;
        }
        this.missions.startRace(race);
        this.hud.banner('RACE: ' + race.name.toUpperCase());
        this.audio.pickup();
        return;
      }
    }
  }

  onPoliceRam(cop) {
    if (this.inCar) {
      this.inCar.speed *= 0.55;
      this.inCar.health -= 6;
      this.audio.crash();
    } else {
      this.player.health -= 8;
      this.audio.hit();
      if (this.player.health <= 0) this.die();
    }
  }

  handleKeys(dt) {
    const input = this.input;
    if (input.take('p') || input.take('escape')) { this.setScreen('pause'); return; }
    if (input.take('m')) {
      this.setScreen('map');
      this.updateHud(0);
    }
    if (input.take('q')) this.hud.toggleQuest();
    if (input.take('b')) {
      const st = this.audio.cycleRadio();
      this.hud.toast(st ? '📻 ' + st.freq + ' ' + st.name : 'Radio off');
    }
    if (input.take('n')) {
      this.audio.setMuted(!this.audio.muted);
      this.hud.toast(this.audio.muted ? 'Sound off' : 'Sound on');
    }
    if (input.take('l')) {
      this.hour = (this.hour + 3) % 24;
      this.hud.toast('Time skipped');
    }
    if (input.take('v')) this.spawnFastCar();
    if (input.take('r')) this.restartMission();
    if (input.take('e')) this.interact();
    if (input.take('1')) this.setWeapon(0);
    if (input.take('2')) this.setWeapon(1);
    if (input.take('3')) this.setWeapon(2);
    if (input.take('4')) this.setWeapon(3);
    if (input.take('g')) this.cycleWeapon();
  }

  setWeapon(i) {
    if (WEAPONS[i] && this.ownedWeapons.includes(WEAPONS[i].id)) this.weaponIndex = i;
  }

  cycleWeapon() {
    for (let n = 1; n <= WEAPONS.length; n++) {
      const i = (this.weaponIndex + n) % WEAPONS.length;
      if (this.ownedWeapons.includes(WEAPONS[i].id)) { this.weaponIndex = i; return; }
    }
  }

  spawnFastCar() {
    const mesh = makeCarMesh(0xf2c14c);
    this.scene.add(mesh);
    const car = new Car(mesh, this.player.x + 4, this.player.z + 4, this.player.heading, { kind: 'parked' });
    car.fast = true;
    this.traffic.parked.push(car);
    this.hud.toast('A tuned ride rolls up beside you.');
  }

  restartMission() {
    this.audio.stopAllLoops();
    const m = this.missions.currentStory();
    if (m) {
      this.player.x = cfg.player.spawn.x;
      this.player.z = cfg.player.spawn.z;
    }
    if (this.inCar) this.inCar = null;
    this.playerMesh.visible = true;
    this.hud.toast('Back to the start of the job.');
  }

  interact() {
    if (this.inCar) { this.exitCar(); return; }
    // shop doors first
    for (const s of SHOPS) {
      if (Math.hypot(this.player.x - s.x, this.player.z - s.z) < 9.5) { this.openShop(s); return; }
    }
    // safehouse: heal + save
    const sh = LANDMARKS.find(l => l.id === 'safehouse');
    if (sh && Math.hypot(this.player.x - sh.x, this.player.z - sh.z) < 7) {
      this.player.health = cfg.player.maxHealth;
      this.save();
      this.audio.cash();
      this.hud.toast('Rested at the safehouse. Game saved.');
      return;
    }
    // delivery pickup
    if (!this.missions.active) {
      for (const del of DELIVERIES) {
        if (Math.hypot(this.player.x - del.pickup.x, this.player.z - del.pickup.z) < 6) {
          if (this.rep < del.repNeed) {
            this.hud.toast('LOCKED — REP ' + del.repNeed + ' required for ' + del.name);
            return;
          }
          this.missions.startDelivery(del);
          this.hud.banner('DELIVERY: ' + del.name.toUpperCase());
          this.audio.pickup();
          return;
        }
      }
    }
    // nearest car
    let best = null, bestD = 4.2;
    for (const car of this.traffic.allCars().concat(this.police.cars)) {
      const d = Math.hypot(this.player.x - car.x, this.player.z - car.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (best) this.enterCar(best, false);
  }

  enterCar(car, silent) {
    const wasTraffic = car.kind === 'traffic' && car.hasDriver;
    const wasPolice = car.kind === 'police';
    if (wasPolice) {
      // stealing a cruiser: full heat, and the car leaves the force
      const idx = this.police.cars.indexOf(car);
      if (idx >= 0) this.police.cars.splice(idx, 1);
      car.kind = 'parked';
      this.traffic.parked.push(car);
      this.wanted.addHeat(55);
      this.markSearchZone();
      this.audio.door();
      if (!silent) this.hud.toast('You stole a police cruiser!');
    } else if (wasTraffic) {
      // carjack: the driver bails out and flees; witnesses call it in
      car.ejectDriver();
      car.kind = 'parked';
      const idx = this.traffic.cars.indexOf(car);
      if (idx >= 0) this.traffic.cars.splice(idx, 1);
      this.traffic.parked.push(car);
      this.crowd.addFleeingDriver(car.x + 1.4, car.z);
      this.wanted.addHeat(18);
      this.markSearchZone();
      const witnesses = this.crowd.witnessesNear(car.x, car.z, 25);
      if (witnesses.length > 0) {
        this.wanted.witnessedCrime(cfg.police.carjackHeat, witnesses[0]);
        this.crowd.panicNear(car.x, car.z, 16);
      }
      this.audio.door();
      if (!silent) this.hud.toast('Carjacked! ' + (witnesses.length ? 'Someone saw that…' : 'Nobody saw a thing.'));
    } else if (car.kind === 'parked' && !silent) {
      if (!car.stolen) {
        car.stolen = true;
        this.wanted.addHeat(33);
        this.markSearchZone();
      }
      this.audio.door();
    } else if (!silent) {
      this.audio.door();
    }
    this.inCar = car;
    this.playerMesh.visible = false;
    this.camYaw = car.heading;
  }

  markSearchZone() {
    if (!this.wanted.searchZone) {
      this.wanted.searchZone = { x: this.player.x, z: this.player.z, r: 35 };
    }
  }

  exitCar() {
    const car = this.inCar;
    if (!car) return;
    car.speed = 0;
    this.player.x = car.x + Math.cos(car.heading) * 1.8;
    this.player.z = car.z - Math.sin(car.heading) * 1.8;
    this.player.y = this.groundYAt(this.player.x, this.player.z);
    this.player.heading = car.heading;
    this.inCar = null;
    this.playerMesh.visible = true;
    this.audio.engine(false);
    this.audio.door();
  }

  updatePlayer(dt) {
    const input = this.input;
    const mouse = input.takeMouse();
    this.camYaw -= mouse.dx * cfg.camera.lookSpeed;
    this.camPitch = Math.max(0.05, Math.min(1.1, this.camPitch + mouse.dy * cfg.camera.pitchSpeed));
    if (this.inCar) {
      const car = this.inCar;
      const fast = car.fast;
      const savedCap = cfg.car.maxSpeed;
      if (fast) cfg.car.maxSpeed = 44;
      drivePlayerCar(car, input, dt);
      cfg.car.maxSpeed = savedCap;
      this.player.x = car.x; this.player.z = car.z;
      this.player.heading = car.heading;
      const groundY = this.groundYAt(car.x, car.z);
      // ramps
      this.city.rampList.forEach((r, idx) => {
        if (Math.abs(car.x - r.x) < 2 && Math.abs(car.z - r.z) < 3.4 && Math.abs(car.speed) > 8 && car.y <= groundY + 0.01) {
          car.vy = 7.5;
          this.lastRampIndex = idx;
          car.airTime = 0;
        }
      });
      if (car.y > groundY || car.vy > 0) {
        car.vy -= cfg.player.gravity * dt;
        car.y += car.vy * dt;
        car.airTime = (car.airTime || 0) + dt;
        if (car.y <= groundY) {
          car.y = groundY; car.vy = 0;
          if (car.airTime > 0.3 && this.lastRampIndex >= 0) this.landStunt(this.lastRampIndex);
          car.airTime = 0;
        }
      } else {
        car.y = groundY;
      }
      car.airY = Math.max(0, car.y - groundY);
      car.syncMesh();
      this.driftTime = (input.held(' ') && Math.abs(car.speed) > 10) ? this.driftTime + dt : 0;
      this.collideCar(car, dt);
      this.skillXp.driving += Math.abs(car.speed) * dt * 0.05;
      this.updateCarCondition(dt);
    } else {
      const p = this.player;
      const fwd = (input.held('w') || input.held('arrowup') ? 1 : 0) - (input.held('s') || input.held('arrowdown') ? 1 : 0);
      const strafe = (input.held('a') || input.held('arrowleft') ? 1 : 0) - (input.held('d') || input.held('arrowright') ? 1 : 0);
      const speed = input.held('shift') ? cfg.player.runSpeed : cfg.player.walkSpeed;
      const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
      const rx = fz, rz = -fx; // right vector: A (strafe +1) goes left = -right
      let mx = fx * fwd - rx * strafe;
      let mz = fz * fwd - rz * strafe;
      const len = Math.hypot(mx, mz);
      if (len > 0) {
        mx /= len; mz /= len;
        p.x += mx * speed * dt;
        p.z += mz * speed * dt;
        p.heading = Math.atan2(mx, mz);
      }
      const groundY = this.groundYAt(p.x, p.z);
      if (input.take(' ') && p.y <= groundY + 0.01) p.vy = cfg.player.jumpVel;
      if (p.y > groundY || p.vy > 0) {
        p.vy -= cfg.player.gravity * dt;
        p.y += p.vy * dt;
        if (p.y <= groundY) { p.y = groundY; p.vy = 0; }
      } else {
        p.y = groundY;
      }
      p.airborne = p.y > groundY + 0.05;
      this.collideCircle(p, cfg.player.radius);
      this.playerMesh.position.set(p.x, p.y, p.z);
      this.playerMesh.rotation.y = p.heading;
      const moving = len > 0;
      this.playerMesh.userData.legL.rotation.x = moving ? Math.sin(this.time * 9) * 0.5 : 0;
      this.playerMesh.userData.legR.rotation.x = moving ? -Math.sin(this.time * 9) * 0.5 : 0;
    }
    // world bounds
    this.player.x = Math.max(-148, Math.min(290, this.player.x));
    this.player.z = Math.max(-148, Math.min(148, this.player.z));
  }

  landStunt(idx) {
    if (this.stuntsLanded.has(idx)) return;
    const first = this.stuntsLanded.size === 0;
    this.stuntsLanded.add(idx);
    const pay = first ? 500 : 100;
    this.player.cash += pay;
    this.hud.banner('STUNT LANDED — $' + pay);
    this.audio.win();
  }

  updateCarCondition(dt) {
    const car = this.inCar;
    if (!car) return;
    // smoke from a battered engine
    this.smokeTimer -= dt;
    if (car.condition < 25 && car.condition > 0 && this.smokeTimer <= 0) {
      this.smokeTimer = 0.08;
      const puff = this.smokePool.find(s => s.life <= 0);
      if (puff) {
        puff.life = 1.1;
        puff.sprite.visible = true;
        puff.sprite.position.set(car.x, car.y + 1, car.z);
        puff.sprite.scale.set(1.2, 1.2, 1);
        puff.vx = (this.streams.effects.next() - 0.5) * 0.6;
        puff.vy = 1.6;
        puff.vz = (this.streams.effects.next() - 0.5) * 0.6;
      }
    }
    if (car.condition <= 0 && !car.wrecked) {
      car.wrecked = true;
      this.audio.crash();
      this.hud.banner('BOOM!');
      const wasInCar = !!this.inCar;
      if (wasInCar) this.exitCar();
      car.speed = 0;
      car.mesh.userData.bodyMat.color.set(0x1a1a1a);
      this.damagePlayer(50);
    }
  }

  updateSmoke(dt) {
    for (const puff of this.smokePool) {
      if (puff.life <= 0) continue;
      puff.life -= dt;
      if (puff.life <= 0) { puff.sprite.visible = false; continue; }
      puff.sprite.position.x += puff.vx * dt;
      puff.sprite.position.y += puff.vy * dt;
      puff.sprite.position.z += puff.vz * dt;
      const s = 1.2 + (1.1 - puff.life) * 1.6;
      puff.sprite.scale.set(s, s, 1);
    }
  }

  collideCircle(p, radius) {
    for (const c of this.city.colliders) {
      const nx = Math.max(c.x0, Math.min(c.x1, p.x));
      const nz = Math.max(c.z0, Math.min(c.z1, p.z));
      const dx = p.x - nx, dz = p.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        p.x = nx + (dx / d) * radius;
        p.z = nz + (dz / d) * radius;
      } else if (d2 <= 0.0001) {
        p.x = c.x1 + radius;
      }
    }
  }

  collideCar(car, dt) {
    const before = { x: car.x, z: car.z };
    this.collideCircle(car, cfg.car.radius);
    if ((car.x !== before.x || car.z !== before.z) && Math.abs(car.speed) > 6) {
      car.health -= Math.abs(car.speed) * 0.4;
      car.condition = Math.max(0, car.condition - Math.abs(car.speed) * 0.4);
      car.speed *= 0.35;
      this.audio.crash();
      if (car.health <= 0) { car.speed = 0; this.hud.toast('The car is wrecked.'); }
    }
    // run over pedestrians (swept along this frame's travel)
    if (Math.abs(car.speed) > 4) {
      const px0 = car.x - Math.sin(car.heading) * car.speed * dt;
      const pz0 = car.z - Math.cos(car.heading) * car.speed * dt;
      const segX = car.x - px0, segZ = car.z - pz0;
      const segLen2 = segX * segX + segZ * segZ || 0.0001;
      for (const ped of this.crowd.peds) {
        if (!ped.alive) continue;
        const t = Math.max(0, Math.min(1, ((ped.x - px0) * segX + (ped.z - pz0) * segZ) / segLen2));
        const nearX = px0 + segX * t, nearZ = pz0 + segZ * t;
        if (Math.hypot(ped.x - nearX, ped.z - nearZ) < 2.3) {
          const died = ped.hurt(1000);
          if (died) {
            this.wanted.addHeat(40);
            this.markSearchZone();
            const witnesses = this.crowd.witnessesNear(car.x, car.z, 22);
            if (witnesses.length > 0) this.wanted.witnessedCrime(15, witnesses[0]);
            this.audio.hit();
          }
        }
      }
    }
    // car vs car: simple push
    for (const other of this.traffic.allCars()) {
      if (other === car) continue;
      const dx = car.x - other.x, dz = car.z - other.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.4 && d > 0.01) {
        car.x += (dx / d) * (3.4 - d) * 0.5;
        car.z += (dz / d) * (3.4 - d) * 0.5;
        if (Math.abs(car.speed) > 8) { this.audio.crash(); car.speed *= 0.6; }
      }
    }
    car.syncMesh();
  }

  updateCombat(dt) {
    this.shootCooldown -= dt;
    const w = this.weapon();
    const wantShoot = this.input.held('f') || (this.input.mouseDown && !this.inCar);
    if (!wantShoot || this.shootCooldown > 0) return;
    this.shootCooldown = w.rate;
    if (w.id !== 'fists') this.audio.shot(); else this.audio.hit();
    this.crowd.panicNear(this.player.x, this.player.z, 20);
    // find the best target in front
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    let best = null, bestScore = 0.86;
    for (const ped of this.crowd.peds) {
      if (!ped.alive) continue;
      const dx = ped.x - this.player.x, dz = ped.z - this.player.z;
      const dist = Math.hypot(dx, dz);
      if (dist > w.range || dist < 0.01) continue;
      const dot = (dx * fx + dz * fz) / dist;
      if (dot > bestScore) { bestScore = dot; best = ped; }
    }
    if (best) {
      const died = best.hurt(w.damage);
      this.skillXp.street += died ? 2 : 0.5;
      const witnesses = this.crowd.witnessesNear(this.player.x, this.player.z, 22);
      if (witnesses.length > 0) this.wanted.witnessedCrime(died ? 40 : 20, witnesses[0]);
      else this.wanted.addHeat(died ? 20 : 8);
      this.markSearchZone();
      if (died) {
        this.player.cash += 20;
        this.hud.toast(best.kind === 'gang' ? 'Reef King down.' : 'Down. Witnesses everywhere…');
      }
    }
  }

  updateDayNight(dt) {
    this.hour += dt * (24 / cfg.time.dayLength);
    if (this.hour >= 24) { this.hour -= 24; this.day++; }
    const sunAngle = ((this.hour - 6) / 12) * Math.PI;
    const daylight = Math.max(0, Math.sin(sunAngle));
    this.sun.position.set(Math.cos(sunAngle) * 120, Math.max(8, daylight * 140), 60);
    this.sun.intensity = 0.25 + daylight * 1.5;
    const skyDay = new THREE.Color(0x87c5e8);
    const skyNight = new THREE.Color(0x0d1b33);
    const sky = skyNight.clone().lerp(skyDay, Math.min(1, daylight * 1.4));
    this.scene.background = sky;
    this.scene.fog.color.copy(sky);
    this.city.setNight(daylight < 0.25);
    this.isNight = daylight < 0.25;
  }

  updateHud(dt) {
    const target = this.missions.targetPos();
    if (target) {
      this.targetMarker.visible = true;
      this.targetMarker.position.set(target.x, 3, target.z);
      this.targetMarker.rotation.y += dt * 1.2;
    } else {
      this.targetMarker.visible = false;
    }
    const dist = target ? Math.hypot(this.player.x - target.x, this.player.z - target.z) : null;
    let objective = this.missions.objectiveText();
    const story = this.missions.currentStory();
    if (story && story.id === 'reef-trouble' && !this.missions.active) {
      objective = 'Head to Neon Plaza and deal with the Reef Kings (' + this.crowd.gangAlive() + ' left)';
    }
    const slots = this.hud.weaponSlotsText(this.rep, this.ownedWeapons);
    this.hud.update(dt, {
      player: this.player,
      wanted: this.wanted,
      hour: this.hour, day: this.day,
      streetLabel: streetLabelAt(this.player.x, this.player.z),
      inCar: !!this.inCar,
      carSpeed: this.inCar ? this.inCar.speed : 0,
      carName: this.inCar ? (this.inCar.kind === 'police' ? 'POLICE CRUISER' : this.inCar.name.toUpperCase()) : '',
      weapon: this.weapon(),
      weaponText: slots[this.weaponIndex] || '',
      weaponSlots: slots,
      rep: this.rep,
      skills: this.skillLevels(),
      medalsEarned: this.medals.count(),
      medalsTotal: this.medals.total(),
      chapter: this.missions.chapterText(),
      nextChapter: this.missions.nextChapterText(),
      objective,
      target,
      targetDist: dist,
      policeCars: this.police.cars,
      playerHeading: this.inCar ? this.inCar.heading : this.player.heading,
      radioName: this.audio.radioName(),
      spotlight: !!this.police.heli,
    });
  }

  // Road rectangles for the audit: streets end at Beach Ave (x=150);
  // the beachfront east of it is sand, not road.
  auditRoadRects() {
    const rects = [];
    for (const a of [ -140, -84, -28, 28, 84, 140 ]) {
      rects.push({ x0: a - 10, x1: a + 10, z0: -150, z1: 150 });
    }
    for (const s of [ -140, -84, -28, 28, 84, 140 ]) {
      rects.push({ x0: -150, x1: 150, z0: s - 10, z1: s + 10 });
    }
    rects.push({ x0: 196, x1: 250, z0: 92, z1: 108 }); // causeway
    return rects;
  }

  rectHitsRoad(x, z, w, d) {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    for (const r of this.auditRoadRects()) {
      if (x0 < r.x1 && x1 > r.x0 && z0 < r.z1 && z1 > r.z0) return true;
    }
    return false;
  }

  placementAudit() {
    const city = this.city;
    const fails = {
      buildings: [], palms: [], trees: [], hydrants: [], bins: [], stalls: [],
      signs: [], ramps: [], landmarks: [], buildingVsLandmark: [],
      buildingOverlaps: [], lightPoles: [],
    };
    const records = city.buildingRecords;
    for (const b of records) {
      if (this.rectHitsRoad(b.x, b.z, b.w, b.d)) fails.buildings.push({ x: b.x, z: b.z });
    }
    for (const p of city.palms) if (this.rectHitsRoad(p.x, p.z, 0.5, 0.5)) fails.palms.push({ x: p.x, z: p.z });
    for (const t of city.trees) if (this.rectHitsRoad(t.x, t.z, 0.5, 0.5)) fails.trees.push({ x: t.x, z: t.z });
    for (const h of city.hydrants) if (this.rectHitsRoad(h.x, h.z, 0.4, 0.4)) fails.hydrants.push({ x: h.x, z: h.z });
    for (const b of city.bins) if (this.rectHitsRoad(b.x, b.z, 0.64, 0.64)) fails.bins.push({ x: b.x, z: b.z });
    for (const s of city.stalls) if (this.rectHitsRoad(s.x, s.z, 3.4, 2.4)) fails.stalls.push({ x: s.x, z: s.z });
    for (const s of city.signRecords) if (this.rectHitsRoad(s.px, s.pz, 0.2, 0.2)) fails.signs.push({ x: s.px, z: s.pz });
    for (const r of city.rampList) {
      if (Math.abs(r.mesh.position.y) > 0.1) fails.ramps.push({ x: r.x, z: r.z });
    }
    const landmarkBuildings = city.buildings.filter(b => b.landmark);
    for (const l of landmarkBuildings) {
      if (this.rectHitsRoad(l.x, l.z, l.w, l.d)) fails.landmarks.push({ id: l.landmark, x: l.x, z: l.z });
    }
    for (const b of records) {
      for (const l of landmarkBuildings) {
        if (Math.abs(b.x - l.x) < (b.w + l.w) / 2 && Math.abs(b.z - l.z) < (b.d + l.d) / 2) {
          fails.buildingVsLandmark.push({ x: b.x, z: b.z, landmark: l.landmark });
        }
      }
    }
    for (let i = 0; i < records.length; i++) {
      for (let j = i + 1; j < records.length; j++) {
        const a = records[i], b = records[j];
        const ox = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
        const oz = Math.min(a.z + a.d / 2, b.z + b.d / 2) - Math.max(a.z - a.d / 2, b.z - b.d / 2);
        if (ox > 0.05 && oz > 0.05) fails.buildingOverlaps.push({ a: { x: a.x, z: a.z }, b: { x: b.x, z: b.z } });
      }
    }
    for (const p of city.lightPoleSpots) {
      if (this.rectHitsRoad(p.x, p.z, 0.3, 0.3)) { fails.lightPoles.push({ x: p.x, z: p.z }); continue; }
      const inBuilding = records.some(b => Math.abs(p.x - b.x) < b.w / 2 + 0.16 && Math.abs(p.z - b.z) < b.d / 2 + 0.16);
      if (inBuilding) fails.lightPoles.push({ x: p.x, z: p.z });
    }
    return {
      counts: {
        buildings: city.buildings.length, palms: city.palms.length, trees: city.trees.length,
        lamps: city.lamps.length, stalls: city.stalls.length,
        landmarks: Object.keys(city.landmarks).length,
        signs: city.signRecords.length, ramps: city.rampList.length, boats: city.boats.length,
        hydrants: city.hydrants.length, bins: city.bins.length, lightPoles: city.lightPoleSpots.length,
      },
      ...fails,
    };
  }

  sceneAudit() {
    const catOf = (kind) => {
      switch (kind) {
        case 'building': return 'building';
        case 'landmark': return 'landmark';
        case 'stall': return 'stall';
        case 'sign': case 'signpole': return 'sign';
        case 'tree': return 'tree';
        case 'palm': return 'palm';
        case 'hydrant': return 'hydrant';
        case 'bin': return 'bin';
        case 'bench': return 'bench';
        case 'lamp': case 'lightpole': case 'lighthead': return 'pole';
        case 'bollard': return 'bollard';
        case 'ramp': return 'ramp';
        default: return 'prop';
      }
    };
    const flatKinds = new Set(['ground', 'road', 'sidewalk', 'sand', 'sea', 'park', 'roadmark']);
    const overlaps = [];
    const uncategorised = [];
    const byCategory = {};
    let meshes = 0, instances = 0, placeables = 0, flat = 0, elevated = 0, huge = 0;
    let cornerPoles = 0, cornerPolesOffRoad = 0;
    const dummy = new THREE.Object3D();
    this.scene.traverse((obj) => {
      if (!obj.isMesh && !obj.isInstancedMesh) return;
      meshes++;
      const kind = obj.userData.kind;
      if (!kind) { uncategorised.push(obj.type); return; }
      const cat = catOf(kind);
      byCategory[cat] = (byCategory[cat] || 0) + 1;
      if (obj.isInstancedMesh) instances += obj.count;
      const wp = new THREE.Vector3();
      obj.getWorldPosition(wp);
      if (wp.y > 2) elevated++;
      if (flatKinds.has(kind)) { flat++; return; }
      placeables++;
      if (kind === 'lightpole' || kind === 'signpole') {
        cornerPoles++;
        if (!this.rectHitsRoad(wp.x, wp.z, 0.3, 0.3)) cornerPolesOffRoad++;
      }
      // ramps sit on road shoulders, the island gate straddles the
      // causeway and signs hang over sidewalks — all by design.
      // Dynamic/decor kinds are not placeables for the overlap check.
      if (['ramp', 'gate', 'sign', 'medal', 'package', 'car', 'wheel', 'ped',
        'player', 'marker', 'smoke', 'boat', 'heli', 'spotlight', 'police', 'island'].includes(kind)) return;
      if (obj.isInstancedMesh) {
        if (kind === 'roadmark') return;
        for (let i = 0; i < obj.count; i++) {
          obj.getMatrixAt(i, dummy.matrix);
          dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
          if (this.rectHitsRoad(dummy.position.x, dummy.position.z, 0.64, 0.64)) {
            overlaps.push({ kind, x: dummy.position.x, z: dummy.position.z });
          }
        }
        return;
      }
      const fp = obj.userData.footprint;
      if (!fp) return;
      if (fp.w * fp.d > 400) huge++;
      if (this.rectHitsRoad(fp.x, fp.z, fp.w, fp.d)) {
        overlaps.push({ kind, x: fp.x, z: fp.z });
      }
    });
    return {
      meshes, instances, placeables, flat, elevated, huge,
      cornerPoles, cornerPolesOffRoad, byCategory, overlaps, uncategorised,
    };
  }

  render() {
    if (this.screen !== 'title' && this.screen !== 'controls') {
      const dist = this.inCar ? cfg.camera.distCar : cfg.camera.distFoot;
      const height = this.inCar ? cfg.camera.heightCar : cfg.camera.heightFoot;
      const focus = this.camFocusOverride || this.player;
      const tx = focus.x, tz = focus.z;
      const ty = (this.inCar ? this.inCar.y : this.player.y) + 1.4;
      const cx = tx - Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
      const cz = tz - Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
      const cy = ty + Math.sin(this.camPitch) * dist + height * 0.4;
      this.camera.position.set(cx, Math.max(1.2, cy), cz);
      this.camera.lookAt(tx, ty, tz);
    }
    if (this.settings.bloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
