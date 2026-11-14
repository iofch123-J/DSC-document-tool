// "PDF" — build the document in the browser, preview and download.
import { h, clear, toast, download, safeName } from './dom.js';
import { planPages } from '../pdf/render.js';
import { makePdf } from './pdfgen.js';
import { logEvent } from '../core/security.js';
import { modelOptions, applyVariant, variantFileTag, NONE } from '../core/variant.js';

let lastUrl = null;

export function renderPdf(app, el) {
  const o = app.ui.pdf;
  const v = app.validation();
  const rerender = () => { clear(el); renderPdf(app, el); };

  // product option (Sub Winch / Sub Boom): the document holds the main winch + at most one aux winch
  const opts = modelOptions(app.model);
  const hasAux = opts.length > 1;
  if (hasAux && !opts.some((x) => x.label === o.subWinch)) { o.subWinch = opts[1].label; o.subBoom = opts[1].subBooms[opts[1].subBooms.length - 1]; }
  if (!hasAux) { o.subWinch = NONE; o.subBoom = NONE; }
  const swOpt = opts.find((x) => x.label === o.subWinch) || opts[0];
  if (!swOpt.subBooms.includes(o.subBoom)) o.subBoom = swOpt.subBooms[swOpt.subBooms.length - 1];
  const sel = { subWinch: o.subWinch, subBoom: o.subBoom };
  const m = hasAux ? applyVariant(app.model, sel).model : app.model;
  const pages = planPages(m);
  const optSelect = (label, values, key) => h('label', { class: 'fld' }, h('span', null, label),
    h('select', { class: 'inp', onchange: (e) => { o[key] = e.target.value; if (key === 'subWinch') o.subBoom = null; rerender(); } },
      values.map((val) => h('option', { value: val, selected: val === o[key] }, val))));

  const radio = (val, label, desc) => h('label', { class: `opt ${o.mode === val ? 'on' : ''}` },
    h('input', { type: 'radio', name: 'mode', checked: o.mode === val, onchange: () => { o.mode = val; rerender(); } }),
    h('div', null, h('b', null, label), h('small', null, desc)));
  const inp = (key, ph, type = 'text') => h('input', { type, class: 'inp', value: o[key] || '', placeholder: ph, oninput: (e) => { o[key] = e.target.value; } });

  const status = h('div', { class: 'pdf-status' });
  const preview = h('div', { class: 'pdf-preview' }, h('div', { class: 'ph' }, h('p', null, "왼쪽에서 옵션을 고른 뒤 'PDF 만들기'를 누르세요."), h('p', { class: 'muted' }, `${pages.length}페이지 (표지 1 + 조건별 ${pages.length - 1})`)));
  const result = h('div', { class: 'pdf-result' });
  const btn = h('button', { class: 'btn primary block', onclick: generate }, 'PDF 만들기');

  async function generate() {
    if (o.mode === 'customer' && v.ng) {
      toast(`검증 NG ${v.ng}건이 있습니다. 내용을 확인하고 배포하세요.`, 'warn', 5000);
    }
    btn.disabled = true;
    clear(result);
    try {
      const t0 = performance.now();
      const blob = await makePdf(m, {
        mode: o.mode,
        dist: o.mode === 'customer' ? { to: o.to.trim(), ctrl: o.ctrl.trim(), date: o.date } : {},
      }, (t) => { status.textContent = t; });
      const bytes = { length: blob.size };
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(blob);
      const fname = `${safeName(m.info.name)}${hasAux ? `_${safeName(variantFileTag(sel))}` : ''}_정격하중표_Rev${safeName(m.info.rev || '00')}${o.mode === 'internal' ? '_내부용' : o.ctrl ? `_${safeName(o.ctrl)}` : ''}.pdf`;
      clear(preview);
      preview.append(h('iframe', { src: lastUrl, title: 'PDF 미리보기' }));
      status.textContent = `완료 — ${pages.length}페이지 · ${(bytes.length / 1024).toFixed(0)} KB · ${((performance.now() - t0) / 1000).toFixed(1)}초`;
      logEvent(app.store, app.session, 'pdf', {
        product: m.info.name, subWinch: hasAux ? sel.subWinch : null, subBoom: hasAux ? sel.subBoom : null, rev: m.info.rev || '00',
        mode: o.mode, to: o.mode === 'customer' ? o.to.trim() : '', ctrl: o.mode === 'customer' ? o.ctrl.trim() : '', file: fname, pages: pages.length, via: '관리자',
      });
      result.append(
        h('button', { class: 'btn primary block', onclick: () => download(blob, fname) }, '내려받기'),
        h('a', { class: 'btn block', href: lastUrl, target: '_blank', rel: 'noopener', style: { display: 'block', textAlign: 'center', marginTop: '6px', textDecoration: 'none' } }, '새 탭에서 열기'),
        h('div', { class: 'muted fname' }, fname));
    } catch (e) {
      console.error(e);
      status.textContent = '';
      toast(`PDF 생성 실패: ${e.message}`, 'error', 7000);
    } finally {
      btn.disabled = false;
    }
  }

  el.append(h('div', { class: 'pdf-layout' },
    h('div', { class: 'card pdf-opts' },
      h('h2', null, '출력 옵션'),
      hasAux ? h('div', { class: 'dist variant-box' },
        h('b', null, '적용 사양'),
        optSelect('Sub Winch', opts.map((x) => x.label), 'subWinch'),
        optSelect('Sub Boom', swOpt.subBooms, 'subBoom'),
        h('p', { class: 'hint' }, '보조 윈치는 문서 하나에 한 가지 용량만 들어갑니다.')) : null,
      radio('customer', '고객 제공용', '제공처·관리번호를 워터마크와 바닥글에 표시. 변동구간은 숨김'),
      radio('internal', '내부용', 'INTERNAL 워터마크. 변동구간(파란색)과 검증 NG 칸(빨간 테두리) 표시'),
      o.mode === 'customer' ? h('div', { class: 'dist' },
        h('label', { class: 'fld' }, h('span', null, '제공처'), inp('to', '예: ○○건설 ○○현장')),
        h('label', { class: 'fld' }, h('span', null, '관리번호'), inp('ctrl', '예: CC-2026-001')),
        h('label', { class: 'fld' }, h('span', null, '제공일'), inp('date', '', 'date')),
        h('p', { class: 'hint' }, '비워 두면 워터마크 없이 만들어집니다. 배포 대장 자동 기록은 3단계에서 추가됩니다.')) : null,
      v.ng ? h('div', { class: 'warnbox' }, `검증 NG ${v.ng}건이 남아 있습니다. `, h('a', { href: `#/m/${m.id}/checks` }, '검증 보기')) : null,
      btn, status, result),
    preview));
}
