// Tiny DOM helpers (no framework).

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

let toastBox;
export function toast(msg, kind = 'info', ms = 3200) {
  if (!toastBox) { toastBox = h('div', { class: 'toasts' }); document.body.append(toastBox); }
  const t = h('div', { class: `toast ${kind}` }, msg);
  toastBox.append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

/** Modal dialog. buttons: [{label, value, kind}] -> resolves with the clicked value (or null). */
export function dialog(title, body, buttons = [{ label: '확인', value: true, kind: 'primary' }]) {
  return new Promise((resolve) => {
    const d = h('dialog', { class: 'dlg' });
    const close = (v) => { d.close(); d.remove(); resolve(v); };
    d.append(
      h('div', { class: 'dlg-h' }, title),
      h('div', { class: 'dlg-b' }, body),
      h('div', { class: 'dlg-f' }, buttons.map((b) => h('button', { class: `btn ${b.kind || ''}`, onclick: () => close(b.value) }, b.label))),
    );
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
    document.body.append(d);
    d.showModal();
  });
}

export const confirmBox = (title, body, ok = '확인', danger = false) =>
  dialog(title, body, [{ label: '취소', value: false }, { label: ok, value: true, kind: danger ? 'danger' : 'primary' }]);

export function download(blob, filename) {
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const i = h('input', { type: 'file', accept, style: { display: 'none' } });
    i.addEventListener('change', () => { resolve(i.files[0] || null); i.remove(); });
    document.body.append(i);
    i.click();
  });
}

export const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'document';
