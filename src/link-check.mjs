// Externe-linkcontrole (wekelijks via GitHub Actions). Controleert alle externe links in dist/ op bereikbaarheid.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');
const files = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.html') && files.push(path.join(d, e.name)));
walk(DIST);
const links = new Map();
for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/href="(https?:\/\/[^"]+)"/g)) {
  const u = m[1].replace(/&amp;/g, '&');
  if (!links.has(u)) links.set(u, new Set());
  links.get(u).add(path.relative(DIST, f));
}
const bad = [];
for (const [u, on] of links) {
  try {
    let r = await fetch(u, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (r.status === 405 || r.status === 403) r = await fetch(u, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (r.status >= 400) bad.push({ u, status: r.status, on: [...on] });
  } catch (e) { bad.push({ u, status: 'fout: ' + e.message, on: [...on] }); }
}
fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reports/link-report.json'), JSON.stringify({ checked: links.size, bad, at: new Date().toISOString() }, null, 1));
console.log(`${links.size} externe links gecontroleerd, ${bad.length} problemen`);
bad.forEach((b) => console.log(`  ${b.status} ${b.u} (op ${b.on.slice(0, 3).join(', ')})`));
if (bad.length) process.exitCode = 1;
