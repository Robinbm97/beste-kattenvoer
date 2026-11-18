// Leest analytische bestanddelen van het etiket en berekent eiwit in droge stof,
// koolhydraten (NFE), energie, prijs per 100 gram eiwit en onze score.

const num = (s) => Number(String(s).replace(',', '.'));
const grab = (txt, re) => { const m = txt.match(re); return m ? num(m[m.length - 1]) : null; };

export function parseNutrition(spec, form) {
  if (!spec || !spec.ana) return null;
  const t = ' ' + spec.ana.replace(/\\,/g, ',').replace(/\((?:min|max)\.?\)/gi, ' ').replace(/:\s*:/g, ':').replace(/\((\d+(?:[.,]\d+)?)\s*%\)/g, ': $1%').replace(/(\d)%(?=[A-Za-z])/g, '$1% ').replace(/\s+/g, ' ') + ' ';
  const protein = grab(t, /(?:ruw(?:e)?\s*)?(?:eiwit(?:ten)?|prote[iï]ne?)\s*(?:gehalte)?\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*%?/i);
  const fat = grab(t, /(?:ruw(?:e)?\s*vet(?:ten)?|vetgehalte|vetinhoud|ruwe oli[eë]n en vetten|oli[eë]n en vetten|\bvet(?:ten)?)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*%?/i);
  const fiber = grab(t, /(?:ruwe\s*celstof|celstof|ruwe\s*vezels?|vezels?)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*%?/i);
  const ash = grab(t, /(?:ruwe\s*as|ruwe\s*als|anorganische\s*stof|\bas)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*%?/i);
  let moisture = grab(t, /(?:vocht(?:gehalte)?|water)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*%?/i);
  let moistureEstimated = false;
  const formHint = moisture != null ? (moisture >= 50 ? 'nat' : moisture <= 14 ? 'droog' : null) : null;
  if (formHint && formHint !== form) form = formHint;
  if (moisture == null && spec.vocht) moisture = grab(spec.vocht, /(\d+(?:[.,]\d+)?)/);
  if (form === 'droog' && (moisture == null || moisture < 3 || moisture > 14)) { moisture = 8; moistureEstimated = true; }
  if (form === 'nat' && (moisture == null || moisture < 55)) { moisture = 80; moistureEstimated = true; }
  if (protein == null || protein <= 2 || protein > 75 || moisture == null || moisture >= 95) return null;
  const dm = 100 - moisture;
  const pDM = (protein / dm) * 100;
  if (pDM > 90 || pDM < 10) return null;
  const f = fat ?? (form === 'droog' ? 13 : 4);
  const fi = fiber ?? (form === 'droog' ? 2.5 : 0.5);
  const a = ash ?? (form === 'droog' ? 7.5 : 2.2);
  const nfe = Math.max(0, 100 - protein - f - fi - a - moisture);
  const kcalLabel = grab(t, /energie\w*\s*:?\s*(\d{2,3}(?:[.,]\d+)?)\s*kcal\s*\/\s*100/i);
  const kcalCalc = 3.5 * protein + 8.5 * f + 3.5 * nfe; // aangepaste Atwater (NRC)
  const kcal100 = kcalLabel && kcalLabel > 40 && kcalLabel < 600 ? kcalLabel : kcalCalc;
  return {
    form, protein, fat, fiber, ash, moisture, moistureEstimated, estimatedRest: fat == null || ash == null,
    pDM: +pDM.toFixed(1), fDM: +((f / dm) * 100).toFixed(1), nfeDM: +((nfe / dm) * 100).toFixed(1), kcal100: Math.round(kcal100), kcalFromLabel: !!(kcalLabel && kcalLabel > 40 && kcalLabel < 600),
    sam: cleanSam(spec), doel: spec.doel || '', fabrikant: spec.fabrikant || '',
  };
}

// Energiebehoefte: volwassen gecastreerde binnenkat ≈ 52 × kg^0,75 … we rekenen met 200 kcal voor 4 kg
export const KCAL_DAY = 200;

