// Builds the rated-load-chart PDF entirely in the browser (or Node) with pdf-lib.
// Layout: A4 landscape. Page 1 = cover, then one page per condition (main + aux side by side,
// or one page per winch when the columns do not fit).

import {
  conditions, activeWinches, columns, radii, rKey, tableKey, getCell, cellKind,
  isHighFalls, isVariation, lastUsedRowIndex, referenceCondition, auxWinches, winchTitle, winchShort,
} from '../core/model.js';
import { areaDiagram, outriggerDiagram } from './diagrams.js';
import { validate, issueIndex } from '../core/validate.js';

const PAGE = { w: 841.89, h: 595.28 };
const M = { l: 28, r: 28, t: 24, b: 20 };
const RIGHT = PAGE.w - M.r;
const AVAIL = PAGE.w - M.l - M.r;
const RADW = 40;
const GAP = 16;

const HEX = {
  navy: '#14304D', navy2: '#22476D', navy3: '#3C5F84', steel: '#E4EAF1', steel2: '#F3F6F9',
  head1: '#D4DDE7', line: '#C3CDD8', line2: '#DCE2E9', rule5: '#8D9DAF', ink: '#18212C',
  muted: '#66727F', amber: '#E0940F', amberT: '#FBE2A9', blueT: '#D2E3F4', red: '#C2362B',
  zebra: '#F6F8FA', na: '#F1F3F6', white: '#FFFFFF', body: '#34404D',
};

const dots = (iso) => String(iso || '').replace(/-/g, '.');

export function planPages(model) {
  const ws = activeWinches(model);
  const n = ws.map((w) => columns(model, w).length);
  // main + one aux side by side when they fit; otherwise (or with several aux winches) one page per winch
  const combined = ws.length === 1 || (ws.length === 2 && (AVAIL - GAP - 2 * RADW) / (n[0] + n[1]) >= 31);
  const pages = [{ type: 'cover' }];
  for (const c of conditions(model)) {
    if (combined) pages.push({ type: 'cond', cond: c, winches: ws });
    else ws.forEach((w) => pages.push({ type: 'cond', cond: c, winches: [w] }));
  }
  pages.forEach((p, i) => { p.no = i + 1; });
  return pages;
}

function coverStats(model) {
  const conds = conditions(model);
  const stat = (w) => {
    let maxLoad = null, maxLoadR = null, maxMark = null;
    for (const c of conds) for (const col of columns(model, w)) for (const r of radii(model)) {
      const k = cellKind(getCell(model, tableKey(c.key, w), col.id, r));
      if (k.type === 'num' && (maxLoad === null || k.v > maxLoad)) { maxLoad = k.v; maxLoadR = r; }
      if (k.type === 'mark' && col.kind === 'boom' && (maxMark === null || k.v > maxMark)) maxMark = k.v;
    }
    if (maxMark === null) {
      const set = model.settings.winches[w].booms.map((b) => Number(b.maxR)).filter((x) => x > 0);
      if (set.length) maxMark = Math.max(...set);
    }
    return { maxLoad, maxLoadR, maxMark };
  };
  const aux = auxWinches(model)[0];
  return { main: model.settings.winches.main?.enabled ? stat('main') : null, aux: aux ? stat(aux) : null, auxKey: aux || null };
}

function firstMarker(model) {
  for (const c of conditions(model)) for (const w of activeWinches(model)) for (const col of columns(model, w)) for (const r of radii(model)) {
    const k = cellKind(getCell(model, tableKey(c.key, w), col.id, r));
    if (k.type === 'mark') return `(${k.v.toFixed(1)})`;
  }
  return '( )';
}

