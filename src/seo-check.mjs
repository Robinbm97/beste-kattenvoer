// SEO-validator: controleert de daadwerkelijke HTML-output in dist/ tegen src/seo-rules.mjs.
// Schrijft dist/seo-rapport/ (noindex dashboard) en reports/seo-report.json.
// Stopt de build (exit 1) bij CRITICAL-bevindingen.

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { parse } from 'node-html-parser';
import { rules, words, countPhrase, nearCount } from './seo-rules.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');
const site = yaml.load(fs.readFileSync(path.join(ROOT, 'content/site.yaml'), 'utf8'));
const exceptionsFile = path.join(ROOT, 'content/seo-exceptions.yaml');
const userExceptions = fs.existsSync(exceptionsFile) ? (yaml.load(fs.readFileSync(exceptionsFile, 'utf8')) || []) : [];
const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'build-manifest.json'), 'utf8'));
const AFFILIATE_HOSTS = ['awin1.com', 'lt45.net', 'fr135.net', 'rkn3.net', 'ds1.nl', 'jdt8.net', 'glp8.net', 'tradeinn.com', 'productpine.com', 'partner.bol.com'];

const urls = new Set(manifest.pages.filter((p) => p.template !== 'notfound').map((p) => p.url));
const assets = new Set(['/sitemap.xml', '/robots.txt', '/favicon.svg', '/search-index.json']);
const slugCount = {};
manifest.pages.forEach((p) => { slugCount[p.url] = (slugCount[p.url] || 0) + 1; });

const pages = manifest.pages.map((m) => {
  const html = fs.readFileSync(path.join(DIST, m.file), 'utf8');
  const root = parse(html);
  const main = root.querySelector('main');
  const text = (main?.structuredText || '').replace(/\s+/g, ' ');
  const title = root.querySelector('title')?.text || '';
  const description = root.querySelector('meta[name="description"]')?.getAttribute('content') || '';
  const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
  const robots = root.querySelector('meta[name="robots"]')?.getAttribute('content') || '';
  const h1 = root.querySelectorAll('h1').map((h) => h.text.trim());
  const heads = root.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6').map((h) => Number(h.tagName[1]));
  const headingSkips = [];
  for (let i = 1; i < heads.length; i++) if (heads[i] > heads[i - 1] + 1) headingSkips.push(`h${heads[i - 1]} → h${heads[i]}`);
  const links = root.querySelectorAll('a[href]').map((a) => ({ href: a.getAttribute('href'), rel: a.getAttribute('rel') || '', inMain: !!a.closest('main') }));
  const internal = [...new Set(links.map((l) => l.href).filter((h) => h.startsWith('/') && !h.startsWith('//')).map((h) => h.split('#')[0].split('?')[0]).filter(Boolean))];
  const contextLinks = new Set(links.filter((l) => l.inMain && l.href.startsWith('/') && !l.href.startsWith('//')).map((l) => l.href.split('#')[0])).size;
  const affiliateUnmarked = links.filter((l) => AFFILIATE_HOSTS.some((h) => l.href.includes(h)) && !/sponsored/.test(l.rel)).map((l) => l.href);
  const imgNoAlt = root.querySelectorAll('img').filter((i) => !(i.getAttribute('alt') || '').trim()).map((i) => (i.getAttribute('src') || '').slice(0, 80));
  const imgAlts = root.querySelectorAll('main img').map((i) => (i.getAttribute('alt') || '').trim());
  const schemaErrors = [];
  root.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    let j; try { j = JSON.parse(s.text); } catch (e) { schemaErrors.push('JSON-LD niet te parsen: ' + e.message); return; }
    if (j['@context'] !== 'https://schema.org') schemaErrors.push('@context ontbreekt');
    const graph = j['@graph'] || [j];
    const types = {};
    graph.forEach((g) => {
      if (!g['@type']) schemaErrors.push('item zonder @type');
      types[g['@type']] = (types[g['@type']] || 0) + 1;
      if (g['@type'] === 'Article' && (!g.headline || !g.datePublished || !g.author)) schemaErrors.push('Article mist headline/datePublished/author');
      if (g['@type'] === 'BreadcrumbList' && !(g.itemListElement || []).length) schemaErrors.push('BreadcrumbList zonder items');
      if (g['@type'] === 'FAQPage' && !(g.mainEntity || []).length) schemaErrors.push('FAQPage zonder vragen');
      if (g['@type'] === 'FAQPage') g.mainEntity.forEach((q) => { if (!text.includes(q.name.slice(0, 30))) schemaErrors.push('FAQ-vraag niet zichtbaar op pagina: ' + q.name); });
      if (g.url && typeof g.url === 'string' && !g.url.startsWith(site.url)) schemaErrors.push('Onjuiste URL in schema: ' + g.url);
    });
    Object.entries(types).forEach(([t, n]) => { if (n > 1 && t !== 'ListItem') schemaErrors.push(`Dubbel schema: ${t} (${n}×)`); });
  });
  // eigen tekst: alleen lopende tekst, zonder productkaarten, tabellen, bronnen en 'lees ook'
  let proseWords = 0;
  if (main) { const c = parse(main.toString()); c.querySelectorAll('.pgrid, .pcard, .table-wrap, table, .offers, .scorecard, .sources, .related, .facts, nav, .crumbs, .fine, .calc, .vgl, .bgrid, .tiles, .band, figure, script').forEach((n) => n.remove()); proseWords = words(c.text).length; }
  const kw = m.primary_keyword || '';
  const wc = words(text).length;
  const exact = countPhrase(text, kw);
  const density = wc ? (exact / wc) * 100 : 0;
  const near = nearCount(text, kw);
  const densityNear = wc ? (near / wc) * 100 : 0;
  // onderwerpdichtheid: zoekwoord (incl. varianten) plus synoniemen uit de frontmatter
  const syns = (m.synonyms || []).filter(Boolean);
  const synHits = syns.reduce((n, sy) => n + nearCount(text, sy), 0);
  const topicDensity = wc ? ((near + synHits) / wc) * 100 : 0;
  const h2all = root.querySelectorAll('main .prose h2, main .prose-wide h2, main h2').map((h) => h.text.trim());
  const firstH2 = h2all[0] || '';
  const intro = (main?.querySelector('p')?.text || '') + ' ' + (main?.querySelectorAll('p').slice(0, 3).map((p) => p.text).join(' ') || '');
  const has = (t) => kw && (words(t).join(' ').includes(words(kw).join(' ')) || nearCount(t, kw) > 0);
  const placementMissing = kw ? [['title', title], ['h1', h1.join(' ')], ['intro', intro], ['description', description], ['slug', m.url.replace(/[-/]/g, ' ')]].filter(([, t]) => !has(t)).map(([n]) => n) : [];
  const partial = kw ? words(kw).reduce((s, w) => s + words(text).filter((x) => x === w).length, 0) : 0;
  return { url: m.url, meta: m, title, description, canonical, robots, h1, headingSkips, internal, contextLinks, affiliateUnmarked, imgNoAlt, imgAlts, schemaErrors, wordCount: wc, proseWords, density, densityNear, near, exact, synHits, topicDensity, firstH2, partial, placementMissing, h2: root.querySelectorAll('main h2').map((h) => h.text.trim()), proseH2: root.querySelectorAll('main .prose h2, main .prose-wide h2').map((h) => h.text.trim()).filter((t) => !['Waar we dit vandaan hebben', 'Waar ik dit vandaan heb', 'Vragen van andere kattenbaasjes', 'Lees ook'].includes(t)), images: root.querySelectorAll('main img').length, sources: root.querySelectorAll('.sources li').length };
});

