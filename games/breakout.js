// Breakout. Gebruikt dezelfde peddel- en balfysica als Pong uit /shared.
// Vijf handgemaakte levels, drie levens, en vanaf level drie stenen die twee
// treffers nodig hebben. Het hoogst bereikte level wordt onthouden; bij het
// starten kies je of je daar begint of weer bij level een.

import { createSurface, roundRect } from '../shared/surface.js';
import { createLoop } from '../shared/loop.js';
import { createInput } from '../shared/input.js';
import { createChooser } from '../shared/chooser.js';
import {
  FIELD_W, createBall, launchBall, moveBall, bounceSides, bounceTop,
  hitsPaddle, reflectPaddle, clampPaddle, hitRect, reflectSide,
} from '../shared/physics.js';

const W = FIELD_W;
const COLS = 8;
const MARGIN = 4;              // zijmarge van het stenenveld
const TOP = 10;                // afstand van de bovenkant
const BRICK_W = (W - MARGIN * 2) / COLS;
const BRICK_H = 5.2;
const PADDLE_W = 20;
const PADDLE_H = 2.4;
const PADDLE_Y_OFF = 9;        // afstand tot de onderkant
const BALL_R = 1.6;
const SPEED_START = 66;
const SPEED_MAX = 124;
const SPEED_STEP = 1.02;
const LIVES = 3;
const SERVE_DELAY = 1.5;       // schiet vanzelf, zodat je je duim niet hoeft op te tillen

// '.' leeg, '1' gewone steen, '2' steen die twee treffers nodig heeft.
const LEVELS = [
  [
    '11111111',
    '11111111',
    '11111111',
    '11111111',
  ],
  [
    '..1111..',
    '.111111.',
    '11111111',
    '1.1..1.1',
    '1......1',
  ],
  [
    '22222222',
    '11111111',
    '1.1111.1',
    '..1111..',
    '...11...',
  ],
  [
    '11222211',
    '1.2222.1',
    '11222211',
    '..1111..',
    '.1....1.',
  ],
  [
    '2.2..2.2',
    '.22..22.',
    '12211221',
    '.22..22.',
    '2.2..2.2',
    '11111111',
  ],
];

let surface = null;
let loop = null;
let input = null;
let api = null;
let chooser = null;

let H = 170;
let scale = 1;
let game = null;

/* ---------------- Staat ---------------- */

function layoutFor(level) {
  return LEVELS[(level - 1) % LEVELS.length];
}

function buildBricks(level) {
  const rows = layoutFor(level);
  const bricks = [];
  rows.forEach((row, r) => {
    for (let c = 0; c < COLS; c++) {
      const ch = row[c] || '.';
      if (ch === '.') continue;
      bricks.push({ c, r, hits: ch === '2' ? 2 : 1, max: ch === '2' ? 2 : 1 });
    }
  });
  return bricks;
}

function brickRect(b) {
  return {
    x: MARGIN + b.c * BRICK_W,
    y: TOP + b.r * BRICK_H,
    w: BRICK_W,
    h: BRICK_H,
  };
}

function newGame(level = 1) {
  return {
    level,
    startLevel: level,
    lives: LIVES,
    score: 0,
    bricks: buildBricks(level),
    ball: createBall(W / 2, H - PADDLE_Y_OFF - 4, SPEED_START),
    paddleX: W / 2,
    phase: 'choose',     // choose | serve | play | cleared | dying | over
    timer: 0,
  };
}

function speedFor(level) {
  // Na de vijf handgemaakte levels begint de reeks opnieuw, maar sneller.
  const lap = Math.floor((level - 1) / LEVELS.length);
  return SPEED_START * (1 + lap * 0.12);
}

function serve() {
  const b = game.ball;
  b.x = game.paddleX;
  b.y = H - PADDLE_Y_OFF - PADDLE_H / 2 - BALL_R - 0.5;
  b.prevX = b.x;
  b.prevY = b.y;
  b.vx = 0;
  b.vy = 0;
  b.speed = speedFor(game.level);
  game.phase = 'serve';
  game.timer = SERVE_DELAY;
}

function launch() {
  const angle = Math.PI + (Math.random() * 0.6 - 0.3);   // omhoog, licht schuin
  launchBall(game.ball, angle, speedFor(game.level));
  game.phase = 'play';
  api.audio.blip();
}

function updateHud() {
  api.setHud([
    { label: 'Score', value: game.score },
    { label: 'Level', value: game.level },
    { label: 'Levens', value: '♥'.repeat(Math.max(0, game.lives)) || '–' },
  ]);
}

