import { SCENES, sceneById } from './data/scenes.js';
import { DIALECTS, dialectById } from './data/dialects.js';
import { searchPlaces, placeById } from './data/places.js';
import { analyzeImageData } from './logic/recognizer.js';
import {
  buildNarration,
  narrationToText,
  formatDuration,
  countChars
} from './logic/narration.js';
import { buildMoment, MOMENT_STYLES } from './logic/copywriter.js';
import {
  resolvePlaceAt,
  nearbyPlaces,
  coordinatePlace,
  formatDistance,
  formatCoords,
  compassDirection,
  bearingDegrees
} from './logic/geo.js';
import {
  prepareImage,
  imageDataFromSource,
  imageFromUrl,
  makeHistoryImage,
  validateImageFile,
  copyText,
  downloadText,
  downloadBlob,
  dataUrlToBlob
} from './logic/image.js';
import { SpeechPlayer } from './logic/speech.js';
import { PhotoEditor } from './ui/editor.js';

/* ------------------------------------------------------------------ */
/* constants                                                          */
/* ------------------------------------------------------------------ */

const HISTORY_KEY = 'shanhe.history.v1';
const SETTINGS_KEY = 'shanhe.settings.v1';
const MAX_HISTORY = 6;
const APP_VERSION = '1.0.0';

const DEFAULT_SETTINGS = {
  dialect: 'sichuan',
  rate: 1,
  autoLocate: false,
  watermark: true
};

const DEMOS = [
  {
    id: 'huangshan',
    src: '/assets/demo-huangshan.svg',
    title: '黄山云海',
    placeId: 'huangshan',
    note: '山峦叠翠 · 云海'
  },
  {
    id: 'westlake',
    src: '/assets/demo-westlake.svg',
    title: '西湖春水',
    placeId: 'westlake',
    note: '湖光山色 · 江南'
  },
  {
    id: 'coast',
    src: '/assets/demo-coast.svg',
    title: '海岸落日',
    placeId: 'sanya',
    note: '海岸听涛 · 日落'
  },
  {
    id: 'village',
    src: '/assets/demo-village.svg',
    title: '江南古镇',
    placeId: 'wuzhen',
    note: '古镇烟火 · 水乡'
  },
  {
    id: 'desert',
    src: '/assets/demo-desert.svg',
    title: '大漠余晖',
    placeId: 'dunhuang',
    note: '大漠孤烟 · 丝路'
  }
];

const WAVE_HEIGHTS = [
  28, 48, 36, 68, 42, 76, 55, 88, 44, 64, 38, 82, 58, 96, 52, 74, 35, 62, 46, 86, 56, 70, 40, 78, 50,
  92, 44, 66, 34, 58, 42, 72
];

const UNLOCATED_PLACE = {
  id: 'unlocated',
  name: '眼前山川',
  subtitle: '画面已识别 · 等待定位',
  province: '',
  city: '',
  lat: null,
  lon: null,
  aliases: [],
  kinds: [],
  sceneAffinity: [],
  recommendedDialect: null,
  tagline: '先让画面说话，再让地方志开口',
  intro:
    '先不急着给它一个地名。此刻的光线、云层和山形，已经把此地的气质说了一半。开启定位以后，我们可以把另一半故事补上。',
  history:
    '每一片山水都有自己的年轮：地壳抬升、河流改道、人群迁徙、村落兴衰。即使暂时不知道确切的地名，脚下的土层、路边的老树和远处的山形，也都保存着时间的痕迹。',
  culture:
    '地方文化往往藏在日常里：一句口音、一碗吃食、一座小庙、一场节庆。定位或选择一个地点后，这些具体的故事就会被唤醒。',
  poem: { text: '江山如画，一时多少豪杰。', title: '《念奴娇·赤壁怀古》', author: '苏轼' },
  food: '',
  custom: '',
  season: '四季各有风物',
  isUnlocated: true
};

const speech = new SpeechPlayer();
let deferredInstallPrompt = null;
let toastTimer = 0;
let overlayLastFocus = null;
let analysisToken = 0;
let processingTimers = [];

const state = {
  view: 'home',
  image: null,
  analysis: null,
  place: null,
  placeMeta: null,
  location: { status: 'idle', lat: null, lon: null, accuracy: null, at: null },
  locationError: '',
  nearbyCandidates: [],
  dialect: DEFAULT_SETTINGS.dialect,
  dialectTouched: false,
  narration: null,
  narrationLang: 'mandarin',
  scriptOpen: false,
  storyTab: 'history',
  momentStyle: 'literary',
  momentSeed: 0,
  momentDraft: null,
  speaking: null,
  settings: loadSettings(),
  history: loadHistory(),
  savedMemoryId: null,
  pendingPlaceId: null,
  error: '',
  processing: { step: 0, progress: 4 },
  overlay: null,
  placeQuery: ''
};

state.dialect = state.settings.dialect;

/* ------------------------------------------------------------------ */
/* tiny helpers                                                       */
/* ------------------------------------------------------------------ */

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function icon(name, className = '') {
  return `<svg class="icon ${className}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDate(iso, withTime = false) {
  try {
    const date = new Date(iso);
    const opts = withTime
      ? { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { year: 'numeric', month: 'long', day: 'numeric' };
    return new Intl.DateTimeFormat('zh-CN', opts).format(date);
  } catch {
    return '';
  }
}

function makeId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `m-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    const dialect = DIALECTS.some((d) => d.id === parsed.dialect) ? parsed.dialect : DEFAULT_SETTINGS.dialect;
    return {
      dialect,
      rate: Number.isFinite(parsed.rate) ? Math.min(1.5, Math.max(0.7, parsed.rate)) : 1,
      autoLocate: Boolean(parsed.autoLocate),
      watermark: parsed.watermark !== false
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function persistSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch {
    /* 隐私模式或存储已满：应用仍可继续使用 */
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && typeof entry === 'object' && entry.image);
  } catch {
    return [];
  }
}

function persistHistory(entries) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

function toast(message, type = 'normal') {
  const el = document.getElementById('toast');
  if (!el) return;
  clearTimeout(toastTimer);
  el.textContent = message;
  el.className = `toast is-visible${type === 'error' ? ' is-error' : ''}`;
  toastTimer = window.setTimeout(() => {
    el.className = 'toast';
  }, 2800);
}

function preserveScroll(fn) {
  const y = window.scrollY;
  fn();
  requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'instant' }));
}

/* ------------------------------------------------------------------ */
/* derived state                                                      */
/* ------------------------------------------------------------------ */

const activeScript = () => {
  if (!state.narration) return null;
  return state.narrationLang === 'dialect' ? state.narration.dialect : state.narration.mandarin;
};

const activeDialect = () => dialectById(state.dialect);

function activePlace() {
  return state.place || UNLOCATED_PLACE;
}

function locationNoteFor(place = state.place, meta = state.placeMeta) {
  if (!place || !meta || !Number.isFinite(meta.distanceKm)) return '';
  if (meta.source === 'gps' && meta.match === 'nearby') {
    return `定位显示，你距离${place.name}约${formatDistance(meta.distanceKm)}，方向偏${meta.direction}。接下来讲的，是你身边的这片山水。`;
  }
  if (meta.source === 'gps' && meta.match === 'exact' && meta.distanceKm > 1) {
    return `定位显示，你正在${place.name}附近，距离约${formatDistance(meta.distanceKm)}。`;
  }
  return '';
}

function currentMoment() {
  const scene = state.analysis?.scene || SCENES[0];
  const place = activePlace();
  const base = buildMoment({ scene, place, style: state.momentStyle, seed: state.momentSeed });
  if (state.momentDraft !== null) {
    const text = state.momentDraft;
    return { ...base, text, full: `${text}\n\n${base.tags.join(' ')}`, chars: countChars(text) };
  }
  return base;
}

function currentPlaceRegion(place = activePlace()) {
  if (!place || place.isUnlocated) return '画面已识别 · 待定位';
  if (place.isCoordinate) return `${formatCoords(place.lat, place.lon)} · 坐标叙事`;
  return place.subtitle || `${place.province || ''}${place.city ? ` · ${place.city}` : ''}`;
}

function currentCoords(place = activePlace()) {
  const loc = state.location;
  if (loc.status === 'found' && Number.isFinite(loc.lat) && Number.isFinite(loc.lon)) {
    return formatCoords(loc.lat, loc.lon);
  }
  if (place && Number.isFinite(place.lat) && Number.isFinite(place.lon)) {
    return formatCoords(place.lat, place.lon);
  }
  return '';
}

function applyPlace(place, meta, { resetTab = true } = {}) {
  stopSpeech();
  state.place = place;
  state.placeMeta = meta;
  if (resetTab) state.storyTab = 'history';
  if (place?.recommendedDialect && !state.dialectTouched) {
    state.dialect = place.recommendedDialect;
  } else if (!place?.recommendedDialect && !state.dialectTouched) {
    state.dialect = state.settings.dialect;
  }
  buildNarrationState();
  state.momentDraft = null;
  state.savedMemoryId = null;
}

