import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrendContextFromSearchRaw } from '../../src/enrichment/buildTrendContextFromSearchRaw.js';

test('returns null for null/undefined raw', () => {
  assert.equal(buildTrendContextFromSearchRaw(null), null);
  assert.equal(buildTrendContextFromSearchRaw(undefined), null);
});

test('returns null when there is nothing usable in any source', () => {
  assert.equal(buildTrendContextFromSearchRaw({ perplexity: {}, youtube: [], firecrawl: [] }), null);
});

test('builds content_ideas from perplexity summary', () => {
  const result = buildTrendContextFromSearchRaw({ perplexity: { summary: 'Reels до 3 минут — новый формат Instagram' } });
  assert.deepEqual(result, { content_ideas: ['Reels до 3 минут — новый формат Instagram'] });
});

test('builds content_ideas from youtube video titles', () => {
  const result = buildTrendContextFromSearchRaw({
    youtube: [{ title: 'Как вырасти на Reels в 2026' }, { title: 'Тренды Instagram' }, { url: 'no-title-here' }]
  });
  assert.deepEqual(result, { content_ideas: ['Как вырасти на Reels в 2026', 'Тренды Instagram'] });
});

test('builds content_ideas from firecrawl page titles', () => {
  const result = buildTrendContextFromSearchRaw({ firecrawl: [{ title: 'Гайд по алгоритму Instagram' }] });
  assert.deepEqual(result, { content_ideas: ['Гайд по алгоритму Instagram'] });
});

test('combines all three sources and caps at 5 ideas', () => {
  const raw = {
    perplexity: { summary: 'S' },
    youtube: [{ title: 'Y1' }, { title: 'Y2' }, { title: 'Y3' }],
    firecrawl: [{ title: 'F1' }, { title: 'F2' }]
  };
  const result = buildTrendContextFromSearchRaw(raw);
  assert.equal(result.content_ideas.length, 5);
  assert.deepEqual(result.content_ideas, ['S', 'Y1', 'Y2', 'Y3', 'F1']);
});
