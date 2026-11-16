// 조회 screen: working-area picture — top view of the cargo crane truck (front to the left) over the
// working-area fans. Redrawn from a product render: simplified cab, see-through cargo bed, and the crane
// in blue (sub-frame with its two cylinders, slewing ring, hoses, telescopic boom, front and rear outriggers).
// Coordinates are those of the 1024 × 650 render; fan sizes match the old drawing (pdf/diagrams.js
// areaDiagram, which the PDF keeps using), the framing is zoomed in on the truck.
import { areaDrawR } from '../pdf/diagrams.js';

const BLUE = '#3F6DB5', BLUE_D = '#244C8A', BLUE_DD = '#183764', BLUE_L = '#6F94D0';
const INK = '#1F2D3D', AMBER = '#E0940F', STEEL = '#C9D0D8', STEEL_D = '#7D8B9A';
const OR = '#8E9DAD', OR_E = '#6B7A8B';        // outrigger beams (the old drawing's colours)

const rad = (a) => (a * Math.PI) / 180;
const f = (n) => (Math.round(n * 10) / 10).toString();
const rect = (x, y, w, h) => `M ${f(x)} ${f(y)} H ${f(x + w)} V ${f(y + h)} H ${f(x)} Z`;
const rrect = (x, y, w, h, r) => `M ${f(x + r)} ${f(y)} H ${f(x + w - r)} Q ${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)} V ${f(y + h - r)} `
  + `Q ${f(x + w)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)} H ${f(x + r)} Q ${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - r)} V ${f(y + r)} Q ${f(x)} ${f(y)} ${f(x + r)} ${f(y)} Z`;
const circle = (cx, cy, r) => `M ${f(cx - r)} ${f(cy)} A ${r} ${r} 0 1 0 ${f(cx + r)} ${f(cy)} A ${r} ${r} 0 1 0 ${f(cx - r)} ${f(cy)} Z`;
/** Fan from a1 to a2 degrees: 0° = towards the rear (right), counter-clockwise. */
function sectorPath(cx, cy, R, a1, a2) {
  let b = a2;
  while (b <= a1) b += 360;
  const p = (a) => [cx + R * Math.cos(rad(a)), cy - R * Math.sin(rad(a))];
  const [x1, y1] = p(a1);
  const [x2, y2] = p(b);
  return `M ${cx} ${cy} L ${f(x1)} ${f(y1)} A ${R} ${R} 0 ${b - a1 > 180 ? 1 : 0} 0 ${f(x2)} ${f(y2)} Z`;
}