function buildNarrationState() {
  const scene = state.analysis?.scene || SCENES[0];
  state.narration = buildNarration({
    scene,
    place: activePlace(),
    dialectId: state.dialect,
    locationNote: locationNoteFor()
  });
}

function resetForNewImage() {
  stopSpeech();
  analysisToken++;
  state.analysis = null;
  state.place = null;
  state.placeMeta = null;
  state.location = { status: 'idle', lat: null, lon: null, accuracy: null, at: null };
  state.locationError = '';
  state.nearbyCandidates = [];
  state.narration = null;
  state.narrationLang = 'mandarin';
  state.scriptOpen = false;
  state.storyTab = 'history';
  state.momentStyle = 'literary';
  state.momentSeed = 0;
  state.momentDraft = null;
  state.savedMemoryId = null;
  state.dialectTouched = false;
  state.dialect = state.settings.dialect;
  state.pendingPlaceId = null;
  state.error = '';
}

/* ------------------------------------------------------------------ */
/* rendering: home                                                    */
/* ------------------------------------------------------------------ */

function render() {
  const main = document.getElementById('main');
  if (!main) return;
  if (state.view === 'home') main.innerHTML = renderHome();
  else if (state.view === 'processing') main.innerHTML = renderProcessing();
  else if (state.view === 'result') main.innerHTML = renderResult();
  else if (state.view === 'history') main.innerHTML = renderHistory();
  else main.innerHTML = renderError();
  document.title =
    state.view === 'result' && state.analysis
      ? `${activePlace().name} · 山河有声`
      : '山河有声 · 让风景开口讲故事';
}

