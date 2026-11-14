// Usage: node tests/pdf-build.mjs <chart.xlsx | model.json> <out.pdf> [customer|internal] [제공처] [관리번호]
// Builds the PDF in Node with the same code the browser uses.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importTemplateXlsx } from '../app/core/importer.js';
import { buildPdf, planPages } from '../app/pdf/render.js';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PDFLib = require(join(root, 'vendor/pdf-lib.min.js'));
const fontkit = require(join(root, 'vendor/fontkit.umd.min.js'));

const [, , src, out, mode = 'customer', to = '', ctrl = ''] = process.argv;
if (!src || !out) { console.error('usage: node tests/pdf-build.mjs <xlsx|json> <out.pdf> [mode] [to] [ctrl]'); process.exit(2); }

const model = src.endsWith('.json')
  ? JSON.parse(readFileSync(src, 'utf8'))
  : (await importTemplateXlsx(readFileSync(src), basename(src))).model;

const fonts = {
  regular: readFileSync(join(root, 'fonts/Pretendard-Regular.ttf')),
  bold: readFileSync(join(root, 'fonts/Pretendard-Bold.ttf')),
  extra: readFileSync(join(root, 'fonts/Pretendard-ExtraBold.ttf')),
};
const t0 = Date.now();
const bytes = await buildPdf(model, { PDFLib, fontkit, fonts, mode, dist: to ? { to, ctrl, date: new Date().toISOString().slice(0, 10) } : {} });
writeFileSync(out, bytes);
console.log(`pages ${planPages(model).length} · ${(bytes.length / 1024).toFixed(0)} KB · ${Date.now() - t0} ms -> ${out}`);
