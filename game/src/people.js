// people.js — pedestrians for Costa Fuego: sidewalk walkers, market
// shoppers, fleeing carjack victims and the Reef Kings gang. Peds witness
// crimes (feeding the wanted system), panic at gunfire and can be hurt.

import * as THREE from 'three';
import { cfg, AVENUES, STREETS } from './config.js';
import { visualRng } from './random.js';

const SHIRT_COLORS = [0xe84a4a, 0x4a8ae8, 0xf2c14c, 0x4fc24f, 0xf28ac2, 0xf2f2f2, 0x8a5ae8, 0x3dc2b8, 0xf28a3d, 0x6a7a8a];
const PANTS_COLORS = [0x2b3a55, 0x3a3a3a, 0x5a4632, 0x22303c, 0x6a6a72];

export function makePedMesh(shirt, pants) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.66, 0.3),
    new THREE.MeshLambertMaterial({ color: shirt }));
  torso.position.y = 1.05;
  torso.userData.kind = 'ped';
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xe8b88a }));
  head.position.y = 1.58;
  head.userData.kind = 'ped';
  g.add(head);
  const legGeo = new THREE.BoxGeometry(0.18, 0.72, 0.2);
  const legMat = new THREE.MeshLambertMaterial({ color: pants });
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.14, 0.36, 0);
  legL.userData.kind = 'ped';
  g.add(legL);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.14, 0.36, 0);
  legR.userData.kind = 'ped';
  g.add(legR);
  g.userData.legL = legL;
  g.userData.legR = legR;
  return g;
}

let pedSeq = 0;

export class Ped {
  constructor(mesh, x, z, opts = {}) {
    this.id = 'ped' + (pedSeq++);
    this.mesh = mesh;
    this.x = x; this.z = z;
    this.heading = opts.heading || 0;
    this.speed = 0;
    this.health = 100;
    this.alive = true;
    this.kind = opts.kind || 'walker'; // walker | shopper | fleeing | gang | driver
    this.walkPhase = visualRng.next() * 6.28;
    this.target = opts.target || null;
    this.panicTimer = 0;
    this.syncMesh();
  }

  syncMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    if (!this.alive) { this.mesh.rotation.x = -Math.PI / 2; this.mesh.position.y = 0.3; return; }
    this.mesh.rotation.x = 0;
    const swing = Math.sin(this.walkPhase) * Math.min(1, this.speed / 2) * 0.55;
    if (this.mesh.userData.legL) this.mesh.userData.legL.rotation.x = swing;
    if (this.mesh.userData.legR) this.mesh.userData.legR.rotation.x = -swing;
  }

  hurt(amount) {
    if (!this.alive) return false;
    this.health -= amount;
    if (this.health <= 0) { this.alive = false; this.speed = 0; this.syncMesh(); return true; }
    this.panicTimer = 4;
    return false;
  }
}

const SIDE_OFF = 15; // sidewalk line: 15 m from the road centreline

function cornerNode(rng) {
  const a = rng.pick(AVENUES);
  const s = rng.pick(STREETS);
  return {
    x: a.x + (rng.chance(0.5) ? -SIDE_OFF : SIDE_OFF),
    z: s.z + (rng.chance(0.5) ? -SIDE_OFF : SIDE_OFF),
  };
}

function nextCorner(rng, from) {
  // walk to another corner sharing the same sidewalk line
  if (rng.chance(0.5)) {
    const s = rng.pick(STREETS);
    return { x: from.x, z: s.z + (rng.chance(0.5) ? -SIDE_OFF : SIDE_OFF) };
  }
  const a = rng.pick(AVENUES);
  return { x: a.x + (rng.chance(0.5) ? -SIDE_OFF : SIDE_OFF), z: from.z };
}

function sidewalkPoint(rng) {
  return cornerNode(rng);
}

export class Crowd {
  constructor(scene, streams) {
    this.scene = scene;
    this.rng = streams.crowd;
    this.peds = [];
    this.spawnAll();
  }

