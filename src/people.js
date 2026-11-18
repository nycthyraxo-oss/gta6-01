// People: pedestrians who walk the sidewalks and flee gunfire, the armed
// Reef Kings who fight back during the Payback mission, and the mercado
// vendors who mind their stalls all day.
//
// v6: no more box-people. Every figure is built from rounded geometry —
// capsule torso, sphere head with hair and eyes, cylinder arms and legs
// with swinging joints — with varied height, skin, hair and clothing, so
// the crowd reads as people instead of a flat render. Vendors are the same
// figure in an apron, standing at a stall instead of walking.
import * as THREE from 'three';

const SHIRT_COLORS = [0xd84a4a, 0x4a7ad8, 0x4ad87a, 0xd8c84a, 0x9a4ad8, 0xd88a4a, 0x4ad8c8, 0xe8e8e8];
const PANTS_COLORS = [0x2a2e38, 0x3a2a22, 0x22303a, 0x44403a];
const SKIN_TONES = [0xc89878, 0x8a5a3b, 0xe0ac82, 0x6e4530];
const HAIR_COLORS = [0x1a1a1a, 0x3a2a1a, 0x6a4a2a, 0x8a8a8a, 0x7a2a1a];

// Shared geometries and materials: one crowd shares a handful of shapes,
// so 26 pedestrians cost a few draw programs, not one per limb.
const GEO = {};
function geo(key, make) {
  if (!GEO[key]) GEO[key] = make();
  return GEO[key];
}
const MAT = new Map();
function mat(color, roughness, metalness = 0) {
  const key = `${color}|${roughness}|${metalness}`;
  if (!MAT.has(key)) {
    MAT.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  }
  return MAT.get(key);
}

function limb(r, len, material) {
  const mesh = new THREE.Mesh(geo(`cyl-${r}-${len}`, () => new THREE.CylinderGeometry(r, r * 0.85, len, 10)), material);
  mesh.castShadow = true;
  return mesh;
}

// Build one rounded person. opts: { height (0.9–1.1), hair, apron }.
// Returns the group; the animated joints live on group.userData
// ({ rig, armL, armR, legL, legR }) so the walk cycle can swing them.
export function makePersonMesh(shirt, pants, skin, opts = {}) {
  const height = opts.height ?? 1;
  const hairColor = opts.hair ?? HAIR_COLORS[0];
  const shirtMat = mat(shirt, 0.85);
  const pantsMat = mat(pants, 0.95);
  const skinMat = mat(skin, 0.7);
  const hairMat = mat(hairColor, 0.9);

  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);

  // Legs: cylinders with small feet, pivoted at the hip so they swing.
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(-0.13, 0.66, 0);
  legR.position.set(0.13, 0.66, 0);
  for (const leg of [legL, legR]) {
    const thigh = limb(0.105, 0.6, pantsMat);
    thigh.position.y = -0.3;
    leg.add(thigh);
    const foot = new THREE.Mesh(
      geo('foot', () => new THREE.BoxGeometry(0.17, 0.09, 0.32)),
      mat(0x1c1a18, 0.9),
    );
    foot.position.set(0, -0.62, 0.05);
    foot.castShadow = true;
    leg.add(foot);
    rig.add(leg);
  }

  // Torso: a capsule, slightly flattened front-to-back, like a real chest.
  const torso = new THREE.Mesh(
    geo('torso', () => new THREE.CapsuleGeometry(0.27, 0.5, 6, 12)),
    shirtMat,
  );
  torso.scale.set(1.15, 1, 0.82);
  torso.position.y = 1.12;
  torso.castShadow = true;
  rig.add(torso);

  // A vendor's apron: a flat cloth panel over the torso front.
  if (opts.apron) {
    const apron = new THREE.Mesh(
      geo('apron', () => new THREE.BoxGeometry(0.5, 0.7, 0.06)),
      mat(opts.apron, 0.9),
    );
    apron.position.set(0, 1.05, 0.24);
    rig.add(apron);
  }

  // Shoulders: small spheres so the torso meets the arms with a curve.
  for (const sx of [-0.3, 0.3]) {
    const shoulder = new THREE.Mesh(geo('shoulder', () => new THREE.SphereGeometry(0.11, 10, 8)), shirtMat);
    shoulder.position.set(sx, 1.5, 0);
    shoulder.castShadow = true;
    rig.add(shoulder);
  }

  // Arms: cylinders pivoted at the shoulder, skin hands at the end.
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-0.33, 1.48, 0);
  armR.position.set(0.33, 1.48, 0);
  for (const arm of [armL, armR]) {
    const upper = limb(0.08, 0.52, shirtMat);
    upper.position.y = -0.26;
    arm.add(upper);
    const hand = new THREE.Mesh(geo('hand', () => new THREE.SphereGeometry(0.09, 8, 6)), skinMat);
    hand.position.y = -0.56;
    hand.castShadow = true;
    arm.add(hand);
    rig.add(arm);
  }

  // Neck, head, hair cap and eyes.
  const neck = limb(0.09, 0.14, skinMat);
  neck.position.y = 1.66;
  rig.add(neck);
  const head = new THREE.Mesh(geo('head', () => new THREE.SphereGeometry(0.24, 14, 10)), skinMat);
  head.position.y = 1.84;
  head.castShadow = true;
  rig.add(head);
  const hair = new THREE.Mesh(geo('hair', () => new THREE.SphereGeometry(0.25, 12, 8)), hairMat);
  hair.scale.set(1, 0.72, 1);
  hair.position.set(0, 1.92, -0.03);
  hair.castShadow = true;
  rig.add(hair);
  const eyeMat = mat(0x14100c, 0.4);
  for (const ex of [-0.09, 0.09]) {
    const eye = new THREE.Mesh(geo('eye', () => new THREE.SphereGeometry(0.035, 8, 6)), eyeMat);
    eye.position.set(ex, 1.86, 0.21);
    rig.add(eye);
  }

  group.scale.setScalar(height);
  group.userData = { rig, armL, armR, legL, legR };
  return group;
}

