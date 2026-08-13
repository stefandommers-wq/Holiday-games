// Pong tegen de computer, staand: jij onderaan, de computer bovenaan.
// Eerste op elf punten wint de wedstrijd. Win je, dan gaat het door met een
// scherpere tegenstander; je score is het aantal wedstrijden op rij.
//
// Alles rekent in veldeenheden: het veld is altijd 100 breed en de hoogte
// volgt de verhouding van het scherm. Zo klopt een bewaard potje ook als het
// toestel gedraaid wordt en zijn de hoeken overal gelijk.

import { createSurface } from '../shared/surface.js';
import { createLoop } from '../shared/loop.js';
import { createInput } from '../shared/input.js';
import { createChooser } from '../shared/chooser.js';
import {
  FIELD_W, createBall, launchBall, moveBall, bounceSides,
  hitsPaddle, reflectPaddle, clampPaddle as clampToField,
} from '../shared/physics.js';

const W = FIELD_W;             // veldbreedte in eenheden
const WIN_SCORE = 11;
const PADDLE_W = 22;
const PADDLE_H = 2.6;
const BALL_R = 1.7;
const EDGE = 6;                // afstand van peddel tot rand
const SPEED_START = 62;
const SPEED_MAX = 130;
const SPEED_STEP = 1.035;

const LEVELS = {
  rustig: { reaction: 0.42, speed: 46, label: 'Rustig' },
  normaal: { reaction: 0.30, speed: 62, label: 'Normaal' },
  pittig: { reaction: 0.19, speed: 82, label: 'Pittig' },
};

let surface = null;
let loop = null;
let input = null;
let api = null;
let chooser = null;

let H = 170;   // veldhoogte in eenheden, volgt uit de schermverhouding
let scale = 1; // pixels per eenheid
let game = null;

/* ---------------- Staat ---------------- */

function newGame(level = 'normaal') {
  return {
    level,
    reaction: LEVELS[level].reaction,
    aiSpeed: LEVELS[level].speed,
    you: 0,
    cpu: 0,
    streak: 0,
    phase: 'choose',        // choose | serve | play | won | lost
    timer: 0,
    ball: createBall(W / 2, H / 2, SPEED_START),
    you_x: W / 2,
    cpu_x: W / 2,
    aiTarget: W / 2,
    aiClock: 0,
    sightings: [{ t: 0, x: W / 2, vy: 0 }],
    serveTo: 'cpu',         // richting van de eerstvolgende service
  };
}

function resetBall(toward) {
  const b = game.ball;
  b.x = W / 2;
  b.y = H / 2;
  b.prevX = b.x;
  b.prevY = b.y;
  // Hoek 0 is recht omlaag; naar de computer toe is dus rond een halve slag.
  const angle = (Math.random() * 0.5 - 0.25) + (toward === 'cpu' ? Math.PI : 0);
  launchBall(b, angle, SPEED_START);
  game.sightings = [{ t: game.aiClock, x: b.x, vy: b.vy }];
  game.phase = 'serve';
  game.timer = 0.9;
}

function updateHud() {
  api.setHud([
    { label: 'Jij', value: game.you },
    { label: 'Computer', value: game.cpu },
    { label: 'Reeks', value: game.streak },
  ]);
}

/* ---------------- Fysica ---------------- */

function bounceOffPaddle(paddleX, goingDown) {
  reflectPaddle(game.ball, paddleX, PADDLE_W / 2, {
    down: goingDown,
    maxAngle: 1.0,             // maximaal ongeveer 57 graden
    speedStep: SPEED_STEP,
    speedMax: SPEED_MAX,
  });
  api.audio.bounce();
}

function point(who) {
  if (who === 'you') game.you++;
  else game.cpu++;
  updateHud();
  api.audio.hit();

  if (game.you >= WIN_SCORE) {
    game.phase = 'won';
    game.timer = 0;
    game.streak++;
    // Volgende wedstrijd: de tegenstander wordt scherper.
    game.reaction = Math.max(0.09, game.reaction * 0.88);
    game.aiSpeed = Math.min(140, game.aiSpeed * 1.08);
    api.submitScore(game.streak);
    api.audio.levelUp();
    api.save();
    updateHud();
    return;
  }
  if (game.cpu >= WIN_SCORE) {
    game.phase = 'lost';
    game.timer = 0.8;
    return;
  }
  resetBall(who === 'you' ? 'cpu' : 'you');
}

