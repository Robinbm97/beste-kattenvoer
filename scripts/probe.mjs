// Eenmalige test: waar staan eiwit/vet/vocht en samenstelling?
const MEDIA_ID = process.env.DAISYCON_MEDIA_ID || '443549';
const url = `https://daisycon.io/datafeed/?media_id=${MEDIA_ID}&standard_id=1&language_code=nl&locale_id=1&type=JSON&program_id=3366&html_transform=none&rawdata=false&encoding=utf8&general=false`;
const d = await (await fetch(url)).json();
const P = d.datafeed.programs[0].products.map((p) => p.product_info).filter((i) => /Benodigdheden voor katten\|Kattenvoer/.test(i.category_path || ''));
const re = /(ruw\s*)?eiwit(ten)?\s*[:\-]?\s*(\d+[.,]?\d*)\s*%/i;
const withP = P.filter((i) => re.test(i.description || ''));
console.log('PLEIN voer', P.length, 'met eiwit%', withP.length, 'met samenstelling', P.filter((i) => /samenstelling/i.test(i.description || '')).length);
for (const i of withP.slice(0, 2)) console.log('SAMPLE', (i.description || '').replace(/\s+/g, ' ').slice(-900));
const one = P[5];
const dl = decodeURIComponent((one.link.match(/dl=([^&]+)/) || [])[1] || '');
console.log('DL', dl);
for (const u of ['https://www.plein.nl/' + dl.split('?')[0]]) {
  try { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }); const t = await r.text(); console.log('PAGE', r.status, t.length, 'analyt', /analytische/i.test(t), 'samenst', /samenstelling/i.test(t)); const m = t.match(/[Aa]nalytische bestanddelen[\s\S]{0,600}/); if (m) console.log('ANA', m[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 500)); const s = t.match(/[Ss]amenstelling[\s\S]{0,600}/); if (s) console.log('SAM', s[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 500)); } catch (e) { console.log('PAGE ERR', e.message); }
}
// bol
const id = process.env.BOL_CLIENT_ID, secret = process.env.BOL_CLIENT_SECRET;
const tr = await fetch('https://login.bol.com/token?grant_type=client_credentials', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), Accept: 'application/json' } });
const { access_token } = await tr.json();
for (const ean of ['5900951259227', '3182550711050', '7613039916254']) {
  const r = await fetch(`https://api.bol.com/marketing/catalog/v1/products/${ean}?country-code=NL&include-specifications=true`, { headers: { Authorization: 'Bearer ' + access_token, 'Accept-Language': 'nl', Accept: 'application/json' } });
  const j = await r.json().catch(() => ({}));
  console.log('BOL', ean, r.status, j.title);
  for (const g of j.specificationGroups || []) console.log('  G', g.title, '|', (g.specifications || []).map((s) => s.name + '=' + (s.values || []).join('/')).join(' ; ').slice(0, 700));
}
