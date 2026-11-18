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
  c = c.replace(/^\s*(samenstelling|ingredi[eë]nten)\s*:?\s*/i, '').replace(/<[^>]+>/g, ' ').trim();
  if ((c.match(/,/g) || []).length < 3) return '';
  if (/(je kat|jouw kat|deze |dragen bij|heerlijk|lekker|weerstaan|kwaliteit)/i.test(c.slice(0, 120))) return '';
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
  sEtiket = clamp(sEtiket);
  const total = 0.4 * sEiwit + 0.2 * sKh + 0.25 * sPrijs + 0.15 * sEtiket;
  return { total: +Math.max(1, total).toFixed(1), eiwit: +sEiwit.toFixed(1), kh: +sKh.toFixed(1), prijs: +sPrijs.toFixed(1), etiket: +sEtiket.toFixed(1) };
}
