// Centrale SEO-regels. Iedere regel: id, naam, beschrijving, ernst, paginatypes, uitzonderingen, oplossing, bron.
// check(page, ctx) geeft een lijst bevindingen terug ({ detail }). Lege lijst = geslaagd.
// Lengte- en dichtheidsgrenzen zijn redactionele richtlijnen, geen Google-limieten.

const words = (t) => (t.toLowerCase().match(/[a-zà-ÿ0-9€]+/g) || []);
const countPhrase = (text, phrase) => {
  if (!phrase) return 0;
  const t = ' ' + words(text).join(' ') + ' ';
  const p = ' ' + words(phrase).join(' ') + ' ';
  let n = 0, i = 0;
  while ((i = t.indexOf(p, i)) !== -1) { n++; i += p.length - 1; }
  return n;
};

export const LENGTH_GUIDE = {
  home: [800, 2500], product: [300, 2000], vergelijker: [800, 2500], review: [800, 2500], landing: [600, 1600], article: [800, 2200],
  'hub-kattenbakken': [300, 1200], 'hub-kennisbank': [200, 1000], 'hub-blog': [100, 1000], 'hub-merken': [300, 1600], about: [400, 1500], contact: [80, 600], page: [150, 1500], search: [0, 400], notfound: [0, 300],
};

