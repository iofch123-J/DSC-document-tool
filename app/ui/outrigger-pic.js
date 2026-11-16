// 조회 screen: outrigger picture = truck line drawing (img/outrigger-truck.png, cab glass shaded so the
// interior doesn't show) with the outrigger drawn on top as vectors, so the jack follows the state.
// Coordinates are those of the original 941 × 596 drawing; the truck image is its crop at (52, 40).
// (The PDF keeps the all-vector outriggerDiagram in pdf/diagrams.js.)

export const TRUCK_SRC = 'img/outrigger-truck.png';

const BLUE = '#3F6DB5';
const BLUE_D = '#244C8A';
const INK = '#1F2D3D';
const f = (n) => (Math.round(n * 10) / 10).toString();
const rect = (x, y, w, h) => `M ${f(x)} ${f(y)} H ${f(x + w)} V ${f(y + h)} H ${f(x)} Z`;
const rrect = (x, y, w, h, r) => `M ${f(x + r)} ${f(y)} H ${f(x + w - r)} Q ${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)} V ${f(y + h - r)} `
  + `Q ${f(x + w)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)} H ${f(x + r)} Q ${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - r)} V ${f(y + r)} Q ${f(x)} ${f(y)} ${f(x + r)} ${f(y)} Z`;
const line = (x1, y1, x2, y2) => `M ${f(x1)} ${f(y1)} L ${f(x2)} ${f(y2)}`;

/** SVG markup; pct 0..1 of the maximum extension, or 'all' (area where the outrigger state doesn't matter). */
export function outriggerPicture(pct) {
  const all = pct === 'all';
  const p = all ? 0.3 : Math.max(0.2, Math.min(1, Number(pct) || 0));
  const G = 487;                 // ground line of the drawing
  const X0 = 438;                // where 0 % would be: 50 % → x 595, 100 % → x 752
  const L = 314;
  const xr = 477;                // the beam comes out from behind the cab here
  const xj = Math.max(X0 + L * p, 520);
  const jw = 40;                 // jack housing
  const jTop = 272, jBot = 406;
  const by = 279, bh = 30;       // box beam, just under the jack's top cap
  const padW = 74, padH = 12;
  const beam = all ? '#8E9DAD' : BLUE;
  const edge = all ? '#6B7A8B' : BLUE_D;
  const out = [`<image href="${TRUCK_SRC}" x="52" y="40" width="528" height="455"/>`];
  const P = (d, fill, stroke = null, sw = 0, extra = '') => out.push(
    `<path d="${d}" fill="${fill || 'none'}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"` : ''}${extra}/>`);

  // ground (continues the drawing's own line) and the 50 % / 100 % marks, labelled under the ground
  P(line(575, G, 880, G), null, '#55595E', 2.2);
  for (const [frac, lab] of [[0.5, '50%'], [1, '100%']]) {
    const x = X0 + L * frac;
    P(line(x, 236, x, G + 8), null, '#C2CBD5', 3, ' stroke-dasharray="12 10"');
    out.push(`<text x="${x}" y="${G + 52}" font-size="38" font-weight="800" fill="#8C97A3" text-anchor="middle">${lab}</text>`);
  }
  // ghost of the fully extended outrigger
  if (xj < X0 + L - 2) {
    const g = X0 + L;
    const ghost = ' stroke-dasharray="10 8"';
    P(rect(xr, by, g - xr, bh), null, '#B4BFCB', 2.4, ghost);
    P(rect(g - jw / 2, jTop, jw, jBot - jTop), null, '#B4BFCB', 2.4, ghost);
    P(rect(g - padW / 2, G - padH, padW, padH), null, '#B4BFCB', 2.4, ghost);
  }
  // outrigger: box beam into the top of the jack (ㄱ), chromed rod, float pad
  P(rect(xr, by, xj - xr, bh), beam, edge, 2.4);
  P(line(xr + 6, by + 9, xj - jw / 2, by + 9), null, all ? '#AEB9C5' : '#86A6DA', 2);
  P(rect(xj - 10, jBot, 20, G - padH - jBot), '#DCE3EA', '#7D8B9A', 2);
  P(rect(xj - jw / 2, jTop, jw, jBot - jTop), beam, edge, 2.4);
  P(rect(xj - jw / 2 - 4, jTop - 9, jw + 8, 11), INK);
  P(rect(xj - jw / 2, jBot - 10, jw, 10), edge);
  P(rrect(xj - padW / 2, G - padH, padW, padH, 3), INK);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="52 40 840 520" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="아우트리거 ${all ? '전 구간' : `${Math.round(p * 100)}% 신장`}">${out.join('')}</svg>`;
}
