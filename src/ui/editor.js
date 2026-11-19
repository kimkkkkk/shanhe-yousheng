import { loadImage, canvasToBlob, shareOrDownload, downloadBlob } from '../logic/image.js';

const FILTERS = [
  {
    id: 'original',
    name: '原片',
    values: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, sepia: 0, gray: 0, grain: 0 }
  },
  {
    id: 'clear',
    name: '清透',
    values: { brightness: 5, contrast: 6, saturation: 8, warmth: 2, sepia: 0, gray: 0, grain: 0 }
  },
  {
    id: 'warm',
    name: '暖阳',
    values: { brightness: 6, contrast: 3, saturation: 10, warmth: 14, sepia: 8, gray: 0, grain: 0 }
  },
  {
    id: 'jade',
    name: '青黛',
    values: { brightness: -2, contrast: 9, saturation: -8, warmth: -5, sepia: 0, gray: 0, grain: 0 }
  },
  {
    id: 'film',
    name: '胶片',
    values: { brightness: -4, contrast: 12, saturation: -12, warmth: 7, sepia: 15, gray: 0, grain: 0.12 }
  },
  {
    id: 'mono',
    name: '黑白',
    values: { brightness: 1, contrast: 16, saturation: -100, warmth: 0, sepia: 0, gray: 100, grain: 0.06 }
  }
];

