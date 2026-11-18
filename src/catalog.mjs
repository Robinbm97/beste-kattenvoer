// Zet de ruwe feeds (data/feed/*.json) om in een nette catalogus:
// gewicht, prijs per kilo, vorm (nat/droog/vers/snack), levensfase, kenmerken
// en een geschatte prijs per dag. Varianten (los/6x/12x) worden gegroepeerd.
import fs from 'node:fs';

const read = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);

// Gemiddeld voedingsadvies voor een volwassen kat van 4 kg (hele dag één soort voer).
// Bron: richtlijnen op verpakkingen (FEDIAF-gebaseerd). Altijd een schatting.
export const GRAMS_PER_DAY = { droog: 55, nat: 240, vers: 150 };
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
  const inner = src.match(/(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(kg|gr|gram|g)\b/i);
  if (inner) return { grams: mult * num(inner[1]) * toG(num(inner[2]), inner[3]), units: mult * num(inner[1]), unitG: toG(num(inner[2]), inner[3]) };
  const one = src.match(/(\d+(?:[.,]\d+)?)\s*(kg|gr|gram|g)\b/i);
  if (one) return { grams: mult * toG(num(one[1]), one[2]), units: mult, unitG: toG(num(one[1]), one[2]) };
  return { grams: null, units: mult, unitG: null };
}

const baseTitle = (t) => String(t).replace(/^\d+\s*x\s+/i, '').replace(/\s+/g, ' ').trim();
const has = (re, s) => re.test(s);

export function classify(p) {
  const s = `${p.title} ${p.desc || ''}`;
  const t = p.title;
  let form;
  if (p.type === 'snack' || has(/kattensnack|snack|churu|treat|puree|broth|snoep|dreamies|stick|rolls/i, t)) form = 'snack';
  else if (has(/melk|milk/i, t)) form = 'melk';
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
  if (has(/diet|renal|nier|gastro|veterinary|dieetvoer/i, t)) flags.push('dieet');
  return { form, stage, flags: [...new Set(flags)] };
}

export function loadCatalog(root) {
  const plein = read(`${root}/data/feed/plein-kat.json`);
  const bol = read(`${root}/data/feed/bol-kat.json`);
  const raw = [...((plein && plein.products) || []), ...((bol && bol.products) || []).map((b) => ({ ...b, brand: b.brand || guessBrand(b.title) }))];
  const items = [];
  for (const r of raw) {
    if (!r.price || r.price <= 0) continue;
    const w = parseWeight(r.title, r.size);
    const it = { ...r, ...w, base: baseTitle(r.title) };
    Object.assign(it, classify(it));
    it.ppk = it.grams ? r.price / (it.grams / 1000) : null; // prijs per kilo
    const g = GRAMS_PER_DAY[it.form];
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
    if (!key) key = (it.brand + '|' + it.base).toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
    if (it.ean && !byEan.has(it.ean)) byEan.set(it.ean, key);
  }
  const products = [];
  for (const [key, vs] of groups) {
    vs.sort((a, b) => (a.ppk ?? 1e9) - (b.ppk ?? 1e9) || a.price - b.price);
    const best = vs.find((v) => v.in_stock !== false) || vs[0];
    const single = [...vs].sort((a, b) => a.price - b.price)[0];
    products.push({
      key, id: slug(best.base).slice(0, 70) + '-' + hash(key),
      name: best.base, brand: best.brand, brandSlug: best.brandSlug,
      form: best.form, stage: best.stage, flags: best.flags,
      image: best.image, best, single, variants: vs, inStock: vs.some((v) => v.in_stock !== false),
      ppk: best.ppk, ppd: best.ppd, ean: best.ean,
      shops: [...new Set(vs.map((v) => v.shop))],
    });
  }
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
