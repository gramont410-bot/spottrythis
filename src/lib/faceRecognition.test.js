import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateFaceMatchScore } from './faceRecognition.js';

const makeDataUrl = (value) => `data:image/jpeg;base64,${Buffer.from(value).toString('base64')}`;

test('same face image should score high similarity', () => {
  const image = makeDataUrl('guard-face-01-' + 'a'.repeat(128));
  const score = estimateFaceMatchScore(image, image);
  assert.ok(score > 0.99, `Expected near-exact similarity, got ${score}`);
});

test('different face images should score lower similarity', () => {
  const imageA = makeDataUrl('guard-face-01-' + 'a'.repeat(128));
  const imageB = makeDataUrl('guard-face-99-' + 'b'.repeat(128));

  const score = estimateFaceMatchScore(imageA, imageB);
  assert.ok(score < 0.95, `Expected lower similarity for different images, got ${score}`);
});