export async function buildPdf(model, opts) {
  const { PDFLib, fontkit, fonts, mode = 'customer', dist = {} } = opts;
  const { PDFDocument, rgb, degrees } = PDFLib;
  const col = (hex) => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
  const K = Object.fromEntries(Object.entries(HEX).map(([k, v]) => [k, col(v)]));

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const F = {
    r: await doc.embedFont(fonts.regular, { subset: true }),
    b: await doc.embedFont(fonts.bold, { subset: true }),
    x: await doc.embedFont(fonts.extra || fonts.bold, { subset: true }),
  };
  const info = model.info;
  doc.setTitle(`${info.name} ${info.title} Rev.${info.rev}`);
  doc.setSubject(info.titleEn || 'Rated load chart');
  doc.setCreator('DSC Document Tool');
  doc.setProducer('DSC Document Tool (pdf-lib)');

  let logo = null;
  if (info.logo && /^data:image\/(png|jpe?g);base64,/.test(info.logo)) {
    const b64 = info.logo.split(',')[1];
    const bytes = typeof atob === 'function' ? Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) : Uint8Array.from(Buffer.from(b64, 'base64'));
    logo = info.logo.includes('image/png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  }

  const plan = planPages(model);
  const N = plan.length;
  // internal copies outline the cells that fail a check
  const ngCells = mode === 'internal' ? issueIndex(validate(model)) : null;
  const distText = [dist.to && `제공처 ${dist.to}`, dist.ctrl && `관리번호 ${dist.ctrl}`, dist.date && `제공일 ${dots(dist.date)}`].filter(Boolean).join(' · ');
  const watermark = mode === 'internal' ? 'INTERNAL · 내부용' : dist.to ? `${dist.to} 제공용${dist.ctrl ? ` · ${dist.ctrl}` : ''}` : '';

  for (const pg of plan) {
    const page = doc.addPage([PAGE.w, PAGE.h]);
    const P = makePen(page, F, K, rgb, degrees);
    if (pg.type === 'cover') drawCover(P, model, plan, N, logo, dist, coverStats(model));
    else {
      drawHeader(P, model, pg.no, N, logo);
      drawBand(P, 75, model, pg.cond, mode, pg.winches);
      const notesH = notesHeight(P, model);
      const footerTop = PAGE.h - M.b - 13;
      const notesTop = footerTop - 7 - notesH;
      const tablesTop = 156;
      drawTables(P, model, pg, mode, tablesTop, notesTop - 7, ngCells);
      if (notesH) drawNotes(P, model, notesTop);
      drawFooter(P, model, pg.no, N, distText);
      if (watermark) P.watermark(watermark, PAGE.w / 2, (tablesTop + notesTop) / 2);
    }
  }
  return doc.save();
}

// ---------------------------------------------------------------------------------- pen
function makePen(page, F, K, rgb, degrees) {
  const H = PAGE.h;
  const measure = (s, f = 'r', size = 9, spacing = 0) => F[f].widthOfTextAtSize(String(s), size) + spacing * Math.max(0, String(s).length - 1);
  const P = {
    K, F, page, measure,
    rect(x, y, w, h, { fill, stroke, sw = 0.6, opacity } = {}) {
      const o = { x, y: H - y - h, width: w, height: h, borderWidth: stroke ? sw : 0 };
      if (fill) o.color = fill;
      if (stroke) o.borderColor = stroke;
      if (opacity !== undefined) { o.opacity = opacity; o.borderOpacity = opacity; }
      page.drawRectangle(o);
    },
    line(x1, y1, x2, y2, color, w = 0.5, dash) {
      const o = { start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness: w, color };
      if (dash) o.dashArray = dash;
      page.drawLine(o);
    },
    /** draw text with its baseline at top-coordinate `base`; returns width */
    text(s, x, base, { f = 'r', size = 9, color = K.ink, spacing = 0, opacity, align = 'left' } = {}) {
      s = String(s ?? '');
      if (!s) return 0;
      const w = measure(s, f, size, spacing);
      let x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
      const o = { y: H - base, size, font: F[f], color };
      if (opacity !== undefined) o.opacity = opacity;
      if (!spacing) page.drawText(s, { ...o, x: x0 });
      else for (const ch of s) { page.drawText(ch, { ...o, x: x0 }); x0 += F[f].widthOfTextAtSize(ch, size) + spacing; }
      return w;
    },
    /** text centred vertically in a box, shrunk to fit its width */
    tb(s, x, y, w, h, { align = 'center', pad = 3, f = 'r', size = 8, color = K.ink, spacing = 0, opacity } = {}) {
      s = String(s ?? '');
      let sz = size;
      while (sz > 4.5 && measure(s, f, sz, spacing) > w - 2 * pad) sz -= 0.25;
      const base = y + h / 2 + sz * 0.36;
      const xx = align === 'right' ? x + w - pad : align === 'left' ? x + pad : x + w / 2;
      return P.text(s, xx, base, { f, size: sz, color, spacing, opacity, align });
    },
    wrap(s, f, size, maxW) {
      const out = [];
      let line = '';
      for (const word of String(s).split(/(\s+)/)) {
        if (measure(line + word, f, size) <= maxW) { line += word; continue; }
        if (line.trim()) out.push(line.trimEnd());
        line = '';
        for (const ch of word.trimStart()) {
          if (measure(line + ch, f, size) > maxW && line) { out.push(line); line = ''; }
          line += ch;
        }
      }
      if (line.trim()) out.push(line.trimEnd());
      return out;
    },
    shapes(dg, x, y, w) {
      y -= (dg.y0 || 0) * (w / dg.w); // cropped diagrams start below y = 0
      const s = w / dg.w;
      for (const it of dg.items) {
        if (it.text !== undefined) {
          const hex = it.color || HEX.navy;
          P.text(it.text, x + it.x * s, y + it.y * s, {
            f: it.bold ? 'b' : 'r', size: it.size * s, align: it.anchor === 'middle' ? 'center' : 'left',
            color: rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255),
          });
          continue;
        }
        const o = { x, y: H - y, scale: s };
        const c = (hex) => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
        if (it.fill) { o.color = c(it.fill); if (it.opacity !== undefined) o.opacity = it.opacity; }
        if (it.stroke) { o.borderColor = c(it.stroke); o.borderWidth = it.sw || 1; if (it.dash) o.borderDashArray = [3, 3]; }
        if (!it.fill && !it.stroke) continue;
        page.drawSvgPath(it.d, o);
      }
    },
    watermark(s, cx, cy) {
      const size = 25;
      const w = measure(s, 'x', size);
      const th = (13 * Math.PI) / 180;
      page.drawText(s, {
        x: cx - (w / 2) * Math.cos(th), y: H - cy - (w / 2) * Math.sin(th), size, font: F.x,
        color: K.navy, opacity: 0.055, rotate: degrees(13),
      });
    },
  };
  return P;
}

