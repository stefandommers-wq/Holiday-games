// Ruimte-invasie. Je schip volgt je duim en schiet vanzelf. Per golf zakken
// de vijanden sneller en gooien ze meer bommen. Drie levens; de hoogst
// bereikte golf en de highscore worden onthouden.

import { createSurface } from '../shared/surface.js';
import { createLoop } from '../shared/loop.js';
import { createInput, createKeys } from '../shared/input.js';
import { FIELD_W, clampPaddle } from '../shared/physics.js';

const W = FIELD_W;
const COLS = 6;
const ROWS = 4;
const GAP_X = 15;
const GAP_Y = 11;
const ENEMY_W = 9;
const ENEMY_H = 6.5;
const START_X = 8;
const START_Y = 12;

const SHIP_W = 9;
const SHIP_H = 6;
const SHIP_Y_OFF = 8;          // afstand tot de onderkant

const BULLET_SPEED = 95;
const BOMB_SPEED = 38;
const FIRE_DELAY = 0.34;
const MAX_BULLETS = 3;
const LIVES = 3;

// Pixel-alien, twee standen zodat hij lijkt te lopen.
const ALIEN = [
  [
    '..#....#..',
    '...#..#...',
    '..######..',
    '.##.##.##.',
    '##########',
    '#.######.#',
    '#.#....#.#',
    '...##.##..',
  ],
  [
    '..#....#..',
    '#..#..#..#',
    '#.######.#',
    '###.##.###',
    '##########',
    '.########.',
    '..#....#..',
    '.#......#.',
  ],
];
const ROW_COLORS = ['#ff2e88', '#a06bff', '#22e0ff', '#45f08a', '#ffd23d'];

let surface = null;
let loop = null;
let input = null;
let keys = null;
let api = null;

let H = 170;
let scale = 1;
let game = null;

/* ---------------- Staat ---------------- */

function newWaveEnemies() {
  const alive = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) alive.push(true);
  }
  return alive;
}

function newGame(wave = 1) {
  return {
    wave,
    score: 0,
    lives: LIVES,
    alive: newWaveEnemies(),
    offX: 0,
    offY: 0,
    dir: 1,
    stepTimer: 0,
    frame: 0,
    shipX: W / 2,
    bullets: [],
    bombs: [],
    fireTimer: 0,
    invuln: 0,
    phase: 'play',   // play | cleared | over
    timer: 0,
    shake: 0,
  };
}

function enemyPos(index) {
  const c = index % COLS;
  const r = Math.floor(index / COLS);
  return {
    x: START_X + c * GAP_X + game.offX,
    y: START_Y + r * GAP_Y + game.offY,
    r,
  };
}

function aliveCount() {
  return game.alive.reduce((n, a) => n + (a ? 1 : 0), 0);
}

function stepInterval() {
  const total = game.alive.length;
  const left = Math.max(1, aliveCount());
  const base = Math.max(0.12, 0.62 - (game.wave - 1) * 0.055);
  return base * (0.35 + 0.65 * (left / total));
}

function bombChance() {
  return Math.min(0.55, 0.10 + (game.wave - 1) * 0.05);
}

function shipY() {
  return H - SHIP_Y_OFF - SHIP_H / 2;
}

function updateHud() {
  api.setHud([
    { label: 'Score', value: game.score },
    { label: 'Golf', value: game.wave },
    { label: 'Levens', value: '♥'.repeat(Math.max(0, game.lives)) || '–' },
  ]);
}

/* ---------------- Stappen ---------------- */

function stepEnemies() {
  game.frame = 1 - game.frame;

  // Verste posities van de nog levende vijanden bepalen.
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < game.alive.length; i++) {
    if (!game.alive[i]) continue;
    const p = enemyPos(i);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x + ENEMY_W);
    maxY = Math.max(maxY, p.y + ENEMY_H);
  }
  if (minX === Infinity) return;

  const stepX = 2.6 * game.dir;
  if (minX + stepX < 2 || maxX + stepX > W - 2) {
    game.dir *= -1;
    game.offY += 4;
  } else {
    game.offX += stepX;
  }

  // Bommen: alleen de onderste vijand van een kolom gooit.
  if (Math.random() < bombChance()) {
    const shooters = [];
    for (let c = 0; c < COLS; c++) {
      for (let r = ROWS - 1; r >= 0; r--) {
        const i = r * COLS + c;
        if (game.alive[i]) { shooters.push(i); break; }
      }
    }
    if (shooters.length) {
      const p = enemyPos(shooters[Math.floor(Math.random() * shooters.length)]);
      game.bombs.push({ x: p.x + ENEMY_W / 2, y: p.y + ENEMY_H });
    }
  }

  // Te ver gezakt: dat kost een leven.
  if (maxY >= shipY() - SHIP_H / 2) hitShip(true);
}

