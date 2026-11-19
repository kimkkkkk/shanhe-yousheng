import { splitForSpeech } from './narration.js';

/**
 * 轻量语音朗读器：浏览器原生 SpeechSynthesis，不请求外部接口。
 * 方言能否读出，取决于用户系统安装的语音包；找不到则诚实降级为普通话。
 */
export class SpeechPlayer {
  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.voices = [];
    this.token = 0;
    this.active = false;
    this.rate = 1;
    this.current = null;
    this.refreshVoices = this.refreshVoices.bind(this);
    if (this.synth) {
      this.refreshVoices();
      if (typeof this.synth.addEventListener === 'function') {
        this.synth.addEventListener('voiceschanged', this.refreshVoices);
      }
    }
  }

  get supported() {
    return Boolean(this.synth && typeof window.SpeechSynthesisUtterance === 'function');
  }

  refreshVoices() {
    if (!this.synth) return;
    try {
      this.voices = this.synth.getVoices() || [];
    } catch {
      this.voices = [];
    }
  }

  voicesFor(locale) {
    const base = String(locale || 'zh-CN').toLowerCase();
    const lang = base.split('-')[0];
    return this.voices.filter((v) => {
      const vl = String(v.lang || '').toLowerCase().replace('_', '-');
      return vl === base || vl.startsWith(lang);
    });
  }

  pickVoice(locale, hint) {
    const candidates = this.voicesFor(locale);
    if (!candidates.length) return null;
    if (hint) {
      const hinted = candidates.find((v) => hint.test(`${v.name} ${v.voiceURI} ${v.lang}`));
      if (hinted) return hinted;
    }
    const exact = candidates.find((v) => v.lang?.toLowerCase().replace('_', '-') === String(locale).toLowerCase());
    return exact || candidates[0] || null;
  }

  stop() {
    this.token++;
    this.active = false;
    this.current = null;
    if (this.synth) {
      try {
        this.synth.cancel();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * @param {string} text
   * @param {{locale?:string, voiceHint?:RegExp, rate?:number, onStart?:Function, onProgress?:Function, onEnd?:Function, onError?:Function}} opts
   */
  play(text, opts = {}) {
    this.stop();
    const chunks = splitForSpeech(text, 54);
    if (!chunks.length) {
      opts.onError?.(new Error('没有可朗读的文本'));
      return false;
    }
    if (!this.supported) {
      opts.onError?.(new Error('当前浏览器不支持语音朗读'));
      return false;
    }
    this.refreshVoices();
    const token = ++this.token;
    this.active = true;
    const voice = this.pickVoice(opts.locale, opts.voiceHint);
    const rate = Math.min(1.5, Math.max(0.7, Number(opts.rate) || 1));
    this.current = { total: chunks.length, index: 0 };
    let started = false;

    const speakAt = (index) => {
      if (token !== this.token) return;
      if (index >= chunks.length) {
        this.active = false;
        this.current = null;
        opts.onEnd?.();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      utterance.lang = opts.locale || 'zh-CN';
      utterance.rate = rate;
      utterance.pitch = 1.02;
      utterance.volume = 1;
      if (voice) utterance.voice = voice;
      utterance.onstart = () => {
        if (token !== this.token) return;
        if (!started) {
          started = true;
          opts.onStart?.({ voice: voice?.name || '', total: chunks.length });
        }
        this.current = { total: chunks.length, index: index + 1 };
        opts.onProgress?.({ index: index + 1, total: chunks.length });
      };
      utterance.onend = () => {
        if (token !== this.token) return;
        speakAt(index + 1);
      };
      utterance.onerror = (event) => {
        if (token !== this.token) return;
        if (event.error === 'interrupted' || event.error === 'canceled') return;
        this.active = false;
        this.current = null;
        opts.onError?.(new Error(event.error === 'not-allowed' ? '朗读被浏览器拦截' : `语音合成失败：${event.error || '未知错误'}`));
      };
      try {
        this.synth.speak(utterance);
      } catch (error) {
        this.active = false;
        this.current = null;
        opts.onError?.(error);
      }
    };

    // Chrome 在某些情况下会吞掉第一段，给一个极短的调度延迟
    setTimeout(() => speakAt(0), 40);
    return true;
  }
}
