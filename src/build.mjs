// Statische generator voor beste-kattenvoer.nl
// content/pages/**/*.md + content/brands.yaml + data/feed/*.json → dist/
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { marked } from 'marked';
import { loadCatalog, tiers, budgetClass, gramsFor, GRAMS_PER_DAY, slug } from './catalog.mjs';
import { buildRankings } from './rankings.mjs';
import { firstIngredient, meatFirst, vagueMeat, KCAL_DAY, OPEN_LABEL, labelCheck, nameClaim, energySplit } from './nutrition.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');
const readYaml = (f) => yaml.load(fs.readFileSync(path.join(ROOT, 'content', f), 'utf8'));
const site = readYaml('site.yaml');
const brands = readYaml('brands.yaml');
const images = readYaml('images.yaml');
const extSources = readYaml('sources.yaml');
// Eigen notities per product (sleutel: EAN of product-id). Zonder eigen notitie blijft een productpagina uit de index.
const productNotes = fs.existsSync(path.join(ROOT, 'content/product-notes.yaml')) ? (readYaml('product-notes.yaml') || {}) : {};
const words = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;
const MIN_NOTE_WORDS = 60;
const cat = loadCatalog(ROOT);
const ALL = cat.products;
const T = tiers(ALL);
const FOOD = ALL.filter((p) => ['droog', 'nat', 'vers'].includes(p.form) && p.ppk && p.inStock);
for (const p of ALL) { const ds = p.variants.filter((v) => v.price_old && v.price_old > v.price * 1.04 && v.in_stock !== false).map((v) => ({ v, d: 1 - v.price / v.price_old })); const b = ds.sort((a, c) => c.d - a.d)[0]; p.korting = b ? b.d : 0; p.kortingV = b ? b.v : null; }
// automatische merkpagina's voor merken met genoeg etiketdata die nog geen eigen review hebben
{
  const has = (b, name) => new RegExp(b.match || b.name, 'i').test(name);
  const byBrand = {};
  for (const p of ALL) (byBrand[p.brand] ??= []).push(p);
  for (const [name, xs] of Object.entries(byBrand)) {
    const sc = xs.filter((p) => p.score && (p.form === 'droog' || p.form === 'nat'));
    if (sc.length < 3 || brands.some((b) => has(b, name)) || /^(kattenvoer|natural|veterinary|pets|2x|bf)$/i.test(name)) continue;
    const avg = sc.reduce((a, p) => a + p.score.total, 0) / sc.length;
    brands.push({ slug: slug(name), name, match: '^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', auto: true, score: +avg.toFixed(1) });
  }
}
const CHECKED = cat.fetched ? cat.fetched.slice(0, 10) : site.data_checked;
const MEDIA_ID = String(site.daisycon?.media_id || '').trim();
const BOL_SITE_ID = String(site.bol?.site_id || '');

// ---------- helpers ----------
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nlDate = (d) => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
const isoDate = (d) => new Date(d).toISOString().slice(0, 10);
const eur = (n) => '€' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur0 = (n) => '€' + Math.round(n).toLocaleString('nl-NL');
const abs = (u) => site.url + u;
const score = (n) => Number(n).toFixed(1).replace('.', ',');
const nf = (n) => Number(n).toLocaleString('nl-NL');
const imgUrl = (k, w = 1200, h = 0) => images[k].src + `?auto=format&fit=crop&w=${w}${h ? '&h=' + h : ''}&q=70`;
const formLabel = { droog: 'Droogvoer', nat: 'Natvoer', vers: 'Vers vlees', snack: 'Snack', melk: 'Kattenmelk', overig: 'Overig' };
const stageLabel = { kitten: 'Kitten', adult: 'Volwassen', senior: 'Senior' };
const flagLabel = { graanvrij: 'Graanvrij', gesteriliseerd: 'Gesteriliseerd', gewicht: 'Light', gevoelig: 'Gevoelige maag', urinewegen: 'Urinewegen', haarballen: 'Haarballen', bio: 'Biologisch', binnenkat: 'Binnenkat', aanvullend: 'Aanvullend voer', dieet: 'Dieetvoer' };
// ---------- indexeringspoort ----------
// Een automatisch opgebouwde productpagina mag pas de index in als:
//  1. de data volledig is (echte samenstelling, alle analytische bestanddelen, vocht niet geschat), en
//  2. er een eigen notitie van Robin bij staat van minstens MIN_NOTE_WORDS woorden (ervaring, foto, verpakking bekeken).
// Anders blijft de pagina bestaan voor bezoekers en de vergelijker, maar met noindex en buiten de sitemap.
const noteFor = (p) => productNotes[p.ean] || productNotes[String(p.ean || '').replace(/^0+/, '')] || productNotes[p.id] || null;
const INDEX_PRODUCT = (p) => { const n = noteFor(p); return !!(p.complete && n && words(n.tekst) >= MIN_NOTE_WORDS); };
const brandBySlug = Object.fromEntries(brands.map((b) => [b.slug, b]));
const brandFor = (p) => brands.find((b) => b.match ? new RegExp(b.match, 'i').test(p.brand) : slug(p.brand) === b.slug);

const affUrl = (v, p) => {
  if (v.shop === 'bol.com') return `https://partner.bol.com/click/click?p=2&t=url&s=${BOL_SITE_ID}&f=TXL&url=${encodeURIComponent(v.url)}&name=${encodeURIComponent(p.name)}&subid=bkv-${p.id.slice(0, 40)}`;
  let u = String(v.link || '');
  if (MEDIA_ID) u = u.replace(/([?&]wi=)\d+/, `$1${MEDIA_ID}`);
  return u.replace(/([?&]ws=)[^&]*/, `$1${encodeURIComponent(p.id.slice(0, 40))}`);
};
const cta = (p, v = p.best, label, cls = 'btn') => `<a class="${cls}" href="${esc(affUrl(v, p))}" rel="sponsored nofollow noopener" target="_blank" data-out="${esc(p.id)}">${esc(label || `Bekijk bij ${v.shop}`)}</a>`;

// ---------- productkaart ----------
const shortOf = (name) => name.split(/\s+[-–|]\s+/).filter((seg, i) => i === 0 || !/kattenvoer|kattenbrok|natvoer|droogvoer|brokjes|brokken|natte voeding|\d|kat\b|multipack|voordeel/i.test(seg)).join(' - ').replace(/\s*-\s*\d.*$/, '').replace(/\s+\d+\s*x\s*\d.*$/i, '').replace(/\s+\d+([.,]\d+)?\s*(kg|gr|gram|g)\b.*$/i, '').trim();
for (const p of ALL) p.short = shortOf(p.name) || p.name;
const HASPAGE = (p) => p.score && p.ppd && (p.form === 'droog' || p.form === 'nat');
const purl = (p) => `/kattenvoer/${p.id}/`;
const pct = (n) => String(Math.round(n)).replace('.', ',') + '%';
const pct1 = (n) => Number(n).toFixed(1).replace('.', ',') + '%';
const perDay = (p) => p.ppd != null ? eur(p.ppd) : '–';
const packLabel = (v) => v.grams ? (v.grams >= 1000 ? `${nf(+(v.grams / 1000).toFixed(2))} kg` : `${nf(Math.round(v.grams))} gram`) : '';
function card(p, opts = {}) {
  const v = p.best;
  const bc = budgetClass(p, T);
  const tags = [p.stage !== 'adult' ? stageLabel[p.stage] : '', p.flags.includes('graanvrij') ? 'Graanvrij' : '', bc === 'budget' ? 'Voordelig' : ''].filter(Boolean).slice(0, 2);
  if (p.korting >= 0.1) tags.unshift(`${Math.round(p.korting * 100)}% korting`);
  const warn = p.flags.includes('aanvullend') ? `<p class="card-warn">Aanvullend voer, geen complete maaltijd</p>` : '';
  const T2 = opts.tag || 'h3';
  const name = HASPAGE(p) ? `<a href="${purl(p)}">${esc(p.short)}</a>` : esc(p.short);
  const stats = p.form === 'snack'
    ? `<div class="pstats"><div><b>${eur(v.price)}</b><span>${esc(packLabel(v) || 'per stuk')}</span></div></div>`
    : `<div class="pstats">${p.score ? `<div class="st-score"><b>${score(p.score.total)}</b><span>score</span></div><div><b>${pct(p.nut.pDM)}</b><span>eiwit*</span></div>` : ''}<div><b>${perDay(p)}</b><span>per dag</span></div>${!p.score && p.ppk ? `<div><b>${eur(p.ppk)}</b><span>per kilo</span></div>` : ''}</div>`;
  return `<article class="pcard${opts.pick ? ' is-pick' : ''}">
<div class="pcard-img"><img src="${esc(p.image)}" alt="${esc(p.short)}" loading="lazy" width="300" height="300"></div>
<div class="pcard-body">${opts.pick ? `<p class="pick-tag">${esc(opts.pick)}</p>` : ''}<p class="pcard-brand">${esc(p.brand)} · ${formLabel[p.form]}</p>
<${T2} class="pcard-name">${name}</${T2}>
${stats}${warn}
<p class="pmeta">${eur(v.price)} · ${packLabel(v) || 'verpakking'}${p.ppk ? ` · ${eur(p.ppk)}/kg` : ''}${tags.length ? ` <span class="ptags">${tags.map((t) => `<i>${esc(t)}</i>`).join('')}</span>` : ''}</p>
${cta(p, v, `Bekijk bij ${v.shop}`, 'btn btn-buy')}</div></article>`;
}

