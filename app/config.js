// Where the data lives.
//
// · Web mode: set API_URL to the Apps Script web app URL of the 개발 DATABASE Google Sheet
//   (구글 시트 → 확장 프로그램 → Apps Script → 배포 → 웹 앱 URL, ends with /exec). Products and users
//   come from the sheet, rated load data and history are shared through the owner's Google Drive.
//   See docs/WEB-SETUP.md.
// · Local mode: leave API_URL empty — everything stays in this browser (IndexedDB).
//
// For testing, a browser can override this with localStorage 'rlc-api' (a URL, or 'local').
export const API_URL = 'https://script.google.com/macros/s/AKfycbxPZeEvEs0_iwd40ksnPsrSuZrmxAaiuVM_HxyGR-YVZmcLdjHVivmOyNupK3b0DPv9Bg/exec';

export function apiUrl() {
  let v = null;
  try { v = localStorage.getItem('rlc-api'); } catch { /* storage blocked */ }
  if (v === 'local') return '';
  return v || API_URL;
}