function renderHome() {
  const recent = state.history.slice(0, 3);
  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow"><span class="pulse"></span> AI 风景解说 · 离线识别 · 本机处理</p>
        <h1>让风景<br><em>开口说话</em></h1>
        <p class="hero-lede">
          上传一张照片，听见<strong>普通话与家乡话</strong>里的山河；
          定位此刻，读一读<strong>此地的旧事</strong>；
          再修成一张好图，配一段刚好的朋友圈文案。
        </p>
        <div class="hero-chips" aria-label="能力">
          <span class="hero-chip">${icon('sparkle')} 看见山川湖海</span>
          <span class="hero-chip">${icon('volume')} 双语解说</span>
          <span class="hero-chip">${icon('pin')} 地方志故事</span>
          <span class="hero-chip">${icon('edit')} 修图出片</span>
        </div>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <span class="vertical-script">一图一山河 · 一声一故乡</span>
        <div class="hero-orbit"></div>
        <div class="hero-sun"></div>
        <div class="hero-ridge"></div>
        <div class="hero-ridge second"></div>
        <article class="preview-card">
          <div class="preview-photo">
            <img src="/assets/demo-westlake.svg" alt="" />
            <div class="preview-topline">
              <span class="glass-pill">${icon('sparkle')} AI 识别 · 湖光山色</span>
              <span class="glass-pill">${icon('pin')} 杭州</span>
            </div>
            <div class="preview-caption">
              <small>此刻，西湖在说</small>
              <strong>水把天光收进来</strong>
            </div>
          </div>
          <div class="preview-audio">
            <span class="preview-play">${icon('play')}</span>
            <div class="preview-audio-copy">
              <strong>普通话 · 吴语 双语音解</strong>
              <small>AI 生成 · 约 01:48</small>
            </div>
            <span class="preview-wave">${[30, 55, 38, 72, 48, 88, 42, 62, 34, 76, 50, 66, 30, 80]
              .map((h, i) => `<i style="height:${h}%;animation-delay:${i * -0.1}s"></i>`)
              .join('')}</span>
          </div>
          <div class="preview-tags">
            <span>湖光</span><span>倒影</span><span>#山河有声</span>
          </div>
        </article>
        <div class="floating-note note-location">${icon('pin')} <span><strong>定位此刻</strong><br>读出此地的旧事</span></div>
        <div class="floating-note note-voice">${icon('volume')} <span><strong>五种乡音</strong><br>川 · 粤 · 东北 · 吴 · 陕</span></div>
      </div>
    </section>

    <section class="capture-panel" aria-labelledby="capture-title">
      <div class="capture-copy">
        <p class="step-label">STEP 01 · 一张照片</p>
        <h2 id="capture-title">把此刻的风景，<br>交给山河。</h2>
        <p>AI 会读光影、辨山川，先写一版普通话解说，再用你选的乡音讲一遍。</p>
        <div class="capture-privacy">${icon('lock')} 照片只在这台设备上处理，不上传服务器</div>
      </div>
      <div class="dropzone" id="dropzone" data-action="trigger-upload" role="button" tabindex="0" aria-label="上传风景照片">
        <span class="upload-icon">${icon('upload')}</span>
        <h3 class="dropzone-title">拖一张风景照到这里</h3>
        <p class="dropzone-sub">或从相册选择 · 支持 JPG / PNG / WebP · 24MB 内</p>
        <div class="dropzone-actions">
          <button class="btn btn-primary" type="button" data-action="trigger-upload">${icon('image')} 从相册选择</button>
          <button class="btn btn-ghost" type="button" data-action="trigger-camera">${icon('camera')} 拍一张</button>
        </div>
      </div>
      <input id="file-upload" type="file" accept="image/*" hidden />
      <input id="camera-upload" type="file" accept="image/*" capture="environment" hidden />
    </section>

    <div class="demo-strip">
      <span class="demo-label">没有照片？借一片山河</span>
      <div class="demo-list">
        ${DEMOS.map(
          (demo) => `
          <button class="demo-item" type="button" data-action="demo" data-demo="${demo.id}">
            <span class="demo-thumb"><img src="${demo.src}" alt="" loading="lazy"></span>
            ${demo.title}
          </button>`
        ).join('')}
      </div>
    </div>

    <section class="feature-section" aria-labelledby="feature-title">
      <p class="section-kicker" id="feature-title">山河有声 · 四件事</p>
      <div class="feature-grid">
        <article class="feature-card">
          <div class="feature-top"><span class="feature-icon">${icon('sparkle')}</span><span class="feature-index">01</span></div>
          <h3>影像理解</h3>
          <p>离线分析色彩、光线与构图，认出山峦、湖泊、海岸、草甸与古城。</p>
        </article>
        <article class="feature-card">
          <div class="feature-top"><span class="feature-icon clay">${icon('volume')}</span><span class="feature-index">02</span></div>
          <h3>双语音解</h3>
          <p>普通话负责远方，方言负责故乡。川渝、粤语、东北、吴语、陕西五种声腔。</p>
        </article>
        <article class="feature-card">
          <div class="feature-top"><span class="feature-icon gold">${icon('scroll')}</span><span class="feature-index">03</span></div>
          <h3>此地的故事</h3>
          <p>定位或手动选点，串起山河志、人情风物与诗里此地，不编造、不硬凑。</p>
        </article>
        <article class="feature-card">
          <div class="feature-top"><span class="feature-icon ink">${icon('edit')}</span><span class="feature-index">04</span></div>
          <h3>修图与文案</h3>
          <p>滤镜、裁剪、题字一键出片，再配一段刚好适合朋友圈的话。</p>
        </article>
      </div>
    </section>

    ${
      recent.length
        ? `<section class="recent-strip">
            <h3>最近的足迹</h3>
            <p>那些听过的山河，都留在本机。</p>
            <div class="recent-thumbs">
              ${recent.map((entry) => `<img src="${entry.image}" alt="${esc(entry.placeName || '足迹')}">`).join('')}
            </div>
            <button class="btn-text" type="button" data-action="open-history">全部足迹 ${icon('chevron')}</button>
          </section>`
        : ''
    }
  `;
}

/* ------------------------------------------------------------------ */
/* rendering: processing                                              */
/* ------------------------------------------------------------------ */

function renderProcessing() {
  const progress = state.processing?.progress || 4;
  const steps = ['读取光影', '辨认山川', '翻阅方志', '润色音声'];
  return `
    <section class="processing-view" aria-live="polite">
      <div class="processing-stage">
        <img src="${state.image?.src || ''}" alt="正在识别的风景照片" />
        <div class="scan-line"></div>
        <div class="scan-corners"></div>
        <div class="scan-label"><span class="pulse"></span> Scanning the landscape</div>
      </div>
      <div class="processing-copy">
        <h2>正在听山河说话</h2>
        <p class="processing-step" id="processing-step">${steps[state.processing?.step || 0]}…</p>
        <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
          <div class="progress-bar" id="progress-bar" style="width:${progress}%"></div>
        </div>
        <div class="processing-steps">
          ${steps
            .map(
              (step, index) =>
                `<span class="${index < (state.processing?.step || 0) ? 'is-done' : index === (state.processing?.step || 0) ? 'is-active' : ''}">${step}</span>`
            )
            .join('')}
        </div>
      </div>
    </section>
  `;
}

function renderHistory() {
  return `
    <section class="page-view">
      <div class="page-head">
        <div>
          <p class="page-eyebrow">MY FOOTPRINTS</p>
          <h1>我的足迹</h1>
          <p>${state.history.length ? `共 ${state.history.length} 段山河记忆，只保存在这台设备。` : '听过、看过的山河，会在这里留下一枚书签。'}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" type="button" data-action="home">${icon('arrow-left')} 回到首页</button>
          ${
            state.history.length
              ? `<button class="btn btn-ghost btn-sm" type="button" data-action="clear-history">${icon('trash')} 清空</button>`
              : ''
          }
        </div>
      </div>
      ${
        state.history.length
          ? `<div class="history-grid">
              ${state.history
                .map(
                  (entry) => `
                  <article class="history-card">
                    <img class="history-photo" src="${entry.image}" alt="${esc(entry.placeName || '山河记忆')}" loading="lazy">
                    <button class="history-delete" type="button" data-action="delete-history" data-history-id="${esc(entry.id)}" aria-label="删除这条足迹">${icon('trash')}</button>
                    <div class="history-card-body">
                      <div class="history-meta">
                        <span>${formatDate(entry.createdAt)}</span>
                        <span class="dot"></span>
                        <span>${esc(entry.sceneName || '风景')}</span>
                        ${entry.dialect ? `<span class="dot"></span><span>${esc(entry.dialect)}</span>` : ''}
                      </div>
                      <h3>${esc(entry.placeName || '此处的山河')}</h3>
                      <p>${esc(entry.summary || '')}</p>
                    </div>
                    <button class="history-open" type="button" data-action="open-history-entry" data-history-id="${esc(entry.id)}" aria-label="查看${esc(entry.placeName || '山河记忆')}"></button>
                  </article>`
                )
                .join('')}
              ${
                state.history.length < 3
                  ? `<button class="history-add" type="button" data-action="home">
                      <span class="history-add-icon">${icon('plus')}</span>
                      <strong>再听一段山河</strong>
                      <p>上传一张新的风景照，把新的故事收进这里。</p>
                    </button>`
                  : ''
              }
            </div>`
          : `<div class="empty-state">
              ${icon('scroll')}
              <h2>还没有足迹</h2>
              <p>上传一张风景照，听完一段山河故事，就可以把它收进这里。</p>
              <button class="btn btn-primary" type="button" data-action="home">${icon('upload')} 去上传一张</button>
            </div>`
      }
    </section>
  `;
}

function renderError() {
  return `
    <section class="error-card">
      <h2>这一页山河，暂时没有展开</h2>
      <p>${esc(state.error || '照片可能无法读取，换一张试试。')}</p>
      <button class="btn btn-primary" type="button" data-action="home">${icon('arrow-left')} 回到首页</button>
    </section>
  `;
}

/* ------------------------------------------------------------------ */
/* rendering: result                                                  */
/* ------------------------------------------------------------------ */

function renderResult() {
  if (!state.analysis) return renderError();
  const scene = state.analysis.scene;
  const place = activePlace();
  const meta = state.placeMeta;
  const coords = currentCoords();
  const confidence = Math.round((state.analysis.confidence || 0.8) * 100);
  const placeName = state.place ? place.name : '此处的山河';
  const region = currentPlaceRegion();
  const distanceLabel =
    state.place && meta?.source === 'gps' && Number.isFinite(meta.distanceKm)
      ? meta.match === 'exact' && meta.distanceKm <= 2
        ? '就在此地'
        : `${meta.match === 'exact' ? '附近' : '距你'} ${formatDistance(meta.distanceKm)}`
      : '';
  const narration = state.narration;
  const script = activeScript();
  const dialect = activeDialect();
  const isDialect = state.narrationLang === 'dialect';
  const localDialectMatch = Boolean(state.place?.recommendedDialect && state.place.recommendedDialect === state.dialect);
  const speaking = state.speaking;
  const moment = currentMoment();
  const saved = Boolean(state.savedMemoryId);

  return `
    <section class="result-page">
      <div class="result-topbar">
        <button class="result-back" type="button" data-action="home">${icon('arrow-left')} 换一张照片</button>
        <div class="result-topmeta">
          <span class="live-dot"></span>
          <span>本机识别 · ${confidence}% 把握</span>
          <span>·</span>
          <span>${formatDate(new Date().toISOString(), true)}</span>
        </div>
      </div>

      <div class="result-layout">
        <div class="result-visual">
          <figure class="photo-frame">
            <img src="${state.image.src}" alt="${esc(placeName)}的风景照片" />
            <div class="photo-top">
              <span class="photo-badge">${icon('sparkle')} ${esc(scene.name)}<span class="conf">${confidence}%</span></span>
              <div class="photo-tools">
                <button class="photo-tool" type="button" data-action="download-photo" aria-label="保存原图">${icon('download')}</button>
                <button class="photo-tool" type="button" data-action="open-editor" aria-label="修图">${icon('edit')}</button>
              </div>
            </div>
            <figcaption class="photo-caption">
              <span class="eyebrow-mini">${state.place ? 'THIS LANDSCAPE, THIS PLACE' : 'A LANDSCAPE WAITING FOR A NAME'}</span>
              <h2>${esc(placeName)}</h2>
              <p>
                <span>${esc(region)}</span>
                ${coords ? `<span class="dot-sep"></span><span>${esc(coords)}</span>` : ''}
                ${distanceLabel ? `<span class="dot-sep"></span><span class="place-distance">${icon('compass')} ${esc(distanceLabel)}</span>` : ''}
              </p>
            </figcaption>
            <div class="photo-edit-cta">
              <button class="btn" type="button" data-action="open-editor">${icon('edit')} 修图出片</button>
            </div>
          </figure>

          <div class="insight-card">
            <div class="palette-dots" aria-hidden="true">
              ${(state.analysis.palette || []).map((color) => `<i style="background:${esc(color)}"></i>`).join('')}
            </div>
            <div class="insight-text">
              <strong>画面解读 · ${esc(state.analysis.dominantTone || '山河色')}</strong>
              <span>${esc(state.analysis.summary || '')} · 根据色彩、光线与构图离线判断</span>
            </div>
            <div class="insight-tags">
              ${(scene.keywords || []).slice(0, 4).map((keyword) => `<span>${esc(keyword)}</span>`).join('')}
            </div>
          </div>
          <div class="visual-actions">
            <button class="btn btn-ghost btn-sm" type="button" data-action="open-scene-picker">${icon('refresh')} 调整场景</button>
            <button class="btn btn-ghost btn-sm" type="button" data-action="open-place-picker">${icon('pin')} ${state.place ? '换一个地点' : '手动选点'}</button>
            <button class="btn btn-ghost btn-sm" type="button" data-action="home">${icon('image')} 换一张照片</button>
          </div>
        </div>

        <div class="story-column">
          <section class="narration-card" aria-labelledby="narration-title">
            <div class="narration-head">
              <div class="narration-title">
                <span class="seal-icon">${icon('volume')}</span>
                <div>
                  <h3 id="narration-title">山河有声</h3>
                  <p>Mandarin &nbsp;×&nbsp; Dialect</p>
                </div>
              </div>
              <span class="ai-chip">${icon('sparkle')} AI 生成</span>
            </div>

            <div class="lang-tabs" role="tablist" aria-label="解说语言">
              <button class="lang-tab ${!isDialect ? 'is-active' : ''}" type="button" data-action="switch-lang" data-lang="mandarin" role="tab" aria-selected="${!isDialect}">
                ${icon('volume')} 普通话
              </button>
              <button class="lang-tab ${isDialect ? 'is-active' : ''}" type="button" data-action="switch-lang" data-lang="dialect" role="tab" aria-selected="${isDialect}">
                ${icon('compass')} 方言 · ${esc(dialect.short)}
              </button>
            </div>

            ${
              isDialect
                ? `<div class="dialect-row" aria-label="选择方言">
                    ${DIALECTS.map(
                      (item) => `<button class="dialect-chip ${item.id === state.dialect ? 'is-active' : ''}" type="button" data-action="set-dialect" data-dialect="${item.id}">
                        ${esc(item.name)}<span class="sample">${esc(item.sample)}</span>
                      </button>`
                    ).join('')}
                  </div>`
                : ''
            }

            <div class="narration-meta-row">
              <span>${esc(script.language)}</span>
              <span class="dot"></span>
              <span>${script.chars} 字</span>
              <span class="dot"></span>
              <span>约 ${formatDuration(script.duration)}</span>
              ${isDialect ? `<span class="dot"></span><span>${esc(dialect.note)}${localDialectMatch ? '' : ' · 自选声腔'}</span>` : ''}
            </div>

            <div class="script-collapse ${state.scriptOpen ? 'is-open' : ''}">
              <div class="script-body">
                ${script.paragraphs.map((paragraph) => `<p>${esc(paragraph)}</p>`).join('')}
              </div>
              <button class="script-toggle" type="button" data-action="toggle-script" aria-expanded="${state.scriptOpen}">
                ${state.scriptOpen ? '收起' : `展开全文 · ${Math.max(0, script.paragraphs.length - 3)} 段`} ${icon('chevron')}
              </button>
            </div>

            <div class="player" id="script-player">
              <button class="play-button ${speaking?.lang === state.narrationLang ? 'is-playing' : ''}" type="button" data-action="play-script" aria-label="${speaking?.lang === state.narrationLang ? '停止朗读' : '开始朗读'}">
                <span class="play-icon">${icon('play')}</span>
                <span class="pause-icon">${icon('pause')}</span>
              </button>
              <div class="player-main">
                <div class="player-topline">
                  <span class="player-status" id="player-status">${
                    speaking?.lang === state.narrationLang
                      ? `正在朗读 · ${speaking.progress || 1}/${speaking.total || '—'} 段`
                      : `点击收听 · 约 ${formatDuration(script.duration)}`
                  }</span>
                  <span class="player-time" id="player-time">${formatDuration(script.duration)}</span>
                </div>
                <div class="wave-bars ${speaking?.lang === state.narrationLang ? 'is-playing' : ''}" id="wave-bars">
                  ${WAVE_HEIGHTS.map((h, i) => `<i style="--h:${h};--i:${i}"></i>`).join('')}
                </div>
              </div>
              <div class="player-side">
                <button class="player-icon-btn" type="button" data-action="copy-script" aria-label="复制解说词">${icon('copy')}</button>
                <button class="player-icon-btn" type="button" data-action="download-script" aria-label="导出解说词">${icon('download')}</button>
              </div>
            </div>
            <p class="voice-note" id="voice-note">${
              speaking?.voice ? `系统语音 · ${esc(speaking.voice)}` : '语音由浏览器合成；方言音色取决于设备语音包，缺失时会以普通话代读。'
            }</p>
          </section>

          ${renderPlaceCard()}

          <section class="moment-card" aria-labelledby="moment-title">
            <div class="moment-head">
              <div class="moment-title">
                <span class="seal-icon" style="border-color:rgba(188,103,70,.25);color:var(--clay);background:rgba(239,211,194,.22)">${icon('feather')}</span>
                <div>
                  <h3 id="moment-title">一键朋友圈</h3>
                  <p>四种语气 · 可编辑 · 复制即用</p>
                </div>
              </div>
            </div>
            <div class="moment-style-tabs" role="tablist" aria-label="文案风格">
              ${MOMENT_STYLES.map(
                (style) => `<button class="moment-style ${style.id === state.momentStyle ? 'is-active' : ''}" type="button" data-action="set-moment-style" data-style="${style.id}" role="tab" aria-selected="${style.id === state.momentStyle}">
                  ${icon(style.icon)} ${style.name}
                </button>`
              ).join('')}
            </div>
            <div class="moment-preview">
              <div class="moment-author">
                <span class="moment-avatar">山</span>
                <span>山河有声</span>
              </div>
              <textarea class="moment-text" id="moment-text" spellcheck="false" aria-label="朋友圈文案，可编辑">${esc(moment.text)}</textarea>
              <div class="moment-tags">${moment.tags.map((tag) => `<span>${esc(tag)}</span>`).join('')}</div>
            </div>
            <div class="moment-foot">
              <span class="moment-count" id="moment-count">正文 ${moment.chars} 字 · ${esc(MOMENT_STYLES.find((s) => s.id === state.momentStyle)?.hint || '')}</span>
              <div class="moment-actions">
                <button class="btn btn-ghost btn-sm" type="button" data-action="refresh-moment">${icon('refresh')} 换一换</button>
                <button class="btn btn-ghost btn-sm" type="button" data-action="share-moment" aria-label="分享这段文案">${icon('share')}</button>
                <button class="btn btn-primary btn-sm" type="button" data-action="copy-moment">${icon('copy')} 复制文案</button>
              </div>
            </div>
          </section>

          <section class="result-bottom">
            <p>
              <strong>${saved ? '这段山河，已经收进足迹' : '把这份山河记忆，留在本机'}</strong>
              ${saved ? '你随时可以在「足迹」里重新翻开它。' : '会保存一张压缩后的照片与这次的解说，不会上传。'}
            </p>
            <button class="btn ${saved ? 'btn-ghost' : 'btn-jade'}" type="button" data-action="save-memory" ${saved ? 'disabled' : ''}>
              ${icon(saved ? 'check' : 'plus')} ${saved ? '已收入足迹' : '收进我的足迹'}
            </button>
          </section>
        </div>
      </div>
    </section>
  `;
}

function renderPlaceCard() {
  const place = state.place;
  if (!place) {
    const requesting = state.location.status === 'requesting';
    return `
      <section class="paper-card" aria-labelledby="place-title">
        <div class="place-card-head">
          <span class="card-label">${icon('pin')} 此地的故事</span>
          <button class="card-action" type="button" data-action="open-place-picker">手动选点 ${icon('chevron')}</button>
        </div>
        <div class="location-prompt">
          <div class="radar"><span class="radar-sweep"></span>${icon('pin')}</div>
          <h4 id="place-title">让此地的旧事，也开口</h4>
          <p>允许定位，我会匹配离你最近的山河与地方志；不方便定位时，也可以手动选一个地方。</p>
          ${state.locationError ? `<p class="location-error">${esc(state.locationError)}</p>` : ''}
          <div class="location-actions">
            <button class="btn btn-jade btn-sm" type="button" data-action="locate" ${requesting ? 'disabled' : ''}>
              ${icon('compass')} ${requesting ? '正在定位…' : '开启定位'}
            </button>
            <button class="btn btn-ghost btn-sm" type="button" data-action="open-place-picker">${icon('search')} 手动选点</button>
          </div>
        </div>
      </section>
    `;
  }

  const meta = state.placeMeta || {};
  const isNearby = meta.match === 'nearby';
  const sourceLabel = place.isCoordinate
    ? '坐标叙事 · 附近暂未收录具体方志'
    : meta.source === 'manual'
      ? '手动选择的地点'
      : meta.source === 'demo'
        ? '示例地点 · 可重新定位'
        : meta.source === 'memory'
          ? '来自你的足迹'
          : isNearby
            ? `定位匹配 · 距你约 ${formatDistance(meta.distanceKm)}，方向偏${meta.direction}`
            : meta.distanceKm > 2
              ? `已定位 · 距${place.name}约 ${formatDistance(meta.distanceKm)}，按此地讲述`
              : `已定位 · ${meta.accuracy ? `精度约 ${Math.round(meta.accuracy)} 米` : '就在此地'}`;

  const coords = currentCoords(place);
  const latitude = Number.isFinite(place.lat) ? place.lat : state.location.lat;
  const longitude = Number.isFinite(place.lon) ? place.lon : state.location.lon;
  const mapLink =
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? `https://uri.amap.com/marker?position=${longitude},${latitude}&name=${encodeURIComponent(place.name)}&src=shanhe&coordinate=gps&callnative=0`
      : '';
  const compassRotation =
    Number.isFinite(state.location.lat) && Number.isFinite(place.lat)
      ? bearingDegrees({ lat: state.location.lat, lon: state.location.lon }, { lat: place.lat, lon: place.lon })
      : 0;

  return `
    <section class="paper-card" aria-labelledby="place-title">
      <div class="place-card-head">
        <span class="card-label">${icon('pin')} 此地的故事</span>
        <button class="card-action" type="button" data-action="open-place-picker">换一个地方 ${icon('chevron')}</button>
      </div>
      <div class="place-title-row">
        <h3 id="place-title">${esc(place.name)}</h3>
        <span class="place-region">${esc(place.subtitle || place.province || '')}</span>
      </div>
      <p class="place-tagline">「${esc(place.tagline || '山河有信，风月无边')}」</p>
      <div class="location-confirm ${isNearby ? 'nearby' : ''}">
        ${icon(place.isCoordinate ? 'compass' : 'check')}
        <span>${esc(sourceLabel)}</span>
      </div>

      <div class="story-tabs" role="tablist" aria-label="地方志分类">
        ${[
          ['history', '山河志'],
          ['culture', '风物'],
          ['poem', '诗里']
        ]
          .map(
            ([id, label]) => `<button class="story-tab ${state.storyTab === id ? 'is-active' : ''}" type="button" data-action="story-tab" data-tab="${id}" role="tab" aria-selected="${state.storyTab === id}">${label}</button>`
          )
          .join('')}
      </div>
      <div class="story-panel" role="tabpanel">
        ${renderStoryPanel(place)}
      </div>

      <div class="fact-grid">
        <div class="fact-item"><span>风物</span><strong>${esc(place.food || '当地时令小食')}</strong></div>
        <div class="fact-item"><span>时节</span><strong>${esc(place.season || '四季各有风物')}</strong></div>
      </div>

      <div class="map-strip">
        <div class="mini-map" aria-hidden="true">
          <span class="map-pin"></span>
          <span class="compass" style="transform:rotate(${compassRotation}deg)">N</span>
        </div>
        <div class="map-copy">
          <div class="coords">${esc(coords || '等待定位坐标')}</div>
          <strong>${place.isCoordinate ? '以此刻坐标，记录一段旅途' : `此地 · ${esc(place.province || '中国')}`}</strong>
          ${mapLink ? `<a href="${mapLink}" target="_blank" rel="noopener noreferrer">在高德地图查看 ${icon('external')}</a>` : ''}
        </div>
      </div>
    </section>
  `;
}

