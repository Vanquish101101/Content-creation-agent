import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDb } from '../helpers/fakeSupabase.js';
import { selectWarningCandidate } from '../../src/quota/selectWarningCandidate.js';

test('returns null when there is no usage (nobody to warn)', async () => {
  const db = makeFakeDb({});

  const candidate = await selectWarningCandidate(db, []);

  assert.equal(candidate, null);
});

test('picks the heaviest user (first entry, usageByUser is pre-sorted) and fetches their content oldest-first', async () => {
  const db = makeFakeDb({
    generated_content: (state) => {
      assert.equal(state.filters.telegram_id, 999);
      assert.equal(state.filters.status, 'done');
      return {
        data: [
          { id: 'gc-1', type: 'video', r2_url: '999/1-video.mp4', size_bytes: 4000, created_at: '2026-07-01T00:00:00Z' },
          { id: 'gc-2', type: 'image', r2_url: '999/2-image.png', size_bytes: 1500, created_at: '2026-07-05T00:00:00Z' }
        ],
        error: null
      };
    }
  });
  const usageByUser = [
    { telegramId: 999, totalBytes: 5500 },
    { telegramId: 1, totalBytes: 100 }
  ];

  const candidate = await selectWarningCandidate(db, usageByUser);

  assert.equal(candidate.telegramId, 999);
  assert.equal(candidate.totalBytes, 5500);
  assert.equal(candidate.items.length, 2);
  assert.equal(candidate.items[0].id, 'gc-1');
});

test('throws on a database error', async () => {
  const db = makeFakeDb({ generated_content: () => ({ data: null, error: { message: 'connection reset' } }) });

  await assert.rejects(
    () => selectWarningCandidate(db, [{ telegramId: 1, totalBytes: 100 }]),
    /connection reset/
  );
});
