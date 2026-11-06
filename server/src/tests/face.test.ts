import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faceDistance, faceMatches } from '../services/face.service.js';

const v = (x: number) => Array.from({ length: 128 }, () => x);
test('face: identical descriptors match, distant ones do not', () => {
  assert.equal(faceDistance(v(0.1), v(0.1)), 0);
  assert.equal(faceMatches(v(0.1), v(0.1), 0.5), true);
  assert.equal(faceMatches(v(0.1), v(0.12), 0.5), true);  // small natural variation
  assert.equal(faceMatches(v(0.1), v(0.2), 0.5), false);  // distance = 0.1*sqrt(128) = 1.13
});
test('face: wrong-length descriptors never match', () => {
  assert.equal(faceMatches([1, 2, 3], [1, 2, 3], 0.5), false);
});
