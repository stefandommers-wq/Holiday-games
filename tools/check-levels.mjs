// Lost elk level van Kisten op met een breedte-eerst zoektocht. Faalt als een
// level niet op te lossen is, al opgelost begint, of geen enkele duw nodig
// heeft. Ontwikkelgereedschap, draaien met: node tools/check-levels.mjs

import { LEVELS, parseLevel } from '../games/kisten.js';

const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const MAX_STATES = 3_000_000;

function solve(rows) {
  const { walls, targets, boxes, player } = parseLevel(rows);

  const startBoxes = [...boxes].sort().join('|');
  const startKey = `${player.x},${player.y}#${startBoxes}`;
  const isSolved = (boxKeys) => boxKeys.every((b) => targets.has(b));

  if (isSolved([...boxes])) return { ok: false, reason: 'begint al opgelost' };

  const seen = new Set([startKey]);
  let frontier = [{ x: player.x, y: player.y, boxes: new Set(boxes), moves: 0, pushes: 0 }];
  let visited = 1;

  while (frontier.length) {
    const next = [];
    for (const state of frontier) {
      for (const [dx, dy] of DIRS) {
        const nx = state.x + dx;
        const ny = state.y + dy;
        const at = `${nx},${ny}`;
        if (walls.has(at)) continue;

        let boxesNext = state.boxes;
        let pushes = state.pushes;
        if (state.boxes.has(at)) {
          const beyond = `${nx + dx},${ny + dy}`;
          if (walls.has(beyond) || state.boxes.has(beyond)) continue;
          boxesNext = new Set(state.boxes);
          boxesNext.delete(at);
          boxesNext.add(beyond);
          pushes++;
        }

        const key = `${at}#${[...boxesNext].sort().join('|')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        visited++;
        if (visited > MAX_STATES) return { ok: false, reason: 'te groot om door te rekenen' };

        const moves = state.moves + 1;
        if (pushes !== state.pushes && isSolved([...boxesNext])) {
          return { ok: true, moves, pushes, visited };
        }
        next.push({ x: nx, y: ny, boxes: boxesNext, moves, pushes });
      }
    }
    frontier = next;
  }
  return { ok: false, reason: 'niet op te lossen' };
}

let failed = 0;
console.log(`${LEVELS.length} levels controleren...\n`);

LEVELS.forEach((rows, i) => {
  const parsed = parseLevel(rows);
  const boxCount = parsed.boxes.size;
  const targetCount = parsed.targets.size;
  const label = `level ${String(i + 1).padStart(2)}`;

  if (boxCount !== targetCount) {
    console.error(`${label}: FOUT — ${boxCount} kisten maar ${targetCount} doelvakken`);
    failed++;
    return;
  }

  const t0 = Date.now();
  const result = solve(rows);
  const ms = Date.now() - t0;

  if (!result.ok) {
    console.error(`${label}: FOUT — ${result.reason}`);
    failed++;
    return;
  }
  const trivial = result.pushes < 2 ? '  (wel erg makkelijk)' : '';
  console.log(`${label}: ok — ${result.moves} zetten, ${result.pushes} duwen, `
    + `${boxCount} kist(en), ${result.visited} standen, ${ms}ms${trivial}`);
});

if (failed) {
  console.error(`\n${failed} level(s) niet in orde.`);
  process.exit(1);
}
console.log('\nOK: alle levels zijn op te lossen.');
