// App shell: storage, autosave, hash routing, 사용자/관리자 modes.
//
// 사용자 (user)   #/  -> 제품 선택 · 조회 · PDF 생성 (한 페이지)
// 관리자 (admin)  #/admin -> 기종 목록   #/admin/security -> 보안관리   #/m/<id>/<tab> -> 기종 편집
//
// Two ways to run (app/config.js):
//   · web mode   — API_URL = the Apps Script web app of the 개발 DATABASE Google Sheet. Every tab starts
//                  at the entry screen (checked on the server), data is shared through Google Drive.
//   · local mode — no API_URL: data in this browser; the entry screen appears once a roster is saved.
// Only people marked 관리자 in the roster can open the admin screens (core/security.js).
import { h, clear, toast } from './ui/dom.js';
import { localStore } from './storage/local.js';
import { createRemote } from './storage/remote.js';
import { apiUrl } from './config.js';
import { validate } from './core/validate.js';
import { touch, today } from './core/model.js';
import { renderHome } from './ui/home.js';
import { renderSettings } from './ui/settings.js';
import { renderEditor } from './ui/editor.js';
import { renderChecks } from './ui/checks.js';
import { renderPdf } from './ui/pdfview.js';
import { renderUser } from './ui/user.js';
import { BRAND_LOGO } from './core/brand.js';
import { loadStaff, securityOn, getSession, setSession, sessionPerson, logEvent } from './core/security.js';
import { renderGate, localAuth } from './ui/gate.js';
import { renderSecurity } from './ui/security.js';

const root = document.getElementById('app');

const TABS = [
  { id: 'settings', label: '초기 설정', render: renderSettings },
  { id: 'data', label: '하중 입력', render: renderEditor },
  { id: 'checks', label: '검증', render: renderChecks },
  { id: 'pdf', label: 'PDF', render: renderPdf },
];

const API = apiUrl();
const remote = API ? createRemote(API, { onAuthError: () => expire() }) : null;
const freshUser = () => ({ product: null, subWinch: null, subBoom: null, cond: null, pdf: { to: '', ctrl: '', date: today() } });

export const app = {
  store: remote ? remote.store : localStore,
  remote: !!remote,
  model: null,
  ui: null,
  brand: undefined,   // company logo record (core/brand.js); loaded once, null = none
  staff: undefined,   // local mode: roster (core/security.js); refreshed when an admin saves it
  session: null,      // who is using this tab ({ sid, empNo, name, admin[, token] }) — null when security is off
  user: freshUser(),
  _val: null,
  _timer: null,
  _pending: false,
  onChange: null,

  validation() {
    if (!this._val) this._val = validate(this.model);
    return this._val;
  },
  /** call after every edit of app.model */
  changed() {
    this._val = null;
    touch(this.model);
    this.scheduleSave();
    this.onChange?.();
  },
  scheduleSave() {
    this._pending = true;
    setSaveStatus('saving');
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), this.remote ? 1500 : 500);   // web: fewer round trips
  },
  async flush() {
    clearTimeout(this._timer);
    if (!this._pending || !this.model) return;
    this._pending = false;
    try {
      await this.store.put(this.model);
      setSaveStatus('saved');
    } catch (e) {
      this._pending = true;
      setSaveStatus('error');
      toast(`저장 실패: ${e.message}`, 'error', 6000);
    }
  },
  go(hash) { location.hash = hash; },
};

/** Is the entry screen in force? (always in web mode; in local mode once a roster exists) */
const secured = () => app.remote || securityOn(app.staff);

function freshUi() {
  return { cond: null, winch: 'main', showVar: false, focus: null, pdf: { mode: 'customer', to: '', ctrl: '', date: today() } };
}

function setSaveStatus(s) {
  const el = document.getElementById('save-status');
  if (!el) return;
  el.className = `save ${s}`;
  el.textContent = s === 'saving' ? '저장 중…' : s === 'error' ? '저장 실패' : '저장됨';
}

// --- icons (inline SVG, stroke style) -----------------------------------------------
const svg = (paths) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('class', 'ico');
  el.innerHTML = paths;
  return el;
};
const ICON_USERS = '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>';
const ICON_LOCK = '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>';
const ICON_POWER = '<path d="M12 3v8"/><path d="M6.4 6.6a8 8 0 1 0 11.2 0"/>';

/** Forget this tab's person (and, on the web, the token and cached data). */
function forget() {
  setSession(null);
  app.session = null;
  remote?.store.reset();
  // the next person on this tab starts clean: forget the product selection as well
  try { sessionStorage.removeItem('rlc-user-selection'); } catch { /* ignore */ }
  app.user = freshUser();
  app.model = null;
}

/** End this tab's session: record it, forget it, back to the entry screen. */
async function signOut() {
  await app.flush();
  if (app.session) await logEvent(app.store, app.session, 'exit');
  forget();
  if (location.hash === '#/') route(); else app.go('#/');
}

