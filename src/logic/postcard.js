/**
 * 本地水墨明信片渲染器。
 *
 * 不调用外部图像模型：从照片的主色、场景分类与构图指标中提炼
 * 1–3 个核心符号，在 Canvas 上重新绘制下半版的水墨插画，再与
 * 真实照片、英文题字合成为 2:3 竖版明信片。
 *
 * 这样照片只负责“真实”，水墨部分由本地绘制，文字由 Canvas 排字，
 * 整张明信片可以在浏览器里独立产出，不需要 Photoshop / 生图服务。
 */
import { loadImage } from './image.js';
import { buildPostcardCopy, normalizePostcardText } from '../data/postcard-copy.js';

export const POSTCARD_SIZES = {
  preview: { width: 1080, height: 1620 },
  print: { width: 2160, height: 3240 }
};

export const POSTCARD_STYLE = {
  paper: '#F3EDE1',
  title: '#3A352E',
  caption: '#6E6659',
  seam: 0.5,
  fadeStart: 0.8,
  fadeEnd: 0.9
};

const PAPER = POSTCARD_STYLE.paper;
const TITLE = POSTCARD_STYLE.title;
const CAPTION = POSTCARD_STYLE.caption;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function parseHex(hex) {
  const value = String(hex || '').replace('#', '');
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value.padEnd(6, '0').slice(0, 6);
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16)
  };
}

function toHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

function mix(a, b, t) {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex({
    r: x.r + (y.r - x.r) * t,
    g: x.g + (y.g - x.g) * t,
    b: x.b + (y.b - x.b) * t
  });
}

function darken(hex, amount) {
  return mix(hex, '#17211C', amount);
}

function desaturate(hex, amount) {
  const color = parseHex(hex);
  const gray = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  return toHex({
    r: color.r + (gray - color.r) * amount,
    g: color.g + (gray - color.g) * amount,
    b: color.b + (gray - color.b) * amount
  });
}

/** 从照片调色板提取一套和纸色协调的淡墨色，而不是重新画一套颜色。 */
export function derivePostcardPalette(analysis, scene) {
  const source = analysis?.palette?.length ? analysis.palette : scene?.gradient || ['#5F7A6A', '#B6A57F', '#F3EDE1'];
  const base = source[0] || '#5F7A6A';
  const warm = (analysis?.metrics?.warmRatio || 0) > 0.2;
  // 主色只作为“倾向”，不让一张绿色照片的下版变成一整块绿水；
  // 明信片统一用暖灰墨、浅灰墨与纸色，只在暗部保留一点原图色相。
  return {
    paper: PAPER,
    mist: '#F8F3E8',
    deep: mix('#2E342E', base, 0.08),
    mid: mix('#686B5F', base, 0.1),
    pale: mix('#C9C3B4', PAPER, 0.18),
    accent: mix(warm ? '#B96A4C' : '#9B7B52', PAPER, 0.18)
  };
}

/* ------------------------------------------------------------------ */
/* small drawing primitives                                           */
/* ------------------------------------------------------------------ */

function withWash(ctx, color, alpha, blur, build, blend = 'source-over') {
  ctx.save();
  ctx.globalCompositeOperation = blend;
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.fillStyle = color;
  if (blur > 0) ctx.filter = `blur(${blur}px)`;
  ctx.beginPath();
  build(ctx);
  ctx.fill();
  ctx.restore();
}

function withStroke(ctx, color, alpha, width, blur, build) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (blur > 0) ctx.filter = `blur(${blur}px)`;
  ctx.beginPath();
  build(ctx);
  ctx.stroke();
  ctx.restore();
}

function polygon(ctx, points, base) {
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.lineTo(points[points.length - 1].x, base);
  ctx.lineTo(points[0].x, base);
  ctx.closePath();
}

function mirrorPoints(points) {
  return points.map(([x, y]) => [1 - x, y]).reverse();
}

function ridge(ctx, points, base) {
  ctx.moveTo(0, base);
  for (const point of points) ctx.lineTo(point.x, point.y);
  ctx.lineTo(points[points.length - 1].x, base);
  ctx.closePath();
}

function smoothArea(ctx, points, base) {
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const current = points[i];
    const midX = (prev.x + current.x) / 2;
    const midY = (prev.y + current.y) / 2;
    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, base);
  ctx.lineTo(points[0].x, base);
  ctx.closePath();
}

