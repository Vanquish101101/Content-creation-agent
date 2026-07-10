import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDb } from '../helpers/fakeSupabase.js';
import { createGenerationOrchestrator } from '../../src/generation/generate.js';

const JOB = {
  telegram_id: 123,
  wizard_hash: 'abc',
  wizard: { network: 'instagram', content_type: 'text', format: '916', style: 'expert', description: 'test' },
  mode: 'content',
  moderation_mode: false
};

function makeDb(recordedUpdates) {
  return makeFakeDb({
    generated_content: (state) => {
      if (state.operation === 'insert') {
        return { data: { id: 'gc-1' }, error: null };
      }
      recordedUpdates.push(state.payload);
      return { data: null, error: null };
    }
  });
}

test('runs the full pipeline: pending -> processing -> done on success', async () => {
  const updates = [];
  const db = makeDb(updates);
  const fakeRoute = () => async () => ({ text: 'Готовый пост', costUsd: 0.002, tier: 'cheap', model: 'anthropic/claude-haiku-4-5' });
  const orchestrator = createGenerationOrchestrator({ db, route: fakeRoute });

  const result = await orchestrator.generateContent(JOB);

  assert.equal(result.id, 'gc-1');
  assert.equal(result.status, 'done');
  assert.equal(updates[0].status, 'processing');
  assert.equal(updates[1].status, 'done');
  assert.equal(updates[1].cost_usd, 0.002);
  assert.equal(updates[1].metadata.text, 'Готовый пост');
});

test('passes job.wizard.content_type and routeDeps to route()', async () => {
  const db = makeDb([]);
  let calledWith = null;
  const fakeRoute = (contentType, deps) => {
    calledWith = { contentType, deps };
    return async () => ({ text: 'x', costUsd: 0, tier: 'cheap', model: 'm' });
  };
  const orchestrator = createGenerationOrchestrator({ db, route: fakeRoute, routeDeps: { apiKey: 'key-1' } });

  await orchestrator.generateContent(JOB);

  assert.equal(calledWith.contentType, 'text');
  assert.deepEqual(calledWith.deps, { apiKey: 'key-1' });
});

test('passes job.telegram_id through into the wizard object given to the generator (needed for R2 key naming)', async () => {
  const db = makeDb([]);
  let generatorCalledWith = null;
  const fakeRoute = () => async (wizard) => {
    generatorCalledWith = wizard;
    return { costUsd: 0, tier: 'cheap', model: 'm' };
  };
  const orchestrator = createGenerationOrchestrator({ db, route: fakeRoute });

  await orchestrator.generateContent(JOB);

  assert.equal(generatorCalledWith.telegram_id, 123);
  assert.equal(generatorCalledWith.content_type, 'text');
});

test('attaches enrich(wizard) result as wizard.trendContext when an enrich function is provided', async () => {
  const db = makeDb([]);
  let generatorCalledWith = null;
  const fakeRoute = () => async (wizard) => {
    generatorCalledWith = wizard;
    return { costUsd: 0, tier: 'cheap', model: 'm' };
  };
  const enrich = async () => ({ hooks: ['x'], triggers: [], offers: [], viral_reasons: [], content_ideas: [] });
  const orchestrator = createGenerationOrchestrator({ db, route: fakeRoute, enrich });

  await orchestrator.generateContent(JOB);

  assert.deepEqual(generatorCalledWith.trendContext, { hooks: ['x'], triggers: [], offers: [], viral_reasons: [], content_ideas: [] });
});

test('wizard.trendContext is null when enrich is not provided', async () => {
  const db = makeDb([]);
  let generatorCalledWith = null;
  const fakeRoute = () => async (wizard) => {
    generatorCalledWith = wizard;
    return { costUsd: 0, tier: 'cheap', model: 'm' };
  };
  const orchestrator = createGenerationOrchestrator({ db, route: fakeRoute });

  await orchestrator.generateContent(JOB);

  assert.equal(generatorCalledWith.trendContext, null);
});

test('wizard.trendContext is null when enrich() itself returns null (no trend request or unreachable Agent 3)', async () => {
  const db = makeDb([]);
  let generatorCalledWith = null;
  const fakeRoute = () => async (wizard) => {
    generatorCalledWith = wizard;
    return { costUsd: 0, tier: 'cheap', model: 'm' };
  };
  const orchestrator = createGenerationOrchestrator({ db, route: fakeRoute, enrich: async () => null });

  await orchestrator.generateContent(JOB);

  assert.equal(generatorCalledWith.trendContext, null);
});