/** The server no longer accepts this tab's token (expired, or removed from the roster). */
let expiring = false;
function expire() {
  if (expiring) return;
  expiring = true;
  forget();
  toast('다시 들어와 주세요 (사용 시간이 지났거나 명단에서 확인되지 않습니다).', 'warn', 6000);
  setTimeout(() => { expiring = false; route(); }, 0);
}

// who is using the tool ("20000HA 홍길동 님 조회중") — or a warning while no roster is registered
function identity() {
  if (!secured()) {
    return h('a', { class: 'who off', href: '#/admin/security', title: '관리자 → 보안관리에서 사용자 명단을 등록하면 켜집니다' }, '보안관리 꺼짐 · 명단 없음');
  }
  const s = app.session;
  if (!s) return null;
  return h('div', { class: 'who' },
    h('span', { class: 'who-t' }, h('b', null, `${s.empNo} ${s.name}`), h('span', { class: 'who-sfx' }, ' 님 조회중')),
    h('button', {
      type: 'button', class: 'who-out', onclick: signOut, 'aria-label': '종료',
      title: '종료 — 이 탭의 사용을 마치고 진입 화면으로 돌아갑니다',
    }, svg(ICON_POWER)));
}

// "DY | Rated Load": the company logo (or a DY wordmark when no logo is registered) + product name
function topbar(mode) {
  const logo = app.brand?.dataUrl;
  const adminLocked = secured() && !app.session?.admin;
  // the bar spans the window; its content is held to the same max width as the page below
  return h('header', { class: `topbar ${mode}` }, h('div', { class: 'topbar-in' },
    h('a', { class: 'brand', href: '#/', title: 'DY Rated Load — 정격하중표 문서 도구' },
      logo ? h('img', { class: 'brand-logo', src: logo, alt: 'DY', onload: () => fitTopbar() }) : h('span', { class: 'brand-mark' }, 'DY'),
      h('span', { class: 'brand-div' }),
      h('span', { class: 'brand-text' },
        h('span', { class: 'brand-name' }, 'Rated Load'),
        h('span', { class: 'brand-sub' }, '정격하중표 문서 도구'))),
    // right side: who is using it + the 사용자/관리자 toggle — one row, or stacked on narrow screens
    mode === 'gate' ? null : h('div', { class: 'tb-right' },
      identity(),
      h('nav', { class: 'mode-toggle', 'aria-label': '화면 전환' },
        h('a', { class: mode === 'user' ? 'on' : '', href: '#/' }, svg(ICON_USERS), '사용자'),
        h('a', {
          class: `${mode === 'admin' ? 'on' : ''} ${adminLocked ? 'locked' : ''}`, href: '#/admin',
          title: adminLocked ? '사용자 명단에서 관리자로 지정된 사람만 들어갈 수 있습니다' : '',
        }, svg(ICON_LOCK), '관리자')))),
  );
}

/**
 * Fit the top bar to the window, keeping one row as long as possible:
 *  ① logo · Rated Load | name 님 조회중 ⏻ · 사용자/관리자 (right-aligned)
 *  ② the same with the logo only (the 'Rated Load · 정격하중표 문서 도구' text goes)
 *  ③ administrators: name ⏻ above the 사용자/관리자 toggle, both right-aligned (two rows);
 *     everyone else: the toggle is hidden (the admin side is closed to them anyway)
 */
function fitTopbar(bar = document.querySelector('.topbar')) {
  const inner = bar?.querySelector('.topbar-in');
  const brand = bar?.querySelector('.brand');
  const right = bar?.querySelector('.tb-right');
  if (!inner || !brand || !right) return;
  const admin = !secured() || !!app.session?.admin;
  for (const cls of [[], ['tb-logo'], ['tb-logo', admin ? 'tb-stack' : 'tb-notoggle']]) {
    bar.classList.remove('tb-logo', 'tb-stack', 'tb-notoggle');
    bar.classList.add(...cls);
    const cs = getComputedStyle(inner);
    const room = inner.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (brand.offsetWidth + right.offsetWidth + 16 <= room) return;
  }
}
window.addEventListener('resize', () => fitTopbar());
document.fonts?.ready.then(() => fitTopbar());

/** Entry screen (사번 → 이름 초성). Returns true when it took over the page. */
async function gateIfNeeded() {
  if (app.remote) {
    const s = getSession();
    if (s?.token) { app.session = s; remote.store.setToken(s.token); return false; }
  } else {
    if (!securityOn(app.staff)) { app.session = null; return false; }
    const s = getSession();
    const p = sessionPerson(app.staff, s);
    if (p) { app.session = { ...s, admin: !!p.admin }; return false; }
  }
  forget();
  let bar = topbar('gate');
  root.append(bar);
  const page = h('main', { class: 'page gate-page' });
  root.append(page);
  let auth;
  const before = app.brand;
  if (app.remote) {
    auth = remote.auth;
    try { await auth.init(); } catch (e) { /* the gate shows the network message on the first try */ console.warn(e); }
    if (auth.brand !== undefined) app.brand = auth.brand;   // the company logo is on the entry screen too
  } else {
    auth = localAuth(app, app.staff);
    if (app.brand === undefined) { try { app.brand = (await app.store.getMeta(BRAND_LOGO)) || null; } catch { app.brand = null; } }
  }
  if (app.brand !== before) { const next = topbar('gate'); bar.replaceWith(next); bar = next; }
  renderGate(app, page, auth, (s) => {
    if (app.remote) remote.store.setToken(s.token);
    route();
  });
  return true;
}

