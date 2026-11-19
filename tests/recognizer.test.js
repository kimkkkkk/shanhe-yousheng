import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeImageData, rgbToHsv, bytesToHex } from '../src/logic/recognizer.js';

function makeImage(width, height, painter) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = painter(x, y, width, height);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { data, width, height };
}

test('rgbToHsv and bytesToHex basics', () => {
  const red = rgbToHsv(255, 0, 0);
  assert.equal(Math.round(red.h), 0);
  assert.equal(red.s, 1);
  assert.equal(red.v, 1);
  const blue = rgbToHsv(0, 0, 255);
  assert.equal(Math.round(blue.h), 240);
  assert.equal(bytesToHex(255, 128, 0), '#ff8000');
});

test('blue sky over green hills reads as mountain/grass landscape', () => {
  const img = makeImage(180, 120, (x, y, w, h) => {
    if (y < h * 0.42) return [139, 183, 218];
    if (y < h * 0.7) return [85, 122, 88];
    return [39, 76, 51];
  });
  const result = analyzeImageData(img, { filename: 'mountain.jpg' });
  assert.ok(['mountain-green', 'grassland', 'forest'].includes(result.sceneId), result.sceneId);
  assert.ok(result.confidence >= 0.52 && result.confidence <= 0.97);
  assert.equal(result.candidates.length, 4);
  assert.equal(result.metrics.width, 180);
  assert.ok(result.metrics.skyRatio > 0.2, JSON.stringify(result.metrics));
  assert.equal(result.palette.length, 3);
});

test('blue lower half is recognised as water', () => {
  const img = makeImage(160, 120, (x, y, w, h) => {
    if (y < h * 0.45) return [177, 205, 217];
    if (y < h * 0.52) return [88, 125, 109];
    return [58, 117, 138];
  });
  const result = analyzeImageData(img, { filename: 'lake.png' });
  assert.ok(['lake-mirror', 'coast'].includes(result.sceneId), `${result.sceneId} ${JSON.stringify(result.metrics)}`);
  assert.ok(result.metrics.waterRatio > 0.2, JSON.stringify(result.metrics));
});

test('warm sunset sky wins over green landscape', () => {
  const img = makeImage(160, 120, (x, y, w, h) => {
    if (y < h * 0.55) return [216, 105, 57];
    if (y < h * 0.7) return [127, 75, 61];
    return [41, 43, 36];
  });
  const result = analyzeImageData(img, { filename: 'sunset.jpg' });
  assert.equal(result.sceneId, 'sunset');
  assert.ok(result.metrics.warmRatio > 0.5);
});

test('desert sand and warm stone is recognised', () => {
  const img = makeImage(160, 120, (x, y, w, h) => {
    if (y < h * 0.25) return [188, 205, 212];
    if (y < h * 0.55) return [224, 180, 112];
    return [165, 111, 58];
  });
  const result = analyzeImageData(img, { filename: 'dune.jpg' });
  assert.ok(['desert', 'sunset'].includes(result.sceneId), result.sceneId);
  assert.ok(result.metrics.sandRatio > 0.3);
});

test('filename hint can disambiguate low-information images', () => {
  const flat = makeImage(30, 30, () => [150, 150, 150]);
  const without = analyzeImageData(flat, { filename: 'image.jpg' });
  const withHint = analyzeImageData(flat, { filename: 'snow-mountain.jpg' });
  assert.notEqual(without.sceneId, 'snow');
  assert.equal(withHint.sceneId, 'snow');
});

test('invalid image data is rejected', () => {
  assert.throws(() => analyzeImageData({ data: new Uint8ClampedArray(0), width: 10, height: 10 }), /无效/);
  assert.throws(() => analyzeImageData({ data: new Uint8ClampedArray(16), width: 1, height: 1 }), /透明/);
});
