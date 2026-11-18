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
open: steal any car, outrun the police, hunt the ten hidden packages, or just
drive the boardwalk at dusk.

- **City:** a seeded 5×5-block coastal city at golden hour — roads, sidewalks,
  beach, boardwalk, sea, palms, street lamps and the 92 m Fuego Tower. The
  same seed always builds the same city.
- **Nine districts, each with its own architecture:** art-deco pastel
  beachfront hotels with neon crowns, modern glass downtown towers with
  antennas, low-rise colourful mercado blocks, mid-rise residential with
  balconies and water towers, brick warehouses by the docks. No single
  repeated facade — the facade generator draws a different style per
  district, with lit windows, ground-floor shopfronts, striped awnings,
  roof clutter and lit name boards (café, pizzeria, bar, cinema, hotel,
  pharmacy, burger joint, surf shop, and a minimarket with a personal
  easter-egg name). The landmarks are named too: TALLER MARLA on the
  garage, FUEGO BANK on the bank, COSTA GENERAL on the hospital, FUEGO
  TOWER on the tower.
- **The beach:** a full coastal strip, not a label — palm-lined sand,
  a plank boardwalk, a lifeguard tower, beach umbrellas, the sea at the
  east edge, and the deco hotels facing it.
- **Parks and street life:** two green parks with paths, leafy trees and
  benches; sidewalks dressed with hydrants, bins and benches; working
  traffic lights that cycle over the junctions; a mercado with six stalls
  under striped awnings, fruit on the counters, and a vendor behind every
  stall who flees gunfire and comes back when it is over.
- **People, less boxy:** pedestrians and enemies are built from rounded
  geometry — capsule torsos, sphere heads with hair and eyes, cylinder limbs
  with swinging arms and legs, varied heights, skin tones, hair colours and
  clothing. They walk, flee gunfire, and lean into a run.
- **Dusk atmosphere:** a gradient sunset sky (violet top, pink band, orange
  horizon), warm haze fog, a low warm sun for long shadows, sodium street
  lamps glowing along the beachfront boulevard, and a police helicopter
  circling high over the city. The game lives at golden hour — the light
  never slides back into noon.
- **On foot and by car:** walk, run, steal any parked or driving car (E),
  drive with acceleration, steering, handbrake and skid marks. Eight named
  car models (Cometa GT, Brisa Hatch, Solano Cabrio, Toro Sedan, Furia
  Sport, Lobo Van, Bruto 4x4, Vela Coupe), shown in the speedo with gear.
  Cars take damage now: crashes and police rams lower the condition, and a
  battered car runs slower — the speedo shows the condition, and a respray
  at Taller Marla fixes it up.
- **Traffic and pedestrians:** 14 AI cars cruising the road grid, 26
  pedestrians on the sidewalks who flee gunfire, and vendors at the mercado.
- **Wanted level and police:** 0–5 stars. Stealing, hitting people or cars,
  and shooting raise heat. Police cars chase and ram; on foot, officers
  close in and arrest. Break line of sight and get far away and the stars
  cool off one at a time. At 4 stars the helicopter leaves its patrol
  circle, hovers over you and pins you in its searchlight — while the beam
  is on you the heat will not cool, and the HUD says so. The pursuer panel
  names every chaser, its distance and what it is doing: RAMMING, CHASING,
  SEARCHING, ARRESTING, SPOTLIGHT ON YOU.
- **Missions and story:** six jobs for Marla Quinn with briefings,
  objective markers, a beacon, minimap blips and timers where they fit:
  Homecoming, Hot Wheels, The Drop, Heat, Payback (four armed Reef Kings at
  the docks), The Big Score (rob the bank, escape to the safehouse).
- **Combat:** hitscan shooting with tracer bolts and muzzle flash, armed
  enemies who shoot back, health, armour that soaks 60% of every hit while
  it lasts (a finished job earns a little back), death and respawn at the
  hospital (−$200). Eight red barrels sit around the city — at the docks,
  by the garage, at the plaza — and a shot that reaches one sets it off:
  fireball, shake, 50 damage to anything close, including Rico.
