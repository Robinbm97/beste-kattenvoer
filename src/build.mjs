// beste-automatische-kattenbak.nl – statische site-generator
// Leest content/ (YAML + Markdown met frontmatter) en schrijft dist/.
// SEO zit in de basis: iedere pagina krijgt title, description, canonical, robots, OG,
// breadcrumbs, JSON-LD en komt (als indexeerbaar) in de sitemap.
// Productdata (prijzen, winkels, partnerlinks, foto's) komt uit content/products.yaml (Daisycon-feed).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'js-yaml';
import { marked } from 'marked';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CONTENT = path.join(ROOT, 'content');
const DIST = path.join(ROOT, 'dist');

const readYaml = (f) => yaml.load(fs.readFileSync(path.join(CONTENT, f), 'utf8'));
const site = readYaml('site.yaml');
const pdata = readYaml('products.yaml');
const images = readYaml('images.yaml');
const acc = readYaml('accessories.yaml');
const extSources = readYaml('sources.yaml');
const products = [...pdata.products].sort((a, b) => a.rank - b.rank);
const byId = Object.fromEntries(products.map((p) => [p.id, p]));
const MEDIA_ID = String(site.daisycon?.media_id || '').trim();

// ---------- helpers ----------
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nlDate = (d) => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
const isoDate = (d) => new Date(d).toISOString().slice(0, 10);
const eur = (n) => '€' + (Number.isInteger(n) ? n.toLocaleString('nl-NL') : n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const eur0 = (n) => '€' + Math.round(n).toLocaleString('nl-NL');
const score = (n) => Number(n).toFixed(1).replace('.', ',');
const abs = (u) => site.url + u;
const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
const imgUrl = (k) => images[k].local ? site.url + images[k].local + '-960.webp' : images[k].src + '?auto=format&fit=crop&w=1200&h=630&q=70';

// ---------- productlogica ----------
const lowest = (p) => [...p.offers].sort((a, b) => a.price - b.price)[0];
const lowestNew = (p) => [...p.offers].filter((o) => o.condition === 'new').sort((a, b) => a.price - b.price)[0];
const onlyRefurb = (p) => !lowestNew(p);
const pimg = (p, s = 600, o = lowest(p)) => {
  if (p.image) return p.image;
  const src = o.image_pid ? o : p.offers.find((x) => x.image_pid) || o;
  if (src.image_pid) return `https://images.daisycon.io/product?pid=${src.image_pid}&width=${s}&height=${s}`;
  return o.image || (p.offers.find((x) => x.image) || {}).image;
};
const BOL_SITE_ID = String((site.bol && site.bol.site_id) || '');
const affUrl = (o, p) => {
  if (o.shop === 'bol.com') return `https://partner.bol.com/click/click?p=2&t=url&s=${BOL_SITE_ID}&f=TXL&url=${encodeURIComponent(o.url)}&name=${encodeURIComponent(p.name)}&subid=${p.id}`;
  return o.url.replace(/#MEDIA_ID#/g, MEDIA_ID).replace(/#SUBID#/g, p.id);
};
const shapeLabel = { closed: 'Dicht model', open: 'Open model', globe: 'Draaiende bol' };
const yn = (v) => v === true ? 'Ja' : v === false ? 'Nee' : 'Niet opgegeven';
const isBig = (p) => (p.max_cat_kg && p.max_cat_kg >= 10) || (p.capacity_l && p.capacity_l >= 60);
const reviewUrl = (p) => `/kattenbakken/${p.id}/`;
const ring = (sc, size = 64) => { const r = 26, c = 2 * Math.PI * r, f = (sc / 10) * c; return `<span class="ring" style="width:${size}px;height:${size}px" role="img" aria-label="Onze score ${score(sc)} van 10"><svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--line)" stroke-width="7"/><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--green)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${f.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"/></svg><b>${score(sc)}</b></span>`; };

function cta(p, label, o = lowest(p), cls = 'btn') {
  return `<a class="${cls}" href="${esc(affUrl(o, p))}" rel="sponsored nofollow noopener" target="_blank" data-out="${p.id}" data-shop="${esc(o.shop)}">${esc(label || `Bekijk bij ${o.shop}`)}</a>`;
}
const condTag = (o) => o.condition === 'refurbished' ? '<span class="pill pill-soft cond">Refurbished</span>' : '';

function tick(text, kind = 'ok') {
  return `<li class="tick tick-${kind}"><span aria-hidden="true">${kind === 'ok' ? '✓' : 'i'}</span><span class="tick-t">${esc(text)}</span></li>`;
}

const specRows = [
  ['Type', (p) => shapeLabel[p.shape]],
  ['Kattengewicht', (p) => p.cat_weight || 'Niet opgegeven'],
  ['Binnenruimte', (p) => p.capacity_l ? `${String(p.capacity_l).replace('.', ',')} liter` : 'Niet opgegeven'],
  ['Afval legen', (p) => p.waste_days ? cap(p.waste_days) : 'Niet opgegeven'],
  ['App', (p) => yn(p.app)],
  ['Camera', (p) => yn(p.camera)],
  ['Meerdere katten', (p) => p.multi_cat ? 'Ja' : 'Niet opgegeven'],
  ['Geluid', (p) => p.noise || 'Niet opgegeven'],
  ['Kattenbakvulling', (p) => p.litter || 'Niet opgegeven'],
  ['Afmetingen (l × b × h)', (p) => p.size || 'Niet opgegeven'],
  ['Beoordeling bol.com', (p) => p.bol_rating ? `${String(p.bol_rating).replace('.', ',')} van 5 (${p.bol_reviews} reviews)` : 'Niet opgegeven'],
  ['Extra', (p) => p.extras || '–'],
];

function specList(p) {
  return `<ul class="cov-list spec-list">${specRows.map(([l, f]) => { const v = f(p); const k = /^Ja/.test(v) ? 'yes' : /^Nee/.test(v) ? 'no' : /Niet opgegeven/.test(v) ? 'unknown' : 'yes'; return `<li class="cov-li cov-${k}"><span aria-hidden="true">${k === 'yes' ? '✓' : k === 'no' ? '✕' : '?'}</span>${l}<small>${esc(v)}</small></li>`; }).join('')}</ul>`;
}

function stats(p) {
  const items = [[shapeLabel[p.shape], 'Type']];
  if (p.max_cat_kg) items.push([`tot ${p.max_cat_kg} kg`, 'Kattengewicht']);
  else if (p.capacity_l) items.push([`${String(p.capacity_l).replace('.', ',')} liter`, 'Binnenruimte']);
  else if (p.waste_days) items.push([cap(p.waste_days.replace(/ volgens fabrikant/, '')), 'Afval legen']);
  else if (p.multi_cat) items.push(['Ja', 'Meerdere katten']);
  else if (p.noise) items.push([p.noise.replace(/ volgens fabrikant/, ''), 'Geluid']);
  items.push([p.camera ? 'App + camera' : p.app ? 'Met app' : p.app === false ? 'Zonder app' : 'Niet opgegeven', 'Slim']);
  return `<dl class="ins-stats">${items.map(([v, l]) => `<div><dd>${esc(v)}</dd><dt>${l}</dt></div>`).join('')}</dl>`;
}

function productCard(p, { featured = false, eager = false } = {}) {
  const o = lowest(p);
  return `<article class="ins-row${featured ? ' is-top' : ''}">
<div class="ins-brand"><a href="${reviewUrl(p)}" class="prod-img" tabindex="-1" aria-hidden="true"><img src="${pimg(p, 240)}" srcset="${pimg(p, 240)} 1x, ${pimg(p, 480)} 2x" width="140" height="140" alt="${esc(p.name)}, automatische kattenbak van ${esc(p.brand)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async"></a>${ring(p.score, 68)}<a href="${reviewUrl(p)}">Lees de review</a></div>
<div class="ins-main">
<h3 class="ins-name">${esc(p.name)} <span class="pill ${p.rank === 1 ? 'pill-lime' : 'pill-soft'}">${esc(p.badge)}</span></h3>
${stats(p)}
<ul class="ticks ticks-sm">${p.pros.slice(0, 2).map((x) => tick(x)).join('')}${tick(p.cons[0], 'warn')}</ul>
<details class="ins-more"><summary>Alle specificaties</summary>${specList(p)}</details>
</div>
<div class="ins-price"><span class="ins-from">vanaf ${condTag(o)}</span><span class="ins-amount">${eur(o.price)}</span><span class="ins-shop">bij ${esc(o.shop)}${p.offers.length > 1 ? ` · ${p.offers.length} winkels` : ''}</span>${cta(p, `Bekijk bij ${o.shop}`)}<a class="ins-link" href="${reviewUrl(p)}">Meer over ${esc(p.name)}</a></div>
</article>`;
}

function top3() {
  return `<div class="ins-list">${products.slice(0, 3).map((p, n) => productCard(p, { featured: n === 0 })).join('')}</div>
<p class="fine center">Prijzen uit de productfeeds van de winkels, gecheckt op ${nlDate(pdata.checked)}. Prijzen en voorraad veranderen; de webshop is leidend. De knoppen zijn partnerlinks: <a href="/over-ons/#verdienmodel">zo verdienen we ons geld</a>.</p>`;
}

function tijdPanel() {
  const rows = [[1, 30], [2, 61], [3, 91]].map(([k, u]) => `<div class="bar-row"><div class="bar-label"><span>${k} ${k === 1 ? 'kat' : 'katten'}</span><b>± ${u} uur per jaar</b></div><div class="bar"><span style="width:${Math.round(u / 91 * 100)}%"></span></div></div>`).join('');
  return `<section class="wrap section"><div class="dark-panel">
<div><p class="kick kick-lime">Even rekenen</p><h2 class="h2">Scheppen kost je meer tijd dan je denkt.</h2>
<p class="on-dark">Vijf minuten per kat per dag lijkt niks. Op een jaar is het een volle werkweek, per kat. Een automatische kattenbak neemt dat over: jij leegt alleen nog de afvalbak.</p>
<a class="btn btn-lime" href="/automatische-kattenbak-vergelijken/">Vind de bak die bij jou past</a></div>
<div class="bars" role="img" aria-label="Bij vijf minuten scheppen per kat per dag: 1 kat ongeveer 30 uur per jaar, 2 katten 61 uur, 3 katten 91 uur">${rows}</div>
</div></section>`;
}

function compareTable(list = products.slice(0, 10)) {
  const cols = list;
  const head = cols.map((p) => `<th scope="col" data-col="${p.id}"${p.rank === 1 ? ' class="col-top"' : ''}><span class="th-flag">${p.rank <= 3 ? 'Nr. ' + p.rank : '&nbsp;'}</span><a href="${reviewUrl(p)}">${esc(p.name)}</a></th>`).join('');
  const row = (label, fn, attrs = '') => `<tr${attrs}><th scope="row">${label}</th>${cols.map((p) => `<td data-col="${p.id}"${p.rank === 1 ? ' class="col-top"' : ''}>${fn(p)}</td>`).join('')}</tr>`;
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="Vergelijkingstabel automatische kattenbakken">
<table class="compare" id="compare">
<thead><tr><td></td>${head}</tr></thead>
<tbody>
<tr class="grp"><th colspan="${cols.length + 1}">Prijs</th></tr>
${row('<b>Laagste prijs</b>', (p) => `<b class="own">${eur(lowest(p).price)}</b>${lowest(p).condition === 'refurbished' ? '<br><small>refurbished</small>' : ''}`, ' class="row-own"')}
${row('Nieuw vanaf', (p) => lowestNew(p) ? eur(lowestNew(p).price) : 'alleen refurbished')}
${row('Winkels', (p) => esc(p.offers.map((o) => o.shop).join(', ')))}
<tr class="grp"><th colspan="${cols.length + 1}">Specificaties</th></tr>
${specRows.slice(0, 9).map(([l, f]) => row(l, (p) => esc(f(p)))).join('\n')}
<tr class="grp"><th colspan="${cols.length + 1}">Oordeel</th></tr>
${row('Onze score', (p) => `<b>${score(p.score)}</b>`)}
${row('Beste voor', (p) => esc(p.best_for))}
<tr class="row-cta"><th scope="row"></th>${cols.map((p) => `<td data-col="${p.id}"${p.rank === 1 ? ' class="col-top"' : ''}>${cta(p, 'Bekijk →')}</td>`).join('')}</tr>
</tbody></table></div>`;
}

const FILTERS = {
  camera: (p) => p.camera === true,
  open: (p) => p.shape === 'open',
  groot: isBig,
  meer: (p) => p.multi_cat === true,
  budget: (p) => lowest(p).price < 250,
  nieuw: (p) => !!lowestNew(p),
  app: (p) => p.app === true,
};

function faqBlock(faq) {
  if (!faq?.length) return '';
  return `<section class="wrap-narrow section"><h2 class="h2 center">Vragen van andere kattenbaasjes</h2>
${faq.map((f) => `<details class="card faq"><summary>${esc(f.q)}</summary><div>${marked.parse(f.a)}</div></details>`).join('')}</section>`;
}

const SOURCES = {
  daisycon_feed: { title: `Productfeeds van de winkels via Daisycon (prijzen en specificaties, opgehaald ${nlDate(pdata.checked)})`, url: '/over-ons/#bronnen' },
  bol_productpagina: { title: `Productpagina's op bol.com (prijs, specificaties en klantbeoordeling, opgehaald ${nlDate(pdata.checked)})`, url: '/over-ons/#bronnen' },
};
function sourcesBlock(keys) {
  if (!keys?.length) return '';
  return `<aside class="sources"><h2 class="h4">Waar we dit vandaan hebben</h2><ol>${keys.map((k) => {
    const s = SOURCES[k] || extSources[k]; if (!s) throw new Error(`Onbekende bron ${k}`);
    const ext = /^https?:/.test(s.url);
    return `<li><a href="${esc(s.url)}"${ext ? ' rel="nofollow noopener" target="_blank"' : ''}>${esc(s.title)}</a></li>`;
  }).join('')}</ol></aside>`;
}

function relatedBlock(p) {
  const rel = (p.related || []).map((u) => byUrl[u]).filter(Boolean);
  if (!rel.length) return '';
  return `<section class="wrap section"><h2 class="h3">Lees ook</h2><div class="grid-3 related">${rel.map((r) => `<a class="rel-card" href="${r.slug}"><span class="kick">${esc(r.kicker || (r.slug === '/' ? 'Homepage' : 'Kennisbank'))}</span><b>${esc(r.h1)}</b><span>${esc(r.meta_description)}</span></a>`).join('')}</div></section>`;
}


// ---------- eigen data & tools ----------
const median = (a) => { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const nl1 = (n) => n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function tableWrap(label, head, rows) {
  return `<div class="table-wrap data-table" tabindex="0" role="region" aria-label="${esc(label)}"><table class="compare"><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => i === 0 ? `<th scope="row">${c}</th>` : `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function prijsindex() {
  const lows = products.map((p) => lowest(p).price);
  const news = products.filter(lowestNew).map((p) => lowestNew(p).price);
  const bands = [[0, 200, 'Onder €200'], [200, 350, '€200 tot €350'], [350, 500, '€350 tot €500'], [500, 1e9, '€500 en meer']];
  const cheap = [...products].sort((a, b) => lowest(a).price - lowest(b).price)[0];
  const cheapNew = [...products].filter(lowestNew).sort((a, b) => lowestNew(a).price - lowestNew(b).price)[0];
  const top = [...products].sort((a, b) => lowest(b).price - lowest(a).price)[0];
  const multi = products.filter((p) => p.offers.length > 1).map((p) => { const ps = p.offers.map((o) => o.price); return { p, min: Math.min(...ps), max: Math.max(...ps) }; }).filter((x) => x.max > x.min).sort((a, b) => (b.max - b.min) - (a.max - a.min));
  const refurb = products.filter((p) => lowest(p).condition === 'refurbished' && lowestNew(p));
  return `<div class="stat-grid">
<div class="stat"><span>Mediaan laagste prijs</span><b>${eur0(median(lows))}</b><small>${products.length} modellen</small></div>
<div class="stat"><span>Nieuw vanaf</span><b>${eur0(lowestNew(cheapNew).price)}</b><small>${esc(cheapNew.name)}</small></div>
<div class="stat"><span>Goedkoopst (refurbished)</span><b>${eur0(lowest(cheap).price)}</b><small>${esc(cheap.name)}</small></div>
<div class="stat"><span>Duurste</span><b>${eur0(lowest(top).price)}</b><small>${esc(top.name)}</small></div>
</div>
<h3>Hoeveel modellen per prijsklasse?</h3>
<div class="bars bars-light">${bands.map(([a, b, l]) => { const n = lows.filter((x) => x >= a && x < b).length; return `<div class="bar-row"><div class="bar-label"><span>${l}</span><b>${n} ${n === 1 ? 'model' : 'modellen'}</b></div><div class="bar bar-light"><span style="width:${Math.round(n / products.length * 100)}%"></span></div></div>`; }).join('')}</div>
<h3>Zelfde kattenbak, andere prijs</h3>
${multi.length ? tableWrap('Prijsverschil per winkel', ['Kattenbak', 'Goedkoopst', 'Duurst', 'Verschil'], multi.map((x) => [`<a href="${reviewUrl(x.p)}">${esc(x.p.name)}</a>`, eur(x.min), eur(x.max), `<b>${eur(Math.round((x.max - x.min) * 100) / 100)}</b> (${Math.round((x.max - x.min) / x.max * 100)}%)`])) : ''}
${refurb.length ? `<h3>Wat scheelt refurbished?</h3>${tableWrap('Besparing refurbished', ['Kattenbak', 'Refurbished', 'Nieuw', 'Je bespaart'], refurb.map((p) => [`<a href="${reviewUrl(p)}">${esc(p.name)}</a>`, eur(lowest(p).price), eur(lowestNew(p).price), `<b>${eur(Math.round((lowestNew(p).price - lowest(p).price) * 100) / 100)}</b> (${Math.round((lowestNew(p).price - lowest(p).price) / lowestNew(p).price * 100)}%)`]))}` : ''}
<p class="fine">Bron: eigen analyse van de prijzen bij ${new Set(products.flatMap((p) => p.offers.map((o) => o.shop))).size} webshops (productfeeds via Daisycon en productpagina's op bol.com), peildatum ${nlDate(pdata.checked)}. Gemiddelde nieuwprijs: ${eur0(news.reduce((a, b) => a + b, 0) / news.length)}.</p>`;
}
function litersTable() {
  const list = products.filter((p) => p.capacity_l).sort((a, b) => b.capacity_l - a.capacity_l);
  return tableWrap('Binnenruimte en prijs per liter', ['Kattenbak', 'Binnenruimte', 'Max. kattengewicht', 'Laagste prijs', 'Prijs per liter'], list.map((p) => [`<a href="${reviewUrl(p)}">${esc(p.name)}</a>`, `${String(p.capacity_l).replace('.', ',')} liter`, p.max_cat_kg ? `tot ${p.max_cat_kg} kg` : 'n.b.', `${eur(lowest(p).price)}${lowest(p).condition === 'refurbished' ? ' <small>refurb.</small>' : ''}`, `<b>€${nl1(lowest(p).price / p.capacity_l)}</b>`])) + `<p class="fine">Alleen modellen waarvan de fabrikant de binnenruimte in liters noemt. Prijs per liter = laagste prijs gedeeld door de liters. Eigen berekening, peildatum ${nlDate(pdata.checked)}.</p>`;
}
const SHIP = { BricoInn: 'Spanje (Tradeinn)', TechInn: 'Spanje (Tradeinn)', Joybuy: 'Joybuy (NL-site)', Productpine: 'Nederland, refurbished', Coolshop: 'Denemarken/NL (Coolshop)', 'Plein.nl': 'Nederland', Petgamma: 'Nederland', 'JC Pets': 'Nederland', 'meubelo.nl': 'via meubelo.nl' };
function winkelsTable() {
  const shops = {};
  products.forEach((p) => p.offers.forEach((o) => { (shops[o.shop] ||= []).push({ p, o }); }));
  return tableWrap('Webshops met automatische kattenbakken', ['Webshop', 'Modellen', 'Prijsrange', 'Goedkoopste model', 'Let op'], Object.entries(shops).sort((a, b) => b[1].length - a[1].length).map(([shop, l]) => { const c = l.sort((a, b) => a.o.price - b.o.price)[0]; return [esc(shop), l.length, `${eur0(Math.min(...l.map((x) => x.o.price)))} – ${eur0(Math.max(...l.map((x) => x.o.price)))}`, `<a href="${reviewUrl(c.p)}">${esc(c.p.name)}</a>`, esc(SHIP[shop] || '–') + (l.every((x) => x.o.condition === 'refurbished') ? ' · alleen refurbished' : '')]; })) + `<p class="fine">Telling op basis van de productfeeds via Daisycon, peildatum ${nlDate(pdata.checked)}. Grote winkels als bol, Coolblue en MediaMarkt verkopen ook automatische kattenbakken, maar zitten niet in deze feed.</p>`;
}
function accTable(kind) {
  const l = acc[kind]; if (!l) throw new Error(`Onbekende accessoirelijst ${kind}`);
  if (kind === 'vulling') return tableWrap('Kattenbakvulling prijs per kilo', ['Vulling', 'Soort', 'Winkel', 'Prijs', 'Per kg / liter'], [...l].sort((a, b) => (a.kg ? a.price / a.kg : 99) - (b.kg ? b.price / b.kg : 99)).map((x) => [esc(x.name), esc(x.type), esc(x.shop), eur(x.price), x.kg ? `<b>€${nl1(x.price / x.kg)}</b> /kg` : `€${nl1(x.price / x.liter)} /liter`])) + `<p class="fine">Prijzen uit de productfeeds via Daisycon, ${nlDate(pdata.checked)}. Prijs per kilo is onze eigen berekening op basis van het gewicht in de producttitel.</p>`;
  return tableWrap('Prijzen ' + kind, ['Product', 'Winkel', 'Prijs', kind === 'overig' ? 'Waarvoor' : 'Verpakking / per stuk'], l.map((x) => [esc(x.name), esc(x.shop), eur(x.price), x.units > 1 ? `<b>€${nl1(x.price / x.units)}</b> per stuk (${x.units} st.)` : esc(x.note || (x.units === 1 ? '1 stuk' : '–'))])) + `<p class="fine">Prijzen uit de productfeeds via Daisycon, ${nlDate(pdata.checked)}.</p>`;
}
function keuzehulp() {
  const data = products.map((p) => ({ id: p.id, n: p.name, s: p.score, pr: lowest(p).price, sh: lowest(p).shop, rf: lowest(p).condition === 'refurbished', u: reviewUrl(p), i: pimg(p, 200), shape: p.shape, big: !!isBig(p), max: p.max_cat_kg, min: p.min_cat_kg, multi: !!p.multi_cat, waste: !!p.waste_days, app: p.app, cam: !!p.camera, bf: p.best_for }));
  const q = (name, label, opts) => `<fieldset class="kh-q"><legend>${label}</legend><div class="chips">${opts.map(([v, t], i) => `<label class="chip-r"><input type="radio" name="${name}" value="${v}"${i === 0 ? ' checked' : ''}><span>${t}</span></label>`).join('')}</div></fieldset>`;
  return `<div class="keuzehulp card" data-widget="keuzehulp">
<form id="khForm" class="kh-form">
${q('kg', '1. Hoe zwaar is je (zwaarste) kat?', [['mid', '1,5 tot 7 kg'], ['big', '7 kg of meer'], ['small', 'Lichter dan 1,5 kg (kitten)']])}
${q('cats', '2. Hoeveel katten gebruiken de bak?', [['1', '1 kat'], ['2', '2 katten'], ['3', '3 of meer']])}
${q('shape', '3. Hoe is je kat met een kap of ingang?', [['any', 'Maakt niet uit'], ['open', 'Liever open (schrikachtig of groot)']])}
${q('smart', '4. Wat wil je in de app zien?', [['none', 'Maakt niet uit'], ['app', 'App met gewicht en bezoekjes'], ['cam', 'Ook een camera']])}
<fieldset class="kh-q"><legend>5. Je budget</legend><div class="ctrl"><label for="khBudget"><span>Maximaal</span><b id="khBudgetOut">€500</b></label><input id="khBudget" type="range" min="100" max="900" step="25" value="500"></div>
<label class="kh-check"><input type="checkbox" id="khRefurb" checked> Refurbished mag ook</label></fieldset>
</form>
<div class="kh-out" aria-live="polite"><p class="kick">Jouw top 3</p><div id="khResults"></div><p class="fine" id="khNote"></p></div>
<script type="application/json" id="khData">${JSON.stringify(data)}</script>
</div>`;
}
function kostencalc() {
  return `<div class="calc card" data-widget="kostencalc">
<div class="calc-in">
<div class="ctrl"><label for="kcPrice"><span>Aanschafprijs</span><b id="kcPriceOut">€330</b></label><input id="kcPrice" type="range" min="100" max="900" step="10" value="330"></div>
<div class="ctrl"><label for="kcCats"><span>Aantal katten</span><b id="kcCatsOut">1</b></label><input id="kcCats" type="range" min="1" max="4" step="1" value="1"></div>
<div class="ctrl"><label for="kcYears"><span>Jaren gebruik</span><b id="kcYearsOut">3</b></label><input id="kcYears" type="range" min="1" max="6" step="1" value="3"></div>
<div class="ctrl"><label for="kcBag"><span>Prijs per afvalzak</span><b id="kcBagOut">€0,55</b></label><input id="kcBag" type="range" min="0" max="1.5" step="0.05" value="0.55"></div>
</div>
<div class="calc-out"><p class="kick">Totale kosten</p><p class="calc-total" id="kcTotal">€…</p><p class="calc-month" id="kcMonth"></p><ul class="calc-list" id="kcList"></ul>
<p class="fine">Aannames: 1 afvalzak per kat per week, een filter of geurblokje van €14 per kwartaal, stroom €12 per jaar en klontvormende vulling van €2,20 per kg, waarvan een automatische bak per kat ongeveer 3 kg per maand verbruikt. Allemaal schattingen; pas ze aan op jouw situatie.</p></div>
</div>`;
}

// ---------- images ----------
let PRELOAD = null;
let CUR_KW = '';
const kwAlt = (alt, priority) => {
  if (!priority || !CUR_KW || alt.toLowerCase().includes(CUR_KW.toLowerCase())) return alt;
  return CUR_KW[0].toUpperCase() + CUR_KW.slice(1) + ': ' + alt[0].toLowerCase() + alt.slice(1);
};
function img(key, { w = 800, h = 800, priority = false, eager = false, sizes = '(max-width: 800px) 100vw, 50vw', cls = 'ear', caption = false } = {}) {
  const im = images[key];
  if (!im) throw new Error(`Onbekende afbeelding ${key}`);
  const load = priority ? 'fetchpriority="high" loading="eager"' : eager ? 'loading="eager"' : 'loading="lazy"';
  if (im.local) {
    const srcset = im.widths.map((ww) => `${im.local}-${ww}.webp ${ww}w`).join(', ');
    const def = im.widths.find((ww) => ww >= w) || im.widths[im.widths.length - 1];
    if (priority && !PRELOAD) PRELOAD = { src: `${im.local}-${def}.webp`, srcset, sizes };
    return `<figure class="photo ${cls}">
<img src="${im.local}-${def}.webp" srcset="${srcset}" sizes="${sizes}" width="${w}" height="${h}" style="aspect-ratio:${w}/${h}" alt="${esc(kwAlt(im.alt, priority))}" ${load} decoding="async">
</figure>`;
  }
  const q = (ww) => `${im.src}?auto=format&fit=crop&w=${ww}&h=${Math.round((ww * h) / w)}&q=70`;
  const srcset = [Math.round(w / 2), w, Math.round(w * 1.5)].map((ww) => `${q(ww)} ${ww}w`).join(', ');
  if (priority && !PRELOAD) PRELOAD = { src: q(w).replace(/&/g, '&amp;'), srcset: srcset.replace(/&/g, '&amp;'), sizes };
  const utm = '?utm_source=beste-automatische-kattenbak&utm_medium=referral';
  return `<figure class="photo ${cls}">
<img src="${q(w)}" srcset="${srcset}" sizes="${sizes}" width="${w}" height="${h}" style="aspect-ratio:${w}/${h}" alt="${esc(kwAlt(im.alt, priority))}" ${load} decoding="async">
${caption ? `<figcaption>Foto: <a href="${im.credit_url}${utm}" rel="nofollow noopener" target="_blank">${esc(im.credit)}</a> / <a href="https://unsplash.com/${utm}" rel="nofollow noopener" target="_blank">Unsplash</a></figcaption>` : ''}
</figure>`;
}

// Shortcodes in Markdown: [[top3]] [[tabel]] [[tijd]] [[prod:id]] [[cta:id]] [[img:key]] [[lijst:filter]]
function renderBody(md) {
  const blocks = [];
  const stash = (html) => `\n\nXBLOCK${blocks.push(html) - 1}X\n\n`;
  const src = md.replace(/^\[\[([a-z0-9]+)(?::([a-z0-9-]+))?\]\]\s*$/gm, (_, name, arg) => {
    if (name === 'top3') return stash(top3());
    if (name === 'tabel') return stash(compareTable());
    if (name === 'tijd') return stash(tijdPanel());
    if (name === 'prod') { if (!byId[arg]) throw new Error(`Onbekend product ${arg}`); return stash(`<div class="inline-card">${productCard(byId[arg])}</div>`); }
    if (name === 'cta') { if (!byId[arg]) throw new Error(`Onbekend product ${arg}`); return stash(`<p>${cta(byId[arg], `Bekijk de ${byId[arg].name} bij ${lowest(byId[arg]).shop}`)}</p>`); }
    if (name === 'img') return stash(img(arg, { w: 1200, h: 700, sizes: '(max-width: 900px) 100vw, 760px' }));
    if (name === 'prijsindex') return stash(prijsindex());
    if (name === 'liters') return stash(litersTable());
    if (name === 'winkels') return stash(winkelsTable());
    if (name === 'acc') return stash(accTable(arg));
    if (name === 'keuzehulp') return stash(keuzehulp());
    if (name === 'kostencalc') return stash(kostencalc());
    if (name === 'merk') { const l = products.filter((p) => p.brand.toLowerCase().replace(/[^a-z0-9]+/g, '-') === arg); if (!l.length) throw new Error(`Geen producten van merk ${arg}`); return stash(`<div class="ins-list inline-list">${l.map((p, n) => productCard(p, { featured: n === 0 })).join('')}</div>`); }
    if (name === 'lijst') { const f = FILTERS[arg]; if (!f) throw new Error(`Onbekend filter ${arg}`); return stash(`<div class="ins-list inline-list">${products.filter(f).slice(0, 5).map((p, n) => productCard(p, { featured: n === 0 })).join('')}</div>`); }
    throw new Error(`Onbekende shortcode ${name}`);
  });
  let html = marked.parse(src);
  html = html.replace(/<table>([\s\S]*?)<\/table>/g, (m, inner) => {
    const heads = [...(inner.match(/<thead>[\s\S]*?<\/thead>/) || [''])[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((x) => x[1].replace(/<[^>]+>/g, '').replace(/"/g, '&quot;'));
    const body = inner.replace(/<tr>([\s\S]*?)<\/tr>/g, (row, cells) => { let n = 0; return '<tr>' + cells.replace(/<td([^>]*)>/g, (c, a) => `<td${a} data-label="${heads[n++] || ''}">`) + '</tr>'; });
    return `<table class="cards-sm">${body}</table>`;
  });
  html = html.replace(/<p>XBLOCK(\d+)X<\/p>/g, (_, n) => blocks[n]);
  html = html.replace(/<a href="(https?:\/\/[^"]+)"/g, (m, u) => u.startsWith(site.url) ? m : `<a href="${u}" rel="nofollow noopener" target="_blank"`);
  return html;
}

// ---------- pagina's ----------
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.md') ? [path.join(dir, d.name)] : []);
}
function parsePage(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`Geen frontmatter in ${file}`);
  const fm = yaml.load(m[1]);
  if (!fm.slug) throw new Error(`slug ontbreekt in ${file}`);
  return { ...fm, body: m[2], file: path.relative(ROOT, file) };
}
const mdPages = walk(path.join(CONTENT, 'pages')).map(parsePage).filter((p) => p.status !== 'draft');

// Reviewpagina's per product: automatisch uit products.yaml, eventueel aangevuld met
// content/reviews/<id>.md (frontmatter overschrijft, body komt in de review).
const REVIEWS = path.join(CONTENT, 'reviews');
function reviewPage(p) {
  const o = lowest(p);
  const extraFile = path.join(REVIEWS, p.id + '.md');
  const extra = fs.existsSync(extraFile) ? parsePage(extraFile) : { body: '' };
  const kw = `${p.name.toLowerCase()} review`;
  const shops = [...new Set(p.offers.map((x) => x.shop))];
  const fit = (cands, lo, hi) => cands.find((c) => c.length >= lo && c.length <= hi) || cands.sort((a, b) => Math.abs(a.length - (lo + hi) / 2) - Math.abs(b.length - (lo + hi) / 2))[0];
  const tl = p.tagline.charAt(0).toLowerCase() + p.tagline.slice(1);
  const pr = `vanaf ${eur(o.price)}${o.condition === 'refurbished' ? ' refurbished' : ''} bij ${o.shop}`;
  const desc = fit([
    `${p.name} review: ${tl}. Prijs ${pr}, plussen en minnen op een rij.`,
    `${p.name} review: ${tl}. Prijs ${pr}, met plussen, minnen en alternatieven.`,
    `${p.name} review: ${tl}. Prijs ${pr}. Plussen, minnen, specificaties en alternatieven op een rij.`,
    `${p.name} review: ${tl}. Prijs ${pr}. Alle plussen, minnen, specificaties en de beste alternatieven op een rij.`,
    `${p.name} review: ${tl}. ${cap(pr)}.`,
    `${p.name} review: ${tl}. Bekijk de plussen, minnen en prijzen.`,
      `${p.name} review: ${tl}. Prijs ${pr}, met plussen en minnen.`,
    `${p.name} review: ${tl}. Prijs ${pr}, plussen en minnen.`,
    `${p.name} review: ${tl}. Prijs ${pr}, met plussen, minnen en specs.`,
    `${p.name} review: ${tl}. Prijs ${pr}, met plussen, minnen en specs op een rij.`,
  ], 140, 160);
  const seoTitle = fit([`${p.name} review 2026: prijs, plussen en minnen`, `${p.name} review: prijs, specs en alternatieven`, `${p.name} review 2026: prijs, specs en minpunten`, `${p.name} review 2026: prijs en specificaties`, `${p.name} automatische kattenbak review: prijs en minpunten`, `${p.name} review 2026: prijs, plussen, minnen en alternatief`, `${p.name} review: prijs, plussen en minnen`, `${p.name} review 2026: kopen of niet?`, `${p.name} review: automatische kattenbak kopen?`, `${p.name} automatische kattenbak review 2026`, `${p.name} review 2026: automatische kattenbak met plussen`, `${p.name} review en prijs`, `${p.name}: review en prijzen`], 50, 60);
  const faq = [
    { q: `Wat kost de ${p.name}?`, a: `De laagste prijs die we vonden is ${eur(o.price)} bij ${o.shop}${o.condition === 'refurbished' ? ' (refurbished)' : ''}${lowestNew(p) && o.condition === 'refurbished' ? `. Nieuw kost hij vanaf ${eur(lowestNew(p).price)} bij ${lowestNew(p).shop}` : ''}. Prijzen gecheckt op ${nlDate(pdata.checked)}; de webshop is leidend.` },
    { q: `Is de ${p.name} geschikt voor een grote kat?`, a: p.max_cat_kg ? `Volgens de fabrikant is hij geschikt voor katten tot ${p.max_cat_kg} kg.${p.capacity_l ? ` De binnenruimte is ${String(p.capacity_l).replace('.', ',')} liter.` : ''}` : p.capacity_l ? `Een maximaal kattengewicht staat er niet bij, maar met ${String(p.capacity_l).replace('.', ',')} liter binnenruimte is hij ${p.capacity_l >= 60 ? 'ruim' : 'eerder compact'}. Twijfel je, kijk dan bij [automatische kattenbak voor een grote kat](/automatische-kattenbak-grote-kat/).` : `Een maximaal kattengewicht of binnenmaat staat niet in de productinformatie. Heb je een Maine Coon of Ragdoll, kies dan liever een bak waar dat wel bij staat: zie [automatische kattenbak voor een grote kat](/automatische-kattenbak-grote-kat/).` },
    { q: `Werkt de ${p.name} met een app?`, a: p.app === true ? `Ja. ${p.camera ? 'Je kunt ook meekijken via de ingebouwde camera.' : 'Een camera zit er niet in.'}` : p.app === false ? 'Nee, deze bak werkt zonder app.' : 'Dat staat niet duidelijk in de productinformatie van de winkel. Vraag het na bij de webshop als een app voor jou belangrijk is.' },
  ];
  return {
    slug: reviewUrl(p), template: 'review', product: p.id, status: 'published', title: p.name,
    h1: `${p.name} review: ${p.badge.toLowerCase()}`, breadcrumb: p.name, kicker: p.brand,
    lead: `${p.tagline}. ${p.best_for}? Dan is dit een kandidaat. Hieronder de plussen, de minnen en waar je hem het voordeligst koopt (${shops.join(', ')}).`,
    seo_title: seoTitle,
    meta_description: desc,
    primary_keyword: kw, search_intent: 'commercial', published: pdata.checked, updated: pdata.checked,
    faq, related: ['/automatische-kattenbak-vergelijken/', '/beste-automatische-kattenbak-2026/', '/kennisbank/is-een-automatische-kattenbak-veilig/'],
    sources: p.offers.some((x) => x.shop === 'bol.com') ? ['daisycon_feed', 'bol_productpagina'] : ['daisycon_feed'],
    ...Object.fromEntries(Object.entries(extra).filter(([k]) => !['body', 'file'].includes(k))),
    body: extra.body || '', file: extra.file || 'content/products.yaml',
  };
}
const pages = [...mdPages, ...products.map(reviewPage)];
const byUrl = Object.fromEntries(pages.map((p) => [p.slug, p]));
const buildHash = crypto.createHash('md5').update(String(Date.now())).digest('hex').slice(0, 8);

// ---------- performance ----------
const fontFace = "@font-face{font-family:'Figtree';font-style:normal;font-weight:300 900;font-display:swap;src:url(/fonts/figtree-latin.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}";
const inlineCss = (fontFace + fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8'))
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};,>])\s*/g, '$1').replace(/;}/g, '}').replace(/<\/style/gi, '').trim();

// ---------- breadcrumbs ----------
function crumbs(p) {
  if (p.slug === '/') return [];
  const parts = p.slug.split('/').filter(Boolean);
  const list = [{ name: 'Home', url: '/' }];
  let acc = '/';
  parts.forEach((seg) => {
    acc += seg + '/';
    const t = byUrl[acc];
    if (t) list.push({ name: t.breadcrumb || t.title, url: acc });
  });
  return list;
}

// ---------- schema ----------
function productSchema(p, withReview) {
  const offers = p.offers;
  const s = {
    '@type': 'Product', '@id': abs(reviewUrl(p)) + '#product', name: p.name, brand: { '@type': 'Brand', name: p.brand },
    image: pimg(p, 800), description: p.tagline,
    offers: { '@type': 'AggregateOffer', priceCurrency: 'EUR', lowPrice: Math.min(...offers.map((o) => o.price)), highPrice: Math.max(...offers.map((o) => o.price)), offerCount: offers.length },
  };
  const reviewer = { '@type': 'Organization', name: 'Beste-automatische-kattenbak.nl', url: abs('/') };
  if (withReview) s.review = { '@type': 'Review', name: `${p.name} review`, author: reviewer, publisher: reviewer, datePublished: isoDate(pdata.checked), reviewRating: { '@type': 'Rating', ratingValue: p.score, bestRating: 10, worstRating: 1 }, positiveNotes: { '@type': 'ItemList', itemListElement: p.pros.map((x, n) => ({ '@type': 'ListItem', position: n + 1, name: x })) }, negativeNotes: { '@type': 'ItemList', itemListElement: p.cons.map((x, n) => ({ '@type': 'ListItem', position: n + 1, name: x })) } };
  return s;
}
function featuredProduct(p) {
  if (p.featured) return byId[p.featured] || null;
  const b = p.body || '';
  const m = b.match(/\[\[(top3|tabel|lijst:[\w-]+|prod:[\w-]+|cta:[\w-]+)\]\]/);
  if (['home', 'vergelijker', 'hub-kattenbakken'].includes(p.template)) return products[0];
  if (!m) return null;
  const t = m[1];
  if (t === 'top3' || t === 'tabel') return products[0];
  if (t.startsWith('lijst:')) { const f = FILTERS[t.slice(6)]; const l = f ? products.filter(f.fn || f) : []; return l[0] || null; }
  return byId[t.split(':')[1]] || null;
}
function schemaFor(p, bc) {
  const url = abs(p.slug);
  const graph = [];
  const org = { '@type': 'Organization', '@id': abs('/#organisatie'), name: site.organization.name, url: abs('/'), email: site.organization.email, logo: abs('/logo.png'), sameAs: site.social, founder: { '@id': abs(site.author.url + '#persoon') } };
  const person = { '@type': 'Person', '@id': abs(site.author.url + '#persoon'), name: site.author.name, url: abs(site.author.url), jobTitle: site.author.role, sameAs: [site.author.tiktok], image: abs('/media/mila-nala-samen-960.webp') };
  if (p.slug === '/') {
    graph.push(org, {
      '@type': 'WebSite', '@id': abs('/#website'), url: abs('/'), name: site.name, inLanguage: site.language, publisher: { '@id': org['@id'] },
      potentialAction: { '@type': 'SearchAction', target: abs('/zoeken/?q={search_term_string}'), 'query-input': 'required name=search_term_string' },
    });
  }
  const isArticle = ['article', 'review', 'landing'].includes(p.template);
  const page = {
    '@type': isArticle ? 'Article' : p.template === 'author' ? 'ProfilePage' : (p.template === 'about' ? 'AboutPage' : p.template === 'contact' ? 'ContactPage' : 'WebPage'),
    '@id': url + '#pagina', url, name: p.seo_title, headline: isArticle ? p.h1 : undefined, description: p.meta_description, inLanguage: site.language,
    datePublished: isoDate(p.published), dateModified: isoDate(p.updated),
    isPartOf: { '@id': abs('/#website') },
  };
  if (isArticle) { page.author = person; page.publisher = { '@id': org['@id'] }; }
  if (p.template === 'author') { page.mainEntity = person; }
  if (p.image) page.image = imgUrl(p.image);
  if (p.template === 'review') { const pr = byId[p.product]; page.image = pimg(pr, 800); page.about = { '@id': abs(reviewUrl(pr)) + '#product' }; }
  graph.push(page);
  if (p.template === 'review') graph.push(productSchema(byId[p.product], true));
  else if (['landing', 'article', 'vergelijker', 'home', 'hub-kattenbakken'].includes(p.template)) {
    const feat = featuredProduct(p);
    if (feat) { page.about = { '@id': abs(reviewUrl(feat)) + '#product' }; graph.push(productSchema(feat, true)); }
  }
  if (bc.length) graph.push({ '@type': 'BreadcrumbList', itemListElement: bc.map((b, n) => ({ '@type': 'ListItem', position: n + 1, name: b.name, item: abs(b.url) })) });
  if (p.faq?.length) graph.push({ '@type': 'FAQPage', mainEntity: p.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') } })) });
  if (['home', 'vergelijker', 'hub-kattenbakken'].includes(p.template)) {
    graph.push({ '@type': 'ItemList', name: 'Automatische kattenbakken vergeleken', itemListElement: products.map((pr) => ({ '@type': 'ListItem', position: pr.rank, name: pr.name, url: abs(reviewUrl(pr)) })) });
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph.map((g) => JSON.parse(JSON.stringify(g))) });
}

// ---------- layout ----------
const logo = `<svg class="brand-mark" width="44" height="44" viewBox="0 0 48 48" aria-hidden="true"><path d="M39 33c5-1 7-6 5-11-1-3-4-4-5-2" fill="none" stroke="#33262E" stroke-width="2.6" stroke-linecap="round"/><path d="M13.5 17 13 5.5l7.5 6.2a14 14 0 0 1 7 0L35 5.5 34.5 17c1.5 2 2.5 4.6 2.5 7.5V30H11v-5.5c0-2.9 1-5.5 2.5-7.5z" fill="#33262E"/><path d="M15.2 13.8 15 9.2l3.4 2.8zM32.8 13.8 33 9.2l-3.4 2.8z" fill="#F6B8C3"/><ellipse cx="19.4" cy="21" rx="2.3" ry="2.6" fill="#F3C98B"/><ellipse cx="28.6" cy="21" rx="2.3" ry="2.6" fill="#F3C98B"/><rect x="18.9" y="19.2" width="1" height="3.6" rx=".5" fill="#33262E"/><rect x="28.1" y="19.2" width="1" height="3.6" rx=".5" fill="#33262E"/><path d="M23 25.2h2l-1 1.1z" fill="#F6B8C3"/><path d="M4.5 28.5h39l-2.2 11.6a5 5 0 0 1-4.9 4.1H11.6a5 5 0 0 1-4.9-4.1z" fill="#F6D3D8" stroke="#33262E" stroke-width="2.4" stroke-linejoin="round"/><ellipse cx="18" cy="28.6" rx="3.4" ry="2.4" fill="#FFF8F3" stroke="#33262E" stroke-width="2"/><ellipse cx="30" cy="28.6" rx="3.4" ry="2.4" fill="#FFF8F3" stroke="#33262E" stroke-width="2"/></svg>`;

const googleTagId = /^(GTM|G|GT|AW)-[A-Z0-9]+$/.test(site.google_tag || '') ? site.google_tag : '';
const googleTag = googleTagId ? `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());(function(){var d=0;function g(){if(d)return;d=1;var s=document.createElement('script');s.async=1;s.src='https://www.googletagmanager.com/gtm.js?id=${googleTagId}';document.head.appendChild(s);}['pointerdown','keydown','scroll','touchstart'].forEach(function(e){addEventListener(e,g,{once:true,passive:true});});addEventListener('load',function(){setTimeout(g,3500);});})();</script>
` : '';

function layout(p, main) {
  const bc = crumbs(p);
  const canonical = p.canonical || abs(p.slug);
  const robots = `${p.index === false ? 'noindex' : 'index'},${p.follow === false ? 'nofollow' : 'follow'}${p.index === false ? '' : ',max-image-preview:large'}`;
  const ogImg = p.template === 'review' ? pimg(byId[p.product], 800) : p.image ? imgUrl(p.image) : abs('/og-default.png');
  const nav = site.nav.map((n) => `<a href="${n.url}"${p.slug.startsWith(n.url) ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`).join('');
  const bcHtml = bc.length ? `<nav class="wrap crumbs" aria-label="Kruimelpad"><ol>${bc.map((b, n) => n === bc.length - 1 ? `<li aria-current="page">${esc(b.name)}</li>` : `<li><a href="${b.url}">${esc(b.name)}</a></li>`).join('')}</ol></nav>` : '';
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="ec52c63d6af1381" content="f3ce040e82d09a3c9a2e310c732514b4" />
${googleTag}<title>${esc(p.seo_title)}</title>
<meta name="description" content="${esc(p.meta_description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="${robots}">
<meta property="og:type" content="${['article', 'review', 'landing'].includes(p.template) ? 'article' : 'website'}">
<meta property="og:title" content="${esc(p.og_title || p.seo_title)}">
<meta property="og:description" content="${esc(p.og_description || p.meta_description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${esc(ogImg)}">
<meta property="og:locale" content="nl_NL">
<meta property="og:site_name" content="${site.name}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#FFF8F3">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="alternate" type="text/plain" href="/llms.txt" title="Samenvatting voor taalmodellen">
<link rel="preload" href="/fonts/figtree-latin.woff2" as="font" type="font/woff2" crossorigin>
${PRELOAD ? `<link rel="preload" as="image" href="${PRELOAD.src}" imagesrcset="${PRELOAD.srcset}" imagesizes="${PRELOAD.sizes}" fetchpriority="high">` : ''}
<link rel="preconnect" href="https://images.unsplash.com">
<link rel="preconnect" href="https://images.daisycon.io">
<style>${inlineCss}</style>
<script type="application/ld+json">${schemaFor(p, bc)}</script>
</head>
<body class="t-${p.template}">
<a class="skip" href="#inhoud">Naar de inhoud</a>
<header class="site-header"><div class="wrap header-in">
<a class="brand" href="/" aria-label="Beste automatische kattenbak, naar home">${logo}<span class="wordmark"><small>Beste automatische</small><b>kattenbak<i class="dot">.</i></b></span></a>
<nav class="main-nav" aria-label="Hoofdmenu">${nav}</nav>
<a class="btn btn-sm hide-sm" href="/automatische-kattenbak-vergelijken/">Vergelijk nu</a>
<details class="mobile-nav"><summary aria-label="Menu openen"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 8h16M4 16h16"/></svg></summary><nav aria-label="Mobiel menu">${nav}<a href="/zoeken/">Zoeken</a></nav></details>
</div></header>
${bcHtml}
<main id="inhoud">
${main}
</main>
<footer class="site-footer"><div class="wrap footer-grid">
<div><p class="footer-brand"><svg width="38" height="38" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#FFF8F3"/><g transform="translate(4 3) scale(.84)"><path d="M39 33c5-1 7-6 5-11-1-3-4-4-5-2" fill="none" stroke="#33262E" stroke-width="2.6" stroke-linecap="round"/><path d="M13.5 17 13 5.5l7.5 6.2a14 14 0 0 1 7 0L35 5.5 34.5 17c1.5 2 2.5 4.6 2.5 7.5V30H11v-5.5c0-2.9 1-5.5 2.5-7.5z" fill="#33262E"/><path d="M15.2 13.8 15 9.2l3.4 2.8zM32.8 13.8 33 9.2l-3.4 2.8z" fill="#F6B8C3"/><ellipse cx="19.4" cy="21" rx="2.3" ry="2.6" fill="#F3C98B"/><ellipse cx="28.6" cy="21" rx="2.3" ry="2.6" fill="#F3C98B"/><rect x="18.9" y="19.2" width="1" height="3.6" rx=".5" fill="#33262E"/><rect x="28.1" y="19.2" width="1" height="3.6" rx=".5" fill="#33262E"/><path d="M23 25.2h2l-1 1.1z" fill="#F6B8C3"/><path d="M4.5 28.5h39l-2.2 11.6a5 5 0 0 1-4.9 4.1H11.6a5 5 0 0 1-4.9-4.1z" fill="#F6D3D8" stroke="#33262E" stroke-width="2.4" stroke-linejoin="round"/><ellipse cx="18" cy="28.6" rx="3.4" ry="2.4" fill="#FFF8F3" stroke="#33262E" stroke-width="2"/><ellipse cx="30" cy="28.6" rx="3.4" ry="2.4" fill="#FFF8F3" stroke="#33262E" stroke-width="2"/></g></svg> beste automatische kattenbak</p><p>${esc(site.tagline)}. Gemaakt door <a href="${site.author.url}">Robin</a>, baasje van Mila &amp; Nala. Wij vergelijken op specificaties en prijs; we testen niet zelf in een lab.</p><p><a href="${site.author.tiktok}" rel="me noopener" target="_blank">TikTok ${esc(site.author.tiktok_handle)}</a></p></div>
${site.footer.map((c) => `<nav aria-label="${esc(c.title)}"><b>${esc(c.title)}</b>${c.links.map((l) => `<a href="${l.url}">${esc(l.label)}</a>`).join('')}</nav>`).join('')}
</div><div class="wrap footer-fine">Foto’s van Mila &amp; Nala: Robin. Overige foto’s via Unsplash, productfoto’s van de webshops. Prijzen gecheckt op ${nlDate(pdata.checked)}; prijzen en voorraad veranderen, de webshop is altijd leidend. Knoppen naar webshops zijn partnerlinks. beste-automatische-kattenbak.nl is een website van Bunt Digital.</div></footer>
${p.template === 'vergelijker' || p.template === 'search' || /data-widget=/.test(main) ? `<script src="/assets/app.js?v=${buildHash}" defer></script>` : ''}
</body>
</html>`;
}



// ---------- uitgebreide review: oordeel, scorekaart, kosten, duel ----------
const medianNew = (() => { const a = products.map((x) => lowest(x).price).sort((a, b) => a - b); return a[Math.floor(a.length / 2)]; })();
const yearCost = (cats = 1) => Math.round(52 * cats * 0.55 + 56 + 12 + 3 * 12 * cats * 2.2);
const nl = (n) => String(n).replace('.', ',');
function reviewVerdict(pr) {
  const o = lowest(pr); const cheap = o.price < medianNew * 0.8; const pricey = o.price > medianNew * 1.4;
  const t = [];
  t.push(pr.score >= 8.5 ? `De ${pr.name} hoort voor mij bij de bakken die ik een vriend zonder twijfel zou aanraden.` : pr.score >= 8 ? `De ${pr.name} vind ik een goede keuze, met een paar kanttekeningen die je moet kennen.` : pr.score >= 7.6 ? `De ${pr.name} is een prima bak voor een duidelijke doelgroep, maar niet mijn eerste keus voor iedereen.` : `Eerlijk is eerlijk: de ${pr.name} staat bij mij onderaan het lijstje. Niet omdat hij slecht is, maar omdat je voor iets meer geld vaak meer zekerheid koopt.`);
  if (pricey) t.push(`Hij is prijzig. Dat is de eerlijke kant van het verhaal. Toch zeg ik vanuit mijn eigen ervaring: goedkoop is bij een automatische kattenbak vaak duurkoop. Een bak die elke dag werkt en die je katten vertrouwen, verdien je terug in tijd en rust.`);
  else if (cheap) t.push(`De prijs is aantrekkelijk. Maar let op: goedkoop is bij een automatische kattenbak soms duurkoop. Ik zou bij deze prijsklasse extra goed kijken naar de reviews en naar hoe makkelijk je hem schoonhoudt.`);
  else t.push(`Qua prijs zit hij in het midden van onze vergelijking (de middelste prijs is ongeveer ${eur0(medianNew)}). Dat vind ik een gezonde plek: je betaalt niet voor een merknaam, maar ook niet zo weinig dat je aan de basis gaat twijfelen.`);
  if (pr.camera) t.push(`Groot pluspunt voor mij: er zit een camera op. Die optie vond ik zelf heel fijn. Ik wil weten dat het goed gaat als ik niet thuis ben, en met een camera zie je dat gewoon. Dat geeft vertrouwen.`);
  else t.push(`Er zit geen camera op. Voor veel mensen is dat prima. Ik vind een camera zelf heel fijn voor de veiligheid en het vertrouwen, dus wil jij meekijken als je niet thuis bent, kijk dan ook naar de <a href="/automatische-kattenbak-met-camera/">automatische kattenbakken met camera</a>.`);
  t.push(pr.shape === 'open' ? `Het is een open model. Dat vind ik voor veel katten de makkelijkste start, omdat ze zien wat er gebeurt. Bij Mila en Nala heb ik gemerkt dat wennen echt tijd kost, en een open bak maakt die stap kleiner.` : pr.shape === 'globe' ? `De draaiende bol is een bewezen systeem, maar het blijft een dichte bak met een ingang. Geef je kat dus de tijd om te wennen.` : `Het is een dicht model. Fijn voor de privacy van je kat en tegen geur en rondvliegende korrels. Let wel op de bovenkant en de rand: bij sommige automatische kattenbakken blijft die vies, en dat moet je dan zelf bijhouden.`);
  if (pr.bol_rating) t.push(`Op bol.com geven kopers hem gemiddeld een ${nl(pr.bol_rating)} van 5 (${pr.bol_reviews} reviews). ${pr.bol_reviews >= 100 ? 'Dat zijn genoeg reviews om serieus te nemen.' : pr.bol_reviews >= 20 ? 'Dat is een redelijk aantal, maar nog geen grote groep.' : 'Dat zijn er nog weinig, dus neem dat cijfer met een korrel kattengrit.'}`);
  return t.map((x) => `<p>${x}</p>`).join('');
}
function scoreCard(pr) {
  const o = lowest(pr);
  const rows = [
    ['Ruimte', pr.capacity_l ? (pr.capacity_l >= 75 ? 'Heel ruim' : pr.capacity_l >= 60 ? 'Ruim' : 'Compact') : 'Onbekend', pr.capacity_l ? `${nl(pr.capacity_l)} liter binnenruimte.${pr.capacity_l >= 60 ? ' Genoeg voor een grote kat om te draaien.' : ' Voor een grote kat aan de krappe kant.'}` : 'De binnenruimte staat niet in de productinformatie.'],
    ['Veiligheid', pr.min_cat_kg ? (pr.min_cat_kg <= 1 ? 'Goed' : 'Let op bij kittens') : 'Onbekend', pr.min_cat_kg ? `De bak herkent een kat vanaf ${nl(pr.min_cat_kg)} kg. ${pr.min_cat_kg <= 1 ? 'Daarmee is hij ook voor jonge katten bruikbaar, met toezicht.' : 'Een kitten moet dus eerst wat groeien; zet de automatische stand tot die tijd uit.'}` : 'Een minimumgewicht staat er niet bij. Vraag het na voordat je een kitten laat gaan.'],
    ['Onderhoud', pr.shape === 'open' ? 'Korrels letten' : 'Bovenkant letten', pr.shape === 'open' ? 'Open bakken zijn makkelijk schoon te houden, maar korrels gaan sneller over de rand. Een mat eronder helpt.' : 'Dichte bakken houden korrels en geur beter binnen. Veeg de rand en de bovenkant wel elke week af; daar blijft vuil het snelst zitten.'],
    ['Slim', pr.camera ? 'App + camera' : pr.app ? 'App' : 'Basis', pr.camera ? 'App en camera: je ziet wie de bak gebruikt en kunt meekijken.' : pr.app ? 'Met app: meldingen als de afvalbak vol is en een logboek van bezoeken.' : 'Geen app opgegeven.'],
    ['Prijs', o.price < medianNew * 0.8 ? 'Voordelig' : o.price > medianNew * 1.4 ? 'Prijzig' : 'Gemiddeld', `${eur(o.price)} bij ${o.shop}. ${pr.capacity_l ? `Dat is ${eur(o.price / pr.capacity_l)} per liter binnenruimte. ` : ''}De middelste prijs in onze vergelijking is ${eur0(medianNew)}.`],
  ];
  return `<table class="spec score-table"><thead><tr><th scope="col">Onderdeel</th><th scope="col">Oordeel</th><th scope="col">Waarom</th></tr></thead><tbody>${rows.map(([a, b, c]) => `<tr><th scope="row">${a}</th><td><b>${b}</b></td><td>${c}</td></tr>`).join('')}</tbody></table>`;
}
function rivalOf(pr) {
  const o = lowest(pr).price;
  return products.filter((x) => x.id !== pr.id).sort((a, b) => (Math.abs(lowest(a).price - o) + (a.shape === pr.shape ? 0 : 60)) - (Math.abs(lowest(b).price - o) + (b.shape === pr.shape ? 0 : 60)))[0];
}
function duel(pr) {
  const r = rivalOf(pr); const a = lowest(pr), b = lowest(r);
  const row = (l, f) => `<tr><th scope="row">${l}</th><td>${esc(f(pr))}</td><td>${esc(f(r))}</td></tr>`;
  const winner = pr.score > r.score ? pr : pr.score < r.score ? r : (a.price <= b.price ? pr : r);
  return `<h2>${esc(pr.name)} of ${esc(r.name)}?</h2>
<p>De bak waar je de ${esc(pr.name)} het vaakst tegen afweegt, is de <a href="${reviewUrl(r)}">${esc(r.name)}</a>: ${pr.shape === r.shape ? 'hetzelfde type' : 'een ander type'} en ${Math.abs(a.price - b.price) < 30 ? 'bijna dezelfde prijs' : `een verschil van ${eur(Math.abs(a.price - b.price))}`}.</p>
<table class="spec"><thead><tr><th scope="col"></th><th scope="col">${esc(pr.name)}</th><th scope="col">${esc(r.name)}</th></tr></thead><tbody>
${row('Laagste prijs', (x) => `${eur(lowest(x).price)} (${lowest(x).shop})`)}${row('Onze score', (x) => score(x.score))}${row('Type', (x) => shapeLabel[x.shape])}${row('Binnenruimte', (x) => x.capacity_l ? `${nl(x.capacity_l)} liter` : 'Niet opgegeven')}${row('Vanaf kattengewicht', (x) => x.min_cat_kg ? `${nl(x.min_cat_kg)} kg` : 'Niet opgegeven')}${row('Camera', (x) => yn(x.camera))}${row('Beoordeling bol.com', (x) => x.bol_rating ? `${nl(x.bol_rating)} (${x.bol_reviews})` : 'Niet opgegeven')}
</tbody></table>
<p><b>Mijn keuze:</b> ${winner === pr ? `ik zou voor de ${esc(pr.name)} gaan` : `ik zou eerder voor de ${esc(r.name)} gaan`}${winner.camera && !(winner === pr ? r : pr).camera ? ', mede vanwege de camera' : winner.capacity_l && (winner === pr ? r : pr).capacity_l && winner.capacity_l > (winner === pr ? r : pr).capacity_l ? ', vooral vanwege de extra ruimte' : ''}. Twijfel je nog, zet ze dan met de rest naast elkaar in de <a href="/automatische-kattenbak-vergelijken/">vergelijker</a>.</p>`;
}
function reviewExtra(pr) {
  const o = lowest(pr); const y1 = yearCost(1), y2 = yearCost(2);
  return `<h2>${esc(pr.name)} review: mijn oordeel</h2>
${reviewVerdict(pr)}
<h2>${esc(pr.name)} review op vijf punten die ik belangrijk vind</h2>
<p>Bij Mila en Nala heb ik geleerd waar het in de praktijk om draait. Niet om het aantal functies op de doos, maar om deze vijf dingen:</p>
${scoreCard(pr)}
<h2>Voor wie is de ${esc(pr.name)} wel en niet geschikt?</h2>
<div class="pros-cons"><div><p><b>Wel een aanrader als…</b></p><ul class="ticks">${[
  pr.multi_cat ? 'je meer dan één kat hebt' : null,
  pr.min_cat_kg && pr.min_cat_kg <= 1 ? 'je een jonge kat hebt (vanaf ' + nl(pr.min_cat_kg) + ' kg)' : null,
  pr.camera ? 'je wilt kunnen meekijken als je niet thuis bent' : null,
  pr.shape === 'open' ? 'je kat schrikachtig is of een lage, open instap nodig heeft' : 'je korrels en geur zoveel mogelijk binnen de bak wilt houden',
  pr.capacity_l >= 60 ? 'je een grote kat hebt' : null,
].filter(Boolean).slice(0, 4).map((x) => tick(cap(x))).join('')}</ul></div>
<div><p><b>Kies liever iets anders als…</b></p><ul class="ticks">${[
  pr.min_cat_kg && pr.min_cat_kg > 1 ? `je kitten nog geen ${nl(pr.min_cat_kg)} kg weegt` : null,
  !pr.camera ? 'je per se een camera wilt' : null,
  pr.shape === 'open' ? 'je kat graag wild graaft (korrels over de rand)' : 'je kat een dichte bak met kap eng vindt',
  o.price > medianNew * 1.4 ? `je budget onder de ${eur0(medianNew)} ligt` : null,
  !pr.capacity_l || pr.capacity_l < 60 ? 'je een Maine Coon of andere grote kat hebt' : null,
].filter(Boolean).slice(0, 4).map((x) => `<li class="tick-no"><span aria-hidden="true">✕</span>${esc(cap(x))}</li>`).join('')}</ul></div></div>
${duel(pr)}
<h2>${esc(pr.name)} review: wat kost hij per jaar?</h2>
<p>De aanschaf is maar een deel. Ik reken met dezelfde aannames als in onze <a href="/kennisbank/kosten-automatische-kattenbak/">kostencalculator</a>: een afvalzak per kat per week, filters of geurblokjes, wat stroom en klonterende vulling. Voor één kat kom je dan op ongeveer <b>${eur(y1)} per jaar</b>, voor twee katten op ongeveer <b>${eur(y2)}</b>. Over drie jaar met één kat kost de ${esc(pr.name)} je dus rond de <b>${eur(Math.round(o.price + 3 * y1))}</b> inclusief aanschaf. Het zijn schattingen; zakjes van het eigen merk zijn vaak duurder dan gewone.</p>
<h2>De ${esc(pr.name)} in huis: zo laat je je kat wennen</h2>
<p>Dit is het stuk dat in elke handleiding te kort komt, en waar ik zelf het meest van heb geleerd. Katten moeten echt wennen aan een nieuwe bak, en aan een automatische nog meer. Bij Mila en Nala ging dat niet in één dag.</p>
<ol><li><b>Zet hem eerst uit.</b> Laat de ${esc(pr.name)} een paar dagen als gewone bak staan, zonder automatische reiniging.</li><li><b>Houd de oude bak nog even.</b> Zet de nieuwe ernaast, zodat je kat zelf kan kiezen.</li><li><b>Gebruik vertrouwde korrels</b> (als ze klonteren), of meng ze met de nieuwe.</li><li><b>Zet de automatische stand pas aan als je kat hem gewoon gebruikt</b>, en doe de eerste reiniging als je kat erbij is maar niet in de bak zit.</li></ol>
<p>Heb je twee katten? Dan heb je sowieso twee bakken nodig. Mijn advies: neem een dichte én een open bak, zodat ze zelf altijd kunnen kiezen. Meer in <a href="/kennisbank/kat-laten-wennen-aan-automatische-kattenbak/">kat laten wennen aan een automatische kattenbak</a>.</p>`;
}

// ---------- In het kort + Mijn oordeel ----------
function summaryBlock(items) {
  return ''; // bewust uit: geen 'In het kort'-blokken
  if (!items || !items.length) return '';
  return `<aside class="tldr" aria-label="In het kort"><p class="tldr-k">In het kort</p><ul>${items.map((x) => `<li>${marked.parseInline(String(x))}</li>`).join('')}</ul></aside>`;
}
function opinionBlock(text) {
  if (!text) return '';
  return `<div class="robin-note">${marked.parse(String(text))}<p class="robin-sign">– Robin, baasje van Mila en Nala</p></div>`;
}

// ---------- templates ----------
function byline(extra) {
  return `<p class="byline"><img src="/media/mila-nala-samen-480.webp" width="36" height="36" alt="Robin met zijn katten Mila en Nala" class="byline-ava">Door <a href="${site.author.url}">${esc(site.author.name)}</a>, baasje van Mila &amp; Nala · ${extra}</p>`;
}
function pageHead(p, { kicker, lead, imgKey } = {}) {
  return `<section class="wrap page-head${imgKey ? ' has-img' : ''}">
<div><p class="kick">${esc(kicker || p.kicker || '')}</p><h1 class="h1">${esc(p.h1)}</h1>${lead || p.lead ? `<p class="lead">${esc(lead || p.lead)}</p>` : ''}
${['article', 'review', 'landing'].includes(p.template) ? byline(`bijgewerkt ${nlDate(p.updated)}`) : ''}</div>
${imgKey ? img(imgKey, { w: 720, h: 620, priority: true, sizes: '(max-width: 900px) 100vw, 45vw' }) : ''}
</section>`;
}
function sourcesWrap(p) { return p.sources ? `<div class="wrap-narrow section-sm">${sourcesBlock(p.sources)}</div>` : ''; }

const T = {};

T.home = (p) => `
<section class="hero hero-v5">
<div class="wrap hero-in">
<div class="hero-copy">
<h1 class="h1 h1-xl">De beste automatische kattenbak <span class="mark">voor jouw kat</span></h1>
<p class="promise">Sinds Mila en Nala een automatische kattenbak hebben, schep ik bijna niet meer. Hier help ik je de bak te vinden die bij jouw kat en je budget past.</p>
<a class="pick-card pick-one" href="/automatische-kattenbak-vergelijken/">
<p class="pick-q">Welke automatische kattenbak past bij jouw kat?</p>
${img('kat-in-kattenbak', { w: 640, h: 400, priority: true, sizes: '(max-width: 900px) 92vw, 560px', cls: 'pick-img' })}
<span class="btn btn-lg pick-btn">Vergelijk ${products.length} kattenbakken</span>
</a>
<ul class="trust"><li><span aria-hidden="true">★</span> ${products.length} modellen vergeleken</li><li><span aria-hidden="true">✓</span> Prijzen van ${new Set(products.flatMap((x) => x.offers.map((o) => o.shop))).size} webshops</li><li><span aria-hidden="true">✓</span> Eerlijk oordeel van een kattenbaasje</li></ul>
</div>
<div class="hero-media">
${img('mila-nala-samen', { w: 600, h: 700, eager: true, sizes: '(max-width: 900px) 1px, 45vw' })}
<a class="score-card" href="${reviewUrl(products[0])}"><img src="${pimg(products[0], 160)}" width="64" height="64" alt="${esc(products[0].name)}" loading="eager"><span><small>Onze nr. 1 van 2026</small><b>${esc(products[0].name)}</b><em>vanaf ${eur(lowest(products[0]).price)}</em></span>${ring(products[0].score, 56)}</a>
<div class="note-card"><p class="note-k">Van Robin</p><p class="note-t">Ik schep veel minder</p><p>En Mila en Nala vinden het fijner. Prijzig? Ja. Spijt? Nee.</p></div>
</div></div>
</section>

<section class="wrap section">
<div class="section-head center"><p class="kick">Onze top 3 van 2026</p><h2 class="h2">Drie automatische kattenbakken die we een kattenvriend zouden aanraden</h2>
<p class="muted">Op volgorde van onze score: ruimte en veiligheid voor je kat, gemak voor jou, slimme functies en prijs. We baseren ons op de specificaties en de actuele prijzen bij Nederlandse en Europese webshops.</p></div>
${top3()}
</section>

${tijdPanel()}

<section class="wrap section prose-wide">${summaryBlock(p.summary)}${renderBody(p.body)}${opinionBlock(p.opinion)}</section>

<section class="wrap section split">
<div><p class="kick">Zonder poespas</p><h2 class="h2">Productpraat? Wij vertalen het even.</h2><p class="muted">Webshops schrijven voor algoritmes. Wij schrijven voor jou, met je kat op schoot.</p><a class="btn btn-ghost" href="/zonder-poespas/">Alle begrippen</a></div>
<div class="grid-2">
${[['“65 liter binnenruimte”', 'Hoeveel ruimte je kat heeft om te draaien. Een Maine Coon wil 60 liter of meer.'], ['“Afvalbak gaat 14 dagen mee”', 'Gemeten met één kat. Met twee katten leeg je ongeveer twee keer zo vaak.'], ['“Infraroodsensor”', 'Ziet of je kat in de bak zit en stopt dan het reinigen. Dit wil je altijd.'], ['“Refurbished”', 'Gebruikt of retour, gecontroleerd en opnieuw verkocht. Vaak honderden euro’s goedkoper.']].map(([t, d], n) => `<div class="card${n === 3 ? ' card-lime' : ''}"><p class="note-k">Er staat</p><p class="h4">${t}</p><p>${d}</p></div>`).join('')}
</div></section>

<section class="band-peach">
<div class="wrap section"><div class="section-head center"><p class="kick">Welke kat woont er bij jou?</p><h2 class="h2">Elke kat heeft een andere bak nodig</h2></div>
<div class="grid-3">
${[['kitten-grijs', '/automatische-kattenbak-kitten/', 'Een kitten', 'Pas vanaf een bepaald gewicht veilig. Zo overbrug je de eerste maanden.'], ['grote-rode-kat', '/automatische-kattenbak-grote-kat/', 'Een grote kat', 'Maine Coon of Ragdoll? Let op binnenruimte en maximaal gewicht.'], ['twee-katten', '/automatische-kattenbak-meerdere-katten/', 'Meerdere katten', 'Grote afvalbak en herkenning per kat maken het verschil.']].map(([k, u, t, d]) => `<article class="phase">${img(k, { w: 560, h: 460, sizes: '(max-width: 900px) 100vw, 33vw' })}<h3 class="h3"><a class="stretch" href="${u}">${t} →</a></h3><p class="muted">${d}</p></article>`).join('')}
</div>
<div class="card about-card">
${img('mila-nala-samen', { w: 520, h: 620, sizes: '(max-width: 900px) 100vw, 33vw' })}
<div><p class="kick">Hoi, ik ben Robin</p><h2 class="h2">Baasje van Mila en Nala. En eerlijk over geld.</h2>
<p>Mila en Nala zijn allebei 2,5 jaar en echte binnenkatten. Scheppen hoort erbij, maar het kan slimmer. Op deze site zet ik automatische kattenbakken naast elkaar: wat ze kunnen, voor welke kat ze passen en wat ze nu kosten. Hun avonturen volgen ruim 7.500 mensen op <a href="${site.author.tiktok}" rel="me noopener" target="_blank">TikTok (${esc(site.author.tiktok_handle)})</a>.</p>
<p><b>Hoe verdien ik hier geld aan?</b> Koop je via een knop op deze site een kattenbak, dan krijg ik soms een kleine vergoeding van de webshop. Jij betaalt daar niks extra voor. De volgorde koop je bij ons niet: die volgt onze score.</p>
<p>Zie je iets wat niet klopt? <a href="/contact/">Laat het weten</a>. Dan passen we het aan, met de datum erbij.</p>
<a class="btn btn-ghost" href="/auteur/robin/">Meer over Robin, Mila &amp; Nala</a></div>
</div></div></section>

<section class="wrap section"><div class="section-head"><h2 class="h2">Uit de kennisbank</h2></div>
<div class="grid-3 related">${pages.filter((x) => x.template === 'article' && x.slug.startsWith('/kennisbank/')).slice(0, 3).map((r) => `<a class="rel-card" href="${r.slug}"><span class="kick">${esc(r.kicker)}</span><b>${esc(r.h1)}</b><span>${esc(r.meta_description)}</span></a>`).join('')}</div>
<p><a class="link-strong" href="/kennisbank/">Alles in de kennisbank →</a></p></section>
${faqBlock(p.faq)}
${sourcesWrap(p)}`;

function cmpCard(p, top) {
  const f = Object.fromEntries(Object.entries(FILTERS).map(([k, fn]) => [k, fn(p) ? 1 : 0]));
  return `<div data-col="${p.id}" data-price="${lowest(p).price}" data-f='${JSON.stringify(f)}'>${productCard(p, { featured: top })}</div>`;
}

T.vergelijker = (p) => `
${pageHead(p, { kicker: `${products.length} modellen, naast elkaar` })}
<section class="wrap controls" aria-label="Pas de vergelijking aan">
<div class="ctrl"><label for="budget"><span>Maximaal budget</span><b id="budgetOut">€900</b></label>
<input id="budget" type="range" min="100" max="900" step="25" value="900"></div>
<fieldset class="ctrl"><legend>Sorteer op</legend><div class="chips" data-group="sort">
<button type="button" class="chip" data-sort="score" aria-pressed="true">Onze score</button>
<button type="button" class="chip" data-sort="price" aria-pressed="false">Laagste prijs</button></div></fieldset>
<fieldset class="ctrl"><legend>Moet erin zitten</legend><div class="chips">
<button type="button" class="chip" data-filter="app" aria-pressed="false">App</button>
<button type="button" class="chip" data-filter="camera" aria-pressed="false">Camera</button>
<button type="button" class="chip" data-filter="open" aria-pressed="false">Open model</button>
<button type="button" class="chip" data-filter="groot" aria-pressed="false">Grote kat</button>
<button type="button" class="chip" data-filter="meer" aria-pressed="false">Meerdere katten</button>
<button type="button" class="chip" data-filter="nieuw" aria-pressed="false">Nieuw (geen refurbished)</button>
</div></fieldset>
<p class="count" aria-live="polite"><b id="countOut">${products.length} van ${products.length}</b> kattenbakken passen bij jouw wensen.</p>
<p class="empty" id="emptyMsg" hidden>Geen enkele bak haalt dit lijstje. Zet een knop uit of verhoog je budget.</p>
</section>
<section class="wrap cmp-head"><h2 class="h3">Automatische kattenbak vergelijken: alle ${products.length} op een rij</h2></section>
<section class="wrap section-sm cmp-cards" aria-label="Kattenbakken als kaarten"><div class="ins-list" id="cmpList">${products.map((x, n) => cmpCard(x, n === 0)).join('')}</div>
<button type="button" class="btn btn-ghost cmp-toggle" id="tableToggle" aria-expanded="false" aria-controls="cmpTable">Alles naast elkaar in één tabel</button></section>
<section class="wrap section-sm cmp-table" id="cmpTable">${compareTable(products)}
<p class="fine">Prijzen en specificaties uit de productfeeds van de webshops, gecheckt op ${nlDate(pdata.checked)}. ‘Niet opgegeven’ betekent dat de winkel het niet vermeldt. Refurbished = gebruikt of retour, gecontroleerd en opnieuw verkocht. De knoppen zijn partnerlinks.</p>
</section>
<section class="wrap-narrow section prose">${summaryBlock(p.summary)}${renderBody(p.body)}${opinionBlock(p.opinion)}</section>
${faqBlock(p.faq)}
${sourcesWrap(p)}
${relatedBlock(p)}`;

T.review = (p) => {
  const pr = byId[p.product];
  const o = lowest(pr);
  const others = products.filter((x) => x.id !== pr.id && (x.shape === pr.shape || Math.abs(lowest(x).price - o.price) < 120)).slice(0, 3);
  return `
<section class="wrap page-head has-img">
<div><div class="review-score">${ring(pr.score, 76)}<p class="kick">${pr.rank <= 3 ? `Nr. ${pr.rank} in onze vergelijking` : `Plek ${pr.rank} van ${products.length}`}<br><span>onze score ${score(pr.score)} / 10</span></p></div>
<h1 class="h1">${esc(p.h1)}</h1><p class="lead">${esc(p.lead)}</p>
${byline(`prijzen gecheckt ${nlDate(pdata.checked)}`)}</div>
<figure class="photo prod-hero"><img src="${pimg(pr, 720)}" srcset="${pimg(pr, 480)} 480w, ${pimg(pr, 720)} 720w, ${pimg(pr, 1000)} 1000w" sizes="(max-width: 900px) 100vw, 45vw" width="720" height="720" alt="${esc(p.primary_keyword ? cap(p.primary_keyword) + ': ' : '')}${esc(pr.name)}, automatische kattenbak van ${esc(pr.brand)}" fetchpriority="high" loading="eager" decoding="async"></figure>
</section>
<section class="wrap facts">
<div><span>Laagste prijs</span><b>${eur(o.price)}</b><small>bij ${esc(o.shop)}${o.condition === 'refurbished' ? ', refurbished' : ''}</small></div>
<div><span>Type</span><b>${esc(shapeLabel[pr.shape])}</b></div>
<div><span>Kattengewicht</span><b>${esc(cap(pr.cat_weight || 'n.b.'))}</b></div>
<div><span>Slim</span><b>${pr.camera ? 'App + camera' : pr.app ? 'Met app' : 'n.b.'}</b></div>
</section>
<div class="wrap with-aside">
<article class="prose">
${summaryBlock([`**Onze score:** ${score(pr.score)} van 10, plek ${pr.rank} van ${products.length}.`, `**Laagste prijs:** ${eur(o.price)} bij ${o.shop}.`, `**Type:** ${shapeLabel[pr.shape].toLowerCase()}${pr.capacity_l ? `, ${nl(pr.capacity_l)} liter` : ''}${pr.camera ? ', met camera' : pr.app ? ', met app' : ''}.`, `**Beste voor:** ${pr.best_for.charAt(0).toLowerCase() + pr.best_for.slice(1)}.`, pr.bol_rating ? `**Kopers op bol.com:** ${nl(pr.bol_rating)} van 5 (${pr.bol_reviews} reviews).` : `**Let op:** ${String(pr.cons[0]).charAt(0).toLowerCase() + String(pr.cons[0]).slice(1)}.`])}
<h2>${esc(pr.name)} review: kopen of niet?</h2>
<p>Even eerlijk vooraf: de ${esc(pr.name)} heb ik zelf niet in huis gehad. Wat ik hier schrijf, haal ik uit de specificaties van ${esc(pr.brand)}, uit wat winkels en kopers erover zeggen, en uit wat ik zelf heb gemerkt met Mila en Nala. In één zin: ${esc(pr.tagline.charAt(0).toLowerCase() + pr.tagline.slice(1))}. En voor wie ik hem zou kiezen? ${esc(pr.best_for)}.</p>
<div class="pros-cons"><div><p><b>Wat ik goed vind</b></p><ul class="ticks">${pr.pros.map((x) => tick(x)).join('')}</ul></div>
<div><p><b>Waar je op moet letten</b></p><ul class="ticks">${pr.cons.map((x) => tick(x, 'warn')).join('')}</ul></div></div>
${renderBody(p.body)}
${reviewExtra(pr)}
<h2>${esc(pr.name)} review: alle specificaties</h2>
<table class="spec"><tbody>
${specRows.map(([l, f]) => `<tr><th scope="row">${l}</th><td>${esc(f(pr))}</td></tr>`).join('')}
</tbody></table>
<h2>${esc(pr.name)} kopen: prijzen per winkel</h2>
<div class="offers">${[...pr.offers].sort((a, b) => a.price - b.price).map((x) => `<div class="offer"><div><b>${esc(x.shop)}</b> ${condTag(x)}<small>${x.condition === 'refurbished' ? 'Gecontroleerd, gebruikt of retour' : 'Nieuw'}</small></div><span class="offer-price">${eur(x.price)}</span>${cta(pr, 'Naar de winkel →', x, 'btn btn-sm')}</div>`).join('')}</div>
<p class="fine">Prijzen gecheckt op ${nlDate(pdata.checked)}. Verzendkosten en levertijd zie je bij de winkel. Bij bol.com zie je of bol zelf of een externe verkoper levert; dat bepaalt de levertijd en hoe retourneren gaat.</p>
<h2>Alternatieven voor de ${esc(pr.name)}</h2>
<p>Twijfel je? Deze bakken lijken qua type of prijs op de ${esc(pr.name)}. Of zet ze allemaal naast elkaar in de <a href="/automatische-kattenbak-vergelijken/">vergelijker</a>.</p>
<ul>${others.map((x) => `<li><a href="${reviewUrl(x)}">${esc(x.name)}</a>: ${esc(x.tagline.charAt(0).toLowerCase() + x.tagline.slice(1))} (vanaf ${eur(lowest(x).price)})</li>`).join('')}</ul>
<p>Nog niet zeker of een automatische bak veilig is voor jouw kat? Lees <a href="/kennisbank/is-een-automatische-kattenbak-veilig/">is een automatische kattenbak veilig?</a></p>
${sourcesBlock(p.sources)}
</article>
<aside class="side-cta card" aria-label="Prijs bekijken">
<img class="side-img" src="${pimg(pr, 300)}" width="150" height="150" alt="${esc(pr.name)}" loading="lazy">
<p class="h3">${esc(pr.name)} vanaf ${eur(o.price)}</p>
<p class="muted">Bij ${esc(o.shop)}${o.condition === 'refurbished' ? ' (refurbished)' : ''}. ${pr.offers.length > 1 ? `Ook bij ${esc(pr.offers.filter((x) => x !== o).map((x) => x.shop).join(', '))}.` : ''}</p>
${cta(pr, `Bekijk bij ${o.shop}`)}
<a class="btn btn-ghost" href="/automatische-kattenbak-vergelijken/">Eerst vergelijken</a>
<p class="fine">Partnerlink: wij krijgen misschien een vergoeding. Ons oordeel verandert daar niet door.</p>
</aside>
</div>
${faqBlock(p.faq)}
${relatedBlock(p)}`;
};

T['hub-kattenbakken'] = (p) => `
${pageHead(p, { kicker: 'Alle reviews' })}
<section class="wrap section-sm"><h2 class="h3">Alle ${products.length} op volgorde van onze score</h2><div class="ins-list">${products.map((x) => productCard(x, { featured: x.rank === 1 })).join('')}</div></section>
<section class="wrap-narrow section prose">${summaryBlock(p.summary)}${renderBody(p.body)}${opinionBlock(p.opinion)}</section>
${sourcesWrap(p)}`;

const listCards = (prefix) => pages.filter((x) => x.slug.startsWith(prefix) && x.slug !== prefix && x.index !== false).sort((a, b) => String(b.published).localeCompare(String(a.published))).map((r) => `<a class="rel-card" href="${r.slug}"><span class="kick">${esc(r.kicker || '')}</span><b>${esc(r.h1)}</b><span>${esc(r.meta_description)}</span></a>`).join('');
T['hub-blog'] = (p) => `
${pageHead(p, { kicker: 'Blog' })}
<section class="wrap section-sm"><div class="grid-3 related">${listCards('/blog/')}</div></section>
<section class="wrap-narrow section prose">${summaryBlock(p.summary)}${renderBody(p.body)}${opinionBlock(p.opinion)}</section>`;
T['hub-merken'] = (p) => `
${pageHead(p, { kicker: 'Merken' })}
<section class="wrap section-sm"><div class="grid-3 related">${listCards('/merken/')}</div></section>
<section class="wrap-narrow section prose">${summaryBlock(p.summary)}${renderBody(p.body)}${opinionBlock(p.opinion)}</section>
${faqBlock(p.faq)}
${sourcesWrap(p)}`;
T['hub-kennisbank'] = (p) => `
${pageHead(p, { kicker: 'Kennisbank' })}
<section class="wrap section-sm"><div class="grid-3 related">${pages.filter((x) => x.slug.startsWith('/kennisbank/') && x.slug !== '/kennisbank/').map((r) => `<a class="rel-card" href="${r.slug}"><span class="kick">${esc(r.kicker)}</span><b>${esc(r.h1)}</b><span>${esc(r.meta_description)}</span></a>`).join('')}
<a class="rel-card" href="/zonder-poespas/"><span class="kick">Begrippen</span><b>Productpraat zonder poespas</b><span>Binnenruimte, infraroodsensor, refurbished: wat betekent het nou echt?</span></a></div></section>
<section class="wrap-narrow section prose">${summaryBlock(p.summary)}${renderBody(p.body)}${opinionBlock(p.opinion)}</section>`;

T.article = (p) => `
${pageHead(p, { imgKey: p.image })}
<div class="wrap-narrow section-sm prose">${summaryBlock(p.summary)}${renderBody(p.body)}${opinionBlock(p.opinion)}${sourcesBlock(p.sources)}</div>
${faqBlock(p.faq)}
${relatedBlock(p)}`;
T.landing = T.article;
T.author = (p) => `
<section class="wrap author-hero">
<div class="author-copy">
<p class="kick">${esc(p.kicker)}</p>
<h1 class="h1">${esc(p.h1)}</h1>
<p class="lead">${esc(p.lead)}</p>
<ul class="author-facts">
<li><b>2,5 jaar</b><span>Mila &amp; Nala</span></li>
<li><b>7.500+</b><span>volgers op TikTok</span></li>
<li><b>${products.length}</b><span>kattenbakken vergeleken</span></li>
</ul>
<p class="author-cta"><a class="btn" href="${site.author.tiktok}" rel="me noopener" target="_blank">Volg ${esc(site.author.tiktok_handle)} op TikTok</a><a class="btn btn-ghost" href="/automatische-kattenbak-vergelijken/">Naar de vergelijker</a></p>
</div>
<div class="author-media">
${img('mila-nala-samen', { w: 640, h: 720, priority: true, cls: 'author-main', sizes: '(max-width: 900px) 100vw, 40vw' })}
${img('grijze-kat-stoel', { w: 360, h: 360, cls: 'author-small', sizes: '(max-width: 900px) 40vw, 200px' })}
<span class="author-sticker">Mila &amp; Nala<br><small>allebei 2,5</small></span>
</div>
</section>
<div class="wrap-narrow section-sm prose">${renderBody(p.body)}</div>
<section class="wrap section-sm"><div class="grid-2">${img('grijze-kat-bank', { w: 600, h: 600, sizes: '(max-width: 900px) 100vw, 50vw', cls: 'rounded' })}<div class="author-tiktok"><p class="kick">Op TikTok</p><p class="h2">Meer Mila &amp; Nala?</p><p>Dagelijkse kattenchaos, zonder productpraat.</p><p><a class="btn" href="${site.author.tiktok}" rel="me noopener" target="_blank">${esc(site.author.tiktok_handle)}</a></p></div></div></section>
${relatedBlock(p)}`;
T.about = T.article;
T.contact = T.article;
T.page = (p) => `${pageHead(p)}<div class="wrap-narrow section-sm prose">${renderBody(p.body)}</div>`;

T.search = (p) => `
${pageHead(p)}
<section class="wrap-narrow section-sm">
<form class="search-form" role="search" action="/zoeken/" method="get"><label for="q" class="sr-only">Zoek op de site</label>
<input id="q" name="q" type="search" placeholder="Bijvoorbeeld: Litter-Robot, camera, kitten" autocomplete="off"><button class="btn" type="submit">Zoek</button></form>
<div id="results" aria-live="polite" class="results"></div>
<noscript><p>Zoeken werkt met JavaScript. Bekijk anders de <a href="/kennisbank/">kennisbank</a>.</p></noscript>
</section>`;

T.notfound = (p) => `<section class="wrap-narrow section center"><p class="h1 h1-xl" aria-hidden="true">404</p><h1 class="h2">${esc(p.h1)}</h1><p class="lead">${esc(p.lead)}</p><p><a class="btn" href="/">Naar de homepage</a> <a class="btn btn-ghost" href="/automatische-kattenbak-vergelijken/">Vergelijken</a></p></section>`;

// ---------- write ----------
if (!MEDIA_ID) console.warn('⚠ daisycon.media_id is leeg in content/site.yaml: partnerlinks werken pas als het media-ID is ingevuld.');
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
fs.cpSync(path.join(ROOT, 'static'), DIST, { recursive: true });
fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'src/styles.css'), path.join(DIST, 'assets/styles.css'));
fs.copyFileSync(path.join(ROOT, 'src/app.js'), path.join(DIST, 'assets/app.js'));

const manifest = [];
for (const p of pages) {
  const tpl = T[p.template];
  if (!tpl) throw new Error(`Onbekend template ${p.template} (${p.file})`);
  PRELOAD = null; CUR_KW = p.primary_keyword || '';
  const main = tpl(p);
  const html = layout(p, main);
  const out = p.template === 'notfound' ? path.join(DIST, '404.html') : path.join(DIST, p.slug, 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  manifest.push({ url: p.slug, file: path.relative(DIST, out), template: p.template, index: p.index !== false, primary_keyword: p.primary_keyword, secondary_keywords: p.secondary_keywords || [], search_intent: p.search_intent, title: p.title, status: p.status || 'published', updated: isoDate(p.updated), source: p.file, canonical: p.canonical || null });
}

const indexable = pages.filter((p) => p.index !== false && p.template !== 'notfound');
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexable.map((p) => `  <url><loc>${abs(p.slug)}</loc><lastmod>${isoDate(p.updated)}</lastmod></url>`).join('\n')}
</urlset>
`);
// ---------- llms.txt ----------
{
  const pick = (slug) => indexable.find((x) => x.slug === slug);
  const line = (x) => `- [${x.h1}](${abs(x.slug)}): ${x.meta_description}`;
  const ranking = products.map((p) => `${p.rank}. **${p.name}** (${p.brand}) – onze score ${score(p.score)}/10. ${p.tagline}. Vanaf ${eur(lowest(p).price)} bij ${lowest(p).shop}${lowest(p).condition === 'refurbished' ? ' (refurbished)' : ''}. Type: ${shapeLabel[p.shape].toLowerCase()}. Beste voor: ${p.best_for.toLowerCase()}. Review: ${abs(reviewUrl(p))}`).join('\n');
  const groups = [
    ['Vergelijken en ranking', ['/', '/beste-automatische-kattenbak-2026/', '/automatische-kattenbak-vergelijken/', '/kattenbakken/']],
    ['Reviews per kattenbak', products.map((p) => reviewUrl(p))],
    ['Per situatie', ['/keuzehulp/', '/goedkope-automatische-kattenbak/', '/automatische-kattenbak-grote-kat/', '/automatische-kattenbak-xxl/', '/open-automatische-kattenbak/', '/semi-automatische-kattenbak/', '/automatische-kattenbak-meerdere-katten/', '/automatische-kattenbak-met-camera/', '/automatische-kattenbak-kitten/', '/automatische-kattenbak-zakken/', '/automatische-kattenbak-kopen/', '/automatische-kattenbak-action/', '/beste-automatische-kattenbak-consumentenbond/']],
    ['Merken', indexable.filter((x) => x.slug.startsWith('/merken/')).map((x) => x.slug)],
    ['Blog en eigen data', indexable.filter((x) => x.slug.startsWith('/blog/')).map((x) => x.slug)],
    ['Kennisbank', indexable.filter((x) => x.slug.startsWith('/kennisbank/')).map((x) => x.slug)],
    ['Over de site', ['/zonder-poespas/', '/over-ons/', '/auteur/robin/', '/contact/']],
  ];
  const sections = groups.map(([t, list]) => `## ${t}\n\n${list.map(pick).filter(Boolean).map(line).join('\n')}`).join('\n\n');
  const txt = `# ${site.name}

> Onafhankelijke Nederlandse vergelijkingssite voor automatische en zelfreinigende kattenbakken, gemaakt door Robin, kattenbaasje van Mila en Nala. Vergelijkt ${products.length} modellen op type, binnenruimte, kattengewicht, app, camera en actuele prijs bij webshops. Scores zijn eigen beoordelingen op basis van specificaties en prijs; de bakken zijn niet zelf in een lab getest.

Kort antwoord op "wat is de beste automatische kattenbak in 2026?": **${products[0].name}**, de bekendste zelfreinigende kattenbak met een draaiende bol. Op plek twee en drie: ${products[1].name} (beste voor meerdere katten) en ${products[2].name} (beste open model, tot 15 kg). Voor een klein budget: ${products.find((p) => p.id === 'viervoeter-fresh-3').name} of ${products.find((p) => p.id === 'cellavi-neo-b').name} (refurbished).

Prijzen gecheckt op ${nlDate(pdata.checked)} via de productfeeds van de webshops. Prijzen en voorraad veranderen; de webshop is leidend.

## Ranking automatische kattenbakken 2026

${ranking}

## Transparantie

- De knoppen naar webshops zijn affiliate-links: de site krijgt soms een vergoeding bij een aankoop. De bezoeker betaalt niets extra.
- De volgorde volgt onze score, niet de vergoeding.
- Refurbished aanbiedingen zijn altijd als refurbished gemarkeerd.

${sections}

## Optioneel

- [Volledige tekst van alle pagina's](${abs('/llms-full.txt')})
- [Sitemap](${abs('/sitemap.xml')})
`;
  fs.writeFileSync(path.join(DIST, 'llms.txt'), txt);
  const clean = (b) => b.replace(/\[\[(top3|tabel|tijd)\]\]/g, '').replace(/\[\[(lijst|merk|acc):[\w-]+\]\]/g, '').replace(/\[\[(prijsindex|liters|winkels|keuzehulp|kostencalc)\]\]/g, '').replace(/\[\[(prod|cta):([\w-]+)\]\]/g, (m, t, id) => byId[id] ? `${byId[id].name}: ${abs(reviewUrl(byId[id]))}` : '').replace(/\[\[img:[\w-]+\]\]/g, '').replace(/\]\(\//g, `](${abs('/')}`).replace(/\n{3,}/g, '\n\n').trim();
  const full = indexable.map((x) => `# ${x.h1}\n\nURL: ${abs(x.slug)}\nBijgewerkt: ${isoDate(x.updated)}\n\n${x.lead ? x.lead + '\n\n' : ''}${clean(x.body)}${x.template === 'review' ? (() => { const pr = byId[x.product]; return `\n\nPlussen: ${pr.pros.join('; ')}.\nMinnen: ${pr.cons.join('; ')}.\n${specRows.map(([l, f]) => `${l}: ${f(pr)}`).join('\n')}\nPrijzen: ${pr.offers.map((o) => `${o.shop} ${eur(o.price)}${o.condition === 'refurbished' ? ' (refurbished)' : ''}`).join(', ')}`; })() : ''}${x.faq && x.faq.length ? '\n\n## Veelgestelde vragen\n\n' + x.faq.map((f) => `**${f.q}**\n${f.a}`).join('\n\n') : ''}`).join('\n\n---\n\n');
  fs.writeFileSync(path.join(DIST, 'llms-full.txt'), `# ${site.name} – volledige tekst\n\n${txt.split('\n')[2]}\n\n---\n\n${full}\n`);
}
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /zoeken/?\n\n# AI-zoekmachines zijn welkom\nUser-agent: GPTBot\nUser-agent: OAI-SearchBot\nUser-agent: ChatGPT-User\nUser-agent: PerplexityBot\nUser-agent: ClaudeBot\nUser-agent: Claude-SearchBot\nUser-agent: Google-Extended\nAllow: /\n\nSitemap: ${abs('/sitemap.xml')}\n# Samenvatting voor taalmodellen: ${abs('/llms.txt')}\n`);
fs.writeFileSync(path.join(DIST, 'search-index.json'), JSON.stringify(indexable.map((p) => ({ u: p.slug, t: p.h1, d: p.meta_description, k: [p.primary_keyword, ...(p.secondary_keywords || [])].join(' '), x: (p.body + (p.template === 'review' ? ' ' + byId[p.product].tagline + ' ' + byId[p.product].pros.join(' ') : '')).replace(/\[\[.*?\]\]|[#*_>\[\]()`]/g, ' ').replace(/\s+/g, ' ').slice(0, 1500) }))));
fs.writeFileSync(path.join(DIST, 'build-manifest.json'), JSON.stringify({ built: new Date().toISOString(), pages: manifest }, null, 1));
console.log(`✓ ${pages.length} pagina's gebouwd (${products.length} reviews), ${indexable.length} in sitemap`);