function renderStoryPanel(place) {
  if (state.storyTab === 'culture') {
    return `<p>${esc(place.culture || '地方文化藏在日常里，等一位路过的人慢慢发现。')}</p>
      ${place.custom ? `<p><strong>当地讲究：</strong>${esc(place.custom)}</p>` : ''}
      ${place.food ? `<p><strong>风物：</strong>${esc(place.food)}。食物的味道，往往比风景更先让人记住一个地方。</p>` : ''}`;
  }
  if (state.storyTab === 'poem') {
    const poem = place.poem || UNLOCATED_PLACE.poem;
    return `
      <div class="poem-block">${esc(poem.text)}<cite>${esc(poem.title || '')}${poem.author ? ` · ${esc(poem.author)}` : ''}</cite></div>
      <p>${esc(place.tagline || '')}。当诗句落在眼前的光线里，文字就不再只是文字，而是一个人站在山河之间，忽然说不出话的那一瞬。</p>
    `;
  }
  return `<p>${esc(place.history || place.intro || '')}</p>
    ${place.intro && place.history ? `<p>${esc(place.intro)}</p>` : ''}`;
}

/* ------------------------------------------------------------------ */
/* rendering: sheets / pickers                                        */
/* ------------------------------------------------------------------ */

function openSheet({ title, subtitle = '', body, footer = '', wide = false }) {
  const root = document.getElementById('overlay-root');
  overlayLastFocus = document.activeElement;
  root.innerHTML = `
    <div class="overlay" data-overlay-backdrop>
      <section class="sheet ${wide ? 'sheet-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <header class="sheet-head">
          <div>
            <h2 id="sheet-title">${esc(title)}</h2>
            ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
          </div>
          <button class="sheet-close" type="button" data-action="close-overlay" aria-label="关闭">${icon('close')}</button>
        </header>
        <div class="sheet-body">${body}</div>
        ${footer ? `<footer class="sheet-footer">${footer}</footer>` : ''}
      </section>
    </div>
  `;
  document.body.classList.add('is-locked');
  state.overlay = title;
  requestAnimationFrame(() => {
    root.querySelector('input, button.sheet-close, button')?.focus({ preventScroll: true });
  });
}

