// Canvas dat scherp blijft op retina. De tekencode werkt in CSS-pixels;
// de transform schaalt naar devicePixelRatio.

export function createSurface(canvas, onResize) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const surface = {
    canvas,
    ctx,
    width: 0,   // CSS-pixels
    height: 0,  // CSS-pixels
    dpr: 1,
  };

  // De eerste meting is geen 'resize': het spel tekent daarna zelf zijn eerste beeld.
  let first = true;

  function apply() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);

    const changed = surface.width !== w || surface.height !== h || surface.dpr !== dpr;
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    surface.width = w;
    surface.height = h;
    surface.dpr = dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (first) {
      first = false;
      return;
    }
    if (changed && typeof onResize === 'function') onResize(w, h);
  }

  let observer = null;
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(() => apply());
    observer.observe(canvas);
  }
  const onWindowResize = () => apply();
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('orientationchange', onWindowResize);

  apply();

  surface.refresh = apply;
  surface.destroy = () => {
    if (observer) observer.disconnect();
    window.removeEventListener('resize', onWindowResize);
    window.removeEventListener('orientationchange', onWindowResize);
  };

  return surface;
}

// Rechthoek met ronde hoeken — Safari kent ctx.roundRect pas sinds 16.
export function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
