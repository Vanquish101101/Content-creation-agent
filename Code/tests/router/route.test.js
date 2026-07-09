import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeByContentType } from '../../src/router/route.js';

test('routes "text" to a working generator function', () => {
  const generate = routeByContentType('text', { apiKey: 'test-key', fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });

  assert.equal(typeof generate, 'function');
});

test('throws a descriptive not-implemented error for "image"', () => {
  assert.throws(() => routeByContentType('image', {}), /not implemented yet/);
});

test('throws a descriptive not-implemented error for "video"', () => {
  assert.throws(() => routeByContentType('video', {}), /not implemented yet/);
});

test('throws a descriptive not-implemented error for "audio"', () => {
  assert.throws(() => routeByContentType('audio', {}), /not implemented yet/);
});

test('throws for an unknown content type', () => {
  assert.throws(() => routeByContentType('carousel', {}), /not implemented yet/);
});
