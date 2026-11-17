// The four screenshot scenes behind ?shot=<name>. Each one stages a real,
// deterministic moment of the game — the same seed always gives the same
// frame — and the game module does the staging; this file only names them
// and the order they ship in, so shots.json and the dossier agree.
//
//   chase   — cover: driving a stolen car through traffic, wanted 3 stars,
//             police in pursuit, minimap + mission objective on the HUD.
//   street  — on foot at a downtown crossing, pedestrians and traffic.
//   mission — Payback at the East Docks: four armed Reef Kings, the player
//             closing in with the mission beacon overhead.
//   dusk    — driving the boardwalk at dusk, tower and sea behind.
export const SHOT_NAMES = ['chase', 'street', 'mission', 'dusk'];

export const SHOT_FILES = [
  { name: '1-chase.jpg', query: '?shot=chase&seed=1' },
  { name: '2-street.jpg', query: '?shot=street&seed=1' },
  { name: '3-mission.jpg', query: '?shot=mission&seed=1' },
  { name: '4-dusk.jpg', query: '?shot=dusk&seed=1' },
];
