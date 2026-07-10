import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPostMyPostClient } from '../../src/publish/postMyPostClient.js';

function fakeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    for (const [matcher, respond] of routes) {
      if (typeof matcher === 'string' ? url.includes(matcher) : matcher.test(url)) {
        return respond(url, options);
      }
    }
    throw new Error(`fakeFetch: no route matched ${url}`);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

test('throws when apiKey is missing', () => {
  assert.throws(() => createPostMyPostClient({}), /apiKey is required/);
});

test('getChannels sends Bearer auth and returns the channel list', async () => {
  const fetchImpl = fakeFetch([
    ['/channels', async () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: 4, code: 'facebook', name: 'Facebook' }] }) })]
  ]);
  const client = createPostMyPostClient({ apiKey: 'secret-key', fetchImpl });

  const channels = await client.getChannels();

  assert.deepEqual(channels, [{ id: 4, code: 'facebook', name: 'Facebook' }]);
  assert.equal(fetchImpl.calls[0].options.headers['Authorization'], 'Bearer secret-key');
});

test('getAccounts passes project_id as a query param', async () => {
  const fetchImpl = fakeFetch([
    ['/accounts', async () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: 33915, chanel_id: 4, name: 'My IG', connection_status: 1 }] }) })]
  ]);
  const client = createPostMyPostClient({ apiKey: 'k', fetchImpl });

  const accounts = await client.getAccounts(245678);

  assert.deepEqual(accounts, [{ id: 33915, chanel_id: 4, name: 'My IG', connection_status: 1 }]);
  assert.match(fetchImpl.calls[0].url, /project_id=245678/);
});

test('uploadFileByUrl posts project_id and url to /upload/init', async () => {
  const fetchImpl = fakeFetch([
    ['/upload/init', async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.project_id, 245678);
      assert.equal(body.url, 'https://r2.example/signed/video.mp4');
      return { ok: true, status: 200, json: async () => ({ id: 1283466, url: body.url, size: 1000, status: 5 }) };
    }]
  ]);
  const client = createPostMyPostClient({ apiKey: 'k', fetchImpl });

  const result = await client.uploadFileByUrl({ projectId: 245678, url: 'https://r2.example/signed/video.mp4' });

  assert.equal(result.id, 1283466);
});

test('getUploadStatus queries by id', async () => {
  const fetchImpl = fakeFetch([
    ['/upload/status', async () => ({ ok: true, status: 200, json: async () => ({ id: 112233, file_id: 778899, status: 1 }) })]
  ]);
  const client = createPostMyPostClient({ apiKey: 'k', fetchImpl });

  const result = await client.getUploadStatus(112233);

  assert.equal(result.file_id, 778899);
  assert.match(fetchImpl.calls[0].url, /id=112233/);
});

test('createPublication posts the full publication body', async () => {
  const fetchImpl = fakeFetch([
    [/\/publications$/, async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.project_id, 245678);
      assert.deepEqual(body.account_ids, [33915]);
      assert.equal(body.publication_status, 5);
      assert.equal(body.details[0].publication_type, 1);
      return { ok: true, status: 200, json: async () => ({ id: 345678, publication_status: 5 }) };
    }]
  ]);
  const client = createPostMyPostClient({ apiKey: 'k', fetchImpl });

  const result = await client.createPublication({
    projectId: 245678,
    postAt: '2026-07-10T12:00:00.000Z',
    accountIds: [33915],
    publicationStatus: 5,
    details: [{ account_id: 33915, publication_type: 1, content: 'text', file_ids: [778899] }]
  });

  assert.equal(result.id, 345678);
});

test('getPublication fetches by id', async () => {
  const fetchImpl = fakeFetch([
    [/\/publications\/345678$/, async () => ({ ok: true, status: 200, json: async () => ({ id: 345678, publication_status: 1 }) })]
  ]);
  const client = createPostMyPostClient({ apiKey: 'k', fetchImpl });

  const result = await client.getPublication(345678);

  assert.equal(result.publication_status, 1);
});

test('throws a descriptive error on a non-ok HTTP response', async () => {
  const fetchImpl = fakeFetch([
    ['/channels', async () => ({ ok: false, status: 401, json: async () => ({}) })]
  ]);
  const client = createPostMyPostClient({ apiKey: 'bad-key', fetchImpl });

  await assert.rejects(() => client.getChannels(), /HTTP 401/);
});
