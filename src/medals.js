// Fuego Medals (v9 iteration 5): 24 gold medals hidden across the map —
// on the road mid-blocks, the pier, the beach, the plaza and the island.
// Walk or drive over one and it pays $100 on the spot; the full set pays
// a $5,000 bonus. Spots are FIXED points (no rng at all), so the same
// seed always hides them in the same places and the save file can name
// them by index — the same pattern as the hidden packages.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const SPOTS = [
  { x: -140, z: -112, note: 'on Harbor Ave' },
  { x: -140, z: -56, note: 'on Harbor Ave' },
  { x: -140, z: 0, note: 'on Harbor Ave' },
  { x: -140, z: 56, note: 'on Harbor Ave' },
  { x: -140, z: 112, note: 'on Harbor Ave' },
  { x: 140, z: -112, note: 'on Beach Ave' },
  { x: 140, z: -56, note: 'on Beach Ave' },
  { x: 140, z: 0, note: 'on Beach Ave' },
  { x: 140, z: 56, note: 'on Beach Ave' },
  { x: 140, z: 112, note: 'on Beach Ave' },
  { x: -112, z: -140, note: 'on Garuda St' },
  { x: -56, z: -140, note: 'on Garuda St' },
  { x: 0, z: -140, note: 'on Garuda St' },
  { x: 56, z: -140, note: 'on Garuda St' },
  { x: 112, z: -140, note: 'on Garuda St' },
  { x: -112, z: 140, note: 'on Seaside St' },
  { x: -56, z: 140, note: 'on Seaside St' },
  { x: 0, z: 140, note: 'on Seaside St' },
  { x: 56, z: 140, note: 'on Seaside St' },
  { x: 112, z: 140, note: 'on Seaside St' },
  { x: 170, z: 100, y: 1.15, note: 'on Fuego Pier' },
  { x: 247, z: 100, y: 1.15, note: 'on Fuego Island' },
  { x: 170, z: 60, note: 'on the beach' },
  { x: 70, z: 14, note: 'in Neon Plaza' },
];

const GOLD = new THREE.MeshStandardMaterial({
  color: 0xffd23e, roughness: 0.25, metalness: 0.8, emissive: 0x8a6a00, emissiveIntensity: 0.6,
});
const STAR = new THREE.MeshStandardMaterial({
  color: 0xc23b2e, roughness: 0.5, emissive: 0x5a1008, emissiveIntensity: 0.5,
});

export function createMedals(scene) {
  const list = [];
  for (let i = 0; i < CONFIG.medals.count; i += 1) {
    const spot = SPOTS[i % SPOTS.length];
    const group = new THREE.Group();
    // A gold coin standing on edge, spinning slowly (the game rotates
    // it) — a star in the middle so it reads as a medal, not a package.
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.12, 20), GOLD);
    coin.rotation.x = Math.PI / 2;
    coin.position.y = 0.9;
    coin.castShadow = true;
    group.add(coin);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), STAR);
    star.position.y = 0.9;
    group.add(star);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.12, depthWrite: false }),
    );
    glow.position.y = 0.9;
    group.add(glow);
    // The medal stands on its ground: y 1.15 on the pier deck and the
    // island platform, 0 everywhere else.
    group.position.set(spot.x, spot.y || 0, spot.z);
    scene.add(group);
    list.push({ index: i, group, x: spot.x, z: spot.z, note: spot.note, taken: false });
  }
  return {
    list,
    count() {
      return list.filter((m) => m.taken).length;
    },
    // Walk within pickup radius of an untaken medal: take it, hide it,
    // and report the reward. The full set pays the bonus on the 24th.
    collect(px, pz) {
      let gained = 0;
      let bonus = false;
      for (const m of list) {
        if (m.taken) continue;
        if (Math.hypot(m.x - px, m.z - pz) < CONFIG.medals.pickupRadius) {
          m.taken = true;
          m.group.visible = false;
          gained += CONFIG.medals.reward;
          if (list.every((o) => o.taken)) {
            gained += CONFIG.medals.bonus;
            bonus = true;
          }
        }
      }
      return { gained, bonus };
    },
    restore(takenIndices) {
      for (const m of list) {
        m.taken = takenIndices.includes(m.index);
        m.group.visible = !m.taken;
      }
    },
    takenIndices() {
      return list.filter((m) => m.taken).map((m) => m.index);
    },
    // The medals spin in place (called once per frame from the game).
    spin(time) {
      for (const m of list) {
        if (!m.taken) m.group.rotation.y = time * 1.2 + m.index;
      }
    },
  };
}
