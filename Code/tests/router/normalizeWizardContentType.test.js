import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWizardContentType } from '../../src/router/normalizeWizardContentType.js';

// Найдено живой проверкой 2026-07-10: wizard Агента 1 предлагает 6 кнопок типа
// контента (post/video/photo/audio/reels/carousel, см. WIZARD_TYPE_KB в его
// telegram-bot/index.js), а routeByContentType понимает только
// text/image/video/audio — расхождение вызывало бесконечный retry-цикл
// ("unknown content_type \"post\"") каждые 30с поллинга.
test('maps wizard "post" to router "text"', () => {
  assert.equal(normalizeWizardContentType('post'), 'text');
});

test('maps wizard "photo" to router "image"', () => {
  assert.equal(normalizeWizardContentType('photo'), 'image');
});

test('maps wizard "reels" to router "video"', () => {
  assert.equal(normalizeWizardContentType('reels'), 'video');
});

test('passes already-correct router types through unchanged', () => {
  assert.equal(normalizeWizardContentType('video'), 'video');
  assert.equal(normalizeWizardContentType('audio'), 'audio');
});

test('passes unmapped types through unchanged (e.g. "carousel" — genuinely unsupported, not a naming mismatch)', () => {
  assert.equal(normalizeWizardContentType('carousel'), 'carousel');
});