function closeSheet() {
  const root = document.getElementById('overlay-root');
  if (!root) return;
  root.innerHTML = '';
  document.body.classList.remove('is-locked');
  state.overlay = null;
  if (overlayLastFocus && typeof overlayLastFocus.focus === 'function') {
    overlayLastFocus.focus({ preventScroll: true });
  }
}

function openSettings() {
  const dialect = state.settings.dialect;
  openSheet({
    title: '设置',
    subtitle: '把山河调成你喜欢的声音',
    body: `
      <div class="settings-group">
        <div class="settings-label"><h3>默认方言</h3><span>${esc(dialectById(dialect).note)}</span></div>
        <div class="chip-row">
          ${DIALECTS.map(
            (item) => `<button class="choice-chip ${item.id === dialect ? 'is-active' : ''}" type="button" data-action="set-default-dialect" data-dialect="${item.id}">${esc(item.name)} · ${esc(item.sample)}</button>`
          ).join('')}
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-label"><h3>朗读语速</h3><span>0.7× — 1.4×</span></div>
        <div class="range-row">
          <input id="settings-rate" type="range" min="0.7" max="1.4" step="0.1" value="${state.settings.rate}" aria-label="朗读语速">
          <span class="range-value">${state.settings.rate.toFixed(1)}×</span>
        </div>
      </div>

      <div class="settings-group">
        <div class="setting-row">
          <div class="setting-copy"><strong>识别后自动定位</strong><span>需要浏览器定位权限；仅用于匹配地方志。</span></div>
          <button class="switch" type="button" role="switch" aria-checked="${state.settings.autoLocate}" data-action="toggle-setting" data-setting="autoLocate" aria-label="自动定位"></button>
        </div>
        <div class="setting-row">
          <div class="setting-copy"><strong>修图默认题字</strong><span>导出照片时，在左下角留下「山河有声」。</span></div>
          <button class="switch" type="button" role="switch" aria-checked="${state.settings.watermark}" data-action="toggle-setting" data-setting="watermark" aria-label="修图题字"></button>
        </div>
        <div class="setting-row">
          <div class="setting-copy"><strong>安装到桌面</strong><span>${deferredInstallPrompt ? '像原生 App 一样打开。' : '可添加到主屏幕；定位需要 HTTPS 或 localhost。'}</span></div>
          <button class="btn btn-ghost btn-sm" type="button" data-action="install-app">${icon('install')} 安装</button>
        </div>
      </div>

      <div class="settings-group">
        <div class="privacy-note">${icon('lock')}
          <span><strong>照片不上传。</strong>识别、修图、文案与存储都在这台设备完成。定位坐标只用于本机匹配最近的地方志，不会发送到服务器。历史记录保存在浏览器 localStorage，可随时清空。</span>
        </div>
        <div class="about-line"><span>山河有声 · v${APP_VERSION}</span><span>零外部依赖 · 可离线使用</span></div>
      </div>
    `,
    footer: `
      <button class="btn btn-ghost" type="button" data-action="clear-history">${icon('trash')} 清空足迹</button>
      <button class="btn btn-jade" type="button" data-action="close-overlay">知道了</button>
    `
  });
}

function openPlacePicker() {
  state.placeQuery = '';
  const nearby = state.nearbyCandidates || [];
  const body = `
    <div class="search-box">
      ${icon('search')}
      <input id="place-search" type="search" placeholder="搜索地名、省份或拼音，例如：黄山 / 苏州 / huangshan" autocomplete="off" aria-label="搜索地点">
    </div>
    <div class="place-results" id="place-results">${renderPlaceResults('')}</div>
    <div style="display:flex;justify-content:space-between;gap:10px;margin-top:13px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" type="button" data-action="locate">${icon('compass')} 用此刻定位选点</button>
      ${nearby.length ? `<span style="font-size:9px;color:var(--ink-faint);align-self:center">已按距你由近到远排列</span>` : ''}
    </div>
  `;
  openSheet({
    title: '选一个地方',
    subtitle: '从 50+ 个山河地标里，找到此刻的故事',
    body,
    wide: true,
    footer: `<button class="btn btn-ghost" type="button" data-action="close-overlay">取消</button>`
  });
}

function renderPlaceResults(query) {
  const q = String(query || '').trim();
  let places;
  if (!q && state.nearbyCandidates?.length) {
    places = state.nearbyCandidates.map((item) => item.place);
    const rest = searchPlaces('', 10).filter((place) => !places.some((p) => p.id === place.id));
    places = [...places, ...rest].slice(0, 12);
  } else {
    places = searchPlaces(q, 14);
  }
  if (!places.length) {
    return `<div class="no-results">
      <strong>没有找到「${esc(q)}」</strong>
      试试省份、城市或景区名，例如「浙江」「敦煌」「黄山」。
      ${state.location.status === 'found' ? `<div style="margin-top:12px"><button class="btn btn-ghost btn-sm" type="button" data-action="use-coordinate">${icon('compass')} 就用此刻坐标讲</button></div>` : ''}
    </div>`;
  }
  const nearbyMap = new Map((state.nearbyCandidates || []).map((item) => [item.place.id, item]));
  return places
    .map((place) => {
      const near = nearbyMap.get(place.id);
      return `<button class="place-result" type="button" data-action="choose-place" data-place-id="${place.id}">
        <span class="place-result-main">
          <strong>${esc(place.name)}</strong>
          <span>${esc(place.subtitle)} · ${esc(place.kinds.slice(0, 2).join(' / '))}</span>
        </span>
        <span class="place-result-tag">${near ? `${formatDistance(near.distanceKm)} · ${near.direction}` : esc(place.province)}</span>
      </button>`;
    })
    .join('');
}

function openScenePicker() {
  const active = state.analysis?.sceneId;
  openSheet({
    title: '换一种理解',
    subtitle: '识别不是标准答案。你可以告诉山河，你看见了什么。',
    body: `<div class="scene-grid">
      ${SCENES.map(
        (scene) => `<button class="scene-choice ${scene.id === active ? 'is-active' : ''}" type="button" data-action="choose-scene" data-scene-id="${scene.id}">
          <strong>${esc(scene.name)}</strong>
          <span>${esc(scene.category)} · ${esc(scene.keywords.slice(0, 2).join(' / '))}</span>
        </button>`
      ).join('')}
    </div>`,
    wide: true,
    footer: `<button class="btn btn-ghost" type="button" data-action="close-overlay">保持原识别</button>`
  });
}

/* ------------------------------------------------------------------ */
/* image flow                                                         */
/* ------------------------------------------------------------------ */

async function handleFile(file) {
  if (!file) return;
  const error = validateImageFile(file);
  if (error) {
    toast(error, 'error');
    return;
  }
  resetForNewImage();
  const previewUrl = URL.createObjectURL(file);
  state.image = {
    src: previewUrl,
    name: file.name || '风景照片',
    width: null,
    height: null,
    size: file.size,
    type: file.type
  };
  state.view = 'processing';
  state.processing = { step: 0, progress: 4 };
  render();
  startProcessingTimers();

  try {
    const prepared = await prepareImage(file);
    URL.revokeObjectURL(previewUrl);
    state.image = prepared;
    const img = document.querySelector('.processing-stage img');
    if (img) img.src = prepared.src;
    await analyzeCurrent({ alreadyProcessing: true });
  } catch (err) {
    console.error(err);
    URL.revokeObjectURL(previewUrl);
    failAnalysis('这张照片暂时无法读取。请换一张 JPG、PNG 或 WebP 图片再试。');
  }
}

