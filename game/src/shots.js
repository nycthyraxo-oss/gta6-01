// shots.js — the staged screenshot scenes behind ?shot=name&seed=n.
// Each scene sets the real game into a representative state (a police
// chase, a gang fight, the city map, a mission dialogue) and the renderer
// paints it; game.frame raises window.__shotReady once the scene settles.

export const SHOT_NAMES = ['chase', 'combat', 'map', 'dialogue', 'start', 'play', 'end'];

export const SHOT_DESCRIPTIONS = {
  chase: 'Player fleeing police at three stars through downtown, full HUD',
  combat: 'On-foot gunfight with the Reef Kings at Neon Plaza at night',
  map: 'Fullscreen city map with districts, venues and the GPS route',
  dialogue: 'Mission dialogue with Marla outside her garage',
  start: 'Opening spawn looking north toward the garage',
  play: 'Free-roam driving through Tower Plaza',
  end: 'Fuego Island at golden hour',
};
