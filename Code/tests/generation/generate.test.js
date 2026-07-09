import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDb } from '../helpers/fakeSupabase.js';
import { createGenerationOrchestrator } from '../../src/generation/generate.js';

const JOB = {
  telegram_id: 123,
  wizard_hash: 'abc',
  wizard: { network: 'instagram', content_type: 'text', format: '916', style: 'expert', description: 'test' },
  mode: 'content',
  moderation_mode: false
};

function makeDb(recordedUpdates) {
  return makeFakeDb({
    generated_content: (state) => {
      if (state.operation === 'insert') {
        return { data: { id: 'gc-1' }, error: null };
      }
      recordedUpdates.push(state.payload);
      return { data: null, error: null };
    }
  });
}

test('runs the full pipeline: pending -> processing -> done on success', async () => {
  const updates = [];
  const db = makeDb(updates);
  const fakeRoute = () => async () => ({ text: 'Готовый пост', costUsd: 0.002, tier: 'cheap', model: 'anthropic/claude-haiku-4-5' });
  const orchestrator = createGenerationOrchestrator({ db, route: fakeRoute });

  const result = await orchestrator.generateContent(JOB);

  assert.equal(result.id, 'gc-1');
  assert.equal(result.status, 'done');
  assert.equal(updates[0].status, 'processing');
  assert.equal(updates[1].status, 'done');
  assert.equal(updates[1].cost_usd, 0.002);
  assert.equal(updates[1].metadata.text, 'Готовый пост');
});

test('passes job.wizard.content_type and routeDeps to route()', async () => {
  const db = makeDb([]);
  let calledWith = null;
  const fakeRoute = (contentType, deps) => {
    calledWith = { contentType, deps };
    return async () => ({ text: 'x', costUsd: 0, tier: 'cheap', model: 'm' });
  };
  const orchestrator = createGenerationOrchestrator({ db, route: fakeRoute, routeDeps: { apiKey: 'key-1' } });

  await orchestrator.generateContent(JOB);

  assert.equal(calledWith.contentType, 'text');
  assert.deepEqual(calledWith.deps, { apiKey: 'key-1' });
});

test('passes job.telegram_id through into the wizard object given to the generator (needed for R2 key naming)', async () => {
  const db = makeDb([]);
  let generatorCalledWith = null;
  const fakeRoute = () => async (wizard) => {
    generatorCalledWith = wizard;
    return { costUsd: 0, tier: 'cheap', model: 'm' };
  };
  const orchestrator = createGenerationOrchestrator({ db, route: fakeRoute });

  await orchestrator.generateContent(JOB);

  assert.equal(generatorCalledWith.telegram_id, 123);
  assert.equal(generatorCalledWith.content_type, 'text');
});

test('attaches enrich(wizard) result as wizard.trendContext when an enrich function is provided', async () => {
  const db = makeDb([]);
  let generatorCalledWith = null;
  const fakeRoute = () => async (wizard) => {
    generatorCalledWith = wizard;
    return { costUsd: 0, tier: 'cheap', model: 'm' };
  };
  const enrich = async () => ({ hooks: ['x'], triggers: [], offers: [], viral_reasons: [], content_ideas: [] });
  const orchestrator = createGenerationOrchestrator({ db, route: fakeRoute, enrich });

  await orchestrator.generateContent(JOB);

  assert.deepEqual(generatorCalledWith.trendContext, { hooks: ['x'], triggers: [], offers: [], viral_reasons: [], content_ideas: [] });
});

test('wizard.trendContext is null when enrich is not provided', async () => {
  const db = makeDb([]);
  let generatorCalledWith = null;
  const fakeRoute = () => async (wizard) => {
    generatorCalledWith = wizard;
    return { costUsd: 0, tier: 'cheap', model: 'm' };
  };
  const orchestrator = createGenerationOrchestrator({ db, route: fakeRoute });

  await orchestrator.generateContent(JOB);

  assert.equal(generatorCalledWith.trendContext, null);
});

test('wizard.trendContext is null when enrich() itself returns null (no trend request or unreachable Agent 3)', async () => {
  const db = makeDb([]);
  let generatorCalledWith = null;
  const fakeRoute = () => async (wizard) => {
    generatorCalledWith = wizard;
    return { costUsd: 0, tier: 'cheap', model: 'm' };
  };
  const orchestrator = createGenerationOrchestrator({ db, route: fakeRoute, enrich: async () => null });

  await orchestrator.generateContent(JOB);

  assert.equal(generatorCalledWith.trendContext, null);
});

test('passes result.r2Url through to markDone when the cascade uploaded a file (image/video/audio)', async () => {
  const updates = [];
  const db = makeDb(updates);
  const fakeRoute = () => async () => ({ costUsd: 0.4, tier: 'cheap', model: 'runway/gen4_turbo', r2Url: 'gc-1/video.mp4' });
  const orchestrator = createGenerationOrchestrator({ db, route: fakeRoute });

  await orchestrator.generateContent(JOB);

  assert.equal(updates[1].r2_url, 'gc-1/video.mp4');
});

test('marks the record as error and rethrows when generation fails', async () => {
  const updates = [];
  const db = makeDb(updates);
  const fakeRoute = () => async () => { throw new Error('LLM HTTP 500'); };
  const orchestrator = createGenerationOrchestrator({ db, route: fakeRoute });

  await assert.rejects(() => orchestrator.generateContent(JOB), /LLM HTTP 500/);

  assert.equal(updates[0].status, 'processing');
  assert.equal(updates[1].status, 'error');
  assert.equal(updates[1].metadata.error, 'LLM HTTP 500');
});