async function loadDemo(id, { instant = false } = {}) {
  const demo = DEMOS.find((item) => item.id === id) || DEMOS[0];
  resetForNewImage();
  state.image = await imageFromUrl(demo.src, demo.title);
  state.pendingPlaceId = demo.placeId;
  state.processing = { step: 0, progress: 4 };
  if (instant) {
    await analyzeCurrent({ instant: true });
  } else {
    state.view = 'processing';
    render();
    startProcessingTimers();
    await analyzeCurrent({ alreadyProcessing: true });
  }
}

function startProcessingTimers() {
  clearProcessingTimers();
  const steps = [
    [400, 1, 27, '辨认山川湖海…'],
    [850, 2, 54, '翻阅地方志与旧诗…'],
    [1350, 3, 76, '润色普通话与乡音…'],
    [1800, 3, 91, '把这片山河，讲给你听…']
  ];
  for (const [delay, step, progress, text] of steps) {
    processingTimers.push(
      window.setTimeout(() => {
        if (state.view !== 'processing') return;
        setProcessingState(step, progress, text);
      }, delay)
    );
  }
}

function setProcessingState(step, progress, text) {
  state.processing.step = step;
  state.processing.progress = progress;
  const stepEl = document.getElementById('processing-step');
  const bar = document.getElementById('progress-bar');
  if (stepEl && text) stepEl.textContent = text;
  if (bar) bar.style.width = `${progress}%`;
  const labels = document.querySelectorAll('.processing-steps span');
  labels.forEach((label, index) => {
    label.className = index < step ? 'is-done' : index === step ? 'is-active' : '';
  });
  const track = document.querySelector('.progress-track');
  if (track) track.setAttribute('aria-valuenow', String(progress));
}

function clearProcessingTimers() {
  processingTimers.forEach((timer) => clearTimeout(timer));
  processingTimers = [];
}

async function analyzeCurrent({ instant = false, alreadyProcessing = false } = {}) {
  const token = ++analysisToken;
  const startedAt = performance.now();
  try {
    const data = await imageDataFromSource(state.image.src, 900);
    if (token !== analysisToken) return;
    const analysis = analyzeImageData(data, { filename: state.image.name });
    if (token !== analysisToken) return;
    if (!instant) {
      const remaining = Math.max(0, 1950 - (performance.now() - startedAt));
      if (remaining > 0) await wait(remaining);
    }
    if (token !== analysisToken) return;
    state.analysis = analysis;
    if (state.pendingPlaceId) {
      const place = placeById(state.pendingPlaceId);
      if (place) {
        state.location = { status: 'found', lat: place.lat, lon: place.lon, accuracy: null, at: Date.now() };
        applyPlace(place, { source: 'demo', match: 'demo', distanceKm: null, direction: '' }, { resetTab: true });
      }
      state.pendingPlaceId = null;
    }
    if (!state.narration) buildNarrationState();
    clearProcessingTimers();
    if (!instant) {
      setProcessingState(3, 100, '山河已经开口。');
      const bar = document.getElementById('progress-bar');
      if (bar) bar.style.width = '100%';
      await wait(320);
    }
    state.view = 'result';
    state.scriptOpen = false;
    state.storyTab = 'history';
    state.momentDraft = null;
    state.momentSeed = 0;
    state.savedMemoryId = null;
    render();
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (state.settings.autoLocate && !state.place) {
      window.setTimeout(() => locate({ silent: true }), 450);
    }
  } catch (error) {
    console.error(error);
    if (token !== analysisToken) return;
    failAnalysis('识别时遇到了一点问题。照片可能已损坏，或浏览器无法读取这种格式。');
  }
}

function failAnalysis(message) {
  clearProcessingTimers();
  state.error = message;
  state.view = 'error';
  render();
}

/* ------------------------------------------------------------------ */
/* location                                                           */
/* ------------------------------------------------------------------ */

async function locate({ silent = false } = {}) {
  if (!navigator.geolocation) {
    state.locationError = '当前浏览器不支持定位，请手动选点。';
    rerenderResult();
    if (!silent) toast('当前浏览器不支持定位', 'error');
    return;
  }
  if (!window.isSecureContext) {
    state.locationError = '定位需要 HTTPS 或 localhost。当前页面不是安全连接，请手动选点，或把应用部署到 HTTPS。';
    rerenderResult();
    if (!silent) toast('定位需要 HTTPS 或 localhost', 'error');
    return;
  }
  state.location.status = 'requesting';
  state.locationError = '';
  rerenderResult();
  if (!silent) toast('正在寻找你身边的山河…');

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      handleLocationSuccess(latitude, longitude, accuracy);
    },
    (error) => {
      state.location.status = 'error';
      state.locationError =
        error.code === 1
          ? '定位权限被拒绝。可在浏览器地址栏的站点设置里重新允许，或直接手动选点。'
          : error.code === 2
            ? '暂时无法获得位置，请检查系统定位服务，或手动选点。'
            : '定位超时。到开阔处再试一次，或手动选点。';
      rerenderResult();
      if (!silent) toast(state.locationError, 'error');
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
  );
}

function handleLocationSuccess(lat, lon, accuracy) {
  state.location = { status: 'found', lat, lon, accuracy: accuracy || null, at: Date.now() };
  state.locationError = '';
  const resolved = resolvePlaceAt(lat, lon);
  state.nearbyCandidates = resolved.candidates;
  if (resolved.place) {
    const match = resolved.match;
    const first = resolved.candidates[0];
    const bearing = first ? first.bearing : bearingDegrees({ lat, lon }, resolved.place);
    applyPlace(
      resolved.place,
      {
        source: 'gps',
        match,
        distanceKm: resolved.distanceKm,
        direction: compassDirection(bearing),
        accuracy
      },
      { resetTab: true }
    );
    if (state.view !== 'result') {
      state.view = 'result';
      render();
    } else {
      rerenderResult();
    }
    toast(
      match === 'exact'
        ? `已定位到 ${resolved.place.name} 附近`
        : `附近的地标是 ${resolved.place.name}，距你约 ${formatDistance(resolved.distanceKm)}`
    );
  } else {
    const nearest = resolved.candidates[0] || null;
    applyPlace(
      coordinatePlace(lat, lon, nearest),
      {
        source: 'gps',
        match: 'none',
        distanceKm: nearest?.distanceKm ?? null,
        direction: nearest?.direction || '',
        accuracy
      },
      { resetTab: true }
    );
    rerenderResult();
    toast('已记录此刻坐标；附近暂未收录具体方志，可手动选点');
  }
}

function choosePlace(placeId) {
  const place = placeById(placeId);
  if (!place) return;
  stopSpeech();
  state.location = { status: 'found', lat: place.lat, lon: place.lon, accuracy: null, at: Date.now() };
  applyPlace(place, { source: 'manual', match: 'manual', distanceKm: null, direction: '' }, { resetTab: true });
  closeSheet();
  state.view = 'result';
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
  toast(`已选择 ${place.name}`);
}

function useCoordinatePlace() {
  if (state.location.status !== 'found' || !Number.isFinite(state.location.lat)) {
    toast('还没有可用的坐标，请先定位', 'error');
    return;
  }
  const nearest = nearbyPlaces(state.location.lat, state.location.lon, 1)[0];
  applyPlace(
    coordinatePlace(state.location.lat, state.location.lon, nearest),
    { source: 'gps', match: 'none', distanceKm: nearest?.distanceKm ?? null, direction: nearest?.direction || '', accuracy: state.location.accuracy },
    { resetTab: true }
  );
  closeSheet();
  rerenderResult();
  toast('已使用此刻坐标讲述');
}

function rerenderResult() {
  if (state.view !== 'result') return;
  preserveScroll(() => render());
}

/* ------------------------------------------------------------------ */
/* interactions                                                       */
/* ------------------------------------------------------------------ */

function stopSpeech({ update = true } = {}) {
  if (state.speaking || speech.active) speech.stop();
  state.speaking = null;
  if (update) updatePlayerUI();
}

async function playScript() {
  const script = activeScript();
  if (!script) return;
  if (state.speaking?.lang === state.narrationLang) {
    stopSpeech();
    return;
  }
  stopSpeech({ update: false });
  state.speaking = { lang: state.narrationLang, progress: 0, total: 0, voice: '' };
  updatePlayerUI();
  const ok = speech.play(script.full, {
    locale: script.locale,
    voiceHint: activeDialect().voiceHint,
    rate: state.settings.rate,
    onStart: ({ voice, total }) => {
      state.speaking = { ...(state.speaking || {}), lang: state.narrationLang, progress: 1, total, voice };
      updatePlayerUI();
    },
    onProgress: ({ index, total }) => {
      if (!state.speaking) return;
      state.speaking.progress = index;
      state.speaking.total = total;
      updatePlayerUI();
    },
    onEnd: () => {
      state.speaking = null;
      updatePlayerUI();
    },
    onError: (error) => {
      state.speaking = null;
      updatePlayerUI();
      toast(error.message || '语音朗读失败，可以复制文稿', 'error');
    }
  });
  if (!ok && !state.speaking) {
    updatePlayerUI();
  }
}