// ------------------------------------------------------------------------------- header
function drawHeader(P, model, n, N, logo) {
  const { K } = P;
  const info = model.info;
  const y = M.t;
  let x = M.l;
  if (logo) {
    const s = Math.min(80 / logo.width, 30 / logo.height);
    P.page.drawImage(logo, { x, y: PAGE.h - (y + 3) - logo.height * s, width: logo.width * s, height: logo.height * s });
    x += logo.width * s + 16;
  }
  P.text(info.title, x, y + 19, { f: 'x', size: 16.5, color: K.navy, spacing: 0.8 });
  P.text(info.titleEn, x, y + 31, { f: 'b', size: 6.8, color: K.muted, spacing: 2.3 });

  const meta = [['문서번호', info.docNo || '—'], ['개정 / 발행일', `Rev.${info.rev || '00'} · ${dots(info.issueDate)}`], ['페이지', `${n} / ${N}`]];
  if (info.variant) meta.splice(2, 0, ['적용 사양', info.variant]);
  const lw = Math.max(...meta.map(([l]) => P.measure(l, 'r', 6.8)));
  const vw = Math.max(...meta.map(([, v]) => P.measure(v, 'b', 6.8)));
  const mx = RIGHT - vw - 14 - lw;
  const step = meta.length > 3 ? 8.6 : 10;
  const top = meta.length > 3 ? 8 : 10;
  meta.forEach(([l, v], i) => {
    P.text(l, mx, y + top + i * step, { size: 6.8, color: K.muted });
    P.text(v, RIGHT, y + top + i * step, { f: 'b', size: 6.8, color: K.ink, align: 'right' });
  });
  const dx = mx - 14;
  P.line(dx, y + 2, dx, y + 34, K.line2, 0.7);
  P.text('MODEL', dx - 16, y + 10, { f: 'b', size: 6.2, color: K.muted, spacing: 2.4, align: 'right' });
  P.text(info.name, dx - 16, y + 31, { f: 'x', size: 19, color: K.navy, align: 'right' });

  P.rect(M.l, y + 41, AVAIL, 2, { fill: K.navy });
  P.rect(M.l, y + 41, 100, 2, { fill: K.amber });
}

// --------------------------------------------------------------------------------- band
function drawBand(P, y, model, cond, mode, winches) {
  const { K } = P;
  const h = 72;
  const tile = (x, dg, dW, lines) => {
    const dH = (dW * dg.h) / dg.w;
    const tw = Math.max(P.measure(lines[0], 'b', 6.2, 1), P.measure(lines[1], 'x', 15), P.measure(lines[2], 'b', 9.5));
    const w = 3.7 + 6 + dW + 11 + tw + 12;
    P.rect(x, y, w, h, { fill: K.steel2, stroke: K.line, sw: 0.6 });
    P.rect(x, y, 3.7, h, { fill: K.navy });
    const bx = x + 3.7 + 6, by = y + (h - dH) / 2;
    P.rect(bx, by, dW, dH, { fill: K.white, stroke: K.line2, sw: 0.5 });
    P.shapes(dg, bx, by, dW);
    const tx = bx + dW + 11;
    P.text(lines[0], tx, y + 22, { f: 'b', size: 6.2, color: K.muted, spacing: 1 });
    P.text(lines[1], tx, y + 43, { f: 'x', size: 15, color: K.navy });
    P.text(lines[2], tx, y + 58, { f: 'b', size: 9.5, color: K.navy3 });
    return x + w;
  };
  const ranges = (cond.area.ranges || []).map(([a, b]) => `${a}° ~ ${b}°`).join(', ');
  let x = tile(M.l, areaDiagram(model.settings.areas, cond.area.id), 88, ['작업영역  WORKING AREA', cond.area.name, ranges]);
  const o = cond.outrigger;
  const pct = o ? (o.pct ?? 1) : 'all';
  const orDg = outriggerDiagram(pct);   // ≈ 59.5 pt tall, width follows the drawing
  x = tile(x + 8, orDg, (59.5 * orDg.w) / orDg.h, ['아우트리거  OUTRIGGER', o ? o.name : '전 구간 공통', o ? o.short || '' : '모든 신장 상태 동일']);

  // legend
  const lx = x + 8, lw = RIGHT - lx;
  P.rect(lx, y, lw, h, { stroke: K.line, sw: 0.6 });
  P.text('범례  LEGEND', lx + 10, y + 15, { f: 'b', size: 6.2, color: K.muted, spacing: 1 });
  const entries = [];
  const fallsW = winches.filter((w) => model.settings.winches[w].falls?.threshold !== null && model.settings.winches[w].falls?.threshold !== undefined && model.settings.winches[w].falls?.threshold !== '');
  if (fallsW.length) {
    const hi = fallsW.map((w) => `${model.settings.winches[w].label.replace(' 윈치', '')} ${model.settings.winches[w].falls.high}`).join(' · ');
    const lo = fallsW.map((w) => `${model.settings.winches[w].label.replace(' 윈치', '')} ${model.settings.winches[w].falls.base}`).join(' · ');
    entries.push({ fill: K.amberT, sample: model.settings.winches[fallsW[0]].falls.high, bold: true, text: `줄걸이 증가 구간 — ${hi} (그 외: ${lo})` });
  }
  entries.push({ fill: K.white, sample: firstMarker(model), muted: true, text: '해당 붐 길이의 최대 작업반경 (m)' });
  entries.push({ fill: K.na, sample: '', text: '작업 불가 구간' });
  if (mode === 'internal') {
    const ref = referenceCondition(model);
    entries.push({ fill: K.blueT, sample: '', text: `변동구간 — ${ref ? `${ref.area.name}·${ref.outrigger ? ref.outrigger.name : '전 구간'}` : '기준'} 대비 하중 감소 (내부용)` });
  }
  const step = entries.length > 3 ? 12 : 14;
  entries.forEach((e, i) => {
    const base = y + 30 + i * step;
    P.rect(lx + 10, base - 8.2, 26, 10.4, { fill: e.fill, stroke: K.line, sw: 0.5 });
    if (e.sample) P.tb(e.sample, lx + 10, base - 8.2, 26, 10.4, { f: e.bold ? 'b' : 'r', size: 6.3, color: e.muted ? K.muted : K.ink, pad: 1 });
    P.text(e.text, lx + 42, base, { size: 7.2, color: K.ink });
  });
}

