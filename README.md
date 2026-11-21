# Costa Fuego

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/nycthyraxo-oss/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/nycthyraxo-oss/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Entry for the [make.fun bounty gta6-01](https://make.fun/bounty/gta6-01).

An open-world crime sandbox in the browser: walk or drive around the
coastal city of Costa Fuego, steal cars, run jobs for Marla Quinn at
her garage, race the avenues, deliver packages, and stay ahead of the
police — or don't, and watch the wanted stars climb.

Built with Three.js (vendored under `game/vendor/`, no build step).
Serve the repo root (`node serve.ts --port 8080`) and open the page.

## What's in the city

- A 6x6 avenue/street grid with named roads (Harbor, Liberty, Jasmine,
  Fuego, Rose, Beach avenues; Garuda, Melati, Coral, Orchid, Sudirman,
  Seaside streets), 10 districts, 85+ buildings, 11 landmarks
  (Marla's Garage, Fuego Bank, Costa General hospital, Fuego Tower,
  Neon Plaza, East Docks, the Marina, the Boardwalk, Butik Neon, the
  Safehouse, and Fuego Island across the causeway).
- Traffic with drivers that stop at red lights, pedestrians on the
  sidewalks, shoppers at the beach night market, and the Reef Kings
  gang at Neon Plaza.
- Police that observe at 1-2 stars and only ram (plus roadblocks) from
  star 3; a helicopter with a spotlight joins at 4 stars. Witnessed
  crimes land after a timed witness call; kill the witness first and
  nobody talks. Heat cools faster far from cruisers and past the
  island gate, where cruisers hold at x=209.
- A 6-mission story in 3 chapters (Homecoming, Reef Trouble, Island
  Business), 3 street races, 3 delivery jobs, 6 stunt ramps, 24
  collectible medals, 10 hidden packages, REP ranks from NEW KID to
  COSTA LEGEND, Driving/Street skills, 4 radio stations, shops
  (guns, Pay 'n' Spray, outfits), a day/night cycle synced to the HUD
  clock, and a save system (localStorage `costa-fuego.save.v3`).
- Title screen over a poster collage of the game's own renders
  (`game/poster.jpg`), New Game / Continue / Controls, a fullscreen
  city map (M), and a quest panel with chapter, objective, weapon
  slots, skills and the dialogue log.

## Controls

WASD move/drive · Shift run/boost · E enter/exit car & interact ·
Space brake/jump · mouse camera (pointer lock, drag fallback) ·
F or click shoot · 1-4 weapons · M map · Q quest panel · B radio ·
L skip time · V fast car · P pause · N mute · R restart mission ·
Enter confirms the focused button.

## Validation (this build, measured)

- Gate probe (`probe-v10`): **95 passed, 0 failed** — placement and
  scene audits, city/roads, car factory + disposal, carjacking and
  witness heat, races, deliveries, shops, safehouse save, island
  gate/causeway, big-map pixels, evasion decay, save round-trip,
  presets and sliders, traffic flow, all with zero console errors.
- Play-test (`play-test-v10`): **79 passed, 4 failed**. The 4 are the
  pre-existing baseline class (blind-walk seeker budget under
  SwiftShader: mission 1 x3 + mission 2); the v9/v10/v11 baseline was
  78/5 including a pause pointer-lock failure this build passes.
- Determinism: the four staged screenshots render byte-identical
  across repeated runs (seeded RNG streams; shot mode steps exactly
  one fixed step per frame).
- Screenshots: `screenshots/1-chase.jpg`, `2-combat.jpg`, `3-map.jpg`,
  `4-dialogue.jpg` (each under 256 KiB, 1280x800).
- Source: 20 counted files, 4,900+ lines of game code
  (`game/src/*.js`, `game/index.html`, `main.ts`, `serve.ts`).
  `main.ts` assembles the submission dossier (game + screenshots)
  under the competition caps; the whole `game/` tree is ~1.3 MB.

## Notes

- All names, places and art are original to this game.
- The hidden-package and medal hunts are optional; the story can be
  finished without them.
