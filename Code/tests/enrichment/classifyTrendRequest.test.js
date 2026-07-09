import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wantsTrendEnrichment } from '../../src/enrichment/classifyTrendRequest.js';

test('returns true when description explicitly mentions trends (RU)', () => {
  assert.equal(wantsTrendEnrichment('Сделай пост в трендовом стиле, как сейчас заходит в тиктоке'), true);
});

test('returns true when description explicitly mentions trends (EN)', () => {
  assert.equal(wantsTrendEnrichment('Make it trendy, like what is going viral right now'), true);
});

test('returns true for "как у популярных блогеров" style requests', () => {
  assert.equal(wantsTrendEnrichment('Хочу текст в стиле как у популярных блогеров, что сейчас выстреливает'), true);
});

test('returns false for a plain description with no trend language', () => {
  assert.equal(wantsTrendEnrichment('Короткий пост про скидку 20% на услуги'), false);
});

test('returns false for an empty or missing description', () => {
  assert.equal(wantsTrendEnrichment(''), false);
  assert.equal(wantsTrendEnrichment(undefined), false);
});

test('is case-insensitive', () => {
  assert.equal(wantsTrendEnrichment('ТРЕНДОВЫЙ ролик'), true);
});