function stepPhysics(dt) {
  const b = game.ball;
  moveBall(b, dt);

  if (bounceSides(b, BALL_R, W)) api.audio.blip();

  // Peddel van de speler (onder)
  const youY = H - EDGE;
  if (hitsPaddle(b, BALL_R, youY, game.you_x, PADDLE_W / 2, { down: true })) {
    b.y = youY - BALL_R;
    bounceOffPaddle(game.you_x, false);
  }

  // Peddel van de computer (boven)
  const cpuY = EDGE;
  if (hitsPaddle(b, BALL_R, cpuY, game.cpu_x, PADDLE_W / 2, { down: false })) {
    b.y = cpuY + BALL_R;
    bounceOffPaddle(game.cpu_x, true);
  }

  if (b.y > H + 4) point('cpu');
  else if (b.y < -4) point('you');
}

// De computer voorspelt niets: hij ziet de bal zoals die er 'reaction'
// seconden geleden uitzag en beweegt daar met een beperkte snelheid naartoe.
// Daardoor is hij te verslaan met een scherpe hoek of een snelle bal, en
// bepaalt de reactietijd precies hoe scherp hij is.
function stepAi(dt) {
  const b = game.ball;
  game.aiClock += dt;
  game.sightings.push({ t: game.aiClock, x: b.x, vy: b.vy });
  const cutoff = game.aiClock - game.reaction;
  while (game.sightings.length > 1 && game.sightings[1].t <= cutoff) game.sightings.shift();

  const seen = game.sightings[0];
  // Komt de bal naar hem toe, dan volgt hij; gaat hij weg, dan zakt hij terug
  // naar het midden.
  game.aiTarget = seen.vy < 0 ? seen.x : W / 2;

  const diff = game.aiTarget - game.cpu_x;
  const dead = 0.6;
  if (Math.abs(diff) > dead) {
    const move = Math.sign(diff) * Math.min(Math.abs(diff), game.aiSpeed * dt);
    game.cpu_x = clampPaddle(game.cpu_x + move);
  }
}

function clampPaddle(x) {
  return clampToField(x, PADDLE_W / 2, W);
}

/* ---------------- Tekenen ---------------- */

function layout() {
  const { width, height } = surface;
  scale = width / W;
  H = height / scale;
  if (game) {
    game.ball.y = Math.min(game.ball.y, H - BALL_R);
    game.you_x = clampPaddle(game.you_x);
    game.cpu_x = clampPaddle(game.cpu_x);
  }
}

function px(u) { return u * scale; }

function draw() {
  if (!surface || !game) return;
  const { ctx, width, height } = surface;

  ctx.fillStyle = '#05060d';
  ctx.fillRect(0, 0, width, height);

  // Middenlijn
  ctx.strokeStyle = 'rgba(42, 51, 88, .9)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 12]);
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Puntenstand groot op de achtergrond
  ctx.textAlign = 'center';
  ctx.font = '800 64px ui-monospace, Menlo, monospace';
  ctx.fillStyle = 'rgba(34, 224, 255, .10)';
  ctx.fillText(String(game.cpu), width / 2, height / 2 - 30);
  ctx.fillStyle = 'rgba(255, 46, 136, .10)';
  ctx.fillText(String(game.you), width / 2, height / 2 + 84);

  // Peddels
  ctx.fillStyle = '#22e0ff';
  ctx.fillRect(px(game.cpu_x - PADDLE_W / 2), px(EDGE - PADDLE_H / 2), px(PADDLE_W), px(PADDLE_H));
  ctx.fillStyle = '#ff2e88';
  ctx.fillRect(px(game.you_x - PADDLE_W / 2), px(H - EDGE - PADDLE_H / 2), px(PADDLE_W), px(PADDLE_H));

  // Bal
  if (game.phase === 'play' || game.phase === 'serve') {
    ctx.fillStyle = '#eaf0ff';
    ctx.beginPath();
    ctx.arc(px(game.ball.x), px(game.ball.y), px(BALL_R), 0, Math.PI * 2);
    ctx.fill();
  }

  if (game.phase === 'choose') {
    chooser.draw(ctx, width, height);
    return;
  }

  if (game.phase === 'serve') {
    ctx.fillStyle = '#8b96bd';
    ctx.font = '600 14px -apple-system, system-ui, sans-serif';
    ctx.fillText('Sleep je peddel', width / 2, height / 2 - 60);
  }

  if (game.phase === 'won') {
    banner(ctx, width, height, 'GEWONNEN!', `Reeks ${game.streak} — tik voor de volgende wedstrijd`, '#45f08a');
  }
}

