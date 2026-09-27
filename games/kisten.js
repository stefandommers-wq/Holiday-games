// Kisten (Sokoban). Duw elke kist op een doelvak. Je kunt alleen duwen, nooit
// trekken, dus vaak moet je omlopen om vanaf de andere kant te duwen.
//
// Levels staan als tekst in LEVELS en worden gecontroleerd door
// tools/check-levels.mjs: die lost ze op en faalt als er eentje vastloopt.
//
//   #  muur      .  doelvak      $  kist        *  kist op doelvak
//   @  speler    +  speler op doelvak    (spatie) vloer

import { createSurface, roundRect } from '../shared/surface.js';
import { createKeys } from '../shared/input.js';

export const LEVELS = [
  // 1 — recht vooruit duwen
  [
    '#######',
    '#     #',
    '# @$ .#',
    '#     #',
    '#######',
  ],
  // 2 — je staat aan de verkeerde kant, dus omlopen
  [
    '#######',
    '#     #',
    '#  $  #',
    '#  .  #',
    '#  @  #',
    '#     #',
    '#######',
  ],
  // 3 — twee kisten, allebei een kant op
  [
    '########',
    '#      #',
    '# .$ $.#',
    '#   @  #',
    '#      #',
    '########',
  ],
  // 4 — om het muurtje heen
  [
    '########',
    '#      #',
    '# #### #',
    '# #  . #',
    '# # $  #',
    '# #  @ #',
    '#   .$ #',
    '########',
  ],
  // 5 — de kist moet de kamer uit
  [
    '#########',
    '#       #',
    '# ##### #',
    '# #   # #',
    '# # $ # #',
    '# #   # #',
    '# #.### #',
    '#   @   #',
    '#########',
  ],
  // 6 — overhoeks
  [
    '##########',
    '#        #',
    '#  #     #',
    '#  $  .  #',
    '#  #     #',
    '#     #  #',
    '#  .  $  #',
    '#    @   #',
    '##########',
  ],
  // 7 — blok in het midden
  [
    '##########',
    '#        #',
    '# $    . #',
    '#   ##   #',
    '#   ##   #',
    '# .    $ #',
    '#   @    #',
    '##########',
  ],
  // 8 — kruispunt
  [
    '##########',
    '#        #',
    '# $ ## . #',
    '#        #',
    '## #  # ##',
    '#        #',
    '# . ## $ #',
    '#   @    #',
    '##########',
  ],
  // 9 — hoekenwerk
  [
    '##########',
    '#  .     #',
    '#  $  #  #',
    '#     #  #',
    '# #$# #. #',
    '# #      #',
    '#   @    #',
    '#. $     #',
    '##########',
  ],
  // 10 — het echte werk
  [
    '##########',
    '#        #',
    '# $ $ $  #',
    '#        #',
    '#  ####  #',
    '#        #',
    '# . . .  #',
    '#   @    #',
    '##########',
  ],
];

const COLORS = {
  floor: '#0d1120',
  wall: '#2f3a63',
  wallTop: 'rgba(255,255,255,.07)',
  target: '#ff8a3d',
  box: '#c98040',
  boxDone: '#45f08a',
  player: '#22e0ff',
};

const DIRS = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

let surface = null;
let keys = null;
let api = null;
let controlsEl = null;
let undoBtn = null;

let cell = 0;
let ox = 0;
let oy = 0;
let game = null;

/* ---------------- Level inlezen ---------------- */

export function parseLevel(rows) {
  const walls = new Set();
  const targets = new Set();
  const boxes = new Set();
  let player = { x: 0, y: 0 };
  const width = Math.max(...rows.map((r) => r.length));

  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const ch = row[x] || ' ';
      const key = `${x},${y}`;
      if (ch === '#') walls.add(key);
      if (ch === '.' || ch === '*' || ch === '+') targets.add(key);
      if (ch === '$' || ch === '*') boxes.add(key);
      if (ch === '@' || ch === '+') player = { x, y };
    }
  });

  return { width, height: rows.length, walls, targets, boxes, player };
}

