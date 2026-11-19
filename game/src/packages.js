// Hidden packages: ten gold parcels tucked into the city's quiet corners —
// behind the garage, on a park bench, under a beach umbrella, between the
// dock crates. Walk over one and it pays $50 on the spot. No mission, no
// timer, just a reason to explore the streets instead of the main road.
//
// Spots are fixed points with a seeded jitter, so the same seed always
// hides them in the same places and the save file can name them by index.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const SPOTS = [
  { x: -98, z: 124, note: 'behind the garage' },
  { x: -98, z: -92, note: 'on a park bench' },
  { x: 160, z: 40, note: 'under a beach umbrella' },
  { x: 128, z: 118, note: 'between the dock crates' },
  { x: 146, z: -20, note: 'at the end of the marina pier' },
  { x: 20, z: 20, note: 'in the tower plaza corner' },
  { x: 62, z: -68, note: 'behind a mercado stall' },
  { x: -14, z: 118, note: 'by the hospital wall' },
  { x: -40, z: -108, note: 'in a north-end alley' },
  { x: 70, z: 70, note: 'behind the downtown kiosk' },
];

const GOLD = new THREE.MeshStandardMaterial({
  color: 0xffd23e, roughness: 0.35, metalness: 0.6, emissive: 0x8a6a00, emissiveIntensity: 0.5,
});
const RIBBON = new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.6 });

export function createPackages(scene, rng) {
  const list = [];
  for (let i = 0; i < CONFIG.packages.count; i += 1) {
    const spot = SPOTS[i % SPOTS.length];
    const x = spot.x + rng.range(-2, 2);
    const z = spot.z + rng.range(-2, 2);
    const group = new THREE.Group();
    const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.55, 0.8), GOLD);
    boxMesh.position.y = 0.28;
    boxMesh.castShadow = true;
    group.add(boxMesh);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.14, 0.84), RIBBON);
    band.position.y = 0.3;
    group.add(band);
    const band2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.58, 0.84), RIBBON);
    band2.position.y = 0.28;
    group.add(band2);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.12, depthWrite: false }),
    );
    glow.position.y = 0.5;
    group.add(glow);
    group.position.set(x, 0, z);
    scene.add(group);
    list.push({ index: i, group, x, z, note: spot.note, taken: false });
  }
  return {
    list,
    count() {
      return list.filter((p) => p.taken).length;
    },
    // Walk within pickup radius of an untaken package: take it, hide it,
    // and report the reward. Returns 0 when nothing is close.
    collect(px, pz) {
      let gained = 0;
      for (const p of list) {
        if (p.taken) continue;
        if (Math.hypot(p.x - px, p.z - pz) < CONFIG.packages.pickupRadius) {
          p.taken = true;
          p.group.visible = false;
          gained += CONFIG.packages.reward;
        }
      }
      return gained;
    },
    restore(takenIndices) {
      for (const p of list) {
        p.taken = takenIndices.includes(p.index);
        p.group.visible = !p.taken;
      }
    },
    takenIndices() {
      return list.filter((p) => p.taken).map((p) => p.index);
    },
  };
}