// samenstelling: alleen als het er echt als een ingrediëntenlijst uitziet
export function cleanSam(spec) {
  let c = [spec.sam, spec.ana].find((x) => x && /^\s*(samenstelling|ingredi[eë]nten)/i.test(x)) || spec.sam || '';
  c = c.replace(/\bbr\s*\/\s*/gi, ' ').replace(/^\s*(samenstelling|ingredi[eë]nten)\s*:?\s*/i, '').replace(/<[^>]+>/g, ' ').trim();
  if ((c.match(/,/g) || []).length < 3) return '';
  c = c.replace(/^[\s.,;:]+/, '');
  if (/(je kat|jouw kat|deze |dragen bij|heerlijk|lekker|weerstaan|kwaliteit|boordevol|waarom|smakelijk)/i.test(c.slice(0, 120))) return '';
  c = c.replace(/,?\s*De ingredi[eë]nten.*$/i, '');
  const cut = c.slice(40).search(/\.\s+(?=[A-Z][a-z]+\s+[a-z])/);
  if (cut >= 0) c = c.slice(0, cut + 41);
  return c.slice(0, 600);
}

// eerste ingrediënt uit de samenstelling
export function firstIngredient(sam) {
  if (!sam) return null;
  const s = sam.replace(/^\W+/, '').split(/[,;(]/)[0].trim();
  return s.length > 2 && s.length < 60 ? s : null;
}
const MEAT = /kip|kalkoen|eend|rund|lam|zalm|tonijn|vis|konijn|wild|hert|varken|gevogelte|haring|forel|kabeljauw|witvis|sardine|makreel|vlees|lever|hart|ei\b|eieren|insect|garnalen|chicken|turkey|salmon|tuna|duck|beef|lamb|fish|poultry|meat/i;
export const meatFirst = (sam) => { const f = firstIngredient(sam); return f ? MEAT.test(f) && !/meel van granen|plantaardig/i.test(f) : null; };
export const OPEN_LABEL = /^(felix|whiskas|gourmet|sheba|kitekat|perfect fit|friskies|purina gourmet|cat chow)/i;
export const vagueMeat = (sam) => /vlees en dierlijke bijproducten|dierlijke bijproducten/i.test(sam || '');

// Score 0–10 met uitleg per onderdeel
export function scoreProduct(p, ctx) {
  const n = p.nut;
  if (!n) return null;
  const clamp = (x) => Math.max(0, Math.min(10, x));
  // eiwit in droge stof: brokken 25% = 0 en 50% = 10, natvoer 30% = 0 en 60% = 10
  const [lo, hi] = p.form === 'nat' ? [30, 60] : [25, 50];
  const sEiwit = clamp(((n.pDM - lo) / (hi - lo)) * 10);
  // koolhydraten in droge stof: 45% = 0, 5% = 10
  const sKh = clamp(((45 - n.nfeDM) / 40) * 10);
  // prijs per 100 gram eiwit, vergeleken met dezelfde soort voer (percentiel: goedkoopst = 10)
  const sPrijs = p.p100 != null && ctx.p100[p.form] ? clamp(10 - ctx.rank(p.form, p.p100) * 10) : 5;
  // etiket: benoemd vlees vooraan, geen vage omschrijving
  const mf = meatFirst(n.sam);
  let sEtiket = 5;
  if (mf === true) sEtiket += 3;
  if (mf === false) sEtiket -= 3;
  if (vagueMeat(n.sam)) sEtiket -= 2;
  if (!n.sam && OPEN_LABEL.test(p.brand || '')) sEtiket -= 3;
  if (p.flags.includes('graanvrij')) sEtiket += 1;
  const lc = labelCheck(n.sam);
  if (lc && lc.plant.length) sEtiket -= 1; // eiwit opgekrikt met plantaardig eiwit
  if (lc && lc.firstGrain && lc.firstGrain <= 2) sEtiket -= 1; // granen bovenaan
  sEtiket = clamp(sEtiket);
  const total = 0.4 * sEiwit + 0.2 * sKh + 0.25 * sPrijs + 0.15 * sEtiket;
  return { total: +Math.max(1, total).toFixed(1), eiwit: +sEiwit.toFixed(1), kh: +sKh.toFixed(1), prijs: +sPrijs.toFixed(1), etiket: +sEtiket.toFixed(1) };
}

// ---------- etiket-check: granen, plantaardig eiwit, zetmeelvervangers en percentages ----------
const GRAIN = /\b(granen|graan|tarwe\w*|ma[iï¨]+s\w*|rijst\w*|gerst|haver\w*|sorghum|rogge|spelt|gierst|brouwersrijst|cereals?|wheat|corn|rice|barley|oats?)\b/i;
const PLANTPROT = /(ma[iï¨]+s|tarwe|rijst)\s*gluten|gluten|soja\w*|erwten?\s*(eiwit|prote[iï]ne)|aardappel\s*(eiwit|prote[iï]ne)|plantaardige?\s*(eiwit|prote[iï]ne)\w*|eiwitextract|plantaardige bijproducten/i;
const STARCH = /aardappel|erwt|linz|kikkererwt|tapioca|cassave|bonen|zetmeel/i;
export function ingredients(sam) {
  if (!sam) return [];
  const out = []; let d = 0, cur = '';
  for (const ch of sam) { if (ch === '(' || ch === '[') d++; if (ch === ')' || ch === ']') d = Math.max(0, d - 1); if ((ch === ',' || ch === ';') && d === 0) { out.push(cur); cur = ''; } else cur += ch; }
  out.push(cur);
  return out.map((x) => x.replace(/\s+/g, ' ').replace(/^[\s.\-*]+|[\s.*]+$/g, '').trim()).filter((x) => x.length > 1 && x.length < 90);
}
const MEATW = /kip|kalkoen|eend|rund|lam\b|lams|zalm|tonijn|vis\b|konijn|wild|hert|varken|gevogelte|haring|forel|kabeljauw|witvis|sardine|makreel|vlees|lever|ansjovis|garnaal|chicken|turkey|salmon|tuna|duck|beef|lamb|fish|poultry|meat/i;
export function labelCheck(sam) {
  const ings = ingredients(sam);
  const real = ings.length >= 4 && ings.slice(0, 6).every((x) => x.replace(/\([^)]*\)/g, '').trim().split(/\s+/).length <= 7);
  if (!real) return null;
  const top = ings.slice(0, 6);
  const grains = top.map((x, i) => ({ x, i })).filter((o) => GRAIN.test(o.x) && !/vrij|zonder/i.test(o.x));
  const plant = top.filter((x) => PLANTPROT.test(x));
  const starch = top.filter((x) => STARCH.test(x) && !GRAIN.test(x));
  const meatPcts = [];
  for (const m of sam.matchAll(/(\d+(?:[.,]\d+)?)\s*%\s*([a-zà-ü][a-zà-ü ]{2,22})|([a-zà-ü][a-zà-ü ]{2,30}?)\s*\*?\s*\(\s*(?:min(?:imaal|\.)?\s*)?(\d+(?:[.,]\d+)?)\s*%/gi)) {
    const v = Number(String(m[1] || m[4]).replace(',', '.')), w = (m[2] || m[3] || '').trim();
    if (MEATW.test(w) && v > 0 && v <= 100 && !/olie|vet|lever/i.test(w)) meatPcts.push({ v, w: w.split(' ').slice(-3).join(' ') });
  }
  const meatTop = top.filter((x) => MEATW.test(x) && !/olie|vet\b|vetten/i.test(x)).length;
  return { ings, top, grains, firstGrain: grains.length ? grains[0].i + 1 : null, plant, starch, meatPcts: meatPcts.slice(0, 4), meatTop };
}
// wat de naam belooft volgens de FEDIAF-etiketcode
export function nameClaim(name) {
  const n = String(name);
  let m;
  if ((m = n.match(/(?:met\s+)?smaak\s+(?:van\s+)?([a-zà-ü]+)|([a-zà-ü]+)\s*(?:smaak|flavou?r)\b/i))) return { kind: 'smaak', min: 0, w: (m[1] || m[2]).toLowerCase() };
  if ((m = n.match(/rijk aan\s+([a-zà-ü]+)|rich in\s+([a-zà-ü]+)/i))) return { kind: 'rijk', min: 14, w: (m[1] || m[2]).toLowerCase() };
  if ((m = n.match(/\b(?:menu|diner|dinner|maaltijd|recept|recipe)\b/i)) && MEATW.test(n)) { const w = (n.match(MEATW) || [''])[0].toLowerCase(); return { kind: 'menu', min: 26, w }; }
  if ((m = n.match(/\bmet\s+(?:veel\s+)?([a-zà-ü]+)|\bwith\s+([a-zà-ü]+)/i)) && MEATW.test(m[1] || m[2] || '')) return { kind: 'met', min: 4, w: (m[1] || m[2]).toLowerCase() };
  return null;
}
// energieverdeling: welk deel van de calorieën komt uit eiwit, vet en koolhydraten
export function energySplit(n) {
  const dm = 100 - n.moisture;
  const p = 3.5 * n.protein, f = 8.5 * (n.fDM * dm / 100), c = 3.5 * (n.nfeDM * dm / 100), t = p + f + c;
  return t ? { p: (p / t) * 100, f: (f / t) * 100, c: (c / t) * 100 } : null;
}
