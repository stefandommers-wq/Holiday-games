// Genereert de app-iconen als PNG. Alleen ontwikkelgereedschap: draait met
// `node tools/make-icons.mjs` en heeft geen npm-pakketten nodig. De app zelf
// gebruikt de PNG's uit /icons en heeft dit script niet nodig.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Pixel-art alien, 11 breed en 8 hoog.
const ALIEN = [
  '..#.....#..',
  '...#...#...',
  '..#######..',
  '.##.###.##.',
  '###########',
  '#.#######.#',
  '#.#.....#.#',
  '...##.##...',
];

const BG = [0x0b, 0x0d, 0x17];
const CYAN = [0x22, 0xe0, 0xff];
const PINK = [0xff, 0x2e, 0x88];

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bitdiepte
  ihdr[9] = 2;   // kleurtype truecolor
  const raw = Buffer.alloc((size * 3 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // geen filter
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixels(x, y);
      raw[o++] = r; raw[o++] = g; raw[o++] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeIcon(size, { inset = 0.16 } = {}) {
  const cols = ALIEN[0].length;
  const rows = ALIEN.length;
  const cell = Math.floor((size * (1 - inset * 2)) / cols);
  const artW = cell * cols;
  const artH = cell * rows;
  const offX = Math.round((size - artW) / 2);
  const offY = Math.round((size - artH) / 2);

  return png(size, (x, y) => {
    // Achtergrond met een zachte verloop naar paars in de hoek.
    const t = (x / size) * 0.5 + (1 - y / size) * 0.5;
    const bg = [
      Math.round(BG[0] + t * 18),
      Math.round(BG[1] + t * 16),
      Math.round(BG[2] + t * 34),
    ];
    const cx = x - offX;
    const cy = y - offY;
    if (cx >= 0 && cy >= 0 && cx < artW && cy < artH) {
      const col = Math.floor(cx / cell);
      const row = Math.floor(cy / cell);
      if (ALIEN[row][col] === '#') {
        const mix = row / (rows - 1);
        return [
          Math.round(CYAN[0] + (PINK[0] - CYAN[0]) * mix),
          Math.round(CYAN[1] + (PINK[1] - CYAN[1]) * mix),
          Math.round(CYAN[2] + (PINK[2] - CYAN[2]) * mix),
        ];
      }
    }
    return bg;
  });
}

mkdirSync(join(root, 'icons'), { recursive: true });
const targets = [
  ['icons/icon-192.png', 192, 0.14],
  ['icons/icon-512.png', 512, 0.14],
  ['icons/icon-maskable-512.png', 512, 0.26], // extra lucht voor de maskervorm
  ['icons/apple-touch-icon.png', 180, 0.14],
];
for (const [file, size, inset] of targets) {
  writeFileSync(join(root, file), makeIcon(size, { inset }));
  console.log('geschreven:', file, size + 'px');
}
