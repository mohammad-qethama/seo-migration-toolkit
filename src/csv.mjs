// Minimal RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF, BOM.
// No dependencies so the toolkit runs anywhere Node 18+ runs.

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/^﻿/, '');

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map((h) => h.trim().toLowerCase());
  return nonEmpty.slice(1).map((r, idx) => {
    const obj = { _line: idx + 2 };
    header.forEach((h, i) => (obj[h] = (r[i] ?? '').trim()));
    return obj;
  });
}

export function toCsv(rows, columns) {
  const esc = (v) => {
    const str = String(v ?? '');
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  return [
    columns.join(','),
    ...rows.map((r) => columns.map((c) => esc(r[c])).join(',')),
  ].join('\n');
}