export function spawnPedestrian(scene, rng, cfg, blockCenters) {
  const bx = blockCenters[Math.floor(rng.next() * blockCenters.length)];
  const bz = blockCenters[Math.floor(rng.next() * blockCenters.length)];
  const x = bx + rng.range(-18, 18);
  const z = bz + rng.range(-18, 18);
  const mesh = makePersonMesh(
    SHIRT_COLORS[Math.floor(rng.next() * SHIRT_COLORS.length)],
    PANTS_COLORS[Math.floor(rng.next() * PANTS_COLORS.length)],
    SKIN_TONES[Math.floor(rng.next() * SKIN_TONES.length)],
    {
      height: 0.92 + rng.next() * 0.16,
      hair: HAIR_COLORS[Math.floor(rng.next() * HAIR_COLORS.length)],
    },
  );
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  return {
    group: mesh,
    heading: rng.range(0, Math.PI * 2),
    speed: cfg.pedestrians.walkSpeed * rng.range(0.8, 1.3),
    state: 'walk',
    fleeX: 0,
    fleeZ: 0,
    walkTimer: rng.range(2, 8),
    bob: rng.range(0, Math.PI * 2),
    // v9 iteration 4: panic timer (how long the flee lasts before the ped
    // calms down), dodge data (sidestep from a closing car), and an
    // optional chat spot — a fixed place where this ped stops to talk in
    // a group (assigned by the game for a few peds, null for the rest).
    panicT: 0,
    dodgeT: 0,
    dodgeX: 0,
    dodgeZ: 0,
    chat: null,
  };
}

// A mercado vendor: same figure, apron on, standing behind a stall and
// facing the street. Vendors do not walk — they are street life, not
// traffic — but they still flee gunfire like everyone else.
export function spawnVendor(scene, rng, x, z, facing) {
  const mesh = makePersonMesh(
    SHIRT_COLORS[Math.floor(rng.next() * SHIRT_COLORS.length)],
    PANTS_COLORS[Math.floor(rng.next() * PANTS_COLORS.length)],
    SKIN_TONES[Math.floor(rng.next() * SKIN_TONES.length)],
    {
      height: 0.95 + rng.next() * 0.1,
      hair: HAIR_COLORS[Math.floor(rng.next() * HAIR_COLORS.length)],
      apron: 0xe8e8e8,
    },
  );
  mesh.position.set(x, 0, z);
  mesh.rotation.y = facing;
  scene.add(mesh);
  return {
    group: mesh,
    heading: facing,
    speed: 0,
    state: 'vendor',
    home: { x, z, facing },
    fleeX: 0,
    fleeZ: 0,
    walkTimer: 0,
    bob: rng.range(0, Math.PI * 2),
  };
}