function banner(ctx, width, height, title, sub, color) {
  ctx.fillStyle = 'rgba(5, 6, 13, .78)';
  ctx.fillRect(0, height / 2 - 70, width, 140);
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = '800 26px -apple-system, system-ui, sans-serif';
  ctx.fillText(title, width / 2, height / 2 - 6);
  ctx.fillStyle = '#8b96bd';
  ctx.font = '400 13px -apple-system, system-ui, sans-serif';
  ctx.fillText(sub, width / 2, height / 2 + 24);
}

/* ---------------- Invoer ---------------- */

function onPointer(x) {
  if (!game || game.phase === 'choose') return;
  game.you_x = clampPaddle(x / scale);
}

function onTap(x, y) {
  if (!game) return;
  if (game.phase === 'choose') {
    const value = chooser.hit(x, y);
    if (value) {
      game.level = value;
      game.reaction = LEVELS[value].reaction;
      game.aiSpeed = LEVELS[value].speed;
      resetBall('cpu');
      api.audio.blip();
    }
    return;
  }
  if (game.phase === 'won') {
    game.you = 0;
    game.cpu = 0;
    updateHud();
    resetBall('cpu');
  }
}

/* ---------------- Module-interface ---------------- */

export function start(canvasEl, gameApi) {
  api = gameApi;
  chooser = createChooser({
    title: 'Hoe pittig?',
    subtitle: 'De computer reageert sneller naarmate je wint.',
    accent: '#22e0ff',
    options: [
      { label: 'Rustig', value: 'rustig' },
      { label: 'Normaal', value: 'normaal', primary: true },
      { label: 'Pittig', value: 'pittig' },
    ],
  });

  surface = createSurface(canvasEl, () => { layout(); draw(); });
  game = newGame();
  layout();
  game.ball.y = H / 2;

  input = createInput(canvasEl, {
    onDragStart: (x) => onPointer(x),
    onDrag: (x) => onPointer(x),
    onTap: (x, y) => onTap(x, y),
  });

  updateHud();

  loop = createLoop({
    update(dt) {
      if (!game) return;
      if (game.phase === 'serve') {
        game.timer -= dt;
        stepAi(dt);
        if (game.timer <= 0) game.phase = 'play';
        return;
      }
      if (game.phase === 'play') {
        stepPhysics(dt);
        stepAi(dt);
        return;
      }
      if (game.phase === 'lost') {
        game.timer -= dt;
        if (game.timer <= 0) {
          const streak = game.streak;
          const you = game.you;
          loop.stop();
          api.gameOver({
            score: streak,
            title: 'Verloren',
            stats: [{ label: 'Stand', value: `${you}-${game.cpu}` }],
          });
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
  if (!game || game.phase === 'choose' || game.phase === 'lost') return null;
  if (game.you === 0 && game.cpu === 0 && game.streak === 0) return null;
  return {
    v: 1,
    level: game.level,
    reaction: game.reaction,
    aiSpeed: game.aiSpeed,
    you: game.you,
    cpu: game.cpu,
    streak: game.streak,
    youX: game.you_x,
    cpuX: game.cpu_x,
    ball: { x: game.ball.x, y: game.ball.y / H, vx: game.ball.vx, vy: game.ball.vy, speed: game.ball.speed },
  };
}

export function restore(state) {
  if (!state || state.v !== 1) return;
  game.level = LEVELS[state.level] ? state.level : 'normaal';
  game.reaction = state.reaction ?? LEVELS[game.level].reaction;
  game.aiSpeed = state.aiSpeed ?? LEVELS[game.level].speed;
  game.you = state.you || 0;
  game.cpu = state.cpu || 0;
  game.streak = state.streak || 0;
  game.you_x = clampPaddle(state.youX ?? W / 2);
  game.cpu_x = clampPaddle(state.cpuX ?? W / 2);
  const by = Math.max(BALL_R, Math.min(H - BALL_R, state.ball.y * H));
  game.ball = createBall(state.ball.x, by, state.ball.speed);
  game.ball.vx = state.ball.vx;
  game.ball.vy = state.ball.vy;
  game.phase = 'serve';
  game.timer = 1.0;
  updateHud();
  draw();
}
