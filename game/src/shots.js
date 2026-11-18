// The four screenshot scenes behind ?shot=<name>. Each one stages a real,
// deterministic moment of the game — the same seed always gives the same
// frame — and the game module does the staging; this file only names them
// and the order they ship in, so shots.json and the dossier agree.
//
//   chase     — cover: driving a stolen car through traffic, wanted 3 stars,
//               police in pursuit, minimap + mission objective on the HUD.
//   combat    — on foot at the docks, firing at the Reef Kings: tracer,
//               muzzle flash, enemies returning fire.
//   map       — the full city map (M) over the game: districts, named
//               venues, GPS route, search zone, current job.
//   dialogue  — Homecoming briefing: Marla's dialogue bar with her
//               portrait, the garage beacon and the player at the spawn.
export const SHOT_NAMES = ['chase', 'combat', 'map', 'dialogue'];

export const SHOT_FILES = [
  { name: '1-chase.jpg', query: '?shot=chase&seed=1' },
  { name: '2-combat.jpg', query: '?shot=combat&seed=1' },
  { name: '3-map.jpg', query: '?shot=map&seed=1' },
  { name: '4-dialogue.jpg', query: '?shot=dialogue&seed=1' },
];
