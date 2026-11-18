# beste-automatische-kattenbak.nl

SEO-first vergelijkingssite voor automatische (zelfreinigende) kattenbakken. Zelfde opzet als bestekattenverzekering.nl: statisch gebouwd met een eigen Node-generator (3 kleine dependencies), gehost op Cloudflare Pages. Elke push naar `main` wordt automatisch gebouwd, gevalideerd en live gezet.

## Hoe het werkt

```
content/
  site.yaml         menu, footer, organisatie, Daisycon media-ID, Google tag
  products.yaml     alle kattenbakken: specs, score, plussen/minnen, winkels, prijzen, partnerlinks (uit Daisycon-feed)
  images.yaml       Unsplash-foto's met alt-tekst en credits + eigen foto's
  pages/**/*.md     pagina's: YAML-frontmatter (alle SEO-velden) + Markdown
  reviews/<id>.md   (optioneel) extra tekst/FAQ voor een productreview; reviews worden verder automatisch gegenereerd
src/
  build.mjs         generator: templates, JSON-LD (Product/Review/FAQ/Breadcrumb), sitemap, robots, llms.txt, zoekindex
  seo-rules.mjs / seo-check.mjs   SEO-validator → /seo-rapport/ (build stopt bij CRITICAL)
  styles.css / app.js
static/             favicon, logo, OG-afbeelding, _headers, _redirects
```

- `npm run build` – bouwt `dist/` en draait de SEO-validator.
- Cloudflare Pages: build command `npm run build`, output directory `dist`.

## Partnerlinks (Daisycon)

Alle links staan in `content/products.yaml` met de placeholders `#MEDIA_ID#` en `#SUBID#`. De build vult `#MEDIA_ID#` met `daisycon.media_id` uit `site.yaml` en `#SUBID#` met het product-id. Links krijgen automatisch `rel="sponsored nofollow"`.

## Prijzen bijwerken

Prijzen komen uit de Daisycon-productfeed. Pas `price` per offer aan en zet `checked` bovenaan `products.yaml` op de nieuwe datum. Refurbished aanbiedingen (Productpine) hebben `condition: refurbished` en worden zo getoond.

Shortcodes in Markdown: `[[top3]]`, `[[tabel]]`, `[[tijd]]`, `[[prod:id]]`, `[[cta:id]]`, `[[img:sleutel]]`, `[[lijst:camera|open|groot|meer|budget|nieuw|app]]`.
