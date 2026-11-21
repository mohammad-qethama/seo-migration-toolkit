import { normalize } from './map.mjs';

// Hit the new site and confirm each old URL behaves as the map says:
//  - redirects return the right status and land on the right URL
//  - kept pages return 200, are indexable, and carry the expected canonical
//  - gone pages return 410
export async function verifyMap(entries, { base, origin, concurrency = 8 } = {}) {
  const results = [];
  const queue = [...entries];

  async function worker() {
    while (queue.length) {
      const e = queue.shift();
      results.push(await verifyOne(e, { base, origin }));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  results.sort((a, b) => a.line - b.line);
  return results;
}

async function verifyOne(e, { base, origin }) {
  const siteOrigin = origin ?? new URL(e.oldUrl).origin;
  const testUrl = base ? e.oldUrl.replace(siteOrigin, base.replace(/\/$/, '')) : e.oldUrl;
  const fail = (reason) => ({ line: e.line, url: e.oldUrl, ok: false, reason });

  let res;
  try {
    res = await fetch(testUrl, { redirect: 'manual' });
  } catch (err) {
    return fail(`request failed: ${err.message}`);
  }

  if (res.status !== e.status && !(e.status === 301 && res.status === 308)) {
    return fail(`expected ${e.status}, got ${res.status}`);
  }

  if ([301, 302, 307, 308].includes(res.status)) {
    let location = res.headers.get('location') ?? '';
    if (location.startsWith('/')) location = siteOrigin + location;
    if (base) location = location.replace(base.replace(/\/$/, ''), siteOrigin);
    if (normalize(location) !== normalize(e.newUrl)) {
      return fail(`redirects to ${location}, expected ${e.newUrl}`);
    }
  } else if (res.status === 200) {
    const html = await res.text();
    if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html) || /noindex/i.test(res.headers.get('x-robots-tag') ?? '')) {
      return fail('page is noindex');
    }
    const m = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)
      ?? html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
    if (!m) return fail('missing canonical tag');
    if (normalize(m[1]) !== normalize(e.newUrl)) {
      return fail(`canonical is ${m[1]}, expected ${e.newUrl}`);
    }
  }

  return { line: e.line, url: e.oldUrl, ok: true };
}