function updatePlayerUI() {
  const player = document.getElementById('script-player');
  if (!player) return;
  const speaking = state.speaking;
  const isPlaying = speaking?.lang === state.narrationLang;
  const button = player.querySelector('.play-button');
  const wave = player.querySelector('.wave-bars');
  const status = player.querySelector('#player-status');
  const note = document.getElementById('voice-note');
  const script = activeScript();
  if (button) {
    button.classList.toggle('is-playing', isPlaying);
    button.setAttribute('aria-label', isPlaying ? '停止朗读' : '开始朗读');
  }
  if (wave) wave.classList.toggle('is-playing', isPlaying);
  if (status) {
    status.textContent = isPlaying
      ? `正在朗读 · ${speaking.progress || 1}/${speaking.total || '—'} 段`
      : `点击收听 · 约 ${formatDuration(script?.duration || 0)}`;
  }
  if (note) {
    note.textContent = isPlaying && speaking.voice
      ? `系统语音 · ${speaking.voice}`
      : '语音由浏览器合成；方言音色取决于设备语音包，缺失时会以普通话代读。';
  }
}

async function copyScript() {
  const script = activeScript();
  if (!script) return;
  const text = narrationToText(state.narration, { scene: state.analysis.scene, place: activePlace() });
  const ok = await copyText(text);
  toast(ok ? '双语解说词已复制' : '复制失败，请长按文稿手动复制', ok ? 'normal' : 'error');
}

function downloadScript() {
  if (!state.narration) return;
  const text = narrationToText(state.narration, { scene: state.analysis.scene, place: activePlace() });
  downloadText(text, `山河有声-${activePlace().name}-解说词.txt`);
  toast('解说词已导出');
}

async function copyMoment() {
  const moment = currentMoment();
  const ok = await copyText(moment.full);
  toast(ok ? '朋友圈文案已复制，去分享吧' : '复制失败，请长按文本框手动复制', ok ? 'normal' : 'error');
}

async function shareMoment() {
  const moment = currentMoment();
  if (navigator.share) {
    try {
      await navigator.share({ title: `山河有声 · ${activePlace().name}`, text: moment.full });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }
  const ok = await copyText(moment.full);
  toast(ok ? '文案已复制，可粘贴到朋友圈' : '分享失败', ok ? 'normal' : 'error');
}

async function openEditor() {
  if (!state.image) return;
  stopSpeech();
  const editor = new PhotoEditor({
    src: state.image.src,
    placeName: activePlace().name,
    watermark: state.settings.watermark,
    toast,
    onClose: () => {
      state.editorOpen = false;
    },
    onSave: ({ dataUrl }) => {
      state.image = { ...state.image, src: dataUrl, name: 'edited.jpg', type: 'image/jpeg' };
      state.savedMemoryId = null;
      if (state.analysis) {
        state.analysis.summary = `${state.analysis.summary} · 已修图`;
      }
      rerenderResult();
      toast('照片已更新，记得收进足迹');
    }
  });
  state.editorOpen = true;
  await editor.open();
}

async function downloadPhoto() {
  if (!state.image) return;
  try {
    let blob;
    if (state.image.src.startsWith('data:')) blob = dataUrlToBlob(state.image.src);
    else blob = await fetch(state.image.src).then((response) => response.blob());
    const ext = blob.type.includes('png') ? 'png' : blob.type.includes('svg') ? 'svg' : 'jpg';
    downloadBlob(blob, `山河有声-${activePlace().name}-原图.${ext}`);
    toast('原图已保存');
  } catch (error) {
    console.error(error);
    toast('保存失败，请长按图片保存', 'error');
  }
}

async function saveMemory() {
  if (!state.analysis || state.savedMemoryId) return;
  const button = document.querySelector('[data-action="save-memory"]');
  if (button) {
    button.disabled = true;
    button.textContent = '正在收入足迹…';
  }
  try {
    const image = await makeHistoryImage(state.image.src, 1080, 0.76);
    const entry = {
      id: makeId(),
      createdAt: new Date().toISOString(),
      image,
      imageName: state.image.name,
      sceneId: state.analysis.sceneId,
      sceneName: state.analysis.scene?.name || '',
      confidence: state.analysis.confidence,
      summary: state.analysis.summary,
      palette: state.analysis.palette,
      placeId: state.place && !state.place.isCoordinate && !state.place.isUnlocated ? state.place.id : null,
      placeName: activePlace().name,
      placeSnapshot: state.place || null,
      location: { ...state.location },
      placeMeta: state.placeMeta ? { ...state.placeMeta } : null,
      dialect: activeDialect().name,
      dialectId: state.dialect,
      momentDraft: state.momentDraft,
      momentStyle: state.momentStyle,
      momentSeed: state.momentSeed
    };
    const next = [entry, ...state.history].slice(0, MAX_HISTORY);
    let ok = persistHistory(next);
    while (!ok && next.length > 1) {
      next.pop();
      ok = persistHistory(next);
    }
    if (!ok) {
      toast('本机存储空间不足，无法保存足迹', 'error');
      if (button) {
        button.disabled = false;
        button.innerHTML = `${icon('plus')} 收进我的足迹`;
      }
      return;
    }
    state.history = next;
    state.savedMemoryId = entry.id;
    rerenderResult();
    toast('已收进足迹，只保存在这台设备');
  } catch (error) {
    console.error(error);
    toast('保存足迹失败，请重试', 'error');
    if (button) {
      button.disabled = false;
      button.innerHTML = `${icon('plus')} 收进我的足迹`;
    }
  }
}

function openHistoryEntry(id) {
  const entry = state.history.find((item) => item.id === id);
  if (!entry) return;
  stopSpeech();
  const place = entry.placeSnapshot || (entry.placeId ? placeById(entry.placeId) : null);
  state.image = {
    src: entry.image,
    name: entry.imageName || '足迹照片',
    width: null,
    height: null,
    size: 0,
    type: 'image/jpeg'
  };
  state.analysis = {
    scene: sceneById(entry.sceneId || 'mountain-green'),
    sceneId: entry.sceneId || 'mountain-green',
    confidence: entry.confidence || 0.8,
    summary: entry.summary || '',
    palette: entry.palette || [],
    candidates: [],
    metrics: {},
    dominantTone: ''
  };
  state.dialect = DIALECTS.some((d) => d.id === entry.dialectId) ? entry.dialectId : state.settings.dialect;
  state.dialectTouched = false;
  state.location = entry.location || { status: 'idle', lat: null, lon: null, accuracy: null, at: null };
  state.place = place;
  state.placeMeta = entry.placeMeta || { source: 'memory', match: 'memory', distanceKm: null, direction: '' };
  state.storyTab = 'history';
  state.narrationLang = 'mandarin';
  state.scriptOpen = false;
  state.momentStyle = entry.momentStyle || 'literary';
  state.momentSeed = entry.momentSeed || 0;
  state.momentDraft = entry.momentDraft !== undefined ? entry.momentDraft : null;
  state.savedMemoryId = entry.id;
  state.nearbyCandidates = [];
  buildNarrationState();
  state.view = 'result';
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function deleteHistoryEntry(id) {
  const next = state.history.filter((entry) => entry.id !== id);
  const ok = persistHistory(next);
  if (!ok) {
    toast('删除失败，请重试', 'error');
    return;
  }
  state.history = next;
  if (state.savedMemoryId === id) state.savedMemoryId = null;
  render();
  toast('已删除这段足迹');
}

function clearHistory() {
  if (!state.history.length) {
    toast('足迹已经是空的');
    return;
  }
  if (!window.confirm('确定清空全部足迹吗？这个操作不可撤销。')) return;
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
  state.history = [];
  state.savedMemoryId = null;
  closeSheet();
  if (state.view === 'history') render();
  if (state.view === 'result') rerenderResult();
  toast('足迹已清空');
}

function switchLang(lang) {
  if (lang !== 'mandarin' && lang !== 'dialect') return;
  if (state.narrationLang === lang) return;
  stopSpeech();
  state.narrationLang = lang;
  state.scriptOpen = false;
  rerenderResult();
}

function setDialect(id) {
  if (!DIALECTS.some((d) => d.id === id)) return;
  if (state.dialect === id) return;
  stopSpeech();
  state.dialect = id;
  state.dialectTouched = true;
  state.narrationLang = 'dialect';
  buildNarrationState();
  state.momentDraft = null;
  rerenderResult();
}

function chooseScene(id) {
  const scene = sceneById(id);
  if (!scene) return;
  stopSpeech();
  state.analysis = { ...state.analysis, scene, sceneId: scene.id, manuallyAdjusted: true };
  buildNarrationState();
  state.momentDraft = null;
  closeSheet();
  rerenderResult();
  toast(`已按「${scene.name}」重新解说`);
}

function openSettingsDefaultDialect(id) {
  if (!DIALECTS.some((d) => d.id === id)) return;
  state.settings.dialect = id;
  persistSettings();
  document.querySelectorAll('[data-action="set-default-dialect"]').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.dialect === id);
  });
  const label = document.querySelector('.settings-label span');
  if (label) label.textContent = dialectById(id).note;
  toast(`默认方言已设为 ${dialectById(id).name}`);
}

