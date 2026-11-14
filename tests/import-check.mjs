// Usage: node tests/import-check.mjs <chart.xlsx> [out-model.json]
// Imports an existing Excel chart, prints the import report and validation summary.
// Real data files must stay outside this repository.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { importTemplateXlsx } from '../app/core/importer.js';
import { validate, CHECKS } from '../app/core/validate.js';
import { conditions, activeWinches, columns } from '../app/core/model.js';

const [, , xlsxPath, outPath] = process.argv;
if (!xlsxPath) { console.error('usage: node tests/import-check.mjs <chart.xlsx> [out.json]'); process.exit(2); }

const { model, report } = await importTemplateXlsx(readFileSync(xlsxPath), basename(xlsxPath));
console.log('model:', model.info.name, '| issue date:', model.info.issueDate);
console.log('radius:', model.settings.radius);
for (const w of activeWinches(model)) {
  const cfg = model.settings.winches[w];
  console.log(`${w}: booms`, cfg.booms.map((b) => `${b.len}${b.maxR ? `(${b.maxR})` : ''}`).join(' '),
    '| jibs', cfg.jibs.map((j) => j.len).join(' '), '| falls', JSON.stringify(cfg.falls), '| cols', columns(model, w).length);
}
console.log('areas:', model.settings.areas.map((a) => `${a.name}[${a.ranges.map((r) => r.join('~')).join(',')}]${a.perOutrigger ? '' : '(공통)'}`).join(' / '));
console.log('outriggers:', model.settings.outriggers.map((o) => o.name).join(' / '));
console.log('conditions:', conditions(model).length, '| report:', JSON.stringify(report));

const res = validate(model);
console.log(`\nvalidation: NG ${res.ng} / 확인 ${res.warn}`);
const byCode = {};
for (const i of res.issues) (byCode[i.code] ||= []).push(i);
for (const [code, list] of Object.entries(byCode)) {
  console.log(`- [${CHECKS[code].level}] ${CHECKS[code].title}: ${list.length}`);
  for (const i of list.slice(0, 6)) console.log('    ', i.msg);
}
if (outPath) { writeFileSync(outPath, JSON.stringify(model, null, 1)); console.log('\nwrote', outPath); }
