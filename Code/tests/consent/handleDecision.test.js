import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDb } from '../helpers/fakeSupabase.js';
import { createDecisionHandler } from '../../src/consent/handleDecision.js';

function makeDb(row, updates = []) {
  return makeFakeDb({
    generated_content: (state) => {
      if (state.operation === 'select') {
        return { data: row, error: null };
      }
      updates.push(state.payload);
      return { data: null, error: null };
    }
  });
}

test('quota_deletion + approved deletes the R2 object and marks the row deleted', async () => {
  const updates = [];
  const db = makeDb({ id: 'gc-1', status: 'done', r2_url: 'gc-1/old.png' }, updates);
  const deletedKeys = [];
  const r2 = { deleteFile: async (key) => deletedKeys.push(key) };
  const handleDecision = createDecisionHandler({ db, r2 });

  await handleDecision({ generatedContentId: 'gc-1', decisionType: 'quota_deletion', decision: 'approved' });

  assert.deepEqual(deletedKeys, ['gc-1/old.png']);
  assert.equal(updates.at(-1).status, 'deleted');
});

test('quota_deletion + rejected does nothing', async () => {
  const db = makeDb({ id: 'gc-1', status: 'done', r2_url: 'gc-1/old.png' });
  const r2 = { deleteFile: async () => { throw new Error('should not be called'); } };
  const handleDecision = createDecisionHandler({ db, r2 });

  await handleDecision({ generatedContentId: 'gc-1', decisionType: 'quota_deletion', decision: 'rejected' });
});

test('quota_deletion is idempotent — skips content already deleted', async () => {
  const db = makeDb({ id: 'gc-1', status: 'deleted', r2_url: 'gc-1/old.png' });
  let deleteCalled = false;
  const r2 = { deleteFile: async () => { deleteCalled = true; } };
  const handleDecision = createDecisionHandler({ db, r2 });

  await handleDecision({ generatedContentId: 'gc-1', decisionType: 'quota_deletion', decision: 'approved' });

  assert.equal(deleteCalled, false);
});

test('publish_moderation + approved reconstructs the wizard from metadata, publishes, and reports', async () => {
  const updates = [];
  const row = {
    id: 'gc-1',
    status: 'pending_moderation',
    r2_url: 'gc-1/img.png',
    telegram_id: 123,
    metadata: { wizard: { network: 'instagram', content_type: 'image', description: 'x' }, text: null },
    size_bytes: 500,
    cost_usd: 0.02
  };
  const db = makeDb(row, updates);
  let publishArgs = null;
  const publish = async (args) => { publishArgs = args; return [{ network: 'instagram', accountId: 1, status: 'success' }]; };
  const notifyCalls = [];
  const r2 = { getSignedDownloadUrl: async (key) => `https://signed.example/${key}` };
  const handleDecision = createDecisionHandler({ db, r2, publish, notifyAgent1: async (m) => notifyCalls.push(m) });

  await handleDecision({ generatedContentId: 'gc-1', decisionType: 'publish_moderation', decision: 'approved' });

  assert.deepEqual(publishArgs.wizard, row.metadata.wizard);
  assert.equal(publishArgs.r2Url, 'gc-1/img.png');
  assert.ok(updates.some((u) => u.status === 'published'));
  assert.equal(notifyCalls.length, 1);
  assert.equal(notifyCalls[0].messageType, 'content_ready');
  assert.equal(notifyCalls[0].telegramId, 123);
  assert.equal(notifyCalls[0].payload.downloadUrl, 'https://signed.example/gc-1/img.png');
});

test('publish_moderation + rejected marks publish_rejected without calling publish', async () => {
  const updates = [];
  const db = makeDb({ id: 'gc-1', status: 'pending_moderation', metadata: { wizard: { network: 'instagram' } } }, updates);
  let publishCalled = false;
  const handleDecision = createDecisionHandler({ db, publish: async () => { publishCalled = true; return []; } });

  await handleDecision({ generatedContentId: 'gc-1', decisionType: 'publish_moderation', decision: 'rejected' });

  assert.equal(publishCalled, false);
  assert.equal(updates.at(-1).status, 'publish_rejected');
});

test('publish_moderation is idempotent — skips content no longer pending_moderation', async () => {
  const db = makeDb({ id: 'gc-1', status: 'published', metadata: { wizard: {} } });
  let publishCalled = false;
  const handleDecision = createDecisionHandler({ db, publish: async () => { publishCalled = true; return []; } });

  await handleDecision({ generatedContentId: 'gc-1', decisionType: 'publish_moderation', decision: 'approved' });

  assert.equal(publishCalled, false);
});

test('publish_moderation + approved marks publish_failed when publish is not configured', async () => {
  const updates = [];
  const db = makeDb({ id: 'gc-1', status: 'pending_moderation', metadata: { wizard: { network: 'instagram' } } }, updates);
  const handleDecision = createDecisionHandler({ db });

  await handleDecision({ generatedContentId: 'gc-1', decisionType: 'publish_moderation', decision: 'approved' });

  assert.ok(updates.some((u) => u.status === 'publish_failed'));
});

test('publish_moderation + approved catches a publish() failure without throwing', async () => {
  const updates = [];
  const db = makeDb({ id: 'gc-1', status: 'pending_moderation', metadata: { wizard: { network: 'instagram' } } }, updates);
  const handleDecision = createDecisionHandler({ db, publish: async () => { throw new Error('PostMyPost unreachable'); } });

  await assert.doesNotReject(() =>
    handleDecision({ generatedContentId: 'gc-1', decisionType: 'publish_moderation', decision: 'approved' })
  );
  assert.ok(updates.some((u) => u.status === 'publish_failed'));
});

test('handles a missing generated_content row gracefully (does not throw)', async () => {
  const db = makeFakeDb({ generated_content: () => ({ data: null, error: { code: 'PGRST116', message: 'not found' } }) });
  const handleDecision = createDecisionHandler({ db });

  await assert.doesNotReject(() =>
    handleDecision({ generatedContentId: 'missing', decisionType: 'quota_deletion', decision: 'approved' })
  );
});