function fire() {
  if (game.bullets.length >= MAX_BULLETS) return;
  game.bullets.push({ x: game.shipX, y: shipY() - SHIP_H / 2 });
  api.audio.shoot();
}

function hitShip(reset = false) {
  if (game.invuln > 0) return;
  game.lives--;
  game.invuln = 1.6;
  game.shake = 0.4;
  game.bombs = [];
  api.audio.hit();
  updateHud();

  if (reset) {
    // De rij stond op de stoep: terug naar boven, maar de golf blijft staan.
    game.offY = 0;
    game.offX = 0;
    game.dir = 1;
  }
  if (game.lives <= 0) {
    game.phase = 'over';
    game.timer = 0.8;
  } else {
    api.save();
  }
}

function clearWave() {
  game.phase = 'cleared';
  game.timer = 1.4;
  game.score += 100 * game.wave;
  api.audio.levelUp();
  api.submitProgress(game.wave + 1);
  updateHud();
}

function nextWave() {
  game.wave++;
  game.alive = newWaveEnemies();
  game.offX = 0;
  game.offY = 0;
  game.dir = 1;
  game.bullets = [];
  game.bombs = [];
  game.phase = 'play';
  updateHud();
  api.save();
}

function update(dt) {
  if (game.invuln > 0) game.invuln = Math.max(0, game.invuln - dt);
  if (game.shake > 0) game.shake = Math.max(0, game.shake - dt);

  game.fireTimer -= dt;
  if (game.fireTimer <= 0) {
    game.fireTimer = FIRE_DELAY;
    fire();
  }

  game.stepTimer += dt;
  while (game.stepTimer >= stepInterval() && game.phase === 'play') {
    game.stepTimer -= stepInterval();
    stepEnemies();
  }
  if (game.phase !== 'play') return;

  // Kogels omhoog
  for (const b of game.bullets) b.y -= BULLET_SPEED * dt;
  game.bullets = game.bullets.filter((b) => b.y > -2);

  // Bommen omlaag
  const bombSpeed = BOMB_SPEED + game.wave * 3;
  for (const b of game.bombs) b.y += bombSpeed * dt;
  game.bombs = game.bombs.filter((b) => b.y < H + 2);

  // Kogel tegen vijand
  for (let bi = game.bullets.length - 1; bi >= 0; bi--) {
    const b = game.bullets[bi];
    for (let i = 0; i < game.alive.length; i++) {
      if (!game.alive[i]) continue;
      const p = enemyPos(i);
      if (b.x >= p.x && b.x <= p.x + ENEMY_W && b.y >= p.y && b.y <= p.y + ENEMY_H) {
        game.alive[i] = false;
        game.bullets.splice(bi, 1);
        game.score += 10 + (ROWS - 1 - p.r) * 5 + (game.wave - 1) * 2;
        api.audio.pickup();
        updateHud();
        break;
      }
    }
  }

  // Bom tegen schip
  const sy = shipY();
  for (let i = game.bombs.length - 1; i >= 0; i--) {
    const b = game.bombs[i];
    if (Math.abs(b.x - game.shipX) <= SHIP_W / 2 && Math.abs(b.y - sy) <= SHIP_H / 2 + 1) {
      game.bombs.splice(i, 1);
      hitShip(false);
      // hitShip veegt de bommen weg, dus niet verder door deze lijst lopen.
      break;
    }
  }

  if (aliveCount() === 0) clearWave();
}

/* ---------------- Tekenen ---------------- */

function layout() {
  const { width, height } = surface;
  scale = width / W;
  H = height / scale;
  if (game) game.shipX = clampPaddle(game.shipX, SHIP_W / 2, W);
}

function px(u) { return u * scale; }

function drawSprite(ctx, rows, x, y, w, h, color) {
  const cols = rows[0].length;
  const cw = w / cols;
  const ch = h / rows.length;
  ctx.fillStyle = color;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < cols; c++) {
      if (rows[r][c] === '#') {
        ctx.fillRect(Math.floor(x + c * cw), Math.floor(y + r * ch), Math.ceil(cw), Math.ceil(ch));
      }
    }
  }
}

