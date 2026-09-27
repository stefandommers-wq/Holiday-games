// Sokoban-kern voor het ontwikkelgereedschap: oplossen en naspelen.
// Alles op typed arrays, want de oplosser moet honderdduizenden standen aan.
// Niet onderdeel van de app; staat niet in de precache-lijst.

export const UP = 0, DOWN = 1, LEFT = 2, RIGHT = 3;
export const DIRCH = ['u', 'd', 'l', 'r'];

export function makeWorld(wall, w, h) {
  const step = [-w, w, -1, 1];
  return {
    wall, w, h, step,
    size: wall.length,
    visit: new Int32Array(wall.length),   // versiestempel
    stamp: 0,
    stack: new Int32Array(wall.length),
    occupied: new Uint8Array(wall.length),
  };
}

// Vult occupied met de kisten. Geeft de kleinste bereikbare cel terug en
// vult desgewenst de bereikbaarheid in world.visit met de huidige stempel.
export function floodFill(world, from) {
  const { wall, occupied, visit, stack, step } = world;
  const mark = ++world.stamp;
  let top = 0;
  stack[top++] = from;
  visit[from] = mark;
  let min = from;
  while (top) {
    const c = stack[--top];
    for (let i = 0; i < 4; i++) {
      const k = c + step[i];
      if (wall[k] || occupied[k] || visit[k] === mark) continue;
      visit[k] = mark;
      if (k < min) min = k;
      stack[top++] = k;
    }
  }
  return min;
}

export function setBoxes(world, boxes, value = 1) {
  for (let i = 0; i < boxes.length; i++) world.occupied[boxes[i]] = value;
}

export function keyOf(boxes, player) {
  // boxes is gesorteerd
  let s = '';
  for (let i = 0; i < boxes.length; i++) s += boxes[i] + ',';
  return s + '|' + player;
}

export function sortedWith(boxes, from, to) {
  const out = new Int32Array(boxes.length);
  let n = 0;
  for (let i = 0; i < boxes.length; i++) if (boxes[i] !== from) out[n++] = boxes[i];
  out[n] = to;
  return Int32Array.from(out).sort();
}

// Push-optimale breedte-eerst zoektocht.
export function solve(world, boxes0, player0, targets, { maxStates = 60000 } = {}) {
  const goal = new Uint8Array(world.size);
  for (const t of targets) goal[t] = 1;
  const isDone = (boxes) => { for (let i = 0; i < boxes.length; i++) if (!goal[boxes[i]]) return false; return true; };

  const start = Int32Array.from(boxes0).sort();
  if (isDone(start)) return { ok: false, reason: 'begint opgelost' };

  setBoxes(world, start);
  const startPlayer = floodFill(world, player0);
  setBoxes(world, start, 0);

  const startKey = keyOf(start, startPlayer);
  const prev = new Map([[startKey, null]]);
  let frontier = [{ boxes: start, player: startPlayer, key: startKey }];
  let states = 1;
  let pushes = 0;

  while (frontier.length) {
    pushes++;
    const next = [];
    for (const state of frontier) {
      setBoxes(world, state.boxes);
      floodFill(world, state.player);
      const mark = world.stamp;

      // Eerst alle geldige duwzetten verzamelen: een volgende flood fill
      // overschrijft de stempels van deze stand.
      const options = [];
      for (let b = 0; b < state.boxes.length; b++) {
        const box = state.boxes[b];
        for (let i = 0; i < 4; i++) {
          const d = world.step[i];
          const stand = box - d;
          const dest = box + d;
          if (world.visit[stand] !== mark) continue;
          if (world.wall[dest] || world.occupied[dest]) continue;
          options.push({ box, i, stand, dest });
        }
      }

      for (const opt of options) {
        const { box, i, stand, dest } = opt;
        world.occupied[box] = 0; world.occupied[dest] = 1;
        const player = floodFill(world, box);
        world.occupied[dest] = 0; world.occupied[box] = 1;

        const boxes = sortedWith(state.boxes, box, dest);
        const key = keyOf(boxes, player);
        if (prev.has(key)) continue;
        prev.set(key, { from: state.key, box, dir: i, stand, dest });
        states++;
        if (states > maxStates) { setBoxes(world, state.boxes, 0); return { ok: false, reason: 'te groot', states }; }
        if (isDone(boxes)) {
          setBoxes(world, state.boxes, 0);
          return { ok: true, pushes, states, path: rebuild(prev, key) };
        }
        next.push({ boxes, player, key });
      }
      setBoxes(world, state.boxes, 0);
    }
    frontier = next;
  }
  return { ok: false, reason: 'onoplosbaar', states };
}

