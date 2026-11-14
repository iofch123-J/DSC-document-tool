// Company logo (CI) for the top bar. The repository is public, so the logo file is never
// committed: an administrator picks it once and it is kept in this browser (IndexedDB meta).
export const BRAND_LOGO = 'brandLogo';

/** Read a PNG/JPG file into { dataUrl, fileName, width, height, updatedAt }. */
export async function readLogoFile(file) {
  if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error('PNG 또는 JPG 이미지만 쓸 수 있습니다.');
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  return { dataUrl, fileName: file.name, width: img.naturalWidth, height: img.naturalHeight, updatedAt: new Date().toISOString() };
}