// context
const inbound = {};
pages.forEach((p) => p.internal.forEach((u) => { if (u !== p.url) (inbound[u] = inbound[u] || []).push(p.url); }));
const depth = { '/': 0 };
const q = ['/'];
while (q.length) { const u = q.shift(); const p = pages.find((x) => x.url === u); if (!p) continue; p.internal.forEach((l) => { if (depth[l] === undefined && urls.has(l)) { depth[l] = depth[u] + 1; q.push(l); } }); }
const count = (k) => pages.filter((p) => p.meta.index).reduce((o, p) => { o[p[k]] = (o[p[k]] || 0) + 1; return o; }, {});
const sitemap = [...fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(site.url, ''));
const ctx = { pages, site: site.url, urls, assets, inbound, depth, sitemap, descCount: count('description'), titleCount: count('title'), dupSlugs: Object.keys(slugCount).filter((k) => slugCount[k] > 1) };

const isExcepted = (rule, url, tpl) => rule.exceptions.includes(url) || rule.exceptions.includes(tpl) || userExceptions.some((e) => e.rule === rule.id && (e.url === url || e.url === '*'));
const findings = [];
for (const rule of rules) {
  if (rule.global) { rule.global(ctx).forEach((f) => findings.push({ rule: rule.id, name: rule.name, severity: rule.severity, url: f.url, detail: f.detail, fix: rule.fix })); continue; }
  for (const p of pages) {
    if (rule.types !== '*' && !rule.types.includes(p.meta.template)) continue;
    if (isExcepted(rule, p.url, p.meta.template)) continue;
    rule.check(p, ctx).forEach((f) => findings.push({ rule: rule.id, name: rule.name, severity: rule.severity, url: p.url, detail: f.detail, fix: rule.fix }));
  }
}

const weight = { CRITICAL: 40, HIGH: 15, MEDIUM: 5, LOW: 2 };
const pageReport = pages.filter((p) => p.meta.template !== 'notfound').map((p) => {
  const f = findings.filter((x) => x.url === p.url);
  const seo = Math.max(0, 100 - f.reduce((s, x) => s + weight[x.severity], 0));
  let quality = 50;
  quality += Math.min(20, p.wordCount / 60);
  quality += p.h2.length >= 3 ? 10 : p.h2.length * 3;
  quality += p.sources ? 10 : 0;
  quality += p.images ? 5 : 0;
  quality += p.contextLinks >= 3 ? 5 : 0;
  return { url: p.url, template: p.meta.template, title: p.title, words: p.wordCount, prose_words: p.proseWords, primary_keyword: p.meta.primary_keyword || '', density: +p.density.toFixed(2), density_variant: +p.densityNear.toFixed(2), exact: p.exact, variant: p.near, partial: p.partial, h2: p.h2, inbound: (inbound[p.url] || []).length, depth: depth[p.url] ?? null, seo_score: seo, quality_score: Math.min(100, Math.round(quality)), findings: f.length, source: p.meta.source };
});

