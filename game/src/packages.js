// packages.js — hidden packages scattered around Costa Fuego. Each one
// pays cash and REP the first time the player walks or drives over it.

import * as THREE from 'three';

export const PACKAGE_SPOTS = [
  { x: -140, z: -140 }, { x: 140, z: 140 }, { x: -56, z: -56 }, { x: 112, z: 56 },
  { x: -112, z: 0 }, { x: 56, z: 112 }, { x: 168, z: -60 }, { x: 247, z: 100 },
  { x: 0, z: -112 }, { x: 209, z: 100 },
];

export class Packages {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    const geo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd75e });
    for (const spot of PACKAGE_SPOTS) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(spot.x, 1.1, spot.z);
      mesh.userData.kind = 'package';
      mesh.userData.footprint = { x: spot.x, z: spot.z, w: 0.9, d: 0.9 };
      scene.add(mesh);
      this.items.push({ x: spot.x, z: spot.z, mesh, taken: false });
    }
    this.time = 0;
  }

  update(dt, playerPos) {
    this.time += dt;
    let found = null;
    for (const item of this.items) {
      if (item.taken) continue;
      item.mesh.rotation.y += dt * 1.6;
      item.mesh.position.y = 1.1 + Math.sin(this.time * 2 + item.x) * 0.18;
      if (playerPos && Math.hypot(playerPos.x - item.x, playerPos.z - item.z) < 2.2) {
        item.taken = true;
        item.mesh.visible = false;
        found = item;
      }
    }
    return found;
  }

  foundCount() { return this.items.filter(i => i.taken).length; }
  total() { return this.items.length; }

  restore(takenIndexes) {
    takenIndexes.forEach((i) => {
      if (this.items[i]) { this.items[i].taken = true; this.items[i].mesh.visible = false; }
    });
  }

  takenIndexes() {
    const out = [];
    this.items.forEach((item, i) => { if (item.taken) out.push(i); });
    return out;
  }
}
