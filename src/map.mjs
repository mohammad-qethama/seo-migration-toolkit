import { readFileSync } from 'node:fs';
import { parseCsv } from './csv.mjs';

const VALID_STATUS = new Set([200, 301, 302, 307, 308, 410]);

// Load a URL map CSV with columns: old_url,new_url,status,priority,notes
export function loadMap(path) {
  const rows = parseCsv(readFileSync(path, 'utf-8'));
  return rows.map((r) => ({
    line: r._line,
    oldUrl: r.old_url,
    newUrl: r.new_url || r.old_url,
    status: Number.parseInt(r.status || '301', 10),
    priority: (r.priority || 'normal').toLowerCase(),
    notes: r.notes || '',
  }));
}

// Compare URLs the way a browser would: decode %XX, drop trailing slash.
export function normalize(url) {
  if (!url) return '';
  let u;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  let path;
  try {
    path = decodeURI(u.pathname);
  } catch {
    path = u.pathname;
  }
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return `${u.host.toLowerCase()}${path}${u.search}`;
}

export function pathOf(url) {
  const u = new URL(url);
  return u.pathname + u.search;
}

// Static checks that catch the mistakes that cost rankings.
export function checkMap(entries) {
  const errors = [];
  const warnings = [];
  const bySource = new Map();

  for (const e of entries) {
    const at = `line ${e.line}`;
    if (!e.oldUrl) {
      errors.push(`${at}: old_url is empty`);
      continue;
    }
    try {
      new URL(e.oldUrl);
    } catch {
      errors.push(`${at}: old_url is not an absolute URL: ${e.oldUrl}`);
      continue;
    }
    if (!VALID_STATUS.has(e.status)) {
      errors.push(`${at}: status ${e.status} is not one of ${[...VALID_STATUS].join(', ')}`);
    }
    if (e.status === 302 || e.status === 307) {
      warnings.push(`${at}: ${e.status} is temporary; use 301/308 to pass ranking signals`);
    }
    const key = normalize(e.oldUrl);
    if (bySource.has(key)) {
      errors.push(`${at}: duplicate old_url (first seen on line ${bySource.get(key).line})`);
    } else {
      bySource.set(key, e);
    }
    const isRedirect = [301, 302, 307, 308].includes(e.status);
    if (isRedirect && normalize(e.newUrl) === key) {
      errors.push(`${at}: redirects to itself`);
    }
  }

  // Chains and loops: A -> B where B is itself redirected.
  for (const e of entries) {
    if (![301, 302, 307, 308].includes(e.status)) continue;
    const seen = new Set([normalize(e.oldUrl)]);
    let hop = bySource.get(normalize(e.newUrl));
    let hops = 1;
    while (hop && [301, 302, 307, 308].includes(hop.status)) {
      const k = normalize(hop.newUrl);
      if (seen.has(k)) {
        errors.push(`line ${e.line}: redirect loop through ${hop.newUrl}`);
        break;
      }
      seen.add(normalize(hop.oldUrl));
      hops++;
      hop = bySource.get(k);
    }
    if (hops > 1 && hops < 20) {
      warnings.push(
        `line ${e.line}: chain of ${hops} redirects; point ${e.oldUrl} straight at the final URL`
      );
    }
  }

  return { errors, warnings, total: entries.length };
}

// Follow chains so exports always point at the final destination.
export function resolveFinal(entries) {
  const bySource = new Map(entries.map((e) => [normalize(e.oldUrl), e]));
  return entries.map((e) => {
    if (![301, 302, 307, 308].includes(e.status)) return e;
    let target = e.newUrl;
    const seen = new Set();
    let hop = bySource.get(normalize(target));
    while (hop && [301, 302, 307, 308].includes(hop.status) && !seen.has(hop)) {
      seen.add(hop);
      target = hop.newUrl;
      hop = bySource.get(normalize(target));
    }
    return { ...e, newUrl: target };
  });
}
