import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImageCascade } from '../../../src/generation/image/cascade.js';

const WIZARD = {
  network: 'instagram',
  content_type: 'image',
  format: '11',
  style: 'expert',
  description: 'Обложка поста про скидку 20% на услуги'
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

// Симулирует: POST /v1/text_to_image -> {id}, затем GET /v1/tasks/:id
// (несколько раз PENDING, потом SUCCEEDED или FAILED), затем скачивание
// эфемерной ссылки на изображение (обычный GET, без авторизации Runway).
function fakeFetch({ postOk = true, postStatus = 200, taskSequence, imageBytes = 'fake-image-bytes' }) {
  const calls = [];
  let taskCallIndex = 0;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/text_to_image')) {
      return { ok: postOk, status: postStatus, json: async () => ({ id: 'task-1' }) };
    }
    if (url.includes('/tasks/')) {
      const body = taskSequence[Math.min(taskCallIndex, taskSequence.length - 1)];
      taskCallIndex += 1;
      return { ok: true, status: 200, json: async () => body };
    }
    // скачивание эфемерной ссылки на результат
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(imageBytes) };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

test('throws when apiKey is missing', () => {
  assert.throws(() => createImageCascade({ r2: fakeR2() }), /apiKey is required/);
});

test('throws when r2 client is missing', () => {
  assert.throws(() => createImageCascade({ apiKey: 'key-1' }), /r2 client is required/);
});

test('generates on the cheap tier, downloads the ephemeral URL, and uploads to R2', async () => {
  const r2 = fakeR2();
  const fetchImpl = fakeFetch({
    taskSequence: [{ id: 'task-1', status: 'SUCCEEDED', output: ['https://ephemeral.runway.example/out.png'] }]
  });
  const cascade = createImageCascade({ apiKey: 'test-key', r2, fetchImpl, _sleep: async () => {} });

  const result = await cascade(WIZARD);

  assert.equal(result.tier, 'cheap');
  assert.equal(result.model, 'gen4_image_turbo');
  assert.equal(result.r2Url, r2.uploads[0].key);
  assert.equal(r2.uploads[0].contentType, 'image/png');
  assert.equal(r2.uploads[0].body.toString(), 'fake-image-bytes');
  assert.equal(result.sizeBytes, Buffer.from('fake-image-bytes').length);
});

test('sends the correct headers and body on the text_to_image request', async () => {
  const r2 = fakeR2();
  const fetchImpl = fakeFetch({
    taskSequence: [{ id: 'task-1', status: 'SUCCEEDED', output: ['https://ephemeral.runway.example/out.png'] }]
  });
  const cascade = createImageCascade({ apiKey: 'secret-key', r2, fetchImpl, _sleep: async () => {} });

  await cascade(WIZARD);

  const postCall = fetchImpl.calls.find((c) => c.url.endsWith('/text_to_image'));
  assert.equal(postCall.options.headers['Authorization'], 'Bearer secret-key');
  assert.equal(postCall.options.headers['X-Runway-Version'], '2024-11-06');
  const body = JSON.parse(postCall.options.body);
  assert.equal(body.model, 'gen4_image_turbo');
  assert.match(body.promptText, /скидку 20%/);
});

test('polls until the task succeeds (handles PENDING/RUNNING before SUCCEEDED)', async () => {
  const r2 = fakeR2();
  const fetchImpl = fakeFetch({
    taskSequence: [
      { id: 'task-1', status: 'PENDING' },
      { id: 'task-1', status: 'RUNNING' },
      { id: 'task-1', status: 'SUCCEEDED', output: ['https://ephemeral.runway.example/out.png'] }
    ]
  });
  const cascade = createImageCascade({ apiKey: 'test-key', r2, fetchImpl, _sleep: async () => {} });

  const result = await cascade(WIZARD);

  assert.equal(result.tier, 'cheap');
});

test('escalates to the main tier when the cheap tier POST fails', async () => {
  let attempt = 0;
  const r2 = fakeR2();
  const fetchImpl = async (url, options) => {
    if (url.endsWith('/text_to_image')) {
      attempt += 1;
      if (attempt === 1) {
        return { ok: false, status: 429, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({ id: 'task-2' }) };
    }
    if (url.includes('/tasks/')) {
      return { ok: true, status: 200, json: async () => ({ id: 'task-2', status: 'SUCCEEDED', output: ['https://ephemeral.runway.example/out2.png'] }) };
    }
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('bytes') };
  };
  const cascade = createImageCascade({ apiKey: 'test-key', r2, fetchImpl, _sleep: async () => {} });

  const result = await cascade(WIZARD);

  assert.equal(result.tier, 'main');
  assert.equal(result.model, 'gen4_image');
  assert.equal(result.escalatedFrom, 'gen4_image_turbo');
});

test('escalates to the main tier when the cheap tier task FAILS', async () => {
  const r2 = fakeR2();
  let taskEndpointCalls = 0;
  const fetchImpl = async (url) => {
    if (url.endsWith('/text_to_image')) {
      return { ok: true, status: 200, json: async () => ({ id: 'task-x' }) };
    }
    if (url.includes('/tasks/')) {
      taskEndpointCalls += 1;
      if (taskEndpointCalls === 1) {
        return { ok: true, status: 200, json: async () => ({ id: 'task-x', status: 'FAILED', failure: 'content policy' }) };
      }
      return { ok: true, status: 200, json: async () => ({ id: 'task-y', status: 'SUCCEEDED', output: ['https://ephemeral.runway.example/out3.png'] }) };
    }
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('bytes') };
  };
  const cascade = createImageCascade({ apiKey: 'test-key', r2, fetchImpl, _sleep: async () => {} });

  const result = await cascade(WIZARD);

  assert.equal(result.tier, 'main');
});

test('throws when both tiers fail', async () => {
  const r2 = fakeR2();
  const fetchImpl = async (url) => {
    if (url.endsWith('/text_to_image')) {
      return { ok: false, status: 500, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const cascade = createImageCascade({ apiKey: 'test-key', r2, fetchImpl, _sleep: async () => {} });

  await assert.rejects(() => cascade(WIZARD), /HTTP 500/);
});

test('throws a timeout error if the task never leaves PENDING within maxPollAttempts', async () => {
  const r2 = fakeR2();
  const fetchImpl = fakeFetch({ taskSequence: [{ id: 'task-1', status: 'PENDING' }] });
  const cascade = createImageCascade({ apiKey: 'test-key', r2, fetchImpl, _sleep: async () => {}, maxPollAttempts: 3 });

  await assert.rejects(() => cascade(WIZARD), /timed out/);
});
