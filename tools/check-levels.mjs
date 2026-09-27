// Controleert de levels van Kisten.
//
//   node tools/check-levels.mjs           naspelen van de bewaarde oplossingen
//   node tools/check-levels.mjs --solve   elk level opnieuw laten oplossen
//
// Naspelen is de snelle variant voor bij elke wijziging. Met --solve rekent de
// oplosser alles vanaf nul uit; dat duurt minuten maar bewijst de oplossingen
// opnieuw en meet het kortste aantal duwzetten.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../games/kisten.js';
import { parseRows, replay, makeWorld, solve, toMoves } from './sokoban.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const deep = process.argv.includes('--solve');
const solutions = JSON.parse(readFileSync(join(root, 'tools/kisten-solutions.json'), 'utf8'));

let failed = 0;
let lastPushes = 0;
let dips = 0;
const seen = new Map();

console.log(`${LEVELS.length} levels controleren (${deep ? 'opnieuw oplossen' : 'oplossingen naspelen'})\n`);

LEVELS.forEach((rows, index) => {
  const label = `level ${String(index + 1).padStart(2)}`;
  const level = parseRows(rows);
  const problems = [];

  // Structuur
  if (level.players !== 1) problems.push(`${level.players} spelers`);
  if (level.boxes.length !== level.targets.length) {
    problems.push(`${level.boxes.length} kisten maar ${level.targets.length} doelvakken`);
  }
  if (level.boxes.length === 0) problems.push('geen kisten');
  if (rows.some((r) => r.length !== rows[0].length)) problems.push('rijen niet even lang');
  const sig = rows.join('/');
  if (seen.has(sig)) problems.push(`zelfde level als ${seen.get(sig)}`);
  seen.set(sig, index + 1);
  // Loopt het speelveld nergens de rand uit?
  for (let y = 0; y < level.h; y++) {
    for (let x = 0; x < level.w; x++) {
      const i = y * level.w + x;
      if (level.wall[i]) continue;
      if (x === 0 || y === 0 || x === level.w - 1 || y === level.h - 1) problems.push('open rand');
    }
  }

  if (problems.length) {
    console.error(`${label}: FOUT — ${[...new Set(problems)].join(', ')}`);
    failed++;
    return;
  }

  let pushes;
  if (deep) {
    const world = makeWorld(level.wall, level.w, level.h);
    const t0 = Date.now();
    const res = solve(world, level.boxes, level.player, level.targets, { maxStates: 1500000 });
    if (!res.ok) {
      console.error(`${label}: FOUT — ${res.reason}`);
      failed++;
      return;
    }
    const moves = toMoves(world, level.boxes, level.player, res.path);
    const check = replay(level, moves);
    if (!check.ok) {
      console.error(`${label}: FOUT — eigen oplossing klopt niet (${check.reason})`);
      failed++;
      return;
    }
    pushes = res.pushes;
    const stored = solutions[index];
    const note = stored && stored.pushes !== pushes ? `  (opgeslagen: ${stored.pushes})` : '';
    console.log(`${label}: ok — ${pushes} duwzetten, ${moves.length} zetten, `
      + `${res.states} standen, ${Date.now() - t0}ms${note}`);
  } else {
    const stored = solutions[index];
    if (!stored) {
      console.error(`${label}: FOUT — geen bewaarde oplossing`);
      failed++;
      return;
    }
    const res = replay(level, stored.solution);
    if (!res.ok) {
      console.error(`${label}: FOUT — bewaarde oplossing werkt niet (${res.reason})`);
      failed++;
      return;
    }
    if (res.pushes !== stored.pushes) {
      console.error(`${label}: FOUT — ${res.pushes} duwzetten, ${stored.pushes} verwacht`);
      failed++;
      return;
    }
    pushes = stored.pushes;
    console.log(`${label}: ok — ${pushes} duwzetten, ${stored.solution.length} zetten, `
      + `${level.boxes.length} kist(en), ${level.w}x${level.h}`);
  }

  if (pushes < lastPushes) dips++;
  lastPushes = pushes;
});

console.log('');
if (dips) console.log(`let op: ${dips} keer wordt een level makkelijker dan het vorige.`);
if (failed) {
  console.error(`${failed} level(s) niet in orde.`);
  process.exit(1);
}
console.log(`OK: alle ${LEVELS.length} levels zijn op te lossen.`);