const RATIOS = [
  { id: 'original', name: '原图', value: null },
  { id: '1:1', name: '1:1', value: 1 },
  { id: '4:3', name: '4:3', value: 4 / 3 },
  { id: '3:4', name: '3:4', value: 3 / 4 },
  { id: '16:9', name: '16:9', value: 16 / 9 }
];

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class PhotoEditor {
  constructor({ src, placeName = '此处的山河', watermark = true, onSave, onClose, toast = () => {} }) {
    this.src = src;
    this.placeName = placeName;
    this.onSave = onSave;
    this.onClose = onClose;
    this.toast = toast;
    this.filterId = 'original';
    this.adjust = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, vignette: 0 };
    this.ratioId = 'original';
    this.rotation = 0;
    this.watermark = Boolean(watermark);
    this.watermarkText = `山河有声 · ${placeName}`;
    this.activeTab = 'filter';
    this.baseCache = new Map();
    this.saving = false;
    this.raf = 0;
    this.root = null;
    this.noise = null;
    this._onKey = this._onKey.bind(this);
  }

  async open() {
    document.body.classList.add('is-locked');
    this.root = document.createElement('div');
    this.root.className = 'editor';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', '修图编辑器');
    this.root.innerHTML = `
      <header class="editor-header">
        <div class="editor-header-left">
          <button class="editor-btn" type="button" data-editor-action="close" aria-label="关闭编辑器">
            <svg class="icon"><use href="#i-close"></use></svg>
          </button>
          <span class="editor-title"><strong>修一张山河</strong><span>PHOTO STUDIO</span></span>
        </div>
        <div class="editor-header-right">
          <button class="editor-btn" type="button" data-editor-action="reset" aria-label="重置所有调整">
            <svg class="icon"><use href="#i-refresh"></use></svg><span class="editor-btn-label">重置</span>
          </button>
          <button class="editor-btn" type="button" data-editor-action="share" aria-label="分享修好的照片">
            <svg class="icon"><use href="#i-share"></use></svg>
          </button>
          <button class="editor-btn primary" type="button" data-editor-action="save">
            <svg class="icon"><use href="#i-save"></use></svg><span class="editor-btn-label">保存</span>
          </button>
        </div>
      </header>
      <div class="editor-stage">
        <div class="editor-canvas-wrap"><canvas id="editor-canvas" aria-label="修图预览"></canvas></div>
        <span class="editor-zoom-note">实时预览 · 导出时保留更高分辨率</span>
      </div>
      <section class="editor-panel" aria-label="修图工具">
        <nav class="editor-tabs" aria-label="工具分类">
          <button class="editor-tab is-active" type="button" data-editor-tab="filter">
            <svg class="icon"><use href="#i-filter"></use></svg>滤镜
          </button>
          <button class="editor-tab" type="button" data-editor-tab="adjust">
            <svg class="icon"><use href="#i-sliders"></use></svg>调整
          </button>
          <button class="editor-tab" type="button" data-editor-tab="crop">
            <svg class="icon"><use href="#i-crop"></use></svg>裁剪
          </button>
          <button class="editor-tab" type="button" data-editor-tab="text">
            <svg class="icon"><use href="#i-text"></use></svg>题字
          </button>
        </nav>
        <div class="editor-controls" id="editor-controls"></div>
      </section>
    `;
    document.body.appendChild(this.root);
    this.canvas = this.root.querySelector('#editor-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.controls = this.root.querySelector('#editor-controls');
    this.img = await loadImage(this.src);
    this.root.addEventListener('click', (event) => this._onClick(event));
    this.root.addEventListener('input', (event) => this._onInput(event));
    document.addEventListener('keydown', this._onKey);
    this._renderControls();
    this._scheduleRender();
  }

  _onKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  _onClick(event) {
    const tab = event.target.closest('[data-editor-tab]');
    if (tab) {
      this.activeTab = tab.dataset.editorTab;
      this.root.querySelectorAll('[data-editor-tab]').forEach((el) => {
        el.classList.toggle('is-active', el === tab);
      });
      this._renderControls();
      return;
    }
    const action = event.target.closest('[data-editor-action]');
    if (action) {
      const kind = action.dataset.editorAction;
      if (kind === 'close') this.close();
      if (kind === 'reset') this._reset();
      if (kind === 'save') this._save();
      if (kind === 'share') this._share();
      return;
    }
    const toggle = event.target.closest('[data-editor-toggle]');
    if (toggle) {
      if (toggle.dataset.editorToggle === 'watermark') {
        this.watermark = !this.watermark;
        this._renderControls();
        this._scheduleRender();
      }
      return;
    }
    const filter = event.target.closest('[data-filter]');
    if (filter) {
      this.filterId = filter.dataset.filter;
      this._renderControls();
      this._scheduleRender();
      return;
    }
    const ratio = event.target.closest('[data-ratio]');
    if (ratio) {
      this.ratioId = ratio.dataset.ratio;
      this._renderControls();
      this._scheduleRender();
      return;
    }
    const rotate = event.target.closest('[data-rotate]');
    if (rotate) {
      this.rotation = (this.rotation + Number(rotate.dataset.rotate) + 360) % 360;
      this._scheduleRender();
      return;
    }
  }

  _onInput(event) {
    const range = event.target.closest('[data-adjust]');
    if (range) {
      this.adjust[range.dataset.adjust] = Number(range.value);
      const output = this.root.querySelector(`[data-output="${range.dataset.adjust}"]`);
      if (output) output.textContent = this._formatAdjust(range.dataset.adjust, Number(range.value));
      this._scheduleRender();
      return;
    }
    if (event.target.id === 'editor-watermark-text') {
      this.watermarkText = event.target.value;
      this._scheduleRender();
    }
  }

  _formatAdjust(key, value) {
    if (key === 'vignette') return `${value}`;
    return `${value > 0 ? '+' : ''}${value}`;
  }

  _reset() {
    this.filterId = 'original';
    this.adjust = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, vignette: 0 };
    this.ratioId = 'original';
    this.rotation = 0;
    this.watermark = true;
    this.watermarkText = `山河有声 · ${this.placeName}`;
    this._renderControls();
    this._scheduleRender();
    this.toast('已恢复原片');
  }

  _renderControls() {
    if (!this.controls) return;
    if (this.activeTab === 'filter') {
      this.controls.innerHTML = `
        <div class="filter-row">
          ${FILTERS.map(
            (f) => `
            <button class="filter-choice ${f.id === this.filterId ? 'is-active' : ''}" type="button" data-filter="${f.id}">
              <span class="filter-thumb"><img src="${this.src}" alt="" style="filter:${this._filterCss(f.values)}"></span>
              <span class="filter-name">${f.name}</span>
            </button>`
          ).join('')}
        </div>
        <div class="text-option-row" style="margin-top:8px;color:rgba(238,242,232,.4);font-size:8.5px">
          <span>滤镜会叠加在「调整」参数之上</span>
        </div>
      `;
    } else if (this.activeTab === 'adjust') {
      const items = [
        ['brightness', '亮度'],
        ['contrast', '对比度'],
        ['saturation', '饱和度'],
        ['warmth', '暖色'],
        ['vignette', '暗角']
      ];
      this.controls.innerHTML = `
        <div class="adjust-grid">
          ${items
            .map(([key, label]) => {
              const value = key === 'vignette' ? clamp(this.adjust[key], 0, 70) : clamp(this.adjust[key], -50, 50);
              return `
              <label class="adjust-item">
                <span class="adjust-top">${label}<output data-output="${key}">${this._formatAdjust(key, value)}</output></span>
                <input type="range" data-adjust="${key}" min="${key === 'vignette' ? 0 : -50}" max="${key === 'vignette' ? 70 : 50}" step="1" value="${value}" aria-label="${label}">
              </label>`;
            })
            .join('')}
        </div>
        <button class="editor-reset" type="button" data-editor-action="reset">
          <svg class="icon"><use href="#i-refresh"></use></svg>全部恢复原片
        </button>
      `;
    } else if (this.activeTab === 'crop') {
      this.controls.innerHTML = `
        <div class="crop-row">
          ${RATIOS.map(
            (r) => `<button class="crop-chip ${r.id === this.ratioId ? 'is-active' : ''}" type="button" data-ratio="${r.id}">${r.name}</button>`
          ).join('')}
        </div>
        <div class="rotate-row">
          <button class="crop-chip" type="button" data-rotate="-90"><svg class="icon" style="width:12px;height:12px;display:inline-block;vertical-align:-2px"><use href="#i-rotate"></use></svg> 向左转</button>
          <button class="crop-chip" type="button" data-rotate="90"><svg class="icon" style="width:12px;height:12px;display:inline-block;vertical-align:-2px"><use href="#i-rotate"></use></svg> 向右转</button>
        </div>
        <div class="text-option-row" style="margin-top:11px;color:rgba(238,242,232,.38);font-size:8.5px">
          裁剪以画面中心为基准；旋转与裁剪会实时应用。
        </div>
      `;
    } else {
      this.controls.innerHTML = `
        <div class="text-options">
          <div class="text-option-row">
            <span>添加题字</span>
            <button class="editor-switch ${this.watermark ? 'is-on' : ''}" type="button" role="switch" aria-checked="${this.watermark}" data-editor-toggle="watermark" aria-label="添加题字">
              <span></span>
            </button>
          </div>
          <div class="text-option-row">
            <span>题字内容</span>
            <input id="editor-watermark-text" type="text" maxlength="28" value="${esc(this.watermarkText)}" aria-label="题字内容">
          </div>
          <div class="text-option-row" style="color:rgba(238,242,232,.36);font-size:8.5px">
            题字会出现在图片左下角，导出时保留。
          </div>
        </div>
      `;
    }
  }

  _filterCss(values) {
    return `brightness(${100 + values.brightness}%) contrast(${100 + values.contrast}%) saturate(${100 + values.saturation}%) sepia(${values.sepia}%) grayscale(${values.gray}%)`;
  }

  _currentValues() {
    const base = FILTERS.find((f) => f.id === this.filterId)?.values || FILTERS[0].values;
    return {
      brightness: base.brightness + this.adjust.brightness,
      contrast: base.contrast + this.adjust.contrast,
      saturation: base.saturation + this.adjust.saturation,
      warmth: base.warmth + this.adjust.warmth,
      sepia: base.sepia,
      gray: base.gray,
      grain: base.grain
    };
  }

  _baseCanvas() {
    const key = `r${this.rotation}`;
    if (this.baseCache.has(key)) return this.baseCache.get(key);
    const img = this.img;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const max = 2400;
    const scale = Math.min(1, max / Math.max(w, h));
    const sw = Math.round(w * scale);
    const sh = Math.round(h * scale);
    const rotated = this.rotation % 180 !== 0;
    const canvas = document.createElement('canvas');
    canvas.width = rotated ? sh : sw;
    canvas.height = rotated ? sw : sh;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((this.rotation * Math.PI) / 180);
    ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
    this.baseCache.set(key, canvas);
    return canvas;
  }

  _crop(base, ratio) {
    const w = base.width;
    const h = base.height;
    if (!ratio) return { sx: 0, sy: 0, sw: w, sh: h };
    const current = w / h;
    if (current > ratio) {
      const sw = h * ratio;
      return { sx: (w - sw) / 2, sy: 0, sw, sh: h };
    }
    const sh = w / ratio;
    return { sx: 0, sy: (h - sh) / 2, sw: w, sh };
  }

  _draw(target, maxSize = null, preview = false) {
    const base = this._baseCanvas();
    const ratio = RATIOS.find((r) => r.id === this.ratioId)?.value || base.width / base.height;
    const crop = this._crop(base, ratio);
    let outW = crop.sw;
    let outH = crop.sh;
    if (maxSize && Math.max(outW, outH) > maxSize) {
      const s = maxSize / Math.max(outW, outH);
      outW *= s;
      outH *= s;
    }
    target.width = Math.max(1, Math.round(outW));
    target.height = Math.max(1, Math.round(outH));
    const ctx = target.getContext('2d');
    ctx.clearRect(0, 0, target.width, target.height);
    const values = this._currentValues();
    const filter = `brightness(${100 + values.brightness}%) contrast(${100 + values.contrast}%) saturate(${100 + values.saturation}%) sepia(${values.sepia}%) grayscale(${values.gray}%)`;
    ctx.save();
    if ('filter' in ctx) ctx.filter = filter;
    ctx.drawImage(base, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, target.width, target.height);
    ctx.restore();

    // 冷暖叠色
    const warmth = clamp(values.warmth, -50, 50);
    if (Math.abs(warmth) > 0.5) {
      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle =
        warmth > 0 ? `rgba(255, 139, 66, ${(warmth / 50) * 0.38})` : `rgba(72, 132, 210, ${(-warmth / 50) * 0.3})`;
      ctx.fillRect(0, 0, target.width, target.height);
      ctx.restore();
    }

    // 胶片颗粒
    if (values.grain > 0) {
      const noise = this._noisePattern(ctx, target.width, target.height);
      ctx.save();
      ctx.globalAlpha = values.grain;
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = noise;
      ctx.fillRect(0, 0, target.width, target.height);
      ctx.restore();
    }

    // 暗角
    const vignette = clamp(this.adjust.vignette, 0, 70);
    if (vignette > 0) {
      const radius = Math.max(target.width, target.height) * 0.72;
      const gradient = ctx.createRadialGradient(
        target.width / 2,
        target.height / 2,
        radius * 0.25,
        target.width / 2,
        target.height / 2,
        radius
      );
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(0.72, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, `rgba(0,0,0,${(vignette / 70) * 0.58})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, target.width, target.height);
    }

    if (this.watermark && this.watermarkText.trim()) {
      this._drawWatermark(ctx, target.width, target.height, preview);
    }
    return target;
  }

  _noisePattern(ctx, w, h) {
    if (!this.noise) {
      const tile = document.createElement('canvas');
      tile.width = 160;
      tile.height = 160;
      const tctx = tile.getContext('2d');
      const image = tctx.createImageData(160, 160);
      let seed = 11;
      for (let i = 0; i < image.data.length; i += 4) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const v = 128 + ((seed >>> 24) - 128) * 0.52;
        image.data[i] = v;
        image.data[i + 1] = v;
        image.data[i + 2] = v;
        image.data[i + 3] = 120;
      }
      tctx.putImageData(image, 0, 0);
      this.noise = tile;
    }
    return ctx.createPattern(this.noise, 'repeat');
  }

  _drawWatermark(ctx, w, h, preview) {
    const size = Math.max(12, Math.round(h * 0.030));
    const x = Math.round(w * 0.052);
    const y = Math.round(h * 0.925);
    ctx.save();
    ctx.font = `600 ${size}px "Songti SC", "Noto Serif CJK SC", serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255, 249, 233, 0.92)';
    ctx.shadowColor = 'rgba(11, 25, 17, 0.55)';
    ctx.shadowBlur = preview ? 5 : 10;
    ctx.shadowOffsetY = 1;
    ctx.fillText(this.watermarkText, x, y);
    const lineW = Math.max(26, size * 2.6);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(240, 214, 166, 0.7)';
    ctx.fillRect(x, y + Math.round(size * 0.55), lineW, Math.max(1, Math.round(size * 0.055)));
    ctx.restore();
  }

  _scheduleRender() {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => {
      this._draw(this.canvas, 1200, true);
    });
  }

  async _save() {
    if (this.saving) return;
    this.saving = true;
    const btn = this.root.querySelector('[data-editor-action="save"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '导出中…';
    }
    try {
      const output = document.createElement('canvas');
      this._draw(output, 2400, false);
      const blob = await canvasToBlob(output, 'image/jpeg', 0.92);
      const dataUrl = output.toDataURL('image/jpeg', 0.92);
      this.onSave?.({ dataUrl, blob, width: output.width, height: output.height });
      const filename = `山河有声-${this.placeName.replace(/[\\/:*?"<>|]/g, '')}-${Date.now()}.jpg`;
      downloadBlob(blob, filename);
      this.toast('已导出修好的照片');
      this.close();
    } catch (error) {
      console.error(error);
      this.toast('导出失败，请重试');
      this.saving = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<svg class="icon"><use href="#i-save"></use></svg><span class="editor-btn-label">保存</span>';
      }
    }
  }

  async _share() {
    try {
      const output = document.createElement('canvas');
      this._draw(output, 2400, false);
      const blob = await canvasToBlob(output, 'image/jpeg', 0.92);
      const filename = `山河有声-${this.placeName.replace(/[\\/:*?"<>|]/g, '')}.jpg`;
      const result = await shareOrDownload(blob, filename, `山河有声 · ${this.placeName}`);
      if (result === 'downloaded') this.toast('已下载修好的照片，可分享到朋友圈');
    } catch (error) {
      console.error(error);
      this.toast('分享失败，可直接保存图片');
    }
  }

  close() {
    if (!this.root) return;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('keydown', this._onKey);
    this.root.remove();
    this.root = null;
    document.body.classList.remove('is-locked');
    this.onClose?.();
  }
}
