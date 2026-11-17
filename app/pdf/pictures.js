// The working-area and outrigger pictures — one source for the 조회 screen, the PDF and the admin screens.
//
//  · areaTopView(areas, active)   top view of the cargo crane truck (front to the left) over the working-area
//                                 fans; active = area id to highlight, or null for the cover (every area
//                                 coloured and labelled). The truck is laid out after the general-arrangement
//                                 drawing, in the old style: white cab, see-through white bed, the crane in
//                                 blue with its boom slewed 15° and run out.
//  · outriggerFront(pct)          front view: the truck line drawing (raster, TRUCK_SRC) with the outrigger
//                                 drawn on top at the extension pct (0…1), or 'all' when it doesn't matter.
//
// Both return { x0, y0, w, h, items } in the shape-list format of pdf/diagrams.js: paths
// { d, fill, stroke, sw, opacity (fill), dash: [on, off], cap }, texts { text, x, y, size, bold, color, anchor }
// and images { image: 'truck', href, x, y, w, h }. toSvg() draws them on screen, the PDF pen (render.js) on paper.
import { areaDrawR, COVER_FILLS } from './diagrams.js';
import { slewRange } from '../core/model.js';

export const TRUCK_SRC = 'img/outrigger-truck.png';

const BLUE = '#3F6DB5', BLUE_D = '#244C8A', BLUE_DD = '#183764', BLUE_L = '#6F94D0';
const INK = '#1F2D3D', NAVY = '#14304D', AMBER = '#E0940F', STEEL = '#C9D0D8', STEEL_D = '#7D8B9A';
const BEAM = '#8E9DAD', BEAM_E = '#6B7A8B';    // outrigger beams, in both pictures

const rad = (a) => (a * Math.PI) / 180;
const f = (n) => (Math.round(n * 10) / 10).toString();
const poly = (pts) => `M ${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L ')} Z`;
const rect = (x, y, w, h) => `M ${f(x)} ${f(y)} H ${f(x + w)} V ${f(y + h)} H ${f(x)} Z`;
const rrect = (x, y, w, h, r) => `M ${f(x + r)} ${f(y)} H ${f(x + w - r)} Q ${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)} V ${f(y + h - r)} `
  + `Q ${f(x + w)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)} H ${f(x + r)} Q ${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - r)} V ${f(y + r)} Q ${f(x)} ${f(y)} ${f(x + r)} ${f(y)} Z`;
const circle = (cx, cy, r) => `M ${f(cx - r)} ${f(cy)} A ${r} ${r} 0 1 0 ${f(cx + r)} ${f(cy)} A ${r} ${r} 0 1 0 ${f(cx - r)} ${f(cy)} Z`;
const line = (x1, y1, x2, y2) => `M ${f(x1)} ${f(y1)} L ${f(x2)} ${f(y2)}`;
/** Fan from a1 to a2 degrees: 0° = towards the rear (right), counter-clockwise. */
function sectorPath(cx, cy, R, a1, a2) {
  let b = a2;
  while (b <= a1) b += 360;
  const p = (a) => [cx + R * Math.cos(rad(a)), cy - R * Math.sin(rad(a))];
  const [x1, y1] = p(a1);
  const [x2, y2] = p(b);
  return `M ${cx} ${cy} L ${f(x1)} ${f(y1)} A ${R} ${R} 0 ${b - a1 > 180 ? 1 : 0} 0 ${f(x2)} ${f(y2)} Z`;
}

