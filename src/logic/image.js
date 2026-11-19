/** 浏览器端图像工具：读取、缩放、缩略图、下载与剪贴板。 */

const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;
const ACCEPTED = /^image\/(jpeg|png|webp|avif|heic|heif)$/i;

export function isImageFile(file) {
  return Boolean(file && (ACCEPTED.test(file.type) || /\.(jpe?g|png|webp|avif|heic|heif)$/i.test(file.name)));
}

export function validateImageFile(file) {
  if (!file) return '没有选择图片';
  if (!isImageFile(file)) return '请选择 JPG、PNG、WebP 或 HEIC 图片';
  if (file.size > MAX_UPLOAD_BYTES) return '图片超过 24MB，请先压缩后再试';
  return '';
}

export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片无法解码'));
    img.src = src;
  });
}

export async function fileToBitmap(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawToCanvas(source, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  // 用纸张色打底，避免透明 PNG 在 JPEG 中变黑
  ctx.fillStyle = '#f2ecdd';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** 上传后统一转成 1800px 内的 JPEG dataURL，方向已由浏览器校正 */
export async function prepareImage(file) {
  const bitmap = await fileToBitmap(file);
  const width = bitmap.width || bitmap.naturalWidth;
  const height = bitmap.height || bitmap.naturalHeight;
  if (!width || !height) throw new Error('无法读取图片尺寸');
  const max = 2400;
  const scale = Math.min(1, max / Math.max(width, height));
  const canvas = drawToCanvas(bitmap, width * scale, height * scale);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  if (typeof bitmap.close === 'function') bitmap.close();
  return {
    src: dataUrl,
    width: Math.round(width),
    height: Math.round(height),
    displayWidth: canvas.width,
    displayHeight: canvas.height,
    name: file.name || '风景照片',
    size: file.size,
    type: file.type
  };
}

/** 给识别器生成一份 900px 内的像素数据 */
export async function imageDataFromSource(src, max = 900) {
  const img = await loadImage(src);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const scale = Math.min(1, max / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** 让 demo SVG 也能走同一套识别与展示流程 */
export async function imageFromUrl(url, name = '示例风景') {
  const img = await loadImage(url);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  return {
    src: url,
    width,
    height,
    displayWidth: width,
    displayHeight: height,
    name,
    size: 0,
    type: 'image/svg+xml'
  };
}

export async function makeThumbnail(src, max = 440, quality = 0.72) {
  const img = await loadImage(src);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const scale = Math.min(1, max / Math.max(width, height));
  const canvas = drawToCanvas(img, width * scale, height * scale);
  return canvas.toDataURL('image/jpeg', quality);
}

/** 保存历史时压缩，避免 localStorage 爆掉 */
export async function makeHistoryImage(src, max = 1080, quality = 0.76) {
  const img = await loadImage(src);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const scale = Math.min(1, max / Math.max(width, height));
  const canvas = drawToCanvas(img, width * scale, height * scale);
  return canvas.toDataURL('image/jpeg', quality);
}

export function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] || 'image/jpeg';
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadText(text, filename) {
  downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), filename);
}

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('图片导出失败'))), type, quality);
  });
}

export async function shareOrDownload(blob, filename, text = '') {
  const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (error) {
      if (error.name === 'AbortError') return 'cancelled';
    }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}
