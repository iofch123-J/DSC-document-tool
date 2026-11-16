// Shared PDF generation for the admin and user screens.
import { buildPdf } from '../pdf/render.js';
import { TRUCK_SRC } from '../pdf/pictures.js';

let fontCache = null;
let imageCache = null;

/** Raster parts of the pictures (fetched once): the outrigger picture's truck drawing. */
async function loadImages() {
  if (imageCache) return imageCache;
  const out = {};
  try {
    const res = await fetch(TRUCK_SRC);
    if (res.ok) out.truck = new Uint8Array(await res.arrayBuffer());
  } catch { /* the PDF still draws, just without the truck */ }
  imageCache = out;
  return out;
}

export async function loadFonts(progress) {
  if (fontCache) return fontCache;
  const names = { regular: 'Pretendard-Regular.ttf', bold: 'Pretendard-Bold.ttf', extra: 'Pretendard-ExtraBold.ttf' };
  const out = {};
  let i = 0;
  for (const [k, n] of Object.entries(names)) {
    progress?.(`폰트 불러오는 중 (${++i}/3) — 처음 한 번만`);
    const res = await fetch(`fonts/${n}`);
    if (!res.ok) throw new Error(`폰트를 불러오지 못했습니다: ${n}`);
    out[k] = new Uint8Array(await res.arrayBuffer());
  }
  fontCache = out;
  return out;
}

/** Build a PDF Blob. opts: { mode: 'customer'|'internal', dist: { to, ctrl, date } } */
export async function makePdf(model, opts, progress) {
  if (!window.PDFLib || !window.fontkit) throw new Error('PDF 라이브러리를 불러오지 못했습니다. 새로고침해 보세요.');
  const fonts = await loadFonts(progress);
  const images = await loadImages();
  progress?.('PDF 만드는 중…');
  const bytes = await buildPdf(model, { PDFLib: window.PDFLib, fontkit: window.fontkit, fonts, images, ...opts });
  return new Blob([bytes], { type: 'application/pdf' });
}