// selectie op basis van filters (shortcode [[lijst ...]])
function select(q) {
  let xs = (q.form === 'snack' ? ALL.filter((p) => p.form === 'snack' && p.inStock) : FOOD).slice();
  if (q.form && q.form !== 'snack') xs = xs.filter((p) => q.form.split(',').includes(p.form));
  if (q.stage) xs = xs.filter((p) => p.stage === q.stage);
  if (q.flag) for (const f of q.flag.split(',')) xs = xs.filter((p) => p.flags.includes(f));
  if (q.not) for (const f of q.not.split(',')) xs = xs.filter((p) => !p.flags.includes(f));
  if (q.brand) { const bs = q.brand.split(','); xs = xs.filter((p) => bs.some((b) => { const B = brandBySlug[b]; return B ? new RegExp(B.match || B.name, 'i').test(p.brand) : slug(p.brand) === b; })); }
  if (q.zoek) { const re = new RegExp(q.zoek, 'i'); xs = xs.filter((p) => re.test(p.name)); }
  if (q.class) xs = xs.filter((p) => budgetClass(p, T) === q.class);
  if (q.max) xs = xs.filter((p) => p.ppd <= Number(q.max));
  if (q.korting) xs = xs.filter((p) => p.korting >= Number(q.korting) / 100);
  if (q.mingram) xs = xs.filter((p) => p.variants.some((v) => v.grams >= Number(q.mingram)));
  if (q.minscore) xs = xs.filter((p) => p.score && p.score.total >= Number(q.minscore));
  if (q.mineiwit) xs = xs.filter((p) => p.nut && p.nut.pDM >= Number(q.mineiwit));
  if (q.maxeiwit) xs = xs.filter((p) => p.nut && p.nut.pDM <= Number(q.maxeiwit));
  if (q.score || ['score', 'eiwit', 'weinigeiwit', 'kh', 'p100', 'p100duur', 'populair'].includes(q.sort)) xs = xs.filter((p) => p.score);
  if (!q.flag || !q.flag.includes('aanvullend')) xs = xs.filter((p) => !p.flags.includes('aanvullend') && (q.dieet === 'ja' || q.dieet === 'alleen' || !p.flags.includes('dieet')));
  if (q.dieet === 'alleen') xs = xs.filter((p) => p.flags.includes('dieet'));
  const sorts = { ppd: (a, b) => a.ppd - b.ppd, ppk: (a, b) => a.ppk - b.ppk, duur: (a, b) => b.ppk - a.ppk, prijs: (a, b) => a.best.price - b.best.price, naam: (a, b) => a.name.localeCompare(b.name, 'nl'), score: (a, b) => b.score.total - a.score.total, eiwit: (a, b) => b.nut.pDM - a.nut.pDM, weinigeiwit: (a, b) => a.nut.pDM - b.nut.pDM, p100: (a, b) => a.p100 - b.p100, p100duur: (a, b) => b.p100 - a.p100, populair: (a, b) => (a.bolRank || 9999) - (b.bolRank || 9999), korting: (a, b) => b.korting - a.korting, kh: (a, b) => b.nut.nfeDM - a.nut.nfeDM };
  xs.sort(sorts[q.sort || 'ppd'] || sorts.ppd);
  // max één product per merk, tenzij merk opgegeven
  if ((!q.brand || q.permerk === 'ja') && q.permerk !== 'nee') { const seen = new Set(); xs = xs.filter((p) => !seen.has(p.brand) && seen.add(p.brand)); }
  return xs.slice(0, Number(q.n || 6));
}
const parseArgs = (s) => Object.fromEntries([...s.matchAll(/(\w+)=("([^"]*)"|\S+)/g)].map((m) => [m[1], m[3] ?? m[2]]));
const grid = (xs, opts = {}) => xs.length ? `<div class="pgrid">${xs.map((p) => card(p, opts)).join('')}</div><p class="fine">*Eiwit in droge stof, dus zonder het water; zo vergelijk je nat en droog eerlijk. Prijs per dag: schatting voor een volwassen kat van 4 kilo die alleen dit voer eet. Ken ik de voedingswaarden, dan reken ik met de energie van dat voer en ${KCAL_DAY} kcal per dag; anders met ${GRAMS_PER_DAY.droog} gram droogvoer of ${GRAMS_PER_DAY.nat} gram natvoer. Prijzen van ${nlDate(CHECKED)}, de webshop is leidend.</p>` : '<p class="fine">Op dit moment staat er niets in de feed dat aan deze filters voldoet.</p>';

// ---------- budgettabel ----------
function budgetTable() {
  const row = (form) => { const t = T[form]; const g = GRAMS_PER_DAY[form]; const d = (k) => (t[k] * g) / 1000; return `<tr><th scope="row">${formLabel[form]}</th><td>${eur(d('p10'))}<small>${eur0(d('p10') * 30.4)} p/m</small></td><td>${eur(d('p50'))}<small>${eur0(d('p50') * 30.4)} p/m</small></td><td>${eur(d('p90'))}<small>${eur0(d('p90') * 30.4)} p/m</small></td></tr>`; };
  return `<div class="table-wrap"><table class="ttable"><caption>Wat kattenvoer per dag kost, voor een kat van 4 kilo die alleen dit voer eet</caption><thead><tr><td></td><th scope="col">Voordelig</th><th scope="col">Gemiddeld</th><th scope="col">Duur</th></tr></thead><tbody>${row('droog')}${row('nat')}</tbody></table></div><p class="fine">Voordelig = de goedkoopste 10%, gemiddeld = de middelste prijs, duur = de duurste 10% van ${nf(T.droog.n)} droogvoeders en ${nf(T.nat.n)} natvoeders in onze vergelijking (complete voeding, op voorraad). Bijgewerkt ${nlDate(CHECKED)}.</p>`;
}

// ---------- calculator ----------
function calc() {
  const d = { droog: T.droog, nat: T.nat };
  return `<div class="calc" data-widget="calc" data-t='${JSON.stringify({ droog: [d.droog.p10, d.droog.p50, d.droog.p90], nat: [d.nat.p10, d.nat.p50, d.nat.p90], g: GRAMS_PER_DAY })}'>
<div class="calc-in"><label>Gewicht van je kat <output id="cKg">4 kg</output><input type="range" id="cW" min="2" max="9" step="0.5" value="4"></label>
<fieldset><legend>Wat eet je kat?</legend><label><input type="radio" name="cF" value="droog"> Alleen droogvoer</label><label><input type="radio" name="cF" value="mix" checked> Half nat, half droog</label><label><input type="radio" name="cF" value="nat"> Alleen natvoer</label></fieldset>
<label>Aantal katten <output id="cNo">1</output><input type="range" id="cN" min="1" max="4" step="1" value="1"></label></div>
<div class="calc-out" aria-live="polite"><p><span>Voordelig</span><b id="cLo">–</b></p><p class="mid"><span>Gemiddeld</span><b id="cMid">–</b></p><p><span>Duur</span><b id="cHi">–</b></p><small>per maand, op basis van de prijzen van ${nlDate(CHECKED)}</small></div></div>`;
}

// ---------- merkenraster ----------
const brandGrid = () => `<div class="bgrid">${brands.map((b) => { const n = ALL.filter((p) => new RegExp(b.match || b.name, 'i').test(p.brand)).length; return `<a class="bcard" href="/merken/${b.slug}/"><b>${esc(b.name)}</b><span class="bscore">${score(b.score)}</span><small>${esc(b.price_class)} · ${n} producten</small></a>`; }).join('')}</div>`;

// ---------- beeld ----------
const photo = (k, alt) => `<figure class="foto"><img src="${imgUrl(k, 1200, 760)}" srcset="${imgUrl(k, 700, 440)} 700w, ${imgUrl(k, 1200, 760)} 1200w" sizes="(max-width: 800px) 100vw, 760px" alt="${esc(alt)}" loading="lazy" width="1200" height="760"><figcaption>Foto: ${esc(images[k].credit)}</figcaption></figure>`;
const TILES = [
  ['/beste-droogvoer-katten/', 'Droogvoer', 'brokken', 'Kom met brokken kattenvoer'],
  ['/beste-natvoer-kat/', 'Natvoer', 'oranje', 'Rode kat eet natvoer uit een zwarte kom'],
  ['/kittenvoer/', 'Kitten', 'kitten', 'Britse korthaar kitten eet uit een bakje'],
  ['/senior-kattenvoer/', 'Senior', 'senior', 'Oudere gestreepte kat kijkt rustig opzij'],
  ['/goedkoop-kattenvoer/', 'Krap budget', 'samen', 'Twee katten liggen samen op de bank'],
  ['/graanvrij-kattenvoer/', 'Graanvrij', 'grijs', 'Grijze kat eet uit een voerbak'],
];
const tiles = () => `<div class="tiles">${TILES.map(([u, t, k, a]) => `<a class="tile" href="${u}"><img src="${imgUrl(k, 520, 620)}" alt="${esc(a)}" loading="lazy" width="520" height="620"><span>${esc(t)}</span></a>`).join('')}</div>`;
const band = (k, title, text, link) => { const [lu, lt] = (link || '').split('|'); return `<section class="band"><div class="band-in"><div class="band-text"><p class="band-title">${esc(title)}</p><p>${esc(text)}</p>${lu ? `<p><a class="btn btn-lila" href="${lu}">${esc(lt)}</a></p>` : ''}</div><figure class="band-photo"><svg class="band-curve" viewBox="0 0 100 800" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0h62C20 160 96 300 58 470 30 600 70 700 52 800H0z" fill="currentColor"/></svg><img src="${imgUrl(k, 1000, 900)}" alt="${esc(title)}" loading="lazy" width="1000" height="900"></figure></div></section>`; };

// ---------- productlijsten met score ----------
const scoreTable = (xs) => xs.length ? `<div class="table-wrap"><table class="ttable stable"><thead><tr><th scope="col">Voer</th><th scope="col">Score</th><th scope="col">Eiwit (droge stof)</th><th scope="col">Per 100 g eiwit</th><th scope="col">Per dag</th></tr></thead><tbody>${xs.map((p) => `<tr><th scope="row"><a href="${purl(p)}">${esc(p.name)}</a><small>${esc(p.brand)} · ${formLabel[p.form]}</small></th><td><b class="sc">${score(p.score.total)}</b></td><td>${pct1(p.nut.pDM)}</td><td>${eur(p.p100)}</td><td>${eur(p.ppd)}</td></tr>`).join('')}</tbody></table></div>` : '';
function allProducts() {
  const xs = ALL.filter(HASPAGE).sort((a, b) => a.brand.localeCompare(b.brand, 'nl') || b.score.total - a.score.total);
  const by = {};
  for (const p of xs) (by[p.brand] = by[p.brand] || []).push(p);
  return `<div class="allp">${Object.entries(by).map(([b, ps]) => `<details${ps.length > 12 ? '' : ' open'}><summary>${esc(b)} <small>${ps.length} producten · beste score ${score(Math.max(...ps.map((p) => p.score.total)))}</small></summary><ul>${ps.map((p) => `<li><a href="${purl(p)}">${esc(p.name)}</a> <span>${score(p.score.total)}</span></li>`).join('')}</ul></details>`).join('')}</div>`;
}

// ---------- productreview (opgebouwd uit het etiket) ----------
function review(p) {
  const n = p.nut, f = p.form, S = SC[f], nat = f === 'nat';
  const vorm = nat ? 'natvoer' : 'droogvoer';
  const st = p.stage === 'kitten' ? ' voor kittens' : p.stage === 'senior' ? ' voor oudere katten' : '';
  const out = { pros: [], cons: [], sections: [] };
  const sec = (h, ps) => { ps = ps.filter(Boolean); if (ps.length) out.sections.push({ h, ps }); };
  const rk = pctRank(f, (x) => x.nut.pDM, n.pDM);
  const top = Math.round((1 - rk) * 100);
  const lc = labelCheck(n.sam);
  const claim = nameClaim(p.name);
  const es = energySplit(n);
  const gp100k = (n.protein / n.kcal100) * 100; // gram eiwit per 100 kcal
  const kort = p.short || p.name;

  // 1. eiwit
  const e = [];
  e.push(`${esc(kort)} is ${vorm}${st} van ${esc(p.brand)}. Hieronder staan de voedingswaarden van het etiket, automatisch omgerekend met mijn methode, zodat je het eerlijk kunt vergelijken met ${S.n.toLocaleString('nl-NL')} andere soorten ${vorm} in de vergelijking.`);
  if (nat) e.push(`Op het etiket staat ${pct1(n.protein)} eiwit. Dat lijkt weinig, maar natvoer bestaat voor ${pct(n.moisture)} uit vocht${n.moistureEstimated ? ' (geschat, het vochtgehalte stond niet op het etiket)' : ''}. Haal je dat water eruit, dan bestaat de rest voor <b>${pct1(n.pDM)} uit eiwit</b>. Alleen zo vergelijk je natvoer eerlijk met brokken.`);
  else e.push(`Op het etiket staat ${pct1(n.protein)} ruw eiwit. Omgerekend naar droge stof${n.moistureEstimated ? ' (met een geschat vochtgehalte van 8%)' : ''} is dat <b>${pct1(n.pDM)} eiwit</b>.`);
  if (n.pDM >= S.pDM + 8) { e.push(`Dat is veel: het hoort bij de ${Math.max(1, top)}% meest eiwitrijke ${vorm} in mijn vergelijking (het midden ligt op ${pct(S.pDM)}). Precies wat een vleeseter als een kat nodig heeft.`); out.pros.push(`Veel eiwit: ${pct1(n.pDM)} in droge stof`); }
  else if (n.pDM >= S.pDM) { e.push(`Dat is iets boven het midden van ${pct(S.pDM)}. Prima, niet uitzonderlijk.`); out.pros.push(`Eiwit boven het gemiddelde (${pct1(n.pDM)})`); }
  else if (n.pDM >= 32) { e.push(`Dat zit onder het midden van ${pct(S.pDM)}. Niet slecht, maar een kat is een vleeseter en ik had liever meer gezien.`); out.cons.push(`Eiwit onder het gemiddelde (${pct1(n.pDM)})`); }
  else { e.push(`Eerlijk gezegd: dat is weinig. Katten hebben vooral dierlijk eiwit nodig, en met ${pct1(n.pDM)} in droge stof hoort dit voer bij de eiwitarmste ${vorm} die ik ken. Het gat wordt bijna altijd gevuld met goedkopere koolhydraten.`); out.cons.push(`Weinig eiwit voor een vleeseter (${pct1(n.pDM)})`); }
  e.push(`Nog een manier om ernaar te kijken: per 100 kcal krijgt je kat hier ${gp100k.toFixed(1).replace('.', ',')} gram eiwit${SC[f].gpk ? ` (midden bij ${vorm}: ${SC[f].gpk.toFixed(1).replace('.', ',')} gram)` : ''}. Dat getal zegt hoeveel eiwit er per hap energie meekomt, en dat is wat telt als je kat niet meer gaat eten dan hij nodig heeft.`);
  sec(`Hoeveel eiwit zit er echt in ${esc(kort)}?`, e);

  // 2. granen en vulmiddel
  const g = [];
  if (n.nfeDM > 35) { g.push(`Wat overblijft na eiwit, vet, vezels, as en vocht zijn koolhydraten. Ik reken ${pct(n.nfeDM)} in droge stof uit. Dat is veel voor een kat: koolhydraten zijn in kattenvoer vooral vulmiddel, omdat ze goedkoper zijn dan vlees.`); out.cons.push(`Veel koolhydraten (±${pct(n.nfeDM)})`); }
  else if (n.nfeDM < 15) { g.push(`Er blijven maar ongeveer ${pct(n.nfeDM)} koolhydraten over in de droge stof. Dat is weinig, en dat past bij hoe een kat van nature eet.`); out.pros.push(`Weinig koolhydraten (±${pct(n.nfeDM)})`); }
  else g.push(`Aan koolhydraten reken ik ongeveer ${pct(n.nfeDM)} in droge stof uit (midden bij ${vorm}: ${pct(S.nfe)}). Dat is ${n.nfeDM > S.nfe ? 'iets meer dan gemiddeld' : 'gemiddeld of iets minder'}.`);
  if (lc) {
    if (lc.firstGrain === 1) { g.push(`Het eerste ingrediënt is een graan: “${esc(lc.top[0])}”. Ingrediënten staan op volgorde van gewicht, dus er zit meer van in dan van welk vlees dan ook. Dit is precies het soort voer waar ik kritisch op ben.`); out.cons.push('Graan als eerste ingrediënt'); }
    else if (lc.grains.length >= 2) { g.push(`In de eerste zes ingrediënten tel ik ${lc.grains.length} granen: ${lc.grains.map((o) => '“' + esc(o.x) + '”').join(', ')}. Los lijken ze klein, samen kunnen ze meer wegen dan het vlees dat vooraan staat. Fabrikanten splitsen granen soms op zodat het vlees bovenaan blijft.`); out.cons.push(`${lc.grains.length} granen in de top 6 van het etiket`); }
    else if (lc.grains.length === 1) g.push(`Er staat één graan in de top zes van de samenstelling (“${esc(lc.grains[0].x)}”, op plek ${lc.grains[0].i + 1}). Dat vind ik geen probleem zolang het eiwit goed is.`);
    else if (lc.starch.length) g.push(`Er staan geen granen vooraan, maar wel ${lc.starch.map((x) => '“' + esc(x) + '”').join(' en ')}. Ook dat zijn zetmeelbronnen: graanvrij is dus niet hetzelfde als koolhydraatarm.`);
    else g.push('In de eerste zes ingrediënten staan geen granen en geen zetmeelvervangers. Netjes.');
    if (lc.plant.length) { g.push(`Let op ${lc.plant.map((x) => '“' + esc(x) + '”').join(' en ')} in de samenstelling. Dat is plantaardig eiwit. Het telt mee in het eiwitpercentage op het etiket, maar voor een kat is dierlijk eiwit waardevoller. Een deel van de ${pct1(n.pDM)} komt dus niet uit vlees.`); out.cons.push('Eiwit deels uit planten (zoals gluten of soja)'); }
  } else if (n.nfeDM > 35) g.push('De volledige samenstelling stond niet in de productinformatie, dus ik kan niet zien of het zetmeel uit granen, aardappel of erwten komt. Het percentage koolhydraten zegt wel genoeg: hier zit veel vulling in.');
  sec(`Granen en vulmiddel in ${esc(kort)}`, g);

  // 3. etiket en de naam op de verpakking
  const l = [];
  const fi = firstIngredient(n.sam), mf = meatFirst(n.sam);
  if (fi && !(lc && lc.firstGrain === 1)) { l.push(`Het eerste ingrediënt op de samenstelling is “${esc(fi)}”.${mf ? ' Een dierlijk ingrediënt vooraan, zo hoort het.' : ' Dat is geen benoemde vleessoort, en dat vind ik jammer.'}`); (mf ? out.pros : out.cons).push(mf ? `Dierlijk ingrediënt vooraan (${fi})` : `Geen vlees als eerste ingrediënt`); }
  if (lc && lc.meatPcts.length) {
    const tot = lc.meatPcts.reduce((s, x) => s + x.v, 0);
    l.push(`Op het etiket staan percentages: ${lc.meatPcts.map((x) => `${String(x.v).replace('.', ',')}% ${esc(x.w)}`).join(', ')}. ${tot < 20 ? `Bij elkaar is dat ${String(Math.round(tot))}% van wat er in de zak zit. Een getal op de voorkant voelt als veel, maar de rest van het voer bestaat uit iets anders.` : `Samen is dat ongeveer ${String(Math.round(tot))}%. Fijn dat de fabrikant het durft te noemen; veel merken doen dat niet.`}`);
  }
  if (claim) {
    const t = claim.kind === 'smaak' ? `In de naam staat “smaak” van ${esc(claim.w)}. Volgens de Europese etiketcode hoeft er dan nauwelijks of zelfs geen ${esc(claim.w)} in te zitten: de smaak mag uit een aroma komen.`
      : claim.kind === 'met' ? `In de naam staat “met ${esc(claim.w)}”. Volgens de Europese etiketcode betekent dat: minimaal 4% ${esc(claim.w)}. De overige 96% mag van alles zijn, ook ander vlees of granen.`
      : claim.kind === 'rijk' ? `In de naam staat “rijk aan ${esc(claim.w)}”. Dat betekent volgens de etiketcode minimaal 14% ${esc(claim.w)}.`
      : `De naam gebruikt een woord als menu of recept met ${esc(claim.w)}. Dan moet er volgens de etiketcode minimaal 26% van in zitten.`;
    const own = lc && lc.meatPcts.find((x) => x.w.toLowerCase().includes(claim.w.slice(0, 4)) && x.v > claim.min);
    l.push(t + (own ? ` Hier noemt de fabrikant zelf ${String(own.v).replace('.', ',')}% ${esc(own.w)}, dus ruim meer dan het minimum. Dat waardeer ik.` : claim.min <= 4 ? ' Staat er nergens een percentage bij, dan weet je dus alleen dat het minimum gehaald wordt.' : ''));
    if (!own && claim.min <= 4) out.cons.push(claim.kind === 'smaak' ? 'Naam belooft alleen een smaak' : `“Met ${claim.w}” is minimaal 4%`);
  }
  if (!n.sam && OPEN_LABEL.test(p.brand)) { l.push(`De samenstelling stond niet in de productinformatie die ik kon lezen. ${esc(p.brand)} werkt meestal met een open samenstelling, zoals “vlees en dierlijke bijproducten”. Het eiwitpercentage kan prima zijn, maar je weet niet precies van welk dier en welk deel het komt. Daarom krijgt het etiket bij mij aftrek.`); out.cons.push('Open samenstelling: niet precies welk vlees'); }
  else if (!n.sam) l.push('De volledige samenstelling stond niet in de productinformatie. Kijk op de verpakking of er een benoemde vleessoort vooraan staat; dat is de snelste check die je in de winkel kunt doen.');
  if (vagueMeat(n.sam)) { l.push('In de samenstelling staat “vlees en dierlijke bijproducten”. Dat is legaal, maar je weet niet precies welk vlees erin zit, en ook niet hoeveel.'); out.cons.push('Vage vleesomschrijving op het etiket'); }
  sec('Wat het etiket en de naam je vertellen', l);

  // 4. energie
  if (es) {
    const k = [];
    k.push(`Uitgerekend uit het etiket komen de calorieën in dit voer ongeveer <b>${pct(es.p)} uit eiwit, ${pct(es.f)} uit vet en ${pct(es.c)} uit koolhydraten</b>.`);
    k.push(`Ter vergelijking: onderzoek naar wat verwilderde katten zelf vangen, komt uit op ruwweg de helft van de energie uit eiwit, iets minder dan de helft uit vet en maar een paar procent uit koolhydraten. ${es.c > 30 ? `Bij dit voer komt bijna een derde of meer uit koolhydraten. Dat is ver van wat een kat van nature eet.` : es.c < 12 ? 'Dit voer zit daar dicht bij in de buurt.' : 'Dit voer zit daar tussenin, zoals het meeste kattenvoer.'}`);
    if (p.stage === 'adult' && p.flags.includes('gesteriliseerd')) k.push(`Voor een gesteriliseerde kat let ik ook op de energiedichtheid: ${n.kcal100} kcal per 100 gram. ${nat ? '' : n.kcal100 > 380 ? 'Dat is aan de hoge kant voor een sterilised-voer; weeg de porties echt af.' : 'Dat is netjes laag.'}`);
    sec(`Waar komen de calorieën in ${esc(kort)} vandaan?`, k);
  }

  // 5. prijs
  const pr = [];
  if (p.p100) {
    const r = pctRank(f, (x) => x.p100, p.p100);
    const per10 = Math.round((10 / p.p100) * 100);
    if (r < 0.25) { pr.push(`Per 100 gram eiwit betaal je ${eur(p.p100)}. Dat is goedkoop: bij ${vorm} ligt het midden op ${eur(S.p100)}. Voor een tientje krijg je hier ongeveer ${per10} gram eiwit.`); out.pros.push(`Goedkoop eiwit: ${eur(p.p100)} per 100 g`); }
    else if (r > 0.75) { pr.push(`Per 100 gram eiwit betaal je ${eur(p.p100)}, terwijl het midden bij ${vorm} op ${eur(S.p100)} ligt. Voor een tientje krijg je ongeveer ${per10} gram eiwit. Je betaalt hier dus flink voor ${n.pDM >= S.pDM ? 'de kwaliteit' : 'het merk, niet voor extra eiwit'}.`); out.cons.push(`Duur eiwit: ${eur(p.p100)} per 100 g`); }
    else pr.push(`Per 100 gram eiwit betaal je ${eur(p.p100)}. Het midden bij ${vorm} ligt op ${eur(S.p100)}, dus de prijs is gemiddeld. Voor een tientje krijg je ongeveer ${per10} gram eiwit.`);
  }
  pr.push(`Per kilo kost dit voer ${eur(p.ppk)} in de voordeligste verpakking (${esc(p.best.shop)}, ${packLabel(p.best) || 'verpakking'}). Maar de prijs per kilo zegt weinig: voer met meer calorieën per hap heb je minder van nodig. Daarom reken ik altijd door naar de prijs per dag: <b>${eur(p.ppd)}</b>, of ${eur0(p.ppd * 30.4)} per maand. ${p.ppd < S.ppd * 0.8 ? `Dat is voordeliger dan het midden van ${eur(S.ppd)} per dag.` : p.ppd > S.ppd * 1.25 ? `Dat is duurder dan het midden van ${eur(S.ppd)} per dag.` : `Dat zit rond het midden van ${eur(S.ppd)} per dag.`}`);
  sec(`Is ${esc(kort)} zijn geld waard?`, pr);

  // 6. porties
  const kgs = [3, 4, 5, 6];
  out.portions = kgs.map((kg) => { const kcal = KCAL_DAY * Math.pow(kg / 4, 0.67); const gr = (kcal / n.kcal100) * 100; return { kg, gr: Math.round(gr), eiwit: Math.round(gr * n.protein / 100), ppd: p.ppk * gr / 1000 }; });

  // 7. voor welke kat
  const w = [];
  if (p.stage === 'kitten') w.push(`Dit voer is bedoeld voor kittens. Die groeien hard en hebben meer eiwit nodig dan volwassen katten. ${n.pDM >= 40 ? 'Met dit eiwitgehalte zit dat goed.' : 'Ik had voor een kitten liever iets meer eiwit gezien.'}`);
  if (p.stage === 'senior') w.push(`Dit voer is gemaakt voor oudere katten. Veel oudere katten verliezen spiermassa, dus minder eiwit is voor een gezonde senior meestal niet nodig. ${n.pDM >= S.pDM ? 'Dit voer bespaart daar gelukkig niet op.' : 'Dit voer zit onder het gemiddelde; heeft je senior geen nierproblemen, dan kan meer eiwit geen kwaad.'} Bij nierproblemen beslist je dierenarts.`);
  if (nat) w.push('Natvoer heeft een groot voordeel: je kat krijgt er veel water mee binnen. Katten drinken van zichzelf weinig, en dat is goed voor nieren en blaas.');
  else w.push('Geef je alleen brokken, zet dan altijd vers water neer en overweeg een fontein of een paar natte maaltijden per week. Katten drinken van zichzelf weinig.');
  if (p.flags.includes('dieet')) w.push('Dit is dieetvoer. Geef het alleen in overleg met je dierenarts; mijn score zegt niets over hoe goed het werkt bij een aandoening.');
  const sib = ALL.filter((x) => x.brand === p.brand && x.form === f && HASPAGE(x)).sort((a, b) => b.score.total - a.score.total);
  if (sib.length >= 3) { const i = sib.indexOf(p) + 1; w.push(`Van ${sib.length} soorten ${esc(p.brand)} ${vorm} waarvan ik het etiket ken, staat dit voer op plek ${i}. ${i === 1 ? `Het is dus de beste keus binnen ${esc(p.brand)}.` : `De best scorende is <a href="${purl(sib[0])}">${esc(sib[0].short)}</a> (${score(sib[0].score.total)}).`}`); }
  if (p.bolRank && p.bolRank <= 100) w.push(`Bij bol.com hoort dit voer bij de populairste ${vorm} (plek ${p.bolRank} in de categorie)${p.rating ? `, met een gemiddelde beoordeling van ${String(p.rating).replace('.', ',')} uit 5` : ''}. Populair betekent niet automatisch goed, maar het zegt wel dat veel katten het lusten.`);
  else if (p.rating) w.push(`Kopers op bol.com geven het gemiddeld een ${String(p.rating).replace('.', ',')} uit 5.`);
  w.push(noteFor(p) ? 'Mijn eigen ervaring met dit voer staat bovenaan. De rest van deze pagina is een automatische analyse van het etiket en de prijs. Of jouw kat het lust, merk je pas als je het probeert; bouw nieuw voer altijd in een week op.' : 'Eerlijk is eerlijk: dit is een automatische analyse van het etiket en de prijs, geen test. Ik heb dit voer niet zelf aan mijn katten gegeven. Of jouw kat het lust, merk je pas als je het probeert; bouw nieuw voer altijd in een week op.');
  sec(`Voor welke kat is ${esc(kort)} geschikt?`, w);

  const t = p.score.total, c = p.score;
  if (c.prijs < 4 && !out.cons.some((x) => /Duur eiwit/.test(x))) out.cons.push('Eiwit is relatief duur bij dit voer');
  if (c.prijs >= 7 && !out.pros.some((x) => /Goedkoop eiwit/.test(x))) out.pros.push('Veel eiwit voor je geld');
  out.verdict = c.eiwit >= 7 && c.prijs >= 6 ? 'Veel eiwit voor een eerlijke prijs. Dit is voer waar ik zelf niet lang over zou twijfelen.'
    : c.eiwit >= 7 && c.prijs < 4 ? 'Veel eiwit, dat is goed. Maar je betaalt er flink voor: per gram eiwit is dit duurder dan het meeste vergelijkbare voer.'
    : c.eiwit >= 7 ? 'Eiwitrijk voer voor een normale prijs. Een prima keuze.'
    : c.eiwit < 3.5 && c.prijs < 4 ? 'Weinig eiwit en ook nog duur per gram eiwit. Hier zou ik eerlijk gezegd voor iets anders kiezen.'
    : c.eiwit < 3.5 && lc && lc.firstGrain && lc.firstGrain <= 2 ? 'Granen vooraan en weinig eiwit. Het vult de bak, maar een vleeseter verdient beter.'
    : c.eiwit < 3.5 ? 'Voordelig, maar met weinig eiwit voor een vleeseter. Prima als budgetkeuze, niet als beste keuze.'
    : t >= 6.5 ? 'Degelijk voer zonder grote uitschieters, met een eerlijke verhouding tussen eiwit en prijs.'
    : 'Gemiddeld voer. Het doet wat het moet doen, maar voor hetzelfde geld vind je vaak meer eiwit.';
  out.pros = [...new Set(out.pros)].slice(0, 5); out.cons = [...new Set(out.cons)].slice(0, 5);
  return out;
}
const bar = (label, v, note) => `<div class="sbar"><span>${label}</span><i style="--v:${v * 10}%"></i><b>${score(v)}</b>${note ? `<small>${note}</small>` : ''}</div>`;

function productPage(pg) {
  const p = pg.prod, n = p.nut, r = review(p), sc = p.score;
  const shops = [...p.variants].sort((a, b) => (a.ppk ?? 1e9) - (b.ppk ?? 1e9));
  const seen = new Set();
  const offers = shops.filter((v) => { const k = v.shop + v.grams; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);
  const alts = ALL.filter((x) => x !== p && x.form === p.form && HASPAGE(x) && x.stage === p.stage && x.score.total > sc.total && x.ppd && x.ppd <= p.ppd * 1.15).sort((a, b) => b.score.total - a.score.total).slice(0, 3);
  const head = `<section class="phead"><div class="wrap phead-in"><div class="phead-text"><!--crumbs--><p class="ptype">${formLabel[p.form]}${p.stage !== 'adult' ? ' · ' + stageLabel[p.stage] : ''} · ${esc(p.brand)}</p><h1>${esc(pg.h1)}</h1><p class="lead">${esc(r.verdict)}</p><p class="byline">${noteFor(p) ? `Met eigen notitie van <a href="${site.author.url}">Robin</a>` : `Automatische analyse volgens <a href="/hoe-wij-scoren/">de methode van Robin</a>`} · bijgewerkt ${nlDate(pg.updated || CHECKED)}</p></div><div class="prod-hero"><img src="${esc(p.image)}" alt="${esc(p.name)}" width="400" height="400" fetchpriority="high"><div class="prod-score"><b>${score(sc.total)}</b><span>onze score</span></div></div></div>${wave('wave-down', 'var(--creme)')}</section>`;
  const facts = `<dl class="facts"><div><dt>Eiwit in droge stof</dt><dd>${pct1(n.pDM)}</dd></div><div><dt>Prijs per 100 g eiwit</dt><dd>${p.p100 ? eur(p.p100) : '–'}</dd></div><div><dt>Prijs per dag</dt><dd>${eur(p.ppd)}</dd></div><div><dt>Per maand</dt><dd>${eur0(p.ppd * 30.4)}</dd></div><div><dt>Energie</dt><dd>±${n.kcal100} kcal/100 g</dd></div></dl>`;
  const bars = `<section class="scorecard"><h2>${esc(p.brand)} score: zo komt de ${score(sc.total)} tot stand</h2>${bar('Eiwit (40%)', sc.eiwit, pct1(n.pDM) + ' in droge stof')}${bar('Prijs per eiwit (25%)', sc.prijs, p.p100 ? eur(p.p100) + ' per 100 g eiwit' : '')}${bar('Koolhydraten (20%)', sc.kh, '±' + pct(n.nfeDM) + ' in droge stof')}${bar('Etiket (15%)', sc.etiket, firstIngredient(n.sam) ? 'eerste ingrediënt: ' + esc(firstIngredient(n.sam)) : 'samenstelling niet volledig bekend')}<p class="fine">Hoe ik reken lees je bij <a href="/hoe-wij-scoren/">hoe ik kattenvoer score</a>.</p></section>`;
  const tbl = `<div class="table-wrap"><table class="ttable"><caption>Analytische bestanddelen volgens het etiket</caption><thead><tr><td></td><th scope="col">Op het etiket</th><th scope="col">In droge stof</th></tr></thead><tbody>${[['Ruw eiwit', n.protein], ['Ruw vet', n.fat], ['Ruwe celstof', n.fiber], ['Ruwe as', n.ash]].map(([l, v]) => `<tr><th scope="row">${l}</th><td>${v == null ? 'niet vermeld' : pct1(v)}</td><td>${v == null ? '–' : pct1((v / (100 - n.moisture)) * 100)}</td></tr>`).join('')}<tr><th scope="row">Vocht</th><td>${pct1(n.moisture)}${n.moistureEstimated ? ' (geschat)' : ''}</td><td>–</td></tr><tr><th scope="row">Koolhydraten (berekend)</th><td>–</td><td>±${pct(n.nfeDM)}</td></tr></tbody></table></div>`;
  const sam = n.sam ? `<h2>Samenstelling van ${esc(p.short)}</h2><p class="sam">${esc(n.sam)}</p>` : '';
  const buy = `<h2>${esc(p.brand)} ${p.form === 'nat' ? 'natvoer' : 'droogvoer'} kopen: prijzen</h2><div class="offers">${offers.map((v) => `<div class="offer"><span><b>${esc(v.shop)}</b> · ${packLabel(v) || 'verpakking'}</span><span>${eur(v.price)}${v.ppk ? ` <small>${eur(v.ppk)}/kg</small>` : ''}</span>${cta(p, v, 'Bekijk', 'btn btn-sm')}</div>`).join('')}</div><p class="fine">Prijzen van ${nlDate(CHECKED)}. De webshop is leidend. Knoppen zijn partnerlinks.</p>`;
  const altHtml = alts.length ? `<h2>Beter voor ongeveer hetzelfde geld</h2><p>Deze ${p.form === 'nat' ? 'natvoeders' : 'droogvoeders'} scoren hoger en kosten per dag niet meer dan ${eur(p.ppd * 1.15)}:</p>${grid(alts)}` : '';
  const note = noteFor(p);
  const noteHtml = note ? `<section class="note"><h2>Mijn ervaring met ${esc(p.short)}</h2>${String(note.tekst).trim().split(/\n\s*\n/).map((t) => `<p>${esc(t)}</p>`).join('')}${note.datum ? `<p class="fine">Geschreven op ${nlDate(note.datum)}.</p>` : ''}</section>` : `<p class="fine">Dit is een automatische analyse van het etiket en de prijs. Hoe die werkt, lees je bij <a href="/hoe-wij-scoren/">hoe ik kattenvoer score</a>.</p>`;
  const body = `<div class="prose">${noteHtml}${facts}${r.sections.map((x) => `<h2>${x.h}</h2>${x.ps.map((t) => `<p>${t}</p>`).join('')}`).join('')}<section class="verdict"><div class="verdict-score"><span class="ring-big">${score(sc.total)}</span><small>onze score</small></div><div><p class="verdict-line">${esc(r.verdict)}</p><div class="procon"><div><p class="procon-h">Pluspunten op het etiket</p><ul>${(r.pros.length ? r.pros : ['Compleet voer']).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div><div><p class="procon-h">Waar je op moet letten</p><ul>${(r.cons.length ? r.cons : ['Geen grote minpunten op het etiket']).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div></div></section>${bars}<h2>Hoeveel ${esc(p.short)} geef je per dag?</h2><p>Dit zijn startporties als je kat alleen dit voer eet, gerekend met ±${n.kcal100} kcal per 100 gram. Weeg af, en stuur bij als je kat aankomt of afvalt.</p><div class="table-wrap"><table class="ttable"><caption>Portie, eiwit en kosten per dag naar gewicht</caption><thead><tr><th scope="col">Gewicht kat</th><th scope="col">Gram per dag</th><th scope="col">Eiwit per dag</th><th scope="col">Kosten per dag</th></tr></thead><tbody>${r.portions.map((x) => `<tr><th scope="row">${x.kg} kg</th><td>${x.gr} g</td><td>${x.eiwit} g</td><td>${eur(x.ppd)}</td></tr>`).join('')}</tbody></table></div>${tbl}${sam}${buy}${altHtml}${sourcesHtml(pg)}<section class="related"><h2>Lees ook</h2><ul>${brandFor(p) ? `<li><a href="/merken/${brandFor(p).slug}/">Mijn oordeel over ${esc(p.brand)}</a></li>` : ''}<li><a href="/kattenvoer/">Alle kattenvoer met score</a></li><li><a href="/veel-eiwit-kattenvoer/">Veel eiwit voor weinig geld</a></li><li><a href="/kennisbank/kattenvoer-etiket-lezen/">Zo lees je een etiket</a></li></ul></section></div>`;
  return `${head}<div class="wrap content">${body}</div>`;
}

// korte, eerlijke toelichting per gekozen product (in de je-vorm, als advies aan een vriend)
const hsh = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const pickV = (arr, seed) => arr[(Math.abs(Math.floor(seed)) >>> 0) % arr.length];
function uitleg(p, seed = 0) {
  if (!p.score || !p.nut) return '';
  const n = p.nut, f = p.form, S = SC[f]; if (!S) return '';
  const vorm = f === 'nat' ? 'natvoer' : 'droogvoer';
  const sd = (hsh(p.id) + seed) >>> 0;
  const lc = labelCheck(n.sam), claim = nameClaim(p.name);
  const plus = [], min = [];
  if (n.pDM >= S.pDM + 6) plus.push(pickV([`met ${pct1(n.pDM)} eiwit in droge stof zit het ruim boven het midden van ${pct(S.pDM)}`, `het eiwit is sterk: ${pct1(n.pDM)} in droge stof, waar het gemiddelde ${vorm} op ${pct(S.pDM)} blijft steken`, `je kat krijgt hier echt veel eiwit binnen, ${pct1(n.pDM)} als je het water wegrekent`], sd));
  else if (n.pDM >= S.pDM) plus.push(`het eiwit zit met ${pct1(n.pDM)} in droge stof net boven het midden`);
  else if (n.pDM >= S.pDM - 5) min.push(`het eiwit zit met ${pct1(n.pDM)} in droge stof net onder het midden van ${pct(S.pDM)}`);
  else min.push(pickV([`het eiwit blijft met ${pct1(n.pDM)} in droge stof duidelijk onder het midden van ${pct(S.pDM)}`, `het is mager qua eiwit, met ${pct1(n.pDM)} in droge stof`, `ik had voor een vleeseter meer eiwit gewild dan ${pct1(n.pDM)} in droge stof`], sd));
  if (p.p100 && p.p100 < S.p100 * 0.75) plus.push(pickV([`per 100 gram eiwit betaal je maar ${eur(p.p100)}`, `je krijgt veel eiwit voor je geld (${eur(p.p100)} per 100 gram eiwit)`, `het eiwit is goedkoop: ${eur(p.p100)} per 100 gram, tegen ${eur(S.p100)} gemiddeld`], (sd >>> 2)));
  else if (p.p100 && p.p100 > S.p100 * 1.4) min.push(`je betaalt ${eur(p.p100)} per 100 gram eiwit, flink meer dan de ${eur(S.p100)} die gemiddeld is`);
  if (n.nfeDM < 15) plus.push(`er zit weinig vulling in (±${pct(n.nfeDM)} koolhydraten)`);
  else if (n.nfeDM > 38) min.push(pickV([`met ±${pct(n.nfeDM)} koolhydraten zit er veel vulling in`, `ruim een derde van de droge stof is koolhydraat (±${pct(n.nfeDM)})`], (sd >>> 3)));
  if (lc && lc.firstGrain === 1) min.push(`er staat een graan op plek één van het etiket (“${esc(lc.top[0])}”)`);
  else if (meatFirst(n.sam) === true) plus.push(`er staat ${esc(firstIngredient(n.sam).toLowerCase())} vooraan op het etiket`);
  if (lc && lc.plant.length) min.push('een deel van het eiwit komt uit planten');
  if (!n.sam && OPEN_LABEL.test(p.brand)) min.push('de samenstelling is open, dus je weet niet precies welk vlees erin zit');
  if (claim && claim.min <= 4) min.push(claim.kind === 'smaak' ? `“smaak” in de naam betekent dat er nauwelijks ${esc(claim.w)} in hoeft te zitten` : `“met ${esc(claim.w)}” in de naam betekent maar minimaal 4%`);
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const join = (a) => a.length > 1 ? a.slice(0, -1).join(', ') + ' en ' + a[a.length - 1] : a[0];
  let t = `<b>${esc(p.short)}</b> (${esc(p.brand)}, score ${score(p.score.total)}). `;
  if (plus.length) t += cap(join(plus.slice(0, 2))) + '. ';
  if (min.length) t += pickV(['Wel even opletten, want ', 'Het minpunt is dat ', 'Eerlijk is eerlijk: ', 'Waar ik minder blij van word, is dat '], (sd >>> 4)) + join(min.slice(0, 2)) + '. ';
  t += pickV([`Voor een kat van 4 kilo ben je ongeveer ${eur(p.ppd)} per dag kwijt, zo'n ${eur0(p.ppd * 30.4)} per maand.`, `Reken op ${eur(p.ppd)} per dag, ofwel ${eur0(p.ppd * 30.4)} per maand voor één kat.`, `Per maand kost het je rond de ${eur0(p.ppd * 30.4)} (${eur(p.ppd)} per dag).`], (sd >>> 5));
  if (!plus.length && !min.length) t += ' Geen uitschieters naar boven of beneden, gewoon degelijk.';
  return `<p>${t} <a href="${purl(p)}">Bekijk de analyse</a>.</p>`;
}
const uitlegBlock = (xs, n, seed) => { const ps = xs.filter((p) => HASPAGE(p)).slice(0, n).map((p) => uitleg(p, seed)).filter(Boolean); return ps.length ? `<div class="uitleg">${ps.join('')}</div>` : ''; };
// ---------- markdown ----------
function md(src, page) {
  src = src.replace(/\[\[lijst ([^\]]+)\]\]/g, (_, a) => { const q = parseArgs(a); const xs = select(q); const nU = q.uitleg != null ? Number(q.uitleg) : (q.form === 'snack' ? 0 : 3); return '\n\n' + grid(xs, { pick: q.label }) + (nU ? '\n\n' + uitlegBlock(xs, nU, hsh(page && page.slug)) : '') + '\n\n'; });
  src = src.replace(/\[\[ranking (\w+)\]\]/g, (_, k) => '\n\n' + (RANK.tables[k] ?? `<!-- onbekende ranglijst ${k} -->`) + '\n\n');
  src = src.replace(/\[\[calc\]\]/g, () => '\n\n' + calc() + '\n\n');
  src = src.replace(/\[\[budgettabel\]\]/g, () => '\n\n' + budgetTable() + '\n\n');
  src = src.replace(/\[\[merken\]\]/g, () => '\n\n' + brandGrid() + '\n\n');
  src = src.replace(/\[\[tegels\]\]/g, () => '\n\n' + tiles() + '\n\n');
  src = src.replace(/\[\[alleproducten\]\]/g, () => '\n\n' + allProducts() + '\n\n');
  src = src.replace(/\[\[scoretabel ([^\]]+)\]\]/g, (_, a) => '\n\n' + scoreTable(select(parseArgs(a))) + '\n\n');
  src = src.replace(/\[\[foto (\w+) "([^"]+)"\]\]/g, (_, k, alt) => '\n\n' + photo(k, alt) + '\n\n');
  src = src.replace(/\[\[band (\w+) "([^"]+)" "([^"]+)"(?: "([^"]+)")?\]\]/g, (_, k, t, txt, link) => '\n\n' + band(k, t, txt, link) + '\n\n');
  src = src.replace(/\[\[top ([^\]]+)\]\]/g, (_, a) => '\n\n' + topList(a) + '\n\n');
  src = src.replace(/\[\[mini ([^\]]+)\]\]/g, (_, a) => '\n\n' + miniList(a) + '\n\n');
  src = ptok(src);
  src = src.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
  let html = marked.parse(src);
  html = html.replace(/<blockquote>([\s\S]*?)<\/blockquote>/g, (_, inner) => `<aside class="robin">${inner}<p class="robin-sign">Robin, baasje van Mila en Nala</p></aside>`);
  html = html.replace(/<table>([\s\S]*?)<\/table>/g, '<div class="table-wrap"><table class="ttable">$1</table></div>');
  return html;
}
// variabelen in teksten, altijd actueel uit de feed
const cheapest = (form) => FOOD.filter((p) => p.form === form && !p.flags.includes('aanvullend')).sort((a, b) => a.ppd - b.ppd)[0];
const vars = {
  aantal: nf(ALL.length), aantal_voer: nf(FOOD.length), aantal_droog: nf(T.droog.n), aantal_nat: nf(T.nat.n), aantal_merken: nf(new Set(ALL.map((p) => p.brand)).size),
  droog_goedkoop_dag: eur(T.droog.p10 * GRAMS_PER_DAY.droog / 1000), droog_mid_dag: eur(T.droog.p50 * GRAMS_PER_DAY.droog / 1000), droog_duur_dag: eur(T.droog.p90 * GRAMS_PER_DAY.droog / 1000),
  nat_goedkoop_dag: eur(T.nat.p10 * GRAMS_PER_DAY.nat / 1000), nat_mid_dag: eur(T.nat.p50 * GRAMS_PER_DAY.nat / 1000), nat_duur_dag: eur(T.nat.p90 * GRAMS_PER_DAY.nat / 1000),
  droog_mid_kg: eur(T.droog.p50), nat_mid_kg: eur(T.nat.p50),
  nat_mid_maand: eur0(T.nat.p50 * GRAMS_PER_DAY.nat / 1000 * 30.4), droog_mid_maand: eur0(T.droog.p50 * GRAMS_PER_DAY.droog / 1000 * 30.4),
  verschil_nat_droog: String(Math.round((T.nat.p50 * GRAMS_PER_DAY.nat) / (T.droog.p50 * GRAMS_PER_DAY.droog))),
  goedkoopste_droog_dag: eur(cheapest('droog').ppd), datum: nlDate(CHECKED), jaar: '2026',
  aanvullend_aantal: nf(ALL.filter((p) => p.flags.includes('aanvullend')).length), graanvrij_aantal: nf(FOOD.filter((p) => p.flags.includes('graanvrij')).length),
};

// ---------- ranglijsten per categorie (src/rankings.mjs) ----------
const RANK = buildRankings(ALL, { HASPAGE, purl, esc, eur, pct, pct1, score, formLabel });
Object.assign(vars, RANK.vars);

// ---------- statistiek voor productteksten ----------
const med = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const SC = {};
for (const form of ['droog', 'nat']) {
  const xs = ALL.filter((p) => p.form === form && p.score);
  SC[form] = { n: xs.length, pDM: med(xs.map((p) => p.nut.pDM)), nfe: med(xs.map((p) => p.nut.nfeDM)), p100: med(xs.map((p) => p.p100)), ppd: med(xs.map((p) => p.ppd)), gpk: med(xs.map((p) => (p.nut.protein / p.nut.kcal100) * 100)) };
}
{
  const sc = ALL.filter((p) => p.score && (p.form === 'droog' || p.form === 'nat'));
  const lcs = sc.map((p) => labelCheck(p.nut.sam)).filter(Boolean);
  const nat = FOOD.filter((p) => p.form === 'nat');
  const blik = med(nat.filter((p) => /\bblik|\bcan\b|\bdosen?\b/i.test(p.name)).map((p) => p.ppk));
  const zak = med(nat.filter((p) => /zakje|pouch|maaltijdzak|portie/i.test(p.name)).map((p) => p.ppk));
  const ratios = [];
  for (const p of ALL.filter((x) => x.form === 'droog')) { const sm = p.variants.filter((v) => v.grams && v.grams <= 2500 && v.ppk), lg = p.variants.filter((v) => v.grams >= 7000 && v.ppk); if (sm.length && lg.length) ratios.push(Math.min(...lg.map((v) => v.ppk)) / Math.min(...sm.map((v) => v.ppk))); }
  const r = med(ratios);
  Object.assign(vars, {
    etiket_aantal: nf(sc.length), samenstelling_aantal: nf(lcs.length),
    granen_vooraan: nf(lcs.filter((l) => l.firstGrain && l.firstGrain <= 2).length), granen_vooraan_pct: pct(lcs.filter((l) => l.firstGrain && l.firstGrain <= 2).length / Math.max(1, lcs.length) * 100),
    plant_eiwit: nf(lcs.filter((l) => l.plant.length).length), plant_eiwit_pct: pct(lcs.filter((l) => l.plant.length).length / Math.max(1, lcs.length) * 100),
    weinig_eiwit: nf(sc.filter((p) => p.nut.pDM < 32).length), weinig_eiwit_pct: pct(sc.filter((p) => p.nut.pDM < 32).length / sc.length * 100),
    kh_hoog: nf(sc.filter((p) => p.nut.nfeDM > 35).length), kh_hoog_droog_pct: pct(sc.filter((p) => p.form === 'droog' && p.nut.nfeDM > 35).length / Math.max(1, SC.droog.n) * 100),
    eiwit_mid_droog: pct(SC.droog.pDM), eiwit_mid_nat: pct(SC.nat.pDM), kh_mid_droog: pct(SC.droog.nfe), kh_mid_nat: pct(SC.nat.nfe), p100_mid_droog: eur(SC.droog.p100), p100_mid_nat: eur(SC.nat.p100),
    korting_aantal: nf(FOOD.filter((p) => p.korting >= 0.1).length), korting_goed: nf(FOOD.filter((p) => p.korting >= 0.1 && p.score && p.score.total >= 6).length),
    blik_kg: blik ? eur(blik) : '–', zak_kg: zak ? eur(zak) : '–', blik_verschil: blik && zak ? pct(Math.abs(1 - blik / zak) * 100) : '–', blik_goedkoper: blik && zak && blik < zak ? 'goedkoper' : 'duurder',
    groot_besparing: r ? pct((1 - r) * 100) : '–', groot_aantal: nf(ratios.length),
    claim_met: nf(sc.filter((p) => { const c = nameClaim(p.name); return c && c.min <= 4; }).length),
  });
}
const pctRank = (form, key, v) => { const xs = ALL.filter((p) => p.form === form && p.score).map((p) => key(p)).sort((a, b) => a - b); let i = 0; while (i < xs.length && xs[i] < v) i++; return xs.length ? i / xs.length : 0.5; };
if (process.env.VARS) console.log(vars);
// productwaarden in teksten, altijd actueel uit de feed: {{p:product-id:veld}}
const BYID = Object.fromEntries(ALL.map((p) => [p.id, p]));
const PFIELD = { score: (p) => score(p.score.total), eiwit: (p) => pct(p.nut.pDM), eiwit1: (p) => pct1(p.nut.pDM), kh: (p) => pct(p.nut.nfeDM), dag: (p) => eur(p.ppd), maand: (p) => eur0(p.ppd * 30.4), kg: (p) => eur(p.ppk), naam: (p) => p.short || p.name, url: (p) => purl(p) };
const ptok = (t) => String(t).replace(/\{\{p:([\w-]+):(\w+)\}\}/g, (m, id, f) => { const p = BYID[id]; if (!p || !PFIELD[f]) { console.warn('onbekende producttoken', m); return m; } try { return PFIELD[f](p); } catch { console.warn('geen waarde voor', m); return m; } });
const subst = (t) => ptok(t).replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
// genummerde, redactionele toplijst: [[top id:Label|id:Label|...]] met live cijfers uit de feed
function topList(arg) {
  let cap = 'het beste droogvoer voor katten';
  arg = arg.replace(/^\s*"([^"]+)"\s*/, (_, c) => { cap = c; return ''; });
  const rows = arg.split('|').map((x) => x.trim()).filter(Boolean).map((x) => { const i = x.indexOf(':'); const id = x.slice(0, i).trim(); const p = BYID[id]; if (!p || !p.score) { console.warn('top: onbekend of zonder score', id); return null; } return { p, label: x.slice(i + 1).trim() }; }).filter(Boolean);
  if (!rows.length) return '';
  return `<div class="table-wrap"><table class="ttable rtable toplist"><caption>Top ${rows.length}: ${esc(cap)}</caption><thead><tr><th scope="col">#</th><th scope="col">Voer</th><th scope="col">Score</th><th scope="col">Eiwit (ds)</th><th scope="col">Koolh. (ds)</th><th scope="col">Per dag</th><th scope="col"><span class="sr">Winkel</span></th></tr></thead><tbody>${rows.map(({ p, label }, i) => `<tr><td>${i + 1}</td><th scope="row"><a href="${purl(p)}">${esc(p.short || p.name)}</a><small>${esc(label)}</small></th><td><b class="sc">${score(p.score.total)}</b></td><td>${pct1(p.nut.pDM)}</td><td>±${pct(p.nut.nfeDM)}</td><td>${eur(p.ppd)}</td><td>${cta(p, p.best, 'Bekijk', 'btn btn-buy')}</td></tr>`).join('')}</tbody></table></div><p class="fine">Score, eiwit en koolhydraten in droge stof volgens het etiket, omgerekend met <a href="/hoe-wij-scoren/">mijn methode</a>. Prijs per dag voor een volwassen kat van 4 kilo die alleen dit voer eet, bij de goedkoopste verpakking in de feed. Prijzen van ${nlDate(CHECKED)}, de webshop is leidend.</p>`;
}
// ---------- pagina's laden ----------
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.md') ? [path.join(dir, e.name)] : []); }
const pages = walk(path.join(ROOT, 'content/pages')).map((f) => {
  const raw = fs.readFileSync(f, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const fm = yaml.load(m[1]);
  return { ...fm, body: m[2], source: path.relative(ROOT, f) };
});
// teksten voor automatische merkpagina's, volledig uit de etiketdata
function fillAuto(b) {
  const xs = ALL.filter((p) => new RegExp(b.match, 'i').test(p.brand));
  const sc = xs.filter(HASPAGE).sort((a, c) => c.score.total - a.score.total);
  const food = xs.filter((p) => FOOD.includes(p));
  const forms = ['droog', 'nat'].filter((f) => sc.some((p) => p.form === f));
  const m = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const st = Object.fromEntries(forms.map((f) => { const a = sc.filter((p) => p.form === f); return [f, { n: a.length, pDM: m(a.map((p) => p.nut.pDM)), nfe: m(a.map((p) => p.nut.nfeDM)), ppd: m(a.map((p) => p.ppd)), p100: m(a.map((p) => p.p100).filter(Boolean)) }]; }));
  const dieet = xs.filter((p) => p.flags.includes('dieet')).length / Math.max(1, xs.length);
  const lcs = sc.map((p) => labelCheck(p.nut.sam)).filter(Boolean);
  const grainTop = lcs.filter((l) => l.firstGrain && l.firstGrain <= 2).length;
  const plant = lcs.filter((l) => l.plant.length).length;
  const meatTop = sc.filter((p) => meatFirst(p.nut.sam) === true).length;
  const ppdAll = m(food.map((p) => p.ppd));
  const cls = forms.length ? (forms.map((f) => st[f].ppd / SC[f].ppd).reduce((a, x) => a + x, 0) / forms.length) : 1;
  b.price_class = cls < 0.8 ? 'Voordelig' : cls > 1.3 ? 'Premium' : 'Middenklasse';
  b.owner = b.owner || '–';
  const eiwitW = forms.map((f) => st[f].pDM - SC[f].pDM);
  const eiw = m(eiwitW);
  const vn = (f) => f === 'droog' ? 'droogvoer' : 'natvoer';
  b.verdict = eiw >= 5 && cls <= 1.1 ? `${b.name} geeft je meer eiwit dan gemiddeld zonder dat je er veel meer voor betaalt. Dat zie ik niet vaak.`
    : eiw >= 5 ? `${b.name} zit ruim boven het gemiddelde qua eiwit, en dat zie je terug in de prijs.`
    : eiw <= -5 ? `${b.name} zit onder het gemiddelde qua eiwit. ${cls < 0.9 ? 'Het is wel voordelig, maar je koopt vooral vulling.' : 'En goedkoop is het ook niet: hier betaal je vooral voor de naam.'}`
    : `${b.name} is gemiddeld op eiwit en ${cls < 0.9 ? 'voordelig in prijs' : cls > 1.2 ? 'aan de dure kant' : 'gemiddeld in prijs'}. Geen uitschieter, wel een eerlijke middenmoter.`;
  b.pros = []; b.cons = [];
  for (const f of forms) { const d = st[f].pDM - SC[f].pDM; if (d >= 3) b.pros.push(`${vn(f)[0].toUpperCase() + vn(f).slice(1)}: gemiddeld ${pct(st[f].pDM)} eiwit in droge stof (midden: ${pct(SC[f].pDM)})`); else if (d <= -3) b.cons.push(`${vn(f)[0].toUpperCase() + vn(f).slice(1)}: gemiddeld maar ${pct(st[f].pDM)} eiwit in droge stof`); }
  if (cls < 0.85) b.pros.push('Voordeliger per dag dan het gemiddelde'); if (cls > 1.3) b.cons.push('Duurder per dag dan het gemiddelde');
  if (meatTop && lcs.length) b.pros.push(`Bij ${meatTop} van de ${sc.length} etiketten staat vlees of vis vooraan`);
  if (grainTop) b.cons.push(`${grainTop}× granen bij de eerste twee ingrediënten`);
  if (plant) b.cons.push(`${plant}× plantaardig eiwit (gluten, soja) in de top van het etiket`);
  if (dieet > 0.4) b.cons.push('Veel dieetvoer: overleg met je dierenarts');
  if (!b.pros.length) b.pros.push('Compleet voer met bekende etiketgegevens');
  if (!b.cons.length) b.cons.push('Geen grote uitschieters op het etiket');
  const best = sc[0], cheap = [...sc].filter((p) => p.score.total >= 5).sort((a, c) => a.ppd - c.ppd)[0];
  b.seo_title = `${b.name} kattenvoer: etiketten, eiwit en prijs per dag`.slice(0, 60);
  const md0 = [
    `Is ${b.name} kattenvoer goed? Ik las ${sc.length} etiketten: eiwit in droge stof, granen, koolhydraten en prijs per dag. Met een eerlijke score per product.`,
    `Is ${b.name} kattenvoer goed? Ik las ${sc.length} etiketten: eiwit in droge stof, granen, koolhydraten en prijs per dag. Met score per product.`,
    `${b.name} kattenvoer: ${sc.length} etiketten gelezen op eiwit in droge stof, granen, koolhydraten en prijs per dag. Eerlijke score per product.`,
    `${b.name} kattenvoer: ${sc.length} etiketten doorgerekend op eiwit, granen en prijs per dag. Score per product.`,
  ];
  b.meta_description = md0.find((x) => x.length >= 140 && x.length <= 160) || md0.sort((x, y) => Math.abs(150 - x.length) - Math.abs(150 - y.length))[0];
  b.lead = `${sc.length} etiketten van ${b.name}, automatisch naast de rest van de markt gelegd. Geen merkpraatjes, alleen wat erin zit en wat het kost.`;
  const lines = [];
  lines.push(`## Is ${b.name} kattenvoer goed?`, '');
  lines.push(`In de vergelijking staan ${xs.length} producten van ${b.name}. Van ${sc.length} daarvan ken ik de analytische bestanddelen, en die heb ik omgerekend naar droge stof. Zo vergelijk je eerlijk, ook tussen natvoer en brokken.`, '');
  for (const f of forms) { const s = st[f]; lines.push(`Het ${vn(f)} van ${b.name} (${s.n} soorten met etiket) bevat gemiddeld **${pct(s.pDM)} eiwit** in droge stof. Het midden van alle ${vn(f)} ligt op ${pct(SC[f].pDM)}. Aan koolhydraten reken ik gemiddeld ${pct(s.nfe)} uit, tegen ${pct(SC[f].nfe)} in de hele markt. ${s.pDM >= SC[f].pDM + 3 ? 'Meer eiwit dus, en dat is precies waar een kat iets aan heeft.' : s.pDM <= SC[f].pDM - 3 ? 'Minder eiwit dan gemiddeld. Het verschil wordt opgevuld met koolhydraten, en daar heeft een vleeseter weinig aan.' : 'Netjes in het midden.'}`, ''); }
  if (lcs.length) lines.push(`Bij ${lcs.length} producten kon ik de volledige samenstelling lezen. ${meatTop ? `Bij ${meatTop} daarvan staat een dierlijk ingrediënt op de eerste plek.` : 'Bij geen daarvan staat een benoemd dierlijk ingrediënt op de eerste plek.'} ${grainTop ? `Bij ${grainTop} staat een graan bij de eerste twee ingrediënten. Dat vind ik voor kattenvoer een slecht teken.` : 'Granen bovenaan heb ik niet gezien.'} ${plant ? `En ${plant} keer zie ik plantaardig eiwit, zoals maïsgluten of soja, hoog op het etiket. Dat krikt het eiwitpercentage op zonder dat er meer vlees in zit.` : ''}`, '');
  lines.push(`> ${eiw >= 5 ? `Bij ${b.name} zie ik wat ik graag zie: het eiwit zit boven het gemiddelde.` : eiw <= -5 ? `Bij ${b.name} zou ik verder kijken dan de verpakking. Het eiwit zit onder het midden, en dat is voor een kat het belangrijkste getal.` : `${b.name} is geen merk waar ik enthousiast of boos over word. Kies hier per product, niet op de merknaam.`}`, '');
  lines.push(`## Wat kost het per dag?`, '');
  for (const f of forms) { const s = st[f]; lines.push(`Voor een kat van 4 kilo die alleen ${b.name} ${vn(f)} eet, betaal je gemiddeld ${eur(s.ppd)} per dag (${eur0(s.ppd * 30.4)} per maand). Het midden van de markt ligt op ${eur(SC[f].ppd)} per dag.${s.p100 ? ` Per 100 gram eiwit betaal je gemiddeld ${eur(s.p100)}, tegen ${eur(SC[f].p100)} gemiddeld.` : ''}`, ''); }
  lines.push(`## Het beste volgens mijn score`, '');
  lines.push(`De hoogste score binnen ${b.name} haalt [${best.short}](${purl(best)}) met een ${score(best.score.total)}: ${pct1(best.nut.pDM)} eiwit in droge stof en ${eur(best.ppd)} per dag.${cheap && cheap !== best ? ` Wil je het voordeliger, kijk dan naar [${cheap.short}](${purl(cheap)}): ${eur(cheap.ppd)} per dag met een ${score(cheap.score.total)}.` : ''} Hoe ik score, lees je bij [hoe ik kattenvoer beoordeel](/hoe-wij-scoren/).`, '');
  if (dieet > 0.4) lines.push(`Veel van het ${b.name}-assortiment is dieetvoer voor katten met een aandoening. Mijn score kijkt naar eiwit, koolhydraten, etiket en prijs. Of dieetvoer werkt bij jouw kat, bepaal je samen met je dierenarts, niet met mijn score.`, '');
  lines.push(`## Hoe ik heb gerekend`, '');
  lines.push(`Ik wil eerlijk zijn over wat deze pagina wel en niet is. Ik heb niet alle ${xs.length} producten van ${b.name} zelf aan mijn katten gegeven. Wat ik wel heb gedaan: van elk product met een etiket de analytische bestanddelen omgerekend naar droge stof, de koolhydraten uitgerekend, de samenstelling gelezen waar die beschikbaar was en de prijs omgerekend naar wat het je per dag kost. Het cijfer bovenaan is het gemiddelde van die productscores, geen gevoel. Of jouw kat het lust, weet je pas als je het probeert.`, '');
  lines.push(`## Voor wie is het?`, '');
  lines.push(`${eiw >= 3 ? `${b.name} past bij je als je veel eiwit belangrijk vindt` : `${b.name} past bij je als je kat het graag eet en je een vertrouwd merk wilt`}${cls < 0.9 ? ' en op de kosten let.' : cls > 1.2 ? ' en er wat meer voor over hebt.' : '.'} Twijfel je, leg het dan naast [het beste kattenvoer van ${vars.jaar}](/beste-kattenvoer/) of [goedkoop kattenvoer dat wel deugt](/goedkoop-kattenvoer/). Nieuw voer bouw je in een week op, zie [overstappen op ander voer](/kennisbank/kat-overzetten-op-ander-voer/).`, '');
  b.body = lines.join('\n');
  b.faq = [
    { q: `Is ${b.name} kattenvoer goed?`, a: `${b.verdict} Ik baseer dat op ${sc.length} etiketten: eiwit in droge stof, koolhydraten, de samenstelling en de prijs per 100 gram eiwit.` },
    { q: `Wat kost ${b.name} kattenvoer per maand?`, a: `Gemiddeld ${ppdAll ? eur0(ppdAll * 30.4) : 'een onbekend bedrag'} per maand voor een kat van 4 kilo die alleen dit merk eet. De prijzen komen uit de feeds van Plein.nl en bol.com en worden dagelijks bijgewerkt.` },
  ];
  return b;
}
for (const b of brands) if (b.auto) fillAuto(b);
// merkpagina's uit brands.yaml
const BIMG = ['oranje', 'grijs', 'kom', 'likken', 'samen', 'bak', 'tabbies', 'senior', 'duo', 'poot'];
for (const [bi, b] of brands.entries()) {
  pages.push({
    title: `${b.name} kattenvoer`, slug: `/merken/${b.slug}/`, template: 'review', brand: b.slug, primary_keyword: `${b.name} kattenvoer`,
    seo_title: b.seo_title, meta_description: b.meta_description, h1: b.h1 || (b.auto ? `${b.name} kattenvoer: alle etiketten doorgerekend` : `${b.name} kattenvoer: mijn eerlijke oordeel`), lead: b.lead,
    // automatische merkpagina's blijven uit de index tot er een eigen oordeel in brands.yaml staat
    index: !b.auto,
    image: b.image || BIMG[bi % BIMG.length], image_alt: `Kat eet uit een voerbak, ter illustratie bij ${b.name} kattenvoer`, updated: CHECKED, published: '2026-11-18',
    breadcrumb: b.name, faq: b.faq, sources: ['fediaf'], body: b.body, source: 'content/brands.yaml',
  });
}

// productpagina's voor alles met etiketgegevens
const usedTitles = new Set(), usedIds = new Set();
for (const pr of ALL) { let id = pr.id, i = 2; while (usedIds.has(id)) id = `${pr.id}-${i++}`; usedIds.add(id); pr.id = id; }
for (const pr of ALL.filter(HASPAGE)) {
  const kind = pr.form === 'nat' ? 'natvoer' : 'droogvoer';
  const shortName = pr.name.split(/\s+[-–|]\s+/).filter((seg, i) => i === 0 || !/kattenvoer|kattenbrok|natvoer|droogvoer|brokjes|brokken|natte voeding|\d|kat\b|multipack|voordeel/i.test(seg)).join(' - ').replace(/\s*-\s*\d.*$/, '').replace(/\s+\d+\s*x\s*\d.*$/i, '').replace(/\s+\d+([.,]\d+)?\s*(kg|gr|gram|g)\b.*$/i, '').trim();
  const kw = shortName.length > 8 ? shortName : pr.name;
  let t = `${kw}: eiwit, prijs per dag en score`;
  if (t.length > 60) t = `${kw.slice(0, 40).trim()}…: eiwit en prijs`;
  if (usedTitles.has(t)) t = `${kw.slice(0, 36).trim()} ${kind} (${pr.id.slice(-5)})`;
  usedTitles.add(t);
  const d = `${pr.name}: ${pct1(pr.nut.pDM)} eiwit in droge stof, ${pr.p100 ? eur(pr.p100) + ' per 100 g eiwit en ' : ''}${eur(pr.ppd)} per dag. Score ${score(pr.score.total)}, berekend uit etiket en prijs.`;
  pages.push({ title: kw, slug: purl(pr), template: 'product', prod: pr, primary_keyword: kw, seo_title: t, meta_description: d.length > 160 ? d.slice(0, 157).replace(/\s\S*$/, '') + '…' : d, h1: `${kw}: ${kind} doorgerekend`, index: INDEX_PRODUCT(pr), breadcrumb: kw.length > 40 ? kw.slice(0, 38) + '…' : kw, updated: CHECKED, published: CHECKED, sources: ['fediaf', 'fediaf_label'], body: '', source: 'data/feed' });
}

// ---------- vaste opbouw: H1, top 10 in platte tekst, top 10 als kaarten, daarna de verdieping ----------
// frontmatter top10: een lijst-query ("form=droog sort=score"), "ranking=kitten" of "ids=id:Label|id:Label"
// compacte productlijst onder een H2: [[mini query]] of [[mini ranking=key n=3]] of [[mini ids=a,b]]
function miniList(arg) {
  const q = parseArgs(arg);
  let xs;
  if (q.ranking) xs = q.ranking.split('+').flatMap((k) => RANK.lists[k] || []);
  else if (q.ids) xs = q.ids.split(',').map((id) => BYID[id.trim()] || (console.warn('mini: onbekend', id), null)).filter(Boolean);
  else { xs = select({ ...q, n: 400, permerk: 'nee' }); if ((q.sort || 'ppd') === 'score') xs = tieRule(xs.sort((a, b) => b.score.total - a.score.total || a.ppd - b.ppd)); if (q.permerk === 'ja' || (q.permerk !== 'nee' && !q.brand)) { const seen = new Set(); xs = xs.filter((p) => !seen.has(p.brand) && seen.add(p.brand)); } }
  xs = xs.slice(0, Number(q.n || (q.ids ? 99 : 3)));
  if (!xs.length) { console.warn('mini: leeg', arg); return ''; }
  return `<ul class="mini">${xs.map((p) => { const bits = []; if (p.score) bits.push(`score ${score(p.score.total)}`); if (p.score && p.nut) bits.push(`${pct(p.nut.pDM)} eiwit`); bits.push(p.ppd ? `${eur(p.ppd)} per dag` : eur(p.best.price)); const name = HASPAGE(p) ? `<a href="${purl(p)}">${esc(p.short || p.name)}</a>` : esc(p.short || p.name); return `<li>${name} <span>${bits.join(' · ')}</span></li>`; }).join('')}</ul>`;
}
const tieRule = (xs) => { const a = xs.slice(); let ch = true; while (ch) { ch = false; for (let k = 0; k < a.length - 1; k++) { const x = a[k], y = a[k + 1]; if (x.score && y.score && x.form === y.form && x.score.total - y.score.total <= 0.2001 && y.ppd < x.ppd) { a[k] = y; a[k + 1] = x; ch = true; } } } return a; };
function top10Of(pg) {
  const spec = String(pg.top10 || '').trim();
  if (!spec) return null;
  let rows, mode;
  if (spec.startsWith('ranking=')) { mode = 'ranking'; rows = spec.slice(8).split('+').flatMap((k) => (RANK.lists[k.trim()] || (console.warn('top10: onbekende ranglijst', k), []))).map((x) => ({ p: x })); }
  else if (spec.startsWith('ids=')) { mode = 'ids'; rows = spec.slice(4).split('|').map((x) => { const i = x.indexOf(':'); const id = (i < 0 ? x : x.slice(0, i)).trim(); if (!BYID[id]) { console.warn('top10: onbekend product', id); return null; } return { p: BYID[id], label: i < 0 ? '' : x.slice(i + 1).trim() }; }).filter(Boolean); }
  else {
    const q = parseArgs(spec); mode = q.sort || 'ppd';
    let xs = select({ ...q, n: 400, permerk: 'nee' });
    if (mode === 'score') xs = tieRule(xs.sort((a, b) => b.score.total - a.score.total || a.ppd - b.ppd));
    if (q.permerk === 'ja' || (q.permerk !== 'nee' && !q.brand)) { const seen = new Set(); xs = xs.filter((p) => !seen.has(p.brand) && seen.add(p.brand)); }
    else { const seen = new Set(); xs = xs.filter((p) => { const k = (p.short || p.name).toLowerCase(); return !seen.has(k) && seen.add(k); }); }
    rows = xs.map((x) => ({ p: x }));
  }
  const seen = new Set();
  rows = rows.filter((r) => !seen.has(r.p.id) && seen.add(r.p.id)).slice(0, Number(pg.top_n || 10));
  if (!rows.length) { console.warn('top10: geen producten voor', pg.slug); return null; }
  const xs = rows.map((r) => r.p);
  const cheap = xs.filter((x) => x.ppd).reduce((a, b) => (!a || b.ppd < a.ppd ? b : a), null);
  const prot = xs.filter((x) => x.score && x.nut).reduce((a, b) => (!a || b.nut.pDM > a.nut.pDM ? b : a), null);
  rows.forEach((r, i) => { if (!r.label) r.label = i === 0 ? 'Mijn nummer 1' : r.p === cheap ? 'Goedkoopst per dag' : r.p === prot ? 'Meeste eiwit' : ''; });
  rows.mode = mode;
  return rows;
}
const ORDER_TXT = {
  score: 'Bovenaan staat het voer met de hoogste score. Scheelt het 0,2 punt of minder bij dezelfde soort voer, dan zet ik het goedkoopste hoger.',
  ppd: 'Ik zet het voer dat per dag het minst kost bovenaan.',
  prijs: 'Ik zet de laagste prijs bovenaan.',
  korting: 'Bovenaan staat de grootste korting, alleen voor voer met een goede score.',
  p100: 'Bovenaan staat het voer waar je het minst betaalt per 100 gram eiwit.',
  eiwit: 'Bovenaan staat het voer met het meeste eiwit in de droge stof.',
  ranking: 'De volgorde komt uit mijn ranglijst voor deze categorie. Hoe ik die opstel, lees je verderop.',
  ids: 'Ik heb deze tien zelf gekozen, elk voor een eigen situatie.',
};
function top10Html(pg) {
  const rows = pg._top10;
  if (!rows) return '';
  const kw = esc(pg.top10_kw || pg.primary_keyword);
  const line = (r, i) => { const p = r.p; const bits = []; if (p.score) bits.push(`score ${score(p.score.total)}`); if (p.score && p.nut) bits.push(`${pct(p.nut.pDM)} eiwit`); bits.push(p.ppd ? `${eur(p.ppd)} per dag` : eur(p.best.price)); return `<li><a href="#top-${i + 1}">${esc(p.short || p.name)}</a>${r.label && i > 0 ? ` (${esc(r.label.charAt(0).toLowerCase() + r.label.slice(1))})` : ''}: ${bits.join(', ')}.</li>`; };
  const fine = (grid([rows[0].p]).match(/<p class="fine">[\s\S]*<\/p>$/) || [''])[0];
  const keuze = pg.keuze ? `<div class="keuze"><p class="keuze-kop">Mijn keuze</p>${marked.parse(subst(pg.keuze.replace(/\{\{(top1\w*|top_n)\}\}/g, (_, x) => pg._tv[x] ?? '')))}</div>` : '';
  return `${keuze}<section class="top10" aria-labelledby="top10-kop"><p class="top10-intro">Dit is mijn top ${rows.length} ${kw}, bijgewerkt op ${nlDate(CHECKED)}. ${ORDER_TXT[rows.mode] || ORDER_TXT.score}</p>
<ol class="top10-tekst">${rows.map(line).join('')}</ol>
<h2 id="top10-kop">Top ${rows.length} ${kw}</h2>
<div class="pgrid top10-grid">${rows.map((r, i) => `<div class="top10-item" id="top-${i + 1}"><span class="top10-nr" aria-label="Plek ${i + 1}">${i + 1}</span>${card(r.p, { pick: r.label || undefined })}</div>`).join('')}</div>${fine}</section>`;
}
for (const p of pages) {
  if (!p.top10) continue;
  p._top10 = top10Of(p);
  const t = p._top10 && p._top10[0].p;
  if (!t) continue;
  const tv = { top1: t.short || t.name, top1_score: t.score ? score(t.score.total) : '', top1_dag: t.ppd ? eur(t.ppd) : eur(t.best.price), top1_eiwit: t.nut ? pct(t.nut.pDM) : '', top_n: String(p._top10.length), top1_url: purl(t) };
  p._tv = tv;
  for (const k of ['seo_title', 'meta_description', 'lead', 'h1']) if (typeof p[k] === 'string') p[k] = p[k].replace(/\{\{(top1\w*|top_n)\}\}/g, (_, x) => tv[x] ?? '');
  // meta binnen 160 tekens houden: eerst de productnaam inkorten, pas als laatste de slotzin weg
  const m0 = p.meta_description || '';
  if (m0.length > 160) {
    const words = tv.top1.split(/\s+/);
    let m = m0;
    for (let n = words.length - 1; n >= 2 && m.length > 160; n--) m = m0.replace(tv.top1, words.slice(0, n).join(' ').replace(/[\s\-–&,(]+$/, ''));
    if (m.length > 160) m = m.replace(/\s+[^.?!]*[.?!]$/, '');
    p.meta_description = m;
  }
}

// cijfers in titels, descriptions en intro's invullen (zodat ze met de feed meebewegen)
for (const p of pages) for (const k of ['seo_title', 'meta_description', 'lead', 'h1']) if (typeof p[k] === 'string' && p[k].includes('{{')) p[k] = subst(p[k]);

// ---------- logo ----------
const logo = `<span class="logo" role="img" aria-label="Beste kattenvoer"><span class="lg-0" aria-hidden="true">beste</span><span class="lg-1" aria-hidden="true">KATTEN</span><span class="lg-2" aria-hidden="true">VOER</span></span>`;
const wave = (cls, fill) => `<svg class="wave ${cls}" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0h1440v38c-180 58-372 86-578 70C640 92 476 18 274 22 160 24 70 48 0 76z" fill="${fill}"/></svg>`;

// ---------- schema ----------
const crumbs = (p) => {
  if (p.slug === '/') return [];
  const parts = p.slug.split('/').filter(Boolean);
  const out = [{ name: 'Home', url: '/' }];
  let acc = '/';
  parts.forEach((s, i) => { acc += s + '/'; const pg = pages.find((x) => x.slug === acc); if (pg || i === parts.length - 1) out.push({ name: (pg && (pg.breadcrumb || pg.title)) || s, url: acc }); });
  return out;
};
const author = { '@type': 'Person', '@id': abs(site.author.url + '#persoon'), name: site.author.name, url: abs(site.author.url), jobTitle: 'Kattenbaasje en maker van Beste-kattenvoer.nl', sameAs: [site.author.tiktok].filter(Boolean) };
function productSchema(b, p) {
  const xs = ALL.filter((x) => new RegExp(b.match || b.name, 'i').test(x.brand) && x.ppk && x.inStock);
  const prices = xs.map((x) => x.best.price);
  return {
    '@type': 'Product', name: `${b.name} kattenvoer`, brand: { '@type': 'Brand', name: b.name }, image: xs[0] ? xs[0].image : imgUrl('kom'), description: b.meta_description,
    ...(prices.length ? { offers: { '@type': 'AggregateOffer', priceCurrency: 'EUR', lowPrice: Math.min(...prices).toFixed(2), highPrice: Math.max(...prices).toFixed(2), offerCount: xs.length } } : {}),
    ...(b.auto ? {} : { review: { '@type': 'Review', name: `${b.name} kattenvoer review`, positiveNotes: { '@type': 'ItemList', itemListElement: (b.pros || []).map((x, n) => ({ '@type': 'ListItem', position: n + 1, name: x })) }, negativeNotes: { '@type': 'ItemList', itemListElement: (b.cons || []).map((x, n) => ({ '@type': 'ListItem', position: n + 1, name: x })) }, reviewRating: { '@type': 'Rating', ratingValue: b.score, bestRating: 10, worstRating: 1 }, author: { '@type': 'Organization', name: 'Beste-kattenvoer.nl', url: site.url }, publisher: { '@type': 'Organization', name: 'Beste-kattenvoer.nl', url: site.url }, datePublished: isoDate(p.published || CHECKED), reviewBody: b.verdict } }),
  };
}
function schemaFor(p, bc) {
  const g = [
    { '@type': 'Organization', '@id': site.url + '/#org', name: 'Beste-kattenvoer.nl', url: site.url, logo: abs('/logo.png'), sameAs: [site.author.tiktok].filter(Boolean), founder: { '@id': abs(site.author.url + '#persoon') } },
    { '@type': 'WebSite', '@id': site.url + '/#website', url: site.url, name: 'Beste-kattenvoer.nl', inLanguage: 'nl-NL', publisher: { '@id': site.url + '/#org' } },
  ];
  if (bc.length) g.push({ '@type': 'BreadcrumbList', itemListElement: bc.map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, item: abs(b.url) })) });
  if (['article', 'landing', 'review', 'vergelijker', 'home'].includes(p.template) && !(p.template === 'review' && brandBySlug[p.brand]?.auto)) g.push({ '@type': 'Article', headline: p.h1 || p.title, description: p.meta_description, datePublished: isoDate(p.published || CHECKED), dateModified: isoDate(p.updated || CHECKED), author, publisher: { '@id': site.url + '/#org' }, mainEntityOfPage: abs(p.slug), image: p.template === 'product' ? p.prod.image : p.image ? imgUrl(p.image) : abs('/og-default.png'), inLanguage: 'nl-NL' });
  const fb = p.template === 'review' ? brandBySlug[p.brand] : p.featured ? brandBySlug[p.featured] : null;
  if (fb) g.push(productSchema(fb, p));
  if (p.template === 'product') {
    const pr = p.prod; const prices = pr.variants.map((v) => v.price);
    g.push({ '@type': 'Product', name: pr.name, image: pr.image, brand: { '@type': 'Brand', name: pr.brand }, ...(pr.ean ? { gtin13: pr.ean.padStart(13, '0') } : {}), description: p.meta_description,
      // geen Review-schema: dit is een automatische analyse, geen review door een persoon
      offers: { '@type': 'AggregateOffer', priceCurrency: 'EUR', lowPrice: Math.min(...prices).toFixed(2), highPrice: Math.max(...prices).toFixed(2), offerCount: pr.variants.length } });
  }
  if (p.slug === '/merken/') g.push({ '@type': 'ItemList', name: 'Kattenvoermerken beoordeeld', itemListElement: brands.map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: `${b.name} kattenvoer`, url: abs(`/merken/${b.slug}/`) })) });
  if (p.slug === '/beste-kattenvoer/') g.push({ '@type': 'ItemList', name: 'Best scorend kattenvoer', itemListElement: ALL.filter(HASPAGE).sort((a, c) => c.score.total - a.score.total).slice(0, 10).map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x.name, url: abs(purl(x)) })) });
  if (p.faq && p.faq.length) g.push({ '@type': 'FAQPage', mainEntity: p.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: subst(f.a) } })) });
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': g });
}

