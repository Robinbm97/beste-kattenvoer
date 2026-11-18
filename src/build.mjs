// Statische generator voor beste-kattenvoer.nl
// content/pages/**/*.md + content/brands.yaml + data/feed/*.json → dist/
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { marked } from 'marked';
import { loadCatalog, tiers, budgetClass, gramsFor, GRAMS_PER_DAY, slug } from './catalog.mjs';
import { firstIngredient, meatFirst, vagueMeat, KCAL_DAY, OPEN_LABEL, labelCheck, nameClaim, energySplit } from './nutrition.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');
const readYaml = (f) => yaml.load(fs.readFileSync(path.join(ROOT, 'content', f), 'utf8'));
const site = readYaml('site.yaml');
const brands = readYaml('brands.yaml');
const images = readYaml('images.yaml');
const extSources = readYaml('sources.yaml');
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
  if (!q.brand && q.permerk !== 'nee') { const seen = new Set(); xs = xs.filter((p) => !seen.has(p.brand) && seen.add(p.brand)); }
  return xs.slice(0, Number(q.n || 6));
}
const parseArgs = (s) => Object.fromEntries([...s.matchAll(/(\w+)=("([^"]*)"|\S+)/g)].map((m) => [m[1], m[3] ?? m[2]]));
const grid = (xs, opts = {}) => xs.length ? `<div class="pgrid">${xs.map((p) => card(p, opts)).join('')}</div><p class="fine">*Eiwit in droge stof, dus zonder het water; zo vergelijk je nat en droog eerlijk. Prijs per dag: schatting voor een volwassen kat van 4 kilo die alleen dit voer eet. Staat de energie op het etiket, dan reken ik met ${KCAL_DAY} kcal per dag; anders met ${GRAMS_PER_DAY.droog} gram droogvoer of ${GRAMS_PER_DAY.nat} gram natvoer. Prijzen van ${nlDate(CHECKED)}, de webshop is leidend.</p>` : '<p class="fine">Op dit moment staat er niets in de feed dat aan deze filters voldoet.</p>';

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
  ['/beste-droogvoer-kat/', 'Droogvoer', 'brokken', 'Kom met brokken kattenvoer'],
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
  e.push(`${esc(kort)} is ${vorm}${st} van ${esc(p.brand)}. Ik heb het etiket gelezen en omgerekend, zodat je het eerlijk kunt vergelijken met ${S.n.toLocaleString('nl-NL')} andere soorten ${vorm} waarvan ik het etiket ken.`);
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
    k.push(`Ik heb uitgerekend waar de calorieën in dit voer vandaan komen: ongeveer <b>${pct(es.p)} uit eiwit, ${pct(es.f)} uit vet en ${pct(es.c)} uit koolhydraten</b>.`);
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
  w.push('Eerlijk is eerlijk: ik heb niet elk voer zelf aan mijn katten gegeven. Deze review gaat over wat op het etiket staat en wat het kost. Of jouw kat het lust, merk je pas als je het probeert; bouw nieuw voer altijd in een week op.');
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
  const head = `<section class="phead"><div class="wrap phead-in"><div class="phead-text"><!--crumbs--><p class="ptype">${formLabel[p.form]}${p.stage !== 'adult' ? ' · ' + stageLabel[p.stage] : ''} · ${esc(p.brand)}</p><h1>${esc(pg.h1)}</h1><p class="lead">${esc(r.verdict)}</p>${byline(pg)}</div><div class="prod-hero"><img src="${esc(p.image)}" alt="${esc(p.name)}" width="400" height="400" fetchpriority="high"><div class="prod-score"><b>${score(sc.total)}</b><span>onze score</span></div></div></div>${wave('wave-down', 'var(--creme)')}</section>`;
  const facts = `<dl class="facts"><div><dt>Eiwit in droge stof</dt><dd>${pct1(n.pDM)}</dd></div><div><dt>Prijs per 100 g eiwit</dt><dd>${p.p100 ? eur(p.p100) : '–'}</dd></div><div><dt>Prijs per dag</dt><dd>${eur(p.ppd)}</dd></div><div><dt>Per maand</dt><dd>${eur0(p.ppd * 30.4)}</dd></div><div><dt>Energie</dt><dd>±${n.kcal100} kcal/100 g</dd></div></dl>`;
  const bars = `<section class="scorecard"><h2>${esc(p.brand)} score: zo komt de ${score(sc.total)} tot stand</h2>${bar('Eiwit (40%)', sc.eiwit, pct1(n.pDM) + ' in droge stof')}${bar('Prijs per eiwit (25%)', sc.prijs, p.p100 ? eur(p.p100) + ' per 100 g eiwit' : '')}${bar('Koolhydraten (20%)', sc.kh, '±' + pct(n.nfeDM) + ' in droge stof')}${bar('Etiket (15%)', sc.etiket, firstIngredient(n.sam) ? 'eerste ingrediënt: ' + esc(firstIngredient(n.sam)) : 'samenstelling niet volledig bekend')}<p class="fine">Hoe ik reken lees je bij <a href="/hoe-wij-scoren/">hoe ik kattenvoer score</a>.</p></section>`;
  const tbl = `<div class="table-wrap"><table class="ttable"><caption>Analytische bestanddelen volgens het etiket</caption><thead><tr><td></td><th scope="col">Op het etiket</th><th scope="col">In droge stof</th></tr></thead><tbody>${[['Ruw eiwit', n.protein], ['Ruw vet', n.fat], ['Ruwe celstof', n.fiber], ['Ruwe as', n.ash]].map(([l, v]) => `<tr><th scope="row">${l}</th><td>${v == null ? 'niet vermeld' : pct1(v)}</td><td>${v == null ? '–' : pct1((v / (100 - n.moisture)) * 100)}</td></tr>`).join('')}<tr><th scope="row">Vocht</th><td>${pct1(n.moisture)}${n.moistureEstimated ? ' (geschat)' : ''}</td><td>–</td></tr><tr><th scope="row">Koolhydraten (berekend)</th><td>–</td><td>±${pct(n.nfeDM)}</td></tr></tbody></table></div>`;
  const sam = n.sam ? `<h2>Samenstelling van ${esc(p.short)}</h2><p class="sam">${esc(n.sam)}</p>` : '';
  const buy = `<h2>${esc(p.brand)} ${p.form === 'nat' ? 'natvoer' : 'droogvoer'} kopen: prijzen</h2><div class="offers">${offers.map((v) => `<div class="offer"><span><b>${esc(v.shop)}</b> · ${packLabel(v) || 'verpakking'}</span><span>${eur(v.price)}${v.ppk ? ` <small>${eur(v.ppk)}/kg</small>` : ''}</span>${cta(p, v, 'Bekijk', 'btn btn-sm')}</div>`).join('')}</div><p class="fine">Prijzen van ${nlDate(CHECKED)}. De webshop is leidend. Knoppen zijn partnerlinks.</p>`;
  const altHtml = alts.length ? `<h2>Beter voor ongeveer hetzelfde geld</h2><p>Deze ${p.form === 'nat' ? 'natvoeders' : 'droogvoeders'} scoren hoger en kosten per dag niet meer dan ${eur(p.ppd * 1.15)}:</p>${grid(alts)}` : '';
  const body = `<div class="prose">${facts}${r.sections.map((x) => `<h2>${x.h}</h2>${x.ps.map((t) => `<p>${t}</p>`).join('')}`).join('')}<section class="verdict"><div class="verdict-score"><span class="ring-big">${score(sc.total)}</span><small>onze score</small></div><div><p class="verdict-line">${esc(r.verdict)}</p><div class="procon"><div><p class="procon-h">Wat ik goed vind</p><ul>${(r.pros.length ? r.pros : ['Compleet voer']).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div><div><p class="procon-h">Waar je op moet letten</p><ul>${(r.cons.length ? r.cons : ['Geen grote minpunten op het etiket']).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div></div></section>${bars}<h2>Hoeveel ${esc(p.short)} geef je per dag?</h2><p>Dit zijn startporties als je kat alleen dit voer eet, gerekend met ±${n.kcal100} kcal per 100 gram. Weeg af, en stuur bij als je kat aankomt of afvalt.</p><div class="table-wrap"><table class="ttable"><caption>Portie, eiwit en kosten per dag naar gewicht</caption><thead><tr><th scope="col">Gewicht kat</th><th scope="col">Gram per dag</th><th scope="col">Eiwit per dag</th><th scope="col">Kosten per dag</th></tr></thead><tbody>${r.portions.map((x) => `<tr><th scope="row">${x.kg} kg</th><td>${x.gr} g</td><td>${x.eiwit} g</td><td>${eur(x.ppd)}</td></tr>`).join('')}</tbody></table></div>${tbl}${sam}${buy}${altHtml}${sourcesHtml(pg)}<section class="related"><h2>Lees ook</h2><ul>${brandFor(p) ? `<li><a href="/merken/${brandFor(p).slug}/">Mijn oordeel over ${esc(p.brand)}</a></li>` : ''}<li><a href="/kattenvoer/">Alle kattenvoer met score</a></li><li><a href="/veel-eiwit-kattenvoer/">Veel eiwit voor weinig geld</a></li><li><a href="/kennisbank/kattenvoer-etiket-lezen/">Zo lees je een etiket</a></li></ul></section></div>`;
  return `${head}<div class="wrap content">${body}</div>`;
}

// ---------- markdown ----------
function md(src, page) {
  src = src.replace(/\[\[lijst ([^\]]+)\]\]/g, (_, a) => { const q = parseArgs(a); return '\n\n' + grid(select(q), { pick: q.label }) + '\n\n'; });
  src = src.replace(/\[\[calc\]\]/g, () => '\n\n' + calc() + '\n\n');
  src = src.replace(/\[\[budgettabel\]\]/g, () => '\n\n' + budgetTable() + '\n\n');
  src = src.replace(/\[\[merken\]\]/g, () => '\n\n' + brandGrid() + '\n\n');
  src = src.replace(/\[\[tegels\]\]/g, () => '\n\n' + tiles() + '\n\n');
  src = src.replace(/\[\[alleproducten\]\]/g, () => '\n\n' + allProducts() + '\n\n');
  src = src.replace(/\[\[scoretabel ([^\]]+)\]\]/g, (_, a) => '\n\n' + scoreTable(select(parseArgs(a))) + '\n\n');
  src = src.replace(/\[\[foto (\w+) "([^"]+)"\]\]/g, (_, k, alt) => '\n\n' + photo(k, alt) + '\n\n');
  src = src.replace(/\[\[band (\w+) "([^"]+)" "([^"]+)"(?: "([^"]+)")?\]\]/g, (_, k, t, txt, link) => '\n\n' + band(k, t, txt, link) + '\n\n');
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
const subst = (t) => String(t).replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
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
  b.seo_title = `${b.name} kattenvoer review: eiwit, prijs en score`.slice(0, 60);
  if (b.seo_title.length < 50) b.seo_title = `${b.name} kattenvoer: eerlijke review met eiwit en prijs`.slice(0, 60);
  const md0 = [
    `Is ${b.name} kattenvoer goed? Ik las ${sc.length} etiketten: eiwit in droge stof, granen, koolhydraten en prijs per dag. Met een eerlijke score per product.`,
    `Is ${b.name} kattenvoer goed? Ik las ${sc.length} etiketten: eiwit in droge stof, granen, koolhydraten en prijs per dag. Met score per product.`,
    `${b.name} kattenvoer: ${sc.length} etiketten gelezen op eiwit in droge stof, granen, koolhydraten en prijs per dag. Eerlijke score per product.`,
    `${b.name} kattenvoer review: ${sc.length} etiketten op eiwit, granen en prijs per dag. Score per product.`,
  ];
  b.meta_description = md0.find((x) => x.length >= 140 && x.length <= 160) || md0.sort((x, y) => Math.abs(150 - x.length) - Math.abs(150 - y.length))[0];
  b.lead = `Ik heb ${sc.length} etiketten van ${b.name} naast de rest van de markt gelegd. Geen merkpraatjes, alleen wat erin zit en wat het kost.`;
  const lines = [];
  lines.push(`## Is ${b.name} kattenvoer goed?`, '');
  lines.push(`In de vergelijking staan ${xs.length} producten van ${b.name}. Van ${sc.length} daarvan ken ik de analytische bestanddelen, en die heb ik omgerekend naar droge stof. Zo vergelijk je eerlijk, ook tussen natvoer en brokken.`, '');
  for (const f of forms) { const s = st[f]; lines.push(`Het ${vn(f)} van ${b.name} (${s.n} soorten met etiket) bevat gemiddeld **${pct(s.pDM)} eiwit** in droge stof. Het midden van alle ${vn(f)} ligt op ${pct(SC[f].pDM)}. Aan koolhydraten reken ik gemiddeld ${pct(s.nfe)} uit, tegen ${pct(SC[f].nfe)} in de hele markt. ${s.pDM >= SC[f].pDM + 3 ? 'Meer eiwit dus, en dat is precies waar een kat iets aan heeft.' : s.pDM <= SC[f].pDM - 3 ? 'Minder eiwit dan gemiddeld. Het verschil wordt opgevuld met koolhydraten, en daar heeft een vleeseter weinig aan.' : 'Netjes in het midden.'}`, ''); }
  if (lcs.length) lines.push(`Bij ${lcs.length} producten kon ik de volledige samenstelling lezen. ${meatTop ? `Bij ${meatTop} daarvan staat een dierlijk ingrediënt op de eerste plek.` : 'Bij geen daarvan staat een benoemd dierlijk ingrediënt op de eerste plek.'} ${grainTop ? `Bij ${grainTop} staat een graan bij de eerste twee ingrediënten. Dat vind ik voor kattenvoer een slecht teken.` : 'Granen bovenaan heb ik niet gezien.'} ${plant ? `En ${plant} keer zie ik plantaardig eiwit, zoals maïsgluten of soja, hoog op het etiket. Dat krikt het eiwitpercentage op zonder dat er meer vlees in zit.` : ''}`, '');
  lines.push(`> ${eiw >= 5 ? `Bij ${b.name} zie ik wat ik graag zie: het eiwit zit boven het gemiddelde.` : eiw <= -5 ? `Bij ${b.name} zou ik verder kijken dan de verpakking. Het eiwit zit onder het midden, en dat is voor een kat het belangrijkste getal.` : `${b.name} is geen merk waar ik enthousiast of boos over word. Kies hier per product, niet op de merknaam.`}`, '');
  lines.push(`## Wat kost ${b.name} kattenvoer per dag?`, '');
  for (const f of forms) { const s = st[f]; lines.push(`Voor een kat van 4 kilo die alleen ${b.name} ${vn(f)} eet, betaal je gemiddeld ${eur(s.ppd)} per dag (${eur0(s.ppd * 30.4)} per maand). Het midden van de markt ligt op ${eur(SC[f].ppd)} per dag.${s.p100 ? ` Per 100 gram eiwit betaal je gemiddeld ${eur(s.p100)}, tegen ${eur(SC[f].p100)} gemiddeld.` : ''}`, ''); }
  lines.push(`## Het beste ${b.name} kattenvoer volgens mijn score`, '');
  lines.push(`De hoogste score binnen ${b.name} haalt [${best.short}](${purl(best)}) met een ${score(best.score.total)}: ${pct1(best.nut.pDM)} eiwit in droge stof en ${eur(best.ppd)} per dag.${cheap && cheap !== best ? ` Wil je het voordeliger, kijk dan naar [${cheap.short}](${purl(cheap)}): ${eur(cheap.ppd)} per dag met een ${score(cheap.score.total)}.` : ''} Hoe ik score, lees je bij [hoe ik kattenvoer beoordeel](/hoe-wij-scoren/).`, '');
  if (dieet > 0.4) lines.push(`Veel van het ${b.name}-assortiment is dieetvoer voor katten met een aandoening. Mijn score kijkt naar eiwit, koolhydraten, etiket en prijs. Of dieetvoer werkt bij jouw kat, bepaal je samen met je dierenarts, niet met mijn score.`, '');
  lines.push(`## Voor wie is ${b.name} kattenvoer?`, '');
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
    seo_title: b.seo_title, meta_description: b.meta_description, h1: b.h1 || `${b.name} kattenvoer: mijn eerlijke oordeel`, lead: b.lead,
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
  let t = `${kw} review: score ${score(pr.score.total)}`;
  if (t.length > 60) t = `${kw.slice(0, 44).trim()}… review`;
  if (usedTitles.has(t)) t = `${kw.slice(0, 40).trim()} ${kind} review (${pr.id.slice(-5)})`;
  usedTitles.add(t);
  const d = `${pr.name}: ${pct1(pr.nut.pDM)} eiwit in droge stof, ${pr.p100 ? eur(pr.p100) + ' per 100 g eiwit en ' : ''}${eur(pr.ppd)} per dag. Onze score: ${score(pr.score.total)}. Kritisch bekeken op etiket en prijs.`;
  pages.push({ title: kw, slug: purl(pr), template: 'product', prod: pr, primary_keyword: kw, seo_title: t, meta_description: d.length > 160 ? d.slice(0, 157).replace(/\s\S*$/, '') + '…' : d, h1: `${kw}: ${kind} review`, breadcrumb: kw.length > 40 ? kw.slice(0, 38) + '…' : kw, updated: CHECKED, published: CHECKED, sources: ['fediaf', 'fediaf_label'], body: '', source: 'data/feed' });
}

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
const author = { '@type': 'Person', name: site.author.name, url: abs(site.author.url) };
function productSchema(b, p) {
  const xs = ALL.filter((x) => new RegExp(b.match || b.name, 'i').test(x.brand) && x.ppk && x.inStock);
  const prices = xs.map((x) => x.best.price);
  return {
    '@type': 'Product', name: `${b.name} kattenvoer`, brand: { '@type': 'Brand', name: b.name }, image: xs[0] ? xs[0].image : imgUrl('kom'), description: b.meta_description,
    ...(prices.length ? { offers: { '@type': 'AggregateOffer', priceCurrency: 'EUR', lowPrice: Math.min(...prices).toFixed(2), highPrice: Math.max(...prices).toFixed(2), offerCount: xs.length } } : {}),
    review: { '@type': 'Review', name: `${b.name} kattenvoer review`, reviewRating: { '@type': 'Rating', ratingValue: b.score, bestRating: 10, worstRating: 1 }, author: { '@type': 'Organization', name: 'Beste-kattenvoer.nl', url: site.url }, publisher: { '@type': 'Organization', name: 'Beste-kattenvoer.nl', url: site.url }, datePublished: isoDate(p.published || CHECKED), reviewBody: b.verdict },
  };
}
function schemaFor(p, bc) {
  const g = [
    { '@type': 'Organization', '@id': site.url + '/#org', name: 'Beste-kattenvoer.nl', url: site.url, logo: abs('/logo.png') },
    { '@type': 'WebSite', '@id': site.url + '/#website', url: site.url, name: 'Beste-kattenvoer.nl', inLanguage: 'nl-NL', publisher: { '@id': site.url + '/#org' } },
  ];
  if (bc.length) g.push({ '@type': 'BreadcrumbList', itemListElement: bc.map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, item: abs(b.url) })) });
  if (['article', 'landing', 'review', 'vergelijker', 'home', 'product'].includes(p.template)) g.push({ '@type': 'Article', headline: p.h1 || p.title, description: p.meta_description, datePublished: isoDate(p.published || CHECKED), dateModified: isoDate(p.updated || CHECKED), author, publisher: { '@id': site.url + '/#org' }, mainEntityOfPage: abs(p.slug), image: p.template === 'product' ? p.prod.image : p.image ? imgUrl(p.image) : abs('/og-default.png'), inLanguage: 'nl-NL' });
  const fb = p.template === 'review' ? brandBySlug[p.brand] : p.featured ? brandBySlug[p.featured] : null;
  if (fb) g.push(productSchema(fb, p));
  if (p.template === 'product') {
    const pr = p.prod; const prices = pr.variants.map((v) => v.price);
    g.push({ '@type': 'Product', name: pr.name, image: pr.image, brand: { '@type': 'Brand', name: pr.brand }, ...(pr.ean ? { gtin13: pr.ean.padStart(13, '0') } : {}), description: p.meta_description,
      offers: { '@type': 'AggregateOffer', priceCurrency: 'EUR', lowPrice: Math.min(...prices).toFixed(2), highPrice: Math.max(...prices).toFixed(2), offerCount: pr.variants.length },
      review: { '@type': 'Review', name: `${pr.name} review`, reviewRating: { '@type': 'Rating', ratingValue: pr.score.total, bestRating: 10, worstRating: 1 }, author: { '@type': 'Organization', name: 'Beste-kattenvoer.nl', url: site.url }, publisher: { '@type': 'Organization', name: 'Beste-kattenvoer.nl', url: site.url }, datePublished: isoDate(CHECKED) } });
  }
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
  return `${pageHead(p)}<div class="wrap content"><div class="prose">${verdict}${facts}${md(p.body, p)}${lists}${scored.length ? `<h2>Alle ${b.name} kattenvoer met onze score</h2><p>Van ${scored.length} producten van ${b.name} ken ik het etiket. Klik door voor de volledige review per product.</p>${scoreTable(scored)}` : ''}${comp.length ? `<h2>Let op bij ${b.name} kattenvoer: aanvullend voer</h2><p>${comp.length} producten van ${b.name} noemen zichzelf aanvullend voer. Dat is lekker als extraatje, maar niet genoeg als hoofdmaaltijd. Kijk op het etiket of er “compleet” of “volledig diervoeder” staat.</p>` : ''}${snacks.length ? `<p>Daarnaast heeft ${b.name} ${snacks.length} snacks in de feed. Die vind je bij <a href="/kattensnoepjes/">kattensnoepjes</a>.</p>` : ''}${faqHtml(p)}${sourcesHtml(p)}<section class="related"><h2>Lees ook</h2><ul><li><a href="/merken/">Alle kattenvoermerken op een rij</a></li><li><a href="/beste-kattenvoer/">Het beste kattenvoer van ${vars.jaar}</a></li><li><a href="/goedkoop-kattenvoer/">Goedkoop kattenvoer dat wel deugt</a></li><li><a href="/kennisbank/kattenvoer-etiket-lezen/">Zo lees je een etiket</a></li></ul></section></div></div>`;
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
  return `${pageHead(p)}<div class="wrap content"><div class="prose">${md(p.body, p)}${faqHtml(p)}${p.template === 'page' || p.template === 'contact' ? '' : sourcesHtml(p)}${related(p)}</div></div>`;
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
  manifest.push({ url: p.slug, file, template: p.template, primary_keyword: p.primary_keyword || '', index: p.index !== false && p.template !== 'notfound', title: p.seo_title, description: p.meta_description, source: p.source });
}
const indexable = manifest.filter((m) => m.index);
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable.map((m) => `<url><loc>${abs(m.url)}</loc><lastmod>${isoDate(CHECKED)}</lastmod></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /seo-rapport/\n\nSitemap: ${abs('/sitemap.xml')}\n`);
fs.writeFileSync(path.join(DIST, 'llms.txt'), `# Beste-kattenvoer.nl\n\n> Onafhankelijke vergelijking van kattenvoer in Nederland op prijs per kilo en prijs per dag, met een kritische blik op het etiket. Gemaakt door Robin, baasje van Mila en Nala.\n\n${indexable.map((m) => `- [${m.title}](${abs(m.url)}): ${m.description}`).join('\n')}\n`);
fs.writeFileSync(path.join(DIST, 'build-manifest.json'), JSON.stringify({ built: new Date().toISOString(), pages: manifest }, null, 1));
console.log(`✓ ${manifest.length} pagina's, ${ALL.length} producten (${FOOD.length} voer), feed ${CHECKED}`);
