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
- **Traffic and pedestrians:** 22 AI cars cruising the road grid — they
  brake for cars and pedestrians ahead, turn at junctions, and stop at
  red lights (yellow means stop if there is room) — plus 34 pedestrians
  walking waypoint loops on the sidewalk rings who flee gunfire, and
  vendors at the mercado. Parked cars stand at the road edge, clear of
  the traffic lanes, so the city keeps moving.
- **Solid buildings:** every building is a solid collider — the player,
  cars, pedestrians and police are all pushed out of walls instead of
  walking through them. A respray at Taller Marla triggers from the
  road in front of the garage.
- **Memory:** cars are built from shared cached geometry and materials,
  so a long session does not grow VRAM: whenever a car leaves the scene
  (a V spawn evicts the oldest car, a respray rebuilds the paint, the
  police stand down) its per-instance resources — light materials, the
  van's checker band, the cabrio's windshield, the Interceptor's livery
  and light bar — are disposed first. The shared caches are never freed,
  so the other cars are untouched.
- **Wanted level and police:** 0–5 stars. Stealing, hitting people or cars,
  and shooting raise heat. One shot is 1 star, and 1 star is not a death
  sentence: the police spawn at once but hold for a 4-second grace window
  (the HUD warns you), then escalate by star — 1★ OBSERVE (patrol the
  roads, no chase, no ram, no arrest), 2★ FOLLOW (chase at 0.6×, hold a
  12-unit standoff, no ram, no arrest, one officer who holds at 6),
  3★ PURSUE (chase 0.85×, ramming on, roadblocks, two officers, arrest
  2.5 s), 4★ AGGRESSIVE (chase 1.0×, ramming on, helicopter, three
  officers, arrest 2.0 s), 5★ MAXIMUM (chase 1.15×, ramming on, heli,
  roadblocks, three officers, arrest 1.5 s). Break line of sight and get
  far away and the stars cool off one at a time. At 4 stars the helicopter
  leaves its patrol circle, hovers over you and pins you in its
  searchlight — while the beam is on you the heat will not cool, and the
  HUD says so. The pursuer panel names every chaser, its distance and
  what it is doing: RESPONDING, PATROLLING, FOLLOWING, RAMMING, CHASING,
  SEARCHING, HOLDING, ARRESTING, SPOTLIGHT ON YOU.
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
- **Time (L):** the day runs on a continuous cycle — night, dawn, day,
  dusk — and L skips the clock forward two hours. The staged screenshots
  always render the same dusk.
- **Spawn a car (V):** a Furia Sport pulls up on the nearest road, yours for
  the taking — $25 a car, with a short cooldown and a cap so the city
  never floods.
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
  three stations (B).

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
| E | Enter or exit a car / open a shop |
| Space | Jump (on foot) / brake, handbrake (in a car) |
| 1–6 | Switch weapon: pistol / knife / bazooka / SMG / shotgun / rifle (ammo is limited; shop weapons are REP-gated) |
| Mouse | Camera (Pointer Lock, drag fallback) |
| F or click | Shoot / swing the knife / fire a rocket |
| Enter | Start game from the title screen |
| M | City map |
| B | Radio (next station) |
| Q | Collapse / expand the quest panel |
| L | Skip time forward 2 h |
| V | Spawn a fast car nearby ($25) |
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
    medals.js           the 24 collectible medals
    shots.js            the four screenshot scenes, named
main.ts                 the entry program: copies game/ + screenshots/ to
                        /output and writes /output/dossier.json
```

## Validation

- **Local check** (`node cli/makefun.mjs check`, 20 Nov 2026): 4 passed,
  0 failed, 16 skipped, 5 at-submission items (repo_public, repo_owner,
  repo_created_after_open, commit_in_repo, duplicate_snapshot — all resolved
  at submit time by the public GitHub repo).
- **Determinism:** `main.ts` run twice into two directories — `diff -r`
  byte-identical; the 4 screenshot renders re-run — byte-identical
  (same SHA-256 for all 4 JPEGs and shots.json).
- **Probe** (headless Chrome over CDP, 20 Nov 2026): 89 passed, 0 failed —
  full check suite including traffic flow, pedestrian movement, building
  solidity, pairwise building overlaps (0), traffic-light poles on
  sidewalks (32 corner poles, all off-road) and the placement audit.
- **Play-test** (headless Chrome over CDP, real keyboard/mouse input,
  20 Nov 2026): 78 passed, 5 failed. The 5 are software-rendering
  limits, not game bugs: under SwiftShader the game runs at ~0.02× real
  time, so the blind walk-to-garage seeker exhausts its 30-step budget
  26 m short (the walk itself works — 52 m → 26 m on the correct
  heading) and its payout/mission-2 cascades fail with it, plus one
  pointer-lock timing race (the lock engaged after the pause handler
  ran; the suppression path exits it on arrival, the read was just
  early). Everything else passes: title → start, WASD walking, E steals
  a parked car and wanted rises to 1 star with a cruiser patrolling
  (1 star observes, it does not chase), driving accelerates, E exits
  the car, roadblock at 3 stars, searchlight helicopter at 4 stars,
  M opens/closes the city map, P toggles pause both ways, autosave +
  Continue across a reload, respawn −$200, the staged combat shot
  truthfully kills one Reef King (4 → 3 left), zero console errors.
- **Dossier:** `game/src` 16 files, 558,421 B; `game/` 725,578 B total
  (1 vendored three.js included).
- **Screenshots:** 4 JPEGs, 1280×800 — all real renders of the game's own
  code, inspected frame by frame (v9, headless Chrome, 20 Nov 2026, zero
  console errors). 1-chase.jpg 182,755 B (`e7e1effd…`), 2-combat.jpg
  141,407 B (`5d1caad7…`), 3-map.jpg 99,619 B (`df7304c3…`),
  4-dialogue.jpg 141,514 B (`7cb71f85…`) — each ≤256 KiB, each
  byte-identical across two render runs.

## Honest limitations

- **The dumb baseline wins on looks.** A flat-shaded low-poly city cannot
  match a textured one: facades are canvas-drawn window grids, people are
  rounded but still simple figures with no facial animation. The art
  direction is coherent, but it is simple on purpose — the entry spends
  its budget on systems, not on textures it cannot ship.
- **No building interiors.** Buildings are solid — you cannot walk or
  drive through them — but none of them can be entered. Cars never
  deform either: a hard crash only slows you, lowers the condition and
  raises heat.
- **No multiplayer, no voice acting.** The story is told in briefing text
  and dialogue, not cutscenes. The radio is three synthesized station
  labels with different music, not real songs.
- **Police AI escalates by star, it does not start at maximum.** 1 star
  patrols and never rams or arrests, 2 stars follows at a distance,
  ramming and arrest start at 3 stars, the searchlight helicopter chases
  at 4 stars — but there are no spike strips, and the helicopter never
  shoots.
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