export const rules = [
  // ---------- CRITICAL ----------
  { id: 'CRIT-001', name: 'Onbedoelde noindex', severity: 'CRITICAL', types: '*', exceptions: [],
    description: 'Pagina hoort indexeerbaar te zijn (CMS: index=true) maar bevat noindex in meta robots of X-Robots-Tag.',
    fix: 'Verwijder noindex of zet index: false in de frontmatter als het bewust is.', source: 'Google Search Central – Block indexing with noindex',
    check: (p) => (p.meta.index && /noindex/i.test(p.robots)) ? [{ detail: `robots="${p.robots}"` }] : [] },
  { id: 'CRIT-002', name: 'Canonical wijst naar andere pagina', severity: 'CRITICAL', types: '*', exceptions: [],
    description: 'De canonical-URL is niet de eigen URL, terwijl er in het CMS geen bewuste afwijkende canonical staat.',
    fix: 'Laat canonical leeg (eigen URL) of vul bewust een canonical in de frontmatter in.', source: 'Google Search Central – Consolidate duplicate URLs',
    check: (p, c) => (!p.meta.canonical && p.canonical !== c.site + p.url && p.meta.template !== 'notfound') ? [{ detail: `canonical=${p.canonical}` }] : [] },
  { id: 'CRIT-003', name: 'Sitemap-URL niet bereikbaar', severity: 'CRITICAL', types: '*', exceptions: [],
    description: 'Een URL in sitemap.xml heeft geen gebouwde pagina (zou 404 geven).',
    fix: 'Controleer de slug of verwijder de pagina uit de sitemap.', source: 'sitemaps.org protocol',
    global: (c) => c.sitemap.filter((u) => !c.urls.has(u)).map((u) => ({ url: u, detail: 'ontbreekt in build' })) },
  { id: 'CRIT-004', name: 'Dubbele URL', severity: 'CRITICAL', types: '*', exceptions: [],
    description: 'Twee contentbestanden gebruiken dezelfde slug.', fix: 'Geef ieder bestand een unieke slug.', source: 'Interne regel',
    global: (c) => c.dupSlugs.map((u) => ({ url: u, detail: 'slug komt vaker voor' })) },

  // ---------- HIGH ----------
  { id: 'HIGH-001', name: 'Title ontbreekt', severity: 'HIGH', types: '*', exceptions: [], description: 'Geen of lege <title>.', fix: 'Vul seo_title in.', source: 'Google – Title links',
    check: (p) => (!p.title.trim()) ? [{ detail: 'leeg' }] : [] },
  { id: 'HIGH-002', name: 'Meta description ontbreekt', severity: 'HIGH', types: '*', exceptions: ['notfound'], description: 'Indexeerbare pagina zonder meta description.', fix: 'Vul meta_description in.', source: 'Google – Snippets',
    check: (p) => (p.meta.index && !p.description.trim()) ? [{ detail: 'leeg' }] : [] },
  { id: 'HIGH-003', name: 'Kapotte interne link', severity: 'HIGH', types: '*', exceptions: [], description: 'Interne link naar een URL die niet bestaat.', fix: 'Pas de link aan of maak de pagina.', source: 'Interne regel',
    check: (p, c) => p.internal.filter((u) => !c.urls.has(u) && !c.assets.has(u)).map((u) => ({ detail: u })) },
  { id: 'HIGH-004', name: 'Weespagina (orphan)', severity: 'HIGH', types: '*', exceptions: ['/', '/zoeken/', '/seo-rapport/'], description: 'Indexeerbare pagina zonder inkomende interne links.', fix: 'Link vanuit een relevante pagina of het menu.', source: 'Interne regel',
    check: (p, c) => (p.meta.index && p.meta.template !== 'notfound' && !(c.inbound[p.url] || []).length) ? [{ detail: 'geen inkomende links' }] : [] },
  { id: 'HIGH-005', name: 'Ongeldige structured data', severity: 'HIGH', types: '*', exceptions: [], description: 'JSON-LD is niet te parsen of mist verplichte velden.', fix: 'Controleer schemaFor() in build.mjs.', source: 'schema.org / Google rich results docs',
    check: (p) => p.schemaErrors.map((e) => ({ detail: e })) },
  { id: 'HIGH-006', name: 'H1 ontbreekt', severity: 'HIGH', types: '*', exceptions: [], description: 'Geen H1 op de pagina.', fix: 'Vul h1 in de frontmatter in.', source: 'Interne regel',
    check: (p) => p.h1.length === 0 ? [{ detail: 'geen h1' }] : [] },
  { id: 'HIGH-007', name: 'Partnerlink niet gemarkeerd', severity: 'HIGH', types: '*', exceptions: [], description: 'Link naar een affiliate-netwerk zonder rel="sponsored".', fix: 'Gebruik de cta()-component of voeg rel="sponsored" toe.', source: 'Google – Qualify outbound links',
    check: (p) => p.affiliateUnmarked.map((u) => ({ detail: u })) },

  // ---------- MEDIUM ----------
  { id: 'MED-001', name: 'Alt-tekst ontbreekt of is leeg', severity: 'HIGH', types: '*', exceptions: [], description: 'Elke <img> heeft een beschrijvende alt-tekst. Ook lege alt="" telt als fout (SEO-checkers markeren dit).', fix: 'Beschrijf wat er op de foto staat, in gewone taal.', source: 'WCAG 1.1.1',
    check: (p) => p.imgNoAlt.map((s) => ({ detail: s })) },
  { id: 'MED-002', name: 'Dubbele meta description', severity: 'MEDIUM', types: '*', exceptions: [], description: 'Zelfde description op meerdere pagina’s.', fix: 'Schrijf per pagina een eigen description.', source: 'Google – Snippets',
    check: (p, c) => (p.description && c.descCount[p.description] > 1) ? [{ detail: 'komt ' + c.descCount[p.description] + '× voor' }] : [] },
  { id: 'MED-003', name: 'Dubbele title', severity: 'MEDIUM', types: '*', exceptions: [], description: 'Zelfde title op meerdere pagina’s.', fix: 'Maak de title uniek.', source: 'Google – Title links',
    check: (p, c) => (c.titleCount[p.title] > 1) ? [{ detail: 'komt ' + c.titleCount[p.title] + '× voor' }] : [] },
  { id: 'MED-004', name: 'Kopniveau overgeslagen', severity: 'MEDIUM', types: '*', exceptions: [], description: 'Bijvoorbeeld H2 direct gevolgd door H4.', fix: 'Gebruik de juiste volgorde H2 → H3 → H4.', source: 'WCAG 1.3.1',
    check: (p) => p.headingSkips.map((s) => ({ detail: s })) },
  { id: 'MED-005', name: 'Meerdere H1’s', severity: 'MEDIUM', types: '*', exceptions: [], description: 'Meer dan één H1 (waarschuwing, geen fout).', fix: 'Houd één primaire H1 aan.', source: 'Interne regel',
    check: (p) => p.h1.length > 1 ? [{ detail: p.h1.length + ' h1’s' }] : [] },
  { id: 'MED-006', name: 'Title-lengte afwijkend', severity: 'MEDIUM', types: '*', exceptions: ['notfound', 'search', 'product'], description: 'Standaard: de title is 50 tot 60 tekens.', fix: 'Herschrijf de seo_title naar 50–60 tekens, zoekwoord vooraan.', source: 'Redactionele richtlijn',
    check: (p) => (p.title.length < 50 || p.title.length > 60) ? [{ detail: p.title.length + ' tekens' }] : [] },
  { id: 'MED-007', name: 'Description-lengte afwijkend', severity: 'MEDIUM', types: '*', exceptions: ['notfound', 'search', 'product'], description: 'Standaard: de meta description is 140 tot 160 tekens.', fix: 'Herschrijf de meta_description naar 140–160 tekens, met het zoekwoord en een reden om te klikken.', source: 'Redactionele richtlijn',
    check: (p) => (p.meta.index && (p.description.length < 140 || p.description.length > 160)) ? [{ detail: p.description.length + ' tekens' }] : [] },
  { id: 'MED-008', name: 'Weinig contextuele interne links', severity: 'MEDIUM', types: ['article', 'review', 'landing', 'vergelijker', 'home'], exceptions: [], description: 'Minder dan 3 interne links in de hoofdtekst (buiten menu en footer).', fix: 'Link naar relevante ondersteunende pagina’s.', source: 'Interne regel',
    check: (p) => p.contextLinks < 3 ? [{ detail: p.contextLinks + ' links' }] : [] },

  { id: 'MED-009', name: 'H2 zonder zoekwoord', severity: 'MEDIUM', types: ['article', 'review', 'landing', 'home', 'vergelijker'], exceptions: [], description: 'Een H2 in de hoofdtekst bevat het primaire zoekwoord niet (belangrijkste woord of minstens de helft van de woorden, verbuigingen tellen mee).', fix: 'Herschrijf de H2 als de vraag die de lezer heeft, met het zoekwoord erin plus een concrete toevoeging.', source: 'Redactionele regel',
    check: (p) => { const kw = p.meta.primary_keyword; if (!kw) return []; return (p.proseH2 || []).filter((h) => !h2HasKeyword(h, kw)).map((h) => ({ detail: '“' + h + '”' })); } },

  { id: 'MED-010', name: 'Geen afbeelding met zoekwoord in alt', severity: 'MEDIUM', types: ['article', 'review', 'landing', 'home', 'vergelijker'], exceptions: [], description: 'Minstens één foto in de pagina heeft een beschrijvende alt-tekst waarin het primaire zoekwoord staat.', fix: 'Geef de hoofdfoto een alt die beschrijft wat je ziet én het zoekwoord bevat (image_alt in de frontmatter).', source: 'Redactionele regel',
    check: (p) => { const kw = p.meta.primary_keyword; if (!kw || !(p.imgAlts || []).length) return []; return (p.imgAlts || []).some((a) => h2HasKeyword(a, kw)) ? [] : [{ detail: 'zoekwoord: ' + kw }]; } },

  // ---------- LOW ----------
  { id: 'HIGH-008', name: 'Te weinig eigen tekst', severity: 'HIGH', types: ['landing', 'article', 'review', 'vergelijker', 'home'], exceptions: [], description: 'Minder dan 1000 woorden lopende tekst. Productkaarten, tabellen, bronnen en “lees ook” tellen niet mee: het gaat om eigen, unieke tekst.', fix: 'Schrijf aan de pagina bij: een eigen invalshoek, uitleg met cijfers uit de vergelijking en praktisch advies als kattenbaasje.', source: 'Redactionele regel (minimaal 1000 woorden)',
    check: (p) => p.proseWords < 1000 ? [{ detail: p.proseWords + ' woorden eigen tekst' }] : [] },
  { id: 'LOW-001', name: 'Keyword density buiten bandbreedte', severity: 'LOW', types: '*', exceptions: ['notfound', 'search', 'contact'], description: '0–0,3%: onderwerp onduidelijk? 2–3%: mogelijk overoptimalisatie; >3%: sterke waarschuwing.', fix: 'Herschrijf natuurlijk; gebruik variaties en synoniemen.', source: 'Redactionele richtlijn (geen Google-drempel)',
    check: (p) => { const d = p.densityNear; if (!p.meta.primary_keyword) return []; if (d < 0.3 || d >= 2) return [{ detail: d.toFixed(2) + '% (variant-match), exact ' + p.density.toFixed(2) + '% voor “' + p.meta.primary_keyword + '”' }]; return []; } },
  { id: 'LOW-002', name: 'Primair zoekwoord mist op sleutelplek', severity: 'LOW', types: '*', exceptions: ['notfound', 'search', 'contact', 'page'], description: 'Zoekwoord niet in title, H1, intro of description (niet alles is verplicht).', fix: 'Verwerk het zoekwoord waar het natuurlijk past.', source: 'Redactionele richtlijn',
    check: (p) => p.placementMissing.length >= 2 ? [{ detail: 'mist in: ' + p.placementMissing.join(', ') }] : [] },
  { id: 'LOW-003', name: 'Diep weggestopt', severity: 'LOW', types: '*', exceptions: [], description: 'Meer dan 3 klikken vanaf de homepage.', fix: 'Link vanuit een hub of de homepage.', source: 'Interne regel',
    check: (p, c) => (c.depth[p.url] !== undefined && c.depth[p.url] > 3) ? [{ detail: c.depth[p.url] + ' klikken' }] : [] },
  { id: 'LOW-004', name: 'Contentlengte buiten richtlijn', severity: 'LOW', types: '*', exceptions: [], description: 'Woordenaantal valt buiten de startwaarde voor dit paginatype.', fix: 'Beoordeel of de zoekintentie volledig beantwoord is; niet opvullen.', source: 'Redactionele richtlijn',
    check: (p) => { const g = LENGTH_GUIDE[p.meta.template]; if (!g) return []; return (p.wordCount < g[0] || p.wordCount > g[1]) ? [{ detail: p.wordCount + ' woorden (richtlijn ' + g[0] + '–' + g[1] + ')' }] : []; } },
];

