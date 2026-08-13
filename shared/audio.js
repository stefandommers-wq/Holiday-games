// Geluid via Web Audio. Geen samples, alleen oscillatoren — scheelt bestanden
// en past bij het thema. De AudioContext wordt pas aangemaakt na de eerste tik,
// anders blijft hij op iOS in 'suspended' hangen.

let ctx = null;
let master = null;
let enabled = true;
let unlocked = false;

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.22;
  master.connect(ctx.destination);
  return ctx;
}

export const audio = {
  setEnabled(value) {
    enabled = !!value;
    if (!enabled && ctx) {
      // Direct stil, niet wachten tot de laatste toon uitklinkt.
      master.gain.setValueAtTime(0, ctx.currentTime);
    } else if (enabled && master && ctx) {
      master.gain.setValueAtTime(0.22, ctx.currentTime);
    }
  },

  get enabled() {
    return enabled;
  },

  // Aanroepen vanuit een echte gebruikersinteractie (pointerdown/click).
  unlock() {
    if (unlocked) return;
    const c = ensureContext();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    unlocked = true;
  },

  resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  },

  tone({ freq = 440, dur = 0.08, type = 'square', gain = 0.6, slide = 0 } = {}) {
    if (!enabled || !unlocked) return;
    const c = ensureContext();
    if (!c) return;
    const now = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slide) osc.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), now + dur);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  },

  sequence(notes) {
    if (!enabled || !unlocked) return;
    let delay = 0;
    for (const note of notes) {
      const wait = note.after ?? 0;
      delay += wait;
      setTimeout(() => audio.tone(note), delay * 1000);
    }
  },

  // Vaste setjes zodat alle spelletjes hetzelfde klinken.
  blip() { audio.tone({ freq: 660, dur: 0.05, type: 'square', gain: 0.4 }); },
  pickup() { audio.sequence([{ freq: 720, dur: 0.06 }, { after: 0.06, freq: 980, dur: 0.09 }]); },
  bounce() { audio.tone({ freq: 380, dur: 0.05, type: 'triangle', gain: 0.5 }); },
  hit() { audio.tone({ freq: 240, dur: 0.07, type: 'square', gain: 0.5, slide: -80 }); },
  shoot() { audio.tone({ freq: 880, dur: 0.05, type: 'sawtooth', gain: 0.25, slide: -400 }); },
  levelUp() {
    audio.sequence([
      { freq: 523, dur: 0.08 },
      { after: 0.09, freq: 659, dur: 0.08 },
      { after: 0.09, freq: 784, dur: 0.14 },
    ]);
  },
  gameOver() {
    audio.sequence([
      { freq: 392, dur: 0.14, type: 'square' },
      { after: 0.15, freq: 311, dur: 0.14, type: 'square' },
      { after: 0.15, freq: 233, dur: 0.28, type: 'square' },
    ]);
  },
};