test('passes result.r2Url through to markDone when the cascade uploaded a file (image/video/audio)', async () => {
  const updates = [];
  const db = makeDb(updates);
  const fakeRoute = () => async () => ({ costUsd: 0.4, tier: 'cheap', model: 'runway/gen4_turbo', r2Url: 'gc-1/video.mp4' });
  const orchestrator = createGenerationOrchestrator({ db, route: fakeRoute });

  await orchestrator.generateContent(JOB);

  assert.equal(updates[1].r2_url, 'gc-1/video.mp4');
});

test('passes result.sizeBytes through to markDone when the cascade uploaded a file', async () => {
  const updates = [];
  const db = makeDb(updates);
  const fakeRoute = () => async () => ({ costUsd: 0.4, tier: 'cheap', model: 'runway/gen4_turbo', r2Url: 'gc-1/video.mp4', sizeBytes: 654321 });
  const orchestrator = createGenerationOrchestrator({ db, route: fakeRoute });

  await orchestrator.generateContent(JOB);

  assert.equal(updates[1].size_bytes, 654321);
});

test('warns via notifyAgent1 when a file was uploaded and storage usage is over threshold', async () => {
  const db = makeDb([]);
  const fakeRoute = () => async () => ({ costUsd: 0.4, tier: 'cheap', model: 'm', r2Url: 'gc-1/video.mp4', sizeBytes: 1000 });
  const notifyCalls = [];
  const checkQuota = async () => ({
    telegramId: 999,
    messageType: 'quota_warning',
    payload: { totalUsageBytes: 9999999999, userUsageBytes: 5000, items: [] }
  });
  const orchestrator = createGenerationOrchestrator({
    db,
    route: fakeRoute,
    notifyAgent1: async (msg) => notifyCalls.push(msg),
    _checkQuotaAndWarn: checkQuota
  });

  await orchestrator.generateContent(JOB);

  const quotaCalls = notifyCalls.filter((m) => m.messageType === 'quota_warning');
  assert.equal(quotaCalls.length, 1);
  assert.equal(quotaCalls[0].telegramId, 999);
});

test('does not call notifyAgent1 with quota_warning when the quota check finds nothing to warn about', async () => {
  const db = makeDb([]);
  const fakeRoute = () => async () => ({ costUsd: 0.4, tier: 'cheap', model: 'm', r2Url: 'gc-1/video.mp4', sizeBytes: 1000 });
  const notifyCalls = [];
  const orchestrator = createGenerationOrchestrator({
    db,
    route: fakeRoute,
    notifyAgent1: async (msg) => notifyCalls.push(msg),
    _checkQuotaAndWarn: async () => null
  });

  await orchestrator.generateContent(JOB);

  assert.equal(notifyCalls.filter((m) => m.messageType === 'quota_warning').length, 0);
});

test('does not run the quota check for text generation (no r2Url)', async () => {
  const db = makeDb([]);
  const fakeRoute = () => async () => ({ costUsd: 0.002, tier: 'cheap', model: 'm', text: 'x' });
  let quotaCheckCalled = false;
  const orchestrator = createGenerationOrchestrator({
    db,
    route: fakeRoute,
    notifyAgent1: async () => {},
    _checkQuotaAndWarn: async () => { quotaCheckCalled = true; return null; }
  });

  await orchestrator.generateContent(JOB);

  assert.equal(quotaCheckCalled, false);
});

test('a quota-check failure does not fail the generation itself', async () => {
  const db = makeDb([]);
  const fakeRoute = () => async () => ({ costUsd: 0.4, tier: 'cheap', model: 'm', r2Url: 'gc-1/video.mp4', sizeBytes: 1000 });
  const orchestrator = createGenerationOrchestrator({
    db,
    route: fakeRoute,
    notifyAgent1: async () => {},
    _checkQuotaAndWarn: async () => { throw new Error('quota query failed'); }
  });

  const result = await orchestrator.generateContent(JOB);

  assert.equal(result.status, 'done');
});

test('mode content (not publish) never calls publish() or sends a moderation_request (but does send content_ready, see Слайс 9)', async () => {
  const db = makeDb([]);
  const fakeRoute = () => async () => ({ text: 'x', costUsd: 0, tier: 'cheap', model: 'm' });
  let publishCalled = false;
  const notifyCalls = [];
  const orchestrator = createGenerationOrchestrator({
    db,
    route: fakeRoute,
    publish: async () => { publishCalled = true; return []; },
    notifyAgent1: async (msg) => notifyCalls.push(msg),
    _checkQuotaAndWarn: async () => null
  });

  const result = await orchestrator.generateContent(JOB); // JOB.mode === 'content'

  assert.equal(publishCalled, false);
  assert.equal(notifyCalls.filter((m) => m.messageType === 'moderation_request').length, 0);
  assert.deepEqual(notifyCalls.map((m) => m.messageType), ['content_ready']);
  assert.equal(result.status, 'done');
});