function ellipse(ctx, x, y, rx, ry) {
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

function circle(ctx, x, y, r) {
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function birds(ctx, x, y, size, color, alpha, count = 3) {
  for (let i = 0; i < count; i++) {
    const bx = x + i * size * 2.4;
    const by = y + (i % 2 ? -size * 0.34 : size * 0.18);
    withStroke(ctx, color, alpha, Math.max(1, size * 0.11), 0.7, (c) => {
      c.moveTo(bx - size, by);
      c.quadraticCurveTo(bx - size * 0.28, by - size * 0.34, bx, by);
      c.quadraticCurveTo(bx + size * 0.28, by - size * 0.34, bx + size, by);
    });
  }
}

function pine(ctx, x, base, height, ink, alpha, k) {
  withStroke(ctx, ink.deep, alpha, 2.2 * k, 0.6, (c) => {
    c.moveTo(x, base);
    c.lineTo(x, base - height);
  });
  const levels = 4;
  for (let i = 0; i < levels; i++) {
    const y = base - height + (height * i) / levels;
    const spread = height * (0.22 + i * 0.06);
    withStroke(ctx, ink.deep, alpha * 0.9, 2 * k, 1.1, (c) => {
      c.moveTo(x - spread, y);
      c.quadraticCurveTo(x, y - height * 0.1, x + spread, y);
    });
  }
}

function boat(ctx, x, y, size, ink, alpha, k) {
  withWash(ctx, ink.deep, alpha * 0.75, 1.2 * k, (c) => {
    c.moveTo(x - size, y);
    c.quadraticCurveTo(x - size * 0.55, y + size * 0.26, x + size, y);
    c.quadraticCurveTo(x + size * 0.4, y + size * 0.1, x - size, y);
  });
  withStroke(ctx, ink.deep, alpha * 0.7, 1.6 * k, 0.5, (c) => {
    c.moveTo(x, y - size * 0.06);
    c.lineTo(x, y - size * 0.95);
    c.lineTo(x + size * 0.62, y - size * 0.45);
    c.lineTo(x, y - size * 0.45);
  });
}

function house(ctx, x, base, size, ink, alpha, k) {
  withWash(ctx, ink.mid, alpha * 0.55, 2.2 * k, (c) => {
    c.rect(x - size, base - size * 1.25, size * 2, size * 1.25);
  }, 'source-over');
  withStroke(ctx, ink.deep, alpha * 0.85, 1.8 * k, 0.7, (c) => {
    c.moveTo(x - size * 1.18, base - size * 1.2);
    c.lineTo(x, base - size * 1.9);
    c.lineTo(x + size * 1.18, base - size * 1.2);
  });
  withStroke(ctx, ink.deep, alpha * 0.55, 1.2 * k, 0.5, (c) => {
    c.moveTo(x - size * 0.18, base);
    c.lineTo(x - size * 0.18, base - size * 0.55);
    c.lineTo(x + size * 0.22, base - size * 0.55);
    c.lineTo(x + size * 0.22, base);
  });
}

function reeds(ctx, x, base, height, ink, alpha, k, side = 1) {
  for (let i = 0; i < 5; i++) {
    const bx = x + i * 6 * k * side;
    const h = height * (0.62 + i * 0.08);
    withStroke(ctx, ink.deep, alpha * (0.38 + i * 0.05), 1.5 * k, 0.6, (c) => {
      c.moveTo(bx, base);
      c.quadraticCurveTo(bx + 5 * k * side, base - h * 0.5, bx + 12 * k * side, base - h);
    });
  }
}

function mistBand(ctx, top, width, y, height, paper) {
  const gradient = ctx.createLinearGradient(0, y - height / 2, 0, y + height / 2);
  gradient.addColorStop(0, 'rgba(243,237,225,0)');
  gradient.addColorStop(0.42, 'rgba(243,237,225,0.72)');
  gradient.addColorStop(0.62, 'rgba(243,237,225,0.55)');
  gradient.addColorStop(1, 'rgba(243,237,225,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, y - height / 2, width, height);
  ctx.restore();
}

function glow(ctx, x, y, radius, color, alpha) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`);
  gradient.addColorStop(0.48, `${color}${Math.round(alpha * 0.55 * 255).toString(16).padStart(2, '0')}`);
  gradient.addColorStop(1, `${color}00`);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* scene drawings                                                     */
/* ------------------------------------------------------------------ */

/**
 * 每个场景只保留 1–3 个符号：一条地形线、一个竖向物、一个小细节。
 * 所有坐标以底版为参照，main side 会让主体偏向一侧，另一侧留白。
 */
function drawScene(ctx, sceneId, { w, top, ph, ink, variant, intensity }) {
  const k = w / 1080;
  const base = top + ph * 0.78;
  const side = variant % 2 === 0 ? -1 : 1;
  const cx = side < 0 ? w * 0.31 : w * 0.69;
  const opposite = -side;
  const paper = PAPER;
  const a = (value) => clamp(value * intensity * 1.5, 0, 1);
  const mirror = (points) => points.map((point) => ({ x: w - point.x, y: point.y })).reverse();
  const normalized = (points) => points.map(([x, y]) => ({ x: x * w, y: top + y * ph }));
  const tint = ctx.createLinearGradient(0, top, 0, top + ph);
  tint.addColorStop(0, 'rgba(243,237,225,0)');
  tint.addColorStop(0.72, 'rgba(243,237,225,0.08)');
  tint.addColorStop(1, 'rgba(243,237,225,0.55)');
  ctx.save();
  ctx.fillStyle = tint;
  ctx.fillRect(0, top, w, ph);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, w, ph);
  ctx.clip();

  // 一个很淡的墨晕作为全场景的底，避免纯平纸面显得空。
  withWash(ctx, ink.pale, a(0.38), 58 * k, (c) => {
    ellipse(c, cx, top + ph * 0.56, w * 0.38, ph * 0.28);
  }, 'source-over');

  switch (sceneId) {
    case 'lake-mirror': {
      const baseRidge = [
        [0, 0.6],
        [0.08, 0.4],
        [0.17, 0.47],
        [0.29, 0.18],
        [0.4, 0.39],
        [0.52, 0.3],
        [0.63, 0.52],
        [0.78, 0.46],
        [1, 0.58]
      ];
      const ridgePoints = normalized(side < 0 ? baseRidge : mirrorPoints(baseRidge));
      withWash(ctx, ink.pale, a(0.5), 28 * k, (c) => ridge(c, ridgePoints, base));
      withWash(ctx, ink.mid, a(0.52), 14 * k, (c) => ridge(c, ridgePoints.map((point) => ({ x: point.x, y: point.y + 12 * k })), base));
      withWash(ctx, ink.deep, a(0.42), 5 * k, (c) => ridge(c, ridgePoints.map((point) => ({ x: point.x, y: point.y + 26 * k })), base));
      withStroke(ctx, ink.deep, a(0.4), 1.4 * k, 0.7 * k, (c) => {
        c.moveTo(ridgePoints[0].x, ridgePoints[0].y + 12 * k);
        for (const point of ridgePoints) c.lineTo(point.x, point.y + 12 * k);
      });
      const horizon = top + ph * 0.55;
      withWash(ctx, ink.pale, a(0.24), 30 * k, (c) => c.rect(0, horizon, w, base - horizon), 'source-over');
      withWash(ctx, ink.mid, a(0.16), 24 * k, (c) => {
        c.moveTo(0, horizon);
        c.quadraticCurveTo(w * 0.3, horizon - 8 * k, w, horizon + 2 * k);
        c.lineTo(w, base);
        c.lineTo(0, base);
        c.closePath();
      });
      for (let i = 0; i < 4; i++) {
        withStroke(ctx, ink.mid, a(0.2), 1.2 * k, 1.8 * k, (c) => {
          c.moveTo(cx + (i - 1.5) * 30 * k, horizon + 5 * k);
          c.lineTo(cx + (i - 1.5) * 30 * k, base + 10 * k);
        });
      }
      withStroke(ctx, ink.deep, a(0.45), 1.6 * k, 0.8 * k, (c) => {
        c.moveTo(w * 0.05, horizon);
        c.quadraticCurveTo(w * 0.36, horizon - 3 * k, w * 0.78, horizon + 1 * k);
      });
      boat(ctx, cx + opposite * w * 0.09, base - ph * 0.08, 34 * k, ink, a(0.75), k);
      mistBand(ctx, top, w, horizon - ph * 0.012, ph * 0.2, paper);
      reeds(ctx, side < 0 ? w * 0.1 : w * 0.9, base, ph * 0.24, ink, a(0.44), k, -side);
      birds(ctx, opposite > 0 ? w * 0.72 : w * 0.2, top + ph * 0.28, 5 * k, ink.deep, a(0.36), 2);
      break;
    }
    case 'coast': {
      const headland = normalized(
        side < 0
          ? [[0, 0.66], [0.1, 0.48], [0.23, 0.56], [0.34, 0.43], [0.48, 0.7]]
          : [[1, 0.66], [0.9, 0.48], [0.77, 0.56], [0.66, 0.43], [0.52, 0.7]]
      );
      const horizon = top + ph * 0.52;
      withWash(ctx, ink.mid, a(0.18), 32 * k, (c) => c.rect(0, horizon, w, base - horizon + ph * 0.1), 'source-over');
      withWash(ctx, ink.deep, a(0.45), 13 * k, (c) => polygon(c, headland, base));
      withWash(ctx, ink.pale, a(0.24), 32 * k, (c) => {
        c.rect(0, horizon, w, ph * 0.14);
      }, 'source-over');
      for (let i = 0; i < 5; i++) {
        const y = base - ph * 0.06 + i * 10 * k;
        withStroke(ctx, ink.mid, a(0.28), 2 * k, 2.4 * k, (c) => {
          c.moveTo(w * (0.1 + i * 0.07), y);
          c.quadraticCurveTo(w * 0.4, y - 6 * k, w * (0.62 + i * 0.035), y);
        });
      }
      glow(ctx, cx + opposite * w * 0.13, top + ph * 0.3, 65 * k, ink.accent, a(0.16));
      birds(ctx, opposite > 0 ? w * 0.67 : w * 0.2, top + ph * 0.29, 6 * k, ink.deep, a(0.48));
      mistBand(ctx, top, w, horizon - ph * 0.02, ph * 0.12, paper);
      break;
    }
    case 'sunset': {
      const sunX = cx + opposite * w * 0.08;
      glow(ctx, sunX, top + ph * 0.29, 120 * k, ink.accent, a(0.28));
      withWash(ctx, ink.accent, a(0.3), 28 * k, (c) => circle(c, sunX, top + ph * 0.3, 34 * k), 'source-over');
      const horizon = top + ph * 0.57;
      withWash(ctx, ink.mid, a(0.14), 34 * k, (c) => c.rect(0, horizon, w, base - horizon + ph * 0.12), 'source-over');
      withWash(ctx, ink.accent, a(0.2), 24 * k, (c) => c.rect(0, horizon, w, ph * 0.09), 'source-over');
      for (let i = 0; i < 4; i++) {
        withStroke(ctx, ink.accent, a(0.25), 4 * k, 4 * k, (c) => {
          const y = horizon + (i + 1) * 10 * k;
          c.moveTo(sunX - (52 - i * 10) * k, y);
          c.lineTo(sunX + (52 - i * 10) * k, y);
        });
      }
      const farHill = normalized(side < 0 ? [[0, 0.61], [0.3, 0.56], [0.52, 0.62], [0.76, 0.58], [1, 0.63]] : [[0, 0.63], [0.3, 0.58], [0.54, 0.62], [0.75, 0.56], [1, 0.61]]);
      withWash(ctx, ink.deep, a(0.24), 18 * k, (c) => ridge(c, farHill, base));
      reeds(ctx, side < 0 ? w * 0.11 : w * 0.85, base, ph * 0.24, ink, a(0.5), k, -side);
      birds(ctx, opposite > 0 ? w * 0.68 : w * 0.22, top + ph * 0.38, 5 * k, ink.deep, a(0.35), 2);
      break;
    }
    case 'forest': {
      for (let i = 0; i < 5; i++) {
        const x = cx + (i - 2) * 22 * k;
        const lean = (i % 2 ? 1 : -1) * 7 * k;
        withStroke(ctx, ink.deep, a(0.42), (2.2 + (i % 2) * 1.1) * k, 0.9 * k, (c) => {
          c.moveTo(x, base);
          c.quadraticCurveTo(x + lean, base - ph * 0.32, x + lean * 0.6, top + ph * 0.24);
        });
        withWash(ctx, ink.pale, a(0.16), 18 * k, (c) => {
          ellipse(c, x + lean, top + ph * 0.25, 50 * k, 28 * k);
        }, 'source-over');
      }
      withWash(ctx, ink.mid, a(0.22), 38 * k, (c) => {
        c.rect(0, base - ph * 0.16, w, ph * 0.16);
      }, 'source-over');
      withStroke(ctx, ink.mid, a(0.35), 18 * k, 14 * k, (c) => {
        c.moveTo(0, base + ph * 0.02);
        c.quadraticCurveTo(w * 0.35, base - ph * 0.18, w * 0.85, base);
      });
      withWash(ctx, ink.deep, a(0.12), 22 * k, (c) => {
        c.rect(0, base, w, ph * 0.04);
      });
      birds(ctx, side < 0 ? w * 0.77 : w * 0.2, top + ph * 0.34, 4 * k, ink.deep, a(0.3), 2);
      break;
    }
    case 'grassland': {
      const horizon = top + ph * 0.64;
      withWash(ctx, ink.pale, a(0.24), 35 * k, (c) => {
        c.moveTo(0, horizon + 20 * k);
        c.quadraticCurveTo(w * 0.25, horizon - 30 * k, w * 0.54, horizon + 4 * k);
        c.quadraticCurveTo(w * 0.8, horizon + 30 * k, w, horizon - 2 * k);
        c.lineTo(w, base + ph * 0.06);
        c.lineTo(0, base + ph * 0.06);
        c.closePath();
      });
      withWash(ctx, ink.mid, a(0.3), 18 * k, (c) => {
        c.moveTo(0, horizon + 60 * k);
        c.quadraticCurveTo(w * 0.3, horizon + 20 * k, w * 0.58, horizon + 56 * k);
        c.quadraticCurveTo(w * 0.82, horizon + 80 * k, w, horizon + 44 * k);
        c.lineTo(w, base + ph * 0.1);
        c.lineTo(0, base + ph * 0.1);
        c.closePath();
      });
      const hx = cx + opposite * w * 0.03;
      withStroke(ctx, ink.deep, a(0.62), 2 * k, 0.6 * k, (c) => {
        c.moveTo(hx - 24 * k, base + 2 * k);
        c.quadraticCurveTo(hx - 24 * k, base - 24 * k, hx, base - 28 * k);
        c.quadraticCurveTo(hx + 24 * k, base - 24 * k, hx + 24 * k, base + 2 * k);
      });
      withWash(ctx, ink.mid, a(0.22), 2 * k, (c) => {
        c.moveTo(hx - 26 * k, base - 24 * k);
        c.lineTo(hx, base - 48 * k);
        c.lineTo(hx + 26 * k, base - 24 * k);
        c.closePath();
      }, 'source-over');
      for (let i = 0; i < 14; i++) {
        const x = side < 0 ? w * (0.12 + i * 0.027) : w * (0.55 + i * 0.027);
        withStroke(ctx, ink.mid, a(0.22), 1 * k, 0.6 * k, (c) => {
          c.moveTo(x, base + 10 * k);
          c.lineTo(x + 3 * k, base - 10 * k);
        });
      }
      birds(ctx, opposite > 0 ? w * 0.72 : w * 0.22, top + ph * 0.35, 5 * k, ink.deep, a(0.4));
      break;
    }
    case 'snow': {
      const peaks = normalized(
        side < 0
          ? [[0, 0.71], [0.1, 0.49], [0.18, 0.58], [0.29, 0.29], [0.38, 0.48], [0.48, 0.42], [0.58, 0.62], [0.78, 0.56], [1, 0.66]]
          : [[0, 0.66], [0.24, 0.56], [0.42, 0.62], [0.52, 0.42], [0.62, 0.48], [0.71, 0.29], [0.82, 0.58], [0.9, 0.49], [1, 0.71]]
      );
      withWash(ctx, ink.pale, a(0.42), 25 * k, (c) => ridge(c, peaks, base), 'source-over');
      withWash(ctx, ink.mid, a(0.24), 12 * k, (c) => {
        const peak = peaks.reduce((best, point) => (point.y < best.y ? point : best), peaks[0]);
        c.moveTo(peak.x, peak.y);
        c.lineTo(peak.x + w * 0.09, base);
        c.lineTo(peak.x - w * 0.07, base);
        c.closePath();
      });
      withStroke(ctx, ink.deep, a(0.26), 1.2 * k, 0.8 * k, (c) => {
        for (const point of peaks.slice(1, -1)) {
          c.moveTo(point.x, point.y);
          c.lineTo(point.x + 18 * k, base);
        }
      });
      const flagX = side < 0 ? w * 0.11 : w * 0.86;
      withStroke(ctx, ink.deep, a(0.5), 1.2 * k, 0.5 * k, (c) => {
        c.moveTo(flagX, base);
        c.lineTo(flagX, top + ph * 0.58);
      });
      for (let i = 0; i < 3; i++) {
        withWash(ctx, i % 2 ? ink.accent : ink.mid, a(0.4), 1 * k, (c) => {
          const y = top + ph * (0.59 + i * 0.028);
          c.moveTo(flagX, y);
          c.lineTo(flagX + 24 * k, y + 5 * k);
          c.lineTo(flagX, y + 12 * k);
          c.closePath();
        }, 'source-over');
      }
      mistBand(ctx, top, w, top + ph * 0.64, ph * 0.18, paper);
      birds(ctx, opposite > 0 ? w * 0.68 : w * 0.22, top + ph * 0.38, 4 * k, ink.deep, a(0.25), 2);
      break;
    }
    case 'desert': {
      const sunX = cx + opposite * w * 0.08;
      glow(ctx, sunX, top + ph * 0.24, 125 * k, ink.accent, a(0.3));
      withWash(ctx, ink.accent, a(0.46), 20 * k, (c) => circle(c, sunX, top + ph * 0.24, 38 * k));
      const duneLines = [
        { y: 0.48, color: ink.pale, alpha: 0.26, blur: 28 },
        { y: 0.59, color: ink.mid, alpha: 0.38, blur: 16 },
        { y: 0.69, color: ink.deep, alpha: 0.32, blur: 8 }
      ];
      for (const { y, color, alpha, blur } of duneLines) {
        withWash(ctx, color, a(alpha), blur * k, (c) => {
          c.moveTo(0, top + ph * (y + 0.05));
          c.quadraticCurveTo(w * 0.22, top + ph * (y - 0.08), w * 0.46, top + ph * y);
          c.quadraticCurveTo(w * 0.68, top + ph * (y + 0.07), w, top + ph * (y - 0.03));
          c.lineTo(w, base + ph * 0.05);
          c.lineTo(0, base + ph * 0.05);
          c.closePath();
        });
      }
      // 一队很小的骆驼，是画面唯一的具体细节。
      const caravanX = side < 0 ? w * 0.68 : w * 0.32;
      for (let i = 0; i < 3; i++) {
        const x = caravanX + i * 38 * k;
        const y = base - ph * 0.09 + i * 5 * k;
        withWash(ctx, ink.deep, a(0.62), 1.2 * k, (c) => {
          c.ellipse(x, y - 12 * k, 12 * k, 6 * k, 0, 0, Math.PI * 2);
        });
        withStroke(ctx, ink.deep, a(0.62), 2.2 * k, 0.5 * k, (c) => {
          c.moveTo(x + 8 * k, y - 14 * k);
          c.lineTo(x + 12 * k, y - 30 * k);
          c.lineTo(x + 19 * k, y - 33 * k);
          c.moveTo(x - 7 * k, y - 6 * k);
          c.lineTo(x - 8 * k, y + 13 * k);
          c.moveTo(x + 4 * k, y - 6 * k);
          c.lineTo(x + 5 * k, y + 13 * k);
        });
      }
      withStroke(ctx, ink.mid, a(0.24), 1.2 * k, 2 * k, (c) => {
        c.moveTo(w * 0.08, top + ph * 0.46);
        c.quadraticCurveTo(w * 0.32, top + ph * 0.4, w * 0.58, top + ph * 0.47);
      });
      birds(ctx, opposite > 0 ? w * 0.75 : w * 0.25, top + ph * 0.22, 4 * k, ink.deep, a(0.34), 2);
      break;
    }
    case 'terraces': {
      withWash(ctx, ink.pale, a(0.27), 30 * k, (c) => {
        c.moveTo(0, base);
        c.quadraticCurveTo(w * 0.25, top + ph * 0.33, w * 0.68, top + ph * 0.48);
        c.quadraticCurveTo(w * 0.88, top + ph * 0.56, w, base);
        c.closePath();
      });
      for (let i = 0; i < 7; i++) {
        const y = top + ph * (0.52 + i * 0.043);
        withStroke(ctx, i % 2 ? ink.mid : ink.deep, a(0.2 + i * 0.025), (1 + i * 0.12) * k, 1.8 * k, (c) => {
          c.moveTo(0, y + 20 * k);
          c.quadraticCurveTo(w * 0.36, y - 16 * k, w * 0.7, y + 4 * k);
          c.quadraticCurveTo(w * 0.88, y + 16 * k, w, y);
        });
      }
      house(ctx, side < 0 ? w * 0.18 : w * 0.78, base - ph * 0.05, 17 * k, ink, a(0.45), k);
      for (let i = 0; i < 6; i++) {
        withStroke(ctx, ink.pale, a(0.25), 1.4 * k, 1.2 * k, (c) => {
          const y = top + ph * (0.58 + i * 0.035);
          c.moveTo(w * 0.15, y);
          c.quadraticCurveTo(w * 0.3, y - 8 * k, w * 0.46, y - 1 * k);
        });
      }
      birds(ctx, opposite > 0 ? w * 0.72 : w * 0.23, top + ph * 0.31, 4 * k, ink.deep, a(0.3), 2);
      break;
    }
    case 'canyon': {
      const left = normalized([[0, 0.38], [0.17, 0.46], [0.25, 0.62], [0.34, 0.78], [0.38, 1]]);
      const right = normalized([[1, 0.4], [0.83, 0.47], [0.75, 0.62], [0.66, 0.8], [0.62, 1]]);
      withWash(ctx, ink.mid, a(0.25), 30 * k, (c) => {
        c.rect(0, top + ph * 0.35, w, ph * 0.55);
      }, 'source-over');
      withWash(ctx, ink.deep, a(0.45), 16 * k, (c) => polygon(c, left, top + ph * 0.9));
      withWash(ctx, ink.deep, a(0.55), 20 * k, (c) => polygon(c, right, top + ph * 0.9));
      withWash(ctx, ink.pale, a(0.3), 18 * k, (c) => {
        c.moveTo(w * 0.35, top + ph * 0.66);
        c.bezierCurveTo(w * 0.42, top + ph * 0.6, w * 0.55, top + ph * 0.68, w * 0.63, top + ph * 0.65);
        c.lineTo(w * 0.68, base + ph * 0.12);
        c.lineTo(w * 0.33, base + ph * 0.12);
        c.closePath();
      });
      withStroke(ctx, ink.mid, a(0.32), 2 * k, 2.8 * k, (c) => {
        c.moveTo(w * 0.37, top + ph * 0.68);
        c.bezierCurveTo(w * 0.46, top + ph * 0.76, w * 0.58, top + ph * 0.73, w * 0.65, top + ph * 0.84);
      });
      mistBand(ctx, top, w, top + ph * 0.57, ph * 0.13, paper);
      birds(ctx, w * 0.52, top + ph * 0.35, 4 * k, ink.deep, a(0.3), 2);
      break;
    }
    case 'ancient-town': {
      const townBase = base - ph * 0.02;
      const houses = [
        [0.2, 0.19, 0.17],
        [0.42, 0.16, 0.13]
      ];
      for (let i = 0; i < houses.length; i++) {
        const [fx, fw, fh] = houses[i];
        const width = fw * w;
        const height = fh * ph;
        const x = side < 0 ? w * fx : w * (1 - fx);
        // 白墙用极淡的纸灰，屋顶用较浓的墨，才能在白纸上立住。
        withWash(ctx, ink.pale, a(0.5), 1.4 * k, (c) => {
          c.rect(x - width / 2, townBase - height, width, height);
        });
        withWash(ctx, ink.deep, a(0.72), 1.2 * k, (c) => {
          c.moveTo(x - width * 0.7, townBase - height + 2 * k);
          c.quadraticCurveTo(x, townBase - height - 46 * k, x + width * 0.7, townBase - height + 2 * k);
          c.lineTo(x + width * 0.62, townBase - height + 17 * k);
          c.lineTo(x - width * 0.62, townBase - height + 17 * k);
          c.closePath();
        });
        withStroke(ctx, ink.deep, a(0.75), 2.2 * k, 0.4 * k, (c) => {
          c.moveTo(x - width * 0.62, townBase - height + 6 * k);
          c.quadraticCurveTo(x, townBase - height - 44 * k, x + width * 0.62, townBase - height + 6 * k);
        });
        withWash(ctx, ink.mid, a(0.62), 0.5 * k, (c) => {
          c.rect(x - width * 0.3, townBase - height * 0.6, width * 0.19, height * 0.38);
          c.rect(x + width * 0.08, townBase - height * 0.6, width * 0.19, height * 0.38);
        });
        withStroke(ctx, ink.deep, a(0.45), 1.3 * k, 0.2 * k, (c) => {
          c.moveTo(x - width * 0.3, townBase - height * 0.6);
          c.lineTo(x - width * 0.3, townBase - height * 0.22);
          c.moveTo(x + width * 0.08, townBase - height * 0.6);
          c.lineTo(x + width * 0.08, townBase - height * 0.22);
        });
      }
      // 一座小桥和两条水线，压住画面下缘。
      withStroke(ctx, ink.deep, a(0.58), 5 * k, 0.9 * k, (c) => {
        c.moveTo(w * 0.46, townBase);
        c.quadraticCurveTo(w * 0.57, townBase - 96 * k, w * 0.68, townBase);
      });
      withStroke(ctx, ink.mid, a(0.3), 1.4 * k, 2.4 * k, (c) => {
        c.moveTo(w * 0.08, townBase + 26 * k);
        c.quadraticCurveTo(w * 0.36, townBase + 18 * k, w * 0.72, townBase + 24 * k);
        c.quadraticCurveTo(w * 0.88, townBase + 27 * k, w * 0.95, townBase + 22 * k);
      });
      withWash(ctx, ink.accent, a(0.8), 1.8 * k, (c) => {
        circle(c, side < 0 ? w * 0.19 : w * 0.81, townBase - ph * 0.27, 5 * k);
      });
      mistBand(ctx, top, w, top + ph * 0.55, ph * 0.2, paper);
      break;
    }
    case 'city': {
      const skyBase = base - ph * 0.04;
      const blocks = [
        [0.12, 0.34, 0.09],
        [0.24, 0.48, 0.08],
        [0.36, 0.42, 0.11],
        [0.51, 0.58, 0.08],
        [0.64, 0.47, 0.1]
      ];
      for (const [x, h, bw] of blocks) {
        const px = side < 0 ? w * x : w * (1 - x - bw);
        withWash(ctx, ink.mid, a(0.22), 2 * k, (c) => c.rect(px, skyBase - h * ph, bw * ph, h * ph), 'source-over');
        withStroke(ctx, ink.deep, a(0.36), 1.1 * k, 0.6 * k, (c) => {
          c.rect(px, skyBase - h * ph, bw * ph, h * ph);
        });
      }
      for (let i = 0; i < 8; i++) {
        const x = side < 0 ? w * (0.14 + i * 0.042) : w * (0.62 - i * 0.042);
        withWash(ctx, ink.accent, a(0.32), 1 * k, (c) => circle(c, x, skyBase - ph * 0.18 - (i % 3) * 9 * k, 1.8 * k), 'source-over');
      }
      withWash(ctx, ink.mid, a(0.12), 24 * k, (c) => c.rect(0, skyBase, w, ph * 0.2), 'source-over');
      for (let i = 0; i < 4; i++) {
        withStroke(ctx, ink.mid, a(0.14), 2 * k, 3 * k, (c) => {
          c.moveTo(w * (0.12 + i * 0.1), base);
          c.lineTo(w * (0.12 + i * 0.1), base - 20 * k);
        });
      }
      mistBand(ctx, top, w, top + ph * 0.42, ph * 0.14, paper);
      birds(ctx, opposite > 0 ? w * 0.75 : w * 0.22, top + ph * 0.28, 4 * k, ink.deep, a(0.3), 2);
      break;
    }
    case 'flowers': {
      withWash(ctx, ink.mid, a(0.2), 35 * k, (c) => {
        c.moveTo(0, base - ph * 0.12);
        c.quadraticCurveTo(w * 0.3, base - ph * 0.26, w * 0.58, base - ph * 0.14);
        c.quadraticCurveTo(w * 0.82, base - ph * 0.06, w, base - ph * 0.15);
        c.lineTo(w, base + ph * 0.05);
        c.lineTo(0, base + ph * 0.05);
        c.closePath();
      });
      for (let i = 0; i < 12; i++) {
        const x = side < 0 ? w * (0.12 + i * 0.028) : w * (0.55 + i * 0.028);
        const y = base - ph * (0.04 + (i % 4) * 0.026);
        withStroke(ctx, ink.mid, a(0.24), 1 * k, 0.6 * k, (c) => {
          c.moveTo(x, base + 8 * k);
          c.quadraticCurveTo(x - 3 * k, y + 16 * k, x, y);
        });
        withWash(ctx, i % 3 ? ink.pale : ink.accent, a(0.36), 1.2 * k, (c) => circle(c, x, y, (2.2 + (i % 2)) * k), 'source-over');
      }
      const treeX = side < 0 ? w * 0.82 : w * 0.18;
      withStroke(ctx, ink.deep, a(0.3), 2.3 * k, 0.7 * k, (c) => {
        c.moveTo(treeX, base);
        c.lineTo(treeX + 4 * k, top + ph * 0.47);
      });
      withWash(ctx, ink.pale, a(0.24), 20 * k, (c) => ellipse(c, treeX + 4 * k, top + ph * 0.43, 40 * k, 32 * k), 'source-over');
      birds(ctx, opposite > 0 ? w * 0.73 : w * 0.22, top + ph * 0.33, 4 * k, ink.deep, a(0.28), 2);
      break;
    }
    case 'mountain-green':
    default: {
      const defs = [
        [0, 0.64],
        [0.08, 0.49],
        [0.18, 0.55],
        [0.3, 0.3],
        [0.41, 0.52],
        [0.52, 0.4],
        [0.64, 0.56],
        [0.8, 0.62],
        [1, 0.76]
      ];
      const peaks = normalized(side < 0 ? defs : mirrorPoints(defs));
      withWash(ctx, ink.pale, a(0.3), 32 * k, (c) => ridge(c, peaks.map((point) => ({ x: point.x, y: point.y + 22 * k })), base));
      withWash(ctx, ink.mid, a(0.35), 18 * k, (c) => ridge(c, peaks.map((point) => ({ x: point.x, y: point.y + 8 * k })), base));
      // 前景山脊用实墨，不依赖模糊和叠色，保证在白纸上立得住。
      ctx.save();
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = ink.deep;
      ctx.beginPath();
      ridge(ctx, peaks, base);
      ctx.fill();
      ctx.restore();
      withStroke(ctx, ink.deep, a(0.5), 1.6 * k, 0.8 * k, (c) => {
        c.moveTo(peaks[0].x, peaks[0].y);
        for (const point of peaks) c.lineTo(point.x, point.y);
      });
      mistBand(ctx, top, w, top + ph * 0.58, ph * 0.24, paper);
      const pineX = side < 0 ? w * 0.14 : w * 0.84;
      pine(ctx, pineX, base - ph * 0.03, ph * 0.24, ink, a(0.65), k);
      pine(ctx, pineX + 22 * k * -side, base - ph * 0.02, ph * 0.16, ink, a(0.45), k);
      birds(ctx, opposite > 0 ? w * 0.72 : w * 0.27, top + ph * 0.32, 5 * k, ink.deep, a(0.36));
      break;
    }
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* paper, photo and type                                              */
/* ------------------------------------------------------------------ */

function drawCover(ctx, image, x, y, width, height) {
  const iw = image.naturalWidth || image.width || width;
  const ih = image.naturalHeight || image.height || height;
  const scale = Math.max(width / iw, height / ih);
  const sw = width / scale;
  const sh = height / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * 从照片本身提炼一块“淡墨底”。
 * 这是让下版与上版保持同一场景的关键：先压暗、降饱和、分成少数墨阶，
 * 再用纸色和留白遮掉大半细节，最后才叠加手绘符号。
 */
function drawPhotoInk(ctx, image, { w, top, panelH, palette, side, intensity }) {
  const sampleW = 360;
  const sampleH = Math.max(1, Math.round((sampleW * panelH) / w));
  const small = document.createElement('canvas');
  small.width = sampleW;
  small.height = sampleH;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  drawCover(sctx, image, 0, 0, sampleW, sampleH);
  const pixels = sctx.getImageData(0, 0, sampleW, sampleH);
  const output = sctx.createImageData(sampleW, sampleH);
  const luminance = new Float32Array(sampleW * sampleH);
  for (let i = 0, p = 0; i < pixels.data.length; i += 4, p++) {
    luminance[p] = (0.2126 * pixels.data[i] + 0.7152 * pixels.data[i + 1] + 0.0722 * pixels.data[i + 2]) / 255;
  }
  for (let y = 0; y < sampleH; y++) {
    const yf = y / Math.max(1, sampleH - 1);
    for (let x = 0; x < sampleW; x++) {
      const p = y * sampleW + x;
      const i = p * 4;
      const lum = luminance[p];
      const xf = x / Math.max(1, sampleW - 1);
      const sideMask = side < 0 ? 1 - smoothstep(0.48, 0.92, xf) : smoothstep(0.08, 0.52, xf);
      const bottomMask = 1 - smoothstep(0.76, 0.96, yf);
      const right = x + 1 < sampleW ? luminance[p + 1] : lum;
      const down = y + 1 < sampleH ? luminance[p + sampleW] : lum;
      const edge = Math.abs(lum - right) + Math.abs(lum - down);
      const jitter = ((x * 7 + y * 13) % 5 - 2) / 100;
      const adjusted = lum + jitter;

      let tone = null;
      let alpha = 0;
      if (adjusted < 0.22) {
        tone = palette.deep;
        alpha = 0.74;
      } else if (adjusted < 0.36) {
        tone = mix(palette.deep, palette.mid, 0.48);
        alpha = 0.56;
      } else if (adjusted < 0.51) {
        tone = palette.mid;
        alpha = 0.38;
      } else if (adjusted < 0.66) {
        tone = mix(palette.mid, palette.pale, 0.65);
        alpha = 0.22;
      }
      // 只有明显的光影边界才留下墨线；这是“画”而不是“滤镜”的关键。
      if (edge > 0.11) {
        tone = palette.deep;
        alpha = Math.max(alpha, 0.66);
      }
      if (!tone) {
        output.data[i + 3] = 0;
        continue;
      }
      alpha *= intensity;
      alpha *= 0.2 + 0.8 * sideMask;
      alpha *= bottomMask;
      if (alpha < 0.018) {
        output.data[i + 3] = 0;
        continue;
      }
      const rgb = parseHex(tone);
      output.data[i] = rgb.r;
      output.data[i + 1] = rgb.g;
      output.data[i + 2] = rgb.b;
      output.data[i + 3] = Math.round(clamp(alpha, 0, 0.78) * 255);
    }
  }
  sctx.putImageData(output, 0, 0);
  // 轻模糊让墨阶交界变成洇开的水痕，而不是照片边。
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, w, panelH);
  ctx.clip();
  ctx.globalAlpha = 1;
  if ('filter' in ctx) ctx.filter = 'blur(1.2px)';
  ctx.drawImage(small, 0, 0, sampleW, sampleH, 0, top, w, panelH);
  ctx.restore();
}

function addPaperGrain(ctx, width, height, top) {
  const tile = document.createElement('canvas');
  tile.width = 180;
  tile.height = 180;
  const tctx = tile.getContext('2d');
  const image = tctx.createImageData(180, 180);
  let seed = 17;
  for (let i = 0; i < image.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = 125 + ((seed >>> 24) - 128) * 0.45;
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 24;
  }
  tctx.putImageData(image, 0, 0);
  const pattern = ctx.createPattern(tile, 'repeat');
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = pattern;
  ctx.fillRect(0, top, width, height - top);
  ctx.restore();
}

function fadeToPaper(ctx, width, height) {
  const start = height * POSTCARD_STYLE.fadeStart;
  const end = height * POSTCARD_STYLE.fadeEnd;
  const gradient = ctx.createLinearGradient(0, start, 0, end);
  gradient.addColorStop(0, 'rgba(243,237,225,0)');
  gradient.addColorStop(0.55, 'rgba(243,237,225,0.62)');
  gradient.addColorStop(1, 'rgba(243,237,225,1)');
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, start, width, end - start);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, end, width, height - end);
  ctx.restore();
}

function titleFontSize(text, fontFamily, initial, maxWidth, ctx) {
  let size = initial;
  const floor = Math.round(initial * 0.8);
  while (size > floor) {
    ctx.font = `italic ${size}px ${fontFamily}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function captionFontSize(text, fontFamily, initial, maxWidth, trackingRatio, ctx) {
  let size = initial;
  const floor = Math.round(initial * 0.8);
  const measure = (candidate) => {
    ctx.font = `300 ${candidate}px ${fontFamily}`;
    const tracking = candidate * trackingRatio;
    return [...text].reduce((total, char) => total + ctx.measureText(char).width, 0) + tracking * Math.max(0, [...text].length - 1);
  };
  while (size > floor && measure(size) > maxWidth) size -= 2;
  return size;
}

function drawTracked(ctx, text, centerX, centerY, font, tracking, color) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const chars = [...text];
  const widths = chars.map((char) => ctx.measureText(char).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + tracking * Math.max(0, chars.length - 1);
  let x = centerX - total / 2;
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], x, centerY);
    x += widths[i] + tracking;
  }
  ctx.restore();
}

