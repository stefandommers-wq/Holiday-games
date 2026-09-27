// Maakt nieuwe Sokoban-levels voor Kisten.
//
//   node tools/generate-levels.mjs [seed] [seconden]
//
// Werkwijze: begin bij de opgeloste stand (kisten staan al op hun doelvak) en
// trek ze daar met de speler vandaan. Elke trek is de omkering van een duw,
// dus wat je overhoudt is per constructie oplosbaar — het onoplosbare gedoe
// van met de hand tekenen kan niet gebeuren. Trekken die een kist verder van
// zijn doel brengen krijgen voorrang, anders blijven de puzzels te makkelijk.
//
// Daarna rekent de oplosser het kortste aantal duwzetten uit. Dat getal is de
// moeilijkheidsgraad waarop de levels in games/kisten.js gesorteerd staan.
// De uitvoer is JSON op stdout; de levels zelf zet je met de hand in het spel.

import { makeWorld, floodFill, setBoxes, solve, toMoves } from './sokoban.mjs';

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const STEPS = (w) => [-w, w, -1, 1];

function connected(wall, w, h) {
  let start = -1, total = 0;
  for (let i = 0; i < wall.length; i++) if (!wall[i]) { total++; if (start < 0) start = i; }
  if (start < 0) return false;
  const seen = new Uint8Array(wall.length);
  const stack = [start];
  seen[start] = 1;
  let n = 1;
  while (stack.length) {
    const c = stack.pop();
    for (const d of STEPS(w)) {
      const k = c + d;
      if (k < 0 || k >= wall.length || wall[k] || seen[k]) continue;
      seen[k] = 1; n++; stack.push(k);
    }
  }
  return n === total;
}

// Rechthoekige kamer met een muurrand en wat losse muurtjes erin.
function makeGrid(rng, iw, ih, density) {
  const w = iw + 2, h = ih + 2;
  const wall = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) { wall[x] = 1; wall[(h - 1) * w + x] = 1; }
  for (let y = 0; y < h; y++) { wall[y * w] = 1; wall[y * w + w - 1] = 1; }

  const inner = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) inner.push(y * w + x);
  const blocks = Math.round(inner.length * density);
  for (let i = 0; i < blocks; i++) {
    const cell = inner[Math.floor(rng() * inner.length)];
    wall[cell] = 1;
    if (!connected(wall, w, h)) wall[cell] = 0;    // het veld mag niet opdelen
  }
  return { w, h, wall };
}

// Hoe ver staan de kisten van hun dichtstbijzijnde doelvak?
function spread(boxes, targets, w) {
  let sum = 0;
  for (const b of boxes) {
    const bx = b % w, by = (b - bx) / w;
    let best = Infinity;
    for (const t of targets) {
      const tx = t % w, ty = (t - tx) / w;
      best = Math.min(best, Math.abs(bx - tx) + Math.abs(by - ty));
    }
    sum += best;
  }
  return sum;
}

function scramble(rng, world, wall, w, floor, { boxCount, pulls, bias }) {
  const shuffled = [...floor].sort(() => rng() - 0.5);
  const targets = shuffled.slice(0, boxCount);
  let boxes = Int32Array.from(targets).sort();
  const free = floor.filter((c) => !targets.includes(c));
  let player = free[Math.floor(rng() * free.length)];
  let pulled = 0;

  for (let i = 0; i < pulls; i++) {
    setBoxes(world, boxes);
    floodFill(world, player);
    const mark = world.stamp;

    const options = [];
    for (let b = 0; b < boxes.length; b++) {
      const box = boxes[b];
      for (let k = 0; k < 4; k++) {
        const d = world.step[k];
        const behind = box + d;        // hier staat de speler om te trekken
        const step2 = box + 2 * d;     // hierheen stapt hij
        if (wall[behind] || world.occupied[behind]) continue;
        if (wall[step2] || world.occupied[step2]) continue;
        if (world.visit[behind] !== mark) continue;
        options.push({ box, behind, step2 });
      }
    }
    setBoxes(world, boxes, 0);
    if (!options.length) break;

    let pick;
    if (rng() < bias) {
      let best = -Infinity;
      for (const o of options) {
        const trial = [...boxes].filter((c) => c !== o.box).concat(o.behind);
        const s = spread(trial, targets, w) + rng() * 0.5;
        if (s > best) { best = s; pick = o; }
      }
    } else {
      pick = options[Math.floor(rng() * options.length)];
    }

    const out = new Int32Array(boxes.length);
    let n = 0;
    for (let j = 0; j < boxes.length; j++) if (boxes[j] !== pick.box) out[n++] = boxes[j];
    out[n] = pick.behind;
    boxes = out.sort();
    player = pick.step2;
    pulled++;
  }

  if (pulled < 2) return null;
  const tset = new Set(targets);
  for (const b of boxes) if (tset.has(b)) return null;   // niets staat al goed
  return { targets, boxes: [...boxes], player };
}

