import { dialectById } from '../data/dialects.js';

export function estimateDuration(text, charsPerSecond = 4.4) {
  const chars = [...String(text || '').replace(/\s/g, '')].length;
  return Math.max(12, Math.round(chars / charsPerSecond + 4));
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function countChars(text) {
  return [...String(text || '').replace(/\s/g, '')].length;
}

/**
 * 普通话解说：画面 → 地点 → 历史 → 文化 → 诗与风物 → 收束。
 * 所有事实性内容只来自地方志数据，不虚构具体年代与人物。
 */
export function buildMandarinNarration({ scene, place, locationNote = '' }) {
  const poem = place.poem || { text: '', title: '', author: '' };
  const poemLine = poem.text
    ? `古人在这里留下过这样的句子：「${poem.text}」${
        poem.author ? `这是${poem.author}笔下的意境。` : ''
      }此刻再看眼前的光，才懂得文字为什么能穿过那么多年。`
    : '古诗里的山河，此刻就在眼前。';
  const taste = place.food ? `若有机会，也尝一尝${place.food}，那是这片土地另一种写法。` : '';
  const custom = place.custom ? ` ${place.custom}` : '';
  const note = locationNote ? ` ${locationNote}` : '';

  const paragraphs = [
    `此刻，你看见的是${scene.name}。${scene.visual}。${scene.light}。闭上眼听一听，${scene.sound}。`,
    `这里是${place.name}，${place.subtitle || place.province || '山河之间'}。${place.intro}${note}`,
    `把时间往回拨。${place.history}`,
    `山河养人，人也养山河。${place.culture}${custom}`,
    `${poemLine}${taste}`,
    `${scene.opening}${scene.closing}`
  ];

  const full = paragraphs.join('\n\n');
  return {
    locale: 'zh-CN',
    language: '普通话',
    title: `山河有声 · ${place.name}`,
    paragraphs,
    full,
    chars: countChars(full),
    duration: estimateDuration(full),
    voiceLabel: '普通话 · 标准女声/男声（取决于系统）'
  };
}

/**
 * 方言解说：保留同样的信息骨架，用方言语气、词汇与句尾重新组织。
 */
export function buildDialectNarration({ scene, place, dialectId, locationNote = '' }) {
  const dialect = dialectById(dialectId);
  const poem = place.poem || { text: '', title: '', author: '' };
  const paragraphs = dialect.compose({ scene, place, poem });
  if (locationNote) paragraphs.splice(2, 0, `顺便说一句，${locationNote}`);
  const full = paragraphs.join('\n\n');
  return {
    locale: dialect.locale,
    language: dialect.name,
    dialectId: dialect.id,
    dialectName: dialect.name,
    dialectNote: dialect.note,
    title: `${dialect.name}版 · ${place.name}`,
    paragraphs,
    full,
    chars: countChars(full),
    duration: estimateDuration(full, 4.2),
    voiceLabel: `${dialect.name}语音（需系统语音包，缺失时以普通话代读）`
  };
}

export function buildNarration({ scene, place, dialectId, locationNote = '' }) {
  return {
    mandarin: buildMandarinNarration({ scene, place, locationNote }),
    dialect: buildDialectNarration({ scene, place, dialectId, locationNote }),
    generatedAt: new Date().toISOString()
  };
}

export function narrationToText(narration, { scene, place, includeBoth = true }) {
  const lines = [
    `山河有声 · ${place.name}`,
    `${scene.name} · ${new Date().toLocaleDateString('zh-CN')}`,
    '',
    '—— 普通话解说 ——',
    '',
    narration.mandarin.full
  ];
  if (includeBoth) {
    lines.push('', `—— ${narration.dialect.dialectName}解说 ——`, '', narration.dialect.full);
  }
  lines.push('', '由「山河有声」根据照片与地方志生成。照片仅在本机处理。');
  return lines.join('\n');
}

/** 将长文本切成适合 SpeechSynthesis 的短句，避免部分浏览器超时截断 */
export function splitForSpeech(text, maxLen = 58) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const sentences = cleaned.split(/(?<=[。！？!?；;…])/g).map((s) => s.trim()).filter(Boolean);
  const chunks = [];
  for (const sentence of sentences) {
    if (sentence.length <= maxLen) {
      chunks.push(sentence);
      continue;
    }
    for (let i = 0; i < sentence.length; i += maxLen) {
      chunks.push(sentence.slice(i, i + maxLen));
    }
  }
  return chunks;
}
