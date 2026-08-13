// Controleert of elk bestand dat de app nodig heeft ook echt in de
// precache-lijst van sw.js staat, en andersom of de lijst geen spookbestanden
// bevat. Draaien met: node tools/check-precache.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SKIP_DIRS = new Set(['.git', '.github', 'tools', 'node_modules', 'screenshots']);
const SHIPPED = /\.(html|css|js|json|png|svg|woff2)$/i;
const NOT_SHIPPED = new Set(['sw.js']); // de service worker cachet zichzelf niet

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(full, out);
    } else if (SHIPPED.test(entry)) {
      out.push('./' + relative(root, full).split('\\').join('/'));
    }
  }
  return out;
}

const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const listMatch = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
if (!listMatch) {
  console.error('FOUT: geen PRECACHE-lijst gevonden in sw.js');
  process.exit(1);
}
const listed = new Set(
  [...listMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((p) => p !== './'),
);

const version = (sw.match(/const CACHE_VERSION = '([^']+)'/) || [])[1];

const onDisk = walk(root).filter((p) => !NOT_SHIPPED.has(p.slice(2)));
const missing = onDisk.filter((p) => !listed.has(p));
const ghosts = [...listed].filter((p) => !onDisk.includes(p));

console.log(`cacheversie: ${version || 'ONBEKEND'}`);
console.log(`bestanden op schijf: ${onDisk.length}, in precache-lijst: ${listed.size}`);

let fail = false;
if (missing.length) {
  fail = true;
  console.error('\nONTBREEKT in de precache-lijst (werkt straks niet offline):');
  for (const p of missing) console.error('  ' + p);
}
if (ghosts.length) {
  fail = true;
  console.error('\nSTAAT WEL in de lijst maar niet op schijf (installatie faalt):');
  for (const p of ghosts) console.error('  ' + p);
}
if (fail) process.exit(1);
console.log('\nOK: precache-lijst is compleet.');