function toRows(wall, w, h, targets, boxes, player) {
  const t = new Set(targets), b = new Set(boxes);
  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (wall[i]) row += '#';
      else if (b.has(i)) row += t.has(i) ? '*' : '$';
      else if (i === player) row += t.has(i) ? '+' : '@';
      else row += t.has(i) ? '.' : ' ';
    }
    rows.push(row);
  }
  return trim(rows);
}

// Lege muurranden wegsnijden, zodat het veld strak in beeld past.
function trim(rows) {
  const rowUsed = (r) => /[^#]/.test(r);
  let top = 0, bot = rows.length - 1;
  while (top + 1 < bot && !rowUsed(rows[top + 1])) top++;
  while (bot - 1 > top && !rowUsed(rows[bot - 1])) bot--;
  const out = rows.slice(top, bot + 1);
  const colUsed = (c) => out.some((r) => r[c] && r[c] !== '#');
  let left = 0, right = out[0].length - 1;
  while (left + 1 < right && !colUsed(left + 1)) left++;
  while (right - 1 > left && !colUsed(right - 1)) right--;
  return out.map((r) => r.slice(left, right + 1));
}

// Van klein en rustig naar groot en zwaar. min is het aantal duwzetten dat
// een level minstens moet kosten om in die band mee te tellen.
const PRESETS = [
  { iw: 5, ih: 4, boxCount: 1, density: 0.04, pulls: 6,  bias: 0.9,  min: 2,  want: 5,  states: 40000 },
  { iw: 6, ih: 5, boxCount: 1, density: 0.10, pulls: 12, bias: 0.9,  min: 4,  want: 6,  states: 40000 },
  { iw: 6, ih: 5, boxCount: 2, density: 0.08, pulls: 14, bias: 0.8,  min: 5,  want: 8,  states: 60000 },
  { iw: 7, ih: 6, boxCount: 2, density: 0.12, pulls: 20, bias: 0.8,  min: 8,  want: 8,  states: 80000 },
  { iw: 7, ih: 6, boxCount: 3, density: 0.10, pulls: 24, bias: 0.8,  min: 10, want: 8,  states: 120000 },
  { iw: 7, ih: 7, boxCount: 3, density: 0.14, pulls: 30, bias: 0.8,  min: 12, want: 8,  states: 150000 },
  { iw: 8, ih: 7, boxCount: 3, density: 0.13, pulls: 36, bias: 0.85, min: 15, want: 8,  states: 200000 },
  { iw: 8, ih: 8, boxCount: 4, density: 0.15, pulls: 44, bias: 0.85, min: 18, want: 8,  states: 250000 },
  { iw: 9, ih: 8, boxCount: 4, density: 0.16, pulls: 52, bias: 0.9,  min: 20, want: 8,  states: 300000 },
  { iw: 9, ih: 9, boxCount: 5, density: 0.15, pulls: 60, bias: 0.9,  min: 22, want: 8,  states: 350000 },
];

const seed = Number(process.argv[2] || 777001);
const budgetMs = Number(process.argv[3] || 240) * 1000;
const rng = mulberry32(seed);
const found = [];
const seen = new Set();
const t00 = Date.now();

for (const preset of PRESETS) {
  let made = 0, tried = 0, tooEasy = 0, tooBig = 0;
  const t0 = Date.now();
  for (let t = 0; t < 400 && made < preset.want; t++) {
    if (Date.now() - t00 > budgetMs) break;
    tried++;
    const { w, h, wall } = makeGrid(rng, preset.iw, preset.ih, preset.density);
    const floor = [];
    for (let i = 0; i < wall.length; i++) if (!wall[i]) floor.push(i);
    if (floor.length < preset.boxCount + 8) continue;

    const world = makeWorld(wall, w, h);
    const cand = scramble(rng, world, wall, w, floor, preset);
    if (!cand) continue;

    const rows = toRows(wall, w, h, cand.targets, cand.boxes, cand.player);
    const sig = rows.join('/');
    if (seen.has(sig)) continue;

    const res = solve(world, cand.boxes, cand.player, cand.targets, { maxStates: preset.states });
    if (!res.ok) { if (res.reason === 'te groot') tooBig++; continue; }
    if (res.pushes < preset.min) { tooEasy++; continue; }
    const moves = toMoves(world, cand.boxes, cand.player, res.path);
    if (!moves) continue;

    seen.add(sig);
    found.push({ rows, pushes: res.pushes, moves: moves.length, boxes: preset.boxCount,
      w: rows[0].length, h: rows.length, solution: moves });
    made++;
  }
  process.stderr.write(`${preset.iw}x${preset.ih} met ${preset.boxCount} kist(en): `
    + `${made}/${preset.want} gevonden uit ${tried} pogingen `
    + `(${tooEasy} te makkelijk, ${tooBig} te zwaar om door te rekenen), `
    + `${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
}

found.sort((a, b) => a.pushes - b.pushes);
process.stderr.write(`\n${found.length} levels, ${found[0]?.pushes} tot `
  + `${found[found.length - 1]?.pushes} duwzetten, ${((Date.now() - t00) / 1000).toFixed(1)}s\n`);
console.log(JSON.stringify(found, null, 1));