function drawLettering(ctx, width, height, title, caption) {
  const titleFamily = '"Palatino Linotype", "Book Antiqua", Georgia, "Times New Roman", serif';
  const captionFamily = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
  const titleSize = titleFontSize(title, titleFamily, Math.round(height * 0.04), width * 0.84, ctx);
  const captionSize = captionFontSize(caption, captionFamily, Math.round(height * 0.0185), width * 0.84, 0.02, ctx);
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.fillStyle = TITLE;
  ctx.font = `italic ${titleSize}px ${titleFamily}`;
  ctx.textAlign = 'center';
  ctx.fillText(title, width / 2, height * 0.902);
  ctx.restore();
  drawTracked(
    ctx,
    caption,
    width / 2,
    height * 0.948,
    `300 ${captionSize}px ${captionFamily}`,
    captionSize * 0.02,
    CAPTION
  );
  return { titleSize, captionSize };
}

/**
 * @param {object} options
 * @param {HTMLImageElement} [options.image]
 * @param {string} [options.src]
 * @param {object} options.scene
 * @param {object} options.analysis
 * @param {string} [options.title]
 * @param {string} [options.caption]
 * @param {number} [options.ink] 0.6–1.5
 * @param {number} [options.variant] 0/1 composition variation
 * @param {number} [options.width]
 * @param {number} [options.height]
 */