function loadLevel(index) {
  const rows = LEVELS[index % LEVELS.length];
  const parsed = parseLevel(rows);
  return {
    level: index + 1,
    width: parsed.width,
    height: parsed.height,
    walls: parsed.walls,
    targets: parsed.targets,
    boxes: new Set(parsed.boxes),
    player: { ...parsed.player },
    moves: 0,
    pushes: 0,
    history: [],
    phase: 'play',     // play | solved | done
  };
}

/* ---------------- Spelen ---------------- */

function key(x, y) { return `${x},${y}`; }

function solved() {
  for (const b of game.boxes) {
    if (!game.targets.has(b)) return false;
  }
  return true;
}

function move(dir) {
  if (!game || game.phase !== 'play') return;
  const [dx, dy] = DIRS[dir];
  const nx = game.player.x + dx;
  const ny = game.player.y + dy;
  const next = key(nx, ny);

  if (game.walls.has(next)) return;

  let pushed = false;
  if (game.boxes.has(next)) {
    const beyond = key(nx + dx, ny + dy);
    if (game.walls.has(beyond) || game.boxes.has(beyond)) return;   // kist zit klem
    game.boxes.delete(next);
    game.boxes.add(beyond);
    pushed = true;
    game.pushes++;
  }

  game.player = { x: nx, y: ny };
  game.moves++;
  game.history.push([dx, dy, pushed ? 1 : 0]);
  api.audio.tone(pushed
    ? { freq: 220, dur: 0.06, type: 'square', gain: 0.35 }
    : { freq: 520, dur: 0.03, type: 'triangle', gain: 0.18 });

  updateHud();
  syncButtons();

  if (solved()) {
    game.phase = 'solved';
    api.audio.levelUp();
    api.submitProgress(game.level + 1);
    api.save();
    syncButtons();
    scheduleNext(1100);
  }
  draw();
}

function undo() {
  if (!game || game.phase !== 'play' || game.history.length === 0) return;
  const [dx, dy, pushed] = game.history.pop();
  const px = game.player.x;
  const py = game.player.y;

  if (pushed) {
    // De kist stond vóór ons en schoof mee: zet hem terug op onze plek.
    const boxNow = key(px + dx, py + dy);
    game.boxes.delete(boxNow);
    game.boxes.add(key(px, py));
    game.pushes--;
  }
  game.player = { x: px - dx, y: py - dy };
  game.moves--;
  api.audio.tone({ freq: 300, dur: 0.05, type: 'sine', gain: 0.25 });
  updateHud();
  syncButtons();
  draw();
}

function restartLevel() {
  if (!game) return;
  const level = game.level;
  game = loadLevel(level - 1);
  layout();
  updateHud();
  syncButtons();
  draw();
  api.save();
}

function nextLevel() {
  const next = game.level;          // 0-gebaseerde index van het volgende level
  if (next >= LEVELS.length) {
    game.phase = 'done';
    showFinale();
    return;
  }
  game = loadLevel(next);
  layout();
  updateHud();
  syncButtons();
  draw();
  api.save();
}

async function showFinale() {
  const choice = await api.dialog({
    title: 'Alles uitgespeeld',
    accent: '#ff8a3d',
    html: `<p>Alle ${LEVELS.length} levels opgelost. Sterk werk.</p>`,
    buttons: [
      { label: 'Opnieuw vanaf level 1', value: 'again' },
      { label: 'Terug naar menu', value: 'menu', variant: 'secondary' },
    ],
  });
  if (!game) return;
  if (choice === 'menu') {
    api.exit();
  } else {
    game = loadLevel(0);
    layout();
    updateHud();
    syncButtons();
    draw();
  }
}

