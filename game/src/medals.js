// medals.js — 24 gold medals hidden around Costa Fuego. Each medal pays
// $100 the first time the player walks or drives over it; collecting the
// full set pays a $5000 bonus.

import * as THREE from 'three';

export const MEDAL_SPOTS = [
  { x: -112, z: 84 }, { x: -56, z: 112 }, { x: 0, z: 84 }, { x: 56, z: 56 },
  { x: 112, z: 112 }, { x: 168, z: 30 }, { x: -140, z: 28 }, { x: -84, z: -56 },
  { x: -28, z: -112 }, { x: 28, z: -56 }, { x: 84, z: -112 }, { x: 140, z: -56 },
  { x: -112, z: -84 }, { x: -56, z: -28 }, { x: 0, z: -84 }, { x: 112, z: -28 },
  { x: 176, z: -90 }, { x: -140, z: -112 }, { x: 56, z: -140 }, { x: 84, z: 28 },
  { x: -28, z: 56 }, { x: 140, z: 84 }, { x: 247, z: 78 }, { x: 230, z: 116 },
];

export const MEDAL_VALUE = 100;
export const MEDAL_SET_BONUS = 5000;

export class MedalTracker {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.stats = {};
    const geo = new THREE.CylinderGeometry(0.7, 0.7, 0.16, 18);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc93d });
    for (const spot of MEDAL_SPOTS) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(spot.x, 1.2, spot.z);
      mesh.userData.kind = 'medal';
      mesh.userData.footprint = { x: spot.x, z: spot.z, w: 1.4, d: 1.4 };
      if (scene) scene.add(mesh);
      this.items.push({ x: spot.x, z: spot.z, mesh, taken: false });
    }
    this.time = 0;
  }

  update(dt, playerPos) {
    this.time += dt;
    let found = null;
    for (const item of this.items) {
      if (item.taken) continue;
      item.mesh.rotation.z += dt * 1.8;
      item.mesh.position.y = 1.2 + Math.sin(this.time * 2 + item.z) * 0.15;
      if (playerPos && Math.hypot(playerPos.x - item.x, playerPos.z - item.z) < 2.4) {
        item.taken = true;
        item.mesh.visible = false;
        found = item;
      }
    }
    return found;
  }

  count() { return this.items.filter(i => i.taken).length; }
  total() { return this.items.length; }
  spots() { return this.items.map(i => ({ x: i.x, z: i.z })); }
  takenFlags() { return this.items.map(i => i.taken); }

  restore(flags) {
    (flags || []).forEach((taken, i) => {
      if (this.items[i] && taken) { this.items[i].taken = true; this.items[i].mesh.visible = false; }
    });
  }
}
