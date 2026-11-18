// Haalt kattenvoer en kattensnacks op uit de Plein-feed (Daisycon) en, als er
// bol-gegevens zijn, uit de bol Marketing Catalog API. Schrijft compacte JSON
// naar data/feed/. Draait dagelijks in GitHub Actions (zie .github/workflows/feeds.yml).
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('../data/feed/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const MEDIA_ID = process.env.DAISYCON_MEDIA_ID || '443549';
const PLEIN_PROGRAM = 3366;
const pleinUrl = `https://daisycon.io/datafeed/?media_id=${MEDIA_ID}&standard_id=1&language_code=nl&locale_id=1&type=JSON&program_id=${PLEIN_PROGRAM}&html_transform=none&rawdata=false&encoding=utf8&general=false`;

const CAT_RE = /Benodigdheden voor katten\|(Kattenvoer|Kattenhapjes)/;
const firstImg = (imgs) => {
  if (!imgs) return '';
  const a = Array.isArray(imgs) ? imgs : Object.values(imgs);
  const x = a[0];
  return typeof x === 'string' ? x : (x && (x.location || x.url)) || '';
};
const clean = (s = '', n = 600) => String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

async function plein() {
  const r = await fetch(pleinUrl);
  if (!r.ok) throw new Error('Plein feed HTTP ' + r.status);
  const d = await r.json();
  const prods = d.datafeed.programs.flatMap((p) => p.products || []);
  const out = [];
  for (const p of prods) {
    const i = p.product_info || {};
    if (!CAT_RE.test(i.category_path || '')) continue;
    if ((p.update_info || {}).status && p.update_info.status !== 'active') continue;
    out.push({
      id: (p.update_info || {}).daisycon_unique_id || i.sku,
      shop: 'Plein',
      title: i.title,
      brand: i.brand || '',
      ean: i.ean ? String(i.ean) : '',
      sku: i.sku || '',
      type: /Kattenhapjes/.test(i.category_path) ? 'snack' : 'voer',
      cat: String(i.category_path || '').split('|').pop(),
      price: Number(i.price) || null,
      price_old: Number(i.price_old) || null,
      shipping: Number(i.price_shipping) || 0,
      in_stock: String(i.in_stock) === 'true' || i.in_stock === true || i.in_stock === 1,
      size: i.size || i.size_description || '',
      unit: { measure: Number(i.unit_price_measure) || null, unit: i.unit_price_measure_unit || '', base: Number(i.unit_price_base_measure) || null },
      keywords: i.keywords || '',
      desc: clean(i.description || i.description_short),
      link: i.link,
      image: firstImg(i.images),
    });
  }
  out.sort((a, b) => (a.brand + a.title).localeCompare(b.brand + b.title, 'nl'));
  return out;
}

async function bol() {
  const id = process.env.BOL_CLIENT_ID, secret = process.env.BOL_CLIENT_SECRET;
  if (!id || !secret) { console.log('bol: geen BOL_CLIENT_ID/BOL_CLIENT_SECRET, overslaan'); return null; }
  const tr = await fetch('https://login.bol.com/token?grant_type=client_credentials', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), Accept: 'application/json' },
  });
  if (!tr.ok) throw new Error('bol token HTTP ' + tr.status);
  const { access_token } = await tr.json();
  const api = async (path, params) => {
    const u = new URL('https://api.bol.com/marketing/catalog/v1' + path);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    for (let t = 0; t < 4; t++) {
      const r = await fetch(u, { headers: { Authorization: 'Bearer ' + access_token, 'Accept-Language': 'nl', Accept: 'application/json' } });
      if (r.status === 429) { await new Promise((s) => setTimeout(s, 2000 * (t + 1))); continue; }
      if (!r.ok) throw new Error(`bol ${path} HTTP ${r.status}`);
      return r.json();
    }
    throw new Error('bol rate limit');
  };
  // Categorie-ID's opzoeken via een zoekopdracht
  const s = await api('/products/search', { 'search-term': 'kattenvoer', 'country-code': 'NL', 'include-relevant-categories': 'true', 'page-size': '1' });
  const cats = (s.allRelevantCategories || s.relevantCategories || []);
  const flat = [];
  const walk = (c) => { for (const x of c || []) { flat.push(x); walk(x.subcategories); } };
  walk(cats);
  const pick = (re) => (flat.find((c) => re.test(c.categoryName || c.name || '')) || {}).categoryId || (flat.find((c) => re.test(c.categoryName || c.name || '')) || {}).id;
  const targets = [
    ['voer', pick(/^Kattenvoer$/i) || pick(/kattenvoer/i)],
    ['snack', pick(/kattensnack|kattenhapje|snacks/i)],
  ].filter((t) => t[1]);
  console.log('bol categorieën:', JSON.stringify(targets), 'gevonden:', flat.slice(0, 15).map((c) => `${c.categoryName || c.name}=${c.categoryId || c.id}`).join(', '));
  const out = []; const seen = new Set();
  for (const [type, catId] of targets) {
    const pages = type === 'voer' ? 12 : 4;
    for (let page = 1; page <= pages; page++) {
      const r = await api('/products/lists/popular', { 'country-code': 'NL', 'category-id': String(catId), page: String(page), 'page-size': '50', 'include-image': 'true', 'include-offer': 'true', 'include-rating': 'true' });
      for (const [n, p] of (r.results || []).entries()) {
        if (seen.has(p.ean)) continue; seen.add(p.ean);
        out.push({
          id: 'bol-' + p.ean, shop: 'bol.com', type, rank: (page - 1) * 50 + n + 1,
          title: p.title, ean: String(p.ean), url: p.url,
          image: (p.image && p.image.url) || '',
          price: p.offer ? Number(p.offer.price) : null,
          price_old: p.offer && p.offer.strikethroughPrice ? Number(p.offer.strikethroughPrice) : null,
          delivery: p.offer ? p.offer.deliveryDescription || '' : '',
          rating: p.rating != null ? Number(p.rating) : null,
          desc: clean(p.description),
          gpc: (p.gpc || []).map((g) => g.name).join(' > '),
        });
      }
      if (!r.results || r.results.length < 50) break;
    }
  }
  return out;
}

const now = new Date().toISOString();
try {
  const p = await plein();
  writeFileSync(new URL('plein-kat.json', OUT), JSON.stringify({ fetched: now, count: p.length, products: p }));
  console.log('Plein:', p.length, 'kattenproducten');
} catch (e) { console.error('Plein mislukt:', e.message); process.exitCode = 1; }
try {
  const b = await bol();
  if (b) { writeFileSync(new URL('bol-kat.json', OUT), JSON.stringify({ fetched: now, count: b.length, products: b })); console.log('bol:', b.length, 'kattenproducten'); }
} catch (e) { console.error('bol mislukt:', e.message); }
