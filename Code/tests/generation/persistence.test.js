import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDb } from '../helpers/fakeSupabase.js';
import { createPendingRecord, markProcessing, markDone, markError, markPublishResult, markPendingModeration, markPublishRejected } from '../../src/generation/persistence.js';

test('createPendingRecord inserts a pending row and returns its id', async () => {
  const db = makeFakeDb({
    generated_content: (state) => {
      assert.equal(state.operation, 'insert');
      assert.deepEqual(state.payload, {
        telegram_id: 123,
        wizard_hash: 'abc',
        type: 'text',
        status: 'pending'
      });
      return { data: { id: 'gc-1' }, error: null };
    }
  });

  const id = await createPendingRecord(db, { telegramId: 123, wizardHash: 'abc', type: 'text' });

  assert.equal(id, 'gc-1');
});

test('createPendingRecord throws when the insert fails', async () => {
  const db = makeFakeDb({
    generated_content: () => ({ data: null, error: { message: 'connection reset' } })
  });

  await assert.rejects(
    () => createPendingRecord(db, { telegramId: 123, wizardHash: 'abc', type: 'text' }),
    /connection reset/
  );
});

test('markProcessing updates the row status to processing', async () => {
  const db = makeFakeDb({
    generated_content: (state) => {
      assert.equal(state.operation, 'update');
      assert.deepEqual(state.payload, { status: 'processing' });
      assert.equal(state.filters.id, 'gc-1');
      return { data: null, error: null };
    }
  });

  await markProcessing(db, 'gc-1');
});

test('markDone updates status, cost_usd, and metadata', async () => {
  const db = makeFakeDb({
    generated_content: (state) => {
      assert.equal(state.payload.status, 'done');
      assert.equal(state.payload.cost_usd, 0.003);
      assert.deepEqual(state.payload.metadata, { tier: 'cheap', model: 'anthropic/claude-haiku-4-5' });
      return { data: null, error: null };
    }
  });

  await markDone(db, 'gc-1', { costUsd: 0.003, metadata: { tier: 'cheap', model: 'anthropic/claude-haiku-4-5' } });
});

test('markDone persists r2Url as r2_url when provided (image/video/audio slices)', async () => {
  const db = makeFakeDb({
    generated_content: (state) => {
      assert.equal(state.payload.r2_url, 'gc-1/video.mp4');
      return { data: null, error: null };
    }
  });

  await markDone(db, 'gc-1', { costUsd: 0.5, metadata: {}, r2Url: 'gc-1/video.mp4' });
});

test('markDone defaults r2_url to null when not provided (text slice)', async () => {
  const db = makeFakeDb({
    generated_content: (state) => {
      assert.equal(state.payload.r2_url, null);
      return { data: null, error: null };
    }
  });

  await markDone(db, 'gc-1', { costUsd: 0.003, metadata: {} });
});

test('markDone persists sizeBytes as size_bytes when provided (image/video/audio slices)', async () => {
  const db = makeFakeDb({
    generated_content: (state) => {
      assert.equal(state.payload.size_bytes, 123456);
      return { data: null, error: null };
    }
  });

  await markDone(db, 'gc-1', { costUsd: 0.5, metadata: {}, r2Url: 'gc-1/video.mp4', sizeBytes: 123456 });
});

test('markDone defaults size_bytes to null when not provided (text slice)', async () => {
  const db = makeFakeDb({
    generated_content: (state) => {
      assert.equal(state.payload.size_bytes, null);
      return { data: null, error: null };
    }
  });

  await markDone(db, 'gc-1', { costUsd: 0.003, metadata: {} });
});

test('markPublishResult sets status to published when at least one account succeeded', async () => {
  const db = makeFakeDb({
    generated_content: (state) => {
      assert.equal(state.payload.status, 'published');
      assert.deepEqual(state.payload.publish_report, [
        { network: 'instagram', accountId: 1, status: 'success' },
        { network: 'instagram', accountId: 2, status: 'error', reason: 'HTTP 500' }
      ]);
      return { data: null, error: null };
    }
  });

  await markPublishResult(db, 'gc-1', [
    { network: 'instagram', accountId: 1, status: 'success' },
    { network: 'instagram', accountId: 2, status: 'error', reason: 'HTTP 500' }
  ]);
});

test('markPublishResult sets status to publish_failed when every account failed', async () => {
  const db = makeFakeDb({
    generated_content: (state) => {
      assert.equal(state.payload.status, 'publish_failed');
      return { data: null, error: null };
    }
  });

  await markPublishResult(db, 'gc-1', [{ network: 'instagram', accountId: 1, status: 'error', reason: 'HTTP 500' }]);
});

test('markPendingModeration sets status to pending_moderation', async () => {
  const db = makeFakeDb({
    generated_content: (state) => {
      assert.equal(state.payload.status, 'pending_moderation');
      return { data: null, error: null };
    }
  });

  await markPendingModeration(db, 'gc-1');
});

test('markPublishRejected sets status to publish_rejected', async () => {
  const db = makeFakeDb({
    generated_content: (state) => {
      assert.equal(state.payload.status, 'publish_rejected');
      return { data: null, error: null };
    }
  });

  await markPublishRejected(db, 'gc-1');
});

test('markError updates status to error with the failure message in metadata', async () => {
  const db = makeFakeDb({
    generated_content: (state) => {
      assert.equal(state.payload.status, 'error');
      assert.deepEqual(state.payload.metadata, { error: 'LLM HTTP 500' });
      return { data: null, error: null };
    }
  });

  await markError(db, 'gc-1', 'LLM HTTP 500');
});
