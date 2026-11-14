// "검증" — automatic check results grouped by rule, with jump-to-cell.
import { h } from './dom.js';
import { CHECKS } from '../core/validate.js';

export function renderChecks(app, el) {
  const m = app.model;
  const v = app.validation();
  const groups = new Map();
  for (const i of v.issues) {
    if (!groups.has(i.code)) groups.set(i.code, []);
    groups.get(i.code).push(i);
  }

  el.append(h('div', { class: 'check-sum card' },
    h('div', { class: `big ${v.ng ? 'ng' : 'ok'}` }, h('b', null, v.ng), h('span', null, 'NG — 반드시 수정')),
    h('div', { class: `big ${v.warn ? 'warn' : 'ok'}` }, h('b', null, v.warn), h('span', null, '확인 — 의도 여부 확인')),
    h('div', { class: 'rules' },
      h('b', null, '자동 검증 항목'),
      h('ul', null, Object.entries(CHECKS).map(([code, c]) => h('li', null,
        h('span', { class: `chip ${c.level === 'ng' ? 'ng' : 'warn'}` }, c.level === 'ng' ? 'NG' : '확인'), ' ', c.title,
        groups.has(code) ? h('b', { class: 'cnt' }, ` ${groups.get(code).length}건`) : h('span', { class: 'muted' }, ' 0'))))),
  ));

  if (!v.issues.length) {
    el.append(h('div', { class: 'card empty ok' }, h('h2', null, '모든 검증을 통과했습니다'), h('p', null, 'PDF 탭에서 문서를 만들 수 있습니다.'),
      h('button', { class: 'btn primary', onclick: () => app.go(`#/m/${m.id}/pdf`) }, 'PDF 만들기 →')));
    return;
  }

  const order = Object.keys(CHECKS);
  [...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).forEach(([code, list]) => {
    const c = CHECKS[code];
    el.append(h('div', { class: 'card check-group' },
      h('div', { class: 'cg-h' }, h('span', { class: `chip ${c.level === 'ng' ? 'ng' : 'warn'}` }, c.level === 'ng' ? 'NG' : '확인'), h('h2', null, c.title), h('span', { class: 'muted' }, `${list.length}건`)),
      h('ul', { class: 'issues' }, list.slice(0, 200).map((i) => h('li', null,
        h('span', null, i.msg),
        i.cond ? h('button', { class: 'btn sm', onclick: () => {
          app.ui.cond = i.cond; app.ui.winch = i.winch;
          app.ui.focus = i.r ? { col: i.col, r: i.r } : null;
          app.go(`#/m/${m.id}/data`);
        } }, '이동') : h('button', { class: 'btn sm', onclick: () => app.go(`#/m/${m.id}/settings`) }, '설정으로')))),
      list.length > 200 ? h('p', { class: 'muted' }, `… 외 ${list.length - 200}건`) : null,
    ));
  });
}
