import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScriptBuilder } from '../../../src/generation/audio/buildScript.js';

const WIZARD = {
  description: 'Озвучка короткого рекламного ролика про скидку 20%'
};

function fakeFetch(replyTextOrOptions) {
  const calls = [];
  const opts = typeof replyTextOrOptions === 'string' ? { text: replyTextOrOptions } : replyTextOrOptions;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (opts.ok === false) {
      return { ok: false, status: opts.status ?? 500, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: opts.text } }], usage: { cost: opts.cost ?? 0.0002 } }) };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

test('throws when apiKey is missing', () => {
  assert.throws(() => createScriptBuilder({}), /apiKey is required/);
});

test('returns wizard.description unchanged (no LLM call) when trendContext is absent', async () => {
  const fetchImpl = fakeFetch('should not be used');
  const buildScript = createScriptBuilder({ apiKey: 'key', fetchImpl });

  const result = await buildScript(WIZARD);

  assert.equal(result.text, WIZARD.description);
  assert.equal(result.costUsd, 0);
  assert.equal(fetchImpl.calls.length, 0);
});

test('returns wizard.description unchanged when trendContext has no usable parts', async () => {
  const fetchImpl = fakeFetch('should not be used');
  const buildScript = createScriptBuilder({ apiKey: 'key', fetchImpl });

  const result = await buildScript({ ...WIZARD, trendContext: { hooks: [], triggers: [] } });

  assert.equal(result.text, WIZARD.description);
  assert.equal(fetchImpl.calls.length, 0);
});

// Найдено при доработке трендов для аудио (2026-07-12): wizard.description
// у аудио — не генеративный промпт, а буквальный текст, который TTS
// озвучит целиком. Дописывание "хук: ...; триггеры: ..." тем же способом,
// что у image/video, привело бы к тому, что эти ярлыки были бы ПРОЧИТАНЫ
// ВСЛУХ — нужен связный переписанный текст, не список меток.
test('rewrites the description into a single coherent script via the LLM when trendContext has usable parts', async () => {
  const fetchImpl = fakeFetch('Скидка 20% закончится завтра — успей забрать, пока не поздно!');
  const buildScript = createScriptBuilder({ apiKey: 'key', fetchImpl });
  const wizardWithTrends = { ...WIZARD, trendContext: { hooks: ['Успей забрать'], triggers: ['срочность'] } };

  const result = await buildScript(wizardWithTrends);

  assert.equal(result.text, 'Скидка 20% закончится завтра — успей забрать, пока не поздно!');
  assert.ok(result.costUsd > 0);
});

test('the prompt asks for a single spoken-word script, not labeled sections, and includes the original description', async () => {
  const fetchImpl = fakeFetch('rewritten');
  const buildScript = createScriptBuilder({ apiKey: 'key', fetchImpl });
  const wizardWithTrends = { ...WIZARD, trendContext: { hooks: ['Успей забрать'] } };

  await buildScript(wizardWithTrends);

  const body = JSON.parse(fetchImpl.calls[0].options.body);
  const prompt = body.messages[0].content;
  assert.match(prompt, /Озвучка короткого рекламного ролика про скидку 20%/);
  assert.match(prompt, /Успей забрать/);
  assert.match(prompt, /озвучк/i);
});

test('falls back to the raw description (best-effort) when the LLM call fails', async () => {
  const fetchImpl = fakeFetch({ ok: false, status: 500 });
  const buildScript = createScriptBuilder({ apiKey: 'key', fetchImpl });
  const wizardWithTrends = { ...WIZARD, trendContext: { hooks: ['x'] } };

  const result = await buildScript(wizardWithTrends);

  assert.equal(result.text, WIZARD.description);
  assert.equal(result.costUsd, 0);
});

test('falls back to the raw description when fetch itself throws', async () => {
  const fetchImpl = async () => { throw new Error('network down'); };
  const buildScript = createScriptBuilder({ apiKey: 'key', fetchImpl });
  const wizardWithTrends = { ...WIZARD, trendContext: { hooks: ['x'] } };

  const result = await buildScript(wizardWithTrends);

  assert.equal(result.text, WIZARD.description);
});

test('falls back to the raw description when the LLM returns empty content', async () => {
  const fetchImpl = fakeFetch('');
  const buildScript = createScriptBuilder({ apiKey: 'key', fetchImpl });
  const wizardWithTrends = { ...WIZARD, trendContext: { hooks: ['x'] } };

  const result = await buildScript(wizardWithTrends);

  assert.equal(result.text, WIZARD.description);
});

test('routes through Helicone proxy when heliconeApiKey is set', async () => {
  const fetchImpl = fakeFetch('rewritten');
  const buildScript = createScriptBuilder({ apiKey: 'key', heliconeApiKey: 'helicone-key', fetchImpl });
  const wizardWithTrends = { ...WIZARD, trendContext: { hooks: ['x'] } };

  await buildScript(wizardWithTrends);

  assert.match(fetchImpl.calls[0].url, /helicone/);
  assert.equal(fetchImpl.calls[0].options.headers['Helicone-Auth'], 'Bearer helicone-key');
});