// ------------------------------------------------------------------------------------------- top view
/** Working-area top view. Coordinates are those of the 1024 × 650 product render. */
export function areaTopView(areas, active = null) {
  const cover = active === null;
  const CX = 345, CY = 350;                     // slewing centre of the crane
  const K = 5.29;                               // fan sizes and strokes ≈ 5.3× the old drawing
  const RMAX = 140 * K;
  const items = [];
  const P = (d, fill, stroke = null, sw = 0, extra = {}) => items.push({ d, fill, stroke, sw, cap: true, ...extra });

  // working-area fans
  areas.forEach((a, i) => {
    const [fill, op] = cover ? COVER_FILLS[i % COVER_FILLS.length] : a.id === active ? [AMBER, 0.62] : ['#D3DAE2', 0.55];
    for (const [a1, a2] of a.ranges || []) P(sectorPath(CX, CY, RMAX * areaDrawR(a, i), a1, a2), fill, '#FFFFFF', 10, { opacity: op });
  });

  // the truck, laid out after the general-arrangement drawing: u along the truck (+ = rear) and v across
  // it (+ = down), both measured from the slewing centre
  const X = (u) => CX + u, Y = (v) => CY + v;
  const B = (u1, v1, u2, v2) => rect(X(Math.min(u1, u2)), Y(Math.min(v1, v2)), Math.abs(u2 - u1), Math.abs(v2 - v1));
  const BR = (u1, v1, u2, v2, r) => rrect(X(Math.min(u1, u2)), Y(Math.min(v1, v2)), Math.abs(u2 - u1), Math.abs(v2 - v1), r);
  const HW = 86;                  // half width of the cab and the wheels
  const REAR = 622;               // end of the frame
  const BH = 78;                  // half width of the bed (the wheels show a little beyond it)

  // front outriggers: just behind the cab, staggered (the upper one a little further back), two-stage beams
  const frontOR = (uc, up) => {
    const s = up ? -1 : 1;
    const v0 = s * 50, vc = s * 146, vi = s * 232;   // under the crane base, collar, end of the inner beam
    P(B(uc - 10.5, v0, uc + 10.5, vc), BEAM, BEAM_E, 3.5);
    P(B(uc - 7, vc, uc + 7, vi), BEAM, BEAM_E, 3.5);
    P(B(uc - 13.5, vc - 5, uc + 13.5, vc + 5), BLUE, BLUE_D, 3.5);
    const pv = up ? vi - 27 : vi - 2;
    P(rrect(X(uc - 17), Y(pv), 34, 29, 4), BLUE, BLUE_D, 3.5);
    P(rect(X(uc - 8), Y(pv + 7), 16, 15), BLUE_D);
  };
  frontOR(-15, true);
  frontOR(-33, false);
  // rear outriggers: behind the last axle, staggered, run out of their box half as far again as the
  // drawing shows (150 %)
  const rearOR = (uc, up) => {
    const s = up ? -1 : 1;
    const vb = s * 40, ve = s * (46 + 82 * 1.5);
    P(B(uc - 9, vb, uc + 9, ve), BEAM, BEAM_E, 3.5);
    const pv = up ? ve - 24 : ve - 2;
    P(rrect(X(uc - 17), Y(pv), 34, 26, 4), BLUE, BLUE_D, 3.5);
    P(rect(X(uc - 8), Y(pv + 6), 16, 14), BLUE_D);
  };
  rearOR(527, true);
  rearOR(513, false);

  // chassis rails from the cab to the rear end (seen between the cab and the bed)
  P(B(-90, -32, REAR, -20), '#7A8899');
  P(B(-90, 20, REAR, 32), '#7A8899');

  // wheels: front axle beside the crane base, a single axle, then a dual tandem under the bed
  const tyre = (u1, v1, u2, v2) => P(BR(u1, v1, u2, v2, 7), '#2B3541');
  const single = (uc) => { tyre(uc - 37, -HW - 2, uc + 37, -HW + 24); tyre(uc - 37, HW - 24, uc + 37, HW + 2); };
  const dual = (uc) => {
    for (const s of [-1, 1]) { tyre(uc - 37, s * (HW + 2), uc + 37, s * (HW - 18)); tyre(uc - 37, s * (HW - 21), uc + 37, s * (HW - 41)); }
  };
  single(42);
  single(268);
  dual(358);
  dual(452);

  // cargo bed (see-through white) from behind the crane to the rear end: frame, inner wall, floor slats
  P(B(58, -BH, REAR, BH), '#FFFFFF', INK, 6.5, { opacity: 0.8 });
  P(B(71, -BH + 13, REAR - 13, BH - 13), null, '#A8B5C3', 3.5);
  for (let u = 116; u < REAR - 20; u += 48) P(`M ${f(X(u))} ${f(Y(-BH + 16))} V ${f(Y(BH - 16))}`, null, '#D3DBE4', 3);

  // cab: the old cab's parts (bumper, windshield, roof panel, hatch, bolts, mirrors, steps, door lines) fitted
  // to the drawing's cab, 154 long × 172 wide
  const cx0 = X(-230), cy0 = Y(-HW), sx = 154 / 230, sy = (2 * HW) / 242;
  const c = (x, y) => [cx0 + (x - 56) * sx, cy0 + (y - 229) * sy];
  const crr = (x, y, w, h, r) => { const [a, b] = c(x, y); return rrect(a, b, w * sx, h * sy, r); };
  const cl = (x1, y1, x2, y2) => { const [a, b] = c(x1, y1); const [p, q] = c(x2, y2); return `M ${f(a)} ${f(b)} L ${f(p)} ${f(q)}`; };
  P(crr(56, 229, 230, 242, 16), '#FFFFFF', INK, 6.5);
  P(crr(40, 242, 16, 216, 5), '#5B6B7C');
  P(crr(64, 246, 18, 208, 6), '#A9BCCF');
  P(crr(94, 248, 180, 204, 10), null, '#8A99AA', 3.5);
  P(crr(106, 304, 58, 90, 8), '#E4EAF1', '#8A99AA', 3.5);
  for (const [x, y] of [[114, 268], [254, 268], [114, 432], [254, 432]]) { const [a, b] = c(x, y); P(circle(a, b, 5), '#5B6B7C'); }
  for (const sgn of [-1, 1]) {
    const yE = sgn < 0 ? 229 : 471;
    P(cl(106, yE, 92, yE + sgn * 30), null, INK, 4.5);
    P(crr(76, sgn < 0 ? yE - 52 : yE + 26, 32, 26, 4), INK);
    P(crr(184, sgn < 0 ? yE - 12 : yE - 2, 50, 14, 4), '#C9D2DC', '#6B7A8B', 3);
    P(cl(150, yE, 150, yE - sgn * 22), null, '#8A99AA', 3.5);
  }

  // crane base: sub-frame, the two outrigger boxes, the lifting cylinders, hoses, slewing ring and turret
  P(BR(-50, -62, 54, 62, 8), BLUE_D, BLUE_DD, 4);
  P(B(-37, -80, 7, -46), BLUE, BLUE_D, 4);          // upper outrigger box (its beam at u −15)
  P(B(-52, 46, -14, 80), BLUE, BLUE_D, 4);          // lower outrigger box (its beam at u −33)
  for (const s of [-1, 1]) {
    const v1 = s < 0 ? -82 : 40;
    P(BR(12, v1, 50, v1 + 42, 7), BLUE, BLUE_D, 4);
    P(B(17, v1 + 7, 23, v1 + 35), BLUE_L);
    P(B(14, s < 0 ? v1 + 2 : v1 + 33, 48, s < 0 ? v1 + 9 : v1 + 40), STEEL, STEEL_D, 2.5);
  }
  P(B(38, -30, 52, 30), BLUE, BLUE_D, 4);
  for (const pts of [[[-42, -58], [-42, -40], [-26, -32], [-14, -24]], [[-30, -60], [-26, -42], [-12, -36], [0, -28]],
    [[-46, -50], [-54, -18], [-54, 22], [-44, 54]], [[-40, -52], [-46, -18], [-46, 18], [-36, 52]]]) {
    P(`M ${f(X(pts[0][0]))} ${f(Y(pts[0][1]))} C ${pts.slice(1).map(([u, v]) => `${f(X(u))} ${f(Y(v))}`).join(' ')}`, null, INK, 3.5);   // hydraulic hoses
  }
  P(circle(CX, CY, 39), BLUE, BLUE_D, 4.5);
  P(circle(CX, CY, 30), null, BLUE_D, 3.5);
  for (let k = 0; k < 16; k++) { const t = rad(k * 22.5 + 11); P(circle(CX + 34.5 * Math.cos(t), CY + 34.5 * Math.sin(t), 2.3), '#D6DEE8'); }

  // boom: slewed 15° counter-clockwise and run out to ~130 % of its stowed length — laid out along the
  // truck (widths × 0.86 to suit the narrower truck), then every point turned about the slewing centre
  // (no transforms, so the PDF can draw it too)
  const BW = 0.86;
  const th = rad(15), co = Math.cos(th), si = Math.sin(th);
  const rot = ([x, y]) => [CX + (x - CX) * co + (y - CY) * si, CY - (x - CX) * si + (y - CY) * co];
  const rbox = (x, y, w, h) => { const y0 = CY + (y - CY) * BW, hh = h * BW; return poly([[x, y0], [x + w, y0], [x + w, y0 + hh], [x, y0 + hh]].map(rot)); };
  const rcircle = (x, y, r) => { const [a, b] = rot([x, CY + (y - CY) * BW]); return circle(a, b, r); };
  P(rbox(316, 328, 56, 44), BLUE_D, BLUE_DD, 4);               // foot on the turret
  P(rbox(318, 336, 436, 28), BLUE, BLUE_D, 4);                  // base section
  P(rbox(330, 342, 414, 4), BLUE_L);
  P(rcircle(328, 350, 6), '#D6DEE8', BLUE_D, 3);
  P(rbox(754, 338, 140, 24), BLUE, BLUE_D, 3.5);                // 2nd section, out
  P(rbox(764, 343, 120, 3), BLUE_L);
  P(rbox(894, 340, 139, 20), BLUE, BLUE_D, 3.5);                // 3rd section, out
  P(rbox(904, 344, 119, 3), BLUE_L);
  P(rbox(1033, 338, 48, 24), BLUE, BLUE_D, 3.5);                // head
  P(rbox(1042, 344, 8, 12), BLUE_D);
  P(rbox(1057, 344, 8, 12), BLUE_D);
  P(rbox(1081, 333, 14, 34), BLUE_L, BLUE_D, 3.5);
  { const [a, b] = rot([1095, CY - 8 * BW]); const [p, q] = rot([1095, CY + 8 * BW]); P(`M ${f(a)} ${f(b)} A 8 8 0 0 1 ${f(p)} ${f(q)} Z`, INK); }   // hook

  if (cover) {
    // every area named, with its slew angle as the controller shows it (left/right of the rear)
    areas.forEach((a, i) => {
      const R = RMAX * areaDrawR(a, i);
      for (const [a1, a2raw] of a.ranges || []) {
        let a2 = a2raw;
        while (a2 <= a1) a2 += 360;
        const mid = (a1 + a2) / 2;
        const c = Math.cos(rad(mid)), s = Math.sin(rad(mid));
        let x, y;
        if (c > 0.8) { x = CX + R + 36 * K; y = CY - 4 * K; }          // rear: label beyond the fan
        else if (c < -0.8) { x = CX - R - 32 * K; y = CY - 4 * K; }    // front: label outside
        else { const rr = R * 0.74; x = CX + rr * c; y = CY - rr * s - (s > 0.5 ? 10 : 4) * K; }
        const [lo, hi] = slewRange([a1, a2raw]);
        items.push({ text: a.name, x, y, size: 13 * K, bold: true, color: NAVY, anchor: 'middle' });
        items.push({ text: `${lo}° ~ ${hi}°`, x, y: y + 14 * K, size: 10 * K, bold: true, color: '#4B5B6C', anchor: 'middle' });
      }
    });
    return { x0: CX - 150 * K, y0: CY - 116 * K, w: 370 * K, h: 232 * K, items };
  }
  // one fixed 16:10 view for every area (only the colours change), set a little low so the fan above the
  // truck (the side area) shows
  const w = 1160 / 0.9, h = w / 1.6;
  return { x0: 485 - w / 2, y0: 240 - h / 2, w, h, items };
}

