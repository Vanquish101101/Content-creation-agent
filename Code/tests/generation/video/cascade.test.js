import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVideoCascade } from '../../../src/generation/video/cascade.js';

const WIZARD = {
  network: 'instagram',
  content_type: 'video',
  format: '916',
  style: 'expert',
  description: 'Короткий ролик про скидку 20% на услуги'
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

// Симулирует три шага MiniMax: POST /v1/video_generation -> {task_id},
// GET /v1/query/video_generation?task_id -> статус (Preparing/Queueing/
// Processing/Success/Fail), GET /v1/files/retrieve?file_id -> download_url,
// затем обычный GET по download_url (без авторизации MiniMax).
function fakeFetch({ postStatusCode = 0, querySequence, fileDownloadUrl = 'https://cdn.minimax.example/out.mp4', videoBytes = 'fake-video-bytes' }) {
  const calls = [];
  let queryCallIndex = 0;
  const fetchImpl = async (url) => {
    calls.push({ url });
    if (url.endsWith('/video_generation')) {
      return { ok: true, status: 200, json: async () => ({ task_id: 'task-1', base_resp: { status_code: postStatusCode, status_msg: postStatusCode === 0 ? 'success' : 'error' } }) };
    }
    if (url.includes('/query/video_generation')) {
      const body = querySequence[Math.min(queryCallIndex, querySequence.length - 1)];
      queryCallIndex += 1;
      return { ok: true, status: 200, json: async () => body };
    }
    if (url.includes('/files/retrieve')) {
      return { ok: true, status: 200, json: async () => ({ file: { file_id: 'file-1', download_url: fileDownloadUrl }, base_resp: { status_code: 0, status_msg: 'success' } }) };
    }
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(videoBytes) };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

test('throws when apiKey is missing', () => {
  assert.throws(() => createVideoCascade({ r2: fakeR2() }), /apiKey is required/);
});

test('throws when r2 client is missing', () => {
  assert.throws(() => createVideoCascade({ apiKey: 'key-1' }), /r2 client is required/);
});

test('generates on the cheap tier, downloads the file, and uploads to R2', async () => {
  const r2 = fakeR2();
  const fetchImpl = fakeFetch({
    querySequence: [{ task_id: 'task-1', status: 'Success', file_id: 'file-1' }]
  });
  const cascade = createVideoCascade({ apiKey: 'test-key', r2, fetchImpl, _sleep: async () => {} });

  const result = await cascade(WIZARD);

  assert.equal(result.tier, 'cheap');
  assert.equal(result.model, 'MiniMax-Hailuo-02');
  assert.equal(result.r2Url, r2.uploads[0].key);
  assert.equal(r2.uploads[0].contentType, 'video/mp4');
  assert.equal(r2.uploads[0].body.toString(), 'fake-video-bytes');
  assert.equal(result.sizeBytes, Buffer.from('fake-video-bytes').length);
});

test('sends the correct headers and body on the video_generation request', async () => {
  const r2 = fakeR2();
  const fetchImpl = fakeFetch({ querySequence: [{ task_id: 'task-1', status: 'Success', file_id: 'file-1' }] });
  const cascade = createVideoCascade({ apiKey: 'secret-key', r2, fetchImpl, _sleep: async () => {} });

  await cascade(WIZARD);

  const postCall = fetchImpl.calls.find((c) => c.url.endsWith('/video_generation'));
  assert.ok(postCall, 'expected a POST to /video_generation');
});

test('polls until the task succeeds (handles Preparing/Queueing/Processing before Success)', async () => {
  const r2 = fakeR2();
  const fetchImpl = fakeFetch({
    querySequence: [
      { task_id: 'task-1', status: 'Preparing' },
      { task_id: 'task-1', status: 'Queueing' },
      { task_id: 'task-1', status: 'Processing' },
      { task_id: 'task-1', status: 'Success', file_id: 'file-1' }
    ]
  });
  const cascade = createVideoCascade({ apiKey: 'test-key', r2, fetchImpl, _sleep: async () => {} });

  const result = await cascade(WIZARD);

  assert.equal(result.tier, 'cheap');
});

test('escalates to the main tier when the cheap tier POST reports a base_resp error', async () => {
  const r2 = fakeR2();
  let postCalls = 0;
  const fetchImpl = async (url) => {
    if (url.endsWith('/video_generation')) {
      postCalls += 1;
      const statusCode = postCalls === 1 ? 1002 : 0;
      return { ok: true, status: 200, json: async () => ({ task_id: `task-${postCalls}`, base_resp: { status_code: statusCode, status_msg: statusCode === 0 ? 'success' : 'rate limited' } }) };
    }
    if (url.includes('/query/video_generation')) {
      return { ok: true, status: 200, json: async () => ({ task_id: 'task-2', status: 'Success', file_id: 'file-2' }) };
    }
    if (url.includes('/files/retrieve')) {
      return { ok: true, status: 200, json: async () => ({ file: { file_id: 'file-2', download_url: 'https://cdn.minimax.example/out2.mp4' } }) };
    }
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('bytes') };
  };
  const cascade = createVideoCascade({ apiKey: 'test-key', r2, fetchImpl, _sleep: async () => {} });

  const result = await cascade(WIZARD);

  assert.equal(result.tier, 'main');
  assert.equal(result.model, 'MiniMax-Hailuo-2.3');
  assert.equal(result.escalatedFrom, 'MiniMax-Hailuo-02');
});

test('escalates to the main tier when the cheap tier task status is Fail', async () => {
  const r2 = fakeR2();
  let queryCalls = 0;
  const fetchImpl = async (url) => {
    if (url.endsWith('/video_generation')) {
      return { ok: true, status: 200, json: async () => ({ task_id: 'task-x', base_resp: { status_code: 0, status_msg: 'success' } }) };
    }
    if (url.includes('/query/video_generation')) {
      queryCalls += 1;
      if (queryCalls === 1) {
        return { ok: true, status: 200, json: async () => ({ task_id: 'task-x', status: 'Fail' }) };
      }
      return { ok: true, status: 200, json: async () => ({ task_id: 'task-y', status: 'Success', file_id: 'file-y' }) };
    }
    if (url.includes('/files/retrieve')) {
      return { ok: true, status: 200, json: async () => ({ file: { file_id: 'file-y', download_url: 'https://cdn.minimax.example/out3.mp4' } }) };
    }
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('bytes') };
  };
  const cascade = createVideoCascade({ apiKey: 'test-key', r2, fetchImpl, _sleep: async () => {} });

  const result = await cascade(WIZARD);

  assert.equal(result.tier, 'main');
});

