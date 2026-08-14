// Snake. Rasterspel van 15 hokjes breed; het aantal rijen volgt bij een nieuw
// potje uit de vorm van het speelveld, zodat het beeld gevuld is met of zonder
// D-pad. Het aantal rijen gaat mee in een bewaard potje, dus draaien of het
// D-pad aanzetten verpest een lopend spel niet.
// Besturing: swipen over het hele speelveld, plus een optioneel D-pad.

import { createSurface, roundRect } from '../shared/surface.js';
import { createLoop } from '../shared/loop.js';
import { createInput, createKeys } from '../shared/input.js';

const COLS = 15;
const MIN_ROWS = 12;
const MAX_ROWS = 26;
const DEFAULT_ROWS = 20;
const APPLES_PER_LEVEL = 5;
const OBSTACLE_LEVEL = 4;      // vanaf dit level komen er vaste obstakels
const BASE_INTERVAL = 0.20;    // seconden per stap in level 1
const MIN_INTERVAL = 0.07;

const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

let surface = null;
let loop = null;
let input = null;
let keys = null;
let api = null;
let dpadEl = null;

let cell = 0;
let ox = 0;
let oy = 0;

let game = null;

/* ---------------- Spelstaat ---------------- */

// Zoveel rijen als er netjes in het speelveld passen, met vierkante hokjes.
function rowsForSurface() {
  if (!surface || surface.width <= 0) return DEFAULT_ROWS;
  const wanted = Math.round(COLS * (surface.height / surface.width));
  return Math.max(MIN_ROWS, Math.min(MAX_ROWS, wanted));
}

function newGame(rows = DEFAULT_ROWS) {
  const startY = Math.round(rows * 0.62);
  const snake = [
    { x: 7, y: startY },
    { x: 7, y: startY + 1 },
    { x: 7, y: startY + 2 },
  ];
  return {
    rows,
    snake,
    dir: 'up',
    queued: [],
    apple: { x: 7, y: Math.round(rows * 0.3) },
    apples: 0,
    score: 0,
    level: 1,
    obstacles: [],
    timer: 0,
    phase: 'ready',   // ready -> playing -> dying
    dieTimer: 0,
    flash: 0,
  };
}

function interval() {
  return Math.max(MIN_INTERVAL, BASE_INTERVAL - (game.level - 1) * 0.012);
}

function occupied(x, y, ignoreTail = false) {
  const body = ignoreTail ? game.snake.slice(0, -1) : game.snake;
  return body.some((s) => s.x === x && s.y === y)
    || game.obstacles.some((o) => o.x === x && o.y === y);
}

function placeApple() {
  const free = [];
  for (let y = 0; y < game.rows; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!occupied(x, y)) free.push({ x, y });
    }
  }
  if (free.length === 0) return;
  game.apple = free[Math.floor(Math.random() * free.length)];
}

// Obstakels: korte muurtjes, nooit vlak voor de kop en nooit tegen de rand.
function buildObstacles(level) {
  const walls = [];
  const count = Math.min(7, level - OBSTACLE_LEVEL + 2);
  const head = game.snake[0];
  let guard = 0;

  while (walls.length < count && guard++ < 300) {
    const horizontal = Math.random() < 0.5;
    const len = 2 + Math.floor(Math.random() * 2);
    const x = 1 + Math.floor(Math.random() * (COLS - 2 - (horizontal ? len : 0)));
    const y = 3 + Math.floor(Math.random() * Math.max(1, game.rows - 6 - (horizontal ? 0 : len)));

    const cells = [];
    for (let i = 0; i < len; i++) {
      cells.push({ x: horizontal ? x + i : x, y: horizontal ? y : y + i });
    }

    const clash = cells.some((c) => (
      game.snake.some((s) => Math.abs(s.x - c.x) <= 1 && Math.abs(s.y - c.y) <= 1)
      || Math.abs(c.x - head.x) <= 2 && Math.abs(c.y - head.y) <= 3
      || walls.some((w) => w.some((wc) => Math.abs(wc.x - c.x) <= 1 && Math.abs(wc.y - c.y) <= 1))
    ));
    if (!clash) walls.push(cells);
  }
  return walls.flat();
}

function setLevel(level) {
  game.level = level;
  if (level >= OBSTACLE_LEVEL) {
    game.obstacles = buildObstacles(level);
    // Appel kan onder een nieuw muurtje liggen.
    if (game.obstacles.some((o) => o.x === game.apple.x && o.y === game.apple.y)) placeApple();
  }
  api.audio.levelUp();
  game.flash = 0.4;
  api.submitProgress(level);
  api.save();
}

