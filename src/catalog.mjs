// Zet de ruwe feeds (data/feed/*.json) om in een nette catalogus:
// gewicht, prijs per kilo, vorm (nat/droog/vers/snack), levensfase, kenmerken
// en een geschatte prijs per dag. Varianten (los/6x/12x) worden gegroepeerd.
import fs from 'node:fs';
import { parseNutrition, scoreProduct, KCAL_DAY } from './nutrition.mjs';

const read = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);

// Gemiddeld voedingsadvies voor een volwassen kat van 4 kg (hele dag één soort voer).
// Bron: richtlijnen op verpakkingen (FEDIAF-gebaseerd). Altijd een schatting.
export const GRAMS_PER_DAY = { droog: 52, nat: 240, vers: 150 }; // mediaan uit onze eigen etiketdata (NRC 2006, 200 kcal), nov 2026
export const REF_CAT_KG = 4;
// Schaal voor andere gewichten: energiebehoefte ~ gewicht^0,67 (FEDIAF)
export const gramsFor = (form, kg) => GRAMS_PER_DAY[form] ? GRAMS_PER_DAY[form] * Math.pow(kg / REF_CAT_KG, 0.67) : null;

const num = (s) => Number(String(s).replace(',', '.'));
const toG = (v, u) => (/kg/i.test(u) ? v * 1000 : v);

export function parseWeight(title, size = '') {
  let t = String(title);
  let mult = 1;
  const lead = t.match(/^(\d+)\s*x\s+/i);
  if (lead) { mult = num(lead[1]); t = t.slice(lead[0].length); }
  const src = t + ' ' + size;
  // combipakketten (bijv. '3,5 kg + 12 x 85 g', droog plus nat): een prijs per kilo zegt dan niets
  if (/\d\s*(kg|gr|gram|g)\b[^+]*\+\s*\d+\s*(x|stuks|blik|zak)/i.test(t)) return { grams: null, units: mult, unitG: null, combo: true };
  // drievoudig: '4 x 12x85 g' of '4x12x85g'
  const triple = src.match(/(\d+)\s*x\s*(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(kg|gr|gram|g)\b/i);
  if (triple) { const u = num(triple[1]) * num(triple[2]); return { grams: mult * u * toG(num(triple[3]), triple[4]), units: mult * u, unitG: toG(num(triple[3]), triple[4]) }; }
  const inner = src.match(/(\d+)\s*(?:blikken|blikjes|zakjes|pouches|stuks|st\.?)?\s*x\s*(\d+(?:[.,]\d+)?)\s*(kg|gr|gram|g)\b/i);
  if (inner) {
    // buitenste aantal midden in de titel: 'Tender Cuts - 4 x Kip 6x85 g' = 4 doosjes van 6 × 85 g
    const before = src.slice(0, inner.index);
    const outer = mult === 1 ? before.match(/\b(\d{1,2})\s*x\s+(?=[A-Za-zÀ-ÿ])/i) : null;
    const m2 = outer ? num(outer[1]) : 1;
    return { grams: mult * m2 * num(inner[1]) * toG(num(inner[2]), inner[3]), units: mult * m2 * num(inner[1]), unitG: toG(num(inner[2]), inner[3]) };
  }
  const one = src.match(/(\d+(?:[.,]\d+)?)\s*(kg|gr|gram|g)\b/i);
  if (one) return { grams: mult * toG(num(one[1]), one[2]), units: mult, unitG: toG(num(one[1]), one[2]) };
  return { grams: null, units: mult, unitG: null };
}

export const sizeless = (t) => String(t).toLowerCase()
  .replace(/\(?\b\d+\s*x\s*\d+(?:[.,]\d+)?\s*(?:kg|gr|gram|g|ml)\b\)?/g, ' ')
  .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|gr|gram|g|ml)\b/g, ' ')
  .replace(/\b\d+\s*(?:stuks|st\.?|pack|blikken|zakjes)\b/g, ' ')
  .replace(/\b(?:zak|doos|bonusbag|bonus bag|multipack|voordeelverpakking|navulling)\b/g, ' ')
  .replace(/[-–|,()+]/g, ' ').replace(/\s+/g, ' ').trim();
const baseTitle = (t) => String(t).replace(/^\d+\s*x\s+/i, '').replace(/\s+/g, ' ').trim();
const has = (re, s) => re.test(s);