// Variant-match: alle zoekwoordwoorden (ook verbogen: prefix-match) binnen een venster van woorden+4.
// Zo telt "wachttijd bij een kattenverzekering" mee voor "wachttijd kattenverzekering".
const STOP = new Set(['een', 'de', 'het', 'van', 'je', 'bij', 'voor', 'wat', 'is']);
const nearCount = (text, phrase) => {
  const kw = words(phrase).filter((w) => !STOP.has(w));
  if (!kw.length) return 0;
  const t = words(text);
  const win = kw.length + 4;
  let n = 0;
  for (let i = 0; i < t.length; i++) {
    if (!t[i].startsWith(kw[0].slice(0, Math.max(4, kw[0].length - 2)))) continue;
    const seg = t.slice(Math.max(0, i - win + 1), i + win);
    if (kw.every((k) => seg.some((w) => w.startsWith(k.slice(0, Math.max(4, k.length - 2)))))) { n++; i += kw.length; }
  }
  return n;
};
const H2STOP = new Set([...STOP, 'of', 'niet', 'en', 'je', 'mijn']);
const h2HasKeyword = (h, phrase) => {
  const kw = words(phrase).filter((w) => !H2STOP.has(w));
  if (!kw.length) return true;
  const t = words(h);
  const hit = (k) => t.some((w) => w.startsWith(k.slice(0, Math.max(3, k.length - 3))));
  const longest = [...kw].sort((a, b) => b.length - a.length)[0];
  return hit(longest) || kw.filter(hit).length >= Math.ceil(kw.length / 2);
};
export { words, countPhrase, nearCount, h2HasKeyword };
