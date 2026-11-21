# SEO Migration Toolkit

Move a website to a new platform without losing its Google rankings.

When a store leaves Shopify, WordPress or another hosted platform, its URLs change. Every old URL that ranks on Google must either stay exactly the same or 301-redirect to its new home, or that traffic is lost. This toolkit turns one spreadsheet of URLs into ready-to-deploy redirects, and then tests the live site against it before you switch DNS.

Built from a real migration of a bilingual (Arabic/English) e-commerce store from a hosted platform to Next.js on Cloudflare Workers.

## What it does

| Command | What it checks or produces |
| --- | --- |
| `smt check` | Duplicate URLs, redirects to self, redirect chains, redirect loops, temporary (302) redirects |
| `smt export` | Cloudflare Bulk Redirects CSV, a `_redirects` file (Cloudflare Pages / Netlify) or a Next.js `redirects()` array; chains are flattened to the final URL |
| `smt verify` | Hits the new site: right status code, right redirect target, kept pages are indexable and have the right canonical tag |

No dependencies. Node 18 or newer. Handles percent-encoded Arabic (and any non-Latin) slugs.

## Quick start

```bash
git clone https://github.com/mohammad-qethama/seo-migration-toolkit
cd seo-migration-toolkit

# 1. Validate the map
node bin/smt.mjs check examples/url-map.csv

# 2. Generate redirects for your platform
node bin/smt.mjs export examples/url-map.csv --format cloudflare-bulk --out redirects.csv
node bin/smt.mjs export examples/url-map.csv --format nextjs --out redirects.mjs
node bin/smt.mjs export examples/url-map.csv --format redirects-file --out _redirects

# 3. Test the new site (local or staging) before go-live
node bin/smt.mjs verify examples/url-map.csv \
  --base http://localhost:3000 --origin https://example-store.com
```

## The URL map

One CSV, one row per old URL. See [`examples/url-map.csv`](examples/url-map.csv).

| Column | Meaning |
| --- | --- |
| `old_url` | Full URL on the current site |
| `new_url` | Where it should end up (leave empty for 410) |
| `status` | `200` keep exactly, `301`/`308` permanent redirect, `410` gone on purpose |
| `priority` | `high` / `normal` / `low`, so you migrate and test top pages first |
| `notes` | Why this decision was made |

Tip: build the list from a full crawl of the old site plus Google Search Console's top pages, so nothing that earns traffic is missed.

## Example output

```text
$ node bin/smt.mjs verify map.csv --base http://localhost:3000 --origin https://example-store.com
FAIL  line 5  https://example-store.com/pages/contactus
      redirects to https://example-store.com/about, expected https://example-store.com/contact
FAIL  line 9  https://example-store.com/products/sliding-gate-motor-600kg
      canonical is https://staging.example-store.com/..., expected https://example-store.com/...

68 passed, 2 failed
```

## Migration checklist

1. Crawl the old site and export Search Console's top pages.
2. Fill the URL map, keeping high-traffic URLs exactly where possible.
3. `smt check` until there are 0 errors.
4. `smt export` and deploy the redirects to staging.
5. `smt verify` against staging until there are 0 failures.
6. Switch DNS, run `smt verify` against production, and submit the new sitemap.
7. Watch Search Console's coverage and 404 reports for 4–6 weeks.

## Tests

```bash
npm test
```

## License

MIT