function updateHud() {
  const onTarget = [...game.boxes].filter((b) => game.targets.has(b)).length;
  api.setHud([
    { label: 'Level', value: `${game.level}/${LEVELS.length}` },
    { label: 'Kisten', value: `${onTarget}/${game.boxes.size}` },
    { label: 'Zetten', value: game.moves },
  ]);
}

function syncButtons() {
  if (!undoBtn) return;
  const can = game && game.phase === 'play' && game.history.length > 0;
  undoBtn.disabled = !can;
}

/* ---------------- Tekenen ---------------- */

function layout() {
  if (!surface || !game) return;
  const { width, height } = surface;
  cell = Math.max(6, Math.floor(Math.min(width / game.width, height / game.height)));
  ox = Math.round((width - cell * game.width) / 2);
  oy = Math.round((height - cell * game.height) / 2);
}

function draw() {
  if (!surface || !game) return;
  const { ctx, width, height } = surface;

  ctx.fillStyle = '#05060d';
  ctx.fillRect(0, 0, width, height);

  // Vloer en muren
  for (let y = 0; y < game.height; y++) {
    for (let x = 0; x < game.width; x++) {
      const px = ox + x * cell;
      const py = oy + y * cell;
      if (game.walls.has(key(x, y))) {
        ctx.fillStyle = COLORS.wall;
        roundRect(ctx, px + 1, py + 1, cell - 2, cell - 2, 3);
        ctx.fill();
        ctx.fillStyle = COLORS.wallTop;
        ctx.fillRect(px + 3, py + 3, cell - 6, 2);
      } else {
        ctx.fillStyle = COLORS.floor;
        ctx.fillRect(px, py, cell, cell);
      }
    }
  }

  // Doelvakken
  for (const t of game.targets) {
    const [x, y] = t.split(',').map(Number);
    const cx = ox + x * cell + cell / 2;
    const cy = oy + y * cell + cell / 2;
    const r = cell * 0.17;
    ctx.strokeStyle = COLORS.target;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.stroke();
  }

  // Kisten
  for (const b of game.boxes) {
    const [x, y] = b.split(',').map(Number);
    const px = ox + x * cell;
    const py = oy + y * cell;
    const done = game.targets.has(b);
    const inset = cell * 0.12;
    ctx.fillStyle = done ? COLORS.boxDone : COLORS.box;
    roundRect(ctx, px + inset, py + inset, cell - inset * 2, cell - inset * 2, 4);
    ctx.fill();
    // Kruislatten
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = Math.max(1, cell * 0.05);
    ctx.beginPath();
    ctx.moveTo(px + inset, py + inset);
    ctx.lineTo(px + cell - inset, py + cell - inset);
    ctx.moveTo(px + cell - inset, py + inset);
    ctx.lineTo(px + inset, py + cell - inset);
    ctx.stroke();
  }

  // Speler
  const cx = ox + game.player.x * cell + cell / 2;
  const cy = oy + game.player.y * cell + cell / 2;
  ctx.fillStyle = COLORS.player;
  ctx.beginPath();
  ctx.arc(cx, cy, cell * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#05060d';
  const eye = Math.max(1, cell * 0.05);
  ctx.beginPath();
  ctx.arc(cx - cell * 0.1, cy - cell * 0.05, eye, 0, Math.PI * 2);
  ctx.arc(cx + cell * 0.1, cy - cell * 0.05, eye, 0, Math.PI * 2);
  ctx.fill();

  if (game.phase === 'solved') {
    ctx.fillStyle = 'rgba(5, 6, 13, .78)';
    ctx.fillRect(0, height / 2 - 52, width, 104);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.boxDone;
    ctx.font = '800 24px -apple-system, system-ui, sans-serif';
    ctx.fillText('OPGELOST!', width / 2, height / 2 + 2);
    ctx.fillStyle = '#8b96bd';
    ctx.font = '400 13px -apple-system, system-ui, sans-serif';
    ctx.fillText(`${game.moves} zetten, ${game.pushes} keer geduwd`, width / 2, height / 2 + 28);
  }
}

/* ---------------- Knoppen ---------------- */

function buildControls() {
  const wrap = document.createElement('div');
  wrap.className = 'pad-column';

  const actions = document.createElement('div');
  actions.className = 'pad-actions';

  undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.className = 'pad-action';
  undoBtn.textContent = '↶ Ongedaan';
  undoBtn.addEventListener('click', undo);

  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'pad-action';
  again.textContent = '↻ Level opnieuw';
  again.addEventListener('click', restartLevel);

  actions.append(undoBtn, again);
  wrap.appendChild(actions);

  // Het D-pad is hier de enige manier om te lopen, dus het staat er altijd.
  // Swipen zou te grof zijn: in een puzzel wil je precies één vakje per zet.
  const dpad = document.createElement('div');
  dpad.className = 'dpad';
  for (const [dir, label, cls] of [
    ['up', '▲', 'up'],
    ['left', '◀', 'left'],
    ['down', '▼', 'down'],
    ['right', '▶', 'right'],
  ]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = label;
    b.setAttribute('aria-label', dir);
    b.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      move(dir);
    });
    dpad.appendChild(b);
  }
  wrap.appendChild(dpad);
  return wrap;
}