// Pedestrian state machine (v9 iteration 4): walk the sidewalks, idle in
// groups at a chat spot, panic and flee gunfire/explosions, dodge a car
// that is closing in on them, and vendors mind their stall (walking back
// to it after a panic — the old code left a fled vendor wandering).
// States: 'walk' | 'idle' | 'panic' | 'dodge' | 'vendor'. The game passes
// `cars` (player + traffic + police, each with group/speed/heading) so a
// ped can read an approaching car; the callers that only scare the crowd
// (shoot/knife) pass no cars and the dodge step is skipped.
export function updatePedestrian(p, dt, cfg, gunshotPos, isRoad, cars) {
  const pos = p.group.position;
  if (gunshotPos) {
    const dx = pos.x - gunshotPos.x;
    const dz = pos.z - gunshotPos.z;
    const d = Math.hypot(dx, dz);
    if (d < cfg.pedestrians.fleeRadius) {
      p.state = 'panic';
      p.panicT = 3;
      p.fleeX = dx / (d || 1);
      p.fleeZ = dz / (d || 1);
    }
  }
  // Dodge: a fast car closing in on the ped from ahead. The ped sidesteps
  // perpendicular to the car's heading for 0.6 s — enough to clear the
  // lane, not enough to teleport across the street.
  if (cars && p.state !== 'panic' && p.state !== 'vendor') {
    for (const c of cars) {
      if (!c || !c.group) continue;
      const sp = Math.abs(c.speed || 0);
      if (sp < 4) continue;
      const dx = pos.x - c.group.position.x;
      const dz = pos.z - c.group.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 8 || d < 0.01) continue;
      const hx = Math.sin(c.heading);
      const hz = Math.cos(c.heading);
      // The ped is ahead of the car (the car is closing on them): the
      // vector from the car to the ped points along the car's heading,
      // so the dot product is POSITIVE when the ped is in front. Skip
      // when it is zero or negative (the ped is behind the car).
      if ((dx * hx + dz * hz) <= 0) continue;
      p.state = 'dodge';
      p.dodgeT = 0.6;
      p.dodgeX = -hz;
      p.dodgeZ = hx;
      break;
    }
  }
  if (p.state === 'panic') {
    const nx = pos.x + p.fleeX * cfg.pedestrians.fleeSpeed * dt;
    const nz = pos.z + p.fleeZ * cfg.pedestrians.fleeSpeed * dt;
    if (Math.abs(nx) < 145 && Math.abs(nz) < 145) {
      pos.x = nx;
      pos.z = nz;
    }
    p.heading = Math.atan2(p.fleeX, p.fleeZ);
    p.panicT -= dt;
    if (p.panicT <= 0) p.state = p.home ? 'vendor' : 'walk';
  } else if (p.state === 'dodge') {
    pos.x += p.dodgeX * 3.5 * dt;
    pos.z += p.dodgeZ * 3.5 * dt;
    p.dodgeT -= dt;
    if (p.dodgeT <= 0) p.state = 'walk';
  } else if (p.state === 'vendor') {
    // Vendors stand their ground and mind the stall. They only move when
    // they flee — and after the panic they walk back to the stall.
    const home = p.home;
    if (home) {
      const dx = home.x - pos.x;
      const dz = home.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1) {
        pos.x += (dx / d) * cfg.pedestrians.walkSpeed * dt;
        pos.z += (dz / d) * cfg.pedestrians.walkSpeed * dt;
        p.heading = Math.atan2(dx, dz);
      } else {
        p.heading = home.facing;
      }
    }
  } else if (p.state === 'idle') {
    // Chatting in a group: drift to the chat spot, face the partner, and
    // stand there until the timer runs out.
    p.walkTimer -= dt;
    if (p.chat) {
      const dx = p.chat.x - pos.x;
      const dz = p.chat.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.5) {
        pos.x += (dx / d) * cfg.pedestrians.walkSpeed * dt;
        pos.z += (dz / d) * cfg.pedestrians.walkSpeed * dt;
        p.heading = Math.atan2(dx, dz);
      } else {
        p.heading = p.chat.face;
      }
    }
    if (p.walkTimer <= 0) {
      p.state = 'walk';
      p.walkTimer = 2 + Math.random() * 6;
    }
  } else {
    p.walkTimer -= dt;
    if (p.walkTimer <= 0) {
      // A ped with a chat spot sometimes stops to talk instead of turning.
      if (p.chat && Math.random() < 0.5) {
        p.state = 'idle';
        p.walkTimer = 3 + Math.random() * 4;
      } else {
        p.walkTimer = 2 + Math.random() * 6;
        p.heading += (Math.random() - 0.5) * 2.4;
      }
    }
    const nx = pos.x + Math.sin(p.heading) * p.speed * dt;
    const nz = pos.z + Math.cos(p.heading) * p.speed * dt;
    if (Math.abs(nx) < 148 && Math.abs(nz) < 148) {
      // Sidewalk walkers: a step onto a road turns the walker away instead
      // of letting the crowd wander into traffic. (Fleeing pedestrians run
      // anywhere — panic does not check the curb.)
      if (isRoad && isRoad(nx, nz)) {
        p.heading += Math.PI / 2;
      } else {
        pos.x = nx;
        pos.z = nz;
      }
    } else {
      p.heading += Math.PI;
    }
  }
  p.group.rotation.y = p.heading;
  p.bob += dt * (p.state === 'panic' ? 14 : p.state === 'dodge' ? 10 : 7);
  const swing = Math.sin(p.bob) * (p.state === 'panic' ? 0.85 : 0.55);
  const joints = p.group.userData;
  if (joints.armL) {
    if (p.state === 'panic') {
      // Arms up while fleeing.
      joints.armL.rotation.x = -2.2;
      joints.armR.rotation.x = -2.2;
    } else if (p.state === 'dodge') {
      joints.armL.rotation.x = -1.4;
      joints.armR.rotation.x = -1.4;
    } else if (p.state === 'vendor') {
      joints.armL.rotation.x = 0.15;
      joints.armR.rotation.x = 0.15;
    } else if (p.state === 'idle') {
      joints.armL.rotation.x = 0;
      joints.armR.rotation.x = 0;
    } else {
      joints.armL.rotation.x = swing;
      joints.armR.rotation.x = -swing;
    }
    joints.legL.rotation.x = p.state === 'vendor' || p.state === 'idle' ? 0 : -swing;
    joints.legR.rotation.x = p.state === 'vendor' || p.state === 'idle' ? 0 : swing;
    joints.rig.rotation.x = p.state === 'panic' ? 0.14 : 0.03;
  }
  // The walk cycle swings the legs and arms as a pendulum around the hip
  // and shoulder pivots. The group itself NEVER lifts off the ground: the
  // swinging foot rises naturally at the ends of its arc and plants at the
  // centre, so a whole-body bounce on top of it read as floating
  // ("melayang"). Group y stays 0 — feet planted.
  p.group.position.y = 0;
}

