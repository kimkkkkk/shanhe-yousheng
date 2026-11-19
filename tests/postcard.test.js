import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENES } from '../src/data/scenes.js';
import {
  POSTCARD_COPY,
  buildPostcardCopy,
  countEnglishWords,
  normalizePostcardText,
  validatePostcardTitle,
  validatePostcardCaption
} from '../src/data/postcard-copy.js';
import {
  POSTCARD_SIZES,
  POSTCARD_STYLE,
  derivePostcardPalette
} from '../src/logic/postcard.js';

test('postcard sizes are exactly 2:3', () => {
  assert.equal(POSTCARD_SIZES.preview.width * 3, POSTCARD_SIZES.preview.height * 2);
  assert.equal(POSTCARD_SIZES.print.width * 3, POSTCARD_SIZES.print.height * 2);
  assert.equal(POSTCARD_SIZES.print.width, 2160);
  assert.equal(POSTCARD_SIZES.print.height, 3240);
  assert.equal(POSTCARD_STYLE.paper, '#F3EDE1');
});

test('every scene has four valid postcard copy variants', () => {
  for (const scene of SCENES) {
    const entry = POSTCARD_COPY[scene.id];
    assert.ok(entry, `missing copy for ${scene.id}`);
    assert.equal(entry.titles.length, 4, scene.id);
    assert.equal(entry.captions.length, 4, scene.id);
    for (const title of entry.titles) {
      const words = countEnglishWords(title);
      assert.ok(words >= 2 && words <= 5, `${scene.id}: ${title} (${words})`);
      assert.match(title, /^[A-Z]/, `${scene.id}: ${title}`);
      assert.ok(!/[.!?]/.test(title), `${scene.id}: ${title}`);
    }
    for (const caption of entry.captions) {
      const words = countEnglishWords(caption);
      assert.ok(words >= 6 && words <= 12, `${scene.id}: ${caption} (${words})`);
      assert.equal(caption, caption.toLowerCase(), `${scene.id}: ${caption}`);
      assert.ok(!/[.!?]/.test(caption), `${scene.id}: ${caption}`);
    }
  }
});

test('copy selection is deterministic and cycles through variants', () => {
  const first = buildPostcardCopy('lake-mirror', 0);
  const second = buildPostcardCopy('lake-mirror', 0);
  const third = buildPostcardCopy('lake-mirror', 1);
  assert.deepEqual(first, second);
  assert.notEqual(first.title, third.title);
  assert.equal(first.sceneId, 'lake-mirror');
});

test('unknown scenes use the mountain fallback', () => {
  const copy = buildPostcardCopy('not-a-scene', 2);
  assert.equal(copy.sceneId, 'mountain-green');
  assert.ok(copy.title.length > 0);
  assert.ok(copy.caption.length > 0);
});

test('title and caption validation reports useful word counts', () => {
  assert.equal(validatePostcardTitle('Still Water Morning').valid, true);
  assert.equal(validatePostcardTitle('Lake').valid, false);
  assert.equal(validatePostcardTitle('A Very Long Title That Should Not Fit Here').valid, false);
  assert.equal(validatePostcardCaption('a quiet lake before the wind rises').valid, true);
  assert.equal(validatePostcardCaption('too short').valid, false);
  assert.equal(
    validatePostcardCaption('this caption is intentionally much longer than twelve words so it should fail validation').valid,
    false
  );
});

test('copy text is normalized without changing meaning', () => {
  assert.equal(normalizePostcardText('  Still   Water\nMorning  '), 'Still Water Morning');
  assert.equal(normalizePostcardText('x'.repeat(100), 10).length, 10);
});

test('postcard palette always produces usable hex colors', () => {
  const scene = SCENES.find((item) => item.id === 'lake-mirror');
  const palette = derivePostcardPalette(
    { palette: ['#6d8b87', '#d7b88f', '#f2e5cc'], metrics: { warmRatio: 0.3 } },
    scene
  );
  for (const value of Object.values(palette)) {
    assert.match(value, /^#[0-9a-f]{6}$/i);
  }
});
