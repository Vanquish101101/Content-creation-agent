import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCarouselCascade } from '../../../src/generation/carousel/cascade.js';

const WIZARD = {
  network: 'instagram',
  content_type: 'carousel',
  format: '11',
  style: 'expert',
  description: 'Карусель про 5 ошибок в маркетинге'
};

function fakeR2() {
  const uploads = [];
  return {
    uploads,
    async uploadFile({ key, body, contentType }) {
      uploads.push({ key, body, contentType });
      return { key };
    }
  };
}

// Зеркало fakeFetch из tests/generation/image/cascade.test.js — Runway
// text_to_image -> {id}, поллинг GET /tasks/:id, затем скачивание. task-id
// растёт на каждый вызов startTask, чтобы каждое изображение каскада было
// различимо в проверках.
function fakeFetch() {
  const calls = [];
  let taskCounter = 0;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/text_to_image')) {
      taskCounter += 1;
      return { ok: true, status: 200, json: async () => ({ id: `task-${taskCounter}` }) };
    }
    if (url.includes('/tasks/')) {
      const taskId = url.split('/tasks/')[1];
      return { ok: true, status: 200, json: async () => ({ id: taskId, status: 'SUCCEEDED', output: [`https://ephemeral.runway.example/${taskId}.png`] }) };
    }
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(`bytes-${calls.length}`) };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

test('throws when apiKey is missing', () => {
  assert.throws(() => createCarouselCascade({ r2: fakeR2() }), /apiKey is required/);
});

test('throws when r2 client is missing', () => {
  assert.throws(() => createCarouselCascade({ apiKey: 'key' }), /r2 client is required/);
});

test('generates imageCount images (default 3), each uploaded to R2', async () => {
  const r2 = fakeR2();
  const fetchImpl = fakeFetch();
  const cascade = createCarouselCascade({ apiKey: 'test-key', r2, fetchImpl, _sleep: async () => {} });

  const result = await cascade(WIZARD);

  assert.equal(result.files.length, 3);
  assert.equal(r2.uploads.length, 3);
  for (const file of result.files) {
    assert.ok(file.r2Url);
    assert.ok(file.sizeBytes > 0);
  }
});

test('respects a custom imageCount', async () => {
  const r2 = fakeR2();
  const fetchImpl = fakeFetch();
  const cascade = createCarouselCascade({ apiKey: 'test-key', r2, fetchImpl, imageCount: 5, _sleep: async () => {} });

  const result = await cascade(WIZARD);

  assert.equal(result.files.length, 5);
  assert.equal(r2.uploads.length, 5);
});

test('sums costUsd across all generated images', async () => {
  const r2 = fakeR2();
  const fetchImpl = fakeFetch();
  const cascade = createCarouselCascade({ apiKey: 'test-key', r2, fetchImpl, imageCount: 3, _sleep: async () => {} });

  const result = await cascade(WIZARD);

  // gen4_image_turbo (cheap tier) ~ $0.02 за изображение, см. image/cascade.js APPROX_COST_USD
  assert.ok(result.costUsd > 0.05 && result.costUsd < 0.07, `expected ~3x cheap-tier cost, got ${result.costUsd}`);
});

test('reports the cheap tier/model when every image succeeds on the cheap tier', async () => {
  const r2 = fakeR2();
  const fetchImpl = fakeFetch();
  const cascade = createCarouselCascade({ apiKey: 'test-key', r2, fetchImpl, imageCount: 2, _sleep: async () => {} });

  const result = await cascade(WIZARD);

  assert.equal(result.tier, 'cheap');
  assert.equal(result.model, 'gen4_image_turbo');
});

test('propagates trendContext to every image in the carousel (reuses image cascade prompt enrichment)', async () => {
  const r2 = fakeR2();
  const fetchImpl = fakeFetch();
  const cascade = createCarouselCascade({ apiKey: 'test-key', r2, fetchImpl, imageCount: 2, _sleep: async () => {} });
  const wizardWithTrends = { ...WIZARD, trendContext: { content_ideas: ['до/после'] } };

  await cascade(wizardWithTrends);

  const promptCalls = fetchImpl.calls.filter((c) => c.url.endsWith('/text_to_image'));
  assert.equal(promptCalls.length, 2);
  for (const call of promptCalls) {
    const body = JSON.parse(call.options.body);
    assert.match(body.promptText, /до\/после/);
  }
});

test('throws if any image in the carousel fails on both tiers', async () => {
  const r2 = fakeR2();
  let postCount = 0;
  const fetchImpl = async (url) => {
    if (url.endsWith('/text_to_image')) {
      postCount += 1;
      // Изображение 1 (вызов #1, cheap) — успех. Изображение 2, оба тира
      // (вызовы #2 cheap, #3 main) — провал, вся карусель должна упасть.
      if (postCount >= 2) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({ id: 'task-1' }) };
    }
    if (url.includes('/tasks/')) {
      return { ok: true, status: 200, json: async () => ({ id: 'task-1', status: 'SUCCEEDED', output: ['https://ephemeral.runway.example/out.png'] }) };
    }
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('bytes') };
  };
  const cascade = createCarouselCascade({ apiKey: 'test-key', r2, fetchImpl, imageCount: 3, _sleep: async () => {} });

  await assert.rejects(() => cascade(WIZARD), /HTTP 500/);
});
