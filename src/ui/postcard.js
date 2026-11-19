import { loadImage, downloadBlob, shareOrDownload } from '../logic/image.js';
import {
  POSTCARD_SIZES,
  renderPostcard,
  canvasToPostcardBlob
} from '../logic/postcard.js';
import {
  buildPostcardCopy,
  validatePostcardTitle,
  validatePostcardCaption
} from '../data/postcard-copy.js';

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/**
 * 水墨明信片工作室。
 * 照片只作为上版实景；下版水墨由本地 Canvas 绘制，再统一排英文题字。
 */
export class PostcardStudio {
  constructor({ src, scene, analysis, placeName = '山河', toast = () => {}, onClose }) {
    this.src = src;
    this.scene = scene;
    this.analysis = analysis;
    this.placeName = placeName;
    this.toast = toast;
    this.onClose = onClose;
    this.root = null;
    this.canvas = null;
    this.image = null;
    this.seed = 0;
    this.variant = 0;
    this.ink = 1;
    this.title = '';
    this.caption = '';
    this.renderTimer = 0;
    this.renderToken = 0;
    this.exporting = false;
    this._onKey = this._onKey.bind(this);
  }

  async open() {
    document.body.classList.add('is-locked');
    const copy = buildPostcardCopy(this.scene?.id, this.seed);
    this.title = copy.title;
    this.caption = copy.caption;
    this.root = document.createElement('div');
    this.root.className = 'postcard-studio';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', '水墨明信片工作室');
    this.root.innerHTML = `
      <header class="pc-header">
        <div class="pc-header-left">
          <button class="editor-btn" type="button" data-pc-action="close" aria-label="关闭明信片工作室">
            <svg class="icon"><use href="#i-close"></use></svg>
          </button>
          <span class="pc-title"><strong>水墨明信片</strong><span>INK POSTCARD · 2:3</span></span>
        </div>
        <div class="pc-header-right">
          <button class="editor-btn" type="button" data-pc-action="variant" aria-label="换一种构图">
            <svg class="icon"><use href="#i-refresh"></use></svg><span class="editor-btn-label">换构图</span>
          </button>
          <button class="editor-btn primary" type="button" data-pc-action="save">
            <svg class="icon"><use href="#i-download"></use></svg><span class="editor-btn-label">保存 4K</span>
          </button>
        </div>
      </header>
      <div class="pc-body">
        <section class="pc-stage" aria-label="明信片预览">
          <div class="pc-paper"><canvas id="postcard-canvas"></canvas></div>
          <div class="pc-loading" id="pc-loading"><span class="pc-spinner"></span><strong>正在铺纸研墨…</strong></div>
          <div class="pc-stage-note">上版实景 · 下版本地水墨绘制 · 2160 × 3240</div>
        </section>
        <aside class="pc-panel">
          <div class="pc-intro">
            <p class="step-label">POSTCARD STUDIO</p>
            <h2>把此刻，<br>寄成一张明信片。</h2>
            <p>照片留在上版，下半版从同一片山河里提炼成水墨。文字由本地排字，导出 4K PNG。</p>
          </div>

          <div class="pc-section">
            <div class="pc-section-head"><span>英文题字</span><button class="btn-text" type="button" data-pc-action="shuffle">换一换 ${'<svg class="icon"><use href="#i-refresh"></use></svg>'}</button></div>
            <label class="pc-field">
              <span>标题 <small id="pc-title-hint">2–5 个英文词</small></span>
              <input id="postcard-title" type="text" maxlength="52" value="${esc(this.title)}" autocomplete="off" spellcheck="false" />
            </label>
            <label class="pc-field">
              <span>短句 <small id="pc-caption-hint">6–12 个英文词，全小写</small></span>
              <input id="postcard-caption" type="text" maxlength="96" value="${esc(this.caption)}" autocomplete="off" spellcheck="false" />
            </label>
            <p class="pc-hint" id="pc-copy-hint">标题像一枚地名，短句补一个具体的细节。</p>
          </div>

          <div class="pc-section">
            <label class="pc-field">
              <span>水墨浓度 <output id="pc-ink-value">${this.ink.toFixed(1)}×</output></span>
              <input id="postcard-ink" type="range" min="0.6" max="1.5" step="0.1" value="${this.ink}" />
            </label>
            <div class="pc-section-head pc-section-head-small">
              <span>构图</span>
              <button class="btn-text" type="button" data-pc-action="variant">换一侧留白 ${'<svg class="icon"><use href="#i-refresh"></use></svg>'}</button>
            </div>
          </div>

          <div class="pc-privacy">
            <svg class="icon"><use href="#i-lock"></use></svg>
            <span>水墨由本机 Canvas 绘制，不调用外部生图模型。照片和文字都不会上传。</span>
          </div>

          <div class="pc-footer">
            <button class="btn btn-ghost" type="button" data-pc-action="share">${'<svg class="icon"><use href="#i-share"></use></svg>'} 分享</button>
            <button class="btn btn-jade" type="button" data-pc-action="save">${'<svg class="icon"><use href="#i-download"></use></svg>'} 保存 4K 明信片</button>
          </div>
        </aside>
      </div>
    `;
    document.body.appendChild(this.root);
    this.canvas = this.root.querySelector('#postcard-canvas');
    this.loading = this.root.querySelector('#pc-loading');
    this.root.addEventListener('click', (event) => this._onClick(event));
    this.root.addEventListener('input', (event) => this._onInput(event));
    document.addEventListener('keydown', this._onKey);

    try {
      this.image = await loadImage(this.src);
    } catch (error) {
      this.toast('照片加载失败，无法制作明信片', 'error');
      this.close();
      return;
    }
    await this._renderPreview();
  }

