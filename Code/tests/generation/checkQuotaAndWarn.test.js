import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDb } from '../helpers/fakeSupabase.js';
import { checkQuotaAndWarn } from '../../src/generation/generate.js';
import { DEFAULT_LIMIT_BYTES } from '../../src/quota/checkQuota.js';

test('returns null when total usage is under threshold', async () => {
  const db = makeFakeDb({
    generated_content: () => ({ data: [{ size_bytes: 1000 }], error: null })
  });

  assert.equal(await checkQuotaAndWarn(db), null);
});

test('returns a quota_warning shaped for notifyAgent1, including limitBytes, when over threshold', async () => {
  const db = makeFakeDb({
    generated_content: (state) => {
      if (state.filters.telegram_id) {
        // selectWarningCandidate's follow-up query for the candidate's own items
        return { data: [{ id: 'gc-1', type: 'video', r2_url: 'x', size_bytes: DEFAULT_LIMIT_BYTES, created_at: 't' }], error: null };
      }
      return { data: [{ telegram_id: 999, size_bytes: DEFAULT_LIMIT_BYTES }], error: null };
    }
  });

  const warning = await checkQuotaAndWarn(db);

  assert.equal(warning.telegramId, 999);
  assert.equal(warning.messageType, 'quota_warning');
  assert.equal(warning.payload.totalUsageBytes, DEFAULT_LIMIT_BYTES);
  assert.equal(warning.payload.userUsageBytes, DEFAULT_LIMIT_BYTES);
  // Найдено живой проверкой 2026-07-10: Агент 1 ожидал limit_bytes в payload,
  // но Агент 4 его никогда не отправлял (только жёсткая константа локально).
  assert.equal(warning.payload.limitBytes, DEFAULT_LIMIT_BYTES);
  assert.equal(warning.payload.items.length, 1);
});