// ------------------------------------------------------------------------------- tables
function drawTables(P, model, pg, mode, top, bottom, ngCells) {
  const ws = pg.winches;
  const cols = ws.map((w) => columns(model, w));
  const nTot = cols.reduce((n, c) => n + c.length, 0);
  let colW;
  if (ws.length === 2) colW = (AVAIL - GAP - 2 * RADW) / nTot;
  else colW = Math.min(88, (AVAIL - RADW) / Math.max(1, nTot));

  const all = radii(model);
  const last = lastUsedRowIndex(model);
  const rows = all.slice(0, Math.max(last + 1, Math.min(all.length, 10)));
  const avail = bottom - (top + 18 + 26);
  const rowH = Math.max(7, Math.min(15, avail / Math.max(1, rows.length)));
  const fs = Math.max(5, Math.min(8.4, rowH * 0.6));

  let x = M.l;
  ws.forEach((w, i) => {
    const width = drawTable(P, model, { x, y: top, winch: w, cond: pg.cond, cols: cols[i], rows, rowH, colW, fs, mode, ngCells });
    x += width + GAP;
  });
}

function drawTable(P, model, { x, y, winch, cond, cols, rows, rowH, colW, fs, mode, ngCells }) {
  const { K } = P;
  const cfg = model.settings.winches[winch];
  const w = RADW + cols.length * colW;
  const tk = tableKey(cond.key, winch);

  // title bar
  P.rect(x, y, w, 18, { fill: K.navy });
  let tx = x + 7;
  tx += P.text(winchTitle(cfg), tx, y + 12.6, { f: 'x', size: 9.5, color: K.white }) + 7;
  P.text(cfg.labelEn || '', tx, y + 12.2, { f: 'b', size: 6.1, color: K.white, spacing: 1.4, opacity: 0.72 });
  P.text(`정격하중 (${model.info.unit || 'kg'})`, x + w - 7, y + 12.3, { size: 6.8, color: K.white, align: 'right' });

  // header
  const yh = y + 18, h1 = 13, h2 = 13;
  const booms = cols.filter((c) => c.kind === 'boom');
  const jibs = cols.filter((c) => c.kind === 'jib');
  P.rect(x, yh, RADW, h1 + h2, { fill: K.navy2 });
  P.text('작업반경', x + RADW / 2, yh + 11.6, { f: 'b', size: 6.5, color: K.white, align: 'center' });
  P.text('(m)', x + RADW / 2, yh + 20.8, { f: 'b', size: 6.5, color: K.white, align: 'center' });
  const bx = x + RADW;
  if (booms.length) {
    P.rect(bx, yh, booms.length * colW, h1, { fill: K.head1 });
    P.tb('붐 길이  BOOM LENGTH (m)', bx, yh, booms.length * colW, h1, { f: 'b', size: 6.8, color: K.navy });
  }
  if (jibs.length) {
    P.rect(bx + booms.length * colW, yh, jibs.length * colW, h1, { fill: K.head1 });
    P.tb(`${jibs[0].label || 'S/B'} (m)`, bx + booms.length * colW, yh, jibs.length * colW, h1, { f: 'b', size: 6.8, color: K.navy });
  }
  cols.forEach((c, i) => {
    P.rect(bx + i * colW, yh + h1, colW, h2, { fill: K.steel });
    P.tb(c.header, bx + i * colW, yh + h1, colW, h2, { f: 'b', size: 7.4, color: K.navy });
  });

  // body
  const yb = yh + h1 + h2;
  rows.forEach((r, ri) => {
    const ry = yb + ri * rowH;
    P.rect(x, ry, RADW, rowH, { fill: K.steel });
    P.tb(rKey(r), x, ry, RADW, rowH, { f: 'b', size: fs, color: K.navy });
    cols.forEach((c, ci) => {
      const cx = bx + ci * colW;
      const k = cellKind(getCell(model, tk, c.id, r));
      if (k.type === 'num') {
        const hi = isHighFalls(model, winch, k.v);
        const vr = mode === 'internal' && isVariation(model, cond.key, winch, c.id, r, k.v);
        const fill = hi ? K.amberT : vr ? K.blueT : ri % 2 ? K.zebra : null;
        if (fill) P.rect(cx, ry, colW, rowH, { fill });
        P.tb(k.v.toLocaleString('en-US'), cx, ry, colW, rowH, { align: 'right', pad: 6, f: hi ? 'b' : 'r', size: fs, color: K.ink });
      } else if (k.type === 'mark') {
        P.tb(`(${k.v.toFixed(1)})`, cx, ry, colW, rowH, { size: fs - 0.8, color: K.muted });
      } else if (k.type === 'bad') {
        P.tb(k.text, cx, ry, colW, rowH, { size: fs, color: K.red });
      } else {
        P.rect(cx, ry, colW, rowH, { fill: K.na });
      }
    });
  });

  // grid lines
  const yEnd = yb + rows.length * rowH;
  for (let i = 1; i < rows.length; i++) {
    const strong = Math.abs(rows[i - 1] % 5) < 1e-9;
    P.line(x, yb + i * rowH, x + w, yb + i * rowH, strong ? K.rule5 : K.line2, strong ? 0.8 : 0.45);
  }
  for (let i = 1; i < cols.length; i++) P.line(bx + i * colW, yh + h1, bx + i * colW, yEnd, K.line2, 0.45);
  if (jibs.length && booms.length) P.line(bx + booms.length * colW, yh, bx + booms.length * colW, yEnd, K.line, 0.6);
  P.line(bx, yh, bx, yEnd, K.line, 0.6);
  P.line(bx, yh + h1, x + w, yh + h1, K.line, 0.45);
  P.line(x, yb, x + w, yb, K.line, 0.6);
  P.rect(x, yh, w, yEnd - yh, { stroke: K.line, sw: 0.8 });

  if (ngCells) {
    rows.forEach((r, ri) => cols.forEach((c, ci) => {
      const list = ngCells.get(`${cond.key}|${winch}|${c.id}|${rKey(r)}`);
      if (list && list.some((i) => i.level === 'ng')) P.rect(bx + ci * colW + 0.8, yb + ri * rowH + 0.8, colW - 1.6, rowH - 1.6, { stroke: K.red, sw: 1.4 });
    }));
  }
  return w;
}

