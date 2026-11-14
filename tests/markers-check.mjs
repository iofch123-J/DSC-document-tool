// Usage: node tests/markers-check.mjs <chart.xlsx>
// Re-places max-radius markers from settings and reports any difference vs the imported sheet.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { importTemplateXlsx } from '../app/core/importer.js';
import { autoMarkers, clone } from '../app/core/model.js';

const src = process.argv[2];
const { model } = await importTemplateXlsx(readFileSync(src), basename(src));
const before = clone(model.tables);
const res = autoMarkers(model);
let diff = 0;
const keys = new Set([...Object.keys(before), ...Object.keys(model.tables)]);
for (const tk of keys) {
  const a = before[tk] || {}, b = model.tables[tk] || {};
  for (const cid of new Set([...Object.keys(a), ...Object.keys(b)])) {
    for (const rk of new Set([...Object.keys(a[cid] || {}), ...Object.keys(b[cid] || {})])) {
      const x = a[cid]?.[rk], y = b[cid]?.[rk];
      if (x !== y) { diff++; console.log('diff', tk, cid, rk, x, '->', y); }
    }
  }
}
console.log('autoMarkers', res, '| cells changed vs original:', diff);