export function classify(p) {
  const s = `${p.title} ${p.desc || ''}`;
  const t = p.title;
  let form;
  if (p.type === 'snack' || has(/kattensnack|snack|churu|treat|puree|broth|snoep|dreamies|stick|rolls/i, t)) form = 'snack';
  else if (has(/melk|milk/i, t)) form = 'melk';
  else if (has(/supplement|tablet|pasta|paste|kruiden|vitamine|trainer|lactol|nutribound|easypill|choline|\bpuur\b|pil\b|gras\b/i, t)) form = 'overig';
  else if (p.type === 'droog' && !has(/brok|droog|kibble|crunch|krokant/i, t) && (has(/\bsaus\b|gelei|jelly|gravy|pouch|natte voeding|natvoer|pat[eé]|mousse|\bblik/i, t) || /\d+\s*x\s*([1-9]\d|[1-3]\d\d)\s*(g|gr|gram)\b/i.test(t))) form = 'nat';
  else if ((p.type === 'nat' || p.type === 'droog') && !has(/supplement|tablet|paste|pasta/i, t)) form = p.type;
  else if (has(/supplement|tablet|pasta|paste|kruiden|vitamine|trainer|lactol|nutribound|easypill|choline|\\bpuur\\b|pil\\b|gras\\b/i, t)) form = 'overig';
  else if (has(/vers vlees|diepvries|bevroren|kvv/i, t) && !has(/droog|brok/i, t)) form = 'vers';
  else if (has(/droog|brok|kibble|crunch|krokant/i, t)) form = 'droog';
  else if (has(/\bnat\b|natvoer|pouch|blik|saus|gelei|jelly|pat[eé]|mousse|filet|chunks|soep|terrine|maaltijdzak|bouillon|gravy|in kip|stukjes/i, t)) form = 'nat';
  else if (p.unitG && p.unitG >= 700) form = 'droog';
  else if (p.unitG && p.unitG <= 450) form = 'nat';
  else form = has(/droog|brok/i, s) ? 'droog' : 'nat';
  const stage = has(/kitten|junior|baby|mother/i, t) ? 'kitten' : has(/senior|mature|\b7\s*\+|\b11\s*\+|\b12\s*\+|ageing|ouder/i, t) ? 'senior' : 'adult';
  const flags = [];
  if (has(/graanvrij|grain[- ]?free|zonder granen|graanloos/i, s)) flags.push('graanvrij');
  if (has(/steril|castr|gesteriliseerd/i, t)) flags.push('gesteriliseerd');
  if (has(/light|overweight|weight|gewicht|fit\b|slim/i, t)) flags.push('gewicht');
  if (has(/hypoallergeen|hypoallergenic|sensitive|gevoelig|delicate|digest/i, s)) flags.push('gevoelig');
  if (has(/urinary|urine|blaas/i, t)) flags.push('urinewegen');
  if (has(/hairball|haarbal/i, t)) flags.push('haarballen');
  if (has(/\bbio\b|biologisch|organic/i, t)) flags.push('bio');
  if (has(/indoor|binnenkat/i, t)) flags.push('binnenkat');
  if (!has(/complete?\b|compleet/i, t) && has(/aanvullend(e)? (diervoed|voed|voer)|complementary/i, s)) flags.push('aanvullend');
  if (/almo nature/i.test(p.brand || '') && /\bHFC\b/.test(t) && !/complete|droog|daily/i.test(t)) flags.push('aanvullend');
  // soepjes, bouillons en 'hydra'-zakjes zijn (vrijwel altijd) aanvullend: als hele maaltijd rekenen geeft onzinprijzen per dag
  if (has(/\bsoup\b|\bsoep|kattensoep|hydra ?(life|care)|\bstew\b|stoofpot|bisque|dashi|broth|bouillon/i, t) && !has(/complete?\b|compleet/i, t)) flags.push('aanvullend');
  if (has(/diet|renal(?! plus)|\bnier(dieet|en)?\b|gastro|veterinary|dieetvoer|anallergenic|hypoallergenic|struviet|urinary s\/o|hepatic|metabolic|obesity|diabetes|satiety|vet diet|vetality|trovet|dieetvoeding|vetcare|\bvd\b|\bUR\b urinary|prescription diet|\bs\/o\b/i, t)) flags.push('dieet');
  return { form, stage, flags: [...new Set(flags)] };
}