function turn(dir) {
  if (!game || game.phase === 'dying') return;
  if (game.phase === 'ready') {
    game.phase = 'playing';
  }
  // Nooit meteen omkeren; hooguit twee draaien in de rij onthouden.
  const last = game.queued.length ? game.queued[game.queued.length - 1] : game.dir;
  if (DIRS[dir].x === -DIRS[last].x && DIRS[dir].y === -DIRS[last].y) return;
  if (dir === last) return;
  if (game.queued.length < 2) game.queued.push(dir);
}

function step() {
  if (game.queued.length) game.dir = game.queued.shift();
  const d = DIRS[game.dir];
  const head = game.snake[0];
  const next = { x: head.x + d.x, y: head.y + d.y };

  const hitsWall = next.x < 0 || next.y < 0 || next.x >= COLS || next.y >= game.rows;
  const hitsSelf = game.snake.slice(0, -1).some((s) => s.x === next.x && s.y === next.y);
  const hitsRock = game.obstacles.some((o) => o.x === next.x && o.y === next.y);

  if (hitsWall || hitsSelf || hitsRock) {
    game.phase = 'dying';
    game.dieTimer = 0.55;
    api.audio.hit();
    return;
  }

  game.snake.unshift(next);

  if (next.x === game.apple.x && next.y === game.apple.y) {
    game.apples++;
    game.score += 10 * game.level;
    api.audio.pickup();
    const nextLevel = Math.floor(game.apples / APPLES_PER_LEVEL) + 1;
    if (nextLevel !== game.level) setLevel(nextLevel);
    placeApple();
  } else {
    game.snake.pop();
  }

  updateHud();
}

function updateHud() {
  api.setHud([
    { label: 'Score', value: game.score },
    { label: 'Level', value: game.level },
    { label: 'Top', value: Math.max(api.getHighscore(), game.score) },
  ]);
}

/* ---------------- Tekenen ---------------- */

function layout() {
  const { width, height } = surface;
  const rows = game ? game.rows : DEFAULT_ROWS;
  cell = Math.max(4, Math.floor(Math.min(width / COLS, height / rows)));
  ox = Math.round((width - cell * COLS) / 2);
  oy = Math.round((height - cell * rows) / 2);
}