async function route() {
  await app.flush();
  if (!app.remote && app.staff === undefined) {
    try { app.staff = await loadStaff(app.store); } catch { app.staff = null; }
  }
  const [, kind, id, tab] = location.hash.replace(/^#/, '').split('/');
  const admin = kind === 'admin' || kind === 'm';
  clear(root);

  // 보안관리: entry screen until this tab has a person from the roster
  if (await gateIfNeeded()) return;
  if (app.brand === undefined) {
    try { app.brand = (await app.store.getMeta(BRAND_LOGO)) || null; } catch { app.brand = null; }
    if (!app.session && secured()) return;   // the token expired while loading: expire() re-routes
  }

  root.append(topbar(admin ? 'admin' : 'user'));
  fitTopbar();
  const main = h('main', { class: `page ${admin ? 'admin' : 'user'}` });
  root.append(main);

  // admin screens: only people marked 관리자 in the roster
  if (admin && secured() && !app.session?.admin) {
    app.model = null;
    app.onChange = null;
    main.append(h('div', { class: 'card empty denied' },
      h('div', { class: 'sec-kicker' }, 'RESTRICTED'),
      h('h2', null, '관리자 권한이 필요합니다'),
      h('p', null, `${app.session.empNo} ${app.session.name} 님은 사용자 명단에 관리자로 지정되어 있지 않습니다.`),
      h('p', { class: 'muted' }, '관리자 권한이 필요하면 관리자에게 명단 수정을 요청하세요.'),
      h('a', { class: 'btn primary', href: '#/' }, '사용자 화면으로')));
    return;
  }

  try {
    if (kind === 'm' && id) {
      if (!app.model || app.model.id !== id) {
        app.model = await app.store.get(id);
        app._val = null;
        app.ui = freshUi();
      }
      if (!app.model) {
        toast('기종을 찾을 수 없습니다.', 'error');
        app.go('#/admin');
        return;
      }
      renderModelPage(main, TABS.find((t) => t.id === tab) || TABS[0]);
      return;
    }
    app.model = null;
    app.onChange = null;
    if (kind === 'admin' && id === 'security') await renderSecurity(app, main, () => { app.staff = undefined; route(); });
    else if (kind === 'admin') await renderHome(app, main);
    else if (kind === 'view' || kind === 'issue') app.go('#/');   // old step links -> the single user page
    else await renderUser(app, main);
  } catch (e) {
    if (e.code === 'auth') return;   // expire() takes over
    console.error(e);
    clear(main);
    main.append(h('div', { class: 'card empty denied' },
      h('div', { class: 'sec-kicker' }, 'ERROR'),
      h('h2', null, '데이터를 불러오지 못했습니다'),
      h('p', null, e.message),
      h('button', { class: 'btn primary', onclick: () => { remote?.store.refresh(); route(); } }, '다시 시도')));
  }
}

function renderModelPage(main, tab) {
  const m = app.model;
  const badge = h('span', { class: 'tab-badge' });
  const updateBadge = () => {
    const v = app.validation();
    badge.className = `tab-badge ${v.ng ? 'ng' : v.warn ? 'warn' : 'ok'}`;
    badge.textContent = v.ng ? `NG ${v.ng}` : v.warn ? `확인 ${v.warn}` : 'OK';
  };
  const title = h('span', { class: 'model-name' }, m.info.name);
  const head = h('div', { class: 'model-head' },
    h('a', { class: 'back', href: '#/admin' }, '← 기종 목록'),
    title,
    h('span', { class: 'model-rev' }, `Rev.${m.info.rev || '00'}`),
    h('span', { id: 'save-status', class: 'save saved' }, '저장됨'),
  );
  const tabs = h('nav', { class: 'tabs' }, TABS.map((t, i) => h('a', {
    class: `tab ${t.id === tab.id ? 'on' : ''}`, href: `#/m/${m.id}/${t.id}`,
  }, h('span', { class: 'tab-no' }, String(i + 1)), t.label, t.id === 'checks' ? badge : null)));
  const view = h('section', { class: 'view' });
  main.append(head, tabs, view);
  app.onChange = () => { updateBadge(); title.textContent = app.model.info.name; };
  updateBadge();
  tab.render(app, view);
}

window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', (e) => { if (app._pending) { app.flush(); e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') app.flush(); });
route();