const totals = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
findings.forEach((f) => totals[f.severity]++);
const health = Math.round(pageReport.reduce((s, p) => s + p.seo_score, 0) / pageReport.length);
const report = { generated: new Date().toISOString(), health, totals, rules: rules.map(({ id, name, description, severity, types, exceptions, fix, source }) => ({ id, name, description, severity, types, exceptions, fix, source })), pages: pageReport, findings };
fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reports/seo-report.json'), JSON.stringify(report, null, 1));

// dashboard (noindex, niet in sitemap)
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const sevColor = { CRITICAL: '#F3D0C7', HIGH: '#F3E4D3', MEDIUM: '#FBFDEB', LOW: '#FFFDF9' };
const dash = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>SEO-rapport – beste-kattenvoer.nl</title><link rel="stylesheet" href="/assets/styles.css"></head><body>
<main class="wrap section-sm"><p class="kick">Intern · ${new Date().toLocaleString('nl-NL')}</p><h1 class="h1">SEO-rapport</h1>
<div class="facts" style="margin-top:24px"><div><span>SEO health</span><b>${health}</b><small>gemiddelde paginascore</small></div><div><span>Critical</span><b>${totals.CRITICAL}</b></div><div><span>High</span><b>${totals.HIGH}</b></div><div><span>Medium / Low</span><b>${totals.MEDIUM} / ${totals.LOW}</b></div></div>
<h2 class="h3" style="margin-top:32px">Pagina’s</h2><div class="table-wrap"><table class="compare" style="min-width:1100px"><thead><tr><td>URL</td><th>Type</th><th>Zoekwoord</th><th>Woorden</th><th>Density exact / variant</th><th>Inkomend</th><th>Diepte</th><th>SEO</th><th>Kwaliteit</th><th>Bevindingen</th></tr></thead><tbody>
${pageReport.map((p) => `<tr><th scope="row"><a href="${p.url}">${esc(p.url)}</a></th><td>${p.template}</td><td>${esc(p.primary_keyword)}</td><td>${p.words}</td><td>${p.density}% / ${p.density_variant}%</td><td>${p.inbound}</td><td>${p.depth ?? '–'}</td><td><b>${p.seo_score}</b></td><td>${p.quality_score}</td><td>${p.findings ? `<a href="#f-${encodeURIComponent(p.url)}">${p.findings}</a>` : '0'}</td></tr>`).join('')}
</tbody></table></div>
<h2 class="h3" style="margin-top:32px">Bevindingen</h2>
${findings.length ? findings.map((f) => `<div id="f-${encodeURIComponent(f.url)}" class="card" style="margin-bottom:10px;padding:16px 20px;background:${sevColor[f.severity]}"><b>${f.severity} · ${f.rule} · ${esc(f.name)}</b><br><a href="${f.url}">${esc(f.url)}</a> — ${esc(String(f.detail))}<br><span class="fine">Oplossing: ${esc(f.fix)}</span></div>`).join('') : '<p>Geen bevindingen. 🎉</p>'}
<h2 class="h3" style="margin-top:32px">Regels</h2>
<div class="table-wrap"><table class="compare" style="min-width:900px"><thead><tr><td>ID</td><th>Regel</th><th>Ernst</th><th>Oplossing</th><th>Bron</th></tr></thead><tbody>${report.rules.map((r) => `<tr><th scope="row">${r.id}</th><td><b>${esc(r.name)}</b><br><span class="fine">${esc(r.description)}</span></td><td>${r.severity}</td><td>${esc(r.fix)}</td><td>${esc(r.source)}</td></tr>`).join('')}</tbody></table></div>
<p class="fine">Lengte- en density-grenzen zijn redactionele richtlijnen, geen Google-regels. Uitzonderingen beheer je in content/seo-exceptions.yaml.</p>
</main></body></html>`;
fs.mkdirSync(path.join(DIST, 'seo-rapport'), { recursive: true });
fs.writeFileSync(path.join(DIST, 'seo-rapport/index.html'), dash);

console.log(`SEO health ${health} · critical ${totals.CRITICAL} · high ${totals.HIGH} · medium ${totals.MEDIUM} · low ${totals.LOW}`);
findings.filter((f) => f.severity !== 'LOW').forEach((f) => console.log(`  ${f.severity.padEnd(8)} ${f.rule} ${f.url} – ${f.detail}`));
if (totals.CRITICAL) { console.error('✗ CRITICAL SEO-fouten: build gestopt.'); process.exit(1); }
