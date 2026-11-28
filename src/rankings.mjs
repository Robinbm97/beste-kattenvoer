// Ranglijsten per categorie ("beste … kattenvoer"), elk met een eigen, onderbouwde invalshoek.
// Geen gevoel: per categorie staat hieronder welke waarde telt, waarom, en welke grens we gebruiken.
// Bronnen (ook op de pagina's genoemd):
//  - FEDIAF Nutritional Guidelines (2021/2024): groei Ca:P 1:1 tot 1,5:1; volwassen 1:1 tot 2:1;
//    minimum fosfor volwassen 1,25 g/1000 kcal.
//  - IRIS (International Renal Interest Society): nierdiëten hebben minder fosfor en zijn energierijker.
//  - Buckley e.a. 2011 (Br J Nutr): natvoer (73% vocht) verdunt de urine en verlaagt het oxalaatrisico.
//  - Struvietpreventie: weinig magnesium en fosfor, urine-aanzurend (o.a. Lulich/Osborne; PMC10436620).
import { perMcal, mgPer100kcal, ingredients } from './nutrition.mjs';
import { sizeless } from './catalog.mjs';

const median = (a) => { const s = a.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const protPer100kcal = (p) => (p.nut.protein / p.nut.kcal100) * 100;
const caP = (p) => (p.nut.ca && p.nut.p ? p.nut.ca / p.nut.p : null);
const pMcal = (p) => { const v = perMcal(p.nut.p, p.nut.kcal100); return v != null && v >= 0.4 ? v : null; }; // lager dan 0,4 g/1000 kcal bestaat niet: leesfout
const mg100 = (p) => mgPer100kcal(p.nut.mg, p.nut.kcal100);

// aantal verschillende dierlijke eiwitbronnen in de samenstelling (voor hypoallergeen)
const ANIMALS = [['kip|chicken', 'kip'], ['kalkoen|turkey', 'kalkoen'], ['eend|duck', 'eend'], ['rund|beef', 'rund'], ['lam\\b|lams|lamb', 'lam'], ['varken|pork', 'varken'], ['konijn|rabbit', 'konijn'], ['hert|wild\\b|venison', 'wild'], ['paard|horse', 'paard'], ['zalm|salmon', 'zalm'], ['tonijn|tuna', 'tonijn'], ['haring|herring', 'haring'], ['forel|trout', 'forel'], ['kabeljauw|witvis|koolvis|schol|zeevis|white ?fish|\\bvis\\b|fish', 'vis'], ['garnaal|garnalen|shrimp', 'garnaal'], ['insect', 'insect'], ['gevogelte|poultry', 'gevogelte (gemengd)'], ['vlees en dierlijke|dierlijke bijproducten|meat and animal', 'onbenoemd vlees'], ['\\bei\\b|eieren|egg', 'ei']];
export function animalSources(sam) {
  if (!sam) return null;
  const ings = ingredients(sam).join(' | ').toLowerCase();
  if (!ings) return null;
  const found = ANIMALS.filter(([re]) => new RegExp(re, 'i').test(ings)).map(([, l]) => l);
  return found;
}

export function buildRankings(ALL, { HASPAGE, purl, esc, eur, pct, pct1, score, formLabel }) {
  const base = ALL.filter((p) => HASPAGE(p) && !p.flags.includes('aanvullend'));
  const maint = base.filter((p) => !p.flags.includes('dieet'));
  const dry = maint.filter((p) => p.form === 'droog'), wet = maint.filter((p) => p.form === 'nat');
  const n0 = (x, d = 0) => Number(x).toFixed(d).replace('.', ',');
  const link = (p) => `<a href="${purl(p)}">${esc(p.name)}</a><small>${esc(p.brand)} · ${formLabel[p.form]}</small>`;
  // hetzelfde voer in een andere verpakking of bij een andere winkel maar één keer tonen
  const coreName = (p) => (p.brand + ' ' + sizeless(p.name)).toLowerCase().replace(/\d+([.,]\d+)?/g, ' ').replace(/\bx\b/g, ' ').replace(/kattenvoer|kattenbrokken|natvoer|droogvoer|multipack|maaltijdzakjes?|zakjes|\bkat\b|-|®|™/g, ' ').replace(/\s+/g, ' ').trim();
  const recipe = (p) => `${p.brand}|${p.form}|${p.nut.pDM}|${p.nut.kcal100}|${p.nut.nfeDM}`; // zelfde merk + zelfde voedingswaarden = zelfde recept
  const uniq = (rows) => { const seen = new Set(); return rows.filter((p) => { const k = coreName(p); const r = recipe(p); if (seen.has(r)) return false; seen.add(r); if (seen.has(k)) return false; seen.add(k); return true; }); };
  const seenRows = new Map();
  const table = (rows0, cols, caption) => { const rows = uniq(rows0).slice(0, cols.limit || 12); const html = rows.length ? `<div class="table-wrap"><table class="ttable rtable"><caption>${esc(caption)}</caption><thead><tr><th scope="col">#</th><th scope="col">Voer</th>${cols.map((c) => `<th scope="col">${c.h}</th>`).join('')}</tr></thead><tbody>${rows.map((p, i) => `<tr><td>${i + 1}</td><th scope="row">${link(p)}</th>${cols.map((c) => `<td>${c.v(p)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="fine">Op dit moment staan er niet genoeg producten met volledige gegevens in de feed om een eerlijke ranglijst te maken.</p>'; seenRows.set(html, rows); return html; };
  const C = {
    score: { h: 'Score', v: (p) => `<b class="sc">${score(p.score.total)}</b>` },
    ppd: { h: 'Per dag', v: (p) => eur(p.ppd) },
    pDM: { h: 'Eiwit (ds)', v: (p) => pct1(p.nut.pDM) },
    kcal: { h: 'kcal/100 g', v: (p) => String(p.nut.kcal100) },
    p100kcal: { h: 'Eiwit per 100 kcal', v: (p) => n0(protPer100kcal(p), 1) + ' g' },
    nfe: { h: 'Koolhydraten (ds)', v: (p) => '±' + pct(p.nut.nfeDM) },
    moist: { h: 'Vocht', v: (p) => pct(p.nut.moisture) },
    mg: { h: 'Magnesium', v: (p) => n0(mg100(p), 0) + ' mg/100 kcal' },
    pmcal: { h: 'Fosfor', v: (p) => pMcal(p) ? n0(pMcal(p), 2) + ' g/1000 kcal' : 'niet vermeld' },
    cap: { h: 'Ca:P', v: (p) => caP(p) ? n0(caP(p), 2) + ' : 1' : '–' },
    p100: { h: 'Per 100 g eiwit', v: (p) => eur(p.p100) },
    fat: { h: 'Vet (ds)', v: (p) => pct1(p.nut.fDM) },
    steri: { h: 'Sterilised-label', v: (p) => p.flags.includes('gesteriliseerd') ? 'ja' : 'nee' },
    bronnen: { h: 'Dierlijke bronnen', v: (p) => esc((animalSources(p.nut.sam) || []).join(', ') || '–') },
  };
  const vars = {}, tables = {};
  const byScore = (a, b) => b.score.total - a.score.total || a.ppd - b.ppd;

  // ---------- gesteriliseerde kat: minder energie, wel eiwit ----------
  {
    const adultDry = dry.filter((p) => p.stage === 'adult');
    const lab = adultDry.filter((p) => p.flags.includes('gesteriliseerd')), rest = adultDry.filter((p) => !p.flags.includes('gesteriliseerd'));
    const mk = median(adultDry.map((p) => p.nut.kcal100));
    vars.steri_kcal_label = String(Math.round(median(lab.map((p) => p.nut.kcal100))));
    vars.steri_kcal_rest = String(Math.round(median(rest.map((p) => p.nut.kcal100))));
    vars.steri_n_label = String(lab.length);
    vars.steri_hoog = String(lab.filter((p) => p.nut.kcal100 > mk).length);
    vars.steri_kcal_mid = String(Math.round(mk));
    { const d = median(rest.map((p) => p.nut.kcal100)) - median(lab.map((p) => p.nut.kcal100)); vars.steri_conclusie = d >= 10 ? 'Het label doet hier dus meestal wat het belooft.' : d > 0 ? 'Het verschil is klein: het label zegt dus maar een deel.' : 'Opvallend: het label levert dus geen voer met minder energie op.'; }
    const pick = adultDry.filter((p) => p.nut.kcal100 <= mk && protPer100kcal(p) >= 9).sort((a, b) => protPer100kcal(b) * 0.5 + b.score.total - (protPer100kcal(a) * 0.5 + a.score.total));
    vars.steri_n_pick = String(pick.length);
    tables.steri = table(pick, [C.kcal, C.p100kcal, C.steri, C.score, C.ppd], 'Droogvoer voor een gesteriliseerde kat: hooguit gemiddelde energie, veel eiwit per kcal');
    const wpick = wet.filter((p) => p.stage === 'adult' && protPer100kcal(p) >= 10).sort(byScore);
    tables.steri_nat = table(wpick, [C.kcal, C.p100kcal, C.score, C.ppd], 'Natvoer voor een gesteriliseerde kat');
  }

  // ---------- urinary / blaasgruis: vocht, magnesium, fosfor ----------
  {
    const known = maint.filter((p) => p.nut.mg && p.stage !== 'kitten');
    const urinLab = known.filter((p) => p.flags.includes('urinewegen'));
    vars.uri_mg_mid = n0(median(known.map(mg100)), 0);
    vars.uri_mg_label = urinLab.length >= 3 ? n0(median(urinLab.map(mg100)), 0) : '–';
    vars.uri_n_mg = String(known.length);
    vars.uri_n_label = String(urinLab.length);
    const wpick = known.filter((p) => p.form === 'nat' && p.score.total >= 5 && mg100(p) <= median(known.map(mg100))).sort((a, b) => mg100(a) - mg100(b) || byScore(a, b));
    tables.urinary_nat = table(wpick, [C.moist, C.mg, C.pmcal, C.score, C.ppd], 'Natvoer met weinig magnesium per kcal (onderhoudsvoer, geen dieet)');
    const dpick = known.filter((p) => p.form === 'droog' && p.score.total >= 5 && mg100(p) <= median(known.map(mg100))).sort((a, b) => mg100(a) - mg100(b) || byScore(a, b));
    tables.urinary_droog = table(dpick, [C.mg, C.pmcal, C.score, C.ppd], 'Brokken met weinig magnesium per kcal');
    const diet = base.filter((p) => p.flags.includes('dieet') && p.flags.includes('urinewegen')).sort((a, b) => a.brand.localeCompare(b.brand) || a.ppd - b.ppd);
    vars.uri_n_dieet = String(diet.length);
    tables.urinary_dieet = table(diet, [{ h: 'Magnesium', v: (p) => p.nut.mg ? n0(mg100(p), 0) + ' mg/100 kcal' : 'niet vermeld' }, C.ppd], 'Urinary-dieetvoer in de feed (alleen op advies van je dierenarts, niet gerangschikt)');
  }

  // ---------- hypoallergeen: zo weinig mogelijk eiwitbronnen ----------
  {
    const withSam = maint.filter((p) => p.nut.sam && animalSources(p.nut.sam));
    const single = withSam.filter((p) => p.stage !== 'kitten' && animalSources(p.nut.sam).length === 1 && !animalSources(p.nut.sam).some((x) => /onbenoemd|gemengd/.test(x)));
    const gev = withSam.filter((p) => p.flags.includes('gevoelig'));
    vars.hypo_n_sam = String(withSam.length);
    vars.hypo_n_single = String(single.length);
    vars.hypo_n_gev = String(gev.length);
    vars.hypo_gev_multi = String(gev.filter((p) => animalSources(p.nut.sam).length >= 2).length);
    tables.hypo = table(single.sort(byScore), [C.bronnen, C.score, C.ppd], 'Voer met één benoemde dierlijke eiwitbron (volgens de samenstelling)');
    const hydro = base.filter((p) => p.flags.includes('dieet') && /hypoallergen|anallergen|hydrolys|hypo/i.test(p.name));
    vars.hypo_n_dieet = String(hydro.length);
  }

  // ---------- kitten: eiwit, energie en de calcium-fosforverhouding ----------
  {
    const kit = maint.filter((p) => p.stage === 'kitten');
    const ratio = kit.filter((p) => caP(p));
    const ok = ratio.filter((p) => caP(p) >= 1 && caP(p) <= 1.5);
    vars.kit_n = String(kit.length);
    vars.kit_n_ratio = String(ratio.length);
    vars.kit_n_ok = String(ok.length);
    vars.kit_n_buiten = String(ratio.length - ok.length);
    vars.kit_conclusie = ratio.length && ok.length / ratio.length >= 0.8 ? 'Het meeste kittenvoer doet het dus goed.' : 'Dat is een flink deel: kijk bij kittenvoer dus echt even naar het etiket.';
    vars.kit_eiwit_mid = pct(median(kit.map((p) => p.nut.pDM)));
    const pick = ok.filter((p) => p.nut.pDM >= 35).sort(byScore);
    tables.kitten = table(pick, [C.pDM, C.kcal, C.cap, C.score, C.ppd], 'Kittenvoer met veel eiwit én een Ca:P-verhouding binnen de FEDIAF-groeinorm (1:1 tot 1,5:1)');
  }

  // ---------- senior: spieren behouden, fosfor niet onnodig hoog ----------
  {
    const sen = maint.filter((p) => p.stage === 'senior');
    const allP = maint.filter((p) => pMcal(p));
    const pm = median(allP.map(pMcal));
    vars.sen_n = String(sen.length);
    vars.sen_p_mid_all = n0(pm, 1);
    vars.sen_p_mid = sen.filter((p) => pMcal(p)).length >= 3 ? n0(median(sen.filter((p) => pMcal(p)).map(pMcal)), 1) : '–';
    vars.sen_eiwit_mid = n0(median(sen.map(protPer100kcal)), 1);
    vars.adult_eiwit_mid = n0(median(maint.filter((p) => p.stage === 'adult').map(protPer100kcal)), 1);
    { const d = median(maint.filter((p) => p.stage === 'adult').map(protPer100kcal)) - median(sen.map(protPer100kcal)); vars.sen_conclusie = d > 0.3 ? 'Seniorvoer bespaart dus vaak een beetje op eiwit, terwijl een gezonde oudere kat dat juist goed kan gebruiken.' : 'Op eiwit bespaart seniorvoer dus niet, en dat is goed: een gezonde oudere kat heeft het nodig.'; }
    const pick = sen.filter((p) => protPer100kcal(p) >= 9 && pMcal(p) && pMcal(p) <= pm).sort(byScore);
    tables.senior = table(pick, [C.p100kcal, { h: 'Fosfor', v: (p) => pMcal(p) ? n0(pMcal(p), 2) + ' g/1000 kcal' : 'niet vermeld' }, C.score, C.ppd], 'Seniorvoer met genoeg eiwit per kcal en geen bovengemiddelde fosfor');
  }

  // ---------- nieren: fosfor per 1000 kcal (dieetvoer) ----------
  {
    const renal = base.filter((p) => p.flags.includes('dieet') && /renal|nier|kidney|k\/d|\bkd\b/i.test(p.name) && pMcal(p));
    const allP = maint.filter((p) => pMcal(p));
    vars.nier_p_onderhoud = n0(median(allP.map(pMcal)), 1);
    vars.nier_p_dieet = renal.length >= 3 ? n0(median(renal.map(pMcal)), 1) : '–';
    vars.nier_n = String(renal.length);
    vars.nier_n_p = String(allP.length);
    vars.nier_p_max = n0(Math.max(...allP.map(pMcal)), 1);
    { const r = renal.length >= 3 ? median(renal.map(pMcal)) / median(allP.map(pMcal)) : null; vars.nier_conclusie = r == null ? '' : r < 0.5 ? 'Dat is minder dan de helft.' : r < 0.75 ? 'Dat is een flink stuk minder.' : 'Het verschil is kleiner dan je zou verwachten.'; }
    tables.nieren = table(renal.sort((a, b) => pMcal(a) - pMcal(b)), [C.pmcal, C.p100kcal, C.kcal, C.ppd], 'Nierdieetvoer in de feed, gesorteerd op fosfor per 1000 kcal (alleen op advies van je dierenarts)');
  }

  // ---------- graanvrij: is het ook koolhydraatarm? ----------
  {
    const gv = maint.filter((p) => p.flags.includes('graanvrij'));
    const gvDry = gv.filter((p) => p.form === 'droog');
    vars.gv_n = String(gv.length);
    vars.gv_kh_droog = pct(median(gvDry.map((p) => p.nut.nfeDM)));
    vars.kh_droog = pct(median(dry.map((p) => p.nut.nfeDM)));
    vars.gv_hoog = String(gvDry.filter((p) => p.nut.nfeDM > 30).length);
    vars.gv_n_droog = String(gvDry.length);
    { const d = median(dry.map((p) => p.nut.nfeDM)) - median(gvDry.map((p) => p.nut.nfeDM)); vars.gv_conclusie = d < 5 ? 'Nauwelijks verschil dus.' : d < 10 ? 'Iets minder, maar geen wereld van verschil.' : 'Graanvrij scheelt hier dus echt.'; }
    tables.graanvrij = table(gv.filter((p) => p.nut.nfeDM <= 25).sort(byScore), [C.nfe, C.pDM, C.score, C.ppd], 'Graanvrij voer dat ook echt weinig koolhydraten heeft (maximaal 25% in droge stof)');
  }

  // ---------- goedkoop: eiwit per euro ----------
  {
    const cheap = maint.filter((p) => p.score.total >= 6 && p.p100);
    tables.goedkoop_eiwit = table([...cheap].filter((p) => p.form === 'droog').sort((a, b) => a.p100 - b.p100), [C.p100, C.pDM, C.score, C.ppd], 'Droogvoer met score 6+ gesorteerd op prijs per 100 gram eiwit');
    tables.goedkoop_eiwit_nat = table([...cheap].filter((p) => p.form === 'nat').sort((a, b) => a.p100 - b.p100), [C.p100, C.pDM, C.score, C.ppd], 'Natvoer met score 6+ gesorteerd op prijs per 100 gram eiwit');
    vars.goed_n6 = String(cheap.length);
  }

  // ---------- gevoelige darmen: verteerbaarheid ----------
  {
    const gev = maint.filter((p) => p.flags.includes('gevoelig'));
    vars.gev_n = String(gev.length);
    vars.gev_vet_mid = pct(median(gev.map((p) => p.nut.fDM)));
    vars.vet_mid = pct(median(maint.map((p) => p.nut.fDM)));
    { const d = median(gev.map((p) => p.nut.fDM)) - median(maint.map((p) => p.nut.fDM)); vars.gev_vergelijk = d > 0.5 ? 'juist iets <b>meer</b> vet' : d < -0.5 ? 'iets minder vet' : 'ongeveer evenveel vet'; vars.gev_conclusie = d < -0.5 ? 'Het label helpt dus een beetje.' : 'Het label zegt dus weinig.'; }
    const pick = gev.filter((p) => p.nut.fiber != null && (p.nut.fiber / (100 - p.nut.moisture)) * 100 <= 5 && p.nut.fDM <= 22).sort(byScore);
    tables.gevoelig = table(pick, [C.fat, { h: 'Celstof (ds)', v: (p) => pct1((p.nut.fiber / (100 - p.nut.moisture)) * 100) }, C.score, C.ppd], 'Voer voor gevoelige darmen: niet te vet, niet te veel ruwe celstof');
  }

  // ---------- natvoer en brokken: de algemene top ----------
  tables.top_nat = table(wet.filter((p) => p.stage === 'adult').sort(byScore), [C.pDM, C.nfe, C.score, C.ppd], 'Beste natvoer voor volwassen katten volgens de score');
  tables.top_droog = table(dry.filter((p) => p.stage === 'adult').sort(byScore), [C.pDM, C.nfe, C.kcal, C.score, C.ppd], 'Beste kattenbrokken voor volwassen katten volgens de score');
  vars.n_nat_score = String(wet.length);
  vars.n_droog_score = String(dry.length);

  const lists = Object.fromEntries(Object.entries(tables).map(([k, h]) => [k, seenRows.get(h) || []]));
  return { tables, vars, lists };
}
