// Tijdelijk scherm voor spelletjes die nog gebouwd worden. Toont de naam en
// een teller die doorloopt. Sluit je de app en kom je terug, dan telt hij
// verder op hetzelfde getal — zo is te zien dat hervatten werkt.

import { createSurface } from '../shared/surface.js';
import { createLoop } from '../shared/loop.js';

let surface = null;
let loop = null;
let api = null;
let seconds = 0;

function draw() {
  if (!surface) return;
  const { ctx, width, height } = surface;
  ctx.fillStyle = '#05060d';
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#8b96bd';
  ctx.font = '600 13px -apple-system, system-ui, sans-serif';
  ctx.fillText('BINNENKORT', width / 2, height / 2 - 60);

  ctx.fillStyle = '#eaf0ff';
  ctx.font = '800 26px -apple-system, system-ui, sans-serif';
  ctx.fillText(api.name.toUpperCase(), width / 2, height / 2 - 24);

  ctx.fillStyle = '#22e0ff';
  ctx.font = '700 44px ui-monospace, Menlo, monospace';
  ctx.fillText(seconds.toFixed(1), width / 2, height / 2 + 34);

  ctx.fillStyle = '#8b96bd';
  ctx.font = '400 12px -apple-system, system-ui, sans-serif';
  ctx.fillText('Deze teller loopt door na hervatten.', width / 2, height / 2 + 66);
}

export function start(canvasEl, gameApi) {
  api = gameApi;
  seconds = 0;
  surface = createSurface(canvasEl, () => draw());
  api.setHud([{ label: 'Tijd', value: '0.0' }]);
  let shown = -1;
  loop = createLoop({
    update(dt) {
      seconds += dt;
      const tenths = Math.floor(seconds * 10);
      if (tenths !== shown) {
        shown = tenths;
        api.setHud([{ label: 'Tijd', value: seconds.toFixed(1) }]);
      }
    },
    render: draw,
  });
  loop.start();
}

export function stop() {
  loop?.stop();
  surface?.destroy();
  loop = null;
  surface = null;
}

export function pause() { loop?.stop(); }
export function resume() { loop?.start(); }

export function serialize() {
  return { seconds };
}

export function restore(state) {
  if (state && typeof state.seconds === 'number') seconds = state.seconds;
  draw();
}
