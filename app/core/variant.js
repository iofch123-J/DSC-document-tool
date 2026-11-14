// Product options chosen on the user screen (Sub Winch / Sub Boom) applied to a registered model.
// Returns a filtered copy: the main winch, plus at most ONE aux winch (the chosen capacity),
// and S/B columns only when a Sub Boom is chosen.
import { clone, auxWinches, winchOption, jibOption } from './model.js';

export const NONE = '없음';

// "4.5 / 7.0 m" -> [4.5, 7.0]; "5.0 m" -> [5]
const lensOf = (s) => [...String(s || '').matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
const squash = (s) => String(s || '').toLowerCase().replace(/[\s.]/g, '').replace(/톤|tons?$/g, 't');

export const hasOption = (v) => !!v && v !== NONE;

export function variantLabel(sel) {
  return `Sub Winch ${hasOption(sel.subWinch) ? sel.subWinch : NONE} · Sub Boom ${hasOption(sel.subBoom) ? sel.subBoom : NONE}`;
}

export function variantFileTag(sel) {
  const c = (s) => String(s || NONE).replace(/\s+/g, '');
  return `SW${c(sel.subWinch)}_SB${c(sel.subBoom)}`;
}

/** Selectable options of a registered model: [{ label, key, subBooms: [...] }] incl. "없음". */
export function modelOptions(model) {
  return [
    { label: NONE, key: null, subBooms: [NONE] },
    ...auxWinches(model).map((k) => {
      const cfg = model.settings.winches[k];
      const jo = jibOption(cfg);
      return { label: winchOption(cfg), key: k, subBooms: jo ? [NONE, jo] : [NONE] };
    }),
  ];
}

export function applyVariant(model, sel) {
  const m = clone(model);
  const notes = [];
  const W = m.settings.winches;
  const auxKeys = auxWinches(m);
  let keep = null;

  if (hasOption(sel.subWinch)) {
    keep = auxKeys.find((k) => squash(winchOption(W[k])) === squash(sel.subWinch)) || null;
    if (!keep && auxKeys.length === 1) {
      keep = auxKeys[0];
      notes.push(`등록된 보조 윈치 이름('${winchOption(W[keep])}')이 선택한 Sub Winch(${sel.subWinch})와 달라, 등록된 보조 윈치 표를 표시합니다.`);
    }
    if (!keep) notes.push(auxKeys.length ? `등록된 정격하중 데이터에 Sub Winch ${sel.subWinch} 표가 없습니다.` : '등록된 정격하중 데이터에 보조 윈치 표가 없습니다.');
  }
  for (const k of auxKeys) if (k !== keep) W[k].enabled = false;

  const hasBoom = !!keep && hasOption(sel.subBoom);
  for (const k of ['main', ...(keep ? [keep] : [])]) {
    const cfg = W[k];
    const jibs = cfg.jibs || [];
    if (!hasBoom) { cfg.jibs = []; continue; }
    const want = lensOf(sel.subBoom);
    const match = jibs.filter((j) => want.some((L) => Math.abs(Number(j.len) - L) < 1e-6));
    if (match.length) cfg.jibs = match;
    else if (jibs.length && k !== 'main') {
      notes.push(`선택한 Sub Boom ${sel.subBoom}과 같은 길이의 S/B 열이 등록되어 있지 않아, 등록된 S/B 열(${jibs.map((j) => `${j.len} m`).join(', ')})을 모두 표시합니다.`);
    }
  }
  if (hasBoom && !(W[keep].jibs || []).length) notes.push('등록된 정격하중 데이터에 S/B 열이 없습니다.');

  m.info.variant = variantLabel(sel);
  return { model: m, notes };
}