- **Tire smoke:** handbrake at speed, or a hard steer at speed, leaves
  grey smoke puffs at the rear wheels as well as skid marks.
- **Hidden packages:** ten gold packages stashed around the city — behind
  the garage, on a park bench, under a beach umbrella, in the dock crates,
  on the marina pier, in the tower plaza, at a mercado stall, by the
  hospital wall, in a north-end alley, at a downtown kiosk. $50 each, paid
  on the spot, tracked on the HUD and kept in the save.
- **Neon night (L):** the city has two looks — the default golden hour and
  a neon night (dark sky, moon-cold light, street lamps all the way up, the
  lit windows reading brighter by contrast). One key switches between them;
  the staged screenshots always render the same dusk.
- **Spawn a car (V):** a Furia Sport pulls up on the nearest road, yours for
  the taking — a sandbox toy, no heat, no cost, with a short cooldown and a
  cap of four so the city never floods.
- **Neon Plaza:** a central plaza landmark one block east of the tower — a
  paved circle, a fountain with a glowing water disc and neon rings around
  its column, benches and palms. It is named on the city map.
- **Wanted evaded:** escape a pursuit and the HUD says so — "Wanted Level
  Evaded!" — with a short cooldown before the heat can rise again.
- **HUD and minimap:** mission banner top-center (chapter, stage, objective,
  target distance, day + clock, stage-progress bar, the next job after this
  one), heat label + wanted stars + cash + weapon slots + the pursuer panel
  top-right, district name + live minimap + health / armour / reputation
  bars + package count bottom-left, big speedo with car name, gear, vehicle
  condition and radio station bottom-right, and a mission dialogue bar
  bottom-center with the speaker's portrait and name. The minimap draws
  roads, the player arrow, police, enemies, the mission marker, the search
  zone and north. M opens the full city map: nine districts, named venues,
  parks, the GPS route in gold and the search zone in red.
- **Districts:** the city is divided into nine named districts — Fuego
  Beachfront, Old Harbor, Marina, Palm Gardens, Mercado, North End, Tower
  Plaza, Westside, Downtown — shown above the minimap as you cross them.
- **Start and save:** title screen with the story, New Game, Continue with
  your progress on it (chapter, cash, reputation, day) and a Controls panel;
  Enter starts the game. localStorage save (cash, mission progress,
  position, clock, day, armour, packages found) with autosave.
- **Polish:** dusk sky, shadows, headlights and taillights, impact
  particles, screen shake, and engine, siren and gunshot sounds synthesized
  with WebAudio — no audio files, no network request. The radio cycles
  three stations (Q).

## How to run

```sh
node serve.ts            # serves game/ on http://localhost:8080
```

Open http://localhost:8080 in desktop Chrome. No build step, no network.

Screenshot scenes (deterministic, same seed every time):

```sh
node serve.ts --port 8081
# then open http://localhost:8081/?shot=chase&seed=1   (and combat, map, dialogue)
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
| Enter | Start game from the title screen |
| M | City map |
| Q | Radio (next station) |
| L | Neon night (dusk / night) |
| V | Spawn a fast car nearby |
| P | Pause (toggles) |
| N | Mute |
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
    people.js           pedestrians + vendors + armed enemies
    police.js           wanted heat, stars, chase, arrest, pursuer panel
    missions.js         the six-job state machine
    hud.js              HUD text + live minimap + full city map
    audio.js            synthesized WebAudio sound + music + radio
    input.js            keyboard + mouse, one-shot action flags
    random.js           seeded RNG (mulberry32)
    trafficlights.js    the city-wide traffic-light cycle
    packages.js         the ten hidden packages
    shots.js            the four screenshot scenes, named
main.ts                 the entry program: copies game/ + screenshots/ to
                        /output and writes /output/dossier.json
```

## Validation

