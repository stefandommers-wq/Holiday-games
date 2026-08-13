// Gameloop met vaste tijdstap. update() krijgt altijd exact dezelfde dt,
// zodat de fysica op elk toestel gelijk loopt. render() draait één keer per frame.

const MAX_FRAME = 0.25; // seconden; na een pauze niet honderd stappen inhalen

export function createLoop({ update, render, step = 1 / 60 }) {
  let raf = 0;
  let last = 0;
  let acc = 0;
  let running = false;

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);

    let delta = (now - last) / 1000;
    last = now;
    if (!isFinite(delta) || delta < 0) delta = 0;
    if (delta > MAX_FRAME) delta = MAX_FRAME;

    acc += delta;
    let steps = 0;
    while (acc >= step && steps < 8) {
      update(step);
      acc -= step;
      steps++;
    }
    if (steps === 8) acc = 0;

    render(acc / step);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      acc = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    get running() {
      return running;
    },
  };
}
