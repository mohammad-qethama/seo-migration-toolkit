#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { loadMap, checkMap } from '../src/map.mjs';
import { exportMap, FORMATS } from '../src/export.mjs';
import { verifyMap } from '../src/verify.mjs';

const HELP = `seo-migration-toolkit (smt): move a site without losing Google rankings

Usage:
  smt check  <map.csv>
  smt export <map.csv> --format <${Object.keys(FORMATS).join('|')}> [--out file]
  smt verify <map.csv> [--base http://localhost:3000] [--origin https://example.com]

Map columns: old_url,new_url,status,priority,notes
  status 200 = keep the URL (checks canonical + indexable)
  status 301/308 = permanent redirect, 410 = gone on purpose
`;

function flag(args, name) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}

async function main() {
  const [cmd, file, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h' || !file) {
    console.log(HELP);
    process.exit(cmd ? 1 : 0);
  }
  const entries = loadMap(file);

  if (cmd === 'check') {
    const { errors, warnings, total } = checkMap(entries);
    warnings.forEach((w) => console.warn(`WARN  ${w}`));
    errors.forEach((e) => console.error(`ERROR ${e}`));
    console.log(`\n${total} rows, ${errors.length} errors, ${warnings.length} warnings`);
    process.exit(errors.length ? 1 : 0);
  }

  if (cmd === 'export') {
    const format = flag(rest, 'format') ?? 'cloudflare-bulk';
    const out = exportMap(entries, format);
    const target = flag(rest, 'out');
    if (target) {
      writeFileSync(target, out);
      console.log(`Wrote ${target}`);
    } else {
      process.stdout.write(out + '\n');
    }
    return;
  }

  if (cmd === 'verify') {
    const results = await verifyMap(entries, {
      base: flag(rest, 'base'),
      origin: flag(rest, 'origin'),
    });
    const failed = results.filter((r) => !r.ok);
    failed.forEach((r) => console.error(`FAIL  line ${r.line}  ${r.url}\n      ${r.reason}`));
    console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
    process.exit(failed.length ? 1 : 0);
  }

  console.log(HELP);
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
