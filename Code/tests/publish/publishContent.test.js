import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContentPublisher } from '../../src/publish/publishContent.js';

const TEXT_WIZARD = { network: 'instagram', content_type: 'text', format: '11', description: 'Пост про скидку' };
const IMAGE_WIZARD = { network: 'instagram', content_type: 'image', format: '11', description: 'Картинка про скидку' };

function fakeR2(signedUrl = 'https://r2.example/signed/file') {
  return { getSignedDownloadUrl: async () => signedUrl };
}

function fakeClient(overrides = {}) {
  return {
    getChannels: async () => [{ id: 4, code: 'instagram', name: 'Instagram' }],
    getAccounts: async () => [{ id: 33915, chanel_id: 4, name: 'My IG', connection_status: 1 }],
    uploadFileByUrl: async () => ({ id: 1283466, status: 5 }),
    getUploadStatus: async () => ({ id: 1283466, file_id: 778899, status: 1 }),
    createPublication: async () => ({ id: 345678, publication_status: 5 }),
    getPublication: async () => ({ id: 345678, publication_status: 1 }),
    ...overrides
  };
}

test('reports a single error entry when no connected account matches the network', async () => {
  const client = fakeClient({ getAccounts: async () => [] });
  const publisher = createContentPublisher({ client, r2: fakeR2(), projectId: 245678, _sleep: async () => {} });

  const report = await publisher({ wizard: TEXT_WIZARD, r2Url: null });

  assert.equal(report.length, 1);
  assert.equal(report[0].status, 'error');
  assert.match(report[0].reason, /no connected/);
});

test('text content (no r2Url) skips upload and publishes directly', async () => {
  let uploadCalled = false;
  const client = fakeClient({ uploadFileByUrl: async () => { uploadCalled = true; return {}; } });
  const publisher = createContentPublisher({ client, r2: fakeR2(), projectId: 245678, _sleep: async () => {} });

  const report = await publisher({ wizard: TEXT_WIZARD, r2Url: null });

  assert.equal(uploadCalled, false);
  assert.equal(report[0].status, 'success');
});

test('image content (has r2Url) signs the URL, uploads by link, and includes the resulting file_id', async () => {
  let createPublicationBody = null;
  const client = fakeClient({
    createPublication: async (body) => { createPublicationBody = body; return { id: 345678, publication_status: 5 }; }
  });
  const publisher = createContentPublisher({ client, r2: fakeR2('https://r2.example/signed/img.png'), projectId: 245678, _sleep: async () => {} });

  const report = await publisher({ wizard: IMAGE_WIZARD, r2Url: 'gc-1/img.png' });

  assert.deepEqual(createPublicationBody.details[0].file_ids, [778899]);
  assert.equal(report[0].status, 'success');
});

test('publication that ends in error status (3) is reported as error with the status in the reason', async () => {
  const client = fakeClient({ getPublication: async () => ({ id: 345678, publication_status: 3 }) });
  const publisher = createContentPublisher({ client, r2: fakeR2(), projectId: 245678, _sleep: async () => {} });

  const report = await publisher({ wizard: TEXT_WIZARD, r2Url: null });

  assert.equal(report[0].status, 'error');
  assert.match(report[0].reason, /publication_status=3/);
});

test('polls the publication status until it reaches a terminal state', async () => {
  let calls = 0;
  const client = fakeClient({
    getPublication: async () => {
      calls += 1;
      if (calls < 3) return { id: 345678, publication_status: 2 }; // publishing
      return { id: 345678, publication_status: 1 };
    }
  });
  const publisher = createContentPublisher({ client, r2: fakeR2(), projectId: 245678, _sleep: async () => {} });

  const report = await publisher({ wizard: TEXT_WIZARD, r2Url: null });

  assert.equal(calls, 3);
  assert.equal(report[0].status, 'success');
});

test('publishes once per connected account, producing one report entry each', async () => {
  const client = fakeClient({
    getAccounts: async () => [
      { id: 1, chanel_id: 4, name: 'IG 1', connection_status: 1 },
      { id: 2, chanel_id: 4, name: 'IG 2', connection_status: 1 }
    ]
  });
  const publisher = createContentPublisher({ client, r2: fakeR2(), projectId: 245678, _sleep: async () => {} });

  const report = await publisher({ wizard: TEXT_WIZARD, r2Url: null });

  assert.equal(report.length, 2);
  assert.deepEqual(report.map((r) => r.accountId), [1, 2]);
});

test('a createPublication failure for one account does not stop the others', async () => {
  const client = fakeClient({
    getAccounts: async () => [
      { id: 1, chanel_id: 4, name: 'IG 1', connection_status: 1 },
      { id: 2, chanel_id: 4, name: 'IG 2', connection_status: 1 }
    ],
    createPublication: async (body) => {
      if (body.accountIds[0] === 1) {
        throw new Error('HTTP 429');
      }
      return { id: 345678, publication_status: 5 };
    }
  });
  const publisher = createContentPublisher({ client, r2: fakeR2(), projectId: 245678, _sleep: async () => {} });

  const report = await publisher({ wizard: TEXT_WIZARD, r2Url: null });

  assert.equal(report[0].status, 'error');
  assert.match(report[0].reason, /HTTP 429/);
  assert.equal(report[1].status, 'success');
});

test('an upload failure produces an error report for every target account without attempting to publish', async () => {
  const client = fakeClient({
    getAccounts: async () => [
      { id: 1, chanel_id: 4, name: 'IG 1', connection_status: 1 },
      { id: 2, chanel_id: 4, name: 'IG 2', connection_status: 1 }
    ],
    uploadFileByUrl: async () => { throw new Error('HTTP 500'); }
  });
  let publishCalled = false;
  client.createPublication = async () => { publishCalled = true; return { id: 1, publication_status: 1 }; };
  const publisher = createContentPublisher({ client, r2: fakeR2(), projectId: 245678, _sleep: async () => {} });

  const report = await publisher({ wizard: IMAGE_WIZARD, r2Url: 'gc-1/img.png' });

  assert.equal(publishCalled, false);
  assert.equal(report.length, 2);
  assert.ok(report.every((r) => r.status === 'error'));
  assert.match(report[0].reason, /file upload failed/);
});

test('throws a clear error for audio content (unsupported by PostMyPost)', async () => {
  const client = fakeClient();
  const publisher = createContentPublisher({ client, r2: fakeR2(), projectId: 245678, _sleep: async () => {} });

  await assert.rejects(
    () => publisher({ wizard: { ...TEXT_WIZARD, content_type: 'audio' }, r2Url: 'gc-1/audio.mp3' }),
    /no audio-post concept/
  );
});