  spawnAll() {
    const rng = this.rng;
    for (let i = 0; i < cfg.crowd.count; i++) {
      const p = sidewalkPoint(rng);
      const mesh = makePedMesh(rng.pick(SHIRT_COLORS), rng.pick(PANTS_COLORS));
      this.scene.add(mesh);
      const ped = new Ped(mesh, p.x, p.z, { kind: 'walker' });
      ped.route = p;
      ped.target = nextCorner(rng, p);
      this.peds.push(ped);
    }
    // shoppers around the night market and boardwalk
    for (let i = 0; i < 12; i++) {
      const mesh = makePedMesh(rng.pick(SHIRT_COLORS), rng.pick(PANTS_COLORS));
      this.scene.add(mesh);
      const ped = new Ped(mesh, 166 + rng.range(-3, 8), rng.range(-28, 28), { kind: 'shopper' });
      ped.home = { x: ped.x, z: ped.z };
      this.peds.push(ped);
    }
    // Reef Kings gang hanging around Neon Plaza
    for (let i = 0; i < 5; i++) {
      const mesh = makePedMesh(0x1f7a6a, 0x1a1a1a);
      this.scene.add(mesh);
      const ped = new Ped(mesh, 56 + rng.range(-8, 8), rng.range(-8, 8), { kind: 'gang' });
      ped.home = { x: ped.x, z: ped.z };
      this.peds.push(ped);
    }
  }

  addFleeingDriver(x, z) {
    const mesh = makePedMesh(this.rng.pick(SHIRT_COLORS), this.rng.pick(PANTS_COLORS));
    this.scene.add(mesh);
    const ped = new Ped(mesh, x, z, { kind: 'fleeing' });
    ped.panicTimer = 6;
    ped.heading = this.rng.range(0, Math.PI * 2);
    this.peds.push(ped);
    return ped;
  }

  witnessesNear(x, z, radius) {
    return this.peds.filter(p => p.alive && Math.hypot(p.x - x, p.z - z) <= radius);
  }

  panicNear(x, z, radius) {
    for (const p of this.peds) {
      if (p.alive && Math.hypot(p.x - x, p.z - z) <= radius) {
        p.panicTimer = Math.max(p.panicTimer, 3.5);
        p.heading = Math.atan2(p.x - x, p.z - z);
      }
    }
  }

  update(dt, playerPos) {
    const rng = this.rng;
    for (const ped of this.peds) {
      if (!ped.alive) continue;
      if (ped.panicTimer > 0) {
        ped.panicTimer -= dt;
        ped.speed = cfg.crowd.fleeSpeed;
        if (playerPos && Math.hypot(ped.x - playerPos.x, ped.z - playerPos.z) < 14) {
          ped.heading = Math.atan2(ped.x - playerPos.x, ped.z - playerPos.z);
        }
      } else if (ped.kind === 'walker') {
        ped.speed = cfg.crowd.walkSpeed;
        if (!ped.target || Math.hypot(ped.x - ped.target.x, ped.z - ped.target.z) < 1.2) {
          ped.target = nextCorner(rng, ped.target || { x: ped.x, z: ped.z });
        }
        ped.heading = Math.atan2(ped.target.x - ped.x, ped.target.z - ped.z);
      } else if (ped.kind === 'shopper' || ped.kind === 'gang') {
        // wander near home
        if (!ped.target || Math.hypot(ped.x - ped.target.x, ped.z - ped.target.z) < 1) {
          ped.target = { x: ped.home.x + rng.range(-6, 6), z: ped.home.z + rng.range(-6, 6) };
        }
        ped.heading = Math.atan2(ped.target.x - ped.x, ped.target.z - ped.z);
        ped.speed = cfg.crowd.walkSpeed * 0.6;
      } else {
        ped.speed = cfg.crowd.walkSpeed;
      }
      ped.x += Math.sin(ped.heading) * ped.speed * dt;
      ped.z += Math.cos(ped.heading) * ped.speed * dt;
      ped.walkPhase += dt * ped.speed * 2.4;
      // keep inside the world
      ped.x = Math.max(-148, Math.min(290, ped.x));
      ped.z = Math.max(-148, Math.min(148, ped.z));
      ped.syncMesh();
    }
  }

  gangAlive() {
    return this.peds.filter(p => p.kind === 'gang' && p.alive).length;
  }

  setWalkerCount(n) {
    const rng = this.rng;
    const walkers = () => this.peds.filter(p => p.kind === 'walker');
    while (walkers().length < n) {
      const p = sidewalkPoint(rng);
      const mesh = makePedMesh(rng.pick(SHIRT_COLORS), rng.pick(PANTS_COLORS));
      this.scene.add(mesh);
      const ped = new Ped(mesh, p.x, p.z, { kind: 'walker' });
      ped.route = p;
      ped.target = nextCorner(rng, p);
      this.peds.push(ped);
    }
    while (walkers().length > n) {
      const list = walkers();
      const ped = list[list.length - 1];
      this.scene.remove(ped.mesh);
      this.peds.splice(this.peds.indexOf(ped), 1);
    }
  }
}