function rebuild(prev, key) {
  const out = [];
  let cur = key;
  while (prev.get(cur)) { out.push(prev.get(cur)); cur = prev.get(cur).from; }
  return out.reverse();
}

// Kortste looppad tussen twee cellen, met de kisten als obstakel.
export function walkPath(world, boxes, from, to) {
  if (from === to) return [];
  setBoxes(world, boxes);
  const { wall, occupied, step } = world;
  const prev = new Int32Array(world.size).fill(-1);
  const dirOf = new Int8Array(world.size).fill(-1);
  const queue = new Int32Array(world.size);
  let head = 0, tail = 0;
  queue[tail++] = from;
  prev[from] = from;
  let found = false;
  while (head < tail && !found) {
    const c = queue[head++];
    for (let i = 0; i < 4; i++) {
      const k = c + step[i];
      if (wall[k] || occupied[k] || prev[k] !== -1) continue;
      prev[k] = c; dirOf[k] = i;
      if (k === to) { found = true; break; }
      queue[tail++] = k;
    }
  }
  setBoxes(world, boxes, 0);
  if (!found) return null;
  const out = [];
  let cur = to;
  while (cur !== from) { out.push(dirOf[cur]); cur = prev[cur]; }
  return out.reverse();
}

export function toMoves(world, boxes0, player0, path) {
  let boxes = Int32Array.from(boxes0).sort();
  let player = player0;
  const moves = [];
  for (const s of path) {
    const walk = walkPath(world, boxes, player, s.stand);
    if (walk === null) return null;
    for (const i of walk) moves.push(DIRCH[i]);
    moves.push(DIRCH[s.dir]);
    boxes = sortedWith(boxes, s.box, s.dest);
    player = s.box;
  }
  return moves.join('');
}

// Leest een level uit de tekstvorm die games/kisten.js gebruikt.
export function parseRows(rows) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const wall = new Uint8Array(w * h);
  const boxes = [], targets = [];
  let player = -1;
  let players = 0;
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const c = row[x] || ' ';
      const i = y * w + x;
      if (c === '#') wall[i] = 1;
      if (c === '.' || c === '*' || c === '+') targets.push(i);
      if (c === '$' || c === '*') boxes.push(i);
      if (c === '@' || c === '+') { player = i; players++; }
    }
  });
  return { wall, w, h, boxes, targets, player, players };
}

// Speelt een reeks zetten na en zegt of het level daarmee opgelost raakt.
export function replay(level, moves) {
  const { wall, w } = level;
  const step = { u: -w, d: w, l: -1, r: 1 };
  const boxes = new Set(level.boxes);
  const targets = new Set(level.targets);
  let player = level.player;
  let pushes = 0;

  for (const ch of moves) {
    const d = step[ch];
    if (d === undefined) return { ok: false, reason: `onbekende zet '${ch}'` };
    const next = player + d;
    if (wall[next]) return { ok: false, reason: 'loopt tegen een muur' };
    if (boxes.has(next)) {
      const beyond = next + d;
      if (wall[beyond] || boxes.has(beyond)) return { ok: false, reason: 'duwt een kist klem' };
      boxes.delete(next);
      boxes.add(beyond);
      pushes++;
    }
    player = next;
  }
  for (const b of boxes) if (!targets.has(b)) return { ok: false, reason: 'niet alle kisten staan goed' };
  return { ok: true, pushes };
}
