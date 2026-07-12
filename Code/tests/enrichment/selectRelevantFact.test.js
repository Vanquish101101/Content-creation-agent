import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFactSelector } from '../../src/enrichment/selectRelevantFact.js';

const FACTS = [
  { claim_id: 'c0', statement: 'Максимальная длительность Reels в Instagram — 3 минуты.' },
  { claim_id: 'c1', statement: 'Рыночная капитализация крипторынка составляет $2.28 трлн.' },
  { claim_id: 'c2', statement: 'Рекомендуемое число хештегов в Instagram — 3-5 штук.' }
];

function fakeFetch(replyText, { ok = true, status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok, status, json: async () => ({ choices: [{ message: { content: replyText } }] }) };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

test('throws when apiKey is missing', () => {
  assert.throws(() => createFactSelector({}), /apiKey is required/);
});

test('returns null immediately without calling the LLM when topic is empty', async () => {
  const fetchImpl = fakeFetch('0');
  const selectFact = createFactSelector({ apiKey: 'key', fetchImpl });

  const result = await selectFact('', FACTS);

  assert.equal(result, null);
  assert.equal(fetchImpl.calls.length, 0);
});

test('returns null immediately without calling the LLM when there are no facts', async () => {
  const fetchImpl = fakeFetch('0');
  const selectFact = createFactSelector({ apiKey: 'key', fetchImpl });

  const result = await selectFact('маркетинг в Instagram', []);

  assert.equal(result, null);
  assert.equal(fetchImpl.calls.length, 0);
});

test('returns the fact at the index the LLM picks', async () => {
  const fetchImpl = fakeFetch('2');
  const selectFact = createFactSelector({ apiKey: 'key', fetchImpl });

  const result = await selectFact('хештеги в Instagram', FACTS);

  assert.deepEqual(result, FACTS[2]);
});

test('sends the topic and numbered fact statements in the prompt', async () => {
  const fetchImpl = fakeFetch('0');
  const selectFact = createFactSelector({ apiKey: 'key', fetchImpl });

  await selectFact('маркетинг в Instagram', FACTS);

  const body = JSON.parse(fetchImpl.calls[0].options.body);
  const prompt = body.messages[0].content;
  assert.match(prompt, /маркетинг в Instagram/);
  assert.match(prompt, /0\. Максимальная длительность Reels в Instagram/);
  assert.match(prompt, /2\. Рекомендуемое число хештегов/);
});

test('returns null when the LLM says none of the facts are relevant', async () => {
  const fetchImpl = fakeFetch('none');
  const selectFact = createFactSelector({ apiKey: 'key', fetchImpl });

  const result = await selectFact('рецепт борща', FACTS);

  assert.equal(result, null);
});

test('returns null when the LLM response is not a valid index (garbage output)', async () => {
  const fetchImpl = fakeFetch('probably fact number two seems relevant');
  const selectFact = createFactSelector({ apiKey: 'key', fetchImpl });

  const result = await selectFact('хештеги', FACTS);

  assert.equal(result, null);
});

test('returns null when the LLM response index is out of range', async () => {
  const fetchImpl = fakeFetch('99');
  const selectFact = createFactSelector({ apiKey: 'key', fetchImpl });

  const result = await selectFact('хештеги', FACTS);

  assert.equal(result, null);
});

test('returns null on HTTP failure instead of throwing (best-effort)', async () => {
  const fetchImpl = fakeFetch('0', { ok: false, status: 500 });
  const selectFact = createFactSelector({ apiKey: 'key', fetchImpl });

  const result = await selectFact('хештеги', FACTS);

  assert.equal(result, null);
});

test('returns null when fetch itself throws (best-effort)', async () => {
  const fetchImpl = async () => { throw new Error('network down'); };
  const selectFact = createFactSelector({ apiKey: 'key', fetchImpl });

  const result = await selectFact('хештеги', FACTS);

  assert.equal(result, null);
});

test('routes through Helicone proxy when heliconeApiKey is set', async () => {
  const fetchImpl = fakeFetch('0');
  const selectFact = createFactSelector({ apiKey: 'key', heliconeApiKey: 'helicone-key', fetchImpl });

  await selectFact('хештеги', FACTS);

  assert.match(fetchImpl.calls[0].url, /helicone/);
  assert.equal(fetchImpl.calls[0].options.headers['Helicone-Auth'], 'Bearer helicone-key');
});
