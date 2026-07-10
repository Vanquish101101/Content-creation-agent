import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDb } from '../helpers/fakeSupabase.js';
import { getTotalUsageBytes, getUsageByUser } from '../../src/quota/storageUsage.js';

test('getTotalUsageBytes sums size_bytes across done rows, treating null as 0', async () => {
  const db = makeFakeDb({
    generated_content: (state) => {
      assert.equal(state.filters.status, 'done');
      return {
        data: [{ size_bytes: 1000 }, { size_bytes: 2000 }, { size_bytes: null }],
        error: null
      };
    }
  });

  const total = await getTotalUsageBytes(db);

  assert.equal(total, 3000);
});

test('getTotalUsageBytes returns 0 when there are no rows', async () => {
  const db = makeFakeDb({ generated_content: () => ({ data: [], error: null }) });

  assert.equal(await getTotalUsageBytes(db), 0);
});

test('getTotalUsageBytes throws on a database error', async () => {
  const db = makeFakeDb({ generated_content: () => ({ data: null, error: { message: 'connection reset' } }) });

  await assert.rejects(() => getTotalUsageBytes(db), /connection reset/);
});

test('getUsageByUser groups by telegram_id, sums size_bytes, sorts heaviest first', async () => {
  const db = makeFakeDb({
    generated_content: () => ({
      data: [
        { telegram_id: 1, size_bytes: 1000 },
        { telegram_id: 2, size_bytes: 5000 },
        { telegram_id: 1, size_bytes: 2000 },
        { telegram_id: 2, size_bytes: 500 }
      ],
      error: null
    })
  });

  const usage = await getUsageByUser(db);

  assert.deepEqual(usage, [
    { telegramId: 2, totalBytes: 5500 },
    { telegramId: 1, totalBytes: 3000 }
  ]);
});

test('getUsageByUser skips users whose usage is entirely null (e.g. text-only)', async () => {
  const db = makeFakeDb({
    generated_content: () => ({
      data: [
        { telegram_id: 1, size_bytes: null },
        { telegram_id: 2, size_bytes: 800 }
      ],
      error: null
    })
  });

  const usage = await getUsageByUser(db);

  assert.deepEqual(usage, [{ telegramId: 2, totalBytes: 800 }]);
});