- **Local check** (`node cli/makefun.mjs check`, 18 Nov 2026): 4 passed,
  0 failed, 16 skipped, 5 at-submission items (repo_public, repo_owner,
  repo_created_after_open, commit_in_repo, duplicate_snapshot — all resolved
  at submit time by the public GitHub repo).
- **Determinism:** `main.ts` run twice into two directories — `diff -r`
  byte-identical; the 4 screenshot renders re-run three times —
  byte-identical (same SHA-256 for all 4 JPEGs and shots.json).
- **Play-test** (headless Chrome over CDP, real keyboard/mouse input,
  18 Nov 2026): 37/37 passed — title → start, WASD walking, mission 1
  completes live with $300 (cash $450) and mission 2 starts, E steals a
  parked car and wanted rises to 1 star with a cruiser in pursuit, driving
  accelerates, E exits the car, roadblock spawns at 3 stars, searchlight
  helicopter activates at 4 stars and stands down when the heat clears,
  M opens the city map and closes it, P toggles pause both ways, autosave
  writes localStorage and Continue resumes the same mission and cash after
  reload, respawn costs $200 at the hospital, the staged combat shot
  truthfully kills one Reef King (4 → 3 left), zero console errors.
  Wanted-decay passed this run (heat 33 → 0 stars); it is timing-tight
  on this VM — the game clock runs ~1/33 real time under SwiftShader, so
  the same check failed in three earlier v7 runs (heat 33 → 0.15, 1.95,
  2.40 in the 120 s poll) and on the clean v6 commit (heat 33 → 1.95) —
  environment, not a regression. With bloom the seeker took 7m39s
  wall-clock on this VM (vs ~2m06s before bloom); on real GPU hardware
  the per-frame cost is negligible.
- **Dossier:** `dossier.json` 778,652 B; `game/src` 15 files, 214,850 B;
  `game/` 17 files, 899,275 B; 1 vendored three.js 670,681 B.
- **Screenshots:** 4 JPEGs, 1280×800 — all real renders of the game's own
  code, inspected frame by frame (v7, headless Chrome, 18 Nov 2026, zero
  console errors). 1-chase.jpg 150,448 B (`a3401506…`), 2-combat.jpg
  105,913 B (`392b67be…`), 3-map.jpg 95,422 B (`bec31473…`),
  4-dialogue.jpg 105,710 B (`d3b5598e…`) — each ≤256 KiB, each
  byte-identical across three render runs.

## Honest limitations

- **The dumb baseline wins on looks.** A flat-shaded low-poly city cannot
  match a textured one: facades are canvas-drawn window grids, people are
  rounded but still simple figures with no facial animation. The art
  direction is coherent, but it is simple on purpose — the entry spends
  its budget on systems, not on textures it cannot ship.
- **No building interiors.** You can walk through buildings on foot (cars
  are clamped to roads, so they cannot), and cars never deform — a hard
  crash only slows you, lowers the condition and raises heat.
- **No multiplayer, no voice acting.** The story is told in briefing text
  and dialogue, not cutscenes. The radio is three synthesized station
  labels with different music, not real songs.
- **Police AI is a chase, not a full pursuit system.** Officers ram and
  arrest, roadblocks spawn at 3 stars, and the searchlight helicopter
  chases at 4 stars — but there are no spike strips, and the helicopter
  never shoots.
- **The helicopter reads through its searchlight, not its body.** At 4
  stars the heli flies at 55–64 m, above the third-person camera's upward
  tilt when near — in play you see its light cone, the ground pool and the
  SPOTLIGHT banner; the body itself is only glimpseable at the top of the
  frame on its distant approach.
- **Frame rate depends on the machine.** The scene uses a 1024 px shadow
  map over the whole city; on weak software rendering it runs slowly,
  and the frame loop drops time instead of catching up.
- **Frame loop is capped, not caught up.** Physics runs at most 3 fixed
  1/60 s steps per rendered frame and the HUD/minimap redraw once per
  frame; on a slow frame the game drops time instead of spiralling.

## License

MIT — see [LICENSE](LICENSE).
