// De schil. Kent het menu, de router, het opslaan van een lopend potje en
// het pauzeren. Van de inhoud van een spel weet hij niets.

import { GAMES, GAME_IDS, findGame } from './shared/catalog.js';
import { storage } from './shared/storage.js';
import { audio } from './shared/audio.js';
import { dialog, closeAnyDialog, isDialogOpen, setHud, statsHtml, escapeHtml } from './shared/ui.js';

// Loopt gelijk met CACHE_VERSION in sw.js, zodat je op het toestel kunt zien
// welke versie er draait.
const APP_VERSION = 'v10';

const screens = {
  menu: document.getElementById('screen-menu'),
  game: document.getElementById('screen-game'),
  settings: document.getElementById('screen-settings'),
};
const tilesEl = document.getElementById('tiles');
const canvas = document.getElementById('game-canvas');
const controlsEl = document.getElementById('controls');
const gameTitleEl = document.getElementById('game-title');
const settingsBodyEl = document.getElementById('settings-body');

// Huidige sessie: { def, module, running }
let session = null;
let pendingReload = false;

/* ---------------- Router ---------------- */

function parseHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  if (!raw) return { screen: 'menu' };
  const [part, id] = raw.split('/');
  if (part === 'instellingen') return { screen: 'settings' };
  if (part === 'spel' && findGame(id)) return { screen: 'game', id };
  return { screen: 'menu' };
}

function go(hash) {
  if (location.hash === hash) onRoute();
  else location.hash = hash;
}

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
}

async function onRoute() {
  const route = parseHash();

  if (session && (route.screen !== 'game' || route.id !== session.def.id)) {
    await endSession({ save: true });
  }

  if (route.screen === 'game') {
    showScreen('game');
    if (!session) await openGame(route.id);
    return;
  }

  closeAnyDialog();
  if (route.screen === 'settings') {
    renderSettings();
    showScreen('settings');
    return;
  }

  renderMenu();
  showScreen('menu');
  if (pendingReload) {
    pendingReload = false;
    location.reload();
  }
}

/* ---------------- Beginscherm-hint ---------------- */

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function installSteps() {
  if (isIOS()) {
    return `<ol>
      <li>Tik op de deelknop onderin Safari (het vierkantje met de pijl omhoog).</li>
      <li>Kies <b>Zet op beginscherm</b>.</li>
      <li>Start Arcade voortaan vanaf het beginscherm.</li>
    </ol>`;
  }
  return `<ol>
    <li>Tik op de menuknop van je browser (drie puntjes).</li>
    <li>Kies <b>App installeren</b> of <b>Toevoegen aan startscherm</b>.</li>
    <li>Start Arcade voortaan vanaf het beginscherm.</li>
  </ol>`;
}

function renderInstallHint() {
  const holder = document.getElementById('install-hint');
  if (!holder) return;
  const settings = storage.getSettings();
  if (isStandalone() || settings.installHintDismissed) {
    holder.innerHTML = '';
    holder.hidden = true;
    return;
  }
  const how = isIOS()
    ? 'deelknop onderin Safari → <b>Zet op beginscherm</b>'
    : 'browsermenu → <b>Toevoegen aan startscherm</b>';
  holder.hidden = false;
  holder.innerHTML = `
    <div class="hint-card compact">
      <span><b>Zet Arcade op je beginscherm</b><br>${how}. Daarna werkt alles zonder internet.</span>
      <button class="link-btn" id="hint-dismiss" type="button" aria-label="Hint niet meer tonen">Sluiten</button>
    </div>
  `;
  holder.querySelector('#hint-dismiss').addEventListener('click', () => {
    storage.updateSettings({ installHintDismissed: true });
    renderInstallHint();
  });
}

/* ---------------- Menu ---------------- */

function renderMenu() {
  renderInstallHint();
  tilesEl.innerHTML = '';
  for (const def of GAMES) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tile';
    btn.style.setProperty('--accent', def.accent);

    const high = storage.getHighscore(def.id);
    const progress = storage.getProgress(def.id);
    const chips = [];
    // Een puzzel zonder score toont geen 'Top', alleen hoe ver je bent.
    if (def.score !== false) chips.push(`<span class="chip">Top ${high}</span>`);
    if (def.levels && progress > 1) {
      chips.push(`<span class="chip">${escapeHtml(def.levelLabel || 'Level')} ${progress}</span>`);
    }
    if (storage.hasState(def.id)) {
      chips.push('<span class="chip resume">Verder</span>');
    }

    btn.innerHTML = `
      <span class="tile-name">${escapeHtml(def.name)}</span>
      <span class="tile-sub">${escapeHtml(def.sub)}</span>
      <span class="tile-meta">${chips.join('')}</span>
    `;
    btn.addEventListener('click', () => {
      audio.unlock();
      go(`#/spel/${def.id}`);
    });
    li.appendChild(btn);
    tilesEl.appendChild(li);
  }
}

/* ---------------- Spelsessie ---------------- */

