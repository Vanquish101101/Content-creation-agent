import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOverThreshold, DEFAULT_LIMIT_BYTES } from '../../src/quota/checkQuota.js';

test('isOverThreshold is false well below the default 90% threshold of 10 GB', () => {
  assert.equal(isOverThreshold(1 * 1024 ** 3), false); // 1 GB
});

test('isOverThreshold is true at exactly 90% of the default 10 GB limit', () => {
  assert.equal(isOverThreshold(DEFAULT_LIMIT_BYTES * 0.9), true);
});

test('isOverThreshold is true when over the default limit entirely', () => {
  assert.equal(isOverThreshold(DEFAULT_LIMIT_BYTES * 1.1), true);
});

test('isOverThreshold accepts a custom limitBytes/thresholdRatio', () => {
  assert.equal(isOverThreshold(50, { limitBytes: 100, thresholdRatio: 0.5 }), true);
  assert.equal(isOverThreshold(40, { limitBytes: 100, thresholdRatio: 0.5 }), false);
});
