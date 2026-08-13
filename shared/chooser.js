// Een keuzelijst die op het canvas zelf getekend wordt: titel met een paar
// grote knoppen eronder. Wordt gebruikt voor 'hoe pittig?' bij Pong en
// 'welk level?' bij Breakout, zodat zo'n keuze bij het spel blijft horen.

const BTN_H = 52;   // ruim boven de 44 punten
const GAP = 12;

export function createChooser({ title = '', subtitle = '', options = [], accent = '#22e0ff' }) {
  let rects = [];

  function layout(width, height) {
    const w = Math.min(260, width - 60);
    const total = options.length * BTN_H + (options.length - 1) * GAP;
    const top = height / 2 - total / 2 + 24;
    rects = options.map((opt, i) => ({
      opt,
      x: (width - w) / 2,
      y: top + i * (BTN_H + GAP),
      w,
      h: BTN_H,
    }));
    return { top };
  }

  return {
    draw(ctx, width, height) {
      const { top } = layout(width, height);

      ctx.fillStyle = 'rgba(5, 6, 13, .82)';
      ctx.fillRect(0, 0, width, height);

      ctx.textAlign = 'center';
      if (title) {
        ctx.fillStyle = accent;
        ctx.font = '800 22px -apple-system, system-ui, sans-serif';
        ctx.fillText(title.toUpperCase(), width / 2, top - 54);
      }
      if (subtitle) {
        ctx.fillStyle = '#8b96bd';
        ctx.font = '400 13px -apple-system, system-ui, sans-serif';
        ctx.fillText(subtitle, width / 2, top - 28);
      }

      for (const r of rects) {
        ctx.fillStyle = r.opt.primary ? accent : 'rgba(255,255,255,.07)';
        ctx.strokeStyle = r.opt.primary ? accent : 'rgba(42,51,88,1)';
        ctx.lineWidth = 1;
        roundPath(ctx, r.x, r.y, r.w, r.h, 12);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = r.opt.primary ? '#04060f' : '#eaf0ff';
        ctx.font = '700 15px -apple-system, system-ui, sans-serif';
        ctx.fillText(r.opt.label, r.x + r.w / 2, r.y + r.h / 2 + 5);

        if (r.opt.note) {
          ctx.fillStyle = r.opt.primary ? 'rgba(4,6,15,.7)' : '#8b96bd';
          ctx.font = '400 11px -apple-system, system-ui, sans-serif';
          ctx.fillText(r.opt.note, r.x + r.w / 2, r.y + r.h - 8);
        }
      }
    },

    hit(x, y) {
      for (const r of rects) {
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.opt.value;
      }
      return null;
    },
  };
}

function roundPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