// ------------------------------------------------------------------------------------------- front view
/** Outrigger front view. Coordinates are those of the 941 × 596 truck drawing (the image is its crop at 52, 40). */
export function outriggerFront(pct) {
  const all = pct === 'all';
  const p = all ? 0.3 : Math.max(0.2, Math.min(1, Number(pct) || 0));
  const G = 487;                 // ground line
  // extension scale: 50 % at x 595, 100 % at x 705, so 0 % lands right at the truck's side
  const X0 = 485, L = 220;
  const xr = 477;                // the beam comes out from behind the cab here
  const xj = Math.max(X0 + L * p, 520);
  const jw = 40;                 // jack housing
  const jTop = 272, jBot = 406;
  const bh = 36, by = 276 + bh * 0.6;   // box beam, set down 60 % of its height from the top of the jack
  const padW = 74, padH = 12;
  const jack = all ? BEAM : BLUE, jackE = all ? BEAM_E : BLUE_D;   // grey when the state doesn't matter
  // the truck at 90 %, shrunk towards where the beam leaves it, standing on the ground line
  const TS = 0.9;
  const items = [{ image: 'truck', href: TRUCK_SRC, x: xr + (52 - xr) * TS, y: G + (40 - G) * TS, w: 528 * TS, h: 455 * TS }];
  const P = (d, fill, stroke = null, sw = 0, extra = {}) => items.push({ d, fill, stroke, sw, ...extra });

  P(line(52, G, 880, G), null, '#55595E', 2.2);
  for (const [frac, lab] of [[0, '0%'], [0.5, '50%'], [1, '100%']]) {   // 0 % = the truck's side
    const x = X0 + L * frac;
    P(line(x, 236, x, G + 8), null, '#C2CBD5', 3, { dash: [12, 10] });
    items.push({ text: lab, x, y: G + 52, size: 32, bold: true, color: '#8C97A3', anchor: 'middle' });
  }
  if (xj < X0 + L - 2) {         // ghost of the fully extended outrigger
    const g = X0 + L;
    for (const d of [rect(xr, by, g - xr, bh), rect(g - jw / 2, jTop, jw, jBot - jTop), rect(g - padW / 2, G - padH, padW, padH)]) {
      P(d, null, '#B4BFCB', 2.4, { dash: [10, 8] });
    }
  }
  // outrigger: grey box beam into the top of the jack (ㄱ), chromed rod, float pad
  P(rect(xr, by, xj - xr, bh), BEAM, BEAM_E, 2.4);
  P(line(xr + 6, by + 11, xj - jw / 2, by + 11), null, '#AEB9C5', 2);
  P(rect(xj - 10, jBot, 20, G - padH - jBot), '#DCE3EA', '#7D8B9A', 2);
  P(rect(xj - jw / 2, jTop, jw, jBot - jTop), jack, jackE, 2.4);
  P(rect(xj - jw / 2 - 4, jTop - 9, jw + 8, 11), INK);
  P(rect(xj - jw / 2, jBot - 10, jw, 10), jackE);
  P(rrect(xj - padW / 2, G - padH, padW, padH, 3), INK);
  return { x0: 22, y0: 22, w: 896, h: 560, items };
}
