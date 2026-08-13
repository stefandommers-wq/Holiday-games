// Gedeelde schermelementen: HUD-balk en de dialoogpanelen. Elk spel gebruikt
// deze, zodat menu en spel als één product voelen.

const overlay = document.getElementById('overlay');
const panel = document.getElementById('overlay-panel');
const hudEl = document.getElementById('hud');

let closeDialog = null;

export function setHud(items) {
  if (!items || items.length === 0) {
    hudEl.innerHTML = '';
    return;
  }
  hudEl.innerHTML = items
    .map((it) => `<span class="hud-item">${escapeHtml(it.label)} <b>${escapeHtml(String(it.value))}</b></span>`)
    .join('');
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Toont een paneel en wacht op een knop. Geeft de waarde van die knop terug.
export function dialog({ title, html = '', accent = 'var(--cyan)', buttons = [], dismissible = false }) {
  closeDialog?.(null);

  return new Promise((resolve) => {
    panel.style.setProperty('--accent', accent);
    panel.innerHTML = `
      ${title ? `<h3>${escapeHtml(title)}</h3>` : ''}
      ${html}
      <div class="dialog-buttons"></div>
    `;
    const holder = panel.querySelector('.dialog-buttons');
    for (const btn of buttons) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `btn${btn.variant ? ` ${btn.variant}` : ''}`;
      el.textContent = btn.label;
      el.addEventListener('click', () => finish(btn.value));
      holder.appendChild(el);
    }

    overlay.hidden = false;

    function onBackdrop(ev) {
      if (dismissible && ev.target === overlay) finish(null);
    }
    overlay.addEventListener('click', onBackdrop);

    function finish(value) {
      overlay.removeEventListener('click', onBackdrop);
      overlay.hidden = true;
      panel.innerHTML = '';
      closeDialog = null;
      resolve(value);
    }

    closeDialog = finish;
  });
}

export function closeAnyDialog() {
  closeDialog?.(null);
}

export function isDialogOpen() {
  return closeDialog !== null;
}

export function statsHtml(items) {
  return `<div class="stats">${items
    .map((it) => `<div class="stat"><span>${escapeHtml(it.label)}</span><b>${escapeHtml(String(it.value))}</b></div>`)
    .join('')}</div>`;
}
