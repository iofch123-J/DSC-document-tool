// 보안관리 진입 화면: ① 사번 → ② 이름 초성을 순서대로 (검증 단계).
// · 명단에 없는 사번: ①에서 멈추고 메시지.
// · 사번 12345HA + ㅎㄱㄷ (홍길동) → 맞으면 바로 입장, 다르면 메시지를 띄우고 처음(사번)부터 다시.
// Messages always appear in one fixed slot to the right of the title, so nothing else moves.
// No names are shown anywhere on this screen — the 초성 are the check.
//
// `auth` does the checking: in the browser against the local roster (localAuth), or on the
// server in web mode (storage/remote.js) — then the roster never reaches the browser.
import { h, clear } from './dom.js';
import { uid } from '../core/model.js';
import { CHOSUNG, OTHER, DEFAULT_SUFFIX, choSeq, checkCho, setSession, logEvent, empNo } from '../core/security.js';

/** Check against the roster kept in this browser (local mode). */
export function localAuth(app, staff) {
  const people = staff.people || [];
  return {
    suffix: staff.suffix ?? DEFAULT_SUFFIX,
    showOther: people.some((p) => choSeq(p.name).includes(OTHER)),
    async checkEmp(emp) {
      const p = people.find((x) => x.empNo === emp);
      if (!p) { await logEvent(app.store, null, 'fail', { tried: emp, note: '등록되지 않은 사번' }); return { exists: false }; }
      return { exists: true, len: choSeq(p.name).length };
    },
    async login(emp, seq) {
      const p = checkCho(staff, emp, seq);
      if (!p) { await logEvent(app.store, null, 'fail', { tried: emp, note: '초성 불일치' }); return { match: false }; }
      const session = { sid: uid('s'), empNo: p.empNo, name: p.name, admin: !!p.admin, at: new Date().toISOString() };
      await logEvent(app.store, session, 'enter', { admin: !!p.admin });
      return { match: true, session };
    },
  };
}

export function renderGate(app, main, auth, onEnter) {
  const st = { emp: '', len: 0, seq: [], err: '', busy: false };

  const card = h('div', { class: 'card gate' });
  main.append(h('div', { class: 'gate-wrap' }, card,
    h('p', { class: 'gate-note' }, '정격하중표는 기술자료입니다. 이 화면에서의 조회·PDF 생성 이력은 사번·이름과 함께 기록됩니다.')));

  const msg = h('div', { class: 'gate-msg', role: 'alert', 'aria-live': 'assertive' });
  const say = (text, kind = 'err') => { st.err = text; msg.textContent = text; msg.classList.toggle('info', kind === 'info'); };

  const digits = h('input', {
    type: 'text', class: 'inp gate-emp', inputmode: 'numeric', autocomplete: 'off', placeholder: '예: 12345', 'aria-label': '사번 숫자',
    onkeydown: (e) => { if (e.key === 'Enter') next(); },
    oninput: () => { if (st.err) say(''); },
  });
  // the 사번 suffix (e.g. HA) is fixed by the administrator — shown, not editable
  const suf = h('div', { class: 'inp gate-suf', 'aria-label': `사번 뒷자리 ${auth.suffix} (고정)`, title: '사번 뒷자리는 고정입니다' }, auth.suffix);

  function restart(err = '') {
    st.emp = ''; st.len = 0; st.seq = []; st.busy = false;
    digits.value = '';
    suf.textContent = auth.suffix;
    say(err);
    paint();
    digits.focus();
  }

  async function next() {
    if (st.busy) return;
    if (!digits.value.trim()) { say('사번을 입력하세요.'); digits.focus(); return; }
    const emp = empNo(digits.value, auth.suffix);
    st.busy = true;
    say('확인 중…', 'info');
    try {
      const r = await auth.checkEmp(emp);
      st.busy = false;
      if (!r.exists) {
        // stay on ① — the 사번 must be in the roster before the 초성 check
        say(`${emp}: 등록되지 않은 사번입니다. 다시 확인하세요.`);
        digits.focus();
        digits.select();
        return;
      }
      st.emp = emp; st.len = r.len; st.seq = [];
      say('');
      paint();
    } catch (e) {
      st.busy = false;
      say(e.message);
      digits.focus();
    }
  }

  async function press(c) {
    if (st.busy) return;
    st.seq.push(c);
    if (st.seq.length < st.len) { paint(); return; }
    // the whole name typed — judge it (a match enters at once)
    st.busy = true;
    paint();
    say('확인 중…', 'info');
    try {
      const r = await auth.login(st.emp, st.seq);
      if (r.match) {
        setSession(r.session);
        onEnter(r.session);
        return;
      }
      restart(r.locked ? '입력 오류가 많아 잠시 이 사번으로 들어올 수 없습니다.' : '이름 초성이 일치하지 않습니다. 처음부터 다시 입력하세요.');
    } catch (e) {
      restart(e.message);
    }
  }

  function paint() {
    clear(card);
    card.append(h('div', { class: 'gate-top' },
      h('div', null, h('div', { class: 'sec-kicker' }, 'ACCESS'), h('h1', null, '사용자 확인')),
      msg));

    // ① 사번
    const step1 = h('div', { class: `gate-step ${st.emp ? 'done' : 'now'}` },
      h('div', { class: 'gate-h' }, h('span', { class: 'f-no' }, '1'), '사번'));
    step1.append(st.emp
      ? h('div', { class: 'gate-row' }, h('b', { class: 'gate-val' }, st.emp), h('button', { class: 'btn sm', onclick: () => restart() }, '처음부터'))
      : h('div', { class: 'gate-row' }, digits, suf, h('button', { class: 'btn primary', onclick: next }, '다음 →')));
    card.append(step1);

    // ② 이름 초성, in order — shown as typed, judged when the whole name is in
    if (st.emp) {
      card.append(h('div', { class: 'gate-step now' },
        h('div', { class: 'gate-h' }, h('span', { class: 'f-no' }, '2'), '이름 초성을 순서대로', h('small', { class: 'muted gate-ex' }, '예: 홍길동 → ㅎ ㄱ ㄷ')),
        h('div', { class: 'gate-typed', 'aria-label': `입력한 초성 ${st.seq.join(' ')}` },
          st.seq.length ? st.seq.map((c) => h('span', { class: 'gate-ch' }, c)) : h('span', { class: 'muted' }, '초성 버튼을 누르세요')),
        h('div', { class: 'gate-cho' }, [...CHOSUNG, ...(auth.showOther ? [OTHER] : [])].map((c) => h('button', {
          class: 'gate-cbtn', disabled: st.busy ? true : null, onclick: () => press(c),
        }, c)))));
    }
  }

  paint();
  digits.focus();
}
