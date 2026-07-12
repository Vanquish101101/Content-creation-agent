import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrendParts } from '../../src/generation/buildTrendParts.js';

test('returns an empty array for null/undefined trendContext', () => {
  assert.deepEqual(buildTrendParts(null), []);
  assert.deepEqual(buildTrendParts(undefined), []);
});

test('returns an empty array when all fields are empty/missing', () => {
  assert.deepEqual(buildTrendParts({ hooks: [], triggers: [] }), []);
});

test('includes only non-empty fields, in a stable label order', () => {
  const parts = buildTrendParts({
    content_ideas: ['до/после'],
    hooks: ['Ты не поверишь...']
  });

  assert.deepEqual(parts, [
    'хук (открывающая фраза, похожий стиль): Ты не поверишь...',
    'идеи подачи: до/после'
  ]);
});

test('joins multiple values within one field with "; "', () => {
  const parts = buildTrendParts({ triggers: ['срочность', 'дефицит'] });
  assert.deepEqual(parts, ['триггеры вовлечения: срочность; дефицит']);
});

test('includes all five fields when all are present', () => {
  const parts = buildTrendParts({
    hooks: ['h'],
    triggers: ['t'],
    offers: ['o'],
    viral_reasons: ['v'],
    content_ideas: ['c']
  });
  assert.equal(parts.length, 5);
});