test('mode publish + moderation_mode false calls publish() and marks published on success', async () => {
  const updates = [];
  const db = makeDb(updates);
  const fakeRoute = () => async () => ({ text: 'x', costUsd: 0, tier: 'cheap', model: 'm', r2Url: 'gc-1/img.png' });
  let publishArgs = null;
  const publish = async (args) => { publishArgs = args; return [{ network: 'instagram', accountId: 1, status: 'success' }]; };
  const job = { ...JOB, mode: 'publish', moderation_mode: false };
  const orchestrator = createGenerationOrchestrator({ db, route: fakeRoute, publish, _checkQuotaAndWarn: async () => null });

  const result = await orchestrator.generateContent(job);

  assert.deepEqual(publishArgs.wizard, job.wizard);
  assert.equal(publishArgs.r2Url, 'gc-1/img.png');
  assert.equal(result.status, 'published');
  assert.equal(updates.at(-1).status, 'published');
});

test('mode publish + moderation_mode false marks publish_failed when every account errors', async () => {
  const updates = [];
  const db = makeDb(updates);
  const fakeRoute = () => async () => ({ text: 'x', costUsd: 0, tier: 'cheap', model: 'm' });
  const publish = async () => [{ network: 'instagram', accountId: 1, status: 'error', reason: 'HTTP 500' }];
  const job = { ...JOB, mode: 'publish', moderation_mode: false };
  const orchestrator = createGenerationOrchestrator({ db, route: fakeRoute, publish, _checkQuotaAndWarn: async () => null });

  const result = await orchestrator.generateContent(job);

  assert.equal(result.status, 'publish_failed');
});

test('mode publish + moderation_mode false, but publish() itself throws, still resolves (not a hard failure)', async () => {
  const db = makeDb([]);
  const fakeRoute = () => async () => ({ text: 'x', costUsd: 0, tier: 'cheap', model: 'm' });
  const publish = async () => { throw new Error('PostMyPost unreachable'); };
  const job = { ...JOB, mode: 'publish', moderation_mode: false };
  const orchestrator = createGenerationOrchestrator({ db, route: fakeRoute, publish, _checkQuotaAndWarn: async () => null });

  const result = await orchestrator.generateContent(job);

  assert.equal(result.status, 'publish_failed');
  assert.match(result.publishReport[0].reason, /PostMyPost unreachable/);
});

test('mode publish + moderation_mode false, but no publish dependency configured, marks publish_failed', async () => {
  const db = makeDb([]);
  const fakeRoute = () => async () => ({ text: 'x', costUsd: 0, tier: 'cheap', model: 'm' });
  const job = { ...JOB, mode: 'publish', moderation_mode: false };
  const orchestrator = createGenerationOrchestrator({ db, route: fakeRoute, _checkQuotaAndWarn: async () => null });

  const result = await orchestrator.generateContent(job);

  assert.equal(result.status, 'publish_failed');
});

test('mode publish + moderation_mode true sends a moderation_request via notifyAgent1 and pauses instead of publishing', async () => {
  const updates = [];
  const db = makeDb(updates);
  const fakeRoute = () => async () => ({ text: 'x', costUsd: 0, tier: 'cheap', model: 'm' });
  let publishCalled = false;
  const notifyCalls = [];
  const job = { ...JOB, mode: 'publish', moderation_mode: true };
  const orchestrator = createGenerationOrchestrator({
    db,
    route: fakeRoute,
    publish: async () => { publishCalled = true; return []; },
    notifyAgent1: async (msg) => notifyCalls.push(msg),
    _checkQuotaAndWarn: async () => null
  });

  const result = await orchestrator.generateContent(job);

  assert.equal(publishCalled, false);
  assert.equal(notifyCalls.length, 1);
  assert.equal(notifyCalls[0].messageType, 'moderation_request');
  assert.equal(notifyCalls[0].telegramId, job.telegram_id);
  assert.equal(result.status, 'pending_moderation');
  assert.equal(updates.at(-1).status, 'pending_moderation');
});

test('moderation_request includes a presigned downloadUrl, not just the raw R2 key, when a file was generated', async () => {
  const db = makeDb([]);
  const fakeRoute = () => async () => ({ costUsd: 0.2, tier: 'cheap', model: 'm', r2Url: 'gc-1/preview.png' });
  const notifyCalls = [];
  const r2 = { getSignedDownloadUrl: async (key) => `https://signed.example/${key}` };
  const job = { ...JOB, mode: 'publish', moderation_mode: true };
  const orchestrator = createGenerationOrchestrator({
    db,
    route: fakeRoute,
    r2,
    notifyAgent1: async (msg) => notifyCalls.push(msg),
    _checkQuotaAndWarn: async () => null
  });

  await orchestrator.generateContent(job);

  const moderationCall = notifyCalls.find((m) => m.messageType === 'moderation_request');
  assert.equal(moderationCall.payload.r2Url, 'gc-1/preview.png');
  assert.equal(moderationCall.payload.downloadUrl, 'https://signed.example/gc-1/preview.png');
});

