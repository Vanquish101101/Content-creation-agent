import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorageClient } from '../../src/storage/createStorageClient.js';

test('createStorageClient defaults to the r2 provider when none is given', () => {
  let receivedConfig;
  const fakeClient = { uploadFile: async () => {}, getSignedDownloadUrl: async () => {} };
  const _createR2Client = (config) => {
    receivedConfig = config;
    return fakeClient;
  };

  const client = createStorageClient({ accountId: 'a', accessKeyId: 'k', secretAccessKey: 's', bucket: 'b', _createR2Client });

  assert.equal(client, fakeClient);
  assert.equal(receivedConfig.accountId, 'a');
  assert.equal(receivedConfig.bucket, 'b');
});

test('createStorageClient builds an r2 client when provider is explicitly "r2"', () => {
  const fakeClient = { uploadFile: async () => {}, getSignedDownloadUrl: async () => {} };
  const _createR2Client = () => fakeClient;

  const client = createStorageClient({ provider: 'r2', accountId: 'a', accessKeyId: 'k', secretAccessKey: 's', bucket: 'b', _createR2Client });

  assert.equal(client, fakeClient);
});

test('createStorageClient throws a clear error for an unimplemented provider', () => {
  assert.throws(
    () => createStorageClient({ provider: 'supabase' }),
    /storage provider "supabase" is not implemented/
  );
});
