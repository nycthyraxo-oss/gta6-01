# Costa Fuego — an open-world crime game

[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/nycthyraxo-oss/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/nycthyraxo-oss/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An entry for the [make.fun "Make GTA 6" bounty (gta6-01)](https://make.fun/bounty/gta6-01):
a complete, original open-world crime game that runs offline in desktop Chrome
from static files. No Rockstar names, characters, map, art or music anywhere —
Costa Fuego is its own city, with its own people, story and cars.

## The game

Rico Vane is out after three years inside. Marla Quinn runs the garage on
Coral Row, and she has six jobs for him — $300 to $2,000 each — from a
homecoming drive to a bank robbery and a getaway. Between jobs, the city is
open: steal any car, outrun the police, or just drive the boardwalk at dusk.

- **City:** a seeded 5×5-block coastal city at golden hour — roads, sidewalks,
  beach, boardwalk, sea, palms, street lamps and the 92 m Fuego Tower. The
  same seed always builds the same city.
- **People, less boxy:** pedestrians and enemies are built from rounded
  geometry — capsule torsos, sphere heads with hair and eyes, cylinder limbs
  with swinging arms and legs, varied heights, skin tones, hair colours and
  clothing. They walk, flee gunfire, and lean into a run.
- **Buildings with identity:** no flat colour blocks. Every facade carries a
  lit-window texture (warm lit windows mixed with dark ones), ground-floor
  shopfronts with lit display windows and striped awnings, roof clutter
  (AC units, antennas, water towers), and a lit name board — café, pizzeria,
  bar, cinema, hotel, pharmacy, burger joint, surf shop, and a minimarket
  with a personal easter-egg name. The landmarks are named too: TALLER
  MARLA on the garage, FUEGO BANK on the bank, COSTA GENERAL on the
  hospital, FUEGO TOWER on the tower.
- **Dusk atmosphere:** a gradient sunset sky (violet top, pink band, orange
  horizon), warm haze fog, a low warm sun for long shadows, sodium street
  lamps glowing along the beachfront boulevard, and a police helicopter
  circling high over the city. The game lives at golden hour — the light
  never slides back into noon.
- **On foot and by car:** walk, run, steal any parked or driving car (E),
  drive with acceleration, steering, handbrake and skid marks. Eight named
  car models (Cometa GT, Brisa Hatch, Solano Cabrio, Toro Sedan, Furia
  Sport, Lobo Van, Bruto 4x4, Vela Coupe), shown in the speedo with gear.
- **Traffic and pedestrians:** 14 AI cars cruising the road grid, 26
  pedestrians on the sidewalks who flee gunfire.
- **Wanted level and police:** 0–5 stars. Stealing, hitting people or cars,
  and shooting raise heat. Police cars chase and ram; on foot, officers
  close in and arrest. Break line of sight and get far away and the stars
  cool off one at a time.
- **Missions and story:** six jobs for Marla Quinn with briefings,
  objective markers, a beacon, minimap blips and timers where they fit:
  Homecoming, Hot Wheels, The Drop, Heat, Payback (four armed Reef Kings at
  the docks), The Big Score (rob the bank, escape to the safehouse).
- **Combat:** hitscan shooting with tracer and muzzle flash, armed enemies
  who shoot back, health, death and respawn at the hospital (−$200).
- **HUD and minimap:** mission banner top-center (chapter, objective,
  target distance, clock), heat label + wanted stars + cash + weapon
  top-right, district name + live minimap + health bar bottom-left, big
  speedo with car name, gear and radio station bottom-right, and a mission
  dialogue bar bottom-center with the speaker's portrait and name. The
  minimap draws roads, the player arrow, police, enemies, the mission
  marker and north.
- **Districts:** the city is divided into six named districts — Fuego
  Beachfront, Old Harbor, North End, Tower Plaza, Westside, Downtown —
  shown above the minimap as you cross them.
- **Start and save:** title screen with the story, controls and Continue;
  localStorage save (cash, mission progress, position, clock) with autosave.
- **Polish:** dusk sky, shadows, headlights and taillights, impact
  particles, screen shake, and engine, siren and gunshot sounds synthesized
  with WebAudio — no audio files, no network request.

## How to run

```sh
node serve.ts            # serves game/ on http://localhost:8080
```

Open http://localhost:8080 in desktop Chrome. No build step, no network.

Screenshot scenes (deterministic, same seed every time):

```sh
node serve.ts --port 8081
# then open http://localhost:8081/?shot=chase&seed=1   (and street, mission, dusk)
```

## Controls

| Key | Action |
|---|---|
| WASD | Move / drive |
| Shift | Run / boost |
| E | Enter or exit a car |
| Space | Brake / handbrake |
| Mouse drag | Camera |
| F or click | Shoot |
| P | Pause (toggles) |
| M | Mute |
| R | Restart mission |

## Architecture

One Config file holds every tuning number; every other file has one job.

```
game/
  index.html            page, import map, HUD + menus
  vendor/three.module.min.js   three.js 0.160.0, vendored (minified)
  src/
    main.js             boot; ?shot= stages a screenshot scene
    game.js             the game: loop, player, driving, combat, camera, save
    config.js           every tuning number + the six mission briefs
    city.js             builds Costa Fuego from the seed
    vehicles.js         car factory, traffic, skid marks
    people.js           pedestrians + armed enemies
    police.js           wanted heat, stars, chase, arrest
    missions.js         the six-job state machine
    hud.js              HUD text + live minimap
    audio.js            synthesized WebAudio sound + music
    input.js            keyboard + mouse, one-shot action flags
    random.js           seeded RNG (mulberry32)
    shots.js            the four screenshot scenes, named
main.ts                 the entry program: copies game/ + screenshots/ to
                        /output and writes /output/dossier.json
```

## Validation

- **Local check** (`node cli/makefun.mjs check`, 17 Nov 2026): 4 passed,
  0 failed, 16 skipped, 5 at-submission items (repo_public, repo_owner,
  repo_created_after_open, commit_in_repo, duplicate_snapshot — all resolved
  at submit time by the public GitHub repo).
- **Determinism:** `main.ts` run twice into two directories — `diff -r`
  byte-identical.
- **Play-test** (headless Chrome over CDP, real game loop, 17 Nov 2026):
  12/12 passed — title → start, WASD walking, mission 1 completes with
  $300, E steals the orange coupe and wanted rises, driving accelerates,
  E exits the car, F shoots, P toggles pause both ways, autosave writes
  localStorage, wanted decays to 0 out of sight, zero console errors.
- **Dossier:** 14 source files, 113,924 bytes; 1 vendored file (three.js,
  670,681 bytes); 15 files in game/, 784,605 bytes total; dossier.json
  745,597 bytes.
- **Screenshots:** 4 JPEGs, 1280×800, 119.7 / 130.8 / 110.4 / 98.2 KiB — all
  real renders of the game's own code, inspected frame by frame (v3,
  headless Chrome, 17 Nov 2026, zero console errors).

## Honest limitations

- **The dumb baseline wins on looks.** A flat-shaded low-poly city cannot
  match a textured one: facades are canvas-drawn window grids, people are
  rounded but still simple figures with no facial animation, and there is
  no vegetation beyond palms. The art direction is coherent, but it is
  simple on purpose — the entry spends its budget on systems, not on
  textures it cannot ship.
- **No building interiors and no car damage model.** You can walk through
  buildings on foot (cars are clamped to roads, so they cannot), and cars
  never deform — a hard crash only slows you and raises heat.
- **No multiplayer, no voice acting, no armour or respect systems.** The
  HUD shows health only (the pistol has infinite ammo by design), the
  "radio" is a station label rather than a real station, and the police
  helicopter is skyline decoration — it never chases or shoots. The story
  is told in briefing text, not cutscenes.
- **Police AI is a chase, not a pursuit system.** Officers ram and arrest,
  but there are no roadblocks or spike strips.
- **Frame rate depends on the machine.** The scene uses a 2048 px shadow
  map over the whole city; on weak software rendering it runs slowly,
  though the fixed 1/60 s step keeps the simulation correct.

## License

MIT — see [LICENSE](LICENSE).