export function spawnEnemy(scene, x, z, rng) {
  const mesh = makePersonMesh(0x1e2a1e, 0x1a1a1a, 0xb08060, { height: 1.02, hair: 0x14100c });
  // Reef Kings wear a dark green jacket and a red band.
  const band = new THREE.Mesh(
    geo('band', () => new THREE.CylinderGeometry(0.32, 0.32, 0.18, 12)),
    mat(0xc22a22, 0.8),
  );
  band.position.y = 1.35;
  band.scale.set(1.15, 1, 0.82);
  mesh.userData.rig.add(band);
  const barrel = new THREE.Mesh(
    geo('barrel', () => new THREE.CylinderGeometry(0.045, 0.045, 0.7, 8)),
    mat(0x14161a, 0.5, 0.6),
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.36, 1.05, 0.45);
  mesh.userData.rig.add(barrel);
  // Reef Kings faction (v9 iteration 4): a red headband that only shows
  // when the faction is aggro — the player walked into their territory
  // (the docks) or shot one of them. Aggro Kings close in faster, shoot
  // further and hit more often (see updateEnemy).
  const aggroBand = new THREE.Mesh(
    geo('aggroBand', () => new THREE.BoxGeometry(0.5, 0.09, 0.5)),
    mat(0xc22a22, 0.8),
  );
  aggroBand.position.y = 2.02;
  aggroBand.visible = false;
  mesh.userData.rig.add(aggroBand);
  mesh.userData.aggroBand = aggroBand;
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  return {
    group: mesh,
    heading: rng ? rng.range(0, Math.PI * 2) : 0,
    health: 100,
    cooldown: 1,
    alive: true,
    aggro: false,
  };
}

export function updateEnemy(e, dt, cfg, playerPos, onShoot, factionAggro) {
  if (!e.alive) return;
  const pos = e.group.position;
  const dx = playerPos.x - pos.x;
  const dz = playerPos.z - pos.z;
  const dist = Math.hypot(dx, dz);
  e.heading = Math.atan2(dx, dz);
  e.group.rotation.y = e.heading;
  e.cooldown -= dt;
  // Aggro (v9 iteration 4): the faction is hunting you — longer reach,
  // better aim, faster close-in. The red headband shows it.
  const aggro = !!factionAggro;
  e.aggro = aggro;
  if (e.group.userData.aggroBand) e.group.userData.aggroBand.visible = aggro;
  const range = aggro ? cfg.combat.enemyShootRange + 6 : cfg.combat.enemyShootRange;
  const accuracy = aggro ? Math.min(0.7, cfg.combat.enemyAccuracy * 1.27) : cfg.combat.enemyAccuracy;
  if (dist < range && e.cooldown <= 0) {
    e.cooldown = cfg.combat.enemyShootCooldown * (0.8 + Math.random() * 0.5);
    if (Math.random() < accuracy) onShoot(e);
  }
  // Enemies close in slowly when the player is far, so the fight moves.
  // Aggro Kings close in almost twice as fast.
  if (dist > 18 && dist < range) {
    const closeSpeed = aggro ? 4 : 2.2;
    pos.x += (dx / dist) * closeSpeed * dt;
    pos.z += (dz / dist) * closeSpeed * dt;
  }
}
