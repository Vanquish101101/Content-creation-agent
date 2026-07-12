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

test('routes "video" to a working generator function using deps.video (not deps.image)', () => {
  const generate = routeByContentType('video', {
    image: { apiKey: 'runway-key', r2: {} },
    video: { apiKey: 'minimax-key', r2: {} }
  });

  assert.equal(typeof generate, 'function');
});

test('routes "audio" to a working generator function using deps.audio (not deps.video)', () => {
  const generate = routeByContentType('audio', {
    video: { apiKey: 'minimax-key', r2: {} },
    audio: { deepgramApiKey: 'd', elevenLabsApiKey: 'e', elevenLabsVoiceId: 'v', r2: {} }
  });

  assert.equal(typeof generate, 'function');
});

test('routes "carousel" to a working generator function using deps.carousel (not deps.image)', () => {
  // carousel добавлен 2026-07-11 — до этого был единственным примером
  // "truly unknown" content_type в этом файле тестов.
  const generate = routeByContentType('carousel', {
    image: { apiKey: 'runway-key', r2: {} },
    carousel: { apiKey: 'runway-key-2', r2: {} }
  });

  assert.equal(typeof generate, 'function');
});

test('throws for an unknown content type', () => {
  // text/image/video/audio/carousel (весь MVP-скоп из «04. Брейншторм», §1,
  // плюс carousel добавлен 2026-07-11) теперь реализованы — "not implemented
  // yet" больше не подходящая формулировка ни для одного реального типа
  // контента, только для truly unknown.
  assert.throws(() => routeByContentType('reels-story-highlight', {}), /unknown content_type/);
});
