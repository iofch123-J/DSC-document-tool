// 조회 screen: the outrigger picture (pdf/pictures.js outriggerFront — the PDF and admin screens use the same one).
import { outriggerFront, TRUCK_SRC } from '../pdf/pictures.js';
import { toSvg } from '../pdf/diagrams.js';

export { TRUCK_SRC };

/** SVG markup; pct 0..1 of the maximum extension, or 'all' (area where the outrigger state doesn't matter). */
export function outriggerPicture(pct) {
  const all = pct === 'all';
  const p = all ? 0 : Math.max(0.2, Math.min(1, Number(pct) || 0));
  return toSvg(outriggerFront(pct),
    `width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="아우트리거 ${all ? '전 구간' : `${Math.round(p * 100)}% 신장`}"`);
}