function makeApi(def) {
  return {
    id: def.id,
    name: def.name,
    accent: def.accent,
    // Het hele speelvlak, inclusief de rand rond het canvas. Spellen luisteren
    // hierop zodat een duim naast het canvas ook nog stuurt.
    stage: document.getElementById('stage'),
    levelLabel: def.levelLabel || 'Level',
    audio,
    dialog,
    settings: () => storage.getSettings(),

    getHighscore: () => storage.getHighscore(def.id),
    getProgress: () => storage.getProgress(def.id),
    submitScore: (score) => storage.submitScore(def.id, score),
    submitProgress: (level) => storage.submitProgress(def.id, level),

    setHud,
    // Spellen die extra knoppen willen (bijvoorbeeld een D-pad) zetten die hier neer.
    setControls(node) {
      controlsEl.innerHTML = '';
      if (node) controlsEl.appendChild(node);
    },

    // Nu opslaan, bijvoorbeeld na een level.
    save: () => saveSession(),

    gameOver: (info) => handleGameOver(info),
    exit: () => go('#/'),
  };
}

async function openGame(id) {
  const def = findGame(id);
  if (!def) { go('#/'); return; }

  gameTitleEl.textContent = def.name;
  setHud([]);
  controlsEl.innerHTML = '';
  document.documentElement.style.setProperty('--accent', def.accent);

  let module;
  try {
    module = await import(def.module);
  } catch (err) {
    await dialog({
      title: 'Oeps',
      html: `<p>${escapeHtml(def.name)} kon niet geladen worden.</p>`,
      buttons: [{ label: 'Terug', value: 'back' }],
    });
    go('#/');
    return;
  }

  session = { def, module, api: makeApi(def), paused: false };

  const saved = storage.getState(def.id);
  let resumeState = null;
  if (saved) {
    const choice = await dialog({
      title: 'Verder spelen?',
      html: '<p>Er staat nog een potje voor je klaar.</p>',
      accent: def.accent,
      buttons: [
        { label: 'Verder', value: 'resume' },
        { label: 'Opnieuw beginnen', value: 'new', variant: 'secondary' },
      ],
    });
    // Als de gebruiker ondertussen naar het menu is gegaan, niets meer starten.
    if (!session) return;
    if (choice === 'resume') resumeState = saved;
    else storage.clearState(def.id);
  }

  startModule(resumeState);
}

function startModule(state) {
  const { module, api } = session;
  module.start(canvas, api);
  if (state) {
    try {
      module.restore(state);
    } catch (err) {
      // Kapotte of oude bewaarde toestand: gewoon opnieuw beginnen.
      storage.clearState(session.def.id);
      module.stop();
      module.start(canvas, api);
    }
  }
}

function saveSession() {
  if (!session) return;
  let state = null;
  try {
    state = session.module.serialize();
  } catch (err) {
    state = null;
  }
  if (state) storage.setState(session.def.id, state);
  else storage.clearState(session.def.id);
}

async function endSession({ save }) {
  if (!session) return;
  if (save) saveSession();
  const current = session;
  session = null;
  closeAnyDialog();
  try { current.module.stop(); } catch (err) { /* negeren */ }
  controlsEl.innerHTML = '';
  setHud([]);
}

function pauseSession() {
  if (!session || session.paused) return;
  session.paused = true;
  session.module.pause?.();
  saveSession();
}

function resumeSession() {
  if (!session || !session.paused) return;
  session.paused = false;
  audio.resume();
  session.module.resume?.();
}

async function showPauseDialog() {
  if (!session) return;
  pauseSession();
  const def = session.def;
  const choice = await dialog({
    title: 'Pauze',
    accent: def.accent,
    buttons: [
      { label: 'Verder spelen', value: 'resume' },
      { label: 'Terug naar menu', value: 'menu', variant: 'secondary' },
    ],
  });
  if (!session) return;
  if (choice === 'menu') go('#/');
  else resumeSession();
}

async function handleGameOver({ score = 0, level = null, title = 'Game over', stats = [] } = {}) {
  if (!session) return;
  const def = session.def;

  const isRecord = storage.submitScore(def.id, score);
  if (def.levels && typeof level === 'number') storage.submitProgress(def.id, level);
  storage.clearState(def.id);
  session.paused = true;
  session.over = true;
  session.module.pause?.();
  audio.gameOver();

  const rows = [
    { label: 'Score', value: score },
    { label: 'Beste', value: storage.getHighscore(def.id) },
    ...(def.levels && typeof level === 'number' ? [{ label: def.levelLabel || 'Level', value: level }] : []),
    ...stats,
  ];

  const choice = await dialog({
    title,
    accent: def.accent,
    html: `${isRecord ? '<p>Nieuw record!</p>' : ''}${statsHtml(rows)}`,
    buttons: [
      { label: 'Opnieuw spelen', value: 'again' },
      { label: 'Terug naar menu', value: 'menu', variant: 'secondary' },
    ],
  });

  if (!session) return;
  if (choice === 'again') {
    session.module.stop();
    controlsEl.innerHTML = '';
    session.paused = false;
    session.over = false;
    startModule(null);
  } else {
    go('#/');
  }
}

/* ---------------- Instellingen ---------------- */