export function loadCatalog(root) {
  const plein = read(`${root}/data/feed/plein-kat.json`);
  const bol = read(`${root}/data/feed/bol-kat.json`);
  const specs = read(`${root}/data/feed/bol-specs.json`) || {};
  const raw = [...((plein && plein.products) || []), ...((bol && bol.products) || []).map((b) => ({ ...b, brand: b.brand || guessBrand(b.title) }))];
  // merknamen gelijktrekken (MAC's / MAC’s / Mac’s, TROVET / Trovet, PURINA®)
  const bkey = (b) => String(b || '').replace(/[®™]/g, '').replace(/[’`´]/g, "'").trim().toLowerCase();
  const BFIX = { purina: 'Purina', trovet: 'Trovet', virbac: 'Virbac', vitalstyle: 'Vitalstyle', carocroc: 'CaroCroc', "mac's": "MAC's", iams: 'IAMS', "hill's": "Hill's", 'hill s': "Hill's" };
  const bcount = {};
  for (const r of raw) { const k = bkey(r.brand); bcount[k] ??= {}; bcount[k][r.brand] = (bcount[k][r.brand] || 0) + 1; }
  for (const r of raw) { const k = bkey(r.brand); r.brand = BFIX[k] || Object.entries(bcount[k]).sort((a, b) => b[1] - a[1])[0][0]; }
  const items = [];
  for (const r of raw) {
    if (!r.price || r.price <= 0) continue;
    const w = parseWeight(r.title, r.size);
    const it = { ...r, ...w, base: baseTitle(r.title) };
    Object.assign(it, classify(it));
    it.ppk = it.grams ? r.price / (it.grams / 1000) : null; // prijs per kilo
    if (it.ppk && (it.ppk > 70 || it.ppk < 0.8)) it.ppk = null; // onwaarschijnlijk: gewicht verkeerd gelezen
    if (/\bhond(en)?\b|\bdog\b|puppy/i.test(r.title)) continue;
    it.nut = (it.form === 'droog' || it.form === 'nat') && it.ean && specs[it.ean] ? parseNutrition(specs[it.ean], it.form) : null;
    if (it.nut && it.nut.form !== it.form) it.form = it.nut.form;
    const g = it.nut ? (KCAL_DAY / it.nut.kcal100) * 100 : GRAMS_PER_DAY[it.form];
    if (it.nut) it.gpd = Math.round(g);
    it.ppd = it.ppk && g ? (it.ppk * g) / 1000 : null; // prijs per dag (kat van 4 kg)
    it.brandSlug = slug(it.brand || 'overig');
    items.push(it);
  }
  // groepeer varianten van hetzelfde product (los, 6x, 12x) per winkel en product
  // groepeer op merk + naam, en voeg groepen samen die een EAN delen (zelfde product bij Plein en bol)
  const groups = new Map();
  const byEan = new Map();
  for (const it of items) {
    let key = it.ean && byEan.get(it.ean);
    if (!key) key = (it.brand + '|' + sizeless(it.base)).toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
    if (it.ean && !byEan.has(it.ean)) byEan.set(it.ean, key);
  }
  const products = [];
  for (const [key, vs] of groups) {
    vs.sort((a, b) => (a.ppk ?? 1e9) - (b.ppk ?? 1e9) || a.price - b.price);
    const best = vs.find((v) => v.in_stock !== false) || vs[0];
    const single = [...vs].sort((a, b) => a.price - b.price)[0];
    const nv = vs.find((v) => v.nut);
    const bolv = vs.filter((v) => v.shop === 'bol.com');
    products.push({
      nut: nv ? nv.nut : null, gpd: best.gpd || (nv && nv.gpd) || null,
      rating: bolv.length ? Math.max(...bolv.map((v) => v.rating || 0)) || null : null,
      bolRank: bolv.length ? Math.min(...bolv.map((v) => v.rank || 9999)) : null,
      key, id: slug(best.base).slice(0, 70) + '-' + hash(key),
      name: best.base, brand: best.brand, brandSlug: best.brandSlug,
      // het etiket weet het beter dan de titel: droog vocht <14% is brokken, ook als de feed 'nat' zegt
      form: nv ? nv.nut.form : best.form, stage: best.stage, flags: best.flags,
      image: best.image, best, single, variants: vs, inStock: vs.some((v) => v.in_stock !== false),
      ppk: best.ppk, ppd: best.ppd, ean: best.ean,
      shops: [...new Set(vs.map((v) => v.shop))],
    });
  }
  // ppd herberekenen met energie van het voer als de beste variant zelf geen etiketdata had
  for (const p of products) {
    // onwaarschijnlijke energie voor compleet voer: etiket waarschijnlijk verkeerd gelezen, niet mee laten rekenen
    // natvoer met meer dan 80% eiwit in droge stof is vrijwel altijd pure vis of vlees in bouillon: aanvullend, geen maaltijd
    if (p.nut && p.form === 'nat' && p.nut.pDM > 80 && !p.flags.includes('aanvullend')) {
      if (/filet|fillet|broth|bouill?on|boullion|\bhfc\b|flakes|in (?:eigen )?nat\b/i.test(p.name)) p.flags = [...p.flags, 'aanvullend'];
      else { p.nutSuspect = true; p.nut = null; } // waarschijnlijk etiket verkeerd uitgelezen: niet meerekenen, niets beweren
    }
    if (p.nut && !p.flags.includes('aanvullend') && !p.flags.includes('dieet') && ((p.form === 'nat' && p.nut.kcal100 < 60) || (p.form === 'droog' && (p.nut.kcal100 < 280 || p.nut.kcal100 > 520)))) { p.nutSuspect = true; p.nut = null; p.ppd = p.ppk ? (p.ppk * GRAMS_PER_DAY[p.form]) / 1000 : null; p.gpd = null; }
    if (p.nut && p.ppk) { p.gpd = Math.round((KCAL_DAY / p.nut.kcal100) * 100); p.ppd = (p.ppk * p.gpd) / 1000; }
    p.p100 = p.nut && p.ppk ? (p.ppk * 10) / p.nut.protein : null; // prijs per 100 gram eiwit
  }
  // score: prijs per 100 g eiwit als percentiel binnen dezelfde soort
  const p100 = {};
  for (const form of ['droog', 'nat']) p100[form] = products.filter((p) => p.form === form && p.p100 && !p.flags.includes('aanvullend')).map((p) => p.p100).sort((a, b) => a - b);
  const rank = (form, v) => { const a = p100[form]; if (!a.length) return 0.5; let i = 0; while (i < a.length && a[i] < v) i++; return i / a.length; };
  for (const p of products) p.score = p.nut && !p.flags.includes('aanvullend') ? scoreProduct(p, { p100, rank }) : null;
  // volledige data: echte samenstelling én alle analytische bestanddelen van het etiket, vocht niet geschat.
  // Alleen dan kan een productpagina de kernvraag 'wat zit erin en wat kost het' echt beantwoorden.
  for (const p of products) p.complete = !!(p.nut && p.nut.sam && !p.nut.moistureEstimated && !p.nut.estimatedRest && p.nut.fiber != null && p.ppd);
  return { products, fetched: (plein && plein.fetched) || (bol && bol.fetched) || null, rawCount: raw.length };
}

const KNOWN = ['Edgard & Cooper', "Lily's Kitchen", 'Almo Nature', 'Purina ONE', 'Pro Plan', 'Royal Canin', 'Wellness Core', 'Perfect Fit', 'Hill\'s', 'Felix', 'Sheba', 'Whiskas', 'Gourmet', 'IAMS', 'Yarrah', 'Smolke', 'Renske', 'Schesir', 'Prins', 'Voskes', 'Inaba', 'GimCat', 'Acana', 'Orijen', 'Catessy', 'Kitekat', 'Animonda', 'Applaws', 'Brit', 'Dreamies', 'Vitakraft'];
const guessBrand = (t) => KNOWN.find((b) => new RegExp('\\b' + b.replace(/[.*+?^${}()|[\]\\']/g, '.') + '\\b', 'i').test(t)) || String(t).split(' ')[0];
export const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'en').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(36).slice(0, 5); };

// percentielen van prijs per kilo per vorm, voor de budgetindeling
export function tiers(products) {
  const out = {};
  for (const form of ['droog', 'nat', 'vers']) {
    const xs = products.filter((p) => p.form === form && p.ppk && !p.flags.includes('aanvullend') && !p.flags.includes('dieet') && p.inStock).map((p) => p.ppk).sort((a, b) => a - b);
    const q = (f) => xs[Math.min(xs.length - 1, Math.floor(f * xs.length))];
    out[form] = { n: xs.length, p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9) };
  }
  return out;
}
export const budgetClass = (p, T) => {
  const t = T[p.form]; if (!t || !p.ppk) return null;
  return p.ppk <= t.p25 ? 'budget' : p.ppk <= t.p75 ? 'midden' : 'premium';
};
