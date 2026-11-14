// Minimal .xlsx reader (values + cell fill colours). DOM-free, no dependencies.
// Uses the platform DecompressionStream, available in modern browsers and Node 18+.

const td = new TextDecoder('utf-8');

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Read every entry of a zip archive into a Map(name -> Uint8Array). */
export async function readZip(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('엑셀(xlsx) 파일이 아니거나 손상되었습니다.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip 디렉터리를 읽을 수 없습니다.');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nlen));
    const lnlen = dv.getUint16(lho + 26, true);
    const lelen = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lnlen + lelen;
    const raw = u8.subarray(start, start + csize);
    if (method === 0) out.set(name, raw.slice());
    else if (method === 8) out.set(name, await inflateRaw(raw));
    p += 46 + nlen + elen + clen;
  }
  return out;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function decodeXml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e] ?? m;
  });
}

function attrs(s) {
  const o = {};
  for (const m of s.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) o[m[1]] = decodeXml(m[2]);
  return o;
}

function section(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : '';
}

function richText(fragment) {
  const clean = fragment.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let t = '';
  for (const m of clean.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)) t += m[1] ? decodeXml(m[1]) : '';
  return t;
}

export function refToRC(ref) {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { c, r: Number(m[2]) };
}

export function colLetter(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/**
 * Read a workbook. Returns { sheets: [{ name, cells: Map("r,c" -> {v, fill}) , maxRow, maxCol }] }.
 * `fill` is a short signature of the cell's solid fill colour (or '' when none).
 */
export async function readXlsx(buf) {
  const files = await readZip(buf);
  const get = (n) => (files.has(n) ? td.decode(files.get(n)) : '');

  const shared = [];
  for (const m of get('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(richText(m[1]));

  const stylesXml = get('xl/styles.xml');
  const fills = [];
  for (const m of section(stylesXml, 'fills').matchAll(/<fill\b[^>]*>([\s\S]*?)<\/fill>|<fill\b[^>]*\/>/g)) {
    const body = m[1] || '';
    const pf = body.match(/<patternFill\b([^>]*)>|<patternFill\b([^>]*)\/>/);
    const type = pf ? attrs(pf[1] || pf[2] || '').patternType : '';
    const fg = body.match(/<fgColor\b([^>]*)\/?>/);
    if (type === 'solid' && fg) {
      const a = attrs(fg[1]);
      fills.push(a.rgb ? `rgb:${a.rgb}` : `theme:${a.theme}:${Number(a.tint || 0).toFixed(3)}`);
    } else fills.push('');
  }
  const xfFill = [];
  for (const m of section(stylesXml, 'cellXfs').matchAll(/<xf\b([^>]*?)\/?>/g)) xfFill.push(fills[Number(attrs(m[1]).fillId || 0)] || '');

  const wbXml = get('xl/workbook.xml');
  const rels = {};
  for (const m of get('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const a = attrs(m[1]);
    rels[a.Id] = a.Target;
  }
  const sheets = [];
  for (const m of wbXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const a = attrs(m[1]);
    let target = rels[a['r:id']] || '';
    target = target.replace(/^\//, '');
    if (!target.startsWith('xl/')) target = `xl/${target}`;
    const xml = get(target);
    const cells = new Map();
    let maxRow = 0, maxCol = 0;
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ca = attrs(c[1]);
      const body = c[2] || '';
      const { r, c: col } = refToRC(ca.r);
      const vm = body.match(/<v>([\s\S]*?)<\/v>/);
      let v = null;
      if (ca.t === 's' && vm) v = shared[Number(vm[1])] ?? '';
      else if (ca.t === 'inlineStr') v = richText(body);
      else if (ca.t === 'str' && vm) v = decodeXml(vm[1]);
      else if (ca.t === 'b' && vm) v = vm[1] === '1';
      else if (vm) { const n = Number(vm[1]); v = Number.isFinite(n) ? n : decodeXml(vm[1]); }
      const fill = xfFill[Number(ca.s || 0)] || '';
      if (v === null && !fill) continue;
      cells.set(`${r},${col}`, { v, fill });
      if (r > maxRow) maxRow = r;
      if (col > maxCol) maxCol = col;
    }
    sheets.push({ name: a.name, cells, maxRow, maxCol });
  }
  return { sheets };
}
