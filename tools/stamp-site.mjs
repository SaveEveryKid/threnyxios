// Cache-busting for site/: every script and stylesheet the game loads gets
// ?v=<build>, so a phone can never mix fresh files with stale cached ones
// (a screen "missing" from an old main.js, a banner without its new styles).
// Art, audio and fonts keep their plain URLs and stay cached.
// Usage (from build-site.sh): node tools/stamp-site.mjs <build-id>
import fs from 'node:fs';
import path from 'node:path';

const v = process.argv[2] || Date.now().toString(36);
const site = new URL('../site/', import.meta.url).pathname;
const stamp = (spec) => (spec.includes('?') ? spec : `${spec}?v=${v}`);
let files = 0, refs = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.js')) {
      const src = fs.readFileSync(p, 'utf8');
      // static imports/exports and dynamic import() of relative .js modules
      const out = src
        .replace(/(\bfrom\s*['"])(\.{1,2}\/[^'"]+?\.js)(['"])/g, (_, a, s, b) => (refs++, a + stamp(s) + b))
        .replace(/(\bimport\s*\(\s*['"])(\.{1,2}\/[^'"]+?\.js)(['"]\s*\))/g, (_, a, s, b) => (refs++, a + stamp(s) + b))
        .replace(/(^|\n)(\s*import\s*['"])(\.{1,2}\/[^'"]+?\.js)(['"])/g, (_, n, a, s, b) => (refs++, n + a + stamp(s) + b));
      if (out !== src) (fs.writeFileSync(p, out), files++);
    }
  }
}
walk(site);
const index = path.join(site, 'index.html');
const html = fs.readFileSync(index, 'utf8').replace(/((?:href|src)="client\/(?:css|js)\/[^"?]+\.(?:css|js))"/g, (_, a) => (refs++, `${a}?v=${v}"`));
fs.writeFileSync(index, html);
// browsers always check with the server for new code (a quick "not changed" when nothing did)
fs.writeFileSync(path.join(site, '_headers'), ['/', '/index.html', '/client/js/*', '/client/css/*', '/client/legal/*', '/engine/*', '/client/art/manifest.json'].map((p) => `${p}\n  Cache-Control: no-cache`).join('\n') + '\n');
console.log(`stamped ${refs} references in ${files} files + index.html (v=${v})`);