function draw() {
  if (!surface || !game) return;
  const { ctx, width, height } = surface;

  ctx.save();
  if (game.shake > 0) {
    ctx.translate((Math.random() - 0.5) * 6 * game.shake, (Math.random() - 0.5) * 6 * game.shake);
  }

  ctx.fillStyle = '#05060d';
  ctx.fillRect(-10, -10, width + 20, height + 20);

  // Sterren, vast patroon zodat het niet flikkert
  ctx.fillStyle = 'rgba(234, 240, 255, .18)';
  for (let i = 0; i < 40; i++) {
    const sx = (i * 73) % 100;
    const sy = (i * 149) % Math.round(H);
    ctx.fillRect(px(sx), px(sy), 1.5, 1.5);
  }

  // Vijanden
  for (let i = 0; i < game.alive.length; i++) {
    if (!game.alive[i]) continue;
    const p = enemyPos(i);
    drawSprite(ctx, ALIEN[game.frame], px(p.x), px(p.y), px(ENEMY_W), px(ENEMY_H),
      ROW_COLORS[p.r % ROW_COLORS.length]);
  }

  // Kogels en bommen
  ctx.fillStyle = '#eaf0ff';
  for (const b of game.bullets) ctx.fillRect(px(b.x) - 1.5, px(b.y) - px(3), 3, px(3));
  ctx.fillStyle = '#ff5a5a';
  for (const b of game.bombs) ctx.fillRect(px(b.x) - 2, px(b.y), 4, px(3));

  // Schip, knippert als je net geraakt bent
  const blink = game.invuln > 0 && Math.floor(game.invuln * 12) % 2 === 0;
  if (!blink) {
    const sx = px(game.shipX);
    const sy = px(shipY());
    const w = px(SHIP_W);
    const h = px(SHIP_H);
    ctx.fillStyle = '#45f08a';
    ctx.beginPath();
    ctx.moveTo(sx, sy - h / 2);
    ctx.lineTo(sx + w / 2, sy + h / 2);
    ctx.lineTo(sx + w / 4, sy + h / 2);
    ctx.lineTo(sx, sy + h / 6);
    ctx.lineTo(sx - w / 4, sy + h / 2);
    ctx.lineTo(sx - w / 2, sy + h / 2);
    ctx.closePath();
    ctx.fill();
  }

  ctx.textAlign = 'center';
  if (game.phase === 'cleared') {
    ctx.fillStyle = 'rgba(5, 6, 13, .78)';
    ctx.fillRect(0, height / 2 - 60, width, 120);
    ctx.fillStyle = '#45f08a';
    ctx.font = '800 24px -apple-system, system-ui, sans-serif';
    ctx.fillText(`GOLF ${game.wave} AFGESLAGEN`, width / 2, height / 2);
    ctx.fillStyle = '#8b96bd';
    ctx.font = '400 13px -apple-system, system-ui, sans-serif';
    ctx.fillText('De volgende komt eraan', width / 2, height / 2 + 26);
  }

  ctx.restore();
}

/* ---------------- Module-interface ---------------- */

export function start(canvasEl, gameApi) {
  api = gameApi;
  game = newGame(1);
  surface = createSurface(canvasEl, () => { layout(); draw(); });
  layout();

  const moveShip = (x) => {
    if (!game) return;
    game.shipX = clampPaddle(x / scale, SHIP_W / 2, W);
  };
  input = createInput(api.stage || canvasEl, {
    onDragStart: moveShip,
    onDrag: moveShip,
  }, { origin: canvasEl });
  keys = createKeys({
    ArrowLeft: () => { if (game) moveShip(px(game.shipX - 4)); },
    ArrowRight: () => { if (game) moveShip(px(game.shipX + 4)); },
  });

  updateHud();

  loop = createLoop({
    update(dt) {
      if (!game) return;
      if (game.phase === 'play') {
        update(dt);
        return;
      }
      if (game.phase === 'cleared') {
        game.timer -= dt;
        if (game.timer <= 0) nextWave();
        return;
      }
      if (game.phase === 'over') {
        game.timer -= dt;
        if (game.timer <= 0) {
          const { score, wave } = game;
          loop.stop();
          api.gameOver({ score, level: wave });
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
  if (game.wave === 1 && game.score === 0 && game.lives === LIVES && game.offY === 0) return null;
  return {
    v: 1,
    wave: game.wave,
    score: game.score,
    lives: game.lives,
    alive: game.alive.map((a) => (a ? 1 : 0)),
    offX: game.offX,
    offY: game.offY,
    dir: game.dir,
    shipX: game.shipX,
  };
}

export function restore(state) {
  if (!state || state.v !== 1 || !Array.isArray(state.alive)) return;
  game.wave = state.wave || 1;
  game.score = state.score || 0;
  game.lives = state.lives ?? LIVES;
  game.alive = state.alive.map((a) => !!a);
  game.offX = state.offX || 0;
  game.offY = state.offY || 0;
  game.dir = state.dir || 1;
  game.shipX = clampPaddle(state.shipX ?? W / 2, SHIP_W / 2, W);
  game.bullets = [];
  game.bombs = [];
  game.invuln = 1.2;      // even de tijd om je duim terug te zetten
  game.phase = 'play';
  updateHud();
  draw();
}
