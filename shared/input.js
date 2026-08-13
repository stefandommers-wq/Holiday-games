// Touch-invoer. Pointer events dekken vinger, pen en muis in één keer.
// Swipes vuren al tijdens het slepen (dus niet pas bij loslaten), want dat
// voelt op een telefoon direct; daarna verspringt het ankerpunt zodat je
// door kunt swipen zonder los te laten.

const SWIPE_MIN = 26;      // CSS-pixels voordat het een swipe heet
const TAP_MAX_MOVE = 14;   // daaronder is het een tik
const TAP_MAX_MS = 350;

export function createInput(el, handlers = {}) {
  const h = {
    onTap: null,
    onSwipe: null,
    onDragStart: null,
    onDrag: null,
    onDragEnd: null,
    ...handlers,
  };

  let active = null;
  let state = null;

  function pos(ev) {
    const rect = el.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  function down(ev) {
    if (active !== null) return;
    active = ev.pointerId;
    const p = pos(ev);
    el.setPointerCapture?.(ev.pointerId);
    ev.preventDefault();
    state = {
      startX: p.x, startY: p.y,
      anchorX: p.x, anchorY: p.y,
      lastX: p.x, lastY: p.y,
      moved: 0,
      swiped: false,
      time: performance.now(),
    };
    h.onDragStart?.(p.x, p.y);
  }

  function move(ev) {
    if (active !== ev.pointerId || !state) return;
    ev.preventDefault();
    const p = pos(ev);
    state.moved = Math.max(state.moved, Math.hypot(p.x - state.startX, p.y - state.startY));
    state.lastX = p.x;
    state.lastY = p.y;
    h.onDrag?.(p.x, p.y);

    if (h.onSwipe) {
      const dx = p.x - state.anchorX;
      const dy = p.y - state.anchorY;
      if (Math.abs(dx) >= SWIPE_MIN || Math.abs(dy) >= SWIPE_MIN) {
        const dir = Math.abs(dx) > Math.abs(dy)
          ? (dx > 0 ? 'right' : 'left')
          : (dy > 0 ? 'down' : 'up');
        state.swiped = true;
        state.anchorX = p.x;
        state.anchorY = p.y;
        h.onSwipe(dir, { dx, dy });
      }
    }
  }

  function up(ev) {
    if (active !== ev.pointerId || !state) return;
    ev.preventDefault();
    const p = pos(ev);
    const dt = performance.now() - state.time;
    h.onDragEnd?.(p.x, p.y);
    if (!state.swiped && state.moved <= TAP_MAX_MOVE && dt <= TAP_MAX_MS) {
      h.onTap?.(p.x, p.y);
    }
    el.releasePointerCapture?.(ev.pointerId);
    active = null;
    state = null;
  }

  function cancel(ev) {
    if (active !== ev.pointerId) return;
    if (state) h.onDragEnd?.(state.lastX, state.lastY);
    active = null;
    state = null;
  }

  el.addEventListener('pointerdown', down, { passive: false });
  el.addEventListener('pointermove', move, { passive: false });
  el.addEventListener('pointerup', up, { passive: false });
  el.addEventListener('pointercancel', cancel, { passive: false });

  return {
    destroy() {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      active = null;
      state = null;
    },
  };
}

// Toetsenbord is een extraatje voor desktop, nooit de enige manier.
export function createKeys(map) {
  function onKey(ev) {
    const fn = map[ev.key];
    if (fn) {
      ev.preventDefault();
      fn();
    }
  }
  window.addEventListener('keydown', onKey);
  return { destroy() { window.removeEventListener('keydown', onKey); } };
}
