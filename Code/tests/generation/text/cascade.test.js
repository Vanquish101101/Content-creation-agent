import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTextCascade } from '../../../src/generation/text/cascade.js';

function fakeFetch(responses) {
  const calls = [];
  let i = 0;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.body ?? {} };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

const WIZARD = {
  network: 'instagram',
  content_type: 'post',
  format: '916',
  style: 'expert',
  description: 'Пост про запуск нового продукта'
};

test('throws when apiKey is missing', () => {
  assert.throws(() => createTextCascade({}), /apiKey is required/);
});

test('uses the cheap model on the first attempt', async () => {
  const fetchImpl = fakeFetch([
    { body: { choices: [{ message: { content: 'Готовый пост!' } }], usage: { cost: 0.0002 } } }
  ]);
  const generateText = createTextCascade({ apiKey: 'test-key', fetchImpl });

  const result = await generateText(WIZARD);

  assert.equal(result.text, 'Готовый пост!');
  assert.equal(result.tier, 'cheap');
  assert.equal(result.model, 'anthropic/claude-haiku-4-5');
  assert.equal(result.costUsd, 0.0002);
  assert.equal(fetchImpl.calls.length, 1);
  const body = JSON.parse(fetchImpl.calls[0].options.body);
  assert.equal(body.model, 'anthropic/claude-haiku-4-5');
  assert.match(body.messages[0].content, /Пост про запуск нового продукта/);
});

test('escalates to the main model when the cheap tier HTTP call fails', async () => {
  const fetchImpl = fakeFetch([
    { ok: false, status: 429 },
    { body: { choices: [{ message: { content: 'Финальный пост' } }], usage: { cost: 0.003 } } }
  ]);
  const generateText = createTextCascade({ apiKey: 'test-key', fetchImpl });

  const result = await generateText(WIZARD);

  assert.equal(result.tier, 'main');
  assert.equal(result.model, 'anthropic/claude-sonnet-4-6');
  assert.equal(result.escalatedFrom, 'anthropic/claude-haiku-4-5');
  assert.equal(result.text, 'Финальный пост');
  assert.equal(fetchImpl.calls.length, 2);
});

test('escalates to the main model when the cheap tier returns empty content', async () => {
  const fetchImpl = fakeFetch([
    { body: { choices: [{ message: { content: '' } }], usage: { cost: 0.0001 } } },
    { body: { choices: [{ message: { content: 'Финальный пост' } }], usage: { cost: 0.003 } } }
  ]);
  const generateText = createTextCascade({ apiKey: 'test-key', fetchImpl });

  const result = await generateText(WIZARD);

  assert.equal(result.tier, 'main');
  assert.equal(result.text, 'Финальный пост');
});

test('throws when both cheap and main tiers fail', async () => {
  const fetchImpl = fakeFetch([{ ok: false, status: 500 }, { ok: false, status: 500 }]);
  const generateText = createTextCascade({ apiKey: 'test-key', fetchImpl });

  await assert.rejects(() => generateText(WIZARD), /HTTP 500/);
});

test('routes through Helicone proxy when heliconeApiKey is set', async () => {
  const fetchImpl = fakeFetch([
    { body: { choices: [{ message: { content: 'Пост' } }], usage: { cost: 0.0002 } } }
  ]);
  const generateText = createTextCascade({ apiKey: 'test-key', heliconeApiKey: 'helicone-key', fetchImpl });

  await generateText(WIZARD);

  assert.equal(fetchImpl.calls[0].url, 'https://openrouter.helicone.ai/api/v1/chat/completions');
  assert.equal(fetchImpl.calls[0].options.headers['Helicone-Auth'], 'Bearer helicone-key');
});
