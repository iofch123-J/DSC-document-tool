// Product catalog for the user screen: 분류 → 제품명 → Sub Winch → Sub Boom.
//
// Source 1 (preferred): the product DB imported on the admin side from the
//   "개발 DATABASE" Excel (columns: No. · 분류 · 제품명 · Sub Winch · Sub Boom).
// Source 2 (fallback when no DB is imported): options derived from the registered
//   chart data (Sub Winch = 없음 + aux capacities, Sub Boom = 없음 + S/B lengths).
// Rated-load data is always linked by 제품명 = registered model name.
import { readXlsx } from './xlsx.js';
import { modelOptions } from './variant.js';

export const PRODUCT_DB = 'productDb';
export const keyOf = (s) => String(s ?? '').trim().toUpperCase();
const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

const HEAD = {
  product: /^(제품명|기종|모델명?|model|product)$/,
  subWinch: /^(subwinch|서브윈치|보조윈치)$/,
  subBoom: /^(subboom|서브붐|s\/b|sb)$/,
  category: /^(분류|구분|category)$/,
  no: /^(no\.?|번호)$/,
};

/** Read the product DB workbook: finds the header row (제품명 / Sub Winch / Sub Boom [/ 분류 / No.]). */
export async function parseProductDb(buf, fileName = '') {
  const wb = await readXlsx(buf);
  return parseProductSheets(wb.sheets.map((sh) => ({
    name: sh.name, maxRow: sh.maxRow, maxCol: sh.maxCol, get: (r, c) => str(sh.cells.get(`${r},${c}`)?.v),
  })), fileName);
}

/** Same, from already-read sheets: [{ name, maxRow, maxCol, get(r, c) → string }] (Excel file or Google Sheet). */
export function parseProductSheets(sheets, fileName = '') {
  for (const sh of sheets) {
    const get = (r, c) => str(sh.get(r, c));
    for (let r = 1; r <= Math.min(sh.maxRow, 60); r++) {
      const cols = {};
      for (let c = 1; c <= sh.maxCol; c++) {
        const t = get(r, c).replace(/\s+/g, '').toLowerCase();
        for (const [k, re] of Object.entries(HEAD)) if (t && !cols[k] && re.test(t)) cols[k] = c;
      }
      if (!(cols.product && cols.subWinch && cols.subBoom)) continue;
      const rows = [];
      for (let rr = r + 1; rr <= sh.maxRow; rr++) {
        const product = get(rr, cols.product);
        if (!product) continue;
        rows.push({
          no: cols.no ? get(rr, cols.no) : String(rows.length + 1),
          category: cols.category ? get(rr, cols.category) : '',
          product,
          subWinch: get(rr, cols.subWinch) || '없음',
          subBoom: get(rr, cols.subBoom) || '없음',
        });
      }
      const warnings = [];
      const seen = new Set();
      for (const x of rows) {
        const k = [x.product, x.subWinch, x.subBoom].map(keyOf).join('|');
        if (seen.has(k)) warnings.push(`중복 구성: ${x.product} · ${x.subWinch} · ${x.subBoom} (No.${x.no})`);
        seen.add(k);
      }
      const cats = new Map();
      for (const x of rows) if (x.category) {
        const prev = cats.get(keyOf(x.product));
        if (prev && prev !== x.category) warnings.push(`${x.product}: 분류가 행마다 다릅니다 (${prev} / ${x.category})`);
        cats.set(keyOf(x.product), x.category);
      }
      if (!rows.length) throw new Error(`시트 '${sh.name}'에 제품 행이 없습니다.`);
      return { fileName, sheet: sh.name, importedAt: new Date().toISOString(), rows, warnings };
    }
  }
  throw new Error("'제품명', 'Sub Winch', 'Sub Boom' 머리글이 있는 시트를 찾지 못했습니다.");
}

/** Group DB rows into products (keeps the DB order). */
export function productsFromRows(rows) {
  const map = new Map();
  for (const r of rows) {
    let p = map.get(keyOf(r.product));
    if (!p) { p = { name: r.product, category: r.category || '', subWinches: [] }; map.set(keyOf(r.product), p); }
    let sw = p.subWinches.find((s) => keyOf(s.label) === keyOf(r.subWinch));
    if (!sw) { sw = { label: r.subWinch, subBooms: [] }; p.subWinches.push(sw); }
    if (!sw.subBooms.some((b) => keyOf(b) === keyOf(r.subBoom))) sw.subBooms.push(r.subBoom);
  }
  return [...map.values()];
}

export function dbStats(db) {
  const products = productsFromRows(db.rows);
  const byCat = new Map();
  for (const p of products) byCat.set(p.category || '미분류', (byCat.get(p.category || '미분류') || 0) + 1);
  return { configs: db.rows.length, products, byCat };
}

/** store: storage backend · models: registered models (newest first). */
export async function loadCatalog(store, models = []) {
  const db = store.getMeta ? await store.getMeta(PRODUCT_DB) : null;
  if (db?.rows?.length) return { source: 'db', db, products: productsFromRows(db.rows), rows: db.rows };

  const products = [];
  const seen = new Set();
  for (const m of models) {
    const k = keyOf(m.info.name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    products.push({ name: m.info.name, category: '', subWinches: modelOptions(m).map((o) => ({ label: o.label, subBooms: o.subBooms })) });
  }
  products.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const rows = [];
  for (const p of products) for (const sw of p.subWinches) for (const sb of sw.subBooms) {
    rows.push({ no: String(rows.length + 1), category: '', product: p.name, subWinch: sw.label, subBoom: sb });
  }
  return { source: 'models', db: null, products, rows };
}
