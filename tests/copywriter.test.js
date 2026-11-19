import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneById } from '../src/data/scenes.js';
import { placeById } from '../src/data/places.js';
import { buildMoment, buildMomentSet, MOMENT_STYLES } from '../src/logic/copywriter.js';

const scene = sceneById('mountain-green');
const place = placeById('huangshan');

test('four moment styles all produce copy and tags', () => {
  const set = buildMomentSet({ scene, place, seed: 3 });
  assert.equal(set.length, 4);
  assert.deepEqual(set.map((item) => item.style), MOMENT_STYLES.map((item) => item.id));
  for (const moment of set) {
    assert.ok(moment.text.length > 20, moment.style);
    assert.ok(moment.full.includes('#山河有声'), moment.style);
    assert.ok(!moment.text.includes('undefined'), moment.style);
    assert.ok(moment.chars > 0);
  }
});

test('generation is deterministic for the same seed', () => {
  const a = buildMoment({ scene, place, style: 'literary', seed: 7 });
  const b = buildMoment({ scene, place, style: 'literary', seed: 7 });
  const c = buildMoment({ scene, place, style: 'literary', seed: 8 });
  assert.equal(a.text, b.text);
  assert.notEqual(a.text, c.text);
});

test('guide copy includes practical fields from place data', () => {
  const moment = buildMoment({ scene, place, style: 'guide', seed: 0 });
  assert.ok(moment.text.includes('看点'));
  assert.ok(moment.text.includes('机位'));
  assert.ok(moment.text.includes(place.food.split('、')[0]));
  assert.ok(moment.text.includes('最佳'));
});

test('classic style quotes the place poem', () => {
  const moment = buildMoment({ scene, place, style: 'classic', seed: 0 });
  assert.ok(moment.text.includes(place.poem.text));
  assert.ok(moment.text.includes(place.poem.author));
});

test('place name and scene keywords appear in the copy', () => {
  for (const item of buildMomentSet({ scene, place, seed: 2 })) {
    assert.ok(item.full.includes('黄山') || item.text.includes('山河'), item.style);
  }
});
