import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACES, PLACE_MAP, searchPlaces } from '../src/data/places.js';
import { SCENE_MAP } from '../src/data/scenes.js';
import { DIALECT_MAP } from '../src/data/dialects.js';

test('at least 50 places with complete editorial fields', () => {
  assert.ok(PLACES.length >= 50, String(PLACES.length));
  for (const place of PLACES) {
    assert.ok(place.id && place.name, 'id/name');
    assert.ok(place.lat >= 18 && place.lat <= 54, `${place.id} lat`);
    assert.ok(place.lon >= 73 && place.lon <= 135, `${place.id} lon`);
    assert.ok(place.history.length > 30, `${place.id} history`);
    assert.ok(place.culture.length > 25, `${place.id} culture`);
    assert.ok(place.intro.length > 25, `${place.id} intro`);
    assert.ok(place.poem?.text, `${place.id} poem`);
    assert.ok(Array.isArray(place.sceneAffinity) && place.sceneAffinity.length > 0, `${place.id} scenes`);
    if (place.recommendedDialect) assert.ok(DIALECT_MAP[place.recommendedDialect], `${place.id} dialect`);
  }
});

test('all ids unique, map complete', () => {
  const ids = new Set(PLACES.map((p) => p.id));
  assert.equal(ids.size, PLACES.length);
  for (const place of PLACES) assert.equal(PLACE_MAP[place.id], place);
});

test('scene affinities point at real scenes', () => {
  for (const place of PLACES) {
    for (const id of place.sceneAffinity) assert.ok(SCENE_MAP[id], `${place.id} -> ${id}`);
  }
});

test('search matches Chinese names, province and pinyin aliases', () => {
  assert.equal(searchPlaces('西湖')[0].id, 'westlake');
  assert.ok(searchPlaces('杭州').some((p) => p.id === 'westlake'));
  assert.ok(searchPlaces('huangshan').some((p) => p.id === 'huangshan'));
  assert.ok(searchPlaces('浙江').length >= 2);
  assert.equal(searchPlaces('不存在的火星地名').length, 0);
});

test('search limit is respected', () => {
  assert.equal(searchPlaces('', 5).length, 5);
  assert.ok(searchPlaces('山', 3).length <= 3);
});