function toggleSetting(key) {
  if (!(key in state.settings)) return;
  state.settings[key] = !state.settings[key];
  persistSettings();
  document.querySelectorAll(`[data-action="toggle-setting"][data-setting="${key}"]`).forEach((el) => {
    el.setAttribute('aria-checked', String(state.settings[key]));
  });
  toast(state.settings[key] ? (key === 'autoLocate' ? '识别后将尝试自动定位' : '修图将保留题字') : '已关闭');
}

async function installApp() {
  if (!deferredInstallPrompt) {
    toast('请使用浏览器菜单「添加到主屏幕」；定位需要 HTTPS 或 localhost');
    return;
  }
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  toast(choice.outcome === 'accepted' ? '正在安装山河有声' : '已取消安装');
}

/* ------------------------------------------------------------------ */
/* global events                                                      */
/* ------------------------------------------------------------------ */

function onAction(event) {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  switch (action) {
    case 'home':
      stopSpeech();
      state.view = 'home';
      state.error = '';
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      break;
    case 'open-history':
      stopSpeech();
      state.view = 'history';
      render();
      window.scrollTo({ top: 0, behavior: 'instant' });
      break;
    case 'open-settings':
      openSettings();
      break;
    case 'close-overlay':
      closeSheet();
      break;
    case 'trigger-upload':
      document.getElementById('file-upload')?.click();
      break;
    case 'trigger-camera':
      document.getElementById('camera-upload')?.click();
      break;
    case 'demo':
      loadDemo(el.dataset.demo, { instant: false });
      break;
    case 'switch-lang':
      switchLang(el.dataset.lang);
      break;
    case 'set-dialect':
      setDialect(el.dataset.dialect);
      break;
    case 'toggle-script': {
      state.scriptOpen = !state.scriptOpen;
      const collapse = document.querySelector('.script-collapse');
      if (collapse) collapse.classList.toggle('is-open', state.scriptOpen);
      const button = document.querySelector('.script-toggle');
      if (button) {
        button.setAttribute('aria-expanded', String(state.scriptOpen));
        button.innerHTML = `${state.scriptOpen ? '收起' : `展开全文 · ${Math.max(0, (activeScript()?.paragraphs.length || 3) - 3)} 段`} ${icon('chevron')}`;
      }
      break;
    }
    case 'play-script':
      playScript();
      break;
    case 'copy-script':
      copyScript();
      break;
    case 'download-script':
      downloadScript();
      break;
    case 'story-tab':
      if (state.storyTab === el.dataset.tab) return;
      state.storyTab = el.dataset.tab;
      preserveScroll(() => render());
      break;
    case 'set-moment-style': {
      const style = el.dataset.style;
      if (state.momentStyle === style) return;
      state.momentStyle = style;
      state.momentDraft = null;
      state.momentSeed += 1;
      rerenderResult();
      break;
    }
    case 'refresh-moment':
      state.momentSeed += 1;
      state.momentDraft = null;
      rerenderResult();
      break;
    case 'copy-moment':
      copyMoment();
      break;
    case 'share-moment':
      shareMoment();
      break;
    case 'open-editor':
      openEditor();
      break;
    case 'download-photo':
      downloadPhoto();
      break;
    case 'locate':
      closeSheetIfOpen();
      locate();
      break;
    case 'open-place-picker':
      openPlacePicker();
      break;
    case 'choose-place':
      choosePlace(el.dataset.placeId);
      break;
    case 'use-coordinate':
      useCoordinatePlace();
      break;
    case 'open-scene-picker':
      openScenePicker();
      break;
    case 'choose-scene':
      chooseScene(el.dataset.sceneId);
      break;
    case 'save-memory':
      saveMemory();
      break;
    case 'open-history-entry':
      openHistoryEntry(el.dataset.historyId);
      break;
    case 'delete-history':
      event.stopPropagation();
      deleteHistoryEntry(el.dataset.historyId);
      break;
    case 'clear-history':
      clearHistory();
      break;
    case 'set-default-dialect':
      openSettingsDefaultDialect(el.dataset.dialect);
      break;
    case 'toggle-setting':
      toggleSetting(el.dataset.setting);
      break;
    case 'install-app':
      installApp();
      break;
    default:
      break;
  }
}

function closeSheetIfOpen() {
  if (state.overlay) closeSheet();
}

function onInput(event) {
  const target = event.target;
  if (target.id === 'place-search') {
    state.placeQuery = target.value;
    const results = document.getElementById('place-results');
    if (results) results.innerHTML = renderPlaceResults(target.value);
    return;
  }
  if (target.id === 'moment-text') {
    state.momentDraft = target.value;
    const count = document.getElementById('moment-count');
    if (count) {
      const hint = MOMENT_STYLES.find((s) => s.id === state.momentStyle)?.hint || '';
      count.textContent = `正文 ${countChars(target.value)} 字 · ${hint}`;
    }
    return;
  }
  if (target.id === 'settings-rate') {
    const value = Number(target.value);
    state.settings.rate = value;
    persistSettings();
    const valueEl = document.querySelector('.range-value');
    if (valueEl) valueEl.textContent = `${value.toFixed(1)}×`;
  }
}

function onChange(event) {
  const target = event.target;
  if (target.id === 'file-upload' || target.id === 'camera-upload') {
    const file = target.files?.[0];
    target.value = '';
    if (file) handleFile(file);
  }
  if (target.id === 'editor-watermark-toggle') {
    // 编辑器自行处理
  }
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    if (state.editorOpen) return;
    if (state.overlay) {
      closeSheet();
      return;
    }
  }
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[role="button"][data-action]')) {
    event.preventDefault();
    event.target.click();
  }
}

function setupDragAndDrop() {
  const zone = () => document.getElementById('dropzone');
  ['dragenter', 'dragover'].forEach((name) => {
    document.addEventListener(name, (event) => {
      const dropzone = zone();
      if (!dropzone) return;
      if (!event.target.closest('#dropzone')) return;
      event.preventDefault();
      dropzone.classList.add('is-dragging');
    });
  });
  ['dragleave', 'drop'].forEach((name) => {
    document.addEventListener(name, (event) => {
      const dropzone = zone();
      if (!dropzone) return;
      if (!event.target.closest('#dropzone')) return;
      event.preventDefault();
      dropzone.classList.remove('is-dragging');
    });
  });
  document.addEventListener('drop', (event) => {
    if (!event.target.closest('#dropzone')) return;
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });
}

function setupPWA() {
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((error) => console.warn('SW 注册失败', error));
    });
  }
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    toast('山河有声已安装到桌面');
  });
}

async function boot() {
  render();
  setupDragAndDrop();
  setupPWA();
  document.addEventListener('click', onAction);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', onKeydown);
  document.getElementById('overlay-root')?.addEventListener('click', (event) => {
    if (event.target.matches('[data-overlay-backdrop]')) closeSheet();
  });
  window.addEventListener('beforeunload', () => speech.stop());

  const params = new URLSearchParams(location.search);
  const demoId = params.get('demo');
  const instant = params.get('instant') === '1';
  if (demoId) {
    try {
      await loadDemo(demoId, { instant });
      const placeParam = params.get('place');
      if (placeParam) {
        const place = placeById(placeParam);
        if (place) {
          state.location = { status: 'found', lat: place.lat, lon: place.lon, accuracy: null, at: Date.now() };
          applyPlace(place, { source: 'demo', match: 'demo', distanceKm: null, direction: '' }, { resetTab: true });
          if (state.view === 'result') {
            render();
          }
        }
      }
    } catch (error) {
      console.error(error);
      state.error = '示例风景加载失败，请刷新页面或上传一张自己的照片。';
      state.view = 'error';
      render();
    }
  } else if (params.get('history') === '1' || location.hash === '#history') {
    state.view = 'history';
    render();
  }

  if (params.get('scene')) {
    const forced = sceneById(params.get('scene'));
    if (state.analysis && forced) {
      state.analysis = { ...state.analysis, scene: forced, sceneId: forced.id, manuallyAdjusted: true };
      buildNarrationState();
      if (state.view === 'result') render();
    }
  }

  if (params.get('debug') === '1') {
    window.__SHANHE_DEBUG__ = {
      state,
      analyze: analyzeImageData,
      buildNarration,
      buildMoment,
      resolvePlaceAt,
      openEditor,
      openSettings,
      openPlacePicker
    };
  }

  if (params.get('sheet') === 'settings') openSettings();
  if (params.get('sheet') === 'places') openPlacePicker();
  if (params.get('sheet') === 'scenes') openScenePicker();
  if (params.get('editor') === '1' && state.view === 'result') {
    openEditor();
  }
}

boot();