// -------------------------------------------------------------------------------- notes
function notesLayout(P, model) {
  const notes = (model.info.notes || []).map((s) => String(s).trim()).filter(Boolean);
  const colX = M.l + 92;
  const colW = (RIGHT - colX - 18) / 2;
  const items = notes.map((s, i) => P.wrap(`${i + 1}. ${s}`, 'r', 6.9, colW));
  const rows = [];
  for (let i = 0; i < items.length; i += 2) rows.push(Math.max(items[i].length, items[i + 1]?.length || 0));
  return { items, rows, colX, colW };
}
function notesHeight(P, model) {
  const L = notesLayout(P, model);
  if (!L.items.length) return 0;
  return 4 + L.rows.reduce((a, b) => a + b, 0) * 10;
}
function drawNotes(P, model, y) {
  const { K } = P;
  const L = notesLayout(P, model);
  P.text('작업 시 유의사항', M.l, y + 8, { f: 'b', size: 7.4, color: K.navy });
  let ry = y;
  for (let r = 0; r < L.rows.length; r++) {
    [0, 1].forEach((k) => {
      const lines = L.items[r * 2 + k];
      if (!lines) return;
      lines.forEach((ln, j) => P.text(ln, L.colX + k * (L.colW + 18), ry + 8 + j * 10, { size: 6.9, color: K.body }));
    });
    ry += L.rows[r] * 10;
  }
}