function renderSettings() {
  const s = storage.getSettings();
  settingsBodyEl.innerHTML = `
    <div class="setting-row">
      <span class="label">Geluid<small>Piepjes en effecten</small></span>
      <button class="switch" id="set-sound" role="switch" aria-checked="${s.sound}" aria-label="Geluid"></button>
    </div>
    <div class="setting-row">
      <span class="label">D-pad bij Snake<small>Knoppen onderaan naast swipen. Kisten heeft ze altijd.</small></span>
      <button class="switch" id="set-dpad" role="switch" aria-checked="${s.dpad}" aria-label="D-pad"></button>
    </div>
    <p class="section-title">Op je beginscherm</p>
    ${isStandalone()
      ? '<div class="hint-card">Arcade draait al vanaf je beginscherm. Alles werkt nu ook zonder internet.</div>'
      : `<div class="hint-card"><b>Zo zet je Arcade op je beginscherm</b>${installSteps()}</div>`}
    <p class="section-title">Gegevens</p>
    <button class="btn secondary" id="set-export" type="button">Scores exporteren</button>
    <button class="btn danger" id="set-wipe" type="button">Alles wissen</button>
    <p class="footnote">Scores staan alleen op dit toestel. Verwijder je de app van het beginscherm, dan gaan ze weg.</p>
    <p class="footnote" id="version-note"></p>
  `;

  const note = settingsBodyEl.querySelector('#version-note');
  if (note) note.textContent = `Arcade ${APP_VERSION}`;

  settingsBodyEl.querySelector('#set-sound').addEventListener('click', (ev) => {
    const next = !(storage.getSettings().sound);
    storage.updateSettings({ sound: next });
    audio.setEnabled(next);
    ev.currentTarget.setAttribute('aria-checked', String(next));
    if (next) { audio.unlock(); audio.blip(); }
  });

  settingsBodyEl.querySelector('#set-dpad').addEventListener('click', (ev) => {
    const next = !(storage.getSettings().dpad);
    storage.updateSettings({ dpad: next });
    ev.currentTarget.setAttribute('aria-checked', String(next));
  });

  settingsBodyEl.querySelector('#set-export').addEventListener('click', exportScores);

  settingsBodyEl.querySelector('#set-wipe').addEventListener('click', async () => {
    const choice = await dialog({
      title: 'Alles wissen?',
      html: '<p>Scores, levels en bewaarde potjes verdwijnen van dit toestel.</p>',
      buttons: [
        { label: 'Ja, wissen', value: 'yes', variant: 'danger' },
        { label: 'Annuleren', value: 'no', variant: 'secondary' },
      ],
    });
    if (choice === 'yes') {
      storage.wipe(GAME_IDS);
      renderSettings();
    }
  });
}

async function exportScores() {
  const data = JSON.stringify(storage.exportAll(GAME_IDS), null, 2);
  const file = new Blob([data], { type: 'application/json' });
  if (navigator.share && navigator.canShare?.({ files: [new File([file], 'arcade-scores.json', { type: 'application/json' })] })) {
    try {
      await navigator.share({
        files: [new File([file], 'arcade-scores.json', { type: 'application/json' })],
        title: 'Arcade scores',
      });
      return;
    } catch (err) { /* gebruiker annuleerde: val terug op downloaden */ }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'arcade-scores.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------------- App-niveau gebeurtenissen ---------------- */

document.getElementById('btn-back').addEventListener('click', () => go('#/'));
document.getElementById('btn-settings-back').addEventListener('click', () => go('#/'));
document.getElementById('btn-settings').addEventListener('click', () => go('#/instellingen'));
document.getElementById('btn-pause').addEventListener('click', () => showPauseDialog());

window.addEventListener('hashchange', onRoute);

// iOS geeft geen betrouwbaar afsluitmoment: opslaan bij elk moment dat kan.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    saveSession();
    pauseSession();
  } else {
    audio.resume();
    onReturn();
  }
});
window.addEventListener('pagehide', () => {
  saveSession();
  pauseSession();
});
// Komt de pagina terug uit de bfcache van Safari, dan is er geen
// visibilitychange. Zonder dit blijft het spel voorgoed gepauzeerd staan.
window.addEventListener('pageshow', () => {
  audio.resume();
  onReturn();
});

// Terug in beeld: niet zomaar verder spelen, maar het pauzepaneel tonen.
function onReturn() {
  if (!session || !session.paused || session.over) return;
  if (isDialogOpen() || document.hidden) return;
  showPauseDialog();
}

// Eerste tik ontgrendelt de AudioContext.
document.addEventListener('pointerdown', () => audio.unlock(), { once: true, passive: true });

/* ---------------- Service worker ---------------- */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            // Nieuwe versie klaar. Niet midden in een potje herladen.
            pendingReload = true;
            if (!session) { pendingReload = false; location.reload(); }
          }
        });
      });
    } catch (err) { /* offline of niet ondersteund: app werkt gewoon door */ }
  });
}

/* ---------------- Start ---------------- */

audio.setEnabled(storage.getSettings().sound);
registerServiceWorker();
onRoute();
