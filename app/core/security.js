// 보안관리: who is using the tool, and a history of what they looked at.
//
// · Roster (명단): employee number (사번) + name, optionally marked 관리자. Kept in this browser
//   only (IndexedDB meta) — never in the public repository. No roster = security off.
// · Entry: 사번 (digits + the default suffix, e.g. 12345 + HA) → the 초성 of the whole name, in order,
//   as a check (홍길동 → ㅎㄱㄷ). A match enters at once; anything else shows an error and starts over.
//   Only people marked 관리자 may open the admin screens.
// · Session: per browser tab (sessionStorage); closing the tab ends it.
// · History (이력): entry / exit / product views / PDF generation, in the 'logs' store.
//
// This is an accountability gate for a tool that runs entirely in the browser, not cryptographic
// protection: it records who did what, it does not stop a determined person with developer tools.
import { readXlsx } from './xlsx.js';

export const STAFF = 'staff';
export const DEFAULT_SUFFIX = 'HA';
const SESSION_KEY = 'rlc-session';

// ---------------------------------------------------------------- 초성
const CHO19 = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const BASE = { 'ㄲ': 'ㄱ', 'ㄸ': 'ㄷ', 'ㅃ': 'ㅂ', 'ㅆ': 'ㅅ', 'ㅉ': 'ㅈ' };
export const CHOSUNG = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
export const OTHER = '기타';

const choChar = (ch) => {
  const code = ch.charCodeAt(0);
  if (code >= 0xAC00 && code <= 0xD7A3) {
    const c = CHO19[Math.floor((code - 0xAC00) / 588)];
    return BASE[c] || c;   // 쌍자음 folded onto their base: 꽃 → ㄱ
  }
  return OTHER;
};
/** 초성 of every syllable of a name, in order: 홍길동 → ['ㅎ','ㄱ','ㄷ']. */
export const choSeq = (name) => [...String(name || '').replace(/\s+/g, '')].map(choChar);
/** Initial consonant of the first syllable. */
export const choOf = (name) => choSeq(name)[0] || OTHER;
/** Is this 초성 sequence the one of the person with this 사번? */
export function checkCho(staff, emp, seq) {
  const p = staff?.people?.find((x) => x.empNo === emp);
  return p && choSeq(p.name).join('') === seq.join('') ? p : null;
}

// ---------------------------------------------------------------- roster
const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
export const normEmp = (s) => str(s).replace(/\s+/g, '').toUpperCase();
export const empNo = (digits, suffix) => normEmp(`${str(digits)}${str(suffix)}`);
const TRUE_MARK = /^(y|yes|o|○|●|◎|v|✓|✔|1|true|관리자|admin|administrator)$/i;

export const loadStaff = async (store) => (await store.getMeta(STAFF)) || null;
export const securityOn = (staff) => !!staff?.people?.length;

/** Problems that block saving a roster (empty list = fine). */
export function rosterProblems(people) {
  const out = [];
  const seen = new Set();
  people.forEach((p, i) => {
    if (!p.empNo || !p.name) out.push(`${i + 1}번째 줄: 사번과 이름을 모두 입력하세요.`);
    if (p.empNo && seen.has(p.empNo)) out.push(`사번 ${p.empNo}이(가) 두 번 있습니다.`);
    seen.add(p.empNo);
  });
  if (people.length && !people.some((p) => p.admin)) out.push('관리자로 지정한 사람이 한 명 이상 있어야 합니다 (없으면 아무도 관리자 화면에 들어갈 수 없습니다).');
  return out;
}

/** Read a roster workbook — the '사용자' sheet of the 개발 DATABASE file, or any sheet with a header row
 *  사번 + 이름 (+ optional 관리자 권한: O/Y marks an administrator) in its first 30 rows. */
export async function parseStaffXlsx(buf, suffix = DEFAULT_SUFFIX) {
  const wb = await readXlsx(buf);
  const HEAD = { emp: /^(사번|사원번호|직원번호|empno|id)$/i, name: /^(이름|성명|name)$/i, admin: /^(관리자|권한|관리자권한|관리권한|admin|role)$/i };
  const sheets = [...wb.sheets].sort((a, b) => (b.name === '사용자') - (a.name === '사용자'));   // 사용자 sheet first
  for (const sh of sheets) {
    const get = (r, c) => str(sh.cells.get(`${r},${c}`)?.v);
    for (let r = 1; r <= Math.min(sh.maxRow, 30); r++) {
      const cols = {};
      for (let c = 1; c <= sh.maxCol; c++) {
        const t = get(r, c).replace(/\s+/g, '');
        for (const [k, re] of Object.entries(HEAD)) if (t && !cols[k] && re.test(t)) cols[k] = c;
      }
      if (!(cols.emp && cols.name)) continue;
      const people = [];
      for (let rr = r + 1; rr <= sh.maxRow; rr++) {
        const raw = get(rr, cols.emp);
        const name = get(rr, cols.name);
        if (!raw && !name) continue;
        // a bare number gets the default suffix (26000 → 26000HA); a full 사번 is kept as written
        const emp = /^\d+$/.test(raw) ? empNo(raw, suffix) : normEmp(raw);
        people.push({ empNo: emp, name, admin: cols.admin ? TRUE_MARK.test(get(rr, cols.admin)) : false });
      }
      return { sheet: sh.name, people };
    }
  }
  throw new Error("'사번'과 '이름' 머리글이 있는 표를 찾지 못했습니다. (선택: '관리자' 열에 O/Y 표시)");
}

// ---------------------------------------------------------------- session (this tab)
export function getSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
export function setSession(s) {
  try { if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); else sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}
/** The session's person, as the roster has them now (null if they were removed or renamed). */
export function sessionPerson(staff, s) {
  if (!s) return null;
  return staff?.people?.find((p) => p.empNo === s.empNo && p.name === s.name) || null;
}

// ---------------------------------------------------------------- history
export const LOG_TYPES = { enter: '진입', fail: '진입 실패', exit: '종료', view: '조회', pdf: 'PDF 생성' };

/** Append one history entry; never throws (history must not break the tool). */
export async function logEvent(store, session, type, detail = {}) {
  try {
    await store.addLog({
      t: new Date().toISOString(),
      sid: session?.sid || null,
      empNo: session?.empNo || null,
      name: session?.name || null,
      type,
      ...detail,
    });
  } catch (e) {
    console.warn('이력 기록 실패', e);
  }
}

/** One-line description of a history entry for tables and CSV (local entries carry fields,
 *  entries read back from the Google Sheet carry a 비고 note). */
export function describeLog(e) {
  const cfg = [e.product, e.subWinch && `Sub Winch ${e.subWinch}`, e.subBoom && `Sub Boom ${e.subBoom}`].filter(Boolean).join(' · ');
  if (e.type === 'view') return cfg;
  if (e.type === 'pdf') {
    const kind = e.note || [e.mode === 'internal' ? '내부용' : '외부 제공용', e.scope === 'page' ? '조회 페이지만' : e.scope === 'all' ? '제품 전체' : '', e.page].filter(Boolean).join(' · ');
    return [cfg || e.product, kind, e.to && `제공처 ${e.to}`, e.ctrl && `관리번호 ${e.ctrl}`, e.file].filter(Boolean).join(' · ');
  }
  if (e.type === 'enter') return e.admin ? '관리자' : (e.note || '');
  if (e.type === 'fail') return e.tried ? [`입력한 사번 ${e.tried}`, e.note].filter(Boolean).join(' · ') : (e.note || '');
  return e.note || '';
}