export async function renderPostcard({
  image,
  src,
  scene,
  analysis,
  title,
  caption,
  ink = 1,
  variant = 0,
  width = POSTCARD_SIZES.preview.width,
  height = POSTCARD_SIZES.preview.height
}) {
  const img = image || (await loadImage(src));
  const w = Math.round(width);
  const h = Math.round(height || width * 1.5);
  const topH = Math.round(h * POSTCARD_STYLE.seam);
  const fallback = buildPostcardCopy(scene?.id, 0);
  const safeTitle = normalizePostcardText(title || fallback.title, 52) || fallback.title;
  const safeCaption = normalizePostcardText(caption || fallback.caption, 96) || fallback.caption;
  const palette = derivePostcardPalette(analysis, scene);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);

  // 上版：真实照片，低对比、柔光、保留颜色关系
  ctx.save();
  if ('filter' in ctx) ctx.filter = 'saturate(0.86) contrast(0.9) brightness(1.05)';
  drawCover(ctx, img, 0, 0, w, topH);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = 'rgba(243,237,225,0.035)';
  ctx.fillRect(0, 0, w, topH);
  ctx.restore();

  // 下版：本地绘制的水墨插画。
  // 主体偏向一侧，另一侧留白；底部 20% 只留纸面与题字。
  const panelH = h - topH;
  const artScaleY = 0.896;
  const artShift = -0.119 * panelH;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, topH, w, panelH);
  ctx.clip();
  ctx.translate(0, topH + artShift);
  ctx.scale(1, artScaleY);
  drawScene(ctx, scene?.id || 'mountain-green', {
    w,
    top: 0,
    ph: panelH,
    ink: palette,
    variant,
    intensity: clamp(Number(ink) || 1, 0.6, 1.5)
  });
  ctx.restore();
  fadeToPaper(ctx, w, h);
  addPaperGrain(ctx, w, h, topH);
  const type = drawLettering(ctx, w, h, safeTitle, safeCaption);

  return { canvas, title: safeTitle, caption: safeCaption, ...type, palette };
}

export function canvasToPostcardBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('明信片导出失败'))), 'image/png');
  });
}
