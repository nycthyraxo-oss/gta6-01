// main.ts — hands Costa Fuego in for the gta6-01 bounty.
// Copies game/ and screenshots/ from this repository into the output
// directory (/output in the grader, MAKEFUN_OUTPUT_DIR locally) and
// writes dossier.json with the kit library, exactly as the scorer does.

import { cpSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

function handIn(): void {
  mkdirSync(outDir, { recursive: true });
  const gameSrc = join(repoRoot, 'game');
  const shotsSrc = join(repoRoot, 'screenshots');
  if (!existsSync(gameSrc)) throw new Error('game/ is missing');
  cpSync(gameSrc, join(outDir, 'game'), { recursive: true });
  if (existsSync(shotsSrc)) {
    cpSync(shotsSrc, join(outDir, 'screenshots'), { recursive: true });
  }
  const dossier = buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);
  console.log('Costa Fuego handed in: game/ + screenshots/ + dossier.json -> ' + outDir);
}

handIn();
