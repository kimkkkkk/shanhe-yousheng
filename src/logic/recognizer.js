import { SCENES, sceneById } from '../data/scenes.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function rgbToHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function bytesToHex(r, g, b) {
  return `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;
}

function hueName(h, s, v) {
  if (v < 0.18) return '墨色';
  if (s < 0.1) return v > 0.8 ? '雪白' : '烟灰';
  if (h < 18 || h >= 345) return '朱砂';
  if (h < 42) return '琥珀';
  if (h < 68) return '麦金';
  if (h < 100) return '嫩绿';
  if (h < 160) return '苍翠';
  if (h < 200) return '青碧';
  if (h < 245) return '湖蓝';
  if (h < 290) return '暮紫';
  return '绛红';
}

/**
 * 纯函数：只依赖像素数据，可在浏览器与 Node 测试中运行。
 * @param {{data: Uint8ClampedArray|number[], width:number, height:number}} imageData
 * @param {{filename?:string}} options
 */
export function analyzeImageData(imageData, options = {}) {
  const { data, width, height } = imageData;
  if (!width || !height || !data || data.length < width * height * 4) {
    throw new Error('无效的图像数据');
  }

  // 最多采样约 2 万像素，保证中低端手机也能快速完成
  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / 20000)));
  let count = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumBright = 0;
  let sumBright2 = 0;
  let sumSat = 0;
  let green = 0;
  let water = 0;
  let sky = 0;
  let warm = 0;
  let sand = 0;
  let white = 0;
  let dark = 0;
  let gray = 0;
  let colorful = 0;
  let topWarm = 0;
  let topBlue = 0;
  let topCount = 0;
  let bottomBlue = 0;
  let bottomGreen = 0;
  let bottomCount = 0;
  const hueBuckets = new Array(12).fill(0);
  const satBuckets = new Array(8).fill(0);
  const grays = [];

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 24) continue;
      const { h, s, v } = rgbToHsv(r, g, b);
      const bright = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      count++;
      sumR += r;
      sumG += g;
      sumB += b;
      sumBright += bright;
      sumBright2 += bright * bright;
      sumSat += s;
      grays.push(bright);
      hueBuckets[Math.min(11, Math.floor(h / 30))]++;
      satBuckets[Math.min(7, Math.floor(s * 8))]++;

      if (h >= 55 && h <= 175 && s > 0.12 && v > 0.07) green++;
      if (y > height * 0.32 && h >= 170 && h <= 255 && s > 0.08 && v > 0.12) water++;
      if (y < height * 0.45 && ((h >= 175 && h <= 260 && s > 0.07 && v > 0.42) || (v > 0.82 && s < 0.12))) sky++;
      if ((h < 48 || h >= 330) && s > 0.14 && v > 0.22) warm++;
      if (h >= 22 && h <= 55 && s > 0.12 && v > 0.4) sand++;
      if (v > 0.78 && s < 0.16) white++;
      if (v < 0.22) dark++;
      if (s < 0.09 && v > 0.12) gray++;
      if (s > 0.28 && v > 0.22) colorful++;
      if (y < height * 0.28) {
        topCount++;
        if ((h < 50 || h > 330) && s > 0.14) topWarm++;
        if (h >= 170 && h <= 260 && s > 0.07 && v > 0.35) topBlue++;
      }
      if (y > height * 0.55) {
        bottomCount++;
        if (h >= 170 && h <= 260 && s > 0.08 && v > 0.1) bottomBlue++;
        if (h >= 55 && h <= 175 && s > 0.12) bottomGreen++;
      }
    }
  }

  if (!count) throw new Error('图片透明或无法读取');

  const avgBright = sumBright / count;
  const variance = Math.max(0, sumBright2 / count - avgBright * avgBright);
  const contrast = clamp01(Math.sqrt(variance) / 0.32);
  const saturation = sumSat / count;
  const greenRatio = green / count;
  const waterRatio = water / count;
  const skyRatio = sky / count;
  const warmRatio = warm / count;
  const sandRatio = sand / count;
  const whiteRatio = white / count;
  const darkRatio = dark / count;
  const grayRatio = gray / count;
  const colorfulRatio = colorful / count;
  const topWarmRatio = topCount ? topWarm / topCount : 0;
  const topBlueRatio = topCount ? topBlue / topCount : 0;
  const bottomBlueRatio = bottomCount ? bottomBlue / bottomCount : 0;
  const bottomGreenRatio = bottomCount ? bottomGreen / bottomCount : 0;

  // 简单边缘密度：相邻像素亮度差超过阈值的比例，再放大到易读的 0—1
  let edgeHits = 0;
  let edgeTotal = 0;
  const stepX = Math.max(1, Math.floor(width / 180));
  const stepY = Math.max(1, Math.floor(height / 180));
  for (let y = 0; y < height - stepY; y += stepY) {
    for (let x = 0; x < width - stepX; x += stepX) {
      const i = (y * width + x) * 4;
      const j = (y * width + x + stepX) * 4;
      const k = ((y + stepY) * width + x) * 4;
      const l1 = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const l2 = (data[j] + data[j + 1] + data[j + 2]) / 3;
      const l3 = (data[k] + data[k + 1] + data[k + 2]) / 3;
      if (Math.abs(l1 - l2) + Math.abs(l1 - l3) > 34) edgeHits++;
      edgeTotal++;
    }
  }
  const edgeDensity = edgeTotal ? clamp01((edgeHits / edgeTotal) * 3.4) : 0;
  const texture = clamp01(edgeDensity * 0.72 + contrast * 0.45);

  const metrics = {
    brightness: Number(avgBright.toFixed(3)),
    contrast: Number(contrast.toFixed(3)),
    saturation: Number(saturation.toFixed(3)),
    greenRatio: Number(greenRatio.toFixed(3)),
    waterRatio: Number(waterRatio.toFixed(3)),
    skyRatio: Number(skyRatio.toFixed(3)),
    warmRatio: Number(warmRatio.toFixed(3)),
    sandRatio: Number(sandRatio.toFixed(3)),
    whiteRatio: Number(whiteRatio.toFixed(3)),
    darkRatio: Number(darkRatio.toFixed(3)),
    grayRatio: Number(grayRatio.toFixed(3)),
    colorfulRatio: Number(colorfulRatio.toFixed(3)),
    edgeDensity: Number(edgeDensity.toFixed(3)),
    texture: Number(texture.toFixed(3)),
    topWarmRatio: Number(topWarmRatio.toFixed(3)),
    topBlueRatio: Number(topBlueRatio.toFixed(3)),
    bottomBlueRatio: Number(bottomBlueRatio.toFixed(3)),
    bottomGreenRatio: Number(bottomGreenRatio.toFixed(3)),
    width,
    height,
    aspect: Number((width / height).toFixed(3))
  };

  const scores = classify(metrics);
  const maybeFilename = filenameHint(options.filename);
  if (maybeFilename) {
    // 画面几乎没有可用信息时（雾天、纯色、低饱和），用文件名做决定性提示；
    // 正常照片中文件名只作为轻微加权，不压过像素证据。
    const lowInformation = metrics.saturation < 0.08 && metrics.texture < 0.12;
    scores[maybeFilename.scene] = (scores[maybeFilename.scene] || 0) + (lowInformation ? 10 : 0.22);
    if (lowInformation) {
      for (const key of Object.keys(scores)) {
        if (key !== maybeFilename.scene) scores[key] = 0;
      }
    }
  }

  const ranked = Object.entries(scores)
    .map(([sceneId, score]) => ({ sceneId, score }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const second = ranked[1] || { score: 0 };
  const gap = top.score - second.score;
  const confidence = Math.min(0.97, Math.max(0.52, 0.62 + gap * 0.12 + top.score * 0.018));

  // 主色：按显著色相桶取平均，再与场景色板混合作 UI 强调色
  let bestBucket = 0;
  for (let i = 1; i < hueBuckets.length; i++) {
    if (hueBuckets[i] > hueBuckets[bestBucket]) bestBucket = i;
  }
  const dominantHue = hueBuckets[bestBucket] ? bestBucket * 30 + 15 : 150;
  const palette = buildPalette(dominantHue, avgBright, saturation);

  return {
    scene: sceneById(top.sceneId),
    sceneId: top.sceneId,
    confidence: Number(confidence.toFixed(2)),
    candidates: ranked.slice(0, 4).map((entry, index) => ({
      scene: sceneById(entry.sceneId),
      sceneId: entry.sceneId,
      score: Number(entry.score.toFixed(3)),
      confidence: Number(Math.max(0.08, (entry.score / (top.score || 1)) * confidence - index * 0.01).toFixed(2))
    })),
    metrics,
    palette,
    dominantTone: hueName(dominantHue, saturation, avgBright),
    filenameHint: maybeFilename ? sceneById(maybeFilename.scene).name : null,
    summary: summarise(metrics)
  };
}

function classify(m) {
  const {
    greenRatio,
    waterRatio,
    skyRatio,
    warmRatio,
    sandRatio,
    whiteRatio,
    darkRatio,
    grayRatio,
    colorfulRatio,
    texture,
    brightness,
    saturation,
    topWarmRatio,
    topBlueRatio,
    bottomBlueRatio,
    bottomGreenRatio
  } = m;

  return {
    'mountain-green':
      0.2 + greenRatio * 1.75 + texture * 0.8 + skyRatio * 0.32 + whiteRatio * 0.1 - waterRatio * 0.35,
    'lake-mirror':
      0.15 + waterRatio * 2.75 + bottomBlueRatio * 1.0 + skyRatio * 0.4 + (1 - texture) * 0.16 - greenRatio * 0.18,
    coast:
      0.12 + waterRatio * 2.1 + bottomBlueRatio * 1.25 + skyRatio * 0.7 + brightness * 0.18 - greenRatio * 0.28,
    sunset:
      0.1 + topWarmRatio * 1.9 + warmRatio * 1.05 + (1 - brightness) * 0.25 + saturation * 0.2 - greenRatio * 0.25,
    forest:
      0.1 + greenRatio * 2.05 + bottomGreenRatio * 0.5 + (1 - skyRatio) * 0.18 + texture * 0.2 - waterRatio * 0.45,
    grassland:
      0.08 + greenRatio * 1.05 + (1 - texture) * 0.6 + skyRatio * 0.42 + brightness * 0.18 - waterRatio * 0.85,
    snow:
      0.06 +
      whiteRatio * 1.74 +
      topBlueRatio * 0.35 +
      (1 - saturation) * 0.18 +
      brightness * 0.18 -
      warmRatio * 0.3 -
      greenRatio * 1.25 -
      grayRatio * 0.65,
    desert:
      0.07 + sandRatio * 1.7 + warmRatio * 0.6 + (1 - greenRatio) * 0.62 + brightness * 0.16 - waterRatio * 0.4,
    terraces:
      0.08 + greenRatio * 0.95 + texture * 0.62 + waterRatio * 0.35 + (1 - skyRatio) * 0.34 + bottomGreenRatio * 0.35,
    canyon:
      0.09 + texture * 1.15 + greenRatio * 0.62 + waterRatio * 0.48 + (1 - brightness) * 0.25 + darkRatio * 0.2,
    'ancient-town':
      0.08 +
      warmRatio * 0.72 +
      grayRatio * 0.8 +
      texture * 0.6 +
      (1 - greenRatio) * 0.35 +
      (1 - waterRatio) * 0.2 +
      whiteRatio * grayRatio * 0.9,
    city:
      0.06 + grayRatio * 1.05 + texture * 0.78 + topBlueRatio * 0.2 + darkRatio * 0.25 + (1 - greenRatio) * 0.3,
    flowers:
      0.03 + colorfulRatio * 1.15 + warmRatio * 0.52 + greenRatio * 0.55 + brightness * 0.15 - waterRatio * 0.2
  };
}

function filenameHint(filename = '') {
  const name = String(filename);
  if (!name) return null;
  const rules = [
    [/海|沙滩|beach|sea|ocean|coast|island|岛/i, 'coast'],
    [/雪|snow|冰川|glacier|高原|plateau/i, 'snow'],
    [/湖|lake|池|pond|river|江|water/i, 'lake-mirror'],
    [/山|峰|mountain|hill|黄山|华山|泰山|峡谷/i, 'mountain-green'],
    [/森林|forest|wood|林|tree/i, 'forest'],
    [/草原|grass|prairie|meadow/i, 'grassland'],
    [/沙漠|desert|沙丘|dune|丹霞|戈壁/i, 'desert'],
    [/日落|晚霞|sunset|dusk|黄昏|golden/i, 'sunset'],
    [/古镇|古村|town|village|street|街|建筑|temple/i, 'ancient-town'],
    [/城市|city|skyline|楼|urban/i, 'city'],
    [/花|flower|bloom|樱|rose/i, 'flowers'],
    [/梯田|terrace|field|田/i, 'terraces'],
    [/瀑布|溪|waterfall|canyon|峡/i, 'canyon']
  ];
  for (const [re, scene] of rules) {
    if (re.test(name)) return { scene };
  }
  return null;
}

function buildPalette(hue, brightness, saturation) {
  const tones = [
    { h: hue, s: Math.min(0.7, saturation + 0.22), l: 0.28 },
    { h: (hue + 22) % 360, s: Math.min(0.58, saturation + 0.1), l: 0.48 },
    { h: (hue + 42) % 360, s: 0.28, l: Math.min(0.82, Math.max(0.62, brightness + 0.2)) }
  ];
  return tones.map(({ h, s, l }) => hslToHex(h, s, l));
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return bytesToHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255);
}

function summarise(m) {
  const bits = [];
  if (m.skyRatio > 0.16) bits.push('天空留白');
  if (m.greenRatio > 0.24) bits.push('植被丰茂');
  if (m.waterRatio > 0.2) bits.push('水光潋滟');
  if (m.warmRatio > 0.2) bits.push('暖调光线');
  if (m.whiteRatio > 0.18) bits.push('明亮高光');
  if (m.texture > 0.5) bits.push('层次丰富');
  if (!bits.length) bits.push('光影细腻');
  return bits.slice(0, 3).join(' · ');
}

/** 从 File 读取为可分析的 imageData（浏览器） */
export async function analyzeFile(file) {
  const bitmap = await loadBitmap(file);
  const max = 900;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  return analyzeImageData(imageData, { filename: file.name });
}

export async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* 老浏览器回退 */
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片读取失败'));
    };
    img.src = url;
  });
}

export const ALL_SCENES = SCENES;
