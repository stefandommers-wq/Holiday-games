// De vijf spelletjes. De schil kent alleen deze lijst; wat er in een module
// gebeurt weet hij niet.

export const GAMES = [
  {
    id: 'snake',
    name: 'Snake',
    sub: 'Eet appels, word langer, raak niets.',
    accent: 'var(--green)',
    module: './games/snake.js',
    levels: true,
    levelLabel: 'Level',
  },
  {
    id: 'pong',
    name: 'Pong',
    sub: 'Eerste op elf punten wint.',
    accent: 'var(--cyan)',
    module: './games/pong.js',
    levels: false,
  },
  {
    id: 'breakout',
    name: 'Breakout',
    sub: 'Vijf levels stenen slopen.',
    accent: 'var(--yellow)',
    module: './games/breakout.js',
    levels: true,
    levelLabel: 'Level',
  },
  {
    id: 'blokken',
    name: 'Blokken',
    sub: 'Vallende vormen, volle rijen weg.',
    accent: 'var(--purple)',
    module: './games/blokken.js',
    levels: true,
    levelLabel: 'Niveau',
  },
  {
    id: 'invasie',
    name: 'Ruimte-invasie',
    sub: 'Golf na golf tegenhouden.',
    accent: 'var(--pink)',
    module: './games/invasie.js',
    levels: true,
    levelLabel: 'Golf',
  },
  {
    id: 'kisten',
    name: 'Kisten',
    sub: 'Duw elke kist op zijn plek.',
    accent: 'var(--orange)',
    module: './games/kisten.js',
    levels: true,
    levelLabel: 'Level',
    // Puzzel zonder score: alleen hoe ver je bent gekomen telt.
    score: false,
  },
];

export const GAME_IDS = GAMES.map((g) => g.id);

export function findGame(id) {
  return GAMES.find((g) => g.id === id) || null;
}