function loseLife() {
  game.lives--;
  api.audio.hit();
  updateHud();
  if (game.lives <= 0) {
    game.phase = 'over';
    game.timer = 0.7;
  } else {
    serve();
    api.save();
  }
}

function clearLevel() {
  game.score += 100 * game.level;
  game.phase = 'cleared';
  api.audio.levelUp();
  api.submitProgress(game.level + 1);
  updateHud();
  api.save();
}

function nextLevel() {
  game.level++;
  game.bricks = buildBricks(game.level);
  serve();
  updateHud();
  api.save();
}

/* ---------------- Fysica ---------------- */

function stepPhysics(dt) {
  const b = game.ball;
  moveBall(b, dt);

  if (bounceSides(b, BALL_R, W)) api.audio.blip();
  if (bounceTop(b, BALL_R, 0)) api.audio.blip();

  // Stenen: hooguit één per stap, anders gaat de bal gekke kanten op.
  for (let i = 0; i < game.bricks.length; i++) {
    const brick = game.bricks[i];
    const rect = brickRect(brick);
    const side = hitRect(b, BALL_R, rect);
    if (!side) continue;

    reflectSide(b, side, BALL_R, rect);
    brick.hits--;
    if (brick.hits <= 0) {
      game.bricks.splice(i, 1);
      game.score += (brick.max === 2 ? 25 : 10);
      api.audio.pickup();
    } else {
      game.score += 5;
      api.audio.hit();
    }
    updateHud();
    break;
  }

  if (game.bricks.length === 0) {
    clearLevel();
    return;
  }

  const paddleY = H - PADDLE_Y_OFF;
  if (hitsPaddle(b, BALL_R, paddleY, game.paddleX, PADDLE_W / 2, { down: true })) {
    b.y = paddleY - BALL_R;
    reflectPaddle(b, game.paddleX, PADDLE_W / 2, {
      down: false,
      maxAngle: 1.05,
      speedStep: SPEED_STEP,
      speedMax: SPEED_MAX,
    });
    api.audio.bounce();
  }

  if (b.y > H + 3) {
    game.phase = 'dying';
    game.timer = 0.5;
  }
}

/* ---------------- Tekenen ---------------- */

const ROW_COLORS = ['#ff2e88', '#ffd23d', '#45f08a', '#22e0ff', '#a06bff', '#ff8a3d'];

function layout() {
  const { width, height } = surface;
  scale = width / W;
  H = height / scale;
  if (game) {
    game.paddleX = clampPaddle(game.paddleX, PADDLE_W / 2, W);
    if (game.phase === 'serve') serve();
  }
}

function px(u) { return u * scale; }

