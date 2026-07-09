import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudioCascade } from '../../../src/generation/audio/cascade.js';

const WIZARD = {
  network: 'instagram',
  content_type: 'audio',
  format: 'mp3',
  style: 'expert',
  description: 'Озвучка короткого рекламного ролика про скидку 20%'
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

function fakeFetch({ deepgramOk = true, deepgramStatus = 200, elevenOk = true, elevenStatus = 200, bytes = 'fake-audio-bytes' } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('api.deepgram.com')) {
      return { ok: deepgramOk, status: deepgramStatus, arrayBuffer: async () => Buffer.from(bytes) };
    }
    if (url.includes('api.elevenlabs.io')) {
      return { ok: elevenOk, status: elevenStatus, arrayBuffer: async () => Buffer.from(bytes) };
    }
    throw new Error(`fakeFetch: unexpected URL ${url}`);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

test('throws when deepgramApiKey is missing', () => {
  assert.throws(
    () => createAudioCascade({ elevenLabsApiKey: 'e', elevenLabsVoiceId: 'v', r2: fakeR2() }),
    /deepgramApiKey is required/
  );
});

test('throws when elevenLabsApiKey is missing', () => {
  assert.throws(
    () => createAudioCascade({ deepgramApiKey: 'd', elevenLabsVoiceId: 'v', r2: fakeR2() }),
    /elevenLabsApiKey is required/
  );
});

test('throws when elevenLabsVoiceId is missing', () => {
  assert.throws(
    () => createAudioCascade({ deepgramApiKey: 'd', elevenLabsApiKey: 'e', r2: fakeR2() }),
    /elevenLabsVoiceId is required/
  );
});

test('throws when r2 client is missing', () => {
  assert.throws(
    () => createAudioCascade({ deepgramApiKey: 'd', elevenLabsApiKey: 'e', elevenLabsVoiceId: 'v' }),
    /r2 client is required/
  );
});

test('generates on the cheap tier (Deepgram Aura) and uploads to R2', async () => {
  const r2 = fakeR2();
  const fetchImpl = fakeFetch();
  const cascade = createAudioCascade({ deepgramApiKey: 'd-key', elevenLabsApiKey: 'e-key', elevenLabsVoiceId: 'voice-1', r2, fetchImpl });

  const result = await cascade(WIZARD);

  assert.equal(result.tier, 'cheap');
  assert.equal(result.model, 'deepgram-aura-2');
  assert.equal(result.r2Url, r2.uploads[0].key);
  assert.equal(r2.uploads[0].contentType, 'audio/mpeg');
  assert.equal(r2.uploads[0].body.toString(), 'fake-audio-bytes');
  assert.ok(result.costUsd > 0);
});

test('sends the correct headers and body to Deepgram', async () => {
  const r2 = fakeR2();
  const fetchImpl = fakeFetch();
  const cascade = createAudioCascade({ deepgramApiKey: 'd-key', elevenLabsApiKey: 'e-key', elevenLabsVoiceId: 'voice-1', r2, fetchImpl });

  await cascade(WIZARD);

  const call = fetchImpl.calls.find((c) => c.url.includes('api.deepgram.com'));
  assert.match(call.url, /\/v1\/speak\?model=/);
  assert.equal(call.options.headers['Authorization'], 'Token d-key');
  const body = JSON.parse(call.options.body);
  assert.match(body.text, /скидку 20%/);
});

test('escalates to ElevenLabs when Deepgram fails', async () => {
  const r2 = fakeR2();
  const fetchImpl = fakeFetch({ deepgramOk: false, deepgramStatus: 429 });
  const cascade = createAudioCascade({ deepgramApiKey: 'd-key', elevenLabsApiKey: 'e-key', elevenLabsVoiceId: 'voice-1', r2, fetchImpl });

  const result = await cascade(WIZARD);

  assert.equal(result.tier, 'main');
  assert.equal(result.model, 'elevenlabs');
  assert.equal(result.escalatedFrom, 'deepgram-aura-2');
});

test('sends the correct headers, body, and voice_id to ElevenLabs on escalation', async () => {
  const r2 = fakeR2();
  const fetchImpl = fakeFetch({ deepgramOk: false, deepgramStatus: 500 });
  const cascade = createAudioCascade({ deepgramApiKey: 'd-key', elevenLabsApiKey: 'secret-eleven-key', elevenLabsVoiceId: 'voice-42', r2, fetchImpl });

  await cascade(WIZARD);

  const call = fetchImpl.calls.find((c) => c.url.includes('api.elevenlabs.io'));
  assert.match(call.url, /\/v1\/text-to-speech\/voice-42$/);
  assert.equal(call.options.headers['xi-api-key'], 'secret-eleven-key');
  const body = JSON.parse(call.options.body);
  assert.match(body.text, /скидку 20%/);
});

test('throws when both tiers fail', async () => {
  const r2 = fakeR2();
  const fetchImpl = fakeFetch({ deepgramOk: false, deepgramStatus: 500, elevenOk: false, elevenStatus: 500 });
  const cascade = createAudioCascade({ deepgramApiKey: 'd-key', elevenLabsApiKey: 'e-key', elevenLabsVoiceId: 'voice-1', r2, fetchImpl });

  await assert.rejects(() => cascade(WIZARD), /HTTP 500/);
});
