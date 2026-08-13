// Opslag in localStorage. Drie sleutels per spel plus één instellingen-object.
//   arcade.highscore.<spel>  hoogste score
//   arcade.progress.<spel>   hoogst bereikte level / golf
//   arcade.state.<spel>      lopend potje
//   arcade.settings          instellingen voor de hele app

const HIGH = (id) => `arcade.highscore.${id}`;
const PROG = (id) => `arcade.progress.${id}`;
const STATE = (id) => `arcade.state.${id}`;
const SETTINGS = 'arcade.settings';

const DEFAULT_SETTINGS = {
  sound: true,
  haptics: false,
  dpad: true,
  installHintDismissed: false,
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    // Privémodus of vol: niet crashen, spelen gaat gewoon door.
    return false;
  }
}

function remove(key) {
  try { localStorage.removeItem(key); } catch (err) { /* negeren */ }
}

export const storage = {
  getHighscore(id) {
    const value = read(HIGH(id), 0);
    return typeof value === 'number' && isFinite(value) ? value : 0;
  },

  // Geeft true terug als dit een nieuw record is.
  submitScore(id, score) {
    if (typeof score !== 'number' || !isFinite(score)) return false;
    const best = storage.getHighscore(id);
    if (score > best) {
      write(HIGH(id), Math.floor(score));
      return true;
    }
    return false;
  },

  getProgress(id) {
    const value = read(PROG(id), 1);
    return typeof value === 'number' && isFinite(value) ? value : 1;
  },

  submitProgress(id, level) {
    if (typeof level !== 'number' || !isFinite(level)) return false;
    if (level > storage.getProgress(id)) {
      write(PROG(id), Math.floor(level));
      return true;
    }
    return false;
  },

  getState(id) {
    const value = read(STATE(id), null);
    return value && typeof value === 'object' ? value : null;
  },

  hasState(id) {
    return storage.getState(id) !== null;
  },

  setState(id, state) {
    if (!state || typeof state !== 'object') {
      storage.clearState(id);
      return;
    }
    write(STATE(id), state);
  },

  clearState(id) {
    remove(STATE(id));
  },

  getSettings() {
    return { ...DEFAULT_SETTINGS, ...read(SETTINGS, {}) };
  },

  updateSettings(patch) {
    const next = { ...storage.getSettings(), ...patch };
    write(SETTINGS, next);
    return next;
  },

  // Alles wat de app bewaart, als plat object — voor de exportknop.
  exportAll(ids) {
    const out = {
      app: 'arcade',
      exported: new Date().toISOString(),
      settings: storage.getSettings(),
      games: {},
    };
    for (const id of ids) {
      out.games[id] = {
        highscore: storage.getHighscore(id),
        progress: storage.getProgress(id),
        hasSavedGame: storage.hasState(id),
      };
    }
    return out;
  },

  wipe(ids) {
    for (const id of ids) {
      remove(HIGH(id));
      remove(PROG(id));
      remove(STATE(id));
    }
    remove(SETTINGS);
  },
};
