// 조회 screen: the working-area picture (pdf/pictures.js areaTopView — the PDF and admin screens use the same one).
import { areaTopView } from '../pdf/pictures.js';
import { toSvg } from '../pdf/diagrams.js';

/** SVG markup: the truck over all working-area fans, the active one in amber (one fixed 16:10 view). */
export function areaPicture(areas, active) {
  const on = areas.find((a) => a.id === active);
  return toSvg(areaTopView(areas, active),
    `width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="작업영역${on ? ` ${on.name}` : ''}"`);
}