  _onKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  _onClick(event) {
    const action = event.target.closest('[data-pc-action]');
    if (!action) return;
    const kind = action.dataset.pcAction;
    if (kind === 'close') this.close();
    if (kind === 'variant') {
      this.variant = (this.variant + 1) % 2;
      this._schedulePreview();
      this.toast(this.variant ? '留白换到另一侧了' : '回到左侧留白');
    }
    if (kind === 'shuffle') {
      this.seed += 1;
      const copy = buildPostcardCopy(this.scene?.id, this.seed);
      this.title = copy.title;
      this.caption = copy.caption;
      this.root.querySelector('#postcard-title').value = copy.title;
      this.root.querySelector('#postcard-caption').value = copy.caption;
      this._updateCopyHints();
      this._schedulePreview();
    }
    if (kind === 'save') this._save();
    if (kind === 'share') this._share();
  }

  _onInput(event) {
    if (event.target.id === 'postcard-title') {
      this.title = event.target.value;
      this._updateCopyHints();
      this._schedulePreview();
    }
    if (event.target.id === 'postcard-caption') {
      this.caption = event.target.value;
      this._updateCopyHints();
      this._schedulePreview();
    }
    if (event.target.id === 'postcard-ink') {
      this.ink = Number(event.target.value);
      const output = this.root.querySelector('#pc-ink-value');
      if (output) output.textContent = `${this.ink.toFixed(1)}×`;
      this._schedulePreview();
    }
  }

  _updateCopyHints() {
    const titleCheck = validatePostcardTitle(this.title);
    const captionCheck = validatePostcardCaption(this.caption);
    const titleHint = this.root.querySelector('#pc-title-hint');
    const captionHint = this.root.querySelector('#pc-caption-hint');
    const hint = this.root.querySelector('#pc-copy-hint');
    if (titleHint) titleHint.textContent = `${titleCheck.words} 个词`;
    if (captionHint) captionHint.textContent = `${captionCheck.words} 个词 · 全小写`;
    if (hint) {
      const problem = titleCheck.message || captionCheck.message;
      hint.textContent = problem || '标题像一枚地名，短句补一个具体的细节。';
      hint.classList.toggle('is-warning', Boolean(problem));
    }
  }

  _schedulePreview() {
    clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => this._renderPreview(), 180);
  }

  async _renderPreview() {
    if (!this.image) return;
    const token = ++this.renderToken;
    this.loading?.classList.add('is-visible');
    try {
      const result = await renderPostcard({
        image: this.image,
        scene: this.scene,
        analysis: this.analysis,
        title: this.title,
        caption: this.caption,
        ink: this.ink,
        variant: this.variant,
        width: POSTCARD_SIZES.preview.width,
        height: POSTCARD_SIZES.preview.height
      });
      if (token !== this.renderToken) return;
      this.canvas.width = result.canvas.width;
      this.canvas.height = result.canvas.height;
      this.canvas.getContext('2d').drawImage(result.canvas, 0, 0);
    } catch (error) {
      console.error(error);
      this.toast('水墨生成失败，请重试', 'error');
    } finally {
      if (token === this.renderToken) this.loading?.classList.remove('is-visible');
    }
  }

  async _save() {
    if (this.exporting) return;
    const title = this.title.trim();
    const caption = this.caption.trim();
    if (!title || !caption) {
      this.toast('先写一个标题和短句', 'error');
      return;
    }
    this.exporting = true;
    this.loading?.classList.add('is-visible');
    try {
      const result = await renderPostcard({
        image: this.image,
        scene: this.scene,
        analysis: this.analysis,
        title,
        caption,
        ink: this.ink,
        variant: this.variant,
        ...POSTCARD_SIZES.print
      });
      const blob = await canvasToPostcardBlob(result.canvas);
      const safePlace = String(this.placeName || '山河').replace(/[\\/:*?"<>|]/g, '');
      downloadBlob(blob, `${safePlace}-水墨明信片-2160x3240.png`);
      this.toast('4K 水墨明信片已保存');
    } catch (error) {
      console.error(error);
      this.toast('4K 导出失败，请重试', 'error');
    } finally {
      this.exporting = false;
      this.loading?.classList.remove('is-visible');
    }
  }

  async _share() {
    if (this.exporting) return;
    this.exporting = true;
    this.loading?.classList.add('is-visible');
    try {
      const result = await renderPostcard({
        image: this.image,
        scene: this.scene,
        analysis: this.analysis,
        title: this.title,
        caption: this.caption,
        ink: this.ink,
        variant: this.variant,
        ...POSTCARD_SIZES.print
      });
      const blob = await canvasToPostcardBlob(result.canvas);
      const safePlace = String(this.placeName || '山河').replace(/[\\/:*?"<>|]/g, '');
      const status = await shareOrDownload(blob, `${safePlace}-水墨明信片.png`, `${this.title} · ${this.caption}`);
      if (status === 'downloaded') this.toast('已下载明信片，可分享到朋友圈');
    } catch (error) {
      console.error(error);
      this.toast('分享失败，可以直接保存 4K 图片', 'error');
    } finally {
      this.exporting = false;
      this.loading?.classList.remove('is-visible');
    }
  }

  close() {
    if (!this.root) return;
    clearTimeout(this.renderTimer);
    this.renderToken++;
    document.removeEventListener('keydown', this._onKey);
    this.root.remove();
    this.root = null;
    document.body.classList.remove('is-locked');
    this.onClose?.();
  }
}
