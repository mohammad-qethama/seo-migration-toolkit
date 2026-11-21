import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../src/csv.mjs';
import { loadMap, checkMap, normalize } from '../src/map.mjs';
import { exportMap } from '../src/export.mjs';
import { verifyMap } from '../src/verify.mjs';

const example = fileURLToPath(new URL('../examples/url-map.csv', import.meta.url));

test('csv parser handles quotes, commas and BOM', () => {
  const rows = parseCsv('﻿a,b\n"x, y","say ""hi"""\n');
  assert.equal(rows[0].a, 'x, y');
  assert.equal(rows[0].b, 'say "hi"');
});

test('normalize treats encoded and decoded Arabic paths as equal', () => {
  assert.equal(
    normalize('https://s.com/products/%D8%B1%D9%8A%D9%85%D9%88%D8%AA'),
    normalize('https://s.com/products/ريموت/')
  );
});

test('example map passes check', () => {
  const r = checkMap(loadMap(example));
  assert.deepEqual(r.errors, []);
});

test('check finds duplicates, self-redirects, chains and loops', () => {
  const e = (line, oldUrl, newUrl, status = 301) => ({ line, oldUrl, newUrl, status });
  const r = checkMap([
    e(2, 'https://s.com/a', 'https://s.com/b'),
    e(3, 'https://s.com/b', 'https://s.com/c'),
    e(4, 'https://s.com/a/', 'https://s.com/x'),
    e(5, 'https://s.com/self', 'https://s.com/self'),
    e(6, 'https://s.com/l1', 'https://s.com/l2'),
    e(7, 'https://s.com/l2', 'https://s.com/l1'),
  ]);
  assert.ok(r.errors.some((m) => m.includes('duplicate')));
  assert.ok(r.errors.some((m) => m.includes('itself')));
  assert.ok(r.errors.some((m) => m.includes('loop')));
  assert.ok(r.warnings.some((m) => m.includes('chain')));
});

test('exports flatten chains to the final URL', () => {
  const entries = [
    { line: 2, oldUrl: 'https://s.com/a', newUrl: 'https://s.com/b', status: 301 },
    { line: 3, oldUrl: 'https://s.com/b', newUrl: 'https://s.com/c', status: 301 },
  ];
  assert.match(exportMap(entries, 'redirects-file'), /^\/a \/c 301$/m);
  assert.match(exportMap(entries, 'cloudflare-bulk'), /s\.com\/a,https:\/\/s\.com\/c,301/);
  assert.match(exportMap(entries, 'nextjs'), /"destination": "\/c"/);
});

test('verify catches wrong redirects, missing canonicals and noindex', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/old') return res.writeHead(301, { location: '/new' }).end();
    if (req.url === '/wrong') return res.writeHead(301, { location: '/elsewhere' }).end();
    if (req.url === '/keep')
      return res.end('<link rel="canonical" href="https://s.com/keep">');
    if (req.url === '/nocanon') return res.end('<html></html>');
    if (req.url === '/hidden')
      return res.end('<meta name="robots" content="noindex"><link rel="canonical" href="https://s.com/hidden">');
    res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const e = (line, path, newPath, status) => ({
    line, oldUrl: `https://s.com${path}`, newUrl: `https://s.com${newPath}`, status,
  });
  const results = await verifyMap(
    [
      e(2, '/old', '/new', 301),
      e(3, '/wrong', '/new', 301),
      e(4, '/keep', '/keep', 200),
      e(5, '/nocanon', '/nocanon', 200),
      e(6, '/hidden', '/hidden', 200),
    ],
    { base, origin: 'https://s.com' }
  );
  server.close();
  assert.deepEqual(results.map((r) => r.ok), [true, false, true, false, false]);
});
