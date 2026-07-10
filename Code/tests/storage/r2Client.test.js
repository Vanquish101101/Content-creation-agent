import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createR2Client } from '../../src/storage/r2Client.js';

function fakeS3() {
  const calls = [];
  return {
    calls,
    async send(command) {
      calls.push(command);
      return {};
    }
  };
}

test('throws when required config is missing', () => {
  assert.throws(
    () => createR2Client({ accessKeyId: 'a', secretAccessKey: 'b', bucket: 'c' }),
    /accountId, accessKeyId, secretAccessKey, and bucket are required/
  );
});

test('uploadFile sends a PutObjectCommand with the right bucket/key/body/contentType', async () => {
  const s3 = fakeS3();
  const client = createR2Client({
    accountId: 'acc-1',
    accessKeyId: 'key-1',
    secretAccessKey: 'secret-1',
    bucket: 'content-creation-agent',
    _s3: s3
  });

  await client.uploadFile({ key: 'gc-1/post.txt', body: Buffer.from('hello'), contentType: 'text/plain' });

  assert.equal(s3.calls.length, 1);
  assert.ok(s3.calls[0] instanceof PutObjectCommand);
  assert.equal(s3.calls[0].input.Bucket, 'content-creation-agent');
  assert.equal(s3.calls[0].input.Key, 'gc-1/post.txt');
  assert.equal(s3.calls[0].input.Body.toString(), 'hello');
  assert.equal(s3.calls[0].input.ContentType, 'text/plain');
});

test('uploadFile returns the object key it was given', async () => {
  const s3 = fakeS3();
  const client = createR2Client({
    accountId: 'acc-1',
    accessKeyId: 'key-1',
    secretAccessKey: 'secret-1',
    bucket: 'content-creation-agent',
    _s3: s3
  });

  const result = await client.uploadFile({ key: 'gc-2/image.png', body: Buffer.from('x'), contentType: 'image/png' });

  assert.equal(result.key, 'gc-2/image.png');
});

test('getSignedDownloadUrl signs a GetObjectCommand for the given bucket/key', async () => {
  const s3 = fakeS3();
  const signCalls = [];
  const _getSignedUrl = async (client, command, options) => {
    signCalls.push({ client, command, options });
    return 'https://signed.example/gc-3/video.mp4?sig=abc';
  };
  const client = createR2Client({
    accountId: 'acc-1',
    accessKeyId: 'key-1',
    secretAccessKey: 'secret-1',
    bucket: 'content-creation-agent',
    _s3: s3,
    _getSignedUrl
  });

  const url = await client.getSignedDownloadUrl('gc-3/video.mp4');

  assert.equal(url, 'https://signed.example/gc-3/video.mp4?sig=abc');
  assert.equal(signCalls.length, 1);
  assert.ok(signCalls[0].command instanceof GetObjectCommand);
  assert.equal(signCalls[0].command.input.Bucket, 'content-creation-agent');
  assert.equal(signCalls[0].command.input.Key, 'gc-3/video.mp4');
  assert.equal(signCalls[0].options.expiresIn, 3600);
});

test('getSignedDownloadUrl accepts a custom expiry', async () => {
  const s3 = fakeS3();
  const signCalls = [];
  const _getSignedUrl = async (client, command, options) => {
    signCalls.push({ options });
    return 'https://signed.example/x';
  };
  const client = createR2Client({
    accountId: 'acc-1',
    accessKeyId: 'key-1',
    secretAccessKey: 'secret-1',
    bucket: 'content-creation-agent',
    _s3: s3,
    _getSignedUrl
  });

  await client.getSignedDownloadUrl('gc-4/audio.mp3', 600);

  assert.equal(signCalls[0].options.expiresIn, 600);
});

test('deleteFile sends a DeleteObjectCommand for the given bucket/key', async () => {
  const s3 = fakeS3();
  const client = createR2Client({
    accountId: 'acc-1',
    accessKeyId: 'key-1',
    secretAccessKey: 'secret-1',
    bucket: 'content-creation-agent',
    _s3: s3
  });

  await client.deleteFile('gc-5/old-video.mp4');

  assert.equal(s3.calls.length, 1);
  assert.ok(s3.calls[0] instanceof DeleteObjectCommand);
  assert.equal(s3.calls[0].input.Bucket, 'content-creation-agent');
  assert.equal(s3.calls[0].input.Key, 'gc-5/old-video.mp4');
});
