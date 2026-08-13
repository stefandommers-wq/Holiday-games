// Blokken: vallende vormen op een veld van 10 bij 20.
// Swipe links of rechts om te schuiven, tik om te draaien, swipe omlaag om
// het blok meteen te laten vallen. Volle rijen verdwijnen en leveren punten
// op. Elke tien rijen gaat het een niveau sneller.

import { createSurface, roundRect } from '../shared/surface.js';
import { createLoop } from '../shared/loop.js';
import { createInput, createKeys } from '../shared/input.js';

const COLS = 10;
const ROWS = 20;
const LOCK_DELAY = 0.25;
const LINES_PER_LEVEL = 10;

// Elke vorm als lijst van rotaties; per rotatie de bezette cellen in een 4x4.
const SHAPES = {
  I: { color: '#22e0ff', cells: [[[0, 1], [1, 1], [2, 1], [3, 1]], [[2, 0], [2, 1], [2, 2], [2, 3]], [[0, 2], [1, 2], [2, 2], [3, 2]], [[1, 0], [1, 1], [1, 2], [1, 3]]] },
  O: { color: '#ffd23d', cells: [[[1, 0], [2, 0], [1, 1], [2, 1]]] },
  T: { color: '#a06bff', cells: [[[1, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [1, 1], [2, 1], [1, 2]], [[0, 1], [1, 1], [2, 1], [1, 2]], [[1, 0], [0, 1], [1, 1], [1, 2]]] },
  S: { color: '#45f08a', cells: [[[1, 0], [2, 0], [0, 1], [1, 1]], [[1, 0], [1, 1], [2, 1], [2, 2]], [[1, 1], [2, 1], [0, 2], [1, 2]], [[0, 0], [0, 1], [1, 1], [1, 2]]] },
  Z: { color: '#ff5a5a', cells: [[[0, 0], [1, 0], [1, 1], [2, 1]], [[2, 0], [1, 1], [2, 1], [1, 2]], [[0, 1], [1, 1], [1, 2], [2, 2]], [[1, 0], [0, 1], [1, 1], [0, 2]]] },
  J: { color: '#5b7cff', cells: [[[0, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [2, 0], [1, 1], [1, 2]], [[0, 1], [1, 1], [2, 1], [2, 2]], [[1, 0], [1, 1], [0, 2], [1, 2]]] },
  L: { color: '#ff8a3d', cells: [[[2, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [1, 1], [1, 2], [2, 2]], [[0, 1], [1, 1], [2, 1], [0, 2]], [[0, 0], [1, 0], [1, 1], [1, 2]]] },
};
const TYPES = Object.keys(SHAPES);
const KICKS = [0, -1, 1, -2, 2];

let surface = null;
let loop = null;
let input = null;
let keys = null;
let api = null;

let cell = 0;
let ox = 0;
let oy = 0;
let previewH = 0;
let game = null;

/* ---------------- Staat ---------------- */

function emptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function newBag() {
  const bag = [...TYPES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

function newGame() {
  const g = {
    grid: emptyGrid(),
    bag: newBag(),
    piece: null,
    next: null,
    score: 0,
    lines: 0,
    level: 1,
    fall: 0,
    lock: 0,
    phase: 'play',    // play | clearing | over
    clearRows: [],
    clearTimer: 0,
  };
  return g;
}

function takeFromBag() {
  if (game.bag.length === 0) game.bag = newBag();
  return game.bag.pop();
}

function spawn(type) {
  return { type, rot: 0, x: 3, y: -1 };
}

function cellsOf(piece) {
  const shape = SHAPES[piece.type];
  const rot = shape.cells[piece.rot % shape.cells.length];
  return rot.map(([cx, cy]) => [piece.x + cx, piece.y + cy]);
}

function fits(piece) {
  for (const [x, y] of cellsOf(piece)) {
    if (x < 0 || x >= COLS || y >= ROWS) return false;
    if (y >= 0 && game.grid[y][x]) return false;
  }
  return true;
}

function nextPiece() {
  game.piece = game.next ? game.next : spawn(takeFromBag());
  game.next = spawn(takeFromBag());
  game.fall = 0;
  game.lock = 0;
  if (!fits(game.piece)) {
    game.phase = 'over';
    game.clearTimer = 0.6;
  }
}

function fallInterval() {
  return Math.max(0.07, 0.80 * Math.pow(0.85, game.level - 1));
}

function move(dx) {
  if (game.phase !== 'play' || !game.piece) return false;
  const test = { ...game.piece, x: game.piece.x + dx };
  if (fits(test)) {
    game.piece = test;
    game.lock = 0;
    api.audio.blip();
    return true;
  }
  return false;
}

function rotate() {
  if (game.phase !== 'play' || !game.piece) return;
  const shape = SHAPES[game.piece.type];
  if (shape.cells.length === 1) return;
  const rot = (game.piece.rot + 1) % shape.cells.length;
  for (const kick of KICKS) {
    const test = { ...game.piece, rot, x: game.piece.x + kick };
    if (fits(test)) {
      game.piece = test;
      game.lock = 0;
      api.audio.blip();
      return;
    }
  }
}

function softDrop() {
  if (game.phase !== 'play' || !game.piece) return;
  const test = { ...game.piece, y: game.piece.y + 1 };
  if (fits(test)) {
    game.piece = test;
    game.score += 1;
    game.fall = 0;
  }
}

function hardDrop() {
  if (game.phase !== 'play' || !game.piece) return;
  let dropped = 0;
  while (fits({ ...game.piece, y: game.piece.y + 1 })) {
    game.piece = { ...game.piece, y: game.piece.y + 1 };
    dropped++;
  }
  game.score += dropped * 2;
  api.audio.hit();
  lockPiece();
}

function lockPiece() {
  for (const [x, y] of cellsOf(game.piece)) {
    if (y < 0) {                      // vastgelopen boven de rand
      game.phase = 'over';
      game.clearTimer = 0.6;
      return;
    }
    game.grid[y][x] = SHAPES[game.piece.type].color;
  }
  game.piece = null;

  const full = [];
  for (let y = 0; y < ROWS; y++) {
    if (game.grid[y].every((c) => c !== null)) full.push(y);
  }

  if (full.length) {
    game.clearRows = full;
    game.clearTimer = 0.22;
    game.phase = 'clearing';
    api.audio.pickup();
  } else {
    nextPiece();
    api.save();
  }
  updateHud();
}

function finishClear() {
  const scores = [0, 100, 300, 500, 800];
  game.score += (scores[game.clearRows.length] || 800) * game.level;
  game.lines += game.clearRows.length;

  for (const y of game.clearRows.sort((a, b) => a - b)) {
    game.grid.splice(y, 1);
    game.grid.unshift(Array(COLS).fill(null));
  }
  game.clearRows = [];

  const level = Math.floor(game.lines / LINES_PER_LEVEL) + 1;
  if (level !== game.level) {
    game.level = level;
    api.submitProgress(level);
    api.audio.levelUp();
  }
  game.phase = 'play';
  nextPiece();
  updateHud();
  api.save();
}

function updateHud() {
  api.setHud([
    { label: 'Score', value: game.score },
    { label: 'Rijen', value: game.lines },
    { label: 'Niveau', value: game.level },
  ]);
}

/* ---------------- Tekenen ---------------- */

function layout() {
  const { width, height } = surface;
  previewH = Math.round(Math.min(76, height * 0.11));
  cell = Math.max(4, Math.floor(Math.min(width / COLS, (height - previewH - 8) / ROWS)));
  ox = Math.round((width - cell * COLS) / 2);
  oy = previewH + Math.round((height - previewH - cell * ROWS) / 2);
}

function drawCell(ctx, x, y, color, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  roundRect(ctx, x + 1, y + 1, cell - 2, cell - 2, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  ctx.fillRect(x + 3, y + 3, cell - 6, 2);
  ctx.globalAlpha = 1;
}

function draw() {
  if (!surface || !game) return;
  const { ctx, width, height } = surface;

  ctx.fillStyle = '#05060d';
  ctx.fillRect(0, 0, width, height);

  // Volgend blok
  ctx.textAlign = 'left';
  ctx.fillStyle = '#8b96bd';
  ctx.font = '600 11px -apple-system, system-ui, sans-serif';
  ctx.fillText('VOLGENDE', ox, 20);
  if (game.next) {
    const small = Math.max(6, Math.floor(cell * 0.55));
    const shape = SHAPES[game.next.type];
    const cells = shape.cells[0];
    const minX = Math.min(...cells.map((c) => c[0]));
    const minY = Math.min(...cells.map((c) => c[1]));
    for (const [cx, cy] of cells) {
      ctx.fillStyle = shape.color;
      roundRect(ctx, ox + (cx - minX) * small + 1, 28 + (cy - minY) * small + 1, small - 2, small - 2, 2);
      ctx.fill();
    }
  }

  // Speelveld
  ctx.fillStyle = '#080b16';
  ctx.fillRect(ox, oy, cell * COLS, cell * ROWS);
  ctx.strokeStyle = 'rgba(42, 51, 88, .55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(ox + .5, oy + .5, cell * COLS - 1, cell * ROWS - 1);
  ctx.fillStyle = 'rgba(42, 51, 88, .3)';
  for (let y = 1; y < ROWS; y++) {
    for (let x = 1; x < COLS; x++) ctx.fillRect(ox + x * cell - 1, oy + y * cell - 1, 2, 2);
  }

  // Vastliggende blokken
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const color = game.grid[y][x];
      if (!color) continue;
      const flashing = game.phase === 'clearing' && game.clearRows.includes(y);
      drawCell(ctx, ox + x * cell, oy + y * cell, flashing ? '#ffffff' : color);
    }
  }

  if (game.piece && game.phase === 'play') {
    // Schaduw van waar het blok landt
    let ghost = { ...game.piece };
    while (fits({ ...ghost, y: ghost.y + 1 })) ghost = { ...ghost, y: ghost.y + 1 };
    for (const [x, y] of cellsOf(ghost)) {
      if (y < 0) continue;
      drawCell(ctx, ox + x * cell, oy + y * cell, SHAPES[game.piece.type].color, 0.18);
    }
    for (const [x, y] of cellsOf(game.piece)) {
      if (y < 0) continue;
      drawCell(ctx, ox + x * cell, oy + y * cell, SHAPES[game.piece.type].color);
    }
  }

  if (game.phase === 'over') {
    ctx.fillStyle = 'rgba(5, 6, 13, .7)';
    ctx.fillRect(ox, oy, cell * COLS, cell * ROWS);
  }
}

/* ---------------- Module-interface ---------------- */

export function start(canvasEl, gameApi) {
  api = gameApi;
  game = newGame();
  nextPiece();

  surface = createSurface(canvasEl, () => { layout(); draw(); });
  layout();

  // Een veeg vuurt onderweg meerdere keren, zodat je in één beweging meerdere
  // hokjes opschuift. Voor het laten vallen wil je dat juist niet: hooguit
  // één blok per veeg.
  let droppedThisSwipe = false;
  input = createInput(canvasEl, {
    onDragStart: () => { droppedThisSwipe = false; },
    onSwipe: (dir) => {
      if (dir === 'left') move(-1);
      else if (dir === 'right') move(1);
      else if (dir === 'down') {
        if (droppedThisSwipe) return;
        droppedThisSwipe = true;
        hardDrop();
      }
      // omhoog doet niets: te makkelijk per ongeluk
    },
    onTap: () => rotate(),
  });
  keys = createKeys({
    ArrowLeft: () => move(-1),
    ArrowRight: () => move(1),
    ArrowDown: () => softDrop(),
    ArrowUp: () => rotate(),
    ' ': () => hardDrop(),
  });

  updateHud();

  loop = createLoop({
    update(dt) {
      if (!game) return;

      if (game.phase === 'clearing') {
        game.clearTimer -= dt;
        if (game.clearTimer <= 0) finishClear();
        return;
      }
      if (game.phase === 'over') {
        game.clearTimer -= dt;
        if (game.clearTimer <= 0) {
          const { score, level } = game;
          loop.stop();
          api.gameOver({ score, level, stats: [{ label: 'Rijen', value: game.lines }] });
        }
        return;
      }
      if (!game.piece) return;

      game.fall += dt;
      if (game.fall >= fallInterval()) {
        game.fall = 0;
        const test = { ...game.piece, y: game.piece.y + 1 };
        if (fits(test)) {
          game.piece = test;
          game.lock = 0;
        } else {
          game.lock += fallInterval();
          if (game.lock >= LOCK_DELAY) lockPiece();
        }
      }
    },
    render: draw,
  });
  loop.start();
  draw();
}

export function stop() {
  loop?.stop();
  input?.destroy();
  keys?.destroy();
  surface?.destroy();
  loop = null;
  input = null;
  keys = null;
  surface = null;
  game = null;
}

export function pause() { loop?.stop(); }
export function resume() { loop?.start(); }

export function serialize() {
  if (!game || game.phase === 'over') return null;
  if (game.score === 0 && game.lines === 0 && game.grid.every((row) => row.every((c) => !c))) return null;
  return {
    v: 1,
    grid: game.grid.map((row) => row.map((c) => c || 0)),
    piece: game.piece,
    next: game.next,
    bag: game.bag,
    score: game.score,
    lines: game.lines,
    level: game.level,
  };
}

export function restore(state) {
  if (!state || state.v !== 1 || !Array.isArray(state.grid)) return;
  game.grid = state.grid.map((row) => row.map((c) => (c === 0 ? null : c)));
  game.piece = state.piece || null;
  game.next = state.next || spawn(takeFromBag());
  game.bag = Array.isArray(state.bag) && state.bag.length ? state.bag : newBag();
  game.score = state.score || 0;
  game.lines = state.lines || 0;
  game.level = state.level || 1;
  game.fall = 0;
  game.lock = 0;
  game.phase = 'play';
  if (!game.piece) nextPiece();
  updateHud();
  draw();
}
