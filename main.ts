// Costa Fuego — the entry program for the gta6-01 "Make GTA 6" bounty
// (Node 22, standard library only). It hands the game in: it copies this
// repository's game/ (the playable static game) and screenshots/ (four real
// renders of the game) into the output directory and writes
// /output/dossier.json with buildDossier from vendor/makefun-game.ts, the
// summary the judge reads. Outside the grader's container,
// MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The program is deterministic: it copies the same files in the same way
// every run, and buildDossier writes the same bytes for the same inputs, so
// two runs produce byte-identical output directories.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const MAX_SCREENSHOT_BYTES = 262144; // the 256 KiB cap, per shot.
const MAX_INDEX_BYTES = 1048576; // the 1 MiB cap on game/index.html.
const MAX_SHOTS = 4;
const MIN_SHOTS = 3;

// Refuse to hand in a game that is not there: a missing index.html or an
// empty screenshots folder would fail the gate, so fail loudly here instead.
function requireGame() {
  const indexPath = join(repoRoot, 'game', 'index.html');
  if (!existsSync(indexPath)) throw new Error(`missing game/index.html at ${indexPath}`);
  const indexSize = statSync(indexPath).size;
  if (indexSize > MAX_INDEX_BYTES) throw new Error(`game/index.html is ${indexSize} bytes, over the 1 MiB cap`);
  const shotsDir = join(repoRoot, 'screenshots');
  if (!existsSync(shotsDir)) throw new Error(`missing screenshots/ at ${shotsDir}`);
  const shots = readdirSync(shotsDir).filter((name) => !name.startsWith('.'));
  if (shots.length < MIN_SHOTS || shots.length > MAX_SHOTS) {
    throw new Error(`expected ${MIN_SHOTS} or ${MAX_SHOTS} screenshots, found ${shots.length}`);
  }
  for (const name of shots) {
    const size = statSync(join(shotsDir, name)).size;
    if (size > MAX_SCREENSHOT_BYTES) throw new Error(`screenshot ${name} is ${size} bytes, over the 256 KiB cap`);
  }
}

requireGame();
mkdirSync(outDir, { recursive: true });
mkdirSync(join(outDir, 'game'), { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
const gameEntries = readdirSync(join(outDir, 'game'), { recursive: true }).length;
console.log(`Costa Fuego: copied game/ (${gameEntries} entries) + screenshots/ to ${outDir}`);

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the other limits refuse an entry the scorer would refuse.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: MAX_SHOTS, max_bytes: MAX_SCREENSHOT_BYTES },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