test('sends a content_ready report via notifyAgent1 for a successful mode:content text generation', async () => {
  const db = makeDb([]);
  const fakeRoute = () => async () => ({ text: 'Готовый пост', costUsd: 0.002, tier: 'cheap', model: 'm' });
  const notifyCalls = [];
  const orchestrator = createGenerationOrchestrator({
    db,
    route: fakeRoute,
    notifyAgent1: async (msg) => notifyCalls.push(msg),
    _checkQuotaAndWarn: async () => null
  });

  await orchestrator.generateContent(JOB);

  assert.equal(notifyCalls.length, 1);
  assert.equal(notifyCalls[0].messageType, 'content_ready');
  assert.equal(notifyCalls[0].telegramId, JOB.telegram_id);
  assert.equal(notifyCalls[0].payload.text, 'Готовый пост');
});

test('adds a presigned downloadUrl to the content_ready report when a file was uploaded', async () => {
  const db = makeDb([]);
  const fakeRoute = () => async () => ({ costUsd: 0.4, tier: 'cheap', model: 'm', r2Url: 'gc-1/video.mp4', sizeBytes: 1000 });
  const notifyCalls = [];
  const r2 = { getSignedDownloadUrl: async (key) => `https://signed.example/${key}` };
  const orchestrator = createGenerationOrchestrator({
    db,
    route: fakeRoute,
    r2,
    notifyAgent1: async (msg) => notifyCalls.push(msg),
    _checkQuotaAndWarn: async () => null
  });

  await orchestrator.generateContent(JOB);

  const contentReady = notifyCalls.find((m) => m.messageType === 'content_ready');
  assert.equal(contentReady.payload.downloadUrl, 'https://signed.example/gc-1/video.mp4');
});

test('does not send content_ready when the job was paused for moderation', async () => {
  const db = makeDb([]);
  const fakeRoute = () => async () => ({ costUsd: 0.4, tier: 'cheap', model: 'm' });
  const notifyCalls = [];
  const job = { ...JOB, mode: 'publish', moderation_mode: true };
  const orchestrator = createGenerationOrchestrator({
    db,
    route: fakeRoute,
    notifyAgent1: async (msg) => notifyCalls.push(msg),
    _checkQuotaAndWarn: async () => null
  });

  await orchestrator.generateContent(job);

  assert.equal(notifyCalls.filter((m) => m.messageType === 'content_ready').length, 0);
  assert.equal(notifyCalls.filter((m) => m.messageType === 'moderation_request').length, 1);
});

test('includes publishReport in the content_ready report for a published job', async () => {
  const db = makeDb([]);
  const fakeRoute = () => async () => ({ costUsd: 0.4, tier: 'cheap', model: 'm' });
  const notifyCalls = [];
  const publish = async () => [{ network: 'instagram', accountId: 1, status: 'success' }];
  const job = { ...JOB, mode: 'publish', moderation_mode: false };
  const orchestrator = createGenerationOrchestrator({
    db,
    route: fakeRoute,
    publish,
    notifyAgent1: async (msg) => notifyCalls.push(msg),
    _checkQuotaAndWarn: async () => null
  });

  await orchestrator.generateContent(job);

  const contentReady = notifyCalls.find((m) => m.messageType === 'content_ready');
  assert.deepEqual(contentReady.payload.publishReport, [{ network: 'instagram', accountId: 1, status: 'success' }]);
});

test('a content_ready notify failure does not fail the generation itself', async () => {
  const db = makeDb([]);
  const fakeRoute = () => async () => ({ text: 'x', costUsd: 0.002, tier: 'cheap', model: 'm' });
  const orchestrator = createGenerationOrchestrator({
    db,
    route: fakeRoute,
    notifyAgent1: async () => { throw new Error('redis down'); },
    _checkQuotaAndWarn: async () => null
  });

  const result = await orchestrator.generateContent(JOB);

  assert.equal(result.status, 'done');
});

test('marks the record as error and rethrows when generation fails', async () => {
  const updates = [];
  const db = makeDb(updates);
  const fakeRoute = () => async () => { throw new Error('LLM HTTP 500'); };
  const orchestrator = createGenerationOrchestrator({ db, route: fakeRoute });

  await assert.rejects(() => orchestrator.generateContent(JOB), /LLM HTTP 500/);

  assert.equal(updates[0].status, 'processing');
  assert.equal(updates[1].status, 'error');
  assert.equal(updates[1].metadata.error, 'LLM HTTP 500');
});