/* ---------------- Module-interface ---------------- */

export function start(canvasEl, gameApi) {
  api = gameApi;

  controlsEl = buildControls();
  api.setControls(controlsEl);

  surface = createSurface(canvasEl, () => { layout(); draw(); });
  game = loadLevel(Math.max(0, Math.min(LEVELS.length - 1, api.getProgress() - 1)));
  layout();

  // Bewust geen swipes: één veeg vuurt onderweg meerdere keren, en dan schiet
  // je zo drie vakjes door. Lopen gaat alleen met de pijltjes.
  keys = createKeys({
    ArrowUp: () => move('up'),
    ArrowDown: () => move('down'),
    ArrowLeft: () => move('left'),
    ArrowRight: () => move('right'),
    z: () => undo(),
    r: () => restartLevel(),
  });

  updateHud();
  syncButtons();
  draw();
}

// Geen gameloop: in een puzzel beweegt niets vanzelf, dus er valt ook niets
// te animeren. Alleen na het oplossen wacht het spel even voor het volgende
// level, en dat is één timer.
let solvedTimer = 0;

function scheduleNext(delayMs) {
  clearTimeout(solvedTimer);
  solvedTimer = setTimeout(() => {
    solvedTimer = 0;
    if (game && game.phase === 'solved') nextLevel();
  }, delayMs);
}

export function stop() {
  clearTimeout(solvedTimer);
  solvedTimer = 0;
  keys?.destroy();
  surface?.destroy();
  api?.setControls(null);
  keys = null;
  surface = null;
  controlsEl = null;
  undoBtn = null;
  game = null;
}

// Er draait geen loop, dus pauzeren en hervatten hoeven niets te doen.
export function pause() {}
export function resume() {}

export function serialize() {
  if (!game || game.phase === 'done') return null;
  if (game.level === 1 && game.moves === 0) return null;
  return {
    v: 1,
    level: game.level,
    boxes: [...game.boxes],
    player: [game.player.x, game.player.y],
    moves: game.moves,
    pushes: game.pushes,
    history: game.history.slice(-200),
  };
}

export function restore(state) {
  if (!state || state.v !== 1 || !Array.isArray(state.boxes)) return;
  const index = Math.max(0, Math.min(LEVELS.length - 1, (state.level || 1) - 1));
  game = loadLevel(index);
  game.boxes = new Set(state.boxes);
  game.player = { x: state.player[0], y: state.player[1] };
  game.moves = state.moves || 0;
  game.pushes = state.pushes || 0;
  game.history = Array.isArray(state.history) ? state.history : [];
  layout();
  updateHud();
  syncButtons();
  draw();
}
