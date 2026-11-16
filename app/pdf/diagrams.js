// Parametric diagrams (working area top view, outrigger extension), generated from settings.
// Output is a neutral shape list so the same drawing feeds both the PDF and the on-screen SVG.
//   path item: { d, fill, opacity, stroke, sw, dash }
//   text item: { text, x, y, size, bold, color, anchor }

import { slewRange } from '../core/model.js';

export const NAVY = '#14304D';
export const AMBER = '#E0940F';
const INK = '#1F2D3D';
const GLASS = '#A9BCCF';
const TIRE = '#2B3541';
const STEEL = '#E4EAF1';
const BLUE = '#3F6DB5';
const BLUE_D = '#244C8A';
export const COVER_FILLS = [['#E0940F', 0.55], ['#5F86AE', 0.42], ['#9AAABB', 0.42], ['#7FA37A', 0.42], ['#B07AA1', 0.42]];

const rad = (a) => (a * Math.PI) / 180;
const f = (n) => Math.round(n * 100) / 100;

function sectorPath(cx, cy, R, a1, a2) {
  let b = a2;
  while (b <= a1) b += 360;
  const p = (a) => [cx + R * Math.cos(rad(a)), cy - R * Math.sin(rad(a))];
  const [x1, y1] = p(a1);
  const [x2, y2] = p(b);
  const large = b - a1 > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${f(x1)} ${f(y1)} A ${R} ${R} 0 ${large} 0 ${f(x2)} ${f(y2)} Z`;
}

const rect = (x, y, w, h) => `M ${f(x)} ${f(y)} L ${f(x + w)} ${f(y)} L ${f(x + w)} ${f(y + h)} L ${f(x)} ${f(y + h)} Z`;
const rrect = (x, y, w, h, r) => {
  r = Math.min(r, w / 2, h / 2);
  return `M ${f(x + r)} ${f(y)} L ${f(x + w - r)} ${f(y)} Q ${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)} L ${f(x + w)} ${f(y + h - r)} `
    + `Q ${f(x + w)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)} L ${f(x + r)} ${f(y + h)} Q ${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - r)} `
    + `L ${f(x)} ${f(y + r)} Q ${f(x)} ${f(y)} ${f(x + r)} ${f(y)} Z`;
};
const circle = (cx, cy, r) => `M ${f(cx - r)} ${f(cy)} A ${r} ${r} 0 1 0 ${f(cx + r)} ${f(cy)} A ${r} ${r} 0 1 0 ${f(cx - r)} ${f(cy)} Z`;
const line = (x1, y1, x2, y2) => `M ${f(x1)} ${f(y1)} L ${f(x2)} ${f(y2)}`;

/**
 * Top view of a cargo-crane truck, front to the LEFT, crane turret at (cx, cy).
 * Cab · crane between cab and bed · slatted cargo bed · boom stowed over the bed ·
 * front axle + rear tandem · outriggers behind the crane and at the rear (extended).
 */
function truckTop(cx, cy) {
  const it = [];
  const hw = 17; // half width of cab / bed
  const cab0 = cx - 52, cab1 = cx - 18;
  const bed0 = cx + 14, bed1 = cx + 110;

  // outriggers (extended, under everything else)
  for (const ox of [cx + 9, cx + 104]) {
    it.push({ d: rect(ox - 3, cy - 46, 6, 92), fill: '#8E9DAD', stroke: '#6B7A8B', sw: 0.6 });
    it.push({ d: rrect(ox - 7, cy - 51, 14, 5, 1), fill: NAVY });
    it.push({ d: rrect(ox - 7, cy + 46, 14, 5, 1), fill: NAVY });
  }
  // tyres: front axle, rear tandem (slightly wider than the body, like the real track)
  for (const tx of [cab0 + 9, bed1 - 42, bed1 - 25]) {
    it.push({ d: rrect(tx, cy - hw - 3, 13, 6, 1.5), fill: TIRE });
    it.push({ d: rrect(tx, cy + hw - 3, 13, 6, 1.5), fill: TIRE });
  }
  // chassis rails visible between cab and bed
  it.push({ d: rect(cab1 - 2, cy - 8, bed0 - cab1 + 4, 3), fill: '#7A8899' });
  it.push({ d: rect(cab1 - 2, cy + 5, bed0 - cab1 + 4, 3), fill: '#7A8899' });
  // fuel tank (one side, under the gap)
  it.push({ d: rrect(cab1 + 1, cy + hw - 6, 12, 7, 2), fill: '#C9D2DC', stroke: '#6B7A8B', sw: 0.6 });

  // cargo bed: frame, floor, slats, side gates
  it.push({ d: rect(bed0, cy - hw - 1, bed1 - bed0, 2 * hw + 2), fill: '#FFFFFF', opacity: 0.8, stroke: INK, sw: 1.3 });
  it.push({ d: rect(bed0 + 2.5, cy - hw + 1.5, bed1 - bed0 - 5, 2 * hw - 3), fill: null, stroke: '#A8B5C3', sw: 0.7 });
  for (let x = bed0 + 11; x < bed1 - 4; x += 9) it.push({ d: line(x, cy - hw + 2, x, cy + hw - 2), stroke: '#D3DBE4', sw: 0.6, fill: null });

  // cab: body, windshield, roof hatch, door lines, mirrors, bumper
  it.push({ d: rrect(cab0, cy - hw, cab1 - cab0, 2 * hw, 5), fill: '#FFFFFF', stroke: INK, sw: 1.3 });
  it.push({ d: rrect(cab0 + 2, cy - hw + 3, 6, 2 * hw - 6, 2), fill: GLASS });
  it.push({ d: rrect(cab0 + 13, cy - 8, 15, 16, 2), fill: STEEL, stroke: '#8A99AA', sw: 0.7 });
  it.push({ d: line(cab0 + 10, cy - hw, cab0 + 10, cy - hw + 4), stroke: '#8A99AA', sw: 0.7, fill: null });
  it.push({ d: line(cab0 + 10, cy + hw, cab0 + 10, cy + hw - 4), stroke: '#8A99AA', sw: 0.7, fill: null });
  for (const s of [-1, 1]) {
    it.push({ d: line(cab0 + 7, cy + s * hw, cab0 + 4, cy + s * (hw + 6)), stroke: INK, sw: 1.1, fill: null });
    it.push({ d: rrect(cab0 + 1, s < 0 ? cy - hw - 10 : cy + hw + 5, 5, 5, 1), fill: INK });
  }
  it.push({ d: rrect(cab0 - 2.5, cy - hw + 2, 3, 2 * hw - 4, 1), fill: '#5B6B7C' });

  // crane: base plate, turret, stowed boom with telescopic sections, hook block
  it.push({ d: rrect(cx - 11, cy - 13, 22, 26, 2), fill: STEEL, stroke: INK, sw: 1.1 });
  it.push({ d: rrect(cx + 2, cy - 4.5, 98, 9, 1.5), fill: '#6E8299', stroke: '#3E4E60', sw: 0.8 });
  for (const x of [cx + 30, cx + 54, cx + 76]) it.push({ d: line(x, cy - 4.5, x, cy + 4.5), stroke: '#3E4E60', sw: 0.7, fill: null });
  it.push({ d: rrect(cx + 100, cy - 5.5, 7, 11, 1.5), fill: INK });
  it.push({ d: circle(cx, cy, 8.5), fill: NAVY });
  it.push({ d: circle(cx, cy, 3), fill: '#FFFFFF' });
  return it;
}

// Picture radius of each working area, as a share of the largest one. The real working radius
// differs by area (rear reaches furthest, then side, front least), so the fans differ too.
// Default by area order (후방 · 측방 · 전방 in the in-house layout); settable per area (area.drawR).
const DEFAULT_DRAW_R = [1, 0.78, 0.6];
export const areaDrawR = (a, i) => {
  const v = Number(a?.drawR);
  return Math.max(0.3, Math.min(1, v > 0 ? v : DEFAULT_DRAW_R[i] ?? 0.6));
};

/**
 * Top view of the truck with working-area sectors.
 * 0° points to the rear of the truck (truck faces left), angles grow counter-clockwise.
 * @param areas  settings.areas
 * @param active area id to highlight, or null for the cover (all areas coloured + labelled)
 */
export function areaDiagram(areas, active = null) {
  const cover = active === null;
  // the largest fan (rear) reaches well past the end of the bed, like the printed chart
  const W = cover ? 370 : 300, H = cover ? 232 : 226;
  const cx = cover ? 150 : 120, cy = cover ? 116 : 113, RMAX = 140;
  const items = [];
  areas.forEach((a, i) => {
    const R = RMAX * areaDrawR(a, i);
    const [fill, op] = cover ? COVER_FILLS[i % COVER_FILLS.length] : a.id === active ? [AMBER, 0.62] : ['#D3DAE2', 0.55];
    for (const [a1, a2] of a.ranges || []) items.push({ d: sectorPath(cx, cy, R, a1, a2), fill, opacity: op, stroke: '#FFFFFF', sw: 2 });
  });
  items.push(...truckTop(cx, cy));

  if (cover) {
    areas.forEach((a, i) => {
      const R = RMAX * areaDrawR(a, i);
      for (const [a1, a2raw] of a.ranges || []) {
        let a2 = a2raw;
        while (a2 <= a1) a2 += 360;
        const mid = (a1 + a2) / 2;
        const c = Math.cos(rad(mid)), s = Math.sin(rad(mid));
        let x, y;
        if (c > 0.8) { x = cx + R + 36; y = cy - 4; }          // rear: truck covers the fan, label beyond its edge
        else if (c < -0.8) { x = cx - R - 32; y = cy - 4; }    // front: small fan behind the cab, label outside
        else { const rr = R * 0.74; x = cx + rr * c; y = cy - rr * s - (s > 0.5 ? 10 : 4); }
        items.push({ text: a.name, x, y, size: 13, bold: true, color: NAVY, anchor: 'middle' });
        const [lo, hi] = slewRange([a1, a2raw]);   // as the controller shows it (left/right of the rear)
        items.push({ text: `${lo}° ~ ${hi}°`, x, y: y + 14, size: 10, bold: true, color: '#4B5B6C', anchor: 'middle' });
      }
    });
  }
  return { w: W, h: H, items };
}

/** Scale a path built by the helpers above (absolute M / L / Q / A / Z only) about (ox, oy). */
function scalePath(d, k, ox, oy) {
  const t = d.trim().split(/\s+/);
  const X = (v) => f(ox + (Number(v) - ox) * k);
  const Y = (v) => f(oy + (Number(v) - oy) * k);
  const out = [];
  for (let i = 0; i < t.length;) {
    const c = t[i++];
    out.push(c);
    if (c === 'M' || c === 'L') { out.push(X(t[i]), Y(t[i + 1])); i += 2; }
    else if (c === 'Q') { out.push(X(t[i]), Y(t[i + 1]), X(t[i + 2]), Y(t[i + 3])); i += 4; }
    else if (c === 'A') { out.push(f(t[i] * k), f(t[i + 1] * k), t[i + 2], t[i + 3], t[i + 4], X(t[i + 5]), Y(t[i + 6])); i += 7; }
    else if (c !== 'Z') throw new Error(`scalePath: unsupported command ${c}`);
  }
  return out.join(' ');
}

/**
 * Front view of a cab-over cargo truck standing on the ground line G, centred on tx,
 * at ≈ 26 px per metre (width 2.5 m · cab roof 3.0 m). The crane column shows above the roof.
 */
function truckFront(tx, G, beam, beamEdge) {
  const items = [];
  const hw = 32, roof = 44;

  // crane column showing above the cab roof
  items.push({ d: rrect(tx + 3, roof - 8, 20, 12, 2), fill: beam, stroke: beamEdge, sw: 0.9 });
  items.push({ d: circle(tx + 13, roof - 3.5, 1.8), fill: beamEdge });

  // tyres: rear duals peek out beside the front tyres; the bumper overlaps the tops
  for (const s of [-1, 1]) {
    items.push({ d: rrect(s < 0 ? tx - 32 : tx + 28, 106, 4, G - 106, 1.5), fill: '#1B232C' });
    items.push({ d: rrect(s < 0 ? tx - 28.5 : tx + 20, 103, 8.5, G - 103, 2.5), fill: TIRE });
  }
  items.push({ d: rect(tx - 20, 111, 40, 5), fill: '#3E4A57' });                                          // axle / underbody

  // cab (sides taper slightly towards the roof)
  items.push({
    d: `M ${tx - hw} 101 L ${tx - hw} 58 L ${tx - 30.5} 48.5 Q ${tx - 30} ${roof} ${tx - 25.5} ${roof} L ${tx + 25.5} ${roof} `
      + `Q ${tx + 30} ${roof} ${tx + 30.5} 48.5 L ${tx + hw} 58 L ${tx + hw} 101 Z`,
    fill: '#FFFFFF', stroke: INK, sw: 1.3,
  });
  for (const dx of [-5, 0, 5]) items.push({ d: rect(tx + dx - 1.6, roof + 1.6, 3.2, 1.8), fill: '#F2B544' }); // roof marker lamps
  items.push({ d: `M ${tx - 27} 49.5 L ${tx + 27} 49.5 L ${tx + 28.5} 71 L ${tx - 28.5} 71 Z`, fill: GLASS, stroke: INK, sw: 0.8 }); // windshield
  items.push({ d: `M ${tx - 18} 49.5 L ${tx - 9} 49.5 L ${tx - 22} 71 L ${tx - 27} 71 Z`, fill: '#FFFFFF', opacity: 0.35 });     // reflection
  items.push({ d: line(tx - 23, 69.8, tx - 4, 68.6), stroke: '#46525F', sw: 0.9, fill: null });           // wipers
  items.push({ d: line(tx + 3, 69.8, tx + 22, 68.6), stroke: '#46525F', sw: 0.9, fill: null });
  items.push({ d: rect(tx - 5, 73, 10, 2.4), fill: '#9AA7B5' });                                          // badge
  items.push({ d: rrect(tx - 19, 77, 38, 11, 1.5), fill: '#46525F' });                                    // grille
  for (const y of [79.6, 82.4, 85.2]) items.push({ d: line(tx - 16.5, y, tx + 16.5, y), stroke: '#7D8B9A', sw: 0.8, fill: null });
  for (const s of [-1, 1]) {
    const x = s < 0 ? tx - 30 : tx + 19;
    items.push({ d: rrect(x, 90, 11, 6.5, 1.5), fill: '#F4F1E1', stroke: INK, sw: 0.7 });                  // headlamp
    items.push({ d: rect(s < 0 ? x + 0.6 : x + 7.4, 90.6, 3, 5.3), fill: '#F2B544' });                     // indicator
  }
  items.push({ d: line(tx - hw + 1, 98, tx + hw - 1, 98), stroke: '#C2CBD5', sw: 0.8, fill: null });     // step line

  // bumper over the tyres
  items.push({ d: rrect(tx - hw - 1, 100, 2 * hw + 2, 12.5, 2), fill: '#5B6B7C' });
  items.push({ d: rect(tx - 12, 103.5, 24, 5.5), fill: '#E4EAF1', stroke: '#2B3541', sw: 0.5 });          // number plate
  items.push({ d: circle(tx - 25, 106.2, 2), fill: '#DDE3EA' });                                          // fog lamps
  items.push({ d: circle(tx + 25, 106.2, 2), fill: '#DDE3EA' });

  // mirrors on arms (main + wide-angle)
  for (const s of [-1, 1]) {
    const e = tx + s * hw;
    items.push({ d: line(e, 53, e + s * 6, 51), stroke: INK, sw: 1.1, fill: null });
    items.push({ d: rrect(s < 0 ? e - 11 : e + 6, 48.5, 5, 17, 1.5), fill: INK });
    items.push({ d: rrect(s < 0 ? e - 11 : e + 6, 67, 5, 5.5, 1.2), fill: INK });
  }
  return items;
}

/**
 * Outrigger extension: front view of a cargo truck with the outrigger on one side.
 * Modelled on truck-loader-crane photos: a box beam runs out from behind the cab into the
 * top of a vertical jack (ㄱ shape); the jack's chromed rod goes down to a float pad.
 * pct 0..1 of the maximum extension, or 'all' for "every state" (front area).
 */
export function outriggerDiagram(pct) {
  const all = pct === 'all';
  const p = all ? 0.3 : Math.max(0.12, Math.min(1, Number(pct) || 0));
  const K = 0.8;                         // truck drawn at 80 % of the 26 px/m figure
  const W = 140, tx = 46, G = 122, y0 = 42, H = 143;
  const items = [];
  const x0 = tx + 32 * K;                // the beam leaves the body here
  const L = 48;                          // jack centre at 100 % extension
  const jw = 6.5;                        // jack housing width
  const xj = x0 + Math.max(jw / 2 + 3, L * p);
  const jTop = G - 31, jBot = G - 10.5;  // jack housing ≈ 1.5 m … 0.5 m above ground, rod below
  const by = jTop, bh = 5.6;             // box beam flush with the top of the jack
  const padW = 12, padH = 2.8;
  const beam = all ? '#8E9DAD' : BLUE;
  const beamEdge = all ? '#6B7A8B' : BLUE_D;
  const ghost = { fill: null, stroke: '#B4BFCB', sw: 0.9, dash: true };

  // ground + 50 % / 100 % marks (jack centre line), labelled under the ground like a ruler
  items.push({ d: line(4, G, W - 4, G), stroke: '#9AA7B5', sw: 1.2, fill: null });
  for (const [frac, lab] of [[0.5, '50%'], [1, '100%']]) {
    const x = x0 + L * frac;
    items.push({ d: line(x, jTop - 6, x, G + 2.5), stroke: '#C2CBD5', sw: 0.9, dash: true, fill: null });
    items.push({ text: lab, x, y: G + 9.5, size: 7.5, bold: true, color: '#66727F', anchor: 'middle' });
  }
  // ghost of the fully extended outrigger
  if (xj < x0 + L - 1) {
    const g = x0 + L;
    items.push({ d: rect(x0, by, L, bh), ...ghost });
    items.push({ d: rect(g - jw / 2, jTop, jw, jBot - jTop), ...ghost });
    items.push({ d: rect(g - padW / 2, G - padH, padW, padH), ...ghost });
  }

  // outrigger (drawn before the truck so the cab hides the root of the beam)
  items.push({ d: rect(x0 - 8, by, xj - x0 + 8, bh), fill: beam, stroke: beamEdge, sw: 0.9 });          // box beam
  items.push({ d: line(x0 + 2, by + 1.8, xj - jw / 2, by + 1.8), stroke: all ? '#AEB9C5' : '#86A6DA', sw: 0.6, fill: null });
  items.push({ d: rect(xj - 2, jBot, 4, G - padH - jBot), fill: '#DCE3EA', stroke: '#7D8B9A', sw: 0.7 }); // rod
  items.push({ d: rect(xj - jw / 2, jTop, jw, jBot - jTop), fill: beam, stroke: beamEdge, sw: 0.9 });     // jack housing
  items.push({ d: rect(xj - jw / 2 - 0.8, jTop - 2, jw + 1.6, 2.4), fill: INK });                        // top cap
  items.push({ d: rect(xj - jw / 2, jBot - 2.4, jw, 2.4), fill: beamEdge });                              // gland
  items.push({ d: rrect(xj - padW / 2, G - padH, padW, padH, 0.8), fill: INK });                         // float pad

  // the truck, scaled about its ground centre
  for (const it of truckFront(tx, G, beam, beamEdge)) {
    items.push({ ...it, d: scalePath(it.d, K, tx, G), sw: it.sw && f(it.sw * 0.9) });
  }
  // visible area y = 42 … 143: a little sky above the crane column, the labels under the ground
  return { w: W, h: H - y0, y0, items };
}

/** Render a shape list as an SVG string (for the screens). */
export function toSvg(dg, attrs = '') {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const parts = dg.items.map((it) => {
    if (it.image) return `<image href="${it.href}" x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}"/>`;
    if (it.text !== undefined) {
      return `<text x="${it.x}" y="${it.y}" font-size="${it.size}" ${it.bold ? 'font-weight="700"' : ''} fill="${it.color || NAVY}" text-anchor="${it.anchor || 'start'}">${esc(it.text)}</text>`;
    }
    const dash = it.dash ? ` stroke-dasharray="${Array.isArray(it.dash) ? it.dash.join(' ') : '3 3'}"` : '';
    return `<path d="${it.d}" fill="${it.fill || 'none'}" ${it.opacity !== undefined ? `fill-opacity="${it.opacity}"` : ''} ${it.stroke ? `stroke="${it.stroke}" stroke-width="${it.sw || 1}" stroke-linejoin="round"${it.cap ? ' stroke-linecap="round"' : ''}` : ''}${dash}/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${dg.x0 || 0} ${dg.y0 || 0} ${dg.w} ${dg.h}" ${attrs}>${parts.join('')}</svg>`;
}