// ------------------------------------------------------------------------------- footer
function drawFooter(P, model, n, N, distText) {
  const { K } = P;
  const yl = PAGE.h - M.b - 13;
  P.rect(M.l, yl, AVAIL, 1.2, { fill: K.navy });
  const base = yl + 11;
  const tag = '대외비 CONFIDENTIAL';
  const tw = P.measure(tag, 'b', 6.5, 0.3) + 9;
  P.rect(M.l, yl + 3.6, tw, 10, { fill: K.navy });
  P.text(tag, M.l + 4.5, base, { f: 'b', size: 6.5, color: K.white, spacing: 0.3 });
  const pgs = `${n} / ${N}`;
  const pw = P.measure(pgs, 'x', 7.5);
  P.text(pgs, RIGHT, base + 0.4, { f: 'x', size: 7.5, color: K.navy, align: 'right' });
  P.line(RIGHT - pw - 8, yl + 4.5, RIGHT - pw - 8, yl + 13, K.line, 0.6);
  let rightEdge = RIGHT - pw - 16;
  if (distText) rightEdge -= P.text(distText, rightEdge, base, { f: 'b', size: 6.4, color: K.ink, align: 'right' }) + 10;
  const cx = M.l + tw + 8;
  let size = 6.4;
  const conf = model.info.confidential || '';
  while (size > 4.6 && P.measure(conf, 'r', size) > rightEdge - cx) size -= 0.2;
  P.text(conf, cx, base, { size, color: K.muted });
}