function draw() {
  if (!surface || !game) return;
  const { ctx, width, height } = surface;

  ctx.fillStyle = '#05060d';
  ctx.fillRect(0, 0, width, height);

  // Stenen
  for (const brick of game.bricks) {
    const r = brickRect(brick);
    const color = ROW_COLORS[brick.r % ROW_COLORS.length];
    const hard = brick.max === 2;
    const cracked = hard && brick.hits === 1;

    ctx.fillStyle = hard && !cracked ? '#3a4577' : color;
    roundRect(ctx, px(r.x) + 1.5, px(r.y) + 1.5, px(r.w) - 3, px(r.h) - 3, 4);
    ctx.fill();

    if (hard) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      roundRect(ctx, px(r.x) + 1.5, px(r.y) + 1.5, px(r.w) - 3, px(r.h) - 3, 4);
      ctx.stroke();
    }
    // Glansrandje bovenaan
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(px(r.x) + 4, px(r.y) + 3.5, px(r.w) - 8, 2);
  }

  // Peddel
  ctx.fillStyle = '#ffd23d';
  roundRect(ctx,
    px(game.paddleX - PADDLE_W / 2), px(H - PADDLE_Y_OFF - PADDLE_H / 2),
    px(PADDLE_W), px(PADDLE_H), px(PADDLE_H) / 2);
  ctx.fill();

  // Bal
  if (game.phase !== 'choose' && game.phase !== 'over') {
    ctx.fillStyle = '#eaf0ff';
    ctx.beginPath();
    ctx.arc(px(game.ball.x), px(game.ball.y), px(BALL_R), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  if (game.phase === 'serve') {
    ctx.fillStyle = '#8b96bd';
    ctx.font = '600 14px -apple-system, system-ui, sans-serif';
    ctx.fillText('Sleep de peddel — tik om nu te schieten', width / 2, height - px(PADDLE_Y_OFF) - 30);
  }

  if (game.phase === 'cleared') {
    ctx.fillStyle = 'rgba(5, 6, 13, .8)';
    ctx.fillRect(0, height / 2 - 70, width, 140);
    ctx.fillStyle = '#45f08a';
    ctx.font = '800 26px -apple-system, system-ui, sans-serif';
    ctx.fillText(`LEVEL ${game.level} UIT`, width / 2, height / 2 - 6);
    ctx.fillStyle = '#8b96bd';
    ctx.font = '400 13px -apple-system, system-ui, sans-serif';
    ctx.fillText('Tik voor het volgende level', width / 2, height / 2 + 24);
  }

  if (game.phase === 'choose' && chooser) chooser.draw(ctx, width, height);
}

/* ---------------- Invoer ---------------- */

function onMove(x) {
  if (!game || game.phase === 'choose') return;
  game.paddleX = clampPaddle(x / scale, PADDLE_W / 2, W);
  if (game.phase === 'serve') {
    game.ball.x = game.paddleX;
    game.ball.prevX = game.paddleX;
  }
}

function onTap(x, y) {
  if (!game) return;
  if (game.phase === 'choose') {
    const value = chooser.hit(x, y);
    if (value === null) return;
    game.level = value;
    game.startLevel = value;
    game.bricks = buildBricks(value);
    updateHud();
    serve();
    return;
  }
  if (game.phase === 'serve') launch();
  else if (game.phase === 'cleared') nextLevel();
}

function startChoice() {
  const best = api.getProgress();
  if (best <= 1) {
    game.level = 1;
    game.bricks = buildBricks(1);
    serve();
    return;
  }
  chooser = createChooser({
    title: 'Waar begin je?',
    subtitle: `Je kwam eerder tot level ${best}.`,
    accent: '#ffd23d',
    options: [
      { label: `Level ${best}`, value: best, primary: true },
      { label: 'Level 1', value: 1 },
    ],
  });
  game.phase = 'choose';
}

/* ---------------- Module-interface ---------------- */

export function start(canvasEl, gameApi) {
  api = gameApi;
  surface = createSurface(canvasEl, () => { layout(); draw(); });
  game = newGame(1);
  layout();

  input = createInput(api.stage || canvasEl, {
    onDragStart: (x) => onMove(x),
    onDrag: (x) => onMove(x),
    onTap: (x, y) => onTap(x, y),
  }, { origin: canvasEl });

  updateHud();
  startChoice();

  loop = createLoop({
    update(dt) {
      if (!game) return;
      if (game.phase === 'play') {
        stepPhysics(dt);
        return;
      }
      if (game.phase === 'serve') {
        game.timer -= dt;
        if (game.timer <= 0) launch();
        return;
      }
      if (game.phase === 'dying') {
        game.timer -= dt;
        if (game.timer <= 0) loseLife();
        return;
      }
      if (game.phase === 'over') {
        game.timer -= dt;
        if (game.timer <= 0) {
          const { score, level } = game;
          loop.stop();
          api.gameOver({ score, level });
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
  surface?.destroy();
  loop = null;
  input = null;
  surface = null;
  game = null;
  chooser = null;
}

export function pause() { loop?.stop(); }
export function resume() { loop?.start(); }

export function serialize() {
  if (!game || game.phase === 'choose' || game.phase === 'over') return null;
  if (game.score === 0 && game.level === game.startLevel && game.lives === LIVES && game.phase === 'serve') return null;
  return {
    v: 1,
    level: game.level,
    startLevel: game.startLevel,
    lives: game.lives,
    score: game.score,
    bricks: game.bricks.map((b) => [b.c, b.r, b.hits, b.max]),
    paddleX: game.paddleX,
  };
}

export function restore(state) {
  if (!state || state.v !== 1 || !Array.isArray(state.bricks)) return;
  game.level = state.level || 1;
  game.startLevel = state.startLevel || game.level;
  game.lives = state.lives ?? LIVES;
  game.score = state.score || 0;
  game.bricks = state.bricks.map(([c, r, hits, max]) => ({ c, r, hits, max }));
  game.paddleX = clampPaddle(state.paddleX ?? W / 2, PADDLE_W / 2, W);
  chooser = null;
  updateHud();
  serve();     // altijd met de bal op de peddel verder, nooit halverwege een duik
  draw();
}
