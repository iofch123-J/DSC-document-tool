// "초기 설정" — document info, radius range, winches/booms, working areas, outrigger states.
import { h, clear, toast, confirmBox, dialog, pickFile } from './dom.js';
import {
  newBoom, uid, settingsProblems, orphanCells, pruneOrphans, parseRanges, conditions, radii, columns, activeWinches,
  cleanRadii, usedRadii, rKey,
  auxWinches, addAuxWinch, winchTitle,
} from '../core/model.js';
import { areaDiagram, outriggerDiagram, toSvg, areaDrawR } from '../pdf/diagrams.js';

export function renderSettings(app, el) {
  const m = app.model;
  const S = m.settings;
  const info = m.info;
  const scrollY = window.scrollY;
  const rerender = () => { clear(el); renderSettings(app, el); window.scrollTo(0, scrollY); };

  // ---------------------------------------------------------------- field helpers
  const text = (obj, key, attrs = {}) => h('input', {
    type: 'text', class: 'inp', value: obj[key] ?? '', ...attrs,
    oninput: (e) => { obj[key] = e.target.value; app.changed(); refreshProblems(); },
  });
  const num = (obj, key, attrs = {}, after) => h('input', {
    type: 'number', step: 'any', class: 'inp num', value: obj[key] ?? '', ...attrs,
    onchange: (e) => {
      obj[key] = e.target.value === '' ? null : Number(e.target.value);
      app.changed(); refreshProblems(); after?.();
    },
  });
  const field = (label, input, hint) => h('label', { class: 'fld' }, h('span', null, label), input, hint ? h('small', null, hint) : null);
  const check = (obj, key, label, after) => h('label', { class: 'chk' }, h('input', {
    type: 'checkbox', checked: !!obj[key],
    onchange: (e) => { obj[key] = e.target.checked; app.changed(); after ? after() : refreshProblems(); },
  }), label);
  const section = (no, title, desc, ...body) => h('div', { class: 'card sec' },
    h('div', { class: 'sec-h' }, h('span', { class: 'sec-no' }, no), h('div', null, h('h2', null, title), desc ? h('p', null, desc) : null)),
    ...body);

  // ---------------------------------------------------------------- problems / summary
  const probBox = h('div');
  const summary = h('div', { class: 'summary' });
  function refreshProblems() {
    clear(probBox);
    const ps = settingsProblems(m);
    if (ps.length) probBox.append(h('div', { class: 'warnbox' }, h('b', null, '초기 설정을 완료해 주세요'), h('ul', null, ps.map((p) => h('li', null, p)))));
    const orphans = orphanCells(m);
    if (orphans) {
      probBox.append(h('div', { class: 'infobox' },
        `설정에서 빠진 행·열·조건에 입력값 ${orphans}칸이 남아 있습니다 (표와 PDF에는 나타나지 않음). `,
        h('button', { class: 'btn sm', onclick: async () => {
          if (!(await confirmBox('남은 입력값 정리', h('p', null, `${orphans}칸을 삭제합니다. 되돌릴 수 없습니다.`), '삭제', true))) return;
          pruneOrphans(m); app.changed(); rerender();
        } }, '정리')));
    }
    clear(summary);
    const conds = conditions(m);
    const ws = activeWinches(m);
    summary.append(
      h('div', null, h('b', null, radii(m).length), h('span', null, '작업반경 행')),
      ...ws.map((w) => h('div', null, h('b', null, columns(m, w).length), h('span', null, `${winchTitle(S.winches[w])} 열`))),
      h('div', null, h('b', null, conds.length), h('span', null, '조건 (영역 × 아우트리거)')),
      h('div', null, h('b', null, conds.length * ws.length), h('span', null, '입력 표')),
    );
  }

  // ---------------------------------------------------------------- 1. document info
  const logoBox = h('div', { class: 'logo-box' });
  const paintLogo = () => {
    clear(logoBox);
    if (info.logo) {
      logoBox.append(h('img', { src: info.logo, alt: '로고' }),
        h('button', { class: 'btn sm', onclick: () => { info.logo = null; app.changed(); paintLogo(); } }, '제거'));
    } else {
      logoBox.append(h('span', { class: 'muted' }, '없음'));
    }
    logoBox.append(h('button', { class: 'btn sm', onclick: async () => {
      const f = await pickFile('image/png,image/jpeg');
      if (!f) return;
      if (f.size > 600 * 1024) { toast('로고 파일은 600KB 이하로 넣어 주세요.', 'error'); return; }
      const r = new FileReader();
      r.onload = () => { info.logo = r.result; app.changed(); paintLogo(); };
      r.readAsDataURL(f);
    } }, info.logo ? '변경' : '이미지 선택'));
  };
  paintLogo();
  const notes = h('textarea', {
    class: 'inp', rows: 4, value: (info.notes || []).join('\n'),
    oninput: (e) => { info.notes = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean); app.changed(); },
  });

  const secInfo = section('1', '문서 정보', 'PDF 표지와 머리글·바닥글에 들어가는 내용입니다.',
    h('div', { class: 'grid3' },
      field('기종명 *', text(info, 'name')),
      field('문서번호', text(info, 'docNo', { placeholder: '예: RLC-0000' })),
      field('개정 (Rev)', text(info, 'rev', { placeholder: '00' })),
      field('발행일', h('input', { type: 'date', class: 'inp', value: info.issueDate || '', onchange: (e) => { info.issueDate = e.target.value; app.changed(); } })),
      field('개정 내용', text(info, 'revNote')),
      field('단위', text(info, 'unit')),
      field('작성', text(info, 'author', { placeholder: '이름 (선택)' })),
      field('검토', text(info, 'reviewer', { placeholder: '이름 (선택)' })),
      field('승인', text(info, 'approver', { placeholder: '이름 (선택)' })),
      field('문서 제목', text(info, 'title')),
      field('영문 제목', text(info, 'titleEn')),
      field('부제', text(info, 'subtitle')),
    ),
    h('div', { class: 'grid2' },
      field('회사 로고 (PNG/JPG)', logoBox, '머리글 왼쪽에 들어갑니다. 이 브라우저에만 저장됩니다.'),
      field('대외비 문구', text(info, 'confidential')),
    ),
    field('작업 시 유의사항 (한 줄에 하나)', notes, '예시 문구가 들어 있습니다. 사내 기준에 맞게 고쳐 주세요.'),
  );

  // ---------------------------------------------------------------- 2. radius
  // either start · end · step, or the rows one by one (like the Excel, when they are not evenly spaced)
  const R = S.radius;
  const listMode = Array.isArray(R.list) && R.list.length > 0;
  const fmtR = (r) => rKey(r).replace(/\.0$/, '');
  const onlyUsed = h('button', {
    class: 'btn sm',
    title: '하중 표에 값이 있는 작업반경만 행으로 남깁니다 (빈 행 삭제, 숨어 있던 행 표시)',
    onclick: () => {
      const used = usedRadii(m);
      if (!used.length) { toast('값이 있는 행이 없습니다.', 'warn'); return; }
      R.list = used; app.changed(); rerender();
      toast(`값이 있는 ${used.length}개 행으로 맞췄습니다.`, 'ok');
    },
  }, '값이 있는 행만 쓰기');
  const secRadius = section('2', '작업반경 (표의 행)',
    listMode ? '엑셀 표처럼 행을 하나씩 지정합니다 (간격이 일정하지 않은 표). PDF에는 값이 있는 마지막 행까지만 인쇄됩니다.'
      : '시작·끝·간격으로 표의 행을 만듭니다. PDF에는 값이 있는 마지막 행까지만 인쇄됩니다.',
    listMode
      ? h('div', null,
        field('행 목록 (m, 쉼표로 구분)', h('input', {
          type: 'text', class: 'inp', value: radii(m).map(fmtR).join(', '),
          onchange: (e) => {
            const vs = cleanRadii(e.target.value.split(/[,\s]+/).filter(Boolean));
            if (vs.length) R.list = vs;
            app.changed(); rerender();
          },
        })),
        h('div', { class: 'actions' }, onlyUsed,
          h('button', {
            class: 'btn sm',
            onclick: () => { const rs = radii(m); delete R.list; R.start = rs[0]; R.end = rs[rs.length - 1]; app.changed(); rerender(); },
          }, '일정 간격으로 바꾸기')))
      : h('div', null,
        h('div', { class: 'grid3 narrow' },
          field('시작 (m)', num(S.radius, 'start')),
          field('끝 (m)', num(S.radius, 'end')),
          field('간격 (m)', num(S.radius, 'step')),
        ),
        h('div', { class: 'actions' }, onlyUsed,
          h('button', { class: 'btn sm', onclick: () => { R.list = radii(m); app.changed(); rerender(); } }, '행을 직접 지정'))));

  // ---------------------------------------------------------------- 3/4. winches
  const winchBody = (w) => {
    const cfg = S.winches[w];
    const isMain = w === 'main';
    const boomCount = h('input', {
      type: 'number', class: 'inp num', min: 1, max: 15, value: cfg.booms.length,
      onchange: (e) => {
        const n = Math.max(1, Math.min(15, Math.round(Number(e.target.value) || 1)));
        while (cfg.booms.length < n) cfg.booms.push(newBoom());
        if (cfg.booms.length > n) cfg.booms.length = n;
        app.changed(); rerender();
      },
    });
    const boomRows = cfg.booms.map((b, i) => h('tr', null,
      h('td', { class: 'c' }, `${i + 1}단`),
      h('td', null, num(b, 'len', { placeholder: '길이' })),
      h('td', null, num(b, 'maxR', { placeholder: '선택' })),
    ));
    const jibRows = (cfg.jibs || []).map((j, i) => h('tr', null,
      h('td', null, text(j, 'label', { placeholder: 'S/B' })),
      h('td', null, num(j, 'len')),
      h('td', null, num(j, 'maxR', { placeholder: '선택' })),
      h('td', null, h('button', { class: 'btn sm danger-text', onclick: () => { cfg.jibs.splice(i, 1); app.changed(); rerender(); } }, '삭제')),
    ));
    const body = h('div', { class: 'winch-body' },
      h('div', { class: isMain ? 'grid3' : 'grid4' },
        field('이름', text(cfg, 'label')),
        isMain ? null : field('용량 *', text(cfg, 'capacity', { placeholder: '예: 4 ton' }), '사용자 화면의 Sub Winch 선택지로 쓰입니다.'),
        field('영문', text(cfg, 'labelEn')),
        field('붐 단수', boomCount, '단 수를 바꾸면 아래 표가 늘어나거나 줄어듭니다.'),
      ),
      h('div', { class: 'two-col' },
        h('div', null,
          h('h3', null, '붐 길이'),
          h('table', { class: 'mini' }, h('thead', null, h('tr', null, h('th', null, '단'), h('th', null, '붐 길이 (m)'), h('th', null, '최대 작업반경 (m)'))), h('tbody', null, boomRows)),
          !isMain && S.winches.main.booms.length !== cfg.booms.length
            ? h('button', { class: 'btn sm', onclick: () => { while (cfg.booms.length < S.winches.main.booms.length) cfg.booms.push(newBoom()); cfg.booms.length = S.winches.main.booms.length; app.changed(); rerender(); } }, `메인 붐 단수(${S.winches.main.booms.length})에 맞추기`)
            : null,
          h('p', { class: 'hint' }, '최대 작업반경을 넣으면 하중 입력 화면의 [최대반경 자동 표기]로 표의 (8.1) 같은 표기를 자동으로 채울 수 있습니다.'),
        ),
        h('div', null,
          h('h3', null, 'S/B (지브) 열'),
          jibRows.length ? h('table', { class: 'mini' }, h('thead', null, h('tr', null, h('th', null, '표시'), h('th', null, '길이 (m)'), h('th', null, '최대 작업반경'), h('th', null, ''))), h('tbody', null, jibRows)) : h('p', { class: 'muted' }, '없음'),
          h('button', { class: 'btn sm', onclick: () => { (cfg.jibs ||= []).push({ id: uid('j'), label: 'S/B', len: null, maxR: null }); app.changed(); rerender(); } }, '＋ S/B 열 추가'),
          h('h3', { style: { marginTop: '18px' } }, '줄걸이 표시'),
          h('div', { class: 'grid3' },
            field('기본', text(cfg.falls, 'base')),
            field('증가', text(cfg.falls, 'high')),
            field('기준 하중 (kg)', num(cfg.falls, 'threshold', { placeholder: '비우면 표시 안 함' })),
          ),
          h('p', { class: 'hint' }, '기준 하중을 넘는 칸이 표와 PDF에서 자동으로 음영 처리됩니다 (예: 6연 걸이 구간).'),
        ),
      ),
    );
    return body;
  };
  const mainSection = () => section('3', S.winches.main.label || '메인 윈치', '메인 윈치의 붐 구성입니다. 메인 윈치 표는 보조 윈치 용량과 관계없이 하나입니다.', winchBody('main'));

  const auxSection = () => {
    const keys = auxWinches(m);
    const cards = keys.map((k) => {
      const cfg = S.winches[k];
      const others = keys.filter((x) => x !== k);
      return h('div', { class: 'aux-card' },
        h('div', { class: 'aux-h' },
          h('b', null, winchTitle(cfg) || '보조 윈치'),
          !cfg.capacity ? h('span', { class: 'chip warn' }, '용량 미입력') : null,
          h('span', { class: 'aux-tools' },
            others.length ? h('button', { class: 'btn sm', onclick: async () => {
              const sel = h('select', { class: 'inp' }, others.map((o) => h('option', { value: o }, winchTitle(S.winches[o]))));
              const ok = await dialog('붐 구성 복사', h('div', null, h('label', { class: 'fld' }, h('span', null, '가져올 보조 윈치'), sel),
                h('p', { class: 'muted' }, '붐 길이·S/B·줄걸이 설정을 복사합니다. 하중 값은 복사하지 않습니다.')),
              [{ label: '취소', value: false }, { label: '복사', value: true, kind: 'primary' }]);
              if (!ok) return;
              const src = S.winches[sel.value];
              cfg.booms = src.booms.map((b) => newBoom(b.len, b.maxR));
              cfg.jibs = (src.jibs || []).map((j) => ({ ...j, id: uid('j') }));
              cfg.falls = { ...src.falls };
              app.changed(); rerender();
            } }, '다른 보조 윈치 구성 복사') : null,
            h('button', { class: 'btn sm danger-text', onclick: async () => {
              if (!(await confirmBox('보조 윈치 삭제', h('p', null, `'${winchTitle(cfg)}'을(를) 삭제합니다. 입력된 하중 값은 '정리' 전까지 남아 있습니다.`), '삭제', true))) return;
              delete S.winches[k]; app.changed(); rerender();
            } }, '삭제'))),
        winchBody(k));
    });
    return section('4', '보조 윈치 (Sub Winch)', '용량별로 하나씩 추가합니다 (예: 3 ton, 4 ton). 각 보조 윈치는 붐 길이·S/B·하중 표를 따로 가집니다. 보조 윈치가 없는 기종은 비워 두세요.',
      cards.length ? cards : h('p', { class: 'muted' }, '등록된 보조 윈치가 없습니다.'),
      h('button', { class: 'btn', onclick: () => {
        const k = addAuxWinch(m, '');
        const cfg = S.winches[k];
        const tpl = S.winches[keys[keys.length - 1]];
        if (tpl) { cfg.booms = tpl.booms.map((b) => newBoom(b.len, b.maxR)); cfg.jibs = (tpl.jibs || []).map((j) => ({ ...j, id: uid('j') })); cfg.falls = { ...tpl.falls }; }
        app.changed(); rerender();
      } }, '＋ 보조 윈치 추가'),
      keys.length ? h('p', { class: 'hint' }, '새로 추가하면 마지막 보조 윈치의 붐 구성을 복사해 시작합니다.') : null);
  };

  // ---------------------------------------------------------------- 5. areas
  const preview = h('div', { class: 'diagram' });
  const paintPreview = () => { preview.innerHTML = toSvg(areaDiagram(S.areas, null), 'width="100%"'); };
  paintPreview();
  const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; app.changed(); rerender(); };
  const areaRows = S.areas.map((a, i) => {
    const rangeInput = h('input', {
      type: 'text', class: 'inp', value: (a.ranges || []).map(([p, q]) => `${p}-${q}`).join(', '), placeholder: '예: 332-28 또는 28-115, 245-332',
      onchange: (e) => { a.ranges = parseRanges(e.target.value); e.target.value = a.ranges.map(([p, q]) => `${p}-${q}`).join(', '); app.changed(); paintPreview(); refreshProblems(); },
    });
    return h('tr', null,
      h('td', null, h('input', { type: 'text', class: 'inp', value: a.name, oninput: (e) => { a.name = e.target.value; app.changed(); paintPreview(); } })),
      h('td', null, rangeInput),
      h('td', { class: 'c' }, h('input', { type: 'checkbox', checked: a.perOutrigger, onchange: (e) => { a.perOutrigger = e.target.checked; app.changed(); refreshProblems(); } })),
      h('td', null, h('input', {
        type: 'number', class: 'inp num', min: 30, max: 100, step: 1, value: Math.round(areaDrawR(a, i) * 100), title: '그림에서 이 영역 부채꼴의 크기 (가장 큰 영역 = 100)',
        onchange: (e) => { a.drawR = Math.max(0.3, Math.min(1, Number(e.target.value) / 100 || 0.6)); e.target.value = Math.round(a.drawR * 100); app.changed(); paintPreview(); },
      })),
      h('td', { class: 'nowrap' },
        h('button', { class: 'btn sm', onclick: () => move(S.areas, i, -1) }, '↑'),
        h('button', { class: 'btn sm', onclick: () => move(S.areas, i, 1) }, '↓'),
        h('button', { class: 'btn sm danger-text', onclick: async () => {
          if (!(await confirmBox('작업영역 삭제', h('p', null, `'${a.name}' 영역을 삭제합니다. 입력된 하중은 '정리' 전까지 남아 있습니다.`), '삭제', true))) return;
          S.areas.splice(i, 1); app.changed(); rerender();
        } }, '삭제')),
    );
  });
  const secAreas = section('5', '작업영역', '각도는 차량 후방을 0°로 봅니다. 위에서부터 하중이 큰 영역 순서로 두면 영역 간 대소 검증에 쓰입니다.',
    h('div', { class: 'two-col wide-left' },
      h('div', null,
        h('table', { class: 'mini' },
          h('thead', null, h('tr', null, h('th', null, '이름'), h('th', null, '각도 범위 (°)'), h('th', null, '아우트리거별 표'), h('th', null, '그림 반경 (%)'), h('th', null, ''))),
          h('tbody', null, areaRows)),
        h('button', { class: 'btn sm', onclick: () => { S.areas.push({ id: uid('a'), name: '새 영역', ranges: [], perOutrigger: true }); app.changed(); rerender(); } }, '＋ 작업영역 추가'),
        h('p', { class: 'hint' }, "'아우트리거별 표'를 끄면 그 영역은 아우트리거 단계와 관계없이 표 하나만 만듭니다 (예: 전방 — 전 구간 공통). '그림 반경'은 상면도에서 부채꼴 크기입니다 (작업반경이 큰 영역일수록 크게)."),
      ),
      preview,
    ));

  // ---------------------------------------------------------------- 6. outriggers
  const orRows = S.outriggers.map((o, i) => h('tr', null,
    h('td', null, h('input', { type: 'text', class: 'inp', value: o.name, oninput: (e) => { o.name = e.target.value; app.changed(); } })),
    h('td', null, h('input', { type: 'text', class: 'inp', value: o.short || '', oninput: (e) => { o.short = e.target.value; app.changed(); } })),
    h('td', null, h('input', {
      type: 'number', class: 'inp num', min: 5, max: 100, value: Math.round((o.pct ?? 1) * 100),
      onchange: (e) => { o.pct = Math.max(0.05, Math.min(1, Number(e.target.value) / 100)); app.changed(); rerender(); },
    })),
    h('td', { class: 'or-icon', html: toSvg(outriggerDiagram(o.pct ?? 1), 'height="52"') }),
    h('td', { class: 'nowrap' },
      h('button', { class: 'btn sm', onclick: () => move(S.outriggers, i, -1) }, '↑'),
      h('button', { class: 'btn sm', onclick: () => move(S.outriggers, i, 1) }, '↓'),
      h('button', { class: 'btn sm danger-text', onclick: async () => {
        if (!(await confirmBox('단계 삭제', h('p', null, `'${o.name}' 단계를 삭제합니다.`), '삭제', true))) return;
        S.outriggers.splice(i, 1); app.changed(); rerender();
      } }, '삭제')),
  ));
  const secOr = section('6', '아우트리거 단계', '위에서부터 많이 펼친 순서로 둡니다 (아우트리거 대소 검증에 사용). 신장 비율은 그림 표시용입니다.',
    h('table', { class: 'mini' },
      h('thead', null, h('tr', null, h('th', null, '이름'), h('th', null, '짧은 표시'), h('th', null, '그림 신장 비율 (%)'), h('th', null, '그림'), h('th', null, ''))),
      h('tbody', null, orRows)),
    h('button', { class: 'btn sm', onclick: () => { S.outriggers.push({ id: uid('o'), name: '새 단계', short: '', pct: 0.5 }); app.changed(); rerender(); } }, '＋ 단계 추가'));

  // ---------------------------------------------------------------- 7. checks
  const secChecks = section('7', '검증 옵션', null,
    check(S.checks ||= { areaOrder: true }, 'areaOrder', '작업영역 순서대로 하중이 같거나 작아야 함 (위반 시 "확인" 표시)', () => { app.changed(); }),
  );

  refreshProblems();
  el.append(
    h('div', { class: 'settings-top' }, summary, probBox),
    secInfo, secRadius, mainSection(), auxSection(), secAreas, secOr, secChecks,
    h('div', { class: 'next' }, h('button', { class: 'btn primary', onclick: () => app.go(`#/m/${m.id}/data`) }, '다음: 하중 입력 →')),
  );
}