// -------------------------------------------------------------------------------- cover
function drawCover(P, model, plan, N, logo, dist, st) {
  const { K } = P;
  const info = model.info;
  const S = model.settings;
  const LW = 438; // left column width
  const RX = 497, RW = RIGHT - RX;

  // top strip
  if (logo) {
    const s = Math.min(90 / logo.width, 32 / logo.height);
    P.page.drawImage(logo, { x: M.l, y: PAGE.h - (M.t + 2) - logo.height * s, width: logo.width * s, height: logo.height * s });
  }
  const conf = '대외비 · CONFIDENTIAL';
  const cw = P.measure(conf, 'b', 7.5, 1.2) + 20;
  P.rect(RIGHT - cw, M.t + 4, cw, 15, { fill: K.navy });
  P.text(conf, RIGHT - cw + 10, M.t + 14.2, { f: 'b', size: 7.5, color: K.white, spacing: 1.2 });

  // title block
  P.text(info.titleEn, M.l, 82, { f: 'x', size: 8, color: K.amber, spacing: 4 });
  P.text(info.title, M.l, 124, { f: 'x', size: 38, color: K.navy, spacing: 2.5 });
  const wl = activeWinches(model).map((w) => winchTitle(S.winches[w])).join(' · ');
  P.text(`${info.subtitle || ''}${wl ? ` — ${wl}` : ''}`, M.l, 144, { size: 9.5, color: K.body });
  P.text('MODEL', M.l, 198, { f: 'b', size: 7, color: K.muted, spacing: 3 });
  const nw = P.text(info.name, M.l + 52, 198, { f: 'x', size: 40, color: K.navy });
  P.rect(M.l + 52, 203, nw, 4.5, { fill: K.amber });

  // spec cells
  const main = S.winches.main;
  const lens = main.booms.map((b) => Number(b.len)).filter((x) => x > 0);
  const specs = [
    ['최대 정격하중', st.main?.maxLoad != null ? st.main.maxLoad.toLocaleString('en-US') : '—', info.unit || 'kg', st.main?.maxLoadR != null ? `작업반경 ${rKey(st.main.maxLoadR)} m` : ''],
    [`붐 길이 (${main.label.replace(' 윈치', '')})`, lens.length ? `${lens[0]} – ${lens[lens.length - 1]}` : '—', 'm', `${lens.length}종`],
    ['최대 작업반경', st.main?.maxMark != null ? String(st.main.maxMark) : '—', 'm', st.aux?.maxMark != null ? `${winchTitle(S.winches[st.auxKey])} ${st.aux.maxMark.toFixed(1)} m` : ''],
    ['작업조건', `${S.areas.length}`, `영역 × ${S.outriggers.length} 단계`, '작업영역 × 아우트리거'],
  ];
  const sy = 226, sh = 48, sw = LW / 4;
  P.rect(M.l, sy, LW, 1.7, { fill: K.navy });
  P.line(M.l, sy + sh, M.l + LW, sy + sh, K.line, 0.6);
  specs.forEach(([l, v, u, sub], i) => {
    const x = M.l + i * sw;
    if (i) P.line(x, sy + 4, x, sy + sh, K.line2, 0.6);
    P.text(l, x + 8, sy + 15, { size: 6.6, color: K.muted });
    const vw = P.text(v, x + 8, sy + 33, { f: 'x', size: 13, color: K.navy });
    P.text(u, x + 8 + vw + 3, sy + 33, { f: 'b', size: 7.5, color: K.navy3 });
    P.text(sub, x + 8, sy + 43.5, { size: 6.6, color: K.muted });
  });

  // chart index
  let y = 298;
  const tw = P.text('조건별 페이지 안내', M.l, y, { f: 'x', size: 10, color: K.navy });
  P.text('CHART INDEX', M.l + tw + 8, y, { f: 'b', size: 6.4, color: K.muted, spacing: 2.2 });
  y += 7;
  const ors = S.outriggers;
  const c0 = LW * 0.3, cw2 = (LW - c0) / Math.max(1, ors.length);
  P.rect(M.l, y, LW, 22, { fill: K.navy });
  P.tb('작업영역 / 아우트리거', M.l, y, c0, 22, { align: 'left', pad: 8, f: 'b', size: 7.6, color: K.white });
  ors.forEach((o, i) => {
    P.text(o.name, M.l + c0 + i * cw2 + cw2 / 2, y + 10.5, { f: 'b', size: 7.6, color: K.white, align: 'center' });
    P.text(o.short || '', M.l + c0 + i * cw2 + cw2 / 2, y + 18.5, { size: 6, color: K.white, align: 'center', opacity: 0.8 });
  });
  y += 22;
  const pagesOf = (key) => {
    const nums = plan.filter((p) => p.cond?.key === key).map((p) => p.no);
    return nums.length > 1 ? `${nums[0]}–${nums[nums.length - 1]}` : String(nums[0] ?? '—');
  };
  const winchTag = activeWinches(model).map((w) => S.winches[w].label.replace(' 윈치', '')).join(' / ');
  const rowH = 26;
  for (const a of S.areas) {
    P.rect(M.l, y, c0, rowH, { fill: K.steel });
    const aw = P.text(a.name, M.l + 8, y + 16.5, { f: 'x', size: 9, color: K.navy });
    P.text((a.ranges || []).map(([p, q]) => `${p}° ~ ${q}°`).join(' · '), M.l + 8 + aw + 5, y + 16.5, { f: 'b', size: 6.3, color: K.navy3 });
    if (a.perOutrigger) {
      ors.forEach((o, i) => {
        const cx = M.l + c0 + i * cw2;
        const num = pagesOf(`${a.id}|${o.id}`);
        const nwid = P.measure(num, 'x', 13), twid = P.measure(`p · ${winchTag}`, 'r', 6.5);
        const sx = cx + (cw2 - nwid - 4 - twid) / 2;
        P.text(num, sx, y + 18, { f: 'x', size: 13, color: K.navy });
        P.text(`p · ${winchTag}`, sx + nwid + 4, y + 17.5, { size: 6.5, color: K.muted });
      });
    } else {
      P.rect(M.l + c0, y, LW - c0, rowH, { fill: K.steel2 });
      const num = pagesOf(`${a.id}|all`);
      const label = `p · ${winchTag} — 아우트리거 전 구간 공통`;
      const nwid = P.measure(num, 'x', 13), twid = P.measure(label, 'r', 6.5);
      const sx = M.l + c0 + (LW - c0 - nwid - 4 - twid) / 2;
      P.text(num, sx, y + 18, { f: 'x', size: 13, color: K.navy });
      P.text(label, sx + nwid + 4, y + 17.5, { size: 6.5, color: K.muted });
    }
    y += rowH;
  }
  // index grid lines
  const iy0 = 305, iy1 = y;
  for (let yy = iy0 + 22 + rowH; yy < iy1; yy += rowH) P.line(M.l, yy, M.l + LW, yy, K.line, 0.6);
  P.line(M.l + c0, iy0, M.l + c0, iy1, K.line, 0.6);
  S.areas.forEach((a, ai) => {
    if (!a.perOutrigger) return;
    for (let i = 1; i < ors.length; i++) P.line(M.l + c0 + i * cw2, iy0 + 22 + ai * rowH, M.l + c0 + i * cw2, iy0 + 22 + (ai + 1) * rowH, K.line, 0.6);
  });
  for (let i = 1; i < ors.length; i++) P.line(M.l + c0 + i * cw2, iy0, M.l + c0 + i * cw2, iy0 + 22, K.navy3, 0.6);
  P.rect(M.l, iy0, LW, iy1 - iy0, { stroke: K.line, sw: 0.8 });

  // how to read
  y += 26;
  const hw = P.text('표 보는 법', M.l, y, { f: 'x', size: 10, color: K.navy });
  P.text('HOW TO READ', M.l + hw + 8, y, { f: 'b', size: 6.4, color: K.muted, spacing: 2.2 });
  y += 7;
  const steps = [
    ['작업영역 확인', S.areas.map((a) => a.name).join(' · ')],
    ['아우트리거 신장 상태 확인', ors.map((o) => o.name).join(' · ') || '—'],
    ['붐 길이(열) × 작업반경(행)', '교차하는 값이 정격하중'],
  ];
  const bw = (LW - 2 * 10) / 3;
  steps.forEach(([t1, t2], i) => {
    const x = M.l + i * (bw + 10);
    P.rect(x, y, bw, 34, { stroke: K.line, sw: 0.6 });
    P.rect(x + 7, y + 8, 18, 18, { fill: K.navy });
    P.tb(String(i + 1), x + 7, y + 8, 18, 18, { f: 'x', size: 9, color: K.white, pad: 0 });
    P.tb(t1, x + 31, y + 4, bw - 35, 14, { align: 'left', pad: 0, f: 'b', size: 7.4, color: K.navy });
    P.tb(t2, x + 31, y + 17, bw - 35, 12, { align: 'left', pad: 0, size: 6.4, color: K.muted });
    if (i < 2) P.text('›', x + bw + 5, y + 21, { f: 'x', size: 12, color: K.amber, align: 'center' });
  });

  // right column: diagram panel
  let ry = 50;
  P.rect(RX, ry, RW, 16, { fill: K.steel, stroke: K.line, sw: 0.6 });
  P.text('작업영역 구분 (상면도)', RX + 9, ry + 11, { f: 'b', size: 7.6, color: K.navy });
  P.text('WORKING AREA', RIGHT - 9, ry + 10.8, { f: 'b', size: 6, color: K.muted, spacing: 1.8, align: 'right' });
  const dg = areaDiagram(S.areas, null);
  const dW = RW - 30, dH = (dW * dg.h) / dg.w;
  P.rect(RX, ry + 16, RW, dH + 12, { stroke: K.line, sw: 0.6 });
  P.shapes(dg, RX + 15, ry + 22, dW);
  ry += 16 + dH + 12 + 10;

  // document control
  const dc = [
    ['문서번호', info.docNo || '—'],
    ['개정 / 발행일', `Rev.${info.rev || '00'} · ${dots(info.issueDate)}`],
    ['적용 기종', info.name],
    ...(info.variant ? [['적용 사양', info.variant]] : []),
    ['단위', `하중 ${info.unit || 'kg'} · 길이 m · 각도 °`],
    ['구성', `표지 1 + 정격하중표 ${N - 1} = 총 ${N} 페이지`],
  ];
  dc.forEach(([l, v], i) => {
    const yy = ry + i * 15;
    P.rect(RX, yy, 78, 15, { fill: K.steel2, stroke: K.line2, sw: 0.5 });
    P.rect(RX + 78, yy, RW - 78, 15, { stroke: K.line2, sw: 0.5 });
    P.tb(l, RX, yy, 78, 15, { align: 'left', pad: 8, size: 7.2, color: K.muted });
    P.tb(v, RX + 78, yy, RW - 78, 15, { align: 'left', pad: 8, f: 'b', size: 7.2, color: K.ink });
  });
  ry += dc.length * 15 + 9;

  // approval
  const ap = [['작성', info.author], ['검토', info.reviewer], ['승인', info.approver]];
  const aw = RW / 3;
  ap.forEach(([l, name], i) => {
    const x = RX + i * aw;
    P.rect(x, ry, aw, 15, { fill: K.navy2 });
    P.tb(l, x, ry, aw, 15, { f: 'b', size: 7.2, color: K.white });
    P.rect(x, ry + 15, aw, 38, { stroke: K.line, sw: 0.6 });
    P.tb(name || '(서명 / 일자)', x, ry + 38, aw, 14, { size: name ? 7.2 : 6.2, f: name ? 'b' : 'r', color: name ? K.ink : K.line });
  });
  ry += 53 + 9;

  // revision history
  const revs = (model.revisionLog && model.revisionLog.length)
    ? model.revisionLog.slice(-4)
    : [{ rev: info.rev || '00', date: info.issueDate, note: info.revNote || '' }];
  const rc = [32, 62, RW - 94];
  P.rect(RX, ry, RW, 15, { fill: K.steel, stroke: K.line, sw: 0.5 });
  ['Rev.', '일자', '개정 내용'].forEach((t, i) => P.tb(t, RX + rc.slice(0, i).reduce((a, b) => a + b, 0), ry, rc[i], 15, { f: 'b', size: 7.2, color: K.navy }));
  revs.forEach((r, j) => {
    const yy = ry + 15 + j * 15;
    let x = RX;
    [r.rev, dots(r.date), r.note].forEach((t, i) => {
      P.rect(x, yy, rc[i], 15, { stroke: K.line2, sw: 0.5 });
      P.tb(t, x, yy, rc[i], 15, { align: i === 2 ? 'left' : 'center', pad: 6, size: 7, color: K.ink });
      x += rc[i];
    });
  });

  // distribution box
  const by = PAGE.h - M.b - 30;
  P.rect(M.l, by, AVAIL, 30, { stroke: K.line, sw: 0.6 });
  P.rect(M.l, by, 3.7, 30, { fill: K.amber });
  let bx = M.l + 14;
  bx += P.text('배포 관리', bx, by + 18.5, { f: 'x', size: 7.6, color: K.navy }) + 16;
  for (const [l, v] of [['제공처', dist.to], ['관리번호', dist.ctrl], ['제공일', dist.date ? dots(dist.date) : '']]) {
    bx += P.text(l, bx, by + 18.5, { size: 7.4, color: K.muted }) + 6;
    const vw = Math.max(70, P.measure(v || '', 'b', 7.4) + 12);
    P.text(v || '', bx + 4, by + 18, { f: 'b', size: 7.4, color: K.ink });
    P.line(bx, by + 21.5, bx + vw, by + 21.5, K.line, 0.6);
    bx += vw + 16;
  }
  const lines = P.wrap(info.confidential || '', 'r', 6.4, RIGHT - 40 - bx);
  lines.slice(0, 2).forEach((ln, i) => P.text(ln, RIGHT - 34, by + 13 + i * 9, { size: 6.4, color: K.muted, align: 'right' }));
  P.text(`1 / ${N}`, RIGHT - 9, by + 18.5, { f: 'x', size: 7.5, color: K.navy, align: 'right' });
}