function draw() {
  if (!surface || !game) return;
  const { ctx, width, height } = surface;

  ctx.fillStyle = '#05060d';
  ctx.fillRect(0, 0, width, height);

  // Speelveld
  ctx.fillStyle = '#080b16';
  ctx.fillRect(ox, oy, cell * COLS, cell * game.rows);
  ctx.strokeStyle = 'rgba(42, 51, 88, .55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(ox + .5, oy + .5, cell * COLS - 1, cell * game.rows - 1);

  ctx.fillStyle = 'rgba(42, 51, 88, .35)';
  for (let y = 1; y < game.rows; y++) {
    for (let x = 1; x < COLS; x++) {
      ctx.fillRect(ox + x * cell - 1, oy + y * cell - 1, 2, 2);
    }
  }

  if (game.flash > 0) {
    ctx.fillStyle = `rgba(69, 240, 138, ${0.12 * (game.flash / 0.4)})`;
    ctx.fillRect(ox, oy, cell * COLS, cell * game.rows);
  }

  // Obstakels
  for (const o of game.obstacles) {
    ctx.fillStyle = '#2f3a63';
    roundRect(ctx, ox + o.x * cell + 1, oy + o.y * cell + 1, cell - 2, cell - 2, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    ctx.fillRect(ox + o.x * cell + 3, oy + o.y * cell + 3, cell - 6, 2);
  }

  // Appel
  const ax = ox + game.apple.x * cell + cell / 2;
  const ay = oy + game.apple.y * cell + cell / 2;
  ctx.fillStyle = '#ff2e88';
  ctx.beginPath();
  ctx.arc(ax, ay, cell * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.beginPath();
  ctx.arc(ax - cell * 0.1, ay - cell * 0.12, cell * 0.09, 0, Math.PI * 2);
  ctx.fill();

  // Slang
  const dying = game.phase === 'dying';
  for (let i = game.snake.length - 1; i >= 0; i--) {
    const s = game.snake[i];
    const t = i / Math.max(1, game.snake.length - 1);
    if (dying) {
      ctx.fillStyle = i === 0 ? '#ff5a5a' : `rgba(255, 90, 90, ${0.85 - t * 0.5})`;
    } else {
      ctx.fillStyle = i === 0 ? '#8dffc0' : `rgba(69, 240, 138, ${0.95 - t * 0.45})`;
    }
    roundRect(ctx, ox + s.x * cell + 1, oy + s.y * cell + 1, cell - 2, cell - 2, i === 0 ? 5 : 3);
    ctx.fill();
  }

  // Ogen op de kop
  if (!dying) {
    const head = game.snake[0];
    const d = DIRS[game.dir];
    const hx = ox + head.x * cell + cell / 2;
    const hy = oy + head.y * cell + cell / 2;
    const off = cell * 0.18;
    ctx.fillStyle = '#05060d';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(hx + d.x * off + (d.y !== 0 ? side * off : 0),
              hy + d.y * off + (d.x !== 0 ? side * off : 0),
              Math.max(1.2, cell * 0.08), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (game.phase === 'ready') {
    ctx.fillStyle = 'rgba(5, 6, 13, .72)';
    ctx.fillRect(ox, oy, cell * COLS, cell * game.rows);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#45f08a';
    ctx.font = '800 20px -apple-system, system-ui, sans-serif';
    ctx.fillText('KLAAR?', ox + cell * COLS / 2, oy + cell * game.rows / 2 - 10);
    ctx.fillStyle = '#8b96bd';
    ctx.font = '400 13px -apple-system, system-ui, sans-serif';
    ctx.fillText('Swipe of gebruik het D-pad', ox + cell * COLS / 2, oy + cell * game.rows / 2 + 16);
  }
}

/* ---------------- D-pad ---------------- */

function buildDpad() {
  const wrap = document.createElement('div');
  wrap.className = 'dpad';
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
      turn(dir);
    });
    wrap.appendChild(b);
  }
  return wrap;
}

/* ---------------- Module-interface ---------------- */

export function start(canvasEl, gameApi) {
  api = gameApi;

  // Eerst het D-pad neerzetten, dan pas meten: die knoppen bepalen mee hoe
  // hoog het speelveld is en dus hoeveel rijen erin passen.
  if (gameApi.settings().dpad) {
    dpadEl = buildDpad();
    gameApi.setControls(dpadEl);
  } else {
    gameApi.setControls(null);
  }

  surface = createSurface(canvasEl, () => { layout(); draw(); });
  game = newGame(rowsForSurface());
  layout();

  // Swipen mag over het hele speelvlak, maar niet over het D-pad: die knoppen
  // sturen zelf.
  input = createInput(api.stage || canvasEl, {
    onSwipe: (dir) => turn(dir),
    onTap: () => { if (game.phase === 'ready') game.phase = 'playing'; },
  }, { origin: canvasEl, ignore: '.dpad' });
  keys = createKeys({
    ArrowUp: () => turn('up'),
    ArrowDown: () => turn('down'),
    ArrowLeft: () => turn('left'),
    ArrowRight: () => turn('right'),
  });

  updateHud();

  loop = createLoop({
    update(dt) {
      if (game.flash > 0) game.flash = Math.max(0, game.flash - dt);

      if (game.phase === 'dying') {
        game.dieTimer -= dt;
        if (game.dieTimer <= 0) {
          const finished = game;
          game = newGame(rowsForSurface());   // klaarzetten voor 'opnieuw'
          loop.stop();
          api.gameOver({ score: finished.score, level: finished.level });
        }
        return;
      }
      if (game.phase !== 'playing') return;

      game.timer += dt;
      while (game.timer >= interval() && game.phase === 'playing') {
        game.timer -= interval();
        step();
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
  api?.setControls(null);
  loop = null;
  input = null;
  keys = null;
  surface = null;
  dpadEl = null;
  game = null;
}

export function pause() { loop?.stop(); }
export function resume() { loop?.start(); }

export function serialize() {
  if (!game || game.phase === 'dying') return null;
  if (game.phase === 'ready' && game.score === 0) return null; // niets te bewaren
  return {
    v: 2,
    rows: game.rows,
    snake: game.snake.map((s) => [s.x, s.y]),
    dir: game.dir,
    apple: [game.apple.x, game.apple.y],
    apples: game.apples,
    score: game.score,
    level: game.level,
    obstacles: game.obstacles.map((o) => [o.x, o.y]),
  };
}

export function restore(state) {
  // v1 kende nog een vast aantal rijen; die potjes lezen we gewoon uit.
  if (!state || (state.v !== 1 && state.v !== 2)) return;
  if (!Array.isArray(state.snake) || state.snake.length === 0) return;

  const rows = state.v === 2 ? state.rows : 22;
  if (!Number.isFinite(rows) || rows < MIN_ROWS || rows > MAX_ROWS + 4) return;
  // Past het bewaarde veld niet meer? Dan blijft de slang staan waar hij stond;
  // het veld wordt gewoon met randen getekend.
  game.rows = rows;
  layout();

  game.snake = state.snake.map(([x, y]) => ({ x, y }));
  game.dir = DIRS[state.dir] ? state.dir : 'up';
  game.queued = [];
  game.apple = { x: state.apple[0], y: state.apple[1] };
  game.apples = state.apples || 0;
  game.score = state.score || 0;
  game.level = state.level || 1;
  game.obstacles = (state.obstacles || []).map(([x, y]) => ({ x, y }));
  game.timer = 0;
  game.phase = 'ready';   // eerst even kijken, dan zelf weer beginnen
  updateHud();
  draw();
}
