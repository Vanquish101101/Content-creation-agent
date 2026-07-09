import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeByContentType } from '../../src/router/route.js';

test('routes "text" to a working generator function using deps.text', () => {
  const generate = routeByContentType('text', {
    text: { apiKey: 'openrouter-key', fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }
  });

  assert.equal(typeof generate, 'function');
});

test('routes "image" to a working generator function using deps.image (not deps.text)', () => {
  const generate = routeByContentType('image', {
    text: { apiKey: 'openrouter-key' },
    image: { apiKey: 'runway-key', r2: {} }
  });

  assert.equal(typeof generate, 'function');
});

test('does not leak deps.text.apiKey into the image cascade', () => {
  // Регрессия: раньше routeByContentType передавал один и тот же плоский
  // объект deps во все каскады — ключ OpenRouter случайно оказался бы
  // ключом Runway. Теперь deps namespaced по типу контента.
  assert.throws(
    () => routeByContentType('image', { text: { apiKey: 'openrouter-key' } }),
    /apiKey is required/
  );
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