/** SVG markup: the truck over all working-area fans, the active one in amber. */
export function areaPicture(areas, active) {
  const CX = 345, CY = 350;                     // slewing centre of the crane
  const K = 5.29;                               // fan sizes and strokes ≈ 5.3× the old drawing
  const RMAX = 140 * K;
  const out = [];
  const P = (d, fill, stroke = null, sw = 0, extra = '') => out.push(
    `<path d="${d}" fill="${fill || 'none'}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"` : ''}${extra}/>`);

  // working-area fans
  areas.forEach((a, i) => {
    const on = a.id === active;
    for (const [a1, a2] of a.ranges || []) {
      P(sectorPath(CX, CY, RMAX * areaDrawR(a, i), a1, a2), on ? AMBER : '#D3DAE2', '#FFFFFF', 10, ` fill-opacity="${on ? 0.62 : 0.55}"`);
    }
  });

  // outriggers: front pair (two-stage, from the crane base) and rear pair (from under the bed), staggered
  const front = (x, up) => {
    const s = up ? -1 : 1;
    const y0 = up ? 240 : 470;                  // leaves the crane base here
    const yc = y0 + s * 46, yi = y0 + s * 136;  // collar, end of the inner beam
    P(rect(x - 1.5, Math.min(y0, yc), 21, 46), OR, OR_E, 3.5);
    P(rect(x + 2, Math.min(yc, yi), 14, Math.abs(yi - yc)), OR, OR_E, 3.5);
    P(rect(x - 4, yc - 5, 27, 10), BLUE, BLUE_D, 3.5);
    const py = up ? yi - 27 : yi - 2;
    P(rrect(x - 7, py, 34, 29, 4), BLUE, BLUE_D, 3.5);
    P(rect(x + 2, py + 7, 16, 15), BLUE_D);
  };
  front(300, true);
  front(317, false);
  const rear = (x, up) => {
    const yb = up ? 236 : 466, ye = up ? 130 : 570;
    P(rect(x, Math.min(yb, ye), 18, Math.abs(yb - ye)), OR, OR_E, 3.5);
    const py = up ? ye - 24 : ye - 2;
    P(rrect(x - 8, py, 34, 26, 4), BLUE, BLUE_D, 3.5);
    P(rect(x + 1, py + 6, 16, 14), BLUE_D);
  };
  rear(800, true);
  rear(785, false);

  // tyres: front axle under the cab, rear tandem under the bed (a little wider than the body)
  for (const x of [104, 602, 722]) for (const y of [214, 454]) P(rrect(x, y, 70, 32, 8), '#2B3541');
  // chassis rails between cab and bed
  P(rect(282, 296, 120, 14), '#7A8899');
  P(rect(282, 390, 120, 14), '#7A8899');

  // cargo bed (see-through white, like the old drawing): frame, inner wall, floor slats
  P(rect(397, 230, 515, 240), '#FFFFFF', INK, 6.5, ' fill-opacity="0.8"');
  P(rect(410, 243, 489, 214), null, '#A8B5C3', 3.5);
  for (let x = 455; x < 900; x += 48) P(`M ${x} 246 V 454`, null, '#D3DBE4', 3);

  // cab: body, front bumper, windshield edge, raised roof panel, hatch, bolts, mirrors, steps, door lines
  P(rrect(56, 229, 230, 242, 18), '#FFFFFF', INK, 6.5);
  P(rrect(42, 242, 14, 216, 5), '#5B6B7C');
  P(rrect(64, 246, 16, 208, 6), '#A9BCCF');
  P(rrect(92, 248, 182, 204, 12), null, '#8A99AA', 3.5);
  P(rrect(104, 304, 54, 90, 9), '#E4EAF1', '#8A99AA', 3.5);
  for (const [x, y] of [[112, 270], [256, 270], [112, 430], [256, 430]]) P(circle(x, y, 6.5), '#5B6B7C');
  for (const sgn of [-1, 1]) {
    const yE = sgn < 0 ? 229 : 471;
    P(`M 104 ${yE} L 92 ${yE + sgn * 24}`, null, INK, 5);
    P(rrect(80, sgn < 0 ? yE - 40 : yE + 22, 26, 18, 4), INK);
    P(rrect(186, sgn < 0 ? yE - 10 : yE - 2, 44, 12, 4), '#C9D2DC', '#6B7A8B', 3);
    P(`M 152 ${yE} V ${yE - sgn * 18}`, null, '#8A99AA', 3.5);
  }

  // crane base: sub-frame, outrigger boxes, the two cylinders, slewing ring and turret
  P(rrect(292, 258, 108, 184, 8), BLUE_D, BLUE_DD, 4);
  P(rect(288, 230, 44, 44), BLUE, BLUE_D, 4);
  P(rect(306, 402, 38, 70), BLUE, BLUE_D, 4);
  for (const y of [226, 410]) {
    P(rrect(352, y, 46, 62, 8), BLUE, BLUE_D, 4);
    P(rect(358, y + 8, 7, 46), BLUE_L);
    P(rect(355, y === 226 ? y + 2 : y + 52, 40, 8), STEEL, STEEL_D, 2.5);
  }
  P(rect(384, 300, 16, 100), BLUE, BLUE_D, 4);
  for (const d of ['M 300 262 C 300 290 316 300 330 316', 'M 314 258 C 318 286 334 296 346 310',
    'M 292 272 C 284 320 284 390 296 440', 'M 300 270 C 294 320 294 384 306 436']) P(d, null, INK, 4);   // hydraulic hoses
  P(circle(CX, CY, 46), BLUE, BLUE_D, 4.5);
  P(circle(CX, CY, 36), null, BLUE_D, 3.5);
  for (let k = 0; k < 16; k++) { const t = rad(k * 22.5 + 11); P(circle(CX + 41 * Math.cos(t), CY + 41 * Math.sin(t), 2.6), '#D6DEE8'); }

  // boom: foot on the turret, base section, telescopic sections, head, hook
  P(rrect(312, 328, 62, 44, 7), BLUE_D, BLUE_DD, 4);
  P(rect(318, 336, 436, 28), BLUE, BLUE_D, 4);
  P(rect(330, 342, 414, 4), BLUE_L);
  P(circle(328, 350, 7), '#D6DEE8', BLUE_D, 3);
  P(rect(754, 338, 52, 24), BLUE, BLUE_D, 3.5);
  P(rect(763, 344, 36, 12), INK);
  P(rect(806, 340, 52, 20), BLUE, BLUE_D, 3.5);
  P(rect(814, 345, 36, 10), INK);
  P(rect(858, 338, 48, 24), BLUE, BLUE_D, 3.5);
  P(rect(867, 344, 8, 12), BLUE_D);
  P(rect(882, 344, 8, 12), BLUE_D);
  P(rect(906, 333, 14, 34), BLUE_L, BLUE_D, 3.5);
  P('M 920 341 A 9 9 0 0 1 920 359 Z', INK);

  // Framing: one fixed view for every area (only the colours change), zoomed in on the truck and set a
  // little low so the fan above it shows (the side area); 10 % smaller than the tightest crop.
  const on = areas.find((a) => a.id === active);
  const VW = 1160 / 0.9, VH = 690 / 0.9;
  const vx = 485 - VW / 2, vy = 240 - VH / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(vx)} ${f(vy)} ${f(VW)} ${f(VH)}" `
    + `width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="작업영역${on ? ` ${on.name}` : ''}">${out.join('')}</svg>`;
}