test('throws when both tiers fail', async () => {
  const r2 = fakeR2();
  const fetchImpl = async (url) => {
    if (url.endsWith('/video_generation')) {
      return { ok: false, status: 500, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const cascade = createVideoCascade({ apiKey: 'test-key', r2, fetchImpl, _sleep: async () => {} });

  await assert.rejects(() => cascade(WIZARD), /HTTP 500/);
});

test('throws a timeout error if the task never leaves Processing within maxPollAttempts', async () => {
  const r2 = fakeR2();
  const fetchImpl = fakeFetch({ querySequence: [{ task_id: 'task-1', status: 'Processing' }] });
  const cascade = createVideoCascade({ apiKey: 'test-key', r2, fetchImpl, _sleep: async () => {}, maxPollAttempts: 3 });

  await assert.rejects(() => cascade(WIZARD), /timed out/);
});

// Найдено живой проверкой 2026-07-10: trendContext (Слайс 7) был подключён
// только к text-каскаду — MiniMax молча игнорировал его, даже когда
// пользователь явно просил опору на тренды.
test('includes trendContext parts in the prompt when present', async () => {
  const r2 = fakeR2();
  let postBody = null;
  const fetchImpl = async (url, options) => {
    if (url.endsWith('/video_generation')) {
      postBody = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ task_id: 'task-1', base_resp: { status_code: 0, status_msg: 'success' } }) };
    }
    if (url.includes('/query/video_generation')) {
      return { ok: true, status: 200, json: async () => ({ task_id: 'task-1', status: 'Success', file_id: 'file-1' }) };
    }
    if (url.includes('/files/retrieve')) {
      return { ok: true, status: 200, json: async () => ({ file: { file_id: 'file-1', download_url: 'https://cdn.minimax.example/out.mp4' } }) };
    }
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('bytes') };
  };
  const cascade = createVideoCascade({ apiKey: 'test-key', r2, fetchImpl, _sleep: async () => {} });
  const wizardWithTrends = { ...WIZARD, trendContext: { content_ideas: ['формат до/после'], hooks: ['Ты не поверишь'] } };

  await cascade(wizardWithTrends);

  assert.match(postBody.prompt, /Короткий ролик про скидку 20% на услуги/);
  assert.match(postBody.prompt, /формат до\/после/);
  assert.match(postBody.prompt, /Ты не поверишь/);
});

test('prompt is exactly wizard.description when trendContext is absent', async () => {
  const r2 = fakeR2();
  let postBody = null;
  const fetchImpl = async (url, options) => {
    if (url.endsWith('/video_generation')) {
      postBody = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ task_id: 'task-1', base_resp: { status_code: 0, status_msg: 'success' } }) };
    }
    if (url.includes('/query/video_generation')) {
      return { ok: true, status: 200, json: async () => ({ task_id: 'task-1', status: 'Success', file_id: 'file-1' }) };
    }
    if (url.includes('/files/retrieve')) {
      return { ok: true, status: 200, json: async () => ({ file: { file_id: 'file-1', download_url: 'https://cdn.minimax.example/out.mp4' } }) };
    }
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('bytes') };
  };
  const cascade = createVideoCascade({ apiKey: 'test-key', r2, fetchImpl, _sleep: async () => {} });

  await cascade(WIZARD);

  assert.equal(postBody.prompt, WIZARD.description);
});