// ---------- layout ----------
const css = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,])\s*/g, '$1');
const buildHash = Date.now().toString(36);
const googleTagId = String(site.google_tag || '').trim();
const googleTag = googleTagId ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${googleTagId}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${googleTagId}');</script>` : '';

function layout(p, main) {
  const bc = crumbs(p);
  const canonical = abs(p.slug);
  const robots = p.index === false ? 'noindex,follow' : 'index,follow,max-image-preview:large';
  const ogImg = p.template === 'product' ? p.prod.image : p.image ? imgUrl(p.image, 1200, 630) : abs('/og-default.png');
  const nav = site.nav.map((n) => `<a href="${n.url}"${p.slug.startsWith(n.url) && n.url !== '/' ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`).join('');
  const bcHtml = bc.length ? `<nav class="crumbs" aria-label="Kruimelpad"><ol>${bc.map((b, n) => n === bc.length - 1 ? `<li aria-current="page">${esc(b.name)}</li>` : `<li><a href="${b.url}">${esc(b.name)}</a></li>`).join('')}</ol></nav>` : '';
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${googleTag}<title>${esc(p.seo_title)}</title>
<meta name="description" content="${esc(p.meta_description)}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" type="text/plain" href="/llms.txt" title="Samenvatting voor taalmodellen">
<meta name="robots" content="${robots}">
<meta property="og:type" content="${p.template === 'home' ? 'website' : 'article'}">
<meta property="og:title" content="${esc(p.seo_title)}">
<meta property="og:description" content="${esc(p.meta_description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${esc(ogImg)}">
<meta property="og:locale" content="nl_NL">
<meta property="og:site_name" content="Beste-kattenvoer.nl">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#173F42">
${site.google_verification ? `<meta name="google-site-verification" content="${site.google_verification}">` : ''}
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" href="/fonts/archivo.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/work-sans.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preconnect" href="https://images.unsplash.com">
<link rel="preconnect" href="https://prod.cdn.plein.nl">
<style>${css}</style>
<script type="application/ld+json">${schemaFor(p, bc)}</script>
</head>
<body class="t-${p.template}">
<a class="skip" href="#inhoud">Naar de inhoud</a>
<script>(function(){var b=document.body,t=0;function f(){var s=window.scrollY>90;if(s!==t){t=s;b.classList.toggle('is-scrolled',s);}}addEventListener('scroll',f,{passive:true});f();})();</script>
<header class="site-header"><div class="wrap header-in">
<a class="brand" href="/" aria-label="Beste kattenvoer, naar home"><svg class="brand-bg" viewBox="0 0 320 130" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0H320C262 0 246 34 220 70 192 108 150 130 86 130H0Z"/></svg>${logo}</a>
<nav class="main-nav" aria-label="Hoofdmenu">${nav}</nav>
<a class="head-cta" href="/kattenvoer-vergelijken/">Vergelijk</a>
<details class="mobile-nav"><summary aria-label="Menu openen"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 8h16M4 16h16"/></svg></summary><nav aria-label="Mobiel menu">${nav}</nav></details>
</div></header>
<main id="inhoud">
${main.replace('<!--crumbs-->', bcHtml)}
</main>
<footer class="site-footer">${wave('wave-foot', 'var(--petrol)')}<div class="foot-in"><div class="wrap footer-grid">
<div><a class="brand" href="/" aria-label="Beste kattenvoer, naar home">${logo}</a><p>Van een kattenbaasje, voor kattenbaasjes. Gemaakt door <a href="${site.author.url}">Robin</a>, baasje van Mila en Nala. Ik vergelijk op etiket, prijs per kilo en prijs per dag. Ik test niet in een lab.</p><p><a href="${site.author.tiktok}" rel="me noopener" target="_blank">TikTok ${esc(site.author.tiktok_handle)}</a></p></div>
${site.footer.map((c) => `<nav aria-label="${esc(c.title)}"><b>${esc(c.title)}</b>${c.links.map((l) => `<a href="${l.url}">${esc(l.label)}</a>`).join('')}</nav>`).join('')}
</div><div class="wrap footer-fine">Prijzen en voorraad uit de productfeeds van de webshops, bijgewerkt op ${nlDate(CHECKED)}. De webshop is altijd leidend. Knoppen naar webshops zijn partnerlinks: koop je iets, dan krijg ik een kleine vergoeding en betaal jij niets extra. Foto’s via Unsplash, productfoto’s van de webshops. Beste-kattenvoer.nl is een website van Bunt Digital.</div></div></footer>
${/data-widget=/.test(main) ? `<script src="/assets/app.js?v=${buildHash}" defer></script>` : ''}
</body>
</html>`;
}

// ---------- bouwstenen ----------
const heroImg = (k, alt, cls = 'hero-photo') => `<figure class="${cls}"><img src="${imgUrl(k, 1100, 1100)}" srcset="${imgUrl(k, 600, 600)} 600w, ${imgUrl(k, 1100, 1100)} 1100w" sizes="(max-width: 860px) 100vw, 46vw" alt="${esc(alt)}" width="1100" height="1100" fetchpriority="high"></figure>`;
const byline = (p) => `<p class="byline">Door <a href="${site.author.url}">Robin</a> · bijgewerkt ${nlDate(p.updated || CHECKED)}</p>`;
const faqHtml = (p) => p.faq && p.faq.length ? `<section class="faq"><h2>Vragen van andere kattenbaasjes</h2>${p.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(subst(f.a))}</p></details>`).join('')}</section>` : '';
const sourcesHtml = (p) => { const ks = [...new Set(['plein_feed', 'bol_api', ...(p.sources || [])])].filter((k) => extSources[k]); return ks.length ? `<section class="sources"><h2>Waar ik dit vandaan heb</h2><ul>${ks.map((k) => `<li><a href="${extSources[k].url}"${extSources[k].url.startsWith('http') ? ' rel="noopener" target="_blank"' : ''}>${esc(extSources[k].title.replace('{datum}', nlDate(CHECKED)))}</a></li>`).join('')}</ul></section>` : ''; };
const related = (p) => p.related && p.related.length ? `<section class="related"><h2>Lees ook</h2><ul>${p.related.map((u) => { const r = pages.find((x) => x.slug === u); return r ? `<li><a href="${u}">${esc(r.breadcrumb || r.h1 || r.title)}</a></li>` : ''; }).join('')}</ul></section>` : '';

function pageHead(p, opts = {}) {
  return `<section class="phead${opts.dark ? ' is-dark' : ''}"><div class="wrap phead-in">
<div class="phead-text"><!--crumbs--><h1>${esc(p.h1 || p.title)}</h1>${p.lead ? `<p class="lead">${esc(p.lead)}</p>` : ''}${p.template !== 'page' && p.template !== 'contact' ? byline(p) : ''}${opts.extra || ''}</div>
${p.image ? heroImg(p.image, p.image_alt || p.h1) : ''}</div>${wave('wave-down', 'var(--creme)')}</section>`;
}

// extra analyse per merk, volledig uit de etiketdata (voor alle merkpagina's)
function brandAnalysis(b) {
  const re = new RegExp(b.match || b.name, 'i');
  const xs = ALL.filter((p) => re.test(p.brand));
  const sc = xs.filter(HASPAGE).sort((a, c) => c.score.total - a.score.total);
  if (!sc.length) return '';
  const seed = hsh(b.slug);
  const m = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const vn = (f) => f === 'droog' ? 'droogvoer' : 'natvoer';
  const out = [];
  if (!b.auto) {
    out.push(`<h2>${esc(b.name)} kattenvoer in cijfers</h2>`);
    for (const f of ['droog', 'nat']) {
      const a = sc.filter((p) => p.form === f); if (!a.length) continue;
      const pd = m(a.map((p) => p.nut.pDM)), kh = m(a.map((p) => p.nut.nfeDM)), pp = m(a.map((p) => p.ppd)), hi = a.filter((p) => p.nut.pDM >= SC[f].pDM).length;
      out.push(`<p>Van ${a.length} soorten ${esc(b.name)} ${vn(f)} ken ik het etiket. Gemiddeld zit er <b>${pct(pd)} eiwit</b> in de droge stof, tegen ${pct(SC[f].pDM)} voor al het ${vn(f)} in mijn vergelijking. ${hi} van de ${a.length} zitten op of boven dat midden. Aan koolhydraten reken ik gemiddeld ${pct(kh)} uit (midden: ${pct(SC[f].nfe)}). Voor een kat van 4 kilo kost het je gemiddeld ${eur(pp)} per dag, terwijl het midden op ${eur(SC[f].ppd)} ligt. ${pd >= SC[f].pDM + 3 && pp <= SC[f].ppd ? 'Meer eiwit voor minder geld dan gemiddeld: daar word ik blij van.' : pd >= SC[f].pDM + 3 ? 'Je krijgt meer eiwit, maar je betaalt er ook meer voor.' : pd <= SC[f].pDM - 3 ? 'Het eiwit blijft achter bij de rest van de markt. Daar zou ik bij dit merk het meest op letten.' : 'Qua eiwit is het een middenmoter.'}</p>`);
    }
  }
  const top = sc.slice(0, 3);
  out.push(`<h2>Mijn favorieten</h2><p>Als een vriend me vraagt welk ${esc(b.name)}-voer hij moet pakken, noem ik deze ${top.length === 1 ? 'ene' : top.length}. Ik kijk daarbij naar mijn score, dus naar eiwit, koolhydraten, etiket en wat je per gram eiwit betaalt.</p>${top.map((p) => uitleg(p, seed)).join('')}`);
  const bottom = sc.length >= 6 ? sc.slice(-2).reverse() : [];
  if (bottom.length) out.push(`<h2>Wat ik zou laten staan</h2><p>Niet alles van een merk is even goed. Dit zijn de twee producten van ${esc(b.name)} die bij mij het laagst scoren. Ze zijn compleet, je kat komt er niets tekort op, maar binnen hetzelfde merk kun je beter kiezen.</p>${bottom.map((p) => uitleg(p, seed + 7)).join('')}`);
  // levensfase en doel
  const seg = [['kitten', (p) => p.stage === 'kitten', 'kittens'], ['senior', (p) => p.stage === 'senior', 'oudere katten'], ['steri', (p) => p.flags.includes('gesteriliseerd'), 'gesteriliseerde katten'], ['gevoelig', (p) => p.flags.includes('gevoelig'), 'katten met een gevoelige maag']]
    .map(([k, fn, l]) => { const a = sc.filter(fn); return a.length ? `voor ${l} ${a.length === 1 ? 'is er één soort' : `zijn er ${a.length}`} (beste: <a href="${purl(a[0])}">${esc(a[0].short)}</a>, ${score(a[0].score.total)})` : null; }).filter(Boolean);
  if (seg.length) out.push(`<h2>Voor kittens, senioren en gesteriliseerde katten</h2><p>Binnen ${esc(b.name)} zie ik verschillende lijnen. Met etiketgegevens: ${seg.join('; ')}. ${sc.some((p) => p.stage === 'kitten') ? 'Geef je een kitten, kies dan echt voor kittenvoer: dat heeft meer energie en meer eiwit voor de groei.' : 'Kittenvoer met etiket heb ik bij dit merk niet gevonden; voor een kitten kun je dan beter bij een ander merk kijken.'} ${sc.some((p) => p.flags.includes('gesteriliseerd')) ? 'Bij voer voor gesteriliseerde katten let ik vooral op de calorieën per 100 gram, want die katten komen makkelijk aan.' : ''}</p>`);
  // etiket
  const lcs = sc.map((p) => labelCheck(p.nut.sam)).filter(Boolean);
  const claims = sc.filter((p) => { const c = nameClaim(p.name); return c && c.min <= 4; }).length;
  const open = sc.filter((p) => !p.nut.sam && OPEN_LABEL.test(p.brand)).length;
  const meat1 = sc.filter((p) => meatFirst(p.nut.sam) === true).length;
  const lab = [];
  if (meat1) lab.push(`Bij ${meat1} van de ${sc.length} etiketten staat een dierlijk ingrediënt op de eerste plek. Zo hoort het bij een vleeseter.`);
  if (lcs.length) { const g = lcs.filter((l) => l.firstGrain && l.firstGrain <= 2).length, pl = lcs.filter((l) => l.plant.length).length; lab.push(`Van ${lcs.length} producten kon ik de hele samenstelling lezen. ${g ? `Bij ${g} daarvan staat een graan bij de eerste twee ingrediënten.` : 'Geen daarvan heeft granen bovenaan.'} ${pl ? `Bij ${pl} zie ik plantaardig eiwit, zoals gluten of soja, hoog op de lijst. Dat telt mee in het eiwitpercentage, maar is voor een kat minder waardevol dan vlees.` : 'Plantaardig eiwit als opvulling zag ik niet hoog op de lijst staan.'}`); }
  if (open) lab.push(`Bij ${open} producten werkt ${esc(b.name)} met een open samenstelling, zoals “vlees en dierlijke bijproducten”. Dat mag, maar je weet dan niet precies welk vlees erin zit. Daarom krijgen die etiketten bij mij een lagere score.`);
  if (claims) lab.push(`${claims} productnamen gebruiken “met …” of “smaak”. Onthoud: “met kip” is volgens de Europese etiketcode minimaal 4% kip, en bij “smaak van” hoeft er nauwelijks iets van in te zitten.`);
  if (!lab.length) lab.push(`De etiketten van ${esc(b.name)} die ik ken, hebben geen opvallende trucs. Dat is op zich al een compliment.`);
  out.push(`<h2>Wat het etiket vertelt</h2><p>${lab.join(' ')}</p>`);
  // vergelijkbare merken
  const mainForm = sc.filter((p) => p.form === 'droog').length >= sc.filter((p) => p.form === 'nat').length ? 'droog' : 'nat';
  const own = sc.filter((p) => p.form === mainForm), ownP = m(own.map((p) => p.ppd));
  const others = brands.filter((x) => x.slug !== b.slug).map((x) => { const r2 = new RegExp(x.match || x.name, 'i'); const a = ALL.filter((p) => HASPAGE(p) && p.form === mainForm && r2.test(p.brand)); return a.length >= 3 ? { x, n: a.length, pd: m(a.map((p) => p.nut.pDM)), pp: m(a.map((p) => p.ppd)) } : null; }).filter(Boolean).sort((a, c) => Math.abs(a.pp - ownP) - Math.abs(c.pp - ownP)).slice(0, 3);
  if (others.length && ownP) out.push(`<h2>Vergeleken met andere merken</h2><p>Hoe doet ${esc(b.name)} ${vn(mainForm)} het tegen merken in dezelfde prijsklasse? Gemiddeld betaal je bij ${esc(b.name)} ${eur(ownP)} per dag voor ${pct(m(own.map((p) => p.nut.pDM)))} eiwit in droge stof. ${others.map((o) => `<a href="/merken/${o.x.slug}/">${esc(o.x.name)}</a> kost gemiddeld ${eur(o.pp)} per dag met ${pct(o.pd)} eiwit`).join('; ')}. ${others.some((o) => o.pd > m(own.map((p) => p.nut.pDM)) + 3 && o.pp <= ownP * 1.05) ? 'Er is dus voer in dezelfde prijsklasse met duidelijk meer eiwit. Dat is het overwegen waard.' : `Binnen deze prijsklasse doet ${esc(b.name)} het qua eiwit niet slechter dan de rest.`}</p>`);
  {
    const vs = xs.flatMap((p) => p.variants.filter((v) => v.in_stock !== false && v.grams && v.ppk && FOOD.includes(p)).map((v) => ({ v, p })));
    const shops = [...new Set(vs.map((o) => o.v.shop))];
    const snacks = xs.filter((p) => p.form === 'snack').length, aanv = xs.filter((p) => p.flags.includes('aanvullend')).length;
    if (vs.length) {
      const small = vs.reduce((a, o) => (o.v.grams < a.v.grams ? o : a)), big = vs.reduce((a, o) => (o.v.grams > a.v.grams ? o : a)), cheap = vs.reduce((a, o) => (o.v.ppk < a.v.ppk ? o : a));
      out.push(`<h2>Waar koop je het, en in welke verpakking?</h2><p>In mijn vergelijking zie ik ${esc(b.name)} bij ${shops.join(' en ')}, in ${vs.length} verschillende verpakkingen. De kleinste is ${packLabel(small.v)} (${esc(small.p.short)}) voor ${eur(small.v.price)}, de grootste ${packLabel(big.v)} voor ${eur(big.v.price)}. Per kilo is ${esc(cheap.p.short)} in ${packLabel(cheap.v)} het voordeligst: ${eur(cheap.v.ppk)} per kilo. Wil je het merk eerst proberen, begin dan klein; weet je dat je kat het lust, dan bespaar je met de grote verpakking.${snacks ? ` Daarnaast heeft ${esc(b.name)} ${snacks} snacks in de feed. Leuk als beloning, maar houd ze onder de tien procent van wat je kat per dag eet.` : ''}${aanv ? ` Let op: ${aanv} producten zijn aanvullend voer. Die lijken op een maaltijd, maar zijn het niet.` : ''}</p>`);
    }
  }
  out.push(`<h2>Mijn advies bij het kopen</h2><p>Kies binnen het merk op het etiket, niet op de verpakking: dezelfde naam kan van een 4 tot een 8 scoren. Koop droogvoer in een zak die je in zes tot acht weken leeg hebt, en houd de aanbiedingen in de gaten als je toch al bij dit merk blijft. Twijfel je tussen twee soorten, kies dan die met de meeste eiwit per euro; die staat bij elke productanalyse. En als je overstapt van een ander merk: doe het rustig, verdeeld over een week, zoals ik uitleg in <a href="/kennisbank/kat-overzetten-op-ander-voer/">overstappen op ander voer</a>.</p>`);
  return out.join('');
}
function brandPage(p) {
  const b = brandBySlug[p.brand];
  const xs = ALL.filter((x) => new RegExp(b.match || b.name, 'i').test(x.brand));
  const food = xs.filter((x) => FOOD.includes(x));
  const byForm = (f) => food.filter((x) => x.form === f).sort((a, c) => a.ppd - c.ppd);
  const avg = (f) => { const a = byForm(f).map((x) => x.ppd); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
  const verdict = `<section class="verdict"><div class="verdict-score"><span class="ring-big">${score(b.score)}</span><small>${b.auto ? 'gem. productscore' : 'mijn oordeel'}</small></div><div><p class="verdict-line">${esc(b.verdict)}</p>
<div class="procon"><div><p class="procon-h">Wat ik goed vind</p><ul>${b.pros.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div><div><p class="procon-h">Waar je op moet letten</p><ul>${b.cons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div></div></section>`;
  const facts = `<dl class="facts"><div><dt>Producten in de vergelijking</dt><dd>${xs.length}</dd></div><div><dt>Droogvoer per dag</dt><dd>${avg('droog') ? 'gem. ' + eur(avg('droog')) : 'niet in de feed'}</dd></div><div><dt>Natvoer per dag</dt><dd>${avg('nat') ? 'gem. ' + eur(avg('nat')) : 'niet in de feed'}</dd></div><div><dt>Prijsklasse</dt><dd>${esc(b.price_class)}</dd></div>${b.owner && b.owner !== '–' ? `<div><dt>Eigenaar</dt><dd>${esc(b.owner)}</dd></div>` : ''}</dl>`;
  const lists = ['droog', 'nat'].filter((f) => byForm(f).length).map((f) => `<h2>${b.name} ${f === 'droog' ? 'droogvoer' : 'natvoer'}: de voordeligste keuzes</h2><p>Gesorteerd op prijs per dag. Bij ${b.name} zie ik ${byForm(f).length} ${f === 'droog' ? 'droogvoeders' : 'natvoeders'} in de feed van ${byForm(f)[0].best.shop}${byForm(f).length > 6 ? ', hieronder de zes voordeligste' : ''}.</p>${grid(byForm(f).slice(0, 6))}`).join('');
  const snacks = xs.filter((x) => x.form === 'snack' && x.inStock);
  const scored = xs.filter(HASPAGE).sort((a, c) => c.score.total - a.score.total);
  const comp = xs.filter((x) => x.flags.includes('aanvullend'));
  return `${pageHead(p)}<div class="wrap content"><div class="prose">${verdict}${facts}${md(p.body, p)}${brandAnalysis(b)}${lists}${scored.length ? `<h2>Alle producten met score</h2><p>Van ${scored.length} producten van ${b.name} ken ik het etiket. Klik door voor de volledige analyse per product.</p>${scoreTable(scored)}` : ''}${comp.length ? `<h2>Let op: aanvullend voer</h2><p>${comp.length} producten van ${b.name} noemen zichzelf aanvullend voer. Dat is lekker als extraatje, maar niet genoeg als hoofdmaaltijd. Kijk op het etiket of er “compleet” of “volledig diervoeder” staat.</p>` : ''}${snacks.length ? `<p>Daarnaast heeft ${b.name} ${snacks.length} snacks in de feed. Die vind je bij <a href="/kattensnoepjes/">kattensnoepjes</a>.</p>` : ''}${faqHtml(p)}${sourcesHtml(p)}<section class="related"><h2>Lees ook</h2><ul><li><a href="/merken/">Alle kattenvoermerken op een rij</a></li><li><a href="/beste-kattenvoer/">Het beste kattenvoer van ${vars.jaar}</a></li><li><a href="/goedkoop-kattenvoer/">Goedkoop kattenvoer dat wel deugt</a></li><li><a href="/kennisbank/kattenvoer-etiket-lezen/">Zo lees je een etiket</a></li></ul></section></div></div>`;
}

function homePage(p) {
  const hero = `<section class="hero"><figure class="hero-full"><svg class="hero-curve" viewBox="0 0 100 800" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0h70C24 150 92 330 50 500 24 610 64 720 40 800H0z" fill="currentColor"/></svg><img src="${imgUrl(p.image, 1200, 1300)}" srcset="${imgUrl(p.image, 700, 760)} 700w, ${imgUrl(p.image, 1200, 1300)} 1200w" sizes="(max-width: 900px) 100vw, 48vw" alt="${esc(p.image_alt)}" width="1200" height="1300" fetchpriority="high"></figure><div class="wrap hero-in"><div class="hero-text">
<h1>${esc(p.h1)}</h1><p class="lead">${esc(p.lead)}</p>
<p class="hero-cta"><a class="btn btn-lila" href="/kattenvoer-vergelijken/">Vergelijk ${vars.aantal_voer} soorten voer</a><a class="btn btn-ghost" href="/goedkoop-kattenvoer/">Ik heb een krap budget</a></p></div></div>
${wave('wave-down', 'var(--creme)')}</section>`;
  return `${hero}<section class="statband"><div class="wrap stats"><p><b>${vars.aantal}</b><span>kattenproducten vergeleken</span></p><p><b>${vars.droog_mid_dag}</b><span>per dag voor gemiddeld droogvoer</span></p><p><b>${vars.nat_mid_dag}</b><span>per dag voor gemiddeld natvoer</span></p></div></section><div class="wrap content"><div class="prose prose-home">${md(p.body, p)}${faqHtml(p)}${sourcesHtml(p)}</div></div>`;
}

function vergelijkerPage(p) {
  const VGL = FOOD.filter((x) => !x.flags.includes('aanvullend') && !x.flags.includes('dieet'));
  const data = VGL.map((x) => [x.id, x.brand, x.name, x.form, x.stage, x.flags.join(' '), +x.ppd.toFixed(3), +x.ppk.toFixed(2), x.best.price, packLabel(x.best), x.image, affUrl(x.best, x), x.best.shop, budgetClass(x, T) || '', x.score ? x.score.total : null, x.nut ? x.nut.pDM : null, x.p100 ? +x.p100.toFixed(2) : null, HASPAGE(x) ? purl(x) : '']);
  fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(DIST, `assets/voer-${buildHash}.json`), JSON.stringify(data));
  const first = VGL.filter((x) => x.form === 'droog').sort((a, b) => a.ppd - b.ppd).slice(0, 12);
  const tool = `<div class="vgl" data-widget="vgl" data-src="/assets/voer-${buildHash}.json">
<div class="vgl-top"><label class="vgl-search"><span class="sr">Zoek op merk of smaak</span><input type="search" id="vQ" placeholder="Zoek merk of smaak, bijv. zalm"></label>
<label class="vgl-sort"><span class="sr">Sorteer</span><select id="vS"><option value="ppd">Goedkoopst per dag</option><option value="score">Hoogste score</option><option value="eiwit">Meeste eiwit</option><option value="p100">Goedkoopste eiwit</option><option value="duur">Duurst per dag</option><option value="naam">Naam A-Z</option></select></label></div>
<div class="seg seg-form" role="group" aria-label="Soort voer"><button data-f="form" data-v="droog" aria-pressed="true">Droogvoer</button><button data-f="form" data-v="nat" aria-pressed="false">Natvoer</button><button data-f="form" data-v="" aria-pressed="false">Alles</button></div>
<details class="vgl-filters"><summary><span>Filters</span><b id="vAct" hidden></b></summary><div class="vgl-fbody">
<fieldset><legend>Leeftijd</legend><div class="seg"><button data-f="stage" data-v="" aria-pressed="true">Alle</button><button data-f="stage" data-v="kitten" aria-pressed="false">Kitten</button><button data-f="stage" data-v="adult" aria-pressed="false">Volwassen</button><button data-f="stage" data-v="senior" aria-pressed="false">Senior</button></div></fieldset>
<fieldset><legend>Prijsklasse</legend><div class="seg"><button data-f="price" data-v="" aria-pressed="true">Alle</button><button data-f="price" data-v="budget" aria-pressed="false">Voordelig</button><button data-f="price" data-v="midden" aria-pressed="false">Middenklasse</button><button data-f="price" data-v="premium" aria-pressed="false">Duurder</button></div>
<label class="vgl-range">Maximaal per dag <output id="vMaxO">geen limiet</output><input type="range" id="vMax" min="0.1" max="3" step="0.05" value="3"></label></fieldset>
<fieldset><legend>Kenmerken</legend><div class="toggles">${['graanvrij', 'gesteriliseerd', 'gevoelig', 'gewicht', 'binnenkat', 'bio'].map((f) => `<button data-t="${f}" aria-pressed="false">${flagLabel[f]}</button>`).join('')}<button data-t="_score" aria-pressed="false">Alleen met score</button><button data-t="_eiwit" aria-pressed="false">Veel eiwit (40%+)</button></div></fieldset>
<p class="vgl-actions"><button type="button" class="btn btn-sm btn-ghost-dark" id="vReset">Wis filters</button><button type="button" class="btn btn-sm" id="vClose">Toon resultaten</button></p>
</div></details>
<p class="vgl-count" aria-live="polite"><b id="vN">${VGL.filter((x) => x.form === 'droog').length}</b> resultaten</p>
<div class="pgrid" id="vList">${first.map((x) => card(x, { tag: 'p' })).join('')}</div>
<p class="vgl-more"><button class="btn btn-ghost-dark" id="vMore">Toon meer</button></p></div>`;

  return `${pageHead(p)}<div class="wrap content wide">${tool}<p class="fine">*Prijs per dag: schatting voor een volwassen kat van 4 kilo die alleen dit voer eet. Aanvullend voer en dieetvoer staan niet in deze lijst. Prijzen van ${nlDate(CHECKED)}.</p><div class="prose">${md(p.body, p)}${faqHtml(p)}${sourcesHtml(p)}${related(p)}</div></div>`;
}

function articlePage(p) {
  return `${pageHead(p)}<div class="wrap content"><div class="prose">${top10Html(p)}${md(p.body, p)}${faqHtml(p)}${p.template === 'page' || p.template === 'contact' ? '' : sourcesHtml(p)}${related(p)}</div></div>`;
}
function hubPage(p) {
  const kids = pages.filter((x) => x.slug !== p.slug && x.slug.startsWith(p.slug) && x.slug.split('/').length === p.slug.split('/').length + 1 && x.template !== 'review');
  const list = kids.length ? `<div class="hub-list">${kids.map((k) => `<a href="${k.slug}"><b>${esc(k.breadcrumb || k.h1)}</b><span>${esc(k.lead || k.meta_description)}</span></a>`).join('')}</div>` : '';
  return `${pageHead(p)}<div class="wrap content"><div class="prose">${md(p.body, p)}${list}${faqHtml(p)}</div></div>`;
}

const render = (p) => p.template === 'product' ? productPage(p) : p.template === 'home' ? homePage(p) : p.template === 'review' ? brandPage(p) : p.template === 'vergelijker' ? vergelijkerPage(p) : p.template.startsWith('hub') ? hubPage(p) : articlePage(p);

// ---------- bouwen ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
fs.cpSync(path.join(ROOT, 'static'), DIST, { recursive: true });
fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'src/app.js'), path.join(DIST, 'assets/app.js'));
const manifest = [];
for (const p of pages) {
  if (p.status === 'draft') continue;
  const html = layout(p, render(p));
  const file = p.template === 'notfound' ? '404.html' : path.join(p.slug.slice(1), 'index.html');
  fs.mkdirSync(path.join(DIST, path.dirname(file)), { recursive: true });
  fs.writeFileSync(path.join(DIST, file), html);
  manifest.push({ url: p.slug, file, template: p.template, updated: p.updated || CHECKED, primary_keyword: p.primary_keyword || '', synonyms: p.synonyms || [], index: p.index !== false && p.template !== 'notfound', title: p.seo_title, description: p.meta_description, source: p.source });
}
const indexable = manifest.filter((m) => m.index);
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable.map((m) => `<url><loc>${abs(m.url)}</loc><lastmod>${isoDate(m.updated)}</lastmod></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /seo-rapport/\n\n# AI-zoekmachines zijn welkom\nUser-agent: GPTBot\nUser-agent: OAI-SearchBot\nUser-agent: ChatGPT-User\nUser-agent: PerplexityBot\nUser-agent: ClaudeBot\nUser-agent: Claude-SearchBot\nUser-agent: Google-Extended\nAllow: /\nDisallow: /seo-rapport/\n\nSitemap: ${abs('/sitemap.xml')}\n`);
{
  const clean = (b) => subst(String(b || '')).replace(/\[\[[^\]]*\]\]/g, '').replace(/\]\(\//g, `](${abs('/')}`).replace(/\n{3,}/g, '\n\n').trim();
  const content = pages.filter((x) => x.index !== false && x.template !== 'notfound' && x.template !== 'product' && x.body);
  const full = content.map((x) => `# ${x.h1 || x.title}\n\nURL: ${abs(x.slug)}\nBijgewerkt: ${isoDate(x.updated || CHECKED)}\n\n${x.lead ? subst(x.lead) + '\n\n' : ''}${clean(x.body)}${x.faq && x.faq.length ? '\n\n## Veelgestelde vragen\n\n' + x.faq.map((f) => `**${f.q}**\n${subst(f.a)}`).join('\n\n') : ''}`).join('\n\n---\n\n');
  fs.writeFileSync(path.join(DIST, 'llms-full.txt'), `# Beste-kattenvoer.nl – volledige tekst\n\n${full}\n`);
}
fs.writeFileSync(path.join(DIST, 'llms.txt'), `# Beste-kattenvoer.nl\n\n> Onafhankelijke vergelijking van kattenvoer in Nederland op prijs per kilo en prijs per dag, met een kritische blik op het etiket. Gemaakt door Robin, baasje van Mila en Nala. Elk voer is omgerekend naar eiwit in droge stof, koolhydraten en prijs per 100 gram eiwit.\n\n- [Volledige tekst van alle gidsen](${abs('/llms-full.txt')})\n- [Sitemap](${abs('/sitemap.xml')})\n\n## Gidsen en merken\n\n${indexable.filter((m) => m.template !== 'product').map((m) => `- [${m.title}](${abs(m.url)}): ${m.description}`).join('\n')}\n\n## Productanalyses\n\nAlle voer met score staat op ${abs('/kattenvoer/')}. ${indexable.filter((m) => m.template === 'product').length} producten hebben ook een eigen notitie van Robin.\n`);
fs.writeFileSync(path.join(DIST, 'build-manifest.json'), JSON.stringify({ built: new Date().toISOString(), pages: manifest }, null, 1));
console.log(`✓ ${manifest.length} pagina's, ${ALL.length} producten (${FOOD.length} voer), feed ${CHECKED}`);

// ontwikkelhulp: PREVIEW=bestand toont mini-lijsten zonder HTML
if (process.env.PREVIEW) {
  for (const line of fs.readFileSync(process.env.PREVIEW, 'utf8').split('\n').filter((l) => l.trim())) {
    if (line.startsWith('#')) { console.log('\n' + line); continue; }
    console.log('> ' + line + '\n' + miniList(line).replace(/<\/li>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/ +/g, ' ').trim());
  }
}
