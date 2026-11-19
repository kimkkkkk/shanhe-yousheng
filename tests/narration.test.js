import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneById } from '../src/data/scenes.js';
import { placeById } from '../src/data/places.js';
import { DIALECTS } from '../src/data/dialects.js';
import {
  buildNarration,
  buildMandarinNarration,
  buildDialectNarration,
  narrationToText,
  splitForSpeech,
  estimateDuration,
  formatDuration,
  countChars
} from '../src/logic/narration.js';

const scene = sceneById('lake-mirror');
const place = placeById('westlake');

test('mandarin narration includes scene, place, history, poem and closing', () => {
  const narration = buildMandarinNarration({ scene, place });
  assert.equal(narration.language, '普通话');
  assert.equal(narration.paragraphs.length, 6);
  assert.ok(narration.full.includes('湖光山色'));
  assert.ok(narration.full.includes('西湖'));
  assert.ok(narration.full.includes('苏轼'));
  assert.ok(narration.chars > 300);
  assert.ok(narration.duration > 30);
});

test('dialect narration differs and carries dialect markers', () => {
  const sichuan = buildDialectNarration({ scene, place, dialectId: 'sichuan' });
  const yue = buildDialectNarration({ scene, place, dialectId: 'yue' });
  assert.equal(sichuan.dialectName, '四川话');
  assert.ok(sichuan.full.includes('巴适') || sichuan.full.includes('摆龙门阵'));
  assert.ok(yue.full.includes('而家') || yue.full.includes('嘅'));
  assert.notEqual(sichuan.full, yue.full);
});

test('every dialect composes a non-empty script for every core place', () => {
  for (const dialect of DIALECTS) {
    const script = buildDialectNarration({ scene, place, dialectId: dialect.id });
    assert.ok(script.paragraphs.length >= 6, dialect.id);
    assert.ok(script.chars > 250, dialect.id);
    assert.ok(!script.full.includes('undefined'), dialect.id);
  }
});

test('location note is threaded into both language versions', () => {
  const narration = buildNarration({
    scene,
    place,
    dialectId: 'wu',
    locationNote: '定位显示你距离西湖约 38 公里。'
  });
  assert.ok(narration.mandarin.full.includes('38 公里'));
  assert.ok(narration.dialect.full.includes('38 公里'));
});

test('narration text export contains both versions and attribution', () => {
  const narration = buildNarration({ scene, place, dialectId: 'sichuan' });
  const text = narrationToText(narration, { scene, place });
  assert.ok(text.includes('普通话解说'));
  assert.ok(text.includes('四川话解说'));
  assert.ok(text.includes('照片仅在本机处理'));
});

test('duration estimate and formatting', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(125), '02:05');
  assert.ok(estimateDuration('一'.repeat(440)) >= 60);
  assert.equal(countChars(' 一 二\n三 '), 3);
});

test('speech chunking keeps chunks short and loses no text', () => {
  const text = '第一句很短。第二句也不长！第三句稍微长一点，但仍然可以被切开；最后一句结束。';
  const chunks = splitForSpeech(text, 12);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 12));
  const merged = chunks.join('');
  assert.equal(merged.replace(/\s/g, ''), text.replace(/\s/g, ''));
});
