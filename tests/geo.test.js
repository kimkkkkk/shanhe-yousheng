import test from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineKm,
  bearingDegrees,
  compassDirection,
  formatDistance,
  nearbyPlaces,
  resolvePlaceAt,
  coordinatePlace
} from '../src/logic/geo.js';

test('haversine distance is zero for same point', () => {
  assert.equal(haversineKm({ lat: 30.2, lon: 120.1 }, { lat: 30.2, lon: 120.1 }), 0);
});

test('Hangzhou to Shanghai is roughly 165 km', () => {
  const d = haversineKm({ lat: 30.2741, lon: 120.1551 }, { lat: 31.2304, lon: 121.4737 });
  assert.ok(d > 150 && d < 180, String(d));
});

test('bearing and compass direction', () => {
  const north = bearingDegrees({ lat: 30, lon: 120 }, { lat: 31, lon: 120 });
  assert.ok(Math.abs(north) < 0.5);
  assert.equal(compassDirection(0), '北');
  assert.equal(compassDirection(90), '东');
  assert.equal(compassDirection(180), '南');
  assert.equal(compassDirection(270), '西');
});

test('distance formatting is human readable', () => {
  assert.match(formatDistance(0.36), /米/);
  assert.equal(formatDistance(4.25), '4.3 公里');
  assert.equal(formatDistance(38.6), '39 公里');
});

test('West Lake coordinates match West Lake', () => {
  const resolved = resolvePlaceAt(30.243, 120.15);
  assert.equal(resolved.place.id, 'westlake');
  assert.equal(resolved.match, 'exact');
  assert.ok(resolved.distanceKm < 1);
});

test('a point 60 km from Huangshan is nearby, not exact', () => {
  // 约 0.55 纬度，约 61 公里
  const resolved = resolvePlaceAt(30.68, 118.167);
  assert.equal(resolved.match, 'nearby');
  assert.ok(resolved.distanceKm > 25);
  assert.equal(resolved.place.id, 'huangshan');
});

test('remote coordinates do not fabricate a specific place', () => {
  const resolved = resolvePlaceAt(0, 0);
  assert.equal(resolved.match, 'none');
  assert.equal(resolved.place, null);
});

test('nearest candidates are sorted by distance', () => {
  const list = nearbyPlaces(30.243, 120.15, 4);
  assert.equal(list.length, 4);
  for (let i = 1; i < list.length; i++) {
    assert.ok(list[i].distanceKm >= list[i - 1].distanceKm);
  }
});

test('coordinate fallback is honest and carries the nearest reference', () => {
  const nearest = nearbyPlaces(0, 0, 1)[0];
  const place = coordinatePlace(0, 0, nearest);
  assert.equal(place.isCoordinate, true);
  assert.equal(place.name, '此刻所在');
  assert.ok(place.intro.includes('0.0000°N'));
  assert.ok(place.intro.includes(nearest.place.name));
  assert.ok(place.poem.text.length > 0);
});
