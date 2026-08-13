// Peddel- en balfysica, gedeeld door Pong en Breakout.
//
// Alles rekent in veldeenheden: het veld is altijd FIELD_W breed en de hoogte
// volgt de schermverhouding. Zo zijn hoeken overal gelijk en klopt een
// bewaard potje ook na het draaien van het toestel.

export const FIELD_W = 100;

export function createBall(x, y, speed) {
  return { x, y, vx: 0, vy: 0, speed, prevX: x, prevY: y };
}

// Zet de bal in beweging onder een hoek. 0 is recht omlaag, negatief is omhoog.
export function launchBall(ball, angle, speed = ball.speed) {
  ball.speed = speed;
  ball.vx = Math.sin(angle) * speed;
  ball.vy = Math.cos(angle) * speed;
}

export function moveBall(ball, dt) {
  ball.prevX = ball.x;
  ball.prevY = ball.y;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
}

// Stuitert tegen de zijkanten. Geeft true als er iets geraakt is.
export function bounceSides(ball, radius, width = FIELD_W) {
  if (ball.x < radius) {
    ball.x = radius;
    ball.vx = Math.abs(ball.vx);
    return true;
  }
  if (ball.x > width - radius) {
    ball.x = width - radius;
    ball.vx = -Math.abs(ball.vx);
    return true;
  }
  return false;
}

export function bounceTop(ball, radius, top = 0) {
  if (ball.y < top + radius) {
    ball.y = top + radius;
    ball.vy = Math.abs(ball.vy);
    return true;
  }
  return false;
}

// Is de bal deze stap door het vlak van de peddel gegaan, en dan ook nog op
// de plek waar de peddel staat? De vorige positie telt mee, zodat een snelle
// bal er niet doorheen schiet.
export function hitsPaddle(ball, radius, paddleY, paddleX, halfWidth, { down = true } = {}) {
  if (down) {
    if (ball.vy <= 0) return false;
    if (!(ball.prevY + radius <= paddleY && ball.y + radius >= paddleY)) return false;
  } else {
    if (ball.vy >= 0) return false;
    if (!(ball.prevY - radius >= paddleY && ball.y - radius <= paddleY)) return false;
  }
  return Math.abs(ball.x - paddleX) <= halfWidth + radius * 0.6;
}

// Terugkaatsen met een hoek die afhangt van waar op de peddel je hem raakt.
export function reflectPaddle(ball, paddleX, halfWidth, {
  down = false,
  maxAngle = 1.0,
  speedStep = 1.035,
  speedMax = 130,
} = {}) {
  const offset = Math.max(-1, Math.min(1, (ball.x - paddleX) / halfWidth));
  const angle = offset * maxAngle;
  ball.speed = Math.min(speedMax, ball.speed * speedStep);
  ball.vx = Math.sin(angle) * ball.speed;
  ball.vy = Math.cos(angle) * ball.speed * (down ? 1 : -1);
}

export function clampPaddle(x, halfWidth, width = FIELD_W) {
  return Math.max(halfWidth, Math.min(width - halfWidth, x));
}

// Botsing met een rechthoek (steen). Geeft null of de kant die geraakt is,
// bepaald op de kortste weg naar buiten.
export function hitRect(ball, radius, rect) {
  const closestX = Math.max(rect.x, Math.min(ball.x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(ball.y, rect.y + rect.h));
  const dx = ball.x - closestX;
  const dy = ball.y - closestY;
  if (dx * dx + dy * dy > radius * radius) return null;

  // Hoeveel moet de bal terug om er weer buiten te liggen?
  const left = ball.x + radius - rect.x;
  const right = rect.x + rect.w - (ball.x - radius);
  const top = ball.y + radius - rect.y;
  const bottom = rect.y + rect.h - (ball.y - radius);
  const min = Math.min(left, right, top, bottom);

  if (min === left) return 'left';
  if (min === right) return 'right';
  if (min === top) return 'top';
  return 'bottom';
}

export function reflectSide(ball, side, radius, rect) {
  if (side === 'left') { ball.x = rect.x - radius; ball.vx = -Math.abs(ball.vx); }
  else if (side === 'right') { ball.x = rect.x + rect.w + radius; ball.vx = Math.abs(ball.vx); }
  else if (side === 'top') { ball.y = rect.y - radius; ball.vy = -Math.abs(ball.vy); }
  else { ball.y = rect.y + rect.h + radius; ball.vy = Math.abs(ball.vy); }
}
